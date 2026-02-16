import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app import models

async def audit():
    async with AsyncSessionLocal() as db:
        # Users
        res = await db.execute(select(models.User))
        users = res.scalars().all()
        print(f"--- USERS ---")
        for u in users:
            print(f"ID: {u.id}, Email: {u.email}, Google ID: {u.google_id}")
        
        # YouTube Configs
        res = await db.execute(select(models.YouTubeConfig))
        configs = res.scalars().all()
        print(f"\n--- YOUTUBE CONFIGS ---")
        for c in configs:
            print(f"User ID: {c.user_id}, Channel: {c.channel_name}, Connected: {c.is_connected}")

        # System Configs
        res = await db.execute(select(models.SystemConfig))
        sys_configs = res.scalars().all()
        print(f"\n--- SYSTEM CONFIGS ---")
        for sc in sys_configs:
            val = sc.value if "secret" not in sc.key.lower() else "********"
            print(f"Key: {sc.key}, Value: {val}")

if __name__ == "__main__":
    asyncio.run(audit())
