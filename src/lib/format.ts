import { msg, translate, type Lang } from '#/lib/i18n'
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

/** Words a product link may not be, because the shop's own pages use them. */
export const RESERVED_PRODUCT_SLUGS = new Set(['checkout', 'p', 'bag', 'cart', 'order', 'orders', 'about'])

export const RESERVED_SLUGS = new Set([
  'app', 'admin', 'api', 'img', 'login', 'signup', 'logout', 'onboard', 'discover', 'creators',
  'top-products', 'help', 'about', 'terms', 'privacy', 'pricing', 'shopi', 'shopitz', 'rizk', 'rizko', 'shop', 'shops',
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
  { id: 'fashion', label: msg('Fashion') },
  { id: 'shoes', label: msg('Shoes') },
  { id: 'clothes', label: msg('Clothes') },
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

/** One option per product, usually sizes. stock null means "not counted". */
export type Size = { label: string; stock: number | null }

export function parseSizes(raw: string | null | undefined): Size[] | null {
  if (!raw) return null
  try {
    const list = JSON.parse(raw) as Size[]
    return Array.isArray(list) && list.length ? list : null
  } catch {
    return null
  }
}

/** Common size runs, offered as one tap when adding a product. */
export const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: msg('Clothes'), sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: msg('Shoes'), sizes: ['37', '38', '39', '40', '41', '42', '43', '44'] },
  { label: msg('Kids'), sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-12Y'] },
  { label: msg('One size'), sizes: ['Free size'] },
]
