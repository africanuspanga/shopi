/**
 * Shopi Invoices (roadmap `v-invoices`, the founder's answers of 20 Nov 2026), safe in the browser and on the server:
 * the two kinds (invoice, quote), money in cents, the totals, what state a document is in, the business's invoice
 * settings, and the WhatsApp messages (sending one, and reminders in four tones).
 *
 * Taken over from Ankara (the founder's invoice app, closing): `computeTotals` (discount first, then VAT per line on
 * the discounted base), statuses where overdue and expired are worked out from the date and never stored, a quote
 * turning into an invoice, the reminder tones, and a document that names itself on its last line.
 */
import { msg, translate, type Lang, type T } from '#/lib/i18n'
import { addDays } from '#/lib/booking'

export type InvoiceKind = 'invoice' | 'quote'
export const asKind = (v: unknown): InvoiceKind => (v === 'quote' ? 'quote' : 'invoice')

/** TSh for everyone; US dollars on Tembo (a clearing agent bills in USD). */
export type Currency = 'TZS' | 'USD'
export const CURRENCIES: Currency[] = ['TZS', 'USD']
export const asCurrency = (v: unknown): Currency => (v === 'USD' ? 'USD' : 'TZS')

/** Tanzania's VAT rate, put on a line with one tap by a VAT-registered business. */
export const VAT = 18
export const LINES_MAX = 100
/** Days to pay a new invoice: the choices offered, and the default. A quote holds its price for QUOTE_DAYS. */
export const DUE_CHOICES = [0, 7, 14, 30]
export const DUE_DEFAULT = 14
export const QUOTE_DAYS = 30

export type DiscountType = 'none' | 'percent' | 'fixed'
export const asDiscountType = (v: unknown): DiscountType => (v === 'percent' || v === 'fixed' ? v : 'none')

/** A line as written: `price` in the currency's units (TSh, or dollars with cents), `tax` a percent (0 or 18). */
export type InvoiceLine = { name: string; description: string; qty: number; unit: string; price: number; tax: number }
export type InvoiceClient = { name: string; company: string; phone: string; email: string; address: string; tin: string }
export const EMPTY_CLIENT: InvoiceClient = { name: '', company: '', phone: '', email: '', address: '', tin: '' }

/** In the currency's units. */
export type Totals = { subtotal: number; discount: number; tax: number; total: number }

const decimals = (c: Currency) => (c === 'TZS' ? 0 : 2)

/**
 * Rounds to what the currency can be paid in: whole shillings (nobody pays TSh 14,567.10, so a total with cents could
 * never be paid in full), or dollars and cents.
 */
export const roundMoney = (n: number, currency: Currency) => {
  const f = 10 ** decimals(currency)
  return Math.round((n + Number.EPSILON) * f) / f
}

export const lineTotal = (l: Pick<InvoiceLine, 'qty' | 'price'>, currency: Currency) => roundMoney(l.qty * l.price, currency)

/**
 * The discount comes off the subtotal; VAT is then worked out per line on its share of the discounted amount. That is
 * how small Tanzanian businesses quote: agree the discount, then add VAT if registered (Ankara, `computeTotals`).
 * Every figure is rounded to the currency (whole shillings for TSh), so the total is an amount that can be paid.
 */
export function computeTotals(lines: Pick<InvoiceLine, 'qty' | 'price' | 'tax'>[], discountType: DiscountType, discountValue: number, currency: Currency): Totals {
  const r = (n: number) => roundMoney(n, currency)
  const subtotal = r(lines.reduce((s, l) => s + lineTotal(l, currency), 0))
  let discount = 0
  if (discountType === 'percent') discount = r((subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100)
  else if (discountType === 'fixed') discount = r(Math.min(Math.max(discountValue, 0), subtotal))
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0
  const tax = r(lines.reduce((s, l) => s + lineTotal(l, currency) * factor * ((l.tax || 0) / 100), 0))
  return { subtotal, discount, tax, total: r(subtotal - discount + tax) }
}

/** Stored money is in cents of the document's currency, so dollars keep their cents and sums stay exact. */
export const toCents = (units: number) => Math.round(units * 100)

/** An amount typed or read for a payment, in cents, rounded like the document's money (whole shillings for TSh). */
export const paymentCents = (units: number, currency: Currency) => toCents(roundMoney(units, currency))
const PREFIX: Record<Currency, string> = { TZS: 'TSh', USD: 'USD' }

/** A bare amount from units, for table cells and inputs: "60,000" or "1,250.50". */
export function plain(units: number, currency: Currency) {
  return units.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals(currency) })
}

