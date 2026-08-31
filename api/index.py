"""Vercel FastAPI entrypoint for DFAB Engineering Drawing Inspection.

Vercel sends requests under /api/* to this file. The existing backend keeps
its local-development routes without an /api prefix, so we include its router
under /api here. This avoids ASGI mount/path-prefix mismatches on Vercel while
preserving the backend endpoints unchanged for local development.
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

# FastAPI's router can be included with a prefix. This creates real routes such
# as /api/health, /api/upload-batch, /api/analyze-batch, etc. rather than
# mounting a second ASGI app and depending on root_path/path stripping.
app.include_router(backend_app.router, prefix="/api")


@app.get("/api")
def api_root():
    return {
        "ok": True,
        "service": "DFAB Engineering Drawing Inspection API",
        "health": "/api/health",
    }
