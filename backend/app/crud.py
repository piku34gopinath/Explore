from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from . import models, schemas
from datetime import datetime

async def create_user(db: AsyncSession, user: schemas.UserCreate):
    db_user = models.User(email=user.email, full_name=user.full_name)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(select(models.User).filter(models.User.email == email))
    return result.scalars().first()

async def get_user_by_id(db: AsyncSession, user_id: int):
    result = await db.execute(select(models.User).filter(models.User.id == user_id))
    return result.scalars().first()

async def create_or_update_user(db: AsyncSession, email: str, full_name: str, avatar_url: str, google_id: str):
    user = await get_user_by_email(db, email)
    if user:
        user.full_name = full_name
        user.avatar_url = avatar_url
        user.google_id = google_id
    else:
        user = models.User(
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            google_id=google_id
        )
        db.add(user)
    
    await db.commit()
    await db.refresh(user)
    return user

async def create_video_source(db: AsyncSession, video: schemas.VideoSourceCreate):
    db_video = models.VideoSource(
        original_url=video.original_url,
        user_id=video.user_id
    )
    db.add(db_video)
    await db.commit()
    # Eagerly load relationships to avoid lazy loading errors in response serialization
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(models.VideoSource)
        .options(selectinload(models.VideoSource.clips), selectinload(models.VideoSource.suggestions))
        .where(models.VideoSource.id == db_video.id)
    )
    return result.scalar_one()

async def get_user_ai_configs(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(models.AIConfig)
        .filter(models.AIConfig.user_id == user_id)
        .order_by(models.AIConfig.created_at.desc())
        .limit(4)
    )
    return result.scalars().all()

async def list_all_user_ai_configs(db: AsyncSession, user_id: int):
    """Internal use: get all configs without limit if needed"""
    result = await db.execute(select(models.AIConfig).filter(models.AIConfig.user_id == user_id))
    return result.scalars().all()

async def deactivate_user_ai_configs(db: AsyncSession, user_id: int):
    from sqlalchemy import update
    await db.execute(
        update(models.AIConfig)
        .where(models.AIConfig.user_id == user_id)
        .values(is_active=False)
    )
    await db.commit()

async def activate_user_ai_config(db: AsyncSession, user_id: int, config_id: int):
    """
    Activates one config and deactivates all others for the user.
    """
    from sqlalchemy import update
    
    # First deactivate all
    await deactivate_user_ai_configs(db, user_id)
    
    # Then activate the specific one
    await db.execute(
        update(models.AIConfig)
        .where(models.AIConfig.id == config_id, models.AIConfig.user_id == user_id)
        .values(is_active=True)
    )
    await db.commit()
    
    # Return the activated config
    result = await db.execute(
        select(models.AIConfig)
        .where(models.AIConfig.id == config_id, models.AIConfig.user_id == user_id)
    )
    return result.scalars().first()

async def save_youtube_config(db: AsyncSession, user_id: int, token_data: dict, channel_info: dict):
    # Check if this channel is already connected for this user
    result = await db.execute(
        select(models.YouTubeConfig).filter(
            models.YouTubeConfig.user_id == user_id,
            models.YouTubeConfig.channel_id == channel_info.get('id')
        )
    )
    existing_config = result.scalars().first()
    
    if existing_config:
        # Update existing config with new tokens
        existing_config.access_token = token_data['token']
        existing_config.refresh_token = token_data.get('refresh_token')
        existing_config.token_expiry = datetime.fromisoformat(token_data['expiry']) if token_data.get('expiry') else None
        existing_config.subscriber_count = channel_info.get('subscriber_count')
        existing_config.video_count = channel_info.get('video_count')
        existing_config.is_connected = True
        await db.commit()
        await db.refresh(existing_config)
        return existing_config
    
    # Check if user has any existing configs to determine if this should be primary
    result = await db.execute(
        select(models.YouTubeConfig).filter(models.YouTubeConfig.user_id == user_id)
    )
    existing_configs = result.scalars().all()
    is_first_account = len(existing_configs) == 0
    
    new_config = models.YouTubeConfig(
        user_id=user_id,
        access_token=token_data['token'],
        refresh_token=token_data.get('refresh_token'),
        token_expiry=datetime.fromisoformat(token_data['expiry']) if token_data.get('expiry') else None,
        channel_name=channel_info.get('title'),
        channel_id=channel_info.get('id'),
        channel_thumbnail=channel_info.get('thumbnail'),
        subscriber_count=channel_info.get('subscriber_count'),
        video_count=channel_info.get('video_count'),
        is_connected=True,
        is_primary=is_first_account  # First account is automatically primary
    )
    db.add(new_config)
    await db.commit()
    await db.refresh(new_config)
    return new_config

