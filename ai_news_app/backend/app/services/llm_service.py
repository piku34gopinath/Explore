import os
import json
from openai import OpenAI
import anthropic
import google.generativeai as genai
from typing import List, Dict, Any

class LLMService:
    def __init__(self):
        self.clients = {}

    def get_client(self, provider: str, api_key: str, model: str = None):
        if not api_key:
            return None
            
        if provider == "openai":
            return OpenAI(api_key=api_key)
        elif provider == "anthropic":
            return anthropic.Anthropic(api_key=api_key)
        elif provider == "gemini":
            genai.configure(api_key=api_key)
            # Use the provided model, defaulting to gemini-1.5-flash if not specified
            gemini_model = model if model else "gemini-1.5-flash"
            return genai.GenerativeModel(gemini_model)
        return None

    async def cluster_trends(self, articles: List[Dict[str, Any]], provider: str, api_key: str, model: str = "gpt-4o") -> List[Dict[str, Any]]:
        """
        Clusters news articles into trends using the specified LLM.
        """
        client = self.get_client(provider, api_key, model=model)
        if not client:
            raise ValueError(f"Invalid provider or missing API key: {provider}")

        # Prepare input for LLM
        articles_text = "\n".join([f"- {a['title']} ({a['source']['name']}): {a.get('description', '')}" for a in articles])
        
        prompt = f"""You are a news trend analyst.

Below is a list of news headlines collected from multiple sources.

TASKS:
1. Group similar headlines into clusters representing the same event.
2. Give each cluster:
   - short event title
   - 1 sentence summary
   - category (politics, tech, finance, global, India, etc.)
   - importance score (1–10)
   - urgency score (1–10)
3. Remove duplicate or low-value stories.
4. Output top 20 most important events only.

OUTPUT FORMAT (JSON ONLY):
[
  {{
    "event_title": "",
    "summary": "",
    "category": "",
    "importance_score": 0,
    "urgency_score": 0,
    "source_urls": [] 
  }}
]

HEADLINES:
{articles_text}
"""

        try:
            if provider == "openai":
                try:
                    response = client.chat.completions.create(
                        model=model,
                        messages=[{"role": "user", "content": prompt}],
                        response_format={"type": "json_object"}
                    )
                except Exception as model_err:
                    print(f"Primary model {model} failed: {model_err}. Trying fallback gpt-4o.")
                    response = client.chat.completions.create(
                        model="gpt-4o",
                        messages=[{"role": "user", "content": prompt}],
                        response_format={"type": "json_object"}
                    )
                    
                content = response.choices[0].message.content
                data = json.loads(content)
                # Handle variations like {"events": [...]} or just [...]
                if isinstance(data, dict) and "events" in data:
                    return data["events"]
                return data

            elif provider == "anthropic":
                response = client.messages.create(
                    model=model if model else "claude-3-5-sonnet-20240620",
                    max_tokens=4000,
                    messages=[{"role": "user", "content": prompt}]
                )
                return json.loads(response.content[0].text)

            elif provider == "gemini":
                # client is the model instance for gemini
                response = client.generate_content(prompt)
                text = response.text
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].strip()
                return json.loads(text)

        except Exception as e:
            print(f"Error clustering trends: {e}")
            return []

    async def generate_script(self, trend_data: Dict[str, Any], provider: str, api_key: str, model: str = "gpt-4o") -> Dict[str, Any]:
        """
        Generates a 60-second social media news video script based on trend data.
        """
        client = self.get_client(provider, api_key, model=model)
        if not client:
            raise ValueError(f"Invalid provider or missing API key: {provider}")

        prompt = f"""You are a viral news short-video script writer.

Create a script for a 60-second social media news video based on the following event.

EVENT: {trend_data.get('event_title')}
SUMMARY: {trend_data.get('summary')}
CATEGORY: {trend_data.get('category')}

GOALS:
- Hook viewer in first 3 seconds
- Explain event simply
- Focus on impact
- Sound natural and conversational
- Avoid robotic news tone
- No copyright phrases
- Do not quote article text

FORMAT (JSON ONLY):
{{
    "script": {{
        "hook": "...",
        "main_story": "...",
        "why_it_matters": "...",
        "ending_line": "..."
    }},
    "metadata": {{
        "titles": ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
        "thumbnail_text": "Max 5 Words",
        "hashtags": ["#tag1", "#tag2", ...]
    }}
}}
"""

        try:
            if provider == "openai":
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
                return json.loads(content)

            elif provider == "anthropic":
                response = client.messages.create(
                    model=model if model else "claude-3-opus-20240229",
                    max_tokens=4000,
                    messages=[{"role": "user", "content": prompt}]
                )
                return json.loads(response.content[0].text)

            elif provider == "gemini":
                response = client.generate_content(prompt)
                text = response.text
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                return json.loads(text)

        except Exception as e:
            print(f"Error generating script: {e}")
            return {"error": str(e)}


llm_service = LLMService()
