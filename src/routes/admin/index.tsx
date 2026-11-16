import { Link, createFileRoute } from '@tanstack/react-router'
import { Bell, Download, Globe, Palette, Search, Smartphone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BarList, Card, Change, DayChart, Gauge, Kpi, KpiMoney, Nothing, ProductTable, Row, WeekdayBars, num, pct, useDates } from '#/components/admin'
import { WhatsAppIcon } from '#/components/brand-icons'
import { Money, ShopAvatar, StatusPill } from '#/components/ui'
import { SHOP_FILTERS, asAdminDays, asAdminTab, shopMatches, type AdminDays, type AdminShop, type AdminTab, type ShopFilter } from '#/lib/admin'
import { getOwnerDashboard, type OwnerSection } from '#/lib/api/admin'
import { CATEGORIES, localPhone, timeAgo, waLink, type OrderStatus } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { Ranges, useAdminTabs } from './route'

/** The owner dashboard's sections: /admin?tab=today|shops|money|growth|use|health&days=7|30|90. */
export const Route = createFileRoute('/admin/')({
  validateSearch: (s: Record<string, unknown>): { tab?: AdminTab; days?: AdminDays } => ({
    tab: s.tab === undefined || asAdminTab(s.tab) === 'today' ? undefined : asAdminTab(s.tab),
    days: s.days === undefined || asAdminDays(s.days) === 30 ? undefined : asAdminDays(s.days),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'today', days: search.days ?? 30 }),
  loader: ({ deps }) => getOwnerDashboard({ data: deps }),
  component: OwnerPage,
})

function OwnerPage() {
  const t = useT()
  const d = Route.useLoaderData()
  const { label } = useAdminTabs()
  const subs: Record<AdminTab, string> = {
    today: t('What is happening across Shopi, and what needs a look.'),
    shops: t('Every shop and its seller. Open one for its own page.'),
    money: t('Sales through the shops, how buyers pay, and plans.'),
    growth: t('New sellers, how far they get, and where buyers come from.'),
    use: t('Which tools shops use, and what sells.'),
    health: t('Payments waiting, the bot check, backups and storage.'),
  }
  return (
    <>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mt-0">
        <div className="min-w-0">
          <h1 className="title text-[24px] md:text-[30px]">{label(d.tab)}</h1>
          <p className="mt-1 text-[14px] leading-5 text-pretty text-muted">
            {subs[d.tab]} {d.tab !== 'health' && t('Tanzania time; demo shops are not counted.')}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <Ranges wide className="flex-1 md:hidden" />
          <Ranges className="hidden md:flex" />
          {d.tab === 'shops' && (
            <a href={`/api/admin-export?days=${d.days}`} className="btn btn-sm h-10 shrink-0 md:h-9" download>
              <Download size={15} strokeWidth={1.8} /> {t('Export')}
            </a>
          )}
        </div>
      </header>
      <div className="mt-5 md:mt-7">
        {d.tab === 'today' && <Today d={d} />}
        {d.tab === 'shops' && <Shops d={d} />}
        {d.tab === 'money' && <MoneyTab d={d} />}
        {d.tab === 'growth' && <Growth d={d} />}
        {d.tab === 'use' && <Use d={d} />}
        {d.tab === 'health' && <Health d={d} />}
      </div>
    </>
  )
}

const useVs = (days: number) => useT()('vs the {n} days before', { n: days })
const Grid = ({ children }: { children: ReactNode }) => <div className="mt-3 grid gap-3 md:mt-4 md:gap-4 lg:grid-cols-12">{children}</div>
const Kpis = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">{children}</div>

function useSourceLabel() {
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
  return (k: string) => label[k] ?? k
}

