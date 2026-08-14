import os
import uuid
import json
import subprocess


def _parse_time(time_str) -> float:
    """Handle HH:MM:SS,mmm format from SRT or simple seconds."""
    try:
        s = str(time_str)
        if ":" in s:
            h, m, sec = s.replace(',', '.').split(':')
            return int(h) * 3600 + int(m) * 60 + float(sec)
        return float(s)
    except Exception:
        return 0.0


def _probe_dimensions(path: str) -> tuple[int | None, int | None]:
    """Return (width, height) of a video's first video stream via ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-of", "json", path,
            ],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        stream = (data.get("streams") or [{}])[0]
        return stream.get("width"), stream.get("height")
    except Exception as e:
        print(f"[EDITOR] ffprobe dimension error: {e}")
        return None, None


def create_vertical_clip(source_path: str, start_time: str, end_time: str, output_dir: str = "/app/data/clips", target_height: int = 1920) -> dict:
    """
    Cut a segment, crop to 9:16, and encode using a streaming ffmpeg subprocess.

    This uses ffmpeg directly (not MoviePy) so memory usage stays flat and
    constant — critical on small cloud instances (e.g. Render free tier, 512MB
    RAM) where MoviePy's in-memory frame handling gets OOM-killed.
    """
    os.makedirs(output_dir, exist_ok=True)

    start_seconds = _parse_time(start_time)
    end_seconds = _parse_time(end_time)
    duration = max(0.1, end_seconds - start_seconds)

    clip_id = str(uuid.uuid4())
    output_path = os.path.join(output_dir, f"{clip_id}.mp4")
    thumbnail_path = os.path.join(output_dir, f"{clip_id}.jpg")

    # Cap the target height at the source height to avoid upscaling.
    _, src_height = _probe_dimensions(source_path)
    if src_height:
        target_height = min(target_height, src_height)

    # Choose quality/speed by resolution. "veryfast" keeps CPU + memory low on
    # constrained instances; CRF controls visual quality.
    if target_height >= 2160:
        crf = "20"
    elif target_height >= 1080:
        crf = "21"
    else:
        crf = "23"

    # Center-crop to a 9:16 aspect ratio, then scale to the target height.
    # scale=-2 keeps width auto and divisible by 2 (required by libx264).
    vf = (
        "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',"
        f"scale=-2:{target_height},"
        "unsharp=5:5:0.8:5:5:0.0"
    )

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_seconds),
        "-i", source_path,
        "-t", str(duration),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", crf,
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ]

    print(f"[EDITOR] Rendering clip -> {output_path} (h={target_height}, crf={crf}, dur={duration:.1f}s)")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not os.path.exists(output_path):
        raise Exception(f"ffmpeg render failed: {result.stderr[-800:]}")

    # Grab a thumbnail from the middle of the clip (relative to the trimmed segment).
    thumb_cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_seconds + duration / 2),
        "-i", source_path,
        "-vf", "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=-2:%d" % target_height,
        "-frames:v", "1",
        thumbnail_path,
    ]
    subprocess.run(thumb_cmd, capture_output=True, text=True)

    final_w, final_h = _probe_dimensions(output_path)
    final_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

    return {
        "file_path": output_path,
        "thumbnail_path": thumbnail_path if os.path.exists(thumbnail_path) else None,
        "width": final_w,
        "height": final_h,
        "file_size": final_size,
    }
