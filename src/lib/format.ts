import { msg, translate, type Lang } from '#/lib/i18n'
/**
 * Short day names, Sunday first (the order of getUTCDay). The Swahili ones are how sellers write them (the founder,
 * 17 Nov 2026): Jumapili is J2, then J3, J4, J5, Alh, Ijm, Jmos. Charts on Home, Analytics and /admin use these.
 */
const SHORT_DAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], sw: ['J2', 'J3', 'J4', 'J5', 'Alh', 'Ijm', 'Jmos'] }
export const shortDay = (lang: string, day: number) => (lang === 'sw' ? SHORT_DAYS.sw : SHORT_DAYS.en)[day]

export function tzs(n: number | null | undefined) {
  return `TSh ${Math.round(n ?? 0).toLocaleString('en-US')}`
}

/** Tanzanian numbers to +255XXXXXXXXX; anything else keeps its digits with a +. */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, '')
  if (/^0[67]\d{8}$/.test(digits)) return `+255${digits.slice(1)}`
  if (/^[67]\d{8}$/.test(digits)) return `+255${digits}`
  if (/^255[67]\d{8}$/.test(digits)) return `+${digits}`
  if (digits.length >= 9 && digits.length <= 15) return `+${digits}`
  return ''
}

/** +255754123456 → 0754 123 456, the way people write numbers in Tanzania. Other numbers stay as they are. */
export function localPhone(phone: string) {
  const m = /^\+255([67]\d{2})(\d{3})(\d{3})$/.exec(phone)
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone
}

/** Neighbourhoods in Dar sellers deliver to most: quick add in Shop settings, and spellings offered at checkout. */
export const DAR_AREAS = [
  'Kariakoo', 'Posta', 'Upanga', 'Kinondoni', 'Mikocheni', 'Msasani', 'Masaki', 'Oysterbay', 'Sinza', 'Mwenge',
  'Kijitonyama', 'Ubungo', 'Kimara', 'Mbezi', 'Tegeta', 'Kigamboni', 'Temeke', 'Tabata', 'Ilala', 'Buguruni', 'Ukonga',
]

