"""Source-grounded diet and lifestyle guidance."""
import hashlib
import hmac
import json
import os
import re
from datetime import date
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import Column, DateTime, Integer, JSON, String, Text, func, inspect, or_
from sqlalchemy.orm import Session

from ayur_common import AyurHerb, AyurMedicine
from database import Base, SessionLocal, engine
from rag import llm, store
from safety_service import assess, check_answer, get_disclaimer, safe_system_prompt


router = APIRouter(prefix="/api/lifestyle", tags=["lifestyle"])
SEED_DIR = Path(__file__).resolve().parent / "seed"
DOSHAS = ("vata", "pitta", "kapha")
_STOP_WORDS = {
    "a", "about", "and", "are", "as", "at", "based", "be", "because", "can",
    "day", "for", "from", "general", "guidance", "helps", "in", "is", "it",
    "its", "may", "of", "on", "or", "our", "plan", "season", "selected",
    "the", "this", "to", "use", "with", "your",
}
_WEIGHT_LOSS_RE = re.compile(
    r"\b(?:lose\s+weight|weight\s+loss|fat\s+loss|calorie(?:s)?|"
    r"burn\s+fat|slim\s+down|detox|cleanse|fasting|fast\s+for|"
    r"extreme\s+diet|starvation\s+diet|very\s+low\s+calorie|one\s+meal\s+a\s+day)\b",
    re.IGNORECASE,
)
_EATING_DISORDER_RE = re.compile(
    r"\b(?:eating\s+disorder|anorexia|bulimia|binge\s+eating|purging|"
    r"starving\s+myself|afraid\s+to\s+eat)\b",
    re.IGNORECASE,
)
_CHILD_UNDER_12_RE = re.compile(
    r"\b(?:(?:child|children|kid|kids)\s+(?:under\s+(?:12|twelve)|"
    r"(?:[0-9]|1[01])[- ]year[- ]old)|(?:under\s+(?:12|twelve)|"
    r"(?:[0-9]|1[01])[- ]year[- ]old)\s+(?:child|children|kid|kids))\b",
    re.IGNORECASE,
)
_HEALTH_CONTEXTS = {
    "diabetes": ("diabetes", "diabetic"),
    "high blood pressure": ("high blood pressure", "hypertension"),
    "kidney disease": ("kidney disease", "kidney failure", "renal disease"),
    "liver disease": ("liver disease", "liver failure"),
    "heart disease": ("heart disease", "cardiac disease"),
    "pregnancy": ("pregnant", "pregnancy"),
    "breastfeeding": ("breastfeeding", "breast-feeding", "nursing a baby"),
    "regular medicines": ("regular medicine", "regular medicines", "regular medication", "regular medications", "taking medicines", "taking medication", "prescription medicine"),
}
_NO_HERB_TERMS = re.compile(
    r"\b(?:herb(?:s|al)?|supplement(?:s)?|capsule(?:s)?|extract(?:s)?|bhasma|"
    r"rasayana|churna|tablet(?:s)?)\b",
    re.IGNORECASE,
)


class LifestyleQuestion(Base):
    __tablename__ = "lifestyle_questions"
    id = Column(Integer, primary_key=True)
    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    order = Column(Integer, nullable=False, unique=True)


class FoodRule(Base):
    __tablename__ = "food_rules"
    id = Column(Integer, primary_key=True)
    food = Column(String(200), nullable=False)
    category = Column(String(30), nullable=False)
    rasa = Column(JSON, nullable=False, default=list)
    virya = Column(String(80), nullable=True)
    dosha_effect = Column(JSON, nullable=False, default=dict)
    season_notes = Column(JSON, nullable=False, default=dict)
    diet_tags = Column(JSON, nullable=False, default=list)
    caution_note = Column(Text, nullable=True)
    description = Column(Text, nullable=False, default="")
    source_ids = Column(JSON, nullable=False, default=list)
    status = Column(String(20), nullable=False, default="draft")
    owner_hash = Column(String(64), nullable=True, index=True)


class RoutineItem(Base):
    __tablename__ = "routine_items"
    id = Column(Integer, primary_key=True)
    slot = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    dosha_tags = Column(JSON, nullable=False, default=list)
    season_tags = Column(JSON, nullable=False, default=list)
    source_ids = Column(JSON, nullable=False, default=list)
    status = Column(String(20), nullable=False, default="draft")
    owner_hash = Column(String(64), nullable=True, index=True)


class LifestyleSeason(Base):
    __tablename__ = "seasons"
    id = Column(Integer, primary_key=True)
    name = Column(String(40), nullable=False, unique=True)
    months = Column(JSON, nullable=False)
    description = Column(Text, nullable=False, default="")
    food_notes = Column(Text, nullable=False, default="")
    routine_notes = Column(Text, nullable=False, default="")
    source_ids = Column(JSON, nullable=False, default=list)


class LifestyleSeasonNote(Base):
    __tablename__ = "lifestyle_season_notes"
    id = Column(Integer, primary_key=True)
    season_id = Column(Integer, nullable=False, index=True)
    owner_hash = Column(String(64), nullable=False, index=True)
    source_hash = Column(String(64), nullable=False)
    description = Column(Text, nullable=False, default="")
    food_notes = Column(Text, nullable=False, default="")
    routine_notes = Column(Text, nullable=False, default="")
    source_ids = Column(JSON, nullable=False, default=list)
    status = Column(String(20), nullable=False, default="draft")


