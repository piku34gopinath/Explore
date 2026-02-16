import asyncio
import os
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app import models

async def check():
    async with AsyncSessionLocal() as db:
        # Check YouTube config
        result = await db.execute(select(models.YouTubeConfig).filter(models.YouTubeConfig.user_id == 1))
        config = result.scalars().first()
        if config:
            print(f"YouTube Config found for user 1: channel={config.channel_name}, connected={config.is_connected}")
            print(f"Tokens: access_token={'present' if config.access_token else 'missing'}, refresh_token={'present' if config.refresh_token else 'missing'}")
        else:
            print("No YouTube Config found for user 1")

        # Check for clips
        result = await db.execute(select(models.GeneratedClip))
        clips = result.scalars().all()
        print(f"Found {len(clips)} generated clips")
        for clip in clips:
            print(f"Clip ID {clip.id}: {clip.title}")

if __name__ == "__main__":
    asyncio.run(check())
