"""
LangGraph Flow 3 — Milestone Proof Verification
================================================

Runs when a creator submits proof to unlock the next milestone's funds.

Graph shape:

    extract_milestone_claim      ← what was promised (stored milestone plan)
            │
            ▼
        parse_proof              ← OCR / vision-LLM / PDF text / link fetch
            │
            ▼
    cross_check_onchain_spend    ← claimed spend vs real outflow since last milestone
            │
            ▼
     consistency_check           ← LLM: does the proof match the milestone?
            │
            ▼
     confidence_scorer           ← OCR + on-chain match + consistency → one score
            │
            ▼
     conditional_router          ← edge function (not a node)
      │         │          │
   (high)   (ambiguous)  (mismatch)
      │         │          │
      ▼         ▼          ▼
 release_   queue_for_  flag_
  tranche     admin     mismatch
      │         │          │
      └─────────┴──────────┘
                ▼
             notify            ← persists verdict + every signal behind it

Unlike Flow 2, this graph does not suspend at the admin queue. queue_for_admin
writes the pending state and ends; an admin acting on it goes through
POST /milestone-proof/resolve/{id}, which applies the decision directly rather
than resuming the graph — there is nothing left to re-run once a human has
made the call.
"""
from __future__ import annotations

from langgraph.graph import END, StateGraph

from models.milestone_schemas import MilestoneProofState

from .nodes import (
    conditional_router,
    confidence_scorer,
    consistency_check,
    cross_check_onchain_spend,
    extract_milestone_claim,
    flag_mismatch,
    notify,
    parse_proof,
    queue_for_admin,
    release_tranche,
)


def build_milestone_proof_graph():
    """Construct and compile the Milestone Proof Verification graph."""

    graph = StateGraph(MilestoneProofState)

    # ── Register nodes ────────────────────────────────────────
    graph.add_node("extract_milestone_claim",    extract_milestone_claim)
    graph.add_node("parse_proof",                parse_proof)
    graph.add_node("cross_check_onchain_spend",  cross_check_onchain_spend)
    graph.add_node("consistency_check",          consistency_check)
    graph.add_node("confidence_scorer",          confidence_scorer)
    graph.add_node("release_tranche",            release_tranche)
    graph.add_node("queue_for_admin",            queue_for_admin)
    graph.add_node("flag_mismatch",              flag_mismatch)
    graph.add_node("notify",                     notify)

    # ── Entry point ───────────────────────────────────────────
    graph.set_entry_point("extract_milestone_claim")

    # ── Linear edges ──────────────────────────────────────────
    # parse_proof runs before the spend check so the on-chain comparison can
    # fall back to an amount read off the proof when the creator did not state
    # one; consistency_check runs last so it can see both.
    graph.add_edge("extract_milestone_claim",   "parse_proof")
    graph.add_edge("parse_proof",               "cross_check_onchain_spend")
    graph.add_edge("cross_check_onchain_spend", "consistency_check")
    graph.add_edge("consistency_check",         "confidence_scorer")

    # ── Conditional routing edge ──────────────────────────────
    graph.add_conditional_edges(
        "confidence_scorer",
        conditional_router,            # edge function returns the next node name
        {
            "release_tranche":  "release_tranche",
            "queue_for_admin":  "queue_for_admin",
            "flag_mismatch":    "flag_mismatch",
        },
    )

    # ── All three verdict nodes converge at notify ────────────
    graph.add_edge("release_tranche", "notify")
    graph.add_edge("queue_for_admin", "notify")
    graph.add_edge("flag_mismatch",   "notify")

    # ── Terminal ──────────────────────────────────────────────
    graph.add_edge("notify", END)

    return graph.compile()


# Compiled graph singleton — imported by main.py
milestone_proof_graph = build_milestone_proof_graph()
