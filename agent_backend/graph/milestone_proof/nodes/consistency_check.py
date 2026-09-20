"""
Node 4 — consistency_check

The judgement node: does the proof actually evidence *this* milestone?

parse_proof established what the document says; this node decides whether what
it says matches what was promised. A perfectly legible receipt for office
furniture is a 1.0 on legibility and close to 0.0 here if the milestone was
"hire 2 developers".
"""
from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from models.milestone_schemas import MilestoneProofState

from ..llm_utils import build_llm, clamp01, extract_json

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a milestone verification analyst for a blockchain crowdfunding platform.

A project creator has promised to deliver a specific milestone and has submitted proof in order to unlock the next tranche of funding. Your job is to decide whether the proof actually evidences THAT SPECIFIC milestone — not whether it is a nice document, and not whether the project seems legitimate in general.

Judge against these criteria:

1. DIRECT_MATCH — Does the proof evidence the specific thing promised? If the milestone says "hire 2 developers", payment records to two individuals for development work match; an invoice for office equipment does not, however genuine it looks.

2. SCOPE_COMPLETENESS — Does the proof cover the WHOLE milestone or only part of it? "Hire 2 developers" with a payment record for one developer is partial, not complete.

3. AMOUNT_PLAUSIBILITY — Are the amounts consistent with the milestone's budget and with the stated spend? Note mismatches, but do not penalise a proof simply for having no amounts — some milestones have nothing to spend.

4. TEMPORAL_FIT — Do dates in the proof fall within this milestone's work period, or does the proof appear to be recycled from earlier work already claimed?

5. SUBSTANTIVENESS — Is there real evidence here, or is it generic filler that would fit any project? Vague text with no verifiable specifics scores low.

Scoring guidance:
  0.85–1.00 → proof directly and completely evidences the milestone
  0.60–0.84 → proof plausibly relates to the milestone but is partial or has gaps
  0.30–0.59 → weak, ambiguous, or largely unsubstantiated
  0.00–0.29 → proof does not evidence this milestone, or contradicts it

Do not inflate the score out of charity, and do not deflate it because you cannot independently verify an authentic-looking document — say so in your reasoning instead.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "consistency_score": <float 0.0 to 1.0>,
  "matches_milestone": <true|false>,
  "covers_full_scope": <true|false>,
  "missing_evidence": [<short strings naming what is absent, empty if nothing>],
  "flags": [<short flag strings, empty if none>],
  "reasoning": "<2-3 sentences explaining the score>"
}"""


async def consistency_check(state: MilestoneProofState) -> dict:
    """LangGraph node: LLM check of proof content against the milestone promise."""
    if state.error:
        return {}

    parsed = (state.parsed_content or "").strip()

    if not parsed:
        # Nothing was readable. That is a verification failure, not a mismatch —
        # it belongs in front of a human, so stay mid-low rather than bottoming out.
        logger.warning(f"[consistency_check] proof={state.proof_id} has no parsed content")
        return {
            "consistency_score": 0.2,
            "consistency_notes": "No readable content could be extracted from the submitted proof.",
            "consistency_flags": ["no_parsed_content_to_check"],
        }

    spend_line = "Creator did not state a spend amount."
    if state.claimed_spend_eth is not None:
        spend_line = f"Creator claims to have spent {state.claimed_spend_eth:.4f} ETH."
    if state.onchain_outflow_eth is not None:
        spend_line += (
            f" Measured on-chain outflow over this milestone's window: "
            f"{state.onchain_outflow_eth:.4f} ETH across "
            f"{state.onchain_tx_count or 0} transaction(s)."
        )

    human_prompt = f"""MILESTONE PROMISED
Campaign: {state.campaign_title or 'Untitled'}
Milestone {state.milestone_index + 1}: {state.milestone_title or '(no title)'}
Description: {state.milestone_description or '(no description provided)'}
Tranche this unlocks: {state.milestone_percentage or 0}% of funds raised (~{state.tranche_eth or 0:.4f} ETH)

SPEND CLAIM
{spend_line}

PROOF SUBMITTED (type: {state.proof_type.value})
{parsed[:6000]}"""

    try:
        llm = build_llm(max_tokens=700)
        response = await llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=human_prompt),
        ])
        parsed_json = extract_json(response.content, expect_key="consistency_score")

    except json.JSONDecodeError:
        logger.warning(
            f"[consistency_check] proof={state.proof_id} unparseable LLM response — "
            f"routing to human review"
        )
        return {
            "consistency_score": 0.5,
            "consistency_notes": "Automated consistency check returned an unreadable response.",
            "consistency_flags": ["consistency_llm_parse_error"],
        }
    except Exception as exc:
        logger.error(f"[consistency_check] LLM call failed: {exc}", exc_info=True)
        return {
            "consistency_score": 0.5,
            "consistency_notes": "Automated consistency check was unavailable.",
            "consistency_flags": ["consistency_llm_unavailable"],
        }

    score    = clamp01(parsed_json.get("consistency_score"), 0.5)
    matches  = bool(parsed_json.get("matches_milestone", False))
    full     = bool(parsed_json.get("covers_full_scope", False))
    missing  = parsed_json.get("missing_evidence") or []
    notes    = (parsed_json.get("reasoning") or "").strip()

    flags: list[str] = [str(f) for f in (parsed_json.get("flags") or [])]
    if not matches:
        flags.append("proof_does_not_match_milestone")
    if matches and not full:
        flags.append("proof_covers_partial_scope")
    for item in missing[:5]:
        flags.append(f"missing_{str(item).lower().replace(' ', '_')[:40]}")

    logger.info(
        f"[consistency_check] proof={state.proof_id} score={score:.2f} "
        f"matches={matches} full_scope={full} flags={flags}"
    )

    return {
        "consistency_score": score,
        "consistency_notes": notes or None,
        "consistency_flags": flags,
    }
