"""
Database connection for the agent backend.
Uses the same NeonDB PostgreSQL instance as the Next.js backend.
asyncpg for async queries, psycopg2 for synchronous migration checks.
"""

from __future__ import annotations

import asyncpg
from functools import lru_cache
from typing import Optional

from .config import settings


_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Return (and lazily create) the shared asyncpg connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def close_pool() -> None:
    """Gracefully close the pool on app shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
