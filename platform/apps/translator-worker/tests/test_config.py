import unittest

from app.config import parse_job_metadata


class TranslationJobTests(unittest.TestCase):
    def test_accepts_consented_bengali_job(self):
        job = parse_job_metadata(
            '{"roomId":"demo","sourceParticipantIdentity":"speaker",'
            '"requesterIdentity":"listener","targetLanguage":"bn","consent":true}'
        )
        self.assertEqual(job.targetLanguage, 'bn')

    def test_rejects_job_without_consent(self):
        with self.assertRaises(ValueError):
            parse_job_metadata(
                '{"roomId":"demo","sourceParticipantIdentity":"speaker",'
                '"requesterIdentity":"listener","targetLanguage":"bn","consent":false}'
            )


if __name__ == '__main__':
    unittest.main()
