import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Check, Copy, ImageDown, MapPin, Printer, Share2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { MadeWithShopi } from '#/components/shop'
import { ErrorText, Img, ShopAvatar, useEntrance } from '#/components/ui'
import { getTrackedOrder, submitPaymentSms } from '#/lib/api/store'
import { optionText, timeAgo, tzs, waLink, type OrderStatus, formatTin } from '#/lib/format'
import { LangProvider, asLang, useLang, useT } from '#/lib/i18n'
import { themeStyle } from '#/lib/theme'
import { shareLink, useOrigin } from '#/lib/share'
import { drawReceipt } from '#/lib/receipt-image'
import { NotFound } from '#/components/not-found'
import { track } from '#/lib/analytics'

export const Route = createFileRoute('/o/$code')({
  loader: async ({ params }) => {
    const order = await getTrackedOrder({ data: { code: params.code } })
    if (!order) throw notFound()
    return order
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `#${loaderData.code} · ${loaderData.shop.name}` : 'Shopi' }, { name: 'robots', content: 'noindex' }],
  }),
  notFoundComponent: () => (
    <NotFound title="We can't find this order" body="Check the order code in your link, or ask the seller to send it again on WhatsApp." />
  ),
  component: TrackPage,
})

/** The buyer's order page reads in the language the shop's seller chose, in the shop's colour, like the shop itself. */
function TrackPage() {
  const o = Route.useLoaderData()
  return (
    <LangProvider value={asLang(o.shop.lang)}>
      <div className="contents" style={themeStyle(o.shop.theme_color)}>
        <Track />
      </div>
    </LangProvider>
  )
}

/** How many of the four steps are behind the buyer. */
const DONE: Record<OrderStatus, number> = { awaiting_payment: 0, payment_claimed: 1, confirmed: 2, dispatched: 3, delivered: 4, cancelled: 0 }

