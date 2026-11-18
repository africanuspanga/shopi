import { createServerFn } from '@tanstack/react-start'
import { requireShop, requireUser } from '#/server/auth'
import { all, db, first, newId, now, orderCode, run } from '#/server/db'
import { removePhotos } from '#/server/media'
import { cleanProduct, uniqueProductSlug, type ProductInput } from '#/server/products'
import { moveStock } from '#/server/stock'
import { CATEGORIES, RESERVED_SLUGS, imageOf, normalizePhone, optionKind, parseSizes, slugify, type OrderStatus, type PaymentMethod, type Size, mapsLink, tinDigits } from '#/lib/format'
import { shopPlan } from '#/server/plan'
import { canPay } from '#/server/billing'
import { FREE_PRODUCTS, can } from '#/lib/plans'
import { TIKTOK_SHORT, readSocialLink } from '#/lib/social'
import { withReadiness, type AlertRow } from '#/server/alerts'
import { setPick } from '#/server/picks'

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/* ---------- Shop ---------- */

export type ShopRow = {
  id: string
  slug: string
  name: string
  bio: string
  category: string
  logo_key: string | null
  whatsapp: string
  instagram: string
  tiktok: string
  facebook: string
  location: string
  maps_url: string
  tin: string
  hours: string
  lipa_number: string
  lipa_name: string
  lipa_network: string
  lipa_is_personal: number
  cod_enabled: number
  /** The language buyers see the shop in: 'sw' or 'en'. */
  lang: string
  /** The shop's look, saved by saveShopLook (src/lib/api/look.ts). */
  theme_color: string | null
  theme_font: string | null
  cover_key: string | null
  /** 1 when the seller hid the "Shop made with Shopi" line; it only counts while the shop has Tembo. */
  hide_badge: number
  /** Sends to other regions ("mikoani"), with an optional line on how. */
  ships_regions: number
  regions_note: string
}
export type AreaRow = { id: string; name: string; fee: number }

export const checkSlug = createServerFn({ method: 'GET' })
  .validator((d: { slug: string }) => ({ slug: slugify(d.slug) }))
  .handler(async ({ data }) => {
    if (data.slug.length < 3 || RESERVED_SLUGS.has(data.slug)) return { slug: data.slug, free: false }
    const taken = await first('SELECT 1 FROM shops WHERE slug = ?', data.slug)
    return { slug: data.slug, free: !taken }
  })

