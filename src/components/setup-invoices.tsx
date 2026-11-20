import { useRouter } from '@tanstack/react-router'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { InvoiceDocument } from '#/components/invoice'
import { AmountInput } from '#/components/invoice-form'
import { StepHead, usePass, useStepClock } from '#/components/setup'
import { ErrorText, Field, FieldGroup, Sheet, ShopAvatar, Switch } from '#/components/ui'
import { markInvoiceSent, saveBillSettings, saveInvoice } from '#/lib/api/invoices'
import { saveSetupPayment, type SetupShop } from '#/lib/api/setup'
import { dayOf } from '#/lib/booking'
import { NETWORKS } from '#/lib/format'
import { asLang, useT } from '#/lib/i18n'
import {
  DEFAULT_BILL, DUE_CHOICES, VAT, computeTotals, displayNumber, docDate, docOf, dueFor, money, parseBill, sendText, toCents, whatsappTo,
  type BillSettings, type DocData, type InvoiceLine,
} from '#/lib/invoice'
import { useOrigin } from '#/lib/share'

/*
 * The setup for a business that sends invoices (roadmap `v-invoices`): step 2 is how it appears on invoices, step 3 how
 * clients pay it, step 4 its first invoice, sent on WhatsApp. Steps 1 and 5 are shared (src/routes/onboard.tsx,
 * src/components/setup.tsx). The preview is the invoice itself, as the client will see it.
 */

/** The document the preview shows: the business's real details, an example client and line until it writes its own. */
export function sampleDoc(shop: SetupShop, t: ReturnType<typeof useT>, over: { bill?: BillSettings; tin?: string; lipa?: { network: string; number: string; name: string }; client?: string; line?: InvoiceLine } = {}): DocData {
  const bill = over.bill ?? parseBill(shop.bill) ?? DEFAULT_BILL
  const lang = bill.lang || asLang(shop.lang)
  const today = dayOf(Date.now())
  const lipa = over.lipa ?? { network: shop.lipa_network, number: shop.lipa_number, name: shop.lipa_name }
  return docOf(
    {
      kind: 'invoice', number: 1, lang, currency: 'TZS', issue_day: today, due_day: dueFor('invoice', today, bill), reference: '',
      client: { name: over.client ?? t('Your client'), company: '', phone: '', email: '', address: '', tin: '' },
      lines: [over.line ?? { name: t('Example: your work for the client'), description: '', qty: 1, unit: '', price: 250_000, tax: bill.vat ? VAT : 0 }],
      discount_type: 'none', discount_value: 0, notes: '', payment_terms: bill.terms, terms: '', pay_details: bill.bank,
    },
    { name: shop.name, logo_key: shop.logo_key, whatsapp: shop.whatsapp, tin: over.tin ?? shop.tin, lipa_number: lipa.number, lipa_network: lipa.network, lipa_name: lipa.name, badge: true, bill },
  )
}

/** Phones: the invoice preview as a small card that opens it (desktop shows it on the dark panel). */
function DocToggle({ shop, doc }: { shop: SetupShop; doc: DocData }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center gap-3 rounded-16 bg-card p-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-well lg:hidden"
      >
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-11 w-11 text-15" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-15 font-semibold">{shop.name}</span>
          <span className="block truncate text-13 text-muted">{t('Your invoices, as clients will see them')}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 pr-1 text-13 font-medium text-ink-2">
          {t('Preview')} <ChevronRight size={16} strokeWidth={1.75} />
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Your invoices, as clients will see them')}>
        <InvoiceDocument doc={doc} className="shadow-none" />
      </Sheet>
    </>
  )
}

function Skip({ step, busy, setBusy, setError }: { step: number; busy: boolean; setBusy: (b: boolean) => void; setError: (e: string) => void }) {
  const t = useT()
  const pass = usePass(step)
  return (
    <button
      type="button"
      className="btn btn-lg btn-ghost w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        setError('')
        if (!(await pass('skip'))) {
          setBusy(false)
          setError(t('Something went wrong. Try again.'))
        }
      }}
    >
      {t('I’ll do this later')}
    </button>
  )
}

