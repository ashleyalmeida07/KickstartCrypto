"""
Nodes 6a/6b/6c — the three verdict nodes
Node 7    — notify

The verdict nodes are thin: they set the outcome on the state and converge at
notify, which is the single place that touches the database. That mirrors Flow
1's auto_approve / flag_for_review / auto_reject → notify shape.

TRANCHE RELEASE
---------------
Campaign.sol has no per-milestone release function — settle() pays the creator
the entire balance in one transaction after the deadline, and milestones are
informational on-chain. So release_tranche records that the tranche is cleared
(milestones.payout_status = 'ready_for_release') rather than moving funds. The
hook for an actual on-chain call is marked in release_tranche below.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from db import get_pool
from models.milestone_schemas import (
    MilestoneProofState,
    PayoutStatus,
    ProofStatus,
    ProofVerdict,
)

logger = logging.getLogger(__name__)

WEI_PER_ETH = Decimal("1000000000000000000")


def _num(value: Optional[float]) -> Optional[Decimal]:
    """Convert to Decimal for asyncpg's NUMERIC codec, preserving None."""
    if value is None:
        return None
    return Decimal(str(value))


def _wei(value: Optional[float]) -> Optional[Decimal]:
    """ETH float → wei Decimal, for the NUMERIC wei columns."""
    if value is None:
        return None
    return (Decimal(str(value)) * WEI_PER_ETH).quantize(Decimal("1"))


# ─── Verdict nodes ────────────────────────────────────────────────────────────

async def release_tranche(state: MilestoneProofState) -> dict:
    """
    High confidence — the proof holds up. Clear the next tranche for payout.

    TODO (on-chain release): when Campaign.sol gains a per-milestone release
    function, call it here — e.g. campaign.releaseMilestone(milestone_index)
    signed by a platform verifier key — and set payout_status to RELEASED with
    the resulting tx hash instead of READY_FOR_RELEASE. Until then this is the
    authoritative record that the tranche is unlocked, and the payout itself
    still happens through settle().
    """
    logger.info(
        f"[release_tranche] proof={state.proof_id} milestone={state.milestone_index} "
        f"confidence={state.confidence} tranche={state.tranche_eth} ETH → APPROVED"
    )
    return {
        "routing_decision": "release_tranche",
        "verdict":          ProofVerdict.AUTO_APPROVED,
        "proof_status":     ProofStatus.AUTO_APPROVED,
        "payout_status":    PayoutStatus.READY_FOR_RELEASE,
    }


async def queue_for_admin(state: MilestoneProofState) -> dict:
    """Ambiguous — a human decides. Funds stay locked while it waits."""
    logger.info(
        f"[queue_for_admin] proof={state.proof_id} milestone={state.milestone_index} "
        f"confidence={state.confidence} → ADMIN QUEUE"
    )
    return {
        "routing_decision": "queue_for_admin",
        "verdict":          ProofVerdict.NEEDS_REVIEW,
        "proof_status":     ProofStatus.PENDING_REVIEW,
        "payout_status":    PayoutStatus.LOCKED,
    }


async def flag_mismatch(state: MilestoneProofState) -> dict:
    """Clear mismatch — reject the proof and withhold the tranche."""
    logger.warning(
        f"[flag_mismatch] proof={state.proof_id} milestone={state.milestone_index} "
        f"confidence={state.confidence} → REJECTED"
    )
    return {
        "routing_decision": "flag_mismatch",
        "verdict":          ProofVerdict.REJECTED,
        "proof_status":     ProofStatus.REJECTED,
        "payout_status":    PayoutStatus.WITHHELD,
    }


# ─── Convergence node ─────────────────────────────────────────────────────────

