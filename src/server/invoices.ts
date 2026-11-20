import { all, db, first, newId, now, run, shortCode } from '#/server/db'
import {
  LINES_MAX, asCurrency, asKind, computeTotals, invoiceState, owed, parseBill, toCents,
  type BillSettings, type Currency, type DiscountType, type InvoiceClient, type InvoiceKind, type InvoiceLine,
} from '#/lib/invoice'
import { asLang, type Lang } from '#/lib/i18n'
import { can, planState } from '#/lib/plans'

/**
 * Invoices and quotes on the server (roadmap `v-invoices`): reading a row, cleaning what the form sends, numbering a
 * new document, and keeping `paid` equal to the confirmed payments. Rules that the browser shares live in
 * src/lib/invoice.ts.
 */

export type InvoiceRow = {
  id: string
  shop_id: string
  kind: string
  number: number
  code: string
  client_id: string | null
  client: string
  lang: string
  currency: string
  issue_day: string
  due_day: string | null
  reference: string
  lines: string
  discount_type: string
  discount_value: number
  subtotal: number
  discount: number
  tax: number
  total: number
  paid: number
  notes: string
  payment_terms: string
  terms: string
  pay_details: string
  status: string
  parent_id: string | null
  order_id: string | null
  booking_id: string | null
  sent_at: number | null
  viewed_at: number | null
  accepted_at: number | null
  paid_at: number | null
  created_at: number
  updated_at: number
  /** A quote that an invoice was made from (worked out in the query). */
  invoiced: number
}

/** The columns, with whether a quote became an invoice; `i` is the invoices table. */
export const INVOICE_COLS = `i.id, i.shop_id, i.kind, i.number, i.code, i.client_id, i.client, i.lang, i.currency, i.issue_day, i.due_day,
  i.reference, i.lines, i.discount_type, i.discount_value, i.subtotal, i.discount, i.tax, i.total, i.paid, i.notes,
  i.payment_terms, i.terms, i.pay_details, i.status, i.parent_id, i.order_id, i.booking_id, i.sent_at, i.viewed_at,
  i.accepted_at, i.paid_at, i.created_at, i.updated_at,
  EXISTS (SELECT 1 FROM invoices c WHERE c.parent_id = i.id AND c.status != 'cancelled') invoiced`

export type Invoice = Omit<InvoiceRow, 'kind' | 'client' | 'lines' | 'lang' | 'currency' | 'invoiced' | 'discount_type'> & {
  kind: InvoiceKind
  client: InvoiceClient
  lines: InvoiceLine[]
  lang: Lang
  currency: Currency
  discount_type: DiscountType
  invoiced: boolean
}

export function readInvoice(r: InvoiceRow): Invoice {
  return {
    ...r,
    kind: asKind(r.kind),
    client: cleanClient(safeJson(r.client, {})),
    lines: cleanLines(safeJson(r.lines, [])),
    lang: asLang(r.lang),
    currency: asCurrency(r.currency),
    discount_type: r.discount_type === 'percent' || r.discount_type === 'fixed' ? r.discount_type : 'none',
    invoiced: !!r.invoiced,
  }
}

function safeJson<T>(raw: string, fallback: T): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
/** A number from a field: "1,250.50" → 1250.5. */
export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Lines as the form sends them, cleaned: a line needs a name; quantities and prices are positive and sane. */
export function cleanLines(v: unknown): InvoiceLine[] {
  if (!Array.isArray(v)) return []
  return v
    .slice(0, LINES_MAX)
    .map((l) => {
      const x = (l ?? {}) as Record<string, unknown>
      const qty = Math.round(Math.min(Math.max(num(x.qty), 0), 1_000_000) * 1000) / 1000
      const price = Math.round(Math.min(Math.max(num(x.price), 0), 100_000_000_000) * 100) / 100
      const tax = Math.round(Math.min(Math.max(num(x.tax), 0), 100) * 100) / 100
      return { name: str(x.name, 200), description: str(x.description, 500), qty, unit: str(x.unit, 20), price, tax }
    })
    .filter((l) => l.name && l.qty > 0)
}

export function cleanClient(v: unknown): InvoiceClient {
  const x = (v ?? {}) as Record<string, unknown>
  return {
    name: str(x.name, 80),
    company: str(x.company, 120),
    phone: str(x.phone, 20).replace(/[^\d+]/g, ''),
    email: str(x.email, 120).toLowerCase(),
    address: str(x.address, 300),
    tin: str(x.tin, 20),
  }
}

