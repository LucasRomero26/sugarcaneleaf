# Deploy Guide — Sugarcane Leaf Disease Detection

Two services run in production:
- **Frontend** (React + Vite + ApexCharts) → Vercel
- **Backend** (FastAPI + Ultralytics) → Render free tier

The `.tflite`/`.onnx` models are served statically from the frontend bundle, so inference runs client-side via LiteRT.js / ort-web. The backend only collects latency reports and serves the optional server-side `/predict` fallback.

---

## Prerequisites

- GitHub repo pushed to `github.com/LucasRomero26/sugarcane` (or your fork)
- Vercel account (free)
- Render account (free tier)
- UptimeRobot account (keep-alive for Render free tier — avoids cold starts)

## 1. Backend — Render

### Option A: Blueprint (recommended)

1. Push `render.yaml` (already in repo root) to GitHub.
2. Go to [Render Dashboard → New → Blueprint](https://dashboard.render.com/web/blueprints).
3. Select the `sugarcane` repo. Render reads `render.yaml` and creates `sugarcane-backend` automatically.
4. The service exposes `/health` and `/metrics-summary`. Note the URL: `https://sugarcane-backend.onrender.com`.

### Option B: Manual

1. New → Web Service → connect the repo.
2. Runtime: **Python 3**, Plan: **Free**, Root: `backend/`.
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Health check path: `/health`

### Keep-alive (UptimeRobot)

Render free tier sleeps after 15 min idle. Add a UptimeRobot HTTP monitor hitting `https://<backend-url>/health` every 10 min.

## 2. Frontend — Vercel

### Option A: CLI (the `deploy.yml` workflow uses this)

```bash
cd frontend
npm i -g vercel
vercel link          # once, choose the project
vercel --prod
```

### Option B: Vercel Dashboard

1. New Project → import the repo.
2. Root Directory: `frontend/`
3. Framework Preset: **Vite**
4. Build Command: `npm run build` (from `vercel.json`)
5. Output Directory: `dist` (from `vercel.json`)
6. `vercel.json` already sets the COOP/COEP headers required for LiteRT.js WASM threading (SharedArrayBuffer).

### Environment variable

Set `VITE_API_URL` to the Render backend URL (no trailing slash), e.g.:
```
VITE_API_URL=https://sugarcane-backend.onrender.com
```
Rebuild after changing it.

## 3. GitHub Secrets (for the `deploy.yml` workflow)

In the repo → Settings → Secrets and variables → Actions, add:

| Secret | Value | Used by |
|---|---|---|
| `VERCEL_TOKEN` | Vercel personal token (vercel.com/account/tokens) | frontend deploy |
| `VERCEL_ORG_ID` | `vercel link` prints it, or dashboard → project → settings | frontend deploy |
| `VERCEL_PROJECT_ID` | same source as ORG_ID | frontend deploy |
| `RENDER_DEPLOY_HOOK_URL` | Render dashboard → service → Settings → Deploy Hook URL | backend deploy |
| `BACKEND_URL` | `https://<backend>.onrender.com` (no trailing slash) | backend health-check job |

The `deploy.yml` workflow triggers on every push to `main` after CI is green (enforce branch protection so CI must pass before merge).

## 4. Verifying deployment

```bash
# Backend
curl https://<backend-url>/health
# → {"status":"ok",...}

curl https://<backend-url>/metrics-summary
# → {"count":...,"p50_ms":...,...}

# Frontend
# Open the Vercel URL, try drag & drop of a leaf image, check the dashboard at #/dashboard
```

## 5. Updating models

The `.tflite`/`.onnx` are committed to `frontend/public/models/` (gitignored from the repo root but tracked inside `frontend/public/`). To re-export:

```bash
.venv/bin/python export_model.py    # regenerates models/Yolo26m-seg.{tflite,onnx}
cp models/Yolo26m-seg.tflite frontend/public/models/
cp models/Yolo26m-seg.onnx  frontend/public/models/
```
