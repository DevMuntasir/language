from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    redis_url: str
    transcription_stream: str = 'mirotalk:transcription:jobs'
    transcription_result_stream: str = 'mirotalk:transcription:results'
    transcription_dead_letter_stream: str = 'mirotalk:transcription:dead'
    worker_group: str = 'transcription-workers'
    worker_name: str = 'worker-1'
    max_attempts: int = 3
    whisper_base_url: str = 'https://api.openai.com/v1'
    whisper_api_key: str = ''
    whisper_model: str = 'gpt-transcribe'
    storage_backend: str = 's3'
    local_storage_path: str = '/tmp/mirotalk-ephemeral'
    s3_endpoint: str | None = None
    s3_bucket: str = ''
    s3_access_key: str = ''
    s3_secret_key: str = ''
    s3_region: str = 'us-east-1'


settings = Settings()  # type: ignore[call-arg]
