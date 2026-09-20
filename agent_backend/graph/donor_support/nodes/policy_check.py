"""
Node 3 — policy_check
Rules engine (NOT an LLM) — only runs for refund_request.
Determines refund eligibility based on platform rules + fetched context.
"""
from __future__ import annotations

import logging

from models.support_schemas import SupportState, SupportIntent

logger = logging.getLogger(__name__)

# Platform refund policy constants
REFUND_ELIGIBLE_STATUSES = {"rejected", "failed", "cancelled", "flagged_for_review"}
REFUND_WINDOW_DAYS = 90  # max days after contribution to claim a refund


async def policy_check(state: SupportState) -> dict:
    """
    LangGraph node: check refund eligibility against platform rules.
    Skipped for non-refund intents (conditional edge handles routing).
    """
    if state.error:
        return {}

    logger.info(f"[policy_check] ticket={state.ticket_id} intent={state.intent}")

    notes: list[str] = []
    eligible = False

    # Only meaningful for refund requests — other intents shouldn't reach here
    # but be defensive
    if state.intent != SupportIntent.REFUND_REQUEST:
        return {"refund_eligible": None, "policy_notes": []}

    # Rule 1: Did the donor actually contribute?
    if state.tx_amount_eth is None:
        notes.append("No contribution record found for this wallet + campaign.")
        eligible = False

    else:
        # Rule 2: Is the campaign in a refund-eligible state?
        campaign_status = (state.campaign_status or "").lower()
        if any(s in campaign_status for s in REFUND_ELIGIBLE_STATUSES):
            notes.append(f"Campaign status '{campaign_status}' qualifies for refund.")
            eligible = True
        else:
            notes.append(
                f"Campaign status '{campaign_status}' does not qualify for an automatic refund. "
                "Refunds are only automatic when the campaign fails, is cancelled, or is rejected."
            )
            eligible = False

        # Rule 3: Did they contribute enough to matter?
        if state.tx_amount_eth and state.tx_amount_eth < 0.0001:
            notes.append("Contribution amount is below minimum refund threshold (0.0001 ETH).")
            eligible = False

    logger.info(f"[policy_check] eligible={eligible} notes={notes}")
    return {"refund_eligible": eligible, "policy_notes": notes}
