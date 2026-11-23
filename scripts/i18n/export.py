"""
Builds the translation sheet from the code: every t('...') and msg('...') string, the screen it is on,
notes about {placeholders}, and Swahili for the team to check: what is already approved (src/locales/sw.json,
status Done, unless it is listed in scripts/i18n/sw-unchecked.json), or else the draft (scripts/i18n/sw-draft.json,
status Check) for the team to correct in place.

    python3 scripts/i18n/export.py      ->  ../design/translations/Shopi-translations.xlsx

Run it again whenever English text changes. Swahili already in src/locales/sw.json is kept in the sheet.
"""
import json
import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

APP = Path(__file__).resolve().parents[2]
OUT = APP.parent / 'design' / 'translations' / 'Shopi-translations.xlsx'

SCREENS = [
    ('routes/index.tsx', 'Landing page'),
    ('routes/signup.tsx', 'Sign up'),
    ('routes/login.tsx', 'Log in'),
    ('routes/onboard.tsx', 'Open your shop (setup)'),
    ('routes/app/index.tsx', 'Seller dashboard: home'),
    ('routes/app/route.tsx', 'Seller dashboard: menu'),
    ('routes/app/analytics.tsx', 'Seller dashboard: analytics'),
    ('routes/app/plan.tsx', 'Seller dashboard: your plan'),
    ('routes/app/bags/', 'Seller dashboard: bag links'),
    ('components/bag-links.tsx', 'Seller dashboard: bag links'),
    ('routes/app/discounts.tsx', 'Seller dashboard: discount codes'),
    ('routes/app/collections/', 'Seller dashboard: collections'),
    ('components/collections.tsx', 'Seller dashboard: collections'),
    ('routes/app/orders/$id.tsx', 'Seller dashboard: one order'),
    ('routes/app/orders/', 'Seller dashboard: orders'),
    ('routes/app/domain.tsx', 'Seller dashboard: your own domain'),
    ('routes/app/look.tsx', 'Seller dashboard: shop look'),
    ('components/look.tsx', 'Seller dashboard: shop look'),
    ('lib/theme.ts', 'Seller dashboard: shop look'),
    ('routes/app/products/import.tsx', 'Seller dashboard: import products'),
    ('components/import.tsx', 'Seller dashboard: import products'),
    ('lib/import.ts', 'Seller dashboard: import products'),
    ('lib/sheet.ts', 'Seller dashboard: import products'),
    ('routes/app/products/', 'Seller dashboard: products'),
    ('components/product-form.tsx', 'Seller dashboard: add or edit product'),
    ('components/stock-alerts.tsx', 'Buyer: back-in-stock alert, and the seller’s waiting list'),
    ('routes/app/shop.tsx', 'Seller dashboard: shop settings'),
    ('routes/app/invoices/', 'Seller dashboard: invoices'),
    ('components/invoice', 'Seller dashboard: invoices'),
    ('routes/app/clients.tsx', 'Seller dashboard: clients'),
    ('components/setup-invoices.tsx', 'Open your shop (setup)'),
    ('lib/invoice', 'Invoices: the document and WhatsApp messages'),
    ('lib/api/invoice', 'Invoices: notifications to the seller'),
    ('routes/i/', 'Client: invoice page'),
    ('routes/app/', 'Seller dashboard'),
    ('routes/$shop/c.$slug.tsx', 'Buyer: collection page'),
    ('routes/$shop/checkout.tsx', 'Buyer: checkout'),
    ('components/checkout.tsx', 'Buyer: checkout'),
    ('components/whatsapp.tsx', 'Buyer: when WhatsApp doesn’t open'),
    ('routes/$shop/b.$code.tsx', 'Buyer: bag link from the seller'),
    ('routes/$shop/', 'Buyer: shop page'),
    ('routes/o/', 'Buyer: order tracking page'),
    ('lib/discounts.ts', 'Buyer: checkout'),
    ('lib/format.ts', 'Shared labels (categories, order status, time)'),
    ('components/', 'Shared components'),
    ('routes/terms.tsx', 'Terms (legal)'),
    ('routes/privacy.tsx', 'Privacy (legal)'),
    ('routes/data-deletion.tsx', 'Delete your data (legal)'),
]
LEGAL = ('Terms (legal)', 'Privacy (legal)', 'Delete your data (legal)')
PLACEHOLDER_NOTES = {
    'n': 'a number', 'name': "a person's first name", 'shop': 'the shop name', 'code': 'the order code, like D6XS76',
    'product': 'a product name', 'price': 'a price, like TSh 60,000', 'url': 'a web link',
    'date': 'a date, like Fri 20 Nov', 'total': 'an amount, like TSh 60,000', 'items': 'a count, like 3 items',
    'who': "a buyer's name or phone number", 'when': 'a time, like 2h ago',
    'what': 'a product, maybe with its option, like Gauni (Size XL)', 'phone': 'a phone number, like 0754 123 456',
    'option': 'an option in words, like Size M or Colour Red', 'value': 'an option, like M or Red',
    'off': 'a discount, like 10% off', 'min': 'an amount, like TSh 50,000', 'amount': 'an amount, like TSh 5,000',
}

