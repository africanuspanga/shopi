import { env } from 'cloudflare:workers'
import type { AdminDays, AdminShop, DayPoint } from '#/lib/admin'
import { TEMBO_PRICE, planState } from '#/lib/plans'
import { SESSION_DAYS } from '#/server/auth'
import { db, now } from '#/server/db'
import { proxyHealth } from '#/server/selcom'

/**
 * Queries behind the owner dashboard (/admin). One D1 batch per section, so opening a section never pays for the others.
 * Demo shops are listed but never counted. Days are in Tanzania time, as on Analytics.
 */
const TZ = 3 * 3600_000
const DAY = 86_400_000
const HOUR = 3600_000
const SOLD = `status IN ('confirmed', 'dispatched', 'delivered')`
const LIVE = `shop_id IN (SELECT id FROM shops WHERE status != 'demo')`
const DAYNO = `CAST((created_at + ${TZ}) / ${DAY} AS INTEGER)`

const q = (sql: string, ...params: unknown[]) => db().prepare(sql).bind(...params)

export type AdminPayment = {
  id: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  phone: string
  reason: string | null
  manual_for: string | null
  created_at: number
  completed_at: number | null
  paid_until: number | null
  shop_id: string
  shop: string
}
const rows = <T>(r: D1Result<unknown>) => r.results as T[]
const one = <T>(r: D1Result<unknown>) => r.results[0] as T

function windowOf(days: AdminDays) {
  const t = now()
  const todayStart = Math.floor((t + TZ) / DAY) * DAY - TZ
  const from = todayStart - (days - 1) * DAY
  return { t, todayStart, from, prevFrom: from - days * DAY }
}

/** One value per day from `from` to today, zero where nothing happened. */
function series(found: { d: number; v: number }[], from: number, days: number): DayPoint[] {
  const by = new Map(found.map((r) => [r.d, r.v]))
  const first = Math.floor((from + TZ) / DAY)
  return Array.from({ length: days }, (_, i) => ({ day: (first + i) * DAY, value: by.get(first + i) ?? 0 }))
}

type Pulse = { orders: number; sales: number; sold: number; cancelled: number; signups: number; shops: number; active: number; visits: number }

