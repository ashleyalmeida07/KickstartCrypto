"""
Node 6 — conditional_router

Pure routing function used as a LangGraph conditional edge, mirroring Flow 1's
router. Reads the composite confidence and names the next node.

  confidence >= PROOF_AUTO_APPROVE_THRESHOLD → "release_tranche"
  confidence <= PROOF_REJECT_THRESHOLD       → "flag_mismatch"
  anything in between                        → "queue_for_admin"

An error state routes to the admin queue rather than to rejection — a graph that
fell over has not established that the creator did anything wrong.
"""
from __future__ import annotations

import logging

from db.config import settings
from models.milestone_schemas import MilestoneProofState

logger = logging.getLogger(__name__)


def conditional_router(state: MilestoneProofState) -> str:
    """LangGraph conditional edge function — returns the next node's name."""
    if state.error:
        logger.warning(
            f"[router] proof={state.proof_id} error state — routing to admin queue: {state.error}"
        )
        return "queue_for_admin"

    confidence = state.confidence if state.confidence is not None else 0.5

    if confidence >= settings.PROOF_AUTO_APPROVE_THRESHOLD:
        decision = "release_tranche"
    elif confidence <= settings.PROOF_REJECT_THRESHOLD:
        decision = "flag_mismatch"
    else:
        decision = "queue_for_admin"

    logger.info(f"[router] proof={state.proof_id} confidence={confidence:.4f} → {decision}")
    return decision
