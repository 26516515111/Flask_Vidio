"""Vercel Serverless Function: Video content analysis."""
import ast
import json
import os
import re
import time
import httpx
from logger import logger, log_api_call
from blob_cleanup import delete_blob


VIDEO_PROMPT = """分析这个视频。返回JSON：
{
  "tags": ["标签1", "标签2"],
  "summary": "视频内容简介，50-100字",
  "characters": [{"role": "主角", "gender": "男", "age": "青年", "personality": "沉稳", "voice_hint": "低沉男声"}],
  "scene": "地点+时间+氛围",
  "emotion": "开心/悲伤/愤怒/惊讶/恐惧/厌恶/平静/激动/温柔",
  "voice_style": "配音风格建议"
}
characters列出说话者，无人物则写旁白。只返回JSON。"""


def handler(request):
    """Handle POST /api/video requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    blob_url = None
    start_time = time.time()

    try:
        body = json.loads(request.body)
        blob_url = body.get("url", "")
        duration_seconds = body.get("duration")  # optional: video duration in seconds

        # Adaptive FPS + resolution strategy:
        # Balance frame count vs per-frame quality to keep each frame recognizable.
        # At "default" resolution: per-frame capped at 300 tokens (~307K px).
        # At "max" resolution: no per-frame cap, but total context is 131,072 tokens.
        #
        # Strategy: for long videos, use fewer frames at higher quality.
        fps = 2.0
        media_resolution = "default"
        if duration_seconds and duration_seconds > 0:
            if duration_seconds < 180:          # < 3 min: standard quality
                fps = 2.0
                media_resolution = "default"
            elif duration_seconds < 600:        # 3-10 min: medium
                fps = 0.5
                media_resolution = "default"
            else:                               # > 10 min: sparse frames, high quality
                fps = 0.1
                media_resolution = "max"

        logger.info(
            f"Video analysis requested, URL: {blob_url[:80]}..., "
            f"duration={duration_seconds}s, fps={fps}, resolution={media_resolution}"
        )

        if not blob_url:
            return {"statusCode": 400, "body": json.dumps({"error": "No video URL provided"})}

        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_video_analysis(blob_url, api_key, base_url, fps, media_resolution)

        duration = (time.time() - start_time) * 1000
        log_api_call("/api/video", {"url": blob_url[:80]}, result, duration_ms=duration)
        logger.info(f"Video analysis completed in {duration:.0f}ms, tags={result.get('tags')}")

        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        duration = (time.time() - start_time) * 1000
        logger.error(f"Video analysis failed: {e}", exc_info=True)
        log_api_call("/api/video", {"url": blob_url[:80] if blob_url else "none"}, error=str(e), duration_ms=duration)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    finally:
        if blob_url:
            delete_blob(blob_url)


def _call_video_analysis(video_url: str, api_key: str, base_url: str, fps: float = 2.0, media_resolution: str = "default") -> dict:
    """Call Xiaomi MiMo V2.5 video understanding API."""
    url = f"{base_url}/chat/completions"

    with httpx.Client(timeout=300.0) as client:
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
                            "You are a multimodal assistant capable of understanding video content. "
                            "Always respond in Chinese (Simplified)."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "video_url",
                                "video_url": {"url": video_url},
                                "fps": fps,
                                "media_resolution": media_resolution,
                            },
                            {
                                "type": "text",
                                "text": VIDEO_PROMPT,
                            },
                        ]
                    }
                ],
                "max_completion_tokens": 2048,
                "temperature": 0.3,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi Video API error ({response.status_code}): {response.text}")

        result = response.json()
        content = result["choices"][0]["message"]["content"]
        logger.debug(f"Xiaomi raw response: {content[:200]}")

        return _parse_analysis_json(content)


def _parse_analysis_json(content: str) -> dict:
    """Robustly parse JSON from model response, handling various formats.

    The model may return:
      - Clean JSON: {"tags": [...], "summary": "..."}
      - Markdown-wrapped: ```json {...} ```
      - Python dict syntax: {'tags': [...], 'summary': '...'}
      - JSON embedded in text: "Here is the analysis:\n{...}"
    """
    if not content or not content.strip():
        logger.warning("Empty response from model")
        return {"tags": [], "summary": ""}

    # Step 1: Strip markdown code blocks
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    # Step 2: Try standard JSON parse
    try:
        analysis = json.loads(cleaned)
        return _extract_result(analysis)
    except (json.JSONDecodeError, ValueError):
        pass

    # Step 3: Try to find JSON object within text
    # Look for balanced { ... } at the outermost level
    match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned, re.DOTALL)
    if match:
        try:
            analysis = json.loads(match.group())
            return _extract_result(analysis)
        except (json.JSONDecodeError, ValueError):
            pass

    # Step 4: Try Python literal evaluation (handles single-quoted dicts)
    try:
        analysis = ast.literal_eval(cleaned)
        if isinstance(analysis, dict):
            return _extract_result(analysis)
    except (ValueError, SyntaxError):
        pass

    # Step 5: Also try literal_eval on the regex match
    if match:
        try:
            analysis = ast.literal_eval(match.group())
            if isinstance(analysis, dict):
                return _extract_result(analysis)
        except (ValueError, SyntaxError):
            pass

    # Fallback: return raw content as summary
    logger.warning(
        f"Failed to parse JSON from response, "
        f"returning raw content (first 100 chars): {cleaned[:100]}"
    )
    return {"tags": [], "summary": cleaned, "characters": [], "scene": "", "emotion": "", "voice_style": ""}


def _extract_result(analysis: dict) -> dict:
    """Extract tags, summary, characters, scene, emotion, voice_style from parsed dict."""
    tags = analysis.get("tags", [])
    summary = analysis.get("summary", "")
    characters = analysis.get("characters", [])
    scene = analysis.get("scene", "")
    emotion = analysis.get("emotion", "")
    voice_style = analysis.get("voice_style", "")

    # Normalize tags
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if not isinstance(tags, list):
        tags = []

    # Normalize summary
    if not isinstance(summary, str):
        summary = str(summary)

    # Normalize characters
    if not isinstance(characters, list):
        characters = []

    # Normalize scene
    if not isinstance(scene, str):
        scene = str(scene) if scene else ""

    # Normalize emotion
    if not isinstance(emotion, str):
        emotion = ""

    # Normalize voice_style
    if not isinstance(voice_style, str):
        voice_style = ""

    return {
        "tags": tags,
        "summary": summary,
        "characters": characters,
        "scene": scene,
        "emotion": emotion,
        "voice_style": voice_style,
    }
