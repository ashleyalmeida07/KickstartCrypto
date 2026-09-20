"""
Node 3 — cross_check_onchain_spend

Compares what the creator *says* they spent against what actually left the
project's wallets since the last verified milestone.

Which addresses count as "the campaign wallet" depends on where the money is:

  • Before settle(), the Campaign contract holds every contribution — nothing
    can be spent from it, so any project spending came from the creator's own
    wallet.
  • settle() sends the whole balance to the creator, so after that the creator's
    wallet is where project spending happens.

So both are measured, with the settle() payout itself excluded — contract →
creator is money moving *within* the project, not money spent. Sends from the
creator back into the campaign contract and self-sends are excluded for the
same reason.

This node makes no LLM calls; it is data-fetching plus arithmetic.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from db.config import settings
from models.milestone_schemas import MilestoneProofState

logger = logging.getLogger(__name__)

WEI_PER_ETH = 1e18
# Etherscan caps a single page at 10 000 records; 1 000 covers any realistic
# campaign window while keeping the response small.
MAX_RECORDS = 1000


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def _etherscan_get(params: dict) -> dict:
    """GET against Etherscan with retry, matching Flow 1's client."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            settings.ETHERSCAN_BASE_URL,
            params={"apikey": settings.ETHERSCAN_API_KEY, **params},
        )
        resp.raise_for_status()
        return resp.json()


async def _fetch_txs(address: str, action: str) -> list[dict]:
    """Fetch a transaction list, tolerating Etherscan's no-results shapes."""
    try:
        data = await _etherscan_get({
            "module":     "account",
            "action":     action,
            "address":    address,
            "startblock": 0,
            "endblock":   99999999,
            "sort":       "desc",
            "page":       1,
            "offset":     MAX_RECORDS,
        })
    except Exception as exc:
        logger.warning(f"[onchain_spend] {action} fetch failed for {address}: {exc}")
        return []

    result = data.get("result")
    # Etherscan returns the string "No transactions found" instead of []
    if not isinstance(result, list):
        return []
    return result


def _sum_outflow(
    txs: list[dict],
    *,
    from_address: str,
    since_ts: int,
    exclude_to: set[str],
) -> tuple[float, int]:
    """
    Sum value sent *out* of from_address after since_ts.
    Returns (ETH total, transaction count).
    """
    total_wei = 0
    count     = 0
    sender    = from_address.lower()

    for tx in txs:
        try:
            ts = int(tx.get("timeStamp", 0))
        except (TypeError, ValueError):
            continue
        if ts < since_ts:
            continue

        if (tx.get("from") or "").lower() != sender:
            continue

        to_addr = (tx.get("to") or "").lower()
        if to_addr == sender or to_addr in exclude_to:
            continue

        # Reverted transactions moved no value
        if tx.get("isError") == "1" or tx.get("txreceipt_status") == "0":
            continue

        try:
            value = int(tx.get("value", 0))
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue

        total_wei += value
        count     += 1

    return total_wei / WEI_PER_ETH, count


def _score_match(claimed: float, actual: float, tolerance: float) -> float:
    """
    1.0 when claimed and actual agree within tolerance, decaying to 0.0 as the
    gap approaches total disagreement.
    """
    if claimed <= 0 and actual <= 0:
        return 1.0                      # nothing claimed, nothing moved
    if actual <= 0:
        return 0.0                      # claimed a spend, wallet never moved
    if claimed <= 0:
        return 0.5                      # money moved but no claim to check it against

    gap = abs(claimed - actual) / max(claimed, actual)
    if gap <= tolerance:
        return 1.0
    return max(0.0, 1.0 - (gap - tolerance) / (1.0 - tolerance))


