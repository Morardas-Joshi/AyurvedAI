"""Sourced herb and formulation catalog, profile builder, and API routes."""
import csv
import hashlib
import hmac
import io
import json
import os
import re
import time
import unicodedata
from collections import defaultdict, deque
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import Column, DateTime, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Session

from ayur_common import AyurHerb, AyurHerbSafety, AyurMedicine, AyurSource, get_session, slugify
from database import Base, SessionLocal, engine
from herb_mining import mine_rules, rules_for_herb
from rag import llm, store
from rag.safety import EMERGENCY_REPLY
from safety_service import assess, check_answer, get_disclaimer, log_event, safe_system_prompt


router = APIRouter(prefix="/api/herbs", tags=["herbs"])
PROFILE_DISTANCE = float(os.getenv("HERB_PROFILE_MAX_DISTANCE", "0.65"))
AI_PER_USER_PER_HOUR = int(os.getenv("HERB_AI_PER_USER_PER_HOUR", "20"))
_user_hits: dict[str, deque[float]] = defaultdict(deque)


class DoshaEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vata: Literal["decreases", "increases", "neutral", "unknown"] | None = None
    pitta: Literal["decreases", "increases", "neutral", "unknown"] | None = None
    kapha: Literal["decreases", "increases", "neutral", "unknown"] | None = None


class ProfileReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    page: int | None = None
    title: str


class HerbProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rasa: list[str] | None = None
    guna: list[str] | None = None
    virya: str | None = None
    vipaka: str | None = None
    prabhava: str | None = None
    dosha_effect: DoshaEffect | None = None
    parts_used: list[str] | None = None
    classical_uses: list[str] | None = None
    forms: list[str] | None = None
    precautions: list[str] | None = None
    contraindications: list[str] | None = None
    interactions: list[str] | None = None
    traditional_dose_note: str | None = None
    habitat: str | None = None
    references: list[ProfileReference] = Field(default_factory=list)
    origins: dict[str, Literal["document", "public_source", "general"]] = Field(default_factory=dict)


