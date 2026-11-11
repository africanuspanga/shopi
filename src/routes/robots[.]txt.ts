import { createFileRoute } from '@tanstack/react-router'

/** Search engines may crawl only the real site. Test hosts (rizktz.store, workers.dev, localhost) stay out of search results. */
const LIVE_HOSTS = new Set(['shopi.tz', 'www.shopi.tz'])

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const host = new URL(request.url).hostname
        const body = LIVE_HOSTS.has(host) ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n'
        return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
      },
    },
  },
})
