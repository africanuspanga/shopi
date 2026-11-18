import { createFileRoute } from '@tanstack/react-router'
import { asAdminDays } from '#/lib/admin'
import { shopList } from '#/server/admin'
import { currentUser } from '#/server/auth'

/** The owner dashboard's Shops table as a CSV: /api/admin-export?days=7|30|90. Admins only; anyone else gets a 404. */
const TZ = 3 * 3600_000
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // A leading =, +, - or @ would run as a formula in a spreadsheet; names and shop names are typed by sellers.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const day = (ms: number | null) => (ms ? new Date(ms + TZ).toISOString().slice(0, 10) : '')

export const Route = createFileRoute('/api/admin-export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser()
        if (!user?.is_admin) return new Response('Not found', { status: 404 })
        const days = asAdminDays(new URL(request.url).searchParams.get('days'))
        const { shops } = await shopList(days)
        const plan = (s: (typeof shops)[number]) => {
          const p = s.plan
          if (p.kind === 'demo') return ['demo', '']
          if (p.kind === 'tembo') return ['tembo', day(p.until)]
          return ['free', '']
        }
        const body = [
          ['Shop', 'Link', 'Category', 'Opened', 'Seller', 'Phone', 'Last log-in', 'Language', 'Plan', 'Tembo ends', 'Ready (%)', 'Products', 'Products without a photo',
            `Visits (${days} days)`, `Online orders (${days} days)`, `Sales TSh (${days} days)`, 'Online orders ever', 'Last order', 'App installed', 'Notifications', 'Own look', 'Own domain'],
          ...shops.map((s) => [
            s.name, `https://shopi.tz/${s.slug}`, s.category, day(s.created_at), s.owner, `'${s.phone}`, day(s.last_login), s.lang, ...plan(s), s.setup, s.products, s.noPhoto,
            s.visits, s.orders, s.sales, s.ordersEver, day(s.last_order), s.app ?? 'no', s.notifications ? 'yes' : 'no', s.look ? 'yes' : 'no', s.domain ?? '',
          ]),
        ]
          .map((r) => r.map(cell).join(','))
          .join('\r\n')
        return new Response(`﻿${body}`, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="shopi-shops-${day(Date.now())}.csv"`,
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
