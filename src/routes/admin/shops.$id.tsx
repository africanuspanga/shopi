import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { BarList, Card, DayChart, Kpi, KpiMoney, Nothing, ProductTable, Row, num, pct, useDates } from '#/components/admin'
import { WhatsAppIcon } from '#/components/brand-icons'
import { Money, ShopAvatar, StatusPill } from '#/components/ui'
import { asAdminDays, type AdminDays } from '#/lib/admin'
import { getAdminShop } from '#/lib/api/admin'
import { CATEGORIES, localPhone, timeAgo, waLink, type OrderStatus } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { usePlanText } from './index'
import { Ranges } from './route'

/** One shop, for the owner: its numbers, its seller and what it has set up. */
export const Route = createFileRoute('/admin/shops/$id')({
  validateSearch: (s: Record<string, unknown>): { days?: AdminDays } => ({ days: s.days === undefined || asAdminDays(s.days) === 30 ? undefined : asAdminDays(s.days) }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: async ({ params, deps }) => {
    const d = await getAdminShop({ data: { id: params.id, days: deps.days } })
    if (!d) throw notFound()
    return d
  },
  component: ShopPage,
})

function ShopPage() {
  const t = useT()
  const lang = useLang()
  const d = Route.useLoaderData()
  const { date } = useDates()
  const planText = usePlanText()
  const s = d.shop
  const f = d.features
  const ago = (ms: number | null) => (ms ? timeAgo(ms, lang) : '—')
  const on = (v: boolean) => (v ? t('Yes') : t('No'))
  const source: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp', facebook: 'Facebook', google: 'Google', direct: t('Direct'), manual: t('Recorded by hand'), bag_link: t('Bag links'), unknown: t('Before tracking') }
  const steps = [
    { label: t('Visits'), n: d.funnel.visits },
    { label: t('Looked at a product'), n: d.funnel.product },
    { label: t('Added to bag'), n: d.funnel.bag },
    { label: t('Started checkout'), n: d.funnel.checkout },
    { label: t('Orders'), n: d.funnel.orders },
  ]
  const story: [string, number | null][] = [
    [t('Opened'), s.created_at],
    [t('First product'), d.dates.first_product],
    [t('First visit'), d.dates.first_visit],
    [t('First order'), d.dates.first_order],
    [t('Fifth order'), d.dates.fifth_order],
    [t('Last order'), s.last_order],
  ]
  const periodSales = d.sales.reduce((sum, p) => sum + p.value, 0)

  return (
    <>
      <Link to="/admin" search={{ tab: 'shops', days: d.days === 30 ? undefined : d.days }} className="mt-4 inline-flex h-9 items-center gap-2 text-[14px] font-medium text-ink-2 hover:text-ink lg:mt-0">
        <ArrowLeft size={16} strokeWidth={1.8} /> {t('Shops')}
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 basis-[280px] items-center gap-4">
          <ShopAvatar name={s.name} logo={s.logo_key} className="h-14 w-14 text-[18px]" />
          <div className="min-w-0">
            <h1 className="title text-[24px] [overflow-wrap:anywhere] md:text-[30px]">{s.name}</h1>
            <p className="mt-1 text-[14px] text-muted">
              {planText(s)} · {t(CATEGORIES.find((c) => c.id === s.category)?.label ?? s.category)}
              {d.dates.location ? ` · ${d.dates.location}` : ''}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm h-10 flex-1 md:h-9 md:flex-none">
            {t('View shop')} <ArrowUpRight size={14} strokeWidth={1.6} />
          </a>
          <a href={waLink(s.phone, '')} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm h-10 flex-1 md:h-9 md:flex-none" aria-label={t('Message {name} on WhatsApp', { name: s.owner })}>
            <WhatsAppIcon size={15} /> {localPhone(s.phone)}
          </a>
        </div>
      </header>
      <Ranges wide className="mt-4 md:hidden" />
      <Ranges className="mt-5 hidden md:flex" />

      <div className="mt-4 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi label={t('Sales')} value={<KpiMoney value={s.sales} />} note={t('last {n} days', { n: d.days })} />
        <Kpi label={t('Orders')} value={num(s.orders)} note={t('online, last {n} days', { n: d.days })} />
        <Kpi label={t('Visits')} value={num(s.visits)} note={t('last {n} days', { n: d.days })} />
        <Kpi label={t('Visits that ordered')} value={`${s.visits ? ((s.orders / s.visits) * 100).toFixed(1) : '0'}%`} note={t('orders for every 100 visits')} />
      </div>

      <div className="mt-3 grid gap-3 md:mt-4 md:gap-4 lg:grid-cols-12">
        <section className="card min-w-0 p-5 md:p-6 lg:col-span-8">
          <DayChart points={d.sales} money total={periodSales} caption={t('Sales, last {n} days', { n: d.days })} />
        </section>
        <Card title={t('From visit to order')} sub={t('Visits that reached each step, last {n} days', { n: d.days })} className="lg:col-span-4">
          <BarList empty="" total={Math.max(d.funnel.visits, d.funnel.orders, 1)} rows={steps.map((x) => ({ label: x.label, value: x.n, text: `${num(x.n)}${d.funnel.visits ? ` · ${pct(x.n, d.funnel.visits)}%` : ''}` }))} />
        </Card>

        <Card title={t('Seller and shop')} className="lg:col-span-4">
          <Row label={t('Seller')} value={s.owner} />
          <Row label={t('Phone')} value={localPhone(s.phone)} />
          <Row label={t('Last log-in')} value={ago(s.last_login)} />
          <Row label={t('Link')} value={<span className="code">{s.domain ?? `shopi.tz/${s.slug}`}</span>} />
          <Row label={t('Language')} value={s.lang === 'sw' ? 'Kiswahili' : 'English'} />
          <Row label={t('Set up')} value={`${s.setup}/4`} />
          <Row label={t('App on the Home Screen')} value={s.app ? `${s.app === 'ios' ? 'iPhone' : s.app === 'android' ? 'Android' : t('Yes')} · ${ago(s.appSeen)}` : t('No')} />
          <Row label={t('Notifications on')} value={on(s.notifications)} />
          <Row label={t('Own look')} value={on(s.look)} />
          <Row label={t('Own domain')} value={s.domain ?? t('No')} />
          {d.dates.instagram && <Row label="Instagram" value={`@${d.dates.instagram}`} />}
          {d.dates.tiktok && <Row label="TikTok" value={`@${d.dates.tiktok}`} />}
        </Card>
        <Card title={t('What the shop has')} sub={t('All time')} className="lg:col-span-4">
          <Row label={t('Products')} value={num(s.products)} />
          <Row label={t('Hidden products')} value={num(f.hidden)} />
          <Row label={t('Sold out')} value={num(f.sold_out)} />
          <Row label={t('Products without a photo')} value={num(s.noPhoto)} />
          <Row label={t('Collections')} value={num(f.collections)} />
          <Row label={t('Discount codes')} value={num(f.discounts)} />
          <Row label={t('Bag links')} value={num(f.bags)} />
          <Row label={t('Buyers waiting for stock')} value={num(f.alerts)} />
          <Row label={t('Sales recorded by hand')} value={num(f.manual)} />
        </Card>
        <Card title={t('Its story')} sub={t('All time')} className="lg:col-span-4">
          {story.map(([label, ms]) => (
            <Row key={label} label={label} value={ms ? date(ms, true) : '—'} />
          ))}
          <Row label={t('Buyers')} value={num(f.buyers)} />
          <Row label={t('Cancelled orders')} value={num(f.cancelled)} />
          <Row
            label={
              <span className="flex items-center gap-2">
                {f.to_check > 0 && <span className="signal" />}
                {t('Payments to check')}
              </span>
            }
            value={num(f.to_check)}
          />
          <Row label={t('Sales, all time')} value={<Money value={f.sales_ever} cur="text-[0.8em] text-muted" />} strong />
        </Card>

        <Card title={t('Best sellers')} sub={t('Last {n} days', { n: d.days })} className="lg:col-span-8 lg:self-start">
          <ProductTable rows={d.best} empty={t('No orders yet')} withShop={false} />
        </Card>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:col-span-4 lg:grid-cols-1 lg:content-start">
          <Card title={t('Where orders come from')} sub={t('Last {n} days', { n: d.days })}>
            <BarList empty={t('No orders yet')} rows={d.sources.map((r) => ({ label: source[r.source] ?? r.source, value: r.orders }))} />
          </Card>
          <Card title={t('Latest orders')}>
            {d.latest.length ? (
              <ul className="divide-y divide-line">
                {d.latest.map((o) => (
                  <li key={o.code} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="code min-w-0 truncate">{o.code}</span>
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
      </div>
    </>
  )
}
