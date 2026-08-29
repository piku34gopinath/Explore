from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from sqlalchemy import func
import os

from . import models, schemas, crud, database, tasks
from .database import engine

app = FastAPI(title="AI Video Clipper")

# Mount static files for clips
# Ensure directory exists first or use check=False
os.makedirs("data/clips", exist_ok=True)
app.mount("/static", StaticFiles(directory="data/clips"), name="static")

# CORS setup
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        FRONTEND_URL,
    ],
    allow_origin_regex="https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

from fastapi import Request
from starlette.middleware.sessions import SessionMiddleware
import secrets
# In production, use a secure random string from env
SECRET_KEY = os.getenv("SESSION_SECRET", "super-secret-dev-key")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, same_site="none", https_only=True)


@app.middleware("http")
async def add_cross_origin_resource_policy(request: Request, call_next):
    """
    The frontend sets `Cross-Origin-Embedder-Policy: require-corp` (needed so
    ffmpeg.wasm can use SharedArrayBuffer). That makes the page cross-origin
    isolated, which blocks cross-origin subresources — including <video>/<img>
    served from this backend — unless they carry a CORP header. Tag every
    response so clips and thumbnails load in the isolated page.
    """
    response = await call_next(request)
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response
from . import models, schemas, crud, database
from .database import engine, get_db, AsyncSessionLocal
from sqlalchemy.future import select
from .services import downloader, transcriber, analyzer, meta, x
from .services.meta import MetaService
from .services.x import XService
from sqlalchemy.exc import IntegrityError
from fastapi.responses import JSONResponse

# Initialize Services
meta_service = MetaService()
x_service = XService()

# Unified Auth Helpers
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    
    # In a real app, you might want to cache this or just fetch needed fields
    result = await db.execute(select(models.User).filter(models.User.id == user_id))
    user = result.scalars().first()
    return user

# ... earlier code ...

@app.post("/settings/ai/verify")
async def verify_ai_key(request: schemas.KeyVerificationRequest):
    success, message = analyzer.verify_key(request.provider, request.api_key)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # Return real models for the provider
    models_list = analyzer.get_available_models(request.provider, request.api_key)
    return {"status": "success", "available_models": models_list}

