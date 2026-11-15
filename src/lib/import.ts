import { msg } from '#/lib/i18n'
import type { OptionKind } from '#/lib/format'
import type { SheetRow } from '#/lib/sheet'

/**
 * Bulk import: which column holds what, and how the rows of a seller's sheet become products.
 * Pure functions, shared by the import screen and its checks. Rules:
 * - One product per row; only the name and the price are needed.
 * - A row with a name already used above, and a size or option, adds that option to the product above
 *   (a stock sheet: "Gauni, S, 3" then "Gauni, M, 5"). A row with no name but an option or a photo continues
 *   the product above, which is how Shopify exports variants and extra photos.
 * - A sizes cell may also list several: "S:3, M:5, L:2" (a size and how many) or "S, M, L".
 */

export type Field = 'name' | 'price' | 'compare' | 'stock' | 'options' | 'description' | 'photo' | 'collection' | 'skip'

export const FIELDS: { id: Field; label: string }[] = [
  { id: 'name', label: msg('Name') },
  { id: 'price', label: msg('Price') },
  { id: 'compare', label: msg('Was price') },
  { id: 'stock', label: msg('Stock') },
  { id: 'options', label: msg('Sizes or options') },
  { id: 'description', label: msg('Description') },
  { id: 'photo', label: msg('Photos') },
  { id: 'collection', label: msg('Collection') },
  { id: 'skip', label: msg('Don’t import') },
]

/** The template's columns, in the seller's language when it is downloaded (both languages are recognised). */
export const TEMPLATE_COLUMNS = [msg('Name'), msg('Price'), msg('Was price'), msg('Stock'), msg('Sizes'), msg('Description'), msg('Photos'), msg('Collection')]

export const MAX_IMPORT = 1000
export const MAX_PHOTOS = 6

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

/** Column names as sellers, Excel, Google Sheets, Shopify and WooCommerce write them, in English and Swahili. */
const EXACT: Record<Exclude<Field, 'skip'>, string[]> = {
  name: ['name', 'title', 'product', 'productname', 'item', 'itemname', 'jina', 'bidhaa', 'jinalabidhaa'],
  price: ['price', 'variantprice', 'saleprice', 'sellingprice', 'bei', 'beiyakuuza', 'beiyasasa', 'amount', 'pricetsh', 'pricetzs', 'beitsh'],
  compare: ['wasprice', 'was', 'compareatprice', 'variantcompareatprice', 'oldprice', 'regularprice', 'originalprice', 'beforeprice', 'beiyazamani', 'beiyamwanzo'],
  stock: ['stock', 'instock', 'qty', 'quantity', 'inventory', 'variantinventoryqty', 'available', 'idadi', 'stoki', 'zilizopo'],
  options: ['size', 'sizes', 'saizi', 'option', 'options', 'option1value', 'variant', 'colour', 'color', 'colours', 'colors', 'rangi', 'style', 'mtindo', 'model', 'flavour', 'flavor', 'ladha', 'sizesoroptions'],
  description: ['description', 'details', 'body', 'bodyhtml', 'about', 'maelezo', 'shortdescription'],
  photo: ['photo', 'photos', 'image', 'images', 'imagesrc', 'variantimage', 'picture', 'pictures', 'picha', 'imageurl', 'photourl', 'photolink', 'imagelink'],
  collection: ['collection', 'collections', 'category', 'categories', 'type', 'producttype', 'kundi', 'aina', 'jamii', 'makundi'],
}
/** Parts of longer names ("Price (TSh)", "Picha 2"), tried after the exact names, in this order. */
const STEMS: [Exclude<Field, 'skip'>, RegExp][] = [
  ['compare', /(was|compare|old|regular|original|before|zamani|mwanzo).*(price|bei)|(price|bei).*(was|compare|old|before|zamani|mwanzo)/],
  ['price', /price|bei/],
  ['stock', /stock|qty|quantity|inventory|idadi/],
  ['photo', /photo|image|picture|picha|img/],
  ['options', /size|saizi|colou?r|rangi|option/],
  ['description', /description|maelezo|details/],
  ['collection', /collection|categor|kundi/],
  ['name', /name|title|jina/],
]

const URL_RE = /^https?:\/\/\S+$/i
const FILE_RE = /^[^\s/\\]+\.(jpe?g|png|webp|gif|heic|heif|avif)$/i
const isPhoto = (s: string) => URL_RE.test(s) || FILE_RE.test(s)