export const createShop = createServerFn({ method: 'POST' })
  .validator(
    (d: { name: string; slug: string; category: string; whatsapp: string; lang: string; instagram?: string; tiktok?: string; facebook?: string }) => ({
      name: str(d.name, 60),
      slug: slugify(d.slug),
      category: CATEGORIES.some((c) => c.id === d.category) ? d.category : 'other',
      whatsapp: normalizePhone(str(d.whatsapp)),
      lang: d.lang === 'sw' ? 'sw' : 'en',
      // From a link the seller pasted at setup (lib/social.ts).
      instagram: str(d.instagram, 60).replace(/^@/, ''),
      tiktok: str(d.tiktok, 60).replace(/^@/, ''),
      facebook: str(d.facebook, 100),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()
    const existing = await first<{ slug: string }>('SELECT slug FROM shops WHERE owner_id = ?', user.id)
    if (existing) return { ok: true as const, slug: existing.slug }
    if (!data.name) return { error: 'name' as const }
    if (data.slug.length < 3 || RESERVED_SLUGS.has(data.slug)) return { error: 'slug' as const }
    if (await first('SELECT 1 FROM shops WHERE slug = ?', data.slug)) return { error: 'slug_taken' as const }
    await run(
      `INSERT INTO shops (id, owner_id, slug, name, category, whatsapp, lang, instagram, tiktok, facebook, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      user.id,
      data.slug,
      data.name,
      data.category,
      data.whatsapp || user.phone,
      data.lang,
      data.instagram,
      data.tiktok,
      data.facebook,
      now(),
    )
    return { ok: true as const, slug: data.slug }
  })

/**
 * A TikTok short link (vm.tiktok.com/…) pasted at setup, opened to see which profile it leads to. Only TikTok's own
 * hosts are ever requested, and only the redirect is read.
 */
export const expandSocialLink = createServerFn({ method: 'POST' })
  .validator((d: { url: string }) => ({ url: str(d.url, 300) }))
  .handler(async ({ data }) => {
    await requireUser()
    let url = data.url
    for (let hop = 0; hop < 4; hop++) {
      let u: URL
      try {
        u = new URL(url)
      } catch {
        return { found: null }
      }
      if (u.protocol !== 'https:' || !TIKTOK_SHORT.test(u.hostname)) return { found: null }
      const found = readSocialLink(u.href)
      if (found && found.kind !== 'short') return { found }
      try {
        const res = await fetch(u.href, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Shopi' }, signal: AbortSignal.timeout(4000) })
        const next = res.headers.get('location')
        if (!next) return { found: null }
        url = new URL(next, u).href
      } catch {
        return { found: null }
      }
    }
    return { found: null }
  })

/** The optional setup step: where the shop is and its socials. Empty fields stay empty; "Skip for now" never calls this. */
export const saveShopBasics = createServerFn({ method: 'POST' })
  .validator((d: { location?: string; maps_url?: string; tin?: string; instagram?: string; tiktok?: string; facebook?: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const maps = mapsLink(str(data.maps_url, 500))
    if (maps === null) return { error: 'maps' as const }
    const tin = tinDigits(str(data.tin, 20))
    if (tin === null) return { error: 'tin' as const }
    await run(
      'UPDATE shops SET location = ?, maps_url = ?, tin = ?, instagram = ?, tiktok = ?, facebook = ? WHERE id = ?',
      str(data.location, 200),
      maps,
      tin,
      str(data.instagram, 60).replace(/^@/, ''),
      str(data.tiktok, 60).replace(/^@/, ''),
      str(data.facebook, 100),
      shop.id,
    )
    return { ok: true as const }
  })

export const getMyPlan = createServerFn({ method: 'GET' }).handler(async () => {
  const { user, shop } = await requireShop()
  // canPay: billing is open (BILLING_LIVE), or the owner testing it first. phone: the number the prompt goes to first.
  return { plan: await shopPlan(shop.id), canPay: canPay(user), phone: user.phone }
})

/** What the shop's QR card shows (`src/lib/qr-card.ts`): the shop as buyers see it. */
export const getMyQrCard = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const row = await first<{ id: string; name: string; slug: string; logo_key: string | null; theme_color: string | null; theme_font: string | null; location: string; lang: string }>(
    'SELECT id, name, slug, logo_key, theme_color, theme_font, location, lang FROM shops WHERE id = ?',
    shop.id,
  )
  return row!
})

export const getMyShop = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const full = await first<ShopRow>('SELECT * FROM shops WHERE id = ?', shop.id)
  const areas = await all<AreaRow>('SELECT id, name, fee FROM delivery_areas WHERE shop_id = ? ORDER BY sort', shop.id)
  return { shop: full!, areas }
})

export const updateShop = createServerFn({ method: 'POST' })
  .validator((d: Partial<ShopRow> & { areas?: { name: string; fee: number }[] }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const before = await first<{ logo_key: string | null }>('SELECT logo_key FROM shops WHERE id = ?', shop.id)
    const logo = data.logo_key ? str(data.logo_key, 100) : null
    await run(
      `UPDATE shops SET name = ?, bio = ?, category = ?, logo_key = ?, whatsapp = ?, instagram = ?, tiktok = ?,
         facebook = ?, location = ?, maps_url = ?, tin = ?, hours = ?, lipa_number = ?, lipa_name = ?, lipa_network = ?,
         lipa_is_personal = ?, cod_enabled = ?, lang = COALESCE(?, lang), hide_badge = ?, ships_regions = ?, regions_note = ?
       WHERE id = ?`,
      str(data.name, 60) || shop.name,
      str(data.bio, 300),
      CATEGORIES.some((c) => c.id === data.category) ? data.category : 'other',
      logo,
      normalizePhone(str(data.whatsapp)),
      str(data.instagram, 60).replace(/^@/, ''),
      str(data.tiktok, 60).replace(/^@/, ''),
      str(data.facebook, 100),
      str(data.location, 200),
      mapsLink(str(data.maps_url, 500)) ?? '',
      tinDigits(str(data.tin, 20)) ?? '',
      str(data.hours, 100),
      str(data.lipa_number, 20).replace(/\s+/g, ''),
      str(data.lipa_name, 80),
      str(data.lipa_network, 30),
      data.lipa_is_personal ? 1 : 0,
      data.cod_enabled ? 1 : 0,
      data.lang === 'sw' || data.lang === 'en' ? data.lang : null,
      // Hiding the Shopi line is Tembo; a free shop's switch saves as off.
      data.hide_badge && can(await shopPlan(shop.id), 'hideBadge') ? 1 : 0,
      data.ships_regions ? 1 : 0,
      data.ships_regions ? str(data.regions_note, 80) : '',
      shop.id,
    )
    // A replaced logo leaves storage.
    if (before?.logo_key && before.logo_key !== logo) await removePhotos(shop.id, [before.logo_key])
    if (data.areas) {
      const areas = data.areas.map((a) => ({ name: str(a.name, 60), fee: int(a.fee) })).filter((a) => a.name)
      await db().batch([
        db().prepare('DELETE FROM delivery_areas WHERE shop_id = ?').bind(shop.id),
        ...areas.map((a, i) =>
          db()
            .prepare('INSERT INTO delivery_areas (id, shop_id, name, fee, sort) VALUES (?, ?, ?, ?, ?)')
            .bind(newId(), shop.id, a.name, a.fee, i),
        ),
      ])
    }
    return { ok: true }
  })

/* ---------- Dashboard ---------- */

/** What the menu shows on every screen: payments to check and orders to send. */
export const getNavCounts = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const row = await first<{ to_check: number | null; to_send: number | null; open_bags: number | null }>(
    `SELECT SUM(status = 'payment_claimed') to_check, SUM(status = 'confirmed') to_send,
       (SELECT COUNT(*) FROM bag_links WHERE shop_id = ?1 AND status = 'open' AND expires_at > ?2) open_bags
     FROM orders WHERE shop_id = ?1`,
    shop.id,
    now(),
  )
  return { toCheck: row?.to_check ?? 0, toSend: row?.to_send ?? 0, openBags: row?.open_bags ?? 0 }
})

export const getDashboard = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const since = now() - 7 * 86400_000
  const before = since - 7 * 86400_000
  // Days are counted in Tanzania time (UTC+3).
  const TZ = 3 * 3600_000
  const todayStart = Math.floor((now() + TZ) / 86400_000) * 86400_000 - TZ
  const [sales, visits, open, recent, top, productCount, setup, prev, daily, counts, today, queue, shares] = await Promise.all([
    first<{ n: number; total: number }>(
      `SELECT COUNT(*) n, COALESCE(SUM(total), 0) total FROM orders
       WHERE shop_id = ? AND created_at > ? AND status IN ('confirmed','dispatched','delivered')`,
      shop.id,
      since,
    ),
    first<{ shop: number; product: number; share: number }>(
      `SELECT COUNT(DISTINCT CASE WHEN type IN ('view_shop','view_product') THEN session_id END)
           + COALESCE(SUM(session_id IS NULL AND type = 'view_shop'), 0) shop,
         SUM(type = 'view_product') product, SUM(type = 'share') share
       FROM events WHERE shop_id = ? AND created_at > ?`,
      shop.id,
      since,
    ),
    first<{ n: number }>(
      `SELECT COUNT(*) n FROM orders WHERE shop_id = ? AND status IN ('awaiting_payment','payment_claimed','confirmed')`,
      shop.id,
    ),
    all<{ id: string; code: string; customer_name: string; total: number; status: OrderStatus; created_at: number; items: number; image: string | null }>(
      `SELECT o.id, o.code, o.customer_name, o.total, o.status, o.created_at,
         (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) items,
         (SELECT image FROM order_items WHERE order_id = o.id LIMIT 1) image
       FROM orders o WHERE o.shop_id = ? ORDER BY o.created_at DESC LIMIT 5`,
      shop.id,
    ),
    all<{ id: string; name: string; images: string; price: number; views: number; sold: number }>(
      `SELECT p.id, p.name, p.images, p.price, p.views,
         COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE oi.product_id = p.id AND o.status IN ('confirmed','dispatched','delivered')), 0) sold
       FROM products p WHERE p.shop_id = ? ORDER BY sold DESC, p.views DESC LIMIT 6`,
      shop.id,
    ),
    first<{ n: number }>('SELECT COUNT(*) n FROM products WHERE shop_id = ?', shop.id),
    first<{ lipa_number: string; logo_key: string | null; areas: number }>(
      `SELECT lipa_number, logo_key, (SELECT COUNT(*) FROM delivery_areas WHERE shop_id = shops.id) areas
       FROM shops WHERE id = ?`,
      shop.id,
    ),
    first<{ total: number; orders: number; online: number; visits: number }>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE shop_id = ?1 AND created_at BETWEEN ?2 AND ?3
            AND status IN ('confirmed','dispatched','delivered')) total,
         (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND created_at BETWEEN ?2 AND ?3) orders,
         (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND created_at BETWEEN ?2 AND ?3 AND source != 'manual') online,
         (SELECT COUNT(DISTINCT CASE WHEN type IN ('view_shop','view_product') THEN session_id END)
            + COALESCE(SUM(session_id IS NULL AND type = 'view_shop'), 0)
          FROM events WHERE shop_id = ?1 AND created_at BETWEEN ?2 AND ?3) visits`,
      shop.id,
      before,
      since,
    ),
    all<{ day: number; total: number }>(
      `SELECT CAST((created_at + ?) / 86400000 AS INTEGER) day, SUM(total) total FROM orders
       WHERE shop_id = ? AND created_at > ? AND status IN ('confirmed','dispatched','delivered') GROUP BY day`,
      TZ,
      shop.id,
      since - 86400_000,
    ),
    first<{ all_orders: number; online: number; paid: number; pending: number; cancelled: number }>(
      `SELECT COUNT(*) all_orders, SUM(source != 'manual') online,
         SUM(status IN ('confirmed','dispatched','delivered')) paid,
         SUM(status IN ('awaiting_payment','payment_claimed')) pending,
         SUM(status = 'cancelled') cancelled
       FROM orders WHERE shop_id = ? AND created_at > ?`,
      shop.id,
      since,
    ),
    first<{ total: number; orders: number }>(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('confirmed','dispatched','delivered') THEN total END), 0) total,
         COUNT(*) orders FROM orders WHERE shop_id = ? AND created_at >= ?`,
      shop.id,
      todayStart,
    ),
    first<{ to_confirm: number; to_send: number; on_the_way: number }>(
      `SELECT SUM(status = 'payment_claimed') to_confirm,
         SUM(status = 'confirmed') to_send, SUM(status = 'dispatched') on_the_way
       FROM orders WHERE shop_id = ? AND created_at > ?`,
      shop.id,
      now() - 30 * 86400_000,
    ),
    all<{ product_id: string; n: number }>(
      `SELECT product_id, COUNT(*) n FROM events WHERE shop_id = ? AND type = 'share' AND product_id IS NOT NULL GROUP BY product_id`,
      shop.id,
    ),
  ])
  // Back in stock: products some buyers asked to hear about, now that what they asked for can be bought again.
  const ready = (
    await withReadiness(shop.id, await all<AlertRow>('SELECT id, product_id, variant, phone, created_at FROM stock_alerts WHERE shop_id = ?', shop.id))
  ).filter((a) => a.back)
  const backInStock = [...new Set(ready.map((a) => a.product_id))].map((id) => {
    const mine = ready.filter((a) => a.product_id === id)
    return { id, name: mine[0].product.name, image: mine[0].product.image, waiting: mine.length }
  })
  const todayDay = Math.floor((now() + TZ) / 86400_000)
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = todayDay - 6 + i
    return { day: day * 86400_000, total: daily.find((d) => d.day === day)?.total ?? 0 }
  })
  return {
    today: { total: today?.total ?? 0, orders: today?.orders ?? 0 },
    queue: { toConfirm: queue?.to_confirm ?? 0, toSend: queue?.to_send ?? 0, onTheWay: queue?.on_the_way ?? 0 },
    days,
    prev: prev ?? { total: 0, orders: 0, online: 0, visits: 0 },
    counts: {
      all: counts?.all_orders ?? 0,
      online: counts?.online ?? 0,
      paid: counts?.paid ?? 0,
      pending: counts?.pending ?? 0,
      cancelled: counts?.cancelled ?? 0,
    },
    sales: sales ?? { n: 0, total: 0 },
    visits: { shop: visits?.shop ?? 0, product: visits?.product ?? 0, share: visits?.share ?? 0 },
    openOrders: open?.n ?? 0,
    recent,
    top: top.map((p) => ({
      ...p,
      image: (JSON.parse(p.images) as string[])[0] ?? null,
      shares: shares.find((s) => s.product_id === p.id)?.n ?? 0,
    })),
    plan: await shopPlan(shop.id),
    backInStock,
    setup: {
      products: (productCount?.n ?? 0) > 0,
      payment: !!setup?.lipa_number,
      logo: !!setup?.logo_key,
      delivery: (setup?.areas ?? 0) > 0,
    },
  }
})

/* ---------- Products ---------- */

export type ProductRow = {
  id: string
  slug: string | null
  name: string
  description: string
  price: number
  compare_price: number | null
  stock: number | null
  images: string[]
  sizes: Size[] | null
  /** What buyers choose: NULL for size (see OPTION_KINDS). */
  option_name: string | null
  active: number
  views: number
  /** Buyers waiting for a back-in-stock message. */
  waiting: number
  /** 1 to 4 when the product is one of the shop's top picks, in the seller's order; null otherwise. */
  pick_rank: number | null
}

type ProductDbRow = Omit<ProductRow, 'images' | 'sizes'> & { images: string; sizes: string | null }
const toProduct = (r: ProductDbRow): ProductRow => ({ ...r, images: JSON.parse(r.images), sizes: parseSizes(r.sizes) })

export const listMyProducts = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const rows = await all<ProductDbRow>(
    `SELECT p.*, (SELECT COUNT(*) FROM stock_alerts a WHERE a.product_id = p.id) waiting
     FROM products p WHERE p.shop_id = ? ORDER BY p.created_at DESC`,
    shop.id,
  )
  return rows.map(toProduct)
})

export const getMyProduct = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const row = await first<ProductDbRow>(
      `SELECT p.*, (SELECT COUNT(*) FROM stock_alerts a WHERE a.product_id = p.id) waiting FROM products p WHERE p.id = ? AND p.shop_id = ?`,
      data.id,
      shop.id,
    )
    return row ? toProduct(row) : null
  })

export const saveProduct = createServerFn({ method: 'POST' })
  /** pick: put it in the top picks (if there is room) or take it out; left out, the picks stay as they are. */
  .validator((d: ProductInput & { id?: string; active: boolean; pick?: boolean }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const p = cleanProduct(data)
    if ('error' in p) return p
    const images = JSON.stringify(p.photos)
    let saved: { ok: true; id: string; slug: string }
    if (data.id) {
      // The link name stays when a product is renamed, so links already shared keep working.
      const current = await first<{ slug: string | null; images: string }>(
        'SELECT slug, images FROM products WHERE id = ? AND shop_id = ?',
        data.id,
        shop.id,
      )
      const slug = current?.slug ?? (await uniqueProductSlug(shop.id, p.name, data.id))
      await run(
        `UPDATE products SET name = ?, description = ?, price = ?, compare_price = ?, stock = ?, sizes = ?, option_name = ?, images = ?,
           active = ?, slug = ? WHERE id = ? AND shop_id = ?`,
        p.name, p.description, p.price, p.compare, p.stock, p.sizes, p.optionName, images, data.active ? 1 : 0, slug, data.id, shop.id,
      )
      // Photos taken off the product leave storage too (removePhotos keeps any a past order shows).
      const kept = new Set(p.photos)
      if (current) await removePhotos(shop.id, (JSON.parse(current.images) as string[]).filter((k) => !kept.has(k)))
      saved = { ok: true, id: data.id, slug }
    } else {
      // A free shop holds up to FREE_PRODUCTS; Tembo has no limit (17 Nov).
      const held = await first<{ n: number }>('SELECT COUNT(*) n FROM products WHERE shop_id = ?', shop.id)
      if ((held?.n ?? 0) >= FREE_PRODUCTS && !can(await shopPlan(shop.id), 'unlimitedProducts')) return { error: 'limit' as const }
      const id = newId()
      const slug = await uniqueProductSlug(shop.id, p.name)
      await run(
        `INSERT INTO products (id, shop_id, slug, name, description, price, compare_price, stock, sizes, option_name, images, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, shop.id, slug, p.name, p.description, p.price, p.compare, p.stock, p.sizes, p.optionName, images, data.active ? 1 : 0, now(),
      )
      saved = { ok: true, id, slug }
    }
    if (typeof data.pick === 'boolean') await setPick(shop.id, saved.id, data.pick)
    return saved
  })

