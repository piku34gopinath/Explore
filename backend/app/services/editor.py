from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip
import os
import uuid
import re
import numpy as np
import PIL.Image
from PIL import Image, ImageDraw, ImageFont

# Compatibility patch for newer Pillow versions used by MoviePy
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.Resampling.LANCZOS

# Font paths (present in the worker image)
CAPTION_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
EMOJI_STRIKE = 109  # NotoColorEmoji only has a bitmap strike at 109px

# Map the AI's viral_angle to a sticker emoji
ANGLE_EMOJI = {
    "funny": "😂",
    "emotional": "❤️",
    "surprising": "😱",
    "inspirational": "✨",
    "educational": "🧠",
    "satisfying": "😌",
}
DEFAULT_EMOJI = "🔥"


def _parse_srt(srt: str):
    """Parse SRT text into a list of (start_sec, end_sec, text) tuples."""
    if not srt:
        return []
    segments = []
    ts = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})")

    def to_sec(m):
        h, mnt, s, ms = m
        return int(h) * 3600 + int(mnt) * 60 + int(s) + int(ms) / 1000.0

    for block in re.split(r"\n\s*\n", srt.strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        if not lines:
            continue
        arrow = next((l for l in lines if "-->" in l), None)
        if not arrow:
            continue
        marks = ts.findall(arrow)
        if len(marks) < 2:
            continue
        start, end = to_sec(marks[0]), to_sec(marks[1])
        text = " ".join(lines[lines.index(arrow) + 1:]).strip()
        if text:
            segments.append((start, end, text))
    return segments


def _wrap_text(text, font, max_width, draw):
    """Greedy word-wrap so each line fits within max_width."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _render_caption_image(text, video_w):
    """Render a caption (white bold text, black outline) to an RGBA numpy array."""
    font_size = max(40, int(video_w * 0.075))
    font = ImageFont.truetype(CAPTION_FONT, font_size)
    max_text_w = int(video_w * 0.9)
    scratch = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    lines = _wrap_text(text.upper(), font, max_text_w, scratch)

    stroke = max(3, font_size // 12)
    line_h = int(font_size * 1.25)
    pad = stroke * 2
    img_h = line_h * len(lines) + pad * 2
    img = Image.new("RGBA", (video_w, img_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        w = d.textlength(line, font=font)
        x = (video_w - w) / 2
        y = pad + i * line_h
        d.text((x, y), line, font=font, fill=(255, 255, 255, 255),
               stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
    return np.array(img)


KARAOKE_HIGHLIGHT = (255, 224, 0, 255)  # bright yellow for the active word


def _group_words_into_lines(words, font, max_width, draw, max_words=4):
    """Group consecutive word dicts into caption lines that fit max_width."""
    lines, cur = [], []
    for w in words:
        trial = " ".join([x["word"] for x in cur] + [w["word"]]).upper()
        too_wide = draw.textlength(trial, font=font) > max_width
        if cur and (too_wide or len(cur) >= max_words):
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def _render_karaoke_line(line_words, active_index, video_w):
    """Render one caption line with the active word highlighted (RGBA array)."""
    font_size = max(44, int(video_w * 0.08))
    font = ImageFont.truetype(CAPTION_FONT, font_size)
    stroke = max(3, font_size // 11)
    gap = int(font_size * 0.28)

    tokens = [w["word"].upper() for w in line_words]
    scratch = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    widths = [scratch.textlength(t, font=font) for t in tokens]
    total_w = sum(widths) + gap * (len(tokens) - 1)

    pad = stroke * 3
    img_w = video_w
    img_h = int(font_size * 1.5) + pad * 2
    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    x = (img_w - total_w) / 2
    y = pad
    for i, tok in enumerate(tokens):
        fill = KARAOKE_HIGHLIGHT if i == active_index else (255, 255, 255, 255)
        d.text((x, y), tok, font=font, fill=fill,
               stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
        x += widths[i] + gap
    return np.array(img)


def _build_karaoke_clips(base_clip, words):
    """Build per-word ImageClip overlays that highlight each word as spoken."""
    w, h = base_clip.size
    duration = base_clip.duration
    font = ImageFont.truetype(CAPTION_FONT, max(44, int(w * 0.08)))
    scratch = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    lines = _group_words_into_lines(words, font, int(w * 0.9), scratch)

    clips = []
    for line in lines:
        for idx, word in enumerate(line):
            start = max(0.0, float(word["start"]))
            # hold the highlight until the next word starts (no flicker)
            nxt = line[idx + 1]["start"] if idx + 1 < len(line) else word["end"]
            end = min(float(nxt), duration)
            if start >= duration or end <= start:
                continue
            arr = _render_karaoke_line(line, idx, w)
            clips.append(
                ImageClip(arr)
                .set_start(start)
                .set_duration(end - start)
                .set_position(("center", int(h * 0.70)))
            )
    return clips


def _render_emoji_image(emoji_char, target_px):
    """Render a color emoji to an RGBA numpy array at target_px height."""
    font = ImageFont.truetype(EMOJI_FONT, EMOJI_STRIKE)
    img = Image.new("RGBA", (EMOJI_STRIKE * 2, EMOJI_STRIKE * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((EMOJI_STRIKE // 2, EMOJI_STRIKE // 4), emoji_char, font=font, embedded_color=True)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    scale = target_px / img.height
    img = img.resize((max(1, int(img.width * scale)), target_px), Image.LANCZOS)
    return np.array(img)


def _build_overlay_clips(base_clip, subtitles_srt, viral_angle, word_timings=None):
    """Return a list of ImageClip overlays (captions + emoji sticker).

    Captions use karaoke word-by-word highlighting when word_timings are
    available, otherwise fall back to phrase blocks from the SRT.
    """
    import math

    overlays = []
    w, h = base_clip.size
    duration = base_clip.duration

    # Captions
    if word_timings:
        overlays.extend(_build_karaoke_clips(base_clip, word_timings))
    else:
        for start, end, text in _parse_srt(subtitles_srt):
            if start >= duration:
                continue
            end = min(end, duration)
            if end <= start:
                continue
            arr = _render_caption_image(text, w)
            overlays.append(
                ImageClip(arr)
                .set_start(start)
                .set_duration(end - start)
                .set_position(("center", int(h * 0.72)))
            )

    # Emoji sticker (top-left) with a subtle pulse animation
    emoji = ANGLE_EMOJI.get((viral_angle or "").lower(), DEFAULT_EMOJI)
    try:
        arr = _render_emoji_image(emoji, int(w * 0.16))
        sticker = (ImageClip(arr)
                   .set_start(0)
                   .set_duration(duration)
                   .resize(lambda t: 1 + 0.10 * math.sin(2 * math.pi * 1.2 * t))
                   .set_position((int(w * 0.06), int(h * 0.06))))
        overlays.append(sticker)
    except Exception as e:
        print(f"Emoji sticker skipped: {e}")

    return overlays

def create_vertical_clip(source_path: str, start_time: str, end_time: str, output_dir: str = "/app/data/clips",
                         subtitles_srt: str = None, viral_angle: str = None, word_timings: list = None) -> str:
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

        # Burn in captions + emoji sticker (engagement overlays). Never let this
        # break clip generation — fall back to the plain vertical clip on error.
        if subtitles_srt or viral_angle or word_timings:
            try:
                overlays = _build_overlay_clips(clip, subtitles_srt, viral_angle, word_timings)
                if overlays:
                    clip = CompositeVideoClip([clip, *overlays])
            except Exception as e:
                print(f"Overlay compositing skipped: {e}")

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
                "-movflags", "+faststart",  # Move moov atom to front (web/Instagram streaming)
            ]
        )

    return output_path


def _is_faststart(path: str) -> bool:
    """True if the moov atom appears before the mdat atom (web-optimized)."""
    try:
        with open(path, "rb") as f:
            head = f.read(200000)
        moov = head.find(b"moov")
        mdat = head.find(b"mdat")
        return moov != -1 and (mdat == -1 or moov < mdat)
    except Exception:
        return False


def ensure_faststart(source_path: str) -> str:
    """Return a path to a faststart (moov-at-front) version of the clip.

    Instagram rejects non-faststart MP4s during Reel processing (error 2207077).
    If the source is already faststart, it's returned unchanged. Otherwise a
    lossless remux (`-c copy -movflags +faststart`) is written alongside it and
    reused on subsequent calls.
    """
    import subprocess

    if _is_faststart(source_path):
        return source_path

    base, ext = os.path.splitext(source_path)
    fast_path = f"{base}_faststart{ext or '.mp4'}"
    if os.path.exists(fast_path) and _is_faststart(fast_path):
        return fast_path

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", source_path,
            "-c", "copy", "-movflags", "+faststart",
            fast_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return fast_path
