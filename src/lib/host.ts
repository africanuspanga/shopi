/**
 * Shops on their own domain (A10). On www.myshop.co.tz the shop's pages lose their /<shop> prefix: the router reads
 * "/gauni-la-jua" as "/myshop/gauni-la-jua" (input) and writes its links back without it (output). Links to Shopi's
 * own pages (the landing page, sign-up, privacy) go to shopi.tz; the order page, photos and the API stay on the
 * shop's domain. The server registers each host's shop before the router runs (src/server.ts); in the browser the
 * page carries it in `window.__SHOPI_SHOP__`.
 */

export const SHOPI_ORIGIN = 'https://shopi.tz'

/**
 * Where "Open your own shop" goes from a shop's pages (roadmap q-footer): Shopi's landing with the shop that sent the
 * visitor (`ref`) and where on the page (`s`). The landing keeps `ref` for 30 days in REF_COOKIE, and sign-up stores it
 * as users.ref_shop, so the seller invite reward has its history when it ships.
 */
export const REF_COOKIE = 'shopi_ref'
export const refLink = (shopSlug: string, from: 'footer' | 'order' | 'banner') =>
  `${SHOPI_ORIGIN}/?ref=${encodeURIComponent(shopSlug)}&s=${from}`
/** What sellers point their CNAME at: Cloudflare for SaaS's fallback origin on the shopi.tz zone. */
export const CNAME_TARGET = 'customers.shopi.tz'

/** Shopi's own hosts; anything else is a shop's domain (or nothing). `*.localhost` stands in for a shop's domain locally. */
export function isShopiHost(host: string) {
  return host === 'shopi.tz' || host === 'www.shopi.tz' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.workers.dev')
}

declare global {
  interface Window {
    __SHOPI_SHOP__?: { host: string; slug: string }
  }
}

const hosts = new Map<string, string>()
/** Server: the shop a domain serves, for the request being handled. */
export const setHostShop = (host: string, slug: string) => hosts.set(host, slug)
/** The shop served at `host`, or null on Shopi's own hosts. */
export function hostShop(host: string): string | null {
  if (typeof window !== 'undefined') return window.__SHOPI_SHOP__?.host === host ? window.__SHOPI_SHOP__.slug : null
  return hosts.get(host) ?? null
}

/** Paths a shop's domain serves as they are: the order page, photos, the API, files. */
const AS_IS = /^\/(o|img|api|_serverFn|assets|fonts|images|icons)(\/|$)|^\/[^/]+\.(js|json|xml|txt|png|ico|svg|webmanifest|woff2)$/
/** Shopi's own pages: on a shop's domain they send the visitor to shopi.tz. */
export const SHOPI_PAGES = /^\/(app|admin|login|signup|onboard|privacy|terms|data-deletion|email)(\/|$)/

export const shopRewrite = {
  input: ({ url }: { url: URL }) => {
    const slug = hostShop(url.hostname)
    const p = url.pathname
    if (!slug || p === `/${slug}` || p.startsWith(`/${slug}/`) || AS_IS.test(p) || SHOPI_PAGES.test(p)) return undefined
    url.pathname = p === '/' ? `/${slug}` : `/${slug}${p}`
    return url
  },
  output: ({ url }: { url: URL }) => {
    const slug = hostShop(url.hostname)
    if (!slug) return undefined
    const p = url.pathname
    if (p === `/${slug}` || p === `/${slug}/`) url.pathname = '/'
    else if (p.startsWith(`/${slug}/`)) url.pathname = p.slice(slug.length + 1)
    else if (!AS_IS.test(p)) return new URL(`${p}${url.search}${url.hash}`, SHOPI_ORIGIN)
    return url
  },
}

/** A shop's own address for sharing: the bare domain when it is served there, else shopi.tz/<shop>. */
export function shopAddress(origin: string, slug: string, path = '') {
  const host = new URL(origin).hostname
  return hostShop(host) === slug ? `${origin}${path || '/'}` : `${origin}/${slug}${path}`
}

/**
 * A domain as a seller types it, cleaned: "https://WWW.MyShop.co.tz/" -> "www.myshop.co.tz". Null when it can't be a
 * shop's domain (no dot, an IP address, Shopi's own, or too long).
 */
export function cleanDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  let host: string
  try {
    host = new URL(/^[a-z]+:\/\//.test(s) ? s : `https://${s}`).hostname
  } catch {
    return null
  }
  host = host.replace(/\.$/, '')
  if (host.length > 253 || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return null
  if (host === 'shopi.tz' || host.endsWith('.shopi.tz')) return null
  if (!host.split('.').every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null
  return host
}

/** How many labels the registered name has: myshop.co.tz is 3, myshop.com is 2. */
function apexLabels(parts: string[]) {
  return /^(co|or|ac|go|ne|sc|com|org|net|edu|gov)$/.test(parts[parts.length - 2] ?? '') && parts.length >= 3 ? 3 : 2
}
/** True for a bare domain (myshop.co.tz, myshop.com), which most DNS hosts can't point with a CNAME. */
export function isApex(host: string) {
  const parts = host.split('.')
  return parts.length === apexLabels(parts)
}
/** The bare domain and the part before it: www.myshop.co.tz -> ["myshop.co.tz", "www"]. */
export function splitDomain(host: string): [string, string] {
  const parts = host.split('.')
  const n = apexLabels(parts)
  return [parts.slice(-n).join('.'), parts.slice(0, -n).join('.')]
}