class FoodIncompatibility(Base):
    __tablename__ = "food_incompatibilities"
    id = Column(Integer, primary_key=True)
    food_a = Column(String(200), nullable=False)
    food_b = Column(String(200), nullable=False)
    reason = Column(Text, nullable=False)
    source_ids = Column(JSON, nullable=False, default=list)
    status = Column(String(20), nullable=False, default="draft")
    owner_hash = Column(String(64), nullable=True, index=True)


class LifestylePlan(Base):
    __tablename__ = "lifestyle_plans"
    id = Column(Integer, primary_key=True)
    user_hash = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    prakriti = Column(JSON, nullable=False)
    season = Column(String(40), nullable=False)
    preferences = Column(JSON, nullable=False)
    plan = Column(JSON, nullable=False)


for model in (LifestyleQuestion, FoodRule, RoutineItem, LifestyleSeason, LifestyleSeasonNote, FoodIncompatibility, LifestylePlan):
    model.__table__.create(bind=engine, checkfirst=True)


def _migrate_lifestyle_season_notes(bind=engine) -> None:
    columns = {column["name"] for column in inspect(bind).get_columns("lifestyle_season_notes")}
    if "status" not in columns:
        with bind.begin() as connection:
            connection.exec_driver_sql(
                "ALTER TABLE lifestyle_season_notes "
                "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'"
            )


_migrate_lifestyle_season_notes()


def _seed_structure() -> None:
    questions = json.loads((SEED_DIR / "lifestyle_questions.json").read_text(encoding="utf-8"))
    seasons = json.loads((SEED_DIR / "lifestyle_seasons.json").read_text(encoding="utf-8"))
    with SessionLocal() as db:
        if db.query(LifestyleQuestion.id).first() is None:
            db.add_all([
                LifestyleQuestion(id=item["id"], text=item["text"], options=item["options"], order=item["id"])
                for item in questions
            ])
        else:
            question_ids = [item["id"] for item in questions]
            db.query(LifestyleQuestion).filter(
                LifestyleQuestion.id.notin_(question_ids)
            ).delete(synchronize_session=False)
        if db.query(LifestyleSeason.id).first() is None:
            db.add_all([LifestyleSeason(**item) for item in seasons])
        db.commit()


def _seed_general_guidance() -> None:
    guidance = json.loads((SEED_DIR / "lifestyle_general_guidance.json").read_text(encoding="utf-8"))
    with SessionLocal() as db:
        for item in guidance["foods"]:
            existing = db.query(FoodRule.id).filter_by(
                food=item["food"],
                category=item["category"],
                owner_hash=None,
            ).first()
            if existing is None:
                source = item["source"] | {"kind": "public_source", "trust": "public_health"}
                db.add(FoodRule(
                    food=item["food"],
                    category=item["category"],
                    diet_tags=item["diet_tags"],
                    description=item["description"],
                    source_ids=[source],
                    status="approved",
                ))
        for item in guidance["routine"]:
            existing = db.query(RoutineItem.id).filter_by(
                title=item["title"],
                slot=item["slot"],
                owner_hash=None,
            ).first()
            if existing is None:
                source = item["source"] | {"kind": "public_source", "trust": "public_health"}
                db.add(RoutineItem(
                    slot=item["slot"],
                    title=item["title"],
                    description=item["description"],
                    source_ids=[source],
                    status="approved",
                ))
        db.commit()


_seed_structure()
_seed_general_guidance()


def _hash_owner(owner: str) -> str:
    return hashlib.sha256(owner.encode("utf-8")).hexdigest()


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _normalise(value: str) -> str:
    return " ".join(re.findall(r"[^\W_]+", value.casefold(), flags=re.UNICODE))


def score_prakriti(questions: list[dict[str, Any]], answers: dict[str, int]) -> dict[str, Any]:
    question_by_id = {str(question["id"]): question for question in questions}
    if set(answers) != set(question_by_id):
        raise ValueError("Answer every questionnaire item before calculating the result.")
    totals = {dosha: 0.0 for dosha in DOSHAS}
    for question_id, question in question_by_id.items():
        option_index = answers[question_id]
        options = question["options"]
        if not isinstance(option_index, int) or isinstance(option_index, bool) or not 0 <= option_index < len(options):
            raise ValueError(f"Invalid answer for question {question_id}.")
        weights = options[option_index].get("weights", {})
        for dosha in DOSHAS:
            weight = weights.get(dosha, 0)
            if not isinstance(weight, (int, float)) or weight < 0:
                raise ValueError(f"Invalid {dosha} score weight in question {question_id}.")
            totals[dosha] += float(weight)
    total = sum(totals.values())
    if total <= 0:
        raise ValueError("The selected answers do not produce a constitution score.")
    percentages = {dosha: round(totals[dosha] / total * 100, 1) for dosha in DOSHAS}
    ordered = sorted(DOSHAS, key=lambda dosha: (-percentages[dosha], DOSHAS.index(dosha)))
    dominant = [ordered[0]]
    if percentages[ordered[0]] - percentages[ordered[1]] <= 10:
        dominant.append(ordered[1])
    confidence = (
        f"Close split between {dominant[0].title()} and {dominant[1].title()}."
        if len(dominant) == 2
        else f"{dominant[0].title()} is the highest-scoring pattern in these answers."
    )
    return {"percentages": percentages, "dominant": dominant, "confidence": confidence}


