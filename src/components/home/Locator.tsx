/* File location: src/components/home/Locator.tsx
   Healthcare Locator: Ayurvedic hospitals, clinics, doctors and pharmacies on a free OpenStreetMap map. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type Kind = "hospital" | "clinic" | "doctor" | "pharmacy";

interface Place {
  id: string;
  name: string;
  kind: Kind;
  verified: boolean;
  lat: number;
  lng: number;
  distance_km: number;
  address: string;
  phone: string;
  website: string;
  opening_hours: string;
  reason: string;
}

interface Center {
  lat: number;
  lng: number;
  label: string;
}

interface GeoHit {
  label: string;
  lat: number;
  lng: number;
}

const GLASS: CSSProperties = {
  background: "rgba(150,190,120,0.08)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  boxShadow: "0 25px 70px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14)",
};
const GREEN_GRADIENT = "linear-gradient(135deg, #A9C97C 0%, #7CA653 55%, #3F6B3F 100%)";

const KIND_LABEL: Record<Kind, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  doctor: "Doctor",
  pharmacy: "Pharmacy",
};
const KIND_COLOR: Record<Kind, string> = {
  hospital: "#E8967A",
  clinic: "#8FAF5A",
  doctor: "#E0B84A",
  pharmacy: "#7FB3D5",
};
const FILTERS: { id: "all" | Kind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hospital", label: "Hospitals" },
  { id: "clinic", label: "Clinics" },
  { id: "doctor", label: "Doctors" },
  { id: "pharmacy", label: "Pharmacies" },
];
const RADII = [5, 10, 25, 50];

/* remember the last search while the user visits other pages */
let LAST: {
  center: Center;
  radius: number;
  filter: "all" | Kind;
  places: Place[];
  notice: string;
  query: string;
} | null = null;

/* only plain web links are ever opened (blocks javascript: links coming from map data) */
function safeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}

function telHref(raw: string): string | null {
  const first = raw.split(/[;,/]/)[0].replace(/[^+\d]/g, "");
  return first.length >= 6 ? `tel:${first}` : null;
}

const directionsUrl = (p: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);

async function getJson<T>(path: string, userKey: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "X-User-Id": userKey } });
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`;
    try {
      const d = await res.json();
      if (typeof d?.detail === "string") msg = d.detail;
    } catch {
      /* keep the default message */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function pinIcon(color: string, selected: boolean) {
  const size = selected ? 34 : 26;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
    html:
      `<span style="display:block;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;` +
      `transform:rotate(-45deg);background:${color};border:3px solid #fff;` +
      `box-shadow:0 3px 8px rgba(0,0,0,.45)"></span>`,
  });
}

const youIcon = L.divIcon({
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html:
    '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#2F80ED;' +
    'border:3px solid #fff;box-shadow:0 0 0 6px rgba(47,128,237,.25)"></span>',
});

/* popup built from plain DOM nodes, so a strange place name can never inject HTML */
function popupNode(p: Place): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = "font:13px/1.4 system-ui,sans-serif;min-width:170px;max-width:230px";
  const t = document.createElement("strong");
  t.textContent = p.name;
  const sub = document.createElement("div");
  sub.style.cssText = "color:#555;margin-top:2px";
  sub.textContent = `${KIND_LABEL[p.kind]} · ${km(p.distance_km)}${p.verified ? " · Verified" : ""}`;
  box.append(t, sub);
  if (p.address) {
    const a = document.createElement("div");
    a.style.marginTop = "4px";
    a.textContent = p.address;
    box.append(a);
  }
  return box;
}

const PinSvg = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

