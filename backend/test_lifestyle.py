import hashlib
import os
import tempfile
import unittest
import uuid
from datetime import date
from unittest.mock import patch

from sqlalchemy import create_engine, inspect

_test_root = tempfile.TemporaryDirectory(prefix="ayurvedai-lifestyle-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_root.name}/lifestyle.sqlite"
os.environ["CHROMA_PATH"] = os.path.join(_test_root.name, "chroma")
os.environ["RAG_DATA_DIR"] = os.path.join(_test_root.name, "empty-data")

from fastapi import HTTPException

from database import SessionLocal
from ayur_common import AyurHerb
from lifestyle import (
    FoodIncompatibility,
    FoodRule,
    LifestyleQuestion,
    LifestyleSeason,
    PlanRequest,
    RoutineItem,
    SavePlanRequest,
    _build_plan,
    _build_season_notes,
    _contains_catalog_herb,
    _explanation_sentence_allowed,
    _migrate_lifestyle_season_notes,
    _plan_events,
    _seed_general_guidance,
    _seed_structure,
    _select_plan,
    current_season,
    delete_plan,
    get_questions,
    get_season,
    list_plans,
    save_plan,
    score_prakriti,
)


class LifestyleTests(unittest.TestCase):
    def test_seed_reconciles_existing_questionnaire_to_ten_items(self):
        with SessionLocal() as db:
            db.add_all([
                LifestyleQuestion(id=question_id, text=f"Old question {question_id}", options=[], order=question_id)
                for question_id in range(11, 25)
            ])
            db.commit()

        _seed_structure()

        questions = get_questions()["questions"]
        self.assertEqual(len(questions), 10)
        self.assertEqual([question["id"] for question in questions], list(range(1, 11)))

    def test_existing_season_note_table_is_upgraded_without_losing_rows(self):
        migration_engine = create_engine(f"sqlite:///{_test_root.name}/legacy.sqlite")
        try:
            with migration_engine.begin() as connection:
                connection.exec_driver_sql(
                    "CREATE TABLE lifestyle_season_notes ("
                    "id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, "
                    "owner_hash VARCHAR(64) NOT NULL, source_hash VARCHAR(64) NOT NULL, "
                    "description TEXT NOT NULL, food_notes TEXT NOT NULL, "
                    "routine_notes TEXT NOT NULL, source_ids JSON NOT NULL)"
                )
                connection.exec_driver_sql(
                    "INSERT INTO lifestyle_season_notes "
                    "(id, season_id, owner_hash, source_hash, description, food_notes, "
                    "routine_notes, source_ids) VALUES (1, 1, 'owner', 'source', '', '', '', '[]')"
                )

            _migrate_lifestyle_season_notes(migration_engine)
            _migrate_lifestyle_season_notes(migration_engine)

            with migration_engine.connect() as connection:
                row = connection.exec_driver_sql(
                    "SELECT id, status FROM lifestyle_season_notes"
                ).one()
            self.assertEqual(row, (1, "draft"))
            self.assertIn(
                "status",
                {column["name"] for column in inspect(migration_engine).get_columns("lifestyle_season_notes")},
            )
        finally:
            migration_engine.dispose()

    def test_prakriti_weighted_scoring_is_deterministic_and_explained(self):
        questions = [
            {"id": 1, "options": [
                {"weights": {"vata": 2, "pitta": 0, "kapha": 0}},
                {"weights": {"vata": 0, "pitta": 2, "kapha": 0}},
                {"weights": {"vata": 0, "pitta": 0, "kapha": 2}},
            ]},
            {"id": 2, "options": [
                {"weights": {"vata": 2, "pitta": 0, "kapha": 0}},
                {"weights": {"vata": 0, "pitta": 2, "kapha": 0}},
                {"weights": {"vata": 0, "pitta": 0, "kapha": 2}},
            ]},
        ]
        self.assertEqual(
            score_prakriti(questions, {"1": 0, "2": 1}),
            {
                "percentages": {"vata": 50.0, "pitta": 50.0, "kapha": 0.0},
                "dominant": ["vata", "pitta"],
                "confidence": "Close split between Vata and Pitta.",
            },
        )
        with self.assertRaises(ValueError):
            score_prakriti(questions, {"1": 0})

    def test_season_boundaries_cover_each_month(self):
        expected = {
            1: "Shishira", 2: "Shishira", 3: "Vasanta", 4: "Vasanta",
            5: "Grishma", 6: "Grishma", 7: "Varsha", 8: "Varsha",
            9: "Sharad", 10: "Sharad", 11: "Hemanta", 12: "Hemanta",
        }
        with SessionLocal() as db:
            for month, name in expected.items():
                self.assertEqual(current_season(date(2026, month, 1), db=db)["name"], name)
        with self.assertRaises(ValueError):
            current_season(date(2026, 1, 1), "europe")

    def test_plan_filters_diet_and_allergies_and_removes_incompatible_pair(self):
        token = uuid.uuid4().hex
        owner_hash = hashlib.sha256(token.encode()).hexdigest()
        with SessionLocal() as db:
            db.add_all([
                FoodRule(food=f"oats-{token}", category="favour", diet_tags=["vegetarian", "vegan", "jain"], dosha_effect={"vata": 1}, source_ids=[{"title": "source"}], owner_hash=owner_hash),
                FoodRule(food=f"milk-{token}", category="favour", diet_tags=["vegetarian", "dairy"], dosha_effect={"vata": 1}, source_ids=[{"title": "source"}], owner_hash=owner_hash),
                FoodRule(food=f"peanut-{token}", category="favour", diet_tags=["vegetarian", "vegan", "jain"], dosha_effect={"vata": 1}, description="peanut", source_ids=[{"title": "source"}], owner_hash=owner_hash),
                FoodIncompatibility(food_a=f"oats-{token}", food_b=f"milk-{token}", reason="document note", source_ids=[{"title": "source"}], owner_hash=owner_hash),
                RoutineItem(slot="morning", title=f"walk-{token}", description="walk", dosha_tags=["vata"], season_tags=["Vasanta"], source_ids=[{"title": "source"}], owner_hash=owner_hash),
            ])
            db.commit()
            result = _select_plan(
                db,
                owner_hash,
                {"dominant": ["vata"]},
                "Vasanta",
                ["vegan", "jain"],
                [f"peanut-{token}"],
            )
        selected_foods = [item["food"] for item in result["favour"]]
        self.assertIn(f"oats-{token}", selected_foods)
        self.assertNotIn(f"peanut-{token}", selected_foods)
        self.assertNotIn(f"milk-{token}", [item["food"] for item in result["favour"]])
        self.assertEqual(result["incompatible_removed"], [])
        self.assertIn(f"walk-{token}", [item["title"] for item in result["routine"]])

    def test_incompatible_items_are_both_removed_if_both_otherwise_eligible(self):
        token = uuid.uuid4().hex
        owner_hash = hashlib.sha256(token.encode()).hexdigest()
        with SessionLocal() as db:
            first = f"rice-{token}"
            second = f"milk-{token}"
            db.add_all([
                FoodRule(food=first, category="favour", diet_tags=["vegetarian"], source_ids=[{"title": "book"}], owner_hash=owner_hash),
                FoodRule(food=second, category="limit", diet_tags=["vegetarian"], source_ids=[{"title": "book"}], owner_hash=owner_hash),
                FoodIncompatibility(food_a=first, food_b=second, reason="source note", source_ids=[{"title": "book"}], owner_hash=owner_hash),
            ])
            db.commit()
            plan = _select_plan(db, owner_hash, {"dominant": ["vata"]}, "Vasanta", ["vegetarian"], [])
        names = {item["food"] for item in plan["favour"] + plan["limit"]}
        self.assertNotIn(first, names)
        self.assertNotIn(second, names)
        self.assertEqual(set(plan["incompatible_removed"]), {first, second})

    def test_weight_loss_and_health_condition_paths_return_caution_without_plan(self):
        for payload in (
            PlanRequest(season="Vasanta", goal_details="I want to lose weight"),
            PlanRequest(season="Vasanta", goal_details="I need 1200 calories every day"),
            PlanRequest(season="Vasanta", goal_details="I have bulimia"),
            PlanRequest(season="Vasanta", health_context="I have diabetes"),
            PlanRequest(season="Vasanta", health_context="I am pregnant"),
            PlanRequest(season="Vasanta", health_context="I care for a 10-year-old child"),
        ):
            with self.subTest(context=payload.goal_details or payload.health_context):
                plan, safety = _build_plan(payload, "test-user")
                self.assertIsNone(plan)
                self.assertEqual(safety["level"], "warning")
                self.assertTrue(safety["messages"])
                self.assertTrue(safety["show_professional_cta"])

        plan, safety = _build_plan(
            PlanRequest(season="Vasanta", health_context="I have a child who likes gardening"),
            "test-user",
        )
        self.assertIsNotNone(plan)
        self.assertFalse(safety["block_answer"])

    def test_no_document_content_still_returns_cited_general_guidance(self):
        payload = PlanRequest(season="Vasanta", prakriti={"dominant": ["vata"]})
        with patch("lifestyle.store.search_with_ids", return_value=[]):
            plan, safety = _build_plan(payload, "user-without-sources")
        self.assertTrue(plan["favour"])
        self.assertTrue(plan["limit"])
        self.assertTrue(plan["routine"])
        self.assertIn("WHO: Healthy diet", {item["title"] for item in plan["references"]})
        self.assertIn("WHO: Physical activity", {item["title"] for item in plan["references"]})
        self.assertIn("CDC: About sleep", {item["title"] for item in plan["references"]})
        self.assertTrue(all(item["source_label"] == "Public health guidance" for item in plan["favour"]))
        self.assertTrue(all("not personalized" in item["reason"] for item in plan["favour"]))
        self.assertEqual(safety["disclaimer"], "General wellness guidance only; ask your doctor or qualified Ayurvedic practitioner about personal needs.")

    def test_general_guidance_seed_is_idempotent_and_obeys_diet_and_avoid_filters(self):
        _seed_general_guidance()
        _seed_general_guidance()

        with SessionLocal() as db:
            all_guidance = _select_plan(db, "seed-test-owner", {}, "Vasanta", [], [])
            vegan_jain_guidance = _select_plan(
                db,
                "seed-test-owner",
                {},
                "Vasanta",
                ["vegan", "jain"],
                ["lentils"],
            )
            baseline_rows = db.query(FoodRule).filter(FoodRule.owner_hash.is_(None)).all()

        self.assertTrue(all_guidance["favour"])
        self.assertTrue(all_guidance["routine"])
        self.assertFalse(any("lentils" in item["food"].casefold() for item in vegan_jain_guidance["favour"]))
        self.assertNotIn(
            "Vegetables (fresh, frozen or canned without excess sodium)",
            [item["food"] for item in vegan_jain_guidance["favour"]],
        )
        self.assertEqual(len(baseline_rows), len({(row.food, row.category) for row in baseline_rows}))
        self.assertTrue(all(row.source_ids and row.source_ids[0].get("url") for row in baseline_rows))

    def test_plan_falls_back_to_existing_source_rows_when_extraction_is_unavailable(self):
        payload = PlanRequest(season="Vasanta", prakriti={"dominant": ["vata"]})
        extraction_error = HTTPException(502, "Could not safely extract guidance.")
        with patch("lifestyle._extract_rows", side_effect=extraction_error), patch(
            "lifestyle._build_season_notes", side_effect=extraction_error
        ):
            plan, safety = _build_plan(payload, "user-without-sources")

        self.assertTrue(plan["favour"])
        self.assertTrue(plan["routine"])
        self.assertIn("source_extraction_unavailable", safety["flags"])
        self.assertIn("general public-health guidance are shown", safety["messages"][0])

    def test_plan_rows_and_explanations_cannot_add_unselected_foods(self):
        plan = {
            "favour": [{"food": "oats", "description": "oats are gentle", "reason": "selected"}],
            "limit": [],
            "routine": [],
            "references": [],
        }
        fake_stream = [
            ("fake", "Oats are gentle. Add ginger daily."),
        ]
        with patch("lifestyle.llm.stream_generate", return_value=iter(fake_stream)):
            events = "".join(_plan_events(plan, {"level": "info"}))
        self.assertIn("Oats are gentle.", events)
        self.assertNotIn("Add ginger", events)
        self.assertIn("unsupported_content_removed", events)
        self.assertFalse(_explanation_sentence_allowed("Add ginger daily.", {"oats", "are", "gentle", "selected"}))

    def test_explanation_provider_failure_keeps_structured_plan_in_stream(self):
        plan = {
            "favour": [{"food": "oats", "description": "oats", "reason": ""}],
            "limit": [],
            "routine": [],
            "references": [],
        }
        with patch(
            "lifestyle.llm.stream_generate",
            side_effect=RuntimeError("provider unavailable"),
        ):
            events = "".join(_plan_events(plan, {"level": "info"}))

        self.assertIn('"type": "meta"', events)
        self.assertIn('"food": "oats"', events)
        self.assertIn('"type": "error"', events)

    def test_catalog_herbs_are_excluded_from_food_and_routine_items(self):
        token = uuid.uuid4().hex
        owner_hash = hashlib.sha256(token.encode()).hexdigest()
        herb_name = f"TestHerb-{token}"
        with SessionLocal() as db:
            db.add(AyurHerb(slug=f"test-herb-{token}", name_english=herb_name, profile={}, status="draft"))
            db.add(FoodRule(food=herb_name, category="favour", source_ids=[{"title": "book"}], owner_hash=owner_hash))
            db.commit()
            self.assertTrue(_contains_catalog_herb(herb_name, db))
            plan = _select_plan(db, owner_hash, {"dominant": ["vata"]}, "Vasanta", [], [])
        self.assertNotIn(herb_name, [item["food"] for item in plan["favour"]])

    def test_seasonal_notes_are_document_cited_and_cached_per_user(self):
        with SessionLocal() as db:
            season = db.query(LifestyleSeason).filter_by(name="Vasanta").first()
        chunks = [{
            "id": "chunk-season-1",
            "filename": "ritucharya.pdf",
            "page": 4,
            "text": "Seasonal guidance excerpt",
        }]
        output = (
            '{"items":[{"description":"A documented seasonal note.",'
            '"food_notes":"", "routine_notes":"", "source_ids":["chunk-season-1"]}]}',
            "test-provider",
        )
        with patch("lifestyle.store.search_with_ids", return_value=chunks), patch(
            "lifestyle.llm.generate", return_value=output
        ) as generate:
            first = _build_season_notes("season-owner", season)
            second = _build_season_notes("season-owner", season)
        self.assertEqual(first["description"], "A documented seasonal note.")
        self.assertEqual(first["source_ids"][0]["title"], "ritucharya.pdf")
        self.assertEqual(first["status"], "draft")
        self.assertEqual(second["description"], first["description"])
        generate.assert_called_once()

    def test_season_endpoint_keeps_calendar_available_when_source_extraction_fails(self):
        with patch(
            "lifestyle._build_season_notes",
            side_effect=HTTPException(502, "Could not safely extract seasonal guidance from the reference documents."),
        ):
            result = get_season(on=date(2026, 3, 1), x_user_id="season-owner")

        self.assertEqual(result["name"], "Vasanta")
        self.assertEqual(
            result["note_error"],
            "Could not safely extract seasonal guidance from the reference documents.",
        )

    def test_saved_plans_are_isolated_and_delete_is_owner_scoped(self):
        suffix = uuid.uuid4().hex[:8]
        created = save_plan(
            SavePlanRequest(
                prakriti={"dominant": ["vata"]},
                season="Vasanta",
                preferences={},
                plan={"favour": []},
            ),
            f"owner-{suffix}",
        )
        own = list_plans(f"owner-{suffix}")["plans"]
        other = list_plans(f"other-{suffix}")["plans"]
        self.assertEqual([item["id"] for item in own], [created["id"]])
        self.assertNotIn(created["id"], [item["id"] for item in other])
        with self.assertRaises(HTTPException) as raised:
            delete_plan(created["id"], f"other-{suffix}")
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(delete_plan(created["id"], f"owner-{suffix}"), {"deleted": True})


if __name__ == "__main__":
    unittest.main()