def current_season(on_date: date | None = None, region: str = "india", db: Session | None = None) -> dict[str, Any]:
    if region.casefold() != "india":
        raise ValueError("Only the India default calendar is currently configured; choose a season manually for other regions.")
    current_date = on_date or date.today()
    if db is None:
        with SessionLocal() as session:
            return current_season(current_date, region, session)
    rows = db.query(LifestyleSeason).order_by(LifestyleSeason.id).all()
    match = next((row for row in rows if current_date.month in (row.months or [])), None)
    if match is None:
        raise RuntimeError(f"No season is configured for month {current_date.month}.")
    return _season_dict(match, current_date, region)


def _season_dict(row: LifestyleSeason, on_date: date, region: str) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "months": row.months or [],
        "description": row.description or "",
        "food_notes": row.food_notes or "",
        "routine_notes": row.routine_notes or "",
        "source_ids": row.source_ids or [],
        "region": region,
        "detected_month": on_date.month,
        "general_knowledge": not bool(row.source_ids),
    }


def _condition_flags(text: str) -> list[str]:
    normalized = _normalise(text)
    conditions = [
        label for label, patterns in _HEALTH_CONTEXTS.items()
        if any(_normalise(pattern) in normalized for pattern in patterns)
    ]
    if _CHILD_UNDER_12_RE.search(text):
        conditions.append("child under 12")
    return conditions


def _safety_result(goal: str, goal_details: str, health_context: str) -> dict[str, Any]:
    combined = " ".join((goal, goal_details, health_context)).strip()
    assessment = assess(combined, "diet")
    weight_loss = bool(_WEIGHT_LOSS_RE.search(combined))
    eating_disorder = bool(_EATING_DISORDER_RE.search(combined))
    conditions = _condition_flags(combined)
    flags = list(assessment.flags)
    if weight_loss:
        flags.append("weight_loss_goal")
    if eating_disorder:
        flags.append("disordered_eating")
    if conditions:
        flags.extend(f"health_context:{condition}" for condition in conditions)
    messages = list(assessment.messages)
    blocked = weight_loss or eating_disorder or bool(conditions) or assessment.block_answer
    if weight_loss or eating_disorder:
        messages.append(
            "This tool cannot create weight-loss, fasting, detox, or restrictive eating plans. "
            "You deserve supportive, non-judgmental care; please speak with a doctor or registered dietitian."
        )
    if conditions:
        messages.append(
            "Because you mentioned a health condition, pregnancy, a child, or regular medicines, "
            "this tool will not create a personalized plan. Ask your doctor or a qualified Ayurvedic practitioner."
        )
    return {
        "blocked": blocked,
        "assessment": {
            **assessment.to_dict(),
            "level": "warning" if blocked else assessment.level,
            "flags": sorted(set(flags)),
            "messages": list(dict.fromkeys(messages)),
            "block_answer": blocked,
            "show_professional_cta": assessment.show_professional_cta or blocked,
        },
    }


class PlanRequest(BaseModel):
    prakriti: dict[str, Any] = Field(default_factory=dict)
    season: str = Field(min_length=1, max_length=40)
    diet_tags: list[Literal["vegetarian", "vegan", "jain", "eggs_ok"]] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list, max_length=50)
    goal: Literal["general_wellness", "digestion_habits", "sleep_habits", "stress_balance"] = "general_wellness"
    goal_details: str = Field(default="", max_length=500)
    health_context: str = Field(default="", max_length=500)


class SavePlanRequest(BaseModel):
    prakriti: dict[str, Any]
    season: str
    preferences: dict[str, Any]
    plan: dict[str, Any]


class RuleApproval(BaseModel):
    table: Literal["food_rules", "routine_items", "food_incompatibilities"]
    row_id: int
    status: Literal["approved", "rejected"]


class _FoodExtraction(BaseModel):
    food: str = Field(min_length=1, max_length=200)
    category: Literal["favour", "limit"]
    rasa: list[str] = Field(default_factory=list)
    virya: str | None = None
    dosha_effect: dict[str, float] = Field(default_factory=dict)
    season_notes: dict[str, str] = Field(default_factory=dict)
    diet_tags: list[str] = Field(default_factory=list)
    caution_note: str | None = None
    description: str = Field(min_length=1, max_length=700)
    source_ids: list[str] = Field(min_length=1)

    @field_validator("dosha_effect")
    @classmethod
    def validate_dosha_effect(cls, value: dict[str, float]) -> dict[str, float]:
        if set(value) - set(DOSHAS) or any(not -1 <= weight <= 1 for weight in value.values()):
            raise ValueError("Dosha effects must use known doshas and scores from -1 to 1.")
        return value

    @field_validator("diet_tags")
    @classmethod
    def validate_diet_tags(cls, value: list[str]) -> list[str]:
        allowed = {"vegetarian", "veg", "vegan", "jain", "egg", "dairy", "gluten"}
        if set(value) - allowed:
            raise ValueError("The extracted food contains an unsupported diet tag.")
        return value

    @field_validator("season_notes")
    @classmethod
    def validate_season_notes(cls, value: dict[str, str]) -> dict[str, str]:
        value = {key.title(): note for key, note in value.items()}
        allowed = {"Shishira", "Vasanta", "Grishma", "Varsha", "Sharad", "Hemanta"}
        if set(value) - allowed:
            raise ValueError("The extracted food contains an unknown season.")
        return value