/** Step 2: the address, email, TIN and VAT registration printed under the business's name on every invoice. */
export function BillDetailsStep({ shop, bar, onDoc }: { shop: SetupShop; bar: React.ReactNode; onDoc: (d: DocData) => void }) {
  const t = useT()
  const router = useRouter()
  const clock = useStepClock()
  const [bill, setBill] = useState<BillSettings>(parseBill(shop.bill) ?? DEFAULT_BILL)
  const [tin, setTin] = useState(shop.tin)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const doc = sampleDoc(shop, t, { bill, tin: tin.replace(/\D/g, '') })
  useEffect(() => onDoc(doc), [bill, tin]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<BillSettings>) => setBill((b) => ({ ...b, ...p }))

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await saveBillSettings({ data: { address: bill.address, email: bill.email, vat: bill.vat, vrn: bill.vrn, tin, seconds: clock(), setup: 2 } })
      if ('error' in res) {
        setBusy(false)
        return setError(res.error === 'email' ? t('That email doesn’t look right.') : res.error === 'tin' ? t('A TIN has 9 digits.') : t('Something went wrong. Try again.'))
      }
      await router.invalidate()
      window.scrollTo(0, 0)
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <>
      <StepHead bar={bar} title={t('How you look on invoices')} sub={t('Printed under your name on every invoice and quote. Leave out what you don’t have.')} />
      <DocToggle shop={shop} doc={doc} />
      <div className="mt-6 space-y-5">
        <Field label={t('Address')} aside={t('Optional')}>
          <input className="input" value={bill.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('e.g. Plot 12, Kurasini, Dar es Salaam')} />
        </Field>
        <Field label={t('Email')} aside={t('Optional')}>
          <input className="input" type="email" value={bill.email} onChange={(e) => set({ email: e.target.value })} placeholder="info@yourbusiness.co.tz" />
        </Field>
        <Field label={t('TIN')} aside={t('Optional')} hint={t('Your Taxpayer Identification Number from TRA, 9 digits.')}>
          <input className="input" inputMode="numeric" value={tin} onChange={(e) => setTin(e.target.value)} placeholder="123-456-789" />
        </Field>
        <Switch label={t('I am registered for VAT')} sub={t('New lines start with VAT {rate}%; you can take it off any line.', { rate: VAT })} checked={bill.vat} onChange={(vat) => set({ vat })} />
        {bill.vat && (
          <Field label={t('VRN')} hint={t('Your VAT registration number.')}>
            <input className="input" value={bill.vrn} onChange={(e) => set({ vrn: e.target.value })} placeholder="40-012345-A" />
          </Field>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        <button type="button" className="btn btn-lg w-full" disabled={busy} onClick={save}>
          {busy ? t('Saving') : t('Save and continue')}
        </button>
        <Skip step={2} busy={busy} setBusy={setBusy} setError={setError} />
      </div>
    </>
  )
}

/** Step 3: the Lipa Namba and the bank details clients pay to, and how many days they get. */
export function BillPayStep({ shop, bar, onDoc }: { shop: SetupShop; bar: React.ReactNode; onDoc: (d: DocData) => void }) {
  const t = useT()
  const router = useRouter()
  const clock = useStepClock()
  const saved = parseBill(shop.bill) ?? DEFAULT_BILL
  const [network, setNetwork] = useState(shop.lipa_network)
  const [number, setNumber] = useState(shop.lipa_number)
  const [name, setName] = useState(shop.lipa_name)
  const [bank, setBank] = useState(saved.bank)
  const [due, setDue] = useState(saved.due)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const doc = sampleDoc(shop, t, { bill: { ...saved, bank, due }, lipa: { network, number, name } })
  useEffect(() => onDoc(doc), [network, number, name, bank, due]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError('')
    const lipa = number.replace(/\D/g, '')
    if (!lipa && !bank.trim()) return setError(t('Add a Lipa Namba or bank details, or do this later.'))
    setBusy(true)
    try {
      if (lipa) {
        const res = await saveSetupPayment({ data: { network, number, name, seconds: clock() } })
        if ('error' in res) {
          setBusy(false)
          return setError(res.error === 'network' ? t('Choose the network your number is on.') : res.error === 'number' ? t('Enter your Lipa Namba or number.') : t('Enter the name clients see when they pay.'))
        }
      }
      const res = await saveBillSettings({ data: { bank, due, seconds: clock(), setup: 3 } })
      if ('error' in res) {
        setBusy(false)
        return setError(t('Something went wrong. Try again.'))
      }
      await router.invalidate()
      window.scrollTo(0, 0)
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <>
      <StepHead bar={bar} title={t('How clients pay you')} sub={t('Clients pay you directly; Shopi never holds your money. These go on every invoice.')} />
      <DocToggle shop={shop} doc={doc} />
      <div className="mt-6 space-y-5">
        <FieldGroup label={t('Lipa Namba network')}>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={network === n} onClick={() => setNetwork(n)}>
                {n}
              </button>
            ))}
          </div>
        </FieldGroup>
        <Field label={t('Lipa Namba or number')}>
          <input className="input code" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="5512345" />
        </Field>
        {number.replace(/\D/g, '') && (
          <Field label={t('Name on payments')} hint={t('Exactly as it shows on the payment SMS. We use it to check clients’ proof.')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={shop.name.toUpperCase()} />
          </Field>
        )}
        <Field label={t('Bank details')} aside={t('Optional')} hint={t('One account per line is fine, or one per currency.')}>
          <textarea className="input text-14" rows={3} value={bank} onChange={(e) => setBank(e.target.value)} placeholder={t('e.g. CRDB Bank · Account name · 0150 0123 4567 00')} />
        </Field>
        <FieldGroup label={t('Days to pay a new invoice')} radio>
          <div className="flex flex-wrap gap-2">
            {DUE_CHOICES.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={due === d} aria-pressed={due === d} className="chip" onClick={() => setDue(d)}>
                {d === 0 ? t('On receipt') : t('{n} days', { n: d })}
              </button>
            ))}
          </div>
        </FieldGroup>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        <button type="button" className="btn btn-lg w-full" disabled={busy} onClick={save}>
          {busy ? t('Saving') : t('Save and continue')}
        </button>
        <Skip step={3} busy={busy} setBusy={setBusy} setError={setError} />
      </div>
    </>
  )
}

