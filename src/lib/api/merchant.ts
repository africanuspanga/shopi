import { createServerFn } from '@tanstack/react-start'
import { requireShop, requireUser } from '#/server/auth'
import { all, db, first, newId, now, run } from '#/server/db'
import { moveStock, sizesTotal } from '#/server/stock'
import { CATEGORIES, RESERVED_PRODUCT_SLUGS, RESERVED_SLUGS, normalizePhone, parseSizes, productSlug, slugify, type OrderStatus, type Size } from '#/lib/format'

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
  hours: string
  lipa_number: string
  lipa_name: string
  lipa_network: string
  lipa_is_personal: number
  cod_enabled: number
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
  .validator((d: { name: string; slug: string; category: string; whatsapp: string }) => ({
    name: str(d.name, 60),
    slug: slugify(d.slug),
    category: CATEGORIES.some((c) => c.id === d.category) ? d.category : 'other',
    whatsapp: normalizePhone(str(d.whatsapp)),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const existing = await first<{ slug: string }>('SELECT slug FROM shops WHERE owner_id = ?', user.id)
    if (existing) return { ok: true as const, slug: existing.slug }
    if (!data.name) return { error: 'name' as const }
    if (data.slug.length < 3 || RESERVED_SLUGS.has(data.slug)) return { error: 'slug' as const }
    if (await first('SELECT 1 FROM shops WHERE slug = ?', data.slug)) return { error: 'slug_taken' as const }
    await run(
      `INSERT INTO shops (id, owner_id, slug, name, category, whatsapp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      user.id,
      data.slug,
      data.name,
      data.category,
      data.whatsapp || user.phone,
      now(),
    )
    return { ok: true as const, slug: data.slug }
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
    await run(
      `UPDATE shops SET name = ?, bio = ?, category = ?, logo_key = ?, whatsapp = ?, instagram = ?, tiktok = ?,
         facebook = ?, location = ?, hours = ?, lipa_number = ?, lipa_name = ?, lipa_network = ?,
         lipa_is_personal = ?, cod_enabled = ? WHERE id = ?`,
      str(data.name, 60) || shop.name,
      str(data.bio, 300),
      CATEGORIES.some((c) => c.id === data.category) ? data.category : 'other',
      data.logo_key ? str(data.logo_key, 100) : null,
      normalizePhone(str(data.whatsapp)),
      str(data.instagram, 60).replace(/^@/, ''),
      str(data.tiktok, 60).replace(/^@/, ''),
      str(data.facebook, 100),
      str(data.location, 200),
      str(data.hours, 100),
      str(data.lipa_number, 20).replace(/\s+/g, ''),
      str(data.lipa_name, 80),
      str(data.lipa_network, 30),
      data.lipa_is_personal ? 1 : 0,
      data.cod_enabled ? 1 : 0,
      shop.id,
    )
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
  const row = await first<{ to_check: number | null; to_send: number | null }>(
    `SELECT SUM(status = 'payment_claimed') to_check, SUM(status = 'confirmed') to_send FROM orders WHERE shop_id = ?`,
    shop.id,
  )
  return { toCheck: row?.to_check ?? 0, toSend: row?.to_send ?? 0 }
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
      `SELECT SUM(type = 'view_shop') shop, SUM(type = 'view_product') product, SUM(type = 'share') share
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
    first<{ total: number; orders: number; visits: number }>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE shop_id = ?1 AND created_at BETWEEN ?2 AND ?3
            AND status IN ('confirmed','dispatched','delivered')) total,
         (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND created_at BETWEEN ?2 AND ?3) orders,
         (SELECT COUNT(*) FROM events WHERE shop_id = ?1 AND type = 'view_shop' AND created_at BETWEEN ?2 AND ?3) visits`,
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
    first<{ all_orders: number; paid: number; pending: number; cancelled: number }>(
      `SELECT COUNT(*) all_orders,
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
  const todayDay = Math.floor((now() + TZ) / 86400_000)
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = todayDay - 6 + i
    return { day: day * 86400_000, total: daily.find((d) => d.day === day)?.total ?? 0 }
  })
  return {
    today: { total: today?.total ?? 0, orders: today?.orders ?? 0 },
    queue: { toConfirm: queue?.to_confirm ?? 0, toSend: queue?.to_send ?? 0, onTheWay: queue?.on_the_way ?? 0 },
    days,
    prev: prev ?? { total: 0, orders: 0, visits: 0 },
    counts: {
      all: counts?.all_orders ?? 0,
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
  active: number
  views: number
}

type ProductDbRow = Omit<ProductRow, 'images' | 'sizes'> & { images: string; sizes: string | null }
const toProduct = (r: ProductDbRow): ProductRow => ({ ...r, images: JSON.parse(r.images), sizes: parseSizes(r.sizes) })

export const listMyProducts = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const rows = await all<ProductDbRow>(
    'SELECT * FROM products WHERE shop_id = ? ORDER BY created_at DESC',
    shop.id,
  )
  return rows.map(toProduct)
})

