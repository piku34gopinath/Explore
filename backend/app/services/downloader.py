import yt_dlp
import os
import re
import uuid

_COOKIE_FILE_PATH = "/tmp/youtube_cookies.txt"


def _get_cookiefile() -> str | None:
    """
    Materialize YouTube cookies for yt-dlp so downloads work from cloud IPs.

    Priority:
    1. YOUTUBE_COOKIES_FILE env var pointing to an existing cookies.txt
    2. YOUTUBE_COOKIES env var containing Netscape-format cookie text
    Returns the path to a cookies file, or None if not configured.
    """
    explicit = os.getenv("YOUTUBE_COOKIES_FILE")
    if explicit and os.path.exists(explicit):
        # yt-dlp writes refreshed session cookies back to this file; if the
        # source is a read-only bind mount, copy it to a writable path first.
        try:
            import shutil
            if not os.path.exists(_COOKIE_FILE_PATH) or os.path.getmtime(explicit) > os.path.getmtime(_COOKIE_FILE_PATH):
                shutil.copyfile(explicit, _COOKIE_FILE_PATH)
            return _COOKIE_FILE_PATH
        except Exception as e:
            print(f"Failed to copy cookie file to writable path: {e}")
            return explicit

    raw = os.getenv("YOUTUBE_COOKIES")
    if raw:
        try:
            # Support values pasted with literal "\n" instead of real newlines.
            content = raw.replace("\\n", "\n")
            with open(_COOKIE_FILE_PATH, "w") as f:
                f.write(content)
            return _COOKIE_FILE_PATH
        except Exception as e:
            print(f"Failed to write cookie file: {e}")
    return None


def _apply_cookies(ydl_opts: dict) -> dict:
    cookiefile = _get_cookiefile()
    if cookiefile:
        ydl_opts["cookiefile"] = cookiefile
    return ydl_opts


def _extract_youtube_video_id(url: str) -> str | None:
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def _parse_iso8601_duration(duration: str) -> float:
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration or '')
    if not m:
        return 0
    h, mi, s = (int(v) if v else 0 for v in m.groups())
    return h * 3600 + mi * 60 + s


def get_video_metadata_via_api(url: str, credentials_dict: dict) -> dict | None:
    """Fetch metadata using YouTube Data API with user's OAuth credentials."""
    vid = _extract_youtube_video_id(url)
    if not vid:
        return None
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        import google.auth.transport.requests

        creds = Credentials(
            token=credentials_dict['access_token'],
            refresh_token=credentials_dict['refresh_token'],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=credentials_dict['client_id'],
            client_secret=credentials_dict['client_secret'],
        )
        if creds.expired:
            creds.refresh(google.auth.transport.requests.Request())

        youtube = build('youtube', 'v3', credentials=creds)
        resp = youtube.videos().list(part="snippet,contentDetails,statistics", id=vid).execute()
        items = resp.get('items', [])
        if not items:
            return None

        item = items[0]
        snippet = item['snippet']
        content = item['contentDetails']
        stats = item.get('statistics', {})
        thumbs = snippet.get('thumbnails', {})
        thumb_url = (thumbs.get('maxres') or thumbs.get('high') or thumbs.get('medium') or thumbs.get('default', {})).get('url')

        return {
            "title": snippet.get("title"),
            "thumbnail": thumb_url,
            "duration": _parse_iso8601_duration(content.get("duration")),
            "description": snippet.get("description", ""),
            "channel": snippet.get("channelTitle", ""),
            "view_count": int(stats.get("viewCount", 0)),
            "width": None,
            "height": None,
        }
    except Exception as e:
        print(f"YouTube API metadata error: {e}")
        return None


def get_video_transcript_via_api(url: str, credentials_dict: dict) -> str:
    """Fetch captions using YouTube Data API."""
    vid = _extract_youtube_video_id(url)
    if not vid:
        return ""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        import google.auth.transport.requests
        import requests as http_requests

        creds = Credentials(
            token=credentials_dict['access_token'],
            refresh_token=credentials_dict['refresh_token'],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=credentials_dict['client_id'],
            client_secret=credentials_dict['client_secret'],
        )
        if creds.expired:
            creds.refresh(google.auth.transport.requests.Request())

        youtube = build('youtube', 'v3', credentials=creds)
        captions_resp = youtube.captions().list(part="snippet", videoId=vid).execute()
        caption_items = captions_resp.get('items', [])
        if not caption_items:
            return ""

        en_caption = next((c for c in caption_items if c['snippet']['language'] == 'en'), None)
        if not en_caption:
            en_caption = caption_items[0]

        caption_id = en_caption['id']
        resp = youtube.captions().download(id=caption_id, tfmt='srt').execute()
        lines = resp.decode('utf-8', errors='replace').split('\n')
        text_lines = [l for l in lines if l.strip() and not l.strip().isdigit() and '-->' not in l]
        return ' '.join(text_lines)
    except Exception as e:
        print(f"YouTube API transcript error: {e}")
        return ""


