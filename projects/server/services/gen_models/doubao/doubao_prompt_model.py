import logging
from typing import Dict, Any, cast
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.chat import ParsedChatCompletion

from defs import (
    DEFAULT_DOUBAO_CHAT_MODEL,
    DEFAULT_TEXT_ENGINE_MAX_TOKENS,
    PIXEL_ART_PROMPT_SYSTEM,
    PIXEL_ART_PROMPT_USER,
    PromptGenerationRequest,
    TempPromptResponse,
)

logger = logging.getLogger(__name__)


def doubao_gen_prompt(request: PromptGenerationRequest) -> str:
    logger.info(f"Generating pixel art prompt via Doubao chat")

    client = Ark(
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key=request.api_key,
    )

    params = {
        "model": DEFAULT_DOUBAO_CHAT_MODEL,
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
        "response_format": TempPromptResponse,
    }

    response = client.beta.chat.completions.parse(**params)

    if isinstance(response, ParsedChatCompletion):
        result = cast(TempPromptResponse, response.choices[0].message.parsed)
        return result.prompt
    else:
        raise TypeError("Response is not compatible with ChatCompletion")
