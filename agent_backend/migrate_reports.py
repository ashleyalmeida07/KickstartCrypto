import asyncio
from db.connection import get_pool
from db.config import settings

async def migrate():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_reports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                report_markdown TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        print("Migrated admin_reports table.")

if __name__ == "__main__":
    asyncio.run(migrate())
