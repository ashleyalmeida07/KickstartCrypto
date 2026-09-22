"""
KickstartCrypto — Agentic Backend
FastAPI service hosting LangGraph flows.

Runs on port 8001 (Next.js stays on 3000).

Endpoints:
  POST  /pre-vet                           — run risk check on form data BEFORE deploy
  POST  /vet-campaign                      — trigger campaign vetting (post-deploy)
  GET   /vetting-status/{contract_address} — poll vetting result
  POST  /donor-support/query               — submit a donor support query
  GET   /donor-support/ticket/{id}         — poll a support ticket
  GET   /donor-support/tickets             — admin: escalated ticket queue
  POST  /donor-support/resolve/{id}        — admin: resolve a support ticket
  POST  /milestone-proof/submit            — submit milestone proof (async, 202)
  GET   /milestone-proof/queue             — admin: proofs awaiting review
  GET   /milestone-proof/campaign/{addr}   — all proofs for one campaign
  GET   /milestone-proof/{proof_id}        — poll a proof verification result
  POST  /milestone-proof/resolve/{id}      — admin: approve/reject a queued proof
  GET   /health                            — health check
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from db import get_pool, close_pool
from db.config import settings
from models.schemas import (
    VetCampaignRequest,
    VetCampaignResponse,
    VettingStatusResponse,
    VettingStatus,
    PreVetRequest,
    PreVetResponse,
)
from models.support_schemas import (
    SupportQueryRequest,
    SupportQueryResponse,
    TicketStatusResponse,
    ResolveTicketRequest,
    TicketStatus,
    SupportState,
)
from models.milestone_schemas import (
    SubmitProofRequest,
    SubmitProofResponse,
    ProofStatusResponse,
    ResolveProofRequest,
    ProofStatus,
    ProofType,
)
from graph import vetting_graph
from graph.donor_support import donor_support_graph
from graph.milestone_proof import milestone_proof_graph
from crew.crew import run_admin_report_crew
from graph.nodes.wallet_check import check_wallet_history
from graph.nodes.content_check import content_authenticity_check
from graph.nodes.risk_scorer import risk_scorer
from graph.nodes.router import conditional_router
from graph.nodes.auto_settle import run_settlement_sweep

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Shared state for the settlement engine status
_last_sweep_result: dict = {"status": "not_run_yet"}


# ─── App lifecycle ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: warm up DB pool, create tables, re-queue stuck campaigns."""
    logger.info("🚀 Agent backend starting up…")
    pool = await get_pool()
    logger.info("✅ DB pool ready.")

    # ── Ensure support_tickets table exists ──────────────────────────────────
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS support_tickets (
                id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                donor_address     TEXT NOT NULL,
                campaign_address  TEXT,
                message           TEXT NOT NULL,
                intent            TEXT,
                context_json      JSONB,
                draft_response    TEXT,
                final_response    TEXT,
                status            TEXT DEFAULT 'open',
                escalation_reason TEXT,
                created_at        TIMESTAMPTZ DEFAULT NOW(),
                resolved_at       TIMESTAMPTZ,
                resolved_by       TEXT
            )
        """)
    logger.info("✅ support_tickets table ready.")

    # ── Ensure Flow 3 milestone proof tables exist ───────────────────────────
    # Mirrors database/milestone_proof_migration.sql so the service is
    # self-bootstrapping in dev; run the migration file in prod.
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS milestone_proofs (
                id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                campaign_id         UUID REFERENCES campaigns(id)  ON DELETE CASCADE,
                campaign_address    TEXT NOT NULL,
                milestone_id        UUID REFERENCES milestones(id) ON DELETE CASCADE,
                milestone_index     INTEGER NOT NULL,
                submitted_by        TEXT NOT NULL,
                proof_type          TEXT NOT NULL,
                proof_url           TEXT,
                proof_text          TEXT,
                claimed_spend_wei   NUMERIC,
                parsed_content      TEXT,
                ocr_confidence      NUMERIC,
                onchain_outflow_wei NUMERIC,
                onchain_tx_count    INTEGER,
                spend_match_score   NUMERIC,
                consistency_score   NUMERIC,
                consistency_notes   TEXT,
                confidence          NUMERIC,
                reasons             TEXT,
                status              TEXT NOT NULL DEFAULT 'pending',
                verdict             TEXT,
                routing_decision    TEXT,
                tranche_wei         NUMERIC,
                reviewed_by         TEXT,
                review_notes        TEXT,
                reviewed_at         TIMESTAMPTZ,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                verified_at         TIMESTAMPTZ
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_proofs_campaign ON milestone_proofs(campaign_address)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_proofs_status ON milestone_proofs(status)"
        )
        await conn.execute("""
            ALTER TABLE milestones
                ADD COLUMN IF NOT EXISTS payout_status    TEXT DEFAULT 'locked',
                ADD COLUMN IF NOT EXISTS proof_status     TEXT DEFAULT 'none',
                ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ
        """)
    logger.info("✅ milestone_proofs table ready.")

    # ── Auto-retry pending/crashed campaigns ──────────────────────────────────
    async with pool.acquire() as conn:
        stuck = await conn.fetch(
            "SELECT contract_address, title FROM campaigns "
            "WHERE vetting_status IN ('pending', 'running') "
            "ORDER BY created_at DESC LIMIT 50"
        )
    if stuck:
        logger.info(f"🔄 Found {len(stuck)} campaign(s) awaiting vetting — queuing now…")
        for row in stuck:
            logger.info(f"   → Queuing: {row['title']} ({row['contract_address']})")
            asyncio.create_task(run_vetting_graph(row["contract_address"]))
    else:
        logger.info("✅ No pending campaigns to retry.")

    # ── Auto-retry proofs interrupted mid-verification ───────────────────────
    async with pool.acquire() as conn:
        stuck_proofs = await conn.fetch(
            "SELECT id::text AS id, campaign_address, milestone_index FROM milestone_proofs "
            "WHERE status IN ('pending', 'running') "
            "ORDER BY created_at DESC LIMIT 50"
        )
    if stuck_proofs:
        logger.info(f"🔄 Found {len(stuck_proofs)} proof(s) awaiting verification — queuing now…")
        for row in stuck_proofs:
            logger.info(
                f"   → Queuing proof {row['id']} "
                f"({row['campaign_address']} #{row['milestone_index']})"
            )
            asyncio.create_task(run_milestone_proof_graph(row["id"]))
    else:
        logger.info("✅ No pending proofs to retry.")

    # ── Start auto-settlement background loop ────────────────────────────────
    if settings.PLATFORM_PRIVATE_KEY:
        async def _settlement_loop():
            global _last_sweep_result
            interval = settings.SETTLE_INTERVAL_SECONDS
            logger.info(f"⏰  Settlement engine active — sweeping every {interval}s")
            while True:
                try:
                    pool = await get_pool()
                    result = await run_settlement_sweep(pool)
                    result["status"] = "ok"
                    _last_sweep_result = result
                except Exception as e:
                    logger.error(f"[settle_loop] Error: {e}")
                    _last_sweep_result = {"status": "error", "error": str(e)}
                await asyncio.sleep(interval)
        asyncio.create_task(_settlement_loop())
    else:
        logger.warning(
            "⚠️  PLATFORM_PRIVATE_KEY not set — auto-settlement disabled. "
            "Add it to agent_backend/.env and restart."
        )

    yield
    logger.info("🛑 Agent backend shutting down…")
    await close_pool()


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="KickstartCrypto Agentic API",
    description="LangGraph-powered agentic flows for campaign vetting, donor support, and admin monitoring.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.NEXTJS_URL, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Background runner ────────────────────────────────────────────────────────

async def run_vetting_graph(contract_address: str) -> None:
    """
    Execute the LangGraph campaign vetting graph in the background.
    Marks campaign as 'running' first, then runs the full graph.
    """
    pool = await get_pool()

    # Mark as running
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE campaigns SET vetting_status = 'running', updated_at = NOW() "
                "WHERE LOWER(contract_address) = LOWER($1)",
                contract_address,
            )
    except Exception as exc:
        logger.error(f"[run_vetting] Could not mark as running: {exc}")

    # Run the graph
    try:
        initial_state = {"contract_address": contract_address}
        result = await vetting_graph.ainvoke(initial_state)
        logger.info(
            f"[run_vetting] Completed: {contract_address} → "
            f"status={result.get('vetting_status')} score={result.get('risk_score')}"
        )
    except Exception as exc:
        logger.error(f"[run_vetting] Graph error: {exc}", exc_info=True)
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE campaigns SET vetting_status = 'error', updated_at = NOW() "
                    "WHERE LOWER(contract_address) = LOWER($1)",
                    contract_address,
                )
        except Exception:
            pass


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Basic health check — returns 200 if the service is up."""
    return {"status": "ok", "service": "kickstart-crypto-agent-backend", "version": "1.0.0"}


