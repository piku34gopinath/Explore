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
        """
        Uses Facebook Login to authenticate for Instagram Business (Graph API).
        This is required for publishing Reels.
        """
        client_id = client_id or self.fb_client_id # Use FB Client ID for IG Business
        if not client_id or "your_" in client_id:
            return None
        
        # Scopes required for IG Business publishing
        scopes = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,pages_manage_posts,public_profile,business_management"
        return f"https://www.facebook.com/v19.0/dialog/oauth?client_id={client_id}&redirect_uri={redirect_uri}&scope={scopes}"

    def get_facebook_auth_url(self, redirect_uri, client_id=None):
        client_id = client_id or self.fb_client_id
        if not client_id or "your_" in client_id:
            return None
        return f"https://www.facebook.com/v19.0/dialog/oauth?client_id={client_id}&redirect_uri={redirect_uri}&scope=pages_show_list,pages_read_engagement,pages_manage_posts,public_profile"

    def exchange_instagram_code(self, code, redirect_uri, client_id=None, client_secret=None):
        """
        Exchanges FB OAuth code for token, then finds the connected IG Business Account.
        """
        # Use FB credentials
        client_id = client_id or self.fb_client_id
        client_secret = client_secret or self.fb_client_secret
        
        # 1. Exchange code for short-lived FB User and Page token
        url = f"{self.base_url}/oauth/access_token"
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "client_secret": client_secret,
            "code": code
        }
        response = requests.get(url, params=params)
        if response.status_code != 200:
            return None, response.json().get("error", {}).get("message", "Failed to exchange code for Instagram access")
        
        token_data = response.json()
        access_token = token_data.get("access_token")

        # 2. Get Long-lived token
        ll_url = f"{self.base_url}/oauth/access_token?grant_type=fb_exchange_token&client_id={client_id}&client_secret={client_secret}&fb_exchange_token={access_token}"
        ll_res = requests.get(ll_url)
        if ll_res.status_code == 200:
            access_token = ll_res.json().get("access_token", access_token)

        # 3. Find connected IG Business Account via Pages
        # We need to find a page that has an instagram_business_account connected
        pages_url = f"{self.base_url}/me/accounts?fields=name,access_token,instagram_business_account{{id,username,profile_picture_url,followers_count}}&access_token={access_token}"
        pages_res = requests.get(pages_url)
        
        if pages_res.status_code != 200:
             print(f"DEBUG: Failed to fetch pages. Status: {pages_res.status_code}, Response: {pages_res.text}")
             return None, f"Failed to fetch Pages. Status: {pages_res.status_code}, Msg: {pages_res.text}"
             
        pages_data = pages_res.json().get("data", [])
        print(f"DEBUG: Pages Data Raw Response: {pages_res.text}") # Debug print
        
        if not pages_data:
            # DEBUG: Check what permissions were actually granted
            perm_url = f"{self.base_url}/me/permissions?access_token={access_token}"
            perm_res = requests.get(perm_url)
            print(f"DEBUG: Granted Permissions: {perm_res.json()}")
            
            return None, "No Facebook Pages found. Please checks logs for granted permissions. You MUST select your connected Facebook Page in the login popup (Step 2)."
        
        ig_account = None
        for page in pages_data:
            if page.get("instagram_business_account"):
                ig_info = page.get("instagram_business_account")
                print(f"DEBUG: Found IG Account: {ig_info}") # Debug print
                ig_account = {
                    "user_id": ig_info.get("id"),
                    "username": ig_info.get("username"),
                    "profile_picture": ig_info.get("profile_picture_url"),
                    "follower_count": ig_info.get("followers_count", 0),
                    # We store the PAGE token because we act as the Page to post to IG
                    "access_token": page.get("access_token") 
                }
                break
        
        if not ig_account:
            return None, "No specific Instagram Business Account found. IMPORTANT: During the Facebook Login popup, you MUST select BOTH your Instagram Account (Step 1) AND the connected Facebook Page (Step 2). Also verify they are linked in Facebook Page Settings."

        return {
            "access_token": ig_account["access_token"], # This is actually the Page Token capable of posting to IG
            "user_id": ig_account["user_id"],
            "username": ig_account["username"],
            "follower_count": ig_account["follower_count"],
            "profile_picture": ig_account.get("profile_picture")
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
        profile_url = f"{self.base_url}/me/accounts?access_token={access_token}&fields=id,name,access_token,fan_count"
        profile_res = requests.get(profile_url)
        
        if profile_res.status_code != 200:
            return None, f"Failed to fetch Facebook Pages: {profile_res.text}"
            
        pages_data = profile_res.json().get("data", [])
        
        if not pages_data:
            return None, "No Facebook Pages found. You must have at least one Facebook Page to use this integration. Also ensure you granted 'Manage Pages' permission."
            
        page = pages_data[0] # Take first page for now
        page_info = {
            "id": page.get("id"),
            "name": page.get("name"),
            "access_token": page.get("access_token"),
            "fan_count": page.get("fan_count", 0)
        }

        return {
            "access_token": access_token,
            "page_access_token": page_info.get("access_token"),
            "id": page_info.get("id"),
            "name": page_info.get("name")
        }, None

    def get_decrypted_tokens(self, config_model):
        """Helper to get decrypted tokens for API use."""
        return {
            "access_token": decrypt_token(config_model.access_token),
            "page_access_token": decrypt_token(config_model.page_access_token) if hasattr(config_model, 'page_access_token') and config_model.page_access_token else None
        }

    async def upload_instagram_reel(self, config_model, file_path, caption):
        """
        Uploads a video as a Reel to Instagram.
        Note: requires a public URL for the simple flow, or resumable upload for local files.
        We'll use a placeholder logic or resumable upload if available.
        For this MVP, we'll implement the 'resumable upload' structure.
        """
        try:
            if not os.path.exists(file_path):
                return None, f"Clip file not found: {file_path}"
                
            file_size = os.path.getsize(file_path)
            tokens = self.get_decrypted_tokens(config_model)
            # For IG Business, we use the Page Access Token to create a container
            access_token = tokens["page_access_token"] or tokens["access_token"]
            ig_user_id = config_model.instagram_id
            
            if not ig_user_id:
                return None, "Instagram Account ID missing from configuration. Refresh your connection."

            # 1. Create Resumable Upload Container
            init_url = f"{self.base_url}/{ig_user_id}/media"
            init_params = {
                "media_type": "REELS",
                "upload_type": "resumable",
                "caption": caption,
                "access_token": access_token
            }
            
            init_res = requests.post(init_url, params=init_params)
            if init_res.status_code != 200:
                return None, f"Instagram INIT failed: {init_res.text}"
                
            container_id = init_res.json().get("id")
            
            # 2. Upload Video Bytes to rupload
            upload_url = f"https://rupload.facebook.com/ig-api-upload/v19.0/{container_id}"
            upload_headers = {
                "Authorization": f"OAuth {access_token}",
                "offset": "0",
                "file_size": str(file_size),
                "Content-Type": "application/octet-stream"
            }
            
            with open(file_path, "rb") as f:
                upload_res = requests.post(upload_url, data=f, headers=upload_headers)
                
            if upload_res.status_code != 200:
                return None, f"Instagram BYTES upload failed: {upload_res.text}"
                
            # 3. Wait for processing (FINISHED status)
            import time
            status_url = f"{self.base_url}/{container_id}"
            max_wait = 180 # 3 minutes for video
            waited = 0
            while waited < max_wait:
                status_res = requests.get(status_url, params={"fields": "status_code", "access_token": access_token})
                status_code = status_res.json().get("status_code")
                
                if status_code == "FINISHED":
                    break
                elif status_code == "ERROR":
                    return None, f"Instagram processing failed: {status_res.text}"
                    
                time.sleep(10)
                waited += 10
            else:
                return None, "Instagram processing timed out."

            # 4. Final Publish
            publish_url = f"{self.base_url}/{ig_user_id}/media_publish"
            publish_params = {
                "creation_id": container_id,
                "access_token": access_token
            }
            
            publish_res = requests.post(publish_url, params=publish_params)
            if publish_res.status_code != 200:
                return None, f"Instagram PUBLISH failed: {publish_res.text}"
                
            return publish_res.json(), None
        except Exception as e:
            return None, f"Instagram Service Error: {str(e)}"

    async def upload_facebook_video(self, config_model, file_path, description):
        """
        Uploads a video to a Facebook Page.
        """
        try:
            if not os.path.exists(file_path):
                return None, f"Clip file not found: {file_path}"
                
            tokens = self.get_decrypted_tokens(config_model)
            page_access_token = tokens["page_access_token"]
            page_id = config_model.page_id
            
            if not page_id:
                 return None, "Facebook Page ID missing from configuration. Refresh your connection."
                 
            url = f"{self.base_url}/{page_id}/videos"
            
            # Use 'with' to ensure file is closed and handle potential IO errors
            with open(file_path, 'rb') as f:
                files = {'source': f}
                data = {
                    'description': description,
                    'access_token': page_access_token
                }
                
                response = requests.post(url, files=files, data=data)
                
            if response.status_code != 200:
                error_detail = response.json().get('error', {}).get('message', response.text)
                return None, f"Facebook API Error: {error_detail}"
                
            return response.json(), None
        except Exception as e:
            return None, f"Facebook Service Error: {str(e)}"
