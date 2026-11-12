import { createFileRoute } from '@tanstack/react-router'
import { media } from '#/server/db'

/** Cloudflare's cache in the data centre that served the request (Dar es Salaam for most buyers). */
const edge = () => (caches as unknown as { default: Cache }).default

export const Route = createFileRoute('/img/$')({
  server: {
    handlers: {
      // s/<shop>/<id>.webp is the full photo, t/<shop>/<id>.webp its 600px copy. Answers come from the edge cache when
      // they can, so a photo seen once in Dar is not read from storage again.
      GET: async ({ request, params }) => {
        const key = params._splat ?? ''
        if (!/^[st]\/[a-z0-9]+\/[a-z0-9]+\.(webp|jpg|png)$/.test(key)) return new Response('Not found', { status: 404 })
        const hit = await edge().match(request)
        if (hit) return hit
        let obj = await media().get(key)
        // Photos uploaded before small copies existed: serve the full one until the backfill makes the copy.
        const standIn = !obj && key.startsWith('t/')
        if (standIn) obj = await media().get(`s/${key.slice(2)}`)
        if (!obj) return new Response('Not found', { status: 404 })
        const res = new Response(obj.body, {
          headers: {
            'content-type': obj.httpMetadata?.contentType ?? 'image/webp',
            'cache-control': standIn ? 'public, max-age=3600' : 'public, max-age=31536000, immutable',
          },
        })
        await edge().put(request, res.clone())
        return res
      },
    },
  },
})
