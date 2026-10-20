"""Association patterns from ingredients in reviewed Ayurvedic formulations."""
import os

from sqlalchemy import Column, DateTime, Float, Integer, JSON, func
from sqlalchemy.orm import Session

from ayur_common import AyurMedicine
from database import Base, engine


class AyurHerbRule(Base):
    __tablename__ = "ayur_herb_rules"

    id = Column(Integer, primary_key=True, index=True)
    antecedent = Column(JSON, nullable=False)
    consequent = Column(JSON, nullable=False)
    support = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)
    lift = Column(Float, nullable=False)
    n_transactions = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


AyurHerbRule.__table__.create(bind=engine, checkfirst=True)


def _thresholds() -> tuple[float, float]:
    support = float(os.getenv("HERB_MIN_SUPPORT", "0.05"))
    confidence = float(os.getenv("HERB_MIN_CONFIDENCE", "0.6"))
    if not 0 < support <= 1 or not 0 < confidence <= 1:
        raise ValueError("HERB_MIN_SUPPORT and HERB_MIN_CONFIDENCE must be between 0 and 1")
    return support, confidence


def mine_rules(db: Session) -> dict:
    medicines = db.query(AyurMedicine).filter(AyurMedicine.status == "approved").all()
    transactions = [
        sorted({str(item) for item in (medicine.ingredients or []) if item})
        for medicine in medicines
    ]
    transactions = [items for items in transactions if items]

    db.query(AyurHerbRule).delete(synchronize_session=False)
    if len(transactions) < 20:
        db.commit()
        return {
            "status": "not_enough_data",
            "message": "Not enough data yet",
            "n_transactions": len(transactions),
            "rules_created": 0,
        }

    min_support, min_confidence = _thresholds()
    from mlxtend.frequent_patterns import association_rules, fpgrowth
    from mlxtend.preprocessing import TransactionEncoder
    import pandas as pd

    encoder = TransactionEncoder()
    encoded = encoder.fit(transactions).transform(transactions)
    frame = pd.DataFrame(encoded, columns=encoder.columns_)
    frequent = fpgrowth(frame, min_support=min_support, use_colnames=True)
    if frequent.empty or len(frequent) < 2:
        db.commit()
        return {
            "status": "complete",
            "message": "No association patterns meet the configured thresholds.",
            "n_transactions": len(transactions),
            "rules_created": 0,
        }

    rules = association_rules(
        frequent,
        metric="confidence",
        min_threshold=min_confidence,
        num_itemsets=len(transactions),
    )
    for _, rule in rules.iterrows():
        antecedent = sorted(str(value) for value in rule["antecedents"])
        consequent = sorted(str(value) for value in rule["consequents"])
        if not antecedent or not consequent:
            continue
        db.add(AyurHerbRule(
            antecedent=antecedent,
            consequent=consequent,
            support=float(rule["support"]),
            confidence=float(rule["confidence"]),
            lift=float(rule["lift"]),
            n_transactions=len(transactions),
        ))
    db.commit()
    return {
        "status": "complete",
        "message": "Association rules generated from approved formulations.",
        "n_transactions": len(transactions),
        "rules_created": len(rules),
    }


def rules_for_herb(db: Session, slug: str) -> dict:
    n_transactions = sum(
        1 for medicine in db.query(AyurMedicine).filter_by(status="approved").all()
        if any(medicine.ingredients or [])
    )
    if n_transactions < 20:
        return {
            "message": "Not enough data yet",
            "label": "Pattern in classical formulations",
            "items": [],
            "n_transactions": n_transactions,
        }

    rows = db.query(AyurHerbRule).order_by(AyurHerbRule.confidence.desc()).all()
    items = []
    for row in rows:
        if slug not in (row.antecedent or []):
            continue
        items.extend({
            "slug": other,
            "confidence": round(row.confidence * 100),
            "n_formulations": row.n_transactions,
            "label": "Pattern in classical formulations",
        } for other in row.consequent or [])
    return {
        "message": None if items else "No supported combination patterns found yet.",
        "label": "Pattern in classical formulations",
        "items": items,
        "n_transactions": n_transactions,
    }
