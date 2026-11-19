import { Link, createFileRoute, redirect, useRouteContext } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, ChartColumn, Check, ChevronRight, Copy, FileSpreadsheet, Gem, Plus, QrCode as QrCodeIcon, ReceiptText, Share2 } from 'lucide-react'
import { useState } from 'react'
import { CardHead, Delta, Empty, Img, LangSwitch, Money, Notice, Page, PageHead, PhoneBar, scrubIndex, Sheet, ShopAvatar, Stat, StatusPill, Toast, useEntrance } from '#/components/ui'
import { BioSteps } from '#/components/setup'
import { PhoneAlertsCard } from '#/components/phone-app'
import { EmailRow } from '#/components/email'
import { QrSheet } from '#/components/qr-sheet'
import { getDashboard } from '#/lib/api/merchant'
import { shortDay, timeAgo, tzs } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import type { PlanState } from '#/lib/plans'
import { shareLink, useOrigin } from '#/lib/share'
import { track } from '#/lib/analytics'
import { productNeed, scoreCount, shopScore, SCORE_PRODUCTS, type ScoreFacts, type ScoreItem } from '#/lib/score'
import { minuteOf, timeText } from '#/lib/booking'
import { inSetup } from '#/lib/setup'

export const Route = createFileRoute('/app/')({
  // A shop still in the five-step setup goes back to the step it stopped at (src/lib/setup.ts).
  beforeLoad: ({ context }) => {
    if (context.session.shop?.role === 'owner' && inSetup(context.session.shop.setup)) throw redirect({ to: '/onboard' })
  },
  loader: () => getDashboard(),
  component: Dashboard,
})

const n = (v: number) => Math.round(v).toLocaleString('en-US')
const compact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)))

