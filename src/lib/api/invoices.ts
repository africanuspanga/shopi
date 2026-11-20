import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, db, first, newId, now, run } from '#/server/db'
import {
  INVOICE_COLS, cleanClient, cleanLines, insertInvoice, invoiceShop, keepClient, num, readInvoice, recalcPaid, totalsCents,
  type InvoiceRow, type InvoiceShop,
} from '#/server/invoices'
import { passStep } from '#/server/setup'
import { dayOf, isDay } from '#/lib/booking'
import { asLang } from '#/lib/i18n'
import { tinDigits } from '#/lib/format'
import {
  DEFAULT_BILL, DUE_CHOICES, asCurrency, asDiscountType, asKind, asPayMethod, dueFor, invoiceState, owed, parseBill, paymentCents,
  type BillSettings, type Currency, type InvoiceClient, type InvoiceKind, type InvoiceLine, type InvoiceState, type PayMethod,
} from '#/lib/invoice'

/**
 * Invoices and quotes, for the business (roadmap `v-invoices`). Areas (src/lib/staff.ts): invoices, payments and
 * clients are `orders` work (an Orders assistant takes payments); the invoice settings say how clients pay the
 * business, so they are the owner's, like the Lipa Namba.
 */

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const today = () => dayOf(now())

/* ---------- The list ---------- */

export type InvoiceListRow = {
  id: string
  kind: InvoiceKind
  number: number
  client: InvoiceClient
  currency: Currency
  total: number
  paid: number
  issue_day: string
  due_day: string | null
  state: InvoiceState
  /** Payment proofs from the client waiting for the business. */
  checks: number
  created_at: number
}

/** Every invoice and quote of the shop (newest first), what is owed per currency, and what needs the business. */
export const getInvoices = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop('orders')
  const day = today()
  const [rows, s] = await Promise.all([
    all<InvoiceRow & { checks: number }>(
      `SELECT ${INVOICE_COLS},
         CASE WHEN i.status = 'cancelled' THEN 0 ELSE (SELECT COUNT(*) FROM invoice_payments p WHERE p.invoice_id = i.id AND p.status = 'claimed') END checks
       FROM invoices i WHERE i.shop_id = ? ORDER BY i.created_at DESC LIMIT 1000`,
      shop.id,
    ),
    first<{ bill: string | null; kind: string }>('SELECT bill, kind FROM shops WHERE id = ?', shop.id),
  ])
  const invoices: InvoiceListRow[] = rows.map((r) => {
    const i = readInvoice(r)
    return {
      id: i.id, kind: i.kind, number: i.number, client: i.client, currency: i.currency, total: i.total, paid: i.paid,
      issue_day: i.issue_day, due_day: i.due_day, state: invoiceState(i, day), checks: r.checks, created_at: i.created_at,
    }
  })
  const owedBy = new Map<Currency, number>()
  for (const i of rows.map(readInvoice)) {
    const o = owed(i)
    if (o > 0) owedBy.set(i.currency, (owedBy.get(i.currency) ?? 0) + o)
  }
  return {
    invoices,
    owed: [...owedBy.entries()].map(([currency, cents]) => ({ currency, cents })),
    overdue: invoices.filter((i) => i.state === 'overdue').length,
    checks: invoices.reduce((s, i) => s + i.checks, 0),
    settings: !!parseBill(s?.bill),
    today: day,
  }
})

/* ---------- One document ---------- */

export type InvoicePayment = {
  id: string
  amount: number
  method: PayMethod
  reference: string
  sms: string | null
  check_result: string | null
  by: 'client' | 'shop'
  status: 'claimed' | 'confirmed' | 'rejected'
  day: string
  created_at: number
}

