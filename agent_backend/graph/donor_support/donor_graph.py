"""
LangGraph Flow 2 — Donor Support & Dispute Resolution
======================================================

Graph shape:

    classify_intent
          │
          ▼
    fetch_transaction_context
          │
          ├── refund_request ──► policy_check ─┐
          ├── status_inquiry ──────────────────►│
          ├── fraud_report ───────────────────►│
          └── general_question ───────────────►│
                                               ▼
                                        draft_response
                                               │
                                               ▼
                                      escalation_gate
                                        │         │
                                  (auto-ok)  (needs human)
                                        │         │
                                        ▼         ▼
                                 send_response  pause_for_human
                                        │         │
                                       END       END  ← graph suspends here
                                                       (resumed externally via /resolve)
"""
from __future__ import annotations

from typing import TypedDict, Annotated, List, Optional
import operator

from langgraph.graph import StateGraph, END

from models.support_schemas import SupportIntent, TicketStatus
from .nodes import (
    classify_intent,
    fetch_transaction_context,
    policy_check,
    draft_response,
    escalation_gate,
    should_escalate,
    send_response,
    pause_for_human,
)


# ─── Typed State for LangGraph ────────────────────────────────────────────────

class DonorSupportState(TypedDict, total=False):
    # Input
    ticket_id:         str
    donor_address:     str
    campaign_address:  Optional[str]
    message:           str

    # Node 1
    intent:            Optional[str]
    intent_confidence: Optional[float]

    # Node 2
    tx_amount_eth:     Optional[float]
    tx_timestamp:      Optional[str]
    campaign_title:    Optional[str]
    campaign_status:   Optional[str]
    campaign_goal_eth: Optional[float]
    campaign_raised_eth: Optional[float]

    # Node 3 (refund only)
    refund_eligible:   Optional[bool]
    policy_notes:      Annotated[List[str], operator.add]

    # Node 4
    draft_response:    Optional[str]

    # Node 5
    escalate:          bool
    escalation_reason: Optional[str]

    # Node 6
    final_response:    Optional[str]
    ticket_status:     Optional[str]
    completed_at:      Optional[object]

    # Error
    error:             Optional[str]


# ─── Routing helpers ──────────────────────────────────────────────────────────

def _route_after_classify(state: DonorSupportState) -> str:
    """After classify, refund_requests go through policy_check first."""
    intent = state.get("intent")
    if intent == SupportIntent.REFUND_REQUEST:
        return "policy_check"
    return "draft_response"


def _route_after_escalation(state: DonorSupportState) -> str:
    """Edge function: escalate or send."""
    if state.get("escalate"):
        return "pause_for_human"
    return "send_response"


# ─── Build the graph ──────────────────────────────────────────────────────────

def build_donor_support_graph() -> StateGraph:
    """Construct and compile the Donor Support LangGraph."""

    graph = StateGraph(DonorSupportState)

    # ── Register nodes ────────────────────────────────────────────────────────
    graph.add_node("classify_intent",           classify_intent)
    graph.add_node("fetch_context",             fetch_transaction_context)
    graph.add_node("policy_check",              policy_check)
    graph.add_node("draft_response",            draft_response)
    graph.add_node("escalation_gate",           escalation_gate)
    graph.add_node("send_response",             send_response)
    graph.add_node("pause_for_human",           pause_for_human)

    # ── Entry point ───────────────────────────────────────────────────────────
    graph.set_entry_point("classify_intent")

    # ── classify → fetch ──────────────────────────────────────────────────────
    graph.add_edge("classify_intent", "fetch_context")

    # ── fetch → policy_check (refund) OR draft_response (everything else) ─────
    graph.add_conditional_edges(
        "fetch_context",
        _route_after_classify,
        {
            "policy_check":   "policy_check",
            "draft_response": "draft_response",
        },
    )

    # ── policy_check → draft ──────────────────────────────────────────────────
    graph.add_edge("policy_check", "draft_response")

    # ── draft → escalation gate ───────────────────────────────────────────────
    graph.add_edge("draft_response", "escalation_gate")

    # ── escalation gate → send OR pause ───────────────────────────────────────
    graph.add_conditional_edges(
        "escalation_gate",
        _route_after_escalation,
        {
            "send_response":  "send_response",
            "pause_for_human": "pause_for_human",
        },
    )

    # ── Terminal edges ────────────────────────────────────────────────────────
    graph.add_edge("send_response",  END)
    graph.add_edge("pause_for_human", END)

    return graph.compile()


# Compiled singleton — imported by main.py
donor_support_graph = build_donor_support_graph()
