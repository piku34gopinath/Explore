# Running the AI Video Clipper — Full Setup Guide

End‑to‑end instructions to run the app locally with Docker: AI clip analysis, YouTube Shorts upload, Instagram Reels publishing, and burned‑in karaoke captions + emoji stickers.

---

## 1. Architecture

| Service   | Container      | Host port | What it does                                   |
|-----------|----------------|-----------|------------------------------------------------|
| Frontend  | `frontend`     | **3000**  | Next.js UI                                     |
| Backend   | `backend`      | **8001**  | FastAPI API (`/static` serves generated clips) |
| Worker    | `worker`       | –         | Celery worker: downloads, clips, captions      |
| Postgres  | `db`           | 5432      | Database `videoclipper`                        |
| Redis     | `redis`        | 6379      | Celery broker/result backend                   |

> Frontend calls the backend at `http://localhost:8001` (`NEXT_PUBLIC_API_URL`).

---

## 2. Prerequisites

- Docker + Docker Compose
- (For Instagram) a tunnel tool — **ngrok** or **cloudflared**
- API keys you plan to use (all optional but needed for their features):
  - **Gemini** (free) for AI analysis — https://aistudio.google.com/app/apikey
  - **Google OAuth** client for login + YouTube upload
  - **Meta app** for Instagram Reels

---

## 3. Environment file (`.env`)

Create `.env` in the project root:

```bash
# ---- AI (analysis) ----
GOOGLE_API_KEY=your-gemini-api-key
OPENAI_API_KEY=            # optional; captions now use local Whisper instead
ANTHROPIC_API_KEY=

# ---- Google login + YouTube upload ----
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# ---- Meta / Instagram Reels ----
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:3000/auth/instagram/callback
# Public HTTPS URL of the BACKEND (tunnel) so Instagram can fetch clips:
PUBLIC_BASE_URL=

# ---- Captions (local Whisper) ----
WHISPER_MODEL=base          # tiny | base | small | medium
WHISPER_TASK=translate      # translate = English captions; transcribe = original language
```

> ⚠️ **Port consistency:** every OAuth redirect URI must match the port the frontend actually serves **and** be registered in Google/Meta. The compose file serves the frontend on **3000** — keep all redirect URIs on `localhost:3000` (or change the port everywhere).

---

## 4. Quick start

```bash
docker-compose up -d --build
```

```bash
docker-compose logs -f
```

Open the app: **http://localhost:3000**

Stop everything:

```bash
docker-compose down
```

---

## 5. First‑time configuration

### 5a. AI provider (Gemini — free)

1. Get a key at https://aistudio.google.com/app/apikey (create it in a **new project** for free‑tier quota).
2. In the app: **Settings → Add Provider → Gemini**, paste the key, pick a model.
   - Use **`gemini-2.5-flash`** (works on free tier). Avoid `gemini-2.0-flash` — it can have a `limit: 0` free‑tier quota.

### 5b. Google login + YouTube upload

1. https://console.cloud.google.com/apis/credentials → **Create OAuth client ID** → *Web application*.
2. Configure the **OAuth consent screen** (External) and add your Google account under **Test users**.
3. **Authorized redirect URIs** → add `http://localhost:3000/auth/callback`.
4. Copy Client ID/Secret into `.env`, then recreate the backend (step 6).
5. **Enable the YouTube Data API v3**: https://console.cloud.google.com/apis/library/youtube.googleapis.com — click **Enable**, wait 1–2 min.
6. In the app, click **Sign in with Google**.

### 5c. Instagram Reels

**Requirements:** an Instagram **Business/Creator** account linked to a **Facebook Page** you manage.

1. In your Meta app add **Facebook Login** + **Instagram Graph API** products.
2. **Facebook Login → Valid OAuth Redirect URIs** → add `http://localhost:3000/auth/instagram/callback`.
3. Put `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` in `.env`.
4. **Start a tunnel to the backend** so Meta can fetch clips (it cannot reach `localhost`):

   ```bash
   ngrok http 8001
   ```

   Copy the **Forwarding** `https://…` URL (NOT the `127.0.0.1:4040` inspector address) into `.env`:

   ```bash
   PUBLIC_BASE_URL=https://<your-id>.ngrok-free.dev
   ```

   Or use Cloudflare Tunnel (no browser‑warning page):

   ```bash
   cloudflared tunnel --url http://localhost:8001
   ```

