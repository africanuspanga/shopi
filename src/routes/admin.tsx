import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { ArrowUpRight, ChevronDown, LogOut, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { WhatsAppIcon } from '#/components/brand-icons'
import { Delta, Money, Page, Wordmark } from '#/components/ui'
import { ADMIN_RANGES, getOwnerDashboard, type AdminDays, type AdminShop, type OwnerDashboard } from '#/lib/api/admin'
import { logout } from '#/lib/api/session'
import { CATEGORIES, localPhone, timeAgo, waLink } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'

/** The owner dashboard: every shop and seller across Shopi. Only for users with is_admin; to everyone else it is not there. */
export const Route = createFileRoute('/admin')({
  validateSearch: (s: Record<string, unknown>): { days?: AdminDays } => ({
    days: (ADMIN_RANGES as readonly number[]).includes(Number(s.days)) ? (Number(s.days) as AdminDays) : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (!context.session.user?.is_admin) throw notFound()
  },
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ deps }) => getOwnerDashboard({ data: { days: deps.days } }),
  head: () => ({ meta: [{ title: 'Owner · Shopi' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerPage,
})

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

function OwnerPage() {
  const t = useT()
  const router = useRouter()
  const d = Route.useLoaderData()
  const vs = t('vs the {n} days before', { n: d.days })
  const aov = d.now.sold ? d.now.sales / d.now.sold : 0
  const aovBefore = d.before.sold ? d.before.sales / d.before.sold : 0

  return (
    <Page wide>
      <div className="mb-5 flex items-center justify-between gap-3 md:mb-8">
        <Link to="/admin" aria-label="Shopi">
          <Wordmark className="h-[22px] w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/app" className="btn btn-ghost btn-sm">
            {t('Seller app')}
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await logout()
              await router.invalidate()
              router.navigate({ to: '/login' })
            }}
          >
            <LogOut size={15} strokeWidth={1.6} /> {t('Log out')}
          </button>
        </div>
      </div>

      <header className="flex items-end gap-6 md:mb-8">
        <div className="min-w-0 flex-1">
          <h1 className="title text-[24px] md:text-[30px]">{t('Owner dashboard')}</h1>
          <p className="mt-1 text-[14px] leading-5 text-pretty text-muted">{t('Every shop on Shopi. Last {n} days, in Tanzania time; demo shops are not counted.', { n: d.days })}</p>
        </div>
        <Ranges days={d.days} className="hidden shrink-0 md:flex" />
      </header>
      {/* Phones: the range stays under the thumb's reach while the numbers scroll. */}
      <div className="sticky top-0 z-20 -mx-4 mb-2 bg-page px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 md:hidden">
        <Ranges days={d.days} wide />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label={t('Sign-ups')} value={n(d.now.signups)} delta={<Delta now={d.now.signups} before={d.before.signups} label={vs} />} />
        <Kpi label={t('New shops')} value={n(d.now.shops)} delta={<Delta now={d.now.shops} before={d.before.shops} label={vs} />} />
        <Kpi label={t('Active shops')} value={n(d.now.active)} delta={<Delta now={d.now.active} before={d.before.active} label={vs} />} />
        <Kpi label={t('Orders')} value={n(d.now.orders)} delta={<Delta now={d.now.orders} before={d.before.orders} label={vs} />} />
        <Kpi label={t('Sales')} value={<KpiMoney value={d.now.sales} />} delta={<Delta now={d.now.sales} before={d.before.sales} label={vs} />} />
        <Kpi label={t('Average order')} value={<KpiMoney value={aov} />} delta={<Delta now={aov} before={aovBefore} label={vs} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Plans d={d} className="lg:col-span-5" />
        <Payments d={d} className="lg:col-span-4" />
        <PaySplit d={d} className="lg:col-span-3" />
        <Funnel d={d} className="lg:col-span-12" />
        <Shops shops={d.shops} days={d.days} className="lg:col-span-12" />
        <Sources d={d} className="lg:col-span-4" />
        <Categories d={d} className="lg:col-span-4" />
        <NoShop d={d} className="lg:col-span-4" />
      </div>
    </Page>
  )
}

function Ranges({ days, className = '', wide = false }: { days: number; className?: string; wide?: boolean }) {
  const t = useT()
  return (
    <div className={`flex gap-2 ${className}`} role="tablist" aria-label={t('Range')}>
      {ADMIN_RANGES.map((r) => (
        <Link key={r} to="/admin" search={{ days: r }} role="tab" aria-selected={days === r} data-active={days === r} className={`chip ${wide ? 'h-11 flex-1 justify-center' : 'h-9'}`}>
          {t('{n} days', { n: r })}
        </Link>
      ))}
    </div>
  )
}

/** A number card's money: every digit where the card is wide, "TSh 10.99M" from a million up on a phone's half-width card. */
function KpiMoney({ value }: { value: number }) {
  return (
    <>
      <Money value={value} short cur="text-[0.62em] text-muted" className="md:hidden" />
      <Money value={value} cur="text-[0.62em] text-muted" className="hidden md:inline" />
    </>
  )
}

function Kpi({ label, value, delta }: { label: string; value: ReactNode; delta: ReactNode }) {
  return (
    <div className="card min-w-0 p-4 md:p-5">
      <span className="block text-[13px] text-muted">{label}</span>
      <span className="tnum mt-1.5 block text-[20px] font-semibold tracking-[-0.02em] whitespace-nowrap md:text-[22px] lg:text-[26px]">{value}</span>
      <span className="mt-1.5 block leading-[18px]">{delta}</span>
    </div>
  )
}

function Card({ title, sub, children, className = '' }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-5 md:p-6 ${className}`}>
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-5 text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 text-[14px] ${strong ? 'border-t border-line pt-3.5 font-medium' : ''}`}>
      <span className={strong ? '' : 'text-ink-2'}>{label}</span>
      <span className="tnum shrink-0 text-right">{value}</span>
    </div>
  )
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] bg-page px-4 py-6 text-center text-[14px] text-muted">{children}</p>
}