class _RoutineExtraction(BaseModel):
    slot: Literal["dawn", "morning", "midday", "afternoon", "evening", "night"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=700)
    dosha_tags: list[str] = Field(default_factory=list)
    season_tags: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(min_length=1)

    @field_validator("dosha_tags")
    @classmethod
    def validate_dosha_tags(cls, value: list[str]) -> list[str]:
        if set(tag.casefold() for tag in value) - set(DOSHAS):
            raise ValueError("The routine contains an unknown dosha tag.")
        return [tag.casefold() for tag in value]

    @field_validator("season_tags")
    @classmethod
    def validate_season_tags(cls, value: list[str]) -> list[str]:
        allowed = {"shishira", "vasanta", "grishma", "varsha", "sharad", "hemanta"}
        if set(tag.casefold() for tag in value) - allowed:
            raise ValueError("The routine contains an unknown season tag.")
        return [tag.title() for tag in value]


class _SeasonExtraction(BaseModel):
    description: str = Field(default="", max_length=500)
    food_notes: str = Field(default="", max_length=700)
    routine_notes: str = Field(default="", max_length=700)
    source_ids: list[str] = Field(min_length=1)


def _extract_json(text: str, model: type[BaseModel]) -> list[BaseModel]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", stripped, flags=re.IGNORECASE)
    try:
        payload = json.loads(stripped)
        values = payload if isinstance(payload, list) else payload.get("items", [])
        if not isinstance(values, list):
            raise ValueError("Expected a JSON list of extracted items.")
        return [model.model_validate(value) for value in values]
    except (json.JSONDecodeError, AttributeError, ValidationError, ValueError) as exc:
        raise ValueError("The source extraction did not match the required structured format.") from exc


def _source_map(chunks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(chunk["id"]): {
            "id": str(chunk["id"]),
            "title": str(chunk.get("filename") or "Reference document"),
            "kind": "document",
            "page": int(chunk.get("page") or 0),
            "snippet": str(chunk.get("text") or "")[:240],
            "trust": "document",
        }
        for chunk in chunks
    }


def _extract_rows(owner: str, topic: str, model: type[BaseModel]) -> list[dict[str, Any]]:
    chunks = store.search_with_ids(owner, topic, k=10)
    if not chunks:
        return []
    if model is _FoodExtraction:
        instructions = (
            "Extract only foods explicitly described in the excerpts and their source-supported food guidance. "
            "Do not suggest herbs, supplements, doses, cures, or new facts. category must be favour or limit. "
            "dosha_effect numbers must be in [-1,1] and only reflect explicit text; unknown means 0. "
            "Use this exact schema: {items:[{food,category,rasa,virya,dosha_effect,season_notes,diet_tags,"
            "caution_note,description,source_ids:[chunk ID]}]}. Allowed diet_tags: vegetarian, vegan, jain, egg, dairy, gluten."
        )
    else:
        instructions = (
            "Extract only daily routine actions explicitly described in the excerpts. Do not invent health benefits, "
            "herbs, supplements, or doses. Use this exact schema: {items:[{slot,title,description,dosha_tags,"
            "season_tags,source_ids:[chunk ID]}}. slot is dawn, morning, midday, afternoon, evening, or night."
        )
    excerpts = [
        {"chunk_id": chunk["id"], "title": chunk.get("filename"), "page": chunk.get("page"), "text": chunk["text"]}
        for chunk in chunks
    ]
    prompt = f"{instructions}\n\nSource excerpts:\n{json.dumps(excerpts, ensure_ascii=False)}"
    try:
        raw, _ = llm.generate(safe_system_prompt("source-grounded diet and lifestyle extraction"), [], prompt)
        extracted = _extract_json(raw, model)
    except (llm.LLMError, ValueError) as exc:
        raise HTTPException(502, "Could not safely extract structured guidance from the reference documents.") from exc
    sources = _source_map(chunks)
    owner_hash = _hash_owner(owner)
    stored: list[dict[str, Any]] = []
    with SessionLocal() as db:
        for entry in extracted:
            value = entry.model_dump()
            citations = [sources[source_id] for source_id in value.pop("source_ids") if source_id in sources]
            if not citations:
                continue
            if model is _FoodExtraction:
                if _NO_HERB_TERMS.search(f"{value['food']} {value['description']}") or not _normalise(value["food"]):
                    continue
                if _contains_catalog_herb(value["food"], db):
                    continue
                existing = db.query(FoodRule).filter_by(
                    owner_hash=owner_hash, food=value["food"], category=value["category"]
                ).first()
                if existing is None:
                    existing = FoodRule(**value, source_ids=citations, status="draft", owner_hash=owner_hash)
                    db.add(existing)
                stored.append(_food_dict(existing, "document"))
            else:
                if _NO_HERB_TERMS.search(f"{value['title']} {value['description']}"):
                    continue
                if _contains_catalog_herb(f"{value['title']} {value['description']}", db):
                    continue
                existing_routine = db.query(RoutineItem).filter_by(
                    owner_hash=owner_hash, title=value["title"], slot=value["slot"]
                ).first()
                if existing_routine is None:
                    existing_routine = RoutineItem(**value, source_ids=citations, status="draft", owner_hash=owner_hash)
                    db.add(existing_routine)
                stored.append(_routine_dict(existing_routine, "document"))
        db.commit()
    return stored


