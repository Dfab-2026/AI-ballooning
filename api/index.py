"""Compatibility Vercel ASGI entrypoint.

The canonical application lives at repository-root `main.py`. Keeping this small
adapter means older Vercel projects that still discover `api/index.py` expose the
same application and routing behavior.
"""
from main import app

__all__ = ["app"]
