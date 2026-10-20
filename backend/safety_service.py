import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ayur_common import AyurHerbSafety, SafetyEvent, get_session

ROOT = Path(__file__).resolve().parent
RULES_PATH = ROOT / "seed" / "safety_rules.json"


@dataclass
class SafetyAssessment:
    level: str = "info"
    flags: list[str] = field(default_factory=list)
    messages: list[str] = field(default_factory=list)
    block_answer: bool = False
    show_professional_cta: bool = False
    sanitized_text: str = ""
    references: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self):
        return {
            "level": self.level,
            "flags": self.flags,
            "messages": self.messages,
            "block_answer": self.block_answer,
            "show_professional_cta": self.show_professional_cta,
            "sanitized_text": self.sanitized_text,
            "references": self.references,
        }


def _load_rules() -> dict[str, Any]:
    try:
        return json.loads(RULES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {
            "emergency_patterns": [
                "chest pain", "heart attack", "trouble breathing", "stroke", "cannot breathe",
                "severe bleeding", "poisoning", "overdose", "seizure", "suicidal", "self-harm"
            ],
            "special_group_patterns": {
                "pregnancy": ["pregnant", "pregnancy", "breastfeeding"],
                "children": ["child", "baby", "infant"],
                "elderly": ["elderly", "older adult"],
                "surgery": ["surgery"],
                "chronic_illness": ["diabetes", "high blood pressure", "kidney disease", "liver disease", "heart disease", "thyroid", "cancer", "autoimmune"],
                "medicine_interactions": ["blood thinner", "diabetes medicine", "blood pressure medicine", "immunosuppressant", "antidepressant"]
            },
            "unsafe_patterns": ["dose for my child", "how much to take", "stop taking", "cure for", "bhasma"],
            "phone_numbers": {"emergency": "112", "ambulance": "108", "mental_health": "14416"},
            "disclaimers": {"chat": "Educational information only.", "herb": "Educational information only.", "compare": "Educational information only.", "diet": "Educational information only.", "identify": "Educational information only."},
        }


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _contains_any(text: str, patterns: list[str]) -> bool:
    n = _normalize(text)
    return any(p.lower() in n for p in patterns)


def safe_system_prompt(context: str = "chat") -> str:
    return (
        "You are AyurvedAI. Provide educational information only, not medical diagnosis or personal prescriptions. "
        "Use the document excerpts first, cite them clearly, and say 'I don't know' when the evidence is insufficient. "
        "Never promise cures, guarantees, or no-side-effects claims. Always suggest consulting a qualified healthcare professional for personal health decisions."
    )


def build_references(rag_chunks: list[dict], extra_sources: list[dict] | None = None) -> list[dict]:
    refs: dict[tuple[str, int], dict] = {}
    for chunk in rag_chunks or []:
        key = (str(chunk.get("filename") or "document"), int(chunk.get("page") or 0))
        snippet = (chunk.get("text") or "")
        refs[key] = {
            "id": len(refs) + 1,
            "title": str(chunk.get("filename") or "Document"),
            "kind": "document",
            "page": int(chunk.get("page") or 0),
            "url": chunk.get("url") or "",
            "snippet": snippet[:240],
            "trust": "document",
        }
    for src in extra_sources or []:
        key = (str(src.get("title") or "source"), int(src.get("page") or 0))
        refs.setdefault(key, {
            "id": len(refs) + 1,
            "title": src.get("title") or "Public source",
            "kind": src.get("kind") or "public_source",
            "page": int(src.get("page") or 0),
            "url": src.get("url") or "",
            "snippet": (src.get("snippet") or "")[:240],
            "trust": "public_source",
        })
    return list(refs.values())


def lookup_herb_safety(slug: str) -> list[dict]:
    slug = (slug or "").strip()
    if not slug:
        return []
    with next(get_session()) as db:
        rows = db.query(AyurHerbSafety).filter(AyurHerbSafety.herb_slug == slug).order_by(AyurHerbSafety.created_at.desc()).all()
    return [
        {
            "herb_slug": r.herb_slug,
            "category": r.category,
            "drug_class": r.drug_class,
            "severity": r.severity,
            "note": r.note,
            "source_id": r.source_id,
            "status": r.status,
        }
        for r in rows
    ]


def _emergency_assessment(text: str, context: str) -> SafetyAssessment:
    rules = _load_rules()
    phone = rules.get("phone_numbers", {})
    message = (
        "This sounds like a medical emergency. Call 112 immediately or go to the nearest hospital. "
        "If you are having thoughts of self-harm, call Tele-MANAS at 14416 or contact a trusted person right now."
    )
    return SafetyAssessment(
        level="emergency",
        flags=["emergency"],
        messages=[message],
        block_answer=True,
        show_professional_cta=True,
        sanitized_text="",
        references=[],
    )


def assess(text: str, context: str = "chat") -> SafetyAssessment:
    rules = _load_rules()
    norm = _normalize(text)
    if not norm:
        return SafetyAssessment(level="info", flags=[], messages=["No safety issue detected."], block_answer=False, show_professional_cta=False)

    if _contains_any(norm, rules.get("emergency_patterns", [])):
        return _emergency_assessment(text, context)

    flags: list[str] = []
    messages: list[str] = []

    for group, patterns in (rules.get("special_group_patterns") or {}).items():
        if _contains_any(norm, patterns):
            flags.append(group)
            messages.append("This may affect a special group; ask a qualified doctor or Ayurvedic practitioner before using herbs or changing medicines.")

    if _contains_any(norm, rules.get("unsafe_patterns", [])):
        flags.append("unsafe_ask")
        messages.append("This asks for a personal dose or treatment decision. I can give general educational information, not an individual prescription or dose.")

    if "bhasma" in norm or "rasaushadhi" in norm:
        flags.append("bhasma")
        messages.append("Metal/mineral preparations such as bhasma or rasaushadhi should only come from licensed manufacturers and be used under qualified professional supervision.")

    if flags:
        return SafetyAssessment(
            level="warning" if "emergency" not in flags else "emergency",
            flags=sorted(set(flags)),
            messages=messages,
            block_answer=("unsafe_ask" in flags),
            show_professional_cta=True,
            sanitized_text="",
        )

    return SafetyAssessment(level="info", flags=[], messages=[], block_answer=False, show_professional_cta=False)


def _dose_pattern_re() -> re.Pattern:
    return re.compile(
        r"\b\d+(?:\.\d+)?\s*(?:mg|g|ml|tsp|tbsp|drops?|capsules?|tablets?)\b|\b(?:1|2|3|4|5|6|7|8|9)\s*(?:times|x)\s*(?:a\s*day|per\s*day|daily)\b|\b(?:twice|thrice|once)\s*(?:a\s*day|daily)\b",
        re.IGNORECASE,
    )


def check_answer(text: str, context: str = "chat") -> SafetyAssessment:
    if not text or not text.strip():
        return SafetyAssessment(level="info", flags=[], messages=[], block_answer=False, show_professional_cta=False)

    sanitized = text
    flags: list[str] = []
    messages: list[str] = []
    bad_patterns = [
        (re.compile(r"\b(?:cures?|guaranteed?|100% safe|no side effects|do not stop your medicine|stop your medicine|stop taking your medicine)\b", re.IGNORECASE), "overclaim"),
        (_dose_pattern_re(), "dose_pattern"),
    ]

    for pattern, flag in bad_patterns:
        if pattern.search(sanitized):
            flags.append(flag)
            sanitized = pattern.sub("", sanitized)

    if "cures" in sanitized.lower() or "100% safe" in sanitized.lower() or "no side effects" in sanitized.lower():
        flags.append("overclaim")
        sanitized = re.sub(r"\b(?:cures?|guaranteed?|100% safe|no side effects)\b.*?[.!?]", "", sanitized, flags=re.IGNORECASE)

    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    if flags:
        messages.append("I removed a personal-dose or overclaiming statement and kept the answer general and educational.")
        return SafetyAssessment(level="warning", flags=sorted(set(flags)), messages=messages, block_answer=False, show_professional_cta=True, sanitized_text=sanitized)
    return SafetyAssessment(level="info", flags=[], messages=[], block_answer=False, show_professional_cta=False, sanitized_text=sanitized)


def get_disclaimer(context: str = "chat") -> str:
    rules = _load_rules()
    return (rules.get("disclaimers") or {}).get(context, "Educational information only. Consult a qualified professional before personal treatment decisions.")


def log_event(context: str, level: str, flags: list[str], user_id: str | None = None) -> None:
    try:
        user_hash = None
        if user_id:
            import hashlib
            user_hash = hashlib.sha256(f"ayurvedai:{user_id}".encode("utf-8")).hexdigest()[:32]
        with next(get_session()) as db:
            db.add(SafetyEvent(context=context, level=level, flags=flags, user_hash=user_hash))
            db.commit()
    except Exception:  # pragma: no cover
        pass


def retention_cleanup(days: int = 90) -> int:
    try:
        from datetime import datetime, timedelta
        with next(get_session()) as db:
            cutoff = datetime.now() - timedelta(days=days)
            deleted = db.query(SafetyEvent).filter(SafetyEvent.created_at < cutoff).delete(synchronize_session=False)
            db.commit()
            return deleted
    except Exception:  # pragma: no cover
        return 0
