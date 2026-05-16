"""Vercel Serverless Function: Video content analysis."""
import ast
import json
import os
import re
import time
from typing import Optional

import httpx
from logger import logger, log_api_call
from blob_cleanup import delete_blob


VIDEO_PROMPT = """分析这个视频的视觉和音频内容。必须返回严格的JSON格式，不要添加任何其他文字、解释或markdown标记。

返回格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "视频内容简介，50-100字",
  "characters": [{"role": "主角", "gender": "男", "age": "青年", "personality": "沉稳", "voice_hint": "低沉男声"}],
  "scene": "地点+时间+氛围",
  "emotion": "开心/悲伤/愤怒/惊讶/恐惧/厌恶/平静/激动/温柔",
  "voice_style": "配音风格建议",
  "audio": {
    "detected": true,
    "music": {
      "detected": true,
      "genre": "流行/摇滚/古典/电子/民谣/说唱等",
      "tempo": "快/中/慢",
      "instruments": ["钢琴", "吉他", "鼓"],
      "mood": "欢快/忧伤/紧张/平静/激昂"
    },
    "dialogue": {
      "detected": true,
      "speakers": ["说话人1", "说话人2"],
      "language": "中文/英文/混合",
      "content_summary": "对话内容摘要"
    },
    "layers": [
      {
        "type": "music|dialogue|background|sfx",
        "description": "该音频层的描述",
        "start_time": 0.0,
        "end_time": 10.0
      }
    ]
  },
  "visual": {
    "style": "电影/动画/纪录片/短视频/广告等",
    "color_tone": "暖色调/冷色调/高饱和/低饱和/黑白",
    "camera_movement": "固定/平移/推拉/跟拍/手持",
    "lighting": "自然光/人工光/逆光/侧光/顶光",
    "composition": "中心构图/三分法/对称/引导线"
  },
  "scenes": [
    {
      "description": "场景描述",
      "start_time": 0.0,
      "end_time": 10.0,
      "mood": "场景情绪"
    }
  ]
}

要求：
1. tags 是你根据视频内容自动生成的分类标签，至少1个标签
2. summary 是视频内容的简洁描述，必须填写
3. characters 列出视频中的角色，无人物则写旁白
4. scene 描述视频发生的场景
5. emotion 是视频传达的主要情绪
6. voice_style 是适合该视频的配音风格建议
7. audio 描述视频中的音频信息，包括音乐、对话和音频分层
8. visual 描述视频的视觉风格特征
9. scenes 列出视频中的不同场景片段
10. 只返回JSON，不要其他内容"""


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
    """Call Xiaomi MiMo V2.5 video understanding API.

    Passes the Vercel Blob public URL directly.  The blob is uploaded with
    the correct Content-Type and file extension (see blob_upload.py /
    blobApi.ts), so MiMo can recognize it as video.

    Timeout is split: 30s connect, 180s read (video processing can be slow).
    """
    api_url = f"{base_url}/chat/completions"
    logger.info(
        f"Calling MiMo video API with URL, fps={fps}, resolution={media_resolution}"
    )

    with httpx.Client(
        timeout=httpx.Timeout(connect=30.0, read=180.0, write=60.0, pool=10.0)
    ) as client:
        response = client.post(
            api_url,
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
                "max_completion_tokens": 4096,
                "temperature": 0.3,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi Video API error ({response.status_code}): {response.text}")

        result = response.json()
        logger.debug(f"Xiaomi raw response: {result}")

        # Check if response has valid content
        choices = result.get("choices", [])
        if not choices:
            logger.warning("No choices in API response")
            return {"tags": [], "summary": "", "characters": [], "scene": "", "emotion": "", "voice_style": "", "audio": {"detected": False, "music": {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}, "dialogue": {"detected": False, "speakers": [], "language": "", "content_summary": ""}, "layers": []}, "visual": {"style": "", "color_tone": "", "camera_movement": "", "lighting": "", "composition": ""}, "scenes": []}

        content = choices[0].get("message", {}).get("content", "")
        if not content:
            logger.warning("Empty content in API response")
            return {"tags": [], "summary": "", "characters": [], "scene": "", "emotion": "", "voice_style": "", "audio": {"detected": False, "music": {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}, "dialogue": {"detected": False, "speakers": [], "language": "", "content_summary": ""}, "layers": []}, "visual": {"style": "", "color_tone": "", "camera_movement": "", "lighting": "", "composition": ""}, "scenes": []}

        logger.debug(f"Xiaomi content: {content[:200]}")
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
        return {"tags": [], "summary": "", "characters": [], "scene": "", "emotion": "", "voice_style": "", "audio": {"detected": False, "music": {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}, "dialogue": {"detected": False, "speakers": [], "language": "", "content_summary": ""}, "layers": []}, "visual": {"style": "", "color_tone": "", "camera_movement": "", "lighting": "", "composition": ""}, "scenes": []}

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
    return {"tags": [], "summary": cleaned, "characters": [], "scene": "", "emotion": "", "voice_style": "", "audio": {"detected": False, "music": {"detected": False, "genre": "", "tempo": "", "instruments": [], "mood": ""}, "dialogue": {"detected": False, "speakers": [], "language": "", "content_summary": ""}, "layers": []}, "visual": {"style": "", "color_tone": "", "camera_movement": "", "lighting": "", "composition": ""}, "scenes": []}


def _extract_result(analysis: dict) -> dict:
    """Extract all fields from parsed analysis dict with normalization."""
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
        "audio": _extract_audio_info(analysis.get("audio")),
        "visual": _extract_visual_info(analysis.get("visual")),
        "scenes": _extract_scenes(analysis.get("scenes")),
    }


