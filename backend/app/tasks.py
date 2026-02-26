from .worker import celery_app
from .database import SessionLocal
from .models import VideoSource, GeneratedClip, ClipSuggestion, ProcessingStatus
from .services import downloader, transcriber, analyzer, editor
import os
import shutil

@celery_app.task(name="app.tasks.process_video")
def process_video_task(video_id: int, video_url: str, clip_type: str = "short", aspect_ratio: str = "16:9"):
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
            
            # For direct_short or long, we don't need the transcript for analysis
            transcript = ""
            if clip_type == "short":
                transcript = downloader.get_video_transcript(video_url)
                if not transcript or len(transcript) < 100:
                    transcript = metadata.get('description', '')
            
            video.progress = 50
            db.commit()
            
        except Exception as e:
            raise Exception(f"Metadata fetch failed: {str(e)}")
        
        # ========== PHASE 2: PROCESSING BY TYPE ==========
        if clip_type == "short":
            # AI Virality extraction flow
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
                        suggested_quality=suggested_quality,
                        score_breakdown=str(suggestion.get("score_breakdown")),
                        is_narrative_complete=suggestion.get("is_narrative_complete", True)
                    )
                    db.add(clip_suggestion)
                
                db.commit()
                
                # ========== STOP HERE: AWAITING USER CONFIRMATION ==========
                video.status = ProcessingStatus.AWAITING_CONFIRMATION
                video.progress = 100
                db.commit()
            except Exception as e:
                raise Exception(f"AI analysis failed: {str(e)}")
        
        elif clip_type == "direct_short":
            # Direct short clip from URL
            video.status = ProcessingStatus.GENERATING_CLIPS
            video.progress = 60
            db.commit()
            
            try:
                # 1. Download segment (full video)
                segment_path = downloader.download_video_segment(
                    url=video_url,
                    start_time=0,
                    end_time=metadata.get("duration", 0)
                )
                
                # 2. Render vertical clip
                result = editor.create_vertical_clip(
                    source_path=segment_path,
                    start_time="0",
                    end_time=str(metadata.get("duration", 0)),
                    target_height=1920 # Default to 1080p vertical
                )
                
                # 3. Save to database
                new_clip = GeneratedClip(
                    video_source_id=video.id,
                    file_path=result["file_path"],
                    thumbnail_path=result["thumbnail_path"],
                    width=result["width"],
                    height=result["height"],
                    file_size=result["file_size"],
                    title=video.title or "Short Clip",
                    description=f"Direct short clip from {video_url}",
                    tags="#short,#clip",
                    duration=metadata.get("duration", 0)
                )
                db.add(new_clip)
                
                # Cleanup segment
                if os.path.exists(segment_path):
                    os.remove(segment_path)
                
                video.status = ProcessingStatus.COMPLETED
                video.progress = 100
                db.commit()
            except Exception as e:
                raise Exception(f"Direct short generation failed: {str(e)}")

        elif clip_type == "long":
            # Long clip from URL
            video.status = ProcessingStatus.GENERATING_CLIPS
            video.progress = 60
            db.commit()
            
            try:
                # 1. Download full video (reuse segments logic or download)
                # Since it's a long clip, we might want to use the downloader directly
                download_res = downloader.download_video(video_url)
                downloaded_file_path = download_res["file_path"]
                
                # 2. Create long clip (re-encode)
                result = editor.create_long_clip(
                    source_path=downloaded_file_path,
                    aspect_ratio=aspect_ratio
                )
                
                # 3. Save to database
                ar_label = "16:9 Horizontal" if aspect_ratio == "16:9" else "9:16 Vertical"
                new_clip = GeneratedClip(
                    video_source_id=video.id,
                    file_path=result["file_path"],
                    thumbnail_path=result["thumbnail_path"],
                    width=result["width"],
                    height=result["height"],
                    file_size=result["file_size"],
                    title=video.title or "Long Clip",
                    description=f"Full-length video — {ar_label} format.",
                    tags="#longform,#video",
                    duration=metadata.get("duration", 0)
                )
                db.add(new_clip)
                
                # Cleanup downloaded file
                if os.path.exists(downloaded_file_path):
                    os.remove(downloaded_file_path)
                
                video.status = ProcessingStatus.COMPLETED
                video.progress = 100
                db.commit()
            except Exception as e:
                raise Exception(f"Long clip generation failed: {str(e)}")
        
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


