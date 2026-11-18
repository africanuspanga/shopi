import { createFileRoute } from '@tanstack/react-router'
import { currentUser, shopFor } from '#/server/auth'
import { LIMITS, count, overLimit } from '#/server/limits'
import { directPhotoLink } from '#/lib/import'

/**
 * Fetches a photo from a link in a seller's import sheet, for that seller's browser to shrink and upload like any
 * photo (src/lib/upload.ts). Browsers can't fetch most links themselves (CORS), so this does, for logged-in sellers
 * only, within LIMITS.photoFetch. Every refusal is a 4xx with `{ error }`, so a sheet of bad links never trips the
 * 5xx alert.
 */

const MAX_BYTES = 15_000_000
export type PhotoProblem = 'link' | 'fetch' | 'page' | 'big' | 'type' | 'limit'
const fail = (error: PhotoProblem, status = 422) => Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } })

/** Only public web addresses: no logins in the link, no local names, no bare IP addresses. */
function publicUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(directPhotoLink(raw.trim()))
  } catch {
    return null
  }
  const h = u.hostname
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password || !h.includes('.') || h.includes(':') || /^[\d.]+$/.test(h)) return null
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h)) return null
  return u.toString()
}

/** The photo's type from its first bytes: JPEG, PNG, WebP, GIF, AVIF or HEIC (iPhone). */
function photoType(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic'
  }
  return null
}

/** The whole body, or null once it passes `max` bytes. */
async function readUpTo(body: ReadableStream<Uint8Array>, max: number) {
  const parts: Uint8Array[] = []
  let size = 0
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.byteLength
  }
  return out
}

export const Route = createFileRoute('/api/photo')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await currentUser()
        if (!user) return fail('link', 401)
        const { shop } = await shopFor('products')
        if (!shop) return fail('link', 403)
        const url = publicUrl(new URL(request.url).searchParams.get('url') ?? '')
        if (!url) return fail('link')
        const key = `photo:${shop.id}`
        if (await overLimit(key, LIMITS.photoFetch)) return fail('limit', 429)
        await count(key)

        let res: Response
        try {
          res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(20_000),
            headers: { accept: 'image/*,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 (compatible; ShopiImport/1.0; +https://shopi.tz)' },
          })
        } catch {
          return fail('fetch')
        }
        if (!res.ok || !res.body) return fail('fetch')
        if ((res.headers.get('content-type') ?? '').includes('text/html')) {
          await res.body.cancel()
          return fail('page')
        }
        if (Number(res.headers.get('content-length')) > MAX_BYTES) {
          await res.body.cancel()
          return fail('big')
        }
        const body = await readUpTo(res.body, MAX_BYTES)
        if (!body) return fail('big')
        const type = photoType(body)
        if (!type) return fail('type')
        return new Response(body, { headers: { 'content-type': type, 'cache-control': 'private, no-store' } })
      },
    },
  },
})
