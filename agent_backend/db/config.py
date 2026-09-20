"""
Pydantic settings — reads from agent_backend/.env
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str

    # OpenRouter
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "mistralai/mistral-7b-instruct:free"

    # Etherscan
    ETHERSCAN_API_KEY: str = ""
    ETHERSCAN_BASE_URL: str = "https://api-sepolia.etherscan.io/api"

    # Next.js app URL
    NEXTJS_URL: str = "http://localhost:3000"

    # Risk thresholds
    RISK_LOW_THRESHOLD: float = 0.30
    RISK_HIGH_THRESHOLD: float = 0.65


settings = Settings()
