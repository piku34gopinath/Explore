import os
import time
import requests

# Meta Graph API version
GRAPH_VERSION = os.getenv("FACEBOOK_GRAPH_VERSION", "v21.0")
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"
FB_DIALOG = f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth"

# Redirect URI (must match the one registered in the Meta app)
REDIRECT_URI = os.getenv("FACEBOOK_REDIRECT_URI", "http://localhost:3001/auth/instagram/callback")

# Permissions required to publish Reels to an Instagram Business/Creator account
SCOPES = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
]


class InstagramService:
    """Instagram Reels publishing via the Meta (Facebook Login) Graph API.

    Mirrors the shape of YouTubeService: get_auth_url -> exchange_code_for_token
    -> publish_reel. Reels publishing is a URL-based, 3-step flow (Meta fetches
    the video from a public HTTPS URL), unlike YouTube's direct file upload.
    """

    def _app_id(self, app_id=None):
        return app_id or os.getenv("FACEBOOK_APP_ID")

    def _app_secret(self, app_secret=None):
        return app_secret or os.getenv("FACEBOOK_APP_SECRET")

    def get_auth_url(self, app_id=None, app_secret=None, redirect_uri=REDIRECT_URI):
        """Builds the Facebook Login authorization URL."""
        app_id = self._app_id(app_id)
        if not app_id:
            return None, "Facebook App ID not found in env or system config"

        from urllib.parse import urlencode
        params = {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "scope": ",".join(SCOPES),
            "response_type": "code",
        }
        return f"{FB_DIALOG}?{urlencode(params)}", None

    def exchange_code_for_token(self, code, app_id=None, app_secret=None, redirect_uri=REDIRECT_URI):
        """Exchange the OAuth code for a long-lived token and resolve the
        connected Instagram Business account.

        Returns (token_data, ig_info) on success, or (None, error_string) on failure.
        """
        app_id = self._app_id(app_id)
        app_secret = self._app_secret(app_secret)
        if not app_id or not app_secret:
            return None, "Facebook App ID/Secret missing"

        try:
            # 1. Code -> short-lived user access token
            r = requests.get(
                f"{GRAPH_BASE}/oauth/access_token",
                params={
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "redirect_uri": redirect_uri,
                    "code": code,
                },
                timeout=30,
            )
            data = r.json()
            if "access_token" not in data:
                return None, f"Token exchange failed: {data.get('error', data)}"
            short_token = data["access_token"]

            # 2. Short-lived -> long-lived token (~60 days)
            r = requests.get(
                f"{GRAPH_BASE}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "fb_exchange_token": short_token,
                },
                timeout=30,
            )
            data = r.json()
            long_token = data.get("access_token", short_token)
            expires_in = data.get("expires_in")  # seconds

            # 3. List Pages the user manages (each carries a Page access token)
            r = requests.get(
                f"{GRAPH_BASE}/me/accounts",
                params={"access_token": long_token, "fields": "id,name,access_token"},
                timeout=30,
            )
            pages = r.json().get("data", [])
            if not pages:
                return None, (
                    "No Facebook Pages found. An Instagram Business/Creator account "
                    "must be linked to a Facebook Page you manage."
                )

            # 4. Find the Page that has a linked Instagram Business account
            for page in pages:
                page_id = page["id"]
                page_token = page.get("access_token", long_token)
                pr = requests.get(
                    f"{GRAPH_BASE}/{page_id}",
                    params={
                        "fields": "instagram_business_account{id,username,name,profile_picture_url,followers_count}",
                        "access_token": page_token,
                    },
                    timeout=30,
                )
                iga = pr.json().get("instagram_business_account")
                if iga:
                    token_data = {
                        "access_token": long_token,
                        "page_access_token": page_token,
                        "expires_in": expires_in,
                    }
                    ig_info = {
                        "ig_user_id": iga["id"],
                        "username": iga.get("username"),
                        "name": iga.get("name"),
                        "profile_picture_url": iga.get("profile_picture_url"),
                        "followers_count": iga.get("followers_count", 0),
                        "page_id": page_id,
                    }
                    return token_data, ig_info

            return None, (
                "No Instagram Business/Creator account is linked to your Facebook Page(s). "
                "Link one in Instagram settings, then reconnect."
            )
        except Exception as e:
            print(f"Instagram code exchange error: {e}")
            return None, str(e)

    def publish_reel(self, access_token, ig_user_id, video_url, caption, poll_timeout=300, poll_interval=5):
        """Publish a Reel: create a media container, wait for Meta to finish
        fetching/processing the video_url, then publish it.

        Returns (media_id, None) on success or (None, error_string) on failure.
        """
        try:
            # 1. Create the REELS container
            r = requests.post(
                f"{GRAPH_BASE}/{ig_user_id}/media",
                params={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption or "",
                    "access_token": access_token,
                },
                timeout=60,
            )
            data = r.json()
            creation_id = data.get("id")
            if not creation_id:
                return None, f"Failed to create Reel container: {data.get('error', data)}"

            # 2. Poll container status until FINISHED (Meta downloads/transcodes the video)
            waited = 0
            while waited < poll_timeout:
                sr = requests.get(
                    f"{GRAPH_BASE}/{creation_id}",
                    params={"fields": "status_code,status", "access_token": access_token},
                    timeout=30,
                )
                status = sr.json()
                code = status.get("status_code")
                if code == "FINISHED":
                    break
                if code == "ERROR":
                    print(f"[IG] Reel processing ERROR: {status.get('status', status)}")
                    return None, f"Reel processing failed: {status.get('status', status)}"
                time.sleep(poll_interval)
                waited += poll_interval
            else:
                return None, "Timed out waiting for Instagram to process the Reel"

            # 3. Publish the container
            pr = requests.post(
                f"{GRAPH_BASE}/{ig_user_id}/media_publish",
                params={"creation_id": creation_id, "access_token": access_token},
                timeout=60,
            )
            pub = pr.json()
            media_id = pub.get("id")
            if not media_id:
                return None, f"Publish failed: {pub.get('error', pub)}"

            return media_id, None
        except Exception as e:
            print(f"Instagram publish error: {e}")
            return None, str(e)