LIT = r"'((?:[^'\\\n]|\\.)*)'"
PATTERNS = [
    re.compile(r"\bt\(\s*" + LIT),                                   # t('Text'
    re.compile(r"\bmsg\(\s*" + LIT),                                  # msg('Text')
    re.compile(r"\bt\([^'()]*\?\s*" + LIT + r"\s*:\s*" + LIT),        # t(n === 1 ? 'one' : 'many'
    # The same t() under another name: tt (a t kept in a ref), tr (server notifications), tRef.current.
    re.compile(r"\b(?:tt|tr)\(\s*" + LIT),
    re.compile(r"\btRef\.current\(\s*" + LIT),
]


def screen_for(rel):
    for prefix, name in SCREENS:
        if rel.startswith(prefix):
            return name
    return 'Other'


def collect():
    found = {}
    for path in sorted((APP / 'src').rglob('*.ts*')):
        rel = str(path.relative_to(APP / 'src'))
        if rel.startswith('locales/') or rel.endswith('routeTree.gen.ts'):
            continue
        text = path.read_text()
        for pat in PATTERNS:
            for m in pat.finditer(text):
                line = text.count('\n', 0, m.start()) + 1
                for s in m.groups():
                    s = s.replace("\\'", "'")
                    entry = found.setdefault(s, {'screens': [], 'files': []})
                    sc = screen_for(rel)
                    if sc not in entry['screens']:
                        entry['screens'].append(sc)
                    entry['files'].append(f'{rel}:{line}')
    return found


# English words the Swahili keeps, as the founder chose: (what the English says, the word and what it never becomes).
KEEP_ENGLISH = [
    (r'\bbook', 'booking and ku-book (never miadi)'),
    (r'\binvoic', 'invoice (never ankara)'),
    (r'\bquot', 'quotation (never nukuu or makadirio ya bei)'),
    (r'\bsettings\b', 'settings (never mipangilio)'),
    (r'\bcodes?\b', 'code (never kodi, which is tax)'),
    (r'\bcop(y|ied)\b', 'copy (never nakili)'),
    (r'\bshar(e|ed|es|ing)\b', 'share and ku-share (never tuma or shiriki)'),
    (r'\bpasswords?\b', 'password (never nenosiri)'),
    (r'\bnotifications?\b', 'notification(s) (never arifa)'),
    (r'\bedit', 'edit and ku-edit (never hariri)'),
    (r'\blocations?\b|\bmap pin\b', 'location (never mahali for the pin)'),
    (r'\briders?\b', 'rider (never mpeleka bidhaa)'),
    (r'\bpast(e|ed|es|ing)\b', 'paste and ku-paste (never bandika)'),
    (r'\bcollections?\b', 'collection (never kundi or makundi)'),
    (r'\bstock\b', 'stock'),
    (r'\bcash\b', 'cash (never taslimu)'),
    (r'\bonline\b', 'online (never mtandaoni)'),
    (r'\bdrafts?\b', 'draft (never rasimu)'),
    (r'\btag', 'tag (never lebo)'),
    (r'\bimport', 'import and ku-import (never ingiza)'),
    (r'\btemplate', 'template'),
    (r'\bwebsites?\b|\bweb\b', 'website (never tovuti)'),
    (r'\bdashboard', 'dashboard'),
    (r'\bprofiles?\b', 'profile (never wasifu)'),
    (r'\be-?mails?\b', 'email (never barua pepe)'),
    (r'\blogos?\b', 'logo (never nembo)'),
    (r'\bcheckout\b', 'checkout'),
    (r'\bdelivery\b', 'delivery (never kufikisha bidhaa)'),
    (r'\bmobile money\b', 'mobile money (never pesa kwa simu)'),
    (r'\blog ?(in|out)\b|\blog-in\b|\blogged (in|out)\b|\blogins?\b', 'log in, log out and login (never ingia or toka)'),
    (r'\btap|\bclick|\bpress\b', 'bofya for tap (never gusa or bonyeza)'),
]


