"""
Node 3 — content_authenticity_check
An LLM node using OpenRouter (OpenAI-compatible) to review the campaign
description for red flags: copy-paste from known scams, unrealistic promises,
goal/description mismatch, or incoherent text.

Returns content_score: float 0–1 (1.0 = authentic), content_flags: list[str]
"""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from db.config import settings
from models.schemas import VettingState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior fraud analyst for a blockchain crowdfunding platform.
Your job is to review campaign submissions and identify red flags that indicate fraud, plagiarism, or scam behaviour.

Evaluate the campaign on these criteria:
1. REALISTIC_PROMISES — Does the campaign make realistic claims? Flag if it promises guaranteed returns, "10x your donation", etc.
2. DESCRIPTION_COHERENCE — Is the description well-written and internally consistent? Flag vague, contradictory, or AI-generated filler text with no real substance.
3. GOAL_DESCRIPTION_MATCH — Does the funding goal (in ETH) make sense given what the campaign is asking for? A $50,000 project asking for 0.001 ETH is suspicious; a simple blog asking for 1000 ETH is too.
4. PLAGIARISM_SIGNALS — Does the text appear copy-pasted, templated, or extremely generic in a way that suggests the creator did not write it themselves?
5. URGENCY_PRESSURE — Does the campaign use high-pressure language designed to stop people from thinking critically ("limited time", "only today", etc.)?

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "content_score": <float 0.0 to 1.0, where 1.0 = completely authentic>,
  "flags": [<list of short flag strings, empty if none>],
  "reasoning": "<1-2 sentence summary>"
}"""


def _build_llm() -> ChatOpenAI:
    """Build an OpenRouter-backed LLM client."""
    return ChatOpenAI(
        model=settings.OPENROUTER_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=0.0,
        max_tokens=512,
        default_headers={
            "HTTP-Referer": "https://kickstart-crypto.app",
            "X-Title": "KickstartCrypto Campaign Vetting",
        },
    )


async def content_authenticity_check(state: VettingState) -> dict:
    """
    LangGraph node: LLM-powered content authenticity check.
    """
    if state.error:
        return {}

    title       = state.title or "Untitled"
    description = state.description or "(no description provided)"
    goal_wei    = state.goal_wei or "0"
    category    = state.category or "Other"

    # Convert wei to ETH for the prompt (rough, 18 decimals)
    try:
        goal_eth = float(goal_wei) / 1e18
    except (ValueError, TypeError):
        goal_eth = 0.0

    logger.info(f"[content_check] Analysing: '{title}' goal={goal_eth:.4f} ETH")

    human_prompt = f"""Campaign Title: {title}
Category: {category}
Funding Goal: {goal_eth:.4f} ETH
Description:
{description[:3000]}"""

    import asyncio
    try:
        llm = _build_llm()
        
        # Primary call (OpenRouter) with timeout
        try:
            response = await asyncio.wait_for(
                llm.ainvoke([
                    SystemMessage(content=SYSTEM_PROMPT),
                    HumanMessage(content=human_prompt),
                ]),
                timeout=12.0
            )
            raw = response.content.strip()
        except Exception as e:
            logger.warning(f"[content_check] Primary LLM failed or timed out ({e}). Falling back to NVIDIA.")
            
            # Fallback (NVIDIA Native API)
            from openai import AsyncOpenAI
            if not settings.NVIDIA_API_KEY or settings.NVIDIA_API_KEY == "nvapi--":
                logger.error("NVIDIA_API_KEY is not set correctly in .env for fallback.")
                raise e
                
            client = AsyncOpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY
            )
            completion = await client.chat.completions.create(
                model="nvidia/nemotron-3-ultra-550b-a55b",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": human_prompt}
                ],
                temperature=0.0,
                top_p=0.95,
                max_tokens=512,
            )
            raw = completion.choices[0].message.content.strip()

        # ── Strip <think>...</think> tags (some reasoning models output these) ──
        import re
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()

        # ── Strip markdown code fences (```json ... ``` or ``` ... ```) ─────────
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
        raw = re.sub(r'\s*```$', '', raw)
        raw = raw.strip()

        # ── Try to find JSON object in the response if it's wrapped in prose ────
        json_match = re.search(r'\{[^{}]*"content_score"[^{}]*\}', raw, re.DOTALL)
        if json_match:
            raw = json_match.group(0)

        parsed: dict[str, Any] = json.loads(raw)

        content_score = float(parsed.get("content_score", 0.5))
        content_score = max(0.0, min(1.0, content_score))
        flags: list[str] = parsed.get("flags", [])

        logger.info(f"[content_check] score={content_score:.2f} flags={flags}")

        return {
            "content_score": content_score,
            "content_flags": flags,
        }

    except json.JSONDecodeError:
        # Last-resort: try to extract a score from the raw text via regex
        logger.warning(f"[content_check] JSON parse failed, attempting regex extraction. Raw: {raw[:200]!r}")
        score_match = re.search(r'"?content_score"?\s*[=:]\s*([0-9.]+)', raw or "")
        if score_match:
            score = float(score_match.group(1))
            score = max(0.0, min(1.0, score))
            logger.info(f"[content_check] Regex fallback score={score:.2f}")
            return {"content_score": score, "content_flags": ["llm_format_warn"]}
        logger.error(f"[content_check] Could not extract score from LLM output")
        return {"content_score": 0.5, "content_flags": ["llm_parse_error"]}
    except Exception as exc:
        logger.error(f"[content_check] LLM call failed: {exc}", exc_info=True)
        return {"content_score": 0.5, "content_flags": ["llm_unavailable"]}
