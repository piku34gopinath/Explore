import os
import re
import uuid
import json
import tempfile
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


def _probe_duration(path: str) -> float:
    """Return the duration (seconds) of a media file via ffprobe, or 0.0 if unknown."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nk=1:nw=1", path],
            capture_output=True, text=True, check=True,
        )
        return float((result.stdout or "0").strip() or 0)
    except Exception as e:
        print(f"[EDITOR] ffprobe duration error: {e}")
        return 0.0


_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial.ttf",
]
# Monochrome emoji fonts must come first: color bitmap fonts (NotoColorEmoji,
# Apple Color Emoji) only ship fixed pixel strikes, and ffmpeg's drawtext fails
# with "Could not set font size to N pixels: invalid library handle" when the
# requested size doesn't match a strike. Monochrome fonts are scalable and safe.
_EMOJI_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/noto/NotoEmoji-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoEmoji-Bold.ttf",
]
_COLOR_EMOJI_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/System/Library/Fonts/Apple Color Emoji.ttc",
]
# Fixed strike size (px) required by color bitmap emoji fonts.
_COLOR_EMOJI_STRIKE = 109
_DEVANAGARI_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Devanagari MT.ttc",
    "/System/Library/Fonts/Supplemental/Kohinoor.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
    "/usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf",
]


def _find_font(candidates: list[str]) -> str | None:
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def _render_emoji_png(emoji: str, display_px: int) -> str | None:
    """Rasterize a color emoji glyph to a transparent PNG via Pillow + NotoColorEmoji.

    ffmpeg's drawtext can only use a glyph's alpha mask, so color-bitmap emoji come
    out as blank/monochrome blobs. Instead we render the real colored glyph here and
    let the caller composite it with an `overlay` filter. Returns the PNG path, or
    None if Pillow or the color font is unavailable (caller then skips the emoji)."""
    try:
        from PIL import Image, ImageFont, ImageDraw
    except Exception as e:
        print(f"[EDITOR] Pillow unavailable, cannot render color emoji: {e}")
        return None
    font_path = _find_font(_COLOR_EMOJI_FONT_CANDIDATES)
    if not font_path:
        print("[EDITOR] No color emoji font found for PNG render.")
        return None
    try:
        # Color-bitmap fonts only ship a fixed strike; open at that size, then
        # downscale the raster to the requested display size.
        font = ImageFont.truetype(font_path, _COLOR_EMOJI_STRIKE)
        canvas = _COLOR_EMOJI_STRIKE * 2
        img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((canvas // 2, canvas // 2), emoji, font=font,
                  embedded_color=True, anchor="mm")
        bbox = img.getbbox()
        if not bbox:
            print(f"[EDITOR] Emoji {emoji!r} rendered empty; skipping overlay.")
            return None
        img = img.crop(bbox)
        w, h = img.size
        scale = display_px / max(w, h)
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
        fd, out = tempfile.mkstemp(prefix="emoji_", suffix=".png")
        os.close(fd)
        img.save(out)
        print(f"[EDITOR] Rendered color emoji {emoji!r} -> {img.size[0]}x{img.size[1]} png")
        return out
    except Exception as e:
        print(f"[EDITOR] Color emoji PNG render failed: {e}")
        return None


def _escape_drawtext(text: str) -> str:
    # ffmpeg drawtext requires escaping of ':' , '\' , and single quotes.
    return (
        text.replace("\\", "\\\\")
            .replace(":", "\\:")
            .replace("'", "\\'")
            .replace("%", "\\%")
    )


def _wrap_text(text: str, max_chars_per_line: int) -> str:
    """Word-wrap text so each line stays under max_chars_per_line."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for w in words:
        if not current:
            current = w
        elif len(current) + 1 + len(w) <= max_chars_per_line:
            current += " " + w
        else:
            lines.append(current)
            current = w
    if current:
        lines.append(current)
    return "\n".join(lines)


_SRT_TS_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)


