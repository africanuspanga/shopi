import { createFileRoute } from '@tanstack/react-router'
import { handleCallback } from '#/server/billing'
import { LIMITS, count, overLimit } from '#/server/limits'

/**
 * Selcom's callback for Tembo payments (the `webhook` sent with each order: https://shopi.tz/api/selcom). It is only a
 * hint: `handleCallback` asks Selcom for the order's real status before anything changes (src/server/billing.ts).
 */
export const Route = createFileRoute('/api/selcom')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = `selcom-hook:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`
        if (await overLimit(key, LIMITS.selcomHook)) return Response.json({ error: 'rate_limited' }, { status: 429 })
        await count(key)
        const text = await request.text()
        if (text.length > 20_000) return Response.json({ error: 'too large' }, { status: 413 })
        let body: unknown
        try {
          body = JSON.parse(text)
        } catch {
          // Some gateways post a form; read it the same way.
          body = Object.fromEntries(new URLSearchParams(text))
        }
        const { status, json } = await handleCallback(body)
        return Response.json(json, { status })
      },
    },
  },
})
