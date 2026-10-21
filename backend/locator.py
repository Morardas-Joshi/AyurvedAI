"""Healthcare Locator: finds AYURVEDIC hospitals, clinics, doctors and pharmacies near a place.

100% free, no API key, no card:
  * Places    -> OpenStreetMap through the free Overpass API
  * City name -> OpenStreetMap Nominatim (free geocoder)
  * Your own verified list -> a small PostgreSQL table (locator_places), shown first with a "Verified" badge

Only places with real Ayurveda evidence are returned (an Ayurveda tag in OpenStreetMap, or "Ayurved..." / "Panchakarma"
in the name). Every result says WHY it was included. Nothing generic (an ordinary clinic) is ever shown.

  GET    /api/locator/geocode?q=Ahmedabad                     -> place name to coordinates
  GET    /api/locator/search?lat=..&lng=..&radius_km=10       -> Ayurvedic places, nearest first
  POST   /api/locator/places        (header X-Admin-Key)      -> add verified places (one or many)
  DELETE /api/locator/places/{id}   (header X-Admin-Key)      -> remove a verified place
  GET    /api/locator/health
"""
import hmac
import math
import threading
import os
import re
import time
from collections import defaultdict, deque
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, select

from database import Base, SessionLocal, engine

load_dotenv()

router = APIRouter(prefix="/api/locator", tags=["locator"])

OVERPASS_URLS = [
    u.strip() for u in os.getenv(
        "OVERPASS_URLS",
        "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,"
        "https://overpass.private.coffee/api/interpreter,https://overpass.openstreetmap.fr/api/interpreter",
    ).split(",") if u.strip()
]
NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
# OpenStreetMap asks every app to identify itself. Put your real email in backend/.env (LOCATOR_CONTACT=you@example.com)
CONTACT = os.getenv("LOCATOR_CONTACT", "").strip()
USER_AGENT = f"AyurvedAI-Locator/1.0 ({CONTACT or 'student project'})"
COUNTRY = os.getenv("LOCATOR_COUNTRY", "in").strip()  # "" = search the whole world
ADMIN_KEY = os.getenv("LOCATOR_ADMIN_KEY", "").strip()
MAX_RADIUS_KM = 50
MAX_RESULTS = 60
CACHE_SECONDS = 6 * 3600  # a good answer is remembered for 6 hours
OVERPASS_WAIT = float(os.getenv("LOCATOR_FULL_SEARCH_WAIT", "14"))  # seconds the user waits before the quick result is shown
PER_USER_PER_HOUR = int(os.getenv("LOCATOR_PER_USER_PER_HOUR", "60"))

_client = httpx.Client(timeout=httpx.Timeout(25.0, connect=8.0), headers={"User-Agent": USER_AGENT})

KINDS = ("hospital", "clinic", "doctor", "pharmacy")

# Words that prove a place is Ayurvedic. Kept strict on purpose: "Vaidya" and "Ayush" are also ordinary surnames / first
# names, so they are NOT used. Spellings in Hindi, Gujarati, Marathi, Tamil, Telugu, Kannada, Malayalam are included.
NAME_RE = (
    "ayurve|aayurve|ayurvad|ayurved|panchakarma|panchkarma|rasashala|"
    "आयुर्वेद|આયુર્વેદ|ஆயுர்வேத|ఆయుర్వేద|ಆಯುರ್ವೇದ|ആയുർവേദ"
)
_NAME_PY = re.compile(NAME_RE, re.IGNORECASE)


