import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { getSession } from '#/lib/api/session'
import { LangProvider } from '#/lib/i18n'
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
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
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
  return (
    <LangProvider value={session.lang}>
      <Outlet />
    </LangProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
