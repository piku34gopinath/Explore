from app.services.news_service import news_service

class TrendService:
    async def get_trending_news(self):
        """
        Orchestrates fetching news from NewsAPI and clustering via LLM.
        """
        # Get active provider settings for metadata
        provider = await news_service.get_system_config("news_provider") or "newsapi"
        model = await news_service.get_system_config("news_model")
        nickname = await news_service.get_system_config("news_nickname")
        # Get trends from NewsService
        trends = await news_service.get_trending_news()
        
        # If error occurs (e.g. no news articles found at all), return mock data
        if isinstance(trends, dict) and "error" in trends:
            print(f"Trend Service: Using fallback data. (Error: {trends.get('error')})")
            return {
                "trends": [
                    {
                        "event_title": "AI Breakthrough in Medicine (Mock)",
                        "summary": "Scientists discover new AI model known as AlphaFold 3 that predicts protein structures with unprecedented accuracy.",
                        "category": "Tech",
                        "importance_score": 9,
                        "urgency_score": 8,
                        "trend_score": 10,
                        "source_urls": ["https://example.com/news1"]
                    },
                    {
                        "event_title": "Global Economic Summit (Mock)",
                        "summary": "World leaders gather in Geneva to discuss new trade policies and digital currency regulations.",
                        "category": "Politics",
                        "importance_score": 8,
                        "urgency_score": 7,
                        "trend_score": 81,
                        "source_urls": ["https://example.com/news2"]
                    }
                ],
                "provider": "Fallback (N/A)",
                "model": "N/A",
                "nickname": "Connection Error"
            }
            
        return {
            "trends": trends,
            "provider": provider,
            "model": model,
            "nickname": nickname
        }

trend_service = TrendService()
