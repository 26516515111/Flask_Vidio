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
        body = json.loads(request.body)
        image_url = body.get("url", "")

        if not image_url:
            return {"statusCode": 400, "body": json.dumps({"error": "No image URL provided"})}

        logger.info(f"OCR request, URL: {image_url[:80]}...")

        # Call Xiaomi OCR API
        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_xiaomi_ocr(image_url, api_key, base_url)
        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        logger.error(f"OCR failed: {e}", exc_info=True)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def _call_xiaomi_ocr(image_url: str, api_key: str, base_url: str) -> dict:
    """Call Xiaomi MiMo V2.5 multimodal OCR API with image URL."""
    url = f"{base_url}/chat/completions"

    # Use longer timeout for large images (up to 120 seconds)
    with httpx.Client(timeout=120.0) as client:
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
                                "text": '请提取图片中的文字，并描述图片场景。必须返回严格的JSON格式，不要添加任何其他文字：{"text": "提取的文字", "scene": "场景描述", "confidence": 0.95}'
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_url
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
        logger.debug(f"Xiaomi raw response: {result}")

        # Check if response has valid content
        choices = result.get("choices", [])
        if not choices:
            logger.warning("No choices in API response")
            return {"text": "", "scene": "unknown", "confidence": 0.0}

        content = choices[0].get("message", {}).get("content", "")
        if not content:
            logger.warning("Empty content in API response")
            return {"text": "", "scene": "unknown", "confidence": 0.0}

        logger.debug(f"Xiaomi content: {content[:200]}")

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
