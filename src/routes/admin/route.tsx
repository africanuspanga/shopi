import { Link, Outlet, createFileRoute, notFound, useRouter, useRouterState } from '@tanstack/react-router'
import { Activity, ArrowUpRight, Banknote, LogOut, Puzzle, Store, Sun, TrendingUp, type LucideIcon } from 'lucide-react'
import { Wordmark } from '#/components/ui'
import { ADMIN_RANGES, asAdminDays, asAdminTab, type AdminDays, type AdminTab } from '#/lib/admin'
import { logout } from '#/lib/api/session'
import { useT } from '#/lib/i18n'

/** The owner dashboard's frame: only for users with is_admin; to everyone else it is not there. */
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.session.user?.is_admin) throw notFound()
    return { user: context.session.user }
  },
  head: () => ({ meta: [{ title: 'Owner · Shopi' }, { name: 'robots', content: 'noindex' }] }),
  component: AdminLayout,
})

export function useAdminTabs(): { groups: { title: string; tabs: { id: AdminTab; label: string; icon: LucideIcon }[] }[]; label: (id: AdminTab) => string } {
  const t = useT()
  const groups: { title: string; tabs: { id: AdminTab; label: string; icon: LucideIcon }[] }[] = [
    { title: t('Now'), tabs: [{ id: 'today', label: t('Today'), icon: Sun }] },
    {
      title: t('Business'),
      tabs: [
        { id: 'shops', label: t('Shops'), icon: Store },
        { id: 'money', label: t('Money'), icon: Banknote },
        { id: 'growth', label: t('Growth'), icon: TrendingUp },
      ],
    },
    {
      title: t('Product'),
      tabs: [
        { id: 'use', label: t('Product use'), icon: Puzzle },
        { id: 'health', label: t('Health'), icon: Activity },
      ],
    },
  ]
  return { groups, label: (id) => groups.flatMap((g) => g.tabs).find((x) => x.id === id)?.label ?? '' }
}

/** Where the frame is: the section and range in the address. A shop's page belongs to Shops. */
export function useAdminPlace(): { tab: AdminTab; days: AdminDays; onShop: boolean } {
  const { pathname, search } = useRouterState({ select: (s) => s.location })
  const q = search as Record<string, unknown>
  const onShop = pathname.startsWith('/admin/shops')
  return { tab: onShop ? 'shops' : asAdminTab(q.tab), days: asAdminDays(q.days), onShop }
}

export function Ranges({ className = '', wide = false }: { className?: string; wide?: boolean }) {
  const t = useT()
  const { days } = useAdminPlace()
  return (
    <div className={`flex gap-2 ${className}`} role="group" aria-label={t('Range')}>
      {ADMIN_RANGES.map((r) => (
        <Link key={r} to="." search={(s) => ({ ...s, days: r })} aria-pressed={days === r} data-active={days === r} className={`chip ${wide ? 'h-10 flex-1 justify-center' : 'h-9'}`}>
          {t('{n} days', { n: r })}
        </Link>
      ))}
    </div>
  )
}

function AdminLayout() {
  const t = useT()
  const router = useRouter()
  const { user } = Route.useRouteContext()
  const { groups } = useAdminTabs()
  const { tab, days } = useAdminPlace()
  const out = async () => {
    await logout()
    await router.invalidate()
    router.navigate({ to: '/login' })
  }

  return (
    <div className="min-h-dvh bg-page">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-card px-3 pt-6 pb-4 lg:flex">
        <Link to="/admin" className="flex h-9 items-center gap-2.5 px-3" aria-label="Shopi">
          <Wordmark className="h-[22px] w-auto" />
          <span className="meta mt-1">{t('Owner')}</span>
        </Link>
        <nav className="mt-6 flex-1 space-y-5 overflow-y-auto" aria-label={t('Sections')}>
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-3 pb-1.5 text-12 text-muted">{g.title}</p>
              <div className="space-y-0.5">
                {g.tabs.map((x) => {
                  const on = x.id === tab
                  return (
                    <Link
                      key={x.id}
                      to="/admin"
                      search={{ tab: x.id === 'today' ? undefined : x.id, days: days === 30 ? undefined : days }}
                      aria-current={on ? 'page' : undefined}
                      className={`flex h-10 items-center gap-3 rounded-12 px-3 text-14 font-medium transition-colors ${on ? 'bg-well text-ink' : 'text-ink-2 hover:bg-page hover:text-ink'}`}
                    >
                      <x.icon size={18} strokeWidth={on ? 2 : 1.6} className="shrink-0" />
                      {x.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="rounded-16 bg-ink p-4 text-white">
          <p className="truncate text-14 font-semibold">{user.name}</p>
          <p className="mt-0.5 text-13 text-white/60">{t('You see every shop on Shopi.')}</p>
          <Link to="/app" className="btn btn-sm mt-3.5 w-full bg-white text-ink">
            {t('Seller app')} <ArrowUpRight size={14} strokeWidth={1.75} />
          </Link>
          <button type="button" className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-full text-13 font-medium text-white/75 transition-colors hover:text-white" onClick={out}>
            <LogOut size={14} strokeWidth={1.75} /> {t('Log out')}
          </button>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-16 md:px-8 lg:px-10 lg:pt-8">
          {/* Phones and tablets: the header, then the sections as chips that stay in reach. */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <Link to="/admin" aria-label="Shopi">
              <Wordmark className="h-[22px] w-auto" />
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/app" className="btn btn-ghost btn-sm">
                {t('Seller app')}
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={out}>
                <LogOut size={16} strokeWidth={1.75} /> {t('Log out')}
              </button>
            </div>
          </div>
          <nav
            className="hide-scroll sticky top-0 z-20 -mx-4 mt-3 flex gap-2 overflow-x-auto bg-page px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2.5 md:-mx-8 md:px-8 lg:hidden"
            aria-label={t('Sections')}
          >
            {groups
              .flatMap((g) => g.tabs)
              .map((x) => (
                <Link
                  key={x.id}
                  to="/admin"
                  search={{ tab: x.id === 'today' ? undefined : x.id, days: days === 30 ? undefined : days }}
                  aria-current={x.id === tab ? 'page' : undefined}
                  data-active={x.id === tab}
                  className="chip h-10 shrink-0"
                >
                  {x.label}
                </Link>
              ))}
          </nav>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