/** The headline counts for one window [a, b). */
const pulse = (a: number, b: number) =>
  q(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source != 'manual' AND created_at >= ?1 AND created_at < ?2) orders,
       (SELECT COALESCE(SUM(total), 0) FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ?1 AND created_at < ?2) sales,
       (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ?1 AND created_at < ?2) sold,
       (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND status = 'cancelled' AND created_at >= ?1 AND created_at < ?2) cancelled,
       (SELECT COUNT(*) FROM users WHERE is_admin = 0 AND created_at >= ?1 AND created_at < ?2) signups,
       (SELECT COUNT(*) FROM shops WHERE status != 'demo' AND created_at >= ?1 AND created_at < ?2) shops,
       (SELECT COUNT(DISTINCT shop_id) FROM (
          SELECT shop_id FROM orders WHERE ${LIVE} AND created_at >= ?1 AND created_at < ?2
          UNION SELECT shop_id FROM events WHERE ${LIVE} AND type = 'view_shop' AND created_at >= ?1 AND created_at < ?2)) active,
       (SELECT COUNT(DISTINCT COALESCE(session_id, created_at)) FROM events WHERE ${LIVE} AND type = 'view_shop' AND created_at >= ?1 AND created_at < ?2) visits`,
    a,
    b,
  )

const salesByDay = (from: number) =>
  q(`SELECT ${DAYNO} d, COALESCE(SUM(total), 0) v FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ? GROUP BY 1`, from)

const waitingProofs = (t: number) =>
  q(
    `SELECT COUNT(*) n, COALESCE(SUM(paid_claimed_at < ?1), 0) h1, COALESCE(SUM(paid_claimed_at < ?2), 0) h6, COALESCE(SUM(paid_claimed_at < ?3), 0) h48
     FROM orders WHERE ${LIVE} AND status = 'payment_claimed'`,
    t - HOUR,
    t - 6 * HOUR,
    t - 48 * HOUR,
  )
type Waiting = { n: number; h1: number; h6: number; h48: number }

const problemProofs = (from: number) =>
  q(
    `SELECT COUNT(*) n FROM orders WHERE ${LIVE} AND paid_claimed_at >= ?
       AND (payment_check LIKE '%"amount":"low"%' OR payment_check LIKE '%"name":"mismatch"%')`,
    from,
  )

type LatestOrder = { code: string; shop: string; slug: string; total: number; status: string; area: string; created_at: number }
const latestOrders = (where: string, ...params: unknown[]) =>
  q(
    `SELECT o.code, s.name shop, s.slug, o.total, o.status, o.area, o.created_at
     FROM orders o JOIN shops s ON s.id = o.shop_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 6`,
    ...params,
  )

type TopProduct = { name: string; image: string | null; shop: string; slug: string; pslug: string | null; sold: number; revenue: number }
const topProducts = (where: string, limit: number, ...params: unknown[]) =>
  q(
    `SELECT oi.name, MAX(oi.image) image, s.name shop, s.slug, p.slug pslug, SUM(oi.qty) sold, SUM(oi.qty * oi.price) revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN shops s ON s.id = o.shop_id LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.${SOLD} AND ${where} GROUP BY oi.product_id, oi.name ORDER BY sold DESC, revenue DESC LIMIT ${limit}`,
    ...params,
  )

/** Every shop with its seller and its numbers since `from`. Also the source of the CSV. */
const shopRows = (from: number, only?: string) =>
  q(
    `SELECT s.id, s.slug, s.name, s.status, s.category, s.logo_key, s.created_at, s.plan, s.trial_ends, s.paid_until, s.lang,
       u.name owner, u.phone, u.app_seen_at, u.app_platform,
       (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) products,
       (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND (p.images IS NULL OR p.images IN ('', '[]'))) no_photo,
       (SELECT COUNT(*) FROM delivery_areas a WHERE a.shop_id = s.id) areas,
       s.lipa_number != '' lipa,
       (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual' AND o.created_at >= ?1) orders,
       (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual') orders_ever,
       (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.shop_id = s.id AND o.${SOLD} AND o.created_at >= ?1) sales,
       (SELECT COUNT(DISTINCT COALESCE(e.session_id, e.created_at)) FROM events e WHERE e.shop_id = s.id AND e.type = 'view_shop' AND e.created_at >= ?1) visits,
       (SELECT MAX(created_at) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual') last_order,
       (SELECT MAX(expires_at) FROM sessions x WHERE x.user_id = u.id) session_ends,
       EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.shop_id = s.id) push,
       (s.theme_color IS NOT NULL OR s.theme_font IS NOT NULL OR s.cover_key IS NOT NULL) look,
       (SELECT hostname FROM domains d WHERE d.shop_id = s.id AND d.status = 'active' LIMIT 1) domain
     FROM shops s JOIN users u ON u.id = s.owner_id
     WHERE (?2 IS NULL OR s.id = ?2)
     ORDER BY s.status = 'demo', sales DESC, orders DESC, s.created_at DESC`,
    from,
    only ?? null,
  )

type ShopRow = Omit<AdminShop, 'plan' | 'setup' | 'noPhoto' | 'ordersEver' | 'last_login' | 'notifications' | 'look' | 'app' | 'appSeen'> & {
  app_seen_at: number | null
  app_platform: string | null
  plan: string
  trial_ends: number | null
  paid_until: number | null
  no_photo: number
  areas: number
  lipa: number
  orders_ever: number
  session_ends: number | null
  push: number
  look: number
}

function toShops(r: D1Result<unknown>, t: number): AdminShop[] {
  return rows<ShopRow>(r).map((s) => {
    const setup = [s.products > 0, !!s.lipa, s.areas > 0, !!s.logo_key].filter(Boolean).length
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      status: s.status,
      category: s.category,
      logo_key: s.logo_key,
      created_at: s.created_at,
      owner: s.owner,
      phone: s.phone,
      lang: s.lang,
      products: s.products,
      noPhoto: s.no_photo,
      setup,
      plan: planState({ status: s.status, plan: s.plan, paid_until: s.paid_until }, t),
      orders: s.orders,
      ordersEver: s.orders_ever,
      sales: s.sales,
      visits: s.visits,
      last_order: s.last_order,
      last_login: s.session_ends ? s.session_ends - SESSION_DAYS * DAY : null,
      notifications: !!s.push,
      app: s.app_seen_at ? (s.app_platform ?? 'other') : null,
      appSeen: s.app_seen_at,
      look: !!s.look,
      domain: s.domain,
    }
  })
}

/** Plans right now, across the shops that count. */
function plansOf(shops: AdminShop[]) {
  const live = shops.filter((s) => s.status !== 'demo')
  const tembo = live.filter((s) => s.plan.kind === 'tembo').length
  return {
    shops: live.length,
    free: live.length - tembo,
    tembo,
    /** Tembo shops whose year ends within 30 days. */
    renewing: live.filter((s) => s.plan.kind === 'tembo' && s.plan.daysLeft <= 30).length,
    yearly: tembo * TEMBO_PRICE,
  }
}

export async function shopList(days: AdminDays) {
  const { t, from } = windowOf(days)
  return { at: t, shops: toShops(await shopRows(from).all(), t) }
}

export async function todayData(days: AdminDays) {
  const { t, todayStart, from, prevFrom } = windowOf(days)
  const [cur, prev, day, sales, weekdays, repeat, best, latest, waiting] = await db().batch([
    pulse(from, t + 1),
    pulse(prevFrom, from),
    // Today so far, against the same hours of the same weekday last week.
    q(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source != 'manual' AND created_at >= ?1) orders,
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ?1) sales,
         (SELECT COUNT(*) FROM orders WHERE ${LIVE} AND source != 'manual' AND created_at >= ?2 AND created_at < ?3) orders_before,
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE ${LIVE} AND ${SOLD} AND created_at >= ?2 AND created_at < ?3) sales_before,
         (SELECT COUNT(*) FROM shops WHERE status != 'demo' AND created_at >= ?1) shops,
         (SELECT COUNT(*) FROM users WHERE is_admin = 0 AND created_at >= ?1) signups,
         (SELECT COUNT(DISTINCT visitor_id) FROM events WHERE ${LIVE} AND created_at >= ?4) live`,
      todayStart,
      todayStart - 7 * DAY,
      t - 7 * DAY,
      t - 30 * 60_000,
    ),
    salesByDay(from),
    q(
      `SELECT CAST(strftime('%w', (created_at + ${TZ}) / 1000, 'unixepoch') AS INTEGER) d, COUNT(*) v
       FROM orders WHERE ${LIVE} AND source != 'manual' AND created_at >= ? GROUP BY 1`,
      from,
    ),
    // Buyers in the range, and how many of them had ordered from that shop before (or twice in the range).
    q(
      `SELECT COUNT(*) buyers, COALESCE(SUM(n > 1), 0) again FROM (
         SELECT (SELECT COUNT(*) FROM orders o2 WHERE o2.shop_id = o.shop_id AND o2.customer_phone = o.customer_phone AND o2.status != 'cancelled' AND o2.source != 'manual') n
         FROM orders o WHERE ${LIVE} AND o.source != 'manual' AND o.status != 'cancelled' AND o.created_at >= ?
         GROUP BY o.shop_id, o.customer_phone)`,
      from,
    ),
    topProducts(`s.status != 'demo' AND o.created_at >= ?`, 8, from),
    latestOrders(`s.status != 'demo' AND o.source != 'manual'`),
    waitingProofs(t),
  ])
  return {
    now: one<Pulse>(cur),
    before: one<Pulse>(prev),
    day: one<{ orders: number; sales: number; orders_before: number; sales_before: number; shops: number; signups: number; live: number }>(day),
    sales: series(rows(sales), from, days),
    weekdays: Array.from({ length: 7 }, (_, i) => rows<{ d: number; v: number }>(weekdays).find((r) => r.d === i)?.v ?? 0),
    repeat: one<{ buyers: number; again: number }>(repeat),
    best: rows<TopProduct>(best),
    latest: rows<LatestOrder>(latest),
    waiting: one<Waiting>(waiting),
  }
}

