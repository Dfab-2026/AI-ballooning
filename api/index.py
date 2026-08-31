"""Vercel ASGI entrypoint for the DFAB ballooning API.

/api/* is mounted to the existing backend. The project root also contains
index.html/assets for Vercel static hosting, so no vercel.json is required.
"""
from fastapi import FastAPI
from backend.app.main import app as backend_app

app = FastAPI(title="DFAB Engineering Drawing Inspection")
app.mount("/api", backend_app)