/** Photo links and file names in one cell, which may hold several. */
export function photosIn(cell: string): string[] {
  return cell
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter(isPhoto)
}

/** The first few values of a column, to show beside its name. */
export function samples(rows: SheetRow[], col: number, count = 3) {
  const out: string[] = []
  for (const r of rows) {
    const v = r.cells[col]
    if (v) out.push(v)
    if (out.length >= count) break
  }
  return out
}

/** Whether the first row holds column names: a known name in it, or nothing in it that reads as a number. */
export function hasHeader(rows: SheetRow[], known: string[] = []) {
  const first = rows[0]?.cells ?? []
  const all = new Set([...Object.values(EXACT).flat(), ...known.map(key)])
  if (first.some((c) => all.has(key(c)) || STEMS.some(([, re]) => re.test(key(c))))) return true
  return !first.some((c) => money(c) > 0 || isPhoto(c))
}

/**
 * A first guess at what each column holds, from its name and then its values. Each field takes one column, except
 * photos (Photo 1, Photo 2…). `known` adds the template's names in the seller's language.
 */
export function guessFields(rows: SheetRow[], header: boolean, known: Partial<Record<Field, string[]>> = {}): Field[] {
  const width = Math.min(60, Math.max(0, ...rows.map((r) => r.cells.length)))
  const body = header ? rows.slice(1) : rows
  const names = header ? (rows[0]?.cells ?? []).map(key) : []
  const fields: Field[] = Array.from({ length: width }, () => 'skip')
  const taken = new Set<Field>()
  const looks = (col: number, f: Field) => {
    const vals = samples(body, col, 8)
    if (!vals.length) return f === 'photo' ? false : true
    if (f === 'photo') return vals.some((v) => photosIn(v).length)
    if (f === 'price' || f === 'compare') return vals.some((v) => money(v) > 0)
    if (f === 'stock') return vals.some((v) => /\d/.test(v))
    return true
  }
  const give = (col: number, f: Field) => {
    if (fields[col] !== 'skip' || (taken.has(f) && f !== 'photo') || !looks(col, f)) return
    fields[col] = f
    taken.add(f)
  }
  // Exact names, best word first: WooCommerce has both "In stock?" (yes or no) and "Stock" (how many).
  const exact = Object.entries(EXACT) as [Exclude<Field, 'skip'>, string[]][]
  for (const [f, words] of exact) {
    for (const w of [...(known[f] ?? []).map(key), ...words]) names.forEach((n, col) => n === w && give(col, f))
  }
  for (const [f, re] of STEMS) names.forEach((n, col) => n && re.test(n) && give(col, f))

  // Columns still unknown: read the values. Photo links, then the first wordy column as the name, the first money as the price.
  for (let col = 0; col < width; col++) {
    const vals = samples(body, col, 8)
    if (!vals.length || fields[col] !== 'skip') continue
    const share = (test: (v: string) => boolean) => vals.filter(test).length / vals.length
    if (share((v) => photosIn(v).length > 0) >= 0.5) give(col, 'photo')
    else if (!taken.has('name') && share((v) => /[a-z]/i.test(v) && !isPhoto(v)) >= 0.8) give(col, 'name')
    else if (!taken.has('price') && share((v) => money(v) >= 100) >= 0.8) give(col, 'price')
  }
  return fields
}

/** What buyers choose, from the options column's name: "Colour" -> colour. */
export function guessKind(header: string): OptionKind {
  const k = key(header)
  if (/colou?r|rangi/.test(k)) return 'colour'
  if (/flavou?r|ladha/.test(k)) return 'flavour'
  if (/model/.test(k)) return 'model'
  if (/style|mtindo|design/.test(k)) return 'style'
  return 'size'
}

/** What buyers choose in column `col`, from its name, or from the column that names it: Shopify's "Option1 Name". */
export function kindOf(rows: SheetRow[], col: number): OptionKind {
  const names = rows[0]?.cells ?? []
  const own = guessKind(names[col] ?? '')
  if (own !== 'size') return own
  const pair = names.findIndex((n, i) => i !== col && key(n) === key(names[col] ?? '').replace(/value$/, 'name'))
  return pair >= 0 ? guessKind(samples(rows.slice(1), pair, 1)[0] ?? '') : own
}