function Dashboard() {
  const rise = useEntrance()
  const rise2 = useEntrance('rise-2')
  const rise3 = useEntrance('rise-3')
  const t = useT()
  const lang = useLang()
  const d = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  // A share from this page ticks "Your link shared" at once; the event itself reaches the server a moment later.
  const [sharedNow, setSharedNow] = useState(false)
  const origin = useOrigin()
  const url = `${origin}/${shop.slug}`
  const conversion = d.visits.shop ? Math.round((d.counts.online / d.visits.shop) * 1000) / 10 : 0
  const prevConversion = d.prev.visits ? Math.round((d.prev.online / d.prev.visits) * 1000) / 10 : 0
  const yesterday = d.days[d.days.length - 2]?.total ?? 0
  const date = new Date().toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Dar_es_Salaam' })

  // A new shop sees one thing at a time (17 Nov): its first product, then the shop score's next step and its link. The
  // numbers, charts and the notifications offer wait for what makes them mean something: a product, then a first order.
  // A business that sells services (roadmap `v-services`) starts from its first service where a shop starts from its
  // first product, and reads its diary first.
  const serves = !!d.score.serves
  const hasProducts = serves ? (d.score.services ?? 0) > 0 || d.hasProducts : d.hasProducts
  const hasOrders = d.recent.length > 0
  const vs7 = t('vs the 7 days before')

  // Shares from Home count for the shop score's "Your link shared" (a seller_share event).
  async function share() {
    const how = await shareLink(url, shop.name)
    if (how !== 'cancelled') {
      track('seller_share', { shopId: shop.id, detail: how === 'shared' ? 'home-native' : 'home-copy' })
      setSharedNow(true)
    }
    if (how === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('', url)
    }
    track('seller_share', { shopId: shop.id, detail: 'home-copy' })
    setSharedNow(true)
  }

  return (
    <Page nav wide>
      <PhoneBar
        lead={<ShopAvatar name={shop.name} logo={shop.logo_key} className="h-9 w-9 text-13" />}
        title={shop.name}
        right={
          <>
            <Link to="/app/analytics" className="icon-btn" aria-label={t('Analytics')}>
              <ChartColumn size={18} strokeWidth={1.75} />
            </Link>
            <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="icon-btn" aria-label={t('View shop')}>
              <ArrowUpRight size={18} strokeWidth={1.75} />
            </a>
          </>
        }
      />
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <p className="truncate text-14 text-muted">{date}</p>
        <LangSwitch />
      </div>
      <PageHead
        title={t('Today at {shop}', { shop: shop.name })}
        sub={date}
        right={
          <>
            <LangSwitch />
            <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              {t('View shop')} <ArrowUpRight size={16} strokeWidth={1.75} />
            </a>
            <button type="button" className="btn btn-sm" onClick={share}>
              <Share2 size={16} strokeWidth={1.75} /> {t('Share link')}
            </button>
          </>
        }
      />

      {/* What to do next, as one stack: the shop score (or the first product), then the quiet rows (Notice). */}
      <div className={`${rise} space-y-3`}>
        {d.diary && hasProducts && <DiaryCard diary={d.diary} />}
        {hasProducts ? (
          <>
            <ScoreCard facts={sharedNow ? { ...d.score, shared: true } : d.score} ai={d.ai} compact={hasOrders} onShare={share} onCopy={copyLink} copied={copied} />
            <PlanRow plan={d.plan} />
            <PhoneAlertsCard />
            <EmailRow state={d.email} />
          </>
        ) : (
          <>
            {serves ? <FirstServiceCard score={shopScore(d.score).score} /> : <FirstProductCard score={shopScore(d.score).score} />}
            <PlanRow plan={d.plan} />
          </>
        )}
      </div>

      {d.backInStock.length > 0 && (
        <section className={`${rise} card mt-6 overflow-hidden md:mt-8`}>
          <div className="px-5 pt-5 md:px-6">
            <CardHead icon={<span className="signal shrink-0" />} title={t('Back in stock, and buyers are waiting')} sub={t('They asked for a WhatsApp message when it came back. Open the product to send it.')} />
          </div>
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {d.backInStock.map((p) => (
              <li key={p.id}>
                <Link to="/app/products/$id" params={{ id: p.id }} hash="waiting" className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-page md:px-6">
                  <Img size="thumb" k={p.image} alt="" className="h-11 w-11 shrink-0 rounded-12" />
                  <span className="min-w-0 flex-1 truncate text-14 font-medium">{p.name}</span>
                  <span className="tnum shrink-0 text-14 text-ink-2">{t('{n} waiting', { n: p.waiting })}</span>
                  <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasProducts && !hasOrders && (
        <section className={`${rise2} card mt-6 p-6 md:mt-8 md:flex md:items-end md:justify-between md:gap-10 md:p-7`}>
          <div className="min-w-0">
            <CardHead title={t('Your shop is ready for its first order')} />
            <p className="mt-2 max-w-[52ch] text-14 leading-relaxed text-muted">
              {t('Put your link in your Instagram bio and on your WhatsApp status. Your first order shows up here.')}
            </p>
            <p className="code mt-4 truncate text-17">shopi.tz/{shop.slug}</p>
            {d.visits.shop > 0 && <p className="meta mt-1">{t('{n} visits', { n: n(d.visits.shop) })} · {t('Last 7 days')}</p>}
          </div>
          <div className="mt-5 flex gap-2 md:mt-0 md:w-[420px] md:shrink-0">
            <button type="button" className="btn btn-quiet flex-1 px-3" onClick={copyLink}>
              <Copy size={16} strokeWidth={1.75} /> {t('Copy')}
            </button>
            <button type="button" className="btn btn-quiet flex-1 px-3" onClick={() => setQrOpen(true)}>
              <QrCodeIcon size={16} strokeWidth={1.75} /> {t('QR code')}
            </button>
            <button type="button" className="btn flex-1 px-3" onClick={share}>
              <Share2 size={16} strokeWidth={1.75} /> {t('Share')}
            </button>
          </div>
          <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} />
        </section>
      )}

      {hasOrders && (
        <div className="mt-6 grid gap-4 md:mt-8 lg:grid-cols-12">
          {/* Today: the one dark card */}
          <section className={`${rise} relative flex min-h-[220px] flex-col overflow-hidden rounded-20 bg-ink p-6 text-white md:p-7 lg:col-span-5`}>
            <p className="text-14 text-white/60">{t('Sales today')}</p>
            <p className="mt-3 text-40 leading-none font-semibold tracking-[-0.04em] [font-stretch:108%] md:text-56">
              <Money value={d.today.total} cur="text-[0.36em] text-white/50 tracking-normal" />
            </p>
            <p className="mt-3 text-14 text-white/60">
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
                <p className="text-13 text-white/50">{t('Last 7 days')}</p>
                <p className="mt-1 text-17 font-medium">{tzs(d.sales.total)}</p>
              </div>
              <WeekBars days={d.days} />
            </div>
          </section>

          {/* What needs the seller now */}
          <section className={`${rise2} card flex flex-col p-2 lg:col-span-4`}>
            <CardHead title={t('Needs you')} className="px-4 pt-3 pb-2" />
            <TodoRow f="check" signal={d.queue.toConfirm > 0} count={d.queue.toConfirm} label={t('Payments to check')} sub={t('Buyers sent proof')} />
            <TodoRow f="send" count={d.queue.toSend} label={t('Orders to send')} sub={t('Paid and confirmed')} />
            <TodoRow f="way" count={d.queue.onTheWay} label={t('On the way')} sub={t('With your rider')} />
          </section>

          {/* Shop link */}
          <section className={`${rise3} card flex flex-col p-6 lg:col-span-3`}>
            <CardHead title={t('Your shop link')} />
            <p className="code mt-3 truncate text-17">shopi.tz/{shop.slug}</p>
            <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
              <Stat size="md" label={t('Visits')} value={n(d.visits.shop)} />
              <Stat size="md" label={t('Shares')} value={n(d.visits.share)} />
            </div>
            <p className="meta mt-1">{t('Last 7 days')}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-quiet btn-sm flex-1" onClick={copyLink}>
                <Copy size={16} strokeWidth={1.75} /> {t('Copy')}
              </button>
              <button type="button" className="btn btn-sm flex-1" onClick={share}>
                <Share2 size={16} strokeWidth={1.75} /> {t('Share')}
              </button>
            </div>
          </section>

          {/* Last 7 days */}
          <div className="-mb-1 flex items-baseline justify-between px-1 pt-2 lg:col-span-12">
            <CardHead title={t('Last 7 days')} />
            <Link to="/app/analytics" className="-my-2 flex items-center gap-1 py-2 text-13 text-muted transition-colors hover:text-ink">
              {t('All numbers')} <ArrowRight size={14} strokeWidth={1.75} />
            </Link>
          </div>
          <section className="card grid grid-cols-2 lg:col-span-12 lg:grid-cols-4">
            <Stat label={t('Sales')} value={<Money value={d.sales.total} cur="text-[0.62em] text-muted" />} foot={<Delta now={d.sales.total} before={d.prev.total} label={vs7} />} className="border-r border-b border-line p-5 md:p-6 lg:border-b-0" />
            <Stat label={t('Orders')} value={n(d.counts.all)} foot={<Delta now={d.counts.all} before={d.prev.orders} label={vs7} />} className="border-b border-line p-5 md:p-6 lg:border-r lg:border-b-0" />
            <Stat label={t('Shop visits')} value={n(d.visits.shop)} foot={<Delta now={d.visits.shop} before={d.prev.visits} label={vs7} />} className="border-r border-line p-5 md:p-6" />
            <Stat label={t('Visits that ordered')} value={`${conversion}%`} foot={<Delta now={conversion} before={prevConversion} label={vs7} />} className="p-5 md:p-6" />
          </section>

          <SalesChart days={d.days} total={d.sales.total} className="lg:col-span-8" />

          <section className="card p-6 lg:col-span-4">
            <CardHead
              title={t('Best sellers')}
              right={
                <Link to="/app/products" className="-my-2 flex items-center gap-1 py-2 text-13 text-muted transition-colors hover:text-ink">
                  {t('All products')}
                </Link>
              }
            />
            {d.top.length === 0 ? (
              <p className="mt-4 text-14 text-muted">{t('Your products will rank here once they get views and orders.')}</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {d.top.slice(0, 5).map((p, i) => {
                  const max = Math.max(...d.top.map((x) => x.sold), 1)
                  return (
                    <li key={p.id}>
                      <Link to="/app/products/$id" params={{ id: p.id }} className="group flex items-center gap-3">
                        <span className="tnum w-3 shrink-0 text-13 text-muted">{i + 1}</span>
                        <Img size="thumb" k={p.image} alt={p.name} className="h-11 w-11 shrink-0 rounded-12" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-14 font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{p.name}</p>
                            <p className="tnum shrink-0 text-14 font-medium">{n(p.sold)}</p>
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
            <CardHead
              title={t('Latest orders')}
              right={
                <Link to="/app/orders" className="-my-2 flex items-center gap-1 py-2 text-13 text-muted transition-colors hover:text-ink">
                  {t('All orders')} <ArrowRight size={14} strokeWidth={1.75} />
                </Link>
              }
              className="px-6 pt-5 pb-3"
            />
            {d.recent.length === 0 ? (
              <div className="px-6 pb-6">
                <Empty
                  icon={<ReceiptText size={20} strokeWidth={1.75} />}
                  title={t('No orders yet')}
                  body={t('Share your link on Instagram and your WhatsApp status. New orders show up here.')}
                  action={
                    <button type="button" className="btn btn-sm" onClick={share}>
                      <Share2 size={16} strokeWidth={1.75} /> {t('Share your link')}
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
                    <Img size="thumb" k={o.image} alt="" className="h-11 w-11 rounded-12" />
                    {/* Phone: name and total, then status and time, so the name keeps its room. */}
                    <div className="min-w-0 md:hidden">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-14 font-medium">{o.customer_name || t('Sale recorded by you')}</p>
                        <p className="tnum shrink-0 text-14 font-medium">{tzs(o.total)}</p>
                      </div>
                      <div className="flex h-6 items-center justify-between gap-3">
                        <StatusPill status={o.status} />
                        <p className="meta shrink-0">{timeAgo(o.created_at, lang)}</p>
                      </div>
                    </div>
                    <div className="hidden min-w-0 md:block">
                      <p className="truncate text-14 font-medium">{o.customer_name || t('Sale recorded by you')}</p>
                      <p className="meta mt-0.5 truncate">
                        #{o.code} · {timeAgo(o.created_at, lang)}
                      </p>
                    </div>
                    <p className="hidden truncate text-14 text-ink-2 md:block">{t(o.items === 1 ? '{n} item' : '{n} items', { n: o.items })}</p>
                    <div className="hidden md:block">
                      <StatusPill status={o.status} />
                    </div>
                    <p className="tnum hidden text-right text-14 font-medium md:block">{tzs(o.total)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <Toast show={copied}>{t('Link copied')}</Toast>
    </Page>
  )
}

function TodoRow({ f, count, label, sub, signal = false }: { f: 'check' | 'send' | 'way'; count: number; label: string; sub: string; signal?: boolean }) {
  return (
    <Link to="/app/orders" search={{ f }} className="group flex items-center gap-4 rounded-14 px-4 py-3 transition-colors hover:bg-page">
      <span className={`tnum flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-17 font-semibold ${signal ? 'bg-moto text-ink' : count ? 'bg-ink text-white' : 'bg-well text-muted'}`}>
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-14 font-medium">{label}</span>
        <span className="block text-13 text-muted">{sub}</span>
      </span>
      <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
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
          className={`w-2 rounded-2 ${i === days.length - 1 ? 'bg-moto' : 'bg-white/25'}`}
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
  const dayName = (ms: number) => shortDay(lang, new Date(ms).getUTCDay())
  const longDay = (ms: number) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const chosen = days[sel]
  return (
    <section className={`card p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <CardHead title={t('Sales, last 7 days')} sub={t('Paid and cash orders, by day')} />
        <p className="text-right">
          <span className="block text-13 text-muted">{sel === days.length - 1 ? t('Today') : longDay(chosen.day)}</span>
          <span className="tnum text-20 font-semibold tracking-[-0.02em]">{tzs(chosen.total)}</span>
        </p>
      </div>
      <div className="relative mt-6 h-[200px] md:h-[240px]">
        <div className="absolute inset-0 bottom-6 left-10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(i / 3) * 100}%` }}>
              <span className="meta absolute -top-2 -left-10 w-8 text-right text-11">{compact(step * i)}</span>
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
                    className={`w-full rounded-t-4 transition-colors ${today ? 'bg-moto' : sel === i ? 'bg-ink' : 'bg-raised group-hover:bg-faint'}`}
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

type HomeDiary = NonNullable<Awaited<ReturnType<typeof getDashboard>>['diary']>

/**
 * Today's diary on Home, for a business that takes bookings: who is coming and when, the next client marked, and what
 * waits for the business (requests to confirm, tomorrow's reminders). The whole diary is one tap away.
 */
function DiaryCard({ diary }: { diary: HomeDiary }) {
  const t = useT()
  const nowMin = minuteOf(Date.now())
  const coming = diary.today.filter((b) => b.status === 'requested' || b.status === 'confirmed')
  const next = coming.find((b) => b.end_min > nowMin)
  const note = [
    diary.toConfirm ? t('{n} to confirm', { n: diary.toConfirm }) : '',
    diary.tomorrow ? t(diary.tomorrow === 1 ? '{n} client tomorrow' : '{n} clients tomorrow', { n: diary.tomorrow }) : '',
  ].filter(Boolean)
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-5 md:px-6">
        <CardHead
          icon={diary.toConfirm > 0 ? <span className="signal" aria-hidden /> : undefined}
          title={diary.today.length ? t(diary.today.length === 1 ? '{n} booking today' : '{n} bookings today', { n: diary.today.length }) : t('No bookings today')}
          sub={note.length ? note.join(' · ') : diary.today.length ? undefined : t('Share your link so clients can book a time.')}
          right={
            <Link to="/app/bookings" className="text-13 text-muted transition-colors hover:text-ink">
              {t('Open the diary')}
            </Link>
          }
        />
      </div>
      {diary.today.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {diary.today.slice(0, 6).map((b) => (
            <li key={b.id}>
              <Link to="/app/bookings" className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-page md:px-6">
                <span className={`tnum w-12 shrink-0 text-15 font-semibold ${b.end_min <= nowMin ? 'text-muted' : ''}`}>{timeText(b.start_min)}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-15 font-medium ${b.end_min <= nowMin ? 'text-muted' : ''}`}>{b.customer_name}</span>
                  <span className="block truncate text-13 text-muted">{b.service_name}</span>
                </span>
                {b.id === next?.id && <span className="shrink-0 rounded-full bg-moto-soft px-2.5 py-1 text-12 font-medium text-moto-ink">{t('Next')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pb-5" />
      )}
      {diary.today.length > 6 && (
        <Link to="/app/bookings" className="block border-t border-line px-5 py-3 text-14 text-muted transition-colors hover:text-ink md:px-6">
          {t('{n} more', { n: diary.today.length - 6 })}
        </Link>
      )}
    </section>
  )
}

/** A business with no services yet: the one thing to do, large, before anything else on Home. */
function FirstServiceCard({ className = '', score }: { className?: string; score: number }) {
  const t = useT()
  return (
    <section className={`${className} card p-6 md:p-8`}>
      <ScoreBar score={score} className="mb-5" />
      <h2 className="title text-24 md:text-32">{t('Add your first service')}</h2>
      <p className="mt-2 max-w-[44ch] text-15 leading-relaxed text-ink-2">{t('What clients book, how long it takes and the price. They pick a free time on your link.')}</p>
      <div className="mt-6">
        <Link to="/app/services" search={{ add: 1 }} className="btn btn-lg">
          <Plus size={18} strokeWidth={2.25} /> {t('Add service')}
        </Link>
      </div>
    </section>
  )
}

/** A shop with no products yet: the one thing to do, large, before anything else on Home. */
function FirstProductCard({ className = '', score }: { className?: string; score: number }) {
  const t = useT()
  return (
    <section className={`${className} card p-6 md:flex md:items-center md:gap-10 md:p-8`}>
      <div className="min-w-0 flex-1">
        <ScoreBar score={score} className="mb-5" />
        <h2 className="title text-24 md:text-32">{t('Add your first product')}</h2>
        <p className="mt-2 max-w-[44ch] text-15 leading-relaxed text-ink-2">{t('A photo, a name and a price. Buyers can order it the moment you save it.')}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link to="/app/products/new" className="btn btn-lg">
            <Plus size={18} strokeWidth={2.25} /> {t('Add product')}
          </Link>
          <Link to="/app/products/import" className="btn btn-ghost btn-lg">
            <FileSpreadsheet size={18} strokeWidth={1.75} /> {t('Import from a sheet')}
          </Link>
        </div>
      </div>
      {/* The empty product tile sellers will see on Products, as a picture of what comes next (desktop only). */}
      <Link
        to="/app/products/new"
        tabIndex={-1}
        aria-hidden="true"
        className="group hidden aspect-[4/5] w-[200px] shrink-0 flex-col items-center justify-center gap-3 rounded-16 border border-dashed border-line-strong text-center transition-colors hover:border-ink md:flex"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white transition-transform group-active:scale-95">
          <Plus size={20} strokeWidth={2.25} />
        </span>
        <span className="px-4 text-13 text-muted">{t('Photo, price, sizes')}</span>
      </Link>
    </section>
  )
}

/** The plan line on Home: a quiet way to Tembo for free shops, and Tembo's renewal in its last 30 days. */
function PlanRow({ plan }: { plan: PlanState | null }) {
  const t = useT()
  // The plan is the owner's: a Manager's Home doesn't offer it.
  const owner = useRouteContext({ from: '/app' }).shop.role === 'owner'
  if (!owner || !plan || plan.kind === 'demo' || (plan.kind === 'tembo' && plan.daysLeft > 30)) return null
  const title =
    plan.kind === 'tembo'
      ? t(plan.daysLeft === 1 ? 'Tembo ends in {n} day' : 'Tembo ends in {n} days', { n: plan.daysLeft })
      : t('You are on Free')
  return (
    <Notice
      icon={<Gem size={18} strokeWidth={1.75} />}
      title={title}
      sub={plan.kind === 'tembo' ? t('Renew') : t('See what Tembo adds')}
      signal={plan.kind === 'tembo' && plan.daysLeft <= 3}
      to="/app/plan"
    />
  )
}

/** "Your shop is 40% ready" with its bar. */
function ScoreBar({ score, className = '' }: { score: number; className?: string }) {
  const t = useT()
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-1.5 max-w-[220px] flex-1 overflow-hidden rounded-full bg-well" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={t('Your shop is {n}% ready', { n: score })}>
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${score}%` }} />
      </div>
      <span className="meta shrink-0">{t('Your shop is {n}% ready', { n: score })}</span>
    </div>
  )
}

/**
 * The shop score on Home (src/lib/score.ts): how ready the shop is, the one next step with its button, and every item
 * behind "See all". Gone at 100%. A shop with orders gets it as one line that opens, so it never pushes the day's
 * numbers down.
 */
function ScoreCard({
  facts,
  ai,
  compact,
  onShare,
  onCopy,
  copied,
  className = '',
}: {
  facts: ScoreFacts
  ai: boolean
  compact: boolean
  onShare: () => void
  onCopy: () => void
  copied: boolean
  className?: string
}) {
  const t = useT()
  const { score, items, next } = shopScore(facts)
  const [open, setOpen] = useState(!compact)
  const [all, setAll] = useState(false)
  const [bioHelp, setBioHelp] = useState(false)
  // Every hook before the early return: a share that completes the last item would change the hook count.
  const owner = useRouteContext({ from: '/app' }).shop.role === 'owner'
  if (!next) return null
  const step = nextStep(next, facts, ai, t, { onShare, onBio: () => setBioHelp(true) }, owner)

  if (!open)
    return <Notice className={className} icon={<span className="tnum">{score}%</span>} title={step.title} sub={t('Your shop is {n}% ready', { n: score })} onClick={() => setOpen(true)} />

  return (
    <section className={`${className} card p-5 md:p-6`}>
      <CardHead
        title={t('Your shop is {n}% ready', { n: score })}
        right={
          <button type="button" className="-my-2 shrink-0 py-2 text-13 text-muted transition-colors hover:text-ink" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? t('Hide') : t('See all')}
          </button>
        }
      />
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-well" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${score}%` }} />
      </div>
      <div className="mt-4 rounded-16 bg-page p-4 md:flex md:items-center md:justify-between md:gap-8 md:p-5">
        <div className="min-w-0">
          <p className="meta">{t('Next')}</p>
          <p className="mt-0.5 text-15 font-medium">{step.title}</p>
          <p className="mt-1 max-w-[56ch] text-14 leading-5 text-muted">{step.sub}</p>
        </div>
        {step.action && <div className="mt-4 flex flex-wrap gap-2 md:mt-0 md:shrink-0">{step.action}</div>}
      </div>
      {all && (
        <ul className="fade mt-3 grid gap-x-6 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key} className="flex min-h-11 items-center gap-3 border-b border-line py-2 text-14 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${i.done ? 'bg-ink text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}>
                {i.done && <Check size={12} strokeWidth={2.25} />}
              </span>
              <span className={`min-w-0 flex-1 ${i.done ? 'text-muted' : ''}`}>{t(i.label)}</span>
              <span className="meta shrink-0">{i.key === 'products' && !i.done ? `${scoreCount(facts)}/${SCORE_PRODUCTS}` : `${i.points}/${i.max}`}</span>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={bioHelp} onClose={() => setBioHelp(false)} title={t('Put it in your Instagram bio')}>
        <BioSteps onCopy={onCopy} copied={copied} />
      </Sheet>
    </section>
  )
}

/** The next step's words and button, by what is missing. */
function nextStep(item: ScoreItem, f: ScoreFacts, ai: boolean, t: ReturnType<typeof useT>, on: { onShare: () => void; onBio: () => void }, owner = true) {
  const go = (to: string, label: string) => (
    <Link to={to} className="btn btn-sm">
      {label} <ArrowRight size={16} strokeWidth={1.75} />
    </Link>
  )
  if (f.serves && item.key === 'products') {
    const left = SCORE_PRODUCTS - scoreCount(f)
    return {
      title: (f.services ?? 0) === 0 ? t('Add your first service') : t(left === 1 ? 'Add 1 more service' : 'Add {n} more services', { n: left }),
      sub: t('Three services give clients something to choose from.'),
      action: (
        <Link to="/app/services" search={{ add: 1 }} className="btn btn-sm">
          {t('Add service')} <ArrowRight size={16} strokeWidth={1.75} />
        </Link>
      ),
    }
  }
  if (f.serves && item.key === 'payment')
    return { title: t('Set your working hours'), sub: t('Clients can book once you say which days and hours you work.'), action: go('/app/hours', t('Set my hours')) }
  if (f.serves && item.key === 'delivery')
    return { title: t('Say where you are'), sub: t('Clients need to find you. Add your area and street in Shop settings, and a Google Maps link if you have one.'), action: go('/app/shop', t('Open Shop settings')) }
  switch (item.key) {
    case 'products': {
      const need = productNeed(f)
      if (need === 'description' && f.fixId)
        return {
          title: t(f.noDescription === 1 ? '1 product has no description' : '{n} products have no description', { n: f.noDescription }),
          sub: ai ? t('Buyers ask less when a product says what it is. Shopi can write it from the name and your notes.') : t('Buyers ask less when a product says what it is.'),
          action: (
            <Link to="/app/products/$id" params={{ id: f.fixId }} className="btn btn-sm">
              {ai ? t('Write it for me') : t('Add a description')} <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          ),
        }
      if (need === 'photo' && f.fixId)
        return {
          title: t(f.noPhoto === 1 ? '1 product has no photo' : '{n} products have no photo', { n: f.noPhoto }),
          sub: t('Buyers order what they can see.'),
          action: (
            <Link to="/app/products/$id" params={{ id: f.fixId }} className="btn btn-sm">
              {t('Add a photo')} <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          ),
        }
      const left = SCORE_PRODUCTS - Math.min(SCORE_PRODUCTS, f.complete)
      return {
        title: t(left === 1 ? 'Add 1 more product' : 'Add {n} more products', { n: left }),
        sub: t('Three products with a photo, a price and a description make a shop worth looking through.'),
        action: (
          <>
            {go('/app/products/new', t('Add product'))}
            <Link to="/app/products/import" className="btn btn-ghost btn-sm">
              <FileSpreadsheet size={16} strokeWidth={1.75} /> {t('Import from a sheet')}
            </Link>
          </>
        ),
      }
    }
    // How buyers pay and reach the shop is the owner's to set (src/lib/staff.ts): a Manager sees who to ask.
    case 'payment':
      return owner
        ? { title: t('Add your Lipa Namba'), sub: t('Buyers have no way to pay you yet. Add your Lipa Namba, or turn on cash on delivery.'), action: go('/app/shop', t('Open Shop settings')) }
        : { title: t('Add a Lipa Namba'), sub: t('Buyers have no way to pay yet. Only the shop’s owner can add the Lipa Namba.'), action: null }
    case 'whatsapp':
      return owner
        ? { title: t('Add your WhatsApp number'), sub: t('Buyers message you there about their orders.'), action: go('/app/shop', t('Open Shop settings')) }
        : { title: t('Add a WhatsApp number'), sub: t('Buyers message the shop there. Only the shop’s owner can add it.'), action: null }
    case 'logo':
      return { title: t('Add your logo'), sub: t('It shows on your shop, on your QR code and when your link is shared.'), action: go('/app/shop', t('Add your logo')) }
    case 'delivery':
      return { title: t('Say where you deliver'), sub: t('Buyers ask this before anything else. List your areas, or say you send to other regions.'), action: go('/app/shop', t('Add delivery areas')) }
    case 'share':
      return {
        title: t('Share your link'),
        sub: t('Send it to your customers on WhatsApp and put it on your status.'),
        action: (
          <button type="button" className="btn btn-sm" onClick={on.onShare}>
            <Share2 size={16} strokeWidth={1.75} /> {t('Share')}
          </button>
        ),
      }
    default:
      return {
        title: t('Put your link in your Instagram bio'),
        sub: t('This is ticked when a buyer arrives from Instagram or TikTok.'),
        action: (
          <button type="button" className="btn btn-sm" onClick={on.onBio}>
            {t('Show me how')}
          </button>
        ),
      }
  }
}
