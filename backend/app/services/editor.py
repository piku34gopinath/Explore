from moviepy.editor import VideoFileClip
import os
import uuid
import PIL.Image

# Compatibility patch for newer Pillow versions used by MoviePy
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.Resampling.LANCZOS

def create_vertical_clip(source_path: str, start_time: str, end_time: str, output_dir: str = "/app/data/clips") -> str:
    os.makedirs(output_dir, exist_ok=True)
    
    def parse_time(time_str):
        # Handle HH:MM:SS,mmm format from SRT or simple seconds
        try:
            h, m, s = time_str.replace(',', '.').split(':')
            return int(h) * 3600 + int(m) * 60 + float(s)
        except:
            return 0

    start_seconds = parse_time(start_time)
    end_seconds = parse_time(end_time)
    
    clip_id = str(uuid.uuid4())
    output_path = os.path.join(output_dir, f"{clip_id}.mp4")
    
    with VideoFileClip(source_path) as video:
        # Cut the clip
        clip = video.subclip(start_seconds, end_seconds)
        
        # Crop to 9:16 vertical
        # Simple center crop for now. Smart crop requires face detection.
        w, h = clip.size
        target_ratio = 9/16
        new_w = h * target_ratio
        
        if new_w > w:
            # If video is too skinny/tall (unlikely for youtube landscape), fit width
            new_h = w / target_ratio
            clip = clip.crop(x1=0, y1=(h-new_h)/2, x2=w, y2=(h+new_h)/2)
        else:
            # Normal landscape to vertical
            clip = clip.crop(x1=(w-new_w)/2, y1=0, x2=(w+new_w)/2, y2=h)
            
        clip = clip.resize(height=1920) # Resize to standard Short height
        
        # High-quality encoding settings for viral-worthy clips
        clip.write_videofile(
            output_path, 
            codec="libx264",
            audio_codec="aac",
            bitrate="8000k",  # High bitrate for quality (8 Mbps)
            preset="slow",    # Better compression (slower encoding, better quality)
            ffmpeg_params=[  # Additional quality settings
                "-crf", "18",  # Constant Rate Factor (18 = near-lossless, lower = better)
                "-profile:v", "high",
                "-level", "4.2",
                "-pix_fmt", "yuv420p",  # Compatibility
            ]
        )
        
    return output_path
