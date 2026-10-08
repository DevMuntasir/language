import json
from dataclasses import dataclass


@dataclass(frozen=True)
class TranslationJob:
    roomId: str
    sourceParticipantIdentity: str
    requesterIdentity: str
    targetLanguage: str
    consent: bool


def parse_job_metadata(raw: str) -> TranslationJob:
    data = json.loads(raw)
    expected = {'roomId', 'sourceParticipantIdentity', 'requesterIdentity', 'targetLanguage', 'consent'}
    if not isinstance(data, dict) or set(data) != expected:
        raise ValueError('Invalid translation job fields')
    for key, maximum in (('roomId', 80), ('sourceParticipantIdentity', 128), ('requesterIdentity', 128)):
        value = data[key]
        if not isinstance(value, str) or not value or len(value) > maximum:
            raise ValueError(f'Invalid {key}')
    if data['targetLanguage'] != 'bn':
        raise ValueError('Only Bengali agent output is supported')
    if data['consent'] is not True:
        raise ValueError('Explicit translation consent is required')
    return TranslationJob(**data)


__all__ = ['TranslationJob', 'parse_job_metadata']
