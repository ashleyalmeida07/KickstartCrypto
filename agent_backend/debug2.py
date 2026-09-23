import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    pool = await asyncpg.create_pool(os.getenv('DATABASE_URL'))
    try:
        rows = await pool.fetch('SELECT * FROM admin_reports')
        print(f"Found {len(rows)} reports in DB.")
        if len(rows) > 0:
            print(dict(rows[0]))
    except Exception as e:
        print("Error:", e)
    finally:
        await pool.close()

asyncio.run(main())
