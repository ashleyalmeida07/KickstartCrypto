import asyncio
from crewai.tools import tool
from db.connection import get_pool
import json
import logging

logger = logging.getLogger(__name__)

async def fetch_platform_stats_async():
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
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
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    if loop.is_running():
        # In a running async context (like FastAPI endpoint)
        # We can't use asyncio.run. We can create a new thread or use run_coroutine_threadsafe.
        # But wait, CrewAI runs in a separate thread usually. 
        # To be safe, let's just create a new event loop for sync execution.
        try:
            return json.dumps(asyncio.run(fetch_platform_stats_async()), default=str)
        except Exception:
            import nest_asyncio
            nest_asyncio.apply()
            return json.dumps(asyncio.run(fetch_platform_stats_async()), default=str)
    else:
        return json.dumps(asyncio.run(fetch_platform_stats_async()), default=str)
