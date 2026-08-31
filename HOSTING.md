# Run locally

1. Copy `backend/.env.example` to `backend/.env` and add your key/model.
2. From the project root run `npm install` once (optional; there are no npm dependencies).
3. Run `npm run dev`.
4. Open http://127.0.0.1:8000. The Python backend serves the frontend too.

You can also double-click `start-all.bat`.

# Vercel

This repository intentionally has **no vercel.json**. Vercel detects `api/index.py` as the Python ASGI entrypoint and serves the root `index.html`/`assets` as static files.

Use project Root Directory `./` and leave Build/Output/Install commands at their defaults. Add these Environment Variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_PARALLEL_WORKERS=3`
- `GEMINI_ANALYSIS_MAX_DIM=1600`
- `ANALYSIS_TRANSIENT_RETRIES=2`

Do not upload a `.env` file to Vercel.

## Analysis behaviour

Each drawing is analysed independently and the UI updates as each one finishes. A failed drawing does not stop the other drawings. Cached results are reused. The old four-drawing truncation has been removed.

Vercel `/tmp` storage is temporary. For guaranteed long-lived project history across cold starts, connect persistent object/database storage; the current app is optimized for upload -> analyse -> review/export in the active session.
