"""Canonical FastAPI entrypoint for local development and Vercel.

The backend application is exposed twice:
- `/api/*` for the browser/production API.
- `/*` as a compatibility/local route so older local frontend calls continue to work.

This keeps one Python entrypoint (`main.py`) for local development and Vercel's Framework Preset: Other.
"""
from fastapi import FastAPI
from backend.app.main import app as backend_app

app = FastAPI(title="DFAB Engineering Drawing Inspection")

# Put /api first so requests such as /api/health are prefix-stripped and then
# handled by the backend's existing /health, /upload-batch, ... routes.
app.mount("/api", backend_app)

# Compatibility + frontend hosting. backend_app serves `/`, `/assets/*`, and the
# original non-prefixed API routes for local development.
app.mount("/", backend_app)
