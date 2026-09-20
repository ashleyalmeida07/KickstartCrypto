"""
Node 5 — conditional_router
Pure routing function (not a graph node itself — used as LangGraph conditional edge).
Examines the risk_score and returns the name of the next node to execute.

  risk_score < LOW_THRESHOLD  → "auto_approve"
  LOW <= score <= HIGH         → "flag_for_review"
  score > HIGH_THRESHOLD       → "auto_reject"
"""
from __future__ import annotations

import logging
from models.schemas import VettingState
from db.config import settings

logger = logging.getLogger(__name__)


def conditional_router(state: VettingState) -> str:
    """
    LangGraph conditional edge function.
    Returns the name of the *next node* to route to.
    """
    if state.error:
        logger.warning(f"[router] Error state detected — routing to auto_reject: {state.error}")
        return "auto_reject"

    score = state.risk_score if state.risk_score is not None else 0.5

    if score < settings.RISK_LOW_THRESHOLD:
        decision = "auto_approve"
    elif score > settings.RISK_HIGH_THRESHOLD:
        decision = "auto_reject"
    else:
        decision = "flag_for_review"

    logger.info(f"[router] risk_score={score:.4f} → {decision}")
    return decision
