from moviepy.editor import VideoFileClip
import os
import uuid
import PIL.Image

# Compatibility patch for newer Pillow versions used by MoviePy
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.Resampling.LANCZOS

def create_vertical_clip(source_path: str, start_time: str, end_time: str, output_dir: str = "/app/data/clips", target_height: int = 1920) -> dict:
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
        
        # Cut the clip
        clip = video.subclip(start_seconds, end_seconds)
        
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
