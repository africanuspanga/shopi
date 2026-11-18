import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowDownToLine, Check, Copy, Globe, Link2, Mail, PenLine, Plus, Search, Send, ShoppingBag, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from '#/components/brand-icons'
import { prettyUrl } from '#/components/share'
import { CardHead, Delta, Img, Money, Page, scrubIndex, Toast, TopBar } from '#/components/ui'
import { TemboLock, TemboPill, useCan } from '#/components/tembo'
import { RANGES, createLink, deleteLink, getAnalytics, type Analytics, type RangeDays } from '#/lib/api/analytics'
import { tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/analytics')({
  validateSearch: (s: Record<string, unknown>): { days?: RangeDays } => ({
    days: (RANGES as readonly number[]).includes(Number(s.days)) ? (Number(s.days) as RangeDays) : undefined,
  }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ deps }) => getAnalytics({ data: { days: deps.days } }),
  head: () => ({ meta: [{ title: 'Analytics · Shopi' }] }),
  component: AnalyticsPage,
})

type Metric = 'visitors' | 'orders' | 'sales'

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const pct = (v: number) => (v > 0 && v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`)
const compact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)))
const share = (part: number, whole: number) => (whole ? part / whole : 0)

/** A round axis top a little above the biggest value. */
function niceTop(max: number) {
  const raw = Math.max(max, 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  return step * 4
}

function useSources() {
  const t = useT()
  const icon = 'size-4 shrink-0'
  const map: Record<string, { label: string; icon: ReactNode }> = {
    instagram: { label: 'Instagram', icon: <InstagramIcon size={16} /> },
    tiktok: { label: 'TikTok', icon: <TikTokIcon size={16} /> },
    whatsapp: { label: 'WhatsApp', icon: <WhatsAppIcon size={16} /> },
    facebook: { label: 'Facebook', icon: <FacebookIcon size={16} /> },
    google: { label: 'Google', icon: <Search className={icon} strokeWidth={1.75} /> },
    telegram: { label: 'Telegram', icon: <Send className={icon} strokeWidth={1.75} /> },
    email: { label: t('Email'), icon: <Mail className={icon} strokeWidth={1.75} /> },
    x: { label: 'X', icon: <Globe className={icon} strokeWidth={1.75} /> },
    direct: { label: t('Direct'), icon: <Link2 className={icon} strokeWidth={1.75} /> },
    unknown: { label: t('Before tracking'), icon: <Globe className={icon} strokeWidth={1.75} /> },
    manual: { label: t('Recorded by you'), icon: <PenLine className={icon} strokeWidth={1.75} /> },
    bag_link: { label: t('Bag links'), icon: <ShoppingBag className={icon} strokeWidth={1.75} /> },
  }
  return (s: string) => map[s] ?? { label: s, icon: <Globe className={icon} strokeWidth={1.75} /> }
}

function AnalyticsPage() {
  const t = useT()
  const a = Route.useLoaderData()
  const [metric, setMetric] = useState<Metric>('sales')
  const vs = t('vs the {n} days before', { n: a.days })
  const empty = !a.now.visits && !a.now.orders
  const full = useCan('fullAnalytics')

  return (
    <Page nav wide>
      <TopBar title={t('Analytics')} sub={t('Last {n} days, in Tanzania time', { n: a.days })} right={<RangePicker days={a.days} className="hidden md:flex" />} />
      <RangePicker days={a.days} className="-mt-2 mb-5 md:hidden" />

      {empty && (
        <div className="card mb-4 p-6">
          <p className="text-15 font-medium">{t('No visits in these {n} days yet', { n: a.days })}</p>
          <p className="mt-1 max-w-[56ch] text-14 leading-relaxed text-muted">
            {t('Put your link in your Instagram and TikTok bio and your WhatsApp status. Make a tagged link for each place below, and this page will show which one sells.')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi label={t('Visitors')} value={n(a.now.visitors)} delta={<Delta now={a.now.visitors} before={a.before.visitors} label={vs} />} on={metric === 'visitors'} onClick={() => setMetric('visitors')} />
        <Kpi label={t('Visits')} value={n(a.now.visits)} delta={<Delta now={a.now.visits} before={a.before.visits} label={vs} />} />
        <Kpi label={t('Orders')} value={n(a.now.orders)} delta={<Delta now={a.now.orders} before={a.before.orders} label={vs} />} on={metric === 'orders'} onClick={() => setMetric('orders')} />
        <Kpi label={t('Sales')} value={<Money value={a.now.sales} cur="text-[0.62em] text-muted" />} delta={<Delta now={a.now.sales} before={a.before.sales} label={vs} />} on={metric === 'sales'} onClick={() => setMetric('sales')} />
        <Kpi label={t('Visits that ordered')} value={pct(a.now.conversion)} delta={<Delta now={a.now.conversion} before={a.before.conversion} label={vs} />} />
        <Kpi label={t('Average order')} value={<Money value={a.now.aov} cur="text-[0.62em] text-muted" />} delta={<Delta now={a.now.aov} before={a.before.aov} label={vs} />} />
      </div>

      {full ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <TrendChart a={a} metric={metric} className="lg:col-span-12" />
          <Channels a={a} className="lg:col-span-7" />
          <Funnel a={a} className="lg:col-span-5" />
          <Products a={a} className="lg:col-span-12" />
          <When a={a} className="lg:col-span-7" />
          <Clicks a={a} className="lg:col-span-5" />
          <Areas a={a} className="lg:col-span-4" />
          <Devices a={a} className="lg:col-span-4" />
          <Sizes a={a} className="lg:col-span-4" />
          <Buyers a={a} className="lg:col-span-7" />
          <Links a={a} className="lg:col-span-5" />
        </div>
      ) : (
        // Free (17 Nov): the numbers, the chart and what sells; the deeper sections are Tembo's.
        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <TrendChart a={a} metric={metric} className="lg:col-span-12" />
          <TemboLock
            className="lg:col-span-12"
            title={t('Full analytics')}
            body={t('90 days, where your buyers come from, the steps from visit to order, your busiest hours, your buyers with downloads, and tagged links that show which post sells.')}
          />
          <Products a={a} className="lg:col-span-12" />
          <Clicks a={a} className="lg:col-span-6" />
          <Areas a={a} className="lg:col-span-6" />
          <Devices a={a} className="lg:col-span-6" />
          <Sizes a={a} className="lg:col-span-6" />
        </div>
      )}
    </Page>
  )
}

function RangePicker({ days, className = '' }: { days: number; className?: string }) {
  const t = useT()
  const full = useCan('fullAnalytics')
  return (
    <div className={`flex gap-2 ${className}`} role="tablist" aria-label={t('Range')}>
      {RANGES.map((d) =>
        d === 90 && !full ? (
          // 90 days is Tembo: the chip shows it and leads to the plan page.
          <Link key={d} to="/app/plan" className="chip h-9 gap-1.5">
            {t('{n} days', { n: d })} <TemboPill />
          </Link>
        ) : (
          <Link key={d} to="/app/analytics" search={{ days: d }} role="tab" aria-selected={days === d} data-active={days === d} className="chip h-9">
            {t('{n} days', { n: d })}
          </Link>
        ),
      )}
    </div>
  )
}

function Card({ title, sub, action, children, className = '' }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-5 md:p-6 ${className}`}>
      <CardHead title={title} sub={sub} right={action} className="mb-5" />
      {children}
    </section>
  )
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="rounded-14 bg-page px-4 py-6 text-center text-14 text-muted">{children}</p>
}

