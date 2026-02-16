import asyncio
from app.database import engine
from sqlalchemy import text

async def migrate():
    # Add subscriber_count
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE youtube_configs ADD COLUMN subscriber_count INTEGER;"))
            print("Added column subscriber_count")
    except Exception as e:
        print(f"Column subscriber_count might already exist: {e}")

    # Add video_count
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE youtube_configs ADD COLUMN video_count INTEGER;"))
            print("Added column video_count")
    except Exception as e:
        print(f"Column video_count might already exist: {e}")

    # Add is_primary
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE youtube_configs ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;"))
            print("Added column is_primary")
    except Exception as e:
        print(f"Column is_primary might already exist: {e}")
        
    print("Migration process completed.")

if __name__ == "__main__":
    asyncio.run(migrate())