export const getInvoice = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => ({ id: String(d?.id ?? '') }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const row = await first<InvoiceRow>(`SELECT ${INVOICE_COLS} FROM invoices i WHERE i.id = ? AND i.shop_id = ?`, data.id, shop.id)
    if (!row) return null
    const invoice = readInvoice(row)
    const [payments, child, parent, doc] = await Promise.all([
      all<InvoicePayment>(
        'SELECT id, amount, method, reference, sms, check_result, by, status, day, created_at FROM invoice_payments WHERE invoice_id = ? ORDER BY created_at DESC',
        invoice.id,
      ),
      first<{ id: string; number: number }>(`SELECT id, number FROM invoices WHERE parent_id = ? AND status != 'cancelled' ORDER BY created_at LIMIT 1`, invoice.id),
      invoice.parent_id ? first<{ id: string; number: number }>('SELECT id, number FROM invoices WHERE id = ? AND shop_id = ?', invoice.parent_id, shop.id) : null,
      invoiceShop(shop.id),
    ])
    return { invoice, payments, child, parent, shop: doc!, state: invoiceState(invoice, today()), today: today() }
  })

/* ---------- The editor ---------- */

export type CatalogItem = { name: string; price: number; kind: 'product' | 'service' }
export type ClientRow = InvoiceClient & { id: string }

/**
 * What the editor needs: the shop as the document shows it, the clients to pick from, the products and services to
 * add as lines, and what to start from: the document being edited, an order or a booking it is made from, or a
 * client it is for.
 */
