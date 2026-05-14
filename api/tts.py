"""Vercel Serverless Function: TTS speech synthesis."""
import json
import os
import base64
import httpx


def handler(request):
    """Handle POST /api/tts requests."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    try:
        body = json.loads(request.body)
        text = body.get("text", "")
        voice = body.get("voice", "mimo_default")
        emotion = body.get("emotion", "neutral")
        style_tags = body.get("style_tags")
        scene = body.get("scene")
        character = body.get("character")
        direction = body.get("direction")
        custom_voice_type = body.get("custom_voice_type")
        custom_voice_data = body.get("custom_voice_data")

        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_xiaomi_tts(
            text, voice, emotion, api_key, base_url,
            style_tags, scene, character, direction,
            custom_voice_type, custom_voice_data,
        )
        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def _call_xiaomi_tts(
    text: str, voice: str, emotion: str, api_key: str, base_url: str,
    style_tags: str = None, scene: str = None, character: str = None,
    direction: str = None, custom_voice_type: str = None, custom_voice_data: str = None,
) -> dict:
    """Call Xiaomi MiMo TTS API and return base64 audio."""
    url = f"{base_url}/chat/completions"

    # Determine model and voice
    has_custom_voice = custom_voice_type is not None and custom_voice_data is not None

    if has_custom_voice:
        if custom_voice_type == "voiceclone":
            model = "mimo-v2.5-tts-voiceclone"
            voice_for_audio = f"data:audio/mpeg;base64,{custom_voice_data}"
        else:
            model = "mimo-v2.5-tts-voicedesign"
            voice_for_audio = None
    else:
        model = "mimo-v2.5-tts"
        voice_map = {
            "default": "mimo_default", "mimo_default": "mimo_default",
            "default_zh": "default_zh", "default_en": "default_en",
            "冰糖": "冰糖", "茉莉": "茉莉", "苏打": "苏打", "白桦": "白桦",
            "Mia": "Mia", "Chloe": "Chloe", "Milo": "Milo", "Dean": "Dean",
        }
        voice_for_audio = voice_map.get(voice, "mimo_default")

    # Build user message
    user_content = ""
    if character:
        user_content = character
        if has_custom_voice and custom_voice_type == "voicedesign":
            user_content = f"{custom_voice_data}\n\n{character}"
    else:
        parts = []
        if has_custom_voice and custom_voice_type == "voicedesign":
            parts.append(custom_voice_data)
        if scene:
            parts.append(f"Scene: {scene}. Adjust tone and style accordingly.")
        elif emotion and emotion != "neutral":
            emotion_descriptions = {
                "happy": "Bright, cheerful, upbeat tone. Fast pace, rising pitch.",
                "sad": "Soft, melancholic tone. Slow pace, low pitch.",
                "angry": "Intense, forceful tone. Sharp delivery.",
                "excited": "Energetic, enthusiastic tone. Fast pace.",
                "neutral": "Calm, natural tone. Moderate pace.",
            }
            parts.append(emotion_descriptions.get(emotion, ""))
        user_content = "\n\n".join(parts)

    # Build assistant message
    assistant_content = text
    if style_tags:
        assistant_content = f"({style_tags}){text}"
    elif emotion and emotion != "neutral" and not has_custom_voice:
        assistant_content = f"({emotion}){text}"

    messages = [
        {"role": "user", "content": user_content},
        {"role": "assistant", "content": assistant_content}
    ]

    # Build audio config
    audio_config = {"format": "wav"}
    if voice_for_audio is not None:
        audio_config["voice"] = voice_for_audio

    # Call API
    with httpx.Client(timeout=180.0) as client:
        response = client.post(
            url,
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "audio": audio_config,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi TTS API error: {response.text}")

        result = response.json()

        # Parse audio data
        audio_data = None
        if "choices" in result and len(result["choices"]) > 0:
            message = result["choices"][0].get("message", {})
            audio_info = message.get("audio", {})
            audio_data = audio_info.get("data")

        if not audio_data:
            raise Exception("TTS返回无音频数据")

        # Return base64 data URL instead of saving to file
        audio_format = "wav"
        data_url = f"data:audio/{audio_format};base64,{audio_data}"

        return {
            "audio_url": data_url,
            "duration": 0,
            "format": audio_format,
        }