function Kpi({ label, value, delta, on, onClick }: { label: string; value: ReactNode; delta: ReactNode; on?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="block text-13 text-muted">{label}</span>
      <span className="tnum mt-1.5 block truncate text-20 font-semibold tracking-[-0.02em] md:text-24">{value}</span>
      <span className="mt-1.5 block">{delta}</span>
    </>
  )
  if (!onClick) return <div className="card p-4 md:p-5">{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`card p-4 text-left transition-shadow md:p-5 ${on ? 'shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : 'hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]'}`}
    >
      {body}
    </button>
  )
}

function TrendChart({ a, metric, className }: { a: Analytics; metric: Metric; className: string }) {
  const t = useT()
  const lang = useLang()
  const [sel, setSel] = useState<number | null>(null)
  const values = a.series.map((d) => d[metric])
  const top = niceTop(Math.max(...values))
  const i = sel ?? values.length - 1
  const fmt = (v: number) => (metric === 'sales' ? tzs(v) : n(v))
  const date = (ms: number, long = false) =>
    new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', ...(long ? { weekday: 'short' } : {}), timeZone: 'UTC' })
  const label = { visitors: t('Visitors'), orders: t('Orders'), sales: t('Sales') }[metric]
  const total = values.reduce((s, v) => s + v, 0)
  return (
    <section className={`card min-w-0 p-5 md:p-6 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <CardHead title={t('{metric} by day', { metric: label })} sub={t('Tap a number above to switch. Slide along the bars to read each day.')} />
        <p className="text-right">
          <span className="block text-13 text-muted">{sel == null ? t('Total in {n} days', { n: a.days }) : date(a.series[i].day, true)}</span>
          <span className="tnum text-20 font-semibold tracking-[-0.02em]">{fmt(sel == null ? total : values[i])}</span>
        </p>
      </div>
      <div className="relative mt-6 h-[200px] md:h-[240px]" onPointerLeave={() => setSel(null)}>
        <div className="absolute inset-0 bottom-6 left-11">
          {[0, 1, 2, 3, 4].map((k) => (
            <div key={k} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(k / 4) * 100}%` }}>
              {k % 2 === 0 && <span className="meta absolute -top-2 -left-11 w-9 text-right text-11">{compact((top * k) / 4)}</span>}
            </div>
          ))}
          <div
            className={`absolute inset-0 flex touch-pan-y items-end ${a.days > 30 ? 'gap-px' : 'gap-0.5 md:gap-1'}`}
            onPointerDown={(e) => e.pointerType !== 'mouse' && setSel(scrubIndex(e, values.length))}
            onPointerMove={(e) => e.pointerType !== 'mouse' && setSel(scrubIndex(e, values.length))}
          >
            {a.series.map((d, k) => (
              <button
                key={d.day}
                type="button"
                aria-label={`${date(d.day, true)}: ${fmt(values[k])}`}
                className="group relative flex h-full flex-1 items-end"
                onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(k)}
                onClick={() => setSel(k)}
              >
                <span
                  className={`w-full rounded-t-2 transition-colors ${k === values.length - 1 ? 'bg-moto' : sel === k ? 'bg-ink' : 'bg-raised group-hover:bg-faint'}`}
                  style={{ height: `${Math.max(1.5, (values[k] / top) * 100)}%` }}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="meta absolute inset-x-0 bottom-0 left-11 flex justify-between">
          <span>{date(a.series[0].day)}</span>
          <span>{date(a.series[Math.floor(a.series.length / 2)].day)}</span>
          <span className="text-ink">{t('Today')}</span>
        </div>
      </div>
    </section>
  )
}

