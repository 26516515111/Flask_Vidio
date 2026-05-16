"""Vercel Serverless Function: OCR image text extraction."""
import json
import os
import base64
import httpx
from logger import logger, get_header


def handler(request):
    """Handle POST /api/ocr requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    try:
        content_type = get_header(request.headers, "content-type")
        logger.info(f"OCR request, content-type: {content_type[:50]}")
        if "multipart/form-data" not in content_type:
            return {"statusCode": 400, "body": json.dumps({"error": "Expected multipart/form-data"})}

        # Parse multipart form data
        body = request.body
        if isinstance(body, str):
            body = body.encode()

        # Extract file from multipart data
        boundary = content_type.split("boundary=")[1].strip()
        parts = body.split(f"--{boundary}".encode())

        file_data = None
        for part in parts:
            if b"Content-Disposition" in part and b'name="file"' in part:
                # Split headers and body
                header_end = part.find(b"\r\n\r\n")
                if header_end != -1:
                    file_data = part[header_end + 4:]
                    # Remove trailing \r\n
                    if file_data.endswith(b"\r\n"):
                        file_data = file_data[:-2]

        if not file_data:
            return {"statusCode": 400, "body": json.dumps({"error": "No file uploaded"})}

        # Call Xiaomi OCR API
        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_xiaomi_ocr(file_data, api_key, base_url)
        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        logger.error(f"OCR failed: {e}", exc_info=True)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def _call_xiaomi_ocr(image_data: bytes, api_key: str, base_url: str) -> dict:
    """Call Xiaomi MiMo V2.5 multimodal OCR API."""
    url = f"{base_url}/chat/completions"
    image_base64 = base64.b64encode(image_data).decode()

    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "mimo-v2.5",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": '请提取图片中的文字，并描述图片场景。返回格式：{"text": "提取的文字", "scene": "场景描述", "confidence": 0.95}'
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}"
                                }
                            }
                        ]
                    }
                ],
                "temperature": 0.3,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi OCR API error: {response.text}")

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        try:
            ocr_result = json.loads(content)
            return {
                "text": ocr_result.get("text", ""),
                "scene": ocr_result.get("scene", "unknown"),
                "confidence": ocr_result.get("confidence", 0.9),
            }
        except json.JSONDecodeError:
            return {
                "text": content,
                "scene": "unknown",
                "confidence": 0.9,
            }
