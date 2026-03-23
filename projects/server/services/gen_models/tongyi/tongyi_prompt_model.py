import logging
import json
import dashscope
from dashscope.api_entities.dashscope_response import (
    GenerationResponse as DashScopeGenerationResponse,
)
from typing import Dict, Any

from defs import (
    DEFAULT_TONGYI_CHAT_MODEL,
    DEFAULT_TEXT_ENGINE_MAX_TOKENS,
    PIXEL_ART_PROMPT_SYSTEM,
    PIXEL_ART_PROMPT_USER,
    PromptGenerationRequest,
    TempPromptResponse,
)

logger = logging.getLogger(__name__)


def tongyi_gen_prompt(request: PromptGenerationRequest) -> str:
    logger.info(f"Generating pixel art prompt via Tongyi chat")

    params = {
        "api_key": request.api_key,
        "model": DEFAULT_TONGYI_CHAT_MODEL,
        "max_tokens": DEFAULT_TEXT_ENGINE_MAX_TOKENS,
        "temperature": 1.5,
        "messages": [
            {"role": "system", "content": PIXEL_ART_PROMPT_SYSTEM},
            {
                "role": "user",
                "content": PIXEL_ART_PROMPT_USER.format(
                    idea=request.idea or "surprise me with something creative",
                    character_type=request.character_type or "any",
                    style=request.style or "any",
                    mood=request.mood or "any",
                ),
            },
        ],
        "response_format": {"type": "json_object"},
    }

    response = dashscope.Generation.call(**params)

    if isinstance(response, DashScopeGenerationResponse):
        result = TempPromptResponse(**json.loads(response.output.text))
        return result.prompt
    else:
        raise TypeError("Response is not compatible with generation response")
