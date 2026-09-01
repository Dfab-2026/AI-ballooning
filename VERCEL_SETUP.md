# Vercel setup

Import the GitHub repository as a new Vercel project.

- Framework Preset: **Other**
- Root Directory: `./`
- Build / Output / Install / Development command overrides: OFF

Add Production environment variables (use your own key; never commit `.env`):

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_PARALLEL_WORKERS=2
GEMINI_ANALYSIS_MAX_DIM=1200
ANALYSIS_TRANSIENT_RETRIES=1
GEMINI_MIN_CONFIDENCE=0.68
```

After deploy test `/api/health`, then upload the full drawing set. The production UI and localhost use the same `frontend/` files.