@app.post("/pre-vet", response_model=PreVetResponse)
async def pre_vet(body: PreVetRequest):
    """
    Synchronous pre-deployment risk check.

    Call this BEFORE the user deploys on-chain.
    Takes raw form data, runs wallet + content checks, returns a risk score.
    Typically completes in 5-20 seconds.
    """
    from models.schemas import VettingState, VettingStatus
    from decimal import Decimal

    logger.info(f"[pre-vet] Checking: '{body.title}' by {body.creator_address}")

    # Build a fake VettingState from form data (skips the DB extract node)
    goal_wei = str(int(body.goal_eth * 1e18))
    state = VettingState(
        contract_address="0x_preview",
        title=body.title,
        description=body.description,
        goal_wei=goal_wei,
        creator_address=body.creator_address,
        category=body.category,
    )

    # ── Run wallet check ─────────────────────────────────────────────────────
    wallet_result = await check_wallet_history(state)
    state = state.model_copy(update=wallet_result)

    # ── Run content check ────────────────────────────────────────────────────
    content_result = await content_authenticity_check(state)
    state = state.model_copy(update=content_result)

    # ── Score ────────────────────────────────────────────────────────────────
    score_result = await risk_scorer(state)
    state = state.model_copy(update=score_result)

    risk_score = state.risk_score or 0.5
    verdict    = conditional_router(state)

    logger.info(
        f"[pre-vet] '{body.title}' → risk={risk_score:.3f} verdict={verdict} "
        f"wallet={state.wallet_score} content={state.content_score}"
    )

    return PreVetResponse(
        risk_score           = risk_score,
        verdict              = verdict,
        wallet_score         = state.wallet_score,
        content_score        = state.content_score,
        reasons              = state.vetting_reasons or [],
        wallet_age_days      = state.wallet_age_days,
        wallet_tx_count      = state.wallet_tx_count,
        wallet_on_blocklist  = state.wallet_on_blocklist,
        can_deploy           = risk_score <= settings.RISK_HIGH_THRESHOLD,
    )



