"""
Node 1 — extract_campaign_data
Pulls the campaign row from NeonDB by contract_address and populates
the VettingState with the fields the downstream nodes need.
"""
from __future__ import annotations

import logging
from models.schemas import VettingState
from db import get_pool

logger = logging.getLogger(__name__)


async def extract_campaign_data(state: VettingState) -> dict:
    """
    LangGraph node: load campaign metadata from the database.
    Returns a partial state dict to merge.
    """
    logger.info(f"[extract] Loading campaign {state.contract_address}")

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    id::text          AS campaign_id,
                    title,
                    description,
                    goal_wei::text    AS goal_wei,
                    creator_address,
                    category
                FROM campaigns
                WHERE LOWER(contract_address) = LOWER($1)
                LIMIT 1
                """,
                state.contract_address,
            )

        if row is None:
            logger.warning(f"[extract] Campaign not found: {state.contract_address}")
            return {
                "error": f"Campaign {state.contract_address} not found in database.",
                "vetting_status": "error",
            }

        logger.info(f"[extract] Found campaign: {row['title']}")
        return {
            "campaign_id":     row["campaign_id"],
            "title":           row["title"],
            "description":     row["description"] or "",
            "goal_wei":        row["goal_wei"],
            "creator_address": row["creator_address"],
            "category":        row["category"],
        }

    except Exception as exc:
        logger.error(f"[extract] DB error: {exc}", exc_info=True)
        return {"error": str(exc), "vetting_status": "error"}
