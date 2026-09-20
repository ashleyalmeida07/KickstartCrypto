"""
Pydantic schemas for the Donor Support & Dispute Resolution flow (Flow 2).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class SupportIntent(str, Enum):
    REFUND_REQUEST    = "refund_request"
    STATUS_INQUIRY    = "status_inquiry"
    FRAUD_REPORT      = "fraud_report"
    GENERAL_QUESTION  = "general_question"

class TicketStatus(str, Enum):
    OPEN       = "open"
    RUNNING    = "running"
    ESCALATED  = "escalated"   # waiting for human
    RESOLVED   = "resolved"    # human acted
    CLOSED     = "closed"      # auto-handled


# ─── LangGraph State ──────────────────────────────────────────────────────────

class SupportState(BaseModel):
    """State that flows through the donor support graph."""

    # Input
    ticket_id:        str
    donor_address:    str
    campaign_address: Optional[str]  = None
    message:          str

    # Node 1 — classify
    intent:           Optional[SupportIntent] = None
    intent_confidence: Optional[float]        = None  # 0–1

    # Node 2 — context
    tx_amount_eth:    Optional[float]  = None
    tx_timestamp:     Optional[str]    = None
    campaign_title:   Optional[str]    = None
    campaign_status:  Optional[str]    = None
    campaign_goal_eth: Optional[float] = None
    campaign_raised_eth: Optional[float] = None
    refund_eligible:  Optional[bool]   = None   # set by policy_check

    # Node 3 — policy (only for refund_request)
    policy_notes:     List[str]        = Field(default_factory=list)

    # Node 4 — draft
    draft_response:   Optional[str]    = None

    # Node 5 — escalation gate
    escalate:         bool             = False
    escalation_reason: Optional[str]  = None

    # Node 6 — send
    final_response:   Optional[str]    = None
    ticket_status:    TicketStatus     = TicketStatus.OPEN
    completed_at:     Optional[datetime] = None

    # Error
    error:            Optional[str]    = None


# ─── Requests / Responses ─────────────────────────────────────────────────────

class SupportQueryRequest(BaseModel):
    donor_address:    str   = Field(..., description="Wallet address of the donor")
    campaign_address: Optional[str] = Field(None, description="Campaign contract address this query is about")
    message:          str   = Field(..., description="The donor's message / question")

class SupportQueryResponse(BaseModel):
    ticket_id:   str
    status:      str
    message:     str   # acknowledgement

class TicketStatusResponse(BaseModel):
    ticket_id:         str
    status:            str
    intent:            Optional[str]
    draft_response:    Optional[str]
    final_response:    Optional[str]
    escalation_reason: Optional[str]
    created_at:        Optional[datetime]
    resolved_at:       Optional[datetime]

class ResolveTicketRequest(BaseModel):
    action:            str   = Field(..., description="approve | edit | reject")
    edited_response:   Optional[str] = None   # only required if action=edit
    resolved_by:       str   = "admin"
