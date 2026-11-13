/** Plans and the trial, in one place: the landing page, the seller's plan page and the server all read this. */

export const DAY = 86_400_000
export const TRIAL_DAYS = 14
/** A shop that finishes setup (product, Lipa Namba, delivery areas, logo) gets this many days instead. */
export const SETUP_TRIAL_DAYS = 30

/**
 * Off until sellers can pay inside Shopi. While off, a shop whose trial has ended keeps selling and is
 * told that payment opens soon; nothing pauses. Turn on in the same release as Settlo billing.
 */
export const BILLING_LIVE = false

export type PlanId = 'twiga' | 'tembo'

export const PLANS: { id: PlanId; name: string; price: number; lead: string; items: string[] }[] = [
  {
    id: 'twiga',
    name: 'Twiga',
    price: 49_000,
    lead: 'Everything a seller needs to take orders from one link.',
    items: [
      'Your shop at shopi.tz/yourname',
      'Unlimited products, 6 photos each',
      'Lipa Namba and cash on delivery',
      'Orders, sizes and stock',
      'Shopi assistant, 100 chats a month',
      'AI product descriptions, 50 a month',
      'Analytics for 90 days',
      'Your customer list',
    ],
  },
  {
    id: 'tembo',
    name: 'Tembo',
    price: 99_000,
    lead: 'For shops that sell every day, with a team.',
    items: [
      'Everything in Twiga',
      '10 photos per product, bulk import',
      'Shopi assistant, 500 chats a month',
      'Unlimited AI product descriptions',
      'Analytics for 12 months, with export',
      'Your own domain, fonts and colours',
      'Hide “Made with Shopi”',
      '3 staff accounts',
      'Campaigns to your customers',
    ],
  },
]

export type PlanInput = { status: string; plan: string; created_at: number; trial_ends: number | null; paid_until: number | null }

export type PlanState =
  | { kind: 'demo' }
  | { kind: 'trial'; until: number; daysLeft: number; setupBonus: boolean }
  | { kind: 'paid'; plan: PlanId; until: number; daysLeft: number }
  /** The trial or the paid year is over. `paused` only once sellers can pay in Shopi. */
  | { kind: 'ended'; plan: PlanId | null; until: number; paused: boolean }

export function planState(s: PlanInput, setupDone: boolean, at = Date.now()): PlanState {
  if (s.status === 'demo') return { kind: 'demo' }
  const days = (until: number) => Math.max(0, Math.ceil((until - at) / DAY))
  const plan = s.plan === 'twiga' || s.plan === 'tembo' ? s.plan : null
  if (s.paid_until && plan) {
    if (s.paid_until > at) return { kind: 'paid', plan, until: s.paid_until, daysLeft: days(s.paid_until) }
    return { kind: 'ended', plan, until: s.paid_until, paused: BILLING_LIVE }
  }
  const until = s.trial_ends ?? s.created_at + (setupDone ? SETUP_TRIAL_DAYS : TRIAL_DAYS) * DAY
  if (until > at) return { kind: 'trial', until, daysLeft: days(until), setupBonus: !s.trial_ends && !setupDone }
  return { kind: 'ended', plan: null, until, paused: BILLING_LIVE }
}
