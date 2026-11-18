import { FREE_PRODUCTS, can } from '#/lib/plans'
import { shopPlan } from '#/server/plan'
import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, db, first, newId, now } from '#/server/db'
import { cleanProduct, takenProductSlugs, type ProductInput } from '#/server/products'
import { RESERVED_PRODUCT_SLUGS, collectionSlug, freeSlug, productSlug } from '#/lib/format'

/** Products saved per call: the import screen sends them in chunks as their photos come in. */
export const IMPORT_CHUNK = 20
const HOUR = 3_600_000

export type ImportItem = Omit<ProductInput, 'images'> & {
  images: string[]
  /** Collection names; a name the shop doesn't have yet becomes a new collection. */
  collections: string[]
  /** Its place in the whole sheet, so the shop shows the products in the sheet's order. */
  index: number
}

export type ImportResult = {
  added: { index: number; id: string; name: string }[]
  /** Left out here: already in the shop (a second try of the same sheet), or no name or price. */
  skipped: { index: number; why: 'exists' | 'name' | 'price' | 'limit' }[]
  /** Collections this chunk made. */
  collections: string[]
  /** The time the products are dated from: pass it back with the next chunk. */
  start: number
}

/**
 * Saves a chunk of imported products, with the same rules as the product form (cleanProduct). Names already in the
 * shop are left out, so a sheet imported again, or an import retried after a dropped connection, adds nothing twice.
 * Products without a photo stay hidden whatever `active` says: a shop of empty frames looks closed.
 */
export const importProducts = createServerFn({ method: 'POST' })
  .validator((d: { products: ImportItem[]; active: boolean; /** 0 on the first chunk. */ start: number }) => d)
  .handler(async ({ data }): Promise<ImportResult> => {
    const { shop } = await requireShop('products')
    const list = (data.products ?? []).slice(0, IMPORT_CHUNK)
    const at = now()
    // The sheet's first row is the newest, so it shows first in the shop.
    const start = Math.min(at, Math.max(at - HOUR, Number(data.start) || at))
    const [names, slugs, cols, lastSort] = await Promise.all([
      all<{ name: string }>('SELECT name FROM products WHERE shop_id = ?', shop.id),
      takenProductSlugs(shop.id),
      all<{ id: string; slug: string; name: string }>('SELECT id, slug, name FROM collections WHERE shop_id = ?', shop.id),
      first<{ n: number | null }>('SELECT MAX(sort) n FROM collections WHERE shop_id = ?', shop.id),
    ])
    const have = new Set(names.map((r) => r.name.toLowerCase()))
    // A free shop holds up to FREE_PRODUCTS; rows past it are left out and the done screen says why (17 Nov).
    let room = can(await shopPlan(shop.id), 'unlimitedProducts') ? Infinity : FREE_PRODUCTS - names.length
    const colByName = new Map(cols.map((c) => [c.name.toLowerCase(), c.id]))
    const colSlugs = new Set(cols.map((c) => c.slug))
    let sort = lastSort?.n ?? -1
    const result: ImportResult = { added: [], skipped: [], collections: [], start }
    const stmts: D1PreparedStatement[] = []

    for (const item of list) {
      // Photos must be this shop's own uploads.
      const p = cleanProduct({ ...item, images: (item.images ?? []).filter((k) => typeof k === 'string' && k.startsWith(`s/${shop.id}/`)) })
      if ('error' in p) {
        result.skipped.push({ index: item.index, why: p.error })
        continue
      }
      if (have.has(p.name.toLowerCase())) {
        result.skipped.push({ index: item.index, why: 'exists' })
        continue
      }
      if (room <= 0) {
        result.skipped.push({ index: item.index, why: 'limit' })
        continue
      }
      room--
      have.add(p.name.toLowerCase())
      const id = newId()
      const slug = freeSlug(productSlug(p.name), slugs, RESERVED_PRODUCT_SLUGS)
      slugs.add(slug)
      stmts.push(
        db()
          .prepare(
            `INSERT INTO products (id, shop_id, slug, name, description, price, compare_price, stock, sizes, option_name, images, active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, shop.id, slug, p.name, p.description, p.price, p.compare, p.stock, p.sizes, p.optionName, JSON.stringify(p.photos),
            data.active && p.photos.length ? 1 : 0, start - Math.max(0, Math.floor(Number(item.index) || 0))),
      )
      for (const raw of (item.collections ?? []).slice(0, 5)) {
        const name = String(raw ?? '').trim().slice(0, 40)
        if (!name) continue
        let cid = colByName.get(name.toLowerCase())
        if (!cid) {
          cid = newId()
          const cslug = freeSlug(collectionSlug(name), colSlugs)
          colSlugs.add(cslug)
          colByName.set(name.toLowerCase(), cid)
          result.collections.push(name)
          stmts.push(
            db()
              .prepare('INSERT INTO collections (id, shop_id, slug, name, description, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .bind(cid, shop.id, cslug, name, '', ++sort, at),
          )
        }
        // At the end of the collection, in the sheet's order.
        stmts.push(
          db()
            .prepare(
              `INSERT OR IGNORE INTO collection_products (collection_id, product_id, sort)
               VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM collection_products WHERE collection_id = ?))`,
            )
            .bind(cid, id, cid),
        )
      }
      result.added.push({ index: item.index, id, name: p.name })
    }
    if (stmts.length) await db().batch(stmts)
    return result
  })
