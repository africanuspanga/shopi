import { all, first, now } from '#/server/db'
import { parseSizes } from '#/lib/format'

/** A bag link works for this many days, and once. */
export const BAG_DAYS = 7

/** One line of a bag link as stored. Price is the seller's, per piece. Name and image are copies from when it was made. */
export type BagItem = { productId: string; size: string | null; qty: number; price: number; name: string; image: string | null }
/** open: waiting for the buyer. used: it became an order. cancelled: by the seller. expired: 7 days passed. */
export type BagState = 'open' | 'used' | 'cancelled' | 'expired'
/** A line with the product as it is now, and why it can't be ordered when it can't. */
export type BagLine = BagItem & { problem: 'gone' | 'size' | 'stock' | null }

export type BagRow = {
  id: string
  shop_id: string
  code: string
  items: string
  customer_name: string
  customer_phone: string
  note: string
  status: string
  order_id: string | null
  expires_at: number
  created_at: number
  used_at: number | null
}

export const bagState = (b: Pick<BagRow, 'status' | 'expires_at'>, t = now()): BagState =>
  b.status === 'used' ? 'used' : b.status === 'cancelled' ? 'cancelled' : b.expires_at > t ? 'open' : 'expired'

export function parseBagItems(raw: string): BagItem[] {
  try {
    const list = JSON.parse(raw) as BagItem[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Codes are 8 characters from the order-code alphabet; links typed by hand still find them in any case. */
export const cleanBagCode = (raw: unknown) =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 12)

/** An open bag link of this shop, or null when it is used, cancelled, expired or not there. */
export async function openBag(shopId: string, code: string) {
  const b = await first<BagRow>('SELECT * FROM bag_links WHERE shop_id = ? AND code = ?', shopId, cleanBagCode(code))
  return b && bagState(b) === 'open' ? { ...b, lines: parseBagItems(b.items) } : null
}

/**
 * The lines of a bag against the products as they are now: deleted ('gone'), the chosen size no longer offered ('size'),
 * or not enough stock ('stock'). Lines for the same product and size draw on the same stock.
 * Hidden products are fine: a seller may keep a piece out of the shop for one buyer.
 */
export async function bagLines(shopId: string, items: BagItem[]): Promise<BagLine[]> {
  const ids = [...new Set(items.map((i) => i.productId))]
  const products = ids.length
    ? await all<{ id: string; name: string; stock: number | null; sizes: string | null }>(
        `SELECT id, name, stock, sizes FROM products WHERE shop_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
        shopId,
        ...ids,
      )
    : []
  const want = new Map<string, number>()
  for (const i of items) want.set(`${i.productId}|${i.size ?? ''}`, (want.get(`${i.productId}|${i.size ?? ''}`) ?? 0) + i.qty)
  return items.map((i): BagLine => {
    const p = products.find((x) => x.id === i.productId)
    if (!p) return { ...i, problem: 'gone' }
    const sizes = parseSizes(p.sizes)
    const size = sizes && i.size ? sizes.find((s) => s.label === i.size) : null
    if (sizes && !size) return { ...i, name: p.name, problem: 'size' }
    const left = size ? size.stock : p.stock
    return { ...i, name: p.name, problem: left != null && left < (want.get(`${i.productId}|${i.size ?? ''}`) ?? i.qty) ? 'stock' : null }
  })
}
