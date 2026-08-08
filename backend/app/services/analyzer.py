from openai import OpenAI
import anthropic
import google.generativeai as genai
import os
import json

def get_client(provider: str, api_key: str = None, model: str = "gpt-4o"):
    if provider == "openai":
        return OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
    elif provider == "anthropic":
        return anthropic.Anthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
    elif provider == "gemini":
        genai.configure(api_key=api_key or os.getenv("GOOGLE_API_KEY"))
        return genai.GenerativeModel(model)
    return None

def verify_key(provider: str, api_key: str):
    try:
        if provider == "openai":
            client = OpenAI(api_key=api_key)
            client.models.list()
        elif provider == "anthropic":
            client = anthropic.Anthropic(api_key=api_key)
            client.models.list(limit=1)
        elif provider == "gemini":
            genai.configure(api_key=api_key)
            genai.list_models()
        return True, "Success"
    except Exception as e:
        return False, str(e)

def get_available_models(provider: str, api_key: str = None) -> list:
    try:
        if provider == "openai":
            client = get_client(provider, api_key)
            if not client: return []
            models = client.models.list()
            # Allow gpt-4, gpt-3.5, and o1 models
            return sorted([m.id for m in models.data if any(x in m.id for x in ["gpt", "o1"])])
        elif provider == "anthropic":
            # Return latest models first
            return [
                "claude-3-5-sonnet-20241022",
                "claude-3-5-haiku-20241022",
                "claude-3-opus-20240229",
                "claude-3-sonnet-20240229",
                "claude-3-haiku-20240307"
            ]
        elif provider == "gemini":
            genai.configure(api_key=api_key or os.getenv("GOOGLE_API_KEY"))
            models = genai.list_models()
            return [m.name.replace("models/", "") for m in models if "generateContent" in m.supported_generation_methods]
        return []
    except Exception as e:
        print(f"Error fetching models for {provider}: {e}")
        if provider == "openai": return ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini"]
        if provider == "anthropic": return ["claude-3-5-sonnet-20241022"]
        if provider == "gemini": return ["gemini-1.5-flash", "gemini-1.5-pro"]
        return []


