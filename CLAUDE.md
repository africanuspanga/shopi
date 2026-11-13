# Shopi — working notes for Claude

Shopi is an online shop in one link for people in Tanzania who sell on Instagram, TikTok and WhatsApp.
A seller shares `shopi.tz/<shop>`; buyers browse, pick sizes, order with a phone number, area and landmark,
and pay the seller's own Lipa Namba (pasting the confirmation SMS) or cash on delivery.
**Shopi never holds money.** Tagline: *Your shop in one link.* (Swahili: *Duka lako, link moja.*)
The product was RIZK until 11 November 2026; the old name must not reappear in copy, code or docs.

Read this before changing any screen. The bar is a world-class product: every screen must look deliberate
at phone width (390) **and** at desktop width (1440).

## Commands

```bash
npm run dev                 # http://localhost:3000 (Vite + Cloudflare worker, local D1 and R2)
npx tsc --noEmit            # must pass before you report anything done
npx tsr generate            # regenerate src/routeTree.gen.ts after adding or renaming a route
npx wrangler d1 migrations apply shopi --local
node scripts/seed-zee-history.mjs          # demo history for Zee's Store
node scripts/backfill-product-slugs.mjs    # readable links for older products
node scripts/seed-client-shops.mjs <folder> [--remote]   # real seller shops from a private data folder (shop.json + photos/)
```

Demo seller login (local only): `design/sample-shop/LOGIN.local.md`. Never print the password.

## Stack and map

TanStack Start (React 19) on one Cloudflare Worker, D1 (SQLite), R2 for photos, Tailwind 4 (CSS-first `@theme`).