def _contains_catalog_herb(text: str, db: Session) -> bool:
    normalized = _normalise(text)
    if not normalized:
        return False
    names: list[str] = []
    for herb in db.query(AyurHerb).all():
        names.extend([herb.name_english or "", herb.name_sanskrit or "", herb.name_hindi or "", herb.name_gujarati or ""])
        names.extend(herb.aliases or [])
    for medicine in db.query(AyurMedicine).all():
        names.extend([medicine.name, *(medicine.aliases or [])])
    return any(
        normalized == _normalise(name)
        or re.search(rf"(?<!\w){re.escape(_normalise(name))}(?!\w)", normalized)
        for name in names if _normalise(name)
    )


def _build_season_notes(owner: str, season: LifestyleSeason) -> dict[str, Any] | None:
    chunks = store.search_with_ids(
        owner,
        f"Ayurvedic Ritucharya {season.name} seasonal food routine",
        k=8,
    )
    if not chunks:
        return None
    owner_hash = _hash_owner(owner)
    source_hash = hashlib.sha256(
        "|".join(sorted(str(chunk["id"]) for chunk in chunks)).encode("utf-8")
    ).hexdigest()
    with SessionLocal() as db:
        cached = db.query(LifestyleSeasonNote).filter_by(
            season_id=season.id,
            owner_hash=owner_hash,
        ).first()
        if cached and cached.source_hash == source_hash:
            return _season_note_dict(cached)
    prompt = (
        f"Extract only explicit seasonal guidance for {season.name} from these excerpts. "
        "Do not add claims, foods, routines, herbs, supplements, doses or treatments. "
        "Return JSON in this shape: {items:[{description,food_notes,routine_notes,source_ids:[exact chunk IDs]}]}. "
        + json.dumps([
            {"chunk_id": chunk["id"], "title": chunk.get("filename"), "page": chunk.get("page"), "text": chunk["text"]}
            for chunk in chunks
        ], ensure_ascii=False)
    )
    try:
        raw, _ = llm.generate(safe_system_prompt("seasonal lifestyle source extraction"), [], prompt)
        extracted = _extract_json(raw, _SeasonExtraction)
        if len(extracted) != 1:
            raise ValueError("Expected one seasonal guidance object.")
    except (llm.LLMError, ValueError) as exc:
        raise HTTPException(502, "Could not safely extract seasonal guidance from the reference documents.") from exc
    data = extracted[0].model_dump()
    source_map = _source_map(chunks)
    sources = [source_map[value] for value in data.pop("source_ids") if value in source_map]
    if not sources:
        return None
    note_text = " ".join(data.values())
    with SessionLocal() as db:
        if _NO_HERB_TERMS.search(note_text) or _contains_catalog_herb(note_text, db):
            return None
    with SessionLocal() as db:
        row = db.query(LifestyleSeasonNote).filter_by(
            season_id=season.id,
            owner_hash=owner_hash,
        ).first()
        if row is None:
            row = LifestyleSeasonNote(season_id=season.id, owner_hash=owner_hash, source_hash=source_hash)
            db.add(row)
        row.source_hash = source_hash
        row.description = data["description"]
        row.food_notes = data["food_notes"]
        row.routine_notes = data["routine_notes"]
        row.source_ids = sources
        db.commit()
        db.refresh(row)
        return _season_note_dict(row)


def _season_note_dict(row: LifestyleSeasonNote) -> dict[str, Any]:
    return {
        "description": row.description,
        "food_notes": row.food_notes,
        "routine_notes": row.routine_notes,
        "source_ids": row.source_ids or [],
        "status": row.status,
    }


def _food_dict(row: FoodRule, source_label: str | None = None) -> dict[str, Any]:
    sources = row.source_ids or []
    default_source_label = (
        "Public health guidance"
        if sources and sources[0].get("kind") == "public_source"
        else "Reference document" if sources
        else "General knowledge"
    )
    return {
        "id": row.id,
        "food": row.food,
        "category": row.category,
        "rasa": row.rasa or [],
        "virya": row.virya,
        "dosha_effect": row.dosha_effect or {},
        "season_notes": row.season_notes or {},
        "diet_tags": row.diet_tags or [],
        "caution_note": row.caution_note,
        "description": row.description or "",
        "source_ids": sources,
        "source_label": source_label or default_source_label,
        "status": row.status,
        "reason": "",
    }


def _routine_dict(row: RoutineItem, source_label: str | None = None) -> dict[str, Any]:
    sources = row.source_ids or []
    default_source_label = (
        "Public health guidance"
        if sources and sources[0].get("kind") == "public_source"
        else "Reference document" if sources
        else "General knowledge"
    )
    return {
        "id": row.id,
        "slot": row.slot,
        "title": row.title,
        "description": row.description,
        "dosha_tags": row.dosha_tags or [],
        "season_tags": row.season_tags or [],
        "source_ids": sources,
        "source_label": source_label or default_source_label,
        "status": row.status,
        "reason": "",
    }


def _owner_rows(db: Session, model: type[Any], owner_hash: str) -> list[Any]:
    return db.query(model).filter(
        or_(model.owner_hash.is_(None), model.owner_hash == owner_hash),
    ).all()


