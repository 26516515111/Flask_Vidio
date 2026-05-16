"""Vercel Blob cleanup helper - delete blobs to free Hobby storage."""
import os
import httpx
from urllib.parse import urlparse
from logger import logger

# Vercel Blob management API base
BLOB_API = "https://blob.vercel-storage.com"


def delete_blob(blob_url: str) -> None:
    """Delete a Vercel Blob file by URL.

    Uses the Vercel Blob management API (POST /delete) because the public
    blob URL does not accept DELETE requests.

    Called by video.py and audio.py in try/finally to ensure
    cleanup regardless of analysis success or failure.
    """
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
    if not token:
        logger.warning("BLOB_READ_WRITE_TOKEN not set, skipping blob cleanup")
        return

    # Extract store ID from blob URL hostname
    # URL format: https://<store-id>.public.blob.vercel-storage.com/<path>
    parsed = urlparse(blob_url)
    hostname = parsed.hostname or ""
    store_id = hostname.split(".")[0] if hostname else ""

    try:
        resp = httpx.post(
            f"{BLOB_API}/delete",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "x-store-id": store_id,
            },
            json={"urls": [blob_url]},
            timeout=10.0,
        )
        if resp.status_code not in (200, 204):
            logger.error(
                f"Blob cleanup failed: {resp.status_code} {resp.text[:200]} "
                f"for {blob_url[:80]}..."
            )
        else:
            logger.info(f"Blob cleaned up: {blob_url[:80]}...")
    except Exception as e:
        logger.error(f"Blob cleanup exception for {blob_url[:80]}...: {e}")
