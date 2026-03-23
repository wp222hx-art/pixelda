import os
from attr import dataclass
from pydantic import BaseModel
from typing import Optional, List


DEFAULT_IMAGE_SIZE = "1024*1024"
DEFAULT_VIDEO_RESOLUTION = "480P"
DEFAULT_TONGYI_IMAGE_MODEL = "wan2.5-t2i-preview"
DEFAULT_TONGYI_EDIT_IMAGE_MODEL = "wanx2.1-imageedit"
DEFAULT_TONGYI_EDIT_FUNCTION = "description_edit"
DEFAULT_TONGYI_VIDEO_MODEL = "wan2.5-i2v-preview"
DEFAULT_DOUBAO_IMAGE_MODEL = "doubao-seedream-4-0-250828"
DEFAULT_DOUBAO_VIDEO_MODEL = "doubao-seedance-1-0-pro-250528"

DEFAULT_TEXT_ENGINE_MAX_TOKENS = 2048
DEFAULT_TONGYI_CHAT_MODEL = "qwen-plus"
DEFAULT_DOUBAO_CHAT_MODEL = "doubao-seed-1-6-251015"


class LazyPrompt:
    def __init__(self, file_path):
        self.file_path = file_path
        self._prompt = None

    def __str__(self):
        if self._prompt is None:
            with open(self.file_path, "r", encoding="utf-8") as f:
                instruction = f.read()
                self._prompt = f"You are a helpful assistant. You can generate creative and original music based on the input requirements given to you, and response strictly with ABC format. Use below instruction for ABC format:\n\n{instruction}"
        return self._prompt


MUSIC_SYSTEM_PROMPT = LazyPrompt(
    os.path.join(os.path.dirname(__file__), "assets", "abc_notation.md")
).__str__()

PIXEL_ART_PROMPT_SYSTEM = """You are a world-class pixel art game asset designer with boundless imagination. Given a worldview or theme hint (or nothing at all), you independently create a complete, vivid pixel-art character or scene.

You decide EVERYTHING creatively on your own:
- What character, creature, or object to depict
- Their appearance, outfit, equipment, pose, expression
- The art style nuances and color palette
- Any storytelling details that make the asset feel alive

You MUST respond with a JSON object containing exactly two keys:
- "prompt": a single detailed English prompt for generating a pixel art game asset image
- "comments": a brief note about the creative choices you made

Your prompt should follow this structure:
"A high-resolution 2D pixel-art game asset depicting [detailed character/creature/object], [appearance and outfit], [pose and expression], [pixel-art style: sharp edges, vibrant colors, crisp pixel details, clean outlines, limited palette, cluster-conscious shading], against a solid dark gray background."

Rules:
- Be wildly creative and surprising. Never repeat the same concept twice.
- If the user provides a worldview hint, use it as inspiration but go far beyond it.
- If no hint is given, pick a random fascinating theme and create something memorable.
- Always produce pixel-art style keywords. Always use a solid dark gray background.
- The prompt must be a SINGLE paragraph, 80-150 words, in English."""

PIXEL_ART_PROMPT_USER = """Create a pixel art game asset prompt.

Worldview / theme hint: {idea}

If the hint is empty or says "surprise me", pick something original and unexpected.
Use the hint only as loose inspiration — you decide the character, style, mood, and all details.
Return a JSON object with keys: prompt, comments."""


class TempPromptResponse(BaseModel):
    prompt: str
    comments: str


MUSIC_GEN_PROMPT = """
Generate ABC notation of a piano song with ABC format, following below requirements, and double check the format correctness with documentation:
duration: around {duration} seconds.
genre: {genre}.
tempo: {tempo}.
description: {description}.
return json object with keys:
- notation(pure ABC notation)
- comments(any comments)
"""


class TempChatResponse(BaseModel):
    notation: str
    comments: str


class ImageGenerationRequest(BaseModel):
    api_key: Optional[str] = None
    prompt: str
    negative_prompt: str = ""
    seed: int = -1
    size: str = DEFAULT_IMAGE_SIZE
    task_id: Optional[str] = None
    model_type: str = "tongyi"


class ImageEditRequest(ImageGenerationRequest):
    image_url: Optional[str] = None


class VideoGenerationRequest(BaseModel):
    api_key: Optional[str] = None
    base_image_url: str
    prompt: str
    negative_prompt: str = ""
    resolution: str = DEFAULT_VIDEO_RESOLUTION
    task_id: Optional[str] = None
    model_type: str = "tongyi"


class MusicGenerationRequest(BaseModel):
    api_key: Optional[str] = None
    prompt: str
    seed: int = -1
    duration: int = 30
    genre: str = "pop"
    tempo: str = "medium"
    task_id: Optional[str] = None
    model_type: str = "tongyi"


class FrameSplitRequest(BaseModel):
    task_id: str
    video_url: str
    from_time: float = 0.0
    to_time: float = 10.0
    count: int = 10


class ZipFramesRequest(BaseModel):
    name: str
    frame_urls: List[str]
    removebg: bool = False
    output_type: str = "zip"


class FrameSplitResponse(BaseModel):
    frames: List[str]
    task_id: str
    error_info: Optional[str] = None


class MusicResponse(BaseModel):
    original: str
    chiptune: str
    task_id: str
    error_info: Optional[str] = None


class PromptGenerationRequest(BaseModel):
    api_key: Optional[str] = None
    idea: str = ""
    model_type: str = "tongyi"


class AnimationPromptRequest(BaseModel):
    image_url: str = ""
    motion_hint: str = ""
    model_type: str = "tongyi"


class PromptGenerationResponse(BaseModel):
    prompt: str
    error_info: Optional[str] = None


ANIMATION_PROMPT_SYSTEM = """You are an expert pixel-art animation director. Given a base image URL and an optional motion hint, you create a vivid, specific animation prompt that brings the pixel-art character or scene to life.

You MUST respond with a JSON object containing exactly two keys:
- "prompt": a concise English prompt describing the animation motion (30-60 words)
- "comments": a brief note about the creative choices you made

The prompt should describe:
- The specific motion/action the character performs
- Key animation details (movement arcs, timing feel, secondary motions like hair/cape flowing)
- Pixel-art animation style keywords (sprite animation, frame-by-frame, sub-pixel motion, limited palette animation)

Rules:
- Focus ONLY on motion and animation, not the character's appearance (the image already defines that).
- Be specific about the motion: "swings a glowing sword in a wide overhead arc" not just "attacks".
- If a motion hint is given, design the best possible animation around it.
- If no hint is given, pick the most visually impressive and characteristic action for the character.
- Always include "pixel-art game sprite animation" style keywords.
- Keep it to a SINGLE short paragraph."""

ANIMATION_PROMPT_USER = """Design a pixel-art animation prompt for a character/scene.

Image URL (the base sprite): {image_url}
Motion hint from user: {motion_hint}

If the motion hint is empty, choose the most visually striking and characteristic action.
Return a JSON object with keys: prompt, comments."""


class GenerationResponse(BaseModel):
    url: str
    original_content: Optional[str] = None
    task_id: Optional[str] = None
    error_info: Optional[str] = None