export const getInvoiceEditor = createServerFn({ method: 'GET' })
  .validator((d: { id?: string; kind?: string; order?: string; booking?: string; client?: string }) => ({
    id: str(d?.id, 40),
    kind: asKind(d?.kind),
    order: str(d?.order, 40),
    booking: str(d?.booking, 40),
    client: str(d?.client, 40),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const [doc, clients, products, services] = await Promise.all([
      invoiceShop(shop.id),
      all<ClientRow>('SELECT id, name, company, phone, email, address, tin FROM clients WHERE shop_id = ? ORDER BY updated_at DESC LIMIT 500', shop.id),
      all<{ name: string; price: number }>('SELECT name, price FROM products WHERE shop_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 300', shop.id),
      all<{ name: string; price: number }>('SELECT name, price FROM services WHERE shop_id = ? AND active = 1 ORDER BY sort, created_at LIMIT 100', shop.id),
    ])
    const catalog: CatalogItem[] = [...services.map((s) => ({ ...s, kind: 'service' as const })), ...products.map((p) => ({ ...p, kind: 'product' as const }))]
    const base = { shop: doc!, clients, catalog, today: today() }

    if (data.id) {
      const row = await first<InvoiceRow & { held: number }>(
        `SELECT ${INVOICE_COLS}, EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = i.id AND p.status != 'rejected') held
         FROM invoices i WHERE i.id = ? AND i.shop_id = ?`,
        data.id,
        shop.id,
      )
      if (!row) return null
      // Payments (sent or confirmed) hold the currency: they were made in it.
      const { held, ...rest } = row
      return { ...base, invoice: readInvoice(rest), held: !!held, from: null }
    }

    // Made from an order: its lines, the buyer, the delivery fee as a line and its discount code's discount (in TSh, so
    // the invoice's total is the order's); from a booking: the service and the client. Both are in TSh.
    let from: { client: InvoiceClient; lines: InvoiceLine[]; reference: string; discount?: number; order_id?: string; booking_id?: string } | null = null
    if (data.order) {
      const o = await first<{ id: string; code: string; customer_name: string; customer_phone: string; delivery_fee: number; discount: number }>(
        'SELECT id, code, customer_name, customer_phone, delivery_fee, discount FROM orders WHERE id = ? AND shop_id = ?',
        data.order,
        shop.id,
      )
      if (o) {
        const items = await all<{ name: string; price: number; qty: number; variant: string | null }>('SELECT name, price, qty, variant FROM order_items WHERE order_id = ?', o.id)
        from = {
          client: { name: o.customer_name, company: '', phone: o.customer_phone, email: '', address: '', tin: '' },
          lines: [
            ...items.map((x) => ({ name: x.variant ? `${x.name} (${x.variant})` : x.name, description: '', qty: x.qty, unit: '', price: x.price, tax: 0 })),
            ...(o.delivery_fee > 0 ? [{ name: 'Delivery', description: '', qty: 1, unit: '', price: o.delivery_fee, tax: 0 }] : []),
          ],
          reference: `#${o.code}`,
          discount: o.discount > 0 ? o.discount : undefined,
          order_id: o.id,
        }
      }
    } else if (data.booking) {
      const b = await first<{ id: string; code: string; customer_name: string; customer_phone: string; service_name: string; price: number; day: string }>(
        'SELECT id, code, customer_name, customer_phone, service_name, price, day FROM bookings WHERE id = ? AND shop_id = ?',
        data.booking,
        shop.id,
      )
      if (b) {
        from = {
          client: { name: b.customer_name, company: '', phone: b.customer_phone, email: '', address: '', tin: '' },
          lines: [{ name: b.service_name, description: b.day, qty: 1, unit: '', price: b.price, tax: 0 }],
          reference: '',
          booking_id: b.id,
        }
      }
    } else if (data.client) {
      const c = clients.find((x) => x.id === data.client)
      if (c) from = { client: { name: c.name, company: c.company, phone: c.phone, email: c.email, address: c.address, tin: c.tin }, lines: [], reference: '' }
    }
    return { ...base, invoice: null, held: false, from }
  })

export type InvoiceInput = {
  id?: string
  kind?: string
  client_id?: string | null
  client: Partial<InvoiceClient>
  lang?: string
  currency?: string
  issue_day?: string
  due_day?: string | null
  reference?: string
  lines: unknown[]
  discount_type?: string
  discount_value?: number | string
  notes?: string
  payment_terms?: string
  terms?: string
  pay_details?: string
  order_id?: string | null
  booking_id?: string | null
  /** Setup step 4: the business's first invoice passes the step. */
  setup?: boolean
}

/** Saves a new document or changes one. The totals are worked out here, never taken from the browser. */
export const saveInvoice = createServerFn({ method: 'POST' })
  .validator((d: InvoiceInput) => d ?? ({} as InvoiceInput))
  .handler(async ({ data }) => {
    const { shop, role } = await requireShop('orders')
    const doc = await invoiceShop(shop.id)
    if (!doc) return { error: 'shop' as const }
    const lines = cleanLines(data.lines)
    if (!lines.length) return { error: 'lines' as const }
    const client = cleanClient(data.client)
    if (!client.name && !client.company) return { error: 'client' as const }
    const currency = asCurrency(data.currency)
    const before = data.id
      ? await first<{ status: string; currency: string; pay_details: string }>('SELECT status, currency, pay_details FROM invoices WHERE id = ? AND shop_id = ?', data.id, shop.id)
      : null
    if (data.id && !before) return { error: 'gone' as const }
    if (before?.status === 'cancelled') return { error: 'cancelled' as const }
    // Dollars are Tembo's, for a new document or a new currency; one already in dollars stays editable after Tembo ends.
    if (currency !== 'TZS' && !doc.usd && currency !== before?.currency) return { error: 'usd' as const }
    // Payments are kept in the document's currency: changing it under them would rewrite what was paid.
    if (before && currency !== before.currency) {
      const held = await first(`SELECT 1 FROM invoice_payments WHERE invoice_id = ? AND status != 'rejected' LIMIT 1`, data.id)
      if (held) return { error: 'currency' as const }
    }
    // Where clients' money goes is the owner's to say, like the Lipa Namba: an assistant's document takes the bank
    // details from the invoice settings (a new one) or keeps what it had (an edit), whatever the browser sent.
    const payDetails = role === 'owner' ? str(data.pay_details, 1000) : before ? before.pay_details : (doc.bill?.bank ?? '')
    const day = today()
    const issue = isDay(data.issue_day) ? data.issue_day : day
    const due = data.due_day == null || data.due_day === '' ? null : isDay(data.due_day) ? data.due_day : 'bad'
    if (due === 'bad' || (due && due < issue)) return { error: 'due' as const }
    const discountType = asDiscountType(data.discount_type)
    const discountValue = Math.max(0, num(data.discount_value))
    const fields = {
      client,
      lang: asLang(data.lang ?? doc.lang),
      currency,
      issue_day: issue,
      due_day: due,
      reference: str(data.reference, 120),
      lines,
      discount_type: discountType,
      discount_value: discountType === 'percent' ? Math.min(discountValue, 100) : discountValue,
      notes: str(data.notes, 2000),
      payment_terms: str(data.payment_terms, 500),
      terms: str(data.terms, 4000),
      pay_details: payDetails,
    }
    const clientId = await keepClient(shop.id, str(data.client_id, 40) || null, client)

    if (data.id) {
      const t = totalsCents(fields.lines, fields.discount_type, fields.discount_value, fields.currency)
      // The checks above, again in the write itself: not cancelled meanwhile, and no payment arrived under a new currency.
      const res = await run(
        `UPDATE invoices SET client_id = ?1, client = ?2, lang = ?3, currency = ?4, issue_day = ?5, due_day = ?6, reference = ?7, lines = ?8,
           discount_type = ?9, discount_value = ?10, subtotal = ?11, discount = ?12, tax = ?13, total = ?14, notes = ?15, payment_terms = ?16,
           terms = ?17, pay_details = ?18, updated_at = ?19
         WHERE id = ?20 AND shop_id = ?21 AND status != 'cancelled'
           AND (currency = ?4 OR NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = invoices.id AND p.status != 'rejected'))`,
        clientId, JSON.stringify(fields.client), fields.lang, fields.currency, fields.issue_day, fields.due_day, fields.reference,
        JSON.stringify(fields.lines), fields.discount_type, fields.discount_value, t.subtotal, t.discount, t.tax, t.total, fields.notes,
        fields.payment_terms, fields.terms, fields.pay_details, now(), data.id, shop.id,
      )
      if (!res.meta.changes) return { error: before!.currency !== fields.currency ? ('currency' as const) : ('cancelled' as const) }
      // A new total may now be covered by what was paid (or no longer).
      await recalcPaid(data.id)
      return { ok: true as const, id: data.id }
    }

    // An order or booking it was made from must be this shop's.
    const orderId = data.order_id ? (await first<{ id: string }>('SELECT id FROM orders WHERE id = ? AND shop_id = ?', str(data.order_id, 40), shop.id))?.id ?? null : null
    const bookingId = data.booking_id ? (await first<{ id: string }>('SELECT id FROM bookings WHERE id = ? AND shop_id = ?', str(data.booking_id, 40), shop.id))?.id ?? null : null
    const id = await insertInvoice(shop.id, { ...fields, kind: asKind(data.kind), client_id: clientId, order_id: orderId, booking_id: bookingId })
    if (!id) return { error: 'gone' as const }
    // The setup is the owner's (src/lib/staff.ts): an assistant's first invoice doesn't move it on.
    if (data.setup && role === 'owner') await passStep(shop.id, 4, 'done', null)
    const made = await first<{ code: string; number: number }>('SELECT code, number FROM invoices WHERE id = ?', id)
    return { ok: true as const, id, code: made?.code ?? '', number: made?.number ?? 0 }
  })

/** The document went to the client (WhatsApp, a copied link, a PDF): a draft becomes sent. */
export const markInvoiceSent = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d?.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    await run(`UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, ?1), updated_at = ?1 WHERE id = ?2 AND shop_id = ?3 AND status = 'draft'`, now(), data.id, shop.id)
    return { ok: true as const }
  })

