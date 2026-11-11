import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { ArrowUpRight, ChartColumn, House, Package, Plus, ReceiptText, Store } from 'lucide-react'
import { FloatingNav, NavCenter, NavTab } from '#/components/floating-nav'
import { ShopAvatar, Wordmark } from '#/components/ui'
import { getNavCounts } from '#/lib/api/merchant'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) throw redirect({ to: '/login' })
    if (!context.session.shop) throw redirect({ to: '/onboard' })
    return { shop: context.session.shop, user: context.session.user }
  },
  loader: () => getNavCounts(),
  component: AppLayout,
})

function useTabs() {
  const t = useT()
  return [
    { to: '/app', icon: House, label: t('Home'), match: (p: string) => p === '/app' || p === '/app/' },
    { to: '/app/orders', icon: ReceiptText, label: t('Orders'), match: (p: string) => p.startsWith('/app/orders') },
    { to: '/app/products', icon: Package, label: t('Products'), match: (p: string) => p.startsWith('/app/products') },
    { to: '/app/shop', icon: Store, label: t('Shop'), match: (p: string) => p.startsWith('/app/shop') },
  ]
}

function AppLayout() {
  return (
    <div className="min-h-dvh bg-page md:pl-[248px]">
      <Sidebar />
      <main className="min-w-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

/** Orders that need the seller: an orange count for payments to check, a quiet one for orders to send. */
function OrdersBadge({ dot = false }: { dot?: boolean }) {
  const { toCheck, toSend } = Route.useLoaderData()
  if (dot) return toCheck > 0 ? <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-moto ring-2 ring-ink" /> : null
  if (toCheck > 0)
    return <span className="tnum ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-moto px-1.5 text-[12px] font-medium text-ink">{toCheck}</span>
  if (toSend > 0) return <span className="tnum ml-auto text-[13px] text-muted">{toSend}</span>
  return null
}

function Sidebar() {
  const t = useT()
  const [home, orders, products, shopTab] = useTabs()
  const tabs = [
    home,
    orders,
    { to: '/app/analytics', icon: ChartColumn, label: t('Analytics'), match: (p: string) => p.startsWith('/app/analytics') },
    products,
    shopTab,
  ]
  const { shop } = Route.useRouteContext()
  const path = useLocation({ select: (l) => l.pathname })
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-card px-3 pt-6 pb-4 md:flex">
      <Link to="/app" className="flex h-9 items-center px-3" aria-label="Shopi">
        <Wordmark className="h-[22px] w-auto" />
      </Link>

      <a
        href={`/${shop.slug}`}
        target="_blank"
        rel="noreferrer"
        className="group mt-6 flex items-center gap-3 rounded-[14px] bg-page p-2.5 transition-colors hover:bg-well"
      >
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-9 w-9 text-[13px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{shop.name}</span>
          <span className="meta block truncate">shopi.tz/{shop.slug}</span>
        </span>
        <ArrowUpRight size={16} strokeWidth={1.6} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>

      <nav className="mt-6 space-y-0.5" aria-label={t('Main')}>
        {tabs.map((tab) => {
          const on = tab.match(path)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={on ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-colors ${on ? 'bg-well text-ink' : 'text-ink-2 hover:bg-page hover:text-ink'}`}
            >
              <tab.icon size={18} strokeWidth={on ? 2 : 1.6} className="shrink-0" />
              {tab.label}
              {tab.to === '/app/orders' && <OrdersBadge />}
            </Link>
          )
        })}
      </nav>

      <Link to="/app/products/new" className="btn btn-sm mt-6 h-10 w-full">
        <Plus size={16} strokeWidth={2} /> {t('Add product')}
      </Link>

      <div className="mt-auto rounded-[14px] px-3 py-3 text-[13px] leading-5 text-muted">
        {t('Share your link in your Instagram bio and WhatsApp status. That is where buyers come from.')}
      </div>
    </aside>
  )
}

/** Phones: the floating black capsule (components/floating-nav.tsx); + adds a product. */
function BottomNav() {
  const t = useT()
  const [home, orders, products, shopTab] = useTabs()
  const path = useLocation({ select: (l) => l.pathname })
  const tab = (x: typeof home) => (
    <NavTab key={x.to} to={x.to} icon={x.icon} label={x.label} active={x.match(path)} badge={x.to === '/app/orders' && !x.match(path) ? <OrdersBadge dot /> : undefined} />
  )
  return (
    <FloatingNav label={t('Main')}>
      {tab(home)}
      {tab(orders)}
      <NavCenter to="/app/products/new" icon={Plus} label={t('Add product')} />
      {tab(products)}
      {tab(shopTab)}
    </FloatingNav>
  )
}
