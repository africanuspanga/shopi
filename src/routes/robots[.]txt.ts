import { createFileRoute } from '@tanstack/react-router'
import { SITE } from '#/lib/seo'

/**
 * Search engines may crawl only the real site, minus the seller app and the API, and get the sitemap. Any other host
 * (a test copy, localhost) stays out of search results.
 */
const LIVE = `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`
const LIVE_HOSTS = new Set(['shopi.tz', 'www.shopi.tz'])

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const host = new URL(request.url).hostname
        const body = LIVE_HOSTS.has(host) ? LIVE : 'User-agent: *\nDisallow: /\n'
        return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
      },
    },
  },
})
