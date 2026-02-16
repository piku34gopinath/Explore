import asyncio
from app.database import engine
from sqlalchemy import text, Integer, String, Column
from app.models import Base

async def migrate():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS system_configs (
                    key VARCHAR PRIMARY KEY,
                    value VARCHAR NOT NULL
                );
            """))
            print("Migration successful: Created system_configs table")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
