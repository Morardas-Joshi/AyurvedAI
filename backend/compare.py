"""Source-grounded herb and medicine comparisons."""
import hashlib
import json
import os
import re
import time
from collections import defaultdict, deque
from typing import Any, Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Column, DateTime, Integer, JSON, String, UniqueConstraint, func, or_
from sqlalchemy.orm import Session

from ayur_common import AyurHerb, AyurMedicine, AyurSource, resolve_name
from database import Base, SessionLocal, engine
from herbs import build_profile
from rag import llm, store
from safety_service import assess, check_answer, get_disclaimer, log_event, safe_system_prompt


router = APIRouter(prefix="/api/compare", tags=["compare"])
_summary_hits: dict[str, deque[float]] = defaultdict(deque)
SUMMARY_REQUESTS_PER_HOUR = int(os.getenv("COMPARE_SUMMARY_PER_USER_PER_HOUR", "20"))
_FEATURE_FIELDS = ("rasa", "guna", "virya", "vipaka", "dosha_effect", "classical_uses")
_ROW_FIELDS: tuple[tuple[str, str, str], ...] = (
    ("Names", "Name", "name"),
    ("Botanical info", "Botanical name", "botanical_name"),
    ("Botanical info", "Family", "family"),
    ("Properties", "Rasa", "rasa"),
    ("Properties", "Guna", "guna"),
    ("Properties", "Virya", "virya"),
    ("Properties", "Vipaka", "vipaka"),
    ("Properties", "Prabhava", "prabhava"),
    ("Dosha effects", "Vata", "dosha_vata"),
    ("Dosha effects", "Pitta", "dosha_pitta"),
    ("Dosha effects", "Kapha", "dosha_kapha"),
    ("Use and preparation", "Parts used", "parts_used"),
    ("Use and preparation", "Classical uses", "classical_uses"),
    ("Use and preparation", "Forms", "forms"),
    ("Composition", "Ingredients", "ingredients"),
    ("Safety information", "Precautions", "precautions"),
    ("Safety information", "Contraindications", "contraindications"),
    ("Safety information", "Interactions", "interactions"),
)
_SYNONYMS = {
    "ushna": "hot",
    "usna": "hot",
    "sheeta": "cold",
    "shita": "cold",
    "guru": "heavy",
    "laghu": "light",
    "snigdha": "unctuous",
    "ruksha": "dry",
}
_RECOMMENDATION_RE = re.compile(
    r"\b(?:you should|you ought to|you may want to|i recommend|we recommend|i suggest|"
    r"best choice for you|better for you|you should take|you may take|consider taking|"
    r"choose this|take this herb|take this medicine|i would choose|i would select)\b",
    re.IGNORECASE,
)