export async function shopsData(days: AdminDays) {
  const { t, from } = windowOf(days)
  const [list, noShop] = await db().batch([
    shopRows(from),
    q(
      `SELECT u.name, u.phone, u.created_at FROM users u LEFT JOIN shops s ON s.owner_id = u.id
       WHERE s.id IS NULL AND u.is_admin = 0 ORDER BY u.created_at DESC LIMIT 50`,
    ),
  ])
  return { at: t, shops: toShops(list, t), noShop: rows<{ name: string; phone: string; created_at: number }>(noShop) }
}

export async function moneyData(days: AdminDays) {
  const { t, from, prevFrom } = windowOf(days)
  // Selcom's proxy is asked at the same time as the database (its health check; 5 s at most).
  const selcom = proxyHealth()
  const [cur, prev, sales, methods, categories, list, payments, received] = await db().batch([
    pulse(from, t + 1),
    pulse(prevFrom, from),
    salesByDay(from),
    q(
      `SELECT CASE WHEN source = 'manual' THEN 'manual' ELSE payment_method END method, COUNT(*) orders,
         COALESCE(SUM(CASE WHEN ${SOLD} THEN total END), 0) sales
       FROM orders WHERE ${LIVE} AND status != 'cancelled' AND created_at >= ? GROUP BY 1 ORDER BY sales DESC, orders DESC`,
      from,
    ),
    q(
      `SELECT s.category, COUNT(*) orders, COALESCE(SUM(CASE WHEN o.${SOLD} THEN o.total END), 0) sales
       FROM orders o JOIN shops s ON s.id = o.shop_id WHERE s.status != 'demo' AND o.created_at >= ? GROUP BY 1 ORDER BY sales DESC`,
      from,
    ),
    shopRows(from),
    // Tembo payments (src/server/billing.ts): the newest 20, and what arrived in the period.
    q(
      `SELECT p.id, p.amount, p.status, p.phone, p.reason, p.manual_for, p.created_at, p.completed_at, p.paid_until, p.shop_id, s.name shop
       FROM payments p JOIN shops s ON s.id = p.shop_id ORDER BY p.created_at DESC LIMIT 20`,
    ),
    q(`SELECT COUNT(*) n, COALESCE(SUM(amount), 0) total FROM payments WHERE status = 'completed' AND completed_at >= ?`, from),
  ])
  const shops = toShops(list, t)
  return {
    now: one<Pulse>(cur),
    before: one<Pulse>(prev),
    sales: series(rows(sales), from, days),
    methods: rows<{ method: string; orders: number; sales: number }>(methods),
    categories: rows<{ category: string; orders: number; sales: number }>(categories),
    plans: plansOf(shops),
    top: shops.filter((s) => s.status !== 'demo' && s.sales > 0).slice(0, 5),
    payments: rows<AdminPayment>(payments),
    received: one<{ n: number; total: number }>(received),
    selcom: await selcom,
  }
}

