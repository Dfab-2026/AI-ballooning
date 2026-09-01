# Gemini fallback API setup

The app defaults to `gemini-3.5-flash-lite`. It can rotate through up to three API keys and then an optional model fallback.

Local values go in `backend/.env`. Vercel values go in Project Settings -> Environment Variables.

Use keys from different Google AI projects if you want independent quotas. Two keys from the same project normally share the same project-level quota.

Variables:
- `GEMINI_API_KEY` primary key
- `GEMINI_API_KEY_FALLBACK` second-project fallback key
- `GEMINI_API_KEY_FALLBACK_2` optional third-project key
- `GEMINI_MODEL=gemini-3.5-flash-lite`
- `GEMINI_FALLBACK_MODELS=gemini-3.7-flash`
- `GEMINI_PARALLEL_WORKERS=1`

If a drawing fails in the batch, its drawing card shows a small **Analyze** button before the review button. It re-uploads only that source drawing/page and retries it, so it also works across Vercel serverless instances.