function Track() {
  const rise = useEntrance()
  const rise2 = useEntrance('rise-2')
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
    ...o.lines.map((l) => `• ${l.qty} × ${l.name}${l.variant ? ` (${optionText(t, l.option, l.variant)})` : ''}`),
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

  // Until the money is in, this is an order summary; then a receipt (cash on delivery: once delivered).
  const paid = lipa ? ['confirmed', 'dispatched', 'delivered'].includes(o.status) : o.status === 'delivered'
  const receiptTitle = paid ? t('Receipt') : t('Order summary')
  const when = new Date(o.created_at).toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Dar_es_Salaam',
  })
  const payLine = lipa ? t('Mobile money · Lipa Namba') : t('Cash on delivery')
  const [saving, setSaving] = useState(false)
  const receiptImage = () =>
    drawReceipt({
      shop: o.shop.name,
      title: receiptTitle,
      code: o.code,
      date: when,
      lines: o.lines.map((l) => ({
        name: l.name,
        detail: `${l.qty} × ${tzs(l.price)}${l.variant ? ` · ${optionText(t, l.option, l.variant)}` : ''}`,
        amount: l.qty * l.price,
      })),
      rows: [
        { label: t('Items'), value: tzs(o.subtotal) },
        ...(o.discount > 0 ? [{ label: t('Discount ({code})', { code: o.discount_code ?? '' }), value: `−${tzs(o.discount)}` }] : []),
        { label: t('Delivery'), value: o.delivery_fee ? tzs(o.delivery_fee) : t('Agreed on WhatsApp') },
      ],
      total: o.total,
      totalLabel: t('Total'),
      meta: [
        ...(o.area ? [`${o.area.replace(' (fee to agree)', '')}${o.landmark ? ` · ${o.landmark}` : ''}`] : []),
        paid ? `${t('Paid')} · ${payLine}` : payLine,
        ...(o.shop.tin ? [t('Seller TIN {tin}', { tin: formatTin(o.shop.tin) })] : []),
      ],
      footer: `${t('Not a TRA fiscal receipt')} · shopi.tz/o/${o.code}`,
    })
  const saveImage = async () => {
    setSaving(true)
    try {
      const blob = await receiptImage()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${o.shop.name} ${o.code}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } finally {
      setSaving(false)
    }
  }
  const shareReceipt = async () => {
    try {
      const file = new File([await receiptImage()], `${o.code}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${receiptTitle} #${o.code}` })
        return
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    if ((await shareLink(`${origin}/o/${o.code}`, `${receiptTitle} #${o.code}`)) === 'copied') {
      setCopied('receipt')
      setTimeout(() => setCopied(''), 1600)
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
    <div className="min-h-dvh bg-page print:bg-white">
      <header className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 md:h-20 md:px-10 print:hidden">
        <Link to="/$shop" params={{ shop: o.shop.slug }} className="flex min-w-0 flex-1 items-center gap-2.5">
          <ShopAvatar name={o.shop.name} logo={o.shop.logo_key} className="h-9 w-9 text-[13px]" />
          <span className="truncate text-[15px] font-semibold">{o.shop.name}</span>
        </Link>
      </header>

      <main className="mx-auto max-w-[1080px] px-4 pb-16 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-10 md:px-10 print:block">
        <div className="min-w-0 space-y-4 print:hidden">
          <section className={`${rise} card p-6 md:p-8`}>
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
                        {/* On phones the ink bar already says "done"; the check would push "Confirmed" onto two lines. */}
                        {state === 'done' && <Check size={13} strokeWidth={2.5} className="hidden shrink-0 md:block" />}
                        {label}
                      </p>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {needsPayment && (
            <section className={`${rise2} card p-6 md:p-8`}>
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
                  className="btn btn-shop btn-lg mt-4 w-full"
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
            <a
              href={waLink(o.shop.whatsapp, orderText)}
              target="_blank"
              rel="noreferrer"
              className={`btn w-full ${needsPayment ? 'btn-ghost' : 'btn-lg'}`}
              onClick={() => track('whatsapp_click', { shopId: o.shop.id, detail: 'order' })}
            >
              <WhatsAppMark size={20} /> {t('Message {shop} on WhatsApp', { shop: o.shop.name })}
            </a>
          )}
        </div>

        <aside className={`${rise2} mt-8 md:sticky md:top-6 md:mt-0 print:mx-auto print:mt-0 print:max-w-[420px]`}>
          <div className="receipt px-5 pt-5 pb-6">
            <div className="flex items-baseline justify-between">
              <p className="text-[15px] font-semibold">{receiptTitle}</p>
              <p className="code text-[13px] text-muted">#{o.code}</p>
            </div>
            <p className="meta mt-1 text-muted">{when}</p>
            <div className="mt-4 space-y-3">
              {o.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Img size="thumb" k={l.image} alt={l.name} className="h-14 w-12 shrink-0 rounded-[8px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{l.name}</p>
                    <p className="text-[13px] text-muted">
                      {l.qty} × <span className="tnum">{tzs(l.price)}</span>
                      {l.variant ? ` · ${optionText(t, l.option, l.variant)}` : ''}
                    </p>
                  </div>
                  <p className="font-mono text-[13px]">{tzs(l.qty * l.price)}</p>
                </div>
              ))}
            </div>
            <div className="receipt-rule mt-5 space-y-2 pt-4 text-[14px]">
              <Line label={t('Items')} value={tzs(o.subtotal)} />
              {o.discount > 0 && <Line label={t('Discount ({code})', { code: o.discount_code ?? '' })} value={`−${tzs(o.discount)}`} />}
              <Line label={t('Delivery')} value={o.delivery_fee ? tzs(o.delivery_fee) : t('Agreed on WhatsApp')} />
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
              <p>{paid ? `${t('Paid')} · ${payLine}` : payLine}</p>
              {o.shop.tin && <p>{t('Seller TIN {tin}', { tin: formatTin(o.shop.tin) })}</p>}
              <p className="pt-2 text-[12px]">{t('Not a TRA fiscal receipt')}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
            <button type="button" className="btn btn-ghost btn-sm" onClick={saveImage} disabled={saving}>
              <ImageDown size={15} strokeWidth={1.6} /> {t('Save as image')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={shareReceipt}>
              {copied === 'receipt' ? <Check size={15} strokeWidth={2} /> : <Share2 size={15} strokeWidth={1.6} />}
              {copied === 'receipt' ? t('Link copied') : t('Share')}
            </button>
            <button type="button" className="btn btn-quiet btn-sm col-span-2 hidden md:inline-flex" onClick={() => window.print()}>
              <Printer size={15} strokeWidth={1.6} /> {t('Print')}
            </button>
          </div>
          <p className="mt-4 text-center text-[13px] text-muted print:hidden">{t('Bookmark this page to follow your order.')}</p>
          <div className="print:hidden">
            <MadeWithShopi />
          </div>
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