async def cross_check_onchain_spend(state: MilestoneProofState) -> dict:
    """LangGraph node: measure real outflow and compare it to the claim."""
    if state.error:
        return {}

    creator  = (state.creator_address or "").lower()
    campaign = (state.campaign_address or "").lower()

    if not creator:
        logger.warning(f"[onchain_spend] proof={state.proof_id} has no creator address")
        return {
            "onchain_outflow_eth": 0.0,
            "onchain_tx_count":    0,
            "spend_match_score":   0.5,
            "spend_flags":         ["creator_address_unknown"],
        }

    since = state.since_ts or datetime.now(tz=timezone.utc)
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    since_ts = int(since.timestamp())

    logger.info(
        f"[onchain_spend] proof={state.proof_id} measuring outflow since "
        f"{since.isoformat()} (creator={creator})"
    )

    # ── Creator wallet: normal + internal sends, minus money going back into
    #    the campaign contract ─────────────────────────────────────────────────
    creator_normal   = await _fetch_txs(creator, "txlist")
    creator_internal = await _fetch_txs(creator, "txlistinternal")

    eth_n, count_n = _sum_outflow(
        creator_normal, from_address=creator, since_ts=since_ts, exclude_to={campaign},
    )
    eth_i, count_i = _sum_outflow(
        creator_internal, from_address=creator, since_ts=since_ts, exclude_to={campaign},
    )

    # ── Campaign contract: anything it paid out to third parties. The settle()
    #    payout to the creator is excluded — that is not a spend ───────────────
    contract_internal = await _fetch_txs(campaign, "txlistinternal")
    eth_c, count_c = _sum_outflow(
        contract_internal, from_address=campaign, since_ts=since_ts, exclude_to={creator},
    )

    outflow_eth = round(eth_n + eth_i + eth_c, 6)
    tx_count    = count_n + count_i + count_c

    # ── What are we comparing against? ────────────────────────────────────────
    flags: list[str] = []
    claimed = state.claimed_spend_eth

    if claimed is None and state.parsed_amounts_eth:
        # The creator did not state an amount, but the proof itself shows one
        claimed = max(state.parsed_amounts_eth)
        flags.append("claimed_amount_inferred_from_proof")

    if claimed is None:
        logger.info(
            f"[onchain_spend] proof={state.proof_id} no claimed amount — "
            f"outflow={outflow_eth:.4f} ETH over {tx_count} tx"
        )
        return {
            "onchain_outflow_eth": outflow_eth,
            "onchain_tx_count":    tx_count,
            # Neutral: some milestones (a shipped feature, a signed contract)
            # legitimately have no spend to verify.
            "spend_match_score":   0.5,
            "spend_flags":         flags + ["no_claimed_spend_amount"],
        }

    tolerance = settings.PROOF_SPEND_TOLERANCE
    score     = _score_match(claimed, outflow_eth, tolerance)

    if outflow_eth <= 0 and claimed > 0:
        flags.append("no_onchain_outflow_in_window")
    elif claimed > outflow_eth * (1 + tolerance):
        # The fraud-shaped direction: claiming to have spent more than left the
        # wallet. The reverse (spent more than claimed) is usually just
        # unrelated personal spending from the same wallet.
        flags.append(
            f"claimed_exceeds_onchain_outflow_{claimed:.4f}_vs_{outflow_eth:.4f}"
        )
    elif outflow_eth > claimed * (1 + tolerance):
        flags.append("onchain_outflow_exceeds_claim")

    if state.tranche_eth and claimed > state.tranche_eth * 1.5:
        flags.append(
            f"claimed_exceeds_tranche_budget_{claimed:.4f}_vs_{state.tranche_eth:.4f}"
        )

    logger.info(
        f"[onchain_spend] proof={state.proof_id} claimed={claimed:.4f} ETH "
        f"actual={outflow_eth:.4f} ETH over {tx_count} tx → score={score:.2f} flags={flags}"
    )

    return {
        "onchain_outflow_eth": outflow_eth,
        "onchain_tx_count":    tx_count,
        "spend_match_score":   round(score, 4),
        "spend_flags":         flags,
    }
