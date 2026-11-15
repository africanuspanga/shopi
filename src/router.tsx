import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { NotFound } from '#/components/not-found'
import { shopRewrite } from '#/lib/host'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // A shop on its own domain drops its /<shop> prefix there (src/lib/host.ts); on shopi.tz this does nothing.
    rewrite: shopRewrite,
    defaultNotFoundComponent: () => <NotFound title="This page is not here" body="Check the link for a typo, or start again from the Shopi home page." />,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
