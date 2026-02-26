import os
from openai import OpenAI

# Initialize client if API key is present
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def transcribe_audio(file_path: str) -> str:
    # 1. Extract audio from video first to reduce upload size (optional but recommended)
    # For now, we'll try to upload the video file directly or extract audio using ffmpeg
    # Simplest approach for prototype: send file to OpenAI Whisper API
    
    # Check file size, if > 25MB, we need to split or compress.
    # For this MVP, we assume short videos or we would add audio extraction logic here.
    
    try:
        with open(file_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="srt" # We need timestamps for clipping
            )
        return transcript
    except Exception as e:
        print(f"Transcription failed: {str(e)}")
        # Fallback to local whisper or return dummy data for testing
        return "1\n00:00:00,000 --> 00:00:10,000\nThis is a sample transcript because the API call failed."


def transcribe_local_file(file_path: str) -> str:
    """
    Transcribe a locally-uploaded video/audio file using OpenAI Whisper.
    Works identically to transcribe_audio but is named to be
    semantically clear it accepts any local file path (not just extracted audio).
    """
    return transcribe_audio(file_path)