async def notify(state: MilestoneProofState) -> dict:
    """
    LangGraph node: persist the verdict and every signal behind it.

    Writing the full breakdown (not just the verdict) is what lets the admin
    queue show *why* something was flagged, and what an admin overriding the
    decision is actually overriding.
    """
    completed_at = datetime.now(tz=timezone.utc)

    proof_status = (
        state.proof_status.value
        if hasattr(state.proof_status, "value") else str(state.proof_status)
    )
    verdict = (
        state.verdict.value
        if hasattr(state.verdict, "value") else (state.verdict and str(state.verdict))
    )
    payout_status = (
        state.payout_status.value
        if hasattr(state.payout_status, "value") else str(state.payout_status)
    )

    if state.error:
        proof_status = ProofStatus.ERROR.value

    reasons = list(state.verification_reasons or [])
    if state.error:
        reasons.insert(0, f"graph_error: {state.error}")

    logger.info(
        f"[notify] proof={state.proof_id} status={proof_status} verdict={verdict} "
        f"confidence={state.confidence} payout={payout_status}"
    )

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # ── 1. The proof record ───────────────────────────────────────
                await conn.execute(
                    """
                    UPDATE milestone_proofs
                    SET campaign_id         = COALESCE($1::uuid, campaign_id),
                        milestone_id        = COALESCE($2::uuid, milestone_id),
                        parsed_content      = $3,
                        ocr_confidence      = $4,
                        onchain_outflow_wei = $5,
                        onchain_tx_count    = $6,
                        spend_match_score   = $7,
                        consistency_score   = $8,
                        consistency_notes   = $9,
                        confidence          = $10,
                        reasons             = $11,
                        status              = $12,
                        verdict             = $13,
                        routing_decision    = $14,
                        tranche_wei         = $15,
                        verified_at         = $16
                    WHERE id = $17::uuid
                    """,
                    state.campaign_id,
                    state.milestone_id,
                    (state.parsed_content or "")[:20000] or None,
                    _num(state.ocr_confidence),
                    _wei(state.onchain_outflow_eth),
                    state.onchain_tx_count,
                    _num(state.spend_match_score),
                    _num(state.consistency_score),
                    state.consistency_notes,
                    _num(state.confidence),
                    json.dumps(reasons),
                    proof_status,
                    verdict,
                    state.routing_decision,
                    _wei(state.tranche_eth),
                    completed_at,
                    state.proof_id,
                )

                # ── 2. The milestone it unlocks ───────────────────────────────
                if state.milestone_id:
                    if state.routing_decision == "release_tranche":
                        await conn.execute(
                            """
                            UPDATE milestones
                            SET status           = 'approved',
                                proof_status     = 'verified',
                                payout_status    = $1,
                                last_verified_at = $2
                            WHERE id = $3::uuid
                            """,
                            payout_status, completed_at, state.milestone_id,
                        )
                    elif state.routing_decision == "flag_mismatch":
                        await conn.execute(
                            """
                            UPDATE milestones
                            SET status           = 'rejected',
                                proof_status     = 'rejected',
                                payout_status    = $1,
                                last_verified_at = $2
                            WHERE id = $3::uuid
                            """,
                            payout_status, completed_at, state.milestone_id,
                        )
                    else:
                        # Waiting on a human — leave status alone so an admin
                        # rejection does not look like an automated one.
                        await conn.execute(
                            """
                            UPDATE milestones
                            SET proof_status = 'needs_review'
                            WHERE id = $1::uuid
                            """,
                            state.milestone_id,
                        )

        logger.info(f"[notify] proof={state.proof_id} persisted")

    except Exception as exc:
        # Match Flow 1: log and return state so the caller can still report it
        logger.error(f"[notify] DB write failed: {exc}", exc_info=True)

    # ── Notification surface ──────────────────────────────────────────────────
    # The dashboards poll the rows written above; these lines are the operator's
    # view of who needs to hear about this outcome.
    if state.routing_decision == "release_tranche":
        logger.info(
            f"[notify] → CREATOR {state.submitted_by}: milestone "
            f"'{state.milestone_title}' verified, {state.tranche_eth or 0:.4f} ETH cleared."
        )
    elif state.routing_decision == "queue_for_admin":
        logger.info(
            f"[notify] → ADMIN: '{state.campaign_title}' milestone "
            f"'{state.milestone_title}' needs review (confidence {state.confidence})."
        )
        logger.info(f"[notify] → CREATOR {state.submitted_by}: proof under review.")
    else:
        logger.info(
            f"[notify] → CREATOR {state.submitted_by}: proof for "
            f"'{state.milestone_title}' rejected — {state.consistency_notes or 'see reasons'}"
        )
        logger.info(f"[notify] → ADMIN: rejected proof recorded for '{state.campaign_title}'.")

    return {"completed_at": completed_at, "proof_status": proof_status}
