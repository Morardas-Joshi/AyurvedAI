"""Admin panel API: dashboard summary, catalog, lifestyle, clinics, safety and health.

Every route lives under /api/admin, next to the existing user and document routes.
"""

import csv
import io
import json
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import text

from admin_store import mark_removed, unmark_removed
from ayur_common import AyurHerb, AyurHerbSafety, AyurMedicine, AyurSource, SafetyEvent, slugify
from compare import ComparisonCache
from database import SessionLocal, engine
from herbs import HerbCatalogInput, HerbProfileCache, _upsert_catalog
from lifestyle import FoodRule, LifestylePlan, LifestyleSeason, RoutineItem
from locator import KINDS, LocatorPlace
from models import LoginHistory, User
from rag import llm, store
from rag.documents import ALLOWED_EXTENSIONS
from safety_service import retention_cleanup

router = APIRouter(prefix="/api/admin", tags=["Admin panel"])

RULES_PATH = Path(__file__).resolve().parent / "seed" / "safety_rules.json"
ADMIN_SOURCE = {"id": "admin-entry", "title": "AyurvedAI administrator", "kind": "admin"}
MEDICINE_FORMS = ["churna", "kwatha", "arishta", "asava", "ghrita", "taila", "guggulu", "vati", "rasayana", "avaleha", "bhasma", "other"]
ROUTINE_SLOTS = ("dawn", "morning", "midday", "afternoon", "evening", "night")


def _local(value: datetime | None) -> datetime | None:
    """Timezone-aware values become local naive time, matching login_history timestamps."""
    if value is None:
        return None
    return value.astimezone().replace(tzinfo=None) if value.tzinfo else value


def _iso(value) -> str | None:
    return _local(value).isoformat() if value else None


