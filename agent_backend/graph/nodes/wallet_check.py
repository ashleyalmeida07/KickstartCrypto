"""
Node 2 — check_wallet_history
Calls the Etherscan API (Sepolia testnet) to assess the creator wallet:
  - Account age (first transaction date)
  - Transaction count
  - Balance
  - Blacklist check (GoPlus Security API)

Returns wallet_score: float 0–1 (1.0 = perfectly clean, 0.0 = very risky)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from db.config import settings
from models.schemas import VettingState

logger = logging.getLogger(__name__)

# Minimum tx count to be considered an "established" wallet
MIN_TX_FOR_ESTABLISHED = 5
# Minimum wallet age in days to be considered "established"
MIN_AGE_DAYS = 30

# Known scam addresses (static fallback list — extend as needed)
KNOWN_SCAM_ADDRESSES: set[str] = set()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def _etherscan_get(params: dict) -> dict:
    """Make a GET request to Etherscan with retry logic."""
    base_params = {
        "apikey": settings.ETHERSCAN_API_KEY,
        **params,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(settings.ETHERSCAN_BASE_URL, params=base_params)
        resp.raise_for_status()
        return resp.json()


async def check_wallet_history(state: VettingState) -> dict:
    """
    LangGraph node: evaluate the creator wallet's on-chain history.
    """
    if state.error:
        # Propagate error from upstream node
        return {}

    address = state.creator_address
    if not address:
        logger.warning("[wallet_check] No creator address in state")
        return {"wallet_score": 0.5, "wallet_age_days": 0, "wallet_tx_count": 0, "wallet_on_blocklist": False}

    logger.info(f"[wallet_check] Checking wallet: {address}")

    try:
        # ── 1. Get normal transactions list ──────────────────────────────────
        tx_data = await _etherscan_get({
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": 0,
            "endblock": 99999999,
            "sort": "asc",
            "page": 1,
            "offset": 10,   # We only need the earliest tx
        })

        tx_list = tx_data.get("result", [])
        if isinstance(tx_list, str):
            # Etherscan returns a string on no-txns
            tx_list = []

        tx_count = len(tx_list)
        wallet_age_days = 0

        if tx_list:
            first_ts = int(tx_list[0].get("timeStamp", 0))
            if first_ts:
                first_dt = datetime.fromtimestamp(first_ts, tz=timezone.utc)
                wallet_age_days = (datetime.now(tz=timezone.utc) - first_dt).days

        # ── 2. Get total tx count ─────────────────────────────────────────────
        tx_count_data = await _etherscan_get({
            "module": "proxy",
            "action": "eth_getTransactionCount",
            "address": address,
            "tag": "latest",
        })
        total_tx_hex = tx_count_data.get("result", "0x0")
        try:
            total_tx_count = int(total_tx_hex, 16) if total_tx_hex else tx_count
        except ValueError:
            logger.warning(f"[wallet_check] Failed to parse Etherscan hex result: {total_tx_hex}. Falling back to page count.")
            total_tx_count = tx_count

        # ── 3. Static blocklist check ─────────────────────────────────────────
        on_blocklist = address.lower() in KNOWN_SCAM_ADDRESSES

        # ── 4. GoPlus Security check (optional, free tier) ────────────────────
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                goplus_resp = await client.get(
                    f"https://api.gopluslabs.io/api/v1/address_security/{address}",
                    params={"chain_id": "11155111"},  # Sepolia chain ID
                )
                if goplus_resp.status_code == 200:
                    goplus_data = goplus_resp.json().get("result", {})
                    # If GoPlus flags it as malicious, override blocklist
                    if goplus_data.get("malicious_address") == "1":
                        on_blocklist = True
        except Exception as gp_exc:
            logger.warning(f"[wallet_check] GoPlus check failed (non-critical): {gp_exc}")

        # ── 5. Compute wallet_score ───────────────────────────────────────────
        # Start at 1.0 (clean), deduct for red flags

        score = 1.0

        # Immediate disqualifier
        if on_blocklist:
            score = 0.0
        else:
            # Age penalty: new wallets are riskier
            if wallet_age_days < 7:
                score -= 0.35
            elif wallet_age_days < MIN_AGE_DAYS:
                score -= 0.15

            # Low tx count penalty
            if total_tx_count == 0:
                score -= 0.30
            elif total_tx_count < MIN_TX_FOR_ESTABLISHED:
                score -= 0.15

        wallet_score = max(0.0, min(1.0, score))

        logger.info(
            f"[wallet_check] age={wallet_age_days}d txns={total_tx_count} "
            f"blocklist={on_blocklist} score={wallet_score:.2f}"
        )

        return {
            "wallet_age_days":     wallet_age_days,
            "wallet_tx_count":     total_tx_count,
            "wallet_on_blocklist": on_blocklist,
            "wallet_score":        wallet_score,
        }

    except Exception as exc:
        logger.error(f"[wallet_check] Error: {exc}", exc_info=True)
        # Fallback: neutral score so graph continues
        return {
            "wallet_age_days":     0,
            "wallet_tx_count":     0,
            "wallet_on_blocklist": False,
            "wallet_score":        0.5,
        }
