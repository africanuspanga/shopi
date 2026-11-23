import { useRouter } from '@tanstack/react-router'
import { ArrowUpRight, Camera, Check, ChevronRight, Copy, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { InvoiceDocument } from '#/components/invoice'
import { AmountInput } from '#/components/invoice-form'
import { PayNames, StepHead, useMoveOn, usePass, useStepClock } from '#/components/setup'
import { ErrorText, Field, FieldGroup, Sheet, ShopAvatar, Switch, showFirstError } from '#/components/ui'
import { markInvoiceSent, saveBillSettings, saveInvoice } from '#/lib/api/invoices'
import { saveSetupPayment, saveShopLogo, type SetupInvoice, type SetupShop } from '#/lib/api/setup'
import { dayOf } from '#/lib/booking'
import { NETWORKS, typeTin } from '#/lib/format'
import { uploadImage } from '#/lib/upload'
import { eg, asLang, useLang, useT } from '#/lib/i18n'
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
          <span className="block text-12 text-muted">{t('Preview')}</span>
          <span className="block truncate text-15 font-semibold">{shop.name}</span>
          <span className="block text-13 leading-5 text-muted">{t('Your invoices, as clients will see them')}</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.75} className="mr-1 shrink-0 text-muted" />
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
  const moveOn = useMoveOn()
  const clock = useStepClock()
  const router = useRouter()
  const [bill, setBill] = useState<BillSettings>(parseBill(shop.bill) ?? DEFAULT_BILL)
  // Shown with its dashes as it is typed (123-456-789), the way TRA prints it.
  const [tin, setTin] = useState(typeTin(shop.tin))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const logoRef = useRef<HTMLInputElement>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const doc = sampleDoc(shop, t, { bill, tin: tin.replace(/\D/g, '') })
  useEffect(() => onDoc(doc), [bill, tin, shop.logo_key]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<BillSettings>) => setBill((b) => ({ ...b, ...p }))

  // The logo is saved the moment it is chosen (the preview shows it on the invoice at once); the rest waits for Save.
  async function pickLogo(file: File | undefined) {
    if (!file) return
    setLogoBusy(true)
    setError('')
    try {
      const res = await saveShopLogo({ data: { key: await uploadImage(file, 400) } })
      if ('error' in res) throw new Error(res.error)
      await router.invalidate()
    } catch {
      setError(t('The logo did not upload. Try again.'))
    }
    setLogoBusy(false)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await saveBillSettings({ data: { address: bill.address, email: bill.email, vat: bill.vat, vrn: bill.vrn, tin, seconds: clock(), setup: 2 } })
      if ('error' in res) {
        setBusy(false)
        return setError(res.error === 'email' ? t('That email doesn’t look right.') : res.error === 'tin' ? t('A TIN has 9 digits.') : t('Something went wrong. Try again.'))
      }
      await moveOn()
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
        <FieldGroup label={t('Logo')} aside={t('Optional')}>
          <div className="flex items-center gap-4">
            <button type="button" className="group relative shrink-0" onClick={() => logoRef.current?.click()} disabled={logoBusy} aria-label={shop.logo_key ? t('Change logo') : t('Add a logo')}>
              <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-16 w-16 text-20" />
              <span className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white ring-4 ring-page transition-transform group-active:scale-95">
                {logoBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} strokeWidth={1.75} />}
              </span>
            </button>
            <div className="min-w-0">
              <button type="button" className="flex min-h-11 items-center text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => logoRef.current?.click()} disabled={logoBusy}>
                {logoBusy ? t('Uploading') : shop.logo_key ? t('Change logo') : t('Add a logo')}
              </button>
              <p className="text-13 leading-5 text-muted">{t('It prints at the top of every invoice. Without one, clients see your initials.')}</p>
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                pickLogo(f)
              }}
            />
          </div>
        </FieldGroup>
        <Field label={t('Address')} aside={t('Optional')}>
          <input className="input" value={bill.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('e.g. Plot 12, Kurasini, Dar es Salaam')} />
        </Field>
        <Field label={t('Email')} aside={t('Optional')}>
          <input className="input" type="email" value={bill.email} onChange={(e) => set({ email: e.target.value })} placeholder={eg(t, 'info@yourbusiness.co.tz')} />
        </Field>
        <Field label={t('TIN')} aside={t('Optional')} hint={t('Your Taxpayer Identification Number from TRA, 9 digits.')}>
          <input className="input tnum" inputMode="numeric" value={tin} onChange={(e) => setTin(typeTin(e.target.value))} placeholder={eg(t, '123-456-789')} />
        </Field>
        <Switch label={t('I am registered for VAT')} sub={t('New lines start with VAT {rate}%; you can take it off any line.', { rate: VAT })} checked={bill.vat} onChange={(vat) => set({ vat })} />
        {bill.vat && (
          <Field label={t('VRN')} hint={t('Your VAT registration number.')}>
            <input className="input" value={bill.vrn} onChange={(e) => set({ vrn: e.target.value })} placeholder={eg(t, '40-012345-A')} />
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
export function BillPayStep({ shop, owner, bar, onDoc }: { shop: SetupShop; /** The owner's name from sign-up. */ owner: string; bar: React.ReactNode; onDoc: (d: DocData) => void }) {
  const t = useT()
  const moveOn = useMoveOn()
  const clock = useStepClock()
  const saved = parseBill(shop.bill) ?? DEFAULT_BILL
  const [network, setNetwork] = useState(shop.lipa_network)
  const [number, setNumber] = useState(shop.lipa_number)
  const [name, setName] = useState(shop.lipa_name)
  const [bank, setBank] = useState(saved.bank)
  const [due, setDue] = useState(saved.due)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // What is missing, said on its own box, every box at once.
  const [missing, setMissing] = useState<{ network?: string; number?: string; name?: string }>({})
  const gaps = {
    network: t('Choose the network your number is on.'),
    number: t('Enter your Lipa Namba or number.'),
    name: t('Enter the name on payments.'),
  }
  const doc = sampleDoc(shop, t, { bill: { ...saved, bank, due }, lipa: { network, number, name } })
  useEffect(() => onDoc(doc), [network, number, name, bank, due]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError('')
    const lipa = number.replace(/\D/g, '')
    if (!lipa && !bank.trim()) {
      setMissing({})
      return setError(t('Add a Lipa Namba or bank details, or do this later.'))
    }
    const found: typeof missing = {}
    if (lipa) {
      if (!network) found.network = gaps.network
      if (lipa.length < 4) found.number = gaps.number
      if (!name.trim()) found.name = gaps.name
    }
    setMissing(found)
    if (Object.keys(found).length) return showFirstError()
    setBusy(true)
    try {
      if (lipa) {
        const res = await saveSetupPayment({ data: { network, number, name, seconds: clock() } })
        if ('error' in res) {
          setBusy(false)
          const what = res.error ?? 'name'
          setMissing({ [what]: gaps[what] })
          return showFirstError()
        }
      }
      const res = await saveBillSettings({ data: { bank, due, seconds: clock(), setup: 3 } })
      if ('error' in res) {
        setBusy(false)
        return setError(t('Something went wrong. Try again.'))
      }
      await moveOn()
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
        <FieldGroup label={t('Lipa Namba network')} error={missing.network}>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={network === n}
                onClick={() => {
                  setNetwork(n)
                  setMissing((m) => ({ ...m, network: undefined }))
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </FieldGroup>
        <Field label={t('Lipa Namba or number')} error={missing.number}>
          <input
            className="input code"
            inputMode="numeric"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value)
              setMissing((m) => ({ ...m, number: undefined }))
            }}
            placeholder={eg(t, '5512345')}
          />
        </Field>
        {number.replace(/\D/g, '') && (
          <div>
            <Field label={t('Name on payments')} error={missing.name} hint={t('Exactly as it shows on the payment SMS. We use it to check clients’ proof.')}>
              <input
                className="input"
                value={name}
                autoCapitalize="characters"
                onChange={(e) => {
                  setName(e.target.value)
                  setMissing((m) => ({ ...m, name: undefined }))
                }}
              />
            </Field>
            <PayNames
              shop={shop.name}
              owner={owner}
              value={name}
              onPick={(n) => {
                setName(n)
                setMissing((m) => ({ ...m, name: undefined }))
              }}
            />
          </div>
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
export function FirstInvoiceStep({
  shop,
  bar,
  onDoc,
  saved,
}: {
  shop: SetupShop
  bar: React.ReactNode
  onDoc: (d: DocData) => void
  /** The first invoice already made (the step opened again with Back, or after a reload): "ready" shows it. */
  saved?: SetupInvoice | null
}) {
  const t = useT()
  const appLang = useLang()
  const moveOn = useMoveOn()
  const origin = useOrigin()
  const bill = parseBill(shop.bill) ?? DEFAULT_BILL
  const [client, setClient] = useState(saved?.client ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [what, setWhat] = useState(saved?.what ?? '')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<SetupInvoice | null>(saved ?? null)
  const [copied, setCopied] = useState(false)
  // Sent or copied here: Continue then takes over as the main button.
  const [sentNow, setSentNow] = useState(false)
  // What is missing, said on its own box, every box at once.
  const [missing, setMissing] = useState<{ client?: string; what?: string; amount?: string }>({})
  const price = Number(amount || 0)
  // The preview's one line: what is typed, with VAT for a registered business; an invoice read back (after a reload
  // or Back) is shown by its total, VAT already in it.
  const readBack = !!made && !price
  const line: InvoiceLine = { name: what.trim() || t('Example: your work for the client'), description: '', qty: 1, unit: '', price: readBack ? made.total / 100 : price || 250_000, tax: readBack ? 0 : bill.vat ? VAT : 0 }
  const doc = sampleDoc(shop, t, { client: client.trim() || t('Your client'), line })
  useEffect(() => onDoc(made ? { ...doc, number: displayNumber('invoice', made.number) } : doc), [client, what, amount, made]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError('')
    const found: typeof missing = {}
    if (!client.trim()) found.client = t('Add who this is for.')
    if (!what.trim()) found.what = t('Say what it is for.')
    if (!price) found.amount = t('Enter the amount.')
    setMissing(found)
    if (Object.keys(found).length) return showFirstError()
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
      setMade({
        id: res.id, code: ('code' in res && res.code) || '', number: ('number' in res && res.number) || 1, client: client.trim(), phone, what: what.trim(),
        total: toCents(computeTotals([{ ...line, price }], 'none', 0, 'TZS').total), currency: 'TZS', due_day: doc.due_day, lang: doc.lang, sent: false,
      })
      window.scrollTo(0, 0)
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  if (made) {
    const link = `${origin}/i/${made.code}`
    const number = displayNumber('invoice', made.number)
    const lang = asLang(made.lang)
    const text = sendText(lang, { kind: 'invoice', client: made.client, business: shop.name, number, amount: money(made.total, made.currency), due: made.due_day ? docDate(made.due_day, lang) : '', link })
    const sent = () => {
      setSentNow(true)
      markInvoiceSent({ data: { id: made.id } }).catch(() => {})
    }
    const done = sentNow || made.sent
    return (
      <>
        <StepHead bar={bar} title={t('Your first invoice is ready')} sub={t('Send it on WhatsApp. Your client pays from the link, and you see when they open it.')} />
        {/* The invoice itself, as a slip: its number, who it is for, what for, the amount and when it is due. */}
        <div className="receipt mt-6 px-5 pt-5 pb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="code text-13 text-muted">{number}</p>
            <a href={`/i/${made.code}`} target="_blank" rel="noreferrer" className="-my-3 flex min-h-11 items-center gap-1 text-13 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
              {t('See it as your client will')} <ArrowUpRight size={14} strokeWidth={1.75} className="shrink-0" />
            </a>
          </div>
          <p className="mt-3 text-17 font-semibold break-words">{made.client}</p>
          {made.what && <p className="mt-0.5 text-14 leading-5 break-words text-muted">{made.what}</p>}
          <div className="receipt-rule mt-4 flex items-baseline justify-between gap-3 pt-4">
            <span className="text-14 text-muted">{made.due_day ? t('Due {date}', { date: docDate(made.due_day, appLang) }) : t('Due on receipt')}</span>
            <span className="font-mono text-20 font-medium tracking-tight">{money(made.total, made.currency)}</span>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          <a href={whatsappTo(made.phone, text)} target="_blank" rel="noreferrer" className={`btn btn-lg w-full ${done ? 'btn-ghost' : ''}`} onClick={sent}>
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
          <button type="button" className={`btn btn-lg w-full ${done ? '' : 'btn-quiet'}`} onClick={moveOn}>
            {t('Continue')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <StepHead bar={bar} title={t('Your first invoice')} sub={t('Who it’s for and what for. Try it with any client: you can delete a draft.')} />
      <DocToggle shop={shop} doc={doc} />
      <div className="mt-6 space-y-5">
        <Field label={t('Who it’s for')} error={missing.client}>
          <input
            className="input"
            value={client}
            onChange={(e) => {
              setClient(e.target.value)
              setMissing((m) => ({ ...m, client: undefined }))
            }}
            placeholder={t('e.g. Bahari Logistics Ltd')}
          />
        </Field>
        <Field label={t('Their WhatsApp number')} aside={t('Optional')}>
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={eg(t, '0754 123 456')} />
        </Field>
        <Field label={t('What it’s for')} error={missing.what}>
          <input
            className="input"
            value={what}
            onChange={(e) => {
              setWhat(e.target.value)
              setMissing((m) => ({ ...m, what: undefined }))
            }}
            placeholder={t('e.g. Wedding photography, full day')}
          />
        </Field>
        <Field label={t('Amount')} error={missing.amount}>
          <AmountInput
            currency="TZS"
            value={amount}
            onValue={(v) => {
              setAmount(v)
              setMissing((m) => ({ ...m, amount: undefined }))
            }}
            label={t('Amount')}
          />
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
