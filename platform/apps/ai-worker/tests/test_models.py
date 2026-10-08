import unittest

from app.models import TranscriptionJob


class TranscriptionJobTests(unittest.TestCase):
    def test_requires_explicit_consent_field(self) -> None:
        job = TranscriptionJob(
            job_id='job-1',
            room_id='room-1',
            session_id='session-1',
            object_key='room-1/audio.webm',
            consent=True,
        )
        self.assertTrue(job.consent)

    def test_rejects_negative_attempt(self) -> None:
        with self.assertRaises(ValueError):
            TranscriptionJob(
                job_id='job-1',
                room_id='room-1',
                session_id='session-1',
                object_key='room-1/audio.webm',
                consent=True,
                attempt=-1,
            )


if __name__ == '__main__':
    unittest.main()
