import hmac
import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ayur_common import SafetyEvent, get_session
from safety_service import assess, get_disclaimer, lookup_herb_safety, retention_cleanup

router = APIRouter(prefix="/api/safety", tags=["safety"])
RULES_PATH = Path(__file__).resolve().parent / "seed" / "safety_rules.json"


def _admin_required(x_admin_key: str = Header(default="")):
    expected = (os.getenv("SAFETY_ADMIN_KEY") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Safety admin key is not configured")
    if not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Invalid admin key")


class AssessBody(BaseModel):
    text: str = Field(max_length=4000)
    context: str = "chat"


class SafetyRulesBody(BaseModel):
    version: str = Field(min_length=1)
    emergency_patterns: list[str] = Field(min_length=1)
    special_group_patterns: dict[str, list[str]]
    unsafe_patterns: list[str]
    phone_numbers: dict[str, str]
    disclaimers: dict[str, str]


@router.get("/disclaimer")
def disclaimer(context: str = "chat"):
    return {"context": context, "disclaimer": get_disclaimer(context)}


@router.post("/assess")
def assess_route(payload: AssessBody):
    result = assess(payload.text, payload.context)
    return result.to_dict()


@router.get("/herb/{slug}")
def herb_safety(slug: str):
    return {"slug": slug, "notes": lookup_herb_safety(slug)}


@router.get("/rules/version")
def rules_version():
    data = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    return {"version": data["version"]}


@router.get("/admin/rules")
def admin_rules(_=Depends(_admin_required)):
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


@router.post("/admin/rules")
def admin_rules_update(payload: SafetyRulesBody, _=Depends(_admin_required)):
    serialized = json.dumps(payload.model_dump(), indent=2, ensure_ascii=False)
    temporary_path = RULES_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(serialized, encoding="utf-8")
    os.replace(temporary_path, RULES_PATH)
    from safety_service import _load_rules

    _load_rules.cache_clear()
    return {"status": "ok", "version": payload.version}


@router.get("/admin/events")
def admin_events(_=Depends(_admin_required), db: Session = Depends(get_session)):
    rows = db.query(SafetyEvent).order_by(SafetyEvent.created_at.desc()).limit(20).all()
    return {"events": [{"id": r.id, "context": r.context, "level": r.level, "flags": r.flags or [], "created_at": r.created_at.isoformat(), "user_hash": r.user_hash} for r in rows]}


@router.post("/admin/retention")
def admin_retention(days: int = Query(default=90, ge=1, le=3650), _=Depends(_admin_required)):
    return {"deleted": retention_cleanup(days)}


@router.get("/health")
def health():
    return {"ok": True}