export async function growthData(days: AdminDays) {
  const { t, from, prevFrom } = windowOf(days)
  const [cur, prev, signups, shops, funnel, cohorts, sources, traffic, cities, areas, devices, brought] = await db().batch([
    pulse(from, t + 1),
    pulse(prevFrom, from),
    q(`SELECT ${DAYNO} d, COUNT(*) v FROM users WHERE is_admin = 0 AND created_at >= ? GROUP BY 1`, from),
    q(`SELECT ${DAYNO} d, COUNT(*) v FROM shops WHERE status != 'demo' AND created_at >= ? GROUP BY 1`, from),
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
    // Sign-ups by the week they joined (weeks start on Monday), and how far each week's sellers have got since.
    q(
      `SELECT wk, COUNT(*) signups, COUNT(sid) shop, COALESCE(SUM(has_product), 0) product, COALESCE(SUM(n >= 1), 0) first_order,
         COALESCE(SUM(n >= 5), 0) fifth_order, COALESCE(SUM(paid), 0) paid
       FROM (
         SELECT CAST(((u.created_at + ${TZ}) / ${DAY} + 3) / 7 AS INTEGER) wk, s.id sid,
           EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id) has_product,
           (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.source != 'manual') n,
           (s.paid_until IS NOT NULL) paid
         FROM users u LEFT JOIN shops s ON s.owner_id = u.id AND s.status != 'demo'
         WHERE u.is_admin = 0 AND u.created_at >= ?)
       GROUP BY wk ORDER BY wk DESC`,
      t - 8 * 7 * DAY,
    ),
    q(
      `SELECT COALESCE(NULLIF(source, ''), 'unknown') source, COUNT(*) orders, COALESCE(SUM(CASE WHEN ${SOLD} THEN total END), 0) sales
       FROM orders WHERE ${LIVE} AND created_at >= ? GROUP BY 1 ORDER BY orders DESC`,
      from,
    ),
    q(
      `SELECT COALESCE(NULLIF(source, ''), 'direct') k, COUNT(DISTINCT COALESCE(session_id, created_at)) n
       FROM events WHERE ${LIVE} AND type = 'view_shop' AND created_at >= ? GROUP BY 1 ORDER BY n DESC LIMIT 8`,
      from,
    ),
    q(
      `SELECT city k, COUNT(DISTINCT COALESCE(session_id, created_at)) n
       FROM events WHERE ${LIVE} AND type = 'view_shop' AND city IS NOT NULL AND city != '' AND created_at >= ? GROUP BY 1 ORDER BY n DESC LIMIT 8`,
      from,
    ),
    q(
      `SELECT REPLACE(area, ' (fee to agree)', '') k, COUNT(*) n FROM orders
       WHERE ${LIVE} AND source != 'manual' AND area != '' AND created_at >= ? GROUP BY 1 ORDER BY n DESC LIMIT 8`,
      from,
    ),
    q(
      `SELECT COALESCE(NULLIF(device, ''), 'unknown') k, COUNT(DISTINCT COALESCE(session_id, created_at)) n
       FROM events WHERE ${LIVE} AND type = 'view_shop' AND created_at >= ? GROUP BY 1 ORDER BY n DESC`,
      from,
    ),
    // Sign-ups that came from a shop's "Open your own shop" link (users.ref_shop, q-footer), by that shop. Demo shops
    // count here (Zee's banner is an invitation too), marked so they are not mistaken for a seller's.
    q(
      `SELECT s.name || CASE WHEN s.status = 'demo' THEN ' (demo)' ELSE '' END k, COUNT(*) n
       FROM users u JOIN shops s ON s.id = u.ref_shop
       WHERE u.is_admin = 0 AND u.created_at >= ? GROUP BY u.ref_shop ORDER BY n DESC LIMIT 8`,
      from,
    ),
  ])
  type Count = { k: string; n: number }
  return {
    now: one<Pulse>(cur),
    before: one<Pulse>(prev),
    signups: series(rows(signups), from, days),
    shops: series(rows(shops), from, days),
    funnel: one<{ signups: number; shops: number; product: number; visit: number; first_order: number; fifth_order: number }>(funnel),
    cohorts: rows<{ wk: number; signups: number; shop: number; product: number; first_order: number; fifth_order: number; paid: number }>(cohorts).map((c) => ({
      ...c,
      week: (c.wk * 7 - 3) * DAY,
    })),
    sources: rows<{ source: string; orders: number; sales: number }>(sources),
    traffic: rows<Count>(traffic),
    cities: rows<Count>(cities),
    areas: rows<Count>(areas),
    devices: rows<Count>(devices),
    brought: rows<Count>(brought),
  }
}

