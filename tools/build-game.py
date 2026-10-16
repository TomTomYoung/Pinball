#!/usr/bin/env python3
"""Package local media into the directly-openable index.html. No server required."""
import base64
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'assets/manifest.json').read_text())
mimes={'png':'image/png','svg':'image/svg+xml','wav':'audio/wav','ogg':'audio/ogg'}
pack={}
for asset in manifest['assets']:
    data=(ROOT/'assets'/asset['path']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=asset['sha256']:
        raise SystemExit('Stale asset manifest: '+asset['path'])
    pack[asset['id']]={**asset,'url':'data:'+mimes[asset['format']]+';base64,'+base64.b64encode(data).decode()}
template=(ROOT/'src/index.template.html').read_text()
runtime=(ROOT/'src/media.js').read_text()
assert template.count('__PINBALL_ASSET_PACK__')==1
assert template.count('/* PINBALL_MEDIA_RUNTIME */')==1
html=template.replace('__PINBALL_ASSET_PACK__',json.dumps(pack,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
html=html.replace('/* PINBALL_MEDIA_RUNTIME */',runtime)
(ROOT/'index.html').write_text(html)
print(f'Built index.html: {len(pack)} embedded media files, {len(html.encode()):,} bytes.')