/** The totals in cents, from the cleaned lines and discount, rounded to the currency (whole shillings for TSh). */
export function totalsCents(lines: InvoiceLine[], discountType: DiscountType, discountValue: number, currency: Currency) {
  const t = computeTotals(lines, discountType, discountValue, currency)
  return { subtotal: toCents(t.subtotal), discount: toCents(t.discount), tax: toCents(t.tax), total: toCents(t.total) }
}

export type NewInvoice = {
  kind: InvoiceKind
  client_id: string | null
  client: InvoiceClient
  lang: Lang
  currency: Currency
  issue_day: string
  due_day: string | null
  reference: string
  lines: InvoiceLine[]
  discount_type: DiscountType
  discount_value: number
  notes: string
  payment_terms: string
  terms: string
  pay_details: string
  status?: 'draft' | 'sent'
  parent_id?: string | null
  order_id?: string | null
  booking_id?: string | null
}

/**
 * Saves a new document with the next number for its shop and kind. The number is worked out in the same statement
 * that writes the row, so two saves at once can't take the same one (a unique index guards it too). An invoice made
 * from a quote (`parent_id`) is written only while that quote has no other live invoice, in the same statement, so two
 * taps at once make one; then the answer is null and the caller looks up the one that exists.
 */
export async function insertInvoice(shopId: string, d: NewInvoice): Promise<string | null> {
  const t = totalsCents(d.lines, d.discount_type, d.discount_value, d.currency)
  const at = now()
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId()
    const code = shortCode(10)
    try {
      const res = await run(
        `INSERT INTO invoices (id, shop_id, kind, number, code, client_id, client, lang, currency, issue_day, due_day, reference, lines,
           discount_type, discount_value, subtotal, discount, tax, total, paid, notes, payment_terms, terms, pay_details, status,
           parent_id, order_id, booking_id, sent_at, created_at, updated_at)
         SELECT ?1, ?2, ?3, (SELECT COALESCE(MAX(number), 0) + 1 FROM invoices WHERE shop_id = ?2 AND kind = ?3), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
           ?13, ?14, ?15, ?16, ?17, ?18, 0, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?28
         WHERE ?24 IS NULL OR NOT EXISTS (SELECT 1 FROM invoices c WHERE c.parent_id = ?24 AND c.status != 'cancelled')`,
        id, shopId, d.kind, code, d.client_id, JSON.stringify(d.client), d.lang, d.currency, d.issue_day, d.due_day, d.reference,
        JSON.stringify(d.lines), d.discount_type, d.discount_value, t.subtotal, t.discount, t.tax, t.total, d.notes, d.payment_terms,
        d.terms, d.pay_details, d.status ?? 'draft', d.parent_id ?? null, d.order_id ?? null, d.booking_id ?? null,
        d.status === 'sent' ? at : null, at,
      )
      return res.meta.changes ? id : null
    } catch (e) {
      // A clash on the number (two saves in the same instant) or the code: try again.
      if (attempt === 2) throw e
    }
  }
  throw new Error('unreachable')
}

/** `paid` is always the sum of confirmed payments, and `paid_at` the moment it first covered the total. */
export async function recalcPaid(invoiceId: string) {
  const at = now()
  await db().batch([
    db()
      .prepare(
        `UPDATE invoices SET paid = (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = ?1 AND status = 'confirmed'),
           updated_at = ?2 WHERE id = ?1`,
      )
      .bind(invoiceId, at),
    db()
      .prepare(`UPDATE invoices SET paid_at = CASE WHEN total > 0 AND paid >= total THEN COALESCE(paid_at, ?2) ELSE NULL END WHERE id = ?1`)
      .bind(invoiceId, at),
  ])
}

/**
 * The client a document is for, kept in the business's list: the one picked (updated with what was typed), else one
 * with the same phone, else one with the same name and company, else a new one. Null when there's no name.
 */