export default function Locator({ userKey }: { userKey: string }) {
  const [query, setQuery] = useState(LAST?.query ?? "");
  const [center, setCenter] = useState<Center | null>(LAST?.center ?? null);
  const [radius, setRadius] = useState(LAST?.radius ?? 10);
  const [filter, setFilter] = useState<"all" | Kind>(LAST?.filter ?? "all");
  const [places, setPlaces] = useState<Place[]>(LAST?.places ?? []);
  const [notice, setNotice] = useState(LAST?.notice ?? "");
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [busy, setBusy] = useState<"" | "locating" | "searching">("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const searchSeq = useRef(0); /* ignores answers from an older search */

  const visible = useMemo(() => (filter === "all" ? places : places.filter((p) => p.kind === filter)), [places, filter]);

  /* ---------- map ---------- */
  useEffect(() => {
    if (!mapDiv.current || map.current) return;
    const m = L.map(mapDiv.current, { zoomControl: true, scrollWheelZoom: true }).setView([22.9734, 78.6569], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(mapDiv.current);
    const t = window.setTimeout(() => m.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
      markers.current.clear();
    };
  }, []);

  /* draw the markers whenever the results or the filter change */
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    const pts: L.LatLngExpression[] = [];
    if (center) {
      L.marker([center.lat, center.lng], { icon: youIcon, keyboard: false, zIndexOffset: 1000 })
        .bindTooltip(center.label || "Search centre")
        .addTo(g);
      pts.push([center.lat, center.lng]);
    }
    visible.forEach((p) => {
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(KIND_COLOR[p.kind], false), title: p.name })
        .bindPopup(popupNode(p))
        .on("click", () => {
          setSelected(p.id);
          document.getElementById(`loc-${p.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        })
        .addTo(g);
      markers.current.set(p.id, mk);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    else if (center) m.setView([center.lat, center.lng], 13);
  }, [visible, center]);

  /* highlight + open the chosen place */
  useEffect(() => {
    markers.current.forEach((mk, id) => {
      const p = visible.find((x) => x.id === id);
      if (p) mk.setIcon(pinIcon(KIND_COLOR[p.kind], id === selected));
    });
    if (!selected) return;
    const mk = markers.current.get(selected);
    if (mk && map.current) {
      map.current.flyTo(mk.getLatLng(), Math.max(map.current.getZoom(), 15), { duration: 0.6 });
      mk.openPopup();
    }
  }, [selected, visible]);

  useEffect(() => {
    LAST = center ? { center, radius, filter, places, notice, query } : null;
  }, [center, radius, filter, places, notice, query]);

  /* ---------- searching ---------- */
  const runSearch = async (c: Center, r: number) => {
    const seq = ++searchSeq.current;
    setBusy("searching");
    setError("");
    setSelected(null);
    setCenter(c);
    try {
      const data = await getJson<{ results: Place[]; notice: string }>(
        `/api/locator/search?lat=${c.lat}&lng=${c.lng}&radius_km=${r}`,
        userKey
      );
      if (seq !== searchSeq.current) return;
      setPlaces(data.results);
      setNotice(data.notice || "");
    } catch (e) {
      if (seq !== searchSeq.current) return;
      setPlaces([]);
      setNotice("");
      setError(e instanceof TypeError ? "Cannot reach the server. Please check that the backend is running on port 8000." : (e as Error).message);
    } finally {
      if (seq === searchSeq.current) setBusy("");
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("This browser cannot share your location. Please type your city or area instead.");
      return;
    }
    setBusy("locating");
    setError("");
    setHits([]);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setQuery("");
        void runSearch({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Your location" }, radius);
      },
      (err) => {
        setBusy("");
        setError(
          err.code === 1
            ? "Location permission is blocked. Allow it in the browser address bar, or type your city or area below."
            : "Could not find your location. Please type your city or area instead."
        );
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  };

  const searchByName = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError("Please type a city or area, for example Ahmedabad or Navrangpura.");
      return;
    }
    setBusy("searching");
    setError("");
    setHits([]);
    try {
      const data = await getJson<{ results: GeoHit[] }>(`/api/locator/geocode?q=${encodeURIComponent(q)}`, userKey);
      if (data.results.length === 0) {
        setBusy("");
        setError(`I could not find "${q}". Try a nearby city or add the state, for example "Rajkot, Gujarat".`);
        return;
      }
      if (data.results.length > 1) setHits(data.results.slice(0, 4));
      const first = data.results[0];
      await runSearch({ lat: first.lat, lng: first.lng, label: first.label }, radius);
    } catch (e) {
      setBusy("");
      setError(e instanceof TypeError ? "Cannot reach the server. Please check that the backend is running on port 8000." : (e as Error).message);
    }
  };

  const pickHit = (h: GeoHit) => {
    setHits([]);
    void runSearch({ lat: h.lat, lng: h.lng, label: h.label }, radius);
  };

  const changeRadius = (r: number) => {
    setRadius(r);
    if (center) void runSearch(center, r);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: places.length };
    places.forEach((p) => (c[p.kind] = (c[p.kind] ?? 0) + 1));
    return c;
  }, [places]);

  const loading = busy !== "";

  return (
    <div className="space-y-4">
      {/* search bar */}
      <div className="rounded-3xl border border-white/15 p-4" style={GLASS}>
        <p className="text-sm text-[#B7C4A9]">Find Ayurvedic hospitals, clinics, doctors and pharmacies near you.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={loading}
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-70"
            style={{ background: GREEN_GRADIENT }}
          >
            <PinSvg className="h-4 w-4" />
            {busy === "locating" ? "Finding you…" : "Use my location"}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 focus-within:border-[#A9C97C]/70">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchByName()}
              placeholder="Or type a city or area, e.g. Ahmedabad"
              aria-label="City or area"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-[#EAF2DD] placeholder:text-[#7E9077] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void searchByName()}
              disabled={loading}
              className="shrink-0 rounded-full bg-[#8FAF5A]/20 px-4 py-1.5 text-sm font-medium text-[#A9C97C] transition hover:bg-[#8FAF5A]/30 disabled:opacity-60"
            >
              Search
            </button>
          </div>
        </div>

        {hits.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#9FB08F]">
            <span>Did you mean:</span>
            {hits.map((h) => (
              <button
                key={`${h.lat},${h.lng}`}
                type="button"
                onClick={() => pickHit(h)}
                className="max-w-[260px] truncate rounded-full border border-white/15 px-3 py-1 text-[#C9D8B5] transition hover:bg-white/10"
                title={h.label}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setSelected(null);
              }}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                filter === f.id ? "bg-[#8FAF5A]/25 text-[#EAF2DD]" : "border border-white/15 text-[#B7C4A9] hover:bg-white/5"
              }`}
            >
              {f.label}
              {center && !loading ? <span className="ml-1.5 opacity-70">{counts[f.id] ?? 0}</span> : null}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[13px] text-[#9FB08F]">
            Within
            <select
              value={radius}
              onChange={(e) => changeRadius(Number(e.target.value))}
              className="rounded-full border border-white/20 bg-[#10241a] px-3 py-1.5 text-[#EAF2DD] focus:outline-none"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8967A]/40 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F2B7A3]">
            <span className="min-w-0 flex-1">{error}</span>
            {center && (
              <button
                type="button"
                onClick={() => void runSearch(center, radius)}
                disabled={loading}
                className="shrink-0 rounded-full bg-[#E8967A]/20 px-4 py-1 text-[13px] font-medium text-[#F7C9B8] transition hover:bg-[#E8967A]/30 disabled:opacity-60"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {notice && !error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E0B84A]/40 bg-[#E0B84A]/10 px-3 py-2 text-sm text-[#E0B84A]">
            <span className="min-w-0 flex-1">{notice}</span>
            {center && (
              <button
                type="button"
                onClick={() => void runSearch(center, radius)}
                disabled={loading}
                className="shrink-0 rounded-full bg-[#E0B84A]/20 px-4 py-1 text-[13px] font-medium text-[#F0D27A] transition hover:bg-[#E0B84A]/30 disabled:opacity-60"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      {/* map */}
      <div className="relative overflow-hidden rounded-3xl border border-white/15" style={GLASS}>
        <div ref={mapDiv} className="h-[340px] w-full sm:h-[420px]" role="region" aria-label="Map of Ayurvedic places" />
        {loading && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center">
            <span className="rounded-full bg-[#0A1710]/90 px-4 py-1.5 text-xs text-[#A9C97C] ring-1 ring-white/20">
              {busy === "locating" ? "Finding your location…" : "Searching for Ayurvedic places…"}
            </span>
          </div>
        )}
      </div>

      {/* results */}
      {!center && !loading && !error && (
        <div className="rounded-3xl border border-white/15 p-6 text-center" style={GLASS}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8FAF5A]/15 text-[#A9C97C]">
            <PinSvg className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[15px] text-[#EAF2DD]">Press “Use my location” or type a city to begin.</p>
          <p className="mt-1 text-sm text-[#9FB08F]">Only places that are clearly Ayurvedic are shown.</p>
        </div>
      )}

      {center && !loading && !error && !notice && visible.length === 0 && (
        <div className="rounded-3xl border border-white/15 p-6 text-center" style={GLASS}>
          <p className="text-[15px] text-[#EAF2DD]">
            {places.length > 0
              ? `No ${filter === "all" ? "" : KIND_LABEL[filter as Kind].toLowerCase() + " "}results in this filter.`
              : `No Ayurvedic places found within ${radius} km.`}
          </p>
          <p className="mt-1 text-sm text-[#9FB08F]">
            {places.length > 0 ? "Choose “All” to see the other places." : "Try a bigger distance or a nearby larger city."}
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-3">
          <p className="px-1 text-xs uppercase tracking-wider text-[#9FB08F]">
            {visible.length} Ayurvedic {visible.length === 1 ? "place" : "places"} near {center?.label ? center.label.split(",")[0] : "you"}, nearest first
          </p>
          {visible.map((p) => {
            const tel = p.phone ? telHref(p.phone) : null;
            const web = p.website ? safeUrl(p.website) : null;
            return (
              <div
                key={p.id}
                id={`loc-${p.id}`}
                onClick={() => setSelected(p.id)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selected === p.id ? "border-[#A9C97C]/70 bg-white/10" : "border-white/15 hover:bg-white/5"
                }`}
                style={GLASS}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold leading-snug text-[#EAF2DD]">{p.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full px-2.5 py-0.5 font-medium" style={{ background: `${KIND_COLOR[p.kind]}26`, color: KIND_COLOR[p.kind] }}>
                        {KIND_LABEL[p.kind]}
                      </span>
                      {p.verified ? (
                        <span className="rounded-full bg-[#8FAF5A]/20 px-2.5 py-0.5 font-medium text-[#A9C97C]">Verified</span>
                      ) : (
                        <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[#9FB08F]">Map listing</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-[#A9C97C]">{km(p.distance_km)}</span>
                </div>

                {p.address && <p className="mt-2 text-sm text-[#B7C4A9]">{p.address}</p>}
                {p.opening_hours && <p className="mt-1 text-[13px] text-[#9FB08F]">Timings: {p.opening_hours}</p>}
                <p className="mt-1 text-[12px] text-[#8FA080]">{p.reason}</p>

                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={directionsUrl(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white"
                    style={{ background: GREEN_GRADIENT }}
                  >
                    Directions
                  </a>
                  {tel && (
                    <a href={tel} className="rounded-full border border-white/20 px-4 py-1.5 text-[13px] font-medium text-[#EAF2DD] hover:bg-white/10">
                      Call {p.phone.split(/[;,/]/)[0].trim()}
                    </a>
                  )}
                  {web && (
                    <a href={web} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/20 px-4 py-1.5 text-[13px] font-medium text-[#EAF2DD] hover:bg-white/10">
                      Website
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="px-1 pb-2 text-center text-[11px] leading-relaxed text-[#8FA080]">
        Map data © OpenStreetMap contributors. Details can be out of date, so please call before you visit. In an emergency, call 112 or go to the
        nearest hospital. AyurvedAI does not recommend any one provider.
      </p>
    </div>
  );
}
