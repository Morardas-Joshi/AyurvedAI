import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import declarative_base, sessionmaker

from database import Base, SessionLocal, engine


try:
    from rapidfuzz import fuzz, process  # type: ignore
except Exception:  # pragma: no cover
    fuzz = None  # type: ignore
    process = None  # type: ignore


class AyurSource(Base):
    __tablename__ = "ayur_sources"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    kind = Column(String(50), nullable=False, default="other")
    url = Column(String(500), nullable=True)
    document_id = Column(String(120), nullable=True)
    license = Column(String(120), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AyurHerb(Base):
    __tablename__ = "ayur_herbs"
    __table_args__ = (UniqueConstraint("slug", name="uq_ayur_herbs_slug"),)
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), nullable=False, unique=True, index=True)
    name_english = Column(String(200), nullable=True)
    name_sanskrit = Column(String(200), nullable=True)
    name_hindi = Column(String(200), nullable=True)
    name_gujarati = Column(String(200), nullable=True)
    botanical_name = Column(String(200), nullable=True)
    family = Column(String(120), nullable=True)
    aliases = Column(JSON, nullable=True, default=list)
    profile = Column(JSON, nullable=True, default=dict)
    source_ids = Column(JSON, nullable=True, default=list)
    status = Column(String(20), nullable=False, default="draft")
    toxic = Column(String(20), nullable=True, default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class AyurMedicine(Base):
    __tablename__ = "ayur_medicines"
    __table_args__ = (UniqueConstraint("slug", name="uq_ayur_medicines_slug"),)
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    aliases = Column(JSON, nullable=True, default=list)
    form = Column(String(50), nullable=False, default="other")
    ingredients = Column(JSON, nullable=True, default=list)
    profile = Column(JSON, nullable=True, default=dict)
    source_ids = Column(JSON, nullable=True, default=list)
    status = Column(String(20), nullable=False, default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class AyurHerbSafety(Base):
    __tablename__ = "ayur_herb_safety"
    id = Column(Integer, primary_key=True, index=True)
    herb_slug = Column(String(120), nullable=False, index=True)
    category = Column(String(40), nullable=False)
    drug_class = Column(String(80), nullable=True)
    severity = Column(String(20), nullable=False, default="info")
    note = Column(Text, nullable=False, default="")
    source_id = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SafetyEvent(Base):
    __tablename__ = "safety_events"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    context = Column(String(40), nullable=False, default="chat")
    level = Column(String(20), nullable=False, default="info")
    flags = Column(JSON, nullable=True, default=list)
    user_hash = Column(String(120), nullable=True)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "item"


def _normalise_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def resolve_name(text: str, *, session=None) -> dict[str, Any]:
    """Best-effort herb/medicine name resolution using alias and English/Hindi/Gujarati/Sanskrit hints."""
    query = (text or "").strip()
    if not query:
        return {"kind": "unknown", "value": None, "matches": []}

    if session is None:
        from database import SessionLocal
        session = SessionLocal()
        close = True
    else:
        close = False
    try:
        names: list[tuple[str, str, str]] = []
        for herb in session.query(AyurHerb).all():
            aliases = [a for a in (herb.aliases or []) if isinstance(a, str)]
            for name in [herb.name_english, herb.name_sanskrit, herb.name_hindi, herb.name_gujarati, herb.botanical_name, *aliases]:
                if name:
                    names.append(("herb", herb.slug, name))
        for med in session.query(AyurMedicine).all():
            aliases = [a for a in (med.aliases or []) if isinstance(a, str)]
            for name in [med.name, *aliases]:
                if name:
                    names.append(("medicine", med.slug, name))

        if not names:
            return {"kind": "unknown", "value": None, "matches": []}

        candidates = []
        for kind, slug, name in names:
            score = 0
            qn = _normalise_name(query)
            nn = _normalise_name(name)
            if qn == nn:
                score = 100
            elif nn.startswith(qn) or qn.startswith(nn):
                score = 85
            else:
                if fuzz:
                    score = fuzz.ratio(qn, nn)
                else:
                    from difflib import SequenceMatcher
                    score = int(SequenceMatcher(None, qn, nn).ratio() * 100)
            if score > 45:
                candidates.append({"kind": kind, "slug": slug, "name": name, "score": score})

        candidates.sort(key=lambda x: (-x["score"], x["name"]))
        return {"kind": "unknown" if not candidates else candidates[0]["kind"], "value": candidates[0]["slug"] if candidates else None, "matches": candidates[:3]}
    finally:
        if close:
            session.close()


for table in (AyurSource, AyurHerb, AyurMedicine, AyurHerbSafety, SafetyEvent):
    try:
        table.__table__.create(bind=engine, checkfirst=True)
    except Exception as exc:  # pragma: no cover
        print(f"[AYUR_COMMON] could not create table {table.__tablename__}: {exc!r}")