@celery_app.task(name="app.tasks.process_uploaded_video")
def process_uploaded_video_task(video_id: int, file_path: str):
    """
    Process a locally-uploaded video file for SHORT clip extraction.
    Transcribes the audio using Whisper, then runs the same AI analysis
    as the YouTube URL flow.
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

        # ========== PHASE 1: TRANSCRIPTION ==========
        video.status = ProcessingStatus.ANALYZING_METADATA
        video.progress = 15
        db.commit()

        try:
            transcript = transcriber.transcribe_local_file(file_path)
            if not transcript or len(transcript) < 50:
                transcript = "Local video file with no available transcript."

            video.progress = 40
            db.commit()

        except Exception as e:
            transcript = "Transcription failed."
            video.progress = 40
            db.commit()

        # Build minimal metadata from the file
        metadata = {"title": video.title or os.path.basename(file_path), "description": ""}
        try:
            from .services import editor
            probe = editor.get_video_info(file_path)
            if probe:
                metadata["width"] = probe.get("width")
                metadata["height"] = probe.get("height")
                video.source_width = probe.get("width")
                video.source_height = probe.get("height")
                db.commit()
        except Exception:
            pass

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
                suggested_quality = "1080p"
                if video.source_height:
                    if video.source_height >= 2160:
                        suggested_quality = "4k"
                    elif video.source_height >= 1080:
                        suggested_quality = "1080p"
                    else:
                        suggested_quality = "720p"

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
                    suggested_quality=suggested_quality,
                    score_breakdown=str(suggestion.get("score_breakdown")),
                    is_narrative_complete=suggestion.get("is_narrative_complete", True)
                )
                db.add(clip_suggestion)

            db.commit()
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


@celery_app.task(name="app.tasks.process_long_clip")
def process_long_clip_task(video_id: int, file_path: str, aspect_ratio: str = "16:9"):
    """
    Process a locally-uploaded video as a LONG CLIP.
    Returns the full original video as-is (no AI clipping, no re-encoding).
    The aspect_ratio param is stored in the clip title for reference but
    does not trigger transcoding — the user wants the raw upload preserved.
    """
    db = SessionLocal()
    try:
        video = db.query(VideoSource).filter(VideoSource.id == video_id).first()
        if not video:
            return

        video.status = ProcessingStatus.ANALYZING_METADATA
        video.progress = 20
        db.commit()

        # Get basic video info
        probe = {}
        try:
            from .services import editor
            probe = editor.get_video_info(file_path) or {}
            if probe:
                video.source_width = probe.get("width")
                video.source_height = probe.get("height")
                db.commit()
        except Exception:
            pass

        video.progress = 50
        db.commit()

        # Copy the original file to the clips directory
        clips_dir = "data/clips"
        os.makedirs(clips_dir, exist_ok=True)

        ext = os.path.splitext(file_path)[1] or ".mp4"
        output_filename = f"long_clip_{video_id}{ext}"
        output_path = os.path.join(clips_dir, output_filename)
        shutil.copy2(file_path, output_path)

        # Generate a thumbnail
        thumbnail_path = None
        try:
            from .services import editor as ed
            thumbnail_path = ed.generate_thumbnail(output_path, timestamp=2.0)
        except Exception:
            pass

        file_size = os.path.getsize(output_path)
        duration = probe.get("duration")
        ar_label = "16:9 Horizontal" if aspect_ratio == "16:9" else "9:16 Vertical"

        new_clip = GeneratedClip(
            video_source_id=video_id,
            file_path=output_path,
            thumbnail_path=thumbnail_path,
            width=probe.get("width"),
            height=probe.get("height"),
            file_size=file_size,
            title=video.title or "Long Clip",
            description=f"Full-length video — {ar_label} format.",
            tags="#video,#longclip",
            duration=duration,
        )
        db.add(new_clip)

        video.status = ProcessingStatus.COMPLETED
        video.progress = 100
        db.commit()

    except Exception as e:
        video = db.query(VideoSource).filter(VideoSource.id == video_id).first()
        if video:
            video.status = ProcessingStatus.FAILED
            video.error_message = str(e)
            video.progress = 100
            db.commit()
    finally:
        db.close()





