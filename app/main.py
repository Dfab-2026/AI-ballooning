"""Canonical Vercel entrypoint.

Keeping this file as a tiny wrapper prevents a second, stale copy of the backend from
being deployed when Vercel auto-detects app/main.py at the repository root.
"""
from backend.app.main import app

__all__ = ["app"]
