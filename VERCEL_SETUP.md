# Vercel deployment settings — use Framework Preset: Other

This package intentionally uses **Framework Preset = Other**, not FastAPI and not FastHTML.

## Required project settings

- Framework Preset: `Other`
- Root Directory: `./`
- Build Command: leave Override OFF / default
- Output Directory: leave Override OFF / default
- Install Command: leave Override OFF / default
- Development Command: leave Override OFF / default

Do not select the FastAPI or FastHTML preset. Do not configure a manual Python entrypoint in the Vercel dashboard.
The repository-level `vercel.json` routes every request to the single root `main.py` ASGI application.

## Environment variables

Add these under Project Settings -> Environment Variables (Production and Preview):

- `GEMINI_API_KEY` = your API key
- `GEMINI_MODEL` = `gemini-2.5-flash`
- `GEMINI_PARALLEL_WORKERS` = `3`
- `GEMINI_ANALYSIS_MAX_DIM` = `1600`
- `ANALYSIS_TRANSIENT_RETRIES` = `2`

Never commit `backend/.env` to GitHub.

## Expected production routes

- `/` -> frontend
- `/assets/...` -> frontend static assets
- `/api/health` -> backend health JSON
- `/api/upload-batch` -> upload endpoint
- `/api/analyze-batch` -> batch analysis endpoint

## Local run

From the repository root:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`.
