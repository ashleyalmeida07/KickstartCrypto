import asyncio
import os
import asyncpg
from dotenv import load_dotenv
load_dotenv()

async def main():
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    try:
        rows = await conn.fetch("SELECT contract_address, title, status FROM campaigns")
        print("Campaigns:")
        for r in rows:
            print(dict(r))
    finally:
        await conn.close()

asyncio.run(main())
