"""Vercel Serverless Function: Audio content analysis."""
import ast
import json
import os
import re
import time
import httpx
from logger import logger, log_api_call
from blob_cleanup import delete_blob


AUDIO_PROMPT = """请分析这个音频的内容。返回JSON格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "音频内容简介，50-100字"
}

要求：
1. tags 是你根据音频内容自动生成的分类标签，如：音乐、台词、背景音、音效、对话、旁白、环境音等
2. summary 是音频内容的简洁描述
3. 只返回JSON，不要其他内容"""


def handler(request):
    """Handle POST /api/audio requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    blob_url = None
    start_time = time.time()

    try:
        body = json.loads(request.body)
        blob_url = body.get("url", "")
        logger.info(f"Audio analysis requested, URL: {blob_url[:80]}...")

        if not blob_url:
            return {"statusCode": 400, "body": json.dumps({"error": "No audio URL provided"})}

        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_audio_analysis(blob_url, api_key, base_url)

        duration = (time.time() - start_time) * 1000
        log_api_call("/api/audio", {"url": blob_url[:80]}, result, duration_ms=duration)
        logger.info(f"Audio analysis completed in {duration:.0f}ms, tags={result.get('tags')}")

        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        duration = (time.time() - start_time) * 1000
        logger.error(f"Audio analysis failed: {e}", exc_info=True)
        log_api_call("/api/audio", {"url": blob_url[:80] if blob_url else "none"}, error=str(e), duration_ms=duration)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    finally:
        if blob_url:
            delete_blob(blob_url)


def _call_audio_analysis(audio_url: str, api_key: str, base_url: str) -> dict:
    """Call Xiaomi MiMo V2.5 audio understanding API."""
    url = f"{base_url}/chat/completions"

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            url,
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": "mimo-v2.5",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are MiMo, an AI assistant developed by Xiaomi. "
                            "You are a multimodal assistant capable of understanding audio content. "
                            "Always respond in Chinese (Simplified)."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {"data": audio_url},
                            },
                            {
                                "type": "text",
                                "text": AUDIO_PROMPT,
                            },
                        ]
                    }
                ],
                "max_completion_tokens": 1024,
                "temperature": 0.3,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi Audio API error ({response.status_code}): {response.text}")

        result = response.json()
        content = result["choices"][0]["message"]["content"]
        logger.debug(f"Xiaomi raw response: {content[:200]}")

        return _parse_analysis_json(content)


def _parse_analysis_json(content: str) -> dict:
    """Robustly parse JSON from model response, handling various formats."""
    if not content or not content.strip():
        logger.warning("Empty response from model")
        return {"tags": [], "summary": ""}

    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        analysis = json.loads(cleaned)
        return _extract_result(analysis)
    except (json.JSONDecodeError, ValueError):
        pass

    match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned, re.DOTALL)
    if match:
        try:
            analysis = json.loads(match.group())
            return _extract_result(analysis)
        except (json.JSONDecodeError, ValueError):
            pass

    try:
        analysis = ast.literal_eval(cleaned)
        if isinstance(analysis, dict):
            return _extract_result(analysis)
    except (ValueError, SyntaxError):
        pass

    if match:
        try:
            analysis = ast.literal_eval(match.group())
            if isinstance(analysis, dict):
                return _extract_result(analysis)
        except (ValueError, SyntaxError):
            pass

    logger.warning(
        f"Failed to parse JSON from response, "
        f"returning raw content (first 100 chars): {cleaned[:100]}"
    )
    return {"tags": [], "summary": cleaned}


def _extract_result(analysis: dict) -> dict:
    """Extract tags and summary from parsed analysis dict."""
    tags = analysis.get("tags", [])
    summary = analysis.get("summary", "")

    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if not isinstance(tags, list):
        tags = []

    if not isinstance(summary, str):
        summary = str(summary)

    return {"tags": tags, "summary": summary}