def notes_for(en, screens):
    keys = re.findall(r'\{(\w+)\}', en)
    parts = [f'Keep {{{k}}} as it is ({PLACEHOLDER_NOTES.get(k, "filled in by the app")}).' for k in dict.fromkeys(keys)]
    if any(s in LEGAL for s in screens):
        parts.append('Legal text: the lawyer checks the English first; match its meaning exactly.')
    if 'Shopi' in en:
        parts.append('Keep Shopi, WhatsApp, Instagram, TikTok and Lipa Namba in English.')
    # The founder's words (17, 20 and 23 Nov 2026), said on the row because the team changed some of them back.
    keep = [word for pattern, word in KEEP_ENGLISH if re.search(pattern, en, re.I)]
    if keep:
        parts.append(f'Keep {", ".join(keep)} in English (the founder’s choice). Check only the grammar around them.')
    return ' '.join(parts)


def main():
    found = collect()
    drafts = json.loads((APP / 'scripts/i18n/sw-draft.json').read_text())
    done = json.loads((APP / 'src/locales/sw.json').read_text())
    # Swahili Claude added after the team's last pass: live in the app, still to be checked.
    unchecked = set(json.loads((APP / 'scripts/i18n/sw-unchecked.json').read_text()))
    order = [name for _, name in SCREENS] + ['Other']
    rows = sorted(found.items(), key=lambda kv: (order.index(kv[1]['screens'][0]), kv[1]['files'][0]))

    wb = Workbook()
    ws = wb.active
    ws.title = 'Translations'
    head = ['#', 'Screen', 'English (do not edit)', 'Swahili (check and correct)', 'First draft (reference only)', 'Notes', 'Status', 'Where in the code']
    ws.append(head)
    for i, (en, info) in enumerate(rows, 1):
        sw = done.get(en) or drafts.get(en, '')
        status = 'Check' if en in unchecked and sw else 'Done' if done.get(en) else 'Check' if sw else 'To do'
        ws.append([i, ' / '.join(info['screens']), en, sw, drafts.get(en, ''), notes_for(en, info['screens']), status, ', '.join(info['files'][:3])])

    bold = Font(bold=True, color='FFFFFF')
    for c in ws[1]:
        c.font = bold
        c.fill = PatternFill('solid', fgColor='0A0A0A')
        c.alignment = Alignment(vertical='center')
    fill_in = PatternFill('solid', fgColor='FFF4EC')
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical='top')
        row[3].fill = fill_in
        row[4].font = Font(color='8C8A86')
        row[7].font = Font(color='8C8A86', size=9)
    for col, w in zip('ABCDEFGH', [5, 26, 48, 48, 40, 34, 9, 30]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = ws.dimensions
    dv = DataValidation(type='list', formula1='"To do,Check,Done,Question"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f'G2:G{ws.max_row}')

    guide = wb.create_sheet('How to fill this in')
    for line in [
        'Shopi translation sheet',
        '',
        '1. Column D holds the Swahili, next to the English in column C. Leave column C as it is.',
        '2. Rows marked Check have a first draft in column D. Read each one; if it is wrong or sounds stiff, rewrite it in column D. Then set Status to Done.',
        '   Column E keeps that first draft for reference. Rows marked To do have no Swahili yet: write it in column D.',
        '3. Words in curly brackets, like {name} or {n}, are filled in by the app. Copy them into your Swahili exactly.',
        '4. Keep brand and product names in English: Shopi, WhatsApp, Instagram, TikTok, Lipa Namba, M-Pesa, Mixx by Yas, Airtel Money, HaloPesa.',
        '5. Say "mobile money" (pesa kwa simu), never assume M-Pesa.',
        '6. Write the way a Dar seller talks to customers: short, friendly, clear. Buttons are 1 to 3 words.',
        '7. No emojis and no long dashes. Set column G to Done when a row is finished, or Question if you are unsure.',
        '8. Send the file back as it is (.xlsx). We import it with one command.',
        '',
        '9. Legal pages (Terms, Privacy, Delete your data): the lawyer checks the English first. Translate the final English.',
        '',
        f'Rows: {len(rows)}',
    ]:
        guide.append([line])
    guide['A1'].font = Font(bold=True, size=14)
    guide.column_dimensions['A'].width = 120

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f'{len(rows)} strings -> {OUT}')


if __name__ == '__main__':
    main()
