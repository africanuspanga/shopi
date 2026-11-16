import type { PlanState } from '#/lib/plans'

/** The owner dashboard's ranges and sections (`/admin?tab=…&days=…`). Plain values, safe to import in the browser. */
export const ADMIN_RANGES = [7, 30, 90] as const
export type AdminDays = (typeof ADMIN_RANGES)[number]
export const ADMIN_TABS = ['today', 'shops', 'money', 'growth', 'use', 'health'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export const asAdminDays = (v: unknown): AdminDays => ((ADMIN_RANGES as readonly number[]).includes(Number(v)) ? (Number(v) as AdminDays) : 30)
export const asAdminTab = (v: unknown): AdminTab => ((ADMIN_TABS as readonly string[]).includes(String(v)) ? (v as AdminTab) : 'today')

export type AdminShop = {
  id: string
  slug: string
  name: string
  status: string
  category: string
  logo_key: string | null
  created_at: number
  owner: string
  phone: string
  lang: string
  products: number
  /** Products buyers can't see a photo of. */
  noPhoto: number
  setup: number
  plan: PlanState
  orders: number
  /** Online orders ever, for "no orders yet". */
  ordersEver: number
  sales: number
  visits: number
  last_order: number | null
  /** The seller's last log-in on any phone or browser. */
  last_login: number | null
  notifications: boolean
  /** Opened Shopi from the Home Screen: on what, and when last (reported about weekly). */
  app: string | null
  appSeen: number | null
  look: boolean
  domain: string | null
}

export const SHOP_FILTERS = ['all', 'ending', 'none', 'quiet', 'paid'] as const
export type ShopFilter = (typeof SHOP_FILTERS)[number]

const DAY = 86_400_000

/** The Shops tab's filters; `at` is the server's clock when the list was read. */
export function shopMatches(s: AdminShop, f: ShopFilter, at: number) {
  if (f === 'all') return true
  if (s.status === 'demo') return false
  if (f === 'ending') return s.plan.kind === 'trial' && s.plan.daysLeft <= 7
  if (f === 'none') return s.ordersEver === 0
  if (f === 'quiet') return s.ordersEver > 0 && (s.last_order ?? 0) < at - 7 * DAY
  return s.plan.kind === 'paid'
}

export type DayPoint = { day: number; value: number }
