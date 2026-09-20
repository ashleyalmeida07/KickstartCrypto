"""
Node 4 — draft_response
LLM node that composes the actual reply, GROUNDED in the context + policy nodes.
It is explicitly told what data was retrieved and may not invent facts.
"""
from __future__ import annotations

import logging

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from db.config import settings
from models.support_schemas import SupportState, SupportIntent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a friendly, professional customer support agent for KickstartCrypto, a blockchain crowdfunding platform on Sepolia.

Your job is to compose a helpful reply to a donor's support message.
You are given:
- The donor's original message
- Their intent (classified upstream)
- Their actual transaction data (if any)
- The campaign status
- Policy check results (for refund requests)

RULES:
1. Do NOT invent any numbers, dates, or facts not given to you below.
2. If a refund is eligible, tell the donor clearly how to claim it (via the Refunds tab on the campaign page).
3. If a refund is NOT eligible, explain why clearly and empathetically.
4. For status inquiries, report the exact data provided.
5. For fraud reports, thank the user and confirm the team will investigate.
6. Keep the tone warm, professional, and concise (3–5 sentences).
7. Do NOT promise timelines you cannot guarantee.
"""


def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.OPENROUTER_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=0.3,
        max_tokens=512,
        default_headers={
            "HTTP-Referer": "https://kickstart-crypto.app",
            "X-Title": "KickstartCrypto DonorSupport",
        },
    )


async def draft_response(state: SupportState) -> dict:
    """LangGraph node: generate grounded support reply."""
    if state.error:
        return {}

    logger.info(f"[draft_response] ticket={state.ticket_id} intent={state.intent}")

    # Build a fact sheet for the LLM
    facts = []
    if state.tx_amount_eth is not None:
        facts.append(f"- Donor contribution: {state.tx_amount_eth:.6f} ETH on {state.tx_timestamp or 'unknown date'}")
    else:
        facts.append("- No contribution record found for this wallet on this campaign.")

    if state.campaign_title:
        facts.append(f"- Campaign: '{state.campaign_title}' (status: {state.campaign_status})")

    if state.campaign_goal_eth is not None:
        pct = 0
        if state.campaign_goal_eth > 0 and state.campaign_raised_eth is not None:
            pct = round((state.campaign_raised_eth / state.campaign_goal_eth) * 100, 1)
        facts.append(f"- Funding: {state.campaign_raised_eth or 0:.4f} ETH raised of {state.campaign_goal_eth:.4f} ETH goal ({pct}%)")

    if state.intent == SupportIntent.REFUND_REQUEST:
        facts.append(f"- Refund eligible: {'YES' if state.refund_eligible else 'NO'}")
        for note in state.policy_notes:
            facts.append(f"  * {note}")

    fact_block = "\n".join(facts) if facts else "(no data retrieved)"

    human_msg = f"""Original donor message:
\"{state.message}\"

Intent: {state.intent}

Retrieved facts:
{fact_block}

Please compose a helpful reply."""

    try:
        response = await _llm().ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=human_msg),
        ])
        draft = response.content.strip()
        logger.info(f"[draft_response] draft length={len(draft)}")
        return {"draft_response": draft}

    except Exception as exc:
        logger.error(f"[draft_response] LLM failed: {exc}")
        fallback = (
            "Thank you for reaching out to KickstartCrypto support. "
            "We've received your message and a team member will follow up shortly."
        )
        return {"draft_response": fallback}
