from .worker import celery_app
from .database import SessionLocal
from .models import VideoSource, GeneratedClip, ClipSuggestion, ProcessingStatus
from .services import downloader, transcriber, analyzer, editor
import os
import shutil

@celery_app.task(name="app.tasks.process_video")
def process_video_task(video_id: int, video_url: str):
    """
    Split into two parts:
    1. Analysis (this task)
    2. Rendering (triggered by user approval)
    """
    db = SessionLocal()
    try:
        video = db.query(VideoSource).filter(VideoSource.id == video_id).first()
        if not video:
            return
        
        from .models import AIConfig
        ai_config = db.query(AIConfig).filter(AIConfig.user_id == video.user_id, AIConfig.is_active == True).first()
        
        provider = "openai"
        model = "gpt-4o"
        api_key = None
        
        if ai_config:
            provider = ai_config.provider
            model = ai_config.selected_model
            api_key = ai_config.api_key
        
        video.ai_model = model
        
        # ========== PHASE 1: METADATA ANALYSIS ==========
        video.status = ProcessingStatus.ANALYZING_METADATA
        video.progress = 10
        db.commit()
        
        try:
            metadata = downloader.get_video_metadata(video_url)
            video.title = metadata.get("title")
            video.thumbnail_url = metadata.get("thumbnail")
            video.source_width = metadata.get("width")
            video.source_height = metadata.get("height")
            video.progress = 30
            db.commit()
            
            transcript = downloader.get_video_transcript(video_url)
            if not transcript or len(transcript) < 100:
                transcript = metadata.get('description', '')
            
            video.progress = 50
            db.commit()
            
        except Exception as e:
            raise Exception(f"Metadata fetch failed: {str(e)}")
        
        # ========== PHASE 2: AI VIRAL ANALYSIS ==========
        video.status = ProcessingStatus.ANALYZING_CONTENT
        video.progress = 60
        db.commit()
        
        try:
            viral_suggestions = analyzer.analyze_for_viral_clips(
                transcript=transcript,
                metadata=metadata,
                provider=provider,
                model=model,
                api_key=api_key,
                platform_preset="tiktok"
            )
            
            for suggestion in viral_suggestions:
                # Default suggested quality based on source
                # Default to highest quality supported by source
                suggested_quality = "1080p"
                if video.source_height:
                    if video.source_height >= 2160:
                        suggested_quality = "4k"
                    elif video.source_height >= 1080:
                        suggested_quality = "1080p"
                    else:
                        suggested_quality = "720p"
                else:
                    suggested_quality = "1080p"

                clip_suggestion = ClipSuggestion(
                    video_source_id=video_id,
                    start_time=suggestion.get("start_time"),
                    end_time=suggestion.get("end_time"),
                    viral_score=suggestion.get("viral_score"),
                    viral_angle=suggestion.get("viral_angle"),
                    hook_description=suggestion.get("hook_description"),
                    reasoning=suggestion.get("reasoning"),
                    tags=suggestion.get("viral_hashtags"),
                    status="suggested",
                    platform_preset="tiktok",
                    title=suggestion.get("title"),
                    suggested_quality=suggested_quality
                )
                db.add(clip_suggestion)
            
            db.commit()
            
            # ========== STOP HERE: AWAITING USER CONFIRMATION ==========
            video.status = ProcessingStatus.AWAITING_CONFIRMATION
            video.progress = 100
            db.commit()
            
        except Exception as e:
            raise Exception(f"AI analysis failed: {str(e)}")
        
    except Exception as e:
        video = db.query(VideoSource).filter(VideoSource.id == video_id).first()
        if video:
            video.status = ProcessingStatus.FAILED
            video.error_message = str(e)
            video.progress = 100
            db.commit()
    finally:
        db.close()

@celery_app.task(name="app.tasks.render_clip")
def render_clip_task(suggestion_id: int, quality: str = "1080p"):
    """
    Task to render a specific clip after user approval.
    """
    db = SessionLocal()
    try:
        suggestion = db.query(ClipSuggestion).filter(ClipSuggestion.id == suggestion_id).first()
        if not suggestion:
            return
        
        video = db.query(VideoSource).filter(VideoSource.id == suggestion.video_source_id).first()
        if not video:
            return

        suggestion.status = "rendering"
        db.commit()

        # Map quality string to standard vertical heights (1080p vertical = 1920h)
        quality_map = {
            "4k": 3840,
            "1080p": 1920,
            "720p": 1280
        }
        target_height = quality_map.get(quality.lower(), 1080)

        # 1. Download segment
        segment_path = downloader.download_video_segment(
            url=video.original_url,
            start_time=suggestion.start_time,
            end_time=suggestion.end_time
        )

        # 2. Render vertical clip
        result = editor.create_vertical_clip(
            source_path=segment_path,
            start_time="0",
            end_time=str(suggestion.end_time - suggestion.start_time),
            target_height=target_height
        )

        # 3. Save to database
        new_clip = GeneratedClip(
            video_source_id=video.id,
            file_path=result["file_path"],
            thumbnail_path=result["thumbnail_path"],
            width=result["width"],
            height=result["height"],
            file_size=result["file_size"],
            title=suggestion.title or f"{suggestion.viral_angle.title()} Moment",
            description=suggestion.hook_description,
            tags=suggestion.tags,
            duration=suggestion.end_time - suggestion.start_time
        )
        db.add(new_clip)
        
        suggestion.status = "generated"
        db.commit()

        # Cleanup segment
        if os.path.exists(segment_path):
            os.remove(segment_path)

    except Exception as e:
        print(f"Render failed: {e}")
        if suggestion:
            suggestion.status = "failed"
            db.commit()
    finally:
        db.close()