function Channels({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const source = useSources()
  const maxSales = Math.max(...a.channels.map((c) => c.sales), 1)
  const maxVisits = Math.max(...a.channels.map((c) => c.visits), 1)
  return (
    <Card title={t('Where buyers come from')} sub={t('Visits, orders and sales by app or website')} className={className}>
      {a.channels.length === 0 ? (
        <Nothing>{t('No visits yet')}</Nothing>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_70px_60px_minmax(0,1fr)_70px] gap-x-4 border-b border-line pb-2 text-12 text-muted md:grid">
            <span>{t('Source')}</span>
            <span className="text-right">{t('Visits')}</span>
            <span className="text-right">{t('Orders')}</span>
            <span className="text-right">{t('Sales')}</span>
            <span className="text-right">{t('Ordered')}</span>
          </div>
          <ul className="divide-y divide-line">
            {a.channels.map((c) => {
              const s = source(c.source)
              const bar = c.sales ? c.sales / maxSales : c.visits / maxVisits
              return (
                <li key={c.source} className="py-3 md:grid md:grid-cols-[minmax(0,1.4fr)_70px_60px_minmax(0,1fr)_70px] md:items-center md:gap-x-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2.5 text-14 font-medium">
                      <span className="text-ink-2">{s.icon}</span>
                      <span className="truncate">{s.label}</span>
                      <span className="tnum ml-auto text-14 md:hidden">{tzs(c.sales)}</span>
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-well">
                      <div className={`h-full rounded-full ${c.sales ? 'bg-ink' : 'bg-faint'}`} style={{ width: `${Math.max(2, bar * 100)}%` }} />
                    </div>
                    <p className="meta mt-1.5 md:hidden">
                      {t('{v} visits · {o} orders · {c} ordered', { v: n(c.visits), o: n(c.orders), c: pct(share(c.orders, c.visits)) })}
                    </p>
                  </div>
                  <span className="tnum hidden text-right text-14 md:block">{n(c.visits)}</span>
                  <span className="tnum hidden text-right text-14 md:block">{n(c.orders)}</span>
                  <span className="tnum hidden text-right text-14 font-medium md:block">{tzs(c.sales)}</span>
                  <span className="tnum hidden text-right text-14 text-ink-2 md:block">{c.visits ? pct(share(c.orders, c.visits)) : '—'}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-12 leading-5 text-muted">{t('Direct means the link was typed, saved, or opened from an app that does not say which one.')}</p>
        </div>
      )}
    </Card>
  )
}

function Funnel({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const f = a.funnel
  const steps = [
    [t('Visited the shop'), f.visits],
    [t('Looked at a product'), f.viewed],
    [t('Added to bag'), f.added],
    [t('Started checkout'), f.checkout],
    [t('Placed an order'), f.ordered],
    [t('Paid or confirmed'), f.paid],
    [t('Delivered'), f.delivered],
  ] as const
  const top = Math.max(f.visits, 1)
  // The biggest leak between visiting and ordering
  let worst = -1
  let worstRate = 0
  for (let k = 1; k <= 4; k++) {
    const before = steps[k - 1][1]
    const lost = before ? 1 - steps[k][1] / before : 0
    if (before >= 5 && lost > worstRate) {
      worstRate = lost
      worst = k
    }
  }
  return (
    <Card title={t('From visit to delivery')} sub={t('How many visits reach each step')} className={className}>
      {f.visits === 0 ? (
        <Nothing>{t('No visits yet')}</Nothing>
      ) : (
        <>
          <ol className="space-y-3">
            {steps.map(([label, value], k) => (
              <li key={label}>
                <div className="flex items-baseline justify-between gap-3 text-14">
                  <span className={k === worst ? 'font-medium' : 'text-ink-2'}>{label}</span>
                  <span className="tnum">
                    {n(value)} <span className="text-12 text-muted">{pct(share(value, top))}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-well">
                  <div className={`h-full rounded-full ${k === worst ? 'bg-moto' : 'bg-ink'}`} style={{ width: `${Math.max(1, share(value, top) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
          {worst > 0 && (
            <p className="mt-5 rounded-14 bg-moto-soft px-4 py-3 text-13 leading-5 text-moto-ink">
              {t('Most people leave before "{step}": {lost} of those who reach "{prev}" stop there.', {
                step: steps[worst][0],
                prev: steps[worst - 1][0],
                lost: pct(worstRate),
              })}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function Products({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const [all, setAll] = useState(false)
  const rows = all ? a.products : a.products.slice(0, 8)
  return (
    <Card
      title={t('Products')}
      sub={t('Views, bag adds and sales for each product in these {n} days', { n: a.days })}
      className={className}
      action={
        a.products.length > 8 ? (
          <button type="button" className="shrink-0 text-13 text-muted transition-colors hover:text-ink" onClick={() => setAll(!all)}>
            {all ? t('Show fewer') : t('Show all {n}', { n: a.products.length })}
          </button>
        ) : null
      }
    >
      {a.products.length === 0 ? (
        <Nothing>{t('Add products to see how each one does')}</Nothing>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,2fr)_80px_80px_70px_minmax(0,1fr)_90px] gap-x-4 border-b border-line pb-2 text-12 text-muted md:grid">
            <span>{t('Product')}</span>
            <span className="text-right">{t('Views')}</span>
            <span className="text-right">{t('Bag adds')}</span>
            <span className="text-right">{t('Sold')}</span>
            <span className="text-right">{t('Sales')}</span>
            <span className="text-right">{t('Viewers who bought')}</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  to="/app/products/$id"
                  params={{ id: p.id }}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-page md:grid md:grid-cols-[minmax(0,2fr)_80px_80px_70px_minmax(0,1fr)_90px] md:gap-x-4"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <Img size="thumb" k={p.image} alt="" className="h-11 w-11 shrink-0 rounded-12" />
                    <span className="min-w-0">
                      <span className="block truncate text-14 font-medium">{p.name}</span>
                      <span className="meta block md:hidden">
                        {t('{v} views · {a} adds · {s} sold', { v: compact(p.views), a: n(p.adds), s: n(p.units) })}
                      </span>
                      {p.stock != null && p.stock <= 3 && <span className="block text-12 text-moto-ink">{p.stock === 0 ? t('Sold out') : t('Only {n} left', { n: p.stock })}</span>}
                    </span>
                  </span>
                  <span className="tnum hidden text-right text-14 md:block">{n(p.views)}</span>
                  <span className="tnum hidden text-right text-14 md:block">{n(p.adds)}</span>
                  <span className="tnum hidden text-right text-14 md:block">{n(p.units)}</span>
                  <span className="tnum shrink-0 text-right text-14 font-medium">{tzs(p.sales)}</span>
                  <span className="tnum hidden text-right text-14 text-ink-2 md:block">{p.viewers ? pct(share(p.orders, p.viewers)) : '—'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function When({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const days = [t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')]
  const long = [t('Monday'), t('Tuesday'), t('Wednesday'), t('Thursday'), t('Friday'), t('Saturday'), t('Sunday')]
  let max = 0
  let peak: [number, number] = [0, 0]
  a.heat.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > max) {
        max = v
        peak = [d, h]
      }
    }),
  )
  const dayTotals = a.heat.map((row) => row.reduce((s, v) => s + v, 0))
  const bestDay = dayTotals.indexOf(Math.max(...dayTotals))
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
  return (
    <Card
      title={t('When buyers visit')}
      sub={max ? t('Busiest hour: {day}, {from} to {to}. Busiest day: {best}.', { day: long[peak[0]], from: hh(peak[1]), to: hh((peak[1] + 1) % 24), best: long[bestDay] }) : t('Post when your buyers are online')}
      className={className}
    >
      {max === 0 ? (
        <Nothing>{t('No visits yet')}</Nothing>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[440px]">
            {a.heat.map((row, d) => (
              <div key={d} className="flex items-center gap-2 py-[2px]">
                <span className="meta w-8 shrink-0">{days[d]}</span>
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
                  {row.map((v, h) => {
                    const isPeak = d === peak[0] && h === peak[1]
                    return (
                      <span
                        key={h}
                        title={`${long[d]} ${hh(h)}: ${n(v)}`}
                        className={`aspect-square rounded-2 ${isPeak ? 'bg-moto' : v ? 'bg-ink' : 'bg-well'}`}
                        style={!isPeak && v ? { opacity: 0.12 + 0.88 * (v / max) } : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2">
              <span className="w-8 shrink-0" />
              <div className="meta flex flex-1 justify-between">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:00</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function Clicks({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const c = a.clicks
  const rows: [ReactNode, string, number, string?][] = [
    [<WhatsAppIcon size={16} />, t('WhatsApp taps'), c.whatsapp, t('{s} shop · {p} products · {o} order pages', { s: n(c.whatsappFrom.shop + c.whatsappFrom.footer), p: n(c.whatsappFrom.product), o: n(c.whatsappFrom.order) })],
    [<InstagramIcon size={16} />, t('Instagram taps'), c.instagram],
    [<TikTokIcon size={16} />, t('TikTok taps'), c.tiktok],
    [<FacebookIcon size={16} />, t('Facebook taps'), c.facebook],
    [<Send className="size-4" strokeWidth={1.75} />, t('Shared by buyers'), c.shares, t('{w} on WhatsApp · {c} links copied', { w: n(c.sharesOnWhatsApp), c: n(c.copies) })],
    [<Link2 className="size-4" strokeWidth={1.75} />, t('Products you sent'), c.sellerShares],
  ]
  return (
    <Card title={t('Taps and shares')} sub={t('What buyers did besides ordering')} className={className}>
      <ul className="divide-y divide-line">
        {rows.map(([icon, label, value, sub]) => (
          <li key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="text-ink-2">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-14">{label}</span>
              {sub && value > 0 && <span className="block text-12 text-muted">{sub}</span>}
            </span>
            <span className="tnum text-15 font-medium">{n(value)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Areas({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const max = Math.max(...a.areas.map((x) => x.orders), 1)
  return (
    <Card title={t('Areas that order most')} sub={t('From delivery areas on orders')} className={className}>
      {a.areas.length === 0 ? (
        <Nothing>{t('No orders yet')}</Nothing>
      ) : (
        <ul className="space-y-3">
          {a.areas.map((x) => (
            <li key={x.area}>
              <div className="flex items-baseline justify-between gap-3 text-14">
                <span className="truncate">{x.area}</span>
                <span className="tnum shrink-0 text-ink-2">{t(x.orders === 1 ? '{n} order' : '{n} orders', { n: x.orders })}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-well">
                <div className="h-full rounded-full bg-ink" style={{ width: `${(x.orders / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Devices({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const label: Record<string, string> = { android: 'Android', iphone: 'iPhone', computer: t('Computer'), tablet: t('Tablet'), other: t('Other') }
  const tone: Record<string, string> = { android: 'bg-ink', iphone: 'bg-ink-2', computer: 'bg-faint', tablet: 'bg-raised', other: 'bg-raised' }
  const total = a.devices.reduce((s, d) => s + d.visits, 0)
  const sorted = [...a.devices].sort((x, y) => y.visits - x.visits)
  return (
    <Card title={t('Phones and cities')} sub={t('What visitors used, and where they were')} className={className}>
      {total === 0 ? (
        <Nothing>{t('No visits yet')}</Nothing>
      ) : (
        <>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {sorted.map((d) => (
              <span key={d.device} className={tone[d.device] ?? 'bg-raised'} style={{ width: `${share(d.visits, total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-13">
            {sorted.map((d) => (
              <li key={d.device} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${tone[d.device] ?? 'bg-raised'}`} />
                <span className="text-ink-2">{label[d.device] ?? d.device}</span>
                <span className="tnum ml-auto">{pct(share(d.visits, total))}</span>
              </li>
            ))}
          </ul>
          {a.cities.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {a.cities.map((c) => (
                <li key={c.city} className="flex justify-between gap-3 py-2.5 text-14 last:pb-0">
                  <span className="truncate">{c.city}</span>
                  <span className="tnum text-ink-2">{t('{n} visits', { n: n(c.visits) })}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function Sizes({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const total = a.sizes.reduce((s, x) => s + x.units, 0)
  return (
    <Card title={t('Sizes that sell')} sub={t('Pieces sold in each size')} className={className}>
      {total === 0 ? (
        <Nothing>{t('No sized products sold yet')}</Nothing>
      ) : (
        <ul className="space-y-3">
          {a.sizes.map((x) => (
            <li key={x.size} className="flex items-center gap-3">
              <span className="chip tnum h-8 min-w-12 justify-center px-3 text-13">{x.size}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-well">
                <div className="h-full rounded-full bg-ink" style={{ width: `${share(x.units, a.sizes[0].units) * 100}%` }} />
              </div>
              <span className="tnum w-20 text-right text-14 text-ink-2">{t('{n} sold', { n: n(x.units) })}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Buyers({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const lang = useLang()
  const b = a.buyers
  const day = (ms: number) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Dar_es_Salaam' })
  return (
    <Card
      title={t('Buyers')}
      sub={t('People who ordered in these {n} days', { n: a.days })}
      className={className}
      action={
        <div className="flex shrink-0 gap-2">
          <a href={`/api/export?what=orders&days=${a.days}`} className="btn btn-ghost btn-sm" download>
            <ArrowDownToLine size={16} strokeWidth={1.75} /> {t('Orders')}
          </a>
          <a href={`/api/export?what=customers&days=${a.days}`} className="btn btn-ghost btn-sm hidden sm:inline-flex" download>
            <ArrowDownToLine size={16} strokeWidth={1.75} /> {t('Buyers')}
          </a>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3 rounded-16 bg-page p-4">
        <Mini label={t('Buyers')} value={n(b.total)} />
        <Mini label={t('Came back')} value={n(b.returning)} />
        <Mini label={t('Return rate')} value={pct(share(b.returning, b.total))} />
      </div>
      {b.top.length === 0 ? (
        <div className="mt-4">
          <Nothing>{t('No orders yet')}</Nothing>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {b.top.map((x) => (
            <li key={x.phone} className="flex items-center gap-3 py-3 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-14 font-medium">
                  {x.name}
                  {x.returning && <span className="rounded-full bg-well px-2 py-0.5 text-11 font-medium text-ink-2">{t('Came back')}</span>}
                </p>
                <p className="code mt-0.5 truncate text-12 text-muted">
                  {x.phone} · {t('last {date}', { date: day(x.last) })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-14 font-medium">{tzs(x.spent)}</p>
                <p className="text-12 text-muted">{t(x.orders === 1 ? '{n} order' : '{n} orders', { n: x.orders })}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-12 text-muted">{label}</p>
      <p className="tnum mt-0.5 text-17 font-semibold tracking-[-0.02em]">{value}</p>
    </div>
  )
}

function Links({ a, className }: { a: Analytics; className: string }) {
  const t = useT()
  const router = useRouter()
  const origin = useOrigin()
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const base = `${origin}/${a.shop.slug}`
  const presets = [t('Instagram bio'), t('WhatsApp status'), t('TikTok bio'), t('Facebook page')].filter(
    (p) => !a.tags.some((x) => x.label?.toLowerCase() === p.toLowerCase()),
  )

  async function add(name: string) {
    if (!name.trim()) return
    setBusy(true)
    await createLink({ data: { label: name } })
    setLabel('')
    setBusy(false)
    router.invalidate()
  }

  async function copy(tag: string) {
    const url = `${base}?s=${tag}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('', url)
    }
    setCopied(tag)
    setTimeout(() => setCopied(''), 1600)
  }

  return (
    <Card title={t('Your tagged links')} sub={t('Put a different link in each place. This shows which place sells.')} className={className}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(label)
        }}
      >
        <input className="input h-11" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('e.g. Instagram bio')} aria-label={t('Link name')} maxLength={40} />
        <button className="btn btn-sm h-11 shrink-0 px-4" disabled={busy || !label.trim()}>
          <Plus size={16} strokeWidth={2.25} /> {t('Make')}
        </button>
      </form>
      {presets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} type="button" className="chip h-8 px-3 text-13" disabled={busy} onClick={() => add(p)}>
              <Plus size={14} strokeWidth={2.25} /> {p}
            </button>
          ))}
        </div>
      )}
      {a.tags.length > 0 && (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {a.tags.map((x) => (
            <li key={x.tag} className="py-3.5 last:pb-0">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-14 font-medium">{x.label ?? x.tag}</p>
                <button type="button" className="icon-btn h-8 w-8" aria-label={t('Copy link')} onClick={() => copy(x.tag)}>
                  {copied === x.tag ? <Check size={14} strokeWidth={2.25} /> : <Copy size={14} strokeWidth={1.75} />}
                </button>
                {x.saved && (
                  <button
                    type="button"
                    className="icon-btn h-8 w-8"
                    aria-label={t('Remove {name}', { name: x.label ?? x.tag })}
                    onClick={async () => {
                      await deleteLink({ data: { tag: x.tag } })
                      router.invalidate()
                    }}
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <p className="code mt-0.5 truncate text-12 text-muted">{prettyUrl(`${base}?s=${x.tag}`)}</p>
              <p className="tnum mt-1 text-13 text-ink-2">
                {t('{v} visits · {o} orders · {s}', { v: n(x.visits), o: n(x.orders), s: tzs(x.sales) })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Toast show={!!copied}>{t('Link copied')}</Toast>
    </Card>
  )
}
