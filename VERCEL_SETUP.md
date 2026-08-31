# Vercel deployment — canonical setup

This repository intentionally uses **zero `vercel.json` configuration**.
Current Vercel Python/FastAPI routing auto-detects `api/index.py` as the ASGI function.
The static UI is served from repository-root `index.html` + `assets/`.

## Vercel project settings
- Framework / preset: Other or FastAPI (auto-detection is fine)
- Root Directory: `./` (repository root)
- Build Command: leave empty/default
- Output Directory: leave empty/default
- Install Command: leave empty/default
- Environment variable required: `GEMINI_API_KEY`
- Optional: `GEMINI_MODEL` and `GEMINI_FALLBACK_MODELS`

## Routes
- UI: `/`
- API health: `/api/health`
- All other backend endpoints: `/api/...`

## Storage
Vercel runtime writes only to `/tmp/ballooning_data`. Never write generated files under `/var/task`.
`/tmp` is ephemeral; persistent project history requires external object/database storage.

## Before deploying
1. Ensure `vercel.json` does **not** exist.
2. Ensure `api/index.py` exists.
3. Ensure root `index.html`, `assets/`, `requirements.txt`, and `.python-version` exist.
4. Push the latest commit to GitHub, then deploy that commit.
