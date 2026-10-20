from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ayur_common import SafetyEvent, get_session
from safety_service import assess, build_references, get_disclaimer, lookup_herb_safety, retention_cleanup

router = APIRouter(prefix="/api/safety", tags=["safety"])


def _admin_required(x_admin_key: str = Header(default="")):
    import os
    expected = (os.getenv("ADMIN_KEY") or os.getenv("LOCATOR_ADMIN_KEY") or "").strip()
    if not expected:
        raise HTTPException(status_code=401, detail="Admin key not configured")
    if x_admin_key != expected:
        raise HTTPException(status_code=401, detail="Invalid admin key")


class AssessBody(BaseModel):
    text: str
    context: str = "chat"


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
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parent / "seed" / "safety_rules.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {"version": data.get("version", "v1")}
    except Exception:
        return {"version": "v1"}


@router.get("/admin/rules")
def admin_rules(_=Depends(_admin_required)):
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parent / "seed" / "safety_rules.json"
    return json.loads(path.read_text(encoding="utf-8"))


@router.post("/admin/rules")
def admin_rules_update(payload: dict, _=Depends(_admin_required)):
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parent / "seed" / "safety_rules.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"status": "ok", "version": payload.get("version", "v1")}


@router.get("/admin/events")
def admin_events(_=Depends(_admin_required), db: Session = Depends(get_session)):
    rows = db.query(SafetyEvent).order_by(SafetyEvent.created_at.desc()).limit(20).all()
    return {"events": [{"id": r.id, "context": r.context, "level": r.level, "flags": r.flags or [], "created_at": r.created_at.isoformat(), "user_hash": r.user_hash} for r in rows]}


@router.post("/admin/retention")
def admin_retention(days: int = 90, _=Depends(_admin_required)):
    return {"deleted": retention_cleanup(days)}


@router.get("/health")
def health():
    return {"ok": True}