@app.post("/vet-campaign", response_model=VetCampaignResponse, status_code=202)
async def vet_campaign(
    body: VetCampaignRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger asynchronous campaign vetting.

    Returns 202 immediately; the LangGraph graph runs in the background.
    Poll GET /vetting-status/{contract_address} for the result.
    """
    address = body.contract_address.lower()
    logger.info(f"[POST /vet-campaign] Received vetting request for {address}")

    pool = await get_pool()

    # Verify campaign exists
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, vetting_status FROM campaigns WHERE LOWER(contract_address) = $1",
            address,
        )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Campaign {address} not found. Ensure it has been saved to the database first.",
        )

    current_status = row["vetting_status"]
    if current_status == "running":
        return VetCampaignResponse(
            contract_address=address,
            vetting_status=VettingStatus.RUNNING,
            message="Vetting already in progress.",
        )

    # Fire the graph in the background
    background_tasks.add_task(run_vetting_graph, address)

    return VetCampaignResponse(
        contract_address=address,
        vetting_status=VettingStatus.RUNNING,
        message="Vetting started. Poll /vetting-status/{address} for results.",
    )


@app.get("/vetting-status/{contract_address}", response_model=VettingStatusResponse)
async def vetting_status(contract_address: str):
    """
    Poll the vetting result for a campaign.
    Returns the current vetting_status, score, and reasons from the DB.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                contract_address,
                vetting_status,
                vetting_score,
                vetting_reasons,
                vetting_completed_at
            FROM campaigns
            WHERE LOWER(contract_address) = LOWER($1)
            """,
            contract_address,
        )

    if row is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    reasons = None
    if row["vetting_reasons"]:
        try:
            reasons = json.loads(row["vetting_reasons"])
        except (json.JSONDecodeError, TypeError):
            reasons = [row["vetting_reasons"]]

    return VettingStatusResponse(
        contract_address=row["contract_address"],
        vetting_status=row["vetting_status"],
        vetting_score=float(row["vetting_score"]) if row["vetting_score"] is not None else None,
        vetting_reasons=reasons,
        vetting_completed_at=row["vetting_completed_at"],
    )



# ─── Donor Support Flow 2 endpoints ──────────────────────────────────────────

async def run_support_graph(ticket_id: str) -> None:
    """Background runner for the donor support LangGraph."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT donor_address, campaign_address, message FROM support_tickets WHERE id = $1",
            ticket_id,
        )
    if not row:
        logger.error(f"[support_graph] ticket {ticket_id} not found")
        return

    initial_state = {
        "ticket_id":        ticket_id,
        "donor_address":    row["donor_address"],
        "campaign_address": row["campaign_address"],
        "message":          row["message"],
    }
    try:
        await donor_support_graph.ainvoke(initial_state)
        logger.info(f"[support_graph] ticket={ticket_id} completed")
    except Exception as exc:
        logger.error(f"[support_graph] ticket={ticket_id} error: {exc}", exc_info=True)
        pool2 = await get_pool()
        async with pool2.acquire() as conn:
            await conn.execute(
                "UPDATE support_tickets SET status='error' WHERE id=$1", ticket_id
            )


