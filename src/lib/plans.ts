/**
 * Plans, in one place: the landing page, the Terms, the seller's plan page, the server and the owner dashboard read this.
 * Since 17 Nov 2026 (the founder): two prices only, Free (TSh 0) and Tembo (TSh 99,000 a year, flat: Driftmark absorbs
 * Selcom's fee, no VAT). No trial: the free shop is the trial, and it stays open for as long as the seller likes.
 */

import { msg } from '#/lib/i18n'

export const DAY = 86_400_000

/**
 * Off until sellers can pay for Tembo inside Shopi (Selcom, as CV Chap Chap does it). While off, Tembo features show
 * "Included in Tembo" and that payment opens soon. Turn on in the same release as billing.
 */
export const BILLING_LIVE = false

export type PlanId = 'free' | 'tembo'

export const TEMBO_PRICE = 99_000
/** Shown beside the yearly price, so it reads as small as it is (the founder's ask). */
export const TEMBO_MONTH = Math.round(TEMBO_PRICE / 12)
/** A free shop holds up to this many products; Tembo has no limit. */
export const FREE_PRODUCTS = 300
/** "Write it for me" (src/server/ai.ts): a free shop gets this many AI descriptions a month (the founder, 18 Nov). */
export const FREE_AI_MONTH = 10
/** Tembo's AI is unlimited, with this quiet daily cap so a runaway script can't run up the bill. */
export const TEMBO_AI_DAY = 50
/** Shops that used fonts or their own domain before Tembo existed keep them until the end of 31 Dec 2026 in Dar. */
export const GRACE_UNTIL = Date.parse('2026-12-31T21:00:00Z')

/** What a plan card lists. `soon`: not built yet, so the card says so (no claims we cannot back). */
export type PlanItem = { text: string; soon?: boolean }

export const PLANS: { id: PlanId; name: string; price: number; lead: string; items: PlanItem[] }[] = [
  {
    id: 'free',
    name: msg('Free'),
    price: 0,
    lead: msg('Everything you need to sell from one link.'),
    items: [
      { text: msg('Your shop at shopi.tz/yourname') },
      { text: msg('Up to 300 products, with bulk import') },
      { text: msg('Lipa Namba and cash on delivery') },
      { text: msg('Orders, sizes and stock') },
      { text: msg('Bag links, discount codes and collections') },
      { text: msg('Your colour and cover photo') },
      { text: msg('Analytics for 7 and 30 days') },
    ],
  },
  {
    id: 'tembo',
    name: msg('Tembo'),
    price: TEMBO_PRICE,
    lead: msg('For shops that sell every day.'),
    items: [
      { text: msg('Everything in Free') },
      { text: msg('Unlimited products') },
      { text: msg('Your own domain and shop fonts') },
      { text: msg('No “Shop made with Shopi” line') },
      { text: msg('Full analytics: 90 days, channels, buyers and downloads') },
      { text: msg('Up to 2 shop assistants, each with their own login') },
      { text: msg('Unlimited AI product descriptions') },
      { text: msg('500 SMS a year to your buyers, many sent automatically'), soon: true },
    ],
  },
]

export type PlanInput = { status: string; plan: string; paid_until: number | null }

export type PlanState =
  | { kind: 'demo' }
  | { kind: 'free' }
  | { kind: 'tembo'; until: number; daysLeft: number }

export function planState(s: PlanInput, at = Date.now()): PlanState {
  if (s.status === 'demo') return { kind: 'demo' }
  if (s.plan === 'tembo' && s.paid_until && s.paid_until > at) {
    return { kind: 'tembo', until: s.paid_until, daysLeft: Math.max(0, Math.ceil((s.paid_until - at) / DAY)) }
  }
  return { kind: 'free' }
}

/** What Tembo adds. Bulk import, colour and cover are free (the founder, 17 Nov). `staff`: shop assistants (src/lib/staff.ts). */
export type Feature = 'domain' | 'fonts' | 'hideBadge' | 'fullAnalytics' | 'unlimitedProducts' | 'staff'

/**
 * The one entitlement check, for the server functions and the UI. Demo shops show everything. `using`: the shop already
 * used this feature before Tembo existed (fonts, its own domain), so it keeps it until GRACE_UNTIL.
 */
export function can(plan: PlanState | null | undefined, feature: Feature, opts: { using?: boolean; at?: number } = {}) {
  if (!plan) return false
  if (plan.kind === 'demo' || plan.kind === 'tembo') return true
  return !!opts.using && (feature === 'fonts' || feature === 'domain') && (opts.at ?? Date.now()) < GRACE_UNTIL
}
