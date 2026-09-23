import asyncio
from crewai.tools import tool
from db.connection import get_pool
import json
import logging

logger = logging.getLogger(__name__)

async def fetch_platform_stats_async():
    try:
        import asyncpg
        from db.config import settings
        
        # CrewAI runs tools in separate threads. We CANNOT use the main thread's global pool.
        # Create a fresh short-lived connection instead.
        conn = await asyncpg.connect(settings.DATABASE_URL)
        try:
            # Platform overall stats
            stats = await conn.fetchrow("SELECT total_raised_wei, active_campaigns, total_backers FROM platform_stats WHERE id = 1")
            
            # Active campaigns list
            campaigns = await conn.fetch("""
                SELECT title, category, goal_wei, total_contributed_wei, backer_count 
                FROM campaigns 
                WHERE status = 'active'
                ORDER BY created_at DESC 
                LIMIT 10
            """)
            
            return {
                "overall_stats": dict(stats) if stats else {},
                "active_campaigns": [dict(c) for c in campaigns]
            }
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        return {"error": str(e)}

@tool("Fetch Platform Stats")
def fetch_platform_stats(query: str) -> str:
    """
    Fetches the current platform statistics from the PostgreSQL database, including
    total funds raised, number of active campaigns, total backers, and a list of
    the most recent active campaigns with their progress.
    """
    # Just run it in a new event loop for this thread
    return json.dumps(asyncio.run(fetch_platform_stats_async()), default=str)
