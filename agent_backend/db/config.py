"""
Pydantic settings — reads from agent_backend/.env
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


import os

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str

    # ── Platform hot wallet (auto-settlement engine) ──────────────────────────
    # Private key of the platform wallet that calls settle() on expired campaigns.
    # Must hold a small amount of Sepolia ETH for gas (~0.05 ETH covers hundreds
    # of settle() calls). Generate one with: python gen_wallet.py
    PLATFORM_PRIVATE_KEY: str = ""

    # Sepolia RPC — use your Alchemy/Infura URL for reliability
    RPC_URL: str = "https://rpc2.sepolia.org"

    # How often the settlement sweep runs (seconds). Default: 5 minutes.
    SETTLE_INTERVAL_SECONDS: int = 300

    # OpenRouter
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_API_KEY_2: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "nvidia/nemotron-3.5-lightning:free"
    OPENROUTER_MODEL_HEAVY: str = "nvidia/nemotron-3.5-lightning:free"
    # Vision-capable model used by Flow 3 to OCR uploaded receipts/photos.
    # Must accept image_url content blocks — a text-only model will fail to parse
    # image proofs and every image submission will fall through to admin review.
    OPENROUTER_VISION_MODEL: str = "meta-llama/llama-3.2-11b-vision-instruct:free"

    # NVIDIA API (Fallback)
    NVIDIA_API_KEY: str = ""

    # Groq (fast inference for real-time flows)
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Etherscan
    ETHERSCAN_API_KEY: str = ""
    ETHERSCAN_BASE_URL: str = "https://api-sepolia.etherscan.io/api"

    # Next.js app URL
    NEXTJS_URL: str = "http://localhost:3000"

    # Risk thresholds (Flow 1 — campaign vetting)
    RISK_LOW_THRESHOLD: float = 0.30
    RISK_HIGH_THRESHOLD: float = 0.65

    # ── Flow 3 — milestone proof verification ────────────────────────────────
    # Confidence at or above this auto-approves and clears the tranche.
    PROOF_AUTO_APPROVE_THRESHOLD: float = 0.75
    # Confidence at or below this is treated as a clear mismatch and rejected.
    PROOF_REJECT_THRESHOLD: float = 0.35
    # Anything between the two lands in the admin queue.

    # How far the claimed spend may drift from actual on-chain outflow before
    # the spend match score starts dropping (0.15 = 15% either way is fine).
    PROOF_SPEND_TOLERANCE: float = 0.15
    # A text-only proof is the creator's unbacked word — never auto-approved.
    PROOF_TEXT_ONLY_CONFIDENCE_CAP: float = 0.60
    # Max bytes to download for any single proof file (10 MB, matches /api/upload).
    PROOF_MAX_DOWNLOAD_BYTES: int = 10 * 1024 * 1024


settings = Settings()
