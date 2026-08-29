from .database import SessionLocal
from .models import VideoSource, GeneratedClip, ClipSuggestion, ProcessingStatus, YouTubeConfig
from .services import downloader, transcriber, analyzer, editor
from .security import decrypt_token
import os
import json
import subprocess


def _is_local_file(url: str) -> bool:
    return url.startswith("file://")


def _local_path(url: str) -> str:
    return url[len("file://"):] if _is_local_file(url) else url


def _get_youtube_credentials(db, user_id: int) -> dict | None:
    config = db.query(YouTubeConfig).filter(
        YouTubeConfig.user_id == user_id,
        YouTubeConfig.is_connected == True
    ).first()
    if not config or not config.access_token:
        return None
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    return {
        "access_token": decrypt_token(config.access_token),
        "refresh_token": decrypt_token(config.refresh_token),
        "client_id": client_id,
        "client_secret": client_secret,
    }


def _is_youtube_url(url: str) -> bool:
    return "youtube.com/" in url or "youtu.be/" in url


def _probe_local_video(path: str) -> dict:
    """Read metadata from a local video file via ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-print_format", "json",
                "-show_format", "-show_streams", path,
            ],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        video_stream = next(
            (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
            {},
        )
        fmt = data.get("format", {})
        return {
            "title": os.path.splitext(os.path.basename(path))[0],
            "thumbnail": None,
            "duration": float(fmt.get("duration", 0) or 0),
            "description": "",
            "channel": "",
            "view_count": 0,
            "width": video_stream.get("width"),
            "height": video_stream.get("height"),
        }
    except Exception as e:
        print(f"ffprobe error: {e}")
        return {
            "title": os.path.splitext(os.path.basename(path))[0],
            "thumbnail": None,
            "duration": 0,
            "description": "",
            "channel": "",
            "view_count": 0,
            "width": None,
            "height": None,
        }


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
            yt_creds = None
            if _is_youtube_url(video_url):
                yt_creds = _get_youtube_credentials(db, video.user_id)

            if _is_local_file(video_url):
                local_path = _local_path(video_url)
                metadata = _probe_local_video(local_path)
            elif yt_creds:
                metadata = downloader.get_video_metadata_via_api(video_url, yt_creds)
                if not metadata:
                    metadata = downloader.get_video_metadata(video_url)
            else:
                metadata = downloader.get_video_metadata(video_url)
            video.title = metadata.get("title")
            video.thumbnail_url = metadata.get("thumbnail")
            video.source_width = metadata.get("width")
            video.source_height = metadata.get("height")
            video.progress = 30
            db.commit()

            if _is_local_file(video_url):
                # Whisper needs an OpenAI key. Use the user's key when their AI
                # provider is OpenAI, otherwise fall back to the env var. Without
                # this, transcription silently fails and captions never render.
                openai_key = (api_key if provider == "openai" else None) or os.getenv("OPENAI_API_KEY")
                transcript = transcriber.transcribe_audio(_local_path(video_url), api_key=openai_key) or ""
            elif yt_creds:
                transcript = downloader.get_video_transcript_via_api(video_url, yt_creds)
                if not transcript:
                    transcript = downloader.get_video_transcript(video_url)
            else:
                transcript = downloader.get_video_transcript(video_url)
            if not transcript or len(transcript) < 100:
                transcript = metadata.get('description', '')

            # Persist the transcript so render can burn voice-synced captions.
            video.transcript = transcript
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


_VIRAL_ANGLE_EMOJI = {
    "funny": "😂",
    "emotional": "❤️",
    "surprising": "😱",
    "inspirational": "✨",
    "educational": "🧠",
    "satisfying": "😌",
}


def render_clip_task(suggestion_id: int, quality: str = "1080p", render_opts: dict | None = None):
    """
    Task to render a specific clip after user approval.
    """
    db = SessionLocal()
    suggestion = None
    try:
        suggestion = db.query(ClipSuggestion).filter(ClipSuggestion.id == suggestion_id).first()
        if not suggestion:
            return

        video = db.query(VideoSource).filter(VideoSource.id == suggestion.video_source_id).first()
        if not video:
            return

        suggestion.status = "rendering"
        suggestion.error_message = None
        db.commit()

        quality_map = {
            "4k": 3840,
            "1080p": 1920,
            "720p": 1280
        }
        target_height = quality_map.get(quality.lower(), 1080)

        opts = render_opts or {}
        overlay_opts = {
            "caption_text": (suggestion.title or suggestion.hook_description or "") if opts.get("captions_enabled") else None,
            "caption_language": opts.get("caption_language", "en"),
            "caption_style": opts.get("caption_style", "classic"),
            # Voice-synced SRT — when present, editor uses this instead of the
            # static title so captions follow what's actually being said.
            "transcript_srt": video.transcript if opts.get("captions_enabled") else None,
            "clip_start": float(suggestion.start_time or 0),
            "clip_end": float(suggestion.end_time or 0),
            "emoji_text": _VIRAL_ANGLE_EMOJI.get((suggestion.viral_angle or "").lower(), "✨") if opts.get("emojis_enabled") else None,
            "emoji_style": opts.get("emoji_style", "standard"),
            "emoji_meme_mode": opts.get("emoji_meme_mode", False),
        }

        if _is_local_file(video.original_url):
            segment_path = None
            result = editor.create_vertical_clip(
                source_path=_local_path(video.original_url),
                start_time=str(suggestion.start_time),
                end_time=str(suggestion.end_time),
                target_height=target_height,
                overlay_opts=overlay_opts,
            )
        else:
            # download_video_segment now returns the full video file (see
            # note in downloader.py) — trim to the requested window here.
            segment_path = downloader.download_video_segment(
                url=video.original_url,
                start_time=suggestion.start_time,
                end_time=suggestion.end_time
            )
            result = editor.create_vertical_clip(
                source_path=segment_path,
                start_time=str(suggestion.start_time),
                end_time=str(suggestion.end_time),
                target_height=target_height,
                overlay_opts=overlay_opts,
            )

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

        if segment_path and os.path.exists(segment_path):
            os.remove(segment_path)

    except Exception as e:
        print(f"Render failed: {e}")
        if suggestion:
            suggestion.status = "failed"
            suggestion.error_message = str(e)[:2000]
            db.commit()
    finally:
        db.close()