async def get_youtube_config(db: AsyncSession, user_id: int):
    """Get primary YouTube config for user (for backward compatibility)"""
    result = await db.execute(
        select(models.YouTubeConfig).filter(
            models.YouTubeConfig.user_id == user_id,
            models.YouTubeConfig.is_primary == True
        )
    )
    config = result.scalars().first()
    
    # If no primary found, return the first one
    if not config:
        result = await db.execute(
            select(models.YouTubeConfig).filter(models.YouTubeConfig.user_id == user_id).limit(1)
        )
        config = result.scalars().first()
    
    return config

async def get_all_youtube_configs(db: AsyncSession, user_id: int):
    """Get all YouTube accounts for a user"""
    result = await db.execute(
        select(models.YouTubeConfig)
        .filter(models.YouTubeConfig.user_id == user_id)
        .order_by(models.YouTubeConfig.is_primary.desc(), models.YouTubeConfig.created_at.desc())
    )
    return result.scalars().all()

async def get_youtube_config_by_id(db: AsyncSession, user_id: int, config_id: int):
    """Get specific YouTube config by ID"""
    result = await db.execute(
        select(models.YouTubeConfig).filter(
            models.YouTubeConfig.user_id == user_id,
            models.YouTubeConfig.id == config_id
        )
    )
    return result.scalars().first()

async def set_primary_youtube_account(db: AsyncSession, user_id: int, config_id: int):
    """Set a specific account as primary (unset others)"""
    from sqlalchemy import update
    
    # Unset all primary flags for this user
    await db.execute(
        update(models.YouTubeConfig)
        .where(models.YouTubeConfig.user_id == user_id)
        .values(is_primary=False)
    )
    
    # Set the specified account as primary
    await db.execute(
        update(models.YouTubeConfig)
        .where(
            models.YouTubeConfig.user_id == user_id,
            models.YouTubeConfig.id == config_id
        )
        .values(is_primary=True)
    )
    await db.commit()
    
    # Return the updated config
    return await get_youtube_config_by_id(db, user_id, config_id)

async def disconnect_youtube_config(db: AsyncSession, user_id: int, config_id: int = None):
    """Disconnect specific YouTube account or all accounts if config_id is None"""
    from sqlalchemy import delete
    
    if config_id is None:
        # Old behavior: delete all configs for user
        await db.execute(
            delete(models.YouTubeConfig).where(models.YouTubeConfig.user_id == user_id)
        )
    else:
        # New behavior: delete specific config
        deleted_result = await db.execute(
            delete(models.YouTubeConfig).where(
                models.YouTubeConfig.user_id == user_id,
                models.YouTubeConfig.id == config_id
            )
        )
        
        # If we deleted the primary account, make another account primary
        if deleted_result.rowcount > 0:
            remaining = await get_all_youtube_configs(db, user_id)
            if remaining and not any(config.is_primary for config in remaining):
                # Set first remaining account as primary
                await set_primary_youtube_account(db, user_id, remaining[0].id)
    
    await db.commit()

# ==================== Instagram Config CRUD ====================

async def save_instagram_config(db: AsyncSession, user_id: int, token_data: dict, ig_info: dict):
    # Update if this IG account is already connected for the user
    result = await db.execute(
        select(models.InstagramConfig).filter(
            models.InstagramConfig.user_id == user_id,
            models.InstagramConfig.ig_user_id == ig_info.get("ig_user_id"),
        )
    )
    existing = result.scalars().first()

    if existing:
        existing.access_token = token_data["access_token"]
        existing.page_access_token = token_data.get("page_access_token")
        existing.page_id = ig_info.get("page_id")
        existing.username = ig_info.get("username")
        existing.name = ig_info.get("name")
        existing.profile_picture_url = ig_info.get("profile_picture_url")
        existing.followers_count = ig_info.get("followers_count")
        existing.is_connected = True
        await db.commit()
        await db.refresh(existing)
        return existing

    result = await db.execute(
        select(models.InstagramConfig).filter(models.InstagramConfig.user_id == user_id)
    )
    is_first = len(result.scalars().all()) == 0

    new_config = models.InstagramConfig(
        user_id=user_id,
        access_token=token_data["access_token"],
        page_access_token=token_data.get("page_access_token"),
        page_id=ig_info.get("page_id"),
        ig_user_id=ig_info.get("ig_user_id"),
        username=ig_info.get("username"),
        name=ig_info.get("name"),
        profile_picture_url=ig_info.get("profile_picture_url"),
        followers_count=ig_info.get("followers_count"),
        is_connected=True,
        is_primary=is_first,
    )
    db.add(new_config)
    await db.commit()
    await db.refresh(new_config)
    return new_config

