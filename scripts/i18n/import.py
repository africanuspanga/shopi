"""
Reads the translation sheet the team filled in and writes src/locales/sw.json.

    python3 scripts/i18n/import.py path/to/Shopi-translations.xlsx

Rows with an empty Swahili cell are skipped (the app shows English there).
Rows whose {placeholders} do not match the English are reported and skipped.
After importing, set SWAHILI_ENABLED = true in src/lib/i18n.tsx.
"""
import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

APP = Path(__file__).resolve().parents[2]


def main(path):
    ws = load_workbook(path, read_only=True)['Translations']
    rows = ws.iter_rows(min_row=2, values_only=True)
    out, bad = {}, []
    for row in rows:
        en, sw = (row[2] or '').strip(), (row[3] or '').strip()
        if not en or not sw:
            continue
        if sorted(re.findall(r'\{\w+\}', en)) != sorted(re.findall(r'\{\w+\}', sw)):
            bad.append((row[0], en, sw))
            continue
        out[en] = sw
    (APP / 'src/locales/sw.json').write_text(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True) + '\n')
    print(f'{len(out)} translations written to src/locales/sw.json')
    for n, en, sw in bad:
        print(f'  row {n}: placeholders differ, skipped.\n    EN: {en}\n    SW: {sw}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
