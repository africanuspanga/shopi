import { all, db } from '#/server/db'
import { parseSizes, type Size } from '#/lib/format'

/**
 * Moves stock for every line of an order: -1 holds it (order confirmed), +1 gives it back (confirmed order cancelled).
 * Products with sizes move the stock of the size on the line and keep products.stock as the total.
 * Products with unlimited stock (NULL) are left alone.
 */
export async function moveStock(orderId: string, direction: -1 | 1) {
  const lines = await all<{ product_id: string; variant: string | null; qty: number; stock: number | null; sizes: string | null }>(
    `SELECT i.product_id, i.variant, i.qty, p.stock, p.sizes FROM order_items i
     JOIN products p ON p.id = i.product_id WHERE i.order_id = ?`,
    orderId,
  )
  const byProduct = new Map<string, { stock: number | null; sizes: Size[] | null }>()
  for (const l of lines) {
    const p = byProduct.get(l.product_id) ?? { stock: l.stock, sizes: parseSizes(l.sizes) }
    if (p.sizes && l.variant) {
      const s = p.sizes.find((x) => x.label === l.variant)
      if (s && s.stock != null) s.stock = Math.max(0, s.stock + direction * l.qty)
    } else if (p.stock != null) {
      p.stock = Math.max(0, p.stock + direction * l.qty)
    }
    byProduct.set(l.product_id, p)
  }
  if (!byProduct.size) return
  await db().batch(
    [...byProduct].map(([id, p]) => {
      const total = p.sizes ? sizesTotal(p.sizes) : p.stock
      return db()
        .prepare('UPDATE products SET stock = ?, sizes = ? WHERE id = ?')
        .bind(total, p.sizes ? JSON.stringify(p.sizes) : null, id)
    }),
  )
}

/** Total of all sizes, or NULL (unlimited) when any size has no count. */
export function sizesTotal(sizes: Size[]) {
  return sizes.some((s) => s.stock == null) ? null : sizes.reduce((sum, s) => sum + (s.stock ?? 0), 0)
}
