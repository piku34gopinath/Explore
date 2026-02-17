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
        scopes = "tweet.read tweet.write users.read offline.access"
        return (f"https://twitter.com/i/oauth2/authorize?response_type=code"
                f"&client_id={client_id}&redirect_uri={redirect_uri}"
                f"&scope={scopes}&state={state}&code_challenge={code_challenge}"
                f"&code_challenge_method=plain")

    def exchange_code(self, code, redirect_uri, code_verifier="challenge", client_id=None, client_secret=None):
        client_id = client_id or self.client_id
        client_secret = client_secret or self.client_secret
        
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
            return None, response.json().get("error_description", "Failed to exchange X code")
        
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
