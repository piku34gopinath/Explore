import requests
import time

BASE_URL = "http://localhost:8002/api/v1"

def test_settings():
    print("Testing Settings API...")
    
    # Wait for service
    for i in range(10):
        try:
            requests.get(f"{BASE_URL}/settings")
            break
        except:
            print(f"Waiting for backend... {i+1}/10")
            time.sleep(2)
            
    # 1. Update Settings
    payload = {
        "news_provider": "newsapi",
        "news_api_key": "test_news_key",
        "script_provider": "openai",
        "script_api_key": "test_script_key",
        "script_model": "gpt-4-turbo",
        "video_provider": "minimax",
        "video_api_key": "test_video_key"
    }
    
    response = requests.post(f"{BASE_URL}/settings", json=payload)
    if response.status_code != 200:
        print(f"FAILED: POST /settings status {response.status_code}")
        print(response.text)
        return
        
    print("✅ POST /settings success")
    
    # 2. Get Settings
    response = requests.get(f"{BASE_URL}/settings")
    if response.status_code != 200:
        print(f"FAILED: GET /settings status {response.status_code}")
        return
        
    data = response.json()
    
    # Verify values
    if data["news_provider"] == "newsapi" and data["news_api_key"] == "test_news_key":
         print("✅ GET /settings success - Data matches")
    else:
         print(f"FAILED: Data mismatch. Got: {data}")

if __name__ == "__main__":
    test_settings()