/**
 * The business changes a document's status: cancel or reopen it, or mark a quote accepted or declined (the client may
 * also accept on the link). Reopening a cancelled document makes it sent again, or a draft if it never went out.
 */
export const setInvoiceStatus = createServerFn({ method: 'POST' })
  .validator((d: { id: string; status: string }) => ({ id: str(d?.id, 40), status: str(d?.status, 20) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const row = await first<{ kind: string; status: string; sent_at: number | null; parent_id: string | null }>(
      'SELECT kind, status, sent_at, parent_id FROM invoices WHERE id = ? AND shop_id = ?',
      data.id,
      shop.id,
    )
    if (!row) return { error: 'gone' as const }
    const at = now()
    if (data.status === 'cancelled') {
      // A proof the client sent can't be checked on a cancelled invoice (its Payments card is gone), so it is answered
      // as not received; otherwise it would keep the menu's orange count up for good.
      await db().batch([
        db().prepare(`UPDATE invoices SET status = 'cancelled', updated_at = ? WHERE id = ? AND shop_id = ?`).bind(at, data.id, shop.id),
        db().prepare(`UPDATE invoice_payments SET status = 'rejected', decided_at = ? WHERE invoice_id = ? AND shop_id = ? AND status = 'claimed'`).bind(at, data.id, shop.id),
      ])
    } else if (data.status === 'reopen') {
      // An invoice made from a quote comes back only while that quote has no other live invoice (one quote, one invoice).
      const res = await run(
        `UPDATE invoices SET status = ?1, updated_at = ?2 WHERE id = ?3 AND shop_id = ?4 AND status IN ('cancelled', 'declined', 'accepted')
           AND (parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM invoices c WHERE c.parent_id = invoices.parent_id AND c.id != invoices.id AND c.status != 'cancelled'))`,
        row.sent_at ? 'sent' : 'draft', at, data.id, shop.id,
      )
      if (!res.meta.changes && row.parent_id && row.status === 'cancelled') return { error: 'twin' as const }
    } else if (row.kind === 'quote' && (data.status === 'accepted' || data.status === 'declined')) {
      await run(
        `UPDATE invoices SET status = ?1, accepted_at = CASE WHEN ?1 = 'accepted' THEN COALESCE(accepted_at, ?2) ELSE accepted_at END, updated_at = ?2
         WHERE id = ?3 AND shop_id = ?4 AND status != 'cancelled'`,
        data.status, at, data.id, shop.id,
      )
    } else return { error: 'status' as const }
    return { ok: true as const }
  })

/** A quote the client said yes to becomes an invoice (a new draft, numbered as an invoice); the quote is accepted. */
export const invoiceFromQuote = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d?.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const row = await first<InvoiceRow>(`SELECT ${INVOICE_COLS} FROM invoices i WHERE i.id = ? AND i.shop_id = ? AND i.kind = 'quote'`, data.id, shop.id)
    if (!row) return { error: 'gone' as const }
    const live = () => first<{ id: string }>(`SELECT id FROM invoices WHERE parent_id = ? AND status != 'cancelled' ORDER BY created_at LIMIT 1`, row.id)
    const existing = await live()
    if (existing) return { ok: true as const, id: existing.id }
    // A cancelled or declined quote is reopened first; it doesn't turn into an invoice (and accepted) by itself.
    if (!['draft', 'sent', 'accepted'].includes(row.status)) return { error: 'status' as const }
    const q = readInvoice(row)
    const doc = await invoiceShop(shop.id)
    const day = today()
    const id = await insertInvoice(shop.id, {
      kind: 'invoice', client_id: q.client_id, client: q.client, lang: q.lang, currency: q.currency, issue_day: day,
      due_day: dueFor('invoice', day, doc?.bill ?? null), reference: q.reference, lines: q.lines, discount_type: q.discount_type,
      discount_value: q.discount_value, notes: q.notes, payment_terms: q.payment_terms || doc?.bill?.terms || '', terms: q.terms,
      pay_details: q.pay_details || doc?.bill?.bank || '', parent_id: q.id,
    })
    // Another tap made it in the same instant: that one is the invoice.
    if (!id) {
      const made = await live()
      return made ? { ok: true as const, id: made.id } : { error: 'gone' as const }
    }
    await run(
      `UPDATE invoices SET status = 'accepted', accepted_at = COALESCE(accepted_at, ?1), updated_at = ?1 WHERE id = ?2 AND status IN ('draft', 'sent', 'accepted')`,
      now(),
      q.id,
    )
    return { ok: true as const, id }
  })

