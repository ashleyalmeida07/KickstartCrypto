"""
Pydantic request/response models for the FastAPI endpoints.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ─── Enum ─────────────────────────────────────────────────────────────────────

class VettingStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    APPROVED  = "approved"
    REVIEW    = "flagged_for_review"
    REJECTED  = "rejected"
    ERROR     = "error"


# ─── Request ──────────────────────────────────────────────────────────────────

class VetCampaignRequest(BaseModel):
    contract_address: str = Field(
        ...,
        description="On-chain address of the deployed Campaign contract",
        examples=["0xAbCd1234..."],
    )


# ─── LangGraph state ──────────────────────────────────────────────────────────

class VettingState(BaseModel):
    """Typed state that flows through every LangGraph node."""

    # Input
    contract_address: str

    # Node 1 — extract
    campaign_id:       Optional[str]   = None
    title:             Optional[str]   = None
    description:       Optional[str]   = None
    goal_wei:          Optional[str]   = None
    creator_address:   Optional[str]   = None
    category:          Optional[str]   = None

    # Node 2 — wallet check
    wallet_age_days:     Optional[int]   = None
    wallet_tx_count:     Optional[int]   = None
    wallet_on_blocklist: Optional[bool]  = None
    wallet_score:        Optional[float] = None   # 0–1, 1 = clean

    # Node 3 — content check
    content_score:  Optional[float]      = None   # 0–1, 1 = clean
    content_flags:  List[str]            = Field(default_factory=list)

    # Node 4 — risk scorer
    risk_score: Optional[float] = None            # 0–1, 1 = highest risk

    # Node 5 → routing decision
    routing_decision: Optional[str] = None        # auto_approve | flag_for_review | auto_reject

    # Node 6 — notify
    vetting_status:   VettingStatus = VettingStatus.PENDING
    vetting_reasons:  List[str]     = Field(default_factory=list)
    completed_at:     Optional[datetime] = None

    # Error tracking
    error: Optional[str] = None


# ─── Responses ────────────────────────────────────────────────────────────────

class VetCampaignResponse(BaseModel):
    contract_address: str
    vetting_status:   VettingStatus
    message:          str


class VettingStatusResponse(BaseModel):
    contract_address:   str
    vetting_status:     Optional[str]
    vetting_score:      Optional[float]
    vetting_reasons:    Optional[List[str]]
    vetting_completed_at: Optional[datetime]


# ─── Pre-vet (before deployment — no DB row needed) ───────────────────────────

class PreVetRequest(BaseModel):
    """Raw form data sent from the Create Campaign page before on-chain deploy."""
    title:            str
    description:      str
    goal_eth:         float
    category:         str = "Other"
    creator_address:  str


class PreVetResponse(BaseModel):
    risk_score:       float          # 0–1, 1 = highest risk
    verdict:          str            # approved | flagged_for_review | rejected
    wallet_score:     Optional[float]
    content_score:    Optional[float]
    reasons:          List[str]
    wallet_age_days:  Optional[int]
    wallet_tx_count:  Optional[int]
    wallet_on_blocklist: Optional[bool]
    can_deploy:       bool           # True if risk_score < HIGH_THRESHOLD
