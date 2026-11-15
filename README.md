# together — watch with friends

A full-stack starter for private watch rooms. The React/Vite client uses Django REST Framework for accounts and room management, Django Channels for synchronized playback/chat/signaling, PostgreSQL in configured deployments, and WebRTC peer connections for calls.

## Run locally

Requirements: Python 3.10+, Node.js 18+, and (for PostgreSQL rather than the included SQLite development default) PostgreSQL.

1. Copy `.env.example` to `.env` and set `DJANGO_SECRET_KEY`. The example SQLite configuration is used unless `DATABASE_URL` is set. Environment variables must be exported in the shell that starts Django; the backend does not load `.env` files automatically.
2. Install backend requirements and initialize the database:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   cd backend
   py manage.py migrate
   daphne -b 0.0.0.0 -p 8000 config.asgi:application
   ```

3. In a second terminal at the project root:

   ```powershell
   npm install
   npm run dev -- --host 0.0.0.0
   ```

4. Open http://localhost:5173, register two accounts, create a room, and share its URL. The room URL is the private invite; recipients need an account and must be signed in. Profile photos are uploaded to XeonFileBox and the returned image URL is saved in the user profile.

### Open on a phone on the same Wi-Fi

Start Daphne and Vite using the `0.0.0.0` commands above. On the computer, find its Wi-Fi IPv4 address with `ipconfig`; on the phone, open `http://<computer-ip>:5173`. Vite proxies API and WebSocket requests to Django. Allow Node.js and Python through Windows Firewall on private networks if prompted. For HTTPS camera access over the internet, run `ngrok http 5173` and open its HTTPS forwarding URL. If ngrok shows its free-tier interstitial, tap **Visit Site** once; Vite proxies API and WebSocket requests through the same tunnel. The tunnel URL is public while it runs, so stop the tunnel after testing. This is for local development only; do not expose Django's debug server directly to the public internet.

For PostgreSQL, set `DATABASE_URL`, for example `postgresql://postgres:postgres@localhost:5432/watchtogether`. For local single-process development, Channels uses its in-memory layer when `REDIS_URL` is unset. Set `REDIS_URL=redis://127.0.0.1:6379/0` for Redis-backed Channels (required across multiple ASGI workers/instances). `VITE_API_URL` and `VITE_WS_URL` can override the default API and WebSocket origins.

## Included functionality

- Username/password registration, login, token-authenticated API, logout, a basic profile page, and account profile-photo uploads.
- Private/public room creation, invite-by-room-URL, membership, room locking, host settings, participant removal, and room closing.
- A database-backed authoritative playback position/state. Play, pause, seeks (10/30 seconds and timeline), and video URL changes are broadcast through Channels and periodically reconciled from the API.
- MP4 and compatible HLS playback (HLS.js where needed), volume, fullscreen, speed, quality selection when exposed by HLS, and keyboard shortcuts.
- WebSocket room chat/history and typing signals.
- Multi-party mesh WebRTC audio/video calling; media travels peer-to-peer, while Django Channels relays SDP/ICE signaling. The call UI can mute audio, disable the camera, switch front/rear cameras where available, and choose a microphone input.

## Stream URL limitations

You can paste a stream URL while creating a room or add/change it in the room player. Direct browser-playable MP4/WebM/OGG URLs, extensionless URLs served with a browser-compatible video content type, and compatible HLS manifests are attempted. Matroska/MKV streams are not natively supported by most browsers; use an MP4 (H.264/AAC) or compatible HLS stream instead. HLS cross-origin access must be allowed by the stream server. YouTube and other platform links are not extracted or proxied; use only their official embed/player integration if added. DRM, paywalls, login-gated streams, and other platform restrictions are not bypassed. A URL may still fail because of codec, CORS, or provider restrictions.

## Configuration and production notes

- Set a unique secret, `DJANGO_DEBUG=0`, explicit `DJANGO_ALLOWED_HOSTS`, HTTPS/WSS, PostgreSQL, and Redis for deployment. Configure trusted origins, static hosting, TLS termination, rate limiting, backups, and monitoring for the intended environment.
- WebRTC uses a public STUN server for basic NAT traversal. Reliable calls on restrictive networks require a configured TURN service; set appropriate `iceServers` in `frontend/src/App.jsx`. Mesh calling sends each participant's media directly to every other peer, so it is intended for small rooms, not large broadcasts.
- OAuth/Google authentication, audio-output device selection, public-room discovery, and configurable chat-retention policies are not implemented. Chat history currently retains the most recent 100 messages in the room response, while message rows persist in the database.
- Profile photos are sent to the user-provided XeonFileBox service. Removing a photo clears its URL from the app profile; the supplied file API does not document deleting the hosted file.
- This starter does not proxy remote video, guarantee third-party URL availability, or include moderation/reporting workflows.

## API outline

- `GET /` returns the public API service status; `GET /health/` is the deployment health check.
- `POST /api/auth/register/`, `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`, `PATCH/DELETE /api/auth/me/avatar/`
- `GET/POST /api/rooms/`; `GET/POST/PATCH/DELETE /api/rooms/<uuid>/`; `POST /api/rooms/<uuid>/leave/`
- `ws://127.0.0.1:8000/ws/rooms/<uuid>/?token=<auth-token>`
- `GET /health/`