def _extract_audio_info(audio: Optional[dict]) -> dict:
    """Extract and normalize audio info from parsed dict."""
    default = {
        "detected": False,
        "music": _extract_music_info(None),
        "dialogue": _extract_dialogue_info(None),
        "layers": [],
    }
    if not isinstance(audio, dict):
        return default

    detected = audio.get("detected", False)
    if not isinstance(detected, bool):
        detected = bool(detected) if detected is not None else False

    return {
        "detected": detected,
        "music": _extract_music_info(audio.get("music")),
        "dialogue": _extract_dialogue_info(audio.get("dialogue")),
        "layers": _extract_layers(audio.get("layers")),
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


def _extract_visual_info(visual: Optional[dict]) -> dict:
    """Extract and normalize visual info from parsed dict."""
    default = {
        "style": "",
        "color_tone": "",
        "camera_movement": "",
        "lighting": "",
        "composition": "",
    }
    if not isinstance(visual, dict):
        return default

    style = visual.get("style", "")
    if not isinstance(style, str):
        style = str(style) if style else ""

    color_tone = visual.get("color_tone", "")
    if not isinstance(color_tone, str):
        color_tone = str(color_tone) if color_tone else ""

    camera_movement = visual.get("camera_movement", "")
    if not isinstance(camera_movement, str):
        camera_movement = str(camera_movement) if camera_movement else ""

    lighting = visual.get("lighting", "")
    if not isinstance(lighting, str):
        lighting = str(lighting) if lighting else ""

    composition = visual.get("composition", "")
    if not isinstance(composition, str):
        composition = str(composition) if composition else ""

    return {
        "style": style,
        "color_tone": color_tone,
        "camera_movement": camera_movement,
        "lighting": lighting,
        "composition": composition,
    }


def _extract_scenes(scenes: Optional[list]) -> list:
    """Extract and normalize scene segments from parsed list."""
    if not isinstance(scenes, list):
        return []

    result = []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue

        description = scene.get("description", "")
        if not isinstance(description, str):
            description = str(description) if description else ""

        start_time = scene.get("start_time", 0.0)
        if not isinstance(start_time, (int, float)):
            try:
                start_time = float(start_time)
            except (ValueError, TypeError):
                start_time = 0.0

        end_time = scene.get("end_time", 0.0)
        if not isinstance(end_time, (int, float)):
            try:
                end_time = float(end_time)
            except (ValueError, TypeError):
                end_time = 0.0

        mood = scene.get("mood", "")
        if not isinstance(mood, str):
            mood = str(mood) if mood else ""

        result.append({
            "description": description,
            "start_time": start_time,
            "end_time": end_time,
            "mood": mood,
        })

    return result
