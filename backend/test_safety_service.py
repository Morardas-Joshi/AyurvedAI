import unittest

from safety_service import assess, check_answer


class SafetyAssessmentTests(unittest.TestCase):
    def test_emergency_is_blocked(self):
        result = assess("I have chest pain", "chat")

        self.assertEqual(result.level, "emergency")
        self.assertTrue(result.block_answer)
        self.assertIn("emergency", result.flags)

    def test_special_group_gets_warning_without_blocking(self):
        result = assess("Can I use this herb while pregnant?", "chat")

        self.assertEqual(result.level, "warning")
        self.assertIn("pregnancy", result.flags)
        self.assertFalse(result.block_answer)

    def test_personal_dose_request_is_blocked(self):
        result = assess("What dose of ashwagandha should I take?", "chat")

        self.assertIn("unsafe_ask", result.flags)
        self.assertTrue(result.block_answer)

    def test_bhasma_question_gets_caution_without_blocking_education(self):
        result = assess("What is bhasma?", "chat")

        self.assertIn("bhasma", result.flags)
        self.assertFalse(result.block_answer)

    def test_answer_filter_removes_dose_sentence_and_keeps_safe_content(self):
        result = check_answer("Ashwagandha is traditionally used for wellness. Take 500 mg daily.")

        self.assertEqual(result.level, "warning")
        self.assertIn("dose_pattern", result.flags)
        self.assertEqual(result.sanitized_text, "Ashwagandha is traditionally used for wellness.")

    def test_answer_filter_removes_guarantee(self):
        result = check_answer("This herb cures insomnia. Ask a clinician for personal advice.")

        self.assertIn("overclaim", result.flags)
        self.assertEqual(result.sanitized_text, "Ask a clinician for personal advice.")

    def test_answer_filter_keeps_negated_safety_claim(self):
        text = "This herb is not a guaranteed cure. Ask a clinician for personal advice."

        result = check_answer(text)

        self.assertEqual(result.level, "info")
        self.assertEqual(result.sanitized_text, text)


if __name__ == "__main__":
    unittest.main()
