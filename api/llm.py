"""Vercel Serverless Function: LLM text processing."""
import json
import os
import httpx
from tag_parser import parse_director_output


SYSTEM_PROMPT = """你是一位专业的语音合成文案专家，擅长将用户输入的文字加工成适合TTS语音合成的优质文本。

你的任务是：
1. 润色用户输入的文字，使其更加流畅自然，适合朗读
2. 根据场景信息适当扩展内容，增加细节描写
3. 使用口语化表达，避免书面化的长句和生僻词汇
4. 在文本中插入音频标签，增强语音表现力
5. 直接输出处理后的文字，不要添加任何解释

【音频标签格式】
在需要特殊处理的位置用中文括号插入音频标签：

语速与节奏：
- （深呼吸）- 深呼吸
- （叹气）- 叹气
- （语速加快）- 加快语速
- （语速放缓）- 放慢语速
- （停顿）- 短暂停顿
- （长停顿）- 较长停顿

情绪状态：
- （紧张）- 紧张情绪
- （小声）- 压低声音
- （提高音量）- 放大音量
- （哽咽）- 哽咽
- （苦笑）- 苦笑
- （轻笑）- 轻笑

【示例】
输入：今天面试好紧张啊
输出：（深呼吸）呼……冷静，冷静。不就是一个面试吗……（语速加快，碎碎念）自我介绍已经背了五十遍了，应该没问题的。加油，你可以的……（小声）哎呀，领带歪没歪？

输入：告诉朋友好消息
输出：（兴奋）哎哎哎，你猜怎么着？（语速加快）我居然过了！真的过了！（轻笑）哈哈哈，今晚必须请客啊！

【要求】
1. 保持原文核心含义不变
2. 根据场景适当扩展内容，增加细节
3. 语言要适合口语表达，避免书面化长句
4. 输出长度控制在100-300字之间
5. 音频标签要自然融入文本，不要过度使用"""

DIRECTOR_SYSTEM_PROMPT = """你是一位专业的语音导演和TTS文案专家，擅长将剧本加工成适合语音合成的文本。

你的任务是根据导演提供的【角色】【场景】【指导】三个维度，将原始台词加工成富有表演力的语音文本。

【输出格式要求】
1. 在文本开头用括号标注整体风格标签：(风格1 风格2)加工后的台词
2. 在需要特殊处理的位置用方括号标注音频标签：[停顿]、[叹气]、[强调]等
3. 风格标签和音频标签可以同时使用

【风格标签词汇表】
- 情绪：开心、悲伤、愤怒、恐惧、惊讶、兴奋、委屈、平静、冷漠
- 复合情绪：怅然、欣慰、无奈、愧疚、释然、嫉妒、厌倦、忐忑、动情
- 语调：温柔、高冷、活泼、严肃、慵懒、俏皮、深沉、干练、凌厉
- 音色：磁性、醇厚、清亮、空灵、稚嫩、苍老、甜美、沙哑、醇雅
- 人设：夹子音、御姐音、正太音、大叔音、台湾腔
- 方言：东北话、四川话、河南话、粤语

【音频标签词汇表】
- 节奏：[停顿]、[长停顿]、[急促]、[语速加快]、[语速放缓]、[拖音]
- 情绪：[轻声]、[低语]、[叹气]、[吸气]、[哽咽]、[强调]、[笑]、[苦笑]
- 其他：[欲言又止]、[碎碎念]、[沉默片刻]

【使用原则】
1. 每句话最多1-2个音频标签，不要过度使用
2. 标签是调味品，不是主菜——自然融入文本
3. 风格标签要体现导演指导的核心特征
4. 直接输出加工后的文本，不要添加任何解释"""

SCENE_TO_STYLE_SYSTEM_PROMPT = """你是一位专业的语音风格描述专家，擅长将场景描述转换为精确的TTS语音风格指令。

你的任务是根据用户提供的场景，生成一段简洁、生动、可直接用于TTS的风格描述。

【输出格式要求】
- 输出为一段中文描述，50-100字
- 描述应包含：语调、语速、情绪、音色特点
- 使用生动的比喻和形象的描述
- 不要添加任何解释或标记

【示例】
场景：向领导汇报好消息
风格描述：用轻快上扬的语调向领导报喜，语速稍快，带着查到成绩后压抑不住的激动与小骄傲，声音明亮有活力。

场景：深夜电台主持
风格描述：低沉磁性的嗓音，语速缓慢而沉稳，像在耳边轻声细语，带着一丝疲惫却温暖的陪伴感。

场景：给小朋友讲故事
风格描述：温柔甜美的语调，语速适中偏慢，声音充满童趣和想象力，像妈妈在睡前讲故事一样温暖安心。

场景：愤怒地指责
风格描述：语调尖锐上扬，语速急促有力，带着压抑不住的怒火和失望，声音颤抖但充满力量。"""

