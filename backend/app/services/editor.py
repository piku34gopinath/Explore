from moviepy.editor import VideoFileClip
import os
import uuid
import PIL.Image

# Compatibility patch for newer Pillow versions used by MoviePy
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.Resampling.LANCZOS

def create_vertical_clip(source_path: str, start_time: str, end_time: str, output_dir: str = "data/clips", target_height: int = 1920) -> dict:
    os.makedirs(output_dir, exist_ok=True)
    
    def parse_time(time_str):
        # Handle HH:MM:SS,mmm format from SRT or simple seconds
        try:
            if ":" in time_str:
                h, m, s = time_str.replace(',', '.').split(':')
                return int(h) * 3600 + int(m) * 60 + float(s)
            return float(time_str)
        except:
            return 0

    start_seconds = parse_time(start_time)
    end_seconds = parse_time(end_time)
    
    clip_id = str(uuid.uuid4())
    output_path = os.path.join(output_dir, f"{clip_id}.mp4")
    thumbnail_path = os.path.join(output_dir, f"{clip_id}.jpg")
    
    with VideoFileClip(source_path) as video:
        # Prevent upscaling beyond source resolution
        actual_target_height = min(target_height, video.h)
        
        # Cut the clip, ensuring we don't exceed the actual duration
        actual_end = min(end_seconds, video.duration) if end_seconds > 0 else video.duration
        clip = video.subclip(start_seconds, actual_end)
        
        # Crop to 9:16 vertical
        w, h = clip.size
        target_ratio = 9/16
        new_w = h * target_ratio
        
        if new_w > w:
            # If video is too skinny/tall, fit width
            new_h = w / target_ratio
            clip = clip.crop(x1=0, y1=(h-new_h)/2, x2=w, y2=(h+new_h)/2)
        else:
            # Standard landscape to vertical crop
            clip = clip.crop(x1=(w-new_w)/2, y1=0, x2=(w+new_w)/2, y2=h)
            
        # Resize to target height
        clip = clip.resize(height=actual_target_height)
        
        # IMPORTANT: FFmpeg libx264 requires width/height to be divisible by 2
        final_w, final_h = clip.size
        if final_w % 2 != 0:
            final_w = (final_w // 2) * 2
        if final_h % 2 != 0:
            final_h = (final_h // 2) * 2
            
        if (final_w, final_h) != clip.size:
            print(f"[EDITOR] Adjusting dimensions for FFmpeg compatibility: {clip.size} -> ({final_w}, {final_h})")
            clip = clip.resize(newsize=(final_w, final_h))
        
        # Capture a frame for thumbnail (middle of the clip)
        clip.save_frame(thumbnail_path, t=(end_seconds - start_seconds) / 2)
        
        # High-quality encoding settings
        # Dynamic bitrate and quality settings
        # We use CRF for quality control, so bitrate is primarily a ceiling/hint
        actual_width, actual_height = clip.size # Get dimensions after resizing

        if actual_height >= 2160:
            bitrate = "25000k"
            crf = "17" # Even higher quality for 4K
        elif actual_height >= 1080:
            bitrate = "12000k"
            crf = "18"
        else:
            bitrate = "6000k"
            crf = "20"

        print(f"[EDITOR] Creating vertical clip: {actual_width}x{actual_height} at {bitrate} (CRF {crf})")

        # High-quality encoding settings
        clip.write_videofile(
            output_path,
            codec="libx264",
            audio_codec="aac",
            bitrate=bitrate,
            preset="slow",
            ffmpeg_params=[
                "-crf", crf,
                "-profile:v", "high",
                "-level", "4.2",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                # Professional Sharpening Filter: makes human faces and text pop
                "-vf", "unsharp=5:5:0.8:5:5:0.0" 
            ]
        )
        
        final_size = os.path.getsize(output_path)
        final_w, final_h = clip.size
        
    return {
        "file_path": output_path,
        "thumbnail_path": thumbnail_path,
        "width": final_w,
        "height": final_h,
        "file_size": final_size
    }


def get_video_info(file_path: str) -> dict:
    """Return basic metadata for a local video file using MoviePy."""
    try:
        with VideoFileClip(file_path) as video:
            return {
                "width": int(video.w),
                "height": int(video.h),
                "duration": video.duration,
                "fps": video.fps,
            }
    except Exception as e:
        print(f"[EDITOR] get_video_info failed for {file_path}: {e}")
        return {}


def generate_thumbnail(file_path: str, timestamp: float = 2.0, output_dir: str = "data/clips") -> str:
    """Extract a single frame from a video file as a JPEG thumbnail."""
    try:
        os.makedirs(output_dir, exist_ok=True)
        thumbnail_id = str(uuid.uuid4())
        thumbnail_path = os.path.join(output_dir, f"{thumbnail_id}.jpg")
        with VideoFileClip(file_path) as video:
            t = min(timestamp, video.duration - 0.1)
            video.save_frame(thumbnail_path, t=t)
        return thumbnail_path
    except Exception as e:
        print(f"[EDITOR] generate_thumbnail failed: {e}")
        return None


def create_long_clip(
    source_path: str,
    aspect_ratio: str = "16:9",  # "16:9" (horizontal) or "9:16" (vertical)
    output_dir: str = "data/clips",
) -> dict:
    """
    Re-encode an uploaded video into the requested aspect ratio.

    - aspect_ratio="16:9"  → 1920×1080 horizontal (YouTube long-form)
    - aspect_ratio="9:16"  → 1080×1920 vertical   (TikTok / Reels / Shorts)

    The source video is center-cropped (no black bars) to achieve the target
    ratio, then resized to the target resolution.  Audio is preserved.
    """
    os.makedirs(output_dir, exist_ok=True)
    clip_id = str(uuid.uuid4())
    output_path = os.path.join(output_dir, f"{clip_id}.mp4")
    thumbnail_path = os.path.join(output_dir, f"{clip_id}.jpg")

    with VideoFileClip(source_path) as video:
        clip = video

        src_w, src_h = clip.size
        src_ratio = src_w / src_h

        if aspect_ratio == "9:16":
            # Target: vertical 9:16  → portrait 1080×1920
            target_w, target_h = 1080, 1920
            target_ratio = 9 / 16          # 0.5625

            if src_ratio > target_ratio:
                # Source is wider than 9:16 → crop width
                new_w = src_h * target_ratio
                x1 = (src_w - new_w) / 2
                clip = clip.crop(x1=x1, y1=0, x2=x1 + new_w, y2=src_h)
            else:
                # Source is already narrower → crop height
                new_h = src_w / target_ratio
                y1 = (src_h - new_h) / 2
                clip = clip.crop(x1=0, y1=y1, x2=src_w, y2=y1 + new_h)

        else:
            # Default: horizontal 16:9 → landscape 1920×1080
            target_w, target_h = 1920, 1080
            target_ratio = 16 / 9          # ~1.7778

            if src_ratio < target_ratio:
                # Source is taller than 16:9 → crop height
                new_h = src_w / target_ratio
                y1 = (src_h - new_h) / 2
                clip = clip.crop(x1=0, y1=y1, x2=src_w, y2=y1 + new_h)
            else:
                # Source is wider than 16:9 → crop width
                new_w = src_h * target_ratio
                x1 = (src_w - new_w) / 2
                clip = clip.crop(x1=x1, y1=0, x2=x1 + new_w, y2=src_h)

        # Limit upscaling – never exceed the source's native resolution
        max_target_w = min(target_w, clip.w)
        max_target_h = min(target_h, clip.h)

        # Resize while preserving the cropped ratio
        clip = clip.resize(width=max_target_w)
        if clip.h > max_target_h:
            clip = clip.resize(height=max_target_h)

        # Ensure even dimensions for libx264
        fw, fh = clip.size
        fw = (fw // 2) * 2
        fh = (fh // 2) * 2
        if (fw, fh) != clip.size:
            clip = clip.resize(newsize=(fw, fh))

        # Thumbnail
        t_thumb = min(2.0, clip.duration - 0.1)
        clip.save_frame(thumbnail_path, t=t_thumb)

        # Quality presets
        if fh >= 1080 or fw >= 1920:
            bitrate, crf = "12000k", "18"
        else:
            bitrate, crf = "6000k", "20"

        print(f"[EDITOR] Creating long clip ({aspect_ratio}): {fw}x{fh} at {bitrate} (CRF {crf})")

        clip.write_videofile(
            output_path,
            codec="libx264",
            audio_codec="aac",
            bitrate=bitrate,
            preset="slow",
            ffmpeg_params=[
                "-crf", crf,
                "-profile:v", "high",
                "-level", "4.2",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
            ],
        )

        final_size = os.path.getsize(output_path)
        final_w, final_h = clip.size

    return {
        "file_path": output_path,
        "thumbnail_path": thumbnail_path,
        "width": final_w,
        "height": final_h,
        "file_size": final_size,
    }


