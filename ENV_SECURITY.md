# API key storage

Real provider API keys belong only in `backend/.env` for localhost or in Vercel Environment Variables for production.

The Python/JavaScript source reads environment-variable names only. No API key value is embedded in application code.
`backend/.env` is ignored by Git. Do not force-add it to Git.
