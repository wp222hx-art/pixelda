import os
import json
import yaml
import logging
from openai import OpenAI

from defs import (
    PIXEL_ART_PROMPT_SYSTEM,
    PIXEL_ART_PROMPT_USER,
    ANIMATION_PROMPT_SYSTEM,
    ANIMATION_PROMPT_USER,
    PromptGenerationRequest,
    AnimationPromptRequest,
)

logger = logging.getLogger(__name__)

_client = None
_model = "gpt-5"


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client

    # Read from ~/.genspark_llm.yaml
    config_path = os.path.join(os.path.expanduser("~"), ".genspark_llm.yaml")
    api_key = None
    base_url = None

    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            config = yaml.safe_load(f)
            if config and "openai" in config:
                api_key = config["openai"].get("api_key")
                base_url = config["openai"].get("base_url")

    # Fallback to env vars
    if not api_key:
        api_key = os.getenv("OPENAI_API_KEY")
    if not base_url:
        base_url = os.getenv("OPENAI_BASE_URL")

    if not api_key:
        raise ValueError("No OpenAI API key found in config or environment")

    _client = OpenAI(api_key=api_key, base_url=base_url)
    logger.info(f"OpenAI client initialized with base_url: {base_url}")
    return _client


def builtin_gen_prompt(request: PromptGenerationRequest) -> str:
    logger.info("Generating pixel art prompt via built-in OpenAI-compatible API")

    client = _get_client()

    user_content = PIXEL_ART_PROMPT_USER.format(
        idea=request.idea.strip() if request.idea else "surprise me with something creative and unexpected",
    )

    response = client.chat.completions.create(
        model=_model,
        messages=[
            {"role": "system", "content": PIXEL_ART_PROMPT_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        temperature=1.2,
        response_format={"type": "json_object"},
    )

    result = json.loads(response.choices[0].message.content)
    prompt = result.get("prompt", "")
    if not prompt:
        raise ValueError("AI returned empty prompt")

    logger.info(f"Built-in prompt generated: {prompt[:100]}...")
    return prompt


def builtin_gen_animation_prompt(request: AnimationPromptRequest) -> str:
    logger.info("Generating animation prompt via built-in OpenAI-compatible API")

    client = _get_client()

    user_content = ANIMATION_PROMPT_USER.format(
        image_url=request.image_url or "(no image URL provided)",
        motion_hint=request.motion_hint.strip() if request.motion_hint else "choose the most impressive action",
    )

    response = client.chat.completions.create(
        model=_model,
        messages=[
            {"role": "system", "content": ANIMATION_PROMPT_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        temperature=1.0,
        response_format={"type": "json_object"},
    )

    result = json.loads(response.choices[0].message.content)
    prompt = result.get("prompt", "")
    if not prompt:
        raise ValueError("AI returned empty animation prompt")

    logger.info(f"Built-in animation prompt generated: {prompt[:100]}...")
    return prompt