| Path | What lives there |
| --- | --- |
| `src/styles.css` | The design system: tokens (`@theme`) and component classes. Read it first. |
| `src/components/ui.tsx` | App-wide parts: `Page`, `TopBar`, `BackButton`, `Chips`, `StatusPill`, `Img`, `ShopAvatar`, `Money`, `Delta`, `Sheet`, `Field`, `Switch`, `Empty`, `Toast`, `TextLink`, `ErrorText`, `LangSwitch`, `Wordmark` |
| `src/components/shop.tsx` | Storefront parts: `ProductGrid` (the grid with quick add and its toast), `ProductCard` (quick add), `QuickAddSheet`, `Price`, `Tag`, `BagButton`, `ShopTopBar`, `ShopFacts`, `FactPills`, `SocialLinks`, `ShopFooter`, `MadeWithShopi` |
| `src/components/floating-nav.tsx` | The phone capsule: `FloatingNav`, `NavTab`, `NavCenter`, `NavCount`, `useHideFloatingNav` |
| `src/components/shop-nav.tsx` | The storefront's capsule with its search and info sheets |
| `src/components/not-found.tsx` | Not-found pages for missing shops, products and orders |
| `src/components/share.tsx` | `ShareActions` (WhatsApp, copy link, native share) and `prettyUrl` |
| `src/components/product-form.tsx` | New and edit product: photos, options editor (kind, stock, own price, own photo), save guards, "send this product" |
| `src/components/auth.tsx` | `AuthLayout` (form left, dark product panel right), `StepBar`, `PasswordInput` |
| `src/components/showcase.tsx` | Coded product previews for the landing and auth pages (phone, mini store, order card, payment slip) |
| `src/components/brand-icons.tsx` | One-colour social icons, plus `WhatsAppMark` (WhatsApp's green mark) |
| `src/routes/index.tsx` | Landing page |
| `src/routes/$shop/` | Storefront `index`, product page `$product` (readable slug), `checkout`, `p.$id` (301 redirect for old links) |
| `src/routes/$shop/b.$code.tsx` | A bag link the buyer opens: checkout with the seller's lines and prices, or why it can't be ordered |
| `src/routes/$shop/c.$slug.tsx` | A collection's own page: its products in the seller's order, chips to the others, quick add |
| `src/routes/o/$code.tsx` | Buyer's order page: pay, paste SMS, progress |
| `src/routes/app/` | Seller app: `route.tsx` (sidebar and floating bottom nav), dashboard, `analytics`, orders, products, shop settings |
| `src/routes/app/bags/` | Bag links: the list, `new` (build a bag for one buyer), `$id` (send it, cancel it) |
| `src/components/checkout.tsx` | `CheckoutView` (bag, details, delivery, payment, receipt and Place order), shared by checkout and bag links; `CheckoutHeader` |
| `src/components/product-picker.tsx` | `ProductPicker`: search the seller's products and pick one (Record a sale, bag links) |
| `src/routes/app/collections/` | Collections: the list (order, share), `new` and `$id` (`CollectionForm` in `components/collections.tsx`) |
| `src/routes/app/discounts.tsx` | Discount codes: each code with its uses, on/off, Share (as a link) and the new/edit sheet |
| `src/lib/discounts.ts` | Discount rules shared by checkout and the server: `discountOff()`, `cleanCode()`, `codeKey()` |
| `src/lib/api/` | Server functions: `store.ts` (public), `merchant.ts` (seller), `analytics.ts` (seller analytics, tagged links), `bags.ts` (bag links), `discounts.ts`, `collections.ts`, `session.ts` |
| `src/lib/analytics.ts` | The buyer-side tracker: visitor ID, 30-minute visits, traffic source, `?s=` link tags, `track()` |
| `src/routes/api/e.ts` | Receives analytics events (sendBeacon); drops bots, records device and city |
| `src/routes/api/export.ts` | CSV downloads of orders and buyers for the logged-in seller |
| `src/lib/format.ts` | `tzs()`, phone, slugs (`slugify`, `productSlug`), statuses, categories, size presets, options (`priceOf`, `imageOf`, `OPTION_KINDS`) |
| `design/brand/glyphs.py` | Source of the logo, app icon and favicon. Old boards are in `design/archive/`. |

## Design system

### Direction
- **Product:** an online shop in one link for Tanzanian social sellers.
- **Character:** confident, quick, warm.
- **World:** Dar es Salaam phone commerce. The colour comes from the sellers' own product photos; Shopi's chrome is black and white.
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
bag count once something is in it (also on a product card's quick-add button, which turns Moto and shows how many of that product are in the bag), sale tags, low stock, "Check payment" status, payments-to-check count,
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
- **Storefront** (`/$shop`): white page, sticky `ShopTopBar` with `BagButton` (on phones it uses `reveal`: hidden until the
  shop's name scrolls out of view, so the name never shows twice), shop header (avatar, display name,
  location, bio, WhatsApp, share, socials), `FactPills` on phones and a `ShopFacts` card on desktop, filter chips,
  2/3/4-column grid, `ShopFooter`. On phones the bag lives in the floating capsule (below).
- **Product page:** swipe gallery with a photo counter on phones; a large photo with thumbnails on desktop;
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
"shopi" is Mona Sans ExtraBold at 120% width, lowercase, with the i's dot drawn as a perfect-circle Moto dot as wide as the
stem. The app icon and favicon are a shopping bag, white on ink, with the same dot on its face. Everything comes from
`design/brand/glyphs.py`: edit the geometry there, run `python3 glyphs.py` (SVGs), `node render.mjs` (PNGs and the files in
`public/`) and `python3 glyphs.py --ico`; paste `python3 glyphs.py --tsx` into `Wordmark` in `ui.tsx`. Never hand-edit the paths.
The dot is always Moto; the letters are ink or white. The wordmark's box runs from the dot to the p's descender, so size it
by height: 22px in headers, 14px in the "Shop made with" line. In prose the name is "Shopi"; only the wordmark and the
domain are lowercase.

## Photos
- Uploads are shrunk in the browser (`src/lib/upload.ts`): the photo at 1200 px and a 600 px copy, both WebP. Keys are
  `s/<shop>/<id>.webp` and `t/<shop>/<id>.webp` (`thumbKey()` in `format.ts`). Logos are one 400 px file.
- Show photos with `Img`: `sizes="…"` in grids (the browser picks 600 or 1200), `size="thumb"` for thumbnails and lists,
  the default (full) only on the product page gallery and in link previews.
- `/img/*` answers from Cloudflare's edge cache first; a missing small copy falls back to the full photo (cached 1 hour).
- `removePhotos()` (`src/server/media.ts`) deletes photos a product or logo stops using, with their copies, but keeps any
  photo a past order shows or another product uses. Never delete from the bucket by hand.
- `python3 scripts/backfill-thumbs.py [--remote]` makes missing small copies (Pillow); safe to run again.

## Product rules the UI depends on
- Shop `status`: `active`, or `demo` for a sample shop (Zee's Store). A demo shop shows `DemoBanner` on every page, has
  `noindex`, and `placeOrder` refuses its orders (`error: 'demo'`); checkout disables the button too. Any other status hides the shop.
- Plans (`src/lib/plans.ts`): a trial (14 days, 30 with setup done), then Twiga or Tembo yearly. `planState()` is the one
  entitlement check. `BILLING_LIVE` stays false until sellers can pay in Shopi; then an ended shop takes a break
  (`BreakBanner`, orders refused, nothing deleted).
- Optional shop fields: `maps_url` (Google Maps links only, `mapsLink()`) gives buyers Directions; `tin` (9 digits, `tinDigits()`,
  shown as `formatTin()` 123-456-789) appears in `ShopFacts`, the Info sheet and on receipts, not in the phone pills.
- Delivery fees are not in Shopi: buyer and seller agree them on WhatsApp. Shops list delivery areas by name only.
- Bag links (`bag_links`, helpers in `src/server/bags.ts`): the seller builds a bag for one buyer (products, hidden ones too,
  sizes, quantities, their own price per line, and optionally the buyer's name, WhatsApp and a note the buyer sees) and sends
  `shopi.tz/<shop>/b/<code>` (8 characters; `b` is reserved). The buyer only adds delivery and payment. `placeOrder({ bag })`
  takes the lines and prices from the link, never from the browser, and claims the link before it saves the order, so it works
  once. The order gets `source = 'bag_link'`. Links end after 7 days (`BAG_DAYS`); open, used, cancelled or expired is worked
  out when read. Stock is checked when the buyer orders, not held when the link is made. Entry points: the + sheet, the
  sidebar, and the Bag links row on Orders (open links are counted in `getNavCounts`).
- Discount codes (`discounts`, helpers in `src/server/discounts.ts`): uppercase letters, digits and hyphens; a percent (1 to 100)
  or TSh off the items total; optional minimum order, last day (the end of that day, Tanzania time) and most orders
  (counted from `orders.discount_code` since the code was made; cancelled orders don't count); an on/off switch.
  `discountOff()` is the one formula, and the discount never takes a total below 0. Checkout shows "Have a discount code?"
  only when the shop has a live code (`hasDiscounts`). `placeOrder({ discount })` checks the code again (`liveDiscount`);
  if it stopped working, it answers `error: 'discount'` and checkout takes the code off and says so. Orders store
  `discount_code` and `discount`; `total = subtotal - discount`. A link like `shopi.tz/<shop>?code=EID10` keeps the code on the
  phone (`codeKey`, set in `$shop/route.tsx`) and checkout applies it. Bag links take no codes: the seller set those prices.
  The Discount line shows on the order page, the receipt image, the seller's order page and the orders CSV.
- Collections (`collections`, `collection_products`): a name, an optional line, and products in the seller's order. The link
  `shopi.tz/<shop>/c/<slug>` is set once from the name and kept on rename (`c` is reserved). `getStorefront` returns every
  collection with only the products buyers can see; the shop's chips list the non-empty ones first, in the seller's order
  (`orderCollections`), then New in and On sale. A product in several collections is fine; deleting a product takes it out.
  Seller: Collections in the sidebar, and a Collections button on Products (phones).
- Sales recorded by hand are orders with `source = 'manual'` (payment `cash`, `lipa`, `mobile` or `bank`); they count in
  sales but stay out of visits, the funnel, conversion and buyers. `orders.stock_taken = 0` means cancelling returns nothing.
- Order statuses: `awaiting_payment` → `payment_claimed` (buyer pasted an SMS) → `confirmed` → `dispatched` → `delivered`,
  or `cancelled`. Cash on delivery starts at `confirmed`. Stock is held on confirm and returned on cancel.
- Products may have options, usually sizes (`sizes`: `[{label, stock, price?, image?}]`); then `stock` is their total and an
  option at 0 is sold out. `parseSizes()` reads old `[{label, stock}]` the same. An option's own `price` replaces the product's
  (`priceOf()`), and its own `image` (one of the product's photos) shows when it is chosen (`imageOf()`): the product page
  scrolls to it, quick add swaps its thumbnail, and the order line keeps it. Before a choice, a product whose options cost
  different amounts reads "From TSh …" (`priceSpan()`, `shownPrice()` in `shop.tsx`); the "was" price only ever shows at the
  product's own price. `placeOrder` works the price out on the server. `products.option_name` says what buyers choose:
  NULL (size), `colour`, `style`, `model` or `flavour` (`OPTION_KINDS`), so copy reads "Choose your colour" and lines read
  "Colour Red" (`optionText()`); `order_items.option` keeps it on the order. `OptionChip` shows an option's photo in its chip.
- Product links are `/<shop>/<slug>`. A slug is set once and kept on rename; `/<shop>/p/<id>` and `/<shop>/<id>` redirect (301).
  Words reserved for shop pages: `checkout`, `p`, `b`, `c`, `bag`, `cart`, `order`, `orders`, `about`.
- Link previews: `og:image` and `og:url` are absolute, built from the request origin.

## Analytics
- **Tracker** (`src/lib/analytics.ts`):
  - **IDs:** a random visitor ID in localStorage, and a visit (`session_id`) that ends after 30 quiet minutes or when a new `?s=` tag is opened.
  - **Source:** worked out once per visit, from the in-app browser (Instagram, TikTok, Facebook), the Android app referrer (`android-app://com.whatsapp`), the referring website, or `direct`. The `?s=` tag is stored separately as `link_tag`.
  - **Sending:** `track(type, { shopId, productId?, detail? })` sends with sendBeacon to `/api/e`. An identical event within 1.5 seconds is dropped.
- **Events:**

  | Event | `detail` values |
  | --- | --- |
  | `view_shop` | —, `bag_link` when a bag link is opened, `collection` on a collection page |
  | `view_product` | — |
  | `add_to_cart` | `quick` or `page` |
  | `checkout_start` | — |
  | `whatsapp_click` | `shop`, `product`, `order`, `footer` |
  | `social_click` | `instagram`, `tiktok`, `facebook` |
  | `share` (buyers) | `whatsapp`, `copy`, `native` |
  | `seller_share` | the share channel; `bag-<channel>` for a bag link, `code-<channel>` for a discount code, `collection-<channel>` |

  Add new types in both the tracker and `/api/e`.
- **Not counted:**
  - bots and link previews (any user agent that doesn't start with "Mozilla/", plus a bot list adapted from Minilytics, MIT)
  - the shop owner browsing their own shop (`ignoreShop`, set in `$shop/route.tsx`)
- **Product view counter:** `products.views` goes up once per product per visit.
- **Orders:** each order stores `source`, `link_tag`, `visitor_id` and `session_id` from the buyer's visit (`placeOrder` takes `visit`). This is how sales are credited to channels.
- **Counting rules:**
  - A visit is a distinct `session_id`. Events from before sessions existed count one visit per `view_shop`.
  - Days are in Tanzania time (UTC+3).
  - Sales are confirmed, sent and delivered orders.
- **Analytics page** (`/app/analytics?days=7|30|90`):
  - headline numbers compared with the period before, and a daily chart
  - channels, the funnel, products, sizes, the day-by-hour activity map, taps and shares, areas, phones and cities
  - buyers with CSV downloads, and tagged links (`links` table)
  - On phones it's reached from Home; on desktop, from the sidebar.
- **Scale note:** queries read raw events with indexes, which is fine at today's volume. When a shop passes about 100k events in 90 days, add nightly totals (`stats_daily`, Cron) as the roadmap says.
- **Demo data:** `scripts/seed-zee-history.mjs` generates visits, sessions, sources, tags, funnel steps, taps and attributed orders for Zee's Store.

## Before you say it's done
1. `npx tsc --noEmit` passes.
2. Screenshot the screen at 390 and 1440 wide (Playwright) and look at it: alignment, wrapping, contrast, empty states.
3. Run the flow you touched in a browser (order, payment, product save), then remove any test data.
4. Check the screen against this file: one accent used by the rules, no new colours, no new fonts, no emoji, no uppercase labels.

Discovery notes and founder decisions are outside this repo (`../Shopi-discovery-notes.md`). Keep them out of the public repo.
