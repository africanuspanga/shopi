"""
Reads the translation sheet the team filled in and writes src/locales/sw.json.

    python3 scripts/i18n/import.py path/to/Shopi-translations.xlsx

Rows with an empty Swahili cell are skipped (the app shows English there). Rows not marked Done are
imported too, and counted, so you know how much is still the unchecked draft.
Swahili for strings the sheet doesn't list is kept: the export only finds t('…') written in the code, so text kept in
data (the plan cards' lists) and server messages (notifications) never reach the sheet (18 Nov 2026).
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
    sw_path = APP / 'src/locales/sw.json'
    # Start from what the app has, so strings the sheet doesn't list keep their Swahili; the sheet's rows win.
    out = json.loads(sw_path.read_text())
    kept = len(out)
    bad, unchecked, done, imported = [], 0, set(), 0
    for row in rows:
        en, sw = (row[2] or '').strip(), (row[3] or '').strip()
        if not en or not sw:
            continue
        if (row[6] or '').strip() == 'Done':
            done.add(en)
        else:
            unchecked += 1
        if sorted(re.findall(r'\{\w+\}', en)) != sorted(re.findall(r'\{\w+\}', sw)):
            bad.append((row[0], en, sw))
            continue
        out[en] = sw
        imported += 1
    sw_path.write_text(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True) + '\n')
    # Rows the team marked Done are no longer waiting for a check.
    unchecked_path = APP / 'scripts/i18n/sw-unchecked.json'
    unchecked = set(json.loads(unchecked_path.read_text())) - done
    unchecked_path.write_text(json.dumps(sorted(unchecked), ensure_ascii=False, indent=2) + '\n')
    print(f'{imported} rows imported from the sheet; src/locales/sw.json now holds {len(out)} (it held {kept})')
    if unchecked:
        print(f'  {len(unchecked)} strings are still not marked Done (still the draft, or a question). Check them before switching Swahili on.')
    for n, en, sw in bad:
        print(f'  row {n}: placeholders differ, skipped.\n    EN: {en}\n    SW: {sw}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