class CompareRequest(BaseModel):
    kind: Literal["herb", "medicine"]
    items: list[str] = Field(min_length=2, max_length=4)

    @field_validator("items")
    @classmethod
    def validate_item_names(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("Each item must have a name.")
        if any(len(value) > 120 for value in cleaned):
            raise ValueError("Each item name must be 120 characters or fewer.")
        return cleaned


class ComparisonCache(Base):
    __tablename__ = "ayur_comparison_cache"
    __table_args__ = (
        UniqueConstraint("owner_hash", "cache_key", name="uq_ayur_comparison_owner_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_hash = Column(String(64), nullable=False, index=True)
    cache_key = Column(String(64), nullable=False, index=True)
    kind = Column(String(20), nullable=False)
    sorted_slugs = Column(JSON, nullable=False, default=list)
    profile_hash = Column(String(64), nullable=False)
    response = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


ComparisonCache.__table__.create(bind=engine, checkfirst=True)


def _owner_hash(owner: str) -> str:
    return hashlib.sha256(owner.encode("utf-8")).hexdigest()


def _resolve_one(db: Session, name: str, expected_kind: str) -> dict[str, Any] | None:
    direct_herb = db.query(AyurHerb).filter_by(slug=name).first()
    direct_medicine = db.query(AyurMedicine).filter_by(slug=name).first()
    if direct_herb or direct_medicine:
        actual_kind = "herb" if direct_herb else "medicine"
        if actual_kind != expected_kind:
            raise HTTPException(
                422,
                "Herbs and medicines cannot be mixed. Choose one type and compare only that type.",
            )
        row = direct_herb or direct_medicine
        return _catalog_item(actual_kind, row)

    result = resolve_name(name, session=db)
    matches = result.get("matches") or []
    best_score = max((int(match.get("score", 0)) for match in matches), default=0)
    best = [match for match in matches if int(match.get("score", 0)) == best_score]
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for match in best:
        unique.setdefault((match["kind"], match["slug"]), match)
    best_matches = list(unique.values())

    if result.get("kind") == expected_kind and len(best_matches) == 1 and best_score >= 75:
        kind, slug = best_matches[0]["kind"], best_matches[0]["slug"]
        row = (
            db.query(AyurHerb).filter_by(slug=slug).first()
            if kind == "herb"
            else db.query(AyurMedicine).filter_by(slug=slug).first()
        )
        if row is not None:
            return _catalog_item(kind, row)

    if (
        best_score >= 75
        and result.get("kind") in ("herb", "medicine")
        and result["kind"] != expected_kind
    ):
        if best_matches and any(match["kind"] == expected_kind for match in best_matches):
            return {
                "unresolved": name,
                "suggestions": [
                    {"kind": match["kind"], "slug": match["slug"], "name": match["name"]}
                    for match in best_matches[:3]
                ],
            }
        raise HTTPException(
            422,
            "Herbs and medicines cannot be mixed. Choose one type and compare only that type.",
        )

    suggestions = matches[:3]
    return {
        "unresolved": name,
        "suggestions": [
            {"kind": match["kind"], "slug": match["slug"], "name": match["name"]}
            for match in suggestions
        ],
    }


def _catalog_item(kind: str, row: AyurHerb | AyurMedicine) -> dict[str, Any]:
    if kind == "herb":
        herb = row
        return {
            "kind": kind,
            "slug": herb.slug,
            "name": herb.name_english or herb.slug,
            "botanical_name": herb.botanical_name,
            "family": herb.family,
            "name_sanskrit": herb.name_sanskrit,
            "name_hindi": herb.name_hindi,
            "name_gujarati": herb.name_gujarati,
            "profile": herb.profile or {},
            "status": herb.status,
            "source_ids": herb.source_ids or [],
        }
    medicine = row
    return {
        "kind": kind,
        "slug": medicine.slug,
        "name": medicine.name,
        "botanical_name": None,
        "family": None,
        "form": medicine.form,
        "ingredients": medicine.ingredients or [],
        "profile": medicine.profile or {},
        "status": medicine.status,
        "source_ids": medicine.source_ids or [],
    }


def _merge_profile_references(*profiles: dict[str, Any]) -> list[dict[str, Any]]:
    references: dict[str, dict[str, Any]] = {}
    for profile in profiles:
        for reference in profile.get("references") or []:
            if isinstance(reference, dict):
                key = json.dumps(reference, ensure_ascii=False, sort_keys=True)
                references[key] = reference
    return list(references.values())


def _merge_profile_value(catalog_value: Any, document_value: Any) -> Any:
    if isinstance(catalog_value, dict) or isinstance(document_value, dict):
        catalog_map = catalog_value if isinstance(catalog_value, dict) else {}
        document_map = document_value if isinstance(document_value, dict) else {}
        return {
            key: _merge_profile_value(catalog_map.get(key), document_map.get(key))
            for key in dict.fromkeys([*catalog_map.keys(), *document_map.keys()])
        }
    return document_value if _profile_has_value(document_value) else catalog_value


def _profile_for_item(item: dict[str, Any], owner: str) -> dict[str, Any]:
    if item["kind"] != "herb":
        if not item["profile"]:
            item["profile_note"] = "Not stated in the stored reference profile."
        return item
    try:
        generated = build_profile(item["name"], owner, herb_slug=item["slug"])
    except (LookupError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        print("[COMPARE] profile preparation failed:", repr(exc))
        raise HTTPException(502, "Could not prepare an herb profile for comparison.") from exc
    catalog_profile = item.get("profile") or {}
    document_profile = generated.get("profile") or {}
    merged_profile = {
        key: (
            _merge_profile_references(catalog_profile, document_profile)
            if key == "references"
            else {**(catalog_profile.get(key) or {}), **(document_profile.get(key) or {})}
            if key == "origins"
            else _merge_profile_value(catalog_profile.get(key), document_profile.get(key))
        )
        for key in dict.fromkeys([*catalog_profile.keys(), *document_profile.keys()])
    }
    item["profile"] = merged_profile
    item["status"] = generated["status"]
    item["source_ids"] = list(dict.fromkeys([*(item.get("source_ids") or []), *(generated.get("source_ids") or [])]))
    item["profile_note"] = None if any(
        _profile_has_value(value)
        for key, value in merged_profile.items()
        if key not in {"references", "origins"}
    ) else generated["message"]
    return item


def _profile_has_value(value: Any) -> bool:
    if isinstance(value, dict):
        return any(_profile_has_value(entry) for entry in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(_profile_has_value(entry) for entry in value)
    if isinstance(value, str):
        return value.strip().casefold() not in {"", "unknown", "not stated", "not available"}
    return bool(value)


def _normalise(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        parts = [
            f"{key}: {_normalise(item)}"
            for key, item in sorted(value.items())
            if item is not None and _normalise(item)
        ]
        return "; ".join(parts)
    if isinstance(value, (list, tuple, set)):
        parts = sorted({_normalise(item) for item in value if _normalise(item)})
        return ", ".join(parts)
    text = " ".join(str(value).strip().casefold().split())
    if text in {"", "unknown", "not stated", "not available"}:
        return ""
    words = re.findall(r"[^\W_]+", text, flags=re.UNICODE)
    return " ".join(_SYNONYMS.get(word, word) for word in words)


def _row_value(item: dict[str, Any], key: str) -> Any:
    if key.startswith("dosha_"):
        dosha = key.removeprefix("dosha_")
        effects = (item.get("profile") or {}).get("dosha_effect")
        return effects.get(dosha) if isinstance(effects, dict) else None
    if key in {"name", "botanical_name", "family"}:
        return item.get(key)
    if key == "forms":
        return (item.get("profile") or {}).get("forms") or item.get("form")
    if key == "ingredients":
        return item.get("ingredients")
    return (item.get("profile") or {}).get(key)


def _build_rows(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for section, label, key in _ROW_FIELDS:
        values = [_row_value(item, key) for item in items]
        normalized = [_normalise(value) for value in values]
        recorded = {value for value in normalized if value}
        rows.append({
            "section": section,
            "label": label,
            "values": values,
            "same": len(recorded) <= 1,
        })
    return rows


def _similarity(items: list[dict[str, Any]]) -> tuple[list[list[float]], list[list[dict[str, float]]]]:
    if not items:
        return [], []
    profiles = [item.get("profile") or {} for item in items]
    embed_texts = [
        json.dumps(
            {field: profile.get(field) for field in _FEATURE_FIELDS},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        for profile in profiles
    ]
    vectors = store.embed_texts(embed_texts)
    feature_sets = [
        {
            f"{field}:{_normalise(value)}"
            for field in _FEATURE_FIELDS
            for value in (profile.get(field) if isinstance(profile.get(field), list) else [profile.get(field)])
            if _normalise(value)
        }
        for profile in profiles
    ]
    matrix: list[list[float]] = []
    components: list[list[dict[str, float]]] = []
    for left_index, left_vector in enumerate(vectors):
        score_row: list[float] = []
        component_row: list[dict[str, float]] = []
        for right_index, right_vector in enumerate(vectors):
            if left_index == right_index:
                embedding_score = property_score = score = 1.0
            else:
                dot = sum(left * right for left, right in zip(left_vector, right_vector))
                left_norm = sum(value * value for value in left_vector) ** 0.5
                right_norm = sum(value * value for value in right_vector) ** 0.5
                cosine = dot / (left_norm * right_norm) if left_norm and right_norm else 0.0
                embedding_score = min(1.0, max(0.0, (cosine + 1) / 2))
                union = feature_sets[left_index] | feature_sets[right_index]
                property_score = (
                    len(feature_sets[left_index] & feature_sets[right_index]) / len(union)
                    if union
                    else 1.0
                )
                score = 0.5 * embedding_score + 0.5 * property_score
            score_row.append(float(round(min(1.0, max(0.0, score)), 4)))
            component_row.append({
                "embedding": float(round(embedding_score, 4)),
                "properties": float(round(property_score, 4)),
            })
        matrix.append(score_row)
        components.append(component_row)
    return matrix, components


def _profile_version(item: dict[str, Any]) -> str:
    value = {
        "slug": item["slug"],
        "status": item["status"],
        "profile": item.get("profile") or {},
        "source_ids": item.get("source_ids") or [],
    }
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _references(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for item in items:
        for reference in (item.get("profile") or {}).get("references") or []:
            ref = {
                "source_id": str(reference.get("source_id", "")),
                "title": str(reference.get("title", "")),
                "page": reference.get("page"),
                "item": item["name"],
            }
            refs[(ref["source_id"], ref["title"], str(ref["page"]), ref["item"])] = ref
    source_ids = {
        str(source_id)
        for item in items
        for source_id in item.get("source_ids") or []
    }
    if source_ids:
        numeric_ids = [int(source_id) for source_id in source_ids if source_id.isdecimal()]
        document_ids = sorted(source_ids)
        source_filters = []
        if numeric_ids:
            source_filters.append(AyurSource.id.in_(numeric_ids))
        if document_ids:
            source_filters.append(AyurSource.document_id.in_(document_ids))
        with SessionLocal() as db:
            source_rows = db.query(AyurSource).filter(or_(*source_filters)).all()
        for source in source_rows:
            source_id = str(source.id)
            document_id = str(source.document_id or "")
            if source_id not in source_ids and document_id not in source_ids:
                continue
            for item in items:
                item_source_ids = {str(value) for value in item.get("source_ids") or []}
                if source_id not in item_source_ids and document_id not in item_source_ids:
                    continue
                ref = {
                    "source_id": source_id,
                    "title": source.title,
                    "page": None,
                    "item": item["name"],
                }
                refs[(ref["source_id"], ref["title"], "None", ref["item"])] = ref
    return list(refs.values())


def _reorder_response(response: dict[str, Any], wanted_slugs: list[str]) -> dict[str, Any]:
    old_items = response["items"]
    positions = {item["slug"]: index for index, item in enumerate(old_items)}
    order = [positions[slug] for slug in wanted_slugs]
    reordered = dict(response)
    reordered["items"] = [old_items[index] for index in order]
    reordered["rows"] = [
        {**row, "values": [row["values"][index] for index in order]}
        for row in response["rows"]
    ]
    reordered["similarity"] = [
        [response["similarity"][row][column] for column in order]
        for row in order
    ]
    reordered["similarity_components"] = [
        [response["similarity_components"][row][column] for column in order]
        for row in order
    ]
    return reordered


def _comparison(payload: CompareRequest, owner: str) -> dict[str, Any]:
    with SessionLocal() as db:
        resolved: list[dict[str, Any]] = []
        unresolved: list[dict[str, Any]] = []
        for name in payload.items:
            item = _resolve_one(db, name, payload.kind)
            if item is None:
                continue
            if "unresolved" in item:
                unresolved.append(item)
            else:
                resolved.append(item)
    slugs = [item["slug"] for item in resolved]
    if len(set(slugs)) != len(slugs):
        raise HTTPException(422, "Each item can only be added once to a comparison.")
    resolved = [_profile_for_item(item, owner) for item in resolved]
    versions = sorted((_profile_version(item) for item in resolved))
    sorted_slugs = sorted(slugs)
    profile_hash = hashlib.sha256("|".join(versions).encode("utf-8")).hexdigest()
    cache_key = hashlib.sha256(
        f"{payload.kind}|{'|'.join(sorted_slugs)}|{profile_hash}".encode("utf-8")
    ).hexdigest()
    owner_hash = _owner_hash(owner)
    if not unresolved and resolved:
        with SessionLocal() as db:
            cached = db.query(ComparisonCache).filter_by(
                owner_hash=owner_hash,
                cache_key=cache_key,
            ).first()
            if cached:
                cached_response = _reorder_response(cached.response, slugs)
                cached_response["cache_hit"] = True
                return cached_response

    matrix, components = _similarity(resolved)
    safety = assess(
        "Compare stored herb and medicine reference information.",
        payload.kind,
    ).to_dict()
    safety["disclaimer"] = get_disclaimer(payload.kind)
    response = {
        "kind": payload.kind,
        "items": resolved,
        "rows": _build_rows(resolved),
        "similarity": matrix,
        "similarity_components": components,
        "unresolved": unresolved,
        "safety": safety,
        "references": _references(resolved),
        "cache_hit": False,
    }
    if not unresolved and resolved:
        canonical_response = _reorder_response(response, sorted_slugs)
        with SessionLocal() as db:
            cached = db.query(ComparisonCache).filter_by(
                owner_hash=owner_hash,
                cache_key=cache_key,
            ).first()
            if cached is None:
                cached = ComparisonCache(
                    owner_hash=owner_hash,
                    cache_key=cache_key,
                    kind=payload.kind,
                    sorted_slugs=sorted_slugs,
                    profile_hash=profile_hash,
                )
                db.add(cached)
            cached.response = canonical_response
            cached.profile_hash = profile_hash
            db.commit()
    return response


def _summary_allowed(sentence: str) -> str:
    if _RECOMMENDATION_RE.search(sentence):
        return ""
    checked = check_answer(sentence, "compare summary")
    if checked.flags and checked.sanitized_text.startswith("I can share general educational information"):
        return ""
    return checked.sanitized_text


def _limit_summary(owner: str) -> None:
    if SUMMARY_REQUESTS_PER_HOUR < 1:
        raise HTTPException(503, "Comparison summaries are temporarily unavailable.")
    now = time.time()
    hits = _summary_hits[_owner_hash(owner)]
    while hits and now - hits[0] > 3600:
        hits.popleft()
    if len(hits) >= SUMMARY_REQUESTS_PER_HOUR:
        raise HTTPException(429, "You have reached the comparison-summary limit for this hour.")
    hits.append(now)


@router.post("")
def compare_items(payload: CompareRequest, x_user_id: str = Header(default="guest")) -> dict[str, Any]:
    return _comparison(payload, x_user_id)


@router.post("/summary")
def compare_summary(payload: CompareRequest, x_user_id: str = Header(default="guest")) -> StreamingResponse:
    comparison = _comparison(payload, x_user_id)
    if comparison["unresolved"]:
        raise HTTPException(422, "Resolve every name before requesting a comparison summary.")
    if len(comparison["items"]) < 2:
        raise HTTPException(422, "At least two known items are needed for a summary.")
    _limit_summary(x_user_id)

    table = [
        {
            "section": row["section"],
            "label": row["label"],
            "values": [
                value if value not in (None, "", [], {}) else "Not stated"
                for value in row["values"]
            ],
        }
        for row in comparison["rows"]
    ]
    prompt = (
        "Describe key differences and similarities between the items using only the comparison table below. "
        "Explain when people traditionally prefer each only when that distinction is explicitly supported by the table. "
        "If a value is missing, say it is not stated. Do not recommend, rank, or choose an item for the user. "
        "Do not give doses or add facts. Keep the summary brief.\n\n"
        f"COMPARISON TABLE:\n{json.dumps(table, ensure_ascii=False)}"
    )
    safety = comparison["safety"]
    references = comparison["references"]

    def events():
        yield _sse({"type": "meta", "safety": safety, "references": references})
        pending = ""
        provider = ""
        flags: set[str] = set()
        try:
            for provider, piece in llm.stream_generate(
                safe_system_prompt(f"{payload.kind} comparison summary"),
                [],
                prompt,
            ):
                pending += piece
                while True:
                    match = re.search(r"(?<=[.!?])\s+", pending)
                    if not match:
                        break
                    sentence, pending = pending[:match.start()], pending[match.end():]
                    checked = check_answer(sentence, "compare summary")
                    flags.update(checked.flags)
                    allowed = _summary_allowed(sentence)
                    if allowed:
                        yield _sse({"type": "delta", "text": allowed + " "})
            checked = check_answer(pending, "compare summary")
            flags.update(checked.flags)
            allowed = _summary_allowed(pending)
            if allowed:
                yield _sse({"type": "delta", "text": allowed})
        except Exception as exc:
            print("[COMPARE] summary stream failed:", repr(exc))
            yield _sse({"type": "error", "message": "The comparison summary could not be completed. Please try again."})
            return
        if flags:
            safety["flags"] = sorted(set(safety.get("flags", []) + list(flags)))
            safety["level"] = "warning"
            safety["messages"] = list(dict.fromkeys(
                safety.get("messages", []) + [
                    "A personal dose or unsupported treatment claim was removed from the summary."
                ]
            ))
            safety["show_professional_cta"] = True
            log_event("compare_summary", "warning", safety["flags"], x_user_id)
        yield _sse({"type": "done", "provider": provider, "safety": safety})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
