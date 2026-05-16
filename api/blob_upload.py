"""Vercel Serverless Function: Upload file to Vercel Blob server-side."""
import json
import os
import httpx
from logger import logger, get_header


def handler(request):
    """Handle POST /api/blob-upload requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    try:
        content_type = get_header(request.headers, "content-type")
        logger.info(f"Blob upload requested, content-type: {content_type}")

        if "multipart/form-data" not in content_type:
            return {"statusCode": 400, "body": json.dumps({"error": "Expected multipart/form-data"})}

        body = request.body
        if isinstance(body, str):
            body = body.encode()

        boundary = content_type.split("boundary=")[1].strip()
        boundary_bytes = f"--{boundary}".encode()
        parts = body.split(boundary_bytes)

        file_data = None
        file_name = "upload.bin"

        for part in parts:
            if b"Content-Disposition" in part and b'name="file"' in part:
                header_end = part.find(b"\r\n\r\n")
                if header_end == -1:
                    continue
                headers_part = part[:header_end].decode("utf-8", errors="replace")
                if 'filename="' in headers_part:
                    file_name = headers_part.split('filename="')[1].split('"')[0]
                file_data = part[header_end + 4:]
                if file_data.endswith(b"\r\n"):
                    file_data = file_data[:-2]
                elif file_data.endswith(b"\r"):
                    file_data = file_data[:-1]
                break

        if not file_data:
            logger.error(f"No file found in {len(parts)} parts")
            return {"statusCode": 400, "body": json.dumps({"error": "No file uploaded"})}

        logger.info(f"File parsed: {file_name}, size={len(file_data)} bytes")

        token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
        if not token:
            return {"statusCode": 500, "body": json.dumps({"error": "BLOB_READ_WRITE_TOKEN not configured"})}

        blob_url = _upload_to_blob(file_name, file_data, token)
        logger.info(f"Blob uploaded OK: {blob_url}")

        return {"statusCode": 200, "body": json.dumps({"url": blob_url, "ok": True})}

    except Exception as e:
        logger.error(f"Blob upload failed: {e}", exc_info=True)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def _upload_to_blob(filename: str, data: bytes, token: str) -> str:
    """Upload file to Vercel Blob and return public URL."""
    import uuid
    safe_name = f"{uuid.uuid4().hex[:8]}-{filename}"

    with httpx.Client(timeout=120.0) as client:
        response = client.put(
            f"https://blob.vercel-storage.com/{safe_name}",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
            },
            content=data,
        )

        if response.status_code not in (200, 201):
            raise Exception(f"Vercel Blob returned {response.status_code}: {response.text[:300]}")

        result = response.json()
        return result.get("url", "")
