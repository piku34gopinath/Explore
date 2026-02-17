import requests
import os
from datetime import datetime
from ..security import decrypt_token

class MetaService:
    def __init__(self):
        self.fb_client_id = os.getenv("FACEBOOK_CLIENT_ID")
        self.fb_client_secret = os.getenv("FACEBOOK_CLIENT_SECRET")
        self.ig_client_id = os.getenv("INSTAGRAM_CLIENT_ID")
        self.ig_client_secret = os.getenv("INSTAGRAM_CLIENT_SECRET")
        self.base_url = "https://graph.facebook.com/v19.0"

    def get_instagram_auth_url(self, redirect_uri, client_id=None):
        client_id = client_id or self.ig_client_id
        if not client_id or "your_" in client_id:
            return None
        return f"https://api.instagram.com/oauth/authorize?client_id={client_id}&redirect_uri={redirect_uri}&scope=user_profile,user_media&response_type=code"

    def get_facebook_auth_url(self, redirect_uri, client_id=None):
        client_id = client_id or self.fb_client_id
        if not client_id or "your_" in client_id:
            return None
        return f"https://www.facebook.com/v19.0/dialog/oauth?client_id={client_id}&redirect_uri={redirect_uri}&scope=pages_show_list,pages_read_engagement,pages_manage_posts,public_profile"

    def exchange_instagram_code(self, code, redirect_uri, client_id=None, client_secret=None):
        client_id = client_id or self.ig_client_id
        client_secret = client_secret or self.ig_client_secret
        
        url = "https://api.instagram.com/oauth/access_token"
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code": code
        }
        response = requests.post(url, data=data)
        if response.status_code != 200:
            return None, response.json().get("error_message", "Failed to exchange Instagram code")
        
        token_data = response.json()
        access_token = token_data.get("access_token")
        user_id = token_data.get("user_id")

        # Get Long-lived token (60 days)
        ll_url = f"https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={client_secret}&access_token={access_token}"
        ll_res = requests.get(ll_url)
        if ll_res.status_code == 200:
            access_token = ll_res.json().get("access_token", access_token)

        # 2. Get profile info
        profile_url = f"https://graph.instagram.com/me?fields=id,username,account_type&access_token={access_token}"
        profile_res = requests.get(profile_url)
        profile_info = profile_res.json() if profile_res.status_code == 200 else {}

        return {
            "access_token": access_token,
            "user_id": user_id,
            "username": profile_info.get("username", "Unknown"),
            "follower_count": 0
        }, None

    def refresh_instagram_token(self, encrypted_token):
        access_token = decrypt_token(encrypted_token)
        url = f"https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={access_token}"
        response = requests.get(url)
        if response.status_code == 200:
            return response.json().get("access_token"), None
        return None, response.json().get("error", {}).get("message", "Failed to refresh token")

    def exchange_facebook_code(self, code, redirect_uri, client_id=None, client_secret=None):
        client_id = client_id or self.fb_client_id
        client_secret = client_secret or self.fb_client_secret
        
        # 1. Exchange code for short-lived token
        url = f"{self.base_url}/oauth/access_token"
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "client_secret": client_secret,
            "code": code
        }
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return None, response.json().get("error", {}).get("message", "Failed to exchange Facebook code")
        
        token_data = response.json()
        access_token = token_data.get("access_token")

        # Exchange for long-lived token
        ll_url = f"{self.base_url}/oauth/access_token?grant_type=fb_exchange_token&client_id={client_id}&client_secret={client_secret}&fb_exchange_token={access_token}"
        ll_res = requests.get(ll_url)
        if ll_res.status_code == 200:
            access_token = ll_res.json().get("access_token", access_token)

        # 2. Get user pages/profile
        profile_url = f"{self.base_url}/me/accounts?access_token={access_token}"
        profile_res = requests.get(profile_url)
        pages_data = profile_res.json().get("data", [])
        
        page_info = {}
        if pages_data:
            page = pages_data[0]
            page_info = {
                "id": page.get("id"),
                "name": page.get("name"),
                "access_token": page.get("access_token"),
                "fan_count": 0
            }

        return {
            "access_token": access_token,
            "page_access_token": page_info.get("access_token"),
            "id": page_info.get("id"),
            "name": page_info.get("name", "Unknown Page")
        }, None

    def get_decrypted_tokens(self, config_model):
        """Helper to get decrypted tokens for API use."""
        return {
            "access_token": decrypt_token(config_model.access_token),
            "page_access_token": decrypt_token(config_model.page_access_token) if hasattr(config_model, 'page_access_token') else None
        }
