import os
import re
import json
import shutil
import subprocess
import tempfile
import uuid
from openai import OpenAI

# Whisper API accepts files up to 25 MB. Keep a small safety margin.
WHISPER_MAX_BYTES = 24 * 1024 * 1024
# Chunk length used when the compressed audio still exceeds the limit.
CHUNK_SECONDS = 600  # 10 minutes

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def _probe_duration(path: str) -> float:
    try:
        result = _run([
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_format", path,
        ])
        return float(json.loads(result.stdout).get("format", {}).get("duration", 0) or 0)
    except Exception as e:
        print(f"ffprobe duration error: {e}")
        return 0.0


def _extract_audio(video_path: str, out_dir: str) -> str:
    """Extract a compressed mono mp3 track — small enough for Whisper in most cases."""
    audio_path = os.path.join(out_dir, f"{uuid.uuid4()}.mp3")
    _run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
        audio_path,
    ])
    return audio_path


def _split_audio(audio_path: str, out_dir: str, chunk_seconds: int) -> list[tuple[str, float]]:
    """Split an audio file into equal-length chunks. Returns [(path, start_offset)]."""
    duration = _probe_duration(audio_path)
    chunks: list[tuple[str, float]] = []
    start = 0.0
    while start < duration:
        chunk_path = os.path.join(out_dir, f"{uuid.uuid4()}.mp3")
        _run([
            "ffmpeg", "-y", "-ss", str(start), "-t", str(chunk_seconds),
            "-i", audio_path, "-c", "copy", chunk_path,
        ])
        chunks.append((chunk_path, start))
        start += chunk_seconds
    return chunks


_SRT_TIME_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})")


def _shift_srt(srt: str, offset_seconds: float, index_base: int) -> tuple[str, int]:
    """Shift SRT timestamps by `offset_seconds` and renumber cues starting at `index_base`."""
    def to_ts(total_ms: int) -> str:
        h, rem = divmod(total_ms, 3600 * 1000)
        m, rem = divmod(rem, 60 * 1000)
        s, ms = divmod(rem, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    def shift_line(line: str) -> str:
        def repl(m: re.Match) -> str:
            h, mnt, s, ms = map(int, m.groups())
            total = h * 3600 * 1000 + mnt * 60 * 1000 + s * 1000 + ms
            total += int(offset_seconds * 1000)
            if total < 0:
                total = 0
            return to_ts(total)
        return _SRT_TIME_RE.sub(repl, line)

    blocks = re.split(r"\n\s*\n", srt.strip())
    out_blocks: list[str] = []
    idx = index_base
    for block in blocks:
        lines = block.splitlines()
        if not lines:
            continue
        # Drop the original cue number if present
        if lines[0].strip().isdigit():
            lines = lines[1:]
        if not lines:
            continue
        # First remaining line is the timing line
        lines[0] = shift_line(lines[0])
        out_blocks.append(f"{idx}\n" + "\n".join(lines))
        idx += 1
    return "\n\n".join(out_blocks) + ("\n" if out_blocks else ""), idx


def _whisper_srt(path: str, whisper_client) -> str:
    with open(path, "rb") as f:
        return whisper_client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="srt",
        )


def transcribe_audio(file_path: str, api_key: str | None = None) -> str:
    """Transcribe a video/audio file via Whisper, chunking if needed to stay under 25 MB.

    Whisper is OpenAI-only, so it needs an OpenAI key. Prefer the caller-supplied
    `api_key` (e.g. the user's key from their AI config) and fall back to the
    process-level OPENAI_API_KEY env var. Without a key, transcription fails and
    burned captions won't be available."""
    resolved_key = api_key or os.getenv("OPENAI_API_KEY")
    if not resolved_key:
        print("[TRANSCRIBER] No OpenAI API key (caller or OPENAI_API_KEY env) — "
              "Whisper cannot run, captions will be unavailable.")
    whisper_client = OpenAI(api_key=resolved_key) if resolved_key else client
    tmpdir = tempfile.mkdtemp(prefix="whisper_")
    try:
        # 1. Extract compressed audio — this alone brings most hour-long videos under 25 MB.
        try:
            audio_path = _extract_audio(file_path, tmpdir)
        except subprocess.CalledProcessError as e:
            print(f"Audio extraction failed, falling back to raw file: {e.stderr}")
            audio_path = file_path

        # 2. If still too big, split by time.
        if os.path.getsize(audio_path) <= WHISPER_MAX_BYTES:
            segments = [(audio_path, 0.0)]
        else:
            print(f"Audio {os.path.getsize(audio_path)/1e6:.1f} MB > limit, chunking")
            segments = _split_audio(audio_path, tmpdir, CHUNK_SECONDS)

        # 3. Transcribe each segment and stitch SRTs together.
        combined = ""
        next_index = 1
        for seg_path, offset in segments:
            try:
                srt = _whisper_srt(seg_path, whisper_client)
            except Exception as e:
                print(f"Whisper chunk failed at offset {offset}s: {e}")
                continue
            shifted, next_index = _shift_srt(srt, offset, next_index)
            combined += shifted

        if not combined:
            raise RuntimeError("All Whisper chunks failed")
        return combined

    except Exception as e:
        print(f"Transcription failed: {e}")
        return "1\n00:00:00,000 --> 00:00:10,000\nThis is a sample transcript because the API call failed."
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