5. Recreate the backend (step 6), then **Settings → Connect Instagram Account**.
6. On a clip, click **Upload to Reels**.

> Verify the tunnel serves a clip before publishing:
> ```bash
> curl -sI https://<your-tunnel>/static/<clip-filename>.mp4
> ```
> Expect `200` and `content-type: video/mp4`.

---

## 6. Applying changes (important dev workflow)

- **`.env` changes** → recreate the affected service:
  ```bash
  docker-compose up -d --force-recreate backend
  ```
- **Backend code** (`app/main.py`, etc.) → auto‑reloads (uvicorn `--reload`).
- **Worker code** (`services/editor.py`, `services/transcriber.py`, `tasks.py`) → **does NOT auto‑reload**. You must restart:
  ```bash
  docker-compose restart worker
  ```
- **Dependency or Dockerfile changes** → rebuild:
  ```bash
  docker-compose build worker && docker-compose up -d worker
  ```

---

## 7. Features & notes

### Captions (karaoke) + emoji stickers
- Generated clips get **word‑by‑word karaoke captions** (active word highlighted) and a **pulsing emoji** chosen by the clip's `viral_angle`.
- Transcription runs **locally** via `faster-whisper` (free, no API). First clip after a fresh build downloads the model (~150 MB) into the `whisper_cache` volume.
- `WHISPER_TASK=translate` → English captions (needed because the caption font is Latin‑only). Set `transcribe` to keep the original language (requires adding a matching font).
- Captions apply to **newly generated** clips only — regenerate a video to see changes.

### Instagram Reels internals
- Clips are made **faststart** (`moov` atom at front) automatically; non‑faststart MP4s fail on Instagram with error `2207077`.
- Publishing is offloaded to a thread so the backend can serve the video to Meta while polling.

---

## 8. Common commands

```bash
docker-compose up -d --build         # start/rebuild everything
docker-compose down                  # stop
docker-compose logs -f backend       # tail one service
docker-compose restart worker        # reload worker code
docker-compose ps                    # status
```

Database shell:

```bash
docker-compose exec db psql -U postgres -d videoclipper
```

Inspect data:

```bash
docker-compose exec db psql -U postgres -d videoclipper -c "SELECT id, user_id, status, title FROM video_sources ORDER BY id;"
```

---

## 9. Database schema changes

This project creates tables via SQLAlchemy `create_all` on startup, which **only creates missing tables — it does NOT add columns to existing tables**. After adding a column to a model, apply it manually, e.g.:

```bash
docker-compose exec db psql -U postgres -d videoclipper -c "ALTER TABLE generated_clips ADD COLUMN IF NOT EXISTS instagram_id VARCHAR;"
```

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `AI analysis failed … limit: 0, gemini-2.0-flash` | No free‑tier quota for that model | Use `gemini-2.5-flash` in Settings |
| `credit balance is too low` (Anthropic) | API console has no credits (Pro plan ≠ API) | Add credits at console.anthropic.com, or use Gemini |
| `Error 401: invalid_client` (Google) | Placeholder/wrong `GOOGLE_CLIENT_ID` | Set a real OAuth client; recreate backend |
| `Error 403: access_denied` (Google) | App in Testing; you're not a test user | Add your email under OAuth consent → Test users |
| `accessNotConfigured … YouTube Data API` | API not enabled | Enable YouTube Data API v3; wait 1–2 min |
| Reel fails `2207077` | Bad `PUBLIC_BASE_URL`, non‑faststart clip, or blocked event loop | Use the real tunnel HTTPS URL; clips are auto‑faststart; publish runs in a thread (already handled) |
| Captions show "THIS IS A SAMPLE TRANSCRIPT…" | Old dummy fallback | Fixed — failed transcription now shows no caption |
| Captions in wrong language / □ boxes | Worker running old code or `WHISPER_TASK` not applied | `docker-compose restart worker`, regenerate video |
| 500 on `/users/{id}/videos` | New model column missing in DB | Run the `ALTER TABLE` (section 9) |
| Dashboard shows no videos | `user_id` mismatch (submit hardcodes an id) | Ensure you view as the owning user |

---

## 11. Utility scripts

```bash
docker-compose exec backend python migrate_db.py
docker-compose exec backend python check_upload_state.py
docker-compose exec backend python db_audit.py
```