def create_transcript_timeline(transcript: str, video_duration: int, max_chars: int = 8000) -> str:
    """
    Creates an intelligent timeline view of the transcript that preserves timestamp context
    throughout the ENTIRE video, not just the beginning.
    
    For long transcripts, creates a condensed map showing content distribution with timestamps.
    """
    # If transcript is short enough, return as-is
    if len(transcript) < max_chars:
        return transcript
    
    # Parse SRT format if present
    if "-->" in transcript:
        # Extract timestamped segments
        lines = transcript.split('\n')
        segments = []
        current_segment = []
        
        for line in lines:
            if '-->' in line:
                # This is a timestamp line
                current_segment = [line]
            elif line.strip() and current_segment:
                current_segment.append(line)
                # Complete segment
                if len(current_segment) >= 2:
                    segments.append(' '.join(current_segment))
                    current_segment = []
        
        # Sample segments evenly throughout video
        if len(segments) > 0:
            # Take samples from beginning, middle, and end
            sample_indices = []
            num_samples = max_chars // 200  # Roughly how many segments we can fit
            step = max(1, len(segments) // num_samples)
            
            for i in range(0, len(segments), step):
                sample_indices.append(i)
            
            sampled = [segments[i] for i in sample_indices if i < len(segments)]
            return '\n'.join(sampled)
    
    # Fallback: Split transcript into time-based chunks
    # Assume roughly 150 words per minute of speech
    words = transcript.split()
    total_words = len(words)
    words_per_second = total_words / max(video_duration, 1)
    
    # Create timeline markers
    timeline_parts = []
    chunk_duration = 120  # 2-minute chunks
    num_chunks = max(1, video_duration // chunk_duration)
    words_per_chunk = total_words // num_chunks
    
    for i in range(num_chunks):
        start_word = i * words_per_chunk
        end_word = min((i + 1) * words_per_chunk, total_words)
        chunk_words = words[start_word:end_word]
        
        timestamp_start = i * chunk_duration
        mins = timestamp_start // 60
        secs = timestamp_start % 60
        
        # Take first ~100 words from each chunk as preview
        preview = ' '.join(chunk_words[:100])
        timeline_parts.append(f"[{mins:02d}:{secs:02d}] {preview}...")
    
    return '\n\n'.join(timeline_parts)


def validate_timestamp_diversity(suggestions: list, video_duration: int, min_gap_seconds: int = None) -> tuple:
    """
    Validates that clip suggestions have diverse start times throughout the video.
    Rejects lazy sequential cutting where all clips start from the beginning.
    
    Returns: (is_valid: bool, error_message: str)
    """
    if not suggestions or len(suggestions) == 0:
        return False, "No suggestions provided"
    
    # Adjust minimum gap based on video duration
    if min_gap_seconds is None:
        if video_duration < 120:  # Videos under 2 minutes
            min_gap_seconds = max(5, video_duration // 10)  # 10% of video or 5s minimum
        else:
            min_gap_seconds = 60  # Standard 60s gap for longer videos
    
    start_times = [float(s.get('start_time', 0)) for s in suggestions]
    
    # Check 1: Reject if ALL clips start in first 10% of video (beginning bunching)
    # Skip this check for very short videos (<30s)
    if video_duration > 30:
        first_10_percent = video_duration * 0.1
        if all(t < first_10_percent for t in start_times):
            return False, f"❌ All clips start in first {int(first_10_percent)}s - AI must analyze ENTIRE video, not just the beginning!"
    
    # Check 2: Require minimum gap between start times (prevent overlapping clips)
    sorted_starts = sorted(start_times)
    for i in range(len(sorted_starts) - 1):
        gap = sorted_starts[i + 1] - sorted_starts[i]
        if gap < min_gap_seconds:
            return False, f"❌ Clips {i+1} and {i+2} start only {gap:.1f}s apart - need {min_gap_seconds}s minimum gap for {video_duration}s video"
    
    # Check 3: For longer videos, require clips from different sections
    if video_duration > 300:  # 5+ minute videos
        has_later = any(t > video_duration * 0.5 for t in start_times)
        
        if not has_later:
            return False, f"❌ No clips from second half of {video_duration}s video - find moments throughout!"
    
    # Check 4: Timestamp spread quality score (skip for short videos)
    if video_duration > 180:  # Only for 3+ minute videos
        timestamp_range = max(start_times) - min(start_times)
        spread_ratio = timestamp_range / video_duration
        
        if spread_ratio < 0.2:
            return False, f"❌ Poor timestamp distribution - clips span only {spread_ratio*100:.0f}% of video"
    
    return True, "✓ Good timestamp diversity"


def analyze_for_viral_clips(transcript: str, metadata: dict, provider: str = "openai", model: str = "gpt-4o", api_key: str = None, platform_preset: str = "tiktok") -> list:
    """
    Analyze video transcript and metadata to identify 2-3 segments with highest viral potential.
    
    """
    
    # Use intelligent timeline instead of truncating
    video_duration = metadata.get('duration', 0)
    processed_transcript = create_transcript_timeline(transcript, video_duration, max_chars=8000)
    
    platform_guidelines = {
        "tiktok": "TikTok (max 60s, 9:16 vertical, fast-paced, trending sounds)",
        "youtube_shorts": "YouTube Shorts (max 60s, 9:16 vertical, retention-focused)",
        "instagram_reels": "Instagram Reels (max 90s, 9:16 vertical, aesthetic focus)"
    }
    
    platform_desc = platform_guidelines.get(platform_preset, platform_guidelines["tiktok"])
    
    prompt = f"""You are an expert viral content strategist analyzing a {video_duration}-second video for {platform_desc}.

YOUR MISSION: Find 2-3 DIFFERENT viral-worthy moments scattered throughout the ENTIRE video.

VIDEO METADATA:
- Title: {metadata.get('title', 'Unknown')}
- Duration: {video_duration} seconds ({video_duration//60}min {video_duration%60}s)
- Channel: {metadata.get('channel', 'Unknown')}

FULL VIDEO CONTENT (with timestamps):
{processed_transcript}

🔥 VIRAL ANALYSIS CRITERIA:
1. **Instant Hook** - First 3 seconds must grab attention (visual/audio surprise)
2. **Emotional Spike** - Joy, shock, anger, inspiration, satisfaction, fear
3. **Unexpected Twist** - Plot reveals, surprising facts, "wait what?" moments
4. **Complete Story** - Clear arc with setup, peak, and satisfying conclusion in 15-60s
5. **High Energy** - Fast pace, dynamic delivery, exciting content
6. **Share-Worthy** - Makes viewers want to send to friends/tag people
7. **Trend Alignment** - Matches current viral patterns on {platform_preset}

🚨 CRITICAL TIMESTAMP RULES - VIOLATIONS WILL BE REJECTED:

❌ FORBIDDEN PATTERNS (Auto-Reject):
- All clips starting between 0:00-{min(60, video_duration*0.1):.0f}s (beginning bunching)
- Clips starting within 60 seconds of each other
- Three variations of the same moment (0:00-0:15, 0:00-0:30, 0:00-0:45)
- Sequential cutting from start without analyzing full video

✅ REQUIRED PATTERNS:
- Clips from DIFFERENT parts of video (beginning, middle, end)
- Minimum 60-second gap between start times
- Each clip captures a DISTINCT viral moment
- For {video_duration//60}min+ videos: At least one clip from second half

💡 EXAMPLE GOOD SUGGESTIONS for {video_duration}s video:
- Clip 1: 45-89s → Shocking reveal from early section (viral_angle: "surprising")
- Clip 2: {video_duration//2-30}-{video_duration//2+30}s → Funny blooper from middle (viral_angle: "funny")
- Clip 3: {video_duration-120}-{video_duration-60}s → Emotional climax near end (viral_angle: "emotional")
^^ Note how these are spread across DIFFERENT timestamps!

💀 EXAMPLE BAD SUGGESTIONS (Will be REJECTED):
- Clip 1: 0-15s ❌
- Clip 2: 0-30s ❌  
- Clip 3: 0-45s ❌
^^ This is lazy sequential cutting, NOT viral moment detection!

RETURN JSON ARRAY (2-3 clips, ordered by viral_score DESC):
[
  {{
    "start_time": 142.5,  // SECONDS as number, not timestamp string
    "end_time": 186.2,    // Must be 15-60s after start_time
    "viral_angle": "surprising",  // One of: emotional/funny/surprising/inspirational/educational/satisfying
    "viral_score": 95,    // 0-100 likelihood to go viral
    "hook_description": "Host's jaw drops seeing test results",  // What happens in first 3 seconds
    "reasoning": "Opens with visceral shock reaction (instant hook), delivers unexpected scientific finding that contradicts common belief (surprise factor), ends on satisfying 'mind blown' moment. Perfect shareability.",
    "title": "Mukund Jha on Why Coding is NOT Dead", // Unique, content-specific title from the video content
    "viral_hashtags": "CodingTips,AIRevolution,FutureOfTech,SoftwareEngineering,TechTrends,Programming,DevLife,ViralShorts,TrendingNow,MustWatch,TechShock,MindBlowing"  // 10-15 HIGHLY RELEVANT, context-aware hashtags WITHOUT # symbol, comma-separated, no spaces after commas. Derive these from the video's specific title, content, and detected topic.
  }}
]

📱 HASHTAG GUIDELINES:
- Generate 10-15 viral, SEO-friendly hashtags per clip (no # symbol, comma-separated)
- MUST be derived from: Specific Video Title, Transcript Keywords, Topic Category, and Viral Angle
- Mix of:
  1. Ultra-Specific (5-7): Directly related to the clip's unique content (e.g., "G-WagonParking", "UnexpectedManeuver", "WifeDriving")
  2. Niche/Category (3-5): (e.g., "CarEnthusiast", "LuxuryCars", "DrivingSkills")
  3. Broad Trending (2-3): (e.g., "ViralShorts", "TrendingNow", "ReelsIndia", "MustWatch")
- Capitalize words (TikTok/Instagram style): "AIRevolution" not "airevolution"
- NO spaces after commas: "AI,Tech,Viral" not "AI, Tech, Viral"
- AVOID generic hashtags like "Video", "Clip", "Shorts" unless contextually necessary.

⚠️ VALIDATION CHECKLIST:
- [ ] Each start_time is DIFFERENT (not all starting at 0)
- [ ] Clips span across video timeline, not clustered at beginning  
- [ ] Each viral_angle is DIFFERENT (diversity)
- [ ] Each clip is 15-60 seconds long
- [ ] Each clip has a highly UNIQUE, content-specific title
- [ ] Timestamps are realistic for video duration ({video_duration}s)
- [ ] viral_hashtags field exists with 5-7 hashtags

ONLY return the JSON array, no other text."""
    
    try:
        client = get_client(provider, api_key, model)
        
        if provider == "openai":
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            result_text = response.choices[0].message.content
            
            # Parse the response - it might be wrapped in an object
            result = json.loads(result_text)
            if isinstance(result, dict) and 'clips' in result:
                suggestions = result['clips']
            elif isinstance(result, list):
                suggestions = result
            else:
                # Try to extract array from the response
                suggestions = list(result.values())[0] if result else []
            
            # VALIDATE TIMESTAMP DIVERSITY
            is_valid, error_msg = validate_timestamp_diversity(suggestions, video_duration)
            if not is_valid:
                print(f"⚠️  Timestamp validation failed: {error_msg}")
                print(f"📊 Suggestions received: {[s.get('start_time') for s in suggestions]}")
                raise Exception(f"AI returned poor suggestions: {error_msg}")
            
            return suggestions
                
        elif provider == "anthropic":
            response = client.messages.create(
                model=model,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            text = response.content[0].text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            result = json.loads(text)
            if isinstance(result, dict) and 'clips' in result:
                suggestions = result['clips']
            elif isinstance(result, list):
                suggestions = result
            else:
                suggestions = list(result.values())[0] if result else []
            
            # VALIDATE TIMESTAMP DIVERSITY
            is_valid, error_msg = validate_timestamp_diversity(suggestions, video_duration)
            if not is_valid:
                raise Exception(f"AI returned poor suggestions: {error_msg}")
            
            return suggestions
            
        elif provider == "gemini":
            response = client.generate_content(prompt)
            # Extract JSON from markdown code blocks if present
            text = response.text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            
            suggestions = json.loads(text)
            
            # VALIDATE TIMESTAMP DIVERSITY
            is_valid, error_msg = validate_timestamp_diversity(suggestions, video_duration)
            if not is_valid:
                raise Exception(f"AI returned poor suggestions: {error_msg}")
            
            return suggestions
    
    except Exception as e:
        print(f"Viral analysis error: {e}")
        raise Exception(f"AI analysis failed: {str(e)}")


def analyze_transcript(transcript: str, provider: str = "openai", model: str = "gpt-4o", api_key: str = None) -> list:
    """
    LEGACY FUNCTION - Kept for backward compatibility.
    Use analyze_for_viral_clips instead for better viral detection.
    """
    prompt = f"""Analyze this video transcript and identify 2-3 interesting moments that would make good short clips (15-60 seconds each).

Transcript:
{transcript}

Return a JSON array of objects with these fields:
- start_time: timestamp in format "HH:MM:SS" or "MM:SS"
- end_time: timestamp in format "HH:MM:SS" or "MM:SS" 
- title: catchy title for the clip
- description: why this moment is interesting

Example format:
[
  {{"start_time": "00:01:23", "end_time": "00:01:45", "title": "Amazing Reveal", "description": "The host reveals surprising statistics"}}
]

Only return valid JSON, no other text."""

    try:
        client = get_client(provider, api_key, model)
        
        if provider == "openai":
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}]
            )
            result = response.choices[0].message.content
            return json.loads(result)
        
        elif provider == "anthropic":
            response = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            return json.loads(response.content[0].text)
        
        elif provider == "gemini":
            response = client.generate_content(prompt)
            return json.loads(response.text)
    
    except Exception as e:
        print(f"Analysis error: {e}")
        raise Exception(f"AI analysis failed: {str(e)}")
