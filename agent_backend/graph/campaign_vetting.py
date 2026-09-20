"""
LangGraph Flow 1 — Campaign Vetting & Risk Scoring
===================================================

Graph shape:
    extract_campaign_data
            │
            ▼
    check_wallet_history ──┐
            │               │ (parallel-like — both run then converge)
            ▼               │
    content_authenticity_check
            │               │
            └───────┬───────┘
                    ▼
              risk_scorer
                    │
                    ▼
            conditional_router  ← edge function (not a node)
            │        │        │
       (low risk) (medium) (high risk)
            │        │        │
            ▼        ▼        ▼
      auto_approve  flag_for  auto_reject
                  _review
            │        │        │
            └────────┴────────┘
                    ▼
                 notify
"""
from __future__ import annotations

from typing import TypedDict, Annotated, List, Optional
import operator

from langgraph.graph import StateGraph, END

from models.schemas import VettingStatus
from .nodes import (
    extract_campaign_data,
    check_wallet_history,
    content_authenticity_check,
    risk_scorer,
    conditional_router,
    auto_approve,
    flag_for_review,
    auto_reject,
    notify,
)


# ─── Typed State ──────────────────────────────────────────────────────────────
# LangGraph requires a TypedDict for its state, with reducer annotations.
# We use operator.add for list fields so they accumulate across nodes.

class VettingGraphState(TypedDict, total=False):
    # Input
    contract_address: str

    # Node 1 — extract
    campaign_id:     Optional[str]
    title:           Optional[str]
    description:     Optional[str]
    goal_wei:        Optional[str]
    creator_address: Optional[str]
    category:        Optional[str]

    # Node 2 — wallet
    wallet_age_days:     Optional[int]
    wallet_tx_count:     Optional[int]
    wallet_on_blocklist: Optional[bool]
    wallet_score:        Optional[float]

    # Node 3 — content
    content_score: Optional[float]
    content_flags: Annotated[List[str], operator.add]

    # Node 4 — risk
    risk_score: Optional[float]
    vetting_reasons: Annotated[List[str], operator.add]

    # Node 5/6 — verdict
    routing_decision: Optional[str]
    vetting_status:   Optional[str]
    completed_at:     Optional[object]

    # Error
    error: Optional[str]


# ─── Build the graph ──────────────────────────────────────────────────────────

def build_vetting_graph() -> StateGraph:
    """Construct and compile the Campaign Vetting LangGraph."""

    graph = StateGraph(VettingGraphState)

    # ── Register nodes ────────────────────────────────────────
    graph.add_node("extract_campaign_data",        extract_campaign_data)
    graph.add_node("check_wallet_history",         check_wallet_history)
    graph.add_node("content_authenticity_check",   content_authenticity_check)
    graph.add_node("risk_scorer",                  risk_scorer)
    graph.add_node("auto_approve",                 auto_approve)
    graph.add_node("flag_for_review",              flag_for_review)
    graph.add_node("auto_reject",                  auto_reject)
    graph.add_node("notify",                       notify)

    # ── Entry point ───────────────────────────────────────────
    graph.set_entry_point("extract_campaign_data")

    # ── Linear edges ──────────────────────────────────────────
    graph.add_edge("extract_campaign_data",      "check_wallet_history")
    graph.add_edge("check_wallet_history",       "content_authenticity_check")
    graph.add_edge("content_authenticity_check", "risk_scorer")

    # ── Conditional routing edge ──────────────────────────────
    graph.add_conditional_edges(
        "risk_scorer",
        conditional_router,           # edge function returns node name string
        {
            "auto_approve":    "auto_approve",
            "flag_for_review": "flag_for_review",
            "auto_reject":     "auto_reject",
        },
    )

    # ── All three verdict nodes converge at notify ────────────
    graph.add_edge("auto_approve",    "notify")
    graph.add_edge("flag_for_review", "notify")
    graph.add_edge("auto_reject",     "notify")

    # ── Terminal ──────────────────────────────────────────────
    graph.add_edge("notify", END)

    return graph.compile()


# Compiled graph singleton — imported by main.py
vetting_graph = build_vetting_graph()
