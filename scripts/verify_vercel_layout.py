from pathlib import Path
import os
import sys

root = Path(__file__).resolve().parents[1]
required = [
    root / 'api' / 'index.py',
    root / 'index.html',
    root / 'assets' / 'js' / 'app.js',
    root / 'requirements.txt',
    root / '.python-version',
    root / 'api' / 'assets' / 'final_inspection_template.xlsx',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
if missing:
    raise SystemExit('Missing required deployment files: ' + ', '.join(missing))
if (root / 'vercel.json').exists():
    raise SystemExit('Remove vercel.json: this project intentionally uses Vercel zero-config routing.')
js = (root / 'assets' / 'js' / 'app.js').read_text(encoding='utf-8')
if "'/api'" not in js:
    raise SystemExit('Production frontend API base is not /api')
os.environ['VERCEL'] = '1'
sys.path.insert(0, str(root))
from backend.app import main as backend_main
if not backend_main.DATA.startswith('/tmp/'):
    raise SystemExit(f'VERCEL runtime data is not under /tmp: {backend_main.DATA}')
if not Path(backend_main._inspection_template_path()).exists():
    raise SystemExit('Bundled inspection template cannot be resolved')
from api.index import app
if app is None:
    raise SystemExit('api/index.py did not expose app')
print('Vercel layout verification: PASS')
print('Runtime data:', backend_main.DATA)
print('Template:', backend_main._inspection_template_path())