export const deleteProduct = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const gone = await first<{ images: string }>('SELECT images FROM products WHERE id = ? AND shop_id = ?', data.id, shop.id)
    await run('DELETE FROM products WHERE id = ? AND shop_id = ?', data.id, shop.id)
    if (gone) await removePhotos(shop.id, JSON.parse(gone.images) as string[])
    return { ok: true }
  })

/* ---------- Orders ---------- */

export type OrderListRow = {
  id: string
  code: string
  customer_name: string
  customer_phone: string
  area: string
  total: number
  payment_method: PaymentMethod
  status: OrderStatus
  created_at: number
  items: number
  source: string
}

export const listOrders = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  return all<OrderListRow>(
    `SELECT o.id, o.code, o.customer_name, o.customer_phone, o.area, o.total, o.payment_method, o.status, o.created_at, o.source,
       (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) items
     FROM orders o WHERE o.shop_id = ? ORDER BY o.created_at DESC LIMIT 300`,
    shop.id,
  )
})

export type OrderDetail = OrderListRow & {
  /** The note for the rider (was "Nearby landmark"). */
  landmark: string
  /** The buyer's map pin, cleared 90 days after the order; `pin_m` is the GPS accuracy in metres. */
  lat: number | null
  lng: number | null
  pin_m: number | null
  note: string
  subtotal: number
  /** A discount code the buyer used, and the shillings it took off. */
  discount_code: string | null
  discount: number
  delivery_fee: number
  payment_sms: string | null
  txn_id: string | null
  payment_check: string | null
  paid_claimed_at: number | null
  /** option: the kind of option on the line (see OPTION_KINDS); null means size. */
  lines: { name: string; price: number; qty: number; image: string | null; variant: string | null; option: string | null }[]
  /** The bag link this order was placed from, if any. */
  bag: { id: string; note: string } | null
}

