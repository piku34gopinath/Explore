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

    # Add video_sources resolution columns
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE video_sources ADD COLUMN source_width INTEGER;"))
            await conn.execute(text("ALTER TABLE video_sources ADD COLUMN source_height INTEGER;"))
            print("Added source_width and source_height to video_sources")
    except Exception as e:
        print(f"video_sources columns might already exist: {e}")

    # Add generated_clips columns
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE generated_clips ADD COLUMN thumbnail_path VARCHAR;"))
            await conn.execute(text("ALTER TABLE generated_clips ADD COLUMN width INTEGER;"))
            await conn.execute(text("ALTER TABLE generated_clips ADD COLUMN height INTEGER;"))
            await conn.execute(text("ALTER TABLE generated_clips ADD COLUMN file_size INTEGER;"))
            print("Added thumbnail_path, width, height, file_size to generated_clips")
    except Exception as e:
        print(f"generated_clips columns might already exist: {e}")

    # Add suggested_quality to clip_suggestions
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE clip_suggestions ADD COLUMN suggested_quality VARCHAR;"))
            print("Added suggested_quality to clip_suggestions")
    except Exception as e:
        print(f"clip_suggestions columns might already exist: {e}")

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
