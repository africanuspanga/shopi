import handler from '@tanstack/react-start/server-entry'
import { runJob } from '#/server/jobs'

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

// The Worker: TanStack Start answers requests, and Cloudflare's cron triggers (wrangler.jsonc) run the jobs.
export default {
  async fetch(request) {
    const response = await handler.fetch(request)
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!headers.has(name)) headers.set(name, value)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
  async scheduled(controller) {
    await runJob(controller.cron)
  },
} satisfies ExportedHandler<Env>
