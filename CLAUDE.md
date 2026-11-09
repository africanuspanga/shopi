# RIZK — working notes for Claude

RIZK is an online shop in one link for people in Tanzania who sell on Instagram, TikTok and WhatsApp.
A seller shares `rizk.tz/<shop>`; buyers browse, pick sizes, order with a phone number, area and landmark,
and pay the seller's own Lipa Namba (pasting the confirmation SMS) or cash on delivery.
**RIZK never holds money.** Tagline: *Risk to get Rizk.*

Read this before changing any screen. The bar is a world-class product: every screen must look deliberate
at phone width (390) **and** at desktop width (1440).

## Commands

```bash
npm run dev                 # http://localhost:3000 (Vite + Cloudflare worker, local D1 and R2)
npx tsc --noEmit            # must pass before you report anything done
npx tsr generate            # regenerate src/routeTree.gen.ts after adding or renaming a route
npx wrangler d1 migrations apply rizk --local
node scripts/seed-zee-history.mjs          # demo history for Zee's Store
node scripts/backfill-product-slugs.mjs    # readable links for older products
```

Demo seller login (local only): `design/sample-shop/LOGIN.local.md`. Never print the password.

## Stack and map

TanStack Start (React 19) on one Cloudflare Worker, D1 (SQLite), R2 for photos, Tailwind 4 (CSS-first `@theme`).

| Path | What lives there |
| --- | --- |
| `src/styles.css` | The design system: tokens (`@theme`) and component classes. Read it first. |
| `src/components/ui.tsx` | App-wide parts: `Page`, `TopBar`, `BackButton`, `Chips`, `StatusPill`, `Img`, `ShopAvatar`, `Money`, `Delta`, `Sheet`, `Field`, `Switch`, `Empty`, `Toast`, `TextLink`, `ErrorText`, `LangSwitch`, `Wordmark` |
| `src/components/shop.tsx` | Storefront parts: `ProductCard` (quick add), `QuickAddSheet`, `Price`, `Tag`, `BagButton`, `BagBar`, `ShopTopBar`, `ShopFacts`, `FactPills`, `SocialLinks`, `ShopFooter`, `MadeWithRizk` |
| `src/components/share.tsx` | `ShareActions` (WhatsApp, copy link, native share) and `prettyUrl` |
| `src/components/product-form.tsx` | New and edit product: photos, sizes editor, save guards, "send this product" |
| `src/components/auth.tsx` | `AuthLayout` (form left, dark product panel right), `StepBar`, `PasswordInput` |
| `src/components/showcase.tsx` | Coded product previews for the landing and auth pages (phone, mini store, order card, payment slip) |
| `src/components/brand-icons.tsx` | One-colour social icons, plus `WhatsAppMark` (WhatsApp's green mark) |
| `src/routes/index.tsx` | Landing page |
| `src/routes/$shop/` | Storefront `index`, product page `$product` (readable slug), `checkout`, `p.$id` (301 redirect for old links) |
| `src/routes/o/$code.tsx` | Buyer's order page: pay, paste SMS, progress |
| `src/routes/app/` | Seller app: `route.tsx` (sidebar and floating bottom nav), dashboard, orders, products, shop settings |
| `src/lib/api/` | Server functions: `store.ts` (public), `merchant.ts` (seller), `session.ts` |
| `src/lib/format.ts` | `tzs()`, phone, slugs (`slugify`, `productSlug`), statuses, categories, size presets |
| `design/brand/glyphs.py` | Source of the logo, app icon and favicon. Old boards are in `design/archive/`. |

## Design system

### Direction
- **Product:** an online shop in one link for Tanzanian social sellers.
- **Character:** confident, quick, warm.
- **World:** Dar es Salaam phone commerce. The colour comes from the sellers' own product photos; RIZK's chrome is black and white.
- **Moments:** product photography; the dark "Sales today" card; the receipt slip on anything about money.
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
| `ok` / `wait` / `bad` | `#15803d` / `#b45309` / `#d92d20` | Meaning only: status dots, check icons, errors |

**Moto rules.** Moto marks what is hot or needs the seller, and the active tab in the floating bottom nav:
bag count once something is in it, sale tags, low stock, "Check payment" status, payments-to-check count,
today's bar in charts, the `.signal` dot, the active bottom-nav icon, and the logo's full stop.
Primary buttons are **never** Moto; they are ink. Text on Moto is ink, never white (white fails contrast).
No gradients between hues, no glows, no coloured shadows. The only gradient allowed is a neutral fade
(white to transparent) under floating bars.

**WhatsApp.** Buttons that open a WhatsApp chat stay black or white; only `WhatsAppMark` carries WhatsApp's
green. Never make a green button. Quiet icon rows may use the one-colour `WhatsAppIcon`.

### Type
- **Mona Sans** (variable width and weight) for everything; **Geist Mono** for order codes, links,
  receipts, SMS text and small meta. Loaded from Google Fonts in `styles.css`.
- `.display`: width 112%, weight 600, tracking -0.045em, line-height 0.95. Hero headlines, shop names, the closing line.
- `.title`: width 106%, weight 600, tracking -0.03em. Page and section titles.
- Body 15 to 17px (400); labels and buttons 14 to 15px (500); captions 13px; meta 12px mono (`.meta`); codes `.code`.
- Weights 400, 500, 600 only. Sentence case everywhere. No uppercase tracked labels, no italics, no negative tracking under 16px.
- Numbers: `.tnum` gives lining figures, **not** tabular ones: Mona Sans's tabular zero is slashed and reads as code on a price.
  Align money columns right instead. Mono (receipts) stays tabular. Money is always `TSh 60,000` via `tzs()`;
  big figures use `<Money>` (small "TSh", large number).

### Shape and space
- 4px grid. Page gutters: 16px on phones, 40px on desktop (`Page wide` caps content at 1240px).
- Radius: buttons, chips, nav and badges are pills; inputs 14px; cards 20px; big panels 28 to 40px;
  product images 16px in grids, 10 to 12px as thumbnails. Inner radius = outer minus padding.
- Depth: hairlines on light surfaces; `shadow-float` only on things that float (bag bar, toasts, sheets, nav capsules).

### Components (CSS classes in `styles.css`)
- Buttons: `.btn` (ink pill, 48px) with `.btn-sm` (36px), `.btn-lg` (56px), `.btn-ghost` (white with hairline), `.btn-quiet` (well fill).
  On dark panels use `.btn` with `bg-white text-ink`. Danger actions are text buttons in `text-bad`.
- `.icon-btn` (40px round), `.chip` (filters, sizes, categories; active = ink via `data-active` or `aria-pressed`).
- Forms: `.field`, `.label`, `.hint`, `.input` (also used as a wrapper for prefixed inputs like `rizk.tz/` or `TSh`).
  Use `Field` from `ui.tsx`. Prices are typed with thousands separators.
- `.card`, `.receipt` + `.receipt-rule`, `.signal` (live orange dot), `.hide-scroll`.
- Motion: `.rise`, `.rise-2`, `.rise-3` (fade and rise on enter), `.fade`, `.sheet-up`.

### Layout patterns
- **Storefront** (`/$shop`): white page, sticky `ShopTopBar` with `BagButton`, shop header (avatar, display name,
  location, bio, WhatsApp, share, socials), `FactPills` on phones and a `ShopFacts` card on desktop, filter chips,
  2/3/4-column grid, `ShopFooter`. On phones a floating `BagBar` appears once the bag has items.
- **Product page:** swipe gallery with a photo counter on phones; a large photo with thumbnails on desktop;
  size chips, a details table, a "Share with a friend" box, a sticky add bar on phones.
- **Checkout and order page:** sand page; on desktop a sticky right column holds the bag and the receipt.
- **Seller app** (`/app`): sand page. Desktop has a 248px white sidebar (wordmark, shop card, nav, "Add product").
  Phones have the **floating bottom capsule**: black pill, icons above labels, the current tab on a raised pill with
  its icon in Moto, a white "+" in the middle, and an orange dot on Orders when payments need checking.
- **Landing:** floating capsule nav (a floating menu card on phones), hero with a coded phone, sections,
  and a dark closing block that holds the footer and ends on a giant `Wordmark`.
- **Auth:** `AuthLayout`: form on the left, dark product panel on the right (desktop only).

### Motion
One easing, `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`): 120 to 180ms for feedback, 300 to 500ms for entrances.
Animate only colour, opacity and transform. No looping animation except spinners while uploading.
Presses scale to about 0.97. Respect `prefers-reduced-motion`.