/** Only a draft that never went out and holds no payment can be deleted; anything else is cancelled (a business record). */
export const deleteInvoice = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d?.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const res = await run(
      `DELETE FROM invoices WHERE id = ? AND shop_id = ? AND status = 'draft' AND sent_at IS NULL AND viewed_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = invoices.id)
         AND NOT EXISTS (SELECT 1 FROM invoices c WHERE c.parent_id = invoices.id)`,
      data.id,
      shop.id,
    )
    return res.meta.changes ? { ok: true as const } : { error: 'kept' as const }
  })

/* ---------- Payments ---------- */

/** A payment the business received: cash, a bank transfer, mobile money. It counts at once. */
export const recordInvoicePayment = createServerFn({ method: 'POST' })
  .validator((d: { id: string; amount: number | string; method: string; day?: string; reference?: string }) => ({
    id: str(d?.id, 40),
    amount: num(d?.amount),
    method: asPayMethod(d?.method),
    day: isDay(d?.day) ? d.day : '',
    reference: str(d?.reference, 120),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const inv = await first<{ id: string; kind: string; status: string; currency: string; total: number; paid: number }>(
      'SELECT id, kind, status, currency, total, paid FROM invoices WHERE id = ? AND shop_id = ?',
      data.id,
      shop.id,
    )
    if (!inv || inv.kind !== 'invoice' || inv.status === 'cancelled') return { error: 'gone' as const }
    const cents = paymentCents(data.amount, asCurrency(inv.currency))
    if (cents <= 0) return { error: 'amount' as const }
    // More than double the balance is a typo (a missing decimal point, a zero too many).
    if (cents > Math.max(inv.total - inv.paid, 0) * 2 + 100) return { error: 'too_much' as const }
    const day = data.day && data.day <= today() ? data.day : today()
    await run(
      `INSERT INTO invoice_payments (id, invoice_id, shop_id, amount, method, reference, by, status, day, created_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, 'shop', 'confirmed', ?, ?, ?)`,
      newId(), inv.id, shop.id, cents, data.method, data.reference, day, now(), now(),
    )
    // Money came in, so the invoice clearly went out.
    await run(`UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, ?1) WHERE id = ?2 AND status = 'draft'`, now(), inv.id)
    await recalcPaid(inv.id)
    return { ok: true as const }
  })

/** A proof the client sent: the business confirms the money arrived (with the amount it really got) or says it didn't. */
export const decideInvoicePayment = createServerFn({ method: 'POST' })
  .validator((d: { id: string; decision: string; amount?: number | string }) => ({
    id: str(d?.id, 40),
    decision: d?.decision === 'reject' ? ('reject' as const) : ('confirm' as const),
    amount: d?.amount == null || d.amount === '' ? null : num(d.amount),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const p = await first<{ id: string; invoice_id: string; status: string; currency: string }>(
      'SELECT p.id, p.invoice_id, p.status, i.currency FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.id = ? AND p.shop_id = ?',
      data.id,
      shop.id,
    )
    if (!p || p.status !== 'claimed') return { error: 'gone' as const }
    if (data.decision === 'confirm') {
      const cents = data.amount == null ? null : paymentCents(data.amount, asCurrency(p.currency))
      if (cents != null && cents <= 0) return { error: 'amount' as const }
      await run(
        `UPDATE invoice_payments SET status = 'confirmed', amount = COALESCE(?, amount), decided_at = ? WHERE id = ? AND status = 'claimed'`,
        cents, now(), p.id,
      )
    } else {
      await run(`UPDATE invoice_payments SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'claimed'`, now(), p.id)
    }
    await recalcPaid(p.invoice_id)
    return { ok: true as const }
  })

/** Takes back a payment recorded by mistake (the business's own, or a confirmed proof). */
export const removeInvoicePayment = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d?.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const p = await first<{ invoice_id: string }>('SELECT invoice_id FROM invoice_payments WHERE id = ? AND shop_id = ?', data.id, shop.id)
    if (!p) return { error: 'gone' as const }
    await run('DELETE FROM invoice_payments WHERE id = ? AND shop_id = ?', data.id, shop.id)
    await recalcPaid(p.invoice_id)
    return { ok: true as const }
  })

