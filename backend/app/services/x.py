import requests
import os
import base64
from ..security import decrypt_token

class XService:
    def __init__(self):
        self.client_id = os.getenv("X_CLIENT_ID")
        self.client_secret = os.getenv("X_CLIENT_SECRET")
        self.base_url = "https://api.twitter.com/2"

    def get_auth_url(self, redirect_uri, state="state", code_challenge="challenge", client_id=None):
        client_id = client_id or self.client_id
        if not client_id or "your_" in client_id:
            return None
        # OAuth 2.0 Authorization URL
        # Standard scopes for v2. media.write is specific to the new v2 upload endpoints.
        scopes = "tweet.read tweet.write users.read offline.access media.write"
        return (f"https://twitter.com/i/oauth2/authorize?response_type=code"
                f"&client_id={client_id}&redirect_uri={redirect_uri}"
                f"&scope={scopes}&state={state}&code_challenge={code_challenge}"
                f"&code_challenge_method=plain")

    def exchange_code(self, code, redirect_uri, code_verifier="challenge", client_id=None, client_secret=None):
        client_id = client_id or self.client_id
        client_secret = client_secret or self.client_secret
        
        if not client_id or not client_secret:
             return None, "X Client ID or Secret is missing. Please check your settings."

        url = "https://api.twitter.com/2/oauth2/token"
        
        # X requires Basic Auth with client_id:client_secret for confidential clients
        auth_str = f"{client_id}:{client_secret}"
        encoded_auth = base64.b64encode(auth_str.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {encoded_auth}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        data = {
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier
        }
        
        response = requests.post(url, data=data, headers=headers)
        if response.status_code != 200:
            print(f"DEBUG: X Token Exchange Failed. Status: {response.status_code}, Body: {response.text}")
            return None, f"Failed to exchange X code: {response.text}"
        
        token_data = response.json()
        access_token = token_data.get("access_token")

        # Get User Info
        user_url = f"{self.base_url}/users/me?user.fields=profile_image_url,public_metrics"
        user_headers = {"Authorization": f"Bearer {access_token}"}
        user_res = requests.get(user_url, headers=user_headers)
        
        user_info = {}
        if user_res.status_code == 200:
            user_data = user_res.json().get("data", {})
            metrics = user_data.get("public_metrics", {})
            user_info = {
                "id": user_data.get("id"),
                "username": user_data.get("username"),
                "name": user_data.get("name"),
                "profile_image_url": user_data.get("profile_image_url"),
                "followers_count": metrics.get("followers_count", 0)
            }

        return {
            "access_token": access_token,
            "refresh_token": token_data.get("refresh_token"),
            "user_id": user_info.get("id"),
            "username": user_info.get("username", "Unknown"),
            "profile_image": user_info.get("profile_image_url"),
            "followers_count": user_info.get("followers_count")
        }, None

    def refresh_token(self, encrypted_refresh_token, client_id=None, client_secret=None):
        client_id = client_id or self.client_id
        client_secret = client_secret or self.client_secret
        
        refresh_token = decrypt_token(encrypted_refresh_token)
        url = "https://api.twitter.com/2/oauth2/token"
        
        auth_str = f"{client_id}:{client_secret}"
        encoded_auth = base64.b64encode(auth_str.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {encoded_auth}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id
        }
        
        response = requests.post(url, data=data, headers=headers)
        if response.status_code == 200:
            return response.json(), None
        return None, response.json().get("error_description", "Failed to refresh X token")

    def get_decrypted_tokens(self, config_model):
        """Helper to get decrypted tokens for API use."""
        return {
            "access_token": decrypt_token(config_model.access_token),
            "refresh_token": decrypt_token(config_model.refresh_token) if config_model.refresh_token else None
        }

    async def upload_video(self, config_model, file_path, text):
        """
        Uploads a video to X using the multi-step INIT-APPEND-FINALIZE process.
        """
        tokens = self.get_decrypted_tokens(config_model)
        access_token = tokens["access_token"]
        
        try:
            if not os.path.exists(file_path):
                return None, f"Clip file not found: {file_path}"
                
            file_size = os.path.getsize(file_path)
            # Switch to v2 Media Upload Endpoints (requires media.write scope)
            init_url = "https://api.twitter.com/2/media/upload/initialize"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            # 1. INIT
            init_data = {
                "media_type": "video/mp4",
                "total_bytes": file_size,
                "media_category": "tweet_video"
            }
            
            response = requests.post(init_url, json=init_data, headers=headers)
            if response.status_code not in [200, 201, 202]:
                return None, f"X INIT (v2) failed: {response.status_code} - {response.text}"
                
            res_json = response.json()
            # v2 wraps data in a 'data' object; the key is usually 'id' for the media id.
            data_obj = res_json.get("data", {})
            media_id = data_obj.get("id") or data_obj.get("media_id") or res_json.get("media_id_string")
            if not media_id:
                return None, f"X INIT (v2) failed: media_id missing in response: {response.text}"
            
            # 2. APPEND
            segment_id = 0
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(4 * 1024 * 1024) # 4MB chunks
                    if not chunk:
                        break
                        
                    append_url = f"https://api.twitter.com/2/media/upload/{media_id}/append"
                    append_data = {
                        "segment_index": segment_id
                    }
                    files = {"media": chunk}
                    # V2 APPEND expects multipart/form-data
                    append_res = requests.post(append_url, data=append_data, files=files, headers={"Authorization": f"Bearer {access_token}"})
                    
                    if append_res.status_code < 200 or append_res.status_code > 299:
                        return None, f"X APPEND (v2) failed at segment {segment_id}: {append_res.status_code} - {append_res.text}"
                        
                    segment_id += 1
                
            # 3. FINALIZE
            finalize_url = f"https://api.twitter.com/2/media/upload/{media_id}/finalize"
            finalize_res = requests.post(finalize_url, headers=headers) 
            if finalize_res.status_code != 201 and finalize_res.status_code != 200:
                return None, f"X FINALIZE (v2) failed: {finalize_res.status_code} - {finalize_res.text}"
                
            # 4. Wait for processing (status check)
            import time
            res_finalize = finalize_res.json()
            processing_info = res_finalize.get("data", {}).get("processing_info") or res_finalize.get("processing_info")
            max_wait = 60 # seconds
            waited = 0
            while processing_info and processing_info.get("state") == "in_progress" and waited < max_wait:
                time.sleep(5)
                waited += 5
                
                status_url = "https://api.twitter.com/2/media/upload"
                status_params = {
                    "command": "STATUS",
                    "media_id": media_id
                }
                status_res = requests.get(status_url, params=status_params, headers=headers)
                res_status = status_res.json()
                processing_info = res_status.get("data", {}).get("processing_info") or res_status.get("processing_info")
                
                if processing_info and processing_info.get("state") == "failed":
                    return None, f"X processing failed: {processing_info.get('error', {}).get('message')}"

            # 5. Post Tweet with Media
            tweet_url = "https://api.twitter.com/2/tweets"
            tweet_data = {
                "text": text,
                "media": {
                    "media_ids": [media_id]
                }
            }
            tweet_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            tweet_res = requests.post(tweet_url, json=tweet_data, headers=tweet_headers)
            if tweet_res.status_code != 201:
                return None, f"X Tweet failed: {tweet_res.status_code} - {tweet_res.text}"
                
            return tweet_res.json(), None
        except Exception as e:
            return None, f"X Service Error: {str(e)}"
