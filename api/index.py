"""Single Vercel FastAPI entrypoint.

Vercel routes /api/* to api/index.py. The application routes must therefore
include the /api prefix. We reuse the tested backend router and add that prefix
once here, while local development can still run backend.app.core:app directly.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core import app as backend_app

app = FastAPI(
    title="DFAB Engineering Drawing Inspection API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Creates /api/health, /api/upload-batch, /api/analyze-batch, etc.
app.include_router(backend_app.router, prefix="/api")

@app.get("/api")
def api_root():
    return {
        "ok": True,
        "service": "DFAB Engineering Drawing Inspection API",
        "health": "/api/health",
    }
