import asyncio
from app.database import engine
from sqlalchemy import text

async def fix():
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS system_configs;"))
        print("Dropped system_configs table")

if __name__ == "__main__":
    asyncio.run(fix())
