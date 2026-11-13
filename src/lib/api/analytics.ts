import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, first, now, run } from '#/server/db'
import { linkTag } from '#/lib/format'

/*
 * Seller analytics: one call returns everything the Analytics page shows for a range of days.
 * Days are counted in Tanzania time (UTC+3). A visit is a session; events from before sessions existed (Nov 2026)
 * count one visit per shop view. Sales are confirmed, sent and delivered orders, as on the dashboard.
 */
const DAY = 86_400_000
const TZ = 3 * 3600_000
const PAID = `('confirmed','dispatched','delivered')`
const VIEWS = `type IN ('view_shop','view_product')`
const VISITS = `COUNT(DISTINCT session_id) + COALESCE(SUM(session_id IS NULL AND type = 'view_shop'), 0)`
const VISITORS = `COUNT(DISTINCT visitor_id) + COALESCE(SUM(visitor_id IS NULL AND type = 'view_shop'), 0)`
const SALES = `COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total END), 0)`
const DAY_OF = `CAST((created_at + ${TZ}) / ${DAY} AS INTEGER)`

export const RANGES = [7, 30, 90] as const
export type RangeDays = (typeof RANGES)[number]

async function totals(shopId: string, from: number, to: number) {
  const [ev, od] = await Promise.all([
    first<{ visits: number; visitors: number }>(
      `SELECT ${VISITS} visits, ${VISITORS} visitors FROM events WHERE shop_id = ?1 AND created_at >= ?2 AND created_at < ?3 AND ${VIEWS}`,
      shopId,
      from,
      to,
    ),
    first<{ orders: number; paid: number; delivered: number; cancelled: number; sales: number; online: number; onlinePaid: number; onlineDelivered: number }>(
      `SELECT COUNT(*) orders, COALESCE(SUM(status IN ${PAID}), 0) paid, COALESCE(SUM(status = 'delivered'), 0) delivered,
         COALESCE(SUM(status = 'cancelled'), 0) cancelled, ${SALES} sales,
         COALESCE(SUM(source != 'manual'), 0) online, COALESCE(SUM(source != 'manual' AND status IN ${PAID}), 0) onlinePaid,
         COALESCE(SUM(source != 'manual' AND status = 'delivered'), 0) onlineDelivered
       FROM orders WHERE shop_id = ?1 AND created_at >= ?2 AND created_at < ?3`,
      shopId,
      from,
      to,
    ),
  ])
  const visits = ev?.visits ?? 0
  const orders = od?.orders ?? 0
  const paid = od?.paid ?? 0
  const sales = od?.sales ?? 0
  return {
    visits,
    visitors: ev?.visitors ?? 0,
    orders,
    paid,
    delivered: od?.delivered ?? 0,
    cancelled: od?.cancelled ?? 0,
    sales,
    // Orders placed in the shop, without sales the seller recorded by hand: the funnel and conversion use these.
    online: od?.online ?? 0,
    onlinePaid: od?.onlinePaid ?? 0,
    onlineDelivered: od?.onlineDelivered ?? 0,
    conversion: visits ? (od?.online ?? 0) / visits : 0,
    aov: paid ? sales / paid : 0,
  }
}

