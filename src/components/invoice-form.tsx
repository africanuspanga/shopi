import { Link, useRouteContext } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import { BookUser, ChevronDown, Eye, Package, Plus, Search, Trash2 } from 'lucide-react'
import { InvoiceDocument } from '#/components/invoice'
import { TemboPill } from '#/components/tembo'
import { Card, ErrorText, Field, FieldGroup, Sheet } from '#/components/ui'
import { saveInvoice, type getInvoiceEditor } from '#/lib/api/invoices'
import { addDays } from '#/lib/booking'
import { LANGUAGES, useT, type Lang } from '#/lib/i18n'
import {
  CURRENCIES, DUE_CHOICES, EMPTY_CLIENT, QUOTE_DAYS, VAT, computeTotals, docOf, dueFor, lineTotal, money, toCents,
  type Currency, type DiscountType, type InvoiceClient, type InvoiceKind, type InvoiceLine,
} from '#/lib/invoice'

/**
 * Writing an invoice or a quote (roadmap `v-invoices`): who it is for, the lines, VAT and a discount, the dates, the
 * currency and language, and what is printed under it. A live preview sits beside it on desktop; phones open it from
 * a button. The server works the totals out again; what is shown here is only for the eye.
 */

type Editor = NonNullable<Awaited<ReturnType<typeof getInvoiceEditor>>>

/** A line as being typed: the numbers stay text until saved. */
type Draft = { key: number; name: string; description: string; qty: string; unit: string; price: string; tax: number }

let keys = 0
const draftOf = (l: Partial<InvoiceLine>, tax: number): Draft => ({
  key: ++keys,
  name: l.name ?? '',
  description: l.description ?? '',
  qty: l.qty != null ? String(l.qty) : '1',
  unit: l.unit ?? '',
  price: l.price ? String(l.price) : '',
  tax: l.tax ?? tax,
})
const numOf = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const lineOf = (d: Draft): InvoiceLine => ({ name: d.name.trim(), description: d.description.trim(), qty: numOf(d.qty), unit: d.unit.trim(), price: numOf(d.price), tax: d.tax })

