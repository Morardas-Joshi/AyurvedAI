import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from ayur_common import AyurHerbSafety, SafetyEvent
from database import SessionLocal

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


@lru_cache(maxsize=1)
def _load_rules() -> dict[str, Any]:
    try:
        data = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not load safety rules from {RULES_PATH}") from exc
    list_keys = ("emergency_patterns", "unsafe_patterns")
    mapping_keys = ("special_group_patterns", "phone_numbers", "disclaimers")
    valid_lists = all(
        isinstance(data.get(key), list)
        and all(isinstance(item, str) and item.strip() for item in data[key])
        for key in list_keys
    ) if isinstance(data, dict) else False
    valid_mappings = all(isinstance(data.get(key), dict) for key in mapping_keys) if isinstance(data, dict) else False
    valid_special_groups = valid_mappings and all(
        isinstance(patterns, list)
        and all(isinstance(item, str) and item.strip() for item in patterns)
        for patterns in data["special_group_patterns"].values()
    )
    valid_string_mappings = valid_mappings and all(
        all(isinstance(value, str) and value.strip() for value in data[key].values())
        for key in ("phone_numbers", "disclaimers")
    )
    if not (
        isinstance(data, dict)
        and isinstance(data.get("version"), str)
        and data["version"].strip()
        and valid_lists
        and valid_mappings
        and valid_special_groups
        and valid_string_mappings
    ):
        raise RuntimeError(f"Safety rules in {RULES_PATH} have an invalid format")
    return data


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _contains_any(text: str, patterns: list[str]) -> bool:
    n = _normalize(text)
    return any(p.lower() in n for p in patterns)


def safe_system_prompt(context: str = "chat") -> str:
    return (
        f"Safety context: {context}. Provide educational information only, not medical diagnosis or personal prescriptions. "
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
    with SessionLocal() as db:
        rows = db.query(AyurHerbSafety).filter(
            AyurHerbSafety.herb_slug == slug,
            AyurHerbSafety.status == "published",
        ).order_by(AyurHerbSafety.created_at.desc()).all()
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
    emergency_number = phone.get("emergency", "112")
    mental_health_number = phone.get("mental_health", "14416")
    message = (
        f"This may be a medical emergency. Call {emergency_number} now or go to the nearest hospital. "
        f"If you may harm yourself, call Tele-MANAS at {mental_health_number} or contact someone you trust immediately."
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
        return SafetyAssessment(level="info", flags=[], messages=[], block_answer=False, show_professional_cta=False)

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
        r"\b\d+(?:\.\d+)?\s*(?:mg|g|ml|tsp|tbsp|teaspoons?|tablespoons?|drops?|capsules?|tablets?)\b"
        r"|\b(?:a|an|one|two|three|four|five|half|quarter)\s+(?:teaspoons?|tablespoons?|spoonfuls?|drops?|capsules?|tablets?)\b"
        r"|\b(?:1|2|3|4|5|6|7|8|9)\s*(?:times|x)\s*(?:a\s*day|per\s*day|daily)\b"
        r"|\b(?:twice|thrice|once)\s*(?:a\s*day|daily)\b",
        re.IGNORECASE,
    )


def check_answer(text: str, context: str = "chat") -> SafetyAssessment:
    if not text or not text.strip():
        return SafetyAssessment(level="info", flags=[], messages=[], block_answer=False, show_professional_cta=False)

    flags: set[str] = set()
    kept_lines: list[str] = []
    overclaim_re = re.compile(
        r"\b(?:cures?|guaranteed(?:\s+to)?|100\s*%\s*safe|no\s+side\s+effects)\b",
        re.IGNORECASE,
    )
    dose_re = _dose_pattern_re()

    for line in text.splitlines():
        sentences = re.split(r"(?<=[.!?])\s+", line)
        kept_sentences = []
        for sentence in sentences:
            if dose_re.search(sentence):
                flags.add("dose_pattern")
                continue
            overclaim_match = next(
                (match for match in overclaim_re.finditer(sentence) if not _is_negated(sentence, match.start())),
                None,
            )
            if overclaim_match:
                flags.add("overclaim")
                continue
            kept_sentences.append(sentence)
        if kept_sentences:
            kept_lines.append(" ".join(kept_sentences))

    sanitized = "\n".join(kept_lines).strip()
    if flags:
        if not sanitized:
            sanitized = "I can share general educational information, but I can’t provide a personal dose or guarantee a treatment outcome."
        messages = [
            "I removed a personal-dose or unsupported guarantee statement. Please consult a qualified healthcare professional for personal advice."
        ]
        return SafetyAssessment(
            level="warning",
            flags=sorted(flags),
            messages=messages,
            block_answer=False,
            show_professional_cta=True,
            sanitized_text=sanitized,
        )
    return SafetyAssessment(level="info", flags=[], messages=[], block_answer=False, show_professional_cta=False, sanitized_text=sanitized)


def _is_negated(sentence: str, match_start: int) -> bool:
    prefix = sentence[max(0, match_start - 45):match_start].lower()
    return bool(re.search(
        r"\b(?:not|never|no|cannot|can't|isn't|aren't|doesn't|don't)(?:\s+\w+){0,3}\s*$",
        prefix,
    ))


def get_disclaimer(context: str = "chat") -> str:
    rules = _load_rules()
    return (rules.get("disclaimers") or {}).get(context, "Educational information only. Consult a qualified professional before personal treatment decisions.")


def log_event(context: str, level: str, flags: list[str], user_id: str | None = None) -> None:
    db = SessionLocal()
    try:
        user_hash = None
        if user_id:
            user_hash = hashlib.sha256(f"ayurvedai:{user_id}".encode("utf-8")).hexdigest()[:32]
        db.add(SafetyEvent(context=context, level=level, flags=flags, user_hash=user_hash))
        db.commit()
    except Exception as exc:  # pragma: no cover
        db.rollback()
        print("[SAFETY] could not record safety event:", repr(exc))
    finally:
        db.close()


def retention_cleanup(days: int = 90) -> int:
    if days < 1:
        raise ValueError("Retention period must be at least one day")
    cutoff = datetime.now() - timedelta(days=days)
    with SessionLocal() as db:
        deleted = db.query(SafetyEvent).filter(
            SafetyEvent.created_at < cutoff
        ).delete(synchronize_session=False)
        db.commit()
        return deleted
