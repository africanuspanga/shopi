# Shopi design system

Every screen in Shopi follows this file. It is loaded into every session (through `CLAUDE.md`), and
`npm run check:design` enforces the scales, so a screen built in any session looks like the rest of the product.
The tokens live in `src/styles.css` (`@theme`); the check is `scripts/check-design.mjs`.

## The rules that never bend
1. **Only the scales.** Font sizes, corner radii, icon sizes and icon line weights come from the scales below, by
   name: `text-15`, `rounded-20`, `size={16}`, `strokeWidth={1.75}`. Never a typed value (`text-[15px]`,
   `rounded-[18px]`) and never a colour in a class (`bg-[#0b0b0b]`): use or add a token in `styles.css`.
2. **Same role, same look.** Before styling something, find where the app already shows that kind of thing and match
   it (a card title, a quiet row on Home, a sheet, a list row, a number card). Reuse its component when there is one
   (`ui.tsx`, `admin.tsx`); if two screens need the same new thing, make it a component.
3. **One accent.** Moto (`#ff4f17`) only by its rules (Colour, below). Buttons are ink, never Moto, never green.
4. **Phones first, desktop deliberate.** Every screen is checked at 390 and 1440 wide.
5. **Run the check.** `npm run check:design` must pass before anything is called done. If a design truly needs a
   new step on a scale, add it to `styles.css` and the check together and say why here; don't work around it.

## The scales
**Type** (`text-N`; a size sets no line height, use `leading-*` where a block needs one):

| Size | Use |
| --- | --- |
| 11 | Tab labels in the floating capsule, counts in badges |
| 12 | Meta: mono facts, timestamps (`.meta`) |
| 13 | Captions, hints, the line under a title, small print |
| 14 | Labels, secondary text, small buttons, chips, table cells |
| 15 | Body, list rows, card titles (`font-semibold`), buttons |
| 17 | Lead paragraphs (landing, legal intros), larger list names |
| 20 | Sheet titles, the phone top bar's title, small figures |
| 24, 28 | Section and page titles on phones; figures in number cards |
| 32, 40 | Page titles on desktop, big figures (Sales today) |
| 48 to 112 | Headlines: the landing, shop names (`.display`), larger at each breakpoint (`text-40 md:text-56 lg:text-72`) |

**Radius** (`rounded-N`, or `rounded-full` for pills and dots): 2 and 4 chart bars and marks · 8 small tags ·
12 thumbnails · 14 inputs and rows inside a card (`--radius-control`) · 16 product photos and blocks inside a card ·
20 cards (`--radius-card`) · 28 sheets and panels (`--radius-panel`) · 32 and 40 the landing's large panels.

**Icons** (lucide, and the brand icons): sizes 12 · 14 (beside 13 to 14 text, in chips) · 16 (in buttons and rows) ·
18 (icon buttons, fields) · 20 (navigation, large buttons) · 24 (empty states). Line weight 1.75; 2.25 only for small
bold marks (a check in a circle, the plus on a dark button).

**Colour:** the tokens in Colour, below. Opacity variants of them (`text-white/60`, `bg-ink/40`) are fine on dark
surfaces and overlays.

