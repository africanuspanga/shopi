import { all, first, media } from '#/server/db'
import { thumbKey } from '#/lib/format'

/**
 * Deletes photos a shop has stopped using, with their small copies, so storage only holds what is on show.
 * Keeps any photo that a past order still shows or another of the shop's products still uses, and never
 * touches another shop's files (keys are checked against the shop's own folder).
 */
export async function removePhotos(shopId: string, keys: (string | null | undefined)[]) {
  const mine = [...new Set(keys.filter((k): k is string => !!k && k.startsWith(`s/${shopId}/`)))]
  if (!mine.length) return
  const inOrders = await all<{ image: string }>(
    `SELECT DISTINCT image FROM order_items WHERE image IN (${mine.map(() => '?').join(',')})`,
    ...mine,
  )
  const keep = new Set(inOrders.map((r) => r.image))
  const gone: string[] = []
  for (const k of mine) {
    if (keep.has(k)) continue
    const used = await first<{ n: number }>(
      `SELECT COUNT(*) n FROM products WHERE shop_id = ? AND images LIKE ?`,
      shopId,
      `%"${k}"%`,
    )
    if (!used?.n) gone.push(k)
  }
  if (gone.length) await media().delete(gone.flatMap((k) => [k, thumbKey(k)]))
}
