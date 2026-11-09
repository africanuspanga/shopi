import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Check, Copy, MapPin } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { MadeWithRizk } from '#/components/shop'
import { ErrorText, Img, LangSwitch, ShopAvatar } from '#/components/ui'
import { getTrackedOrder, submitPaymentSms } from '#/lib/api/store'
import { timeAgo, tzs, waLink, type OrderStatus } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { useOrigin } from '#/lib/share'

export const Route = createFileRoute('/o/$code')({
  loader: async ({ params }) => {
    const order = await getTrackedOrder({ data: { code: params.code } })
    if (!order) throw notFound()
    return order
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `#${loaderData.code} · ${loaderData.shop.name}` : 'RIZK' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Track,
})

/** How many of the four steps are behind the buyer. */
const DONE: Record<OrderStatus, number> = { awaiting_payment: 0, payment_claimed: 1, confirmed: 2, dispatched: 3, delivered: 4, cancelled: 0 }

function Track() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const o = Route.useLoaderData()
  const [sms, setSms] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const origin = useOrigin()
  const lipa = o.payment_method === 'lipa'
  const done = DONE[o.status]
  const needsPayment = lipa && o.status === 'awaiting_payment'
  const orderText = [
    t('Hi {shop}, I placed order #{code}', { shop: o.shop.name, code: o.code }),
    ...o.lines.map((l) => `• ${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ''}`),
    `${t('Total')}: ${tzs(o.total)}`,
    `${origin}/o/${o.code}`,
  ].join('\n')

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      window.prompt('', text)
    }
  }

  const steps = [lipa ? (done > 0 ? t('Paid') : t('Pay')) : t('Ordered'), done === 1 ? t('Seller checks') : t('Confirmed'), t('On the way'), t('Delivered')]

  const head: Record<OrderStatus, { title: string; sub: string }> = {
    awaiting_payment: {
      title: t('Pay to finish your order'),
      sub: t('Send {total} to the Lipa Namba below, then paste the confirmation SMS.', { total: tzs(o.total) }),
    },
    payment_claimed: {
      title: t('Payment sent. The seller is checking'),
      sub: t('{shop} confirms your order once the money is in. This usually takes a few minutes.', { shop: o.shop.name }),
    },
    confirmed: {
      title: lipa ? t('Payment confirmed') : t('Order confirmed'),
      sub: lipa
        ? t('{shop} is getting your order ready.', { shop: o.shop.name })
        : t('{shop} is getting your order ready. Pay the rider {total} when it arrives.', { shop: o.shop.name, total: tzs(o.total) }),
    },
    dispatched: { title: t('On the way to you'), sub: t('Your order has left the shop. Keep your phone close for the rider.') },
    delivered: { title: t('Delivered'), sub: t('Thank you for shopping with {shop}.', { shop: o.shop.name }) },
    cancelled: { title: t('Order cancelled'), sub: t('Message {shop} on WhatsApp if this is a mistake.', { shop: o.shop.name }) },
  }

  return (
    <div className="min-h-dvh bg-page">
      <header className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 md:h-20 md:px-10">
        <Link to="/$shop" params={{ shop: o.shop.slug }} className="flex min-w-0 flex-1 items-center gap-2.5">
          <ShopAvatar name={o.shop.name} logo={o.shop.logo_key} className="h-9 w-9 text-[13px]" />
          <span className="truncate text-[15px] font-semibold">{o.shop.name}</span>
        </Link>
        <LangSwitch />
      </header>

      <main className="mx-auto max-w-[1080px] px-4 pb-16 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-10 md:px-10">
        <div className="min-w-0 space-y-4">
          <section className="rise card p-6 md:p-8">
            <p className="meta">
              {t('Order')} <span className="code text-ink">#{o.code}</span> · {timeAgo(o.created_at, lang)}
            </p>
            <h1 className="title mt-3 text-[28px] md:text-[40px]">{head[o.status].title}</h1>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">{head[o.status].sub}</p>
            {o.status !== 'cancelled' && (
              <ol className="mt-8 grid grid-cols-4 gap-1.5" aria-label={t('Order progress')}>
                {steps.map((label, i) => {
                  const state = i < done ? 'done' : i === done ? 'now' : 'next'
                  return (
                    <li key={i} aria-current={state === 'now' ? 'step' : undefined}>
                      <div className={`h-1.5 rounded-full ${state === 'done' ? 'bg-ink' : state === 'now' ? 'bg-moto' : 'bg-raised'}`} />
                      <p className={`mt-2.5 flex items-center gap-1 text-[12px] leading-4 md:text-[13px] ${state === 'next' ? 'text-muted' : 'font-medium text-ink'}`}>
                        {state === 'done' && <Check size={13} strokeWidth={2.5} className="shrink-0" />}
                        {label}
                      </p>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {needsPayment && (
            <section className="rise-2 card p-6 md:p-8">
              <Step n={1} title={t('Pay by mobile money')} />
              <div className="mt-5 divide-y divide-line rounded-[16px] bg-page px-5">
                <CopyRow
                  label={
                    !o.shop.lipa_network || /lipa/i.test(o.shop.lipa_network)
                      ? o.shop.lipa_network || t('Lipa Namba')
                      : t('Lipa Namba · {network}', { network: o.shop.lipa_network })
                  }
                  value={o.shop.lipa_number}
                  big
                  onCopy={() => copy('lipa', o.shop.lipa_number)}
                  copied={copied === 'lipa'}
                />
                <CopyRow label={t('Amount')} value={tzs(o.total)} onCopy={() => copy('amount', String(o.total))} copied={copied === 'amount'} />
                {o.shop.lipa_name && <CopyRow label={t('Name on the account')} value={o.shop.lipa_name} />}
              </div>

              <div className="mt-8">
                <Step n={2} title={t('Paste the payment SMS')} />
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{t('Copy the whole confirmation message you got after paying and paste it here.')}</p>
                <textarea
                  className="input mt-4 font-mono text-[13px]"
                  rows={5}
                  value={sms}
                  onChange={(e) => setSms(e.target.value)}
                  placeholder={t('e.g. ABC12XYZ9 Confirmed. You paid Tsh...')}
                />
                {error && (
                  <div className="mt-3">
                    <ErrorText>{error}</ErrorText>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-lg mt-4 w-full"
                  disabled={busy || sms.trim().length < 20}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    const res = await submitPaymentSms({ data: { code: o.code, sms } })
                    setBusy(false)
                    if ('error' in res) {
                      return setError(
                        res.error === 'reused'
                          ? t('This transaction was already used for another order.')
                          : res.error === 'short'
                            ? t('Paste the whole SMS.')
                            : t('Something went wrong. Try again.'),
                      )
                    }
                    router.invalidate()
                  }}
                >
                  {busy ? t('Sending') : t('I have paid, send proof')}
                </button>
              </div>
            </section>
          )}

          {o.shop.whatsapp && (
            <a href={waLink(o.shop.whatsapp, orderText)} target="_blank" rel="noreferrer" className={`btn w-full ${needsPayment ? 'btn-ghost' : 'btn-lg'}`}>
              <WhatsAppMark size={20} /> {t('Message {shop} on WhatsApp', { shop: o.shop.name })}
            </a>
          )}
        </div>

        <aside className="rise-2 mt-8 md:sticky md:top-6 md:mt-0">
          <div className="receipt px-5 pt-5 pb-6">
            <div className="flex items-baseline justify-between">
              <p className="text-[15px] font-semibold">{t('Your order')}</p>
              <p className="code text-[13px] text-muted">#{o.code}</p>
            </div>
            <div className="mt-4 space-y-3">
              {o.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Img k={l.image} alt={l.name} className="h-14 w-12 shrink-0 rounded-[8px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{l.name}</p>
                    <p className="text-[13px] text-muted">
                      {l.qty} × <span className="tnum">{tzs(l.price)}</span>
                      {l.variant ? ` · ${t('Size {size}', { size: l.variant })}` : ''}
                    </p>
                  </div>
                  <p className="font-mono text-[13px]">{tzs(l.qty * l.price)}</p>
                </div>
              ))}
            </div>
            <div className="receipt-rule mt-5 space-y-2 pt-4 text-[14px]">
              <Line label={t('Items')} value={tzs(o.subtotal)} />
              <Line label={t('Delivery')} value={o.delivery_fee ? tzs(o.delivery_fee) : o.area.includes('(fee to agree)') ? t('Seller confirms') : t('Free')} />
            </div>
            <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
              <span className="text-[15px] font-medium">{t('Total')}</span>
              <span className="font-mono text-[20px] font-medium tracking-tight">{tzs(o.total)}</span>
            </div>
            <div className="mt-5 space-y-1.5 text-[13px] text-muted">
              {o.area && (
                <p className="flex items-start gap-2">
                  <MapPin size={14} strokeWidth={1.6} className="mt-0.5 shrink-0" />
                  <span>
                    {o.area.replace(' (fee to agree)', '')}
                    {o.landmark ? ` · ${o.landmark}` : ''}
                  </span>
                </p>
              )}
              <p>{lipa ? t('Mobile money · Lipa Namba') : t('Cash on delivery')}</p>
            </div>
          </div>
          <p className="mt-4 text-center text-[13px] text-muted">{t('Bookmark this page to follow your order.')}</p>
          <MadeWithRizk />
        </aside>
      </main>
    </div>
  )
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 text-[17px] font-semibold">
      <span className="tnum flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[13px] text-white">{n}</span>
      {title}
    </h2>
  )
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className="font-mono text-[13px]">{value}</span>
    </div>
  )
}

function CopyRow({ label, value, onCopy, copied, big = false }: { label: string; value: string; onCopy?: () => void; copied?: boolean; big?: boolean }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-[13px] text-muted">{label}</p>
        <p className={`mt-1 truncate font-mono font-medium ${big ? 'text-[26px] tracking-[0.04em]' : 'text-[17px]'}`}>{value}</p>
      </div>
      {onCopy && (
        <button type="button" className={`btn btn-sm shrink-0 ${copied ? '' : 'btn-ghost'}`} onClick={onCopy}>
          {copied ? <Check size={15} strokeWidth={2.25} /> : <Copy size={15} strokeWidth={1.6} />}
          {copied ? t('Copied') : t('Copy')}
        </button>
      )}
    </div>
  )
}
