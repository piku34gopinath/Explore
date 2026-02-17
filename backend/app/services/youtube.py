from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import os
import json
from datetime import datetime, timedelta

# YouTube API Scopes
SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
]

# Redirect URI (must match Google Cloud Console)
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/auth/callback")

from ..security import decrypt_token

class YouTubeService:
    def __init__(self):
        # In production, use environment variables or a secure vault
        self.client_secrets_file = "client_secrets.json" 
        
        # Check if client_secrets exists or construct from env vars
        if not os.path.exists(self.client_secrets_file):
            print("Warning: client_secrets.json not found. YouTube integration will fail.")

    def _get_flow(self, redirect_uri=REDIRECT_URI, client_id=None, client_secret=None):
        """Helper to create a Flow instance from env vars or client_secrets.json"""
        # If not provided, try env vars
        if not client_id:
            client_id = os.getenv("GOOGLE_CLIENT_ID")
        if not client_secret:
            client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

        if client_id and client_secret:
            client_config = {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri],
                }
            }
            return Flow.from_client_config(
                client_config,
                scopes=SCOPES,
                redirect_uri=redirect_uri
            )
        
        if os.path.exists(self.client_secrets_file):
            return Flow.from_client_secrets_file(
                self.client_secrets_file,
                scopes=SCOPES,
                redirect_uri=redirect_uri
            )
            
        return None

    def get_auth_url(self, client_id=None, client_secret=None):
        """Generates the OAuth 2.0 authorization URL."""
        flow = self._get_flow(client_id=client_id, client_secret=client_secret)
        if not flow:
             return None, "Google Client ID/Secret not found in env or client_secrets.json"
        
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        return auth_url, None

    def exchange_code_for_token(self, code, client_id=None, client_secret=None):
        """Exchanges the authorization code for an access token."""
        try:
            flow = self._get_flow(client_id=client_id, client_secret=client_secret)
            if not flow:
                return None, "Google Credentials missing"
                
            flow.fetch_token(code=code)
            credentials = flow.credentials
            
            # Get User Info
            oauth2_service = build('oauth2', 'v2', credentials=credentials)
            user_info = oauth2_service.userinfo().get().execute()
            
            # Get channel info
            youtube = build('youtube', 'v3', credentials=credentials)
            request = youtube.channels().list(part="snippet,statistics", mine=True)
            response = request.execute()
            
            channel_info = {}
            if response['items']:
                item = response['items'][0]
                snippet = item['snippet']
                statistics = item['statistics']
                channel_info = {
                    'title': snippet['title'],
                    'id': item['id'],
                    'thumbnail': snippet['thumbnails']['default']['url'],
                    'subscriber_count': int(statistics.get('subscriberCount', 0)),
                    'video_count': int(statistics.get('videoCount', 0))
                }
            
            return {
                'token': credentials.token,
                'refresh_token': credentials.refresh_token,
                'token_uri': credentials.token_uri,
                'client_id': credentials.client_id,
                'client_secret': credentials.client_secret,
                'scopes': credentials.scopes,
                'expiry': credentials.expiry.isoformat() if credentials.expiry else None
            }, channel_info, user_info
            
        except Exception as e:
            print(f"Error exchanging code: {str(e)}")
            return None, str(e), None

    def get_authenticated_service(self, config_model):
        """Builds an authenticated YouTube service object with decryption and refresh support."""
        try:
            # Decrypt tokens
            access_token = decrypt_token(config_model.access_token)
            refresh_token = decrypt_token(config_model.refresh_token)
            
            credentials = Credentials(
                token=access_token,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=os.getenv("GOOGLE_CLIENT_ID"),
                client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
                scopes=SCOPES
            )
            
            # Check if token is expired and refresh if necessary
            import google.auth.transport.requests
            from google.auth.transport.requests import Request as GoogleRequest
            
            if credentials.expired or (credentials.expiry and credentials.expiry < datetime.utcnow()):
                print("YouTube token expired, refreshing...")
                credentials.refresh(GoogleRequest())
                # Note: In a real app, you should save the new access token back to the DB here
                # For now, we'll return the service and handle persistence separately or via a hook
            
            return build('youtube', 'v3', credentials=credentials), credentials
        except Exception as e:
            print(f"Error building service: {str(e)}")
            return None, None

    async def upload_video(self, config_model, file_path, title, description, tags, category_id="22", privacy_status="private", db=None):
        """Uploads a video to YouTube using the secure config model."""
        try:
            service, credentials = self.get_authenticated_service(config_model)
            if not service:
                return None, "Failed to authenticate with YouTube"

            # If tokens were refreshed, save them back to DB
            if credentials.expired or (credentials.expiry and credentials.expiry < datetime.utcnow()):
                 if db and config_model:
                     from ..security import encrypt_token
                     config_model.access_token = encrypt_token(credentials.token)
                     config_model.token_expiry = credentials.expiry
                     await db.commit()

            body = {
                'snippet': {
                    'title': title[:100], # YouTube limit
                    'description': description[:5000],
                    'tags': tags,
                    'categoryId': category_id
                },
                'status': {
                    'privacyStatus': privacy_status,
                    'selfDeclaredMadeForKids': False
                }
            }

            # MediaFileUpload handles the file upload
            media = MediaFileUpload(file_path, chunksize=-1, resumable=True)

            request = service.videos().insert(
                part=','.join(body.keys()),
                body=body,
                media_body=media
            )

            response = None
            while response is None:
                status, response = request.next_chunk()
                if status:
                    print(f"Uploaded {int(status.progress() * 100)}%")

            return response, None

        except Exception as e:
            print(f"Upload error: {e}")
            return None, str(e)