export const getOrder = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const order = await first<Omit<OrderDetail, 'lines' | 'items' | 'bag'>>(
      'SELECT * FROM orders WHERE id = ? AND shop_id = ?',
      data.id,
      shop.id,
    )
    if (!order) return null
    const [lines, bag] = await Promise.all([
      all<OrderDetail['lines'][number]>('SELECT name, price, qty, image, variant, option FROM order_items WHERE order_id = ?', order.id),
      order.source === 'bag_link' ? first<{ id: string; note: string }>('SELECT id, note FROM bag_links WHERE order_id = ? AND shop_id = ?', order.id, shop.id) : null,
    ])
    return { ...order, lines, bag, items: lines.reduce((s, l) => s + l.qty, 0) } as OrderDetail
  })

export type SaleLine = { productId?: string; name?: string; price: number; qty: number; size?: string | null }

/**
 * A sale the seller records by hand: in person, on a call, inside a WhatsApp chat. It is saved as an order with
 * source 'manual', so it counts in sales, the order list and the CSV, and stays out of visits and the funnel.
 */
export const recordSale = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      lines: SaleLine[]
      name?: string
      phone?: string
      payment: PaymentMethod
      date?: number
      status: 'confirmed' | 'delivered'
      takeStock: boolean
      note?: string
    }) => d,
  )
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const payment: PaymentMethod = (['cash', 'lipa', 'mobile', 'bank'] as const).find((m) => m === data.payment) ?? 'cash'
    const status = data.status === 'delivered' ? 'delivered' : 'confirmed'
    const lines: { productId: string | null; name: string; price: number; qty: number; image: string | null; variant: string | null; option: string | null }[] = []
    for (const l of (data.lines ?? []).slice(0, 50)) {
      const qty = Math.min(999, Math.max(1, Math.round(Number(l.qty) || 1)))
      const price = int(l.price)
      if (l.productId) {
        const p = await first<{ id: string; name: string; images: string; sizes: string | null; option_name: string | null }>(
          'SELECT id, name, images, sizes, option_name FROM products WHERE id = ? AND shop_id = ?',
          l.productId,
          shop.id,
        )
        if (!p) return { error: 'product' as const }
        const sizes = parseSizes(p.sizes)
        const variant = sizes && l.size ? (sizes.find((s) => s.label === l.size)?.label ?? null) : null
        if (sizes && !variant) return { error: 'size' as const, product: p.name }
        const kind = optionKind(p.option_name)
        lines.push({
          productId: p.id,
          name: p.name,
          price,
          qty,
          image: imageOf({ images: JSON.parse(p.images) as string[], sizes }, variant),
          variant,
          option: variant && kind !== 'size' ? kind : null,
        })
      } else {
        const name = str(l.name, 120)
        if (!name || !price) continue
        lines.push({ productId: null, name, price, qty, image: null, variant: null, option: null })
      }
    }
    if (!lines.length) return { error: 'empty' as const }
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0)
    const t = now()
    // A past date is allowed (a sale from last week); a future one is not.
    const at = Number.isFinite(Number(data.date)) && Number(data.date) > 0 ? Math.min(Number(data.date), t) : t
    const id = newId()
    const code = orderCode()
    const takeStock = data.takeStock !== false && lines.some((l) => l.productId)
    await db().batch([
      db()
        .prepare(
          `INSERT INTO orders (id, shop_id, code, customer_name, customer_phone, note, subtotal, delivery_fee, total,
             payment_method, status, created_at, updated_at, source, stock_taken)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'manual', ?)`,
        )
        .bind(
          id, shop.id, code, str(data.name, 80), data.phone ? normalizePhone(str(data.phone)) : '', str(data.note, 500),
          total, total, payment, status, at, t, takeStock ? 1 : 0,
        ),
      ...lines.map((l) =>
        db()
          .prepare('INSERT INTO order_items (order_id, product_id, name, price, qty, image, variant, option) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, l.productId, l.name, l.price, l.qty, l.image, l.variant, l.option),
      ),
    ])
    if (takeStock) await moveStock(id, -1)
    return { ok: true as const, id }
  })

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['confirmed', 'cancelled'],
  payment_claimed: ['confirmed', 'awaiting_payment', 'cancelled'],
  confirmed: ['dispatched', 'delivered', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: ['awaiting_payment'],
}

export const setOrderStatus = createServerFn({ method: 'POST' })
  .validator((d: { id: string; status: OrderStatus }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const order = await first<{ status: OrderStatus; stock_taken: number }>(
      'SELECT status, stock_taken FROM orders WHERE id = ? AND shop_id = ?',
      data.id,
      shop.id,
    )
    if (!order || !NEXT[order.status].includes(data.status)) return { error: 'transition' as const }
    // A payment sent back as "not received" frees its transaction ID for a real one.
    const clearTxn = order.status === 'payment_claimed' && data.status === 'awaiting_payment'
    await run(
      `UPDATE orders SET status = ?, updated_at = ?${clearTxn ? ', txn_id = NULL' : ''} WHERE id = ?`,
      data.status,
      now(),
      data.id,
    )
    // Stock comes back when a confirmed order is cancelled.
    if (data.status === 'cancelled' && ['confirmed', 'dispatched'].includes(order.status) && order.stock_taken) await moveStock(data.id, 1)
    if (data.status === 'confirmed' && order.status !== 'confirmed' && order.stock_taken) await moveStock(data.id, -1)
    return { ok: true }
  })
