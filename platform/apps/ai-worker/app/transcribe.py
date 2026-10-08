import httpx

from .config import settings


async def transcribe(audio: bytes, mime_type: str, language: str | None) -> str:
    headers = {'Authorization': f'Bearer {settings.whisper_api_key}'} if settings.whisper_api_key else {}
    data = {'model': settings.whisper_model, 'response_format': 'json'}
    if language:
        data['language'] = language
    extension = {
        'audio/mp4': 'mp4',
        'audio/wav': 'wav',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
    }.get(mime_type, 'webm')
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        response = await client.post(
            f"{settings.whisper_base_url.rstrip('/')}/audio/transcriptions",
            headers=headers,
            data=data,
            files={'file': (f'audio.{extension}', audio, mime_type)},
        )
        response.raise_for_status()
        body = response.json()
        return str(body.get('text', '')).strip()
