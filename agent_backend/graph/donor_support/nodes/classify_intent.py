"""
Node 1 — classify_intent
Uses an LLM to bucket the donor's message into one of four intents.
"""
from __future__ import annotations

import json
import logging
import re

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from db.config import settings
from models.support_schemas import SupportState, SupportIntent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a support triage assistant for a blockchain crowdfunding platform.
Classify the user's message into exactly ONE of these intents:

  refund_request    — donor wants money back
  status_inquiry    — asking about campaign progress, where funds are, timeline
  fraud_report      — reporting a suspicious/scam campaign
  general_question  — anything else (how the platform works, fees, etc.)

Respond ONLY with valid JSON, no markdown:
{
  "intent": "<one of the four strings above>",
  "confidence": <float 0.0–1.0>,
  "reasoning": "<one sentence>"
}"""


def _llm():
    primary = ChatOpenAI(
        model=settings.OPENROUTER_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=0.0,
        max_tokens=256,
        request_timeout=15.0,
        default_headers={
            "HTTP-Referer": "https://kickstart-crypto.app",
            "X-Title": "KickstartCrypto DonorSupport",
        },
    )
    fallback = ChatOpenAI(
        model="meta/llama-3.1-70b-instruct",
        openai_api_key=settings.NVIDIA_API_KEY,
        openai_api_base="https://integrate.api.nvidia.com/v1",
        temperature=0.0,
        max_tokens=256,
        request_timeout=15.0,
    )
    return primary.with_fallbacks([fallback])


async def classify_intent(state: SupportState) -> dict:
    """LangGraph node: classify the donor's message intent."""
    if state.error:
        return {}

    logger.info(f"[classify_intent] ticket={state.ticket_id}")
    try:
        response = await _llm().ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"Donor message:\n{state.message[:2000]}"),
        ])
        raw = response.content.strip()

        # Strip think tags and code fences
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw).strip()

        parsed = json.loads(raw)
        intent_str = parsed.get("intent", "general_question")
        # Validate enum
        try:
            intent = SupportIntent(intent_str)
        except ValueError:
            intent = SupportIntent.GENERAL_QUESTION

        confidence = float(parsed.get("confidence", 0.7))
        logger.info(f"[classify_intent] intent={intent} confidence={confidence:.2f}")
        return {"intent": intent, "intent_confidence": confidence}

    except Exception as exc:
        logger.error(f"[classify_intent] failed: {exc}")
        return {"intent": SupportIntent.GENERAL_QUESTION, "intent_confidence": 0.5}