export const getAnalytics = createServerFn({ method: 'GET' })
  .validator((d: { days?: number }) => ({ days: (RANGES as readonly number[]).includes(Number(d?.days)) ? (Number(d.days) as RangeDays) : 30 }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const S = shop.id
    const t = now()
    const todayStart = Math.floor((t + TZ) / DAY) * DAY - TZ
    const from = todayStart - (data.days - 1) * DAY
    const prevFrom = from - data.days * DAY

    const [
      cur,
      prev,
      dailyEv,
      dailyOd,
      srcEv,
      srcOd,
      tagEv,
      tagOd,
      links,
      funnel,
      clicks,
      products,
      sizes,
      heat,
      areas,
      cities,
      devices,
      buyers,
      firsts,
    ] = await Promise.all([
      totals(S, from, t + 1),
      totals(S, prevFrom, from),
      all<{ day: number; visits: number; visitors: number }>(
        `SELECT ${DAY_OF} day, ${VISITS} visits, ${VISITORS} visitors FROM events WHERE shop_id = ?1 AND created_at >= ?2 AND ${VIEWS} GROUP BY day`,
        S,
        from,
      ),
      all<{ day: number; orders: number; sales: number }>(
        `SELECT ${DAY_OF} day, COUNT(*) orders, ${SALES} sales FROM orders WHERE shop_id = ?1 AND created_at >= ?2 GROUP BY day`,
        S,
        from,
      ),
      all<{ source: string; visits: number }>(
        `SELECT source, ${VISITS} visits FROM events WHERE shop_id = ?1 AND created_at >= ?2 AND ${VIEWS} GROUP BY source`,
        S,
        from,
      ),
      all<{ source: string; orders: number; sales: number }>(
        `SELECT source, COUNT(*) orders, ${SALES} sales FROM orders WHERE shop_id = ?1 AND created_at >= ?2 GROUP BY source`,
        S,
        from,
      ),
      all<{ tag: string; visits: number }>(
        `SELECT link_tag tag, COUNT(DISTINCT session_id) visits FROM events
         WHERE shop_id = ?1 AND created_at >= ?2 AND link_tag IS NOT NULL AND ${VIEWS} GROUP BY link_tag`,
        S,
        from,
      ),
      all<{ tag: string; orders: number; sales: number }>(
        `SELECT link_tag tag, COUNT(*) orders, ${SALES} sales FROM orders WHERE shop_id = ?1 AND created_at >= ?2 AND link_tag IS NOT NULL GROUP BY link_tag`,
        S,
        from,
      ),
      all<{ tag: string; label: string; created_at: number }>('SELECT tag, label, created_at FROM links WHERE shop_id = ?1 ORDER BY created_at DESC', S),
      first<{ visits: number; viewed: number; added: number; checkout: number }>(
        `SELECT COUNT(DISTINCT session_id) visits,
           COUNT(DISTINCT CASE WHEN type = 'view_product' THEN session_id END) viewed,
           COUNT(DISTINCT CASE WHEN type = 'add_to_cart' THEN session_id END) added,
           COUNT(DISTINCT CASE WHEN type = 'checkout_start' THEN session_id END) checkout
         FROM events WHERE shop_id = ?1 AND created_at >= ?2 AND session_id IS NOT NULL`,
        S,
        from,
      ),
      all<{ type: string; detail: string; n: number }>(
        `SELECT type, COALESCE(detail, '') detail, COUNT(*) n FROM events
         WHERE shop_id = ?1 AND created_at >= ?2 AND type IN ('whatsapp_click','social_click','share','seller_share') GROUP BY type, detail`,
        S,
        from,
      ),
      all<{ id: string; name: string; images: string; stock: number | null; views: number; viewers: number; adds: number; units: number; orders: number; sales: number }>(
        `SELECT p.id, p.name, p.images, p.stock,
           COALESCE(v.views, 0) views, COALESCE(v.viewers, 0) viewers, COALESCE(v.adds, 0) adds,
           COALESCE(s.units, 0) units, COALESCE(s.orders, 0) orders, COALESCE(s.sales, 0) sales
         FROM products p
         LEFT JOIN (
           SELECT product_id, SUM(type = 'view_product') views,
             COUNT(DISTINCT CASE WHEN type = 'view_product' THEN COALESCE(session_id, rowid) END) viewers,
             SUM(type = 'add_to_cart') adds
           FROM events WHERE shop_id = ?1 AND created_at >= ?2 AND product_id IS NOT NULL GROUP BY product_id
         ) v ON v.product_id = p.id
         LEFT JOIN (
           SELECT oi.product_id, SUM(oi.qty) units, COUNT(DISTINCT oi.order_id) orders, SUM(oi.qty * oi.price) sales
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.shop_id = ?1 AND o.created_at >= ?2 AND o.status IN ${PAID} GROUP BY oi.product_id
         ) s ON s.product_id = p.id
         WHERE p.shop_id = ?1
         ORDER BY sales DESC, views DESC`,
        S,
        from,
      ),
      all<{ size: string; units: number }>(
        `SELECT oi.variant size, SUM(oi.qty) units FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.shop_id = ?1 AND o.created_at >= ?2 AND o.status IN ${PAID} AND oi.variant IS NOT NULL
         GROUP BY oi.variant ORDER BY units DESC LIMIT 8`,
        S,
        from,
      ),
      all<{ dow: number; hr: number; n: number }>(
        `SELECT CAST(strftime('%w', (t + ${TZ}) / 1000, 'unixepoch') AS INTEGER) dow,
           CAST(strftime('%H', (t + ${TZ}) / 1000, 'unixepoch') AS INTEGER) hr, COUNT(*) n
         FROM (SELECT MIN(created_at) t FROM events WHERE shop_id = ?1 AND created_at >= ?2 AND ${VIEWS} GROUP BY COALESCE(session_id, rowid))
         GROUP BY dow, hr`,
        S,
        from,
      ),
      all<{ area: string; orders: number; sales: number }>(
        `SELECT area, COUNT(*) orders, ${SALES} sales FROM orders
         WHERE shop_id = ?1 AND created_at >= ?2 AND status != 'cancelled' AND area != '' GROUP BY area ORDER BY orders DESC LIMIT 8`,
        S,
        from,
      ),
      all<{ city: string; visits: number }>(
        `SELECT city, COUNT(DISTINCT session_id) visits FROM events
         WHERE shop_id = ?1 AND created_at >= ?2 AND city IS NOT NULL AND ${VIEWS} GROUP BY city ORDER BY visits DESC LIMIT 6`,
        S,
        from,
      ),
      all<{ device: string; visits: number }>(
        `SELECT device, COUNT(DISTINCT session_id) visits FROM events
         WHERE shop_id = ?1 AND created_at >= ?2 AND device IS NOT NULL AND ${VIEWS} GROUP BY device`,
        S,
        from,
      ),
      all<{ phone: string; name: string; orders: number; spent: number; last: number }>(
        `SELECT customer_phone phone, MAX(customer_name) name, COUNT(*) orders, ${SALES} spent, MAX(created_at) last
         FROM orders WHERE shop_id = ?1 AND created_at >= ?2 AND status != 'cancelled' AND customer_phone != '' GROUP BY customer_phone ORDER BY spent DESC`,
        S,
        from,
      ),
      all<{ phone: string; first: number }>(
        `SELECT customer_phone phone, MIN(created_at) first FROM orders WHERE shop_id = ?1 AND status != 'cancelled' AND customer_phone != '' GROUP BY customer_phone`,
        S,
      ),
    ])

    // Every day in the range, including quiet ones
    const firstDay = Math.floor((from + TZ) / DAY)
    const series = Array.from({ length: data.days }, (_, i) => {
      const day = firstDay + i
      const ev = dailyEv.find((d) => d.day === day)
      const od = dailyOd.find((d) => d.day === day)
      return { day: day * DAY, visits: ev?.visits ?? 0, visitors: ev?.visitors ?? 0, orders: od?.orders ?? 0, sales: od?.sales ?? 0 }
    })

    // Channels: visits from events, orders and money from orders, joined on the source
    const names = new Set([...srcEv.map((r) => r.source), ...srcOd.map((r) => r.source)])
    const channels = [...names]
      .map((source) => {
        const v = srcEv.find((r) => r.source === source)?.visits ?? 0
        const o = srcOd.find((r) => r.source === source)
        return { source: source || 'unknown', visits: v, orders: o?.orders ?? 0, sales: o?.sales ?? 0 }
      })
      .filter((c) => c.visits || c.orders)
      .sort((a, b) => b.sales - a.sales || b.visits - a.visits)

    const tagNames = new Set([...links.map((l) => l.tag), ...tagEv.map((r) => r.tag), ...tagOd.map((r) => r.tag)])
    const tags = [...tagNames]
      .map((tag) => {
        const link = links.find((l) => l.tag === tag)
        const o = tagOd.find((r) => r.tag === tag)
        return { tag, label: link?.label ?? null, saved: !!link, created: link?.created_at ?? 0, visits: tagEv.find((r) => r.tag === tag)?.visits ?? 0, orders: o?.orders ?? 0, sales: o?.sales ?? 0 }
      })
      .sort((a, b) => b.sales - a.sales || b.visits - a.visits || b.created - a.created)

    const count = (type: string, detail?: string) => clicks.filter((c) => c.type === type && (detail == null || c.detail === detail)).reduce((s, c) => s + c.n, 0)

    // When buyers shop: Monday first, as a Tanzanian week reads
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    for (const h of heat) grid[(h.dow + 6) % 7][h.hr] += h.n

    const firstOrder = new Map(firsts.map((f) => [f.phone, f.first]))
    const returning = buyers.filter((b) => (firstOrder.get(b.phone) ?? t) < from || b.orders > 1).length

    return {
      days: data.days,
      from,
      shop: { slug: shop.slug },
      now: cur,
      before: prev,
      series,
      channels,
      tags,
      funnel: {
        visits: funnel?.visits ?? 0,
        viewed: funnel?.viewed ?? 0,
        added: funnel?.added ?? 0,
        checkout: funnel?.checkout ?? 0,
        ordered: cur.online,
        paid: cur.onlinePaid,
        delivered: cur.onlineDelivered,
      },
      clicks: {
        whatsapp: count('whatsapp_click'),
        whatsappFrom: { shop: count('whatsapp_click', 'shop'), product: count('whatsapp_click', 'product'), order: count('whatsapp_click', 'order'), footer: count('whatsapp_click', 'footer') },
        instagram: count('social_click', 'instagram'),
        tiktok: count('social_click', 'tiktok'),
        facebook: count('social_click', 'facebook'),
        shares: count('share'),
        sharesOnWhatsApp: count('share', 'whatsapp'),
        copies: count('share', 'copy'),
        sellerShares: count('seller_share'),
      },
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        image: (JSON.parse(p.images) as string[])[0] ?? null,
        stock: p.stock,
        views: p.views,
        viewers: p.viewers,
        adds: p.adds,
        units: p.units,
        orders: p.orders,
        sales: p.sales,
      })),
      sizes,
      heat: grid,
      areas: areas.map((a) => ({ ...a, area: a.area.replace(' (fee to agree)', '') })),
      cities,
      devices,
      buyers: {
        total: buyers.length,
        returning,
        top: buyers.slice(0, 8).map((b) => ({ ...b, returning: (firstOrder.get(b.phone) ?? t) < from || b.orders > 1 })),
      },
    }
  })

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>

/** A link the seller tags for one channel or post, like "Instagram bio" -> ?s=instagram-bio. */
export const createLink = createServerFn({ method: 'POST' })
  .validator((d: { label: string }) => ({ label: String(d?.label ?? '').trim().slice(0, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    if (!data.label) return { error: 'label' as const }
    const base = linkTag(data.label) || 'link'
    const taken = new Set((await all<{ tag: string }>('SELECT tag FROM links WHERE shop_id = ?', shop.id)).map((r) => r.tag))
    let tag = base
    for (let i = 2; taken.has(tag); i++) tag = `${base}-${i}`
    await run('INSERT INTO links (shop_id, tag, label, created_at) VALUES (?, ?, ?, ?)', shop.id, tag, data.label, now())
    return { ok: true as const, tag }
  })

/** Removes the name only: visits and orders that came through the link stay in the numbers. */
export const deleteLink = createServerFn({ method: 'POST' })
  .validator((d: { tag: string }) => ({ tag: linkTag(String(d?.tag ?? '')) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('DELETE FROM links WHERE shop_id = ? AND tag = ?', shop.id, data.tag)
    return { ok: true as const }
  })
