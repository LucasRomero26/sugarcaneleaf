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

**Deploy mechanism**: Vercel Git integration auto-deploys on every push to
`main`. The `deploy.yml` workflow no longer runs `vercel deploy` from the CLI
(it collided with the project's Root Directory setting — see commit 7621c85).

### Initial setup (already done — for reference)

1. New Project → import the GitHub repo.
2. Root Directory: `frontend/`
3. Framework Preset: **Vite** (auto-detected from `vercel.json`)
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. `vercel.json` already sets the COOP/COEP headers required for LiteRT.js
   WASM threading (SharedArrayBuffer) on every route.
7. To re-deploy after config changes: just `git push origin main`. Vercel
   picks it up; no CLI needed.

### Environment variable

Set in Vercel → project → Settings → Environment Variables (Production):
```
VITE_API_URL=https://<backend>.onrender.com   # no trailing slash
```
The frontend reads this at build time, so changing it triggers a redeploy.

The model CDN origin can be overridden with `VITE_MODEL_CDN` (defaults to
the HuggingFace Hub URL — see section 5). Only set this if you migrate the
model off HF Hub.

## 3. GitHub Secrets (for the `deploy.yml` workflow)

In the repo → Settings → Secrets and variables → Actions, add:

| Secret | Value | Used by |
|---|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render dashboard → service → Settings → Deploy Hook URL | backend deploy |
| `BACKEND_URL` | `https://<backend>.onrender.com` (no trailing slash) | backend health-check job |

The following were used by the old `vercel deploy` CLI step and are now
**optional** (kept for `vercel pull` manual use, the workflow no longer needs
them):

| Secret | Value | Used by |
|---|---|---|
| `VERCEL_TOKEN` | Vercel personal token (vercel.com/account/tokens) | manual CLI only |
| `VERCEL_ORG_ID` | from `.vercel/project.json` after `vercel link` | manual CLI only |
| `VERCEL_PROJECT_ID` | same | manual CLI only |

The `deploy.yml` workflow triggers on every push to `main` after CI is green
(enforce branch protection so CI must pass before merge).

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

The `.tflite`/`.onnx` are **no longer** shipped inside the frontend bundle —
they would exceed Vercel's 50MB-per-file upload limit (and GitHub Releases
cannot serve them cross-origin due to missing `Access-Control-Allow-Origin`
headers). They are hosted on HuggingFace Hub, which serves LFS assets with
CORS open to all origins.

Repo: https://huggingface.co/sacwaves/sugarcaneleaf

To push a new model revision:

```bash
# 1. Re-export the artifacts locally
.venv/bin/python export_model.py    # regenerates models/Yolo26m-seg.{tflite,onnx}

# 2. Upload to HF Hub (requires write access to sacwaves/sugarcaneleaf)
.venv/bin/python -c "
from huggingface_hub import HfApi
import os
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
api = HfApi(token=os.environ['HF_TOKEN'])   # export HF_TOKEN=hf_xxx first
api.upload_file(path_or_fileobj='models/Yolo26m-seg.tflite',
                path_in_repo='Yolo26m-seg.tflite',
                repo_id='sacwaves/sugarcaneleaf', repo_type='model')
api.upload_file(path_or_fileobj='models/Yolo26m-seg.onnx',
                path_in_repo='Yolo26m-seg.onnx',
                repo_id='sacwaves/sugarcaneleaf', repo_type='model')
"
# 3. No frontend rebuild needed — the HF URL serves the latest revision on
#    /. Fetch cache is keyed by ETag (hf-cache by default).
```

To migrate to a different CDN (e.g. Cloudflare R2 custom domain), set the
`VITE_MODEL_CDN` env var in Vercel to the new origin (the path suffixes
`/Yolo26m-seg.tflite` and `Yolo26m-seg.onnx` are appended automatically).
