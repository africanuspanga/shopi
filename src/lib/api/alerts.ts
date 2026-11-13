import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { purgeOldAlerts, withReadiness, type AlertRow } from '#/server/alerts'
import { all, first, newId, now, run } from '#/server/db'
import { normalizePhone, parseSizes } from '#/lib/format'

/**
 * A buyer asks for a WhatsApp message when a sold-out product, or one of its options, is back.
 * Asking twice for the same thing with the same number keeps one alert.
 */
export const askStockAlert = createServerFn({ method: 'POST' })
  .validator((d: { shopId: string; productId: string; size?: string | null; phone: string }) => ({
    shopId: String(d.shopId),
    productId: String(d.productId),
    size: d.size ? String(d.size).slice(0, 20) : '',
    phone: normalizePhone(String(d.phone ?? '')),
  }))
  .handler(async ({ data }) => {
    if (!data.phone) return { error: 'phone' as const }
    const p = await first<{ stock: number | null; sizes: string | null; status: string }>(
      `SELECT p.stock, p.sizes, s.status FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.id = ? AND p.shop_id = ? AND p.active = 1 AND s.status IN ('active', 'demo')`,
      data.productId,
      data.shopId,
    )
    if (!p) return { error: 'product' as const }
    // A sample shop takes no orders, so it takes no buyers' numbers either.
    if (p.status === 'demo') return { error: 'demo' as const }
    const sizes = parseSizes(p.sizes)
    const option = data.size && sizes ? sizes.find((s) => s.label === data.size) : null
    if (data.size && !option) return { error: 'product' as const }
    // Only for something buyers can't get right now.
    if (option ? option.stock !== 0 : p.stock !== 0) return { error: 'in_stock' as const }
    await run(
      `INSERT INTO stock_alerts (id, shop_id, product_id, variant, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (product_id, variant, phone) DO NOTHING`,
      newId(), data.shopId, data.productId, option?.label ?? '', data.phone, now(),
    )
    await purgeOldAlerts()
    return { ok: true as const }
  })

export type StockAlert = Awaited<ReturnType<typeof withReadiness>>[number]

/** The people waiting for one product, oldest first, with whether what they asked for is back. */
export const listStockAlerts = createServerFn({ method: 'GET' })
  .validator((d: { productId: string }) => ({ productId: String(d.productId) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await purgeOldAlerts()
    const rows = await all<AlertRow>(
      'SELECT id, product_id, variant, phone, created_at FROM stock_alerts WHERE shop_id = ? AND product_id = ? ORDER BY created_at',
      shop.id,
      data.productId,
    )
    return withReadiness(shop.id, rows)
  })

/** The seller has told this buyer (or doesn't want to): the alert and the number are deleted. */
export const doneStockAlert = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('DELETE FROM stock_alerts WHERE id = ? AND shop_id = ?', data.id, shop.id)
    return { ok: true as const }
  })
