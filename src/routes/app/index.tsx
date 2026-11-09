import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, ChartColumn, Check, ChevronRight, Copy, ReceiptText, Share2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Delta, Empty, Img, LangSwitch, Money, Page, ShopAvatar, StatusPill, Toast, scrubIndex } from '#/components/ui'
import { getDashboard } from '#/lib/api/merchant'
import { timeAgo, tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { shareLink, useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/')({
  loader: () => getDashboard(),
  component: Dashboard,
})

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const compact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)))

function Dashboard() {
  const t = useT()
  const lang = useLang()
  const d = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const [copied, setCopied] = useState(false)
  const origin = useOrigin()
  const url = `${origin}/${shop.slug}`
  const conversion = d.visits.shop ? Math.round((d.counts.all / d.visits.shop) * 1000) / 10 : 0
  const prevConversion = d.prev.visits ? Math.round((d.prev.orders / d.prev.visits) * 1000) / 10 : 0
  const yesterday = d.days[d.days.length - 2]?.total ?? 0
  const date = new Date().toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Dar_es_Salaam' })

  const setupSteps = [
    { done: d.setup.products, label: t('Add your first product'), to: '/app/products/new' },
    { done: d.setup.payment, label: t('Add your Lipa Namba'), to: '/app/shop' },
    { done: d.setup.delivery, label: t('Set delivery areas'), to: '/app/shop' },
    { done: d.setup.logo, label: t('Add a shop logo'), to: '/app/shop' },
  ]
  const setupDone = setupSteps.filter((s) => s.done).length
  const vs7 = t('vs the 7 days before')

  async function share() {
    if ((await shareLink(url, shop.name)) === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <Page nav wide>
      <header className="flex items-center gap-3 md:items-end">
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-10 w-10 text-[14px] md:hidden" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-muted md:text-[14px]">{date}</p>
          <h1 className="title mt-0.5 truncate text-[22px] md:mt-1 md:text-[34px]">
            <span className="md:hidden">{shop.name}</span>
            <span className="hidden md:inline">{t('Today at {shop}', { shop: shop.name })}</span>
          </h1>
        </div>
        <LangSwitch />
        <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm hidden md:inline-flex">
          {t('View shop')} <ArrowUpRight size={15} strokeWidth={1.75} />
        </a>
        <button type="button" className="btn btn-sm hidden md:inline-flex" onClick={share}>
          <Share2 size={15} strokeWidth={1.75} /> {t('Share link')}
        </button>
        <Link to="/app/analytics" className="icon-btn md:hidden" aria-label={t('Analytics')}>
          <ChartColumn size={18} strokeWidth={1.6} />
        </Link>
        <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="icon-btn md:hidden" aria-label={t('View shop')}>
          <ArrowUpRight size={18} strokeWidth={1.6} />
        </a>
      </header>

      {setupDone < setupSteps.length && (
        <section className="rise card mt-6 p-5 md:mt-8 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold">{t('Finish setting up your shop')}</h2>
              <p className="mt-0.5 text-[14px] text-muted">{t('Buyers trust a shop with a logo, a Lipa Namba and delivery areas.')}</p>
            </div>
            <p className="tnum shrink-0 text-[14px] text-muted">
              {setupDone}/{setupSteps.length}
            </p>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-well">
            <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${(setupDone / setupSteps.length) * 100}%` }} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {setupSteps.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className={`flex h-12 items-center gap-3 rounded-[14px] px-3 text-[14px] transition-colors ${s.done ? 'text-muted' : 'bg-page font-medium hover:bg-well'}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.done ? 'bg-ink text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}>
                  {s.done && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={s.done ? 'line-through decoration-line-strong' : ''}>{s.label}</span>
                {!s.done && <ChevronRight size={16} strokeWidth={1.6} className="ml-auto text-muted" />}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-4 md:mt-8 lg:grid-cols-12">
        {/* Today: the one dark card */}
        <section className="rise relative flex min-h-[220px] flex-col overflow-hidden rounded-[24px] bg-ink p-6 text-white md:p-7 lg:col-span-5">
          <p className="text-[14px] text-white/60">{t('Sales today')}</p>
          <p className="mt-3 text-[44px] leading-none font-semibold tracking-[-0.04em] [font-stretch:108%] md:text-[56px]">
            <Money value={d.today.total} cur="text-[0.36em] text-white/50 tracking-normal" />
          </p>
          <p className="mt-3 text-[14px] text-white/60">
            {t(d.today.orders === 1 ? '{n} order today' : '{n} orders today', { n: d.today.orders })}
            {yesterday > 0 && (
              <>
                {' · '}
                <span className="text-white">
                  {d.today.total >= yesterday ? '↑' : '↓'} {Math.abs(Math.round(((d.today.total - yesterday) / yesterday) * 100))}%
                </span>{' '}
                {t('vs yesterday')}
              </>
            )}
          </p>
          <div className="mt-auto flex items-end justify-between gap-4 border-t border-white/10 pt-5">
            <div>
              <p className="text-[13px] text-white/50">{t('Last 7 days')}</p>
              <p className="mt-1 text-[17px] font-medium">{tzs(d.sales.total)}</p>
            </div>
            <WeekBars days={d.days} />
          </div>
        </section>

        {/* What needs the seller now */}
        <section className="rise-2 card flex flex-col p-2 lg:col-span-4">
          <h2 className="px-4 pt-3 pb-2 text-[15px] font-semibold">{t('Needs you')}</h2>
          <TodoRow f="check" signal={d.queue.toConfirm > 0} count={d.queue.toConfirm} label={t('Payments to check')} sub={t('Buyers sent proof')} />
          <TodoRow f="send" count={d.queue.toSend} label={t('Orders to send')} sub={t('Paid and confirmed')} />
          <TodoRow f="way" count={d.queue.onTheWay} label={t('On the way')} sub={t('With your rider')} />
        </section>

        {/* Shop link */}
        <section className="rise-3 card flex flex-col p-6 lg:col-span-3">
          <h2 className="text-[15px] font-semibold">{t('Your shop link')}</h2>
          <p className="code mt-3 truncate text-[17px]">rizk.tz/{shop.slug}</p>
          <dl className="mt-auto grid grid-cols-2 gap-3 pt-6">
            <div>
              <dt className="text-[13px] text-muted">{t('Visits')}</dt>
              <dd className="tnum mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">{n(d.visits.shop)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">{t('Shares')}</dt>
              <dd className="tnum mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">{n(d.visits.share)}</dd>
            </div>
          </dl>
          <p className="meta mt-1">{t('Last 7 days')}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn btn-quiet btn-sm flex-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                } catch {
                  window.prompt('', url)
                }
              }}
            >
              <Copy size={15} strokeWidth={1.6} /> {t('Copy')}
            </button>
            <button type="button" className="btn btn-sm flex-1" onClick={share}>
              <Share2 size={15} strokeWidth={1.6} /> {t('Share')}
            </button>
          </div>
        </section>

        {/* Last 7 days */}
        <div className="-mb-1 flex items-baseline justify-between px-1 pt-2 lg:col-span-12">
          <h2 className="text-[15px] font-semibold">{t('Last 7 days')}</h2>
          <Link to="/app/analytics" className="-my-2 flex items-center gap-1 py-2 text-[13px] text-muted transition-colors hover:text-ink">
            {t('All numbers')} <ArrowRight size={14} strokeWidth={1.75} />
          </Link>
        </div>
        <section className="card grid grid-cols-2 lg:col-span-12 lg:grid-cols-4">
          <Stat label={t('Sales')} value={<Money value={d.sales.total} cur="text-[0.62em] text-muted" />} foot={<Delta now={d.sales.total} before={d.prev.total} label={vs7} />} className="border-r border-b border-line lg:border-b-0" />
          <Stat label={t('Orders')} value={n(d.counts.all)} foot={<Delta now={d.counts.all} before={d.prev.orders} label={vs7} />} className="border-b border-line lg:border-r lg:border-b-0" />
          <Stat label={t('Shop visits')} value={n(d.visits.shop)} foot={<Delta now={d.visits.shop} before={d.prev.visits} label={vs7} />} className="border-r border-line" />
          <Stat label={t('Visits that ordered')} value={`${conversion}%`} foot={<Delta now={conversion} before={prevConversion} label={vs7} />} />
        </section>

        <SalesChart days={d.days} total={d.sales.total} className="lg:col-span-8" />

        <section className="card p-6 lg:col-span-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">{t('Best sellers')}</h2>
            <Link to="/app/products" className="-my-2 flex items-center gap-1 py-2 text-[13px] text-muted transition-colors hover:text-ink">
              {t('All products')}
            </Link>
          </div>
          {d.top.length === 0 ? (
            <p className="mt-4 text-[14px] text-muted">{t('Your products will rank here once they get views and orders.')}</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {d.top.slice(0, 5).map((p, i) => {
                const max = Math.max(...d.top.map((x) => x.sold), 1)
                return (
                  <li key={p.id}>
                    <Link to="/app/products/$id" params={{ id: p.id }} className="group flex items-center gap-3">
                      <span className="tnum w-3 shrink-0 text-[13px] text-muted">{i + 1}</span>
                      <Img k={p.image} alt={p.name} className="h-11 w-11 shrink-0 rounded-[10px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[14px] font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{p.name}</p>
                          <p className="tnum shrink-0 text-[14px] font-medium">{n(p.sold)}</p>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-well">
                          <div className="h-full rounded-full bg-ink" style={{ width: `${(p.sold / max) * 100}%` }} />
                        </div>
                        <p className="meta mt-1.5">
                          {t('{n} views', { n: compact(p.views) })} · {t('{n} shares', { n: compact(p.shares) })}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section className="card overflow-hidden lg:col-span-12">
          <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold">{t('Latest orders')}</h2>
            <Link to="/app/orders" className="-my-2 flex items-center gap-1 py-2 text-[13px] text-muted transition-colors hover:text-ink">
              {t('All orders')} <ArrowRight size={14} strokeWidth={1.75} />
            </Link>
          </div>
          {d.recent.length === 0 ? (
            <div className="px-6 pb-6">
              <Empty
                icon={<ReceiptText size={20} strokeWidth={1.5} />}
                title={t('No orders yet')}
                body={t('Share your link on Instagram and your WhatsApp status. New orders show up here.')}
                action={
                  <button type="button" className="btn btn-sm" onClick={share}>
                    <Share2 size={15} strokeWidth={1.6} /> {t('Share your link')}
                  </button>
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {d.recent.map((o) => (
                <Link
                  key={o.id}
                  to="/app/orders/$id"
                  params={{ id: o.id }}
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 px-6 py-3 transition-colors hover:bg-page md:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,1fr)_140px_120px] md:gap-x-6"
                >
                  <Img k={o.image} alt="" className="h-11 w-11 rounded-[10px]" />
                  {/* Phone: name and total, then status and time, so the name keeps its room. */}
                  <div className="min-w-0 md:hidden">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-[14px] font-medium">{o.customer_name}</p>
                      <p className="tnum shrink-0 text-[14px] font-medium">{tzs(o.total)}</p>
                    </div>
                    <div className="flex h-6 items-center justify-between gap-3">
                      <StatusPill status={o.status} />
                      <p className="meta shrink-0">{timeAgo(o.created_at, lang)}</p>
                    </div>
                  </div>
                  <div className="hidden min-w-0 md:block">
                    <p className="truncate text-[14px] font-medium">{o.customer_name}</p>
                    <p className="meta mt-0.5 truncate">
                      #{o.code} · {timeAgo(o.created_at, lang)}
                    </p>
                  </div>
                  <p className="hidden truncate text-[14px] text-ink-2 md:block">{t(o.items === 1 ? '{n} item' : '{n} items', { n: o.items })}</p>
                  <div className="hidden md:block">
                    <StatusPill status={o.status} />
                  </div>
                  <p className="tnum hidden text-right text-[14px] font-medium md:block">{tzs(o.total)}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <Toast show={copied}>{t('Link copied')}</Toast>
    </Page>
  )
}

function TodoRow({ f, count, label, sub, signal = false }: { f: 'check' | 'send' | 'way'; count: number; label: string; sub: string; signal?: boolean }) {
  return (
    <Link to="/app/orders" search={{ f }} className="group flex items-center gap-4 rounded-[14px] px-4 py-3 transition-colors hover:bg-page">
      <span className={`tnum flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-[17px] font-semibold ${signal ? 'bg-moto text-ink' : count ? 'bg-ink text-white' : 'bg-well text-muted'}`}>
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[13px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={16} strokeWidth={1.6} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function Stat({ label, value, foot, className = '' }: { label: string; value: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={`p-5 md:p-6 ${className}`}>
      <p className="text-[13px] text-muted md:text-[14px]">{label}</p>
      <p className="tnum mt-2 truncate text-[20px] font-semibold tracking-[-0.02em] md:text-[28px]">{value}</p>
      {foot && <div className="mt-2 hidden sm:block">{foot}</div>}
    </div>
  )
}

/** Seven small bars in the dark card: today is orange. */
function WeekBars({ days }: { days: { day: number; total: number }[] }) {
  const max = Math.max(...days.map((d) => d.total), 1)
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden>
      {days.map((d, i) => (
        <span
          key={d.day}
          className={`w-2 rounded-[2px] ${i === days.length - 1 ? 'bg-moto' : 'bg-white/25'}`}
          style={{ height: `${Math.max(8, (d.total / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function SalesChart({ days, total, className = '' }: { days: { day: number; total: number }[]; total: number; className?: string }) {
  const t = useT()
  const lang = useLang()
  const [sel, setSel] = useState(days.length - 1)
  const peak = Math.max(...days.map((d) => d.total), 1)
  // A round step for the axis, so the tallest bar nearly reaches the top line.
  const step = (() => {
    const raw = peak / 3
    const pow = 10 ** Math.floor(Math.log10(raw || 1))
    return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  })()
  const top = step * 3
  const SW_DAYS = ['Jpi', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Iju', 'Jms']
  const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayName = (ms: number) => (lang === 'sw' ? SW_DAYS : EN_DAYS)[new Date(ms).getUTCDay()]
  const longDay = (ms: number) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const chosen = days[sel]
  return (
    <section className={`card p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <h2 className="text-[15px] font-semibold">{t('Sales, last 7 days')}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{t('Paid and cash orders, by day')}</p>
        </div>
        <p className="text-right">
          <span className="block text-[13px] text-muted">{sel === days.length - 1 ? t('Today') : longDay(chosen.day)}</span>
          <span className="tnum text-[22px] font-semibold tracking-[-0.02em]">{tzs(chosen.total)}</span>
        </p>
      </div>
      <div className="relative mt-6 h-[200px] md:h-[240px]">
        <div className="absolute inset-0 bottom-6 left-10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(i / 3) * 100}%` }}>
              <span className="meta absolute -top-2 -left-10 w-8 text-right text-[11px]">{compact(step * i)}</span>
            </div>
          ))}
          <div
            className="absolute inset-0 flex touch-pan-y items-end gap-2 md:gap-4"
            onPointerDown={(e) => e.pointerType !== 'mouse' && setSel(scrubIndex(e, days.length))}
            onPointerMove={(e) => e.pointerType !== 'mouse' && setSel(scrubIndex(e, days.length))}
          >
            {days.map((d, i) => {
              const today = i === days.length - 1
              return (
                <button
                  key={d.day}
                  type="button"
                  className="group relative flex h-full flex-1 items-end"
                  onClick={() => setSel(i)}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(i)}
                  aria-label={`${longDay(d.day)}: ${tzs(d.total)}`}
                  aria-pressed={sel === i}
                >
                  <span
                    className={`w-full rounded-t-[6px] transition-colors ${today ? 'bg-moto' : sel === i ? 'bg-ink' : 'bg-raised group-hover:bg-faint'}`}
                    style={{ height: `${Math.max(1.5, (d.total / top) * 100)}%` }}
                  />
                </button>
              )
            })}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 left-10 flex gap-2 md:gap-4">
          {days.map((d, i) => (
            <span key={d.day} className={`meta flex-1 text-center ${i === days.length - 1 || sel === i ? 'text-ink' : ''}`}>
              {i === days.length - 1 ? (
                <>
                  <span className="sm:hidden">{dayName(d.day)}</span>
                  <span className="hidden sm:inline">{t('Today')}</span>
                </>
              ) : (
                dayName(d.day)
              )}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">{t('Total this week: {total}', { total: tzs(total) })}</p>
    </section>
  )
}
