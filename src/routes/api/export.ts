import { createFileRoute } from '@tanstack/react-router'
import { currentUser } from '#/server/auth'
import { all, first, now } from '#/server/db'
import { PAYMENT_LABEL, type PaymentMethod } from '#/lib/format'

/** CSV downloads for the logged-in seller: /api/export?what=orders|customers&days=7|30|90 */
const DAY = 86_400_000
const TZ = 3 * 3600_000
const PAID = `('confirmed','dispatched','delivered')`

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n')
const dateTime = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 16).replace('T', ' ')

export const Route = createFileRoute('/api/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser()
        if (!user) return new Response('Log in first', { status: 401 })
        const shop = await first<{ id: string; slug: string }>('SELECT id, slug FROM shops WHERE owner_id = ?', user.id)
        if (!shop) return new Response('No shop', { status: 403 })
        const url = new URL(request.url)
        const what = url.searchParams.get('what') === 'customers' ? 'customers' : 'orders'
        const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30
        const t = now()
        const from = Math.floor((t + TZ) / DAY) * DAY - TZ - (days - 1) * DAY

        let body: string
        if (what === 'orders') {
          const rows = await all<Record<string, string | number | null>>(
            `SELECT o.code, o.created_at, o.customer_name, o.customer_phone, o.area, o.landmark, o.subtotal, o.delivery_fee, o.total,
               o.payment_method, o.status, o.source, o.link_tag,
               (SELECT group_concat(oi.qty || ' x ' || oi.name || COALESCE(' (' || oi.variant || ')', ''), '; ')
                FROM order_items oi WHERE oi.order_id = o.id) items
             FROM orders o WHERE o.shop_id = ? AND o.created_at >= ? ORDER BY o.created_at DESC`,
            shop.id,
            from,
          )
          body = csv([
            ['Order', 'Date', 'Buyer', 'Phone', 'Area', 'Landmark', 'Items', 'Items total', 'Delivery', 'Total', 'Payment', 'Status', 'Came from', 'Link tag'],
            ...rows.map((r) => [
              r.code,
              dateTime(Number(r.created_at)),
              r.customer_name,
              r.customer_phone,
              String(r.area ?? '').replace(' (fee to agree)', ''),
              r.landmark,
              r.items,
              r.subtotal,
              r.delivery_fee,
              r.total,
              PAYMENT_LABEL[r.payment_method as PaymentMethod] ?? r.payment_method,
              r.status,
              r.source,
              r.link_tag,
            ]),
          ])
        } else {
          const rows = await all<{ name: string; phone: string; orders: number; spent: number; first: number; last: number }>(
            `SELECT MAX(customer_name) name, customer_phone phone, COUNT(*) orders,
               COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total END), 0) spent, MIN(created_at) first, MAX(created_at) last
             FROM orders WHERE shop_id = ? AND created_at >= ? AND status != 'cancelled' AND customer_phone != ''
             GROUP BY customer_phone ORDER BY spent DESC`,
            shop.id,
            from,
          )
          body = csv([['Buyer', 'Phone', 'Orders', 'Spent (TSh)', 'First order', 'Last order'], ...rows.map((r) => [r.name, r.phone, r.orders, r.spent, dateTime(r.first), dateTime(r.last)])])
        }
        const name = `${shop.slug}-${what}-${days}-days-${new Date(t + TZ).toISOString().slice(0, 10)}.csv`
        // A byte-order mark so Excel opens Swahili names and "TSh" correctly.
        return new Response('﻿' + body, {
          headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
        })
      },
    },
  },
})