# ---------- verified places table ----------
class LocatorPlace(Base):
    __tablename__ = "locator_places"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    kind = Column(String(20), nullable=False, default="clinic")
    address = Column(Text, default="")
    city = Column(String(100), default="")
    state = Column(String(100), default="")
    phone = Column(String(60), default="")
    website = Column(String(300), default="")
    speciality = Column(String(200), default="")
    timings = Column(String(200), default="")
    lat = Column(Float, nullable=False, index=True)
    lng = Column(Float, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


try:
    LocatorPlace.__table__.create(bind=engine, checkfirst=True)
except Exception as e:  # noqa: BLE001  (the website must still start if the database is down)
    print("[LOCATOR] could not create table locator_places ->", repr(e))


class PlaceIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kind: str = "clinic"
    address: str = ""
    city: str = ""
    state: str = ""
    phone: str = ""
    website: str = ""
    speciality: str = ""
    timings: str = ""
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ---------- helpers ----------
_user_hits: dict[str, deque] = defaultdict(deque)


def _throttle(owner: str) -> None:
    q, now = _user_hits[owner], time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= PER_USER_PER_HOUR:
        raise HTTPException(429, "Too many searches this hour. Please wait a little and try again.")
    q.append(now)


def _km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def _kind_of(tags: dict, name: str) -> str:
    amenity, hc, shop = tags.get("amenity", ""), tags.get("healthcare", ""), tags.get("shop", "")
    if amenity == "hospital" or hc == "hospital":
        return "hospital"
    if amenity == "doctors" or hc in ("doctor", "physiotherapist"):
        return "doctor"
    if amenity == "pharmacy" or hc == "pharmacy" or shop in ("chemist", "herbalist", "medical_supply"):
        return "pharmacy"
    if amenity == "clinic" or hc in ("clinic", "alternative", "centre"):
        return "clinic"
    low = name.lower()
    if re.search(r"hospital|rugnalaya|aspatal", low):
        return "hospital"
    if re.search(r"pharmacy|aushadh|medical store|herbal", low):
        return "pharmacy"
    if re.match(r"\s*dr\.?\s", low):
        return "doctor"
    return "clinic"


def _is_health(tags: dict) -> bool:
    """A name alone is not enough: it must also be tagged as a health place (so spas, hotels, shops are ignored)."""
    return (
        tags.get("amenity", "") in ("hospital", "clinic", "doctors", "pharmacy")
        or bool(tags.get("healthcare"))
        or tags.get("shop", "") in ("herbalist", "chemist", "medical_supply")
    )


def _reason(tags: dict, name: str) -> str | None:
    """Why do we believe this place is Ayurvedic? None = no proof, so the place is dropped."""
    spec = (tags.get("healthcare:speciality", "") + ";" + tags.get("healthcare:specialty", "")).lower()
    if "ayurved" in spec:
        return "Listed as an Ayurveda specialist on OpenStreetMap"
    if tags.get("medical_system:ayurveda", "").lower() in ("yes", "true", "1"):
        return "Tagged as Ayurvedic medicine on OpenStreetMap"
    if (_NAME_PY.search(name) or _NAME_PY.search(tags.get("name:en", ""))) and _is_health(tags):
        return "The name says Ayurveda"
    return None


def _address(tags: dict) -> str:
    if tags.get("addr:full"):
        return tags["addr:full"]
    parts = [
        " ".join(x for x in (tags.get("addr:housenumber"), tags.get("addr:street")) if x),
        tags.get("addr:suburb") or tags.get("addr:neighbourhood") or "",
        tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:village") or "",
        tags.get("addr:postcode") or "",
    ]
    return ", ".join(p for p in parts if p)


def _bbox(lat: float, lng: float, radius_km: float) -> tuple[float, float, float, float]:
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat - dlat, lng - dlng, lat + dlat, lng + dlng  # south, west, north, east


def _overpass_query(lat: float, lng: float, radius_km: float) -> str:
    """Light query: start from exact health tags (fast, indexed), then check the name. Names alone are never scanned."""
    s_, w_, n_, e_ = _bbox(lat, lng, radius_km)
    bb = f"({s_:.5f},{w_:.5f},{n_:.5f},{e_:.5f})"
    name = f'["name"~"{NAME_RE}",i]'
    lines = [f'  nwr["amenity"="{v}"]{name}{bb};' for v in ("hospital", "clinic", "doctors", "pharmacy")]
    lines += [f'  nwr["shop"="{v}"]{name}{bb};' for v in ("chemist", "herbalist", "medical_supply")]
    lines += [
        f'  nwr["healthcare"]{name}{bb};',
        f'  nwr["healthcare:speciality"~"ayurved",i]{bb};',
        f'  nwr["healthcare:specialty"~"ayurved",i]{bb};',
        f'  nwr["medical_system:ayurveda"]{bb};',
    ]
    return "[out:json][timeout:40];\n(\n" + "\n".join(lines) + "\n);\nout center tags 200;"


def _place_from_tags(osm_id: str, tags: dict, la: float, lo: float) -> dict | None:
    name = (tags.get("name") or tags.get("name:en") or "").strip()
    why = _reason(tags, name)
    if not why:
        return None
    kind = _kind_of(tags, name)
    return {
        "id": osm_id,
        "name": name or f"Ayurvedic {kind} (name not listed)",
        "kind": kind, "verified": False, "source": "openstreetmap",
        "lat": la, "lng": lo,
        "address": _address(tags),
        "phone": tags.get("phone") or tags.get("contact:phone") or tags.get("contact:mobile") or "",
        "website": tags.get("website") or tags.get("contact:website") or "",
        "opening_hours": tags.get("opening_hours", ""),
        "reason": why,
    }


def _dedupe(places: list[dict]) -> list[dict]:
    out, seen = [], set()
    for p in places:
        key = (_norm(p["name"]), round(p["lat"], 3), round(p["lng"], 3))
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def _post_overpass(url: str, query: str) -> list[dict]:
    r = _client.post(url, data={"data": query}, timeout=httpx.Timeout(50.0, connect=8.0))
    if r.status_code != 200:
        raise RuntimeError(f"{url} -> {r.status_code}")
    try:
        return r.json().get("elements", [])
    except ValueError:
        raise RuntimeError(f"{url} -> unreadable answer")


def _fetch_overpass(lat: float, lng: float, radius_km: float) -> list[dict]:
    """Asks every Overpass server AT THE SAME TIME and uses the first good answer."""
    query = _overpass_query(lat, lng, radius_km)
    ex = ThreadPoolExecutor(max_workers=max(len(OVERPASS_URLS), 1))
    errors: list[str] = []
    try:
        futures = [ex.submit(_post_overpass, u, query) for u in OVERPASS_URLS]
        elements = None
        for f in as_completed(futures):
            try:
                elements = f.result()
                break
            except Exception as e:  # noqa: BLE001
                errors.append(str(e) or repr(e))
        if elements is None:
            raise RuntimeError("; ".join(errors) or "no server")
    finally:
        ex.shutdown(wait=False, cancel_futures=True)
    out = []
    for el in elements:
        tags = el.get("tags") or {}
        la = el.get("lat") if el.get("lat") is not None else (el.get("center") or {}).get("lat")
        lo = el.get("lon") if el.get("lon") is not None else (el.get("center") or {}).get("lon")
        if la is None or lo is None:
            continue
        p = _place_from_tags(f"osm-{str(el.get('type', 'x'))[0]}{el.get('id')}", tags, la, lo)
        if p:
            out.append(p)
    return _dedupe(out)


def _fetch_nominatim(lat: float, lng: float, radius_km: float) -> list[dict]:
    """Quick backup when the Overpass servers are busy: Nominatim text search inside the same box."""
    s_, w_, n_, e_ = _bbox(lat, lng, radius_km)
    out: list[dict] = []
    for i, term in enumerate(("ayurved", "ayurvedic", "ayurveda", "panchakarma")):
        if i:
            time.sleep(1.1)  # Nominatim allows 1 request per second
        params = {"q": term, "format": "jsonv2", "limit": 40, "bounded": 1, "viewbox": f"{w_},{n_},{e_},{s_}",
                  "extratags": 1, "namedetails": 1, "addressdetails": 1}
        if CONTACT:
            params["email"] = CONTACT
        r = _client.get(NOMINATIM_URL, params=params)
        if r.status_code != 200:
            raise RuntimeError(f"nominatim -> {r.status_code}")
        for h in r.json():
            try:
                la, lo = float(h["lat"]), float(h["lon"])
            except (KeyError, ValueError, TypeError):
                continue
            tags = dict(h.get("extratags") or {})
            if h.get("category"):
                tags[str(h["category"])] = str(h.get("type", ""))
            nd = h.get("namedetails") or {}
            name = h.get("name") or nd.get("name") or ""
            tags.setdefault("name:en", nd.get("name:en", ""))
            ad = h.get("address") or {}
            tags.setdefault("addr:street", ad.get("road", ""))
            tags.setdefault("addr:suburb", ad.get("suburb", "") or ad.get("neighbourhood", ""))
            tags.setdefault("addr:city", ad.get("city", "") or ad.get("town", "") or ad.get("village", ""))
            tags.setdefault("addr:postcode", ad.get("postcode", ""))
            tags["name"] = name
            p = _place_from_tags(f"osm-{str(h.get('osm_type', 'x'))[0]}{h.get('osm_id')}", tags, la, lo)
            if p:
                out.append(p)
    return _dedupe(out)


def _verified_places(lat: float, lng: float, radius_km: float) -> list[dict]:
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    try:
        with SessionLocal() as db:
            rows = db.execute(
                select(LocatorPlace).where(
                    LocatorPlace.lat.between(lat - dlat, lat + dlat),
                    LocatorPlace.lng.between(lng - dlng, lng + dlng),
                )
            ).scalars().all()
    except Exception as e:  # noqa: BLE001
        print("[LOCATOR] verified list error ->", repr(e))
        return []
    out = []
    for p in rows:
        addr = ", ".join(x for x in (p.address, p.city, p.state) if x)
        out.append({
            "id": f"v-{p.id}", "name": p.name, "kind": p.kind if p.kind in KINDS else "clinic",
            "verified": True, "source": "verified", "lat": p.lat, "lng": p.lng, "address": addr,
            "phone": p.phone or "", "website": p.website or "", "opening_hours": p.timings or "",
            "reason": p.speciality or "Verified Ayurvedic provider",
        })
    return out


_cache: dict[tuple, tuple[float, list[dict]]] = {}
_inflight: dict[tuple, Future] = {}
_lock = threading.Lock()
_bg = ThreadPoolExecutor(max_workers=4, thread_name_prefix="overpass")


def _cache_put(key: tuple, data: list[dict]) -> None:
    with _lock:
        if len(_cache) > 300:
            _cache.clear()
        _cache[key] = (time.time(), data)


def _start_full_search(key: tuple, lat: float, lng: float, radius_km: float) -> Future:
    """The complete search keeps running in the background even if the user stops waiting; when it finishes, the answer
    is remembered, so the next 'Try again' is instant. A search that is already running is never started twice."""
    with _lock:
        f = _inflight.get(key)
        if f is not None and not f.done():
            return f
        f = _bg.submit(_fetch_overpass, lat, lng, radius_km)
        _inflight[key] = f

    def finished(fut: Future) -> None:
        try:
            _cache_put(key, fut.result())
        except Exception as e:  # noqa: BLE001
            print("[LOCATOR] full search failed ->", repr(e))

    f.add_done_callback(finished)
    return f


def _osm_cached(lat: float, lng: float, radius_km: float) -> tuple[list[dict], bool]:
    """Returns (places, partial). partial=True means the quick backup search was used."""
    key = (round(lat, 3), round(lng, 3), radius_km)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1], False
    fut = _start_full_search(key, lat, lng, radius_km)
    try:
        data = fut.result(timeout=OVERPASS_WAIT)
        _cache_put(key, data)
        return data, False
    except FutureTimeout:
        print(f"[LOCATOR] full search still running after {OVERPASS_WAIT:.0f}s -> quick backup search now")
    except Exception as e:  # noqa: BLE001
        print("[LOCATOR] Overpass failed ->", repr(e), "-> quick backup search")
    return _fetch_nominatim(lat, lng, radius_km), True  # raises if this fails too