@app.post("/donor-support/query", response_model=SupportQueryResponse, status_code=202)
async def donor_support_query(
    body: SupportQueryRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit a donor support query.
    Creates a ticket, fires the LangGraph in the background.
    Poll GET /donor-support/ticket/{id} for the response.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO support_tickets (donor_address, campaign_address, message, status)
            VALUES ($1, $2, $3, 'running')
            RETURNING id::text
            """,
            body.donor_address.lower(),
            (body.campaign_address or "").lower() or None,
            body.message,
        )
    ticket_id = row["id"]
    logger.info(f"[POST /donor-support/query] Created ticket={ticket_id}")

    background_tasks.add_task(run_support_graph, ticket_id)

    return SupportQueryResponse(
        ticket_id=ticket_id,
        status="running",
        message="Your query has been received. Poll /donor-support/ticket/{id} for a response.",
    )


@app.get("/donor-support/ticket/{ticket_id}", response_model=TicketStatusResponse)
async def get_support_ticket(ticket_id: str):
    """Poll the status and response for a support ticket."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id::text, status, intent, draft_response, final_response,
                   escalation_reason, created_at, resolved_at
            FROM support_tickets WHERE id = $1::uuid
            """,
            ticket_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    return TicketStatusResponse(
        ticket_id         = row["id"],
        status            = row["status"],
        intent            = row["intent"],
        draft_response    = row["draft_response"],
        final_response    = row["final_response"],
        escalation_reason = row["escalation_reason"],
        created_at        = row["created_at"],
        resolved_at       = row["resolved_at"],
    )


@app.get("/donor-support/tickets")
async def list_escalated_tickets():
    """Admin: list all escalated (pending human review) tickets."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text, donor_address, campaign_address, message, intent,
                   draft_response, status, escalation_reason, created_at
            FROM support_tickets
            WHERE status IN ('escalated', 'open', 'running')
            ORDER BY created_at DESC LIMIT 100
            """
        )
    return [{**dict(r), "id": r["id"]} for r in rows]


@app.post("/donor-support/resolve/{ticket_id}")
async def resolve_ticket(ticket_id: str, body: ResolveTicketRequest):
    """
    Admin: resolve an escalated support ticket.
    action = 'approve'  → send the existing draft as-is
    action = 'edit'     → send the edited_response instead
    action = 'reject'   → close without sending (mark rejected)
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, status, draft_response FROM support_tickets WHERE id = $1::uuid",
            ticket_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    if row["status"] not in ("escalated", "open"):
        raise HTTPException(
            status_code=400,
            detail=f"Ticket is in status '{row['status']}' — cannot resolve.",
        )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    if body.action == "approve":
        final = row["draft_response"] or ""
        new_status = TicketStatus.RESOLVED
    elif body.action == "edit":
        if not body.edited_response:
            raise HTTPException(status_code=400, detail="edited_response required for action=edit")
        final = body.edited_response
        new_status = TicketStatus.RESOLVED
    elif body.action == "reject":
        final = None
        new_status = TicketStatus.CLOSED
    else:
        raise HTTPException(status_code=400, detail="action must be approve | edit | reject")

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE support_tickets
            SET final_response = $1,
                status         = $2,
                resolved_at    = $3,
                resolved_by    = $4
            WHERE id = $5::uuid
            """,
            final, new_status, now, body.resolved_by, ticket_id,
        )

    logger.info(f"[resolve_ticket] ticket={ticket_id} action={body.action} by={body.resolved_by}")
    return {"ticket_id": ticket_id, "action": body.action, "status": new_status}


# ─── Milestone Proof Verification (Flow 3) endpoints ─────────────────────────

WEI_PER_ETH = Decimal("1000000000000000000")


def _eth(wei) -> float | None:
    """NUMERIC wei column → ETH float."""
    if wei is None:
        return None
    return float(Decimal(str(wei)) / WEI_PER_ETH)


def _valid_uuid(value: str) -> str:
    """Reject malformed ids before they reach a ::uuid cast."""
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="Malformed proof id.")


def _parse_reasons(raw) -> list[str] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else [str(parsed)]
    except (json.JSONDecodeError, TypeError):
        return [str(raw)]


async def run_milestone_proof_graph(proof_id: str) -> None:
    """
    Execute the milestone proof verification graph in the background.
    Marks the proof 'running' first, then runs the full graph.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT campaign_address, milestone_index, submitted_by,
                   proof_type, proof_url, proof_text,
                   claimed_spend_wei::text AS claimed_spend_wei
            FROM milestone_proofs
            WHERE id = $1::uuid
            """,
            proof_id,
        )

    if row is None:
        logger.error(f"[proof_graph] proof {proof_id} not found")
        return

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE milestone_proofs SET status = 'running' WHERE id = $1::uuid",
                proof_id,
            )
    except Exception as exc:
        logger.error(f"[proof_graph] Could not mark as running: {exc}")

    claimed_eth = None
    if row["claimed_spend_wei"]:
        claimed_eth = float(Decimal(row["claimed_spend_wei"]) / WEI_PER_ETH)

    initial_state = {
        "proof_id":          proof_id,
        "campaign_address":  row["campaign_address"],
        "milestone_index":   row["milestone_index"],
        "submitted_by":      row["submitted_by"],
        "proof_type":        row["proof_type"],
        "proof_url":         row["proof_url"],
        "proof_text":        row["proof_text"],
        "claimed_spend_eth": claimed_eth,
    }

    try:
        result = await milestone_proof_graph.ainvoke(initial_state)
        # The graph state is a Pydantic model, so the return may be a dict of
        # channels or the coerced model depending on LangGraph's output mode.
        summary = result if isinstance(result, dict) else dict(result)
        logger.info(
            f"[proof_graph] Completed: {proof_id} → "
            f"status={summary.get('proof_status')} confidence={summary.get('confidence')} "
            f"decision={summary.get('routing_decision')}"
        )
    except Exception as exc:
        logger.error(f"[proof_graph] Graph error: {exc}", exc_info=True)
        try:
            async with pool.acquire() as conn:
                # Only overwrite if the graph never reached notify — a failure
                # after the verdict was written must not erase it.
                await conn.execute(
                    """
                    UPDATE milestone_proofs
                    SET status = 'error', verified_at = NOW(), reasons = $2
                    WHERE id = $1::uuid
                      AND status IN ('pending', 'running')
                    """,
                    proof_id,
                    json.dumps([f"graph_error: {exc}"]),
                )
        except Exception:
            pass


@app.post("/milestone-proof/submit", response_model=SubmitProofResponse, status_code=202)
async def submit_milestone_proof(
    body: SubmitProofRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit proof that a milestone was completed, to unlock its tranche.

    Returns 202 immediately; the LangGraph flow runs in the background.
    Poll GET /milestone-proof/{proof_id} for the verdict.

    Accepted proof types: image (receipts, progress photos), pdf (invoices,
    contracts), link (GitHub commit, deployed URL, video), or text alone.
    A short text description is allowed alongside any of the others.
    """
    address = body.campaign_address.lower()

    # ── Shape validation ─────────────────────────────────────────────────────
    if body.proof_type == ProofType.TEXT:
        if not (body.proof_text or "").strip():
            raise HTTPException(
                status_code=400,
                detail="proof_text is required when proof_type is 'text'.",
            )
    elif not (body.proof_url or "").strip():
        raise HTTPException(
            status_code=400,
            detail=f"proof_url is required when proof_type is '{body.proof_type.value}'.",
        )

    pool = await get_pool()

    async with pool.acquire() as conn:
        milestone = await conn.fetchrow(
            """
            SELECT c.id::text AS campaign_id, c.creator_address, c.title,
                   m.id::text AS milestone_id, m.title AS milestone_title,
                   m.payout_status
            FROM campaigns c
            JOIN milestones m ON m.campaign_id = c.id
            WHERE LOWER(c.contract_address) = $1
              AND m.milestone_index = $2
            """,
            address,
            body.milestone_index,
        )

    if milestone is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No milestone at index {body.milestone_index} for campaign {address}. "
                "Ensure the campaign and its milestone plan are saved to the database."
            ),
        )

    # ── Only the creator can submit proof for their own milestone ────────────
    if body.submitted_by.lower() != (milestone["creator_address"] or "").lower():
        raise HTTPException(
            status_code=403,
            detail="Only the campaign creator can submit milestone proof.",
        )

    # ── Don't re-verify an already cleared tranche ───────────────────────────
    if milestone["payout_status"] in ("ready_for_release", "released"):
        raise HTTPException(
            status_code=409,
            detail=f"Milestone '{milestone['milestone_title']}' is already verified.",
        )

    # ── One verification at a time per milestone ─────────────────────────────
    async with pool.acquire() as conn:
        inflight = await conn.fetchrow(
            """
            SELECT id::text AS id, status FROM milestone_proofs
            WHERE milestone_id = $1::uuid
              AND status IN ('pending', 'running', 'pending_review')
            ORDER BY created_at DESC LIMIT 1
            """,
            milestone["milestone_id"],
        )

    if inflight:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A proof for this milestone is already {inflight['status']} "
                f"(id {inflight['id']})."
            ),
        )

    claimed_wei = (
        (Decimal(str(body.claimed_spend_eth)) * WEI_PER_ETH).quantize(Decimal("1"))
        if body.claimed_spend_eth is not None else None
    )

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO milestone_proofs
                (campaign_id, campaign_address, milestone_id, milestone_index,
                 submitted_by, proof_type, proof_url, proof_text,
                 claimed_spend_wei, status)
            VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9, 'pending')
            RETURNING id::text
            """,
            milestone["campaign_id"],
            address,
            milestone["milestone_id"],
            body.milestone_index,
            body.submitted_by.lower(),
            body.proof_type.value,
            (body.proof_url or "").strip() or None,
            (body.proof_text or "").strip() or None,
            claimed_wei,
        )
        await conn.execute(
            "UPDATE milestones SET proof_status = 'submitted' WHERE id = $1::uuid",
            milestone["milestone_id"],
        )

    proof_id = row["id"]
    logger.info(
        f"[POST /milestone-proof/submit] proof={proof_id} campaign={address} "
        f"milestone={body.milestone_index} type={body.proof_type.value}"
    )

    background_tasks.add_task(run_milestone_proof_graph, proof_id)

    return SubmitProofResponse(
        proof_id=proof_id,
        status=ProofStatus.RUNNING.value,
        message="Proof received and being verified. Poll /milestone-proof/{id} for the result.",
    )


@app.get("/milestone-proof/queue")
async def milestone_proof_queue():
    """Admin: proofs the flow could not decide on, awaiting human review."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id::text AS id, p.campaign_address, p.milestone_index,
                   p.submitted_by, p.proof_type, p.proof_url, p.proof_text,
                   p.claimed_spend_wei::text, p.onchain_outflow_wei::text,
                   p.onchain_tx_count, p.tranche_wei::text,
                   p.ocr_confidence, p.spend_match_score, p.consistency_score,
                   p.consistency_notes, p.confidence, p.reasons, p.status,
                   p.verdict, p.parsed_content, p.created_at, p.verified_at,
                   c.title AS campaign_title,
                   m.title AS milestone_title, m.description AS milestone_description,
                   m.percentage
            FROM milestone_proofs p
            LEFT JOIN campaigns  c ON c.id = p.campaign_id
            LEFT JOIN milestones m ON m.id = p.milestone_id
            WHERE p.status IN ('pending_review', 'pending', 'running', 'error')
            ORDER BY p.created_at DESC
            LIMIT 100
            """
        )

    return [
        {
            "id":                    r["id"],
            "campaign_address":      r["campaign_address"],
            "campaign_title":        r["campaign_title"],
            "milestone_index":       r["milestone_index"],
            "milestone_title":       r["milestone_title"],
            "milestone_description": r["milestone_description"],
            "percentage":            r["percentage"],
            "submitted_by":          r["submitted_by"],
            "proof_type":            r["proof_type"],
            "proof_url":             r["proof_url"],
            "proof_text":            r["proof_text"],
            "parsed_content":        (r["parsed_content"] or "")[:2000] or None,
            "claimed_spend_eth":     _eth(r["claimed_spend_wei"]),
            "onchain_outflow_eth":   _eth(r["onchain_outflow_wei"]),
            "onchain_tx_count":      r["onchain_tx_count"],
            "tranche_eth":           _eth(r["tranche_wei"]),
            "ocr_confidence":        float(r["ocr_confidence"])    if r["ocr_confidence"]    is not None else None,
            "spend_match_score":     float(r["spend_match_score"]) if r["spend_match_score"] is not None else None,
            "consistency_score":     float(r["consistency_score"]) if r["consistency_score"] is not None else None,
            "consistency_notes":     r["consistency_notes"],
            "confidence":            float(r["confidence"])        if r["confidence"]        is not None else None,
            "reasons":               _parse_reasons(r["reasons"]),
            "status":                r["status"],
            "verdict":               r["verdict"],
            "created_at":            r["created_at"],
            "verified_at":           r["verified_at"],
        }
        for r in rows
    ]


@app.get("/milestone-proof/campaign/{contract_address}")
async def milestone_proofs_for_campaign(contract_address: str):
    """Every proof submitted for one campaign, newest first — used by the creator's manage page."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id::text AS id, p.milestone_index, p.proof_type, p.proof_url,
                   p.status, p.verdict, p.confidence, p.consistency_notes,
                   p.claimed_spend_wei::text, p.onchain_outflow_wei::text,
                   p.tranche_wei::text, p.reasons, p.review_notes,
                   p.created_at, p.verified_at,
                   m.title AS milestone_title, m.payout_status
            FROM milestone_proofs p
            LEFT JOIN milestones m ON m.id = p.milestone_id
            WHERE LOWER(p.campaign_address) = LOWER($1)
            ORDER BY p.created_at DESC
            LIMIT 100
            """,
            contract_address,
        )

    return [
        {
            "id":                  r["id"],
            "milestone_index":     r["milestone_index"],
            "milestone_title":     r["milestone_title"],
            "proof_type":          r["proof_type"],
            "proof_url":           r["proof_url"],
            "status":              r["status"],
            "verdict":             r["verdict"],
            "confidence":          float(r["confidence"]) if r["confidence"] is not None else None,
            "consistency_notes":   r["consistency_notes"],
            "claimed_spend_eth":   _eth(r["claimed_spend_wei"]),
            "onchain_outflow_eth": _eth(r["onchain_outflow_wei"]),
            "tranche_eth":         _eth(r["tranche_wei"]),
            "payout_status":       r["payout_status"],
            "reasons":             _parse_reasons(r["reasons"]),
            "review_notes":        r["review_notes"],
            "created_at":          r["created_at"],
            "verified_at":         r["verified_at"],
        }
        for r in rows
    ]


@app.get("/milestone-proof/{proof_id}", response_model=ProofStatusResponse)
async def get_milestone_proof(proof_id: str):
    """Poll the verification result for a single proof submission."""
    pid = _valid_uuid(proof_id)

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.id::text AS id, p.campaign_address, p.milestone_index,
                   p.proof_type, p.status, p.verdict, p.confidence,
                   p.ocr_confidence, p.spend_match_score, p.consistency_score,
                   p.consistency_notes, p.onchain_outflow_wei::text,
                   p.claimed_spend_wei::text, p.tranche_wei::text,
                   p.reasons, p.created_at, p.verified_at,
                   m.title AS milestone_title, m.payout_status
            FROM milestone_proofs p
            LEFT JOIN milestones m ON m.id = p.milestone_id
            WHERE p.id = $1::uuid
            """,
            pid,
        )

    if row is None:
        raise HTTPException(status_code=404, detail="Proof not found.")

    return ProofStatusResponse(
        proof_id            = row["id"],
        campaign_address    = row["campaign_address"],
        milestone_index     = row["milestone_index"],
        milestone_title     = row["milestone_title"],
        proof_type          = row["proof_type"],
        status              = row["status"],
        verdict             = row["verdict"],
        confidence          = float(row["confidence"])        if row["confidence"]        is not None else None,
        ocr_confidence      = float(row["ocr_confidence"])    if row["ocr_confidence"]    is not None else None,
        spend_match_score   = float(row["spend_match_score"]) if row["spend_match_score"] is not None else None,
        consistency_score   = float(row["consistency_score"]) if row["consistency_score"] is not None else None,
        consistency_notes   = row["consistency_notes"],
        onchain_outflow_eth = _eth(row["onchain_outflow_wei"]),
        claimed_spend_eth   = _eth(row["claimed_spend_wei"]),
        tranche_eth         = _eth(row["tranche_wei"]),
        payout_status       = row["payout_status"],
        reasons             = _parse_reasons(row["reasons"]),
        created_at          = row["created_at"],
        verified_at         = row["verified_at"],
    )


