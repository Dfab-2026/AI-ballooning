from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.main import app as backend_app


app = FastAPI(
    title="DFAB Engineering Drawing Inspection",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Vercel sends the complete /api/... path to this function.
# Your existing backend routes are /health, /upload-batch, etc.,
# so mounting the existing backend at /api gives:
#
# /api/health
# /api/upload-batch
# /api/analyze-batch
# etc.
app.mount("/api", backend_app)


@app.get("/api")
def api_root():
    return {
        "ok": True,
        "service": "DFAB Engineering Drawing Inspection API",
    }