# DFAB Engineering Drawing Ballooning

Production-clean build. Localhost and Vercel serve the **same frontend files** and the same FastAPI application.

## Run locally

```powershell
cd "D:\DFAB PROJECT\ballooning"
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`.

Create `backend/.env` locally if required. Never commit the real key.

## Production architecture

- `main.py` — single ASGI entrypoint
- `frontend/` — only frontend copy
- `backend/app/` — API/services
- `backend/templates/final_inspection_template.xlsx` — only Excel template
- `/api/*` — production browser API
- Vercel Framework Preset: **Other**
- Vercel Root Directory: `./`

The old duplicate root `index.html`, root `assets/`, `api/`, local runtime data, `.git`, pycache files, old update notes, and local `.env` are intentionally removed.

## Multi-drawing production fix

The browser uses one `/api/upload-analyze-batch` request for the complete drawing set. This keeps upload, PDF rendering and AI analysis together in one Vercel invocation instead of splitting six drawings across separate serverless `/tmp` instances. Each drawing still succeeds/fails independently.

## Browser cache fix

HTML/JS/CSS are served with `no-store`, and JS/CSS filenames are versioned in `frontend/index.html`. A new Vercel deployment therefore loads the current balloon UI instead of an older cached arrow style.

## Production environment example

```env
GEMINI_API_KEY=YOUR_KEY
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_PARALLEL_WORKERS=2
GEMINI_ANALYSIS_MAX_DIM=1200
ANALYSIS_TRANSIENT_RETRIES=1
GEMINI_MIN_CONFIDENCE=0.68
```

After deployment verify `/api/health`, then test the full drawing set, Excel preview/download, individual PDFs and bulk ZIP exports.