@app.post("/settings/ai/save")
async def save_ai_config(config: schemas.AIConfigCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    
    # Deactivate other configs for this user
    # Note: This requires a synchronous session or a different approach for async
    # For now, assuming get_db provides a synchronous session or adapting for async
    # If get_db is truly async, this part needs adjustment (e.g., using execute and ORM update)
    # Example for async:
    # await db.execute(update(models.AIConfig).where(models.AIConfig.user_id == user_id).values(is_active=False))
    # For this example, I'll assume a synchronous session for simplicity as per the instruction's `db.query`
    # If `get_db` returns AsyncSession, `db.query` and `db.commit()` will not work directly.
    # The instruction uses `db: Session = Depends(get_db)` which implies a synchronous session.
    # Given the existing `db: AsyncSession = Depends(database.get_db)` in other endpoints,
    # I will adapt this to use async operations.
    
    # Deactivate other configs for this user (async adapted)
    await crud.deactivate_user_ai_configs(db, user_id=user_id)
    
    new_config = models.AIConfig(
        user_id=user_id,
        provider=config.provider,
        api_key=config.api_key,
        selected_model=config.selected_model,
        is_active=True
    )
    db.add(new_config)
    await db.commit()
    await db.refresh(new_config)
    return new_config

@app.get("/settings/ai", response_model=List[schemas.AIConfigResponse])
async def get_ai_configs(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    return await crud.get_user_ai_configs(db, user_id=user_id)

@app.post("/settings/ai/{config_id}/activate", response_model=schemas.AIConfigResponse)
async def activate_ai_config(config_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    config = await crud.activate_user_ai_config(db, user_id=user_id, config_id=config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return config

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request, exc):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Database integrity error. This might be due to an invalid ID (e.g. user_id)."},
    )

# Startup event to create tables (dev only)
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    # create_all won't add columns to pre-existing tables; add the render
    # failure-reason column idempotently so the UI can show why a clip failed.
    from sqlalchemy import text as _sql_text
    try:
        async with engine.begin() as conn:
            await conn.execute(_sql_text(
                "ALTER TABLE clip_suggestions ADD COLUMN IF NOT EXISTS error_message VARCHAR"
            ))
    except Exception as e:
        print(f"clip_suggestions.error_message migration skipped: {e}")

    try:
        async with engine.begin() as conn:
            await conn.execute(_sql_text(
                "ALTER TABLE video_sources ADD COLUMN IF NOT EXISTS transcript TEXT"
            ))
    except Exception as e:
        print(f"video_sources.transcript migration skipped: {e}")
    
    # Seed system_configs from env ONLY when a value is not already stored,
    # so that values saved via the UI are not overwritten on restart.
    async with AsyncSessionLocal() as db:
        # Meta app credentials are shared by Facebook and Instagram, so accept
        # the legacy FACEBOOK_APP_ID / FACEBOOK_APP_SECRET as fallbacks.
        meta_id = os.getenv("FACEBOOK_APP_ID") or ""
        meta_secret = os.getenv("FACEBOOK_APP_SECRET") or ""

        seeds = {
            "google_client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "google_client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "instagram_client_id": os.getenv("INSTAGRAM_CLIENT_ID") or meta_id,
            "instagram_client_secret": os.getenv("INSTAGRAM_CLIENT_SECRET") or meta_secret,
            "facebook_client_id": os.getenv("FACEBOOK_CLIENT_ID") or meta_id,
            "facebook_client_secret": os.getenv("FACEBOOK_CLIENT_SECRET") or meta_secret,
            "x_client_id": os.getenv("X_CLIENT_ID"),
            "x_client_secret": os.getenv("X_CLIENT_SECRET"),
        }

        for key, env_value in seeds.items():
            if not env_value:
                continue
            existing = await crud.get_system_config(db, key)
            if existing and existing == env_value:
                continue
            await crud.set_system_config(db, key, env_value)
            if existing:
                print(f"Updated {key} in system_configs from env (value changed)")
            else:
                print(f"Seeded {key} from env into system_configs")

@app.get("/")
async def root():
    return {"message": "AI Video Clipper API is running"}

@app.post("/users/", response_model=schemas.User)
async def create_user(user: schemas.UserCreate, db: AsyncSession = Depends(database.get_db)):
    db_user = await crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return await crud.create_user(db=db, user=user)

@app.post("/videos/submit", response_model=schemas.VideoSource)
async def submit_video(video: schemas.VideoSourceCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(database.get_db)):
    # Create video entry in DB
    db_video = await crud.create_video_source(db=db, video=video)

    # Run processing in-process (no Celery/Redis needed)
    background_tasks.add_task(tasks.process_video_task, db_video.id, db_video.original_url)

    return db_video


@app.post("/videos/upload", response_model=schemas.VideoSource)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: int = 1,
    db: AsyncSession = Depends(database.get_db),
):
    """Accept a raw video file, save it to disk, and kick off analysis."""
    import uuid
    upload_dir = "/app/data/uploads"
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if ext not in {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    dest_path = os.path.join(upload_dir, f"{uuid.uuid4()}{ext}")
    with open(dest_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)

    video_data = schemas.VideoSourceCreate(
        original_url=f"file://{dest_path}",
        user_id=user_id,
    )
    db_video = await crud.create_video_source(db=db, video=video_data)

    background_tasks.add_task(tasks.process_video_task, db_video.id, db_video.original_url)
    return db_video

@app.post("/videos/{video_id}/upload-source")
async def upload_video_source(
    video_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(database.get_db),
):
    """Upload a video file to link with an existing video entry (for YouTube URL videos where server-side download fails)."""
    import uuid
    video = await crud.get_video(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    upload_dir = "/app/data/uploads"
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if ext not in {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    dest_path = os.path.join(upload_dir, f"{uuid.uuid4()}{ext}")
    with open(dest_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)

    from sqlalchemy import update
    await db.execute(
        update(models.VideoSource)
        .where(models.VideoSource.id == video_id)
        .values(original_url=f"file://{dest_path}")
    )
    await db.commit()

    return {"status": "success", "message": "Video file uploaded. You can now retry clip generation."}


@app.get("/videos/{video_id}", response_model=schemas.VideoSource)
async def get_video_status(video_id: int, db: AsyncSession = Depends(database.get_db)):
    db_video = await crud.get_video(db, video_id=video_id)
    if db_video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return db_video

@app.get("/users/{user_id}/videos", response_model=List[schemas.VideoSource])
async def get_user_videos(user_id: int, db: AsyncSession = Depends(get_db)):
    videos = await crud.get_user_videos(db, user_id=user_id)
    return videos

@app.get("/media/{filename}")
async def stream_clip(filename: str, request: Request):
    """
    Range-aware video streaming endpoint.

    Starlette 0.36's FileResponse (pinned by FastAPI 0.110) does NOT honor
    HTTP Range requests, so <video> elements can't read duration or seek —
    the player shows 0:00. This endpoint implements 206 Partial Content so
    browsers get proper seeking and duration.
    """
    from fastapi.responses import StreamingResponse, Response
    import os
    import re

    # Prevent path traversal; only serve bare filenames from the clips dir.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = f"/app/data/clips/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    ext = os.path.splitext(filename)[1].lower()
    media_type = "video/mp4" if ext == ".mp4" else "application/octet-stream"

    if range_header is None:
        # No range: return the whole file but still advertise range support.
        def full_iter():
            with open(file_path, "rb") as f:
                while chunk := f.read(1024 * 1024):
                    yield chunk

        return StreamingResponse(
            full_iter(),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )

    m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not m:
        raise HTTPException(status_code=416, detail="Invalid Range header")

    start_s, end_s = m.group(1), m.group(2)
    start = int(start_s) if start_s else 0
    end = int(end_s) if end_s else file_size - 1
    end = min(end, file_size - 1)

    if start > end or start >= file_size:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    length = end - start + 1

    def range_iter():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        range_iter(),
        status_code=206,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
        },
    )


@app.get("/download/{filename}")
async def download_clip(filename: str):
    """Download endpoint that forces file download with proper headers"""
    from fastapi.responses import FileResponse
    import os

    file_path = f"/app/data/clips/{filename}"

    # Check if file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Return with Content-Disposition header to force download
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

# Clip Suggestion Endpoints
@app.post("/videos/{video_id}/suggestions/{suggestion_id}/approve")
async def approve_suggestion(
    video_id: int,
    suggestion_id: int,
    background_tasks: BackgroundTasks,
    quality: str = "1080p",
    captions: int = 0,
    caption_language: str = "en",
    caption_style: str = "classic",
    emojis: int = 0,
    emoji_style: str = "standard",
    emoji_meme_mode: int = 0,
    db: AsyncSession = Depends(database.get_db),
):
    """Approve a clip suggestion and trigger rendering with selected quality"""
    from sqlalchemy import update

    await db.execute(
        update(models.ClipSuggestion)
        .where(models.ClipSuggestion.id == suggestion_id, models.ClipSuggestion.video_source_id == video_id)
        .values(status="approved", suggested_quality=quality)
    )
    await db.commit()

    render_opts = {
        "captions_enabled": bool(captions),
        "caption_language": caption_language,
        "caption_style": caption_style,
        "emojis_enabled": bool(emojis),
        "emoji_style": emoji_style,
        "emoji_meme_mode": bool(emoji_meme_mode),
    }
    background_tasks.add_task(tasks.render_clip_task, suggestion_id, quality, render_opts)

    return {"status": "approved", "message": f"Rendering started at {quality}"}

@app.post("/videos/{video_id}/suggestions/{suggestion_id}/reject")
async def reject_suggestion(video_id: int, suggestion_id: int, db: AsyncSession = Depends(database.get_db)):
    """Reject a clip suggestion"""
    from sqlalchemy import update
    
    await db.execute(
        update(models.ClipSuggestion)
        .where(models.ClipSuggestion.id == suggestion_id, models.ClipSuggestion.video_source_id == video_id)
        .values(status="rejected")
    )
    await db.commit()
    return {"status": "rejected"}

@app.post("/videos/{video_id}/regenerate-suggestions")
async def regenerate_suggestions(video_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(database.get_db)):
    """Regenerate clip suggestions for a video using AI"""
    video = await crud.get_video(db, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    from sqlalchemy import delete
    await db.execute(
        delete(models.ClipSuggestion).where(models.ClipSuggestion.video_source_id == video_id)
    )
    await db.commit()

    background_tasks.add_task(tasks.process_video_task, video_id, video.original_url)

    return {"status": "regenerating"}

@app.post("/settings/system")
async def set_system_config_route(config: schemas.SystemConfig, db: AsyncSession = Depends(get_db)):
    await crud.set_system_config(db, config.key, config.value)
    return {"status": "success"}

@app.get("/settings/system/{key}")
async def get_system_config_route(key: str, db: AsyncSession = Depends(get_db)):
    value = await crud.get_system_config(db, key)
    # Return empty string if not found to separate from 404 error
    return {"key": key, "value": value if value else ""}

# YouTube Integration Endpoints
from .services.youtube import YouTubeService

youtube_service = YouTubeService()

@app.get("/auth/youtube/url", response_model=schemas.YouTubeAuthResponse)
async def get_youtube_auth_url(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    client_id = await crud.get_system_config(db, "google_client_id")
    client_secret = await crud.get_system_config(db, "google_client_secret")

    url, error = youtube_service.get_auth_url(client_id=client_id, client_secret=client_secret)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"auth_url": url}

@app.post("/auth/youtube/callback")
async def youtube_auth_callback(code: str, db: AsyncSession = Depends(get_db)):
    user_id = 1 # Hardcoded for MVP
    
    client_id = await crud.get_system_config(db, "google_client_id")
    client_secret = await crud.get_system_config(db, "google_client_secret")

    token_data, channel_info, user_info = youtube_service.exchange_code_for_token(code, client_id=client_id, client_secret=client_secret)
    if not token_data:
        raise HTTPException(status_code=400, detail="Failed to exchange code for token: " + str(channel_info))
        
    await crud.save_youtube_config(db, user_id, token_data, channel_info)
    return {"status": "connected", "channel": channel_info.get('title')}

@app.get("/auth/youtube/status")
async def get_youtube_status(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get all connected YouTube accounts for the current user"""
    user_id = current_user.id if current_user else 1
    configs = await crud.get_all_youtube_configs(db, user_id)
    
    if not configs:
        return {"is_connected": False, "accounts": []}
    
    accounts = []
    for config in configs:
        accounts.append({
            "id": config.id,
            "is_connected": True,
            "channel_name": config.channel_name,
            "channel_id": config.channel_id,
            "channel_thumbnail": config.channel_thumbnail,
            "subscriber_count": config.subscriber_count,
            "video_count": config.video_count,
            "is_primary": config.is_primary
        })
    
    # Return both list and backward-compatible single account info
    primary = next((acc for acc in accounts if acc["is_primary"]), accounts[0] if accounts else None)
    
    return {
        "is_connected": True,
        "accounts": accounts,
        # Backward compatibility - return primary account data at root level
        "channel_name": primary["channel_name"] if primary else None,
        "channel_thumbnail": primary["channel_thumbnail"] if primary else None,
        "subscriber_count": primary["subscriber_count"] if primary else None,
        "video_count": primary["video_count"] if primary else None
    }

@app.post("/auth/youtube/disconnect")
async def disconnect_youtube(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Disconnect all YouTube accounts (legacy)"""
    user_id = current_user.id if current_user else 1
    await crud.disconnect_youtube_config(db, user_id, config_id=None)
    return {"status": "disconnected"}

@app.delete("/auth/youtube/accounts/{account_id}")
async def disconnect_youtube_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Disconnect a specific YouTube account"""
    user_id = current_user.id if current_user else 1
    await crud.disconnect_youtube_config(db, user_id, config_id=account_id)
    return {"status": "disconnected", "account_id": account_id}


@app.post("/auth/youtube/accounts/{account_id}/set-primary")
async def set_primary_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Set a specific account as the primary account for uploads"""
    user_id = current_user.id if current_user else 1
    config = await crud.set_primary_youtube_account(db, user_id, account_id)
    if not config:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"status": "success", "account_id": account_id, "is_primary": True}


    return {"status": "success", "account_id": account_id, "is_primary": True}


# Instagram Integration Endpoints
@app.get("/auth/instagram/url")
async def get_instagram_auth_url(db: AsyncSession = Depends(get_db)):
    redirect_uri = f"{FRONTEND_URL}/auth/instagram/callback"
    
    # Try to get credentials from DB first
    client_id = await crud.get_system_config(db, "instagram_client_id")
    
    # Fallback to Facebook Client ID if Instagram one is not set (Shared App)
    if not client_id:
        client_id = await crud.get_system_config(db, "facebook_client_id")
    
    url = meta_service.get_instagram_auth_url(redirect_uri, client_id=client_id)
    if not url:
        raise HTTPException(
            status_code=400, 
            detail="Client ID is missing. Please configure Facebook/Instagram credentials in Settings > Platform Configuration."
        )
    return {"auth_url": url}

@app.post("/auth/instagram/callback")
async def instagram_auth_callback(code: str, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    redirect_uri = f"{FRONTEND_URL}/auth/instagram/callback"
    
    # Get credentials from DB
    client_id = await crud.get_system_config(db, "instagram_client_id")
    client_secret = await crud.get_system_config(db, "instagram_client_secret")
    
    # Fallback to Facebook credentials if Instagram ones are missing
    if not client_id:
        client_id = await crud.get_system_config(db, "facebook_client_id")
        client_secret = await crud.get_system_config(db, "facebook_client_secret")
    
    token_data, error = meta_service.exchange_instagram_code(code, redirect_uri, client_id=client_id, client_secret=client_secret)
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    profile_info = {
        "id": token_data["user_id"],
        "username": token_data["username"],
        "follower_count": token_data["follower_count"],
        "profile_picture": token_data.get("profile_picture")
    }
        
    await crud.save_instagram_config(db, user_id, token_data, profile_info)
    return {"status": "connected", "username": profile_info["username"]}

@app.get("/auth/instagram/status")
async def get_instagram_status(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    configs = await crud.get_all_instagram_configs(db, user_id)
    return {"is_connected": len(configs) > 0, "accounts": configs}

@app.delete("/auth/instagram/accounts/{account_id}")
async def disconnect_instagram_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    await crud.disconnect_instagram_config(db, user_id, account_id)
    return {"status": "disconnected"}

@app.post("/auth/instagram/accounts/{account_id}/set-primary")
async def set_primary_instagram_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    await crud.set_primary_instagram_account(db, user_id, account_id)
    return {"status": "success"}

# Facebook Integration Endpoints
@app.get("/auth/facebook/url")
async def get_facebook_auth_url(db: AsyncSession = Depends(get_db)):
    redirect_uri = f"{FRONTEND_URL}/auth/facebook/callback"
    
    # Try to get credentials from DB first
    client_id = await crud.get_system_config(db, "facebook_client_id")
    
    url = meta_service.get_facebook_auth_url(redirect_uri, client_id=client_id)
    if not url:
        raise HTTPException(
            status_code=400, 
            detail="Facebook Client ID is missing or invalid. Please configure it in Settings > Platform Configuration."
        )
    return {"auth_url": url}

@app.post("/auth/facebook/callback")
async def facebook_auth_callback(code: str, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    redirect_uri = f"{FRONTEND_URL}/auth/facebook/callback"
    
    # Get credentials from DB
    client_id = await crud.get_system_config(db, "facebook_client_id")
    client_secret = await crud.get_system_config(db, "facebook_client_secret")
    
    token_data, error = meta_service.exchange_facebook_code(code, redirect_uri, client_id=client_id, client_secret=client_secret)
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    page_info = {
        "id": token_data["id"],
        "name": token_data["name"],
        "fan_count": 0 
    }
        
    await crud.save_facebook_config(db, user_id, token_data, page_info)
    return {"status": "connected", "page_name": page_info["name"]}

@app.get("/auth/facebook/status")
async def get_facebook_status(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    configs = await crud.get_all_facebook_configs(db, user_id)
    return {"is_connected": len(configs) > 0, "accounts": configs}

@app.delete("/auth/facebook/accounts/{account_id}")
async def disconnect_facebook_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    await crud.disconnect_facebook_config(db, user_id, account_id)
    return {"status": "disconnected"}

@app.post("/auth/facebook/accounts/{account_id}/set-primary")
async def set_primary_facebook_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    await crud.set_primary_facebook_account(db, user_id, account_id)
    return {"status": "success"}

# X Integration Endpoints
@app.get("/auth/x/url")
async def get_x_auth_url(db: AsyncSession = Depends(get_db)):
    redirect_uri = f"{FRONTEND_URL}/auth/x/callback"
    
    # Try to get credentials from DB first
    client_id = await crud.get_system_config(db, "x_client_id")
    
    url = x_service.get_auth_url(redirect_uri, client_id=client_id)
    if not url:
        raise HTTPException(
            status_code=400, 
            detail="X Client ID is missing or invalid. Please configure it in Settings > Platform Configuration."
        )
    return {"auth_url": url}

@app.post("/auth/x/callback")
async def x_auth_callback(code: str, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    redirect_uri = f"{FRONTEND_URL}/auth/x/callback"
    
    # Get credentials from DB
    client_id = await crud.get_system_config(db, "x_client_id")
    client_secret = await crud.get_system_config(db, "x_client_secret")
    
    token_data, error = x_service.exchange_code(code, redirect_uri, client_id=client_id, client_secret=client_secret)
    if error:
        raise HTTPException(status_code=400, detail=error)

    user_info = {
        "id_str": token_data["user_id"],
        "screen_name": token_data["username"],
        "follower_count": token_data["followers_count"],
        "profile_image_url": token_data["profile_image"]
    }
        
    await crud.save_x_config(db, user_id, token_data, user_info)
    return {"status": "connected", "username": user_info["screen_name"]}

@app.get("/auth/x/status")
async def get_x_status(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    configs = await crud.get_all_x_configs(db, user_id)
    return {"is_connected": len(configs) > 0, "accounts": configs}

@app.delete("/auth/x/accounts/{account_id}")
async def disconnect_x_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    await crud.disconnect_x_config(db, user_id, account_id)
    return {"status": "disconnected"}

@app.post("/auth/x/accounts/{account_id}/set-primary")
async def set_primary_x_account(account_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    await crud.set_primary_x_account(db, user_id, account_id)
    return {"status": "success"}


# Unified Auth Endpoints
# Auth Logic continued...

@app.get("/auth/login")
async def login(db: AsyncSession = Depends(get_db)):
    """Redirects user to Google OAuth URL"""
    # Use dynamic credentials from DB if available, else env
    client_id = await crud.get_system_config(db, "google_client_id")
    client_secret = await crud.get_system_config(db, "google_client_secret")
    
    # Redirect to frontend callback for consistency or handle here?
    # The plan was: Frontend -> /auth/login -> Google -> Frontend Callback -> Backend Callback
    # But /auth/login is a GET endpoint that can directly return the URL
    
    url, error = youtube_service.get_auth_url(client_id=client_id, client_secret=client_secret)
    if error:
        raise HTTPException(status_code=400, detail=error)
        
    return {"auth_url": url}

@app.post("/auth/callback")
async def auth_callback(request: Request, code: str, db: AsyncSession = Depends(get_db)):
    """Unified Callback: Handles Google Login + YouTube Config"""
    
    client_id = await crud.get_system_config(db, "google_client_id")
    client_secret = await crud.get_system_config(db, "google_client_secret")

    # Exchange code for tokens and info
    # Note: youtube_service was updated to return user_info as 3rd tuple element
    try:
        token_data, channel_info, user_info = youtube_service.exchange_code_for_token(code, client_id=client_id, client_secret=client_secret)
    except ValueError as e: # Handle case where user_info isn't returned if service wasn't updated correctly in memory modules
         raise HTTPException(status_code=500, detail="Backend service mismatch. Please restart server.")

    if not token_data:
        raise HTTPException(status_code=400, detail=f"Failed to exchange code: {channel_info}")

    # 1. Extract User Info
    email = user_info.get('email')
    full_name = user_info.get('name')
    avatar_url = user_info.get('picture')
    google_id = user_info.get('id')
    
    if not email:
         raise HTTPException(status_code=400, detail="No email provided by Google")

    # 2. Determine User
    session_user_id = request.session.get("user_id")
    if session_user_id:
        # If already logged in, link to current user
        user = await crud.get_user_by_id(db, session_user_id)
        if not user:
             # Fallback if session is invalid for some reason
             user = await crud.create_or_update_user(db, email, full_name, avatar_url, google_id)
    else:
        # Initial login
        user = await crud.create_or_update_user(db, email, full_name, avatar_url, google_id)
    
    # 3. Save YouTube Config
    await crud.save_youtube_config(db, user.id, token_data, channel_info)
    
    # 3. Set Session
    request.session["user_id"] = user.id
    
    return {
        "status": "success",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url
        },
        "channel": channel_info.get('title')
    }

@app.get("/auth/me")
async def get_current_user_endpoint(user: models.User = Depends(get_current_user)):
    if not user:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user": user
    }

@app.post("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged_out"}

@app.post("/upload/youtube")
async def upload_to_youtube(request: schemas.YouTubeUploadRequest, account_id: int = None, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Use current user if available, fallback to user 1 for MVP consistency 
    user_id = current_user.id if current_user else 1
    
    # Get Config - either specific account or primary
    if account_id:
        config = await crud.get_youtube_config_by_id(db, user_id, account_id)
        if not config:
            raise HTTPException(status_code=400, detail=f"YouTube account with ID {account_id} not found or not accessible.")
    else:
        config = await crud.get_youtube_config(db, user_id)
    
    if not config:
         raise HTTPException(status_code=400, detail="YouTube account not connected. Please go to Settings and connect your YouTube account, or Sign Out and Sign In again.")
    
    # Get Clip
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == request.video_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    # Upload - Now passing the config model directly and the DB session for refresh persistence
    response, error = await youtube_service.upload_video(
        config, 
        clip.file_path, 
        request.title, 
        request.description, 
        request.tags.split(',') if request.tags else [],
        privacy_status=request.privacy_status,
        thumbnail_path=request.thumbnail_path or clip.thumbnail_path,
        db=db
    )
    
    if error:
        raise HTTPException(status_code=500, detail=f"Upload failed: {error}")
    
    # Update clip with YouTube upload info
    youtube_id = response.get('id')
    clip.youtube_id = youtube_id
    clip.uploaded_to_channel = config.channel_name
    clip.uploaded_at = func.now()
    await db.commit()
        
    return {"status": "success", "youtube_id": youtube_id, "channel": config.channel_name}

@app.post("/upload/instagram")
async def upload_to_instagram(request: schemas.InstagramUploadRequest, account_id: int = None, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    
    if account_id:
        config = await crud.get_instagram_config_by_id(db, user_id, account_id)
    else:
        configs = await crud.get_all_instagram_configs(db, user_id)
        config = configs[0] if configs else None
        
    if not config:
        raise HTTPException(status_code=400, detail="Instagram account not connected.")
        
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == request.video_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    response, error = await meta_service.upload_instagram_reel(
        config, 
        clip.file_path, 
        request.caption
    )
    
    if error:
        raise HTTPException(status_code=500, detail=f"Instagram upload failed: {error}")
        
    return {"status": "success", "data": response}

@app.post("/upload/facebook")
async def upload_to_facebook(request: schemas.FacebookUploadRequest, account_id: int = None, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    
    if account_id:
        config = await crud.get_facebook_config_by_id(db, user_id, account_id)
    else:
        configs = await crud.get_all_facebook_configs(db, user_id)
        config = configs[0] if configs else None
        
    if not config:
        raise HTTPException(status_code=400, detail="Facebook account not connected.")
        
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == request.video_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    response, error = await meta_service.upload_facebook_video(
        config, 
        clip.file_path, 
        request.description
    )
    
    if error:
        raise HTTPException(status_code=500, detail=f"Facebook upload failed: {error}")
        
    return {"status": "success", "data": response}

@app.post("/upload/x")
async def upload_to_x(request: schemas.XUploadRequest, account_id: int = None, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_id = current_user.id if current_user else 1
    
    if account_id:
        config = await crud.get_x_config_by_id(db, user_id, account_id)
    else:
        configs = await crud.get_all_x_configs(db, user_id)
        config = configs[0] if configs else None
        
    if not config:
        raise HTTPException(status_code=400, detail="X account not connected.")
        
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == request.video_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    response, error = await x_service.upload_video(
        config, 
        clip.file_path, 
        request.text
    )
    
    if error:
        raise HTTPException(status_code=500, detail=f"X upload failed: {error}")
        
    return {"status": "success", "data": response}

@app.post("/clips/{clip_id}/thumbnail/capture")
async def capture_thumbnail(clip_id: int, timestamp: float, db: AsyncSession = Depends(get_db)):
    """Capture a specific frame from the video as a thumbnail"""
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == clip_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    from moviepy.editor import VideoFileClip
    import os
    
    try:
        # Resolve path relative to current app dir if it starts with /app/data
        current_file_path = clip.file_path
        if current_file_path.startswith("/app/data"):
            # If running outside docker, map /app/data to local data
            if not os.path.exists("/app/data"):
                current_file_path = current_file_path.replace("/app/data", "data")

        if not os.path.exists(current_file_path):
             raise Exception(f"Video file not found at {current_file_path}")

        with VideoFileClip(current_file_path) as video:
            thumb_filename = f"{os.path.basename(clip.file_path).replace('.mp4', '')}_thumb_{int(timestamp)}.jpg"
            thumb_path = os.path.join("data/clips", thumb_filename)
            video.save_frame(thumb_path, t=timestamp)
            
            # Store the relative path or absolute depending on how it's used
            # For simplicity, store the same format as file_path
            clip.thumbnail_path = f"/app/data/clips/{thumb_filename}"
            await db.commit()
            
            return {"status": "success", "thumbnail_url": f"/static/{thumb_filename}"}
    except Exception as e:
        print(f"Capture error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to capture frame: {str(e)}")

@app.post("/clips/{clip_id}/thumbnail/upload")
async def upload_custom_thumbnail(clip_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload a custom image as a thumbnail for a clip"""
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == clip_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    import os
    thumb_filename = f"{os.path.basename(clip.file_path).replace('.mp4', '')}_custom_{file.filename}"
    thumb_path = os.path.join("data/clips", thumb_filename)
    
    with open(thumb_path, "wb") as f:
        content = await file.read()
        f.write(content)
        
    clip.thumbnail_path = f"/app/data/clips/{thumb_filename}"
    await db.commit()
    
    return {"status": "success", "thumbnail_url": f"/static/{thumb_filename}"}

@app.delete("/clips/{clip_id}")
async def delete_clip(clip_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Delete a generated clip"""
    user_id = current_user.id if current_user else 1
    
    # Get the clip
    stmt = select(models.GeneratedClip).where(models.GeneratedClip.id == clip_id)
    result = await db.execute(stmt)
    clip = result.scalars().first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    # Optional: Verify user owns this clip via video_source relationship
    # For now, we'll allow any authenticated user to delete for MVP
    
    # Delete the clip from database explicitly
    from sqlalchemy import delete
    await db.execute(delete(models.GeneratedClip).where(models.GeneratedClip.id == clip_id))
    await db.commit()
    
    # Optional: Delete the actual file from filesystem
    import os
    if os.path.exists(clip.file_path):
        try:
            os.remove(clip.file_path)
        except Exception as e:
            print(f"Failed to delete file {clip.file_path}: {e}")
    
    return {"status": "deleted", "clip_id": clip_id}
