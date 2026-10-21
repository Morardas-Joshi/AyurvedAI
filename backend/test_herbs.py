import os
import tempfile
import unittest
import uuid

_test_root = tempfile.TemporaryDirectory(prefix="ayurvedai-herb-tests-")
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["CHROMA_PATH"] = os.path.join(_test_root.name, "chroma")
os.environ["RAG_DATA_DIR"] = os.path.join(_test_root.name, "empty-data")

from ayur_common import AyurHerb, AyurMedicine
from database import SessionLocal
from herb_mining import mine_rules
from herbs import (
    HerbProfile,
    HerbProfileCache,
    _hit_mentions_herb,
    _catalog_card_info,
    _owner_hash,
    _parse_profile,
    _profile_has_facts,
    _profile_terms,
    _add_exact_source_excerpts,
    _matching_source_sentence,
    related_herbs,
    _source_rows,
    _search_records,
)


class HerbModuleTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def test_profile_schema_keeps_unsourced_facts_empty(self):
        profile = _parse_profile('{"virya": null, "classical_uses": []}')
        self.assertIsNone(profile.virya)
        self.assertEqual(profile.classical_uses, [])

    def test_profile_search_uses_herb_aliases_and_exact_mentions(self):
        herb = AyurHerb(
            name_english="Aloe vera",
            botanical_name="Aloe barbadensis",
            aliases=["Kumari"],
        )
        terms = _profile_terms(herb)

        self.assertIn("Kumari", terms)
        self.assertTrue(_hit_mentions_herb(
            {"text": "Kumari (aloe vera) is mentioned in this passage."},
            terms,
        ))
        self.assertFalse(_hit_mentions_herb(
            {"text": "This passage discusses a different herbal ingredient."},
            ["herb"],
        ))

    def test_references_alone_do_not_count_as_profile_facts(self):
        profile = {
            "classical_uses": None,
            "dosha_effect": {"vata": None, "pitta": None},
            "references": [{"title": "Reference", "page": 1}],
            "origins": {},
        }

        self.assertFalse(_profile_has_facts(profile))
        self.assertTrue(_profile_has_facts({"classical_uses": ["A sourced fact"]}))

    def test_catalog_card_summary_requires_a_citation(self):
        profile = {
            "classical_uses": ["helps gas and bloating"],
            "references": [{"title": "Reference.pdf", "page": 9}],
        }

        card = _catalog_card_info("Ajwain", profile, [], self.db)
        missing_source = _catalog_card_info("Ajwain", {"classical_uses": ["unsupported"]}, [], self.db)

        self.assertEqual(card["citation"], "Reference.pdf · Page 9")
        self.assertIn("traditional use", card["summary"].casefold())
        self.assertEqual(missing_source, {})

    def test_source_excerpt_uses_only_a_sentence_that_names_the_herb(self):
        sentence = _matching_source_sentence(
            {"text": "A general introduction. Ajwain is traditionally used to help gas and bloating. Another note."},
            ["Ajwain"],
        )

        self.assertEqual(sentence, "Ajwain is traditionally used to help gas and bloating.")

    def test_catalog_herb_cards_use_an_exactly_matching_sourced_excerpt(self):
        from unittest.mock import patch

        slug = f"excerpt-herb-{uuid.uuid4().hex}"
        herb = AyurHerb(slug=slug, name_english="Ajwain", botanical_name="Trachyspermum ammi")
        self.db.add(herb)
        self.db.commit()
        entry = {"kind": "herb", "slug": slug, "name": "Ajwain"}
        hit = {
            "id": "source-chunk",
            "text": "Ajwain is traditionally used to help gas and bloating.",
            "filename": "health-topics.pdf",
            "page": 9,
            "distance": 0.2,
        }

        with patch("herbs.store.search_many_with_ids", return_value=[[hit], []]):
            _add_exact_source_excerpts([entry], self.db, "excerpt-test-user")

        self.assertEqual(entry["summary"], hit["text"])
        self.assertEqual(entry["citation"], "health-topics.pdf · Page 9")

    def test_related_herbs_ignores_reference_only_profiles(self):
        slug = f"reference-only-{uuid.uuid4().hex}"
        self.db.add(AyurHerb(slug=slug, name_english="Reference-only herb"))
        self.db.add(HerbProfileCache(
            owner_hash=_owner_hash("related-test-user"),
            herb_slug=slug,
            chunk_hash="reference-only",
            profile={"references": [{"title": "Reference", "page": 1}], "origins": {}},
            source_ids=["source-1"],
            status="draft",
        ))
        self.db.commit()

        result = related_herbs(slug, "related-test-user", 5)

        self.assertEqual(result["items"], [])
        self.assertIn("Not enough sourced profile information", result["message"])

    def test_seed_keeps_triphala_as_a_sourced_medicine(self):
        self.assertGreaterEqual(self.db.query(AyurHerb).count(), 90)
        self.assertIsNone(self.db.query(AyurHerb).filter_by(slug="triphala").first())
        triphala = self.db.query(AyurMedicine).filter_by(slug="triphala").first()
        self.assertIsNotNone(triphala)
        self.assertEqual(triphala.ingredients, ["haritaki", "bibhitaki", "amla"])
        self.assertTrue(triphala.source_ids)

    def test_seed_adds_fifteen_sourced_formulation_samples(self):
        sample_slugs = [
            "avipattikara-churna",
            "mahamanjishtadi-kwatha",
            "khadirarishta",
            "panchatikta-ghrita",
            "gandhaka-rasayana",
            "bhringaraja-taila",
            "neelibhringadi-taila",
            "mahanarayana-taila",
            "dhanvantaram-taila",
            "yogaraj-guggulu",
            "simhanada-guggulu",
            "medohara-guggulu",
            "navaka-guggulu",
            "sitopaladi-churna",
            "kanchanar-guggulu",
        ]
        samples = self.db.query(AyurMedicine).filter(AyurMedicine.slug.in_(sample_slugs)).all()

        self.assertEqual(len(samples), 15)
        self.assertTrue(all(sample.status == "draft" for sample in samples))
        self.assertTrue(all(sample.source_ids for sample in samples))
        self.assertTrue(all(not sample.ingredients for sample in samples))
        self.assertTrue(all(sample.profile.get("summary") for sample in samples))
        sources = _source_rows(self.db, samples[0].source_ids)
        self.assertTrue(sources)
        self.assertIn("Page", sources[0]["note"])

    def test_profile_schema_rejects_extra_fields_and_long_sentences(self):
        with self.assertRaises(ValueError):
            _parse_profile('{"invented_claim": "A claim"}')
        with self.assertRaises(ValueError):
            _parse_profile('{"classical_uses": ["' + "word " * 26 + '"]}')

    def test_search_matches_unicode_names(self):
        slug = f"unicode-test-{uuid.uuid4().hex}"
        self.db.add(AyurHerb(slug=slug, name_english="Ashwagandha", name_hindi="अश्वगंधा"))
        self.db.commit()

        results = _search_records(self.db, "अश्वगंधा", 5)

        self.assertTrue(any(item["slug"] == slug for item in results))

    def test_profile_cache_is_scoped_to_owner(self):
        slug = f"cache-test-{uuid.uuid4().hex}"
        for owner in ("user-one", "user-two"):
            self.db.add(HerbProfileCache(
                owner_hash=_owner_hash(owner),
                herb_slug=slug,
                chunk_hash="hash",
                profile=HerbProfile().model_dump(mode="json"),
                source_ids=[],
                status="draft",
            ))
        self.db.commit()

        first = self.db.query(HerbProfileCache).filter_by(
            owner_hash=_owner_hash("user-one"), herb_slug=slug,
        ).first()
        second = self.db.query(HerbProfileCache).filter_by(
            owner_hash=_owner_hash("user-two"), herb_slug=slug,
        ).first()

        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertNotEqual(first.owner_hash, second.owner_hash)

    def test_association_mining_requires_twenty_nonempty_formulations(self):
        key = uuid.uuid4().hex
        for index in range(19):
            self.db.add(AyurMedicine(
                slug=f"test-formula-{key}-{index}",
                name=f"Test formula {index}",
                ingredients=["haritaki", "bibhitaki"],
                status="approved",
            ))
        self.db.commit()

        too_few = mine_rules(self.db)

        self.assertEqual(too_few["status"], "not_enough_data")
        self.assertEqual(too_few["n_transactions"], 19)

        self.db.add(AyurMedicine(
            slug=f"test-formula-{key}-19",
            name="Test formula 19",
            ingredients=["haritaki", "bibhitaki"],
            status="approved",
        ))
        self.db.commit()
        enough = mine_rules(self.db)

        self.assertEqual(enough["status"], "complete")
        self.assertEqual(enough["n_transactions"], 20)
        self.assertGreater(enough["rules_created"], 0)


if __name__ == "__main__":
    unittest.main()
