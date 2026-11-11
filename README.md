# Shopi

**Your shop in one link.** An online shop for social sellers in Tanzania.

A seller opens a shop in a few minutes, adds products from their phone and shares one link
(`shopi.tz/<shop>`) on Instagram, TikTok and WhatsApp. Buyers order with their name, phone,
delivery area and a landmark, then pay the seller's Lipa Namba (and paste the confirmation SMS)
or pay cash on delivery. Shopi never holds money.

The design system, the rules for colour, type and copy, and a map of the code are in [CLAUDE.md](CLAUDE.md).

## What works today

- Sign up with phone and password, then name the shop and pick its link (with a live preview)
- Products: up to 6 photos (shrunk to WebP in the browser), price, was-price, sizes with stock per
  size, hide or show, "save and add another"
- Storefront: shop header, filters, product grid with quick add, product page, bag, checkout with
  delivery areas and fees
- Readable product links, like `shopi.tz/zee-store/gauni-la-jua`, with photo previews in WhatsApp;
  old `/<shop>/p/<id>` links redirect
- Sharing: buyers share a product with a friend; sellers send one product to a buyer
- Payments: Lipa Namba with SMS proof (amount, name and transaction ID checked; a transaction ID can
  never be used twice) or cash on delivery; the seller always confirms
- Orders: awaiting payment, check payment, confirmed, on the way, delivered, cancelled; stock held on
  confirm and returned on cancel; call or WhatsApp the buyer
- Buyer order page `/o/<code>`: pay instructions, SMS paste, progress, WhatsApp to the seller
- Dashboard: today's sales, what needs the seller, 7-day numbers against the 7 days before, daily
  sales chart, best sellers with views and shares, latest orders
- Analytics (`/app/analytics`): unique visitors and visits, sales by channel (Instagram, TikTok, WhatsApp...)
  and by tagged link (`?s=bio`), the funnel from visit to delivery, WhatsApp and social taps, product
  conversion, sizes that sell, when buyers visit, areas, phones and cities, repeat buyers, CSV export.
  First-party only: no third-party trackers; bots and the owner's own visits are left out
- English everywhere; every string is ready for Swahili (`SWAHILI_ENABLED` in `src/lib/i18n.tsx`)

Not built yet: the Shopi assistant, Discover and voting, subscriptions and billing, SMS/WhatsApp
alerts, password reset (for now: reset by hand), terms and privacy pages, admin screens, rate limits
on public endpoints.

## Stack

TanStack Start on one Cloudflare Worker, D1 (SQLite), R2 for photos, Tailwind 4.

## Run locally

```bash
npm install
npx wrangler d1 migrations apply shopi --local
npm run dev            # http://localhost:3000
npx tsc --noEmit       # type check
```

## Demo shops (local only, fictional)

- **Zee's Store** at `/zee-store`: ten dresses with real photos, onboarded through the UI, with six
  months of history from `node scripts/seed-zee-history.mjs`. The login is in
  `design/sample-shop/LOGIN.local.md`. The landing page's dashboard images are screenshots of it.
- **Zuri Fashion** at `/zuri-fashion`: `node scripts/seed-demo.mjs`, ten products with drawn
  placeholder art and about 90 days of orders. The login is in the script's header.

Products created before migration 0003 get readable links with
`node scripts/backfill-product-slugs.mjs` (add `--remote` for the live database).

## First deploy

```bash
npx wrangler login
npx wrangler d1 create shopi         # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create shopi-media
npx wrangler d1 migrations apply shopi --remote
npm run deploy
```

Then add the custom domain (shopi.tz) to the Worker in the Cloudflare dashboard.

## Credits

Product photos in `public/images/landing/` and the Zee's Store demo are from Unsplash (free licence,
https://unsplash.com/license). Photo IDs: 1696962678565-bee84e6b9cb6, 1696962701419-6f510910e838,
1601653233006-5c9fd30eab12, 1760907949889-eb62b7fd9f75, 1781274054552-311be66203fd, 1784854491993-16445b10a6c6,
1781274054565-4f9d9dc7794a, 1663044023283-9ea59358b6c0, 1663044022903-caa195cb5b2e, 1663044022894-68a5e6bccd64,
1706092373219-0316a8bbaad7, 1706092372694-223070e27695, 1709809081557-78f803ce93a0.
Type: Mona Sans and Geist Mono (SIL Open Font License 1.1). The Shopi letters are outlined from Mona Sans.
Analytics: the visitor and session model and the bot list follow Minilytics (MIT,
https://github.com/surendrapandar/minilytics).
