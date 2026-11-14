import { HeadContent, Outlet, Scripts, createRootRoute, useMatches } from '@tanstack/react-router'
import { useWatchNavigation } from '#/components/ui'
import { getSession } from '#/lib/api/session'
import { LangProvider, asLang } from '#/lib/i18n'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  beforeLoad: async () => ({ session: await getSession() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#f4f3f0' },
      { title: 'Shopi · Your shop in one link' },
      { name: 'description', content: 'An online shop in one link for sellers on Instagram, TikTok and WhatsApp. Buyers order by themselves and pay your Lipa Namba or cash on delivery.' },
      // Link previews (WhatsApp, Instagram, X). Shop and product pages replace the image and text with their own.
      { property: 'og:site_name', content: 'Shopi' },
      { property: 'og:type', content: 'website' },
      { property: 'og:description', content: 'An online shop in one link for sellers on Instagram, TikTok and WhatsApp. Buyers order by themselves and pay your Lipa Namba or cash on delivery.' },
      { property: 'og:image', content: 'https://shopi.tz/og.png' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      // The body font starts loading with the page instead of after the stylesheet.
      { rel: 'preload', href: '/fonts/mona-sans-latin.v4.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: Root,
  shellComponent: RootDocument,
})

function Root() {
  const { session } = Route.useRouteContext()
  useWatchNavigation()
  return (
    <LangProvider value={session.lang}>
      <Outlet />
    </LangProvider>
  )
}

/** The page's language for <html lang>: a shop's pages and order pages in the shop's, everything else in the visitor's. */
function useDocumentLang() {
  return useMatches({
    select: (matches) => {
      for (const m of matches) {
        const shop = (m.loaderData as { shop?: { lang?: string } } | undefined)?.shop
        if ((m.routeId === '/$shop' || m.routeId === '/o/$code') && shop) return asLang(shop.lang)
      }
      return asLang((matches[0]?.context as { session?: { lang?: string } } | undefined)?.session?.lang)
    },
  })
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const lang = useDocumentLang()
  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere]">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