export const getMyProduct = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const row = await first<ProductDbRow>(
      'SELECT * FROM products WHERE id = ? AND shop_id = ?',
      data.id,
      shop.id,
    )
    return row ? toProduct(row) : null
  })

/** A link name for a product that no other product in the shop uses: gauni-la-jua, then gauni-la-jua-2. */
async function uniqueProductSlug(shopId: string, name: string, exceptId = '') {
  const base = productSlug(name)
  const taken = new Set(
    (await all<{ slug: string }>('SELECT slug FROM products WHERE shop_id = ? AND slug IS NOT NULL AND id != ?', shopId, exceptId)).map((r) => r.slug),
  )
  if (!taken.has(base) && !RESERVED_PRODUCT_SLUGS.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

export const saveProduct = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      id?: string
      name: string
      description: string
      price: number | string
      compare_price?: number | string | null
      stock?: number | string | null
      sizes?: { label: string; stock: number | string | null }[] | null
      images: string[]
      active: boolean
    }) => d,
  )
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const name = str(data.name, 100)
    const price = int(data.price)
    if (!name) return { error: 'name' as const }
    if (!price) return { error: 'price' as const }
    const compare = data.compare_price ? int(data.compare_price) || null : null
    const count = (v: number | string | null | undefined) => (v === '' || v == null ? null : int(v))
    const sizes: Size[] = []
    for (const s of data.sizes ?? []) {
      const label = str(s.label, 20)
      if (label && !sizes.some((x) => x.label.toLowerCase() === label.toLowerCase())) sizes.push({ label, stock: count(s.stock) })
    }
    // With sizes, the product's stock is their total.
    const stock = sizes.length ? sizesTotal(sizes) : count(data.stock)
    const sizesJson = sizes.length ? JSON.stringify(sizes.slice(0, 20)) : null
    const images = JSON.stringify((data.images ?? []).slice(0, 6).map((k) => str(k, 100)))
    if (data.id) {
      // The link name stays when a product is renamed, so links already shared keep working.
      const current = await first<{ slug: string | null }>('SELECT slug FROM products WHERE id = ? AND shop_id = ?', data.id, shop.id)
      const slug = current?.slug ?? (await uniqueProductSlug(shop.id, name, data.id))
      await run(
        `UPDATE products SET name = ?, description = ?, price = ?, compare_price = ?, stock = ?, sizes = ?, images = ?, active = ?, slug = ?
         WHERE id = ? AND shop_id = ?`,
        name, str(data.description, 2000), price, compare, stock, sizesJson, images, data.active ? 1 : 0, slug, data.id, shop.id,
      )
      return { ok: true as const, id: data.id, slug }
    }
    const id = newId()
    const slug = await uniqueProductSlug(shop.id, name)
    await run(
      `INSERT INTO products (id, shop_id, slug, name, description, price, compare_price, stock, sizes, images, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, shop.id, slug, name, str(data.description, 2000), price, compare, stock, sizesJson, images, data.active ? 1 : 0, now(),
    )
    return { ok: true as const, id, slug }
  })

export const deleteProduct = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('DELETE FROM products WHERE id = ? AND shop_id = ?', data.id, shop.id)
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
  payment_method: 'lipa' | 'cod'
  status: OrderStatus
  created_at: number
  items: number
}

export const listOrders = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  return all<OrderListRow>(
    `SELECT o.id, o.code, o.customer_name, o.customer_phone, o.area, o.total, o.payment_method, o.status, o.created_at,
       (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) items
     FROM orders o WHERE o.shop_id = ? ORDER BY o.created_at DESC LIMIT 300`,
    shop.id,
  )
})

export type OrderDetail = OrderListRow & {
  landmark: string
  note: string
  subtotal: number
  delivery_fee: number
  payment_sms: string | null
  txn_id: string | null
  payment_check: string | null
  paid_claimed_at: number | null
  lines: { name: string; price: number; qty: number; image: string | null; variant: string | null }[]
}

export const getOrder = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const order = await first<Omit<OrderDetail, 'lines' | 'items'>>(
      'SELECT * FROM orders WHERE id = ? AND shop_id = ?',
      data.id,
      shop.id,
    )
    if (!order) return null
    const lines = await all<OrderDetail['lines'][number]>(
      'SELECT name, price, qty, image, variant FROM order_items WHERE order_id = ?',
      order.id,
    )
    return { ...order, lines, items: lines.reduce((s, l) => s + l.qty, 0) } as OrderDetail
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
    const order = await first<{ status: OrderStatus }>(
      'SELECT status FROM orders WHERE id = ? AND shop_id = ?',
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
    if (data.status === 'cancelled' && ['confirmed', 'dispatched'].includes(order.status)) await moveStock(data.id, 1)
    if (data.status === 'confirmed' && order.status !== 'confirmed') await moveStock(data.id, -1)
    return { ok: true }
  })