/* ---------- Clients ---------- */

export type ClientListRow = ClientRow & { invoices: number; owed: { currency: Currency; cents: number }[] }

export const getClients = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop('orders')
  const [clients, docs] = await Promise.all([
    all<ClientRow>('SELECT id, name, company, phone, email, address, tin FROM clients WHERE shop_id = ? ORDER BY updated_at DESC LIMIT 1000', shop.id),
    all<{ client_id: string; kind: string; status: string; currency: string; total: number; paid: number }>(
      'SELECT client_id, kind, status, currency, total, paid FROM invoices WHERE shop_id = ? AND client_id IS NOT NULL',
      shop.id,
    ),
  ])
  return {
    clients: clients.map((c): ClientListRow => {
      const mine = docs.filter((d) => d.client_id === c.id)
      const by = new Map<Currency, number>()
      for (const d of mine) {
        const o = owed({ kind: asKind(d.kind), status: d.status, total: d.total, paid: d.paid })
        if (o > 0) by.set(asCurrency(d.currency), (by.get(asCurrency(d.currency)) ?? 0) + o)
      }
      return { ...c, invoices: mine.length, owed: [...by.entries()].map(([currency, cents]) => ({ currency, cents })) }
    }),
  }
})

export const saveClient = createServerFn({ method: 'POST' })
  .validator((d: Partial<InvoiceClient> & { id?: string }) => ({ id: str(d?.id, 40), client: cleanClient(d) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const c = data.client
    if (!c.name && !c.company) return { error: 'name' as const }
    if (data.id) {
      const res = await run(
        'UPDATE clients SET name = ?, company = ?, phone = ?, email = ?, address = ?, tin = ?, updated_at = ? WHERE id = ? AND shop_id = ?',
        c.name || c.company, c.company, c.phone, c.email, c.address, c.tin, now(), data.id, shop.id,
      )
      return res.meta.changes ? { ok: true as const, id: data.id } : { error: 'gone' as const }
    }
    const at = now()
    const id = newId()
    await run(
      'INSERT INTO clients (id, shop_id, name, company, phone, email, address, tin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, shop.id, c.name || c.company, c.company, c.phone, c.email, c.address, c.tin, at, at,
    )
    return { ok: true as const, id }
  })

/** Removes a client from the list. Their invoices keep the copy they were sent with. */
export const deleteClient = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d?.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    await db().batch([
      db().prepare('UPDATE invoices SET client_id = NULL WHERE shop_id = ? AND client_id = ?').bind(shop.id, data.id),
      db().prepare('DELETE FROM clients WHERE id = ? AND shop_id = ?').bind(data.id, shop.id),
    ])
    return { ok: true as const }
  })

