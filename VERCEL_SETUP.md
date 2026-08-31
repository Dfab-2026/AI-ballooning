# DFAB Ballooning — Vercel deployment

This package is intentionally structured as a static frontend plus one FastAPI function.

- `/` is the root `index.html` frontend.
- `/assets/*` are static frontend assets.
- `/api/*` is handled by `api/index.py`.
- `api/index.py` includes the existing backend router with the `/api` prefix.
- Runtime-generated files use `/tmp/ballooning_data` on Vercel.
- `vercel.json` sets `framework: null`, so a FastAPI preset selected in the Vercel dashboard cannot take over `/`.

## Vercel settings

Use the repository root as the Root Directory: `./`

Do not set a custom Build Command, Output Directory, or Install Command.

Add this Environment Variable:

`GEMINI_API_KEY=<your rotated valid key>`

## After deployment

Test in this order:

1. `https://YOUR-DOMAIN.vercel.app/` — must show the DFAB UI.
2. `https://YOUR-DOMAIN.vercel.app/api` — must return API JSON.
3. `https://YOUR-DOMAIN.vercel.app/api/health` — must return the backend health JSON.

Do not add `functions.includeFiles` to `vercel.json`.