# ---------- routes ----------
@router.get("/search")
def search(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_km: float = Query(10, gt=0),
    type: str = Query("all"),
    x_user_id: str = Header(default="guest"),
):
    radius_km = min(radius_km, MAX_RADIUS_KM)
    if type != "all" and type not in KINDS:
        raise HTTPException(400, "type must be all, hospital, clinic, doctor or pharmacy")
    _throttle(x_user_id[:80])

    notice = ""
    verified = _verified_places(lat, lng, radius_km)
    try:
        osm, partial = _osm_cached(lat, lng, radius_km)
        if partial:
            notice = ("This is a quick search and it may miss some places. The complete search is still running, "
                      "so press Try again in about a minute.")
    except Exception as e:  # noqa: BLE001
        print("[LOCATOR] OpenStreetMap error ->", repr(e))
        osm = []
        notice = "The free map servers are busy right now" + (", so only verified places are shown. " if verified else ". ")
        notice += "Please press Try again in a minute."

    # a verified place replaces the same place found on the map (same name, within 150 m)
    keep = []
    for o in osm:
        if any(_norm(v["name"]) == _norm(o["name"]) and _km(v["lat"], v["lng"], o["lat"], o["lng"]) < 0.15 for v in verified):
            continue
        keep.append(o)

    results = []
    for p in [*verified, *keep]:
        d = _km(lat, lng, p["lat"], p["lng"])
        if d > radius_km * 1.02 or (type != "all" and p["kind"] != type):
            continue
        results.append({**p, "distance_km": round(d, 2)})
    results.sort(key=lambda p: (p["distance_km"]))
    results = results[:MAX_RESULTS]
    return {"center": {"lat": lat, "lng": lng}, "radius_km": radius_km, "count": len(results),
            "results": results, "notice": notice}


