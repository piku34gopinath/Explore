from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from .models import ProcessingStatus

class UserBase(BaseModel):
    email: str

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ClipBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    
class Clip(ClipBase):
    id: int
    video_source_id: int
    file_path: str
    thumbnail_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class ClipSuggestionBase(BaseModel):
    start_time: float
    end_time: float
    viral_score: float
    viral_angle: str
    hook_description: str
    reasoning: str
    status: str = "suggested"
    platform_preset: str = "tiktok"
    suggested_quality: Optional[str] = None
    tags: Optional[str] = None
    title: Optional[str] = None
    score_breakdown: Optional[str] = None
    is_narrative_complete: bool = True

class ClipSuggestion(ClipSuggestionBase):
    id: int
    video_source_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class VideoSourceBase(BaseModel):
    original_url: str

class VideoSourceCreate(VideoSourceBase):
    user_id: int # For simplicity in MVP, passing user_id directly
    clip_type: Optional[str] = "short"
    aspect_ratio: Optional[str] = "16:9"

class VideoSource(VideoSourceBase):
    id: int
    user_id: int
    thumbnail_url: Optional[str] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    status: ProcessingStatus
    progress: int = 0
    error_message: Optional[str] = None
    title: Optional[str] = None
    clip_type: Optional[str] = None
    aspect_ratio: Optional[str] = None
    created_at: datetime
    ai_model: Optional[str] = None
    clips: List[Clip] = []
    suggestions: List[ClipSuggestion] = []
    
    class Config:
        from_attributes = True


class KeyVerificationRequest(BaseModel):
    provider: str
    api_key: str


class AIConfigCreate(BaseModel):
    provider: str
    api_key: str
    selected_model: str


class AIConfigResponse(BaseModel):
    id: int
    provider: str
    selected_model: str
    is_active: bool

    class Config:
        from_attributes = True

class YouTubeAuthResponse(BaseModel):
    auth_url: str

class YouTubeConfigResponse(BaseModel):
    channel_name: Optional[str] = None
    channel_thumbnail: Optional[str] = None
    subscriber_count: Optional[int] = None
    video_count: Optional[int] = None
    is_connected: bool

class InstagramConfigResponse(BaseModel):
    username: Optional[str] = None
    profile_picture: Optional[str] = None
    follower_count: Optional[int] = None
    is_connected: bool

class FacebookConfigResponse(BaseModel):
    page_name: Optional[str] = None
    page_thumbnail: Optional[str] = None
    fan_count: Optional[int] = None
    is_connected: bool

class XConfigResponse(BaseModel):
    username: Optional[str] = None
    profile_image_url: Optional[str] = None
    follower_count: Optional[int] = None
    is_connected: bool

class YouTubeUploadRequest(BaseModel):
    video_id: int
    title: str
    description: str
    tags: str
    privacy_status: str = "private" # private, public, unlisted
    thumbnail_path: Optional[str] = None
    quality: Optional[str] = None

class InstagramUploadRequest(BaseModel):
    video_id: int
    caption: str

class FacebookUploadRequest(BaseModel):
    video_id: int
    description: str

class XUploadRequest(BaseModel):
    video_id: int
    text: str

class SystemConfig(BaseModel):
    key: str
    value: str

    class Config:
        from_attributes = True