/** A price as sellers write it: 45000, 45,000, TSh 45,000/=, 45k, 1.2m, 45.000. 0 when there is none. */
export function money(raw: string): number {
  const s = raw.toLowerCase().replace(/ts?h|tzs|shs?\.?/g, ' ')
  const m = /(\d[\d.,\s]*)(k|m)?\b/.exec(s)
  if (!m) return 0
  let num = m[1].replace(/\s/g, '').replace(/[.,]$/, '')
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(num)) num = num.replace(/,/g, '')
  else if (/^\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '')
  else num = num.replace(/,/g, '.')
  const n = Number(num) * (m[2] === 'k' ? 1000 : m[2] === 'm' ? 1_000_000 : 1)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 999_999_999) : 0
}

/** Pieces in stock, or null when the cell is empty or says no number. */
export function pieces(raw: string): number | null {
  const m = /\d[\d,]*/.exec(raw)
  return m ? Math.min(Number(m[0].replace(/,/g, '')), 1_000_000) : null
}

export type ImportOption = { label: string; stock: number | null; price?: number }

/** "S:3, M:5, L" -> S with 3, M with 5, L not counted. Shopify's "Default Title" means no option. */
export function parseOptions(raw: string): ImportOption[] {
  const s = raw.trim()
  if (!s || /^default title$/i.test(s)) return []
  return s
    .split(/\s*[,;|\n]\s*/)
    .filter(Boolean)
    .map((part) => {
      const m = /^(.+?)\s*(?:[:=]\s*(\d+)|\(\s*(\d+)\s*\))$/.exec(part)
      return m ? { label: m[1].trim().slice(0, 20), stock: Number(m[2] ?? m[3]) } : { label: part.slice(0, 20), stock: null }
    })
}

/** Collection names in a cell: "Magauni, Ofa" or a path like "Nguo > Magauni" (the last part). */
export function parseCollections(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;|]/)
        .map((s) => (s.split('>').pop() ?? '').trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 5)
}

/** A description as plain text: HTML from Shopify or WooCommerce becomes lines. */
export function plainText(raw: string) {
  let s = raw
  if (/<[a-z][\s\S]*>/i.test(s)) {
    s = s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|h\d|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  }
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000)
}

export type Issue = 'name' | 'price' | 'twice' | 'exists' | 'example'

export type Draft = {
  /** The sheet's row number, as the seller sees it. */
  line: number
  name: string
  price: number
  compare: number | null
  stock: number | null
  options: ImportOption[]
  description: string
  /** Photo links and file names, as written. */
  photos: string[]
  collections: string[]
  issue: Issue | null
  /** For 'twice': the row that already has this name. */
  first?: number
}

/** Template example rows start like this, so a forgotten example is left out instead of imported. */
const EXAMPLE = /^(example|mfano)\s*:/i

/**
 * The products in a sheet. `existing` holds the names (lowercase) already in the shop: those rows are left out,
 * so importing the same sheet twice adds nothing twice.
 */
