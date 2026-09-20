"""
Node 1 — extract_milestone_claim

Pulls what was *promised* for this milestone out of the campaign's stored
milestone plan, plus the two things the downstream nodes need to judge it:

  • tranche_eth — how much money this milestone unlocks, so we can tell whether
    a claimed spend is plausible for its budget.
  • since_ts   — when the previous milestone was verified. That is the start of
    the window cross_check_onchain_spend measures outflow over; without it we
    would be comparing a single milestone's claim against the campaign's
    entire spending history.
"""
from __future__ import annotations

import logging

from db import get_pool
from models.milestone_schemas import MilestoneProofState, ProofStatus

logger = logging.getLogger(__name__)

WEI_PER_ETH = 1e18


async def extract_milestone_claim(state: MilestoneProofState) -> dict:
    """LangGraph node: load the milestone plan this proof is claiming against."""
    logger.info(
        f"[extract_claim] proof={state.proof_id} campaign={state.campaign_address} "
        f"milestone={state.milestone_index}"
    )

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    c.id::text              AS campaign_id,
                    c.title                 AS campaign_title,
                    c.creator_address,
                    c.total_contributed_wei::text,
                    c.created_at,
                    m.id::text              AS milestone_id,
                    m.title                 AS milestone_title,
                    m.description           AS milestone_description,
                    m.percentage
                FROM campaigns c
                JOIN milestones m ON m.campaign_id = c.id
                WHERE LOWER(c.contract_address) = LOWER($1)
                  AND m.milestone_index = $2
                LIMIT 1
                """,
                state.campaign_address,
                state.milestone_index,
            )

            if row is None:
                logger.warning(
                    f"[extract_claim] No milestone plan for {state.campaign_address} "
                    f"index={state.milestone_index}"
                )
                return {
                    "error": (
                        f"No stored milestone plan for campaign {state.campaign_address} "
                        f"at index {state.milestone_index}."
                    ),
                    "proof_status": ProofStatus.ERROR,
                }

            # ── Window start: the last milestone verified before this one ──────
            prev = await conn.fetchrow(
                """
                SELECT verified_at
                FROM milestone_proofs
                WHERE LOWER(campaign_address) = LOWER($1)
                  AND milestone_index < $2
                  AND status IN ('auto_approved', 'approved')
                  AND verified_at IS NOT NULL
                ORDER BY milestone_index DESC, verified_at DESC
                LIMIT 1
                """,
                state.campaign_address,
                state.milestone_index,
            )

        # First milestone (or no prior verification) → measure from campaign creation
        since_ts = prev["verified_at"] if prev else row["created_at"]

        raised_eth   = float(row["total_contributed_wei"] or 0) / WEI_PER_ETH
        percentage   = int(row["percentage"] or 0)
        tranche_eth  = raised_eth * (percentage / 100.0)

        logger.info(
            f"[extract_claim] '{row['milestone_title']}' ({percentage}% = "
            f"{tranche_eth:.4f} ETH of {raised_eth:.4f} ETH raised), "
            f"spend window opens {since_ts}"
        )

        return {
            "campaign_id":           row["campaign_id"],
            "campaign_title":        row["campaign_title"],
            "creator_address":       row["creator_address"],
            "milestone_id":          row["milestone_id"],
            "milestone_title":       row["milestone_title"],
            "milestone_description": row["milestone_description"] or "",
            "milestone_percentage":  percentage,
            "tranche_eth":           round(tranche_eth, 6),
            "raised_eth":            round(raised_eth, 6),
            "since_ts":              since_ts,
        }

    except Exception as exc:
        logger.error(f"[extract_claim] DB error: {exc}", exc_info=True)
        return {"error": str(exc), "proof_status": ProofStatus.ERROR}
