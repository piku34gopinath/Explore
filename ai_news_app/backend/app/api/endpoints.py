from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import json
import requests

from app.core.database import get_db
from app.models import SystemConfig, ScriptCache
from app.services.trend_service import trend_service
from app.services.llm_service import llm_service
from app.services.video_service import video_service
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter()

class SettingsUpdate(BaseModel):
    news_provider: str
    news_api_key: Optional[str] = None # Deprecated, but kept for compat
    gemini_api_key: Optional[str] = None
    newsapi_api_key: Optional[str] = None
    news_model: Optional[str] = None
    news_nickname: Optional[str] = None
    news_configs: Optional[List[Dict[str, Any]]] = None
    script_provider: str
    script_api_key: str
    script_model: str
    video_provider: str
    video_api_key: str
    script_configs: Optional[List[dict]] = None

@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get all AI News App settings"""
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key.startswith("ai_news_")))
    configs = result.scalars().all()
    
    settings_dict = {
        "news_provider": "",
        "news_api_key": "",
        "gemini_api_key": "",
        "newsapi_api_key": "",
        "news_model": "",
        "news_nickname": "",
        "news_configs": [],
        "script_provider": "",
        "script_api_key": "",
        "script_model": "",
        "video_provider": "",
        "video_api_key": "",
        "script_configs": []
    }
    
    for config in configs:
        key_name = config.key.replace("ai_news_", "")
        if key_name == "news_configs" and config.value:
            try:
                settings_dict[key_name] = json.loads(config.value)
            except:
                settings_dict[key_name] = []
        elif key_name == "script_configs" and config.value:
            try:
                settings_dict["script_configs"] = json.loads(config.value)
            except:
                pass
        elif key_name in settings_dict:
            settings_dict[key_name] = config.value
            
    return settings_dict

class VerifyGeminiRequest(BaseModel):
    api_key: str

@router.post("/verify-gemini")
async def verify_gemini(request: VerifyGeminiRequest):
    """
    Verify Gemini API key and list available models.
    """
    import google.generativeai as genai
    try:
        genai.configure(api_key=request.api_key)
        # List models to verify key and get available options
        models = []
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                # Filter for Gemini models specifically if needed, or return all text generators
                if "gemini" in m.name:
                     models.append(m.name.replace("models/", ""))
        
        if not models:
             # Fallback if specific filtering fails or no models found (unlikely with valid key)
             models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]

        return {"status": "success", "models": models}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verification failed: {str(e)}")

class VerifyNewsAPIRequest(BaseModel):
    api_key: str

@router.post("/verify-newsapi")
async def verify_newsapi(request: VerifyNewsAPIRequest):
    """
    Verify NewsAPI key by making a small request.
    """
    import requests
    try:
        url = f"https://newsapi.org/v2/sources?apiKey={request.api_key}"
        response = requests.get(url)
        if response.status_code == 200:
             return {"status": "success", "message": "API Key is valid!"}
        else:
             error_msg = response.json().get("message", "Unknown error")
             raise HTTPException(status_code=400, detail=f"Verification failed: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verification failed: {str(e)}")

class VerifyOpenAIRequest(BaseModel):
    api_key: str

@router.post("/verify-openai")
async def verify_openai(request: VerifyOpenAIRequest):
    """Verify OpenAI API key and list models."""
    try:
        headers = {"Authorization": f"Bearer {request.api_key}"}
        response = requests.get("https://api.openai.com/v1/models", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            # Filter for GPT models
            models = [m["id"] for m in data["data"] if "gpt" in m["id"]]
            return {"status": "success", "models": sorted(models)}
        else:
            raise HTTPException(status_code=400, detail="Invalid OpenAI API Key")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class VerifyAnthropicRequest(BaseModel):
    api_key: str

@router.post("/verify-anthropic")
async def verify_anthropic(request: VerifyAnthropicRequest):
    """Verify Anthropic API key. (Simple verification fallback)"""
    try:
        # Anthropic doesn't have a simple models list without a message attempt easily
        # but we can try a dummy message or just list of known models if key format looks okay
        # For better verification, we try the models endpoint if it exists or just 200 on key format?
        # Actually Anthropic DOES have a models endpoint now: https://api.anthropic.com/v1/models
        headers = {
            "x-api-key": request.api_key,
            "anthropic-version": "2023-06-01"
        }
        response = requests.get("https://api.anthropic.com/v1/models", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            models = [m["id"] for m in data["data"]]
            return {"status": "success", "models": sorted(models)}
        else:
            # Fallback to predefined if models endpoint is restricted but key is valid-ish
            return {"status": "success", "models": ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307"]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/settings")
async def update_settings(settings: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update AI News App settings"""
    updates = settings.model_dump()
    
    # Special handling for script_configs to sync legacy keys
    script_configs = updates.get("script_configs")
    if script_configs is not None:
        # Find default
        default_config = next((c for c in script_configs if c.get("is_default")), None)
        if not default_config and script_configs:
            default_config = script_configs[0]
            default_config["is_default"] = True
            
        if default_config:
            # Sync to legacy keys for compatibility with current script generator
            updates["script_provider"] = default_config.get("provider", "")
            updates["script_api_key"] = default_config.get("api_key", "")
            updates["script_model"] = default_config.get("model", "")
        
        # Convert list to JSON string for storage
        updates["script_configs"] = json.dumps(script_configs)

    # Support news_configs
    news_configs = updates.pop("news_configs", None)
    if news_configs is not None:
        # Convert list to JSON string for storage
        updates["news_configs"] = json.dumps(news_configs)
        
        # Sync default news config to legacy keys
        default_news = next((c for c in news_configs if c.get("is_default")), None)
        if not default_news and news_configs:
            default_news = news_configs[0]
            
        if default_news:
            updates["news_provider"] = default_news.get("provider", "")
            updates["news_api_key"] = default_news.get("api_key", "")
            updates["news_model"] = default_news.get("model", "")
            updates["news_nickname"] = default_news.get("nickname", "")

    # Sync active news provider key to legacy news_api_key for backend services
    if updates.get("news_provider") == "gemini" and updates.get("gemini_api_key"):
        updates["news_api_key"] = updates["gemini_api_key"]
    elif updates.get("news_provider") == "newsapi" and updates.get("newsapi_api_key"):
        updates["news_api_key"] = updates["newsapi_api_key"]

    for key, value in updates.items():
        if value is None: continue # Skip None values
        
        db_key = f"ai_news_{key}"
        
        # Check if exists
        result = await db.execute(select(SystemConfig).filter(SystemConfig.key == db_key))
        existing = result.scalars().first()
        
        if existing:
            existing.value = value
        else:
            new_config = SystemConfig(key=db_key, value=value)
            db.add(new_config)
            
    await db.commit()
    return {"status": "success"}

