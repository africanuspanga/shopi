import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { CircleCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { InvoiceDocument, PdfButton, usePdf } from '#/components/invoice'
import { NotFound } from '#/components/not-found'
import { MadeWithShopi, ShopTopBar } from '#/components/shop'
import { CardHead, CopyRow, ErrorText, useEntrance } from '#/components/ui'
import { WhatsAppHelp, useWhatsApp } from '#/components/whatsapp'
import { acceptQuote, getPublicInvoice, markInvoiceViewed, sendInvoiceProof } from '#/lib/api/invoice-public'
import { waLink } from '#/lib/format'
import { LangProvider, useT } from '#/lib/i18n'
import { displayNumber, docDate, docOf, money } from '#/lib/invoice'
import { themeStyle } from '#/lib/theme'

/**
 * The client's invoice or quote (roadmap `v-invoices`), at shopi.tz/i/<code>: what is owed and by when, how to pay
 * (the Lipa Namba to copy, the bank details), the payment SMS as proof, the document itself and its PDF. A quote can
 * be accepted here. In the document's language and the business's colour, like its shop.
 */
export const Route = createFileRoute('/i/$code')({
  loader: async ({ params }) => {
    const data = await getPublicInvoice({ data: { code: params.code } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${displayNumber(loaderData.invoice.kind, loaderData.invoice.number)} · ${loaderData.shop.name}` : 'Shopi' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  notFoundComponent: () => <NotFound title="We can't find this invoice" body="Check the link, or ask the business to send it again on WhatsApp." />,
  component: InvoiceRoute,
})

function InvoiceRoute() {
  const d = Route.useLoaderData()
  return (
    <LangProvider value={d.invoice.lang}>
      <div className="contents" style={themeStyle(d.shop.theme_color)}>
        <Invoice />
      </div>
    </LangProvider>
  )
}

function Invoice() {
  const t = useT()
  const rise = useEntrance()
  const rise2 = useEntrance('rise-2')
  const router = useRouter()
  const { invoice: inv, shop, state, waiting } = Route.useLoaderData()
  const [sms, setSms] = useState('')
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seen = useRef(false)
  useEffect(() => {
    // Counts once per page: the business's own look is left out on the server.
    if (seen.current || inv.viewed_at || state === 'cancelled') return
    seen.current = true
    markInvoiceViewed({ data: { code: inv.code } }).catch(() => {})
  }, [inv.code, inv.viewed_at, state])

  const number = displayNumber(inv.kind, inv.number)
  const balance = Math.max(0, inv.total - inv.paid)
  const due = inv.due_day ? docDate(inv.due_day, inv.lang) : ''
  const doc = docOf({ ...inv }, shop)
  const pdf = usePdf(doc)
  const chat = useWhatsApp()
  const chatText = t('Hello {business}, about {number}:', { business: shop.name, number })
  const isInvoice = inv.kind === 'invoice'
  const canPay = isInvoice && balance > 0 && state !== 'cancelled'
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt('', text)
    }
    setCopied(label)
    setTimeout(() => setCopied(''), 1600)
  }

  const head = isInvoice
    ? state === 'cancelled'
      ? { title: t('This invoice was cancelled'), sub: t('Message {business} on WhatsApp if this is a mistake.', { business: shop.name }) }
      : state === 'paid'
        ? { title: t('Paid in full'), sub: t('Thank you. {business} has your payment.', { business: shop.name }) }
        : waiting > 0
          ? { title: t('Payment sent. {business} is checking', { business: shop.name }), sub: t('This page shows it as paid once they confirm the money is in.') }
          : inv.paid > 0
            ? { title: t('{amount} still to pay', { amount: money(balance, inv.currency) }), sub: due ? t('Due {date}. Thank you for what you have paid.', { date: due }) : t('Thank you for what you have paid.') }
            : state === 'overdue'
              ? { title: t('{amount} was due {date}', { amount: money(balance, inv.currency), date: due }), sub: t('Please pay using the details below.') }
              : { title: t('{amount} to pay', { amount: money(balance, inv.currency) }), sub: due ? t('Due {date}', { date: due }) : t('Due on receipt') }
    : state === 'accepted' || state === 'invoiced'
      ? { title: t('You accepted this quote'), sub: t('{business} will send you the invoice.', { business: shop.name }) }
      : state === 'expired'
        ? { title: t('This quote has expired'), sub: t('It was valid until {date}. Ask {business} for a new one.', { date: due, business: shop.name }) }
        : state === 'declined' || state === 'cancelled'
          ? { title: t('This quote is closed'), sub: t('Message {business} on WhatsApp for a new one.', { business: shop.name }) }
          : { title: t('Quote for {amount}', { amount: money(inv.total, inv.currency) }), sub: due ? t('Valid until {date}', { date: due }) : t('From {business}', { business: shop.name }) }

  return (
    <div className="min-h-dvh bg-page">
      <div className="mb-3 md:mb-6">
        <ShopTopBar shop={shop} />
      </div>
      <main className="mx-auto max-w-[1180px] px-4 pb-16 md:px-10 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="space-y-4 lg:sticky lg:top-24 lg:order-2">
          <section className={`${rise} card p-6`}>
            <p className="meta">
              {inv.kind === 'quote' ? t('Quote') : t('Invoice')} <span className="code text-ink">{number}</span> · {shop.name}
            </p>
            <h1 className="title mt-3 text-24 md:text-28">{head.title}</h1>
            <p className="mt-2 text-15 leading-relaxed text-ink-2">{head.sub}</p>
            {state === 'paid' && <CircleCheck size={24} strokeWidth={1.75} className="mt-4 text-ok" />}
            {inv.kind === 'quote' && ['sent', 'viewed', 'draft'].includes(state) && (
              <>
                <button
                  type="button"
                  className="btn btn-shop btn-lg mt-5 w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    const res = await acceptQuote({ data: { code: inv.code } })
                    setBusy(false)
                    if ('error' in res) return setError(res.error === 'expired' ? t('This quote has expired') : t('Something went wrong. Try again.'))
                    router.invalidate()
                  }}
                >
                  {t('Accept this quote')}
                </button>
                <ErrorText>{error}</ErrorText>
              </>
            )}
          </section>

          {canPay && waiting === 0 && (
            <section className={`${rise2} card p-6`}>
              <CardHead icon={<Step n={1} />} title={t('Pay {business}', { business: shop.name })} />
              <div className="mt-4 divide-y divide-line rounded-16 bg-page px-5">
                {shop.lipa_number && (
                  <CopyRow
                    label={!shop.lipa_network || /lipa/i.test(shop.lipa_network) ? shop.lipa_network || t('Lipa Namba') : t('Lipa Namba · {network}', { network: shop.lipa_network })}
                    value={shop.lipa_number}
                    big
                    onCopy={() => copy('lipa', shop.lipa_number)}
                    copied={copied === 'lipa'}
                  />
                )}
                <CopyRow label={t('Amount')} value={money(balance, inv.currency)} onCopy={() => copy('amount', inv.currency === 'TZS' ? String(Math.round(balance / 100)) : (balance / 100).toFixed(2))} copied={copied === 'amount'} />
                {shop.lipa_number && shop.lipa_name && <CopyRow label={t('Name on the account')} value={shop.lipa_name} />}
              </div>
              {inv.pay_details && (
                <div className="mt-4 rounded-16 bg-page px-5 py-4">
                  <p className="text-13 text-muted">{t('Bank and other details')}</p>
                  <p className="mt-1 text-14 leading-6 whitespace-pre-line">{inv.pay_details}</p>
                </div>
              )}

              <div className="mt-8">
                <CardHead icon={<Step n={2} />} title={t('Paste the payment SMS')} />
                <p className="mt-2 text-14 leading-relaxed text-muted">{t('Copy the whole confirmation message you got after paying and paste it here.')}</p>
                <textarea className="input mt-4 font-mono text-13" rows={5} value={sms} onChange={(e) => setSms(e.target.value)} placeholder={t('e.g. ABC12XYZ9 Confirmed. You paid Tsh...')} />
                <ErrorText>{error}</ErrorText>
                <button
                  type="button"
                  className="btn btn-shop btn-lg mt-4 w-full"
                  disabled={busy || sms.trim().length < 20}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    const res = await sendInvoiceProof({ data: { code: inv.code, sms } })
                    setBusy(false)
                    if ('error' in res)
                      return setError(
                        res.error === 'reused'
                          ? t('This transaction was already used for another payment.')
                          : res.error === 'short'
                            ? t('Paste the whole SMS.')
                            : res.error === 'limit'
                              ? t('Too many tries. Wait a little and try again.')
                              : t('Something went wrong. Try again.'),
                      )
                    setSms('')
                    router.invalidate()
                  }}
                >
                  {busy ? t('Sending') : t('I have paid, send proof')}
                </button>
              </div>
            </section>
          )}

          <div className="space-y-2">
            {shop.whatsapp && (
              <div>
                <a href={waLink(shop.whatsapp, chatText)} target="_blank" rel="noreferrer" className="btn btn-ghost w-full" onClick={chat.onClick}>
                  <WhatsAppMark size={20} /> {t('Message on WhatsApp')}
                </a>
                <WhatsAppHelp show={chat.tapped} phone={shop.whatsapp} text={chatText} onSand />
              </div>
            )}
            <PdfButton pdf={pdf} className="btn btn-quiet w-full" />
          </div>
          {shop.badge && <MadeWithShopi shopSlug={shop.slug} invite />}
        </div>

        <div className={`${rise2} mt-6 lg:order-1 lg:mt-0`}>
          <InvoiceDocument doc={doc} />
        </div>
      </main>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-13 text-white">{n}</span>
}