@app.post("/milestone-proof/resolve/{proof_id}")
async def resolve_milestone_proof(proof_id: str, body: ResolveProofRequest):
    """
    Admin: decide a proof the flow routed to the queue.

    action = 'approve' → milestone verified, tranche cleared for release
    action = 'reject'  → milestone rejected, tranche withheld

    This does not resume the graph. Every node has already run and written its
    output; a human override only needs to replace the verdict.
    """
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve | reject")

    pid  = _valid_uuid(proof_id)
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.status, p.milestone_id::text AS milestone_id, p.campaign_address,
                   p.milestone_index, m.title AS milestone_title
            FROM milestone_proofs p
            LEFT JOIN milestones m ON m.id = p.milestone_id
            WHERE p.id = $1::uuid
            """,
            pid,
        )

    if row is None:
        raise HTTPException(status_code=404, detail="Proof not found.")

    if row["status"] not in ("pending_review", "error"):
        raise HTTPException(
            status_code=400,
            detail=f"Proof is in status '{row['status']}' — only queued proofs can be resolved.",
        )

    now = datetime.now(timezone.utc)

    if body.action == "approve":
        proof_status, verdict = ProofStatus.APPROVED.value, "admin_approved"
        milestone_status, milestone_proof_status, payout_status = (
            "approved", "verified", "ready_for_release",
        )
    else:
        proof_status, verdict = ProofStatus.REJECTED.value, "rejected"
        milestone_status, milestone_proof_status, payout_status = (
            "rejected", "rejected", "withheld",
        )

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE milestone_proofs
                SET status       = $1,
                    verdict      = $2,
                    review_notes = $3,
                    reviewed_by  = $4,
                    reviewed_at  = $5,
                    verified_at  = COALESCE(verified_at, $5)
                WHERE id = $6::uuid
                """,
                proof_status, verdict, body.review_notes, body.reviewed_by, now, pid,
            )
            if row["milestone_id"]:
                await conn.execute(
                    """
                    UPDATE milestones
                    SET status           = $1,
                        proof_status     = $2,
                        payout_status    = $3,
                        last_verified_at = $4
                    WHERE id = $5::uuid
                    """,
                    milestone_status, milestone_proof_status, payout_status, now,
                    row["milestone_id"],
                )

    logger.info(
        f"[resolve_proof] proof={pid} action={body.action} by={body.reviewed_by} "
        f"→ milestone '{row['milestone_title']}' payout={payout_status}"
    )

    return {
        "proof_id":      pid,
        "action":        body.action,
        "status":        proof_status,
        "payout_status": payout_status,
    }