/* ---------- Settings ---------- */

/** How the business appears on its invoices and how clients pay it. The owner's (it says where money goes). */
export const getBillSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  const doc = await invoiceShop(shop.id)
  return { shop: doc!, bill: doc?.bill ?? DEFAULT_BILL, saved: !!doc?.bill }
})

export type BillInput = Partial<BillSettings> & { tin?: string; seconds?: number; setup?: 2 | 3 }

export const saveBillSettings = createServerFn({ method: 'POST' })
  .validator((d: BillInput) => d ?? ({} as BillInput))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const doc = await invoiceShop(shop.id)
    if (!doc) return { error: 'shop' as const }
    const prev = doc.bill ?? DEFAULT_BILL
    const email = data.email == null ? prev.email : str(data.email, 120).toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'email' as const }
    const currency = data.currency == null ? prev.currency : asCurrency(data.currency)
    if (currency !== 'TZS' && !doc.usd) return { error: 'usd' as const }
    const bill: BillSettings = {
      address: data.address == null ? prev.address : str(data.address, 300),
      email,
      vrn: data.vrn == null ? prev.vrn : str(data.vrn, 30).toUpperCase(),
      vat: data.vat == null ? prev.vat : !!data.vat,
      bank: data.bank == null ? prev.bank : str(data.bank, 1000),
      terms: data.terms == null ? prev.terms : str(data.terms, 500),
      due: data.due == null ? prev.due : DUE_CHOICES.includes(Number(data.due)) ? Number(data.due) : prev.due,
      currency,
      lang: data.lang === 'sw' || data.lang === 'en' ? data.lang : data.lang === '' ? '' : prev.lang,
    }
    let tin: string | null = null
    if (data.tin != null) {
      tin = str(data.tin, 20) ? tinDigits(str(data.tin, 20)) : ''
      if (tin === null) return { error: 'tin' as const }
    }
    await run('UPDATE shops SET bill = ?, tin = COALESCE(?, tin) WHERE id = ?', JSON.stringify(bill), tin, shop.id)
    const secs = Number.isFinite(Number(data.seconds)) ? Math.min(Math.max(Math.round(Number(data.seconds)), 0), 3600) : null
    if (data.setup === 2 || data.setup === 3) await passStep(shop.id, data.setup, 'done', secs)
    return { ok: true as const }
  })

export type { InvoiceShop }
