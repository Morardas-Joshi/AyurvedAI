import json
import os
import tempfile
import unittest
import uuid
from unittest.mock import patch

from numpy import float32

_test_root = tempfile.TemporaryDirectory(prefix="ayurvedai-compare-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_root.name}/compare.sqlite"
os.environ["CHROMA_PATH"] = os.path.join(_test_root.name, "chroma")
os.environ["RAG_DATA_DIR"] = os.path.join(_test_root.name, "empty-data")

from fastapi import HTTPException
from pydantic import ValidationError

from ayur_common import AyurHerb, AyurMedicine, AyurSource
from compare import (
    CompareRequest,
    _build_rows,
    _comparison,
    _normalise,
    _references,
    _resolve_one,
    _similarity,
    _summary_allowed,
)
from database import SessionLocal


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.key = uuid.uuid4().hex[:10]
        self.herbs = [
            AyurHerb(
                slug=f"compare-herb-{self.key}-{index}",
                name_english=f"Compare Herb {self.key} {index}",
                aliases=[f"comparealias{self.key}{index}"],
                profile={},
                status="draft",
            )
            for index in range(4)
        ]
        self.ambiguous_herb = AyurHerb(
            slug=f"compare-herb-duplicate-{self.key}",
            name_english=f"Duplicate Compare Herb {self.key}",
            aliases=[f"comparealias{self.key}0"],
            profile={},
            status="draft",
        )
        self.herbs.append(self.ambiguous_herb)
        self.db.add_all(self.herbs)
        self.medicine = AyurMedicine(
            slug=f"compare-medicine-{self.key}",
            name=f"Compare Medicine {self.key}",
            status="draft",
            ingredients=["test-herb"],
            form="powder",
        )
        self.db.add(self.medicine)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def test_request_accepts_two_to_four_items_and_rejects_other_counts(self):
        for count in (2, 3, 4):
            with self.subTest(count=count):
                self.assertEqual(len(CompareRequest(kind="herb", items=["x"] * count).items), count)
        for count in (1, 5):
            with self.subTest(count=count), self.assertRaises(ValidationError):
                CompareRequest(kind="herb", items=["x"] * count)

    def test_row_builder_marks_agreement_differences_and_normalises_synonyms(self):
        items = [
            {"name": "Ashwagandha", "profile": {"virya": "ushna", "rasa": ["bitter"]}},
            {"name": "Ashwagandha", "profile": {"virya": "hot", "rasa": ["sweet"]}},
        ]
        rows = _build_rows(items)
        by_label = {row["label"]: row for row in rows}

        self.assertTrue(by_label["Name"]["same"])
        self.assertTrue(by_label["Virya"]["same"])
        self.assertFalse(by_label["Rasa"]["same"])
        self.assertEqual(_normalise("Ushna"), _normalise("hot"))

    def test_unknown_name_returns_suggestions(self):
        result = _resolve_one(self.db, f"comparealias{self.key}0", "herb")

        self.assertEqual(result["unresolved"], f"comparealias{self.key}0")
        self.assertGreaterEqual(len(result["suggestions"]), 2)
        self.assertLessEqual(len(result["suggestions"]), 3)
        unknown = _resolve_one(self.db, f"entirely-unknown-{self.key}", "herb")
        self.assertEqual(unknown["unresolved"], f"entirely-unknown-{self.key}")
        self.assertLessEqual(len(unknown["suggestions"]), 3)

    def test_mixed_kind_is_blocked(self):
        with self.assertRaises(HTTPException) as raised:
            _resolve_one(self.db, self.medicine.slug, "herb")
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("cannot be mixed", raised.exception.detail)

    def test_similarity_is_symmetric_bounded_and_identical_profiles_score_one(self):
        items = [
            {"profile": {"rasa": ["sweet"], "guna": ["light"]}},
            {"profile": {"rasa": ["sweet"], "guna": ["light"]}},
            {"profile": {"rasa": ["bitter"], "guna": ["heavy"]}},
        ]
        vectors = [[1.0, 0.0], [1.0, 0.0], [0.0, 1.0]]
        with patch("compare.store.embed_texts", return_value=vectors):
            matrix, components = _similarity(items)

        self.assertEqual(matrix[0][1], 1.0)
        self.assertEqual(matrix[0][2], matrix[2][0])
        self.assertTrue(all(0 <= value <= 1 for row in matrix for value in row))
        self.assertEqual(components[0][2]["embedding"], components[2][0]["embedding"])

    def test_similarity_scores_are_json_serializable_for_float32_embeddings(self):
        items = [
            {"profile": {"rasa": ["sweet"]}},
            {"profile": {"rasa": ["bitter"]}},
        ]
        with patch(
            "compare.store.embed_texts",
            return_value=[[float32(0.25), float32(0.75)], [float32(0.5), float32(0.5)]],
        ):
            matrix, components = _similarity(items)

        json.dumps({"similarity": matrix, "similarity_components": components})

    def test_missing_profiles_are_returned_as_not_stated(self):
        payload = CompareRequest(
            kind="herb",
            items=[self.herbs[0].slug, self.herbs[1].slug],
        )
        empty_profile = {
            "profile": {
                "rasa": None, "guna": None, "virya": None, "vipaka": None, "prabhava": None,
                "dosha_effect": None, "parts_used": None, "classical_uses": None, "forms": None,
                "precautions": None, "contraindications": None, "interactions": None,
                "references": [], "origins": {},
            },
            "status": "draft",
            "source_ids": [],
            "message": "Not stated in your documents.",
        }
        with (
            patch("compare.build_profile", return_value=empty_profile),
            patch(
                "compare.store.embed_texts",
                return_value=[
                    [float32(1.0), float32(0.0)],
                    [float32(1.0), float32(0.0)],
                ],
            ),
        ):
            result = _comparison(payload, f"user-{self.key}")

        json.dumps(result)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["items"][0]["profile_note"], "Not stated in your documents.")
        self.assertEqual(result["similarity"][0][1], 1.0)

    def test_references_are_scoped_to_items_and_source_lookup_is_preserved(self):
        source = AyurSource(title="Reference source", kind="book", document_id=f"doc-{self.key}")
        self.db.add(source)
        self.db.commit()

        items = [
            {"name": "Herb A", "source_ids": [source.id], "profile": {"references": []}},
            {"name": "Herb B", "source_ids": [source.id], "profile": {"references": []}},
        ]
        references = _references(items)

        self.assertEqual({reference["item"] for reference in references}, {"Herb A", "Herb B"})
        self.assertEqual({reference["title"] for reference in references}, {"Reference source"})

    def test_summary_drops_personal_recommendations_and_safety_filters_doses(self):
        self.assertEqual(_summary_allowed("You should take Ashwagandha."), "")
        self.assertEqual(_summary_allowed("Take 500 mg daily."), "")
        self.assertIn("Both profiles list", _summary_allowed("Both profiles list different forms."))


if __name__ == "__main__":
    unittest.main()
