import { createFileRoute } from '@tanstack/react-router'
import { unsubscribe } from '#/server/email'

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header of an optional email. The
 * link's key is the proof; the answer is the same whether it matched or not.
 */
export const Route = createFileRoute('/api/email-off')({
  server: {
    handlers: {
      // Mail apps without one-click open the address in a browser instead: the stop page, which asks for a tap.
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams
        const to = new URLSearchParams({ u: q.get('u') ?? '', k: q.get('k') ?? '', w: q.get('w') ?? 'weekly' })
        return new Response(null, { status: 302, headers: { location: `/email/off?${to}` } })
      },
      POST: async ({ request }) => {
        const q = new URL(request.url).searchParams
        await unsubscribe(q.get('u') ?? '', q.get('k') ?? '', q.get('w') ?? 'weekly')
        return new Response('Unsubscribed', { status: 200, headers: { 'content-type': 'text/plain' } })
      },
    },
  },
})
