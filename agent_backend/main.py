"""
KickstartCrypto — Agentic Backend
FastAPI service hosting LangGraph flows.

Runs on port 8001 (Next.js stays on 3000).

Endpoints:
  POST  /pre-vet                           — run risk check on form data BEFORE deploy
  POST  /vet-campaign                      — trigger campaign vetting (post-deploy)
  GET   /vetting-status/{contract_address} — poll vetting result
  GET   /health                            — health check
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

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
from graph import vetting_graph
from graph.donor_support import donor_support_graph
from graph.nodes.wallet_check import check_wallet_history
from graph.nodes.content_check import content_authenticity_check
from graph.nodes.risk_scorer import risk_scorer
from graph.nodes.router import conditional_router

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


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
