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
from herbs import HerbProfile, HerbProfileCache, _owner_hash, _parse_profile, _search_records


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

    def test_seed_keeps_triphala_as_a_sourced_medicine(self):
        self.assertGreaterEqual(self.db.query(AyurHerb).count(), 90)
        self.assertIsNone(self.db.query(AyurHerb).filter_by(slug="triphala").first())
        triphala = self.db.query(AyurMedicine).filter_by(slug="triphala").first()
        self.assertIsNotNone(triphala)
        self.assertEqual(triphala.ingredients, ["haritaki", "bibhitaki", "amla"])
        self.assertTrue(triphala.source_ids)

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
