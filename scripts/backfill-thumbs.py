#!/usr/bin/env python3
"""Makes the 600px copy (t/<shop>/<id>.<ext>) of every stored photo the app shows: product photos and order-line photos.

Photos uploaded before 12 Nov 2026 have no small copy; until they get one, /img serves the full photo in its place.
Safe to run again: it rewrites the copies.

Usage, from app/:
  python3 scripts/backfill-thumbs.py            # local dev storage
  python3 scripts/backfill-thumbs.py --remote   # the live bucket
"""
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

WHERE = '--remote' if '--remote' in sys.argv else '--local'
BUCKET = 'shopi-media'
THUMB = 600
FORMATS = {'webp': ('WEBP', 'image/webp'), 'jpg': ('JPEG', 'image/jpeg'), 'png': ('PNG', 'image/png')}


def d1(sql):
    out = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'shopi', WHERE, '--json', '--command', sql],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)[0]['results']


def wrangler(*args):
    return subprocess.run(['npx', 'wrangler', 'r2', 'object', *args, WHERE], capture_output=True, text=True)


def thumb(key):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'src')
        if wrangler('get', f'{BUCKET}/{key}', '--file', src).returncode != 0 or not os.path.exists(src):
            return f'missing  {key}'
        ext = key.rsplit('.', 1)[1]
        fmt, ctype = FORMATS[ext]
        im = Image.open(src)
        im.load()
        if fmt == 'JPEG' and im.mode != 'RGB':
            im = im.convert('RGB')
        im.thumbnail((THUMB, THUMB))  # longest side 600, same as the browser upload; never enlarges
        dst = os.path.join(tmp, f'thumb.{ext}')
        im.save(dst, fmt, quality=80)
        ok = wrangler('put', f'{BUCKET}/t/{key[2:]}', '--file', dst, '--content-type', ctype).returncode == 0
        return f'{"ok      " if ok else "FAILED  "}{key} ({os.path.getsize(src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB)'


keys = set()
for row in d1('SELECT images FROM products'):
    keys.update(json.loads(row['images'] or '[]'))
for row in d1('SELECT DISTINCT image FROM order_items WHERE image IS NOT NULL'):
    keys.add(row['image'])
keys = sorted(k for k in keys if k and k.startswith('s/') and k.rsplit('.', 1)[-1] in FORMATS)
print(f'{len(keys)} photos ({WHERE[2:]})')
# The live bucket takes parallel writes; local dev storage is one file, so go one at a time there.
with ThreadPoolExecutor(max_workers=6 if WHERE == '--remote' else 1) as pool:
    for line in pool.map(thumb, keys):
        print(line)
