import { all } from '#/server/db'
import { sizesTotal } from '#/server/stock'
import { RESERVED_PRODUCT_SLUGS, freeSlug, optionKind, productSlug, type OptionKind, type Size } from '#/lib/format'

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** A product as the product form or the bulk import sends it. */
export type ProductInput = {
  name: string
  description: string
  price: number | string
  compare_price?: number | string | null
  stock?: number | string | null
  /** Each option may have its own price (empty: the product's) and photo (one of `images`). */
  sizes?: { label: string; stock: number | string | null; price?: number | string | null; image?: string | null }[] | null
  option_name?: string | null
  images: string[]
}

/** A product as the database keeps it. */
export type CleanProduct = {
  name: string
  description: string
  price: number
  compare: number | null
  stock: number | null
  /** Options as JSON, or null without options. */
  sizes: string | null
  optionName: OptionKind | null
  photos: string[]
}

/** A product cleaned to what the database keeps, or what is missing. The form and the import share these rules. */
export function cleanProduct(data: ProductInput): CleanProduct | { error: 'name' | 'price' } {
  const name = str(data.name, 100)
  const price = int(data.price)
  if (!name) return { error: 'name' }
  if (!price) return { error: 'price' }
  const compare = data.compare_price ? int(data.compare_price) || null : null
  const count = (v: number | string | null | undefined) => (v === '' || v == null ? null : int(v))
  const photos = (data.images ?? []).slice(0, 6).map((k) => str(k, 100))
  const sizes: Size[] = []
  for (const s of data.sizes ?? []) {
    const label = str(s.label, 20)
    if (!label || sizes.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue
    const own = s.price === '' || s.price == null ? 0 : int(s.price)
    const image = s.image && photos.includes(s.image) ? s.image : null
    // An option's price only counts when it differs from the product's.
    sizes.push({ label, stock: count(s.stock), ...(own && own !== price ? { price: own } : {}), ...(image ? { image } : {}) })
  }
  const kind = optionKind(data.option_name)
  return {
    name,
    description: str(data.description, 2000),
    price,
    compare,
    // With sizes, the product's stock is their total.
    stock: sizes.length ? sizesTotal(sizes) : count(data.stock),
    sizes: sizes.length ? JSON.stringify(sizes.slice(0, 20)) : null,
    optionName: sizes.length && kind !== 'size' ? kind : null,
    photos,
  }
}

/** The link names the shop's products already use (all but `exceptId`). */
export async function takenProductSlugs(shopId: string, exceptId = '') {
  const rows = await all<{ slug: string }>('SELECT slug FROM products WHERE shop_id = ? AND slug IS NOT NULL AND id != ?', shopId, exceptId)
  return new Set(rows.map((r) => r.slug))
}

/** A link name for a product that no other product in the shop uses: gauni-la-jua, then gauni-la-jua-2. */
export async function uniqueProductSlug(shopId: string, name: string, exceptId = '') {
  return freeSlug(productSlug(name), await takenProductSlugs(shopId, exceptId), RESERVED_PRODUCT_SLUGS)
}
