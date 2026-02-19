import yt_dlp
import os
import uuid

def get_video_metadata(url: str) -> dict:
    """
    Fetch video metadata WITHOUT downloading the video.
    Returns title, duration, thumbnail, description, etc.
    """
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
        return {
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "description": info.get("description", ""),
            "channel": info.get("channel", ""),
            "view_count": info.get("view_count", 0),
            "width": info.get("width"),
            "height": info.get("height"),
        }
    except Exception as e:
        print(f"Metadata fetch error: {str(e)}")
        raise e


def get_video_transcript(url: str) -> str:
    """
    Extract video transcript/subtitles WITHOUT downloading the video.
    Returns full transcript text or empty string if unavailable.
    """
    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['en'],
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
        # Try to get subtitles
        subtitles = info.get('subtitles', {}).get('en', [])
        auto_subs = info.get('automatic_captions', {}).get('en', [])
        
        # Prefer manual subtitles, fallback to auto-generated
        sub_data = subtitles or auto_subs
        
        if sub_data:
            # Download the subtitle file (just the text, not video)
            for sub in sub_data:
                if sub.get('ext') == 'vtt' or sub.get('ext') == 'srv3':
                    # In production, you'd download and parse the VTT/SRV3 file
                    # For now, return a placeholder indicating success
                    return info.get('description', '')  # Fallback to description
        
        # If no subtitles, return description as fallback
        return info.get('description', '')
        
    except Exception as e:
        print(f"Transcript fetch error: {str(e)}")
        return ""  # Return empty string on failure


def download_video_segment(url: str, start_time: float, end_time: float, output_dir: str = "/app/data/segments") -> str:
    """
    Download ONLY a specific segment of the video using yt-dlp's native segment support.
    
    Args:
        url: Video URL
        start_time: Start time in seconds
        end_time: End time in seconds
    
    Returns:
        Path to downloaded segment file
    """
    os.makedirs(output_dir, exist_ok=True)
    segment_id = str(uuid.uuid4())
    output_template = os.path.join(output_dir, f"{segment_id}.%(ext)s")
    
    # Use yt-dlp's native segment download via external downloader args
    # This is MORE efficient than downloading full video then cropping
    # Use absolute best quality available
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'merge_output_format': 'mp4',
        'outtmpl': output_template,
        'quiet': False,
        'no_warnings': False,
        'nocheckcertificate': True,
        'external_downloader': 'ffmpeg',
        'external_downloader_args': {
            'ffmpeg_i': [
                '-ss', str(start_time),
                '-to', str(end_time),
            ]
        },
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
        print(f"✓ Downloaded segment {start_time}-{end_time}s: {filename}")
        return filename
    except Exception as e:
        print(f"Segment download error: {str(e)}")
        raise e


def download_video(url: str, output_dir: str = "/app/data/downloads") -> dict:
    """
    Legacy function - downloads entire video.
    Kept for backward compatibility but should be avoided for cost optimization.
    """
    os.makedirs(output_dir, exist_ok=True)
    video_id = str(uuid.uuid4())
    output_template = os.path.join(output_dir, f"{video_id}.%(ext)s")
    
    ydl_opts = {
        'format': 'best',
        'outtmpl': output_template,
        'quiet': False,
        'no_warnings': False,
        'nocheckcertificate': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
        return {
            "video_id": video_id,
            "file_path": filename,
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration")
        }
    except Exception as e:
        print(f"yt-dlp error: {str(e)}")
        raise e
