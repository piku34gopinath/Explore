from .worker import celery_app
from .database import SessionLocal
from .models import VideoSource, GeneratedClip, ClipSuggestion, ProcessingStatus
from .services import downloader, transcriber, analyzer, editor
import os
import shutil

@celery_app.task(name="app.tasks.process_video")
def process_video_task(video_id: int, video_url: str):
    """
    New metadata-first workflow:
    1. ANALYZING_METADATA - Fetch metadata & transcript WITHOUT downloading video
    2. ANALYZING_CONTENT - AI analyzes for viral moments, creates suggestions
    3. AWAIT_CONFIRMATION - User sees suggestions (frontend auto-approves or user manually approves)
    4. DOWNLOADING_SEGMENTS - Download only the approved clip segments
    5. GENERATING_CLIPS - Create final clips from segments
    6. COMPLETED - Done!
    """
    db = SessionLocal()
    try:
        video = db.query(VideoSource).filter(VideoSource.id == video_id).first()
        if not video:
            return
        
        # Fetch user's active AI config
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
            # Fetch metadata WITHOUT downloading video
            metadata = downloader.get_video_metadata(video_url)
            video.title = metadata.get("title")
            video.thumbnail_url = metadata.get("thumbnail")
            video.progress = 20
            db.commit()
            
            # Fetch transcript/description WITHOUT downloading video
            transcript = downloader.get_video_transcript(video_url)
            
            # Fallback: if no transcript, use video description
            if not transcript or len(transcript) < 100:
                transcript = transcriber.transcribe_audio if hasattr(transcriber, 'get_transcript_from_metadata') else metadata.get('description', '')
            
            video.progress = 30
            db.commit()
            
        except Exception as e:
            raise Exception(f"Metadata fetch failed: {str(e)}")
        
        # ========== PHASE 2: AI VIRAL ANALYSIS ==========
        video.status = ProcessingStatus.ANALYZING_CONTENT
        video.progress = 40
        db.commit()
        
        try:
            # AI analyzes transcript for viral moments
            viral_suggestions = analyzer.analyze_for_viral_clips(
                transcript=transcript,
                metadata=metadata,
                provider=provider,
                model=model,
                api_key=api_key,
                platform_preset="tiktok"  # TODO: Make this configurable
            )
            
            # Save suggestions to database
            for suggestion in viral_suggestions:
                clip_suggestion = ClipSuggestion(
                    video_source_id=video_id,
                    start_time=suggestion.get("start_time"),
                    end_time=suggestion.get("end_time"),
                    viral_score=suggestion.get("viral_score"),
                    viral_angle=suggestion.get("viral_angle"),
                    hook_description=suggestion.get("hook_description"),
                    reasoning=suggestion.get("reasoning"),
                    tags=suggestion.get("viral_hashtags"),  # Store comma-separated hashtags
                    status="suggested",
                    platform_preset="tiktok",
                    title=suggestion.get("title")
                )
                db.add(clip_suggestion)
            
            db.commit()
            video.progress = 60
            db.commit()
            
        except Exception as e:
            raise Exception(f"AI analysis failed: {str(e)}")
        
        # ========== PHASE 3: AWAITING USER CONFIRMATION ==========
        # In this MVP, we auto-approve all suggestions
        # TODO: Add user confirmation step via frontend
        video.status = ProcessingStatus.AWAITING_CONFIRMATION
        video.progress = 65
        db.commit()
        
        # Auto-approve all suggestions for MVP
        suggestions = db.query(ClipSuggestion).filter(
            ClipSuggestion.video_source_id == video_id,
            ClipSuggestion.status == "suggested"
        ).all()
        
        for sug in suggestions:
            sug.status = "approved"
        db.commit()
        
        # ========== PHASE 4: DOWNLOAD SEGMENTS ONLY ==========
        video.status = ProcessingStatus.DOWNLOADING_SEGMENTS
        video.progress = 70
        db.commit()
        
        approved_suggestions = db.query(ClipSuggestion).filter(
            ClipSuggestion.video_source_id == video_id,
            ClipSuggestion.status == "approved"
        ).all()
        
        segment_paths = []
        for i, suggestion in enumerate(approved_suggestions):
            try:
                # Download ONLY this segment (not full video!)
                segment_path = downloader.download_video_segment(
                    url=video_url,
                    start_time=suggestion.start_time,
                    end_time=suggestion.end_time
                )
                segment_paths.append((segment_path, suggestion))
                video.progress = 70 + ((i + 1) * 5)
                db.commit()
            except Exception as e:
                print(f"Failed to download segment {i}: {e}")
                suggestion.status = "failed"
                db.commit()
                continue
        
        # ========== PHASE 5: GENERATE CLIPS ==========
        video.status = ProcessingStatus.GENERATING_CLIPS
        video.progress = 85
        db.commit()
        
        clips_created = 0
        for segment_path, suggestion in segment_paths:
            try:
                # Create vertical clip from the segment
                output_path = editor.create_vertical_clip(
                    source_path=segment_path,
                    start_time="00:00:00",  # Segment already starts at correct time
                    end_time=f"00:00:{int(suggestion.end_time - suggestion.start_time)}"
                )
                
                # Save to database
                new_clip = GeneratedClip(
                    video_source_id=video_id,
                    file_path=output_path,
                    title=suggestion.title or f"{suggestion.viral_angle.title()} Moment",
                    description=suggestion.hook_description,
                    tags=suggestion.tags
                )
                db.add(new_clip)
                db.commit()
                
                suggestion.status = "generated"
                db.commit()
                
                clips_created += 1
                video.progress = min(85 + (clips_created * 5), 99)
                db.commit()
                
                # Cleanup segment file
                if os.path.exists(segment_path):
                    os.remove(segment_path)
                    
            except Exception as e:
                print(f"Error creating clip: {e}")
                suggestion.status = "failed"
                db.commit()
                continue
        
        # ========== PHASE 6: COMPLETED ==========
        if clips_created > 0:
            video.status = ProcessingStatus.COMPLETED
            video.progress = 100
        else:
            video.status = ProcessingStatus.FAILED
            video.progress = 100
            video.error_message = "No clips were successfully generated. AI did not find viral-worthy segments."
        db.commit()
        
    except Exception as e:
        video = db.query(VideoSource).filter(VideoSource.id == video_id).first()
        video.status = ProcessingStatus.FAILED
        video.error_message = str(e)
        video.progress = 100
        db.commit()
    finally:
        db.close()