export function waLink(phone: string, text?: string) {
  const digits = phone.replace(/[^\d]/g, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** `typing: true` keeps a trailing hyphen so a merchant can type "zee-store" key by key. */
export function slugify(s: string, { typing = false } = {}) {
  const out = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '') // "Zee's Store" -> "zees-store", not "zee-s-store"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(typing ? /^-+/g : /^-+|-+$/g, '')
    .slice(0, 30)
  return out
}

/** A product's link name: "Gauni la Pwani (Off-shoulder)" -> "gauni-la-pwani-off-shoulder". */
export function productSlug(name: string) {
  const out = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return out || 'product'
}

/** A collection's link name: "Eid 2026" -> "eid-2026". */
export const collectionSlug = (name: string) => productSlug(name).slice(0, 40).replace(/-+$/, '') || 'collection'

/**
 * A Google Maps link for a shop, cleaned to https. '' when empty, null when it isn't a Google Maps link.
 * Accepts maps.app.goo.gl, goo.gl/maps, google.com/maps (any Google country domain) and maps.google.com.
 */
export function mapsLink(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const ok =
    host === 'maps.app.goo.gl' ||
    (host === 'goo.gl' && u.pathname.startsWith('/maps')) ||
    /^maps\.google\.[a-z.]+$/.test(host) ||
    (/^google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps'))
  if (!ok) return null
  u.protocol = 'https:'
  return u.toString().slice(0, 500)
}

/** A TRA TIN: 9 digits. '' when empty, null when it isn't 9 digits. Dashes and spaces are allowed while typing. */
export function tinDigits(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, '')
  if (!d) return ''
  return /^\d{9}$/.test(d) ? d : null
}
export const formatTin = (d: string) => (d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d)

/** A link tag a seller puts on a link: "Instagram bio" -> "instagram-bio", used as ?s=instagram-bio. */
export function linkTag(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

/** Words a product link may not be, because the shop's own pages use them (b: bag links, c: collections). */
/** The first of base, base-2, base-3… that `taken` doesn't hold (and that isn't a reserved word). */
export function freeSlug(base: string, taken: Set<string>, reserved: Set<string> = new Set()) {
  if (!taken.has(base) && !reserved.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

export const RESERVED_PRODUCT_SLUGS = new Set(['checkout', 'p', 'b', 'c', 'bag', 'cart', 'order', 'orders', 'about'])

export const RESERVED_SLUGS = new Set([
  'app', 'admin', 'api', 'img', 'login', 'signup', 'logout', 'onboard', 'discover', 'creators', 'email', 'brand', 'join', 'paused',
  'top-products', 'help', 'about', 'terms', 'privacy', 'data-deletion', 'legal', 'pricing', 'shopi', 'shopitz', 'rizk', 'rizko', 'shop', 'shops',
  'o', 'order', 'orders', 'static', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml',
])

/** Every photo has a small copy (600 px) beside it for grids and thumbnails: s/<shop>/<id>.webp → t/<shop>/<id>.webp. */
export const thumbKey = (key: string) => (key.startsWith('s/') ? `t/${key.slice(2)}` : key)

export function imgUrl(key: string | null | undefined, size: 'full' | 'thumb' = 'full') {
  return key ? `/img/${size === 'thumb' ? thumbKey(key) : key}` : ''
}

export function timeAgo(ms: number, lang: Lang) {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  const units: [number, string][] = [
    [86400, msg('{n}d ago')],
    [3600, msg('{n}h ago')],
    [60, msg('{n}m ago')],
  ]
  for (const [size, text] of units) if (s >= size) return translate(lang, text, { n: Math.floor(s / size) })
  return translate(lang, msg('Just now'))
}

export const CATEGORIES: { id: string; label: string }[] = [
  // "Fashion" and "Clothes" were two chips (Mitindo, Nguo) that sellers could not tell apart; one since 17 Nov 2026.
  // No live shop had 'clothes'. The id stays 'fashion' so existing shops keep theirs.
  { id: 'fashion', label: msg('Clothes and fashion') },
  { id: 'shoes', label: msg('Shoes') },
  { id: 'electronics', label: msg('Electronics') },
  { id: 'food', label: msg('Food') },
  { id: 'cosmetics', label: msg('Cosmetics') },
  { id: 'perfumes', label: msg('Perfumes') },
  { id: 'ebooks', label: msg('Ebooks') },
  { id: 'other', label: msg('Other') },
]

/** Tanzania is a multi-network mobile money market, so the copy says "mobile money" and never assumes one network. */
export const NETWORKS = ['M-Pesa', 'Mixx by Yas', 'Airtel Money', 'HaloPesa', 'Bank Lipa Namba']

export type OrderStatus =
  | 'awaiting_payment'
  | 'payment_claimed'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export const STATUS_LABEL: Record<OrderStatus, { label: string; tone: string }> = {
  awaiting_payment: { label: msg('Awaiting payment'), tone: 'wait' },
  payment_claimed: { label: msg('Check payment'), tone: 'act' },
  confirmed: { label: msg('Confirmed'), tone: 'ok' },
  dispatched: { label: msg('On the way'), tone: 'ok' },
  delivered: { label: msg('Delivered'), tone: 'done' },
  cancelled: { label: msg('Cancelled'), tone: 'bad' },
}

/**
 * One option per product, usually sizes. stock null means "not counted". An option may have its own price (it replaces the
 * product's) and its own photo (one of the product's photos).
 */
export type Size = { label: string; stock: number | null; price?: number; image?: string }

/** Options from the database. Older options have only label and stock, and read the same. */
export function parseSizes(raw: string | null | undefined): Size[] | null {
  if (!raw) return null
  try {
    const list = JSON.parse(raw) as Partial<Size>[]
    if (!Array.isArray(list) || !list.length) return null
    return list.map((o) => ({
      label: String(o.label ?? ''),
      stock: o.stock == null ? null : Number(o.stock),
      ...(Number(o.price) > 0 ? { price: Math.round(Number(o.price)) } : {}),
      ...(typeof o.image === 'string' && o.image ? { image: o.image } : {}),
    }))
  } catch {
    return null
  }
}

/** The price of one piece: the option's own price when it has one, else the product's. */
export function priceOf(p: { price: number; sizes: Size[] | null }, size: string | null | undefined) {
  return (size ? p.sizes?.find((s) => s.label === size)?.price : undefined) || p.price
}

/** The photo that shows a choice: the option's own photo when it has one, else the product's main photo. */
export function imageOf(p: { images: string[]; sizes: Size[] | null }, size: string | null | undefined) {
  return (size ? p.sizes?.find((s) => s.label === size)?.image : undefined) || p.images[0] || null
}

/** The lowest and highest price of one piece, over the options still in stock (all of them once all are sold out). */
export function priceSpan(p: { price: number; sizes: Size[] | null }) {
  const open = p.sizes?.filter((s) => s.stock !== 0)
  const list = open?.length ? open : p.sizes
  const prices = list?.length ? list.map((s) => s.price || p.price) : [p.price]
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/** What buyers choose on a product. The database keeps NULL for size. */
export type OptionKind = 'size' | 'colour' | 'style' | 'model' | 'flavour'
export const OPTION_KINDS: Record<OptionKind, { label: string; choose: string; named: string }> = {
  size: { label: msg('Size'), choose: msg('Choose your size'), named: msg('Size {value}') },
  colour: { label: msg('Colour'), choose: msg('Choose your colour'), named: msg('Colour {value}') },
  style: { label: msg('Style'), choose: msg('Choose your style'), named: msg('Style {value}') },
  model: { label: msg('Model'), choose: msg('Choose your model'), named: msg('Model {value}') },
  flavour: { label: msg('Flavour'), choose: msg('Choose your flavour'), named: msg('Flavour {value}') },
}
export const optionKind = (v: unknown): OptionKind => (typeof v === 'string' && v in OPTION_KINDS ? (v as OptionKind) : 'size')

type T = (en: string, vars?: Record<string, string | number>) => string
/** "Size M", "Colour Red": a chosen option in words. Pass the page's t(). */
export const optionText = (t: T, kind: unknown, value: string) => t(OPTION_KINDS[optionKind(kind)].named, { value })

/** Common size runs, offered as one tap when adding a product. */
export const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: msg('Clothes'), sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: msg('Shoes'), sizes: ['37', '38', '39', '40', '41', '42', '43', '44'] },
  { label: msg('Kids'), sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-12Y'] },
  { label: msg('One size'), sizes: ['Free size'] },
]

/** How an order was paid. Online orders use lipa or cod; a sale recorded by hand may use any. */
export type PaymentMethod = 'lipa' | 'cod' | 'cash' | 'mobile' | 'bank'
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  lipa: 'Lipa Namba',
  cod: 'Cash on delivery',
  cash: 'Cash',
  mobile: 'Other mobile money',
  bank: 'Bank',
}
