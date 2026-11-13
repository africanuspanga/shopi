import { BILLING_LIVE } from '#/lib/plans'
import { shopPlan } from '#/server/plan'
import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { all, db, first, newId, now, orderCode, run } from '#/server/db'
import { normalizePhone, parseSizes, type OrderStatus, type Size } from '#/lib/format'
import { moveStock } from '#/server/stock'
import { openBag } from '#/server/bags'
import { namesMatch, parsePaymentSms, type PaymentCheck } from '#/lib/payment-sms'

export type PublicShop = {
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
  /** Optional Google Maps link for directions. */
  maps_url: string
  /** Optional TRA TIN, 9 digits. */
  tin: string
  hours: string
  lipa_number: string
  lipa_name: string
  lipa_network: string
  cod_enabled: number
  /** 'active', or 'demo' for a sample shop: shown with a banner, kept out of search, orders refused. */
  status: string
}
export type PublicProduct = {
  id: string
  /** Readable link name, unique in the shop. Null for products saved before links existed. */
  slug: string | null
  name: string
  description: string
  price: number
  compare_price: number | null
  stock: number | null
  sizes: Size[] | null
  images: string[]
  created_at: number
}

const SHOP_COLS = `id, slug, name, bio, category, logo_key, whatsapp, instagram, tiktok, facebook, location, maps_url, tin, hours,
  lipa_number, lipa_name, lipa_network, cod_enabled, status`

export const getStorefront = createServerFn({ method: 'GET' })
  .validator((d: { slug: string }) => ({ slug: String(d.slug).toLowerCase() }))
  .handler(async ({ data }) => {
    const shop = await first<PublicShop>(`SELECT ${SHOP_COLS} FROM shops WHERE slug = ? AND status IN ('active', 'demo')`, data.slug)
    if (!shop) return null
    const [products, areas] = await Promise.all([
      all<Omit<PublicProduct, 'images' | 'sizes'> & { images: string; sizes: string | null }>(
        `SELECT id, slug, name, description, price, compare_price, stock, sizes, images, created_at FROM products
         WHERE shop_id = ? AND active = 1 ORDER BY created_at DESC`,
        shop.id,
      ),
      all<{ id: string; name: string; fee: number }>(
        'SELECT id, name, fee FROM delivery_areas WHERE shop_id = ? ORDER BY sort',
        shop.id,
      ),
    ])
    return {
      shop,
      areas,
      /** The plan ended: the shop "takes a break". Its page stays up with WhatsApp; orders are refused. */
      paused: BILLING_LIVE && (await shopPlan(shop.id))?.kind === 'ended',
      products: products.map((p) => ({ ...p, images: JSON.parse(p.images) as string[], sizes: parseSizes(p.sizes) })),
      // Link previews (WhatsApp, Instagram) need absolute image URLs.
      origin: getRequestUrl().origin,
    }
  })

