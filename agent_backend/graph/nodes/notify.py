"""
Node 6 — notify
The convergence node that runs after auto_approve, flag_for_review, or auto_reject.
Responsibilities:
  1. Write the verdict to the campaigns table (vetting_status, vetting_score, etc.)
  2. Mark routing_decision in state so the API caller knows the outcome

Three thin wrapper nodes (auto_approve, flag_for_review, auto_reject) set the
routing_decision on the state, then all three converge here.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from db import get_pool
from models.schemas import VettingState, VettingStatus

logger = logging.getLogger(__name__)


# ─── Verdict setter nodes (thin wrappers that set routing_decision) ──────────

async def auto_approve(state: VettingState) -> dict:
    logger.info(f"[auto_approve] {state.contract_address}")
    return {"routing_decision": "auto_approve", "vetting_status": VettingStatus.APPROVED}


async def flag_for_review(state: VettingState) -> dict:
    logger.info(f"[flag_for_review] {state.contract_address}")
    return {"routing_decision": "flag_for_review", "vetting_status": VettingStatus.REVIEW}


async def auto_reject(state: VettingState) -> dict:
    logger.info(f"[auto_reject] {state.contract_address}")
    return {"routing_decision": "auto_reject", "vetting_status": VettingStatus.REJECTED}


# ─── Main notify node ─────────────────────────────────────────────────────────

async def notify(state: VettingState) -> dict:
    """
    LangGraph node: persist the vetting verdict to NeonDB.
    """
    completed_at = datetime.now(tz=timezone.utc)
    vetting_status = state.vetting_status.value if hasattr(state.vetting_status, "value") else str(state.vetting_status)

    logger.info(
        f"[notify] {state.contract_address} → status={vetting_status} "
        f"score={state.risk_score} reasons={state.vetting_reasons}"
    )

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE campaigns
                SET
                    vetting_status       = $1,
                    vetting_score        = $2,
                    vetting_reasons      = $3,
                    vetting_completed_at = $4,
                    updated_at           = NOW()
                WHERE LOWER(contract_address) = LOWER($5)
                """,
                vetting_status,
                state.risk_score,
                json.dumps(state.vetting_reasons or []),
                completed_at,
                state.contract_address,
            )
        logger.info(f"[notify] DB updated for {state.contract_address}")

    except Exception as exc:
        logger.error(f"[notify] DB update failed: {exc}", exc_info=True)
        # Don't re-raise — we still return the state so the API can report it

    return {"completed_at": completed_at}
