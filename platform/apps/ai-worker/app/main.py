import asyncio
import json
import logging
import signal

from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import ResponseError

from .config import settings
from .models import TranscriptionJob, TranscriptionResult
from .storage import EphemeralStorage
from .transcribe import transcribe

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('mirotalk.ai-worker')
stopping = asyncio.Event()


async def ensure_group(redis: Redis) -> None:
    try:
        await redis.xgroup_create(settings.transcription_stream, settings.worker_group, id='0', mkstream=True)
    except ResponseError as error:
        if 'BUSYGROUP' not in str(error):
            raise


async def process(redis: Redis, storage: EphemeralStorage, message_id: str, fields: dict[bytes, bytes]) -> None:
    raw = fields.get(b'job')
    object_key: str | None = None
    try:
        if raw is None:
            raise ValueError('Missing job payload')
        job = TranscriptionJob.model_validate_json(raw)
        object_key = job.object_key
        if not job.consent:
            raise ValueError('Transcription requires explicit room consent')
        audio = await storage.download(job.object_key)
        text = await transcribe(audio, job.mime_type, job.language)
        result = TranscriptionResult(
            job_id=job.job_id,
            room_id=job.room_id,
            session_id=job.session_id,
            text=text,
        )
        await redis.xadd(settings.transcription_result_stream, {'result': result.model_dump_json()}, maxlen=100_000)
        await redis.xack(settings.transcription_stream, settings.worker_group, message_id)
        await storage.delete(job.object_key)
        log.info('transcription completed job_id=%s room_id=%s', job.job_id, job.room_id)
    except (ValidationError, ValueError) as error:
        await dead_letter(redis, message_id, raw, str(error))
        if object_key:
            await storage.delete(object_key)
    except Exception as error:  # bounded retry is encoded as a replacement stream item
        attempt = 0
        payload: dict[str, object] = {}
        if raw:
            try:
                payload = json.loads(raw)
                attempt = int(payload.get('attempt', 0)) + 1
            except (ValueError, TypeError, json.JSONDecodeError):
                pass
        if attempt < settings.max_attempts and payload:
            payload['attempt'] = attempt
            await asyncio.sleep(min(2 ** attempt, 30))
            await redis.xadd(settings.transcription_stream, {'job': json.dumps(payload)}, maxlen=100_000)
            await redis.xack(settings.transcription_stream, settings.worker_group, message_id)
            log.warning('transcription retry scheduled attempt=%s error=%s', attempt, error)
        else:
            await dead_letter(redis, message_id, raw, str(error))
            if object_key:
                await storage.delete(object_key)


async def dead_letter(redis: Redis, message_id: str, raw: bytes | None, error: str) -> None:
    await redis.xadd(
        settings.transcription_dead_letter_stream,
        {'job': raw or b'', 'error': error[:1000]},
        maxlen=10_000,
    )
    await redis.xack(settings.transcription_stream, settings.worker_group, message_id)
    log.error('transcription dead-lettered message_id=%s error=%s', message_id, error)


async def run() -> None:
    redis = Redis.from_url(settings.redis_url, decode_responses=False)
    storage = EphemeralStorage()
    await storage.ensure_bucket()
    await ensure_group(redis)
    while not stopping.is_set():
        messages = await redis.xreadgroup(
            settings.worker_group,
            settings.worker_name,
            {settings.transcription_stream: '>'},
            count=1,
            block=5000,
        )
        for _, entries in messages:
            for message_id, fields in entries:
                await process(redis, storage, message_id.decode() if isinstance(message_id, bytes) else message_id, fields)
    await redis.aclose()


def stop() -> None:
    stopping.set()


if __name__ == '__main__':
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop)
    loop.run_until_complete(run())
