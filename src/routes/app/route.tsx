import { Link, Outlet, createFileRoute, redirect, useLocation, useRouter } from '@tanstack/react-router'
import { ArrowUpRight, BookUser, CalendarDays, CalendarPlus, ChartColumn, FilePlus2, FileSpreadsheet, FileText, House, Layers, Package, PenLine, Plus, ReceiptText, Scissors, ShoppingBag, Store, TicketPercent, UserRound, type LucideIcon } from 'lucide-react'
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

/** The diary and the services, for a business that takes bookings (roadmap `v-services`). */
function useBookingTabs() {
  const t = useT()
  return {
    bookings: { to: '/app/bookings', icon: CalendarDays, label: t('Bookings'), match: (p: string) => p.startsWith('/app/bookings') },
    services: { to: '/app/services', icon: Scissors, label: t('Services'), match: (p: string) => p.startsWith('/app/services') || p.startsWith('/app/hours') },
  } satisfies Record<string, Tab>
}

/** Invoices and the clients they go to (roadmap `v-invoices`). */
function useInvoiceTabs() {
  const t = useT()
  return {
    invoices: { to: '/app/invoices', icon: FileText, label: t('Invoices'), match: (p: string) => p.startsWith('/app/invoices') },
    clients: { to: '/app/clients', icon: BookUser, label: t('Clients'), match: (p: string) => p.startsWith('/app/clients') },
  } satisfies Record<string, Tab>
}

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

/** Bookings waiting for the business to confirm (it chose to confirm each one): the same orange count as payments. */
function BookingsBadge({ dot = false }: { dot?: boolean }) {
  const { toConfirm, today } = Route.useLoaderData()
  if (dot) return toConfirm > 0 ? <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-moto ring-2 ring-ink" /> : null
  if (toConfirm > 0)
    return <span className="tnum ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-moto px-1.5 text-12 font-medium text-ink">{toConfirm}</span>
  if (today > 0) return <span className="tnum ml-auto text-13 text-muted">{today}</span>
  return null
}

/** Payment SMS sent from invoice links, waiting for the business: the same orange count as an order's payment. */
function InvoicesBadge({ dot = false }: { dot?: boolean }) {
  const { invoiceChecks } = Route.useLoaderData()
  if (dot) return invoiceChecks > 0 ? <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-moto ring-2 ring-ink" /> : null
  if (invoiceChecks > 0)
    return <span className="tnum ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-moto px-1.5 text-12 font-medium text-ink">{invoiceChecks}</span>
  return null
}