OCR_TO_SCENE_SYSTEM_PROMPT = """你是一位专业的场景描述专家，擅长根据OCR提取的内容描述场景。

你的任务是根据OCR提取的内容，描述场景本身（风景、背景、环境、氛围等），不要描述语音语调、语速、情绪等TTS相关内容。

【输出格式要求】
- 输出为一段中文描述，50-100字
- 只描述场景内容：风景、背景、环境、物体、人物等
- 不要描述语音语调、语速、情绪、音色等
- 不要添加任何解释或标记

【示例】
OCR内容：蓝天白云，绿草如茵，远处有几座小山丘
场景描述：一片开阔的草地，天空湛蓝，白云朵朵，远处连绵的小山丘若隐若现，空气中弥漫着青草的清香。

OCR内容：咖啡馆，木质桌椅，暖色灯光
场景描述：一家温馨的咖啡馆，木质桌椅散发着淡淡的木香，暖黄色的灯光洒落，营造出舒适惬意的氛围。

OCR内容：会议室，投影仪，白板上写满了笔记
场景描述：一间宽敞的会议室，投影仪正在播放幻灯片，白板上密密麻麻写满了讨论笔记，空气中弥漫着咖啡的香气。"""


def handler(request):
    """Handle POST /api/llm requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    try:
        body = json.loads(request.body)
        action = body.get("action", "process")

        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        if action == "process":
            result = _process_text(body, api_key, base_url)
        elif action == "director":
            result = _process_director(body, api_key, base_url)
        elif action == "scene-to-style":
            result = _scene_to_style(body, api_key, base_url)
        elif action == "ocr-to-scene":
            result = _ocr_to_scene(body, api_key, base_url)
        else:
            return {"statusCode": 400, "body": json.dumps({"error": f"Unknown action: {action}"})}

        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def _call_llm(system_prompt: str, user_prompt: str, api_key: str, base_url: str) -> str:
    """Call Xiaomi LLM API."""
    url = f"{base_url}/chat/completions"

    with httpx.Client(timeout=50.0) as client:
        response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "mimo-v2.5-pro",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.7,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi LLM API error: {response.text}")

        result = response.json()
        return result["choices"][0]["message"]["content"]


def _build_process_prompt(text: str, scene: str, emotion: str = None, processing_type: str = None) -> str:
    """Build prompt for text processing."""
    if processing_type == "scene":
        return f"""请根据以下OCR提取的文字，生成一个简洁的场景描述。

OCR提取的文字：
{text}

要求：
1. 描述文字中的场景、氛围、情绪
2. 用简洁的中文描述，50-100字
3. 适合用于TTS语音合成的风格指导
4. 不要添加任何解释，直接输出场景描述"""

    prompt = f"请润色和扩展以下文字，使其适合语音合成：\n\n原始文字：{text}"
    if scene and scene != "unknown":
        prompt += f"\n\n场景信息：{scene}"
        prompt += "\n\n请根据场景信息调整文字风格和内容。"
    if emotion and emotion != "neutral":
        emotion_map = {
            "happy": "开心愉悦", "sad": "悲伤低沉", "angry": "愤怒激动",
            "excited": "兴奋激动", "neutral": "平静自然",
        }
        prompt += f"\n情绪氛围：{emotion_map.get(emotion, emotion)}"
    prompt += """

要求：
1. 保持原文核心含义不变
2. 根据场景适当扩展内容，增加细节
3. 语言要适合口语表达，避免书面化长句
4. 输出长度控制在100-300字之间
5. 不要添加任何解释说明，直接输出润色后的文字"""
    return prompt


def _process_text(body: dict, api_key: str, base_url: str) -> dict:
    """Process text with LLM."""
    text = body.get("text", "")
    scene = body.get("scene", "")
    emotion = body.get("emotion")
    processing_type = body.get("processing_type")

    prompt = _build_process_prompt(text, scene, emotion, processing_type)
    result = _call_llm(SYSTEM_PROMPT, prompt, api_key, base_url)

    detected_emotion = emotion if emotion and emotion != "neutral" else "neutral"
    return {
        "processed_text": result,
        "detected_emotion": detected_emotion,
        "processing_type": processing_type or "general",
    }


def _process_director(body: dict, api_key: str, base_url: str) -> dict:
    """Process text in director mode."""
    text = body.get("text", "")
    scene = body.get("scene", "")
    character = body.get("character", "")
    direction = body.get("direction", "")

    prompt = f"""请根据以下导演指示，将台词加工成适合语音合成的文本。

【角色】
{character}

【场景】
{scene}

【指导】
{direction}

【原始台词】
{text}

请输出加工后的台词，用括号标注风格标签，用方括号标注音频标签。"""

    raw_output = _call_llm(DIRECTOR_SYSTEM_PROMPT, prompt, api_key, base_url)
    return parse_director_output(raw_output)


def _scene_to_style(body: dict, api_key: str, base_url: str) -> dict:
    """Convert scene description to TTS style description."""
    scene = body.get("scene", "")
    prompt = f"请根据以下场景描述，生成适合TTS语音合成的风格描述：\n\n场景：{scene}"
    result = _call_llm(SCENE_TO_STYLE_SYSTEM_PROMPT, prompt, api_key, base_url)
    return {"style_description": result}


def _ocr_to_scene(body: dict, api_key: str, base_url: str) -> dict:
    """Convert OCR text to scene description."""
    ocr_text = body.get("ocr_text", "")
    prompt = f"""请根据以下OCR提取的内容，描述场景。

OCR提取的内容：
{ocr_text}

要求：
1. 只描述场景内容（风景、背景、环境、氛围等）
2. 不要描述语音语调、语速、情绪等TTS相关内容
3. 用简洁的中文描述，50-100字
4. 不要添加任何解释，直接输出场景描述"""
    result = _call_llm(OCR_TO_SCENE_SYSTEM_PROMPT, prompt, api_key, base_url)
    return {"scene_description": result}