export async function useData(days: AdminDays) {
  const { from } = windowOf(days)
  const shop = (table: string, where = '1') => `(SELECT COUNT(DISTINCT shop_id) FROM ${table} WHERE ${LIVE} AND ${where})`
  const own = (where: string) => `(SELECT COUNT(*) FROM shops WHERE status != 'demo' AND ${where})`
  const [features, taps, best] = await db().batch([
    q(
      `SELECT
         (SELECT COUNT(*) FROM shops WHERE status != 'demo') shops,
         ${shop('products')} products,
         ${shop('products', `sizes IS NOT NULL AND sizes NOT IN ('', '[]')`)} options,
         ${shop('collections')} collections,
         ${shop('products', 'pick_rank IS NOT NULL')} picks,
         ${shop('discounts')} discounts,
         ${shop('orders', 'discount_code IS NOT NULL')} discount_used,
         ${shop('bag_links')} bags,
         ${shop('orders', `source = 'manual'`)} manual,
         ${shop('orders', 'lat IS NOT NULL')} pinned,
         ${own('ships_regions = 1')} regions,
         ${shop('stock_alerts')} alerts,
         ${shop('links')} links,
         ${shop('push_subscriptions')} push,
         (SELECT COUNT(*) FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.status != 'demo' AND u.app_seen_at IS NOT NULL) installed,
         ${shop('domains', `status = 'active'`)} domain,
         ${shop('ai_uses')} ai,
         ${shop('events', `type = 'seller_share' AND detail LIKE 'qr-%'`)} qr,
         ${own('theme_color IS NOT NULL')} colour,
         ${own('theme_font IS NOT NULL')} font,
         ${own('cover_key IS NOT NULL')} cover,
         ${own('logo_key IS NOT NULL')} logo,
         ${own(`lipa_number != ''`)} lipa,
         ${own(`lang = 'sw'`)} swahili,
         ${own(`maps_url IS NOT NULL AND maps_url != ''`)} maps,
         ${own(`tin IS NOT NULL AND tin != ''`)} tin,
         ${own(`(instagram != '' OR tiktok != '' OR facebook != '')`)} socials`,
    ),
    q(
      // Views are left out, except a product opened from a shop's Top picks.
      `SELECT type || CASE WHEN type IN ('add_to_cart', 'view_product') AND detail IS NOT NULL THEN ':' || detail ELSE '' END k, COUNT(*) n
       FROM events WHERE ${LIVE} AND created_at >= ?
         AND (type NOT IN ('view_shop', 'view_product') OR (type = 'view_product' AND detail = 'pick'))
       GROUP BY 1 ORDER BY n DESC`,
      from,
    ),
    topProducts(`s.status != 'demo' AND o.created_at >= ?`, 20, from),
  ])
  return {
    features: one<Record<string, number>>(features),
    taps: rows<{ k: string; n: number }>(taps),
    best: rows<TopProduct>(best),
  }
}

