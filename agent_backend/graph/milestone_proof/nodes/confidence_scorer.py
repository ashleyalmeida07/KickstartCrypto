"""
Node 5 — confidence_scorer

Combines the three independent signals into the single number the router acts on:

    confidence = 0.25 · ocr_confidence      (could we read it?)
               + 0.30 · spend_match_score   (does the money line up?)
               + 0.45 · consistency_score   (does it prove THIS milestone?)

Consistency carries the most weight because it is the only signal that speaks to
the actual question. A flawless receipt for the wrong thing should not pass.

On top of the weighted sum sit four policy caps — see _apply_caps.
"""
from __future__ import annotations

import logging

from db.config import settings
from models.milestone_schemas import MilestoneProofState, ProofType

logger = logging.getLogger(__name__)

OCR_WEIGHT         = 0.25
SPEND_WEIGHT       = 0.30
CONSISTENCY_WEIGHT = 0.45

# A consistency score at or below this is a clear mismatch, whatever else scored well
CLEAR_MISMATCH_CEILING = 0.25
MISMATCH_CAPPED_TO     = 0.20

# Claiming a spend larger than what actually left the wallet never auto-approves
OVERCLAIM_CAP = 0.45

# Flags meaning "our tooling failed", not "the creator's proof failed"
TOOL_FAILURE_FLAGS = {
    "vision_model_unavailable",
    "consistency_llm_unavailable",
    "consistency_llm_parse_error",
    "pdf_reader_unavailable",
    "proof_pdf_no_text_layer",
    "no_parsed_content_to_check",
}


def _apply_caps(
    confidence: float,
    state: MilestoneProofState,
    all_flags: list[str],
    reasons: list[str],
) -> float:
    """Apply the policy ceilings and floors that the weighted sum alone misses."""

    # ── 1. Clear mismatch beats every other signal ────────────────────────────
    consistency = state.consistency_score if state.consistency_score is not None else 0.5
    if consistency <= CLEAR_MISMATCH_CEILING:
        if confidence > MISMATCH_CAPPED_TO:
            reasons.append("capped_clear_consistency_mismatch")
        confidence = min(confidence, MISMATCH_CAPPED_TO)

    # ── 2. Overclaiming against the chain always meets a human ────────────────
    if any(f.startswith("claimed_exceeds_onchain_outflow") for f in all_flags):
        if confidence > OVERCLAIM_CAP:
            reasons.append("capped_claimed_spend_exceeds_onchain_outflow")
        confidence = min(confidence, OVERCLAIM_CAP)

    # ── 3. A text-only proof is the creator's unbacked word ───────────────────
    if state.proof_type == ProofType.TEXT:
        cap = settings.PROOF_TEXT_ONLY_CONFIDENCE_CAP
        if confidence > cap:
            reasons.append("capped_text_only_proof_never_auto_approved")
        confidence = min(confidence, cap)

    # ── 4. Our tooling failing must not read as a verdict either way ──────────
    tool_failures = [f for f in all_flags if f in TOOL_FAILURE_FLAGS]
    if tool_failures:
        floor   = settings.PROOF_REJECT_THRESHOLD + 0.01
        ceiling = settings.PROOF_AUTO_APPROVE_THRESHOLD - 0.01
        clamped = max(floor, min(ceiling, confidence))
        if clamped != confidence:
            reasons.append(f"forced_to_review_band_{tool_failures[0]}")
        confidence = clamped

    return confidence


async def confidence_scorer(state: MilestoneProofState) -> dict:
    """LangGraph node: fold the three signals into one confidence score."""
    if state.error:
        return {}

    ocr         = state.ocr_confidence    if state.ocr_confidence    is not None else 0.5
    spend       = state.spend_match_score if state.spend_match_score is not None else 0.5
    consistency = state.consistency_score if state.consistency_score is not None else 0.5

    confidence = (
        OCR_WEIGHT         * ocr +
        SPEND_WEIGHT       * spend +
        CONSISTENCY_WEIGHT * consistency
    )

    all_flags = [
        *(state.proof_flags or []),
        *(state.spend_flags or []),
        *(state.consistency_flags or []),
    ]

    # Reasons lead with the human-readable scores, then the raw flags, so the
    # admin queue shows why before it shows what.
    reasons: list[str] = [
        f"ocr_confidence_{ocr:.2f}",
        f"spend_match_{spend:.2f}",
        f"consistency_{consistency:.2f}",
    ]

    confidence = _apply_caps(confidence, state, all_flags, reasons)
    confidence = round(max(0.0, min(1.0, confidence)), 4)

    reasons.extend(all_flags)

    logger.info(
        f"[confidence_scorer] proof={state.proof_id} ocr={ocr:.2f} spend={spend:.2f} "
        f"consistency={consistency:.2f} → confidence={confidence:.4f}"
    )

    return {
        "confidence":           confidence,
        "verification_reasons": reasons,
    }
