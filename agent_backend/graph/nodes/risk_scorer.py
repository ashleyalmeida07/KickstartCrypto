"""
Node 4 — risk_scorer
Combines wallet_score and content_score into a single composite risk_score.
Higher risk_score = more likely to be fraud.

Formula:
  risk_score = 0.40 * (1 - wallet_score) + 0.60 * (1 - content_score)

Wallet history is weighted 40%, content authenticity 60%,
because content is the primary surface for fraud on this platform.
"""
from __future__ import annotations

import logging
from models.schemas import VettingState

logger = logging.getLogger(__name__)

WALLET_WEIGHT  = 0.40
CONTENT_WEIGHT = 0.60


async def risk_scorer(state: VettingState) -> dict:
    """
    LangGraph node: compute composite risk score from wallet + content signals.
    """
    if state.error:
        return {}

    wallet_score  = state.wallet_score  if state.wallet_score  is not None else 0.5
    content_score = state.content_score if state.content_score is not None else 0.5

    # ── Forgive honest first-timers ──
    # If the wallet isn't blocklisted and the description is clean,
    # don't punish the user just for having a new wallet.
    forgive_new_wallet = (not state.wallet_on_blocklist) and (content_score >= 0.8)
    
    if forgive_new_wallet:
        wallet_score = 1.0

    risk_score = (
        WALLET_WEIGHT  * (1.0 - wallet_score) +
        CONTENT_WEIGHT * (1.0 - content_score)
    )
    risk_score = round(max(0.0, min(1.0, risk_score)), 4)

    # Build human-readable reasons list
    reasons: list[str] = list(state.content_flags or [])

    if state.wallet_on_blocklist:
        reasons.insert(0, "wallet_on_known_scam_list")

    if not forgive_new_wallet:
        if state.wallet_age_days is not None and state.wallet_age_days < 7:
            reasons.append(f"wallet_very_new_{state.wallet_age_days}d")
        elif state.wallet_age_days is not None and state.wallet_age_days < 30:
            reasons.append(f"wallet_new_{state.wallet_age_days}d")

        if state.wallet_tx_count is not None and state.wallet_tx_count < 5:
            reasons.append(f"wallet_low_tx_count_{state.wallet_tx_count}")

    logger.info(
        f"[risk_scorer] wallet={wallet_score:.2f} content={content_score:.2f} "
        f"→ risk={risk_score:.4f} reasons={reasons}"
    )

    return {
        "risk_score":      risk_score,
        "vetting_reasons": reasons,
    }