def _clean_list(values: list[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        value = (value or "").strip()
        if value and value not in seen:
            seen.append(value)
    return seen


def _optional(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


class StatusBody(BaseModel):
    status: str


# ---------------------------------------------------------------- summary

@router.get("/summary")
def summary():
    today = date.today()
    with SessionLocal() as db:
        users = db.query(User).all()
        history = db.query(LoginHistory).all()
        herbs = db.query(AyurHerb.status).all()
        medicines = db.query(AyurMedicine.status).all()
        foods = db.query(FoodRule.status).filter(FoodRule.owner_hash.is_(None)).all()
        routines = db.query(RoutineItem.status).filter(RoutineItem.owner_hash.is_(None)).all()
        plans = db.query(LifestylePlan).all()
        clinics = db.query(LocatorPlace.kind).all()
        events = db.query(SafetyEvent).order_by(SafetyEvent.created_at.desc()).all()

        login_days = [today - timedelta(days=offset) for offset in range(29, -1, -1)]
        per_day = {day: {"success": 0, "failed": 0} for day in login_days}
        reasons: Counter = Counter()
        failed_today = 0
        for item in history:
            day = item.login_at.date()
            if day in per_day:
                per_day[day]["success" if item.status == "success" else "failed"] += 1
            if item.status != "success":
                reasons[item.failure_reason or "Unknown reason"] += 1
                if day == today:
                    failed_today += 1

        months: list[tuple[int, int]] = []
        year, month = today.year, today.month
        for _ in range(6):
            months.insert(0, (year, month))
            month -= 1
            if month == 0:
                year, month = year - 1, 12
        registrations = Counter((user.created_at.year, user.created_at.month) for user in users)

        dominant: Counter = Counter()
        for plan in plans:
            for dosha in (plan.prakriti or {}).get("dominant", []) or []:
                dominant[str(dosha).title()] += 1

        week_ago = datetime.now() - timedelta(days=7)
        recent: list[dict] = []
        for item in sorted(history, key=lambda row: row.login_at, reverse=True)[:6]:
            recent.append({
                "type": "login_success" if item.status == "success" else "login_failed",
                "title": f"{'Signed in' if item.status == 'success' else 'Failed sign-in'}: {item.email}",
                "detail": item.failure_reason or item.ip_address or "",
                "at": _iso(item.login_at),
            })
        for user in sorted(users, key=lambda row: row.created_at, reverse=True)[:4]:
            recent.append({"type": "registration", "title": f"New account: {user.name}", "detail": user.email, "at": _iso(user.created_at)})
        for event in events[:4]:
            recent.append({
                "type": "safety",
                "title": f"Safety alert ({event.level}) in {event.context}",
                "detail": ", ".join(event.flags or []),
                "at": _iso(event.created_at),
            })
        recent.sort(key=lambda row: row["at"] or "", reverse=True)

    try:
        rag = store.stats()
    except Exception:  # noqa: BLE001
        rag = {"total_chunks": 0, "global_files": {}}

    def by_status(rows) -> dict:
        counts = Counter(row[0] for row in rows)
        return {"total": len(rows), **{key: counts.get(key, 0) for key in ("approved", "draft", "rejected")}}

    return {
        "generated_at": datetime.now().isoformat(),
        "users": {
            "total": len(users),
            "active": sum(1 for user in users if user.status == "active"),
            "inactive": sum(1 for user in users if user.status != "active"),
        },
        "logins": {
            "total": len(history),
            "success": sum(1 for item in history if item.status == "success"),
            "failed": sum(1 for item in history if item.status != "success"),
            "failed_today": failed_today,
            "per_day": [{"date": day.isoformat(), **per_day[day]} for day in login_days],
            "failure_reasons": [{"reason": reason, "count": count} for reason, count in reasons.most_common()],
        },
        "registrations_per_month": [
            {"month": f"{y}-{m:02d}", "count": registrations.get((y, m), 0)} for y, m in months
        ],
        "knowledge_base": {
            "files": len(rag.get("global_files", {})),
            "chunks": rag.get("total_chunks", 0),
            "chunks_per_file": rag.get("global_files", {}),
        },
        "herbs": by_status(herbs),
        "medicines": by_status(medicines),
        "food_rules": by_status(foods),
        "routine_items": by_status(routines),
        "lifestyle_plans": {
            "total": len(plans),
            "by_season": [{"label": k, "count": v} for k, v in Counter(plan.season for plan in plans).most_common()],
            "by_dosha": [{"label": k, "count": v} for k, v in dominant.most_common()],
        },
        "clinics": {
            "total": len(clinics),
            "by_kind": [{"label": kind, "count": sum(1 for row in clinics if row[0] == kind)} for kind in KINDS],
        },
        "safety": {
            "total": len(events),
            "last_7_days": sum(1 for event in events if event.created_at and _local(event.created_at) >= week_ago),
            "by_level": [{"label": k, "count": v} for k, v in Counter(event.level for event in events).most_common()],
            "by_context": [{"label": k, "count": v} for k, v in Counter(event.context for event in events).most_common()],
        },
        "recent_activity": recent[:10],
    }


# ---------------------------------------------------------------- herbs

class HerbBody(BaseModel):
    name_english: str = Field(min_length=1, max_length=200)
    name_sanskrit: str | None = Field(default=None, max_length=200)
    name_hindi: str | None = Field(default=None, max_length=200)
    name_gujarati: str | None = Field(default=None, max_length=200)
    botanical_name: str | None = Field(default=None, max_length=200)
    family: str | None = Field(default=None, max_length=120)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    toxic: bool = False

    @field_validator("name_english")
    @classmethod
    def required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("English name is required")
        return value


def _herb_dict(herb: AyurHerb) -> dict:
    return {
        "id": herb.id,
        "slug": herb.slug,
        "name_english": herb.name_english,
        "name_sanskrit": herb.name_sanskrit,
        "name_hindi": herb.name_hindi,
        "name_gujarati": herb.name_gujarati,
        "botanical_name": herb.botanical_name,
        "family": herb.family,
        "aliases": herb.aliases or [],
        "toxic": str(herb.toxic).lower() == "true",
        "status": herb.status,
        "has_profile": bool(herb.profile),
        "created_at": _iso(herb.created_at),
        "updated_at": _iso(herb.updated_at),
    }


def _apply_herb(herb: AyurHerb, body: HerbBody) -> None:
    herb.name_english = body.name_english
    herb.name_sanskrit = _optional(body.name_sanskrit)
    herb.name_hindi = _optional(body.name_hindi)
    herb.name_gujarati = _optional(body.name_gujarati)
    herb.botanical_name = _optional(body.botanical_name)
    herb.family = _optional(body.family)
    herb.aliases = _clean_list(body.aliases)
    herb.toxic = "true" if body.toxic else "false"


@router.get("/herbs")
def list_herbs():
    with SessionLocal() as db:
        rows = db.query(AyurHerb).order_by(AyurHerb.name_english.asc()).all()
        return {"herbs": [_herb_dict(row) for row in rows]}


@router.post("/herbs", status_code=201)
def create_herb(body: HerbBody):
    slug = slugify(body.name_english)
    with SessionLocal() as db:
        if db.query(AyurHerb.id).filter_by(slug=slug).first():
            raise HTTPException(409, f"A herb with the name '{body.name_english}' already exists.")
        herb = AyurHerb(slug=slug, profile={}, source_ids=[], status="draft")
        _apply_herb(herb, body)
        db.add(herb)
        db.commit()
        db.refresh(herb)
        unmark_removed("herbs", slug)
        return {"message": "Herb added as draft.", "herb": _herb_dict(herb)}


@router.put("/herbs/{slug}")
def update_herb(slug: str, body: HerbBody):
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found.")
        _apply_herb(herb, body)
        db.commit()
        db.refresh(herb)
        return {"message": "Herb updated successfully.", "herb": _herb_dict(herb)}


@router.patch("/herbs/{slug}/status")
def set_herb_status(slug: str, body: StatusBody):
    if body.status not in ("approved", "draft"):
        raise HTTPException(400, "Status must be approved or draft.")
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found.")
        herb.status = body.status
        db.commit()
        return {"message": f"Herb marked as {body.status}.", "slug": slug, "status": body.status}


def _drop_comparisons(db, slug: str) -> None:
    for row in db.query(ComparisonCache).all():
        if slug in (row.sorted_slugs or []):
            db.delete(row)


@router.delete("/herbs/{slug}")
def delete_herb(slug: str):
    with SessionLocal() as db:
        herb = db.query(AyurHerb).filter_by(slug=slug).first()
        if herb is None:
            raise HTTPException(404, "Herb not found.")
        db.query(HerbProfileCache).filter_by(herb_slug=slug).delete(synchronize_session=False)
        db.query(AyurHerbSafety).filter_by(herb_slug=slug).delete(synchronize_session=False)
        _drop_comparisons(db, slug)
        db.delete(herb)
        db.commit()
    mark_removed("herbs", slug)
    return {"message": "Herb deleted successfully."}


# ---------------------------------------------------------------- medicines

class MedicineBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    form: str = Field(default="other", max_length=50)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    ingredients: list[str] = Field(default_factory=list, max_length=80)
    source_ids: list[int | str] = Field(min_length=1)
    summary: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Medicine name is required")
        return value


def _medicine_dict(row: AyurMedicine) -> dict:
    return {
        "id": row.id,
        "slug": row.slug,
        "name": row.name,
        "form": row.form,
        "aliases": row.aliases or [],
        "ingredients": row.ingredients or [],
        "source_ids": row.source_ids or [],
        "summary": (row.profile or {}).get("summary"),
        "status": row.status,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def _apply_medicine(row: AyurMedicine, body: MedicineBody) -> None:
    row.name = body.name
    row.form = (body.form or "other").strip().lower() or "other"
    row.aliases = _clean_list(body.aliases)
    row.ingredients = _clean_list(body.ingredients)
    row.source_ids = list(dict.fromkeys(body.source_ids))
    profile = dict(row.profile or {})
    if _optional(body.summary):
        profile["summary"] = body.summary.strip()
    else:
        profile.pop("summary", None)
    row.profile = profile


@router.get("/medicines")
def list_medicines():
    with SessionLocal() as db:
        rows = db.query(AyurMedicine).order_by(AyurMedicine.name.asc()).all()
        return {"medicines": [_medicine_dict(row) for row in rows], "forms": MEDICINE_FORMS}


@router.post("/medicines", status_code=201)
def create_medicine(body: MedicineBody):
    slug = slugify(body.name)
    with SessionLocal() as db:
        if db.query(AyurMedicine.id).filter_by(slug=slug).first():
            raise HTTPException(409, f"A medicine with the name '{body.name}' already exists.")
        row = AyurMedicine(slug=slug, name=body.name, profile={}, status="draft")
        _apply_medicine(row, body)
        db.add(row)
        db.commit()
        db.refresh(row)
        unmark_removed("medicines", slug)
        return {"message": "Medicine added as draft.", "medicine": _medicine_dict(row)}


@router.put("/medicines/{slug}")
def update_medicine(slug: str, body: MedicineBody):
    with SessionLocal() as db:
        row = db.query(AyurMedicine).filter_by(slug=slug).first()
        if row is None:
            raise HTTPException(404, "Medicine not found.")
        _apply_medicine(row, body)
        db.commit()
        db.refresh(row)
        return {"message": "Medicine updated successfully.", "medicine": _medicine_dict(row)}


@router.patch("/medicines/{slug}/status")
def set_medicine_status(slug: str, body: StatusBody):
    if body.status not in ("approved", "draft"):
        raise HTTPException(400, "Status must be approved or draft.")
    with SessionLocal() as db:
        row = db.query(AyurMedicine).filter_by(slug=slug).first()
        if row is None:
            raise HTTPException(404, "Medicine not found.")
        row.status = body.status
        db.commit()
        return {"message": f"Medicine marked as {body.status}.", "slug": slug, "status": body.status}


@router.delete("/medicines/{slug}")
def delete_medicine(slug: str):
    with SessionLocal() as db:
        row = db.query(AyurMedicine).filter_by(slug=slug).first()
        if row is None:
            raise HTTPException(404, "Medicine not found.")
        _drop_comparisons(db, slug)
        db.delete(row)
        db.commit()
    mark_removed("medicines", slug)
    return {"message": "Medicine deleted successfully."}


@router.get("/sources")
def list_sources():
    with SessionLocal() as db:
        rows = db.query(AyurSource).order_by(AyurSource.id.asc()).all()
        return {"sources": [
            {"id": row.id, "value": row.document_id or row.id, "title": row.title, "kind": row.kind, "document_id": row.document_id, "note": row.note}
            for row in rows
        ]}


def _parse_import(filename: str, raw: bytes) -> list[dict]:
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".json":
        decoded = json.loads(raw.decode("utf-8"))
        return decoded if isinstance(decoded, list) else decoded.get("items", [])
    if suffix == ".csv":
        records = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
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
            for key in list(record):
                if record[key] == "":
                    record[key] = None
        return records
    raise HTTPException(415, "Please upload a .csv or .json file.")


@router.post("/catalog/import")
async def import_catalog(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(413, "Import file must be smaller than 2 MB.")
    try:
        records = _parse_import(file.filename or "", raw)
        items = [HerbCatalogInput.model_validate(record) for record in records]
    except HTTPException:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError, AttributeError, TypeError) as exc:
        raise HTTPException(422, f"The file could not be read: {exc}") from exc
    if not items:
        raise HTTPException(422, "The file does not contain any records.")
    try:
        with SessionLocal() as db:
            slugs = [(item.kind, _upsert_catalog(db, item)) for item in items]
            db.commit()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    for kind, slug in slugs:
        unmark_removed("herbs" if kind == "herb" else "medicines", slug)
    herbs = sum(1 for kind, _ in slugs if kind == "herb")
    return {
        "message": f"Imported {len(slugs)} record{'s' if len(slugs) != 1 else ''} ({herbs} herbs, {len(slugs) - herbs} medicines) as draft.",
        "imported": len(slugs),
    }


# ---------------------------------------------------------------- lifestyle

class FoodRuleBody(BaseModel):
    food: str = Field(min_length=1, max_length=200)
    category: Literal["favour", "limit"]
    description: str = Field(min_length=1, max_length=2000)
    diet_tags: list[str] = Field(default_factory=list)
    caution_note: str | None = Field(default=None, max_length=1000)


class RoutineItemBody(BaseModel):
    slot: Literal["dawn", "morning", "midday", "afternoon", "evening", "night"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    dosha_tags: list[str] = Field(default_factory=list)
    season_tags: list[str] = Field(default_factory=list)


def _source_title(sources) -> str:
    if not sources:
        return "General knowledge"
    first = sources[0]
    return first.get("title", "Reference") if isinstance(first, dict) else str(first)


def _food_dict(row: FoodRule) -> dict:
    return {
        "id": row.id, "food": row.food, "category": row.category, "description": row.description,
        "diet_tags": row.diet_tags or [], "caution_note": row.caution_note, "status": row.status,
        "source": _source_title(row.source_ids),
    }


def _routine_dict(row: RoutineItem) -> dict:
    return {
        "id": row.id, "slot": row.slot, "title": row.title, "description": row.description,
        "dosha_tags": row.dosha_tags or [], "season_tags": row.season_tags or [], "status": row.status,
        "source": _source_title(row.source_ids),
    }


@router.get("/lifestyle")
def lifestyle_overview():
    with SessionLocal() as db:
        foods = db.query(FoodRule).filter(FoodRule.owner_hash.is_(None)).order_by(FoodRule.id).all()
        routines = db.query(RoutineItem).filter(RoutineItem.owner_hash.is_(None)).order_by(RoutineItem.id).all()
        seasons = [row.name for row in db.query(LifestyleSeason).order_by(LifestyleSeason.id).all()]
        plans = db.query(LifestylePlan).order_by(LifestylePlan.created_at.desc()).all()
        return {
            "food_rules": [_food_dict(row) for row in foods],
            "routine_items": [_routine_dict(row) for row in routines],
            "seasons": seasons,
            "slots": list(ROUTINE_SLOTS),
            "plans": [
                {
                    "id": row.id,
                    "created_at": _iso(row.created_at),
                    "season": row.season,
                    "dominant": (row.prakriti or {}).get("dominant", []),
                }
                for row in plans
            ],
        }


def _shared(db, model, row_id: int):
    row = db.query(model).filter_by(id=row_id, owner_hash=None).first()
    if row is None:
        raise HTTPException(404, "Item not found.")
    return row


@router.post("/lifestyle/food-rules", status_code=201)
def create_food_rule(body: FoodRuleBody):
    with SessionLocal() as db:
        row = FoodRule(
            food=body.food.strip(), category=body.category, description=body.description.strip(),
            diet_tags=_clean_list(body.diet_tags), caution_note=_optional(body.caution_note),
            source_ids=[ADMIN_SOURCE], status="approved",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        unmark_removed("food_rules", f"{row.food}|{row.category}")
        return {"message": "Food rule added.", "item": _food_dict(row)}


@router.put("/lifestyle/food-rules/{row_id}")
def update_food_rule(row_id: int, body: FoodRuleBody):
    with SessionLocal() as db:
        row = _shared(db, FoodRule, row_id)
        row.food, row.category = body.food.strip(), body.category
        row.description = body.description.strip()
        row.diet_tags = _clean_list(body.diet_tags)
        row.caution_note = _optional(body.caution_note)
        db.commit()
        db.refresh(row)
        return {"message": "Food rule updated.", "item": _food_dict(row)}


@router.patch("/lifestyle/food-rules/{row_id}/status")
def set_food_rule_status(row_id: int, body: StatusBody):
    if body.status not in ("approved", "draft", "rejected"):
        raise HTTPException(400, "Status must be approved, draft or rejected.")
    with SessionLocal() as db:
        row = _shared(db, FoodRule, row_id)
        row.status = body.status
        db.commit()
        return {"message": f"Food rule marked as {body.status}."}


@router.delete("/lifestyle/food-rules/{row_id}")
def delete_food_rule(row_id: int):
    with SessionLocal() as db:
        row = _shared(db, FoodRule, row_id)
        key = f"{row.food}|{row.category}"
        db.delete(row)
        db.commit()
    mark_removed("food_rules", key)
    return {"message": "Food rule deleted."}


@router.post("/lifestyle/routine-items", status_code=201)
def create_routine_item(body: RoutineItemBody):
    with SessionLocal() as db:
        row = RoutineItem(
            slot=body.slot, title=body.title.strip(), description=body.description.strip(),
            dosha_tags=_clean_list([tag.lower() for tag in body.dosha_tags]),
            season_tags=_clean_list(body.season_tags),
            source_ids=[ADMIN_SOURCE], status="approved",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        unmark_removed("routine_items", f"{row.title}|{row.slot}")
        return {"message": "Routine item added.", "item": _routine_dict(row)}


@router.put("/lifestyle/routine-items/{row_id}")
def update_routine_item(row_id: int, body: RoutineItemBody):
    with SessionLocal() as db:
        row = _shared(db, RoutineItem, row_id)
        row.slot, row.title = body.slot, body.title.strip()
        row.description = body.description.strip()
        row.dosha_tags = _clean_list([tag.lower() for tag in body.dosha_tags])
        row.season_tags = _clean_list(body.season_tags)
        db.commit()
        db.refresh(row)
        return {"message": "Routine item updated.", "item": _routine_dict(row)}


@router.patch("/lifestyle/routine-items/{row_id}/status")
def set_routine_status(row_id: int, body: StatusBody):
    if body.status not in ("approved", "draft", "rejected"):
        raise HTTPException(400, "Status must be approved, draft or rejected.")
    with SessionLocal() as db:
        row = _shared(db, RoutineItem, row_id)
        row.status = body.status
        db.commit()
        return {"message": f"Routine item marked as {body.status}."}


@router.delete("/lifestyle/routine-items/{row_id}")
def delete_routine_item(row_id: int):
    with SessionLocal() as db:
        row = _shared(db, RoutineItem, row_id)
        key = f"{row.title}|{row.slot}"
        db.delete(row)
        db.commit()
    mark_removed("routine_items", key)
    return {"message": "Routine item deleted."}


# ---------------------------------------------------------------- verified clinics

class ClinicBody(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kind: Literal["hospital", "clinic", "doctor", "pharmacy"] = "clinic"
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=100)
    state: str = Field(default="", max_length=100)
    phone: str = Field(default="", max_length=60)
    website: str = Field(default="", max_length=300)
    speciality: str = Field(default="", max_length=200)
    timings: str = Field(default="", max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


def _clinic_dict(row: LocatorPlace) -> dict:
    return {
        "id": row.id, "name": row.name, "kind": row.kind, "address": row.address or "", "city": row.city or "",
        "state": row.state or "", "phone": row.phone or "", "website": row.website or "",
        "speciality": row.speciality or "", "timings": row.timings or "", "lat": row.lat, "lng": row.lng,
        "created_at": _iso(row.created_at),
    }


@router.get("/clinics")
def list_clinics():
    with SessionLocal() as db:
        rows = db.query(LocatorPlace).order_by(LocatorPlace.name.asc()).all()
        return {"clinics": [_clinic_dict(row) for row in rows], "kinds": list(KINDS)}


@router.post("/clinics", status_code=201)
def create_clinic(body: ClinicBody):
    with SessionLocal() as db:
        row = LocatorPlace(**{key: value.strip() if isinstance(value, str) else value for key, value in body.model_dump().items()})
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"message": "Verified clinic added.", "clinic": _clinic_dict(row)}


@router.put("/clinics/{clinic_id}")
def update_clinic(clinic_id: int, body: ClinicBody):
    with SessionLocal() as db:
        row = db.get(LocatorPlace, clinic_id)
        if row is None:
            raise HTTPException(404, "Clinic not found.")
        for key, value in body.model_dump().items():
            setattr(row, key, value.strip() if isinstance(value, str) else value)
        db.commit()
        db.refresh(row)
        return {"message": "Verified clinic updated.", "clinic": _clinic_dict(row)}


@router.delete("/clinics/{clinic_id}")
def delete_clinic(clinic_id: int):
    with SessionLocal() as db:
        row = db.get(LocatorPlace, clinic_id)
        if row is None:
            raise HTTPException(404, "Clinic not found.")
        db.delete(row)
        db.commit()
    return {"message": "Verified clinic deleted."}


# ---------------------------------------------------------------- safety monitoring

def _rules_info() -> dict:
    try:
        rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": "unavailable"}
    return {
        "version": rules.get("version"),
        "emergency_patterns": len(rules.get("emergency_patterns", [])),
        "unsafe_patterns": len(rules.get("unsafe_patterns", [])),
        "special_groups": sorted((rules.get("special_group_patterns") or {}).keys()),
        "phone_numbers": rules.get("phone_numbers", {}),
    }


@router.get("/safety/events")
def list_safety_events():
    with SessionLocal() as db:
        rows = db.query(SafetyEvent).order_by(SafetyEvent.created_at.desc()).limit(2000).all()
        return {
            "events": [
                {"id": row.id, "context": row.context, "level": row.level, "flags": row.flags or [],
                 "created_at": _iso(row.created_at), "user_hash": (row.user_hash or "")[:10] or None}
                for row in rows
            ],
            "rules": _rules_info(),
        }


@router.delete("/safety/events/{event_id}")
def delete_safety_event(event_id: int):
    with SessionLocal() as db:
        row = db.get(SafetyEvent, event_id)
        if row is None:
            raise HTTPException(404, "Safety event not found.")
        db.delete(row)
        db.commit()
    return {"message": "Safety event deleted."}


@router.delete("/safety/events")
def clear_safety_events(older_than_days: int = Query(ge=1, le=3650)):
    deleted = retention_cleanup(older_than_days)
    return {"deleted": deleted, "message": f"Deleted {deleted} safety event{'s' if deleted != 1 else ''} older than {older_than_days} days."}


# ---------------------------------------------------------------- system health

@router.get("/health")
def system_health():
    import os

    import identify
    import locator

    checks: list[dict] = []

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks.append({"key": "database", "name": "Database (PostgreSQL)", "status": "ok", "detail": "Connected"})
    except Exception as exc:  # noqa: BLE001
        checks.append({"key": "database", "name": "Database (PostgreSQL)", "status": "error", "detail": f"Not reachable: {type(exc).__name__}"})

    status = llm.provider_status()
    providers = [name for name, ok in (("Groq", status.get("groq_key")), ("Gemini", status.get("gemini_key"))) if ok]
    checks.append({
        "key": "llm", "name": "AI chat model",
        "status": "ok" if providers else "error",
        "detail": f"Providers configured: {', '.join(providers)} (primary: {status.get('primary')})" if providers else "No GROQ_API_KEY or GEMINI_API_KEY set",
    })

    try:
        rag = store.stats()
        files = len(rag.get("global_files", {}))
        chunks = rag.get("total_chunks", 0)
        checks.append({
            "key": "rag", "name": "Knowledge base index (ChromaDB)",
            "status": "ok" if chunks else "warning",
            "detail": f"{files} file{'s' if files != 1 else ''}, {chunks} indexed chunks",
        })
    except Exception as exc:  # noqa: BLE001
        checks.append({"key": "rag", "name": "Knowledge base index (ChromaDB)", "status": "error", "detail": f"Unavailable: {type(exc).__name__}"})

    recognisers = [name for name, ok in (("Pl@ntNet", bool(identify.PLANTNET_API_KEY)), ("Gemini Vision", bool(llm.GEMINI_API_KEY))) if ok]
    checks.append({
        "key": "identify", "name": "Herb image identification",
        "status": "ok" if recognisers else "error",
        "detail": (f"Recognisers: {', '.join(recognisers)} · used today {identify._daily['n']} of {identify.DAILY_CAP}" if recognisers else "No PLANTNET_API_KEY or GEMINI_API_KEY set"),
    })

    with SessionLocal() as db:
        verified = db.query(LocatorPlace.id).count()
    checks.append({
        "key": "locator", "name": "Healthcare locator",
        "status": "ok" if locator.CONTACT else "warning",
        "detail": f"{verified} verified clinic{'s' if verified != 1 else ''} · OpenStreetMap contact {'set' if locator.CONTACT else 'not set (LOCATOR_CONTACT)'}",
    })

    smtp_ready = all(os.getenv(name) for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"))
    checks.append({
        "key": "email", "name": "Email service (password reset OTP)",
        "status": "ok" if smtp_ready else "warning",
        "detail": "SMTP settings configured" if smtp_ready else "SMTP settings incomplete",
    })

    rules = _rules_info()
    checks.append({
        "key": "safety", "name": "Safety rules",
        "status": "ok" if rules.get("version") not in (None, "unavailable") else "error",
        "detail": f"Version {rules.get('version')}",
    })

    try:
        data_dir = store.DATA_DIR
        doc_files = [p for p in data_dir.iterdir() if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS]
        checks.append({"key": "storage", "name": "Document storage folder", "status": "ok", "detail": f"{len(doc_files)} files in rag/data"})
    except OSError as exc:
        checks.append({"key": "storage", "name": "Document storage folder", "status": "error", "detail": str(exc)})

    overall = "error" if any(c["status"] == "error" for c in checks) else "warning" if any(c["status"] == "warning" for c in checks) else "ok"
    return {"checked_at": datetime.now().isoformat(), "overall": overall, "checks": checks}
