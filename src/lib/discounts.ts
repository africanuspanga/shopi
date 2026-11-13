/** Discount codes: the rules both the checkout and the server use, so the total a buyer sees is the total they order. */
import { tzs } from '#/lib/format'

export type DiscountKind = 'percent' | 'amount'

/** What a checkout needs to know about a code. */
export type DiscountRule = { code: string; kind: DiscountKind; value: number; min_order: number | null }

/** Where a phone keeps a code from a link like shopi.tz/<shop>?code=EID10 until it is used ($shop/route.tsx sets it). */
export const codeKey = (shopId: string) => `shopi_code_${shopId}`

/** A code as people type it, made into its stored form: EID10, KARIBU-2026. */
export const cleanCode = (raw: string) =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20)

/** Shillings a code takes off an items total. Nothing below the minimum order, and never more than the total. */
export function discountOff(rule: Pick<DiscountRule, 'kind' | 'value' | 'min_order'>, subtotal: number) {
  if (rule.min_order && subtotal < rule.min_order) return 0
  const off = rule.kind === 'percent' ? Math.round((subtotal * Math.min(100, Math.max(0, rule.value))) / 100) : rule.value
  return Math.max(0, Math.min(subtotal, off))
}

/** "10% off" or "TSh 5,000 off". Pass the page's t(). */
export function discountLabel(t: (en: string, vars?: Record<string, string | number>) => string, rule: Pick<DiscountRule, 'kind' | 'value'>) {
  return rule.kind === 'percent' ? t('{n}% off', { n: rule.value }) : t('{amount} off', { amount: tzs(rule.value) })
}

/** The end of a day in Tanzania time (UTC+3), from a date field's YYYY-MM-DD. */
export const endOfDay = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T23:59:59.999+03:00`) : NaN)
/** The YYYY-MM-DD a moment falls on in Tanzania, for a date field. */
export const dayOf = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10)