export async function healthData(days: AdminDays) {
  const { t, from } = windowOf(days)
  const [waiting, problems, limits, domains, counts, oldest] = await db().batch([
    waitingProofs(t),
    problemProofs(from),
    // What the limits table saw in the last 24 hours, by kind (the part of the key before the first colon).
    q(
      `SELECT CASE WHEN instr(key, ':') > 0 THEN substr(key, 1, instr(key, ':') - 1) ELSE key END k, COUNT(*) n, COUNT(DISTINCT key) keys
       FROM limits WHERE at > ? GROUP BY 1 ORDER BY n DESC`,
      t - 24 * HOUR,
    ),
    q(`SELECT d.hostname, d.status, d.detail, d.turnstile, d.created_at, s.name shop FROM domains d JOIN shops s ON s.id = d.shop_id ORDER BY d.created_at DESC LIMIT 30`),
    q(
      `SELECT
         (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM shops) shops, (SELECT COUNT(*) FROM products) products,
         (SELECT COUNT(*) FROM orders) orders, (SELECT COUNT(*) FROM events) events,
         (SELECT COALESCE(SUM(json_array_length(images)), 0) FROM products WHERE json_valid(images)) photos,
         (SELECT COUNT(*) FROM sessions WHERE expires_at > ?1) sessions,
         (SELECT COUNT(*) FROM push_subscriptions) push,
         (SELECT COUNT(*) FROM stock_alerts) alerts,
         (SELECT COUNT(*) FROM bag_links WHERE status = 'open' AND expires_at > ?1) bags`,
      t,
    ),
    q(`SELECT (SELECT MIN(created_at) FROM events) events, (SELECT MIN(created_at) FROM stock_alerts) alerts`),
  ])
  // The weekly backup in the private bucket: the newest file's age is what matters.
  let backup: { key: string; size: number; at: number; kept: number } | null = null
  let backupError = false
  try {
    const listed = await env.BACKUPS.list({ prefix: 'd1/' })
    const newest = [...listed.objects].sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())[0]
    if (newest) backup = { key: newest.key, size: newest.size, at: newest.uploaded.getTime(), kept: listed.objects.length }
  } catch {
    backupError = true
  }
  return {
    at: t,
    waiting: one<Waiting>(waiting),
    problems: one<{ n: number }>(problems).n,
    limits: rows<{ k: string; n: number; keys: number }>(limits),
    domains: rows<{ hostname: string; status: string; detail: string | null; turnstile: number; created_at: number; shop: string }>(domains),
    counts: one<Record<'users' | 'shops' | 'products' | 'orders' | 'events' | 'photos' | 'sessions' | 'push' | 'alerts' | 'bags', number>>(counts),
    oldest: one<{ events: number | null; alerts: number | null }>(oldest),
    dbBytes: (counts.meta as { size_after?: number }).size_after ?? null,
    backup,
    backupError,
  }
}