# ─── CrewAI Admin Reporting ───────────────────────────────────────────────────

@app.post("/admin/report/generate", status_code=202)
async def generate_admin_report(background_tasks: BackgroundTasks):
    """
    Trigger the CrewAI agents to generate an admin report asynchronously.
    """
    async def _run_and_save():
        try:
            pool = await get_pool()
            # Run the CrewAI kickoff in a thread to avoid blocking the event loop
            report_md = await asyncio.to_thread(run_admin_report_crew)
            
            # Save the report to the database
            async with pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO admin_reports (report_markdown) VALUES ($1)",
                    report_md
                )
            logger.info("CrewAI Admin Report generated and saved to DB.")
        except Exception as e:
            logger.error(f"Error generating Admin Report: {e}")

    background_tasks.add_task(_run_and_save)
    return {"message": "CrewAI reporting agents kicked off in the background."}

@app.get("/admin/reports")
async def get_admin_reports():
    """Fetch all generated admin reports, descending by creation date."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, created_at, report_markdown FROM admin_reports ORDER BY created_at DESC")
        return [dict(r) for r in rows]

# ─── Auto-Settlement Engine ───────────────────────────────────────────────────

@app.post("/admin/settle/run", status_code=202)
async def manual_settle_run(background_tasks: BackgroundTasks):
    """
    Manually trigger an immediate settlement sweep.
    Useful for testing or forcing settlement outside the automatic schedule.
    """
    async def _sweep():
        global _last_sweep_result
        try:
            pool = await get_pool()
            result = await run_settlement_sweep(pool)
            result["status"] = "ok"
            _last_sweep_result = result
        except Exception as e:
            logger.error(f"[manual settle] Error: {e}")
            _last_sweep_result = {"status": "error", "error": str(e)}

    background_tasks.add_task(_sweep)
    return {"message": "Settlement sweep triggered. Check /admin/settle/status for results."}


@app.get("/admin/settle/status")
async def get_settle_status():
    """Return the result of the most recent settlement sweep."""
    has_key = bool(settings.PLATFORM_PRIVATE_KEY)
    return {
        "engine_active":  has_key,
        "interval_seconds": settings.SETTLE_INTERVAL_SECONDS if has_key else None,
        "last_sweep":     _last_sweep_result,
    }

# ─── Dev entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("AGENT_PORT", 8001))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