function PaymentsToCheck({ w, problems, days, className }: { w: { n: number; h1: number; h6: number; h48: number }; problems?: number; days: number; className?: string }) {
  const t = useT()
  return (
    <Card title={t('Payments to check')} sub={t('Buyers sent proof and the seller hasn’t answered yet.')} className={className}>
      <Row label={t('Waiting now')} value={num(w.n)} />
      <Row label={t('Over 1 hour')} value={num(w.h1)} />
      <Row label={t('Over 6 hours')} value={num(w.h6)} />
      <Row
        label={
          <span className="flex items-center gap-2">
            {w.h48 > 0 && <span className="signal" />}
            {t('Over 48 hours')}
          </span>
        }
        value={num(w.h48)}
      />
      {problems !== undefined && <Row label={t('Proofs with a low amount or another name, last {n} days', { n: days })} value={num(problems)} strong />}
    </Card>
  )
}

/* ------------------------------------------------------------------ Today */

function Today({ d }: { d: OwnerSection<'today'> }) {
  const t = useT()
  const lang = useLang()
  const vs = useVs(d.days)
  const lastWeek = t('vs this time last week')
  return (
    <>
      <Kpis>
        <Kpi label={t('Sales')} value={<KpiMoney value={d.now.sales} />} now={d.now.sales} before={d.before.sales} vs={vs} />
        <Kpi label={t('Orders')} value={num(d.now.orders)} now={d.now.orders} before={d.before.orders} vs={vs} />
        <Kpi label={t('Visits to shops')} value={num(d.now.visits)} now={d.now.visits} before={d.before.visits} vs={vs} />
        <Kpi label={t('Sign-ups')} value={num(d.now.signups)} now={d.now.signups} before={d.before.signups} vs={vs} />
      </Kpis>
      <Grid>
        <section className="card flex min-w-0 flex-col p-5 md:p-6 lg:col-span-8">
          <DayChart points={d.sales} money total={d.now.sales} chip={<Change now={d.now.sales} before={d.before.sales} />} caption={t('Sales, last {n} days', { n: d.days })} />
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-[16px] bg-page p-4 sm:grid-cols-4 lg:mt-auto">
            <Mini label={t('Orders today')} value={num(d.day.orders)} extra={<Change now={d.day.orders} before={d.day.orders_before} />} note={lastWeek} />
            <Mini label={t('Sales today')} value={<Money value={d.day.sales} short cur="text-[0.7em] text-muted" />} extra={<Change now={d.day.sales} before={d.day.sales_before} />} note={lastWeek} />
            <Mini label={t('New shops today')} value={num(d.day.shops)} note={t(d.day.signups === 1 ? '{n} sign-up' : '{n} sign-ups', { n: num(d.day.signups) })} />
            <Mini label={t('On shops now')} value={num(d.day.live)} extra={d.day.live > 0 ? <span className="signal" /> : null} note={t('visitors, last 30 minutes')} />
          </div>
        </section>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:col-span-4 lg:grid-cols-1">
          <Card title={t('Busiest day')} sub={t('Online orders by weekday, last {n} days', { n: d.days })}>
            <WeekdayBars counts={d.weekdays} />
          </Card>
          <Card title={t('Buyers who came back')} sub={t('Buyers in the last {n} days who ordered from the same shop before', { n: d.days })}>
            {d.repeat.buyers ? <Gauge value={pct(d.repeat.again, d.repeat.buyers)} label={t('{a} of {b} buyers', { a: num(d.repeat.again), b: num(d.repeat.buyers) })} /> : <Nothing>{t('No orders yet')}</Nothing>}
          </Card>
        </div>
        <Card title={t('Best sellers')} sub={t('Across every shop, last {n} days', { n: d.days })} className="lg:col-span-8 lg:self-start">
          <ProductTable rows={d.best} empty={t('No orders yet')} />
        </Card>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:col-span-4 lg:grid-cols-1 lg:content-start">
          <PaymentsToCheck w={d.waiting} days={d.days} />
          <Card title={t('Latest orders')} sub={t('Across every shop')}>
            {d.latest.length ? (
              <ul className="divide-y divide-line">
                {d.latest.map((o) => (
                  <li key={o.code} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="min-w-0 truncate font-medium">{o.shop}</span>
                      <Money value={o.total} className="shrink-0" cur="text-[0.8em] text-muted" />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill status={o.status as OrderStatus} />
                      <span className="meta ml-auto shrink-0">{timeAgo(o.created_at, lang)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Nothing>{t('No orders yet')}</Nothing>
            )}
          </Card>
        </div>
      </Grid>
    </>
  )
}

function Mini({ label, value, extra, note }: { label: string; value: ReactNode; extra?: ReactNode; note: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tnum text-[20px] font-semibold tracking-[-0.02em] whitespace-nowrap">{value}</span>
        {extra}
      </p>
      <p className="mt-0.5 text-[12px] leading-4 text-muted">{note}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ Shops */

export function usePlanText() {
  const t = useT()
  const { date } = useDates()
  return (s: AdminShop) => {
    const p = s.plan
    if (p.kind === 'demo') return t('Demo')
    if (p.kind === 'trial') return t(p.daysLeft === 1 ? 'Trial, {n} day left' : 'Trial, {n} days left', { n: p.daysLeft })
    if (p.kind === 'paid') return t('{plan} until {date}', { plan: p.plan === 'twiga' ? 'Twiga' : 'Tembo', date: date(p.until) })
    return t('Ended {date}', { date: date(p.until) })
  }
}

function Shops({ d }: { d: OwnerSection<'shops'> }) {
  const t = useT()
  const lang = useLang()
  const planText = usePlanText()
  const { date } = useDates()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ShopFilter>('all')
  const q = query.trim().toLowerCase()
  const names: Record<ShopFilter, string> = { all: t('All'), ending: t('Trial ending'), none: t('No orders yet'), quiet: t('Quiet 7 days'), paid: t('Paying') }
  const inFilter = (f: ShopFilter) => d.shops.filter((s) => shopMatches(s, f, d.at))
  const shown = inFilter(filter).filter((s) => !q || `${s.name} ${s.slug} ${s.owner} ${s.phone} ${s.domain ?? ''}`.toLowerCase().includes(q))
  const flags = (s: AdminShop) => (
    <span className="flex items-center gap-1.5 text-muted">
      {s.app && <Smartphone size={14} strokeWidth={1.6} aria-label={t('App on the Home Screen')} />}
      {s.notifications && <Bell size={14} strokeWidth={1.6} aria-label={t('Notifications on')} />}
      {s.look && <Palette size={14} strokeWidth={1.6} aria-label={t('Own look')} />}
      {s.domain && <Globe size={14} strokeWidth={1.6} aria-label={t('Own domain')} />}
    </span>
  )

  return (
    <>
      <section className="card min-w-0 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="hide-scroll -mx-5 flex min-w-0 gap-2 overflow-x-auto px-5 md:mx-0 md:px-0" role="group" aria-label={t('Filter')}>
            {SHOP_FILTERS.map((f) => (
              <button key={f} type="button" className="chip h-9 shrink-0" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {names[f]} <span className="tnum ml-1.5 opacity-60">{inFilter(f).length}</span>
              </button>
            ))}
          </div>
          <label className="input flex w-full items-center gap-2.5 md:ml-auto md:w-[300px]">
            <Search size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t('Search shop, seller or phone')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-[13px] text-muted">{t('Orders, sales and visits for the last {n} days. Most sales first.', { n: d.days })}</p>
        {!shown.length && <div className="mt-4"><Nothing>{t('No shop matches.')}</Nothing></div>}

        {/* Phones: two lines per shop; a tap opens its page. */}
        <ul className="mt-2 divide-y divide-line md:hidden">
          {shown.map((s) => (
            <li key={s.id} className={s.status === 'demo' ? 'text-muted' : ''}>
              <Link to="/admin/shops/$id" params={{ id: s.id }} search={{ days: d.days === 30 ? undefined : d.days }} className="flex items-center gap-3 py-3.5">
                <ShopAvatar name={s.name} logo={s.logo_key} className="h-9 w-9 text-[12px]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-medium">{s.name}</span>
                    <Money value={s.sales} className="shrink-0 text-[15px]" cur="text-[0.8em] text-muted" />
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
                    <span className="min-w-0 truncate">
                      {planText(s)} · {t(s.orders === 1 ? '{n} order' : '{n} orders', { n: num(s.orders) })}
                    </span>
                    <span className="meta ml-auto shrink-0">{s.last_order ? timeAgo(s.last_order, lang) : ''}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop: a table. */}
        <div className="mt-2 hidden overflow-x-auto md:block">
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
                  <td className="max-w-[320px] py-3 pr-4">
                    <Link to="/admin/shops/$id" params={{ id: s.id }} search={{ days: d.days === 30 ? undefined : d.days }} className="flex items-center gap-3">
                      <ShopAvatar name={s.name} logo={s.logo_key} className="h-9 w-9 text-[12px]" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="truncate hover:underline">{s.name}</span>
                          {flags(s)}
                        </span>
                        <span className="meta block truncate">
                          {s.domain ?? `shopi.tz/${s.slug}`} · {t('opened {date}', { date: date(s.created_at) })}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[190px] py-3 pr-4">
                    <span className="block truncate">{s.owner}</span>
                    <span className="meta block truncate">{s.last_login ? t('logged in {when}', { when: timeAgo(s.last_login, lang) }) : localPhone(s.phone)}</span>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{planText(s)}</td>
                  <td className="tnum py-3 pr-4 text-right">{s.setup}/4</td>
                  <td className="tnum py-3 pr-4 text-right">{num(s.products)}</td>
                  <td className="tnum py-3 pr-4 text-right">{num(s.visits)}</td>
                  <td className="tnum py-3 pr-4 text-right">{num(s.orders)}</td>
                  <td className="py-3 pr-4 text-right">
                    <Money value={s.sales} cur="text-[0.8em] text-muted" />
                  </td>
                  <td className="py-3 text-right whitespace-nowrap text-ink-2">{s.last_order ? timeAgo(s.last_order, lang) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Grid>
        <Card title={t('Signed up, no shop yet')} sub={t('Message them on WhatsApp to help them finish.')} className="lg:col-span-6">
          {d.noShop.length ? (
            <ul className="divide-y divide-line">
              {d.noShop.map((u) => (
                <li key={u.phone} className="flex items-center gap-3 py-2.5 text-[14px]">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{u.name}</p>
                    <p className="meta">{timeAgo(u.created_at, lang)}</p>
                  </div>
                  <a href={waLink(u.phone, t('Hi {name}, this is the Shopi team. Can we help you open your shop?', { name: u.name }))} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm shrink-0">
                    <WhatsAppIcon size={15} /> {localPhone(u.phone)}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <Nothing>{t('Everyone who signed up has a shop.')}</Nothing>
          )}
        </Card>
      </Grid>
    </>
  )
}

/* ------------------------------------------------------------------ Money */

function MoneyTab({ d }: { d: OwnerSection<'money'> }) {
  const t = useT()
  const vs = useVs(d.days)
  const aov = d.now.sold ? d.now.sales / d.now.sold : 0
  const aovBefore = d.before.sold ? d.before.sales / d.before.sold : 0
  const all = (p: typeof d.now) => p.orders + 0
  const lost = pct(d.now.cancelled, all(d.now))
  const lostBefore = pct(d.before.cancelled, all(d.before))
  const method: Record<string, string> = { lipa: 'Lipa Namba', cod: t('Cash on delivery'), manual: t('Recorded by hand'), cash: t('Cash'), mobile: t('Other mobile money'), bank: t('Bank') }
  const paid = d.methods.reduce((s, m) => s + m.sales, 0)
  const cat = (id: string) => t(CATEGORIES.find((c) => c.id === id)?.label ?? id)
  return (
    <>
      <Kpis>
        <Kpi label={t('Sales')} value={<KpiMoney value={d.now.sales} />} now={d.now.sales} before={d.before.sales} vs={vs} />
        <Kpi label={t('Average order')} value={<KpiMoney value={aov} />} now={aov} before={aovBefore} vs={vs} />
        <Kpi label={t('Paid orders')} value={num(d.now.sold)} now={d.now.sold} before={d.before.sold} vs={vs} />
        <Kpi label={t('Cancelled')} value={`${lost}%`} now={lost} before={lostBefore} flip note={t('{n} of online orders', { n: num(d.now.cancelled) })} />
      </Kpis>
      <Grid>
        <section className="card min-w-0 p-5 md:p-6 lg:col-span-8">
          <DayChart points={d.sales} money total={d.now.sales} chip={<Change now={d.now.sales} before={d.before.sales} />} caption={t('Sales, last {n} days', { n: d.days })} />
        </section>
        <Card title={t('Plans')} sub={t('Right now. Sellers can’t pay in Shopi yet, so no shop pauses.')} className="lg:col-span-4">
          <Row label={t('On a free trial')} value={num(d.plans.trial)} />
          <Row label={t('Trial ends within 7 days')} value={num(d.plans.endingSoon)} />
          <Row label={t('Trial or plan ended')} value={num(d.plans.ended)} />
          <Row label="Twiga" value={num(d.plans.twiga)} />
          <Row label="Tembo" value={num(d.plans.tembo)} />
          <Row label={t('Yearly income from paid plans')} value={<Money value={d.plans.yearly} cur="text-[0.8em] text-muted" />} strong />
        </Card>
        <Card title={t('How buyers pay')} sub={t('Sales by payment, last {n} days', { n: d.days })} className="lg:col-span-4">
          <BarList
            empty={t('No orders yet')}
            total={paid || undefined}
            rows={d.methods.map((m) => ({ label: `${method[m.method] ?? m.method} · ${t(m.orders === 1 ? '{n} order' : '{n} orders', { n: num(m.orders) })}`, value: m.sales, text: <Money value={m.sales} cur="text-[0.8em] text-muted" /> }))}
          />
        </Card>
        <Card title={t('What sells')} sub={t('Sales by shop category, last {n} days', { n: d.days })} className="lg:col-span-4">
          <BarList empty={t('No orders yet')} rows={d.categories.map((c) => ({ label: cat(c.category), value: c.sales, text: <Money value={c.sales} cur="text-[0.8em] text-muted" /> }))} />
        </Card>
        <Card title={t('Top shops')} sub={t('By sales, last {n} days', { n: d.days })} className="lg:col-span-4">
          {d.top.length ? (
            <ul className="divide-y divide-line">
              {d.top.map((s) => (
                <li key={s.id}>
                  <Link to="/admin/shops/$id" params={{ id: s.id }} search={{ days: d.days === 30 ? undefined : d.days }} className="flex items-center gap-3 py-2.5 text-[14px]">
                    <ShopAvatar name={s.name} logo={s.logo_key} className="h-8 w-8 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <Money value={s.sales} className="shrink-0" cur="text-[0.8em] text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Nothing>{t('No orders yet')}</Nothing>
          )}
        </Card>
      </Grid>
    </>
  )
}

/* ------------------------------------------------------------------ Growth */

function Growth({ d }: { d: OwnerSection<'growth'> }) {
  const t = useT()
  const vs = useVs(d.days)
  const source = useSourceLabel()
  const { day } = useDates()
  const f = d.funnel
  const steps = [
    { label: t('Signed up'), n: f.signups },
    { label: t('Opened a shop'), n: f.shops },
    { label: t('Added a product'), n: f.product },
    { label: t('First visit'), n: f.visit },
    { label: t('First order'), n: f.first_order },
    { label: t('Fifth order'), n: f.fifth_order },
  ]
  const device: Record<string, string> = { android: 'Android', iphone: 'iPhone', computer: t('Computer'), tablet: t('Tablet'), unknown: t('Unknown') }
  const visits = d.devices.reduce((s, r) => s + r.n, 0)
  const orders = d.sources.reduce((s, r) => s + r.orders, 0)
  const share = (n: number, of: number) => `${num(n)} · ${pct(n, of)}%`
  const cell = (n: number, of: number) => (
    <td className="tnum py-2.5 pr-4 text-right">
      {num(n)}
      <span className="ml-1.5 text-[12px] text-muted">{of ? `${pct(n, of)}%` : ''}</span>
    </td>
  )
  return (
    <>
      <Kpis>
        <Kpi label={t('Sign-ups')} value={num(d.now.signups)} now={d.now.signups} before={d.before.signups} vs={vs} />
        <Kpi label={t('New shops')} value={num(d.now.shops)} now={d.now.shops} before={d.before.shops} vs={vs} />
        <Kpi label={t('Active shops')} value={num(d.now.active)} now={d.now.active} before={d.before.active} vs={vs} />
        <Kpi label={t('Visits to shops')} value={num(d.now.visits)} now={d.now.visits} before={d.before.visits} vs={vs} />
      </Kpis>
      <Grid>
        <section className="card min-w-0 p-5 md:p-6 lg:col-span-6">
          <DayChart points={d.signups} total={d.now.signups} chip={<Change now={d.now.signups} before={d.before.signups} />} caption={t('Sign-ups, last {n} days', { n: d.days })} />
        </section>
        <section className="card min-w-0 p-5 md:p-6 lg:col-span-6">
          <DayChart points={d.shops} total={d.now.shops} chip={<Change now={d.now.shops} before={d.before.shops} />} caption={t('New shops, last {n} days', { n: d.days })} />
        </section>
        <Card title={t('From sign-up to fifth order')} sub={t('Every seller so far, and how far they got.')} className="lg:col-span-12">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {steps.map((s, i) => (
              <div key={s.label} className="rounded-[14px] bg-page p-4">
                <p className="text-[13px] text-muted">{s.label}</p>
                <p className="tnum mt-1 text-[22px] font-semibold tracking-[-0.02em]">{num(s.n)}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
                  <span className="block h-full bg-ink" style={{ width: `${Math.min(100, pct(s.n, f.signups))}%` }} />
                </div>
                <p className="mt-2 text-[12px] text-muted">{i === 0 ? t('Everyone') : t('{n}% of sign-ups', { n: pct(s.n, f.signups) })}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t('Sellers by the week they joined')} sub={t('The last 8 weeks, and how far each week’s sellers have got since.')} className="lg:col-span-12">
          {d.cohorts.length ? (
            <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
              <table className="w-full min-w-[560px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[13px] text-muted">
                    <th className="py-2.5 pr-4 font-normal">{t('Week of')}</th>
                    <th className="py-2.5 pr-4 text-right font-normal">{t('Signed up')}</th>
                    <th className="py-2.5 pr-4 text-right font-normal">{t('Opened a shop')}</th>
                    <th className="py-2.5 pr-4 text-right font-normal">{t('Added a product')}</th>
                    <th className="py-2.5 pr-4 text-right font-normal">{t('First order')}</th>
                    <th className="py-2.5 pr-4 text-right font-normal">{t('Fifth order')}</th>
                    <th className="py-2.5 text-right font-normal">{t('Paid')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.cohorts.map((c) => (
                    <tr key={c.wk}>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{day(c.week)}</td>
                      <td className="tnum py-2.5 pr-4 text-right font-medium">{num(c.signups)}</td>
                      {cell(c.shop, c.signups)}
                      {cell(c.product, c.signups)}
                      {cell(c.first_order, c.signups)}
                      {cell(c.fifth_order, c.signups)}
                      <td className="tnum py-2.5 text-right">{num(c.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Nothing>{t('No sign-ups in the last 8 weeks.')}</Nothing>
          )}
        </Card>
        <Card title={t('Where visits come from')} sub={t('Visits to shops, last {n} days', { n: d.days })} className="lg:col-span-4">
          <BarList empty={t('No visits yet')} rows={d.traffic.map((r) => ({ label: source(r.k), value: r.n, text: share(r.n, d.now.visits) }))} />
        </Card>
        <Card title={t('Where orders come from')} sub={t('Last {n} days, every shop', { n: d.days })} className="lg:col-span-4">
          <BarList empty={t('No orders yet')} rows={d.sources.map((r) => ({ label: source(r.source), value: r.orders, text: share(r.orders, orders) }))} />
        </Card>
        <Card title={t('Phones')} sub={t('What buyers open shops on')} className="lg:col-span-4">
          <BarList empty={t('No visits yet')} total={visits || undefined} rows={d.devices.map((r) => ({ label: device[r.k] ?? r.k, value: r.n, text: share(r.n, visits) }))} />
        </Card>
        <Card title={t('Cities')} sub={t('Where visitors are, last {n} days', { n: d.days })} className="lg:col-span-6">
          <BarList empty={t('No visits yet')} rows={d.cities.map((r) => ({ label: r.k, value: r.n }))} />
        </Card>
        <Card title={t('Delivery areas')} sub={t('Where orders go, last {n} days', { n: d.days })} className="lg:col-span-6">
          <BarList empty={t('No orders yet')} rows={d.areas.map((r) => ({ label: r.k, value: r.n }))} />
        </Card>
      </Grid>
    </>
  )
}

/* ------------------------------------------------------------------ Product use */

function Use({ d }: { d: OwnerSection<'use'> }) {
  const t = useT()
  const f = d.features
  const feature: [string, string][] = [
    ['products', t('At least one product')],
    ['logo', t('A logo')],
    ['lipa', 'Lipa Namba'],
    ['socials', t('Social links')],
    ['options', t('Sizes or other options')],
    ['collections', t('Collections')],
    ['discounts', t('Discount codes')],
    ['discount_used', t('A discount code used on an order')],
    ['bags', t('Bag links')],
    ['manual', t('Sales recorded by hand')],
    ['links', t('Tagged links')],
    ['alerts', t('Buyers waiting for stock')],
    ['installed', t('App on the Home Screen')],
    ['push', t('Notifications on')],
    ['colour', t('Own colour')],
    ['font', t('Own style of name')],
    ['cover', t('Cover photo')],
    ['domain', t('Own domain')],
    ['swahili', t('Shop in Kiswahili')],
    ['maps', t('Google Maps link')],
    ['tin', 'TIN'],
  ]
  const tap: Record<string, string> = {
    'add_to_cart:quick': t('Added to bag, quick add'),
    'add_to_cart:page': t('Added to bag, product page'),
    add_to_cart: t('Added to bag'),
    checkout_start: t('Started checkout'),
    whatsapp_click: t('WhatsApp taps'),
    social_click: t('Social link taps'),
    share: t('Shares by buyers'),
    seller_share: t('Shares by sellers'),
  }
  return (
    <div className="grid gap-3 md:gap-4 lg:grid-cols-12">
      <Card title={t('Tools in use')} sub={t('How many of the {n} shops use each one, all time', { n: num(f.shops) })} className="lg:col-span-7">
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[feature.slice(0, 11), feature.slice(11)].map((half, i) => (
            <BarList key={i} empty="" total={f.shops || 1} rows={half.map(([k, label]) => ({ label, value: f[k] ?? 0, text: `${num(f[k] ?? 0)} · ${pct(f[k] ?? 0, f.shops)}%` }))} />
          ))}
        </div>
      </Card>
      <Card title={t('What buyers and sellers tap')} sub={t('Every shop, last {n} days', { n: d.days })} className="lg:col-span-5">
        <BarList empty={t('Nothing yet')} rows={d.taps.map((r) => ({ label: tap[r.k] ?? r.k, value: r.n }))} />
      </Card>
      <Card title={t('Top 20 products')} sub={t('By units sold, last {n} days', { n: d.days })} className="lg:col-span-12">
        <ProductTable rows={d.best} empty={t('No orders yet')} />
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ Health */

function Health({ d }: { d: OwnerSection<'health'> }) {
  const t = useT()
  const lang = useLang()
  const { date } = useDates()
  const mb = (b: number) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`
  const limit: Record<string, string> = {
    'unchecked-signup': t('Sign-ups let through without the bot check'),
    'unchecked-order': t('Orders let through without the bot check'),
    'unchecked-alert': t('Stock requests let through without the bot check'),
    login: t('Wrong passwords'),
    'login-ip': t('Log-in tries'),
    'signup-ip': t('Sign-up tries'),
    photo: t('Photos fetched from links by imports'),
    domain: t('Domains added'),
  }
  const backupOld = d.backup ? d.at - d.backup.at > 8 * 86_400_000 : true
  const status: Record<string, string> = { active: t('Active'), pending: t('Waiting for DNS'), failed: t('Failed') }
  return (
    <div className="grid gap-3 md:gap-4 lg:grid-cols-12">
      <PaymentsToCheck w={d.waiting} problems={d.problems} days={d.days} className="lg:col-span-4" />
      <Card title={t('Bot check and limits')} sub={t('The last 24 hours. Nothing here means nothing was held back.')} className="lg:col-span-4">
        {d.limits.length ? d.limits.map((r) => <Row key={r.k} label={limit[r.k] ?? r.k} value={num(r.n)} />) : <Nothing>{t('Nothing in the last 24 hours')}</Nothing>}
      </Card>
      <Card title={t('Backup')} sub={t('The weekly copy of the database, Sundays 03:30.')} className="lg:col-span-4">
        {d.backup ? (
          <>
            <Row
              label={
                <span className="flex items-center gap-2">
                  {backupOld && <span className="signal" />}
                  {t('Newest copy')}
                </span>
              }
              value={timeAgo(d.backup.at, lang)}
            />
            <Row label={t('Its size')} value={mb(d.backup.size)} />
            <Row label={t('Copies kept')} value={num(d.backup.kept)} />
          </>
        ) : (
          <Nothing>{d.backupError ? t('The backup bucket could not be read.') : t('No backup yet.')}</Nothing>
        )}
      </Card>
      <Card title={t('Database')} sub={t('What Shopi holds right now.')} className="lg:col-span-6">
        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            {d.dbBytes !== null && <Row label={t('Size')} value={mb(d.dbBytes)} />}
            <Row label={t('Accounts')} value={num(d.counts.users)} />
            <Row label={t('Shops')} value={num(d.counts.shops)} />
            <Row label={t('Products')} value={num(d.counts.products)} />
            <Row label={t('Product photos')} value={num(d.counts.photos)} />
            <Row label={t('Orders')} value={num(d.counts.orders)} />
          </div>
          <div>
            <Row label={t('Visit events')} value={num(d.counts.events)} />
            <Row label={t('Oldest visit event')} value={d.oldest.events ? date(d.oldest.events, true) : '—'} />
            <Row label={t('Sellers logged in')} value={num(d.counts.sessions)} />
            <Row label={t('Phones with notifications')} value={num(d.counts.push)} />
            <Row label={t('Buyers waiting for stock')} value={num(d.counts.alerts)} />
            <Row label={t('Open bag links')} value={num(d.counts.bags)} />
          </div>
        </div>
      </Card>
      <Card title={t('Own domains')} sub={t('Shops’ own addresses and where each one stands.')} className="lg:col-span-6">
        {d.domains.length ? (
          <ul className="divide-y divide-line">
            {d.domains.map((x) => (
              <li key={x.hostname} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="code min-w-0 truncate">{x.hostname}</span>
                  <span className={`shrink-0 text-[13px] ${x.status === 'active' ? 'text-ok' : 'text-wait'}`}>{status[x.status] ?? x.status}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {x.shop} · {date(x.created_at)}
                  {x.status === 'active' && !x.turnstile ? ` · ${t('bot check not on this domain')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Nothing>{t('No shop has its own domain yet.')}</Nothing>
        )}
      </Card>
    </div>
  )
}
