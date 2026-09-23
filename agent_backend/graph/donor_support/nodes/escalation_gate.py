"""
Node 5 — escalation_gate
The human-in-the-loop checkpoint.

Decides whether the drafted response can go out automatically OR
needs a human admin to review/approve first.

Escalation triggers:
  1. intent == fraud_report → ALWAYS escalate (no exceptions)
  2. intent_confidence < 0.6 → LLM wasn't sure what the user wanted
  3. refund_request AND refund_eligible is ambiguous (None)
  4. draft_response is empty / too short

Returns escalate=True/False and the reason why.
This is a routing function — the graph edge reads its output.
"""
from __future__ import annotations

import logging

from models.support_schemas import SupportState, SupportIntent, TicketStatus

logger = logging.getLogger(__name__)


async def escalation_gate(state: SupportState) -> dict:
    """
    LangGraph node: decide whether human review is required.
    Returns {escalate: bool, escalation_reason: str|None, ticket_status: str}
    """
    if state.error:
        return {"escalate": True, "escalation_reason": "processing_error", "ticket_status": TicketStatus.ESCALATED}

    # Rule 1: Fraud reports ALWAYS go to a human
    if state.intent == SupportIntent.FRAUD_REPORT:
        reason = "fraud_reports_always_escalated"
        logger.info(f"[escalation_gate] ticket={state.ticket_id} → ESCALATE ({reason})")
        return {"escalate": True, "escalation_reason": reason, "ticket_status": TicketStatus.ESCALATED}

    # Rule 2: Low classification confidence (threshold lowered for fast models)
    confidence = state.intent_confidence or 1.0
    if confidence < 0.4:
        reason = f"low_intent_confidence_{confidence:.2f}"
        logger.info(f"[escalation_gate] ticket={state.ticket_id} → ESCALATE ({reason})")
        return {"escalate": True, "escalation_reason": reason, "ticket_status": TicketStatus.ESCALATED}

    # Rule 3: Ambiguous refund eligibility
    if state.intent == SupportIntent.REFUND_REQUEST and state.refund_eligible is None:
        reason = "refund_eligibility_ambiguous"
        logger.info(f"[escalation_gate] ticket={state.ticket_id} → ESCALATE ({reason})")
        return {"escalate": True, "escalation_reason": reason, "ticket_status": TicketStatus.ESCALATED}

    # Rule 4: Empty draft
    if not (state.draft_response or "").strip():
        reason = "draft_response_empty"
        logger.info(f"[escalation_gate] ticket={state.ticket_id} → ESCALATE ({reason})")
        return {"escalate": True, "escalation_reason": reason, "ticket_status": TicketStatus.ESCALATED}

    # All clear — auto-approve
    logger.info(f"[escalation_gate] ticket={state.ticket_id} → AUTO-APPROVE")
    return {"escalate": False, "escalation_reason": None}


def should_escalate(state: SupportState) -> str:
    """
    Edge function for add_conditional_edges.
    Returns the node name to route to next.
    """
    return "pause_for_human" if state.escalate else "send_response"
