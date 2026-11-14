import { createServerFn } from '@tanstack/react-start'
import { requireAdmin } from '#/server/auth'
import { db, now } from '#/server/db'
import { PLANS, planState, type PlanState } from '#/lib/plans'

/**
 * The owner dashboard (/admin, users.is_admin): every shop and seller, orders and sales across Shopi, plans and income.
 * Demo shops are listed but never counted. Days are in Tanzania time, as on Analytics.
 */
export const ADMIN_RANGES = [7, 30, 90] as const
export type AdminDays = (typeof ADMIN_RANGES)[number]

const TZ = 3 * 3600_000
const DAY = 86_400_000
const HOUR = 3600_000
const SOLD = `status IN ('confirmed', 'dispatched', 'delivered')`
const LIVE = `shop_id IN (SELECT id FROM shops WHERE status != 'demo')`

type Range = { orders: number; sales: number; sold: number; cancelled: number; lipa: number; cod: number; manual: number; signups: number; shops: number; active: number }

export type AdminShop = {
  id: string
  slug: string
  name: string
  status: string
  category: string
  created_at: number
  owner: string
  phone: string
  products: number
  setup: number
  plan: PlanState
  orders: number
  sales: number
  visits: number
  last_order: number | null
}

export const getOwnerDashboard = createServerFn({ method: 'GET' })
  .validator((d: { days?: number }) => ({ days: (ADMIN_RANGES as readonly number[]).includes(Number(d?.days)) ? (Number(d.days) as AdminDays) : 30 }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const t = now()
    const todayStart = Math.floor((t + TZ) / DAY) * DAY - TZ
    const from = todayStart - (data.days - 1) * DAY
    const prevFrom = from - data.days * DAY
    const q = (sql: string, ...params: unknown[]) => db().prepare(sql).bind(...params)

    // Pulse for one window [a, b).
    const pulse = (a: number, b: number) =>
      q(
        `SELECT
           (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source != 'manual' AND created_at >= ?1 AND created_at < ?2) orders,
           (SELECT COALESCE(SUM(total), 0) FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ?1 AND created_at < ?2) sales,
           (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ?1 AND created_at < ?2) sold,
           (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND status = 'cancelled' AND created_at >= ?1 AND created_at < ?2) cancelled,
           (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source != 'manual' AND payment_method = 'lipa' AND created_at >= ?1 AND created_at < ?2) lipa,
           (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source != 'manual' AND payment_method = 'cod' AND created_at >= ?1 AND created_at < ?2) cod,
           (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source = 'manual' AND created_at >= ?1 AND created_at < ?2) manual,
           (SELECT COUNT(*) FROM users WHERE is_admin = 0 AND created_at >= ?1 AND created_at < ?2) signups,
           (SELECT COUNT(*) FROM shops WHERE status != 'demo' AND created_at >= ?1 AND created_at < ?2) shops,
           (SELECT COUNT(DISTINCT shop_id) FROM (
              SELECT shop_id FROM orders WHERE ${LIVE} AND created_at >= ?1 AND created_at < ?2
              UNION SELECT shop_id FROM events WHERE ${LIVE} AND type = 'view_shop' AND created_at >= ?1 AND created_at < ?2)) active`,
        a,
        b,
      )

    const [cur, prev, shopRows, funnel, waiting, problems, sources, categories, noShop] = await db().batch([
      pulse(from, t + 1),
      pulse(prevFrom, from),
      q(
        `SELECT s.id, s.slug, s.name, s.status, s.category, s.created_at, s.plan, s.trial_ends, s.paid_until,
           u.name owner, u.phone,
           (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) products,
           (SELECT COUNT(*) FROM delivery_areas a WHERE a.shop_id = s.id) areas,
           s.lipa_number != '' lipa, s.logo_key IS NOT NULL logo,
           (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual' AND o.created_at >= ?1) orders,
           (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.shop_id = s.id AND o.${SOLD} AND o.created_at >= ?1) sales,
           (SELECT COUNT(DISTINCT COALESCE(e.session_id, e.created_at)) FROM events e WHERE e.shop_id = s.id AND e.type = 'view_shop' AND e.created_at >= ?1) visits,
           (SELECT MAX(created_at) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual') last_order
         FROM shops s JOIN users u ON u.id = s.owner_id
         ORDER BY s.status = 'demo', sales DESC, s.created_at DESC`,
        from,
      ),
      // Every seller who signed up, how far they got. All time, demo shops left out.
      q(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE is_admin = 0) signups,
           (SELECT COUNT(*) FROM shops WHERE status != 'demo') shops,
           (SELECT COUNT(*) FROM shops s WHERE status != 'demo' AND EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id)) product,
           (SELECT COUNT(*) FROM shops s WHERE status != 'demo' AND EXISTS (SELECT 1 FROM events e WHERE e.shop_id = s.id AND e.type = 'view_shop')) visit,
           (SELECT COUNT(*) FROM shops s WHERE status != 'demo' AND EXISTS (SELECT 1 FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual')) first_order,
           (SELECT COUNT(*) FROM shops s WHERE status != 'demo' AND (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual') >= 5) fifth_order`,
      ),
      // Payment proofs nobody has looked at yet.
      q(
        `SELECT COUNT(*) n, COALESCE(SUM(paid_claimed_at < ?1), 0) h1, COALESCE(SUM(paid_claimed_at < ?2), 0) h6, COALESCE(SUM(paid_claimed_at < ?3), 0) h48
         FROM orders WHERE ${LIVE} AND status = 'payment_claimed'`,
        t - HOUR,
        t - 6 * HOUR,
        t - 48 * HOUR,
      ),
      q(
        `SELECT COUNT(*) n FROM orders WHERE ${LIVE} AND paid_claimed_at >= ?
           AND (payment_check LIKE '%"amount":"low"%' OR payment_check LIKE '%"name":"mismatch"%')`,
        from,
      ),
      q(
        `SELECT COALESCE(NULLIF(source, ''), 'unknown') source, COUNT(*) orders, COALESCE(SUM(CASE WHEN ${SOLD} THEN total END), 0) sales
         FROM orders WHERE ${LIVE} AND created_at >= ? GROUP BY 1 ORDER BY orders DESC`,
        from,
      ),
      q(
        `SELECT s.category, COUNT(*) orders, COALESCE(SUM(CASE WHEN o.${SOLD} THEN o.total END), 0) sales
         FROM orders o JOIN shops s ON s.id = o.shop_id WHERE s.status != 'demo' AND o.created_at >= ? GROUP BY 1 ORDER BY sales DESC`,
        from,
      ),
      q(
        `SELECT u.name, u.phone, u.created_at FROM users u LEFT JOIN shops s ON s.owner_id = u.id
         WHERE s.id IS NULL AND u.is_admin = 0 ORDER BY u.created_at DESC LIMIT 50`,
      ),
    ])

    const shops: AdminShop[] = (
      shopRows.results as (Omit<AdminShop, 'plan' | 'setup'> & {
        plan: string
        trial_ends: number | null
        paid_until: number | null
        areas: number
        lipa: number
        logo: number
      })[]
    ).map((s) => {
      const setup = [s.products > 0, !!s.lipa, s.areas > 0, !!s.logo].filter(Boolean).length
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        status: s.status,
        category: s.category,
        created_at: s.created_at,
        owner: s.owner,
        phone: s.phone,
        products: s.products,
        setup,
        plan: planState({ status: s.status, plan: s.plan, created_at: s.created_at, trial_ends: s.trial_ends, paid_until: s.paid_until }, setup === 4, t),
        orders: s.orders,
        sales: s.sales,
        visits: s.visits,
        last_order: s.last_order,
      }
    })

    // Plans now, across the shops that count.
    const live = shops.filter((s) => s.status !== 'demo')
    const paid = (id: string) => live.filter((s) => s.plan.kind === 'paid' && s.plan.plan === id).length
    const plans = {
      trial: live.filter((s) => s.plan.kind === 'trial').length,
      endingSoon: live.filter((s) => s.plan.kind === 'trial' && s.plan.daysLeft <= 7).length,
      ended: live.filter((s) => s.plan.kind === 'ended').length,
      twiga: paid('twiga'),
      tembo: paid('tembo'),
    }
    const yearly = PLANS.reduce((sum, p) => sum + p.price * (p.id === 'twiga' ? plans.twiga : plans.tembo), 0)

    return {
      days: data.days,
      now: cur.results[0] as Range,
      before: prev.results[0] as Range,
      plans: { ...plans, yearly },
      funnel: funnel.results[0] as { signups: number; shops: number; product: number; visit: number; first_order: number; fifth_order: number },
      waiting: waiting.results[0] as { n: number; h1: number; h6: number; h48: number },
      problems: (problems.results[0] as { n: number }).n,
      sources: sources.results as { source: string; orders: number; sales: number }[],
      categories: categories.results as { category: string; orders: number; sales: number }[],
      noShop: noShop.results as { name: string; phone: string; created_at: number }[],
      shops,
    }
  })

export type OwnerDashboard = Awaited<ReturnType<typeof getOwnerDashboard>>