@router.get("/geocode")
def geocode(q: str = Query(min_length=2, max_length=120), x_user_id: str = Header(default="guest")):
    _throttle(x_user_id[:80])
    params = {"q": q.strip(), "format": "jsonv2", "limit": 5, "addressdetails": 0}
    if COUNTRY:
        params["countrycodes"] = COUNTRY
    if CONTACT:
        params["email"] = CONTACT
    try:
        r = _client.get(NOMINATIM_URL, params=params)
    except httpx.HTTPError:
        raise HTTPException(503, "The place search is not reachable right now. Please try again, or use 'Use my location'.")
    if r.status_code != 200:
        raise HTTPException(503, "The place search is busy right now. Please try again in a moment.")
    try:
        hits = r.json()
    except ValueError:
        raise HTTPException(503, "The place search returned an unreadable answer.")
    out = []
    for h in hits:
        try:
            out.append({"label": str(h.get("display_name", ""))[:160], "lat": float(h["lat"]), "lng": float(h["lon"])})
        except (KeyError, ValueError, TypeError):
            continue
    return {"results": out}


def _check_admin(key: str) -> None:
    if not ADMIN_KEY:
        raise HTTPException(403, "Adding places is switched off. Set LOCATOR_ADMIN_KEY in backend/.env first.")
    if not hmac.compare_digest(key.encode(), ADMIN_KEY.encode()):
        raise HTTPException(403, "Wrong admin key.")


