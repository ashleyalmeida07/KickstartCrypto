"""
Shared LLM helpers for the Milestone Proof Verification flow.

The OpenRouter free tier serves a mix of models, and the reasoning ones wrap
their answers in <think> tags or markdown fences. Both LLM nodes in this flow
need the same defensive unwrapping, so it lives here rather than being
duplicated the way Flow 1 does it inline.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from langchain_openai import ChatOpenAI

from db.config import settings

logger = logging.getLogger(__name__)


def build_llm(*, vision: bool = False, max_tokens: int = 700) -> ChatOpenAI:
    """
    Build an OpenRouter-backed chat model.

    vision=True selects OPENROUTER_VISION_MODEL, which must accept image_url
    content blocks — used by parse_proof to OCR receipts and photos.
    """
    return ChatOpenAI(
        model=settings.OPENROUTER_VISION_MODEL if vision else settings.OPENROUTER_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=0.0,
        max_tokens=max_tokens,
        default_headers={
            "HTTP-Referer": "https://kickstart-crypto.app",
            "X-Title": "KickstartCrypto Milestone Proof Verification",
        },
    )


def extract_json(raw: str, expect_key: Optional[str] = None) -> dict[str, Any]:
    """
    Pull a JSON object out of an LLM response.

    Strips <think> blocks and markdown fences, then falls back to locating a
    balanced object containing expect_key if the model wrapped it in prose.
    Raises json.JSONDecodeError if nothing parseable is found — callers decide
    what a parse failure should mean for their score.
    """
    text = (raw or "").strip()

    # Reasoning models emit their scratchpad first
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Prose-wrapped: scan for the first balanced {...} that contains expect_key
    for match in _iter_json_objects(text):
        if expect_key and expect_key not in match:
            continue
        try:
            return json.loads(match)
        except json.JSONDecodeError:
            continue

    raise json.JSONDecodeError("No parseable JSON object in LLM response", text or "", 0)


def _iter_json_objects(text: str):
    """Yield every balanced brace-delimited substring, outermost first."""
    starts: list[int] = []
    for i, ch in enumerate(text):
        if ch == "{":
            starts.append(i)
        elif ch == "}" and starts:
            start = starts.pop()
            if not starts:                 # closed an outermost object
                yield text[start : i + 1]


def clamp01(value: Any, default: float = 0.5) -> float:
    """Coerce an LLM-supplied score into 0.0–1.0, falling back on garbage."""
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default
