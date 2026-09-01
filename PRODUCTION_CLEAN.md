# Production-clean architecture

This package intentionally has one frontend and one Python entrypoint.

- `main.py` — Vercel/local ASGI entrypoint
- `frontend/` — the ONLY HTML/CSS/JS source
- `backend/app/` — API and services
- `backend/templates/final_inspection_template.xlsx` — the ONLY Excel template
- `vercel.json` — Vercel Framework Preset: **Other**, Root Directory: `./`

Removed on purpose: duplicate root `index.html`/`assets`, `api/`, `.git`, local `.env`, historical `backend/data`, pycache files and old update-note files.

## Why multi-drawing production analysis changed
Vercel `/tmp` belongs to one function instance. The previous browser flow uploaded the files and then made one `/analyze-ai/...` request per drawing. Six requests could be routed to different instances, so production could analyse only the drawing that happened to share the upload instance.

The frontend now calls `/api/upload-analyze-batch` once. Upload, PDF page rendering and all drawing analyses run in the same invocation. Every returned drawing is handled independently, so one AI failure does not discard successful drawings.

## Cache consistency
The frontend JS/CSS URLs are versioned and the backend returns `no-store` headers for HTML/JS/CSS, preventing an older balloon-rendering build from remaining in the production browser cache.