### Copy
Plain and specific, about this product. No exclamation marks, no greeting headlines (titles name the place or period),
no hype words, no claims we cannot back. Changes say what they compare to ("↓ 19% vs the 7 days before").
Write English as the key: every string goes through `t()` from `src/lib/i18n.tsx`, Swahili goes in
`src/locales/sw.json`, and `SWAHILI_ENABLED` turns it on.

### Logo
"RIZK." is Mona Sans ExtraBold at 120% width plus a perfect-circle Moto full stop as wide as the letters' stems.
The app icon and favicon are "R." with the same dot. Everything comes from `design/brand/glyphs.py`: edit the
geometry there, run it, and regenerate the `Wordmark` paths in `ui.tsx` and the icon files in `public/`.
Never hand-edit the paths. The dot is always Moto; the letters are ink or white.

## Product rules the UI depends on
- Order statuses: `awaiting_payment` → `payment_claimed` (buyer pasted an SMS) → `confirmed` → `dispatched` → `delivered`,
  or `cancelled`. Cash on delivery starts at `confirmed`. Stock is held on confirm and returned on cancel.
- Products may have sizes (`[{label, stock}]`); then `stock` is their total. A size at 0 is sold out.
- Product links are `/<shop>/<slug>`. A slug is set once and kept on rename; `/<shop>/p/<id>` and `/<shop>/<id>` redirect (301).
  Words reserved for shop pages: `checkout`, `p`, `bag`, `cart`, `order`, `orders`, `about`.
- Link previews: `og:image` and `og:url` are absolute, built from the request origin.

## Before you say it's done
1. `npx tsc --noEmit` passes.
2. Screenshot the screen at 390 and 1440 wide (Playwright) and look at it: alignment, wrapping, contrast, empty states.
3. Run the flow you touched in a browser (order, payment, product save), then remove any test data.
4. Check the screen against this file: one accent used by the rules, no new colours, no new fonts, no emoji, no uppercase labels.

Discovery notes and founder decisions are outside this repo (`../RIZK-discovery-notes.md`). Keep them out of the public repo.
