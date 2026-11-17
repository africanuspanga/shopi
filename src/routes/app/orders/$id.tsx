import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { ArrowUpRight, Bike, ChevronRight, CircleCheck, CircleHelp, MapPin, Phone, ShoppingBag, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { Img, Page, StatusPill, TopBar } from '#/components/ui'
import { getOrder, setOrderStatus } from '#/lib/api/merchant'
import { localPhone, optionText, timeAgo, tzs, waLink, type OrderStatus, PAYMENT_LABEL } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { ROUGH_M, distance, pinLink } from '#/lib/location'
import type { PaymentCheck } from '#/lib/payment-sms'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/app/orders/$id')({
  loader: async ({ params }) => {
    const order = await getOrder({ data: { id: params.id } })
    if (!order) throw notFound()
    return order
  },
  component: OrderDetail,
})

type Action = { status: OrderStatus; label: string; kind: 'primary' | 'ghost' | 'danger'; ask?: string }

function OrderDetail() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const o = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const [busy, setBusy] = useState(false)
  const check: PaymentCheck | null = o.payment_check ? JSON.parse(o.payment_check) : null
  const cod = o.payment_method === 'cod'
  const manual = o.source === 'manual'

  async function move(status: OrderStatus, ask?: string) {
    if (ask && !window.confirm(ask)) return
    setBusy(true)
    await setOrderStatus({ data: { id: o.id, status } })
    await router.invalidate()
    setBusy(false)
  }

  const trackUrl = `${useOrigin()}/o/${o.code}`
  const waText = t('Hi {name}, this is {shop}. Your order #{code}: {url}', { name: o.customer_name, shop: shop.name, code: o.code, url: trackUrl })
  const pin = o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null
  const paid = !cod && ['confirmed', 'dispatched', 'delivered'].includes(o.status)
  // Everything the rider needs in one message; the seller picks the rider's chat in WhatsApp.
  const riderText = [
    t('Delivery for {shop}, order #{code}', { shop: shop.name, code: o.code }),
    `${o.customer_name} · ${localPhone(o.customer_phone)}`,
    [o.area, o.landmark].filter(Boolean).join(' · '),
    pin ? t('Map: {url}', { url: pinLink(pin) }) : '',
    o.lines.map((l) => `${l.qty} × ${l.name}${l.variant ? ` (${optionText(t, l.option, l.variant)})` : ''}`).join('\n'),
    cod ? t('Collect {total} in cash', { total: tzs(o.total) }) : paid ? t('Paid already: collect nothing') : '',
  ]
    .filter(Boolean)
    .join('\n')
  const cancel: Action = { status: 'cancelled', label: t('Cancel order'), kind: 'danger', ask: t('Cancel this order? The buyer will see it as cancelled.') }

  const next: Record<OrderStatus, { title: string; body: string; actions: Action[] }> = {
    awaiting_payment: {
      title: t('Waiting for payment'),
      body: t('The buyer has not sent payment proof yet. If the money is already in your account, you can confirm now.'),
      actions: [{ status: 'confirmed', label: t('Payment received'), kind: 'primary' }, cancel],
    },
    payment_claimed: {
      title: t('Check this payment'),
      body: t('Open your mobile money and make sure the money is in before you confirm.'),
      actions: [
        { status: 'confirmed', label: t('Payment received'), kind: 'primary' },
        { status: 'awaiting_payment', label: t('Not received'), kind: 'ghost' },
        cancel,
      ],
    },
    confirmed: {
      title: cod ? t('Pack it and send it') : t('Paid. Pack it and send it'),
      body: cod ? t('Collect {total} in cash when the rider delivers.', { total: tzs(o.total) }) : t('Mark it as sent when it leaves with your rider.'),
      actions: [
        { status: 'dispatched', label: t('Mark as sent'), kind: 'primary' },
        { status: 'delivered', label: t('Mark delivered'), kind: 'ghost' },
        cancel,
      ],
    },
    dispatched: {
      title: t('On the way'),
      body: cod ? t('Mark it delivered once the buyer has it and you have the cash.') : t('Mark it delivered once the buyer has it.'),
      actions: [{ status: 'delivered', label: t('Mark delivered'), kind: 'primary' }, cancel],
    },
    delivered: { title: t('Delivered'), body: t('This order is complete.'), actions: [] },
    cancelled: { title: t('Cancelled'), body: t('This order was cancelled. Stock from confirmed orders went back to your products.'), actions: [] },
  }
  const step = next[o.status]

  return (
    <Page nav wide>
      <TopBar
        back="/app/orders"
        title={<span className="code tracking-normal">#{o.code}</span>}
        sub={`${timeAgo(o.created_at, lang)} · ${t(o.items === 1 ? '{n} item' : '{n} items', { n: o.items })} · ${tzs(o.total)}`}
        right={<StatusPill status={o.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        {/* Next step and the buyer: first on a phone, on the right on desktop */}
        <div className="space-y-4 lg:sticky lg:top-8 lg:order-2">
          <section className={`card p-6 ${o.status === 'payment_claimed' ? 'shadow-[inset_0_3px_0_var(--color-moto)]' : ''}`}>
            <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
              {o.status === 'payment_claimed' && <span className="signal" />}
              {step.title}
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{step.body}</p>
            {o.status === 'payment_claimed' && check && (
              <ul className="mt-4 space-y-2.5 rounded-[14px] bg-page p-4 text-[14px]">
                <CheckRow state={check.amount === 'ok' ? 'ok' : check.amount === 'low' ? 'bad' : 'unknown'}>
                  {check.parsed.amount != null ? t('Amount {amount}', { amount: tzs(check.parsed.amount) }) : t('Amount not found')}
                  {check.amount === 'low' && <span className="text-bad"> · {t('less than {total}', { total: tzs(o.total) })}</span>}
                </CheckRow>
                <CheckRow state={check.name === 'ok' ? 'ok' : check.name === 'mismatch' ? 'bad' : 'unknown'}>
                  {check.parsed.name ? t('Paid to {name}', { name: check.parsed.name }) : t('Name not found')}
                </CheckRow>
                <CheckRow state={check.txn === 'ok' ? 'ok' : 'unknown'}>
                  {check.parsed.txnId ? (
                    <>
                      {t('Transaction')} <span className="code text-[13px]">{check.parsed.txnId}</span>
                    </>
                  ) : (
                    t('Transaction ID not found')
                  )}
                </CheckRow>
              </ul>
            )}
            {step.actions.length > 0 && (
              <div className="mt-5 space-y-2">
                {step.actions.map((a) => (
                  <button
                    key={a.status + a.label}
                    type="button"
                    disabled={busy}
                    className={`btn w-full ${a.kind === 'ghost' ? 'btn-ghost' : a.kind === 'danger' ? 'bg-transparent text-bad hover:bg-bad/[0.06]' : ''}`}
                    onClick={() => move(a.status, a.ask)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {manual && !o.customer_phone ? (
            <section className="card p-6">
              <p className="text-[13px] text-muted">{t('Buyer')}</p>
              <p className="mt-1 text-[18px] font-semibold">{o.customer_name || t('Sale recorded by you')}</p>
              <p className="mt-1 text-[14px] text-ink-2">{t('You recorded this sale by hand.')}</p>
              {o.note && <p className="mt-4 rounded-[14px] bg-page px-4 py-3 text-[14px] leading-relaxed text-ink-2">“{o.note}”</p>}
            </section>
          ) : (
          <section className="card p-6">
            <p className="text-[13px] text-muted">{t('Buyer')}</p>
            <p className="mt-1 text-[18px] font-semibold">{o.customer_name || t('Sale recorded by you')}</p>
            <p className="code mt-0.5 text-[14px] text-ink-2">{o.customer_phone}</p>
            <div className="mt-4 flex items-start gap-2.5 text-[14px] leading-5">
              <MapPin size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="font-medium">{o.area || (manual ? t('Recorded by you') : t('No area'))}</span>
                {o.landmark && <span className="block text-ink-2">{o.landmark}</span>}
                {pin && (
                  <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a href={pinLink(pin)} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm h-9 px-3.5">
                      {t('Open in Google Maps')} <ArrowUpRight size={14} strokeWidth={1.75} />
                    </a>
                    {o.pin_m != null && (
                      <span className={`text-[13px] ${o.pin_m > ROUGH_M ? 'text-moto-ink' : 'text-muted'}`}>
                        {o.pin_m > ROUGH_M ? t('Rough pin, about {d}', { d: distance(o.pin_m) }) : t('Accurate to about {d}', { d: distance(o.pin_m) })}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </div>
            {o.note && <p className="mt-4 rounded-[14px] bg-page px-4 py-3 text-[14px] leading-relaxed text-ink-2">“{o.note}”</p>}
            {o.bag && (
              <Link to="/app/bags/$id" params={{ id: o.bag.id }} className="mt-4 flex items-center gap-2.5 rounded-[14px] bg-page px-4 py-3 text-[14px] transition-colors hover:bg-well">
                <ShoppingBag size={16} strokeWidth={1.6} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t('Ordered from your bag link')}</span>
                  {o.bag.note && <span className="block truncate text-[13px] text-muted">“{o.bag.note}”</span>}
                </span>
                <ChevronRight size={16} strokeWidth={1.6} className="shrink-0 text-faint" />
              </Link>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <a href={`tel:${o.customer_phone}`} className="btn btn-ghost btn-sm h-11">
                <Phone size={16} strokeWidth={1.6} /> {t('Call')}
              </a>
              <a href={waLink(o.customer_phone, waText)} target="_blank" rel="noreferrer" className="btn btn-sm h-11">
                <WhatsAppMark size={18} /> WhatsApp
              </a>
              {o.status !== 'delivered' && o.status !== 'cancelled' && (
                <a href={`https://wa.me/?text=${encodeURIComponent(riderText)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm col-span-2 h-11">
                  <Bike size={16} strokeWidth={1.6} /> {t('Send to rider on WhatsApp')}
                </a>
              )}
            </div>
          </section>
          )}
        </div>

        <div className="min-w-0 space-y-4 lg:order-1">
          <div className="receipt px-6 pt-6 pb-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">{t('Items')}</h2>
              <p className="meta">{new Date(o.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' })}</p>
            </div>
            <div className="mt-4 space-y-4">
              {o.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Img size="thumb" k={l.image} alt={l.name} className="h-16 w-14 shrink-0 rounded-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{l.name}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {l.variant && (
                        <>
                          <span className="font-medium text-ink">{optionText(t, l.option, l.variant)}</span>
                          {' · '}
                        </>
                      )}
                      {l.qty} × <span className="tnum">{tzs(l.price)}</span>
                    </p>
                  </div>
                  <p className="font-mono text-[14px]">{tzs(l.qty * l.price)}</p>
                </div>
              ))}
            </div>
            <div className="receipt-rule mt-6 space-y-2 pt-4 text-[14px]">
              <Line label={t('Items')} value={tzs(o.subtotal)} />
              {o.discount > 0 && <Line label={t('Discount ({code})', { code: o.discount_code ?? '' })} value={`−${tzs(o.discount)}`} />}
              {!manual && <Line label={t('Delivery')} value={o.delivery_fee ? tzs(o.delivery_fee) : t('Agree on WhatsApp')} />}
              <Line label={t('Payment')} value={t(PAYMENT_LABEL[o.payment_method] ?? o.payment_method)} />
            </div>
            <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
              <span className="text-[15px] font-medium">{t('Total')}</span>
              <span className="font-mono text-[22px] font-medium tracking-tight">{tzs(o.total)}</span>
            </div>
          </div>

          {o.payment_method === 'lipa' && !manual && (
            <section className="card p-6">
              <h2 className="text-[15px] font-semibold">{t('Payment SMS from the buyer')}</h2>
              {!o.payment_sms ? (
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{t('Nothing yet. The buyer pastes their confirmation SMS on their order page after paying.')}</p>
              ) : (
                <p className="mt-4 rounded-[14px] bg-page px-4 py-3.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{o.payment_sms}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </Page>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className="font-mono text-[13px]">{value}</span>
    </div>
  )
}

function CheckRow({ state, children }: { state: 'ok' | 'bad' | 'unknown'; children: ReactNode }) {
  const Icon = state === 'ok' ? CircleCheck : state === 'bad' ? TriangleAlert : CircleHelp
  const color = state === 'ok' ? 'text-ok' : state === 'bad' ? 'text-bad' : 'text-faint'
  return (
    <li className="flex items-start gap-2.5">
      <Icon size={17} strokeWidth={1.75} className={`mt-px shrink-0 ${color}`} />
      <span className="min-w-0">{children}</span>
    </li>
  )
}
