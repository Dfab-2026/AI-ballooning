"""Vercel ASGI entrypoint.

Vercel routes /api/* to this function.  The existing backend application keeps
its local-development routes (/health, /upload-batch, ...), so it is mounted
under /api here for production without duplicating backend code.
"""
from fastapi import FastAPI
from backend.app.main import app as backend_app

app = FastAPI(title="DFAB Engineering Drawing Inspection")
app.mount("/api", backend_app)