async def get_instagram_config(db: AsyncSession, user_id: int):
    """Get primary Instagram config (fallback to first)."""
    result = await db.execute(
        select(models.InstagramConfig).filter(
            models.InstagramConfig.user_id == user_id,
            models.InstagramConfig.is_primary == True,
        )
    )
    config = result.scalars().first()
    if not config:
        result = await db.execute(
            select(models.InstagramConfig).filter(models.InstagramConfig.user_id == user_id).limit(1)
        )
        config = result.scalars().first()
    return config

async def get_all_instagram_configs(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(models.InstagramConfig)
        .filter(models.InstagramConfig.user_id == user_id)
        .order_by(models.InstagramConfig.is_primary.desc(), models.InstagramConfig.created_at.desc())
    )
    return result.scalars().all()

async def get_instagram_config_by_id(db: AsyncSession, user_id: int, config_id: int):
    result = await db.execute(
        select(models.InstagramConfig).filter(
            models.InstagramConfig.user_id == user_id,
            models.InstagramConfig.id == config_id,
        )
    )
    return result.scalars().first()

async def set_primary_instagram_account(db: AsyncSession, user_id: int, config_id: int):
    from sqlalchemy import update
    await db.execute(
        update(models.InstagramConfig)
        .where(models.InstagramConfig.user_id == user_id)
        .values(is_primary=False)
    )
    await db.execute(
        update(models.InstagramConfig)
        .where(
            models.InstagramConfig.user_id == user_id,
            models.InstagramConfig.id == config_id,
        )
        .values(is_primary=True)
    )
    await db.commit()
    return await get_instagram_config_by_id(db, user_id, config_id)

async def disconnect_instagram_config(db: AsyncSession, user_id: int, config_id: int = None):
    from sqlalchemy import delete
    if config_id is None:
        await db.execute(
            delete(models.InstagramConfig).where(models.InstagramConfig.user_id == user_id)
        )
    else:
        deleted = await db.execute(
            delete(models.InstagramConfig).where(
                models.InstagramConfig.user_id == user_id,
                models.InstagramConfig.id == config_id,
            )
        )
        if deleted.rowcount > 0:
            remaining = await get_all_instagram_configs(db, user_id)
            if remaining and not any(c.is_primary for c in remaining):
                await set_primary_instagram_account(db, user_id, remaining[0].id)
    await db.commit()

async def get_video(db: AsyncSession, video_id: int):
    result = await db.execute(
        select(models.VideoSource)
        .options(selectinload(models.VideoSource.clips), selectinload(models.VideoSource.suggestions))
        .filter(models.VideoSource.id == video_id)
    )
    return result.scalars().first()

async def get_user_videos(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(models.VideoSource)
        .options(selectinload(models.VideoSource.clips), selectinload(models.VideoSource.suggestions))
        .filter(models.VideoSource.user_id == user_id)
        .order_by(models.VideoSource.created_at.desc())
    )
    return result.scalars().all()

async def get_system_config(db: AsyncSession, key: str):
    from sqlalchemy import select
    result = await db.execute(select(models.SystemConfig).filter(models.SystemConfig.key == key))
    config = result.scalars().first()
    return config.value if config else None

async def set_system_config(db: AsyncSession, key: str, value: str):
    from sqlalchemy import update
    
    # Check if exists
    existing = await get_system_config(db, key)
    
    if existing is not None:
        # Update
        await db.execute(
            update(models.SystemConfig)
            .where(models.SystemConfig.key == key)
            .values(value=value)
        )
    else:
        # Insert
        new_config = models.SystemConfig(key=key, value=value)
        db.add(new_config)
    
    await db.commit()
    return value