def _matches_avoid(food: FoodRule, avoid: list[str]) -> bool:
    haystack = _normalise(" ".join((food.food, food.description, food.caution_note or "")))
    return any(
        re.search(rf"(?<!\w){re.escape(_normalise(term))}(?!\w)", haystack)
        for term in avoid if _normalise(term)
    )


def _diet_compatible(food: FoodRule, tags: set[str]) -> bool:
    food_tags = {str(tag).casefold() for tag in food.diet_tags or []}
    if "vegan" in tags and "vegan" not in food_tags:
        return False
    if "jain" in tags and "jain" not in food_tags:
        return False
    if "vegetarian" in tags and not ({"vegetarian", "veg", "vegan"} & food_tags):
        return False
    if "vegan" in tags and {"egg", "dairy"} & food_tags:
        return False
    if "vegetarian" in tags and "egg" in food_tags and "eggs_ok" not in tags:
        return False
    return True


def _food_score(food: FoodRule, dominant: list[str], season: str) -> float:
    effect = food.dosha_effect or {}
    score = sum(float(effect.get(dosha, 0)) for dosha in dominant) / max(1, len(dominant))
    season_note = (food.season_notes or {}).get(season)
    return score + (0.25 if season_note else 0.0)


def _select_plan(
    db: Session,
    owner_hash: str,
    prakriti: dict[str, Any],
    season: str,
    diet_tags: list[str],
    avoid: list[str],
) -> dict[str, Any]:
    dominant = [value for value in prakriti.get("dominant", []) if value in DOSHAS] or list(DOSHAS)
    selected_tags = set(diet_tags)
    foods = [
        row for row in _owner_rows(db, FoodRule, owner_hash)
        if row.status in {"approved", "draft"}
        and _diet_compatible(row, selected_tags)
        and not _matches_avoid(row, avoid)
        and not _NO_HERB_TERMS.search(f"{row.food} {row.description}")
        and not _contains_catalog_herb(f"{row.food} {row.description}", db)
    ]
    foods.sort(key=lambda row: (-_food_score(row, dominant, season), row.id))
    incompatibilities = [
        row for row in _owner_rows(db, FoodIncompatibility, owner_hash)
        if row.status in {"approved", "draft"}
    ]
    by_name = {_normalise(row.food): row for row in foods}
    excluded: set[str] = set()
    for pair in incompatibilities:
        first, second = _normalise(pair.food_a), _normalise(pair.food_b)
        if first in by_name and second in by_name:
            excluded.update((first, second))
    filtered = [row for row in foods if _normalise(row.food) not in excluded]
    favour: list[dict[str, Any]] = []
    limit: list[dict[str, Any]] = []
    for row in filtered:
        item = _food_dict(row)
        if row.owner_hash is None:
            item["reason"] = "General public-health education; not personalized to your constitution."
        else:
            item["reason"] = (
                f"Selected by the stored dosha-fit score ({_food_score(row, dominant, season):.2f})"
                + (f" and a note for {season}" if (row.season_notes or {}).get(season) else "")
                + "."
            )
        (favour if row.category == "favour" else limit).append(item)
    routines = [
        row for row in _owner_rows(db, RoutineItem, owner_hash)
        if row.status in {"approved", "draft"}
        and (not row.dosha_tags or set(dominant) & {str(tag).casefold() for tag in row.dosha_tags})
        and (not row.season_tags or season.casefold() in {str(tag).casefold() for tag in row.season_tags})
        and not _NO_HERB_TERMS.search(f"{row.title} {row.description}")
        and not _contains_catalog_herb(f"{row.title} {row.description}", db)
    ]
    slot_order = {"dawn": 0, "morning": 1, "midday": 2, "afternoon": 3, "evening": 4, "night": 5}
    routines.sort(key=lambda row: (slot_order[row.slot], row.id))
    routine_items = []
    for row in routines:
        item = _routine_dict(row)
        item["reason"] = (
            "General public-health education; not personalized to your constitution."
            if row.owner_hash is None
            else "Matches the selected constitution pattern."
            if row.dosha_tags else "Included from the stored reference routine."
        )
        routine_items.append(item)
    incompatible_notes = [
        pair.reason for pair in incompatibilities
        if _normalise(pair.food_a) in excluded and _normalise(pair.food_b) in excluded
    ]
    selected_favour = favour[:8]
    selected_limit = limit[:8]
    selected_routines = routine_items[:12]
    return {
        "favour": selected_favour,
        "limit": selected_limit,
        "routine": selected_routines,
        "incompatible_removed": [by_name[name].food for name in sorted(excluded)],
        "incompatibility_notes": incompatible_notes,
        "season": season,
        "dominant": dominant,
        "references": _plan_references(selected_favour + selected_limit + selected_routines),
    }


