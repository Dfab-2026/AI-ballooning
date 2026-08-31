from pathlib import Path
import os
import sys

root = Path(__file__).resolve().parents[1]
required = [
    root / 'main.py',
    root / 'api' / 'index.py',
    root / 'frontend' / 'index.html',
    root / 'frontend' / 'assets' / 'js' / 'app.js',
    root / 'requirements.txt',
    root / '.python-version',
    root / 'backend' / 'templates' / 'final_inspection_template.xlsx',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
if missing:
    raise SystemExit('Missing required deployment files: ' + ', '.join(missing))
if (root / 'vercel.json').exists():
    raise SystemExit('Remove vercel.json: this project intentionally uses Vercel FastAPI auto-detection.')

for rel in ('assets/js/app.js', 'frontend/assets/js/app.js'):
    js = (root / rel).read_text(encoding='utf-8')
    if "'/api'" not in js:
        raise SystemExit(f'Production frontend API base is not /api in {rel}')

os.environ['VERCEL'] = '1'
sys.path.insert(0, str(root))
from backend.app import main as backend_main
if not backend_main.DATA.startswith('/tmp/'):
    raise SystemExit(f'VERCEL runtime data is not under /tmp: {backend_main.DATA}')
if not Path(backend_main._inspection_template_path()).exists():
    raise SystemExit('Bundled inspection template cannot be resolved')

from main import app
if app is None:
    raise SystemExit('main.py did not expose app')
from api.index import app as api_app
if api_app is not app:
    raise SystemExit('api/index.py does not expose the canonical app')

print('Vercel layout verification: PASS')
print('Canonical entrypoint: main.py')
print('Runtime data:', backend_main.DATA)
print('Template:', backend_main._inspection_template_path())
