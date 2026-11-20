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
| `src/components/ui.tsx` | App-wide parts (DESIGN.md "The shared parts"): `Page`, `TopBar`, `PhoneBar`, `PageHead`, `Card`, `CardHead`, `Notice`, `Stat`, `Nothing`, `Field`, `FieldGroup`, `Label`, `BackButton`, `Chips`, `StatusPill`, `InvoicePill`, `CheckRow`, `CopyRow`, `Img`, `ShopAvatar`, `Money`, `Delta`, `Sheet`, `Field`, `Switch`, `Empty`, `Toast`, `TextLink`, `ErrorText`, `LangSwitch`, `Wordmark` |
| `src/components/shop.tsx` | Storefront parts: `ProductGrid` (the grid with quick add and its toast), `TopPicks` (the band above it) and `pickedProducts`, `ProductCard` (with its Buy pill), `QuickAddSheet`, `Price`, `Tag`, `BagButton`, `ShopTopBar`, `ShopFacts`, `FactPills`, `SocialLinks`, `ShopFooter`, `MadeWithShopi` |
| `src/components/floating-nav.tsx` | The phone capsule: `FloatingNav`, `NavTab`, `NavCenter`, `NavCount`, `useHideFloatingNav` |
| `src/components/shop-nav.tsx` | The storefront's capsule with its search and info sheets |
| `src/components/not-found.tsx` | Not-found pages for missing shops, products and orders |
| `src/components/share.tsx` | `ShareActions` (WhatsApp, copy link, native share) and `prettyUrl` |
| `src/components/product-form.tsx` | New and edit product: photos, options editor (kind, stock, own price, own photo), save guards, "send this product" |
| `src/routes/app/products/import.tsx`, `src/components/import.tsx` | Bulk import from a sheet: pick (file, paste, template), match columns, check, run in chunks, done |
| `src/lib/sheet.ts`, `src/lib/import.ts` | Reading .xlsx/CSV/pasted rows in the browser (no library); column guessing and the row rules (`buildDrafts`) |
| `src/server/products.ts` | `cleanProduct()` (the one set of product rules for the form and the import) and product slugs |
| `src/lib/theme.ts` | A shop's look: the 12 colours, the 6 font styles, `themeStyle()` (the CSS variables), the readability maths, `logoColors()` |
| `src/lib/host.ts`, `src/server/domains.ts`, `src/server/cloudflare.ts` | Shops' own domains: the address rewrite (`shopRewrite`), domain lookup and status, Cloudflare's API (custom hostnames, the Turnstile widget's hostnames) |
| `src/routes/app/domain.tsx`, `src/lib/api/domains.ts` | "Your own domain": connect, the CNAME to add, status, disconnect |
| `src/routes/app/look.tsx`, `src/components/look.tsx`, `src/lib/api/look.ts` | Shop look: cover, colour (logo suggestions, tested, own), style of the name, live preview; `saveShopLook` |
| `src/components/auth.tsx` | `AuthLayout` (form left, dark product panel right), `StepBar` ("2 of 5"), `PasswordInput` |
| `src/routes/onboard.tsx`, `src/components/setup.tsx`, `src/lib/setup.ts`, `src/lib/api/setup.ts`, `src/server/setup.ts` | The five-step setup: the route and step 1; steps 2 to 5 and the shop preview; which step to show; its server functions; `passStep` |
| `src/lib/email.ts`, `src/server/email.ts`, `src/server/email-templates.ts`, `src/lib/api/email.ts`, `src/components/email.tsx`, `src/routes/email/`, `src/routes/api/email-off.ts`, `src/routes/api/admin-email-preview.ts` | Email to sellers through Resend: `EMAIL_LIVE` and the kinds; sending, confirm links, unsubscribe, receipts and the weekly summary; the templates; the seller's server functions; the Home row and Shop settings group; the stop/remove page; one-click unsubscribe; /admin previews |
| `src/lib/staff.ts`, `src/server/staff.ts`, `src/lib/api/staff.ts`, `src/routes/app/staff.tsx`, `src/routes/join/$code.tsx`, `src/routes/paused.tsx` | Shop assistants: roles and areas (`allows`, `landing`, `areaOfPath`); invite codes and the list; the owner's and the invite page's server functions; the owner's page; the invite page; the paused page |
| `src/lib/score.ts`, `src/server/score.ts` | The shop score: the eight items, points and the next step (browser-safe); its facts as one SQL fragment for Home and `/admin` |
| `src/components/showcase.tsx` | Coded product previews for the landing and auth pages (phone, mini store, order card, payment slip) |
| `src/components/brand-icons.tsx` | One-colour social icons, plus `WhatsAppMark` (WhatsApp's green mark) |
| `src/routes/index.tsx` | Landing page |
| `src/routes/$shop/` | Storefront `index`, product page `$product` (readable slug), `checkout`, `p.$id` (301 redirect for old links) |
| `src/routes/$shop/b.$code.tsx` | A bag link the buyer opens: checkout with the seller's lines and prices, or why it can't be ordered |
| `src/routes/$shop/c.$slug.tsx` | A collection's own page: its products in the seller's order, chips to the others, quick add |
| `src/routes/admin/`, `src/components/admin.tsx`, `src/server/admin.ts`, `src/lib/api/admin.ts` | The owner (CEO) dashboard at `/admin`, for users with `is_admin` only: six sections, a page per shop, a CSV of shops |
| `src/routes/o/$code.tsx` | Buyer's order page: pay, paste SMS, progress |
| `src/routes/app/` | Seller app: `route.tsx` (sidebar and floating bottom nav), dashboard, `analytics`, orders, products, shop settings |
| `src/routes/app/bags/` | Bag links: the list, `new` (build a bag for one buyer), `$id` (send it, cancel it) |
| `src/components/checkout.tsx` | `CheckoutView` (bag, details, delivery, payment, receipt and Place order), shared by checkout and bag links; `CheckoutHeader`; `LocationField` (Share my location, paste a location link) |
| `src/lib/location.ts` | Delivery pins: `readMapLink` (Google Maps, WhatsApp, Apple Maps, OpenStreetMap links, `geo:`, plain coordinates), `pinLink` (opens Google Maps, no key), `distance`, `ROUGH_M` |
| `src/components/whatsapp.tsx` | `openWhatsApp` (same tab on phones, an Android `intent:` inside Instagram/TikTok), `useWhatsApp`, `WhatsAppHelp` (number with Copy and Call, Copy message, the in-app browser way out) |
| `src/components/product-picker.tsx` | `ProductPicker`: search the seller's products and pick one (Record a sale, bag links) |
| `src/routes/app/collections/` | Collections: the list (order, share), `new` and `$id` (`CollectionForm` in `components/collections.tsx`) |
| `src/components/picks.tsx`, `src/lib/api/picks.ts`, `src/server/picks.ts` | Top picks: the four slots on Products (`TopPicksCard`), `getMyPicks`/`savePicks`, `readPicks`/`writePicks`/`setPick` |
| `src/routes/app/discounts.tsx` | Discount codes: each code with its uses, on/off, Share (as a link) and the new/edit sheet |
| `src/components/stock-alerts.tsx` | Back in stock: `NotifySheet` (a buyer leaves a WhatsApp number), `useAsked`, `WaitingCard` (the seller's list, a prefilled WhatsApp message each, Done) |
| `src/components/phone-app.tsx` | The seller's phone: `PhoneAlertsCard` (Home) and `PhoneAppSettings` (Shop settings) for notifications and installing |
| `src/lib/push.ts`, `src/server/push.ts`, `public/sw.js` | Web push: `usePhoneApp` and the install offer (browser), `notifySeller` (server), the service worker that shows them |
| `src/lib/discounts.ts` | Discount rules shared by checkout and the server: `discountOff()`, `cleanCode()`, `codeKey()` |
| `src/server/ai.ts`, `src/lib/api/ai.ts`, `src/components/ai-write.tsx` | AI for sellers: the OpenAI-compatible client (Groq live), the allowance (`ai_uses`), "Write it for me" under a product's description |
| `src/lib/qr.ts`, `src/lib/qr-card.ts`, `src/components/qr.tsx`, `src/components/qr-sheet.tsx` | The shop's QR code: the encoder (no library), the printable card drawn on a canvas, `QrCode`/`ShopQr` for buyers, `QrSheet` for sellers |
| `src/server/selcom.ts`, `src/server/billing.ts`, `src/lib/api/billing.ts`, `src/components/pay-tembo.tsx`, `src/routes/api/selcom.ts` | Tembo billing through Selcom: the proxy client, payments (start, Lipa Namba, complete once, re-check, reminders), the seller's server functions, the payment sheet, Selcom's callback |
| `src/lib/booking.ts`, `src/server/bookings.ts`, `src/lib/api/booking.ts`, `src/lib/api/services.ts` | Shopi for services: the rules (hours, free times, days and times in Tanzania time); the guarded insert and move; the public server functions (book, the client's page, cancel, move); the business's (services, hours, time off, the diary) |
| `src/components/booking.tsx`, `src/components/hours.tsx`, `src/components/diary.tsx`, `src/components/setup-services.tsx` | `DayStrip`, `TimeGrid`, `ServiceList`, `ServiceForm`; the working-hours fields; the diary's sheets (a booking, add by hand, move, time off) and the WhatsApp messages; the setup's service and hours steps |
| `src/lib/invoice.ts`, `src/server/invoices.ts`, `src/lib/api/invoices.ts`, `src/lib/api/invoice-public.ts` | Shopi Invoices: the shared rules (kinds, money in cents, `computeTotals`, `invoiceState`, settings, WhatsApp messages and reminders, `DocData`); reading, numbering, `recalcPaid`, `keepClient`, `invoiceShop`, Home's `homeInvoices`; the business's server functions; the client's (the link, the payment SMS, accepting a quote) |
| `src/components/invoice.tsx`, `src/components/invoice-form.tsx`, `src/lib/invoice-pdf.tsx`, `src/components/setup-invoices.tsx` | `InvoiceDocument` (the document as a page) and `usePdf`/`PdfButton`; the editor (`InvoiceForm`, `AmountInput`); the A4 PDF (@react-pdf/renderer, browser only); the setup's steps 2 to 4 for a business that bills |
| `src/routes/app/invoices/`, `src/routes/app/clients.tsx`, `src/routes/i/$code.tsx` | Invoices (list, `new`, `edit/$id`, `$id`, `settings`), Clients, and the client's invoice page |
| `src/routes/app/services.tsx`, `src/routes/app/hours.tsx`, `src/routes/app/bookings.tsx`, `src/routes/$shop/book.$id.tsx`, `src/routes/bk/$code.tsx` | Services, Working hours and the diary (seller); a service's booking page and the client's own booking page (buyer) |
| `src/server.ts` | The Worker entry: TanStack Start answers requests; `scheduled` runs the cron jobs in `src/server/jobs.ts` |
| `src/lib/api/` | Server functions: `store.ts` (public), `merchant.ts` (seller), `analytics.ts` (seller analytics, tagged links), `bags.ts` (bag links), `discounts.ts`, `collections.ts`, `alerts.ts` (back in stock), `push.ts` (notification subscriptions), `imports.ts` (bulk import), `picks.ts` (top picks), `session.ts` |
| `src/lib/seo.ts` | Search: `SITE`, `canonical()`, titles and descriptions per page, JSON-LD (`ld`, `storeSchema`, `productSchema`, `breadcrumbSchema`); `src/routes/sitemap[.]xml.ts` |
| `src/lib/analytics.ts` | The buyer-side tracker: visitor ID, 30-minute visits, traffic source, `?s=` link tags, `track()` |
| `src/routes/api/e.ts` | Receives analytics events (sendBeacon); drops bots, records device and city |
| `src/routes/api/export.ts` | CSV downloads of orders and buyers for the logged-in seller |
| `src/lib/format.ts` | `tzs()`, phone, slugs (`slugify`, `productSlug`), statuses, categories, size presets, options (`priceOf`, `imageOf`, `OPTION_KINDS`) |
| `design/brand/glyphs.py` | Source of the logo, app icon and favicon. Old boards are in `design/archive/`. |

## Design system
**Read `DESIGN.md` before changing any screen** (imported here, so every session has it): the rules that never bend,
the type, radius and icon scales (tokens in `src/styles.css`), colour and the one accent, type, components, layout
patterns, motion, copy and the logo. `npm run check:design` enforces the scales.

@DESIGN.md

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
- Shop `lang`: `sw` or `en`, the language buyers see the shop in (see Copy). Read it with `asLang()`.
- Shop `status`: `active`, or `demo` for a sample shop (Zee's Store). A demo shop shows `DemoBanner` on every page, has
  `noindex`, and `placeOrder` refuses its orders (`error: 'demo'`); checkout disables the button too. Any other status hides the shop.
- Plans (`src/lib/plans.ts`, the founder's model of 17 Nov 2026): **Free** (TSh 0, no time limit, up to
  `FREE_PRODUCTS` = 300 products) and **Tembo** (TSh 99,000 a year, flat; shown with "about TSh 8,250 a month"). No trial,
  no Twiga, and a shop never pauses: a Tembo shop that doesn't renew goes back to Free. `planState()` gives demo, free or
  tembo (`plan = 'tembo'` with `paid_until` in the future); `can(plan, feature, { using })` is the one entitlement check,
  used by server functions and screens. Tembo features: `domain`, `fonts` (shops already using either keep it until
  `GRACE_UNTIL`, the end of 31 Dec 2026), `hideBadge` (`shops.hide_badge`, migration 0022, a switch in Shop settings; buyer
  pages read `shop.badge`), `fullAnalytics` (90 days, channels, funnel, hours, buyers and downloads, tagged links;
  `/api/export` refuses free shops; a free shop asking for 90 days gets 30) and `unlimitedProducts` (`saveProduct` and
  `importProducts` stop a free shop at 300 and say why). Demo shops get everything. The plan rides with the session
  (`session.shop.plan`), so screens use `useCan()` and show `TemboLock` / `TemboPill` (`components/tembo.tsx`); the plan
  cards and prices come from `PlanPrice` / `PlanItems` (`components/plans.tsx`), items not built yet carry "Soon".
  `BILLING_LIVE` stays false until the founder's own real payment of the full amount has gone through end to end;
  until then only admins can pay (`canPay()`), so the founder can make that payment (see Tembo billing below).
- **Tembo billing** (roadmap `billing` + `o-tembo`, built 18 Nov 2026; migration `0024_billing.sql`): CV Chap Chap's Selcom
  flow, copied on the founder's word. Notes on CV's side: `../design/notes/selcom-from-cv-chap-chap.md`.
  - **The path:** the Worker calls Driftmark's signing proxy (`SELCOM_PROXY_URL` = `http://selcom-proxy.shopi.tz`, an A
    record to the whitelisted droplet, DNS only; `SELCOM_PROXY_TOKEN`; both Worker secrets), which signs and forwards to
    Selcom. Workers can't fetch a bare IP, hence the name. Plain HTTP like CV's today; https needs certbot on the shared
    droplet (the founder's SSH OK). Calls time out after 25 s (`callProxy`). Locally `.dev.vars` points at a fake proxy
    (never the real one: it moves real money): `node scripts/fake-selcom.mjs` on port 8799, where numbers ending 000
    are refused (empty wallet), 111 pay after 6 s, 222 cancel, 333 get no prompt (pay by hand with
    `POST /test/pay?order_id=…`, add `&quiet=1` to skip the callback and test the cron).
  - **Rows first:** `payments` (id = Selcom's order id `SHOPI-<ms>-<10 hex>`: the prefix is the only way to tell Shopi's
    money from CV's in the shared Driftmark account; remarks "Shopi Tembo <slug>"; `buyer_email` falls back to
    `<phone>@shopi.tz`), `payment_events` (created, completed, failed, amount_mismatch, rechecked, pushed_again),
    `webhook_events` (callbacks handled), `admin_log` (the owner's manual actions). Kept as business records (Privacy).
  - **Nothing is trusted but Selcom's order-status.** The screen polls `temboPayment` every 3 s (pending rows are asked of
    Selcom live); Selcom's callback (`/api/selcom`, rate limited, only `SHOPI-` ids) is a hint that triggers the same
    question, answers 503 when Selcom can't be asked, and records pending answers nowhere so the retry still counts.
    Shopi has no Selcom API secret, so callback signatures are not checked (CV never verified one either).
  - **Completing once:** `completePayment` is one D1 batch: the shop's `paid_until` becomes the later of now and its
    current end, plus 365 days, and `plan = 'tembo'`, only while the row isn't completed; then the row flips. A late
    payment on a row closed as abandoned still completes. The seller gets a push ("Tembo is on").
  - **The seller's screen** (`PayTembo`, a sheet from the plan page; Renew shows in Tembo's last 30 days): the number
    (any Tanzanian mobile money number) and Pay; "Check your phone" with the order's own Lipa Namba printed at once;
    after 15 s "Send the prompt again" (20 s cooldown) and "Pay with Lipa Namba"; after 60 s the Lipa Namba card opens
    by itself (dial *150*50*1#, the number, the amount, "check the name reads DRIFTMARK TECHNOLOGI"); a declined prompt
    or a closed Lipa Namba hands over a new number up to twice; "Use another number" keeps checking the old payment.
    Closing the sheet is safe: the cron finishes the payment. Refusals become plain words (`describeSelcomFailure`:
    balance, number, unreachable; an empty wallet is not worth retrying). **No answer is not a refusal:** a start that
    times out or can't reach the proxy keeps its row pending (event `start_unanswered`), since the prompt may have gone
    out; only a refusal from Selcom marks it failed.
  - **No second year by mistake:** before a new payment starts, `paidMeanwhile` asks Selcom about the shop's payments
    still pending from the last 35 minutes (a number the seller moved away from, a sheet closed while waiting); one
    that turned out paid is shown as paid instead. The sheet keeps the payments it left while the plan page is open.
  - **Lipa Namba** (`lipaNamba`): the open order's own `payment_token` while 25 of Selcom's 30 minutes remain, else an
    open Lipa order already made for it (`manual_for`), else a new order with no prompt.
  - **Re-checks:** the cron `*/5 * * * *` (`FREQUENT` in `jobs.ts`) asks Selcom about pending rows older than 2 minutes
    and closes rows Selcom still calls unpaid after 2 hours as `abandoned_unpaid`. `/admin` Money lists the newest 20
    payments with Re-check (written to `admin_log`) and whether the proxy answers (`proxyHealth`).
  - **Reminders:** the nightly job notifies sellers 7 days before Tembo ends, the day before and on the day
    (`remindRenewals`), only once `BILLING_LIVE` is on, by push and by email; the receipt is emailed after each payment.
  - Limits per shop: 8 starts an hour, 6 prompts again in 10 minutes, 10 new Lipa Namba orders an hour (`LIMITS.pay*`;
    showing a number that exists isn't counted).
  - Reviewed 18 Nov by a second agent against CV's code. Known and left as in CV: the cron takes the 50 oldest pending
    rows, so 50 rows whose status call keeps failing would starve newer ones (add a `checked_at` order if it happens).
  - **Never rebuild "paste the SMS receipt" for Shopi's own billing**: CV retired it as insecure.
- **The landing page** (`src/routes/index.tsx`, the coded pictures in `src/components/showcase.tsx`; reviewed and
  brought in line on 18 Nov 2026): say only what is live, and "Soon" or "Coming next" for the rest. Tembo's wording
  follows `BILLING_LIVE` (the Tembo button, the line under the plans and the cost answer say paying opens soon until
  billing is open to every seller). The hero phone (`MiniStore`) is drawn after the real shop on a phone (top bar with
  the bag, facts, Buy pills, the capsule); change it when the shop changes. The coded pictures' labels go through
  `t()`; what a seller or buyer typed stays as written. The dashboard pictures are Zee's Store's Home (local demo,
  `node scripts/seed-zee-history.mjs --rising` first, so its changes point up) at 1440x900 x4/3 and 390x844 x2, in English and Swahili
  (`public/images/shopi-seller-dashboard-{desktop,phone}[-sw].webp`); phones get the phone picture. Retake them
  when Home changes. The top bar has the language switch. Long Swahili labels on the plan buttons wrap.
- Optional shop fields: `maps_url` (Google Maps links only, `mapsLink()`) gives buyers Directions; `tin` (9 digits, `tinDigits()`,
  shown as `formatTin()` 123-456-789) appears in `ShopFacts`, the Info sheet and on receipts, not in the phone pills.
- Delivery fees are not in Shopi: buyer and seller agree them on WhatsApp. Shops list delivery areas by name only, as
  information on the shop page (the facts name up to three, "and 4 more"; the Info sheet lists them as chips), and say
  whether they send to other regions (`shops.ships_regions`, `regions_note`, migration `0023`; Shop settings > Delivery):
  buyers ask "mikoani mnatuma?" before anything else.
- Checkout v2 (17 Nov 2026, the founder's answers; migration `0023_checkout_v2.sql`): no area picker and no "Nearby
  landmark". The buyer types their area (required; a `<datalist>` offers the shop's areas, then `DAR_AREAS`, so spellings
  stay close for Analytics), may tap **Share my location** (GPS, `enableHighAccuracy`) or **paste a location link**
  (`readMapLink`; Google's maps.app.goo.gl short links are opened by `expandMapLink` on the server, Google hosts only,
  redirects only, `LIMITS.mapLink` per IP), and adds an optional **Note for the rider** (stored in `orders.landmark`).
  "Note for the seller" sits behind "Add a note for the seller". Orders store `lat`, `lng` and `pin_m` (GPS accuracy;
  over `ROUGH_M` = 300 m the buyer is asked for a note and the seller sees "Rough pin"). The seller's order page has
  "Open in Google Maps" and **Send to rider on WhatsApp** (`wa.me/?text=`: buyer, number, area and note, the map link,
  the lines, and "Collect TSh … in cash" for cash on delivery); the orders CSV has a Map column. The buyer's order page
  says "Location shared with {shop}", never the point itself. **Pins are cleared 90 days after the order** by the
  nightly job (`purgePins`, Privacy page). **Returning buyers:** the phone remembers name, number, area, note, pin and
  way to pay (`shopi_buyer` in localStorage), so checkout shows one "Deliver to" card with Change; a bag link made for
  another number starts clean. No Google key is needed for any of this; the Google map (draggable pin, place search,
  reverse geocoding filling the area) is the next step once billing is Active and `GOOGLE_MAPS_KEY` is set (`map-pin`).
- WhatsApp buttons on buyer pages (shop header, capsule, product page, order page, bag link) go through
  `openWhatsApp`: on a phone the `wa.me` link opens in the same tab (some in-app browsers ignore new tabs), on Android
  inside Instagram/TikTok/Facebook an `intent://send…;scheme=whatsapp` link with `wa.me` as the fallback; desktop keeps
  a new tab. After a tap, `WhatsAppHelp` shows under the main buttons (shop header, product page, order page): "WhatsApp
  didn't open?", the number with Copy and Call, Copy message, and in an in-app browser "tap ⋯, then Open in browser".
  Not yet tried in the real Instagram and TikTok apps.
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
- Top picks (`products.pick_rank`, 1 to 4 or NULL; migration `0020_top_picks.sql`; roadmap `q-picks`, decision n6): up to
  four products the seller puts first. Seller: a four-slot card on Products (`TopPicksCard`, shown from 2 products): an
  empty slot adds one through `ProductPicker` (visible products only, sold-out ones disabled), a filled slot opens a sheet
  (Earlier, Later, Choose another product, Take out), and every change saves at once (`savePicks`). The product form has a
  "Top pick" switch (sent only when it changes; disabled with a note when four are taken). `writePicks` clears the shop's
  ranks and sets them 1..n in one batch (a partial unique index guards shop and rank); `setPick` appends or removes one.
  Buyers: `getStorefront` returns `picks` (ids in order) from the same products query; the shop page shows `TopPicks`
  above the chips only when at least 2 are visible and in stock (`pickedProducts`, `MIN_PICKS`), sold-out ones left out.
  On phones it is a row of larger cards to swipe (68% wide, the next one peeking); from md up, four across. The label is
  "Top picks" ("Chaguo letu"); "Best sellers" is kept for a list worked out from real orders. Opening one tags its
  `view_product` with `pick` (`openedFrom`/`takeOpenedFrom` in `lib/analytics.ts`, a sessionStorage note kept 10 s).
  With the band showing, the grid below loads no photos eagerly (`ProductGrid eager={0}`). Discover will use the picks.
- Back-in-stock alerts (`stock_alerts`, helpers in `src/server/alerts.ts`): on the product page a sold-out product or option
  (sold-out option chips stay choosable, outlined with a line through) offers "Notify me when it's back": a sheet with the
  buyer's WhatsApp number (remembered from checkout) and a consent line; tapping the button is the consent. One alert per
  product, option and number; demo shops refuse (`error: 'demo'`), and so does anything in stock. Shopi has no WhatsApp
  Business API yet, so the seller sends each message from their own WhatsApp: Products shows "{n} waiting", the product
  page's `WaitingCard` gives a prefilled wa.me message per person and a check that deletes the alert, and Home shows
  "Back in stock, and buyers are waiting" once what they asked for can be bought (`getDashboard().backInStock`).
  Alerts are deleted when done and after 90 days at most (Privacy page), by the nightly job (below).
- "Open your own shop" (roadmap `q-footer`, migration `0021_signup_ref.sql`): every link from a shop to Shopi carries the
  shop, `refLink(slug, 'footer' | 'order' | 'banner')` in `lib/host.ts` (`shopi.tz/?ref=<slug>&s=…`): the shop footer's
  card, `MadeWithShopi` (checkout and bag links keep the quiet "Shop made with" line; the order page, where the buyer has
  finished, adds "Open your own shop") and the demo banner. The landing keeps `ref` 30 days in the `shopi_ref` cookie (the
  latest wins); `signup` stores the shop's id in `users.ref_shop` and clears the cookie. The Privacy page names both. The
  owner dashboard shows "Sellers brought by shops" (Growth) and "Sellers it brought" (a shop's page). The invite reward
  (`referral`, decision n13) builds on it.
- **The five-step setup** (roadmap `o-flow`, decision n1; built 18 Nov 2026; migration `0026_setup.sql`). After sign-up
  (name, phone, password; no step bar), `/onboard` runs five screens, one decision each, with a bar and "2 of 5"
  (`StepBar`). Rules in `src/lib/setup.ts`, step 1 and the route in `src/routes/onboard.tsx`, steps 2 to 5 and the
  preview in `src/components/setup.tsx`, server functions in `src/lib/api/setup.ts`.
  1. **Your shop:** paste an Instagram/TikTok/WhatsApp link (below) or type the name; the link is claimed under it
     (`checkSlug`); what it sells (one chip). The shop's language (the app's) and WhatsApp (the sign-up number) are one
     quiet line with Change, which opens `ShopLangChoice` and the number. `createShop` sets `setup_step = 1`.
  2. **Your first product:** photos (one required to save), name, price, description with "Write it for me" (`ai`
     only), and a folded "Buyers choose a size" with the size presets. Save goes through `saveProduct`/`cleanProduct`.
     "I’ll do this later" skips; "Import them from a sheet" goes to the import (products then answer this step).
  3. **How buyers pay:** network chips, Lipa Namba or number, the name on payments (`saveSetupPayment`; a number that
     reads as a Tanzanian mobile is marked personal). "Only cash on delivery for now" passes the step on purpose.
  4. **Your shop is live:** the link with WhatsApp, Copy and native share (`ShareActions`, tracked as `seller_share`
     `setup-<how>`), the QR card (`QrSheet`), the shop as buyers see it (`LiveCard`; a phone frame on desktop) where
     "Add a line about your shop" opens a sheet with the bio and "Write it for me" (`WriteBio`), and "Put it in your
     Instagram bio" (`BioSteps`: Edit profile, Links, Add external link; TikTok: Edit profile, Website).
  5. **Orders on your phone:** turn on notifications (`usePhoneApp`, a test push), install the app or the iPhone guide
     (`InstallSheet`), then "Go to my shop". `catchInstallPrompt()` runs on `/onboard` too.
  - **Resumable:** `shops.setup_step` keeps the furthest step passed (`passStep` in `src/server/setup.ts`, never back);
    the step shown is the next one, skipping 2 when the shop has a product and 3 when it has a Lipa Namba
    (`nextSetupStep`). Home (`/app/` index) sends a shop with `setup_step` 1 to 4 back to `/onboard`; other seller pages
    stay open (the import, a push's order link). Shops opened before this have `setup_step` NULL and never see it. The
    session carries it (`session.shop.setup`).
  - **Recorded:** `setup_steps` gets a row per step passed (`done` or `skip`, seconds on its screen); `/admin` Shops shows
    "The five-step setup" (passed, skipped, the median time per step, shops still in it). No personal data.
  - Desktop: the dark panel shows the shop taking shape (`ShopCard`: name, category, the product being typed, the
    payment line), the live shop in a phone at step 4, and a sample order notification at step 5 (`OrderNotice`).
    Phones get the same preview as a small card that opens it (`PreviewToggle`), and step 4 shows the card inline.
- **The shop score** (`src/lib/score.ts`, the founder: "every shop owner reaches a 100% set-up shop"): 100 points over
  eight items: name and link 10; three shown products with a photo, a price and a description 30 (10 each); a way to be
  paid 10 (a Lipa Namba, or cash on delivery on purpose: setup step 3 passed, or a shop older than the setup); WhatsApp
  10; logo 10; delivery areas or "we send to other regions" 10; the link shared from Shopi once (a `seller_share`
  event: setup, Home's Copy/Share, a product's Send, the QR card) 10; the link in a bio (a visit with source
  `instagram` or `tiktok`, or tag `bio`) 10. The facts are one SQL fragment (`scoreSelect` in `src/server/score.ts`)
  shared by Home (`getDashboard().score`) and `/admin`. **Home:** no product yet, the large "Add your first product"
  card with "Your shop is 30% ready" above it; then `ScoreCard`: the percentage, its bar, the one next step with its
  button (products first, then the Lipa Namba, then the rest in order; a product missing a description opens it with
  "Write it for me" when AI is on), and "See all" for the eight items. A shop with orders gets it as one line that
  opens. Gone at 100%. **/admin:** the Shops table's Ready column, "How ready shops are" (bands and each item's
  count), a shop's page lists what it still misses; the CSV has "Ready (%)".
- **Email to sellers** (roadmap `o-email`, decision n11; built 18 Nov 2026; migration `0027_email.sql`). Optional,
  never at sign-up: a quiet row on Home (while there is no email and the shop has a product; "Not now" hides it 30
  days) and an Email group in Shop settings. **No confirm step** (the founder, 18 Nov: most sellers rarely use email,
  so nothing stands between them and their receipts): the seller types an address, chooses "A summary each Monday"
  (shown on) and taps Save my email; it works at once (`users.email_ok` = when saved). Two light guards instead:
  - a typo hint while typing (`suggestEmail`: gmial.com, yahoo.con, hotmial.com… offered as a one-tap fix);
  - **"Your email is set"** (`added`) goes to the address at once, with "Not you, or not your shop? Remove this
    address": `/email/off?w=remove`, one tap, no log-in, which takes the address off the shop and stops all email to
    it. So a stranger whose address was typed can undo it, and Resend sees few complaints.
  Each new address gets a new `email_key`, so links in mail to an old one stop working. Shop settings shows the
  address with Change and Remove, and the two choices (the Monday summary, News from Shopi; news has no sender yet).
  - **Sending** (`src/server/email.ts`): Resend's HTTP API (`POST https://api.resend.com/emails`, read from their docs
    18 Nov: a `User-Agent` header is required and a Worker doesn't add one; `Idempotency-Key` kept 24 h; 10 requests a
    second per team) from `Shopi <hello@shopi.tz>`, replies to hello@shopi.tz (forwards to the founder). Any saved
    address gets mail. Sends run after the response (`later`, `waitUntil`) or in the nightly
    job. `email_log` keeps kind, outcome and Resend's id per user, never the address or the body; about 13 months.
  - **`EMAIL_LIVE`** (`src/lib/email.ts`) is **on since 19 Nov 2026** (the founder's OK, after the 8 test emails landed
    in Primary): every seller sees Home's email row and Shop settings' Email group. Off, only admins can add an email
    or get one, and anything else is logged `held`. Without `RESEND_API_KEY` (locally) nothing is sent: the email's
    links are printed (`[email] dry run`) and logged `dry`, so a link in it can be followed by hand.
  - **The emails** (`src/server/email-templates.ts`, plain HTML with inline styles and tables, and a text version; in
    the seller's language, `users.email_lang`, the app's when they added it): "Your email is set"; the **Tembo receipt** after
    `completePayment` (the receipt slip in mono: shop, plan, date, the number paid from masked as 0754 *** 456, Selcom's
    reference, the order; "Paid to Driftmark Technologies Limited … It is not a TRA fiscal receipt"); **renewal**
    reminders 7 days, 1 day and on the day (with the push ones in `remindRenewals`, so only once `BILLING_LIVE`); the
    **weekly summary** on Mondays (Dar) for last Monday to Sunday: visits, orders, sales with the change from the week
    before as rows, payments to check, the best seller; cancelled orders don't count; a week with no visit and no
    order sends nothing. Each seller (and each renewal) runs in its own try, so one error never stops the rest. Every seller
    value is escaped. The logo is `public/brand/shopi-wordmark-email.png` (from `design/brand/png`, 264 px wide).
  - **Unsubscribe:** optional kinds (the weekly summary) carry a footer link to `/email/off` (one tap, no log-in; the
    proof is `users.email_key`, random per user) and `List-Unsubscribe` / `List-Unsubscribe-Post` headers for the
    one-click POST to `/api/email-off` (RFC 8058); a mail app that opens that address instead (GET) is sent to the stop
    page. Receipts and reminders about the plan have none (essential), but "Your email is set" and Shop settings let the
    address be removed.
  - **/admin Health > Email:** whether the Resend key is saved and email is open, sellers with an address,
    on the weekly summary, the last failure, sends in the range by kind and outcome; each kind to open in English and
    Swahili (`/api/admin-email-preview?kind=added|receipt|renewal|weekly&lang=…`, `&text=1` for the text version); and **Send a test** of any
    kind, with sample data and "[Test]" in the subject, to an address the founder types (works while EMAIL_LIVE is off).
  - Limits on "Your email is set", counted before they are checked (`take` in `limits.ts`, so a burst can't slip
    through together): 5 an hour per seller (`emailSend`), 3 to one address (`emailTo`, many accounts can't write to
    one person), 200 across Shopi (`emailAll`); 20 tests an hour per admin (`emailTest`). The words
    `email` and `brand` are reserved shop links; `/email/*` is one of Shopi's own pages on shops' domains.
  - Privacy names Resend and says what is kept and for how long.
- **Shop assistants** (roadmap `t-staff`, the founder's answers of 18 Nov 2026; migration `0028_staff.sql`). Up to
  `STAFF_MAX` = 2 people besides the owner help run a **Tembo** shop (`can(plan, 'staff')`), each with their own login and
  a role (`src/lib/staff.ts`):
  - **Orders:** orders, payment checks, Record a sale, bag links (and the product list, for the picker).
  - **Products:** products, photos, stock, collections, Top picks, back-in-stock lists, "Write it for me".
  - **Manager:** all of that plus Home (sales figures), Analytics and its downloads, Shop settings, look, discount codes.
    **Only a Manager sees sales totals** (the founder); Orders still sees each order's total, to take payment.
  - **The owner's alone:** Tembo and the plan page, the own domain, how buyers pay and reach the shop (Lipa Namba,
    its name and network, cash on delivery, the shop's WhatsApp: `updateShop` keeps the stored values when a Manager
    saves; the form hides Payments and disables WhatsApp), email, the five-step setup, and the assistants.
  - **One check:** `requireShop(area)` (`src/server/auth.ts`) finds the login's shop with `myShop()`: the one it owns,
    else the one it helps run (`shop_staff.user_id`; a unique index keeps one login to one shop). Areas are `orders`,
    `products`, `manage`, `owner`, `any`; **no argument means owner only**, so a new server function is the owner's
    until it names an area. The raw endpoints use `shopFor(area)`: uploads (`products` or `manage`), photo links
    (`products`), downloads (`manage`). The session carries `shop.role` and `shop.paused`. The `/app` layout's
    `beforeLoad` sends a role to its own start (`landing`: Home for owner and Manager, `/app/orders`, `/app/products`)
    when the page's area (`areaOfPath`) isn't theirs; Home's setup redirect is the owner's only.
  - **The seller app by role:** the sidebar, the + sheet and the capsule list only what the role opens; an Orders or
    Products assistant gets a three-slot capsule (their tab, +, Settings; `FloatingNav slots={3}`) and their own
    Settings on `/app/shop` (role, notifications for Orders, language, Log out). A Manager's Home hides the plan row,
    the email row, and says "Only the shop's owner can add it" for the Lipa Namba and WhatsApp steps of the score.
  - **The owner's page** (`/app/staff`, from Shop settings > Shop assistants, with the Tembo pill on Free): each
    assistant with role, number, "Joined … · Last log-in: …" (from their newest session) or the invite's state; Add
    an assistant (name, number, role) makes the link; Send the link again (pending only; the old link stops);
    Change role or remove. Refused: the owner's own number, a number already listed, a number that already runs a
    shop (owner or assistant), a third assistant, more than `LIMITS.staffInvite` links an hour.
  - **The invite** (`shopi.tz/join/<code>`; `join` is a reserved shop link and one of Shopi's own pages): 24 random
    characters, **only its SHA-256 is stored**, works once, for `INVITE_DAYS` = 7. The owner sends it from the sheet
    (WhatsApp to the assistant's number first). The page shows the shop, who invites, the role in the assistant's
    words (`ROLE_FOR_YOU`), the number (fixed), then: a name and a new password (no login for that number yet), the
    password of the number's login (same lock as logging in: `LIMITS.loginFails`), or one tap when that login is the
    one here. Someone else logged in on the phone is asked to log out first. `acceptInvite` claims the row only while
    it still waits on that very code (a new user made for it is deleted if the claim fails). `LIMITS.joinIp` per IP.
    No SMS check exists, so whoever holds the link can join as that number: the sheet says to send it only to them.
  - **Tembo ends: paused, kept** (the founder). `myShop` marks an assistant `paused` when the shop isn't Tembo (or
    demo); every server function refuses them, `/app` sends them to `/paused` ("Check again", Log out), and the
    owner's page shows them paused under a Tembo lock. Renewing brings them back as they were.
  - **Removing** deletes the row, their notifications for the shop and their sessions (logged out at once); their
    login stays theirs. Changing a role applies on their next page.
  - **Notifications:** `notifySeller(shop, note, to)`: `orders` (new order, payment to check) reaches the owner and
    Orders and Manager assistants while the shop is on Tembo; `owner` (Tembo is on, renewal reminders) the owner only.
  - **Not built:** who did what on an order (an activity line per assistant); an assistant opening their own shop
    with the same login (one login, one shop: they sign up with another number); SMS-checked invites.
  - `/admin` Product use counts "A shop assistant who joined"; sign-ups, the funnel, cohorts and "sign-ups without a
    shop" leave assistants out (they never open a shop). Privacy names what is kept and who sees what.
  - **Races closed in SQL:** the limit of 2 is checked in the statement that adds the row; `createShop` makes no shop
    for a login that joined as an assistant, and the invite's claim none for a login that owns a shop; two accepts of
    one link at once make one login. Reviewed 18 Nov by a second agent: no access hole; its crash (a hook after an
    early return in Home's `ScoreCard`) and the rest were fixed and re-tested.
- **Shopi for services** (roadmap `v-services`, the founder's answers of 19 Nov 2026; migration `0029_services.sql`). A
  salon, barber, masseuse or consultant lists services; clients pick a free time on the shop's link; the business sees
  every booking in a diary. Free on every plan (Tembo extras later). Rules in `src/lib/booking.ts`.
  - **One shop, both kinds:** `shops.kind` is `products` or `services`, asked at setup ("What do you sell?"), and only
    decides what comes first: the shop page's first section, the phone capsule (services: Home · Bookings · + ·
    Services · Shop; the shop's capsule gets Book in the middle instead of the bag), the sidebar's order, Home's first
    card, the setup's steps 2 and 3. A shop may hold both; Services > "What your link shows first" changes it. The
    session carries `shop.kind`. Service categories are `SERVICE_CATEGORIES`; read a saved one with `ALL_CATEGORIES`.
  - **A service** (`services`): name, minutes (`DURATIONS`, or any 5 to 480), price (0 = agreed with the client;
    `price_from` reads "From TSh …"), optional description, who does it and one photo, on/off, order. Up to 100.
  - **Working hours** (`shops.book`, JSON `BookSettings`; `/app/hours`, `manage`): each weekday's open and close, one
    break for every working day, how far ahead (7, 14, 30, 60 days), `seats` (clients at once: three stylists, 3) and
    `confirm` ("I confirm each booking myself"). **NULL until saved once: nothing shows to clients or can be booked
    before that**, and Services and the diary say so. Time off (`book_blocks`): a whole day or part of one.
  - **Time is Tanzania's** (UTC+3, no daylight saving): a booking keeps `day` (YYYY-MM-DD), `start_min`/`end_min`
    (minutes from midnight) and `start_at` (ms). Times read on the 24-hour clock (`timeText`): "saa nne" and "10
    o'clock" are different hours. Short Swahili day names are the team's (J2, J3…, `shortDay`).
  - **Free times** (`freeTimes`, `whyNot`): starts every 30 minutes from opening (15 for a service that isn't a
    multiple of 30) and again from the end of the break; inside the hours, off the break and time off, at least
    `NOTICE_MIN` (60) minutes from now, within `ahead` days, and with a place free throughout (`hasPlace`: the count
    of clients only rises when a booking starts, so those moments are checked). Clients get times back, never names.
  - **No double booking:** the check and the write are one statement (`FREE` in `src/server/bookings.ts`, the same
    rule in SQL), in `insertBooking` and `moveBookingTo`. A cancelled booking frees its time; `HOLDING` statuses hold it.
  - **Booking** (`bookService`): **instant** by default (status `confirmed`); with `confirm` on it is `requested` and
    holds its time until the business confirms or declines. Guards: the bot check (action `book`), `LIMITS.bookIp`,
    and `BOOKINGS_PER_PHONE` = 2 upcoming online bookings per WhatsApp number per shop (in the insert too). Demo
    shops refuse. The page (`/<shop>/book/<id>`; `book` and `services` are reserved product links) opens on the first
    day that still has a free time and remembers the client's name and number (`shopi_buyer`).
  - **The client's page** (`shopi.tz/bk/<code>`, 8 characters; `bk` serves as-is on shops' own domains; never
    indexed): what and when, Message, Directions, **Change the time** and **Cancel** until it starts. The code is the
    only key, so the page says to keep the link; `LIMITS.bookPageIp` slows guessing. A move at a business that
    confirms goes back to `requested`.
  - **Statuses:** `requested` → `confirmed` → `done` or `noshow`; `cancelled` (by `client` or `shop`). Done and
    Didn't come can be swapped (a slip of the finger).
  - **The diary** (`/app/bookings?day=&view=week`, `orders` area; a week is loaded at a time): Day (a strip of the
    week with a dot on days with bookings, then the day in time order with time off between) and Week (seven columns
    from `lg`, a list of days on phones); requests to confirm and "n clients tomorrow" on top. A booking's sheet:
    WhatsApp with the right message for its state (`clientMessage`: reminder, confirmed, cancelled; in the shop's
    language; sent from the business's own WhatsApp, no API), Call, Confirm/Decline, Done/Didn't come, Change the
    time, Cancel, and the client's link to copy. **Add a booking** (a walk-in or a call: any time, in or out of the
    hours; a full time asks once, then saves) and **Time off** keep the link honest. `?add=1` opens Add (the + sheet).
  - **Areas** (`src/lib/staff.ts`): the diary and time off are `orders` work, services `products`, the hours `manage`.
  - **Notifications** (`notifySeller`, `orders`): New booking / Booking to confirm, cancelled, moved; each opens the
    diary on that day. The menu shows a Moto count for requests waiting (`getNavCounts`).
  - **Elsewhere:** Home's `DiaryCard` (today's bookings, the next one marked) for any shop with services and
    `FirstServiceCard`; the shop score reads services as products, the hours as the way to be paid and the location
    as delivery (`serves` in `src/lib/score.ts`); a services-only shop's facts say "Book a time online · Pay at your
    visit" and its hours, never delivery or cash on delivery (`shop.serves`); the setup's `ServiceStep` and
    `HoursStep`; the sitemap lists shops with bookable services; `/admin` Product use counts four lines; events
    `view_service` and `book`; Privacy says what a booking keeps and that it is deleted about 13 months after its day
    (`purgeBookings`, nightly).
  - **Not built** (after real businesses have used it): a deposit by Lipa Namba, home visits with a location, a
    video-call link, choosing a stylist (today: clients at once, per business), Tembo extras, bookings in Analytics
    and the weekly email, reminders sent by Shopi (needs the WhatsApp API or SMS), the landing page naming services.
- **Shopi Invoices** (roadmap `v-invoices`, the founder's answers of 20 Nov 2026; migration `0030_invoices.sql`). Taken
  over from Ankara (the founder's invoice app at `/Users/admin/Ankara`, closing): invoices and quotes for anyone who
  bills first and is paid later (freelancers, photographers, clearing and forwarding agents, consultants) and for every
  shop. Rules in `src/lib/invoice.ts`.
  - **A third kind of business:** `shops.kind` = `invoices` ("I send invoices" at setup; `asShopKind`, `ShopKind` in
    `lib/format.ts`; categories `INVOICE_CATEGORIES`). It only decides what comes first: Home leads with "Owed to you"
    (`OwedCard`, `homeInvoices`) instead of the shop score, the capsule is Home · Invoices · + · Clients · Shop, the
    sidebar lists Invoices and Clients first, the + sheet offers New invoice and New quote. Every other shop has
    Invoices in the sidebar and New invoice in the + sheet; an order and a booking each have **Make an invoice**
    (`?order=`, `?booking=` prefill the lines and the client; an order's discount comes as TSh off, and both start in
    TSh whatever the settings' currency, so the invoice's total is the order's). Such a business starts with cash on
    delivery off; its shop page with no products asks for a quote on WhatsApp instead of an empty grid. Services'
    "What your link shows first" isn't offered to it (`asShopKind` keeps `invoices`).
  - **The setup** for `invoices` (`nextSetupStep`): 2 How you look on invoices (address, email, TIN, VAT and VRN;
    skipped once `shops.bill` exists), 3 How clients pay you (Lipa Namba and/or bank details, days to pay; skipped with a
    Lipa Namba or bank details), 4 Your first invoice (client, what for, amount; then Send on WhatsApp / Copy link;
    skipped once an invoice exists), 5 Payments on your phone. The preview is the invoice itself (`sampleDoc`).
  - **Money is stored in cents** of the document's currency (`toCents`; TSh prints with no cents, USD with two). Lines
    are JSON with `price` in units and `tax` a percent; the server works the totals out again (`totalsCents`), never
    from the browser. Ankara's `computeTotals`: the discount comes off the subtotal, VAT per line on its share of the
    discounted base. `VAT` = 18, one tap per line; a business that set "I am registered for VAT" starts lines with it.
    **Every figure is rounded to the currency** (`computeTotals(…, currency)`, `lineTotal(l, currency)`,
    `roundMoney`): whole shillings for TSh, cents for USD. Before the 20 Nov review fix, TSh 12,345 + VAT stored
    14,567.10 and paying 14,567 left it part paid for ever. Payments are rounded the same way (`paymentCents`).
  - **Numbers** INV-0001 / QUO-0001 per shop and kind, taken in the same INSERT that writes the row (a unique index
    guards it; `insertInvoice` retries). The link is `shopi.tz/i/<code>` (10 random characters, never the number);
    `/i/` serves as-is on own domains (`AS_IS` in `lib/host.ts`). Pages opened per IP are limited (`invoicePageIp`).
  - **Status stored:** draft, sent, cancelled; a quote also accepted, declined. **Worked out when read**
    (`invoiceState`): viewed (opened by someone other than the business: `markInvoiceViewed` checks the login),
    part, paid, overdue (due day before today in Dar), expired (a quote), invoiced (a quote an invoice was made from).
    Draft → sent when the business sends it (WhatsApp, Copy link, the PDF), records a payment, or the client opens it.
    Only a draft never sent, with no payment and no invoice made from it, can be deleted; anything else is cancelled
    and can be reopened.
  - **Payments** (`invoice_payments`): the business records one (mobile, bank, cash, other; confirmed at once; more
    than twice the balance is refused as a typo), or the client pastes the confirmation SMS on the link
    (`sendInvoiceProof`: claimed, read with `parsePaymentSms`/`namesMatch` as on orders, one transaction pays one
    invoice once (partial unique index), `invoiceProofIp`/`invoiceProofDoc` limits). The business confirms (with the
    amount it really got) or says Not received; `paid` is always the sum of confirmed payments (`recalcPaid`), also
    after an edit changes the total. A confirmed payment can be taken back. The menu's orange count includes proofs
    waiting on invoices that aren't cancelled (`getNavCounts().invoiceChecks`); cancelling an invoice answers its
    waiting proofs as not received. **The currency is fixed once a payment exists** (sent or confirmed): the form
    locks the chips and says why (`held` from `getInvoiceEditor`), and `saveInvoice` refuses (`currency`), checked
    again in the UPDATE itself.
  - **Quotes:** no bank details on the document; the client can **Accept this quote** on the link (not once expired);
    the business makes the invoice (`invoiceFromQuote`: a new draft with `parent_id`, the quote accepted; a second tap
    returns the same invoice). **One quote, one live invoice:** `insertInvoice` writes a child only while its quote
    has no other live invoice (`INSERT … SELECT … WHERE NOT EXISTS`, so two taps at once make one); only a draft, sent
    or accepted quote converts; reopening a cancelled invoice whose quote has another live one is refused (`twin`).
  - **Clients** (`clients`): kept automatically when a document is saved (`keepClient`: the one picked, else the same
    phone, else the same name and company); each document keeps its own copy (`invoices.client`), so editing or
    removing a client never rewrites what was sent.
  - **Settings** (`shops.bill`, JSON `BillSettings`; `/app/invoices/settings`, the owner's: it says where money goes):
    address, email, VRN, VAT on new lines, bank details (free text: several accounts or one per currency, as WTL Africa
    needed in Ankara), payment terms, days to pay (0, 7, 14, 30), currency, language. The TIN stays in `shops.tin`, the
    Lipa Namba in `shops.lipa_*`. A new invoice copies the bank details and terms into its own fields.
  - **The document** (`InvoiceDocument` on screen, `invoice-pdf.tsx` for A4; one `DocData`, `docOf`): written in the
    document's own language (chosen per invoice, default the settings' or the shop's), the business's lines, Bill to,
    the dates, lines (a table from md, stacked rows on phones), totals, Paid and Balance due, How to pay (Lipa Namba
    and the bank text; not on a quote), payment terms, notes, terms, and last Ankara's statement in English ("THIS IS A
    COMMERCIAL INVOICE." / "THIS IS A QUOTATION."): nothing is printed after it. The PDF is Helvetica (built into every
    reader), made in the browser only when asked (`usePdf`: dynamic import, never on the server); react-pdf reads PNG and
    JPEG, so the WebP logo is redrawn as a round PNG first. Free shops' PDFs say "Made with Shopi · shopi.tz".
  - **WhatsApp:** `sendText` (the message with the link) and `reminderText` (four tones: Friendly, Professional, Firm,
    Final notice; Ankara's), in the document's language, sent from the business's own WhatsApp (`whatsappTo`: the
    client's number when there is one).
  - **Plans:** invoices and quotes in TSh are free and unlimited (with the Shopi line); `usd` is Tembo (`can(plan,
    'usd')`, checked on save for a new document or a new currency, so one already in dollars stays editable after
    Tembo ends; the USD chip says so instead of being disabled). `hideBadge` hides the line on invoices
    too. Recurring invoices, automatic reminders and more designs are listed as Soon.
  - **Areas:** invoices, payments and clients are `orders` work (`areaOfPath`); invoice settings `owner`. **Where
    clients' money goes is the owner's:** the form hides "How to pay" from assistants, and `saveInvoice` gives an
    assistant's new document the settings' bank details and keeps an edit's stored ones, whatever the browser sends.
    Only the owner's first invoice passes setup step 4. The client's page and its calls (`markInvoiceViewed`,
    `acceptQuote`) count against `invoicePageIp`, and `getPublicInvoice` returns no ids.
  - **Not built:** recurring invoices, automatic reminders, statements per client, proforma and credit notes (Ankara
    had them), more PDF designs, TRA fiscal receipts (VFD), pay-through-Shopi (the Selcom and Azam Pesa proposals),
    invoices in the weekly email and in Analytics, `/admin` counts (the founder stopped that edit on 20 Nov).
- **"Write it for me" for the shop's line** (`writeBio` in `src/server/ai.ts`, `writeShopBio`, `WriteBio`): one
  sentence in the shop's language from its name, category, location and product names; what the seller typed is taken
  as facts; no delivery, price or quality claims. `BIO_MONTH` = 10 a month on any plan, counted in `ai_uses` as `bio`
  (not against the 10 descriptions). In setup step 4 and under Shop settings' Short bio. Privacy names Groq.
- Setup's "Your Instagram, TikTok or WhatsApp link" (`src/lib/social.ts`, `readSocialLink`): a pasted profile link fills
  a first shop name and link (`nameFromHandle`), that social handle (saved by `createShop`; Shop settings shows it), or
  the WhatsApp number (shown under the field; the quiet line opens to change it). Nothing is fetched from Meta; only a TikTok short link (vm.tiktok.com) is opened on the server
  (`expandSocialLink`, TikTok hosts only, the redirect alone is read). A `wa.me/message/…` link hides the number, so the
  seller is asked to type it.
- Shop look (`/app/look`, from Shop settings; migration `0017_shop_look.sql`): `shops.theme_color` (#rrggbb, NULL = Shopi
  orange), `theme_font` (NULL = clean) and `cover_key` (uploaded at 1600 px with the 600 px copy; a replaced cover leaves
  storage). Colours: "From your logo" (`logoColors()`: up to 3 from the logo's pixels, leaving out white, black, greys and
  soft edges; none for a black-and-white logo), 12 tested colours, or any colour with a note when text is darkened or
  buttons stay black. `shopColors()` derives the fill, text on it, the colour as text (darkened to 4.5:1 on sand), on the
  black capsule (lightened to 3:1, white for near-black) and a pale wash. The cover shows above the shop's name with the
  logo over its edge; phones load the 600 px copy; it is also the link preview image. Not gated by plan yet (C6).
- Own domains (`/app/domain`, from Shop settings; migration `0018_domains.sql`, one per shop): the seller adds
  `www.theirshop.co.tz` (a bare name is refused with the www. version offered, since most DNS hosts can't CNAME it; they
  forward the bare name at their registrar) and a CNAME to `customers.shopi.tz`. `addDomain` registers a Cloudflare for
  SaaS custom hostname (HTTP validation, so the CNAME is all they add); the page and the nightly job ask Cloudflare again
  (`refreshDomain`) until it is active with a certificate, then add it to the Turnstile widget's hostnames (10 per widget
  on the free plan, shopi.tz included; when full, that domain's orders use the unchecked allowance and the logs say so).
  Serving: `src/server.ts` looks the host up (`shopForHost`, cached a minute), sends Shopi's own pages (`SHOPI_PAGES`)
  and unknown hosts to shopi.tz, and puts `window.__SHOPI_SHOP__` in the page; the router's `rewrite` (`shopRewrite`)
  reads `/gauni` as `/<shop>/gauni` and writes links without the prefix, sending links to Shopi's pages to shopi.tz
  (full page loads). `/o/`, `/img/`, `/api/` and files stay on the shop's domain; `/<shop>/…` redirects to the clean
  address. Share links use `shopAddress()`. The bot check uses the real site key on a shop's https domain and the
  server accepts tokens whose hostname is an active domain. Canonical links still point at shopi.tz (a per-domain
  canonical and sitemap are for later). Off until `CF_API_TOKEN` is set (`cfReady()`); the page says so.
  Locally, a row with hostname `something.localhost` and status `active` serves that shop at http://something.localhost:3000.
- Bulk import (`/app/products/import`; entry points: Import on Products, the + sheet, and a card on an empty Products page).
  The browser reads the file: `.xlsx` is unzipped with `DecompressionStream` and read with `DOMParser` (`src/lib/sheet.ts`,
  first visible sheet with data), CSV/TSV with delimiter detection and a Windows-1252 fallback; old `.xls` is refused with
  how to save as `.xlsx`. `guessFields()` matches column names in English and Swahili (Shopify and WooCommerce exports
  too) and then sniffs values; the seller can change every column. Row rules (`buildDrafts`, top of `lib/import.ts`):
  one product per row; a row with a name used above plus a size adds that option (a stock sheet); a row with no name but
  an option or photo continues the product above (Shopify); "S:3, M:5" lists options with stock; a price only in "Was"
  becomes the price; "Example:"/"Mfano:" rows (the template's) are left out; names already in the shop are left out, so
  a sheet imported twice, or after a dropped connection, adds only what is missing. Photos are links or file names:
  links go through `/api/photo` (logged-in sellers, `LIMITS.photoFetch` 1,500 an hour per shop, public hosts only,
  15 MB, image bytes checked, Google Drive and Dropbox share links made direct; every refusal is a 4xx so bad links never
  trip the 5xx alert), file names match photos the seller picks on the check screen. Either way the browser shrinks and
  uploads them with `uploadImage`, like the form. `importProducts` saves 20 at a time through `cleanProduct`, makes
  missing collections, dates the rows so the sheet's first row shows first, and keeps any product without a photo hidden.
  Up to 1,000 products per import. The template is a CSV with a byte-order mark, columns in the seller's language.
  Landing copy puts bulk import in Tembo; it is not gated yet (the founder's C6 decides).
- Bot check (Cloudflare Turnstile) on sign-up, checkout and "Notify me". The browser side is `useHumanCheck(action)` in
  `src/lib/turnstile.tsx`: the script loads only on those screens (for Notify me, when the sheet opens), the check runs
  unseen, and a box appears in the `slot` div above the button only when Cloudflare wants a tap (the first press then asks
  for it). `token()` gives one token per request and starts a fresh check for the next try. The server side is `isHuman()`
  in `src/server/turnstile.ts`: a token that fails is refused (`error: 'bot'`); no token, or Cloudflare unreachable, passes
  only a few times an hour (`LIMITS.unchecked*`: 5 sign-ups across Shopi, 3 orders and 5 alerts per shop), so a phone that
  can't run the check can still order. The site key is in code (Cloudflare's always-pass test key anywhere but shopi.tz);
  `TURNSTILE_SECRET` is a Worker secret, and without it everything passes. Locally `.dev.vars` holds the always-pass test
  secret; `2x0000000000000000000000000000000AA` always fails, and the site key `3x00000000000000000000FF` always asks for a tap.
- Notifications on the seller's phone (Web Push; `push_subscriptions`, one row per phone or browser). Home shows
  `PhoneAlertsCard` until they are on ("Not now" hides it 14 days); Shop settings has the full controls, a test and
  Turn off. On iPhone, Apple allows them only once Shopi is on the Home Screen, so the card explains that instead.
  `placeOrder` sends "New order: TSh …" and `submitPaymentSms` sends "Check a payment: TSh …" (`notifySeller`, after the
  response, in the language the seller used when turning them on), both opening `/app/orders/<id>`; an open app refreshes.
  Sending uses `@block65/webcrypto-web-push` (aes128gcm and RFC 8292 VAPID, which Apple requires; the older `aesgcm`
  libraries fail on iPhones). Addresses are accepted only from Google, Apple, Mozilla and Microsoft push hosts, because
  the server posts to them. Keys: `VAPID_PUBLIC_KEY` is a var in `wrangler.jsonc`, `VAPID_PRIVATE_KEY` a secret; locally
  `.dev.vars` holds a separate pair; without them nothing is sent and the card says it didn't turn on. The service
  worker (`/sw.js`, scope `/`) is registered only from the seller app; it caches nothing. The manifest's `id` is `/app`.
  **Installing** (`q-pwa`, 16 Nov): "Put Shopi on your Home Screen" is a row in the + sheet (gone once installed), a row in
  Shop settings and "Show me how" on Home's card for iPhones. Where Chrome offers its prompt the row installs in one tap;
  otherwise `InstallSheet` shows three coded pictures (iPhone: Share, Add to Home Screen, open it; others: the browser's
  menu), and on an iPhone inside Instagram's or TikTok's browser it says to open Safari first (`inAppBrowser()`).
  The manifest has `shortcuts` (New product, Orders) and `screenshots` (`public/app-shots/`, taken from Zee's Store at
  360x780 x3 and 1280x800 x1.5; retake them when Home, Orders or Products change). An installed app reports itself
  (`markAppInstalled`, at most weekly per phone; `users.app_seen_at`, `app_platform`, migration `0019`), which the owner
  dashboard shows per shop and under Product use. There is no dark `theme_color`: the seller app has no dark theme.
  Testing in Playwright needs a persistent profile (`launchPersistentContext`; push is off in incognito) and a few
  seconds after launch before the first push arrives.
- **"Write it for me"** (roadmap `ai-desc`, 18 Nov 2026; migration `0025_ai_uses.sql`): under a product's description,
  the AI writes one in the shop's language from the name, the options and what the seller typed (taken as facts).
  - **Provider** (`src/server/ai.ts`): any OpenAI-compatible chat API. **Live: Groq** (the founder, 19 Nov 2026),
    `AI_BASE_URL` and `AI_MODEL` (`qwen/qwen3.8-27b`) in `wrangler.jsonc` vars, the key as the secret `AI_API_KEY`.
    Locally: a Groq test key in `.dev.vars`. Side by side (18 and 19 Nov) Qwen kept to the seller's facts, while
    `gpt-oss-120b` added "elegant", "kifahari", "timeless look" whatever the rules said. Without a key `aiReady()` is
    false and the buttons never show. Qwen thinks unseen (`reasoning_format: hidden`; with thinking off it invented
    more), and its thinking counts against `max_completion_tokens`, so keep caps at 900.
  - **Groq's limits:** the free plan allows about 7,000 input tokens a minute and 1,000 requests a day for the whole
    organisation (a write takes about 600 to 800 tokens: some 10 writes a minute across Shopi, local tests included).
    `complete()` waits once when Groq answers 429 with a `retry-after` of 10 s or less, and asks once more when the answer
    is empty. Cost on 19 Nov: $0.80 in, $4.00 out per million tokens, about $0.001 (TSh 2 to 3) a write.
  - **Quirks found 19 Nov** (re-test after changing a prompt; the 22-case run is in the 19 Nov chat): a second, very short
    worked example as a conversation turn made Qwen end before its first word (5 of 5), so the shop line's short example
    sits in the rules; "when to wear or use it" in the rules made it invent occasions in broken Swahili ("majira ya
    kuzindua"), so occasions and who it is for are now forbidden unless the seller said them; with no notes it now
    writes one honest line ("Raba za Air Force 1, sizes 39 hadi 42"). Temperature 0.2. Qwen rewrote the seller's "nguo"
    as "ngao" about 1 in 4 at any temperature: `sellerSpelling` puts the seller's spelling back for a word one letter
    off in the middle (same length, first two letters and last letter), on Swahili shops only.
  - **Prompt:** the rules (only the seller's facts, no invented qualities, no hype words, no price or name at the start,
    no markdown) plus one worked example per language, deliberately a body cream: with a clothing example the model
    copied its "knee-length" into a maxi dress. `cleanText` also strips markdown, "!" and a few hype words.
  - **Allowance** (the founder, 18 Nov): Free `FREE_AI_MONTH` = 10 a calendar month in Dar; Tembo and demo unlimited
    with a quiet `TEMBO_AI_DAY` = 50 a day. `ai_uses` keeps a row per use (no text), deleted after about 13 months.
    A free shop that used its 10 sees a Tembo note instead of the button. Since 19 Nov (AI live) Tembo's plan card and
    the landing's cost answer list unlimited AI descriptions without "Soon"; only SMS is still coming.
  - **The form:** "Write it for me" (or "Write it from my notes" when the field has text) replaces the description;
    Undo puts the seller's words back while the AI text is untouched; "{n} left this month" for free shops.
  - `/admin` Product use counts shops that used it, and shops that downloaded or shared their QR code.
- **QR code** (18 Nov 2026, the founder): every shop has one; it opens `shopi.tz/<shop>?s=qr` (`qrUrl`), the address
  that never changes (not an own domain, which can lapse on a printed sticker), tagged so Analytics counts scans as `qr`.
  - **The encoder** (`src/lib/qr.ts`): byte mode, versions 1 to 40, levels L/M/Q/H, after Nayuki's reference design; no
    package (adding one was blocked). Checked by decoding with Apple Vision (a Swift script, `VNDetectBarcodesRequest`):
    32 of 32 test codes, and every card. Re-check that way after touching it.
  - **Sellers** (`QrSheet`, from Home's "ready for its first order" card and Shop settings > QR code): a 1200 x 1880
    card drawn in the browser (`drawQrCard`): the shop's colour on top (ink when it has none) with its logo and its
    name in its own Shop look font and spacing, its location; the code on a white card with rounded dots, the finder
    eyes in the shop's colour (darkened to read), the logo in the middle (level H; a link long enough for version 7+
    drops the logo and uses Q); "Scan to shop" in the shop's language (`shops.lang`), the link in mono, and the Shopi
    wordmark (the page's own `Wordmark` SVG drawn as an image). Download as PNG, or Share where the phone can share
    files, else the link (`navigator.share`), else Copy link. `seller_share` events `qr-download`, `qr-native`,
    `qr-link`, `qr-copy`.
  - **Buyers** (`ShopQr`, the founder: "sharable, downloadable and Shopi branded"): a code with the shopi wordmark in the
    middle (level H; a wide space of about 40% by 5 to 7 modules; `Wordmark` takes a `box` to sit inside the SVG; the
    founder, 18 Nov: "we are a new company, no one knows the bag icon") beside "Open this shop on another phone", in the Info sheet on phones and under the
    facts card on desktop. Tapping it or "Save or share" opens the same branded card (`QrCardSheet`, `who="buyer"`),
    loaded only then (`React.lazy`) and portalled to the body (inside the Info sheet its animated frame would hold it).
    Buyer events are `share` with `qr-…`. `components/qr.tsx` stays light: the encoder and the code only.
- Sales recorded by hand are orders with `source = 'manual'` (payment `cash`, `lipa`, `mobile` or `bank`); they count in
  sales but stay out of visits, the funnel, conversion and buyers. `orders.stock_taken = 0` means cancelling returns nothing.
- Buy on product cards (17 Nov, the founder: the bag-and-plus icon was unclear to buyers here): every card in the shop's
  grid, collections and Top picks carries a "Buy" pill ("Nunua", sentence case like every button) in the shop's button
  colour (`.btn-shop`). It puts the product in the bag and opens checkout with whatever the bag already holds; a product
  with options first opens `QuickAddSheet` titled "Choose your size" (or colour, style…) with one Buy button. Analytics
  still records `add_to_cart` with detail `quick`. The product page keeps Add to bag for buyers who want several things.
- The bag lives in the buyer's localStorage (`useCart`), so the server never knows it: `useCart().ready` is false until it has
  been read, and checkout waits for it instead of showing "Your bag is empty" (on a slow phone that would sit there for seconds).
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
- Search (`src/lib/seo.ts`): every public page has a canonical link to `https://shopi.tz` (`SITE`), so `?s=` and `?code=` links
  and test copies never compete with it. Canonicals go on leaf routes only (TanStack keeps every route's links; meta tags
  are de-duplicated, the child winning). Titles are built by `shopTitle`, `productTitle`, `collectionTitle` (`fitTitle` keeps
  them near 60 characters) and descriptions by the matching `*Description` (the seller's words first, then price, area and
  payment; 160 characters). Structured data: `Store` on the shop page, `Product` with an `Offer` (an `AggregateOffer` when
  options cost different amounts) and a `BreadcrumbList` on product pages, `BreadcrumbList` on collections, `Organization`
  and `WebSite` on the landing. The product page shows the same breadcrumb (Shop › Collection, the first collection in the
  seller's order that holds the product). `/sitemap.xml` lists the landing and legal pages, live shops with products, their
  collections and products with photos; demo shops, hidden products and checkout (`noindex`) stay out. `robots.txt` on
  shopi.tz keeps `/app/` and `/api/` out and names the sitemap.

## Owner dashboard (`/admin`)
For the founder: every shop and seller across Shopi (roadmap `q-admin`). Only `users.is_admin = 1` sees it; everyone
else, logged in or not, gets the not-found page (`beforeLoad` on `routes/admin/route.tsx`, `requireAdmin()` in every
server function, and `/api/admin-export` answers 404). Set the flag by hand in D1
(`UPDATE users SET is_admin = 1 WHERE phone = '+255…'`); never put a phone number in code.
- **Files:** `routes/admin/route.tsx` (the frame: a 248px sidebar from `lg` with grouped sections and a dark card with
  Seller app and Log out; below `lg` a header and the sections as sticky chips), `routes/admin/index.tsx` (the six
  sections, `?tab=` and `?days=7|30|90`, defaults left out of the address), `routes/admin/shops.$id.tsx` (one shop),
  `components/admin.tsx` (`Kpi`, `Change`, `DayChart`, `WeekdayBars`, `Gauge`, `BarList`, `ProductTable`, `Card`, `Row`),
  `lib/admin.ts` (ranges, tabs, `AdminShop`, the Shops filters; safe in the browser), `server/admin.ts` (the queries),
  `lib/api/admin.ts` (`getOwnerDashboard`, `getAdminShop`), `routes/api/admin-export.ts` (the Shops CSV).
- **Rules for the numbers:** Tanzania days; demo shops are listed but never counted; admins are left out of sign-ups;
  sales are confirmed, sent and delivered orders; "orders" are online orders (not recorded by hand). Each section is one
  D1 batch of its own (`todayData`, `shopsData`, `moneyData`, `growthData`, `useData`, `healthData`, `shopData`), so
  opening one never pays for the others. Keep a batch under about 40 statements.
- **Sections:** Today (four number cards, sales by day, today against the same hours a week ago, visitors in the last
  30 minutes, busiest weekday, buyers who came back, best sellers, payments to check, latest orders); Shops (filters:
  trial ending, no orders yet, quiet 7 days, paying; search; Export; each row opens the shop's page; sign-ups without a
  shop); Money (sales, average order, cancelled share, plans and yearly income, sales by payment and category, top
  shops); Growth (sign-ups and new shops by day, the funnel to a fifth order, weekly cohorts for 8 weeks, where visits
  and orders come from, phones, cities, delivery areas); Product use (how many shops use each tool, Top picks included; taps, with "Opened from Top picks"; top 20
  products); Health (payment proofs waiting, what the `limits` table held back in 24 hours, the newest backup, database
  size and row counts, own domains).
- **Look:** change chips are the one place `ok` and `bad` colour a number (green up, red down; `flip` for numbers where
  up is bad, like cancelled share). Today's bar is Moto. Charts read by hover or a sliding finger (`scrubIndex`).
  Number cards never cut a figure: `Money short` below `xl`.
- **"Last log-in"** is worked out from the seller's newest session (`expires_at` minus `SESSION_DAYS`), not stored.
- **Not there yet, because nothing records it:** searches that found nothing, how often the bot check passed or refused, 5xx counts (Workers Logs only),
  the photo bucket's size. Actions on a shop (suspend, extend a trial, change plan) arrive with billing, each written
  to an `admin_log` table.
- Fine for hundreds of shops; move to nightly totals with `stats_daily` well before thousands.

## Nightly job and backups
`src/server/jobs.ts`, run by Cloudflare cron triggers (`triggers` in `wrangler.jsonc`, the same strings as `NIGHTLY` and `WEEKLY`).
Logs start with `[jobs]` (Workers Logs); a failed task fails the run, so it shows in the dashboard's cron events.
- **Nightly, 03:00 in Dar:** keeps the Privacy page's promises. Delivery pins on orders past 90 days (`purgePins`), back-in-stock alerts past 90 days, visit data (`events`) past
  13 months, and the visitor and visit IDs on orders that old (the order and its channel stay); expired seller logins.
  Each purge also takes what would pass its limit before the next run.
- **Every 5 minutes (`FREQUENT`):** Tembo payments still pending, asked of Selcom again (`reconcilePayments`, see Tembo
  billing). Per-payment errors are logged (`[billing]`), not thrown, so a Selcom blip doesn't fail the run.
- **Nightly also:** Tembo renewal reminders by push and email (`remindRenewals`, only once `BILLING_LIVE` is on); on
  Mondays the weekly summary email (`weeklySummaries`); the email log past about 13 months and expired confirm links
  (`purgeEmail`).
- **Weekly, Sunday 03:30:** the whole database as gzipped SQL in the private bucket `shopi-backups`
  (`d1/shopi-YYYY-MM-DD.sql.gz`; no public URL, never bind it to `/img`). The newest 5 are kept (Privacy: "up to 5 weeks").
  D1 Time Travel covers the last 30 days on its own; this copy survives the database being deleted.
- **Run locally:** with `npm run dev` up, `curl "http://localhost:3000/cdn-cgi/handler/scheduled?cron=0+0+*+*+*"` (nightly) or
  `cron=30+0+*+*+SUN` (backup); the local copy is at `shopi-backups/...` with `wrangler r2 object get --local`.
- **Restore** into a new database, never over the live one:
  ```bash
  npx wrangler r2 object get shopi-backups/d1/shopi-YYYY-MM-DD.sql.gz --remote --file b.sql.gz && gunzip b.sql.gz
  npx wrangler d1 create shopi-restore && npx wrangler d1 execute shopi-restore --remote --file b.sql
  ```
  Check it, then point `d1_databases` at it. `sqlite3 x.db < b.sql` also opens a backup locally.
- **Alerts by email** (set up 14 Nov in the dashboard: Observability > Monitors, beta; they email africanuspanga@gmail.com,
  repeating every 6 h while active). Both read Workers Logs (`logs.workersLogs`) for `scriptName = 'shopi'`:
  - "shopi.tz: server errors (5xx)": `httpStatus >= 500`, 3 or more in 5 minutes (threshold 0.6, averaged over 5m).
  - "shopi: crash or failed nightly job / backup": outcome not `ok` and not `canceled`, 1 or more in a minute. A failed job
    run throws, so it lands here.
  The monitor SQL is picky: no `OR` or `IN` on `"attributes"['$workers.…']` fields, and at most two or three plain `AND`ed
  conditions ("recursion limit exceeded"). Neither monitor sees an outage where requests never reach the Worker (DNS, a
  deploy that drops the custom domain); an outside uptime check would.
- Add new periodic work as a task in `runJob`, not on a request path. The 13 Nov purge-on-read for alerts was moved here.

## Analytics
- **Tracker** (`src/lib/analytics.ts`):
  - **IDs:** a random visitor ID in localStorage, and a visit (`session_id`) that ends after 30 quiet minutes or when a new `?s=` tag is opened.
  - **Source:** worked out once per visit, from the in-app browser (Instagram, TikTok, Facebook), the Android app referrer (`android-app://com.whatsapp`), the referring website, or `direct`. The `?s=` tag is stored separately as `link_tag`.
  - **Sending:** `track(type, { shopId, productId?, detail? })` sends with sendBeacon to `/api/e`. An identical event within 1.5 seconds is dropped.
- **Events:**

  | Event | `detail` values |
  | --- | --- |
  | `view_shop` | —, `bag_link` when a bag link is opened, `collection` on a collection page |
  | `view_product` | —, `pick` when opened from the shop's Top picks |
  | `add_to_cart` | `quick` (Buy on a card, which then opens checkout) or `page` |
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
1. `npx tsc --noEmit` and `npm run check:design` pass.
2. Screenshot the screen at 390 and 1440 wide (Playwright) and look at it: alignment, wrapping, contrast, empty states.
3. Run the flow you touched in a browser (order, payment, product save), then remove any test data.
4. Check the screen against `DESIGN.md`: the same role looks the same as elsewhere, one accent used by its rules, no new
   colours or fonts, no emoji, no uppercase labels.

Discovery notes and founder decisions are outside this repo (`../Shopi-discovery-notes.md`). Keep them out of the public repo.
