from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
required = [
    root / 'main.py',
    root / 'vercel.json',
    root / 'requirements.txt',
    root / '.python-version',
    root / 'frontend' / 'index.html',
    root / 'frontend' / 'assets' / 'js' / 'app.js',
    root / 'backend' / 'app' / 'main.py',
    root / 'backend' / 'templates' / 'final_inspection_template.xlsx',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
if missing:
    raise SystemExit('Missing required files: ' + ', '.join(missing))
if (root / 'api').exists():
    raise SystemExit('Unexpected api/ directory: this package uses only root main.py')
config = json.loads((root / 'vercel.json').read_text(encoding='utf-8'))
builds = config.get('builds') or []
if builds != [{'src': 'main.py', 'use': '@vercel/python'}]:
    raise SystemExit('Unexpected Vercel builds configuration')
routes = config.get('routes') or []
if not routes or routes[0].get('dest') != 'main.py':
    raise SystemExit('All Vercel routes must target main.py')
js = (root / 'frontend' / 'assets' / 'js' / 'app.js').read_text(encoding='utf-8')
if "'/api'" not in js:
    raise SystemExit('Production frontend API base is not /api')
print('Vercel single-entry layout verification: PASS')
print('Framework preset required: Other')
print('Entrypoint: main.py')
