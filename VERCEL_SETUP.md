# Vercel deployment — canonical setup

This repository uses one canonical FastAPI entrypoint: **`main.py`**.
There is deliberately **no `vercel.json`**, avoiding rewrite/includeFiles schema conflicts.
`api/index.py` remains only as a compatibility adapter and imports the same app.

## Vercel project settings
- Framework Preset: **FastAPI**
- Root Directory: `./`
- Build Command: leave default / no override
- Output Directory: leave default / no override
- Install Command: leave default / no override
- Development Command: leave default / no override
- Python: `.python-version` -> 3.12

## Environment variables
Required:
- `GEMINI_API_KEY`

Recommended:
- `GEMINI_MODEL=gemini-2.5-flash`
- `GEMINI_PARALLEL_WORKERS=3`
- `GEMINI_ANALYSIS_MAX_DIM=1600`
- `ANALYSIS_TRANSIENT_RETRIES=2`

Apply them to Production and Preview, then redeploy.

## Routes
- UI: `/`
- Health: `/api/health`
- Upload: `/api/upload-batch`
- Analysis: `/api/analyze-batch`
- Other backend endpoints: `/api/...`

The root app also preserves non-prefixed backend routes for local compatibility.

## Storage
All generated runtime files use `/tmp/ballooning_data` on Vercel. The deployed
bundle under `/var/task` is read-only. `/tmp` is ephemeral; persistent project
history requires external storage later.

## Local run
From repository root:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`.

## Verification
Run:

```powershell
python scripts/verify_vercel_layout.py
```

Expected: `Vercel layout verification: PASS`.
