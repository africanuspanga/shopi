import { all, db } from '#/server/db'

/** A shop shows at most this many top picks (roadmap q-picks). */
export const MAX_PICKS = 4

/** The shop's top picks, as product ids in the seller's order. */
export async function readPicks(shopId: string) {
  const rows = await all<{ id: string }>('SELECT id FROM products WHERE shop_id = ? AND pick_rank IS NOT NULL ORDER BY pick_rank', shopId)
  return rows.map((r) => r.id)
}

/**
 * Make these products the shop's top picks, in this order. Ids from another shop, repeats and anything past the fourth
 * are left out. The ranks are cleared and set again 1..n in one batch, so they never collide with the unique index.
 */
export async function writePicks(shopId: string, ids: string[]) {
  const wanted = [...new Set(ids.map(String))]
  const mine = wanted.length
    ? new Set(
        (
          await all<{ id: string }>(
            `SELECT id FROM products WHERE shop_id = ? AND id IN (${wanted.map(() => '?').join(',')})`,
            shopId,
            ...wanted,
          )
        ).map((r) => r.id),
      )
    : new Set<string>()
  const picks = wanted.filter((id) => mine.has(id)).slice(0, MAX_PICKS)
  await db().batch([
    db().prepare('UPDATE products SET pick_rank = NULL WHERE shop_id = ? AND pick_rank IS NOT NULL').bind(shopId),
    ...picks.map((id, i) => db().prepare('UPDATE products SET pick_rank = ? WHERE id = ? AND shop_id = ?').bind(i + 1, id, shopId)),
  ])
  return picks
}

/** Put one product in the top picks (at the end, if there is room) or take it out. */
export async function setPick(shopId: string, productId: string, on: boolean) {
  const picks = await readPicks(shopId)
  const has = picks.includes(productId)
  if (on === has) return picks
  if (on && picks.length >= MAX_PICKS) return picks
  return writePicks(shopId, on ? [...picks, productId] : picks.filter((id) => id !== productId))
}