/** Step 4: the first invoice. Who and what for; then send it on WhatsApp, and the client pays from the link. */
export function FirstInvoiceStep({ shop, bar, onDoc }: { shop: SetupShop; bar: React.ReactNode; onDoc: (d: DocData) => void }) {
  const t = useT()
  const router = useRouter()
  const origin = useOrigin()
  const bill = parseBill(shop.bill) ?? DEFAULT_BILL
  const [client, setClient] = useState('')
  const [phone, setPhone] = useState('')
  const [what, setWhat] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<{ id: string; code: string; number: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const price = Number(amount || 0)
  const line: InvoiceLine = { name: what.trim() || t('Example: your work for the client'), description: '', qty: 1, unit: '', price: price || 250_000, tax: bill.vat ? VAT : 0 }
  const doc = sampleDoc(shop, t, { client: client.trim() || t('Your client'), line })
  useEffect(() => onDoc(made ? { ...doc, number: displayNumber('invoice', made.number) } : doc), [client, what, amount, made]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError('')
    if (!client.trim()) return setError(t('Add who this is for.'))
    if (!what.trim() || !price) return setError(t('Say what it is for and the amount.'))
    setBusy(true)
    try {
      const res = await saveInvoice({
        data: {
          kind: 'invoice', client: { name: client, phone }, lines: [{ ...line, name: what, price }], lang: doc.lang, currency: 'TZS',
          issue_day: doc.issue_day, due_day: doc.due_day, payment_terms: bill.terms, pay_details: bill.bank, setup: true,
        },
      })
      setBusy(false)
      if ('error' in res) return setError(t('Something went wrong. Try again.'))
      setMade({ id: res.id, code: ('code' in res && res.code) || '', number: ('number' in res && res.number) || 1 })
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  if (made) {
    const link = `${origin}/i/${made.code}`
    const text = sendText(doc.lang, { kind: 'invoice', client: client.trim(), business: shop.name, number: displayNumber('invoice', made.number), amount: money(toCents(computeTotals([{ ...line, price }], 'none', 0, 'TZS').total), 'TZS'), due: doc.due_day ? docDate(doc.due_day, doc.lang) : '', link })
    const sent = () => markInvoiceSent({ data: { id: made.id } }).catch(() => {})
    return (
      <>
        <StepHead bar={bar} title={t('Your first invoice is ready')} sub={t('Send it on WhatsApp. Your client pays from the link, and you see when they open it.')} />
        <div className="mt-6 space-y-3">
          <a href={whatsappTo(phone, text)} target="_blank" rel="noreferrer" className="btn btn-lg w-full" onClick={sent}>
            <WhatsAppMark size={18} /> {t('Send on WhatsApp')}
          </a>
          <button
            type="button"
            className="btn btn-lg btn-ghost w-full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
              } catch {
                window.prompt('', link)
              }
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
              sent()
            }}
          >
            {copied ? <Check size={18} strokeWidth={2.25} /> : <Copy size={18} strokeWidth={1.75} />} {copied ? t('Link copied') : t('Copy link')}
          </button>
          <button
            type="button"
            className="btn btn-lg btn-quiet w-full"
            onClick={async () => {
              await router.invalidate()
              window.scrollTo(0, 0)
            }}
          >
            {t('Continue')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <StepHead bar={bar} title={t('Your first invoice')} sub={t('Who it’s for and what for. You add lines, VAT and terms later; this is enough to send.')} />
      <DocToggle shop={shop} doc={doc} />
      <div className="mt-6 space-y-5">
        <Field label={t('Who it’s for')}>
          <input className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder={t('e.g. Bahari Logistics Ltd')} />
        </Field>
        <Field label={t('Their WhatsApp number')} aside={t('Optional')}>
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0754 123 456" />
        </Field>
        <Field label={t('What it’s for')}>
          <input className="input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder={t('e.g. Wedding photography, full day')} />
        </Field>
        <Field label={t('Amount')}>
          <AmountInput currency="TZS" value={amount} onValue={setAmount} label={t('Amount')} />
        </Field>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        <button type="button" className="btn btn-lg w-full" disabled={busy} onClick={save}>
          {busy ? t('Saving') : t('Make the invoice')}
        </button>
        <Skip step={4} busy={busy} setBusy={setBusy} setError={setError} />
      </div>
    </>
  )
}