def _srt_ts_to_seconds(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def _seconds_to_srt_ts(total: float) -> str:
    if total < 0:
        total = 0
    ms = int(round(total * 1000))
    h, rem = divmod(ms, 3600 * 1000)
    m, rem = divmod(rem, 60 * 1000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _clip_srt(srt: str, start: float, end: float) -> str:
    """Return an SRT containing only cues that overlap [start,end], shifted so
    the clip starts at 0. Long cues are split into shorter chunks so captions
    change with the voice rather than sitting still for a full sentence."""
    if not srt or start >= end:
        return ""
    blocks = re.split(r"\n\s*\n", srt.strip())
    kept: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = block.splitlines()
        if not lines:
            continue
        if lines[0].strip().isdigit():
            lines = lines[1:]
        if not lines:
            continue
        m = _SRT_TS_RE.search(lines[0])
        if not m:
            continue
        s0 = _srt_ts_to_seconds(*m.group(1, 2, 3, 4))
        s1 = _srt_ts_to_seconds(*m.group(5, 6, 7, 8))
        if s1 <= start or s0 >= end:
            continue
        text = " ".join(l.strip() for l in lines[1:] if l.strip())
        if not text:
            continue
        # Clamp to window and shift to 0-based clip time.
        cs = max(s0, start) - start
        ce = min(s1, end) - start
        if ce - cs <= 0.05:
            continue
        # Word-chunk long cues so captions move with the voice.
        words = text.split()
        max_words = 5
        if len(words) <= max_words:
            kept.append((cs, ce, text))
        else:
            chunks = [words[i:i + max_words] for i in range(0, len(words), max_words)]
            dur_each = (ce - cs) / len(chunks)
            for i, ch in enumerate(chunks):
                kept.append((cs + i * dur_each, cs + (i + 1) * dur_each, " ".join(ch)))
    out: list[str] = []
    for i, (s0, s1, txt) in enumerate(kept, 1):
        out.append(f"{i}\n{_seconds_to_srt_ts(s0)} --> {_seconds_to_srt_ts(s1)}\n{txt}")
    return "\n\n".join(out) + ("\n" if out else "")


def _subtitles_filter(srt_path: str, target_height: int, style: str, font_path: str | None, lang: str = "en") -> str:
    """Build an ffmpeg `subtitles` filter with libass styling tuned per style."""
    # libass renders in its own PlayRes coordinate space (default PlayResY=288),
    # not video pixels, so a "video px * factor" calc blows up the text. Use a
    # small, tested ASS fontsize instead — this reads as a normal caption on a
    # 1080p / 4K 9:16 frame regardless of target height.
    fontsize = 20
    # ASS colors are &HAABBGGRR (alpha, blue, green, red).
    if style == "bold_highlight":
        primary = "&H0000FFFF"    # yellow text
        outline = "&H00000000"    # black outline
        back = "&H80000000"       # semi-transparent black box
        border_style = 3          # opaque box
    elif style == "minimalist":
        primary = "&H00FFFFFF"
        outline = "&H00000000"
        back = "&H60000000"
        border_style = 3
    else:  # classic / kinetic / story_vertical → white with black outline
        primary = "&H00FFFFFF"
        outline = "&H00000000"
        back = "&H00000000"
        border_style = 1          # outline only
    # libass renders the caption in FontName; it only falls back to other fonts
    # (via fontsdir/fontconfig) for glyphs the primary font lacks. DejaVu Sans has
    # no Devanagari, so Hindi captions would come out blank — pick a font whose
    # script matches the caption language.
    fontname = "Noto Sans Devanagari" if lang == "hi" else "DejaVu Sans"
    force_style_bits = [
        f"FontName={fontname}",
        f"FontSize={fontsize}",
        f"PrimaryColour={primary}",
        f"OutlineColour={outline}",
        f"BackColour={back}",
        "Bold=1",
        f"BorderStyle={border_style}",
        "Outline=2",
        "Shadow=0",
        "Alignment=2",     # bottom-center
        "MarginV=30",
    ]
    force_style = ",".join(force_style_bits)
    # subtitles filter path must have ':' and ',' escaped for the filtergraph.
    esc_path = srt_path.replace("\\", "\\\\").replace(":", "\\:").replace(",", "\\,")
    fontsdir = ""
    if font_path:
        fdir = os.path.dirname(font_path).replace("\\", "\\\\").replace(":", "\\:").replace(",", "\\,")
        fontsdir = f":fontsdir='{fdir}'"
    return f"subtitles='{esc_path}'{fontsdir}:force_style='{force_style}'"


def _build_overlay_filters(overlay_opts: dict, target_height: int) -> tuple[list[str], list[dict], list[str]]:
    """Return (vf filter fragments, png overlay inputs, temp file paths to clean up).

    Emoji is composited from a color PNG (see `_render_emoji_png`) rather than drawn
    with drawtext. Each overlay input is {"path", "x", "y"} where x/y are ffmpeg
    `overlay` position expressions over the base frame (W,H = base size; w,h = emoji)."""
    filters: list[str] = []
    overlay_inputs: list[dict] = []
    temp_files: list[str] = []
    if not overlay_opts:
        return filters, overlay_inputs, temp_files

    # 9:16 frame width derived from height.
    frame_w = int(target_height * 9 / 16)

    # --- Captions ---
    caption_text = overlay_opts.get("caption_text")
    transcript_srt = overlay_opts.get("transcript_srt")
    clip_start = float(overlay_opts.get("clip_start") or 0)
    clip_end = float(overlay_opts.get("clip_end") or 0)
    style = overlay_opts.get("caption_style", "classic")
    lang = overlay_opts.get("caption_language", "en")
    font_path = _find_font(_DEVANAGARI_FONT_CANDIDATES) if lang == "hi" else None
    if not font_path:
        font_path = _find_font(_FONT_CANDIDATES)

    # Preferred captions are voice-synced from the SRT. If we have no usable SRT
    # for this window (e.g. transcription failed for lack of an OpenAI key, or the
    # clip has no speech), fall back to a small static caption from the clip title/
    # hook so a caption still appears when the user asked for one.
    caption_added = False
    if transcript_srt and clip_end > clip_start:
        clipped = _clip_srt(transcript_srt, clip_start, clip_end)
        if clipped.strip():
            cue_count = clipped.count("-->")
            print(f"[EDITOR] Burning {cue_count} caption cue(s) for window "
                  f"{clip_start:.1f}-{clip_end:.1f}s (lang={lang}, style={style}).")
            fd, srt_file = tempfile.mkstemp(prefix="cap_", suffix=".srt")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(clipped)
            temp_files.append(srt_file)
            filters.append(_subtitles_filter(srt_file, target_height, style, font_path, lang))
            caption_added = True
        else:
            print(f"[EDITOR] SRT had no cues in clip window {clip_start:.1f}-{clip_end:.1f}s; "
                  "using static caption fallback. (Transcript may lack timestamps or speech here.)")
    else:
        print("[EDITOR] No transcript available; using static caption fallback if a title is set.")

    if caption_text and not caption_added:
        print(f"[EDITOR] Burning static fallback caption: {caption_text!r}")

        # Size-to-fit: pick a fontsize where the widest line fits in ~85% of frame.
        # Rough glyph-width ratio for DejaVu Bold ≈ 0.55 * fontsize.
        max_chars_per_line = 22 if style in ("kinetic", "bold_highlight", "story_vertical") else 28
        wrapped = _wrap_text(caption_text, max_chars_per_line)
        longest_line_len = max((len(l) for l in wrapped.split("\n")), default=1)

        # Static-title fallback — tuned smaller than before after user feedback
        # ("caption should be small"). Voice-synced SRT captions handle the
        # normal case; this only runs when we have no transcript.
        preferred_big = int(target_height * 0.032)
        preferred_base = int(target_height * 0.022)
        fit_big = int((frame_w * 0.8) / max(1, longest_line_len * 0.55))
        fit_base = int((frame_w * 0.85) / max(1, longest_line_len * 0.55))
        big = max(22, min(preferred_big, fit_big))
        base = max(18, min(preferred_base, fit_base))

        # Write the (possibly multi-line) caption to a temp file for drawtext.
        fd, cap_file = tempfile.mkstemp(prefix="cap_", suffix=".txt")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(wrapped)
        temp_files.append(cap_file)
        text_opt = f"textfile='{cap_file}'"
        font_opt = f":fontfile='{font_path}'" if font_path else ""

        if style == "kinetic":
            # Big bold text with a subtle sinusoidal vertical wobble.
            filters.append(
                f"drawtext={text_opt}{font_opt}"
                f":fontsize={big}:fontcolor=white:borderw=4:bordercolor=black"
                f":line_spacing=8:x=(w-text_w)/2:y=(h*0.7)+20*sin(2*PI*t)"
            )
        elif style == "minimalist":
            filters.append(
                f"drawtext={text_opt}{font_opt}"
                f":fontsize={base}:fontcolor=white"
                f":box=1:boxcolor=black@0.35:boxborderw=18"
                f":line_spacing=6:x=(w-text_w)/2:y=h-text_h-h*0.08"
            )
        elif style == "bold_highlight":
            filters.append(
                f"drawtext={text_opt}{font_opt}"
                f":fontsize={big}:fontcolor=black"
                f":box=1:boxcolor=yellow@0.9:boxborderw=24"
                f":line_spacing=6:x=(w-text_w)/2:y=h*0.76"
            )
        elif style == "story_vertical":
            filters.append(
                f"drawtext={text_opt}{font_opt}"
                f":fontsize={big}:fontcolor=white:borderw=6:bordercolor=black"
                f":line_spacing=8:x=(w-text_w)/2:y=h*0.1"
            )
        else:  # classic
            filters.append(
                f"drawtext={text_opt}{font_opt}"
                f":fontsize={base}:fontcolor=white:borderw=3:bordercolor=black"
                f":box=1:boxcolor=black@0.5:boxborderw=14"
                f":line_spacing=6:x=(w-text_w)/2:y=h-text_h-h*0.1"
            )

    # --- Emojis / meme reactions ---
    # Rendered as a color PNG (Pillow) and composited via `overlay`, since ffmpeg's
    # drawtext can't paint color-bitmap emoji. Position uses overlay exprs where
    # W,H = base frame size and w,h = the emoji PNG size.
    emoji_text = overlay_opts.get("emoji_text")
    if emoji_text:
        emoji_style = overlay_opts.get("emoji_style", "standard")
        meme_mode = overlay_opts.get("emoji_meme_mode", False)
        # Keep emoji small enough that it doesn't dominate the 9:16 frame.
        big_e = max(48, min(int(target_height * 0.06), int(frame_w * 0.18)))
        display_px = int(big_e * 1.2) if (emoji_style == "meme_reactions" and not meme_mode) else big_e

        emoji_png = _render_emoji_png(emoji_text, display_px)
        if emoji_png:
            temp_files.append(emoji_png)
            if meme_mode:
                # Meme "POV:" label pinned top-center (text is fine for drawtext);
                # emoji top-right.
                label = _escape_drawtext("POV:")
                label_font = _find_font(_FONT_CANDIDATES)
                label_font_opt = f":fontfile='{label_font}'" if label_font else ""
                filters.append(
                    f"drawtext=text='{label}'{label_font_opt}"
                    f":fontsize={max(48, int(target_height * 0.06))}:fontcolor=white:borderw=5:bordercolor=black"
                    f":x=(w-text_w)/2:y=h*0.05"
                )
                overlay_inputs.append({"path": emoji_png, "x": "W-w-W*0.05", "y": "H*0.05"})
            elif emoji_style == "animated":
                # Bounce animation via the overlay's y position expression.
                overlay_inputs.append({"path": emoji_png, "x": "W-w-W*0.05", "y": "H*0.08+30*abs(sin(2*PI*t))"})
            elif emoji_style == "meme_reactions":
                overlay_inputs.append({"path": emoji_png, "x": "W-w-W*0.05", "y": "H-h-H*0.28"})
            else:  # standard
                overlay_inputs.append({"path": emoji_png, "x": "W-w-W*0.05", "y": "H*0.08"})

    return filters, overlay_inputs, temp_files


def create_vertical_clip(source_path: str, start_time: str, end_time: str, output_dir: str = "/app/data/clips", target_height: int = 1920, overlay_opts: dict | None = None) -> dict:
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

    # Validate the requested window against the actual source length. AI-suggested
    # timestamps can point past the end of the uploaded file (e.g. analysis ran on
    # a full YouTube video but a shorter file was uploaded), which would otherwise
    # silently produce an empty or wrong-length clip. Clamp the end to the source
    # and fail loudly if the start itself is out of range.
    src_duration = _probe_duration(source_path)
    if src_duration:
        if start_seconds >= src_duration:
            raise Exception(
                f"Clip start {start_seconds:.0f}s is past the source length "
                f"{src_duration:.0f}s — the timestamps don't match this video file."
            )
        end_seconds = min(end_seconds, src_duration)
        duration = max(0.1, end_seconds - start_seconds)
    print(f"[EDITOR] Trim window: {start_seconds:.1f}-{end_seconds:.1f}s "
          f"(dur={duration:.1f}s, source={src_duration:.1f}s)")

    clip_id = str(uuid.uuid4())
    output_path = os.path.join(output_dir, f"{clip_id}.mp4")
    thumbnail_path = os.path.join(output_dir, f"{clip_id}.jpg")

    # Cap the target height at the source height to avoid upscaling.
    _, src_height = _probe_dimensions(source_path)
    if src_height:
        target_height = min(target_height, src_height)

    # Choose CRF + x264 preset by resolution. A slower preset gives noticeably
    # better quality per bitrate at HD/4K; it's affordable now that the instance
    # isn't the 0.1-CPU free tier. Lower res stays fast to keep throughput up.
    # Override with the EDITOR_X264_PRESET env var if needed.
    if target_height >= 2160:
        crf = "19"
        preset = "medium"
    elif target_height >= 1080:
        crf = "20"
        preset = "faster"
    else:
        crf = "23"
        preset = "veryfast"
    preset = os.getenv("EDITOR_X264_PRESET", preset)

    # Center-crop to a 9:16 aspect ratio, then scale to the target height.
    # scale=-2 keeps width auto and divisible by 2 (required by libx264).
    vf_parts = [
        "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'",
        f"scale=-2:{target_height}",
        "unsharp=5:5:0.8:5:5:0.0",
    ]
    overlay_filters, overlay_inputs, overlay_tempfiles = _build_overlay_filters(overlay_opts or {}, target_height)
    vf_parts.extend(overlay_filters)
    base_chain = ",".join(vf_parts)

    # `-ss` (seek) and `-t` (duration) are bound to the SOURCE input by placing
    # them before `-i source_path`. This must NOT be after `-i`: with the emoji
    # PNG inputs below, a trailing `-t` would bind to the image input instead of
    # limiting the clip, producing a full-length (untrimmed) video.
    input_args = ["-ss", str(start_seconds), "-t", str(duration), "-i", source_path]

    if overlay_inputs:
        # Color emoji PNGs are extra image inputs composited over the base chain
        # with `overlay`. Build a filter_complex: [0:v]base[v0]; [v0][1:v]overlay[v1]; …
        for oi in overlay_inputs:
            input_args += ["-i", oi["path"]]
        graph = f"[0:v]{base_chain}[v0]"
        cur = "v0"
        for i, oi in enumerate(overlay_inputs, start=1):
            nxt = f"v{i}"
            graph += f";[{cur}][{i}:v]overlay=x={oi['x']}:y={oi['y']}[{nxt}]"
            cur = nxt
        video_map_args = ["-filter_complex", graph, "-map", f"[{cur}]", "-map", "0:a?"]
    else:
        video_map_args = ["-vf", base_chain]

    cmd = [
        "ffmpeg", "-y",
        *input_args,
        *video_map_args,
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", crf,
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ]

    print(f"[EDITOR] Rendering clip -> {output_path} (h={target_height}, crf={crf}, dur={duration:.1f}s)")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0 or not os.path.exists(output_path):
            # Prefer the tail after the last "Error" line so we skip ffmpeg's
            # input-stream banner and surface the actual failure reason.
            stderr = result.stderr or ""
            marker_lines = [i for i, l in enumerate(stderr.splitlines())
                            if "error" in l.lower() or "invalid" in l.lower() or "no such" in l.lower()]
            if marker_lines:
                snippet = "\n".join(stderr.splitlines()[max(0, marker_lines[0] - 1):])[-1200:]
            else:
                snippet = stderr[-1200:]
            print(f"[EDITOR] ffmpeg failed. base_chain={base_chain!r} overlays={len(overlay_inputs)}")
            print(f"[EDITOR] stderr tail:\n{snippet}")
            raise Exception(f"ffmpeg render failed: {snippet}")
    finally:
        for tf in overlay_tempfiles:
            try:
                os.remove(tf)
            except OSError:
                pass

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
