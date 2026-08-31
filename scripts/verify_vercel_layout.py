from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

required = [
    ROOT / 'index.html',
    ROOT / 'assets' / 'js' / 'app.js',
    ROOT / 'api' / 'index.py',
    ROOT / 'backend' / 'app' / 'core.py',
    ROOT / 'requirements.txt',
    ROOT / 'vercel.json',
]
for path in required:
    if not path.exists():
        errors.append(f'Missing: {path.relative_to(ROOT)}')

if (ROOT / 'backend' / 'app' / 'main.py').exists():
    errors.append('backend/app/main.py should not exist; it can be auto-detected as a second FastAPI entrypoint.')

try:
    config = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
    if 'functions' in config:
        errors.append('vercel.json must not contain functions/includeFiles configuration.')
    if config.get('framework', 'missing') is not None:
        errors.append('vercel.json framework must be null so static frontend + /api functions are used.')
except Exception as exc:
    errors.append(f'Invalid vercel.json: {exc}')

api_text = (ROOT / 'api' / 'index.py').read_text(encoding='utf-8') if (ROOT / 'api' / 'index.py').exists() else ''
if 'include_router(backend_app.router, prefix="/api")' not in api_text:
    errors.append('api/index.py must include the backend router with prefix /api.')
if 'mount("/api"' in api_text or "mount('/api'" in api_text:
    errors.append('api/index.py must not ASGI-mount the backend under /api.')

js = (ROOT / 'assets' / 'js' / 'app.js').read_text(encoding='utf-8') if (ROOT / 'assets' / 'js' / 'app.js').exists() else ''
if "':'/api'" not in js:
    errors.append('Production frontend API base is not /api.')

core = (ROOT / 'backend' / 'app' / 'core.py').read_text(encoding='utf-8') if (ROOT / 'backend' / 'app' / 'core.py').exists() else ''
if "tempfile.gettempdir(), 'ballooning_data'" not in core:
    errors.append('Vercel runtime storage is not configured under /tmp.')

if errors:
    print('Vercel layout verification: FAIL')
    for e in errors:
        print(' -', e)
    sys.exit(1)

print('Vercel layout verification: PASS')
print('Frontend: / -> index.html')
print('API: /api/* -> api/index.py')
print('Runtime writes: /tmp/ballooning_data on Vercel')