/** Money from cents, as printed: "TSh 60,000" or "USD 1,250.00". TSh shows no cents. */
export function money(cents: number, currency: Currency) {
  const d = decimals(currency)
  const n = cents / 100
  return `${PREFIX[currency]} ${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

/** Money from units (a line, a total being typed). */
export const moneyUnits = (units: number, currency: Currency) => money(toCents(units), currency)

/** What a document is called and numbered: INV-0001, QUO-0001 (per shop and kind). */
export const displayNumber = (kind: InvoiceKind, number: number) => `${kind === 'quote' ? 'QUO' : 'INV'}-${String(number).padStart(4, '0')}`

/** A day (YYYY-MM-DD) as printed on a document: "20 Nov 2026" / "20 Nov 2026" in Swahili's month names. */
export function docDate(day: string | null | undefined, lang: Lang) {
  if (!day) return ''
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/* ---------- The business's settings (shops.bill) ---------- */

export type BillSettings = {
  /** Printed under the business's name. */
  address: string
  email: string
  /** VAT registration number, for a VAT-registered business. */
  vrn: string
  /** New lines start with VAT on. */
  vat: boolean
  /** Bank accounts and other ways to pay, as free text: several accounts or one per currency fit (WTL Africa had four). */
  bank: string
  /** "Payment due within 14 days." Printed as Payment terms. */
  terms: string
  /** Days to pay a new invoice (DUE_CHOICES). */
  due: number
  currency: Currency
  /** The language new documents are written in; empty: the shop's. */
  lang: '' | Lang
}

export const DEFAULT_BILL: BillSettings = { address: '', email: '', vrn: '', vat: false, bank: '', terms: '', due: DUE_DEFAULT, currency: 'TZS', lang: '' }

export function parseBill(raw: string | null | undefined): BillSettings | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<BillSettings>
    return {
      address: String(v.address ?? '').slice(0, 300),
      email: String(v.email ?? '').slice(0, 120),
      vrn: String(v.vrn ?? '').slice(0, 30),
      vat: !!v.vat,
      bank: String(v.bank ?? '').slice(0, 1000),
      terms: String(v.terms ?? '').slice(0, 500),
      due: DUE_CHOICES.includes(Number(v.due)) ? Number(v.due) : DUE_DEFAULT,
      currency: asCurrency(v.currency),
      lang: v.lang === 'sw' || v.lang === 'en' ? v.lang : '',
    }
  } catch {
    return null
  }
}

/** The day a new document falls due (an invoice) or stops being valid (a quote). Null: due on receipt. */
export function dueFor(kind: InvoiceKind, issue: string, bill: BillSettings | null) {
  const days = kind === 'quote' ? QUOTE_DAYS : (bill?.due ?? DUE_DEFAULT)
  return days > 0 ? addDays(issue, days) : null
}

/* ---------- State ---------- */

export type InvoiceStatus = 'draft' | 'sent' | 'cancelled' | 'accepted' | 'declined'

/**
 * What a document is now, worked out when read. An invoice: draft, sent, viewed, part (part paid), paid, overdue,
 * cancelled. A quote: draft, sent, viewed, accepted, invoiced (an invoice was made from it), declined, expired,
 * cancelled.
 */
export type InvoiceState = 'draft' | 'sent' | 'viewed' | 'part' | 'paid' | 'overdue' | 'cancelled' | 'accepted' | 'invoiced' | 'declined' | 'expired'

export type StateInput = {
  kind: InvoiceKind
  status: string
  total: number
  paid: number
  due_day: string | null
  viewed_at: number | null
  /** A quote that became an invoice. */
  invoiced?: boolean
}

export function invoiceState(i: StateInput, today: string): InvoiceState {
  if (i.status === 'cancelled') return 'cancelled'
  if (i.kind === 'quote') {
    if (i.invoiced) return 'invoiced'
    if (i.status === 'accepted') return 'accepted'
    if (i.status === 'declined') return 'declined'
    if (i.status === 'draft') return 'draft'
    if (i.due_day && i.due_day < today) return 'expired'
    return i.viewed_at ? 'viewed' : 'sent'
  }
  if (i.total > 0 && i.paid >= i.total) return 'paid'
  if (i.status === 'draft' && i.paid === 0) return 'draft'
  if (i.due_day && i.due_day < today) return 'overdue'
  if (i.paid > 0) return 'part'
  return i.viewed_at ? 'viewed' : 'sent'
}

/** Still owed, in cents. A quote is never owed: it quotes a price, it doesn't ask to be paid. */
export const owed = (i: { kind: InvoiceKind; status: string; total: number; paid: number }) =>
  i.kind === 'invoice' && i.status !== 'cancelled' && i.status !== 'draft' ? Math.max(0, i.total - i.paid) : 0

/** Tones: ok (green dot), wait (amber), bad (red), hot (Moto: the business should act), quiet (grey). */
export const STATE_LABEL: Record<InvoiceState, { label: string; tone: 'ok' | 'wait' | 'bad' | 'hot' | 'quiet' }> = {
  draft: { label: msg('Draft'), tone: 'quiet' },
  sent: { label: msg('Sent'), tone: 'wait' },
  viewed: { label: msg('Seen by the client'), tone: 'wait' },
  part: { label: msg('Part paid'), tone: 'wait' },
  paid: { label: msg('Paid'), tone: 'ok' },
  overdue: { label: msg('Overdue'), tone: 'bad' },
  cancelled: { label: msg('Cancelled'), tone: 'quiet' },
  accepted: { label: msg('Accepted'), tone: 'hot' },
  invoiced: { label: msg('Invoiced'), tone: 'ok' },
  declined: { label: msg('Declined'), tone: 'quiet' },
  expired: { label: msg('Expired'), tone: 'quiet' },
}

export const KIND_NAME: Record<InvoiceKind, string> = { invoice: msg('Invoice'), quote: msg('Quote') }

/**
 * The document's last line, in English in both languages: it declares what the paper is, as Tanzanian commercial
 * paper does whatever the body's language (Ankara's rule). Nothing is printed after it.
 */
export const STATEMENT: Record<InvoiceKind, string> = { invoice: 'THIS IS A COMMERCIAL INVOICE.', quote: 'THIS IS A QUOTATION.' }

/** How a payment came in. */
export type PayMethod = 'mobile' | 'bank' | 'cash' | 'other'
export const PAY_METHODS: PayMethod[] = ['mobile', 'bank', 'cash', 'other']
export const asPayMethod = (v: unknown): PayMethod => (PAY_METHODS.includes(v as PayMethod) ? (v as PayMethod) : 'other')
export const PAY_METHOD_LABEL: Record<PayMethod, string> = { mobile: msg('Mobile money'), bank: msg('Bank'), cash: msg('Cash'), other: msg('Other') }

/* ---------- WhatsApp messages (written in the document's language) ---------- */

type MessageCtx = { kind: InvoiceKind; client: string; business: string; number: string; amount: string; due: string; link: string }

/** The message that goes with a new document. */
export function sendText(lang: Lang, c: MessageCtx) {
  const tr = (en: string, vars?: Record<string, string>) => translate(lang, en, vars)
  const vars = { name: c.client, number: c.number, business: c.business, amount: c.amount, due: c.due }
  const body =
    c.kind === 'quote'
      ? c.due
        ? tr('Here is quote {number} from {business} for {amount}, valid until {due}.', vars)
        : tr('Here is quote {number} from {business} for {amount}.', vars)
      : c.due
        ? tr('Here is invoice {number} from {business} for {amount}, due {due}.', vars)
        : tr('Here is invoice {number} from {business} for {amount}.', vars)
  return [
    c.client ? tr('Hello {name},', vars) : tr('Hello,'),
    body,
    c.kind === 'quote' ? tr('You can see it here: {link}', { link: c.link }) : tr('You can see it and pay here: {link}', { link: c.link }),
  ].join('\n')
}

export type Tone = 'friendly' | 'professional' | 'firm' | 'final'
export const TONES: { id: Tone; label: string }[] = [
  { id: 'friendly', label: msg('Friendly') },
  { id: 'professional', label: msg('Professional') },
  { id: 'firm', label: msg('Firm') },
  { id: 'final', label: msg('Final notice') },
]

/** Reminders that sound like a person, not a debt collector, until the final notice: still polite, but plain (Ankara). */
export function reminderText(lang: Lang, tone: Tone, c: Omit<MessageCtx, 'kind'>) {
  const tr = (en: string, vars?: Record<string, string>) => translate(lang, en, vars)
  const v = { name: c.client, number: c.number, amount: c.amount, due: c.due, business: c.business }
  const lines: Record<Tone, string[]> = {
    friendly: [
      c.due
        ? tr('Just a friendly reminder: invoice {number} for {amount} is still waiting for payment (due {due}).', v)
        : tr('Just a friendly reminder: invoice {number} for {amount} is still waiting for payment.', v),
      tr('If you have already paid, please let me know. Thank you.', v),
    ],
    professional: [
      c.due ? tr('This is a reminder that invoice {number} for {amount}, due {due}, is still unpaid.', v) : tr('This is a reminder that invoice {number} for {amount} is still unpaid.', v),
      tr('Please pay using the details on the invoice. Thank you.', v),
    ],
    firm: [
      c.due ? tr('Invoice {number} for {amount} is past its due date ({due}).', v) : tr('Invoice {number} for {amount} is past its due date.', v),
      tr('We kindly ask that it is paid within the next three days. If you have already paid, please send us the confirmation.', v),
    ],
    final: [
      c.due ? tr('This is a final notice about invoice {number} for {amount}, due {due}.', v) : tr('This is a final notice about invoice {number} for {amount}.', v),
      tr('Please contact {business} today to settle it. Thank you for your cooperation.', v),
    ],
  }
  return [c.client ? tr('Hello {name},', v) : tr('Hello,'), ...lines[tone], tr('You can see it here: {link}', { link: c.link }), `— ${c.business}`].join('\n')
}

/** A WhatsApp link with the message, to the client's number when there is one (else WhatsApp asks who to send it to). */
export function whatsappTo(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '').replace(/^0(?=[67]\d{8}$)/, '255')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** The client as one line: "Asha Mushi · Bahari Logistics". */
export const clientLine = (c: Pick<InvoiceClient, 'name' | 'company'>) => [c.company, c.name].filter(Boolean).join(' · ')

/** Who the document is to, for a list row: the company first when there is one. */
export const clientTitle = (c: Pick<InvoiceClient, 'name' | 'company'>, t: T) => c.company || c.name || t('No client yet')

/* ---------- The document, as drawn on screen and in the PDF ---------- */

/** Everything the document shows; the screen (components/invoice.tsx) and the PDF (lib/invoice-pdf.tsx) draw the same. */
export type DocData = {
  kind: InvoiceKind
  /** "INV-0004", or null before it is saved (the document says "Draft"). */
  number: string | null
  lang: Lang
  currency: Currency
  issue_day: string
  due_day: string | null
  reference: string
  client: InvoiceClient
  lines: InvoiceLine[]
  discount_type: DiscountType
  discount_value: number
  notes: string
  payment_terms: string
  terms: string
  pay_details: string
  /** Confirmed payments, in cents. */
  paid: number
  business: {
    name: string
    logo_key: string | null
    phone: string
    email: string
    address: string
    tin: string
    vrn: string
    /** The Lipa Namba clients pay to, when the business has one. */
    lipa: { number: string; network: string; name: string } | null
  }
  /** The "Made with Shopi" line under the document. */
  badge: boolean
}

type DocShop = {
  name: string
  logo_key: string | null
  whatsapp: string
  tin: string
  lipa_number: string
  lipa_network: string
  lipa_name: string
  badge: boolean
  bill: BillSettings | null
}
type DocFields = Omit<DocData, 'business' | 'badge' | 'number' | 'paid'> & { number?: number | null; paid?: number }

export function docOf(d: DocFields, shop: DocShop): DocData {
  return {
    ...d,
    number: d.number ? displayNumber(d.kind, d.number) : null,
    paid: d.paid ?? 0,
    business: {
      name: shop.name,
      logo_key: shop.logo_key,
      phone: shop.whatsapp,
      email: shop.bill?.email ?? '',
      address: shop.bill?.address ?? '',
      tin: shop.tin,
      vrn: shop.bill?.vrn ?? '',
      lipa: shop.lipa_number ? { number: shop.lipa_number, network: shop.lipa_network, name: shop.lipa_name } : null,
    },
    badge: shop.badge,
  }
}

/**
 * The language every invoice and quotation is printed in, on screen and in the PDF: English, whatever the app's or the
 * document's language (the founder, 23 Nov 2026: "all text on the invoice PDF stays in English"). A document's `lang`
 * still chooses the WhatsApp message and the client's page around the document.
 */
export const DOC_LANG: Lang = 'en'

/** The words printed on a document, always in `DOC_LANG`. */
export function docWords() {
  const tr = (en: string, vars?: Record<string, string | number>) => translate(DOC_LANG, en, vars)
  return {
    tr,
    // A quote is titled Quotation on the document (the founder, 23 Nov 2026); the app still says Quote.
    title: (k: InvoiceKind) => (k === 'quote' ? tr('Quotation') : tr('Invoice')),
    numberLabel: (k: InvoiceKind) => (k === 'quote' ? tr('Quote no.') : tr('Invoice no.')),
    dueLabel: (k: InvoiceKind) => (k === 'quote' ? tr('Valid until') : tr('Due date')),
  }
}

/** +255754123456 → 0754 123 456, as people write it here; anything else as typed. */
export const phoneText = (p: string) => {
  const local = /^\+?255\d{9}$/.test(p) ? `0${p.replace(/^\+?255/, '')}` : p
  return /^0\d{9}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : p
}

/** A TIN as printed: 123-456-789. */
export const tinText = (d: string) => (/^\d{9}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d)
