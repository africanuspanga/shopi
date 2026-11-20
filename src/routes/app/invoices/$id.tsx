import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { Check, Copy, FileCheck2, Pencil, Plus, Share2 } from 'lucide-react'
import { useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { InvoiceDocument, PdfButton, usePdf } from '#/components/invoice'
import { AmountInput } from '#/components/invoice-form'
import { Card, CheckRow, ErrorText, Field, FieldGroup, InvoicePill, Page, Sheet, TopBar } from '#/components/ui'
import {
  decideInvoicePayment, deleteInvoice, getInvoice, invoiceFromQuote, markInvoiceSent, recordInvoicePayment, removeInvoicePayment,
  setInvoiceStatus, type InvoicePayment,
} from '#/lib/api/invoices'
import { dayOf } from '#/lib/booking'
import { useLang, useT } from '#/lib/i18n'
import {
  PAY_METHODS, PAY_METHOD_LABEL, TONES, clientTitle, displayNumber, docDate, docOf, money, reminderText, sendText, whatsappTo,
  type PayMethod, type Tone,
} from '#/lib/invoice'
import type { PaymentCheck } from '#/lib/payment-sms'
import { useOrigin } from '#/lib/share'

/**
 * One invoice or quote (roadmap `v-invoices`): send it (WhatsApp, the link, the PDF), what is still owed, payments
 * (proofs from the client to confirm, payments recorded by hand), reminders in four tones, and the document itself.
 */
export const Route = createFileRoute('/app/invoices/$id')({
  loader: async ({ params }) => {
    const data = await getInvoice({ data: { id: params.id } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${displayNumber(loaderData.invoice.kind, loaderData.invoice.number)} · Shopi` : 'Invoice · Shopi' }] }),
  component: InvoicePage,
})

const waTo = whatsappTo

function InvoicePage() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const navigate = useNavigate()
  const origin = useOrigin()
  const { invoice: inv, payments, child, parent, shop, state } = Route.useLoaderData()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const number = displayNumber(inv.kind, inv.number)
  const link = `${origin}/i/${inv.code}`
  const balance = Math.max(0, inv.total - inv.paid)
  const isInvoice = inv.kind === 'invoice'
  const closed = state === 'cancelled'
  const doc = docOf({ ...inv }, shop)
  const message = sendText(inv.lang, {
    kind: inv.kind,
    client: inv.client.name,
    business: shop.name,
    number,
    amount: money(isInvoice && inv.paid > 0 ? balance : inv.total, inv.currency),
    due: inv.due_day ? docDate(inv.due_day, inv.lang) : '',
    link,
  })
  const sent = async () => {
    if (inv.status === 'draft') {
      await markInvoiceSent({ data: { id: inv.id } })
      router.invalidate()
    }
  }
  const pdf = usePdf(doc, sent)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fn()
      const err = res && typeof res === 'object' && 'error' in res ? String(res.error) : ''
      if (err) setError(err === 'twin' ? t('The quote it came from has another invoice now. That one stays.') : t('Something went wrong. Try again.'))
      await router.invalidate()
    } catch {
      setError(t('Something went wrong. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
    sent()
  }
  const claimed = payments.filter((p) => p.status === 'claimed')
  const done = payments.filter((p) => p.status !== 'claimed')

  const head = isInvoice
    ? state === 'paid'
      ? t('Paid in full')
      : state === 'draft'
        ? t('Not sent yet')
        : inv.paid > 0
          ? t('{amount} still owed', { amount: money(balance, inv.currency) })
          : state === 'overdue'
            ? t('Overdue since {date}', { date: docDate(inv.due_day, lang) })
            : inv.due_day
              ? t('Due {date}', { date: docDate(inv.due_day, lang) })
              : t('Due on receipt')
    : state === 'accepted'
      ? t('Accepted. Make the invoice when you are ready')
      : state === 'invoiced'
        ? t('Turned into an invoice')
        : state === 'expired'
          ? t('Expired on {date}', { date: docDate(inv.due_day, lang) })
          : inv.due_day
            ? t('Valid until {date}', { date: docDate(inv.due_day, lang) })
            : t('Quote')

  return (
    <Page wide>
      <TopBar
        title={number}
        sub={clientTitle(inv.client, t)}
        back="/app/invoices"
        right={
          !closed && (
            <Link to="/app/invoices/edit/$id" params={{ id: inv.id }} className="btn btn-ghost btn-sm h-10 w-10 px-0 md:w-auto md:px-[14px]" aria-label={t('Edit')}>
              <Pencil size={16} strokeWidth={1.75} /> <span className="hidden md:inline">{t('Edit')}</span>
            </Link>
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-8 lg:order-2">
          <section className="card p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <InvoicePill state={state} />
              <span className="code text-12 text-muted">{number}</span>
            </div>
            <p className="tnum mt-3 text-32 font-semibold tracking-tight">{money(isInvoice && inv.paid > 0 && balance > 0 ? balance : inv.total, inv.currency)}</p>
            <p className="mt-1 text-14 text-ink-2">{head}</p>
            {isInvoice && inv.paid > 0 && balance > 0 && (
              <p className="mt-1 text-13 text-muted">{t('{paid} paid of {total}', { paid: money(inv.paid, inv.currency), total: money(inv.total, inv.currency) })}</p>
            )}

            {!closed && (
              <div className="mt-5 space-y-2">
                {inv.kind === 'quote' && (state === 'accepted' || state === 'viewed' || state === 'sent') && (
                  <button
                    type="button"
                    className={`btn w-full ${state === 'accepted' ? '' : 'btn-ghost'}`}
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        const res = await invoiceFromQuote({ data: { id: inv.id } })
                        if ('id' in res && res.id) navigate({ to: '/app/invoices/$id', params: { id: res.id } })
                      })
                    }
                  >
                    <FileCheck2 size={16} strokeWidth={1.75} /> {t('Make the invoice')}
                  </button>
                )}
                {state !== 'paid' && state !== 'invoiced' && (
                  <a
                    href={waTo(inv.client.phone, message)}
                    target="_blank"
                    rel="noreferrer"
                    className={`btn w-full ${state === 'accepted' ? 'btn-ghost' : ''}`}
                    onClick={sent}
                  >
                    <WhatsAppMark size={18} /> {inv.status === 'draft' ? t('Send on WhatsApp') : t('Send again on WhatsApp')}
                  </a>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                    {copied ? <Check size={16} strokeWidth={2.25} /> : <Copy size={16} strokeWidth={1.75} />}
                    {copied ? t('Link copied') : t('Copy link')}
                  </button>
                  <PdfButton pdf={pdf} />
                </div>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm w-full md:hidden"
                  disabled={!!pdf.busy}
                  onClick={async () => {
                    if (!(await pdf.share(message))) copy()
                  }}
                >
                  <Share2 size={16} strokeWidth={1.75} /> {pdf.busy === 'share' ? t('Making the PDF') : t('Share the PDF')}
                </button>
              </div>
            )}

            {(parent || child) && (
              <p className="mt-4 text-13 text-muted">
                {parent && (
                  <Link to="/app/invoices/$id" params={{ id: parent.id }} className="underline decoration-line-strong underline-offset-4">
                    {t('From quote {number}', { number: displayNumber('quote', parent.number) })}
                  </Link>
                )}
                {child && (
                  <Link to="/app/invoices/$id" params={{ id: child.id }} className="underline decoration-line-strong underline-offset-4">
                    {t('Invoice {number}', { number: displayNumber('invoice', child.number) })}
                  </Link>
                )}
              </p>
            )}
            <ErrorText>{error}</ErrorText>
          </section>

          {isInvoice && !closed && (
            <Card
              title={t('Payments')}
              right={
                balance > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaying(true)}>
                    <Plus size={16} strokeWidth={2.25} /> {t('Record a payment')}
                  </button>
                )
              }
            >
              {claimed.map((p) => (
                <Proof key={p.id} p={p} currency={inv.currency} onDone={() => router.invalidate()} />
              ))}
              {done.length === 0 && claimed.length === 0 ? (
                <p className="text-14 text-muted">{t('No payments yet. When your client pays, record it here, or they send the payment SMS from the link.')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {done.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-14">
                      <span className="min-w-0">
                        <span className={`tnum block font-medium ${p.status === 'rejected' ? 'text-muted line-through' : ''}`}>{money(p.amount, inv.currency)}</span>
                        <span className="block truncate text-13 text-muted">
                          {[t(PAY_METHOD_LABEL[p.method]), docDate(p.day, lang), p.reference, p.status === 'rejected' ? t('Not received') : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {p.status === 'confirmed' && (
                        <button
                          type="button"
                          className="shrink-0 text-13 font-medium text-bad"
                          onClick={() => {
                            if (window.confirm(t('Take back this payment of {amount}?', { amount: money(p.amount, inv.currency) }))) act(() => removeInvoicePayment({ data: { id: p.id } }))
                          }}
                        >
                          {t('Take back')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {isInvoice && !closed && balance > 0 && inv.status !== 'draft' && <Reminders inv={inv} business={shop.name} link={link} />}

          {inv.kind === 'quote' && !closed && state !== 'invoiced' && (
            <div className="flex flex-wrap gap-2">
              {state !== 'accepted' && (
                <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => act(() => setInvoiceStatus({ data: { id: inv.id, status: 'accepted' } }))}>
                  {t('Mark as accepted')}
                </button>
              )}
              {state !== 'declined' && (
                <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => act(() => setInvoiceStatus({ data: { id: inv.id, status: 'declined' } }))}>
                  {t('Mark as declined')}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-13">
            {closed || state === 'declined' ? (
              <button type="button" className="font-medium text-ink-2 underline decoration-line-strong underline-offset-4" disabled={busy} onClick={() => act(() => setInvoiceStatus({ data: { id: inv.id, status: 'reopen' } }))}>
                {t('Reopen')}
              </button>
            ) : (
              <button
                type="button"
                className="font-medium text-bad"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(isInvoice ? t('Cancel this invoice? The client’s link will say it is cancelled.') : t('Cancel this quote?'))) act(() => setInvoiceStatus({ data: { id: inv.id, status: 'cancelled' } }))
                }}
              >
                {isInvoice ? t('Cancel invoice') : t('Cancel quote')}
              </button>
            )}
            {inv.status === 'draft' && !inv.sent_at && payments.length === 0 && (
              <button
                type="button"
                className="font-medium text-bad"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('Delete this draft? This can’t be undone.')))
                    act(async () => {
                      const res = await deleteInvoice({ data: { id: inv.id } })
                      if ('ok' in res) navigate({ to: '/app/invoices' })
                    })
                }}
              >
                {t('Delete draft')}
              </button>
            )}
            {inv.viewed_at && <span className="text-muted">{t('Opened by the client {date}', { date: docDate(dayOf(inv.viewed_at), lang) })}</span>}
          </div>
        </div>

        <InvoiceDocument doc={doc} className="lg:order-1" />
      </div>

      <RecordPayment open={paying} onClose={() => setPaying(false)} id={inv.id} currency={inv.currency} balance={balance} onDone={() => router.invalidate()} />
    </Page>
  )
}

/** A payment SMS the client sent from the link: what Shopi read from it, and Confirm or Not received. */
function Proof({ p, currency, onDone }: { p: InvoicePayment; currency: 'TZS' | 'USD'; onDone: () => void }) {
  const t = useT()
  const check: PaymentCheck | null = p.check_result ? JSON.parse(p.check_result) : null
  const [amount, setAmount] = useState(String(p.amount / 100))
  const [busy, setBusy] = useState(false)
  const decide = async (decision: 'confirm' | 'reject') => {
    setBusy(true)
    await decideInvoicePayment({ data: { id: p.id, decision, amount: decision === 'confirm' ? amount : undefined } })
    setBusy(false)
    onDone()
  }
  return (
    <div className="mb-4 rounded-16 bg-moto-soft/60 p-4 shadow-[inset_0_0_0_1px_var(--color-moto)]">
      <p className="flex items-center gap-2 text-15 font-semibold">
        <span className="signal" /> {t('Check this payment')}
      </p>
      <p className="mt-1 text-13 text-ink-2">{t('Your client says they paid. Confirm it once you see the money in your account.')}</p>
      {check && (
        <ul className="mt-3 space-y-2 text-14">
          <CheckRow state={check.amount === 'ok' ? 'ok' : check.amount === 'low' ? 'bad' : 'unknown'}>
            {check.parsed.amount != null ? t('Amount {amount}', { amount: money(check.parsed.amount * 100, 'TZS') }) : t('Amount not found')}
          </CheckRow>
          <CheckRow state={check.name === 'ok' ? 'ok' : check.name === 'mismatch' ? 'bad' : 'unknown'}>
            {check.parsed.name ? t('Paid to {name}', { name: check.parsed.name }) : t('Name not found')}
          </CheckRow>
          <CheckRow state={check.txn === 'ok' ? 'ok' : 'unknown'}>
            {check.parsed.txnId ? (
              <>
                {t('Transaction')} <span className="code text-13">{check.parsed.txnId}</span>
              </>
            ) : (
              t('Transaction ID not found')
            )}
          </CheckRow>
        </ul>
      )}
      {p.sms && <p className="mt-3 rounded-12 bg-card p-3 font-mono text-12 leading-5 [overflow-wrap:anywhere] whitespace-pre-line text-ink-2">{p.sms}</p>}
      <div className="mt-3">
        <AmountInput currency={currency} value={amount} onValue={setAmount} label={t('Amount received')} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => decide('confirm')}>
          {t('Money received')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => decide('reject')}>
          {t('Not received')}
        </button>
      </div>
    </div>
  )
}

function RecordPayment({ open, onClose, id, currency, balance, onDone }: { open: boolean; onClose: () => void; id: string; currency: 'TZS' | 'USD'; balance: number; onDone: () => void }) {
  const t = useT()
  const [amount, setAmount] = useState(String(balance / 100))
  const [method, setMethod] = useState<PayMethod>('mobile')
  const [day, setDay] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title={t('Record a payment')}>
      <div className="space-y-4">
        <Field label={t('Amount')} hint={t('Still owed: {amount}', { amount: money(balance, currency) })}>
          <AmountInput currency={currency} value={amount} onValue={setAmount} label={t('Amount')} />
        </Field>
        <FieldGroup label={t('Paid by')} radio>
          <div className="flex flex-wrap gap-2">
            {PAY_METHODS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} aria-pressed={method === m} className="chip" onClick={() => setMethod(m)}>
                {t(PAY_METHOD_LABEL[m])}
              </button>
            ))}
          </div>
        </FieldGroup>
        <Field label={t('Date')} aside={t('Today if empty')}>
          <input className="input min-w-0 appearance-none" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label={t('Reference')} aside={t('Optional')}>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('e.g. the transaction ID')} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button
          type="button"
          className="btn btn-lg w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            const res = await recordInvoicePayment({ data: { id, amount, method, day, reference } })
            setBusy(false)
            if ('error' in res) return setError(res.error === 'too_much' ? t('That is much more than what is owed. Check the amount.') : res.error === 'amount' ? t('Type the amount paid.') : t('Something went wrong. Try again.'))
            onDone()
            onClose()
          }}
        >
          {busy ? t('Saving') : t('Save payment')}
        </button>
      </div>
    </Sheet>
  )
}

/** A reminder on WhatsApp in four tones, friendly to final notice, in the invoice's language. */
function Reminders({ inv, business, link }: { inv: ReturnType<typeof Route.useLoaderData>['invoice']; business: string; link: string }) {
  const t = useT()
  const [tone, setTone] = useState<Tone>('friendly')
  const text = reminderText(inv.lang, tone, {
    client: inv.client.name,
    business,
    number: displayNumber(inv.kind, inv.number),
    amount: money(Math.max(0, inv.total - inv.paid), inv.currency),
    due: inv.due_day ? docDate(inv.due_day, inv.lang) : '',
    link,
  })
  return (
    <Card title={t('Remind your client')} sub={t('A message from your WhatsApp, in the invoice’s language.')}>
      <div className="hide-scroll -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-6 md:px-6">
        {TONES.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={tone === x.id} onClick={() => setTone(x.id)}>
            {t(x.label)}
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-14 bg-page p-4 text-14 leading-6 [overflow-wrap:anywhere] whitespace-pre-line text-ink-2">{text}</p>
      <a href={waTo(inv.client.phone, text)} target="_blank" rel="noreferrer" className="btn btn-ghost mt-3 w-full">
        <WhatsAppMark size={18} /> {t('Send reminder')}
      </a>
    </Card>
  )
}
