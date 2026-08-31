# Hosting architecture

The Vercel deployment uses one Python ASGI function: `main.py`.

`main.py` exposes the existing backend under both `/api/*` (production frontend calls) and `/` (frontend/static/local compatibility). Vercel routing is explicit in `vercel.json`, so there is no `api/index.py` function and no framework auto-detection dependency.

Vercel's deployed filesystem is read-only, so runtime-generated project files use `/tmp/ballooning_data`. This storage is temporary between serverless instances. For permanent project history, use persistent object/database storage later.
