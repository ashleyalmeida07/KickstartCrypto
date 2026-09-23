"""
auto_settle.py — Platform Settlement Engine
============================================
Scans the database for campaigns whose deadline has passed and that have not
yet been settled. For each one, calls settle() on the Campaign smart contract
using the platform hot wallet.

The smart contract's settle() handles everything:
  - Goal reached  → pays creator automatically
  - Goal NOT met  → refunds every backer automatically (in the same tx)

No admin or creator action is needed.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db.config import settings

logger = logging.getLogger(__name__)

# ── Campaign ABI (only the functions we need) ─────────────────────────────────
CAMPAIGN_ABI = [
    {
        "inputs": [],
        "name": "settle",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "settled",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "cancelled",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "goalReached",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "deadline",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]


def _get_web3():
    """Lazily import and configure Web3 to avoid import errors if not installed."""
    try:
        from web3 import Web3
        rpc_url = settings.RPC_URL
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            raise ConnectionError(f"Cannot connect to RPC: {rpc_url}")
        return w3
    except ImportError:
        raise RuntimeError("web3 package not installed. Run: pip install web3")


async def fetch_unsettled_campaigns(pool) -> list[dict]:
    """Query DB for campaigns eligible for settlement."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.contract_address, c.title, c.deadline, c.goal_reached, c.status
            FROM campaigns c
            WHERE
                c.settled    = false
                AND c.cancelled  = false
                AND c.status NOT IN ('settled', 'cancelled')
                AND c.deadline < NOW()
                AND NOT EXISTS (
                    SELECT 1 FROM milestones m 
                    WHERE m.campaign_address = c.contract_address 
                    AND m.proof_status != 'verified'
                )
            ORDER BY c.deadline ASC
            """
        )
    return [dict(r) for r in rows]


async def mark_campaign_settled(pool, contract_address: str, goal_reached: bool, tx_hash: str):
    """Update the database after a successful on-chain settle()."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE campaigns
            SET settled   = true,
                status    = $1,
                updated_at = NOW()
            WHERE LOWER(contract_address) = LOWER($2)
            """,
            "funded" if goal_reached else "ended",
            contract_address,
        )

        if not goal_reached:
            # Mark all contributions for this campaign as refunded
            await conn.execute(
                """
                UPDATE contributions
                SET refunded = true,
                    refund_tx_hash = $1
                WHERE campaign_id = (
                    SELECT id FROM campaigns
                    WHERE LOWER(contract_address) = LOWER($2)
                )
                AND refunded = false
                """,
                tx_hash,
                contract_address,
            )

    logger.info(
        f"[auto_settle] DB updated — contract={contract_address} "
        f"goal_reached={goal_reached} tx={tx_hash}"
    )


def settle_campaign_on_chain(contract_address: str) -> dict[str, Any]:
    """
    Synchronous: calls settle() on the campaign contract.
    Returns dict with tx_hash, goal_reached, success.
    Run via asyncio.to_thread() from async context.
    """
    from web3 import Web3
    from eth_account import Account

    private_key = settings.PLATFORM_PRIVATE_KEY
    if not private_key:
        raise ValueError("PLATFORM_PRIVATE_KEY not set in .env")

    w3 = _get_web3()
    account = Account.from_key(private_key)

    contract = w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=CAMPAIGN_ABI,
    )

    # Read current state before calling
    on_chain_settled  = contract.functions.settled().call()
    on_chain_cancelled = contract.functions.cancelled().call()
    goal_reached      = contract.functions.goalReached().call()
    deadline_ts       = contract.functions.deadline().call()
    now_ts            = int(datetime.now(timezone.utc).timestamp())

    if on_chain_settled:
        return {"success": False, "reason": "already_settled_on_chain", "goal_reached": goal_reached}
    if on_chain_cancelled:
        return {"success": False, "reason": "cancelled_on_chain", "goal_reached": goal_reached}
    if now_ts < deadline_ts and not goal_reached:
        return {"success": False, "reason": "still_active", "goal_reached": goal_reached}

    # Build and send transaction
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    gas_price = w3.eth.gas_price

    # Estimate gas with 20% buffer
    try:
        estimated_gas = contract.functions.settle().estimate_gas({"from": account.address})
        gas_limit = int(estimated_gas * 1.2)
    except Exception:
        gas_limit = 500_000  # safe fallback

    tx = contract.functions.settle().build_transaction({
        "from":     account.address,
        "nonce":    nonce,
        "gas":      gas_limit,
        "gasPrice": gas_price,
        "chainId":  11155111,  # Sepolia
    })

    signed  = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    success = receipt.status == 1
    tx_hash_hex = tx_hash.hex()

    logger.info(
        f"[auto_settle] settle() → contract={contract_address} "
        f"tx={tx_hash_hex} success={success} goal_reached={goal_reached}"
    )

    return {
        "success":      success,
        "tx_hash":      tx_hash_hex,
        "goal_reached": goal_reached,
        "gas_used":     receipt.gasUsed,
    }


async def run_settlement_sweep(pool) -> dict:
    """
    Main entry point: find all unsettled campaigns and settle them.
    Returns a summary dict suitable for the API response.
    """
    logger.info("[auto_settle] Starting settlement sweep…")
    campaigns = await fetch_unsettled_campaigns(pool)

    if not campaigns:
        logger.info("[auto_settle] No campaigns need settling.")
        return {"swept": 0, "settled": 0, "skipped": 0, "errors": [], "campaigns": []}

    logger.info(f"[auto_settle] Found {len(campaigns)} campaigns to check.")

    results = []
    settled_count = 0
    skipped_count = 0
    errors = []

    for c in campaigns:
        addr  = c["contract_address"]
        title = c["title"]
        try:
            result = await asyncio.to_thread(settle_campaign_on_chain, addr)

            if result["success"]:
                await mark_campaign_settled(pool, addr, result["goal_reached"], result["tx_hash"])
                settled_count += 1
                results.append({
                    "contract": addr,
                    "title":    title,
                    "status":   "settled",
                    "goal_reached": result["goal_reached"],
                    "tx_hash":  result["tx_hash"],
                })
                logger.info(f"[auto_settle] ✅ Settled: {title} ({addr})")
            else:
                skipped_count += 1
                results.append({
                    "contract": addr,
                    "title":    title,
                    "status":   "skipped",
                    "reason":   result.get("reason"),
                })

        except Exception as e:
            err_msg = str(e)
            logger.error(f"[auto_settle] ❌ Error settling {addr}: {err_msg}")
            errors.append({"contract": addr, "title": title, "error": err_msg})

    summary = {
        "swept":    len(campaigns),
        "settled":  settled_count,
        "skipped":  skipped_count,
        "errors":   errors,
        "campaigns": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(f"[auto_settle] Sweep complete: {summary}")
    return summary
