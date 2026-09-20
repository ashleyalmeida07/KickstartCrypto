"""
Pydantic schemas for the Milestone Proof Verification flow (Flow 3).

MilestoneProofState doubles as the LangGraph state schema — the graph is built
with StateGraph(MilestoneProofState), so every node receives a validated model
and returns a partial dict to merge.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class ProofType(str, Enum):
    """What the creator uploaded to back up their milestone claim."""
    IMAGE = "image"   # receipts, photos of physical progress/deliverables
    PDF   = "pdf"     # invoices, contracts, official documents
    LINK  = "link"    # GitHub commit, deployed app URL, video — intangible milestones
    TEXT  = "text"    # creator's own explanation, standing alone


class ProofStatus(str, Enum):
    PENDING        = "pending"
    RUNNING        = "running"
    AUTO_APPROVED  = "auto_approved"    # the graph cleared it
    PENDING_REVIEW = "pending_review"   # waiting for a human
    APPROVED       = "approved"         # a human cleared it
    REJECTED       = "rejected"
    ERROR          = "error"


class ProofVerdict(str, Enum):
    AUTO_APPROVED  = "auto_approved"
    NEEDS_REVIEW   = "needs_review"
    ADMIN_APPROVED = "admin_approved"
    REJECTED       = "rejected"


class PayoutStatus(str, Enum):
    LOCKED            = "locked"
    READY_FOR_RELEASE = "ready_for_release"
    RELEASED          = "released"
    WITHHELD          = "withheld"


# ─── LangGraph State ──────────────────────────────────────────────────────────

class MilestoneProofState(BaseModel):
    """State that flows through the milestone proof verification graph."""

    # ── Input ─────────────────────────────────────────────────────────────────
    proof_id:          str
    campaign_address:  str
    milestone_index:   int
    submitted_by:      str

    proof_type:        ProofType
    proof_url:         Optional[str]   = None
    proof_text:        Optional[str]   = None   # always allowed alongside any of the above
    claimed_spend_eth: Optional[float] = None

    # ── Node 1 — extract_milestone_claim ──────────────────────────────────────
    campaign_id:           Optional[str]   = None
    campaign_title:        Optional[str]   = None
    creator_address:       Optional[str]   = None
    milestone_id:          Optional[str]   = None
    milestone_title:       Optional[str]   = None
    milestone_description: Optional[str]   = None
    milestone_percentage:  Optional[int]   = None
    tranche_eth:           Optional[float] = None   # value this milestone unlocks
    raised_eth:            Optional[float] = None
    # Window start for the on-chain spend comparison — the moment the previous
    # milestone was verified, or campaign creation for the first milestone.
    since_ts:              Optional[datetime] = None

    # ── Node 2 — parse_proof ──────────────────────────────────────────────────
    parsed_content:    Optional[str]   = None
    parsed_amounts_eth: List[float]    = Field(default_factory=list)
    ocr_confidence:    Optional[float] = None   # 0–1, 1.0 = perfectly legible
    proof_flags:       List[str]       = Field(default_factory=list)

    # ── Node 3 — cross_check_onchain_spend ────────────────────────────────────
    onchain_outflow_eth: Optional[float] = None
    onchain_tx_count:    Optional[int]   = None
    spend_match_score:   Optional[float] = None   # 0–1, 1.0 = claimed matches actual
    spend_flags:         List[str]       = Field(default_factory=list)

    # ── Node 4 — consistency_check ────────────────────────────────────────────
    consistency_score: Optional[float] = None   # 0–1, 1.0 = proof matches the promise
    consistency_notes: Optional[str]   = None
    consistency_flags: List[str]       = Field(default_factory=list)

    # ── Node 5 — confidence_scorer ────────────────────────────────────────────
    confidence:           Optional[float] = None   # 0–1 composite
    verification_reasons: List[str]       = Field(default_factory=list)

    # ── Node 6/7 — router, outcome, notify ────────────────────────────────────
    routing_decision: Optional[str]          = None
    verdict:          Optional[ProofVerdict] = None
    proof_status:     ProofStatus            = ProofStatus.PENDING
    payout_status:    PayoutStatus           = PayoutStatus.LOCKED
    completed_at:     Optional[datetime]     = None

    # ── Error ─────────────────────────────────────────────────────────────────
    error: Optional[str] = None


# ─── Requests / Responses ─────────────────────────────────────────────────────

class SubmitProofRequest(BaseModel):
    campaign_address:  str = Field(..., description="Deployed Campaign contract address")
    milestone_index:   int = Field(..., ge=0, description="Index in the on-chain milestone array")
    submitted_by:      str = Field(..., description="Creator wallet address")

    proof_type:        ProofType
    proof_url:         Optional[str]   = Field(
        None,
        description="URL of the uploaded image/PDF, or the link being submitted as proof",
    )
    proof_text:        Optional[str]   = Field(
        None,
        description="Creator's own explanation — allowed alongside any proof type, or alone",
    )
    claimed_spend_eth: Optional[float] = Field(
        None, ge=0, description="ETH the creator claims to have spent on this milestone",
    )


class SubmitProofResponse(BaseModel):
    proof_id: str
    status:   str
    message:  str


class ProofStatusResponse(BaseModel):
    proof_id:            str
    campaign_address:    str
    milestone_index:     int
    milestone_title:     Optional[str]
    proof_type:          Optional[str]
    status:              str
    verdict:             Optional[str]
    confidence:          Optional[float]
    ocr_confidence:      Optional[float]
    spend_match_score:   Optional[float]
    consistency_score:   Optional[float]
    consistency_notes:   Optional[str]
    onchain_outflow_eth: Optional[float]
    claimed_spend_eth:   Optional[float]
    tranche_eth:         Optional[float]
    payout_status:       Optional[str]
    reasons:             Optional[List[str]]
    created_at:          Optional[datetime]
    verified_at:         Optional[datetime]


class ResolveProofRequest(BaseModel):
    action:       str           = Field(..., description="approve | reject")
    review_notes: Optional[str] = None
    reviewed_by:  str           = "admin"