export const placeOrder = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      shopId: string
      items?: { productId: string; qty: number; size?: string | null }[]
      /** A bag link's code. Its lines and the seller's prices are used instead of `items`, and it works once. */
      bag?: string
      name: string
      phone: string
      areaId: string
      areaOther?: string
      landmark: string
      note: string
      payment: 'lipa' | 'cod'
      visit?: { vid?: string; sid?: string; source?: string; tag?: string }
    }) => d,
  )
  .handler(async ({ data }) => {
    const shop = await first<{ id: string; cod_enabled: number; lipa_number: string; status: string }>(
      `SELECT id, cod_enabled, lipa_number, status FROM shops WHERE id = ? AND status IN ('active', 'demo')`,
      data.shopId,
    )
    if (!shop) return { error: 'shop' as const }
    if (shop.status === 'demo') return { error: 'demo' as const }
    if (BILLING_LIVE && (await shopPlan(shop.id))?.kind === 'ended') return { error: 'paused' as const }
    const name = String(data.name ?? '').trim().slice(0, 60)
    const phone = normalizePhone(String(data.phone ?? ''))
    if (!name) return { error: 'name' as const }
    if (!phone) return { error: 'phone' as const }
    const payment = data.payment === 'cod' ? 'cod' : 'lipa'
    if (payment === 'cod' && !shop.cod_enabled) return { error: 'payment' as const }
    if (payment === 'lipa' && !shop.lipa_number) return { error: 'payment' as const }

    // A bag link brings its own lines at the seller's prices, and may hold a product hidden from the shop.
    const bag = data.bag ? await openBag(shop.id, data.bag) : null
    if (data.bag && !bag) return { error: 'bag' as const }
    const wanted: { productId: string; qty: number; size?: string | null; price?: number }[] = bag
      ? bag.lines
      : (data.items ?? []).filter((i) => i.qty > 0).slice(0, 30)
    if (!wanted.length) return { error: 'empty' as const }
    const ids = [...new Set(wanted.map((i) => String(i.productId)))]
    const products = await all<{ id: string; name: string; price: number; stock: number | null; sizes: string | null; images: string }>(
      `SELECT id, name, price, stock, sizes, images FROM products WHERE shop_id = ? ${bag ? '' : 'AND active = 1'}
       AND id IN (${ids.map(() => '?').join(',')})`,
      shop.id,
      ...ids,
    )
    const lines = []
    // Lines of the same product and size draw on the same stock.
    const taken = new Map<string, number>()
    for (const item of wanted) {
      const p = products.find((x) => x.id === item.productId)
      if (!p) return { error: 'gone' as const }
      const qty = Math.min(99, Math.max(1, Math.round(item.qty)))
      const sizes = parseSizes(p.sizes)
      const size = sizes ? sizes.find((s) => s.label === item.size) : null
      if (sizes && !size) return { error: 'size' as const, product: p.name }
      const key = `${p.id}|${size?.label ?? ''}`
      taken.set(key, (taken.get(key) ?? 0) + qty)
      const left = size ? size.stock : p.stock
      if (left != null && left < taken.get(key)!) return { error: 'stock' as const, product: size ? `${p.name} (${size.label})` : p.name }
      lines.push({ p, qty, variant: size?.label ?? null, price: bag && item.price != null ? item.price : p.price })
    }
    // Delivery fees stay out of Shopi: buyer and seller agree them on WhatsApp.
    // The buyer picks one of the shop's areas, or writes their own.
    const typed = String(data.areaOther ?? '').trim().slice(0, 60)
    const listed =
      data.areaId && data.areaId !== 'other'
        ? await first<{ name: string }>('SELECT name FROM delivery_areas WHERE id = ? AND shop_id = ?', data.areaId, shop.id)
        : null
    const area = listed ?? (typed ? { name: typed } : null)
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
    const fee = 0
    const id = newId()
    const code = orderCode()
    const t = now()
    // Where the buyer came from, so this order's money is credited to its source. Orders from a bag link count as 'bag_link'.
    const isId = (v: unknown) => (typeof v === 'string' && /^[\w-]{8,64}$/.test(v) ? v : null)
    const word = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    const visit = {
      vid: isId(data.visit?.vid),
      sid: isId(data.visit?.sid),
      source: bag ? 'bag_link' : word(data.visit?.source) || 'direct',
      tag: word(data.visit?.tag) || null,
    }
    // Claim the bag link before the order exists, so two taps (or two phones) can never order it twice.
    if (bag) {
      const claimed = await run(
        `UPDATE bag_links SET status = 'used', order_id = ?, used_at = ? WHERE id = ? AND status = 'open' AND expires_at > ?`,
        id, t, bag.id, t,
      )
      if (!claimed.meta.changes) return { error: 'bag' as const }
    }
    try {
      await db().batch([
        db()
          .prepare(
            `INSERT INTO orders (id, shop_id, code, customer_name, customer_phone, area, landmark, note, subtotal,
               delivery_fee, total, payment_method, status, created_at, updated_at, source, link_tag, visitor_id, session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id, shop.id, code, name, phone, area?.name ?? '', String(data.landmark ?? '').slice(0, 200),
            String(data.note ?? '').slice(0, 500), subtotal, fee, subtotal + fee, payment,
            payment === 'cod' ? 'confirmed' : 'awaiting_payment', t, t, visit.source, visit.tag, visit.vid, visit.sid,
          ),
        ...lines.map((l) =>
          db()
            .prepare('INSERT INTO order_items (order_id, product_id, name, price, qty, image, variant) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(id, l.p.id, l.p.name, l.price, l.qty, (JSON.parse(l.p.images) as string[])[0] ?? null, l.variant),
        ),
      ])
    } catch (e) {
      // The order did not save: the bag link opens again.
      if (bag) await run(`UPDATE bag_links SET status = 'open', order_id = NULL, used_at = NULL WHERE id = ?`, bag.id)
      throw e
    }
    if (payment === 'cod') {
      // Cash on delivery is confirmed at once, so stock is held now.
      await moveStock(id, -1)
    }
    return { ok: true as const, code }
  })

export type TrackedOrder = {
  code: string
  status: OrderStatus
  customer_name: string
  area: string
  landmark: string
  subtotal: number
  delivery_fee: number
  total: number
  payment_method: 'lipa' | 'cod'
  payment_check: string | null
  created_at: number
  shop: { id: string; slug: string; name: string; logo_key: string | null; whatsapp: string; lipa_number: string; lipa_name: string; lipa_network: string; tin: string }
  lines: { name: string; price: number; qty: number; image: string | null; variant: string | null }[]
}

export const getTrackedOrder = createServerFn({ method: 'GET' })
  .validator((d: { code: string }) => ({ code: String(d.code).toUpperCase().slice(0, 10) }))
  .handler(async ({ data }) => {
    const order = await first<Omit<TrackedOrder, 'shop' | 'lines'> & { id: string; shop_id: string }>(
      `SELECT id, shop_id, code, status, customer_name, area, landmark, subtotal, delivery_fee, total, payment_method,
         payment_check, created_at FROM orders WHERE code = ?`,
      data.code,
    )
    if (!order) return null
    const [shop, lines] = await Promise.all([
      first<TrackedOrder['shop']>(
        'SELECT id, slug, name, logo_key, whatsapp, lipa_number, lipa_name, lipa_network, tin FROM shops WHERE id = ?',
        order.shop_id,
      ),
      all<TrackedOrder['lines'][number]>('SELECT name, price, qty, image, variant FROM order_items WHERE order_id = ?', order.id),
    ])
    const { id: _id, shop_id: _s, ...rest } = order
    return { ...rest, shop: shop!, lines } as TrackedOrder
  })

/** The buyer pastes the confirmation SMS. We check what we can; the merchant decides. */
export const submitPaymentSms = createServerFn({ method: 'POST' })
  .validator((d: { code: string; sms: string }) => ({
    code: String(d.code).toUpperCase().slice(0, 10),
    sms: String(d.sms ?? '').slice(0, 1000),
  }))
  .handler(async ({ data }) => {
    const order = await first<{ id: string; total: number; status: OrderStatus; lipa_name: string }>(
      `SELECT o.id, o.total, o.status, s.lipa_name FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.code = ?`,
      data.code,
    )
    if (!order) return { error: 'order' as const }
    if (!['awaiting_payment', 'payment_claimed'].includes(order.status)) return { error: 'status' as const }
    if (data.sms.trim().length < 20) return { error: 'short' as const }
    const parsed = parsePaymentSms(data.sms)
    const reused = parsed.txnId
      ? await first('SELECT 1 FROM orders WHERE txn_id = ? AND id != ?', parsed.txnId, order.id)
      : null
    if (reused) return { error: 'reused' as const }
    const nameOk = namesMatch(parsed.name, order.lipa_name)
    const check: PaymentCheck = {
      parsed,
      amount: parsed.amount == null ? 'unknown' : parsed.amount >= order.total ? 'ok' : 'low',
      name: nameOk == null ? 'unknown' : nameOk ? 'ok' : 'mismatch',
      txn: parsed.txnId ? 'ok' : 'unknown',
    }
    try {
      await run(
        `UPDATE orders SET status = 'payment_claimed', payment_sms = ?, txn_id = ?, payment_check = ?,
           paid_claimed_at = ?, updated_at = ? WHERE id = ?`,
        data.sms, parsed.txnId, JSON.stringify(check), now(), now(), order.id,
      )
    } catch {
      return { error: 'reused' as const }
    }
    return { ok: true as const, check }
  })