/** One shop's page: its row, its range, and what happened in it. */
export async function shopData(id: string, days: AdminDays) {
  const { t, from } = windowOf(days)
  const [row, sales, steps, best, latest, sources, features, dates] = await db().batch([
    shopRows(from, id),
    q(`SELECT ${DAYNO} d, COALESCE(SUM(total), 0) v FROM orders WHERE shop_id = ? AND ${SOLD} AND created_at >= ? GROUP BY 1`, id, from),
    q(
      `SELECT type k, COUNT(DISTINCT COALESCE(session_id, created_at)) n FROM events
       WHERE shop_id = ? AND created_at >= ? AND type IN ('view_shop', 'view_product', 'add_to_cart', 'checkout_start') GROUP BY 1`,
      id,
      from,
    ),
    topProducts(`o.shop_id = ? AND o.created_at >= ?`, 8, id, from),
    latestOrders(`o.shop_id = ?`, id),
    q(
      `SELECT COALESCE(NULLIF(source, ''), 'unknown') source, COUNT(*) orders, COALESCE(SUM(CASE WHEN ${SOLD} THEN total END), 0) sales
       FROM orders WHERE shop_id = ? AND created_at >= ? GROUP BY 1 ORDER BY orders DESC`,
      id,
      from,
    ),
    q(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE shop_id = ?1 AND active = 0) hidden,
         (SELECT COUNT(*) FROM products WHERE shop_id = ?1 AND stock <= 0) sold_out,
         (SELECT COUNT(*) FROM collections WHERE shop_id = ?1) collections,
         (SELECT COUNT(*) FROM products WHERE shop_id = ?1 AND pick_rank IS NOT NULL) picks,
         (SELECT COUNT(*) FROM users WHERE ref_shop = ?1 AND is_admin = 0) brought,
         (SELECT COUNT(*) FROM discounts WHERE shop_id = ?1) discounts,
         (SELECT COUNT(*) FROM bag_links WHERE shop_id = ?1) bags,
         (SELECT COUNT(*) FROM stock_alerts WHERE shop_id = ?1) alerts,
         (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND source = 'manual') manual,
         (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND status = 'payment_claimed') to_check,
         (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND status = 'cancelled') cancelled,
         (SELECT COUNT(DISTINCT customer_phone) FROM orders WHERE shop_id = ?1 AND source != 'manual' AND status != 'cancelled') buyers,
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE shop_id = ?1 AND ${SOLD}) sales_ever`,
      id,
    ),
    q(
      `SELECT
         (SELECT MIN(created_at) FROM products WHERE shop_id = ?1) first_product,
         (SELECT MIN(created_at) FROM events WHERE shop_id = ?1 AND type = 'view_shop') first_visit,
         (SELECT MIN(created_at) FROM orders WHERE shop_id = ?1 AND source != 'manual') first_order,
         (SELECT MIN(created_at) FROM (SELECT created_at FROM orders WHERE shop_id = ?1 AND source != 'manual' ORDER BY created_at LIMIT 1 OFFSET 4)) fifth_order,
         (SELECT location FROM shops WHERE id = ?1) location, (SELECT whatsapp FROM shops WHERE id = ?1) whatsapp,
         (SELECT instagram FROM shops WHERE id = ?1) instagram, (SELECT tiktok FROM shops WHERE id = ?1) tiktok`,
      id,
    ),
  ])
  const shop = toShops(row, t)[0]
  if (!shop) return null
  const step = (k: string) => rows<{ k: string; n: number }>(steps).find((r) => r.k === k)?.n ?? 0
  return {
    at: t,
    days,
    shop,
    sales: series(rows(sales), from, days),
    funnel: { visits: step('view_shop'), product: step('view_product'), bag: step('add_to_cart'), checkout: step('checkout_start'), orders: shop.orders },
    best: rows<TopProduct>(best),
    latest: rows<LatestOrder>(latest),
    sources: rows<{ source: string; orders: number; sales: number }>(sources),
    features: one<Record<'hidden' | 'sold_out' | 'collections' | 'picks' | 'brought' | 'discounts' | 'bags' | 'alerts' | 'manual' | 'to_check' | 'cancelled' | 'buyers' | 'sales_ever', number>>(features),
    dates: one<{ first_product: number | null; first_visit: number | null; first_order: number | null; fifth_order: number | null; location: string; whatsapp: string; instagram: string; tiktok: string }>(dates),
  }
}