export function buildDrafts(rows: SheetRow[], fields: Field[], header: boolean, existing: Set<string>): Draft[] {
  const cols = (f: Field) => fields.flatMap((x, i) => (x === f ? [i] : []))
  const at = { name: cols('name'), price: cols('price'), compare: cols('compare'), stock: cols('stock'), options: cols('options'), description: cols('description'), photo: cols('photo'), collection: cols('collection') }
  const drafts: Draft[] = []
  const byName = new Map<string, Draft>()

  for (const r of header ? rows.slice(1) : rows) {
    const get = (list: number[]) => list.map((i) => r.cells[i] ?? '').find(Boolean) ?? ''
    const name = get(at.name).replace(/\s+/g, ' ').slice(0, 100)
    const price = money(get(at.price))
    const stock = pieces(get(at.stock))
    const options = parseOptions(get(at.options))
    const photos = at.photo.flatMap((i) => photosIn(r.cells[i] ?? ''))
    const collections = parseCollections(get(at.collection))
    const description = plainText(get(at.description))
    const row = { price, compare: money(get(at.compare)) || null, stock, options, photos, collections, description }

    const same = name ? byName.get(name.toLowerCase()) : drafts[drafts.length - 1]
    // An option row or a photo row for the product above (Shopify), or a stock sheet's next size.
    if (same && !same.issue && (options.length || (!name && photos.length))) {
      addRow(same, row)
      continue
    }
    if (!name && !price && !options.length && !photos.length && !description) continue
    const d: Draft = { line: r.n, name, price: 0, compare: null, stock: null, options: [], description: '', photos: [], collections: [], issue: null }
    if (!name) d.issue = 'name'
    else if (same) Object.assign(d, { issue: 'twice', first: same.line })
    addRow(d, row)
    drafts.push(d)
    if (name && !same) byName.set(name.toLowerCase(), d)
  }

  for (const d of drafts) {
    // A price only in the "was" column is the price.
    if (!d.price && d.compare) [d.price, d.compare] = [d.compare, null]
    if (!d.price && d.options.some((o) => o.price)) d.price = Math.min(...d.options.flatMap((o) => (o.price ? [o.price] : [])))
    for (const o of d.options) if (o.price === d.price) delete o.price
    if (d.compare && d.compare <= d.price) d.compare = null
    if (d.options.length) d.stock = d.options.some((o) => o.stock == null) ? null : d.options.reduce((s, o) => s + (o.stock ?? 0), 0)
    d.photos = [...new Set(d.photos)].slice(0, MAX_PHOTOS)
    if (d.issue) continue
    if (EXAMPLE.test(d.name)) d.issue = 'example'
    else if (!d.price) d.issue = 'price'
    else if (existing.has(d.name.toLowerCase())) d.issue = 'exists'
  }
  return drafts
}

type RowValues = { price: number; compare: number | null; stock: number | null; options: ImportOption[]; photos: string[]; collections: string[]; description: string }

/** Adds one row's values to a product: the first row sets the product, later rows add options and photos. */
function addRow(d: Draft, row: RowValues) {
  const first = !d.price && !d.options.length && !d.photos.length
  if (first || !d.price) d.price = row.price
  if (first && row.compare) d.compare = row.compare
  if (!d.options.length && !row.options.length && row.stock != null) d.stock = row.stock
  // One option on the row: the row's stock and price are that option's.
  const single = row.options.length === 1
  for (const o of row.options) {
    if (d.options.length >= 20 || d.options.some((x) => x.label.toLowerCase() === o.label.toLowerCase())) continue
    d.options.push({ label: o.label, stock: o.stock ?? (single ? row.stock : null), ...(single && row.price ? { price: row.price } : {}) })
  }
  d.photos.push(...row.photos)
  for (const c of row.collections) if (!d.collections.includes(c) && d.collections.length < 5) d.collections.push(c)
  if (!d.description) d.description = row.description
}

/** A Google Drive or Dropbox share link as a link to the file itself; other links stay as they are. */
export function directPhotoLink(raw: string): string {
  try {
    const u = new URL(raw)
    if (u.hostname === 'drive.google.com') {
      const id = /\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get('id')
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`
    }
    if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
      u.searchParams.delete('dl')
      u.searchParams.set('raw', '1')
      return u.toString()
    }
    return raw
  } catch {
    return raw
  }
}

/** A small preview for the check screen: Google Drive has a thumbnail address; other links show as they are. */
export function previewPhotoLink(raw: string): string {
  const direct = directPhotoLink(raw)
  const id = /drive\.google\.com\/uc\?export=download&id=([\w-]+)/.exec(direct)?.[1]
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w320` : direct
}

export const isLink = (s: string) => URL_RE.test(s)
/** A file name as the photo picker matches it: lowercase, without folders. */
export const fileKey = (s: string) => s.split(/[\\/]/).pop()!.trim().toLowerCase()

/** The template as CSV, with a byte-order mark so Excel reads it as UTF-8. Column names in the seller's language. */
export function templateCsv(t: (en: string) => string) {
  const cells = (row: string[]) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
  const ex = t('Example')
  return (
    '﻿' +
    [
      TEMPLATE_COLUMNS.map((c) => t(c)),
      [`${ex}: Gauni la maua`, '45000', '55000', '', 'S:3, M:5, L:2', 'Gauni la pamba, linafaa kwa harusi na sherehe.', 'https://drive.google.com/file/d/1AbC/view', 'Magauni'],
      [`${ex}: Viatu vya ngozi`, '60000', '', '4', '', '', 'viatu-1.jpg viatu-2.jpg', 'Viatu'],
    ]
      .map(cells)
      .join('\r\n') +
    '\r\n'
  )
}
