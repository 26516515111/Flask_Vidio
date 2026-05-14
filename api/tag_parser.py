"""Style and audio tag parser for MiMo TTS Director Mode."""
import re
from typing import Optional, Tuple, List


def parse_style_tags(text: str) -> Tuple[str, str]:
    """Extract style tags from LLM output."""
    match = re.match(r'^\(([^)]+)\)\s*(.*)', text, re.DOTALL)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    match = re.match(r'^<style>([^<]+)</style>\s*(.*)', text, re.DOTALL)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return "", text


def extract_audio_tags(text: str) -> List[str]:
    """Extract all audio tags from text."""
    bracket_tags = re.findall(r'\[([^\]]+)\]', text)
    paren_tags = re.findall(r'（([^）]+)）', text)
    all_tags = bracket_tags + paren_tags
    seen = set()
    unique_tags = []
    for tag in all_tags:
        if tag not in seen:
            seen.add(tag)
            unique_tags.append(tag)
    return unique_tags


def parse_director_output(llm_output: str) -> dict:
    """Parse LLM Director Mode output into structured components."""
    style_tags, clean_text = parse_style_tags(llm_output)
    audio_tags = extract_audio_tags(clean_text)
    return {
        "processed_text": clean_text,
        "style_tags": style_tags,
        "audio_tags": audio_tags,
        "raw_output": llm_output,
    }
