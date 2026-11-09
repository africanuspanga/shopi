import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { ArrowUpRight, House, Package, Plus, ReceiptText, Store } from 'lucide-react'
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
  const tabs = useTabs()
  const { shop } = Route.useRouteContext()
  const path = useLocation({ select: (l) => l.pathname })
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-card px-3 pt-6 pb-4 md:flex">
      <Link to="/app" className="flex h-9 items-center px-3" aria-label="RIZK">
        <Wordmark className="h-[15px] w-auto" />
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
          <span className="meta block truncate">rizk.tz/{shop.slug}</span>
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

/** Phones: a floating black capsule. The current tab sits on a raised pill with its icon in Moto; + adds a product. */
function BottomNav() {
  const t = useT()
  const tabs = useTabs()
  const path = useLocation({ select: (l) => l.pathname })
  const items = [tabs[0], tabs[1], null, tabs[2], tabs[3]]
  return (
    <nav aria-label={t('Main')} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <div className="pointer-events-auto mx-auto grid h-[68px] max-w-[440px] grid-cols-5 items-center gap-1 rounded-full bg-ink p-1.5 text-white shadow-[0_0_0_5px_rgb(10_10_10/0.06),0_20px_44px_-14px_rgb(10_10_10/0.6)] ring-1 ring-white/10">
        {items.map((tab) => {
          if (!tab)
            return (
              <Link
                key="add"
                to="/app/products/new"
                aria-label={t('Add product')}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink transition-transform duration-150 active:scale-90"
              >
                <Plus size={22} strokeWidth={2.25} />
              </Link>
            )
          const on = tab.match(path)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={on ? 'page' : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 rounded-full text-[11px] font-medium transition-colors duration-200 ${on ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),inset_0_1px_0_rgb(255_255_255/0.08)]' : 'text-white/55 active:text-white'}`}
            >
              <span className="relative">
                <tab.icon size={20} strokeWidth={on ? 2 : 1.6} className={on ? 'text-moto' : ''} />
                {tab.to === '/app/orders' && !on && <OrdersBadge dot />}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