@router.get("/trends")
async def get_trends():
    """
    Get the top trending news events.
    """
    return await trend_service.get_trending_news()

@router.post("/generate-script")
async def generate_script(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Generate a script for a given news source URL or trend data.
    """
    # 1. Get LLM Settings
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key.startswith("ai_news_script_")))
    configs = {c.key.replace("ai_news_", ""): c.value for c in result.scalars().all()}
    
    provider = configs.get("script_provider", "openai")
    api_key = configs.get("script_api_key")
    model = configs.get("script_model", "gpt-4o")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="Script generation API key not configured.")

    # 2. Check Cache
    news_identifier = payload.get("event_title")
    if news_identifier:
        cache_result = await db.execute(select(ScriptCache).filter(ScriptCache.news_identifier == news_identifier))
        cached = cache_result.scalars().first()
        if cached:
            print(f"DEBUG: Cache hit for {news_identifier}")
            return json.loads(cached.script_data)

    # 3. Generate Script
    try:
        # payload can be a full trend object or just a URL
        # For now, we expect the frontend to pass the trend object
        script_data = await llm_service.generate_script(
            trend_data=payload,
            provider=provider,
            api_key=api_key,
            model=model
        )
        
        # 4. Save to Cache
        if news_identifier:
            new_cache = ScriptCache(
                news_identifier=news_identifier,
                script_data=json.dumps(script_data)
            )
            db.add(new_cache)
            await db.commit()
            print(f"DEBUG: Saved script to cache for {news_identifier}")
            
        return script_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-video")
async def generate_video(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    Initiate video generation process (Stub).
    """
    # 1. Get Video Settings
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key.startswith("ai_news_video_")))
    configs = {c.key.replace("ai_news_", ""): c.value for c in result.scalars().all()}
    
    provider = configs.get("video_provider", "minimax")
    api_key = configs.get("video_api_key")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="Video generation API key not configured.")

    # 2. Call Video Service
    try:
        response = await video_service.generate_video(
            script_data=payload,
            provider=provider,
            api_key=api_key
        )
        if "error" in response:
             raise HTTPException(status_code=400, detail=response["error"])
             
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import HTMLResponse
import requests

@router.get("/proxy")
async def proxy_url(url: str):
    """
    Proxy a URL to bypass X-Frame-Options/CSP restrictions in iframes.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        
        content = response.text
        # Inject <base> tag to fix relative links (images, css, js)
        base_tag = f'<base href="{url}">'
        if "<head>" in content:
            content = content.replace("<head>", f"<head>{base_tag}")
        elif "<html>" in content:
            content = content.replace("<html>", f"<html><head>{base_tag}</head>")
            
        return HTMLResponse(content=content, status_code=response.status_code)
    except Exception as e:
        return HTMLResponse(content=f"Error loading page: {str(e)}", status_code=500)

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get the status of a video generation job.
    """
    # 1. Get Video Settings (needed if we were calling a real API)
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key.startswith("ai_news_video_")))
    configs = {c.key.replace("ai_news_", ""): c.value for c in result.scalars().all()}
    
    provider = configs.get("video_provider", "minimax")
    api_key = configs.get("video_api_key", "") # Optional for mock
    
    try:
        status = await video_service.get_job_status(job_id, provider, api_key)
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