def _plan_references(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    references: dict[tuple[str, int], dict[str, Any]] = {}
    for item in items:
        for source in item.get("source_ids", []):
            key = (str(source.get("title") or "Reference document"), int(source.get("page") or 0))
            references[key] = {
                "id": len(references) + 1,
                "title": key[0],
                "kind": source.get("kind", "document"),
                "page": key[1],
                "url": source.get("url", ""),
                "snippet": source.get("snippet", ""),
                "trust": source.get("trust", "document"),
            }
    return list(references.values())


def _allowed_explanation_words(plan: dict[str, Any]) -> set[str]:
    values: list[str] = []
    for group in ("favour", "limit", "routine"):
        for item in plan.get(group, []):
            values.extend(str(item.get(field) or "") for field in ("food", "title", "description", "reason"))
    return set(re.findall(r"[^\W_]+", " ".join(values).casefold(), flags=re.UNICODE)) | _STOP_WORDS


def _explanation_sentence_allowed(sentence: str, allowed_words: set[str]) -> bool:
    if _NO_HERB_TERMS.search(sentence):
        return False
    words = set(re.findall(r"[^\W_]+", sentence.casefold(), flags=re.UNICODE))
    return bool(words) and words <= allowed_words


def _plan_events(plan: dict[str, Any] | None, safety: dict[str, Any]) -> Any:
    def events():
        references = plan.get("references", []) if plan else []
        yield _sse({"type": "meta", "plan": plan, "safety": safety, "references": references})
        if plan is None:
            yield _sse({"type": "done", "safety": safety})
            return
        chosen = plan["favour"] + plan["limit"] + plan["routine"]
        if not chosen:
            yield _sse({
                "type": "delta",
                "text": "No source-backed food or routine items are available yet. Add diet and lifestyle reference documents to build this plan.",
            })
            yield _sse({"type": "done", "safety": safety})
            return
        allowed_words = _allowed_explanation_words(plan)
        prompt = (
            "Write a brief, neutral explanation of the selected items below. Only explain these exact rows; "
            "do not add foods, routines, herbs, supplements, doses, or advice not in the rows. "
            "Use words present in the selected rows plus simple connecting words. Do not recommend treatment.\n"
            + json.dumps(chosen, ensure_ascii=False)
        )
        pending = ""
        filtered = False
        try:
            for _, piece in llm.stream_generate(
                safe_system_prompt("general diet and lifestyle education"),
                [],
                prompt,
            ):
                pending += piece
                while True:
                    match = re.search(r"(?<=[.!?])\s+", pending)
                    if not match:
                        break
                    sentence, pending = pending[:match.start()], pending[match.end():]
                    checked = check_answer(sentence, "diet")
                    if not checked.flags and _explanation_sentence_allowed(sentence, allowed_words):
                        yield _sse({"type": "delta", "text": sentence.strip() + " "})
                    else:
                        filtered = True
            if pending.strip():
                checked = check_answer(pending, "diet")
                if not checked.flags and _explanation_sentence_allowed(pending, allowed_words):
                    yield _sse({"type": "delta", "text": pending.strip()})
                else:
                    filtered = True
        except Exception as exc:
            print("[LIFESTYLE] explanation stream failed:", repr(exc))
            yield _sse({"type": "error", "message": "The selected plan is ready, but its explanation could not be generated."})
            yield _sse({"type": "done", "safety": safety})
            return
        final_safety = dict(safety)
        if filtered:
            final_safety["level"] = "warning"
            final_safety["flags"] = sorted(set(final_safety.get("flags", []) + ["unsupported_content_removed"]))
            final_safety["messages"] = list(dict.fromkeys(
                final_safety.get("messages", []) + [
                    "Unsupported or unselected content was omitted from the generated explanation."
                ]
            ))
            final_safety["show_professional_cta"] = True
            yield _sse({"type": "safety", "safety": final_safety})
        yield _sse({"type": "done", "safety": final_safety})

    return events()


def _build_plan(payload: PlanRequest, owner: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    safety = _safety_result(payload.goal, payload.goal_details, payload.health_context)
    if safety["blocked"]:
        return None, safety["assessment"]
    owner_hash = _hash_owner(owner)
    extraction_failed = False
    for topic, model in (
        ("Ayurvedic food diet Ahara rasa seasonal food compatibility", _FoodExtraction),
        ("Ayurvedic daily routine Dinacharya wake morning meal movement sleep", _RoutineExtraction),
    ):
        try:
            _extract_rows(owner, topic, model)
        except HTTPException as exc:
            if exc.status_code != 502:
                raise
            extraction_failed = True
    with SessionLocal() as db:
        seasons = db.query(LifestyleSeason).all()
        season_row = next((row for row in seasons if row.name.casefold() == payload.season.casefold()), None)
        if season_row is None:
            raise HTTPException(422, "Choose one of the configured seasons.")
        plan = _select_plan(db, owner_hash, payload.prakriti, season_row.name, payload.diet_tags, payload.avoid)
    try:
        season_note = _build_season_notes(owner, season_row)
    except HTTPException as exc:
        if exc.status_code != 502:
            raise
        season_note = None
        extraction_failed = True
    season_guide = _season_dict(season_row, date.today(), "india")
    if season_note:
        season_guide.update(season_note)
        season_guide["general_knowledge"] = False
    plan["season_guide"] = season_guide
    plan["references"] = _plan_references(
        plan["favour"] + plan["limit"] + plan["routine"] + (
            [{"source_ids": season_guide.get("source_ids", [])}] if season_guide.get("source_ids") else []
        )
    )
    safety["disclaimer"] = get_disclaimer("diet")
    assessment = safety["assessment"]
    if extraction_failed:
        assessment["level"] = "warning"
        assessment["flags"] = sorted(set(assessment.get("flags", []) + ["source_extraction_unavailable"]))
        assessment["messages"] = list(dict.fromkeys(
            assessment.get("messages", []) + [
                "New guidance could not be extracted from your reference documents right now. "
                "Previously saved document items and general public-health guidance are shown; "
                "document extraction can be retried later."
            ]
        ))
    return plan, assessment | {"disclaimer": safety["disclaimer"]}


@router.get("/questions")
def get_questions() -> dict[str, Any]:
    with SessionLocal() as db:
        rows = db.query(LifestyleQuestion).order_by(LifestyleQuestion.order).all()
    return {"questions": [{"id": row.id, "text": row.text, "options": row.options} for row in rows]}


class PrakritiRequest(BaseModel):
    answers: dict[str, int]


@router.post("/prakriti")
def calculate_prakriti(payload: PrakritiRequest) -> dict[str, Any]:
    questions = get_questions()["questions"]
    try:
        result = score_prakriti(questions, payload.answers)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    result["disclaimer"] = (
        "A self-assessment for learning. It is not a diagnosis. "
        "A qualified Ayurvedic practitioner assesses constitution properly."
    )
    return result


@router.get("/season")
def get_season(
    on: date | None = None,
    region: str = "india",
    override: str | None = None,
    x_user_id: str = Header(default="guest"),
) -> dict[str, Any]:
    current_date = on or date.today()
    if override:
        with SessionLocal() as db:
            row = db.query(LifestyleSeason).filter(func.lower(LifestyleSeason.name) == override.casefold()).first()
            if row is None:
                raise HTTPException(422, "The selected season is not configured.")
    else:
        try:
            current = current_season(current_date, region)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        with SessionLocal() as db:
            row = db.query(LifestyleSeason).filter_by(name=current["name"]).first()
            if row is None:
                raise HTTPException(500, "The detected season is missing from the configured season table.")
    result = _season_dict(row, current_date, region)
    try:
        note = _build_season_notes(x_user_id, row)
    except HTTPException as exc:
        if exc.status_code != 502:
            raise
        result["note_error"] = exc.detail
        return result
    if note:
        result.update(note)
        result["general_knowledge"] = False
    return result


@router.get("/tip")
def get_tip(x_user_id: str = Header(default="guest")) -> dict[str, Any]:
    owner_hash = _hash_owner(x_user_id)
    with SessionLocal() as db:
        candidates = [
            row for row in _owner_rows(db, FoodRule, owner_hash)
            if row.source_ids and row.status in {"approved", "draft"}
        ]
        if candidates:
            candidates.sort(key=lambda row: row.id)
            item = _food_dict(candidates[date.today().toordinal() % len(candidates)])
            return {
                "tip": item["description"],
                "label": item["source_label"],
                "sources": _plan_references([item]),
                "season": current_season(db=db)["name"],
            }
    return {
        "tip": "Take a moment today to notice what feels comfortable and sustainable for you.",
        "label": "General knowledge",
        "sources": [],
        "season": current_season()["name"],
    }


@router.post("/plan")
def create_plan(payload: PlanRequest, x_user_id: str = Header(default="guest")) -> StreamingResponse:
    plan, safety = _build_plan(payload, x_user_id)
    return StreamingResponse(
        _plan_events(plan, safety),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/plans")
def save_plan(payload: SavePlanRequest, x_user_id: str = Header(default="guest")) -> dict[str, Any]:
    with SessionLocal() as db:
        row = LifestylePlan(
            user_hash=_hash_owner(x_user_id),
            prakriti=payload.prakriti,
            season=payload.season,
            preferences=payload.preferences,
            plan=payload.plan,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "created_at": row.created_at.isoformat() if row.created_at else None}


@router.get("/plans")
def list_plans(x_user_id: str = Header(default="guest")) -> dict[str, Any]:
    with SessionLocal() as db:
        rows = db.query(LifestylePlan).filter_by(user_hash=_hash_owner(x_user_id)).order_by(LifestylePlan.created_at.desc()).all()
        return {"plans": [
            {
                "id": row.id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "prakriti": row.prakriti,
                "season": row.season,
                "preferences": row.preferences,
                "plan": row.plan,
            }
            for row in rows
        ]}


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, x_user_id: str = Header(default="guest")) -> dict[str, bool]:
    with SessionLocal() as db:
        row = db.query(LifestylePlan).filter_by(
            id=plan_id,
            user_hash=_hash_owner(x_user_id),
        ).first()
        if row is None:
            raise HTTPException(404, "Saved plan not found.")
        db.delete(row)
        db.commit()
    return {"deleted": True}


def _admin_required(x_admin_key: str) -> None:
    expected = (os.getenv("SAFETY_ADMIN_KEY") or "").strip()
    if not expected:
        raise HTTPException(503, "Lifestyle rule administration is not configured.")
    if not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(401, "Invalid admin key.")


@router.post("/admin/rules")
def approve_rule(payload: RuleApproval, x_admin_key: str = Header(default="")) -> dict[str, Any]:
    _admin_required(x_admin_key)
    model = {
        "food_rules": FoodRule,
        "routine_items": RoutineItem,
        "food_incompatibilities": FoodIncompatibility,
    }[payload.table]
    with SessionLocal() as db:
        row = db.query(model).filter_by(id=payload.row_id, owner_hash=None).first()
        if row is None:
            raise HTTPException(404, "Shared draft rule not found.")
        row.status = payload.status
        db.commit()
    return {"table": payload.table, "id": payload.row_id, "status": payload.status}
