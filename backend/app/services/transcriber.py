import os

# Local Whisper (faster-whisper) — free, runs on CPU, gives word-level timings.
# Model is loaded lazily once and reused across clips.
_model = None


def _get_local_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        size = os.getenv("WHISPER_MODEL", "base")  # tiny/base/small/medium
        _model = WhisperModel(size, device="cpu", compute_type="int8")
    return _model


def _fmt_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# "translate" => English output (readable captions + works with the Latin caption font).
# Set WHISPER_TASK=transcribe to keep the original spoken language instead.
WHISPER_TASK = os.getenv("WHISPER_TASK", "translate")


def transcribe_audio(file_path: str):
    """Transcribe to SRT (phrase-level) using local Whisper. Returns None on failure."""
    try:
        model = _get_local_model()
        segments, _info = model.transcribe(file_path, task=WHISPER_TASK)
        lines, idx = [], 1
        for seg in segments:
            text = (seg.text or "").strip()
            if not text:
                continue
            lines.append(f"{idx}\n{_fmt_ts(seg.start)} --> {_fmt_ts(seg.end)}\n{text}\n")
            idx += 1
        return "\n".join(lines) if lines else None
    except Exception as e:
        print(f"Transcription failed: {str(e)}")
        return None


def transcribe_words(file_path: str):
    """Return word-level timestamps for karaoke captions using local Whisper.

    Returns a list of {"word": str, "start": float, "end": float}, or None.
    """
    try:
        model = _get_local_model()
        segments, _info = model.transcribe(file_path, word_timestamps=True, task=WHISPER_TASK)
        out = []
        for seg in segments:
            for w in (seg.words or []):
                word = (w.word or "").strip()
                if not word or w.start is None or w.end is None:
                    continue
                out.append({"word": word, "start": float(w.start), "end": float(w.end)})
        return out or None
    except Exception as e:
        print(f"Word-level transcription failed: {str(e)}")
        return None
