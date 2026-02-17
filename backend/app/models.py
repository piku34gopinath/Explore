from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base

class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    ANALYZING_METADATA = "analyzing_metadata"
    ANALYZING_CONTENT = "analyzing_content"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    DOWNLOADING_SEGMENTS = "downloading_segments"
    GENERATING_CLIPS = "generating_clips"
    COMPLETED = "completed"
    FAILED = "failed"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    videos = relationship("VideoSource", back_populates="user")

class VideoSource(Base):
    __tablename__ = "video_sources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    original_url = Column(String, nullable=False)
    title = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    status = Column(Enum(ProcessingStatus, values_callable=lambda x: [e.value for e in x]), default=ProcessingStatus.PENDING)
    progress = Column(Integer, default=0) # Percentage 0-100
    ai_model = Column(String, nullable=True) # The model used for this video
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="videos")
    clips = relationship("GeneratedClip", back_populates="video_source")
    suggestions = relationship("ClipSuggestion", back_populates="video_source")

class GeneratedClip(Base):
    __tablename__ = "generated_clips"

    id = Column(Integer, primary_key=True, index=True)
    video_source_id = Column(Integer, ForeignKey("video_sources.id"))
    file_path = Column(String)
    duration = Column(Float, nullable=True)
    title = Column(String)
    description = Column(String)
    tags = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # YouTube Upload tracking
    youtube_id = Column(String, nullable=True)  # YouTube video ID after upload
    uploaded_to_channel = Column(String, nullable=True)  # Channel name it was uploaded to
    uploaded_at = Column(DateTime(timezone=True), nullable=True)  # When it was uploaded

    video_source = relationship("VideoSource", back_populates="clips")


class ClipSuggestion(Base):
    __tablename__ = "clip_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    video_source_id = Column(Integer, ForeignKey("video_sources.id"))
    start_time = Column(Float)  # In seconds
    end_time = Column(Float)  # In seconds
    viral_score = Column(Float)  # 0-100
    viral_angle = Column(String)  # "emotional", "funny", "surprising", etc.
    hook_description = Column(Text)  # What happens in first 3 seconds
    reasoning = Column(Text)  # Why this clip is viral-worthy
    tags = Column(String, nullable=True)  # Viral hashtags (comma-separated, no # symbols)
    status = Column(String, default="suggested")  # "suggested", "approved", "rejected", "generated"
    platform_preset = Column(String, default="tiktok")  # "tiktok", "youtube_shorts", "instagram_reels"
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    video_source = relationship("VideoSource", back_populates="suggestions")


class AIConfig(Base):
    __tablename__ = "ai_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    provider = Column(String)  # openai, anthropic, gemini
    api_key = Column(String)    # Should be encrypted in prod
    selected_model = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")

class YouTubeConfig(Base):
    __tablename__ = "youtube_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    access_token = Column(String)
    refresh_token = Column(String)
    token_expiry = Column(DateTime(timezone=True))
    channel_name = Column(String)
    channel_id = Column(String)
    channel_thumbnail = Column(String)
    subscriber_count = Column(Integer, nullable=True)
    video_count = Column(Integer, nullable=True)
    is_connected = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)  # Primary account for uploads
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")

class InstagramConfig(Base):
    __tablename__ = "instagram_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    access_token = Column(String)
    refresh_token = Column(String, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    username = Column(String)
    instagram_id = Column(String)
    profile_picture = Column(String, nullable=True)
    follower_count = Column(Integer, nullable=True)
    is_connected = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")

class FacebookConfig(Base):
    __tablename__ = "facebook_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    access_token = Column(String)
    page_access_token = Column(String, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    page_name = Column(String)
    page_id = Column(String)
    page_thumbnail = Column(String, nullable=True)
    fan_count = Column(Integer, nullable=True)
    is_connected = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")

class XConfig(Base):
    __tablename__ = "x_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    access_token = Column(String)
    refresh_token = Column(String, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    username = Column(String)
    user_id_str = Column(String)
    profile_image_url = Column(String, nullable=True)
    follower_count = Column(Integer, nullable=True)
    is_connected = Column(Boolean, default=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")


class SystemConfig(Base):
    __tablename__ = "system_configs"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