function Plans({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  return (
    <Card title={t('Plans')} sub={t('Right now. Sellers can’t pay in Shopi yet, so no shop pauses.')} className={className}>
      <Row label={t('On a free trial')} value={n(d.plans.trial)} />
      <Row label={t('Trial ends within 7 days')} value={n(d.plans.endingSoon)} />
      <Row label={t('Trial or plan ended')} value={n(d.plans.ended)} />
      <Row label="Twiga" value={n(d.plans.twiga)} />
      <Row label="Tembo" value={n(d.plans.tembo)} />
      <Row label={t('Yearly income from paid plans')} value={<Money value={d.plans.yearly} cur="text-[0.8em] text-muted" />} strong />
    </Card>
  )
}

function Payments({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  const late = d.waiting.h48 > 0
  return (
    <Card title={t('Payments to check')} sub={t('Buyers sent proof and the seller hasn’t answered yet.')} className={className}>
      <Row label={t('Waiting now')} value={n(d.waiting.n)} />
      <Row label={t('Over 1 hour')} value={n(d.waiting.h1)} />
      <Row label={t('Over 6 hours')} value={n(d.waiting.h6)} />
      <Row
        label={
          <span className="flex items-center gap-2">
            {late && <span className="signal" />}
            {t('Over 48 hours')}
          </span>
        }
        value={n(d.waiting.h48)}
      />
      <Row label={t('Proofs with a low amount or another name, last {n} days', { n: d.days })} value={n(d.problems)} strong />
    </Card>
  )
}

function PaySplit({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  const online = d.now.lipa + d.now.cod
  return (
    <Card title={t('How buyers pay')} sub={t('Online orders, last {n} days', { n: d.days })} className={className}>
      {online ? (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-raised">
            <span className="bg-ink" style={{ width: `${share(d.now.lipa, online)}%` }} />
          </div>
          <Row label="Lipa Namba" value={`${share(d.now.lipa, online)}%`} />
          <Row label={t('Cash on delivery')} value={`${share(d.now.cod, online)}%`} />
        </>
      ) : (
        <Nothing>{t('No online orders yet')}</Nothing>
      )}
      <Row label={t('Cancelled')} value={n(d.now.cancelled)} strong />
      <Row label={t('Recorded by hand')} value={n(d.now.manual)} />
    </Card>
  )
}

function Funnel({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  const f = d.funnel
  const steps = [
    { label: t('Signed up'), n: f.signups },
    { label: t('Opened a shop'), n: f.shops },
    { label: t('Added a product'), n: f.product },
    { label: t('First visit'), n: f.visit },
    { label: t('First order'), n: f.first_order },
    { label: t('Fifth order'), n: f.fifth_order },
  ]
  return (
    <Card title={t('From sign-up to fifth order')} sub={t('Every seller so far, and how far they got.')} className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((s, i) => (
          <div key={s.label} className="rounded-[14px] bg-page p-4">
            <p className="text-[13px] text-muted">{s.label}</p>
            <p className="tnum mt-1 text-[22px] font-semibold tracking-[-0.02em]">{n(s.n)}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
              <span className="block h-full bg-ink" style={{ width: `${Math.min(100, share(s.n, f.signups))}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-muted">{i === 0 ? t('Everyone') : t('{n}% of sign-ups', { n: share(s.n, f.signups) })}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function usePlanText() {
  const t = useT()
  const lang = useLang()
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Dar_es_Salaam' })
  return (s: AdminShop) => {
    const p = s.plan
    if (p.kind === 'demo') return t('Demo')
    if (p.kind === 'trial') return t(p.daysLeft === 1 ? 'Trial, {n} day left' : 'Trial, {n} days left', { n: p.daysLeft })
    if (p.kind === 'paid') return t('{plan} until {date}', { plan: p.plan === 'twiga' ? 'Twiga' : 'Tembo', date: date(p.until) })
    return t('Ended {date}', { date: date(p.until) })
  }
}

function Shops({ shops, days, className }: { shops: AdminShop[]; days: number; className?: string }) {
  const t = useT()
  const lang = useLang()
  const planText = usePlanText()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const shown = q ? shops.filter((s) => `${s.name} ${s.slug} ${s.owner} ${s.phone}`.toLowerCase().includes(q)) : shops
  const opened = (ms: number) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Dar_es_Salaam' })

  return (
    <Card title={t('Shops ({n})', { n: shops.length })} sub={t('Orders, sales and visits for the last {n} days. Most sales first.', { n: days })} className={className}>
      <label className="input mb-4 flex items-center gap-2.5 md:max-w-[360px]">
        <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
        <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t('Search shop, seller or phone')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {!shown.length && <Nothing>{t('No shop matches.')}</Nothing>}

      {/* Phones: two lines per shop; a tap opens the rest of the table's columns. */}
      <ul className="divide-y divide-line md:hidden">
        {shown.map((s) => {
          const isOpen = open === s.id
          return (
            <li key={s.id} className={s.status === 'demo' ? 'text-muted' : ''}>
              <button type="button" className="block w-full py-3.5 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-medium">{s.name}</span>
                  <Money value={s.sales} className="shrink-0 text-[15px]" cur="text-[0.8em] text-muted" />
                </span>
                <span className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                  <span className="min-w-0 truncate">
                    {planText(s)} · {t(s.orders === 1 ? '{n} order' : '{n} orders', { n: n(s.orders) })}
                  </span>
                  <span className="meta ml-auto shrink-0">{s.last_order ? timeAgo(s.last_order, lang) : ''}</span>
                  <ChevronDown size={16} strokeWidth={1.6} className={`shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isOpen && (
                <div className="mb-3.5 rounded-[14px] bg-page px-4 py-1.5 text-ink">
                  <Row label={t('Seller')} value={<span className="[overflow-wrap:anywhere]">{s.owner}</span>} />
                  <Row label={t('Set up')} value={`${s.setup}/4`} />
                  <Row label={t('Products')} value={n(s.products)} />
                  <Row label={t('Visits')} value={n(s.visits)} />
                  <Row label={t('Last order')} value={s.last_order ? timeAgo(s.last_order, lang) : '—'} />
                  <p className="meta py-2 [overflow-wrap:anywhere]">
                    shopi.tz/{s.slug} · {t('opened {date}', { date: opened(s.created_at) })}
                  </p>
                  <div className="flex gap-2 pt-1 pb-2.5">
                    <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm flex-1">
                      {t('View shop')} <ArrowUpRight size={14} strokeWidth={1.6} />
                    </a>
                    <a href={waLink(s.phone, '')} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm flex-1" aria-label={t('Message {name} on WhatsApp', { name: s.owner })}>
                      <WhatsAppIcon size={15} /> {localPhone(s.phone)}
                    </a>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Desktop: a table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-[13px] text-muted">
              <th className="py-2.5 pr-4 font-normal">{t('Shop')}</th>
              <th className="py-2.5 pr-4 font-normal">{t('Seller')}</th>
              <th className="py-2.5 pr-4 font-normal">{t('Plan')}</th>
              <th className="py-2.5 pr-4 text-right font-normal">{t('Set up')}</th>
              <th className="py-2.5 pr-4 text-right font-normal">{t('Products')}</th>
              <th className="py-2.5 pr-4 text-right font-normal">{t('Visits')}</th>
              <th className="py-2.5 pr-4 text-right font-normal">{t('Orders')}</th>
              <th className="py-2.5 pr-4 text-right font-normal">{t('Sales')}</th>
              <th className="py-2.5 text-right font-normal">{t('Last order')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((s) => (
              <tr key={s.id} className={s.status === 'demo' ? 'text-muted' : ''}>
                <td className="max-w-[240px] py-3 pr-4">
                  <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="group flex items-center gap-1.5 font-medium">
                    <span className="truncate">{s.name}</span>
                    <ArrowUpRight size={14} strokeWidth={1.6} className="shrink-0 text-muted transition-colors group-hover:text-ink" />
                  </a>
                  <span className="meta block truncate">
                    shopi.tz/{s.slug} · {t('opened {date}', { date: opened(s.created_at) })}
                  </span>
                </td>
                <td className="max-w-[200px] py-3 pr-4">
                  <span className="block truncate">{s.owner}</span>
                  <a href={waLink(s.phone, '')} target="_blank" rel="noreferrer" className="meta flex items-center gap-1.5 hover:text-ink">
                    <WhatsAppIcon size={13} /> {localPhone(s.phone)}
                  </a>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">{planText(s)}</td>
                <td className="tnum py-3 pr-4 text-right">{s.setup}/4</td>
                <td className="tnum py-3 pr-4 text-right">{n(s.products)}</td>
                <td className="tnum py-3 pr-4 text-right">{n(s.visits)}</td>
                <td className="tnum py-3 pr-4 text-right">{n(s.orders)}</td>
                <td className="py-3 pr-4 text-right">
                  <Money value={s.sales} cur="text-[0.8em] text-muted" />
                </td>
                <td className="py-3 text-right whitespace-nowrap text-ink-2">{s.last_order ? timeAgo(s.last_order, lang) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Sources({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  const label: Record<string, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    google: 'Google',
    direct: t('Direct'),
    manual: t('Recorded by hand'),
    bag_link: t('Bag links'),
    unknown: t('Before tracking'),
  }
  const total = d.sources.reduce((s, r) => s + r.orders, 0)
  return (
    <Card title={t('Where orders come from')} sub={t('Last {n} days, every shop', { n: d.days })} className={className}>
      {d.sources.length ? (
        d.sources.map((r) => <Row key={r.source} label={label[r.source] ?? r.source} value={`${n(r.orders)} · ${share(r.orders, total)}%`} />)
      ) : (
        <Nothing>{t('No orders yet')}</Nothing>
      )}
    </Card>
  )
}

function Categories({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  const name = (id: string) => t(CATEGORIES.find((c) => c.id === id)?.label ?? id)
  return (
    <Card title={t('What sells')} sub={t('Sales by shop category, last {n} days', { n: d.days })} className={className}>
      {d.categories.length ? (
        d.categories.map((r) => <Row key={r.category} label={name(r.category)} value={<Money value={r.sales} cur="text-[0.8em] text-muted" />} />)
      ) : (
        <Nothing>{t('No orders yet')}</Nothing>
      )}
    </Card>
  )
}

function NoShop({ d, className }: { d: OwnerDashboard; className?: string }) {
  const t = useT()
  const lang = useLang()
  return (
    <Card title={t('Signed up, no shop yet')} sub={t('Message them on WhatsApp to help them finish.')} className={className}>
      {d.noShop.length ? (
        <ul className="divide-y divide-line">
          {d.noShop.map((u) => (
            <li key={u.phone} className="flex items-center gap-3 py-2.5 text-[14px]">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{u.name}</p>
                <p className="meta">{timeAgo(u.created_at, lang)}</p>
              </div>
              <a
                href={waLink(u.phone, t('Hi {name}, this is the Shopi team. Can we help you open your shop?', { name: u.name }))}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm shrink-0"
              >
                <WhatsAppIcon size={15} /> {localPhone(u.phone)}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Nothing>{t('Everyone who signed up has a shop.')}</Nothing>
      )}
    </Card>
  )
}
