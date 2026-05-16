"""Vercel Serverless Function: Audio content analysis."""
import ast
import json
import os
import re
import time
from typing import Optional

import httpx
from logger import logger, log_api_call
from blob_cleanup import delete_blob


AUDIO_PROMPT = """请分析这个音频的内容。必须返回严格的JSON格式，不要添加任何其他文字、解释或markdown标记。

返回格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "音频内容简介，50-100字",
  "scene": "场景描述（地点+时间+氛围）",
  "emotion": "主要情绪（开心/悲伤/愤怒/惊讶/恐惧/厌恶/平静/激动/温柔）",
  "voice_style": "配音风格建议",
  "music": {
    "detected": true,
    "genre": "流行/摇滚/古典/电子/民谣/说唱等",
    "tempo": "快/中/慢",
    "instruments": ["钢琴", "吉他", "鼓"],
    "mood": "欢快/忧伤/紧张/平静/激昂"
  },
  "layers": [
    {
      "type": "music|dialogue|background|sfx",
      "description": "该音频层的描述",
      "start_time": 0.0,
      "end_time": 10.0
    }
  ],
  "dialogue": {
    "detected": true,
    "speakers": ["说话人1", "说话人2"],
    "language": "中文/英文/混合",
    "content_summary": "对话内容摘要"
  }
}

要求：
1. tags 是你根据音频内容自动生成的分类标签，如：音乐、台词、背景音、音效、对话、旁白、环境音等，至少1个标签
2. summary 是音频内容的简洁描述，必须填写
3. scene 描述音频发生的场景
4. emotion 是音频传达的主要情绪
5. voice_style 是适合该音频的配音风格建议
6. music 描述音乐信息，无音乐则 detected 为 false
7. layers 列出音频中识别到的各个层次（音乐、对话、背景音、音效等）
8. dialogue 描述对话信息，无对话则 detected 为 false
9. 只返回JSON，不要其他内容"""


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
                "max_completion_tokens": 2048,
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
        return {"tags": [], "summary": "", "scene": "", "emotion": "", "voice_style": "", "music": {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}, "layers": [], "dialogue": {"detected": False, "speakers": [], "language": "", "content_summary": ""}}

    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        analysis = json.loads(cleaned)
        return _extract_result(analysis)
    except (json.JSONDecodeError, ValueError):
        pass

    match = re.search(r'\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}', cleaned, re.DOTALL)
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
    return {"tags": [], "summary": cleaned, "scene": "", "emotion": "", "voice_style": "", "music": {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}, "layers": [], "dialogue": {"detected": False, "speakers": [], "language": "", "content_summary": ""}}


def _extract_result(analysis: dict) -> dict:
    """Extract all fields from parsed analysis dict with normalization."""
    tags = analysis.get("tags", [])
    summary = analysis.get("summary", "")
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
        "scene": scene,
        "emotion": emotion,
        "voice_style": voice_style,
        "music": _extract_music_info(analysis.get("music")),
        "layers": _extract_layers(analysis.get("layers")),
        "dialogue": _extract_dialogue_info(analysis.get("dialogue")),
    }


def _extract_music_info(music: Optional[dict]) -> dict:
    """Extract and normalize music info from parsed dict."""
    default = {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}
    if not isinstance(music, dict):
        return default

    detected = music.get("detected", False)
    if not isinstance(detected, bool):
        detected = bool(detected) if detected is not None else False

    genre = music.get("genre", "")
    if not isinstance(genre, str):
        genre = str(genre) if genre else ""

    tempo = music.get("tempo", "")
    if not isinstance(tempo, str):
        tempo = str(tempo) if tempo else ""

    instruments = music.get("instruments", [])
    if isinstance(instruments, str):
        instruments = [i.strip() for i in instruments.split(",") if i.strip()]
    if not isinstance(instruments, list):
        instruments = []

    mood = music.get("mood", "")
    if not isinstance(mood, str):
        mood = str(mood) if mood else ""

    return {
        "detected": detected,
        "genre": genre,
        "tempo": tempo,
        "instruments": instruments,
        "mood": mood,
    }


def _extract_layers(layers: Optional[list]) -> list:
    """Extract and normalize audio layers from parsed list."""
    if not isinstance(layers, list):
        return []

    result = []
    valid_types = {"music", "dialogue", "background", "sfx"}
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        layer_type = layer.get("type", "")
        if not isinstance(layer_type, str):
            layer_type = str(layer_type) if layer_type else ""
        if layer_type and layer_type not in valid_types:
            layer_type = ""

        description = layer.get("description", "")
        if not isinstance(description, str):
            description = str(description) if description else ""

        start_time = layer.get("start_time", 0.0)
        if not isinstance(start_time, (int, float)):
            try:
                start_time = float(start_time)
            except (ValueError, TypeError):
                start_time = 0.0

        end_time = layer.get("end_time", 0.0)
        if not isinstance(end_time, (int, float)):
            try:
                end_time = float(end_time)
            except (ValueError, TypeError):
                end_time = 0.0

        result.append({
            "type": layer_type,
            "description": description,
            "start_time": start_time,
            "end_time": end_time,
        })

    return result


def _extract_dialogue_info(dialogue: Optional[dict]) -> dict:
    """Extract and normalize dialogue info from parsed dict."""
    default = {"detected": False, "speakers": [], "language": "", "content_summary": ""}
    if not isinstance(dialogue, dict):
        return default

    detected = dialogue.get("detected", False)
    if not isinstance(detected, bool):
        detected = bool(detected) if detected is not None else False

    speakers = dialogue.get("speakers", [])
    if isinstance(speakers, str):
        speakers = [s.strip() for s in speakers.split(",") if s.strip()]
    if not isinstance(speakers, list):
        speakers = []

    language = dialogue.get("language", "")
    if not isinstance(language, str):
        language = str(language) if language else ""

    content_summary = dialogue.get("content_summary", "")
    if not isinstance(content_summary, str):
        content_summary = str(content_summary) if content_summary else ""

    return {
        "detected": detected,
        "speakers": speakers,
        "language": language,
        "content_summary": content_summary,
    }
