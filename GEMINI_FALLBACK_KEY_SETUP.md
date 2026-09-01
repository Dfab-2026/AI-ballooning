# Gemini API key fallback

The backend tries API keys in this order:

1. `GEMINI_API_KEY`
2. `GEMINI_API_KEY_FALLBACK`
3. `GEMINI_API_KEY_FALLBACK_2` (optional)

If the primary key/model call fails (including quota/429), the analyzer moves to the next configured key.

## Important quota note
A second API key from the same Google/Gemini project normally shares the same project quota. For a useful quota fallback, create the fallback key in a different Gemini/Google AI project with its own quota.

## Vercel
Add the variables in Project -> Settings -> Environment Variables for Production, then redeploy.
Never commit real API keys to GitHub.
