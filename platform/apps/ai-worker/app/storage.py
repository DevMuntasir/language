import asyncio
from io import BytesIO
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from .config import settings


class EphemeralStorage:
    def __init__(self) -> None:
        self._local_root = Path(settings.local_storage_path).resolve()
        self._client = None
        if settings.storage_backend == 's3':
            if not settings.s3_bucket or not settings.s3_access_key or not settings.s3_secret_key:
                raise ValueError('S3 storage requires S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY')
            self._client = boto3.client(
                's3',
                endpoint_url=settings.s3_endpoint,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                region_name=settings.s3_region,
            )
        elif settings.storage_backend != 'filesystem':
            raise ValueError("STORAGE_BACKEND must be 's3' or 'filesystem'")

    async def ensure_bucket(self) -> None:
        if settings.storage_backend == 'filesystem':
            await asyncio.to_thread(self._local_root.mkdir, parents=True, exist_ok=True)
            return

        def _ensure() -> None:
            assert self._client is not None
            try:
                self._client.head_bucket(Bucket=settings.s3_bucket)
            except ClientError as error:
                status = int(error.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 0))
                code = str(error.response.get('Error', {}).get('Code', ''))
                if status not in (403, 404) and code not in ('NoSuchBucket', '404'):
                    raise
                self._client.create_bucket(Bucket=settings.s3_bucket)

            self._client.put_bucket_lifecycle_configuration(
                Bucket=settings.s3_bucket,
                LifecycleConfiguration={
                    'Rules': [
                        {
                            'ID': 'expire-ephemeral-uploads',
                            'Status': 'Enabled',
                            'Filter': {'Prefix': ''},
                            'Expiration': {'Days': 1},
                            'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1},
                        }
                    ]
                },
            )

        await asyncio.to_thread(_ensure)

    async def download(self, key: str) -> bytes:
        if settings.storage_backend == 'filesystem':
            path = self._safe_local_path(key)
            return await asyncio.to_thread(path.read_bytes)

        def _download() -> bytes:
            assert self._client is not None
            buffer = BytesIO()
            self._client.download_fileobj(settings.s3_bucket, key, buffer)
            return buffer.getvalue()

        return await asyncio.to_thread(_download)

    async def delete(self, key: str) -> None:
        if settings.storage_backend == 'filesystem':
            path = self._safe_local_path(key)
            try:
                await asyncio.to_thread(path.unlink)
            except FileNotFoundError:
                pass
            return
        assert self._client is not None
        await asyncio.to_thread(self._client.delete_object, Bucket=settings.s3_bucket, Key=key)

    def _safe_local_path(self, key: str) -> Path:
        candidate = (self._local_root / key).resolve()
        if candidate != self._local_root and self._local_root not in candidate.parents:
            raise ValueError('Object key escapes the ephemeral storage root')
        return candidate
