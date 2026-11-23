import { msg } from '#/lib/i18n'

/**
 * The shop score (roadmap `o-flow`, 18 Nov 2026; the founder: "every shop owner reaches a 100% set-up shop"). Eight
 * things a shop needs before buyers trust it, worth 100 points. Home says "Your shop is 60% set up" with the one next
 * step; /admin counts shops by score to see where sellers stop. The facts come from the server (`scoreSelect` in
 * src/server/score.ts); this file is safe in the browser.
 */
export type ScoreFacts = {
  /** All products, shown or hidden. */
  products: number
  /** Shown products with a photo, a price and a description: the 3 that count. */
  complete: number
  /** Shown products with no description, and products with no photo. */
  noDescription: number
  noPhoto: number
  /** The newest product missing a description or a photo, to open from the next step. */
  fixId: string | null
  logo: boolean
  whatsapp: boolean
  /** A Lipa Namba, or cash on delivery on purpose (setup's payment step passed, or a shop older than the setup). */
  payment: boolean
  /** Delivery areas, or "we send to other regions". */
  delivery: boolean
  /** The seller shared the link, a product or the QR code from Shopi at least once (a `seller_share` event). */
  shared: boolean
  /** A buyer's visit came from Instagram or TikTok, or through a link tagged `bio`: the link is in a bio. */
  bioLink: boolean
  /**
   * A business that sells services (roadmap `v-services`): its services count where products do, its working hours
   * where a way to be paid does (clients pay at the visit), and where it is where delivery areas do.
   */
  serves?: boolean
  /** Services clients can book. */
  services?: number
  /** The working hours are set, so clients can book. */
  hours?: boolean
  location?: boolean
}

/** Products that count towards the score. */
export const SCORE_PRODUCTS = 3

export type ScoreKey = 'name' | 'whatsapp' | 'products' | 'payment' | 'logo' | 'delivery' | 'share' | 'bio'
export type ScoreItem = { key: ScoreKey; label: string; points: number; max: number; done: boolean }

/** Each item's words (English keys; translate with t()). */
export const SCORE_LABELS: Record<ScoreKey, string> = {
  name: msg('Name and link'),
  products: msg('3 products with a photo, a price and a description'),
  payment: msg('A way to be paid'),
  whatsapp: msg('Your WhatsApp number'),
  logo: msg('Your logo'),
  delivery: msg('Where you deliver'),
  share: msg('Your link shared'),
  bio: msg('Your link in your Instagram or TikTok bio'),
}

/** The three items a business that sells services reads differently. */
export const SERVICE_SCORE_LABELS: Partial<Record<ScoreKey, string>> = {
  products: msg('3 services clients can book'),
  payment: msg('Your working hours'),
  delivery: msg('Where clients find you'),
}

/** Products and services that count towards the 3 (a business that sells services counts both). */
export const scoreCount = (f: ScoreFacts) => Math.min(SCORE_PRODUCTS, f.serves ? (f.services ?? 0) + f.complete : f.complete)

/** The items in the order a seller should do them; the first one not done is the next step. */
export function shopScore(f: ScoreFacts) {
  const item = (key: ScoreKey, max: number, points: number) => ({ key, label: (f.serves && SERVICE_SCORE_LABELS[key]) || SCORE_LABELS[key], max, points })
  const items: Omit<ScoreItem, 'done'>[] = [
    item('name', 10, 10),
    // A first product (or service) before anything else: a shop with nothing to buy has nothing to share.
    item('products', 30, scoreCount(f) * 10),
    item('payment', 10, (f.serves ? f.hours : f.payment) ? 10 : 0),
    item('whatsapp', 10, f.whatsapp ? 10 : 0),
    item('logo', 10, f.logo ? 10 : 0),
    item('delivery', 10, (f.serves ? f.location : f.delivery) ? 10 : 0),
    item('share', 10, f.shared ? 10 : 0),
    item('bio', 10, f.bioLink ? 10 : 0),
  ]
  const all = items.map((i) => ({ ...i, done: i.points >= i.max }))
  const score = all.reduce((s, i) => s + i.points, 0)
  // Products wait for the first one only: once there is one, the Lipa Namba comes before the second and third.
  const none = f.serves ? (f.services ?? 0) + f.products === 0 : f.products === 0
  const order: ScoreKey[] = none ? ['products', 'payment'] : ['payment', 'products']
  const next = [...order.map((k) => all.find((i) => i.key === k)!), ...all.filter((i) => !order.includes(i.key))].find((i) => !i.done) ?? null
  return { score, items: all, next }
}

/** What the next product step asks for, so its words fit: a first product, a description or photo, or more products. */
export function productNeed(f: ScoreFacts): 'first' | 'description' | 'photo' | 'more' {
  if (f.products === 0) return 'first'
  if (f.fixId && f.noDescription > 0) return 'description'
  if (f.fixId && f.noPhoto > 0) return 'photo'
  return 'more'
}
