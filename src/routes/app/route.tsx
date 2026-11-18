import { Link, Outlet, createFileRoute, redirect, useLocation, useRouter } from '@tanstack/react-router'
import { ArrowUpRight, ChartColumn, FileSpreadsheet, House, Layers, Package, PenLine, Plus, ReceiptText, ShoppingBag, Store, TicketPercent, UserRound, type LucideIcon } from 'lucide-react'
import { FloatingNav, NavCenter, NavTab } from '#/components/floating-nav'
import { Sheet, ShopAvatar, Wordmark } from '#/components/ui'
import { getNavCounts } from '#/lib/api/merchant'
import { useT } from '#/lib/i18n'
import { InstallRow } from '#/components/phone-app'
import { catchInstallPrompt } from '#/lib/push'
import { useEffect, useState } from 'react'
import { allows, areaOfPath, landing } from '#/lib/staff'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context, location }) => {
    if (!context.session.user) throw redirect({ to: '/login' })
    const shop = context.session.shop
    if (!shop) throw redirect({ to: '/onboard' })
    // An assistant whose shop left Tembo waits on the paused page; one who opens a page their role doesn't cover
    // starts at their own (src/lib/staff.ts). The server checks the same on every request.
    if (shop.paused) throw redirect({ to: '/paused' })
    if (!allows(shop.role, areaOfPath(location.pathname))) throw redirect({ to: landing(shop.role) })
    return { shop, user: context.session.user }
  },
  loader: () => getNavCounts(),
  component: AppLayout,
})

function useTabs() {
  const t = useT()
  const { shop } = Route.useRouteContext()
  const manages = allows(shop.role, 'manage')
  return [
    { to: '/app', icon: House, label: t('Home'), match: (p: string) => p === '/app' || p === '/app/' },
    // Bag links live under Orders.
    { to: '/app/orders', icon: ReceiptText, label: t('Orders'), match: (p: string) => p.startsWith('/app/orders') || p.startsWith('/app/bags') },
    // On phones, collections are reached from Products.
    { to: '/app/products', icon: Package, label: t('Products'), match: (p: string) => p.startsWith('/app/products') || p.startsWith('/app/collections') },
    // On phones, discount codes are reached from Shop settings. An Orders or Products assistant gets their own
    // settings there instead (notifications, language, log out).
    manages
      ? { to: '/app/shop', icon: Store, label: t('Shop'), match: (p: string) => p.startsWith('/app/shop') || p.startsWith('/app/discounts') }
      : { to: '/app/shop', icon: UserRound, label: t('Settings'), match: (p: string) => p.startsWith('/app/shop') },
  ] satisfies Tab[] as Tab[]
}

type Tab = { to: string; icon: LucideIcon; label: string; match: (p: string) => boolean }

/** What this login may open (src/lib/staff.ts): the owner and a Manager everything, an assistant their part. */
function useCanOpen() {
  const { shop } = Route.useRouteContext()
  return (to: string) => allows(shop.role, areaOfPath(to))
}

function AppLayout() {
  const router = useRouter()
  // Chrome offers to install Shopi once per visit: keep the offer for the Install buttons (components/phone-app.tsx).
  useEffect(() => catchInstallPrompt(), [])
  // A notification for a new order or payment refreshes what the open app shows (public/sw.js posts the message).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => e.data?.type === 'shopi-push' && router.invalidate()
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])
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
    return <span className="tnum ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-moto px-1.5 text-12 font-medium text-ink">{toCheck}</span>
  if (toSend > 0) return <span className="tnum ml-auto text-13 text-muted">{toSend}</span>
  return null
}