export function InvoiceForm({ data, kind, onSaved }: { data: Editor; kind: InvoiceKind; onSaved: (id: string) => void }) {
  const t = useT()
  const shop = data.shop
  const bill = shop.bill
  const inv = data.invoice
  const from = data.from
  const vatDefault = bill?.vat ? VAT : 0
  // Where clients' money goes is the owner's to say (the invoice settings fill it in for an assistant's documents).
  const owner = useRouteContext({ from: '/app' }).shop.role === 'owner'
  // Payments were made in this currency, so it stays (the server refuses a change too).
  const currencyHeld = data.held

  const [clientId, setClientId] = useState<string | null>(inv?.client_id ?? null)
  const [client, setClient] = useState<InvoiceClient>(inv?.client ?? from?.client ?? EMPTY_CLIENT)
  const [moreClient, setMoreClient] = useState(!!(inv?.client.email || inv?.client.address || inv?.client.tin))
  const [picking, setPicking] = useState<'' | 'client' | 'catalog'>('')
  const [lines, setLines] = useState<Draft[]>(() => {
    const start = inv?.lines ?? from?.lines ?? []
    return start.length ? start.map((l) => draftOf(l, vatDefault)) : [draftOf({}, vatDefault)]
  })
  // An order or a booking is in TSh, whatever currency new invoices start in.
  const [currency, setCurrency] = useState<Currency>(inv?.currency ?? (from?.order_id || from?.booking_id ? 'TZS' : (bill?.currency ?? 'TZS')))
  const [lang, setLang] = useState<Lang>(inv?.lang ?? (bill?.lang || shop.lang))
  const [issue, setIssue] = useState(inv?.issue_day ?? data.today)
  const [due, setDue] = useState<string>(inv ? (inv.due_day ?? '') : (dueFor(kind, data.today, bill) ?? ''))
  const [reference, setReference] = useState(inv?.reference ?? from?.reference ?? '')
  const [discountType, setDiscountType] = useState<DiscountType>(inv?.discount_type ?? (from?.discount ? 'fixed' : 'none'))
  const [discountValue, setDiscountValue] = useState(inv?.discount_value ? String(inv.discount_value) : from?.discount ? String(from.discount) : '')
  const [notes, setNotes] = useState(inv?.notes ?? '')
  const [paymentTerms, setPaymentTerms] = useState(inv ? inv.payment_terms : kind === 'invoice' ? (bill?.terms ?? '') : '')
  const [terms, setTerms] = useState(inv?.terms ?? '')
  const [payDetails, setPayDetails] = useState(inv ? inv.pay_details : (bill?.bank ?? ''))
  const [moreText, setMoreText] = useState(!!(inv?.notes || inv?.terms))
  const [preview, setPreview] = useState(false)
  const [usdNote, setUsdNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const clean = lines.map(lineOf).filter((l) => l.name && l.qty > 0)
  const totals = computeTotals(clean, discountType, numOf(discountValue), currency)
  const doc = docOf(
    {
      kind, number: inv?.number ?? null, lang, currency, issue_day: issue, due_day: due || null, reference, client, lines: clean,
      discount_type: discountType, discount_value: numOf(discountValue), notes, payment_terms: paymentTerms, terms, pay_details: payDetails,
      paid: inv?.paid ?? 0,
    },
    shop,
  )
  const setLine = (key: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const vatShown = !!bill?.vat || lines.some((l) => l.tax > 0)
  const dueDays = due ? Math.round((Date.parse(due) - Date.parse(issue)) / 86_400_000) : 0
  const dueChoices = kind === 'quote' ? [7, 14, QUOTE_DAYS] : DUE_CHOICES

  const save = async () => {
    setError('')
    if (!client.name.trim() && !client.company.trim()) return setError(t('Add who this is for.'))
    if (!clean.length) return setError(t('Add at least one line with a description.'))
    setBusy(true)
    try {
      const res = await saveInvoice({
        data: {
          id: inv?.id, kind, client_id: clientId, client, lang, currency, issue_day: issue, due_day: due || null, reference,
          lines: clean, discount_type: discountType, discount_value: numOf(discountValue), notes, payment_terms: paymentTerms,
          terms, pay_details: payDetails, order_id: from?.order_id ?? null, booking_id: from?.booking_id ?? null,
        },
      })
      if ('error' in res) {
        setBusy(false)
        return setError(
          res.error === 'usd'
            ? t('Invoices in US dollars come with Tembo.')
            : res.error === 'due'
              ? t('The due date can’t be before the date of the invoice.')
              : res.error === 'cancelled'
                ? t('This one is cancelled. Reopen it to change it.')
                : res.error === 'currency'
                  ? t('Payments were made in {currency}, so the currency stays.', { currency: inv?.currency === 'USD' ? 'USD' : 'TSh' })
                  : t('Something went wrong. Try again.'),
        )
      }
      onSaved(res.id)
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  const form = (
    <div className="min-w-0 space-y-4">
      <Card
        title={t('Who it’s for')}
        right={
          data.clients.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking('client')}>
              <BookUser size={16} strokeWidth={1.75} /> {t('Your clients')}
            </button>
          )
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('Name')}>
            <input className="input" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder={t('e.g. Asha Mushi')} autoComplete="off" />
          </Field>
          <Field label={t('Company')} aside={t('Optional')}>
            <input className="input" value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} placeholder={t('e.g. Bahari Logistics Ltd')} autoComplete="off" />
          </Field>
          <Field label={t('WhatsApp number')} aside={t('Optional')}>
            <input className="input" inputMode="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="0754 123 456" autoComplete="off" />
          </Field>
          {moreClient ? (
            <>
              <Field label={t('Email')} aside={t('Optional')}>
                <input className="input" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} autoComplete="off" />
              </Field>
              <Field label={t('Address')} aside={t('Optional')}>
                <input className="input" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} placeholder={t('e.g. Plot 12, Kurasini, Dar es Salaam')} />
              </Field>
              <Field label={t('Client’s TIN')} aside={t('Optional')}>
                <input className="input" inputMode="numeric" value={client.tin} onChange={(e) => setClient({ ...client, tin: e.target.value })} placeholder="123-456-789" />
              </Field>
            </>
          ) : (
            <button type="button" className="flex items-center gap-1 self-end pb-3 text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4" onClick={() => setMoreClient(true)}>
              {t('Add email, address and TIN')} <ChevronDown size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </Card>

      <Card title={t('What it’s for')}>
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={l.key} className="rounded-16 bg-page p-3 md:p-4">
              <div className="flex items-start gap-2">
                <input
                  className="input flex-1 bg-card"
                  value={l.name}
                  onChange={(e) => setLine(l.key, { name: e.target.value })}
                  placeholder={i === 0 ? t('e.g. Wedding photography, full day') : t('Description')}
                  aria-label={t('Description')}
                />
                {lines.length > 1 && (
                  <button type="button" className="icon-btn shrink-0" aria-label={t('Remove this line')} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <textarea
                className="input mt-2 min-h-0 bg-card text-14"
                rows={1}
                value={l.description}
                onChange={(e) => setLine(l.key, { description: e.target.value })}
                placeholder={t('Details, optional')}
                aria-label={t('Details')}
              />
              <div className="mt-2 grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-2 md:grid-cols-[100px_minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="sr-only">{t('Qty')}</span>
                  <span className="input flex items-center gap-1.5 bg-card px-3">
                    <span className="text-13 text-muted">{t('Qty')}</span>
                    <input className="tnum min-w-0 flex-1 bg-transparent outline-none" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^\d.]/g, '').slice(0, 9) })} />
                  </span>
                </label>
                <AmountInput currency={currency} value={l.price} onValue={(price) => setLine(l.key, { price })} label={t('Price')} />
                <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
                  {vatShown && (
                    <button type="button" className="chip h-9 text-13" aria-pressed={l.tax > 0} onClick={() => setLine(l.key, { tax: l.tax > 0 ? 0 : VAT })}>
                      {t('VAT {rate}%', { rate: VAT })}
                    </button>
                  )}
                  <span className="tnum ml-auto text-15 font-medium md:min-w-[120px] md:text-right">{money(toCents(lineTotal(lineOf(l), currency)), currency)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, draftOf({}, vatDefault)])}>
            <Plus size={16} strokeWidth={2.25} /> {t('Add a line')}
          </button>
          {data.catalog.length > 0 && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicking('catalog')}>
              <Package size={16} strokeWidth={1.75} /> {t('From your products and services')}
            </button>
          )}
        </div>

        <div className="mt-6 space-y-3 border-t border-line pt-4 text-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-ink-2">{t('Discount')}</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1" role="radiogroup" aria-label={t('Discount')}>
                {(
                  [
                    ['none', t('None')],
                    ['percent', '%'],
                    ['fixed', currency === 'TZS' ? 'TSh' : 'USD'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={discountType === id} aria-pressed={discountType === id} className="chip h-9 text-13" onClick={() => setDiscountType(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {discountType !== 'none' && (
                <input
                  className="input tnum h-9 w-24 px-3 text-right text-14"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))}
                  aria-label={t('Discount')}
                />
              )}
            </div>
          </div>
          <SumRow label={t('Subtotal')} value={money(toCents(totals.subtotal), currency)} />
          {totals.discount > 0 && <SumRow label={t('Discount')} value={`−${money(toCents(totals.discount), currency)}`} />}
          {totals.tax > 0 && <SumRow label={t('VAT')} value={money(toCents(totals.tax), currency)} />}
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-15 font-semibold">{t('Total')}</span>
            <span className="tnum text-20 font-semibold">{money(toCents(totals.total), currency)}</span>
          </div>
        </div>
      </Card>

      <Card title={t('Dates and details')}>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <Field label={t('Date')}>
            <input className="input min-w-0 appearance-none" type="date" value={issue} onChange={(e) => e.target.value && setIssue(e.target.value)} />
          </Field>
          <Field label={kind === 'quote' ? t('Valid until') : t('Due date')}>
            <input className="input min-w-0 appearance-none" type="date" value={due} min={issue} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <div className="hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              {dueChoices.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={d === 0 ? !due : due !== '' && dueDays === d}
                  onClick={() => setDue(d === 0 ? '' : addDays(issue, d))}
                >
                  {d === 0 ? t('On receipt') : t('{n} days', { n: d })}
                </button>
              ))}
            </div>
          </div>
          <Field label={t('Reference')} aside={t('Optional')} hint={t('The client’s order number, a bill of lading or container number, a job name.')}>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="space-y-4">
            <FieldGroup label={t('Currency')} radio>
              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={currency === c}
                    aria-pressed={currency === c}
                    disabled={currencyHeld && currency !== c}
                    className="chip"
                    onClick={() => (c !== 'TZS' && !shop.usd && c !== inv?.currency ? setUsdNote(true) : setCurrency(c))}
                  >
                    {c === 'TZS' ? 'TSh' : 'USD'}
                    {c !== 'TZS' && !shop.usd && c !== inv?.currency && <TemboPill />}
                  </button>
                ))}
              </div>
              {currencyHeld && <p className="mt-2 text-13 text-muted">{t('Payments were made in {currency}, so the currency stays.', { currency: currency === 'USD' ? 'USD' : 'TSh' })}</p>}
              {usdNote && (
                <p className="mt-2 text-13 text-muted">
                  {t('Invoices in US dollars come with Tembo.')}{' '}
                  <Link to="/app/plan" className="font-medium text-ink underline decoration-line-strong underline-offset-4">
                    {t('See what Tembo adds')}
                  </Link>
                </p>
              )}
            </FieldGroup>
            <FieldGroup label={t('Written in')} radio>
              <div className="flex gap-2">
                {LANGUAGES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={lang === id} aria-pressed={lang === id} className="chip" onClick={() => setLang(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>
        </div>
      </Card>

      <Card title={t('Printed under it')} sub={t('How to pay, your terms and any notes. Your invoice settings fill these in.')}>
        <div className="space-y-4">
          {kind === 'invoice' && owner && (
            <Field label={t('How to pay')} hint={shop.lipa_number ? t('Your Lipa Namba {number} is printed too.', { number: shop.lipa_number }) : undefined}>
              <textarea className="input text-14" rows={3} value={payDetails} onChange={(e) => setPayDetails(e.target.value)} placeholder={t('e.g. CRDB Bank · Account name · 0150 0123 4567 00')} />
            </Field>
          )}
          {kind === 'invoice' && (
            <Field label={t('Payment terms')} aside={t('Optional')}>
              <input className="input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder={t('e.g. 50% before the work, the rest on delivery')} />
            </Field>
          )}
          {moreText ? (
            <>
              <Field label={t('Notes')} aside={t('Optional')}>
                <textarea className="input text-14" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Field label={t('Terms and conditions')} aside={t('Optional')}>
                <textarea className="input text-14" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </Field>
            </>
          ) : (
            <button type="button" className="flex items-center gap-1 text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4" onClick={() => setMoreText(true)}>
              {t('Add notes or terms and conditions')} <ChevronDown size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </Card>

      <div className="space-y-3 pb-4">
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 lg:grid-cols-1">
          <button type="button" className="btn btn-ghost btn-lg lg:hidden" onClick={() => setPreview(true)}>
            <Eye size={18} strokeWidth={1.75} /> {t('Preview')}
          </button>
          <button type="button" className="btn btn-lg min-w-0" disabled={busy} onClick={save}>
            {busy ? t('Saving') : inv ? t('Save changes') : kind === 'quote' ? t('Save quote') : t('Save invoice')}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        {form}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <p className="mb-3 text-13 text-muted">{t('What your client sees')}</p>
          <InvoiceDocument doc={doc} />
        </aside>
      </div>

      <Sheet open={preview} onClose={() => setPreview(false)} title={t('What your client sees')}>
        <InvoiceDocument doc={doc} className="shadow-none" />
      </Sheet>

      <Picker
        open={picking === 'client'}
        title={t('Your clients')}
        onClose={() => setPicking('')}
        items={data.clients.map((c) => ({ id: c.id, title: c.company || c.name, sub: [c.company ? c.name : '', c.phone].filter(Boolean).join(' · ') }))}
        onPick={(id) => {
          const c = data.clients.find((x) => x.id === id)
          if (!c) return
          setClientId(c.id)
          setClient({ name: c.name, company: c.company, phone: c.phone, email: c.email, address: c.address, tin: c.tin })
          if (c.email || c.address || c.tin) setMoreClient(true)
        }}
      />
      <Picker
        open={picking === 'catalog'}
        title={t('Your products and services')}
        onClose={() => setPicking('')}
        items={data.catalog.map((c, i) => ({ id: String(i), title: c.name, sub: money(toCents(c.price), 'TZS') }))}
        onPick={(id) => {
          const c = data.catalog[Number(id)]
          if (!c) return
          setLines((ls) => [...ls.filter((l) => l.name.trim() || l.price), draftOf({ name: c.name, qty: 1, price: currency === 'TZS' ? c.price : 0 }, vatDefault)])
        }}
      />
    </>
  )
}

function SumRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-2">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  )
}

/** An amount as typed: thousands separators for shillings, cents allowed for dollars. Kept as plain digits. */
export function AmountInput({ currency, value, onValue, label }: { currency: Currency; value: string; onValue: (v: string) => void; label: string }) {
  const [int, dec] = value.split('.')
  const shown = int ? Number(int.replace(/\D/g, '') || '0').toLocaleString('en-US') + (currency !== 'TZS' && dec != null ? `.${dec}` : '') : value
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <span className="input flex items-center gap-1.5 bg-card px-3">
        <span className="text-13 text-muted">{currency === 'TZS' ? 'TSh' : 'USD'}</span>
        <input
          className="tnum min-w-0 flex-1 bg-transparent outline-none"
          inputMode={currency === 'TZS' ? 'numeric' : 'decimal'}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value.replace(currency === 'TZS' ? /[^\d]/g : /[^\d.]/g, '')
            const [a, ...b] = raw.split('.')
            onValue((a.slice(0, 12) + (b.length ? `.${b.join('').slice(0, 2)}` : '')).replace(/^0+(?=\d)/, ''))
          }}
          placeholder="0"
        />
      </span>
    </label>
  )
}

/** A searchable list in a sheet: clients, or products and services. */
function Picker({ open, title, items, onClose, onPick }: { open: boolean; title: string; items: { id: string; title: string; sub: string }[]; onClose: () => void; onPick: (id: string) => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? items.filter((x) => `${x.title} ${x.sub}`.toLowerCase().includes(n)) : items
  }, [q, items])
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {items.length > 6 && (
        <label className="input mb-3 flex items-center gap-2 px-4">
          <Search size={16} strokeWidth={1.75} className="text-muted" />
          <input className="min-w-0 flex-1 bg-transparent outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search')} aria-label={t('Search')} />
        </label>
      )}
      <ul className="divide-y divide-line">
        {shown.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 py-3 text-left"
              onClick={() => {
                onPick(x.id)
                onClose()
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-15 font-medium">{x.title}</span>
                {x.sub && <span className="block truncate text-13 text-muted">{x.sub}</span>}
              </span>
              <Plus size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