export async function keepClient(shopId: string, clientId: string | null, c: InvoiceClient) {
  if (!c.name && !c.company) return null
  const at = now()
  const found =
    (clientId ? await first<{ id: string }>('SELECT id FROM clients WHERE id = ? AND shop_id = ?', clientId, shopId) : null) ??
    (c.phone ? await first<{ id: string }>('SELECT id FROM clients WHERE shop_id = ? AND phone = ?', shopId, c.phone) : null) ??
    (await first<{ id: string }>('SELECT id FROM clients WHERE shop_id = ? AND lower(name) = lower(?) AND lower(company) = lower(?)', shopId, c.name, c.company))
  if (found) {
    await run(
      'UPDATE clients SET name = ?, company = ?, phone = ?, email = ?, address = ?, tin = ?, updated_at = ? WHERE id = ?',
      c.name || c.company, c.company, c.phone, c.email, c.address, c.tin, at, found.id,
    )
    return found.id
  }
  const id = newId()
  await run(
    'INSERT INTO clients (id, shop_id, name, company, phone, email, address, tin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, shopId, c.name || c.company, c.company, c.phone, c.email, c.address, c.tin, at, at,
  )
  return id
}

/**
 * Home's "Owed to you" (roadmap `v-invoices`): what clients owe per currency, how much is overdue, payment proofs to
 * check, and the unpaid invoices oldest first (the order to chase them in). Null for a shop that has never made an
 * invoice and doesn't bill first.
 */
export async function homeInvoices(shopId: string, kind: string, today: string) {
  const rows = await all<InvoiceRow & { checks: number }>(
    `SELECT ${INVOICE_COLS}, (SELECT COUNT(*) FROM invoice_payments p WHERE p.invoice_id = i.id AND p.status = 'claimed') checks
     FROM invoices i WHERE i.shop_id = ? AND i.kind = 'invoice' AND i.status = 'sent' ORDER BY COALESCE(i.due_day, i.issue_day) LIMIT 300`,
    shopId,
  )
  const made = await first<{ n: number; drafts: number }>(
    `SELECT COUNT(*) n, SUM(kind = 'invoice' AND status = 'draft') drafts FROM invoices WHERE shop_id = ?`,
    shopId,
  )
  if (!made?.n && kind !== 'invoices') return null
  const open = rows.map((r) => ({ ...readInvoice(r), checks: r.checks })).filter((i) => owed(i) > 0)
  const by = new Map<Currency, number>()
  for (const i of open) by.set(i.currency, (by.get(i.currency) ?? 0) + owed(i))
  return {
    made: made?.n ?? 0,
    /** Invoices written but not sent yet. */
    drafts: made?.drafts ?? 0,
    owed: [...by.entries()].map(([currency, cents]) => ({ currency, cents })),
    overdue: open.filter((i) => i.due_day && i.due_day < today).length,
    checks: open.reduce((s, i) => s + i.checks, 0),
    open: open.slice(0, 4).map((i) => ({
      id: i.id, kind: i.kind, number: i.number, client: i.client, currency: i.currency, balance: owed(i), due_day: i.due_day, checks: i.checks,
      state: invoiceState(i, today),
    })),
    more: Math.max(0, open.length - 4),
  }
}

/** The shop as a document shows it: its name, logo, contacts, how to pay it, and whether the Shopi line shows. */
export type InvoiceShop = {
  id: string
  slug: string
  name: string
  logo_key: string | null
  whatsapp: string
  tin: string
  lang: Lang
  lipa_number: string
  lipa_network: string
  lipa_name: string
  theme_color: string | null
  /** The "Made with Shopi" line: shown unless a Tembo shop hid it. */
  badge: boolean
  /** Tembo (or demo): US dollars. */
  usd: boolean
  kind: string
  bill: BillSettings | null
}

type ShopDocRow = Omit<InvoiceShop, 'badge' | 'usd' | 'bill' | 'lang'> & { lang: string; bill: string | null; hide_badge: number; status: string; plan: string; paid_until: number | null }

export async function invoiceShop(shopId: string): Promise<InvoiceShop | null> {
  const r = await first<ShopDocRow>(
    `SELECT id, slug, name, logo_key, whatsapp, tin, lang, lipa_number, lipa_network, lipa_name, theme_color, kind, bill, hide_badge, status, plan, paid_until
     FROM shops WHERE id = ?`,
    shopId,
  )
  if (!r) return null
  const plan = planState(r)
  const { hide_badge, status: _s, plan: _p, paid_until: _u, bill, lang, ...rest } = r
  return { ...rest, lang: asLang(lang), bill: parseBill(bill), badge: !(hide_badge && can(plan, 'hideBadge')), usd: can(plan, 'usd') }
}