class HerbProfileCache(Base):
    __tablename__ = "ayur_herb_profile_cache"
    __table_args__ = (
        UniqueConstraint("owner_hash", "herb_slug", name="uq_herb_profile_owner_slug"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_hash = Column(String(64), nullable=False, index=True)
    herb_slug = Column(String(120), nullable=False, index=True)
    chunk_hash = Column(String(64), nullable=False)
    profile = Column(JSON, nullable=False, default=dict)
    source_ids = Column(JSON, nullable=False, default=list)
    status = Column(String(20), nullable=False, default="draft")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


HerbProfileCache.__table__.create(bind=engine, checkfirst=True)


class HerbCatalogInput(BaseModel):
    kind: Literal["herb", "medicine"]
    slug: str | None = None
    name_english: str | None = None
    name_sanskrit: str | None = None
    name_hindi: str | None = None
    name_gujarati: str | None = None
    botanical_name: str | None = None
    family: str | None = None
    name: str | None = None
    aliases: list[str] = Field(default_factory=list)
    form: str | None = None
    ingredients: list[str] = Field(default_factory=list)
    source_ids: list[int | str] = Field(default_factory=list)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


def _normalized(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").casefold()
    return " ".join("".join(char if char.isalnum() else " " for char in text).split())


def _name_records(db: Session) -> list[dict[str, Any]]:
    records = []
    for herb in db.query(AyurHerb).all():
        names = [
            herb.name_english,
            herb.name_sanskrit,
            herb.name_hindi,
            herb.name_gujarati,
            herb.botanical_name,
            *(herb.aliases or []),
        ]
        records.append({
            "kind": "herb",
            "slug": herb.slug,
            "title": herb.name_english or herb.botanical_name or herb.slug,
            "names": [name for name in names if isinstance(name, str) and name.strip()],
            "status": herb.status,
        })
    for medicine in db.query(AyurMedicine).all():
        names = [medicine.name, *(medicine.aliases or [])]
        records.append({
            "kind": "medicine",
            "slug": medicine.slug,
            "title": medicine.name,
            "names": [name for name in names if isinstance(name, str) and name.strip()],
            "status": medicine.status,
        })
    return records


def _score(query: str, candidate: str) -> int:
    q = _normalized(query)
    c = _normalized(candidate)
    if not q or not c:
        return 0
    if q == c:
        return 100
    if q in c or c in q:
        return 88
    try:
        from rapidfuzz import fuzz

        return int(fuzz.ratio(q, c))
    except ImportError:
        from difflib import SequenceMatcher

        return int(SequenceMatcher(None, q, c).ratio() * 100)


def _search_records(db: Session, query: str, limit: int) -> list[dict]:
    results = []
    for record in _name_records(db):
        best = max((_score(query, name) for name in record["names"]), default=0)
        if best >= 58:
            results.append({
                "kind": record["kind"],
                "slug": record["slug"],
                "name": record["title"],
                "score": best,
                "status": record["status"],
            })
    results.sort(key=lambda item: (-item["score"], item["name"].casefold()))
    return results[:limit]


def _owner_hash(owner: str) -> str:
    return hashlib.sha256(owner.encode("utf-8")).hexdigest()


def _throttle(owner: str) -> None:
    now = time.time()
    hits = _user_hits[owner]
    while hits and now - hits[0] > 3600:
        hits.popleft()
    if len(hits) >= AI_PER_USER_PER_HOUR:
        raise HTTPException(429, "You have reached the herb AI request limit for this hour. Please try again later.")
    hits.append(now)


def _profile_prompt(name: str, hits: list[dict], validation_error: str = "") -> str:
    excerpts = "\n\n".join(
        f"[{index}] (source_id={hit['id']}, file={hit['filename']}, page={hit['page']})\n{hit['text']}"
        for index, hit in enumerate(hits, 1)
    )
    schema = json.dumps(HerbProfile.model_json_schema(), ensure_ascii=False)
    retry_note = f"\nYour previous response failed validation: {validation_error}\nReturn corrected JSON only." if validation_error else ""
    return (
        f"Extract a structured educational profile for {name} from the supplied document excerpts only.\n"
        "Return one JSON object matching this schema:\n"
        f"{schema}\n\n"
        "Rules: use only facts explicitly stated in the excerpts; use null for a missing scalar and [] for a missing list; "
        "never guess; never add a dose; if traditional_dose_note appears in the excerpt, copy only the exact source note "
        "and keep it marked as reference-only in wording; no copied sentence may exceed 25 words. "
        "Do not invent references: references will be added by the server.\n\n"
        f"DOCUMENT EXCERPTS:\n{excerpts}{retry_note}"
    )


def _parse_profile(raw: str) -> HerbProfile:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("The model response did not contain a JSON object")
    profile = HerbProfile.model_validate_json(text[start:end + 1])
    values = []
    for field_name in (
        "rasa", "guna", "virya", "vipaka", "prabhava", "parts_used", "classical_uses",
        "forms", "precautions", "contraindications", "interactions", "traditional_dose_note", "habitat",
    ):
        value = getattr(profile, field_name)
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, list):
            values.extend(value)
    if any(
        len(sentence.split()) > 25
        for value in values
        for sentence in re.split(r"(?<=[.!?])\s+", value.strip())
        if sentence
    ):
        raise ValueError("A copied profile sentence exceeded 25 words")
    return profile


def _source_references(hits: list[dict]) -> list[ProfileReference]:
    return [
        ProfileReference(
            source_id=str(hit["id"]),
            page=int(hit["page"]) if hit.get("page") else None,
            title=str(hit["filename"]),
        )
        for hit in hits
    ]


def _sanitize_profile(profile: HerbProfile, refs: list[ProfileReference]) -> HerbProfile:
    data = profile.model_dump()
    origins: dict[str, Literal["document", "public_source", "general"]] = {}

    for field_name, value in list(data.items()):
        if field_name in {"references", "origins", "dosha_effect"}:
            continue
        if isinstance(value, str):
            checked = check_answer(value, "herb")
            if checked.flags:
                data[field_name] = None
            elif value.strip():
                origins[field_name] = "document"
        elif isinstance(value, list):
            cleaned = []
            for item in value:
                checked = check_answer(str(item), "herb")
                if not checked.flags and checked.sanitized_text:
                    cleaned.append(checked.sanitized_text)
            data[field_name] = cleaned or None
            if cleaned:
                origins[field_name] = "document"

    effects = data.get("dosha_effect")
    if effects and any(value for value in effects.values()):
        origins["dosha_effect"] = "document"
    data["references"] = [reference.model_dump() for reference in refs]
    data["origins"] = origins
    return HerbProfile.model_validate(data)


def _cache_profile(
    db: Session,
    owner_hash: str,
    slug: str,
    chunk_hash: str,
    profile: HerbProfile,
    source_ids: list[str],
) -> HerbProfileCache:
    cached = db.query(HerbProfileCache).filter_by(owner_hash=owner_hash, herb_slug=slug).first()
    if cached is None:
        cached = HerbProfileCache(owner_hash=owner_hash, herb_slug=slug)
        db.add(cached)
    cached.chunk_hash = chunk_hash
    cached.profile = profile.model_dump(mode="json")
    cached.source_ids = source_ids
    cached.status = "draft"
    db.commit()
    db.refresh(cached)
    return cached


def build_profile(name: str, owner: str, *, herb_slug: str | None = None, force: bool = False) -> dict:
    query = (name or "").strip()
    if not query:
        raise ValueError("A herb name is required")
    risk = assess(query, "herb")
    if risk.level == "emergency" or risk.block_answer:
        raise ValueError("This herb profile request cannot be processed safely")

    with SessionLocal() as db:
        if herb_slug:
            herb = db.query(AyurHerb).filter_by(slug=herb_slug).first()
        else:
            matches = _search_records(db, query, 1)
            if not matches:
                raise LookupError(f"No herb or medicine matches '{query}'")
            match = matches[0]
            if match["kind"] != "herb":
                raise ValueError("Profile building is currently available for herbs only")
            herb = db.query(AyurHerb).filter_by(slug=match["slug"]).first()
        if herb is None:
            raise LookupError("The herb no longer exists in the catalog")

        hits = store.search_with_ids(owner, query, k=8)
        relevant = [hit for hit in hits if float(hit.get("distance", 1)) <= PROFILE_DISTANCE][:6]
        source_ids = [str(hit["id"]) for hit in relevant]
        chunk_hash = hashlib.sha256(
            json.dumps(sorted(source_ids), ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        owner_hash = _owner_hash(owner)

        cached = db.query(HerbProfileCache).filter_by(owner_hash=owner_hash, herb_slug=herb.slug).first()
        if not force and cached and cached.chunk_hash == chunk_hash:
            cached_fields = {
                key: value for key, value in (cached.profile or {}).items()
                if key not in {"references", "origins"}
            }
            has_profile_data = any(value for value in cached_fields.values())
            return {
                "profile": cached.profile,
                "status": cached.status,
                "source_ids": cached.source_ids,
                "message": (
                    None if has_profile_data
                    else "Your documents do not state structured profile facts for this herb."
                    if relevant
                    else "Not stated in your documents. Upload a reference document to prepare this profile."
                ),
            }

        _throttle(owner)
        if not relevant:
            profile = HerbProfile()
            _cache_profile(db, owner_hash, herb.slug, chunk_hash, profile, [])
            return {
                "profile": profile.model_dump(mode="json"),
                "status": "draft",
                "source_ids": [],
                "message": "Not stated in your documents. Upload a reference document to prepare this profile.",
            }

        system = safe_system_prompt("herb profile extraction")
        validation_error = ""
        for attempt in range(2):
            try:
                raw, _ = llm.generate(
                    system,
                    [],
                    _profile_prompt(query, relevant, validation_error),
                )
                profile = _parse_profile(raw)
                break
            except (ValueError, ValidationError) as exc:
                validation_error = str(exc)[:1000]
                if attempt == 1:
                    raise RuntimeError("The generated herb profile failed schema validation after one retry") from exc
        profile = _sanitize_profile(profile, _source_references(relevant))
        _cache_profile(db, owner_hash, herb.slug, chunk_hash, profile, source_ids)
        fields = profile.model_dump(exclude={"references", "origins"})
        message = None if any(value for value in fields.values()) else (
            "Your documents do not state structured profile facts for this herb."
        )
        return {
            "profile": profile.model_dump(mode="json"),
            "status": "draft",
            "source_ids": source_ids,
            "message": message,
        }


def _source_rows(db: Session, source_ids: list[Any]) -> list[dict]:
    numeric_ids = [value for value in source_ids if isinstance(value, int)]
    if not numeric_ids:
        return []
    rows = db.query(AyurSource).filter(AyurSource.id.in_(numeric_ids)).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "kind": row.kind,
            "url": row.url,
            "license": row.license,
            "note": row.note,
        }
        for row in rows
    ]


def _detail(kind: str, item: Any, db: Session, owner: str) -> dict:
    profile: dict = item.profile or {}
    status = item.status
    note = None
    if kind == "herb":
        cache = db.query(HerbProfileCache).filter_by(
            owner_hash=_owner_hash(owner),
            herb_slug=item.slug,
        ).first()
        if cache:
            profile = cache.profile or {}
            status = cache.status
            if not profile.get("references"):
                note = "Not stated in your documents. Upload a reference document to prepare this profile."
    return {
        "kind": kind,
        "slug": item.slug,
        "name": item.name_english if kind == "herb" else item.name,
        "botanical_name": item.botanical_name if kind == "herb" else None,
        "status": status,
        "draft_label": "Draft, not yet reviewed" if status != "approved" else None,
        "profile": profile,
        "sources": _source_rows(db, item.source_ids or []),
        "safety_notes": (
            [
                {
                    "category": row.category,
                    "drug_class": row.drug_class,
                    "severity": row.severity,
                    "note": row.note,
                    "source_id": row.source_id,
                }
                for row in db.query(AyurHerbSafety).filter_by(
                    herb_slug=item.slug,
                    status="published",
                ).all()
            ]
            if kind == "herb"
            else []
        ),
        "profile_note": note,
    }


def _admin_required(x_admin_key: str = Header(default="")):
    expected = (os.getenv("SAFETY_ADMIN_KEY") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Admin key is not configured")
    if not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Invalid admin key")


@router.get("/search")
def search_catalog(q: str = Query(default="", max_length=120), limit: int = Query(default=10, ge=1, le=50)):
    with SessionLocal() as db:
        return {"results": _search_records(db, q, limit) if q.strip() else []}


@router.get("/browse")
def browse_catalog(
    letter: str | None = Query(default=None, max_length=2),
    dosha: Literal["vata", "pitta", "kapha"] | None = None,
    part: str | None = Query(default=None, max_length=80),
    use: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=60),
    x_user_id: str = Header(default="guest"),
):
    with SessionLocal() as db:
        entries = []
        for herb in db.query(AyurHerb).order_by(AyurHerb.name_english).all():
            cached = db.query(HerbProfileCache).filter_by(
                owner_hash=_owner_hash(x_user_id),
                herb_slug=herb.slug,
            ).first()
            profile = (cached.profile if cached else herb.profile) or {}
            if letter and not (herb.name_english or herb.botanical_name or "").casefold().startswith(letter.casefold()):
                continue
            effects = profile.get("dosha_effect") or {}
            if dosha and effects.get(dosha) in (None, "unknown"):
                continue
            if part and not any(part.casefold() in value.casefold() for value in profile.get("parts_used") or []):
                continue
            if use and not any(use.casefold() in value.casefold() for value in profile.get("classical_uses") or []):
                continue
            entries.append({
                "kind": "herb",
                "slug": herb.slug,
                "name": herb.name_english or herb.slug,
                "botanical_name": herb.botanical_name,
                "status": herb.status,
            })
        start = (page - 1) * page_size
        return {"items": entries[start:start + page_size], "page": page, "page_size": page_size, "total": len(entries)}


@router.get("/medicines")
def search_medicines(q: str = Query(default="", max_length=120), limit: int = Query(default=20, ge=1, le=50)):
    with SessionLocal() as db:
        results = [item for item in _search_records(db, q, limit) if item["kind"] == "medicine"] if q else [
            {"kind": "medicine", "slug": row.slug, "name": row.name, "status": row.status}
            for row in db.query(AyurMedicine).order_by(AyurMedicine.name).limit(limit).all()
        ]
        return {"results": results}


@router.get("/medicines/{slug}")
def medicine_detail(slug: str):
    with SessionLocal() as db:
        item = db.query(AyurMedicine).filter_by(slug=slug).first()
        if item is None:
            raise HTTPException(404, "Medicine not found")
        result = _detail("medicine", item, db, "guest")
        result.update({"name": item.name, "form": item.form, "ingredients": item.ingredients or []})
        return result


@router.get("/{slug}/related")
def related_herbs(slug: str, x_user_id: str = Header(default="guest"), limit: int = Query(default=5, ge=1, le=12)):
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found")
        current_cache = db.query(HerbProfileCache).filter_by(
            owner_hash=_owner_hash(x_user_id),
            herb_slug=slug,
        ).first()
        current_profile = (current_cache.profile if current_cache else herb.profile) or {}
        candidates = []
        for other in db.query(AyurHerb).filter(AyurHerb.slug != slug).all():
            cached = db.query(HerbProfileCache).filter_by(
                owner_hash=_owner_hash(x_user_id),
                herb_slug=other.slug,
            ).first()
            profile = (cached.profile if cached else other.profile) or {}
            if profile:
                candidates.append((other, profile))
        current_text = json.dumps(current_profile, ensure_ascii=False, sort_keys=True)
        if not current_profile or not candidates:
            return {"items": [], "message": "Not enough sourced profile information to compare herbs yet."}
        texts = [current_text] + [json.dumps(profile, ensure_ascii=False, sort_keys=True) for _, profile in candidates]
        vectors = store.embed_texts(texts)
        base = vectors[0]

        def cosine(vector):
            dot = sum(a * b for a, b in zip(base, vector))
            left = sum(value * value for value in base) ** 0.5
            right = sum(value * value for value in vector) ** 0.5
            return dot / (left * right) if left and right else 0.0

        ranked = sorted(
            ((cosine(vector), other) for (other, _), vector in zip(candidates, vectors[1:])),
            key=lambda item: item[0],
            reverse=True,
        )
        return {"items": [
            {"slug": other.slug, "name": other.name_english, "similarity": round(score, 3)}
            for score, other in ranked[:limit]
        ]}


@router.get("/{slug}/combos")
def herb_combinations(slug: str):
    with SessionLocal() as db:
        if db.query(AyurHerb).filter_by(slug=slug).first() is None:
            raise HTTPException(404, "Herb not found")
        return rules_for_herb(db, slug)


@router.get("/{slug}")
def herb_detail(slug: str, x_user_id: str = Header(default="guest")):
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found")
        herb_name = herb.name_english or herb.slug
    try:
        generated = build_profile(herb_name, x_user_id, herb_slug=slug)
    except (LookupError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        print("[HERBS] profile build failed:", repr(exc))
        raise HTTPException(502, "Could not prepare the herb profile. Please try again.") from exc
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found")
        detail = _detail("herb", herb, db, x_user_id)
        detail.update({
            "profile": generated["profile"],
            "status": generated["status"],
            "draft_label": "Draft, not yet reviewed",
            "source_ids": generated["source_ids"],
            "profile_note": generated["message"],
            "disclaimer": get_disclaimer("herb"),
        })
        return detail


@router.post("/{slug}/ask")
def ask_about_herb(slug: str, payload: AskRequest, x_user_id: str = Header(default="guest")):
    question = payload.question.strip()
    risk = assess(question, "herb")
    safety = risk.to_dict()
    safety["disclaimer"] = get_disclaimer("herb")
    if risk.level == "emergency":
        log_event("herb_ask", "emergency", risk.flags, x_user_id)

        def emergency_events():
            yield _sse({"type": "meta", "mode": "emergency", "sources": [], "safety": safety})
            yield _sse({"type": "delta", "text": EMERGENCY_REPLY})
            yield _sse({"type": "done", "provider": "rules", "safety": safety})

        return StreamingResponse(emergency_events(), media_type="text/event-stream")
    if risk.block_answer:
        log_event("herb_ask", risk.level, risk.flags, x_user_id)

        def blocked_events():
            yield _sse({"type": "meta", "mode": "general", "sources": [], "safety": safety})
            yield _sse({"type": "delta", "text": " ".join(risk.messages)})
            yield _sse({"type": "done", "provider": "rules", "safety": safety})

        return StreamingResponse(blocked_events(), media_type="text/event-stream")

    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found")
    _throttle(x_user_id)
    hits = store.search_with_ids(x_user_id, f"{herb.name_english or herb.slug} {question}", k=5)
    hits = [hit for hit in hits if float(hit.get("distance", 1)) <= PROFILE_DISTANCE][:4]
    if not hits:
        def no_source_events():
            yield _sse({"type": "meta", "mode": "general", "sources": [], "safety": safety})
            yield _sse({"type": "delta", "text": "I could not find this answer in your reference documents. Upload a trusted source document to ask a sourced question about this herb."})
            yield _sse({"type": "done", "provider": "rules", "safety": safety})

        return StreamingResponse(no_source_events(), media_type="text/event-stream")

    excerpts = "\n\n".join(
        f"[{index}] ({hit['filename']}, page {hit['page']})\n{hit['text']}"
        for index, hit in enumerate(hits, 1)
    )
    prompt = (
        f"Answer the user's educational question about {herb.name_english or herb.slug} using only these excerpts. "
        "Do not diagnose, prescribe, provide a dose, or claim that a treatment is guaranteed. "
        "If the excerpts do not answer, say so. Cite supported claims as [1], [2].\n\n"
        f"EXCERPTS:\n{excerpts}\n\nQUESTION: {question}"
    )

    def answer_events():
        sources = [
            {"id": index, "filename": hit["filename"], "page": hit["page"], "snippet": hit["text"][:240]}
            for index, hit in enumerate(hits, 1)
        ]
        yield _sse({"type": "meta", "mode": "documents", "sources": sources, "safety": safety})
        provider = ""
        pending = ""
        try:
            for provider, piece in llm.stream_generate(
                safe_system_prompt("herb question"),
                [],
                prompt,
            ):
                pending += piece
                while True:
                    match = re.search(r"(?<=[.!?])\s+", pending)
                    if not match:
                        break
                    sentence, pending = pending[:match.start()], pending[match.end():]
                    checked = check_answer(sentence, "herb")
                    if checked.flags:
                        safety["flags"] = sorted(set(safety["flags"] + checked.flags))
                        safety["messages"] = list(dict.fromkeys(safety["messages"] + checked.messages))
                        safety["level"] = "warning"
                        safety["show_professional_cta"] = True
                    if checked.sanitized_text:
                        yield _sse({"type": "delta", "text": checked.sanitized_text + " "})
            checked = check_answer(pending, "herb")
        except Exception as exc:
            print("[HERBS] ask stream failed:", repr(exc))
            yield _sse({"type": "error", "message": "The AI could not complete this answer. Please try again."})
            return
        if checked.flags:
            safety["flags"] = sorted(set(safety["flags"] + checked.flags))
            safety["messages"] = list(dict.fromkeys(safety["messages"] + checked.messages))
            safety["level"] = "warning"
            safety["show_professional_cta"] = True
        if checked.sanitized_text:
            yield _sse({"type": "delta", "text": checked.sanitized_text})
        if safety["flags"]:
            log_event("herb_ask", safety["level"], safety["flags"], x_user_id)
        yield _sse({"type": "done", "provider": provider, "safety": safety})

    return StreamingResponse(
        answer_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _upsert_catalog(db: Session, item: HerbCatalogInput) -> str:
    slug = slugify(item.slug or item.name_english or item.name or item.botanical_name or "")
    if item.kind == "herb":
        row = db.query(AyurHerb).filter_by(slug=slug).first() or AyurHerb(slug=slug)
        row.name_english = item.name_english or item.name or row.name_english
        row.name_sanskrit = item.name_sanskrit or row.name_sanskrit
        row.name_hindi = item.name_hindi or row.name_hindi
        row.name_gujarati = item.name_gujarati or row.name_gujarati
        row.botanical_name = item.botanical_name or row.botanical_name
        row.family = item.family or row.family
        row.aliases = sorted(set((row.aliases or []) + item.aliases))
        row.source_ids = sorted(set((row.source_ids or []) + item.source_ids), key=str)
        row.status = "draft"
    else:
        if not item.source_ids:
            raise ValueError(f"Medicine '{slug}' requires at least one source_id")
        row = db.query(AyurMedicine).filter_by(slug=slug).first() or AyurMedicine(slug=slug, name=item.name or slug)
        row.name = item.name or item.name_english or row.name
        row.aliases = sorted(set((row.aliases or []) + item.aliases))
        row.form = item.form or row.form
        row.ingredients = sorted(set((row.ingredients or []) + item.ingredients))
        row.source_ids = sorted(set((row.source_ids or []) + item.source_ids), key=str)
        row.status = "draft"
    db.add(row)
    return slug


def _load_seed() -> None:
    seed_path = os.path.join(os.path.dirname(__file__), "seed", "herbs_seed.json")
    with open(seed_path, encoding="utf-8") as seed_file:
        seed = json.load(seed_file)
    with SessionLocal() as db:
        source = db.query(AyurSource).filter_by(title="AyurvedAI Knowledge Sheet v1.0").first()
        if source is None:
            source = AyurSource(
                title="AyurvedAI Knowledge Sheet v1.0",
                kind="document",
                document_id="AYU-009",
                note="Local reference file: rag/data/AyurvedAI_Ayurvedic_Knowledge_Sheet.pdf",
            )
            db.add(source)
            db.flush()

        for record in seed.get("herbs", []):
            slug = slugify(record.get("slug") or record.get("name_english", ""))
            row = db.query(AyurHerb).filter_by(slug=slug).first()
            if row is None:
                row = AyurHerb(
                    slug=slug,
                    name_english=record.get("name_english"),
                    botanical_name=record.get("botanical_name"),
                    aliases=record.get("aliases") or [],
                    profile={},
                    source_ids=[],
                    status="draft",
                    toxic="true" if record.get("toxic") else "false",
                )
                db.add(row)
        for record in seed.get("medicines", []):
            slug = slugify(record.get("slug") or record.get("name", ""))
            row = db.query(AyurMedicine).filter_by(slug=slug).first()
            if row is None:
                row = AyurMedicine(
                    slug=slug,
                    name=record["name"],
                    aliases=record.get("aliases") or [],
                    form=record.get("form") or "other",
                    ingredients=record.get("ingredients") or [],
                    profile={},
                    source_ids=[source.id],
                    status="draft",
                )
                db.add(row)
        db.commit()


_load_seed()


@router.post("/admin/herbs")
def create_or_update_herb(payload: HerbCatalogInput, _=Depends(_admin_required)):
    if payload.kind != "herb":
        raise HTTPException(422, "This endpoint only accepts herb records")
    with SessionLocal() as db:
        slug = _upsert_catalog(db, payload)
        db.commit()
        return {"slug": slug, "status": "draft"}


@router.post("/admin/herbs/{slug}/approve")
def approve_herb(slug: str, _=Depends(_admin_required)):
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found")
        herb.status = "approved"
        db.commit()
        return {"slug": slug, "status": herb.status}


@router.post("/admin/rebuild/{slug}")
def rebuild_profile(slug: str, _=Depends(_admin_required)):
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found")
        name = herb.name_english or herb.slug
    try:
        generated = build_profile(name, "global", herb_slug=slug, force=True)
    except Exception as exc:
        print("[HERBS] admin profile rebuild failed:", repr(exc))
        raise HTTPException(502, "Could not rebuild the herb profile") from exc
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        herb.profile = generated["profile"]
        herb.source_ids = generated["source_ids"]
        herb.status = "draft"
        db.commit()
    return {"slug": slug, "status": "draft", "message": generated["message"]}


@router.post("/admin/import")
async def import_catalog(request: Request, _=Depends(_admin_required)):
    body = await request.body()
    content_type = request.headers.get("content-type", "").lower()
    try:
        if "json" in content_type:
            decoded = json.loads(body)
            records = decoded if isinstance(decoded, list) else decoded.get("items", [])
        elif "csv" in content_type:
            records = list(csv.DictReader(io.StringIO(body.decode("utf-8"))))
            for record in records:
                for field_name in ("aliases", "ingredients", "source_ids"):
                    value = record.get(field_name)
                    if not isinstance(value, str):
                        continue
                    value = value.strip()
                    if not value:
                        record[field_name] = []
                        continue
                    try:
                        parsed = json.loads(value)
                    except json.JSONDecodeError:
                        parsed = [part.strip() for part in value.split(";") if part.strip()]
                    record[field_name] = parsed if isinstance(parsed, list) else [parsed]
        else:
            raise HTTPException(415, "Upload JSON or CSV catalog data")
        items = [HerbCatalogInput.model_validate(record) for record in records]
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError, AttributeError, TypeError) as exc:
        raise HTTPException(422, f"Invalid herb/medicine import: {exc}") from exc
    try:
        with SessionLocal() as db:
            slugs = [_upsert_catalog(db, item) for item in items]
            db.commit()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"imported": len(slugs), "slugs": slugs}


@router.post("/admin/mining/run")
def run_association_mining(_=Depends(_admin_required), db: Session = Depends(get_session)):
    return mine_rules(db)
