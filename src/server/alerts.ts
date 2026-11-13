import { all, now, run } from '#/server/db'
import { parseSizes } from '#/lib/format'

/** Back-in-stock alerts live 90 days at most (Privacy page). */
export const ALERT_DAYS = 90

/**
 * Deletes alerts older than 90 days, for every shop. Cheap (indexed on created_at), so it runs where alerts are made and
 * read: a buyer asking, and a seller opening Home or a product. A nightly job can take over once one exists.
 */
export async function purgeOldAlerts() {
  await run('DELETE FROM stock_alerts WHERE created_at < ?', now() - ALERT_DAYS * 86400_000)
}

export type AlertRow = { id: string; product_id: string; variant: string; phone: string; created_at: number }

/**
 * Whether what each alert asked for can be bought again: the product, or its option, has stock (or isn't counted).
 * An option the seller no longer offers is not back.
 */
export async function withReadiness(shopId: string, alerts: AlertRow[]) {
  const ids = [...new Set(alerts.map((a) => a.product_id))]
  const products = ids.length
    ? await all<{ id: string; name: string; slug: string | null; images: string; stock: number | null; sizes: string | null; option_name: string | null }>(
        `SELECT id, name, slug, images, stock, sizes, option_name FROM products WHERE shop_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
        shopId,
        ...ids,
      )
    : []
  return alerts.flatMap((a) => {
    const p = products.find((x) => x.id === a.product_id)
    if (!p) return []
    const sizes = parseSizes(p.sizes)
    const option = a.variant && sizes ? sizes.find((s) => s.label === a.variant) : null
    const back = a.variant ? !!option && option.stock !== 0 : p.stock !== 0
    return [{ ...a, back, offered: !a.variant || !!option, product: { id: p.id, name: p.name, slug: p.slug, image: (JSON.parse(p.images) as string[])[0] ?? null, option_name: p.option_name } }]
  })
}