@router.post("/places")
def add_places(places: list[PlaceIn], x_admin_key: str = Header(default="")):
    _check_admin(x_admin_key)
    if not places or len(places) > 200:
        raise HTTPException(400, "Send between 1 and 200 places.")
    with SessionLocal() as db:
        rows = [LocatorPlace(**{**p.model_dump(), "kind": p.kind if p.kind in KINDS else "clinic"}) for p in places]
        db.add_all(rows)
        db.commit()
        return {"added": len(rows), "ids": [r.id for r in rows]}


@router.delete("/places/{place_id}")
def delete_place(place_id: int, x_admin_key: str = Header(default="")):
    _check_admin(x_admin_key)
    with SessionLocal() as db:
        row = db.get(LocatorPlace, place_id)
        if not row:
            raise HTTPException(404, "No such place.")
        db.delete(row)
        db.commit()
    return {"deleted": place_id}


@router.get("/ping")
def ping():
    """Tests each free map server and says how fast it answers (for troubleshooting)."""
    q = "[out:json][timeout:8];node(23.02,72.52,23.025,72.525)[\"amenity\"];out 1;"
    results = {}
    for url in OVERPASS_URLS:
        t0 = time.perf_counter()
        try:
            r = _client.post(url, data={"data": q}, timeout=12.0)
            results[url] = f"{r.status_code} in {time.perf_counter() - t0:.1f}s"
        except Exception as e:  # noqa: BLE001
            results[url] = f"FAILED: {type(e).__name__}"
    return {"servers": results}


@router.get("/health")
def health():
    try:
        with SessionLocal() as db:
            n = len(db.execute(select(LocatorPlace.id)).all())
    except Exception:  # noqa: BLE001
        n = -1
    return {"verified_places": n, "overpass_servers": len(OVERPASS_URLS), "country": COUNTRY or "world",
            "contact_set": bool(CONTACT), "admin_enabled": bool(ADMIN_KEY)}
