"""
Node 2 — fetch_transaction_context
Pulls the donor's actual contribution record + campaign status from the DB.
Grounds all downstream LLM nodes in real data.
"""
from __future__ import annotations

import logging
from typing import Optional

from db import get_pool
from models.support_schemas import SupportState

logger = logging.getLogger(__name__)


async def fetch_transaction_context(state: SupportState) -> dict:
    """LangGraph node: fetch donor tx + campaign data from DB."""
    if state.error:
        return {}

    donor   = state.donor_address.lower()
    campaign = (state.campaign_address or "").lower()
    logger.info(f"[fetch_context] donor={donor} campaign={campaign or 'any'}")

    result: dict = {}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # ── Contribution record ──────────────────────────────────────────
            if campaign:
                row = await conn.fetchrow(
                    """
                    SELECT amount_eth, created_at
                    FROM contributions
                    WHERE LOWER(donor_address) = $1
                      AND LOWER(campaign_address) = $2
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    donor, campaign,
                )
            else:
                # No specific campaign — get most recent contribution overall
                row = await conn.fetchrow(
                    """
                    SELECT amount_eth, campaign_address, created_at
                    FROM contributions
                    WHERE LOWER(donor_address) = $1
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    donor,
                )
                if row and not campaign:
                    campaign = (row["campaign_address"] or "").lower()
                    result["campaign_address"] = campaign

            if row:
                result["tx_amount_eth"]  = float(row["amount_eth"])
                result["tx_timestamp"]   = str(row["created_at"])

            # ── Campaign record ──────────────────────────────────────────────
            if campaign:
                camp = await conn.fetchrow(
                    """
                    SELECT title, vetting_status, goal_eth, raised_eth
                    FROM campaigns
                    WHERE LOWER(contract_address) = $1
                    """,
                    campaign,
                )
                if camp:
                    result["campaign_title"]      = camp["title"] or "Unknown Campaign"
                    result["campaign_status"]     = camp["vetting_status"] or "unknown"
                    result["campaign_goal_eth"]   = float(camp["goal_eth"]   or 0)
                    result["campaign_raised_eth"] = float(camp["raised_eth"] or 0)

    except Exception as exc:
        logger.error(f"[fetch_context] DB error: {exc}", exc_info=True)
        # Non-fatal — continue with whatever we got

    logger.info(
        f"[fetch_context] tx_eth={result.get('tx_amount_eth')} "
        f"campaign='{result.get('campaign_title')}'"
    )
    return result