**Space:** the 4 px grid (Tailwind's spacing). Page gutters 16 on phones, 40 on desktop. Cards pad 20 on phones
(`p-5`), 24 on desktop (`md:p-6`).

## The shared parts (use them, don't rebuild them)
In `src/components/ui.tsx` (admin's `Kpi` in `components/admin.tsx`). When a screen needs one of these roles, it uses
the part; if it needs a variant, the part grows a prop. `npm run check:design` catches the usual signs of a part rebuilt
by hand (a hand-styled card heading, a bare `label` class, a `fixed inset-0` overlay, a hand-made `role="switch"`, a
local function named like a part); a genuine exception says why on its line or the line before:
`{/* design-check: allow <reason> */}`.

| Role | Part | Looks like |
| --- | --- | --- |
| A seller page's header | `TopBar` (phone bar + desktop header), or `PhoneBar` + `PageHead` when the phone bar is special (Home) | Desktop: title at 28 (`.title`), a 14 muted line under it, actions at the right |
| A titled card | `Card` (`title`, `sub`, `right`) | White card padded 20 (24 from md), its `CardHead`, then the content |
| A card's heading | `CardHead` (`title`, `sub`, `icon`, `right`) | Title 15 semibold; a short description under it at 13 muted; a dot or step number before the title; a link, count or button at the right on the title's baseline |
| A quiet row on Home | `Notice` (`icon`, `title`, `sub`, `to`/`onClick`, `actions`, `onDismiss`, `signal`) | A card: icon (or a short figure) in a soft circle, title 15 medium, a 13 muted line; the whole row opens something (arrow) or carries buttons; "Not now" as an X. Rows stack with `space-y-3` |
| A number with its label | `Stat` (`size` sm/md/lg, `card`, `onClick`+`on`, `badge`, `foot`); `/admin` wraps it as `Kpi` with the change chip | Label 13 muted, figure in lining figures (lg 20 → 24 from md, md 20, sm 15), a change or note at 13 |
| Nothing to show yet | `Nothing` (one line in a soft box); `Empty` (icon, title, text, action) for a whole empty page | |
| A sheet | `Sheet` (`tall`, `head`) | Title at 20 (`.title`), close at the right. It reads in ink wherever it is opened from; still render it outside a dark card. `tall`: a fixed height whose content scrolls inside it with something pinned at the bottom (the AI assistant's chat); `head`: a line under the title that stays put |
| One input | `Field` (`error`) | Label 14 medium, hint 13 muted. A missing or wrong answer is said under the box in `bad` at 13, with the box outlined in `bad` |
| A group of choices (chips, colours, photos) | `FieldGroup` (`radio` for one-of-several, `error`, `errorFirst`) | The same label, hint and error line as `Field`, named for screen readers. `errorFirst` puts the error under the label, for a long group (thirteen chips) |
| The shop's link as an object | `ShopLinkCard` in `components/shop-link.tsx` (`top`, `note`, `onQr`, `wide`; the buttons as children) | The dark card: a live dot, the logo, the shop's QR code, the name in `.display`, the whole link in mono. On "Your shop is live" and on Home until the first order or booking. Two columns from `xl` when `wide`; the focus ring on it is white. On it the main button is `btn bg-white text-ink hover:bg-white/90`, the others `btn bg-white/10 hover:bg-white/15` |
| A label for an input that sits beside a button | `Label` (`htmlFor`) | |
| A yes/no setting | `Switch` | |
| An invoice's or quote's state | `InvoicePill` (`state`, `check`) | A quiet dot and label like an order's; a payment to check or an accepted quote waiting for its invoice in the signal colour |
| What Shopi read from a payment SMS | `CheckRow` | A check, warning or question mark and one line (orders and invoices) |
| A value to copy | `CopyRow` (`label`, `value`, `onCopy`, `big`) | Label 13 muted, the value in mono, Copy at the right (Lipa Namba, amount) |

A paragraph that *is* a card's content (the instructions on an order's status card) stays body text, 14 muted with
`leading-relaxed`, under the `CardHead`; only a short description goes in `sub`.

**Exempt:** a file whose first lines say `design-check: off` (only `components/showcase.tsx`: the coded pictures of
phones and cards on the landing, drawn at their own small scale). Emails (`src/server/email-templates.ts`) are inline
HTML with their own fixed sizes.

## History
The scales were set on 18 Nov 2026 from what the app already used most (the founder: "there seem to be design
inconsistencies"). Before, 37 font sizes, 20 radii, 13 icon sizes and 10 line weights were typed by hand across 74
files; one sweep moved them onto the scales (16→15, 18→17, 22→20, 26→24, 30→28, 10 px radius→12, 18→16, icon 15→16,
line 1.6→1.75…), checked by before-and-after screenshots of 31 screens at 390 and 1440.


## The details

### Direction
- **Product:** an online shop in one link for Tanzanian social sellers.
- **Character:** confident, quick, warm.
- **World:** Dar es Salaam phone commerce. The colour comes from the sellers' own product photos; Shopi's chrome is black and white.
- **Moments:** product photography; the one dark card on a screen ("Sales today", and before the first order the
  shop's own link, `ShopLinkCard`: never both); the receipt slip on anything about money.
- **Signature:** the receipt slip (`.receipt`): a torn bottom edge and mono figures, only on money (checkout total, order totals, payment checks).

### Colour (tokens in `@theme`, use the Tailwind names)
| Token | Value | Use |
| --- | --- | --- |
| `page` | `#f4f3f0` | Seller app, landing, checkout and order pages (warm sand) |
| `card` | `#ffffff` | Cards; also the storefront and product page background, so photos carry the colour |
| `well` | `#efeeea` | Image wells, quiet fills, active nav row |
| `raised` | `#e7e6e1` | Hover and pressed fills, empty chart bars |
| `ink` | `#0a0a0a` | Primary text, primary buttons, the dark card and capsule nav |
| `ink-2` | `#4d4b47` | Secondary text |
| `muted` | `#6d6a65` | Captions and meta only (about 4.5:1 on page) |
| `faint` | `#a19e98` | Disabled text, placeholder icons |
| `line` / `line-strong` | ink at 8% / 15% | Hairlines and control borders |
| `moto` | `#ff4f17` | **The one accent** (see rules) |
| `moto-ink` | `#c4380a` | Moto as text on white ("Only 2 left") |
| `moto-soft` | `#fff0e8` | Background of the "Check payment" status |
| `on-moto` | `#0a0a0a` | Text on a Moto fill (bag counts, sale tags). Use it instead of `text-ink` on `bg-moto` |
| `moto-lit` / `on-moto-lit` | `#ff4f17` / `#0a0a0a` | Moto on the black capsule (active tab, bag count) and the text on it |
| `ok` / `wait` / `bad` | `#15803d` / `#b45309` / `#d92d20` | Meaning only: status dots, check icons, errors |
| `bad-lit` | `#ffb59c` | An error on a black surface (the save bar) |

**Moto rules.** Moto marks what is hot or needs the seller, and the active tab in the floating bottom nav:
bag count once something is in it, sale tags, low stock, "Check payment" status, payments-to-check count,
today's bar in charts, the `.signal` dot, the active bottom-nav icon, and the logo's full stop.
Primary buttons are **never** Moto; they are ink. Text on Moto is ink, never white (white fails contrast).
No gradients between hues, no glows, no coloured shadows. The only gradient allowed is a neutral fade
(white to transparent) under floating bars.

**A shop's own colour** (Shop look, `src/lib/theme.ts`) replaces Moto on that shop's buyer pages (shop, product,
collection, checkout, bag links, the order page) by setting the tokens above on a wrapper (`themeStyle`), so components
keep using `moto`, `on-moto`, `moto-ink` and `moto-lit`. Shopi orange stays the default; the seller app and Shopi's logo
dot stay Moto. The buyer's main step (`.btn-shop`: Add to bag, Go to checkout, Place order, Notify me, send payment proof)
takes the colour only when white text on it reaches 4.5:1; otherwise it stays ink. Other buttons stay black and white.

**WhatsApp.** Buttons that open a WhatsApp chat stay black or white; only `WhatsAppMark` carries WhatsApp's
green. Never make a green button. Quiet icon rows may use the one-colour `WhatsAppIcon`.

### Type
- **Mona Sans** (variable width and weight) for everything; **Geist Mono** for order codes, links,
  receipts, SMS text and small meta. Served from shopi.tz (`public/fonts`, `@font-face` in `styles.css`, the body font
  preloaded in `__root.tsx`); never load fonts from Google, it delayed the first paint by about a second.
- `.display`: width 112%, weight 600, tracking -0.045em, line-height 0.95. Hero headlines, shop names, the closing line.
- `.title`: width 106%, weight 600, tracking -0.03em. Page and section titles.
- Sizes come from the type scale (top of this file): body 15 (400), labels and buttons 14 to 15 (500), captions 13,
  meta 12 mono (`.meta`), codes `.code`.
- **Shop styles** (Shop look): a shop may set its name and headings (`.display`, `.title`) in one of 5 other fonts
  (Playfair Display, Anton, Fredoka, Space Grotesk, Caveat; `public/fonts/shop-*.v1.woff2`, OFL in `shop-fonts-OFL.txt`)
  through `data-font` on the shop, product and collection pages only (`fontAttr()`; never checkout, money or the seller
  app). Each has its own spacing in `styles.css`; the page preloads its file (`fontPreload()`).
- Weights 400, 500, 600 only. Sentence case everywhere. No uppercase tracked labels, no italics, no negative tracking under 16px.
- Numbers: `.tnum` gives lining figures, **not** tabular ones: Mona Sans's tabular zero is slashed and reads as code on a price.
  Align money columns right instead. Mono (receipts) stays tabular. Money is always `TSh 60,000` via `tzs()`;
  big figures use `<Money>` (small "TSh", large number).

### Shape and space
- 4px grid. Page gutters: 16px on phones, 40px on desktop (`Page wide` caps content at 1240px).
- Radius comes from the radius scale (top of this file): pills for buttons, chips, nav and badges; inputs 14; cards
  20; sheets and panels 28; product photos 16 in grids, 12 as thumbnails. Inner radius = outer minus padding.
- Depth: hairlines on light surfaces; `shadow-float` only on things that float (nav capsules, the buy bar, the save bar, toasts, sheets).

### Components (CSS classes in `styles.css`)
- Buttons: `.btn` (ink pill, 48px) with `.btn-sm` (36px), `.btn-lg` (56px), `.btn-ghost` (white with hairline), `.btn-quiet` (well fill).
  On dark panels use `.btn` with `bg-white text-ink`. Danger actions are text buttons in `text-bad`.
- `.icon-btn` (40px round), `.chip` (filters, sizes, categories; active = ink via `data-active` or `aria-pressed`).
- Forms: `.field`, `.label`, `.hint`, `.input` (also used as a wrapper for prefixed inputs like `shopi.tz/` or `TSh`).
  Use `Field` from `ui.tsx`. Prices are typed with thousands separators.
- `.card`, `.receipt` + `.receipt-rule`, `.signal` (live orange dot), `.hide-scroll`.
- Motion: `.rise`, `.rise-2`, `.rise-3` (fade and rise on enter), `.fade`, `.sheet-up`.

### Layout patterns
- **The top of a phone screen** (16 Nov, the founder's pick of three): one steady white bar with a hairline, always
  there. Buyer pages use `ShopTopBar` (72px: the shop's logo and name in its own font, the bag at the right; `back` adds
  an arrow on the product page and checkout). Seller pages use `PhoneBar` through `TopBar` (60px: back or logo, the
  page's name, up to two actions; the sub line sits under the bar), and the log-in screens carry the same bar with the
  wordmark. Because the bar names the place, phone pages don't repeat the name under it. The landing page keeps its
  floating capsule. From `md` up nothing changed: pages keep their large titles.
- **Storefront** (`/$shop`): white page, sticky `ShopTopBar`, shop header (on desktop: avatar and display name; on
  phones the bar carries both, so the header starts at the location, then bio, WhatsApp, share, socials), `FactPills` on phones and a `ShopFacts` card on desktop, the seller's Top picks (`TopPicks`, below), a search field (`ShopSearch`,
  shops with 6+ products: above the chips on phones, at the right of the chips row on desktop; it filters the grid as the
  buyer types, across the whole shop, with `matchesSearch()`, which the capsule's search sheet shares), filter chips,
  2/3/4-column grid, `ShopFooter`. On phones the bag is in the top bar and in the floating capsule (below).
- **Product page:** the top bar with Back, Share and the bag, then a swipe gallery with a photo counter on phones; a large photo with thumbnails on desktop;
  option chips (an option with its own photo brings it up), a details table, a "Share with a friend" box, a sticky add bar on phones.
- **Checkout and order page:** sand page; on desktop a sticky right column holds the bag and the receipt.
- **Seller app** (`/app`): sand page. Desktop has a 248px white sidebar (wordmark, shop card, nav, "Add product").
  On phones it uses the floating capsule (below): Home · Orders · **+** (add product) · Products · Shop, with an orange dot on Orders when
  payments need checking.
- **The floating capsule** (`components/floating-nav.tsx`: `FloatingNav`, `NavTab`, `NavCenter`, `NavCount`) is the phone navigation
  everywhere it appears. It is a black pill with five slots: two tabs, a white centre circle for the screen's main action, two tabs.
  The current tab sits on a raised pill with its icon in Moto. It is hidden from `md` up. Where it is used:
  - **Shop** (`components/shop-nav.tsx`): Shop · Search (instant search sheet) · **Bag** (with an orange count) · WhatsApp (or Share) · Info
    (a sheet with delivery fees, payment, hours and socials). The bag pill in the top bar shows on desktop only.
  - **Landing:** Steps · Payments · **+** (open your shop) · Pricing · Questions. The section crossing the middle of the screen lights up.
  - **Product page:** no tab bar. The buy bar is the same black capsule: price on the left, a white "Add to bag", then
    "Keep shopping" and a white "Checkout" with the bag total.
  - Checkout and forms never get a capsule: they keep the buyer's attention on finishing.
  Pages with a capsule add `pb-28` (or `pb-24`) on phones so the end of the page clears it.
  The capsule steps aside in two cases:
  - **Typing:** while a text field has focus, `FloatingNav` sets `body[data-typing]` and the capsule slides down. Android shrinks
    the page when the keyboard opens, so a fixed bar would otherwise sit on top of the field.
  - **A page's own bottom bar:** `useHideFloatingNav(show)` hides the capsule while that bar is up. Shop settings does this for
    its "You have unsaved changes" bar, which is fixed to the bottom with the safe area.
- **Lists on phones** (orders, latest orders): two lines. Line one: the name on the left, the money on the right. Line two:
  the `StatusPill`, then quiet detail such as the area (it may truncate), then the time on the right as `.meta`. Order codes
  stay on the order page and in search. Desktop gets a real table. Never squeeze a status pill onto the name's line.
- **Charts on phones:** a finger slides along the bars to read each day (`scrubIndex` from `ui.tsx` plus `touch-pan-y`,
  so the page still scrolls up and down). The mouse keeps hover.
- **Product names** in the seller's grid wrap to two lines (`line-clamp-2`); the end of a name ("(Off-shoulder)") is often what tells two products apart.
- **Landing:** floating capsule nav (a floating menu card on phones), hero with a coded phone, sections,
  and a dark closing block that holds the footer and ends on a giant `Wordmark`.
- **Auth:** `AuthLayout`: form on the left, dark product panel on the right (desktop only). Sign-up and log-in sit in
  the middle of the screen; the setup's steps (`steady`) all start at the same height, so the step bar never jumps.
  In the setup the panel holds **one phone from step 1 to 5** (`SetupPhone`): the shop taking shape, the open shop,
  then the first notification on its lock screen; never a different object per step. On phones the same screen opens
  from a "Preview" pill in the step bar's row, never from a card that pushes the form down.
- **The AI assistant never asks for attention** (the founder, 23 Nov 2026): it opens only from Ask in the shop's
  header, the quiet link on a product, the Info sheet's row or the Search sheet's row once the buyer typed. No
  floating bubble, no pop-up, no greeting that appears on its own, nothing over the products. Its sheet is `Sheet
  tall`: grey bubbles for its answers, ink for the buyer's, cards as list rows, and what it offers (the bag,
  WhatsApp, an order) as a button the buyer taps.
- **Touch areas are 44 px**, also where the thing looks smaller: `.icon-btn` is 40 px to look at with a ring around it
  that takes the tap (`::after`); a text link that acts as a button gets `min-h-11` (the setup's "Change", "I’ll do
  this later", Home's "See all"); a small round X on a photo sits in a 44 px button.

### Motion
One easing, `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`): 120 to 180ms for feedback, 300 to 500ms for entrances.
Hover colours in `styles.css` sit inside `@media (hover: hover)` (Tailwind's `hover:` already does this): on a phone a tap
would leave the button stuck in its hover colour. Keep new hover rules there too.
Entrances (`.rise`, `.rise-2`, `.rise-3`) on content that can be on the first page a visitor opens go through `useEntrance()`
(`ui.tsx`), never a bare class: the server-drawn first page shows at once, and screens opened after a move inside the app
rise. A fade on the first page hides it until the phone has run the scripts (the shop's bio waited 1.3 s on a slow phone,
and the shop page's LCP was 4.4 s). Things that appear after an action (toasts, the save bar) keep the plain class.
Animate only colour, opacity and transform. No looping animation except spinners while uploading.
Presses scale to about 0.97. Respect `prefers-reduced-motion`.

### Forms
A form says what is missing **on the box itself, every box at once** (`error` on `Field` and `FieldGroup`), then
`showFirstError()` brings the first one into view. A button is never greyed out for a missing answer, because a grey
button gives no reason; it is disabled only while saving or uploading. `ErrorText` above the button is for what belongs
to no box (the connection, a limit). An example inside a box says it is one: it starts with "e.g." ("Mfano:" in Swahili, never "Mf."). For
examples that need no translation themselves (a number, a link, a code, a name) use `eg(t, '0754 123 456')` from
`lib/i18n.tsx`, one string for all of them; a sentence keeps its own string starting with "e.g.". A box that asks
about money shows `0`, never a sample price, and a box that asks for the seller's own name or shop name shows nothing
(the grey shop name in "Name on payments" read as filled in, 23 Nov 2026). An example reads in the normal font also
in a box whose answer is in the code font (`.input.code::placeholder`): "e.g. 5512345" in mono looked like code.
The way past a step that matters is a text link under the form, never a second button the size of the main one.
A preview never shows a grey empty tile: what isn't added yet is one dashed tile that says what goes there.
The line under a setup step's title stays within two rows on a 390 px phone, in Swahili too.

### Copy
Plain and specific, about this product. No exclamation marks, no greeting headlines (titles name the place or period),
no hype words, no claims we cannot back. Changes say what they compare to ("↓ 19% vs the 7 days before").
Write English as the key: every string goes through `t()` from `src/lib/i18n.tsx`, Swahili goes in
`src/locales/sw.json`. Swahili is on (`SWAHILI_ENABLED`); the team approved every string on 14 Nov 2026.
- **Who sees which language:** sellers read the app in their own language (the `shopi_lang` cookie, the `LangSwitch` on
  Home, Shop settings and the sign-up and log-in screens). Buyers see a shop in the language its seller chose
  (`shops.lang`): `$shop/route.tsx` and the order page wrap their pages in `<LangProvider value={asLang(shop.lang)}>`, and
  buyer pages have no switch. `<html lang>` follows the same rule (`useDocumentLang` in `__root.tsx`), and so do the search
  titles and descriptions (`src/lib/seo.ts` translates with the shop's language).
- **Choosing it:** the first question on "Name your shop" (`ShopLangChoice`); choosing also switches the seller's own app
  to it. Changed later in Shop settings. Shops opened before 14 Nov stay English until their seller chooses.
- **The sheet:** `python3 scripts/i18n/export.py` writes `../design/translations/Shopi-translations.xlsx`. Approved rows show
  Done; rows still to check show Check (the draft, or Swahili listed in `scripts/i18n/sw-unchecked.json`). The team
  corrects column D and marks rows Done; `python3 scripts/i18n/import.py <file>` writes `sw.json` from that sheet and
  clears those rows from `sw-unchecked.json`. Import starts from `sw.json` and lets the sheet's rows win, so Swahili for
  strings the sheet doesn't list is kept (since 18 Nov; before, it wrote only the sheet's rows). The export finds `t('…')`,
  `msg('…')` (text kept in data, like the plan cards' lists) and the same t under another name (`tt(`, `tr(`,
  `tRef.current(`); write apostrophes as ’ inside single quotes, or the export misses the string.
- **A new string:** add its Swahili to `sw.json` and `sw-draft.json` in the same change (same `{placeholders}`, brands in
  English) and its English key to `sw-unchecked.json`, then export again for the team.
- **Context translation, not perfect Swahili** (the founder, 23 Nov 2026: "we are not doing perfect Swahili
  translation, we are doing context translation"). Popular English words stay English, the way sellers say them, with
  Swahili around them (N-class agreement: "password yako", "collection hii", "stock imeisha"; verbs with a hyphen:
  ku-book, wa-book, ku-share, ume-share, ku-edit, ku-paste, ku-import, uta-log in). The founder chose each word:
  - **Stay English:** booking (never miadi), invoice (never ankara), quotation (never nukuu or makadirio ya bei),
    settings ("Settings za duka"; never mipangilio), code for discount codes (never kodi, which is tax), copy (never
    nakili, also in sentences), share (never tuma or shiriki), password, notification(s) (never arifa; "Weka
    notifications"), edit (never hariri), location (the buyer's pin; "mahali pa kukuletea", where to deliver, stays),
    rider (never mpeleka bidhaa), paste (never bandika), collection (never kundi), stock, cash (never taslimu; "lipa
    ukipokea" stays for cash on delivery), online (never mtandaoni), draft, tag, import, template, website (never
    tovuti), dashboard, profile, email (never barua pepe), logo (never nembo), checkout, mobile money (never pesa kwa
    simu), log in, log out and login (never ingia or toka), and delivery, link, status, app, bio, QR code. Since
    23 Nov (the founder's answers to the onboarding review): the kinds of business Clearing and forwarding and
    Freelance, Wholesale (the English word alone; "Wholesale / Jumla" until the founder said "keep wholesale"), and hour and hours for a length of time ("1 hour",
    "2 hours 30 min"; never "saa 1", which reads as a clock time; minutes alone stay "dak 15"). Since 23 Nov
    (night, the founder reading the looks build's lines): **preview** stays "Preview" (never "Angalia mwonekano" or
    "Angalia"), and the setup's line under "How buyers pay" starts in English, "Cash on delivery is on.", with
    Swahili after it. Elsewhere cash on delivery is still "lipa ukipokea" until the founder says otherwise.
  - **Characters in a password are "tarakimu au herufi"** ("Angalau tarakimu au herufi 6"), never vibambo.
  - **Telling a seller to share their link is "Share link yako"**, also where the English says "Send your link"
    (setup step 4), never "Tuma link yako". Sending one thing to one person stays tuma ("Tuma kwa WhatsApp").
  - **Stay Swahili:** mteja/wateja, bidhaa, malipo, picha, kapu (bag), ujumbe, mauzo, ghairi, hifadhi, huduma,
    thibitisha, kifurushi (plan), futa, taarifa, msaidizi, kutembelewa (visits), kutazamwa (views), ukumbusho, jisajili,
    maelezo, punguzo, takwimu (analytics), imeisha (sold out), tafuta, ramani, ratiba (diary), Mwanzo (Home), pakua
    (download, install: "Pakua Shopi app"), duka, oda, risiti, saizi, Nunua (Buy).
  - **Shop or page:** a seller of products has a "duka" (shop); a salon and a business that sends invoices have an
    "ukurasa" (page): "Ukurasa wako", "Fungua ukurasa wangu", "Link ya ukurasa", "Jina la biashara" (the founder, 23
    Nov 2026; `hasPage()` in `src/lib/setup.ts`). The seller app's menu and "Settings za duka" say duka for everyone.
  - **Tap is "bofya"** (Bofya, ukibofya, kwa kubofya mara moja), never gusa or bonyeza.
  - **Invoices and quotations are printed in English** (on screen and in the PDF, `DOC_LANG` in `lib/invoice.ts`):
    "Bill to", "Balance due" and the rest stay English there; a document's language only chooses the WhatsApp message
    and the client's page.
  - The team's review twice changed these back (20 and 23 Nov), so the export notes the words on each row
    (`KEEP_ENGLISH` in `scripts/i18n/export.py`), and the founder confirms new words.
- Short days: J2 (Sunday), J3, J4, J5, Alh, Ijm, Jmos (`shortDay()` in `lib/format.ts`).

### Logo
"shopi" is Mona Sans ExtraBold at 120% width, lowercase, with the i's dot drawn as a perfect-circle Moto dot as wide as the
stem. The app icon and favicon are a shopping bag, white on ink, with the same dot on its face. Everything comes from
`design/brand/glyphs.py`: edit the geometry there, run `python3 glyphs.py` (SVGs), `node render.mjs` (PNGs and the files in
`public/`) and `python3 glyphs.py --ico`; paste `python3 glyphs.py --tsx` into `Wordmark` in `ui.tsx`. Never hand-edit the paths.
The dot is always Moto; the letters are ink or white. The wordmark's box runs from the dot to the p's descender, so size it
by height: 22px in headers, 14px in the "Shop made with" line. In prose the name is "Shopi"; only the wordmark and the
domain are lowercase.
