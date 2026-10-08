from pydantic import BaseModel, Field


class TranscriptionJob(BaseModel):
    job_id: str
    room_id: str
    session_id: str
    object_key: str
    language: str | None = None
    mime_type: str = 'audio/webm'
    consent: bool
    attempt: int = Field(default=0, ge=0)


class TranscriptionResult(BaseModel):
    job_id: str
    room_id: str
    session_id: str
    text: str
    status: str = 'completed'
