import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, db, first, newId, now, run } from '#/server/db'
import { collectionSlug, freeSlug } from '#/lib/format'

/** A collection in the seller's list: its products in order, and the first photos for its cover. */
export type CollectionRow = {
  id: string
  slug: string
  name: string
  description: string
  productIds: string[]
  /** Up to four main photos, for the cover. */
  images: string[]
}

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)

export const listCollections = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const [rows, members] = await Promise.all([
    all<Omit<CollectionRow, 'productIds' | 'images'>>(
      'SELECT id, slug, name, description FROM collections WHERE shop_id = ? ORDER BY sort, created_at',
      shop.id,
    ),
    all<{ collection_id: string; product_id: string; images: string }>(
      `SELECT cp.collection_id, cp.product_id, p.images FROM collection_products cp
       JOIN collections c ON c.id = cp.collection_id JOIN products p ON p.id = cp.product_id
       WHERE c.shop_id = ? ORDER BY cp.sort`,
      shop.id,
    ),
  ])
  return rows.map((c): CollectionRow => {
    const mine = members.filter((m) => m.collection_id === c.id)
    return {
      ...c,
      productIds: mine.map((m) => m.product_id),
      images: mine.flatMap((m) => (JSON.parse(m.images) as string[]).slice(0, 1)).slice(0, 4),
    }
  })
})

/** A link name for a collection that the shop's other collections don't use: eid, then eid-2. */
async function uniqueSlug(shopId: string, name: string) {
  const taken = new Set((await all<{ slug: string }>('SELECT slug FROM collections WHERE shop_id = ?', shopId)).map((r) => r.slug))
  return freeSlug(collectionSlug(name), taken)
}

/** Makes or changes a collection: its name, line, and products in the seller's order. The link stays on rename. */
export const saveCollection = createServerFn({ method: 'POST' })
  .validator((d: { id?: string; name: string; description?: string; productIds: string[] }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const name = str(data.name, 40)
    if (!name) return { error: 'name' as const }
    const wanted = [...new Set((data.productIds ?? []).map(String))].slice(0, 200)
    // Only this shop's products.
    const own = wanted.length
      ? new Set(
          (
            await all<{ id: string }>(`SELECT id FROM products WHERE shop_id = ? AND id IN (${wanted.map(() => '?').join(',')})`, shop.id, ...wanted)
          ).map((r) => r.id),
        )
      : new Set<string>()
    const ids = wanted.filter((id) => own.has(id))
    let id = data.id
    let slug: string
    if (id) {
      const current = await first<{ slug: string }>('SELECT slug FROM collections WHERE id = ? AND shop_id = ?', id, shop.id)
      if (!current) return { error: 'gone' as const }
      slug = current.slug
      await run('UPDATE collections SET name = ?, description = ? WHERE id = ?', name, str(data.description, 200), id)
    } else {
      id = newId()
      slug = await uniqueSlug(shop.id, name)
      const last = await first<{ n: number | null }>('SELECT MAX(sort) n FROM collections WHERE shop_id = ?', shop.id)
      await run(
        'INSERT INTO collections (id, shop_id, slug, name, description, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, shop.id, slug, name, str(data.description, 200), (last?.n ?? -1) + 1, now(),
      )
    }
    await db().batch([
      db().prepare('DELETE FROM collection_products WHERE collection_id = ?').bind(id),
      ...ids.map((pid, i) => db().prepare('INSERT INTO collection_products (collection_id, product_id, sort) VALUES (?, ?, ?)').bind(id, pid, i)),
    ])
    return { ok: true as const, id, slug }
  })

/** The seller's order of collections, for the shop's chips. */
export const orderCollections = createServerFn({ method: 'POST' })
  .validator((d: { ids: string[] }) => ({ ids: (d.ids ?? []).map(String).slice(0, 100) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    if (data.ids.length) {
      await db().batch(data.ids.map((id, i) => db().prepare('UPDATE collections SET sort = ? WHERE id = ? AND shop_id = ?').bind(i, id, shop.id)))
    }
    return { ok: true as const }
  })

/** Removes the collection and its link. Its products stay in the shop. */
export const deleteCollection = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const mine = await first('SELECT 1 FROM collections WHERE id = ? AND shop_id = ?', data.id, shop.id)
    if (!mine) return { ok: true as const }
    await db().batch([
      db().prepare('DELETE FROM collection_products WHERE collection_id = ?').bind(data.id),
      db().prepare('DELETE FROM collections WHERE id = ? AND shop_id = ?').bind(data.id, shop.id),
    ])
    return { ok: true as const }
  })
