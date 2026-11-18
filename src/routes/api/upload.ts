import { createFileRoute } from '@tanstack/react-router'
import { currentUser, shopFor } from '#/server/auth'
import { media, newId } from '#/server/db'
import { thumbKey } from '#/lib/format'

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const MAX_BYTES = 2_500_000

/** The file really is the image type it claims: the first bytes of a WebP, JPEG or PNG. */
function looksLike(type: string, body: ArrayBuffer) {
  const b = new Uint8Array(body.slice(0, 12))
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to))
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (type === 'image/png') return b[0] === 0x89 && ascii(1, 4) === 'PNG'
  return false
}
const MAX_THUMB_BYTES = 600_000

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await currentUser()
        if (!user) return new Response('Unauthorized', { status: 401 })
        const { shop } = await shopFor(['products', 'manage'])
        if (!shop) return new Response('No shop', { status: 403 })
        const type = request.headers.get('content-type') ?? ''
        const ext = TYPES[type]
        if (!ext) return new Response('Unsupported type', { status: 415 })
        const body = await request.arrayBuffer()
        if (!looksLike(type, body)) return new Response('Unsupported type', { status: 415 })

        // ?thumb=<key>: the 600px copy of a photo this shop just uploaded, stored beside it.
        const of = new URL(request.url).searchParams.get('thumb')
        if (of) {
          if (!new RegExp(`^s/${shop.id}/[a-z0-9]+\\.(webp|jpg|png)$`).test(of)) return new Response('Bad key', { status: 400 })
          if (body.byteLength > MAX_THUMB_BYTES) return new Response('Too large', { status: 413 })
          await media().put(thumbKey(of), body, { httpMetadata: { contentType: type } })
          return Response.json({ key: thumbKey(of) })
        }

        if (body.byteLength > MAX_BYTES) return new Response('Too large', { status: 413 })
        const key = `s/${shop.id}/${newId(12)}.${ext}`
        await media().put(key, body, { httpMetadata: { contentType: type } })
        return Response.json({ key })
      },
    },
  },
})