function Sidebar() {
  const t = useT()
  const [home, orders, products, shopTab] = useTabs()
  const canOpen = useCanOpen()
  const { bookings, services } = useBookingTabs()
  const { invoices, clients } = useInvoiceTabs()
  const counts = Route.useLoaderData()
  const { shop: mine } = Route.useRouteContext()
  const books = mine.kind === 'services' || counts.services > 0
  const bills = mine.kind === 'invoices'
  // A business that sells services reads its diary first, one that sends invoices its invoices; a shop that sells
  // products keeps orders first. Every shop can send invoices.
  const tabs = [
    home,
    ...(bills ? [invoices, clients] : []),
    ...(books && mine.kind === 'services' ? [bookings, services] : []),
    orders,
    ...(books && mine.kind !== 'services' ? [bookings] : []),
    ...(!bills ? [invoices] : []),
    { to: '/app/analytics', icon: ChartColumn, label: t('Analytics'), match: (p: string) => p.startsWith('/app/analytics') },
    { ...products, match: (p: string) => p.startsWith('/app/products') },
    ...(mine.kind !== 'services' ? [services] : []),
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
              {tab.to === '/app/bookings' && <BookingsBadge />}
              {tab.to === '/app/invoices' && <InvoicesBadge />}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6 space-y-2">
        {bills && canOpen('/app/invoices/new') && (
          <Link to="/app/invoices/new" className="btn btn-sm h-10 w-full">
            <FilePlus2 size={16} strokeWidth={1.75} /> {t('New invoice')}
          </Link>
        )}
        {books && canOpen('/app/bookings') && (
          <Link to="/app/bookings" search={{ add: 1 }} className={`btn btn-sm h-10 w-full ${bills ? 'btn-ghost' : ''}`}>
            <CalendarPlus size={16} strokeWidth={1.75} /> {t('Add a booking')}
          </Link>
        )}
        {canOpen('/app/products/new') && (
          <Link to="/app/products/new" className={`btn btn-sm h-10 w-full ${(books && canOpen('/app/bookings')) || bills ? 'btn-ghost' : ''}`}>
            <Plus size={16} strokeWidth={2.25} /> {t('Add product')}
          </Link>
        )}
        {canOpen('/app/bags/new') && (
          <Link to="/app/bags/new" className={`btn btn-sm h-10 w-full ${canOpen('/app/products/new') || books ? 'btn-ghost' : ''}`}>
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
  const { bookings, services } = useBookingTabs()
  const counts = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const { invoices, clients } = useInvoiceTabs()
  const serves = shop.kind === 'services'
  const bills = shop.kind === 'invoices'
  const books = serves || counts.services > 0
  // A business that sells services gets its diary and its services in the capsule, one that sends invoices its
  // invoices and clients; orders and products stay one tap away (Home, the + sheet, the sidebar on desktop).
  const left = [home, serves ? bookings : bills ? invoices : orders].filter((x) => canOpen(x.to))
  const right = [serves ? services : bills ? clients : products, shopTab].filter((x) => canOpen(x.to))
  const tab = (x: Tab) => (
    <NavTab
      key={x.to}
      to={x.to}
      icon={x.icon}
      label={x.label}
      active={x.match(path)}
      // A services-first capsule has no Orders tab: payments to check show their dot on Home, which lists them.
      badge={
        x.match(path)
          ? undefined
          : x.to === '/app/orders' || ((serves || bills) && x.to === '/app')
            ? <OrdersBadge dot />
            : x.to === '/app/bookings'
              ? <BookingsBadge dot />
              : x.to === '/app/invoices'
                ? <InvoicesBadge dot />
                : undefined
      }
    />
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
            ...(bills
              ? [
                  { to: '/app/invoices/new', icon: FilePlus2, title: t('New invoice'), sub: t('Bill a client; they pay from the link') },
                  { to: '/app/invoices/new', search: { kind: 'quote' as const }, icon: FileText, title: t('New quote'), sub: t('A price for a client to accept') },
                ]
              : []),
            ...(books
              ? [
                  { to: '/app/bookings', search: { add: 1 as const }, icon: CalendarPlus, title: t('Add a booking'), sub: t('A walk-in, a call or a chat, so that time is taken') },
                ]
              : []),
            ...(serves ? [{ to: '/app/services', search: { add: 1 as const }, icon: Scissors, title: t('Add service'), sub: t('What clients book, how long it takes, the price') }] : []),
            { to: '/app/products/new', icon: Package, title: t('Add product'), sub: t('Photos, price, sizes and stock') },
            // A shop that sells products reaches services from here on phones (the sidebar lists them on desktop).
            ...(!serves ? [{ to: '/app/services', search: { add: 1 as const }, icon: Scissors, title: t('Add service'), sub: t('What clients book, how long it takes, the price') }] : []),
            { to: '/app/bags/new', icon: ShoppingBag, title: t('Send a bag link'), sub: t('Build a bag for a buyer; they add delivery and pay') },
            { to: '/app/orders/new', icon: PenLine, title: t('Record a sale'), sub: t('A sale in person, on a call or in a chat') },
            ...(!bills ? [{ to: '/app/invoices/new', icon: FilePlus2, title: t('New invoice'), sub: t('Bill a client; they pay from the link') }] : []),
            { to: '/app/products/import', icon: FileSpreadsheet, title: t('Import products'), sub: t('Many at once, from Excel or Google Sheets') },
          ].filter((x) => canOpen(x.to)).map((x) => (
            <Link key={x.title} to={x.to} search={'search' in x ? x.search : undefined} onClick={() => setAdding(false)} className="flex items-center gap-4 rounded-16 bg-page px-4 py-4 transition-colors hover:bg-well">
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
