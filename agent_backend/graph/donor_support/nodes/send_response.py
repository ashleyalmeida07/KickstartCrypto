"""
Node 6a — send_response
Writes the final (auto-approved) response to the DB and marks ticket closed.

Node 6b — pause_for_human
Persists the escalated state to DB so a human admin can act on it.
The graph ends here — it will be resumed externally via the /resolve endpoint.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from db import get_pool
from models.support_schemas import SupportState, TicketStatus

logger = logging.getLogger(__name__)


async def send_response(state: SupportState) -> dict:
    """
    LangGraph node: persist auto-approved response to DB, mark ticket closed.
    """
    if state.error:
        return {}

    final = state.draft_response or "Thank you for contacting support."
    now   = datetime.now(timezone.utc)

    logger.info(f"[send_response] ticket={state.ticket_id} AUTO sending response")

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE support_tickets
                SET final_response = $1,
                    status         = $2,
                    resolved_at    = $3,
                    resolved_by    = 'auto'
                WHERE id = $4
                """,
                final,
                TicketStatus.CLOSED,
                now,
                state.ticket_id,
            )
    except Exception as exc:
        logger.error(f"[send_response] DB write failed: {exc}", exc_info=True)

    return {
        "final_response": final,
        "ticket_status":  TicketStatus.CLOSED,
        "completed_at":   now,
    }


async def pause_for_human(state: SupportState) -> dict:
    """
    LangGraph node: persist escalated state to DB so admin can act.
    The graph terminates here; the /resolve endpoint resumes it externally.
    """
    logger.info(
        f"[pause_for_human] ticket={state.ticket_id} "
        f"reason={state.escalation_reason}"
    )

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE support_tickets
                SET status             = $1,
                    escalation_reason  = $2,
                    draft_response     = $3
                WHERE id = $4
                """,
                TicketStatus.ESCALATED,
                state.escalation_reason,
                state.draft_response,
                state.ticket_id,
            )
    except Exception as exc:
        logger.error(f"[pause_for_human] DB write failed: {exc}", exc_info=True)

    return {
        "ticket_status": TicketStatus.ESCALATED,
    }
