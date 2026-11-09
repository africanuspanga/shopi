import { createFileRoute } from '@tanstack/react-router'
import { first, now, run } from '#/server/db'
import { deviceOf, isBot } from '#/server/ua'

/** Analytics events from shops, sent with sendBeacon by src/lib/analytics.ts. Always answers 202, so pages never wait or fail. */
const TYPES = new Set(['view_shop', 'view_product', 'add_to_cart', 'checkout_start', 'whatsapp_click', 'social_click', 'share', 'seller_share'])
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v)
const word = (v: unknown, max = 40) =>
  typeof v === 'string'
    ? v
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
    : ''

export const Route = createFileRoute('/api/e')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const done = new Response(null, { status: 202 })
        const ua = request.headers.get('user-agent') ?? ''
        if (isBot(ua)) return done
        const raw = await request.text()
        if (raw.length > 2000) return done
        let e: Record<string, unknown>
        try {
          e = JSON.parse(raw)
        } catch {
          return done
        }
        const type = String(e.type ?? '')
        if (!TYPES.has(type) || !isId(e.shopId) || !isId(e.vid) || !isId(e.sid)) return done
        const productId = isId(e.productId) ? e.productId : null
        const cf = (request as Request & { cf?: { city?: string } }).cf
        const city = typeof cf?.city === 'string' ? cf.city.slice(0, 60) : null
        const t = now()

        // A product's view count goes up once per visit, not on every reload.
        if (type === 'view_product' && productId) {
          const seen = await first('SELECT 1 FROM events WHERE shop_id = ? AND session_id = ? AND type = ? AND product_id = ? LIMIT 1', e.shopId, e.sid, type, productId)
          if (!seen) await run('UPDATE products SET views = views + 1 WHERE id = ? AND shop_id = ?', productId, e.shopId)
        }
        await run(
          `INSERT INTO events (shop_id, product_id, type, source, created_at, visitor_id, session_id, link_tag, detail, device, city)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          e.shopId,
          productId,
          type,
          word(e.source) || 'direct',
          t,
          e.vid,
          e.sid,
          word(e.tag) || null,
          word(e.detail, 30) || null,
          deviceOf(ua),
          city,
        )
        return done
      },
    },
  },
})