function Sidebar() {
  const t = useT()
  const [home, orders, products, shopTab] = useTabs()
  const canOpen = useCanOpen()
  const tabs = [
    home,
    orders,
    { to: '/app/analytics', icon: ChartColumn, label: t('Analytics'), match: (p: string) => p.startsWith('/app/analytics') },
    { ...products, match: (p: string) => p.startsWith('/app/products') },
    { to: '/app/collections', icon: Layers, label: t('Collections'), match: (p: string) => p.startsWith('/app/collections') },
    { to: '/app/discounts', icon: TicketPercent, label: t('Discount codes'), match: (p: string) => p.startsWith('/app/discounts') },
    { ...shopTab, match: (p: string) => p.startsWith('/app/shop') },
  ].filter((x) => canOpen(x.to))
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
        className="group mt-6 flex items-center gap-3 rounded-14 bg-page p-2.5 transition-colors hover:bg-well"
      >
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-9 w-9 text-13" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-14 font-semibold">{shop.name}</span>
          <span className="meta block truncate">shopi.tz/{shop.slug}</span>
        </span>
        <ArrowUpRight size={16} strokeWidth={1.75} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>

      <nav className="mt-6 space-y-0.5" aria-label={t('Main')}>
        {tabs.map((tab) => {
          const on = tab.match(path)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={on ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-12 px-3 text-14 font-medium transition-colors ${on ? 'bg-well text-ink' : 'text-ink-2 hover:bg-page hover:text-ink'}`}
            >
              <tab.icon size={18} strokeWidth={on ? 2 : 1.6} className="shrink-0" />
              {tab.label}
              {tab.to === '/app/orders' && <OrdersBadge />}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 space-y-2">
        {canOpen('/app/products/new') && (
          <Link to="/app/products/new" className="btn btn-sm h-10 w-full">
            <Plus size={16} strokeWidth={2.25} /> {t('Add product')}
          </Link>
        )}
        {canOpen('/app/bags/new') && (
          <Link to="/app/bags/new" className={`btn btn-sm h-10 w-full ${canOpen('/app/products/new') ? 'btn-ghost' : ''}`}>
            <ShoppingBag size={16} strokeWidth={1.75} /> {t('Send a bag link')}
          </Link>
        )}
        {canOpen('/app/orders/new') && (
          <Link to="/app/orders/new" className="btn btn-ghost btn-sm h-10 w-full">
            <PenLine size={16} strokeWidth={1.75} /> {t('Record a sale')}
          </Link>
        )}
      </div>

      <div className="mt-auto rounded-14 px-3 py-3 text-13 leading-5 text-muted">
        {t('Share your link in your Instagram bio and WhatsApp status. That is where buyers come from.')}
      </div>
    </aside>
  )
}

/** Phones: the floating black capsule (components/floating-nav.tsx); + adds a product. */
function BottomNav() {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [home, orders, products, shopTab] = useTabs()
  const canOpen = useCanOpen()
  const path = useLocation({ select: (l) => l.pathname })
  // An assistant's capsule holds only their part: Orders or Products, +, Settings.
  const left = [home, orders].filter((x) => canOpen(x.to))
  const right = [products, shopTab].filter((x) => canOpen(x.to))
  const tab = (x: Tab) => (
    <NavTab key={x.to} to={x.to} icon={x.icon} label={x.label} active={x.match(path)} badge={x.to === '/app/orders' && !x.match(path) ? <OrdersBadge dot /> : undefined} />
  )
  return (
    <>
    <FloatingNav label={t('Main')} slots={left.length + right.length === 4 ? 5 : 3}>
      {left.length + right.length === 4 ? (
        <>
          {left.map(tab)}
          <NavCenter onClick={() => setAdding(true)} icon={Plus} label={t('Add')} />
          {right.map(tab)}
        </>
      ) : (
        <>
          {[...left, ...right].slice(0, -1).map(tab)}
          <NavCenter onClick={() => setAdding(true)} icon={Plus} label={t('Add')} />
          {tab(shopTab)}
        </>
      )}
    </FloatingNav>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('Add')}>
        <div className="grid gap-2">
          {[
            { to: '/app/products/new', icon: Package, title: t('Add product'), sub: t('Photos, price, sizes and stock') },
            { to: '/app/bags/new', icon: ShoppingBag, title: t('Send a bag link'), sub: t('Build a bag for a buyer; they add delivery and pay') },
            { to: '/app/orders/new', icon: PenLine, title: t('Record a sale'), sub: t('A sale in person, on a call or in a chat') },
            { to: '/app/products/import', icon: FileSpreadsheet, title: t('Import products'), sub: t('Many at once, from Excel or Google Sheets') },
          ].filter((x) => canOpen(x.to)).map((x) => (
            <Link key={x.to} to={x.to} onClick={() => setAdding(false)} className="flex items-center gap-4 rounded-16 bg-page px-4 py-4 transition-colors hover:bg-well">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <x.icon size={20} strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-15 font-medium">{x.title}</span>
                <span className="block text-13 text-muted">{x.sub}</span>
              </span>
            </Link>
          ))}
          <InstallRow onOpen={() => setAdding(false)} />
        </div>
      </Sheet>
    </>
  )
}