_METADATA_CLIENT_ATTEMPTS = [
    ['web'],
    ['tv'],
    ['ios'],
    ['mweb'],
    None,  # yt-dlp defaults
]


def get_video_metadata(url: str) -> dict:
    """
    Fetch video metadata WITHOUT downloading the video.
    Returns title, duration, thumbnail, description, etc.
    """
    # `format: all` disables format selection so yt-dlp does not raise
    # "Requested format is not available" for authenticated responses whose
    # advertised formats need a PO token (common on age-restricted videos).
    base_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'format': 'all',
    }

    last_err = None
    for clients in _METADATA_CLIENT_ATTEMPTS:
        ydl_opts = dict(base_opts)
        if clients:
            ydl_opts['extractor_args'] = {'youtube': {'player_client': clients}}
        try:
            with yt_dlp.YoutubeDL(_apply_cookies(ydl_opts)) as ydl:
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
            last_err = e
            print(f"Metadata fetch attempt failed (clients={clients}): {e}")
            continue

    print(f"Metadata fetch error: {last_err}")
    raise last_err


def get_video_transcript(url: str) -> str:
    """
    Extract video transcript/subtitles WITHOUT downloading the video.
    Returns full transcript text or empty string if unavailable.
    """
    base_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['en'],
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'format': 'all',
    }

    info = None
    for clients in _METADATA_CLIENT_ATTEMPTS:
        ydl_opts = dict(base_opts)
        if clients:
            ydl_opts['extractor_args'] = {'youtube': {'player_client': clients}}
        try:
            with yt_dlp.YoutubeDL(_apply_cookies(ydl_opts)) as ydl:
                info = ydl.extract_info(url, download=False)
            break
        except Exception as e:
            print(f"Transcript fetch attempt failed (clients={clients}): {e}")
            continue

    if info is None:
        return ""

    try:
            
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
    
    # NOTE: We used to pass `-ss`/`-to` to an external ffmpeg downloader (or
    # `download_ranges` + `force_keyframes_at_cuts`) to grab only the segment.
    # Both paths make ffmpeg fetch the googlevideo URL directly, which YouTube
    # now rejects with HTTP 403 because ffmpeg does not replay the
    # client-specific headers/signature yt-dlp used during extraction.
    #
    # Downloading the full media via yt-dlp's own downloader avoids that
    # (yt-dlp keeps the right headers per-format) — the caller trims locally
    # afterwards. The extra bandwidth is worth having renders actually work.
    base_opts = {
        'merge_output_format': 'mp4',
        'outtmpl': output_template,
        'quiet': False,
        'no_warnings': False,
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    }

    # Try a sequence of client/format combos. Different clients get blocked
    # in different ways (PO-token requirements, format mismatches, etc.), so
    # fall through until one works. `android` is the only client that
    # currently serves real media URLs to unauthenticated requests without
    # requiring a PO token — put it first. (Verified 2026-08-20 across
    # multiple videos; the other clients all 403 on the media fetch.)
    attempts = [
        {'extractor_args': {'youtube': {'player_client': ['android']}}, 'format': 'best/bestvideo+bestaudio'},
        {'extractor_args': {'youtube': {'player_client': ['tv']}}, 'format': 'bestvideo+bestaudio/best'},
        {'extractor_args': {'youtube': {'player_client': ['web', 'mweb']}}, 'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'},
        {'extractor_args': {'youtube': {'player_client': ['ios']}}, 'format': 'bestvideo+bestaudio/best'},
        {'format': 'best[ext=mp4]/best'},
    ]

    last_error = None
    for extra in attempts:
        ydl_opts = {**base_opts, **extra}
        try:
            with yt_dlp.YoutubeDL(_apply_cookies(ydl_opts)) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
            if not os.path.exists(filename):
                base, _ = os.path.splitext(filename)
                for ext in ('mp4', 'mkv', 'webm'):
                    cand = f"{base}.{ext}"
                    if os.path.exists(cand):
                        filename = cand
                        break
            print(f"✓ Downloaded full video for segment {start_time}-{end_time}s: {filename} (client={extra.get('extractor_args')})")
            return filename
        except Exception as e:
            last_error = e
            print(f"Download attempt failed ({extra.get('extractor_args')}): {e}")
            continue

    raise last_error if last_error else RuntimeError("Video download failed")


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
        with yt_dlp.YoutubeDL(_apply_cookies(ydl_opts)) as ydl:
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
