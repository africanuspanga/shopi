import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { BAG_DAYS, bagLines, bagState, cleanBagCode, parseBagItems, type BagItem, type BagLine, type BagRow, type BagState } from '#/server/bags'
import { all, first, newId, now, run, shortCode } from '#/server/db'
import { imageOf, normalizePhone, parseSizes } from '#/lib/format'

export type { BagLine, BagState }

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** A bag link in the seller's list. */
export type BagSummary = {
  id: string
  code: string
  name: string
  phone: string
  state: BagState
  /** Pieces in the bag. */
  count: number
  total: number
  image: string | null
  expires_at: number
  created_at: number
  used_at: number | null
  order_id: string | null
  order_code: string | null
}

function summary(b: BagRow & { order_code: string | null }, t = now()): BagSummary {
  const items = parseBagItems(b.items)
  return {
    id: b.id,
    code: b.code,
    name: b.customer_name,
    phone: b.customer_phone,
    state: bagState(b, t),
    count: items.reduce((s, i) => s + i.qty, 0),
    total: items.reduce((s, i) => s + i.price * i.qty, 0),
    image: items[0]?.image ?? null,
    expires_at: b.expires_at,
    created_at: b.created_at,
    used_at: b.used_at,
    order_id: b.order_id,
    order_code: b.order_code,
  }
}

/** The seller builds a bag for one buyer: shop products (hidden ones too), sizes, quantities and their own prices. */
export const createBagLink = createServerFn({ method: 'POST' })
  .validator(
    (d: { items: { productId: string; size?: string | null; qty: number; price: number | string }[]; name?: string; phone?: string; note?: string }) => d,
  )
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const wanted = (data.items ?? []).slice(0, 30)
    if (!wanted.length) return { error: 'empty' as const }
    const ids = [...new Set(wanted.map((i) => String(i.productId)))]
    const products = await all<{ id: string; name: string; sizes: string | null; images: string }>(
      `SELECT id, name, sizes, images FROM products WHERE shop_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      shop.id,
      ...ids,
    )
    const items: BagItem[] = []
    for (const w of wanted) {
      const p = products.find((x) => x.id === w.productId)
      if (!p) return { error: 'product' as const }
      const sizes = parseSizes(p.sizes)
      const size = sizes ? (sizes.find((s) => s.label === w.size) ?? null) : null
      if (sizes && !size) return { error: 'size' as const, product: p.name }
      items.push({
        productId: p.id,
        size: size?.label ?? null,
        qty: Math.min(99, Math.max(1, Math.round(Number(w.qty) || 1))),
        price: int(w.price),
        name: p.name,
        image: imageOf({ images: JSON.parse(p.images) as string[], sizes }, size?.label),
      })
    }
    if (!items.some((i) => i.price > 0)) return { error: 'price' as const }
    const phone = str(data.phone, 30) ? normalizePhone(str(data.phone, 30)) : ''
    if (str(data.phone, 30) && !phone) return { error: 'phone' as const }
    const t = now()
    const id = newId()
    // A clash between two random 8-character codes is next to impossible; try again if it happens.
    for (let attempt = 0; ; attempt++) {
      const code = shortCode(8)
      try {
        await run(
          `INSERT INTO bag_links (id, shop_id, code, items, customer_name, customer_phone, note, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, shop.id, code, JSON.stringify(items), str(data.name, 60), phone, str(data.note, 300), t + BAG_DAYS * 86400_000, t,
        )
        return { ok: true as const, id, code }
      } catch (e) {
        if (attempt >= 2) throw e
      }
    }
  })

export const listBagLinks = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const rows = await all<BagRow & { order_code: string | null }>(
    `SELECT b.*, o.code order_code FROM bag_links b LEFT JOIN orders o ON o.id = b.order_id
     WHERE b.shop_id = ? ORDER BY b.created_at DESC LIMIT 200`,
    shop.id,
  )
  const t = now()
  return rows.map((b) => summary(b, t))
})

export const getMyBagLink = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const b = await first<BagRow & { order_code: string | null }>(
      `SELECT b.*, o.code order_code FROM bag_links b LEFT JOIN orders o ON o.id = b.order_id WHERE b.id = ? AND b.shop_id = ?`,
      data.id,
      shop.id,
    )
    if (!b) return null
    return { ...summary(b), note: b.note, lines: await bagLines(shop.id, parseBagItems(b.items)) }
  })

/** An open link stops working. A used one stays: it is the record of where its order came from. */
export const cancelBagLink = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run(`UPDATE bag_links SET status = 'cancelled' WHERE id = ? AND shop_id = ? AND status = 'open'`, data.id, shop.id)
    return { ok: true as const }
  })

/** What the buyer sees at shopi.tz/<shop>/b/<code>. The buyer's details only travel while the link is open. */
export const getBagLink = createServerFn({ method: 'GET' })
  .validator((d: { shopId: string; code: string }) => ({ shopId: String(d.shopId), code: cleanBagCode(d.code) }))
  .handler(async ({ data }) => {
    const b = await first<BagRow & { order_code: string | null }>(
      `SELECT b.*, o.code order_code FROM bag_links b LEFT JOIN orders o ON o.id = b.order_id WHERE b.shop_id = ? AND b.code = ?`,
      data.shopId,
      data.code,
    )
    if (!b) return null
    const state = bagState(b)
    const open = state === 'open'
    return {
      code: b.code,
      state,
      lines: open ? await bagLines(data.shopId, parseBagItems(b.items)) : [],
      name: open ? b.customer_name : '',
      phone: open ? b.customer_phone : '',
      note: open ? b.note : '',
      expires_at: b.expires_at,
      order_code: state === 'used' ? b.order_code : null,
    }
  })

export type PublicBag = NonNullable<Awaited<ReturnType<typeof getBagLink>>>
export type MyBag = NonNullable<Awaited<ReturnType<typeof getMyBagLink>>>
