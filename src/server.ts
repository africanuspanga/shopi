import handler from '@tanstack/react-start/server-entry'
import { runJob } from '#/server/jobs'
import { shopForHost } from '#/server/domains'
import { SHOPI_ORIGIN, SHOPI_PAGES, isShopiHost, setHostShop } from '#/lib/host'

/**
 * Sent with every response. HSTS keeps browsers on https; nosniff stops a file being read as another type (photos are
 * user uploads); no site may frame Shopi (clickjacking); links out don't carry the full address; and the page may use
 * the phone's location (the checkout map pin) but not its camera or microphone.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), geolocation=(self)',
}

/**
 * A shop's own domain (src/lib/host.ts): the shop it serves is registered for the router, Shopi's own pages go to
 * shopi.tz, and pages carry the shop so the browser's router rewrites links the same way. Null on Shopi's own hosts.
 */
async function onShopDomain(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  if (isShopiHost(url.hostname)) return null
  const slug = await shopForHost(url.hostname)
  if (!slug) return Response.redirect(`${SHOPI_ORIGIN}/`, 302)
  if (SHOPI_PAGES.test(url.pathname)) return Response.redirect(`${SHOPI_ORIGIN}${url.pathname}${url.search}`, 302)
  setHostShop(url.hostname, slug)
  const response = await handler.fetch(request)
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  const data = JSON.stringify({ host: url.hostname, slug }).replace(/</g, '\\u003c')
  return new HTMLRewriter()
    .on('head', {
      element(el) {
        el.prepend(`<script>window.__SHOPI_SHOP__=${data}</script>`, { html: true })
      },
    })
    .transform(response)
}

// The Worker: TanStack Start answers requests, and Cloudflare's cron triggers (wrangler.jsonc) run the jobs.
export default {
  async fetch(request) {
    const response = (await onShopDomain(request)) ?? (await handler.fetch(request))
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!headers.has(name)) headers.set(name, value)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
  async scheduled(controller) {
    await runJob(controller.cron)
  },
} satisfies ExportedHandler<Env>
