import { createServerFn } from '@tanstack/react-start'
import { currentUser, myShop } from '#/server/auth'
import { first, newId, now, run } from '#/server/db'
import { INVOICE_COLS, invoiceShop, readInvoice, type InvoiceRow } from '#/server/invoices'
import { LIMITS, clientIp, take } from '#/server/limits'
import { notifySeller } from '#/server/push'
import { dayOf } from '#/lib/booking'
import { displayNumber, invoiceState, money, owed, type InvoiceClient } from '#/lib/invoice'
import { namesMatch, parsePaymentSms, type PaymentCheck } from '#/lib/payment-sms'

/**
 * The client's side of an invoice or quote (roadmap `v-invoices`): the page at shopi.tz/i/<code>, which shows the
 * document, what is still owed and how to pay; sending the payment SMS as proof; accepting a quote. The code is the
 * only key (random, never the number), and opening pages is slowed per IP so codes can't be guessed.
 */

const isCode = (v: unknown) => (typeof v === 'string' && /^[A-Z0-9]{8,16}$/.test(v.toUpperCase()) ? v.toUpperCase() : null)

async function findByCode(code: string) {
  const row = await first<InvoiceRow>(
    `SELECT ${INVOICE_COLS} FROM invoices i JOIN shops s ON s.id = i.shop_id WHERE i.code = ? AND s.status IN ('active', 'demo')`,
    code,
  )
  return row ? readInvoice(row) : null
}

/** Whether the person asking runs this shop (their own look at the link isn't the client opening it). */
async function isTheBusiness(shopId: string) {
  const user = await currentUser()
  if (!user) return false
  return (await myShop(user.id))?.id === shopId
}

export const getPublicInvoice = createServerFn({ method: 'GET' })
  .validator((d: { code: string }) => ({ code: isCode(d?.code) }))
  .handler(async ({ data }) => {
    if (!data.code) return null
    if (!(await take(`invoice-page:${clientIp()}`, LIMITS.invoicePageIp))) return null
    const inv = await findByCode(data.code)
    if (!inv) return null
    const shop = await invoiceShop(inv.shop_id)
    if (!shop) return null
    const claimed = await first<{ n: number; amount: number }>(
      `SELECT COUNT(*) n, COALESCE(SUM(amount), 0) amount FROM invoice_payments WHERE invoice_id = ? AND status = 'claimed'`,
      inv.id,
    )
    const today = dayOf(now())
    // What the client may see: never the internal ids, the order or booking it came from, or the payments' details.
    const { id: _id, shop_id: _shop, client_id: _client, order_id: _order, booking_id: _booking, parent_id: _parent, ...doc } = inv
    return {
      invoice: doc,
      shop: { ...shop, id: '' },
      state: invoiceState(inv, today),
      /** A proof the client sent that the business hasn't checked yet. */
      waiting: (claimed?.n ?? 0) > 0 ? claimed!.amount : 0,
      today,
    }
  })

/** The client opened the link: the business sees "Opened" (once) and gets a notification. Its own look doesn't count. */
export const markInvoiceViewed = createServerFn({ method: 'POST' })
  .validator((d: { code: string }) => ({ code: isCode(d?.code) }))
  .handler(async ({ data }) => {
    if (!data.code) return { ok: false }
    // Counted with the page itself: each call looks a code up, so it is slowed the same way.
    if (!(await take(`invoice-page:${clientIp()}`, LIMITS.invoicePageIp))) return { ok: false }
    const inv = await findByCode(data.code)
    if (!inv || inv.viewed_at || inv.status === 'cancelled') return { ok: false }
    if (await isTheBusiness(inv.shop_id)) return { ok: false }
    const at = now()
    const res = await run(
      `UPDATE invoices SET viewed_at = ?1, status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, ?1)
       WHERE id = ?2 AND viewed_at IS NULL`,
      at,
      inv.id,
    )
    if (res.meta.changes) {
      const number = displayNumber(inv.kind, inv.number)
      notifySeller(inv.shop_id, (t) => ({
        title: t('{client} opened {number}', { client: who(inv.client), number }),
        body: inv.kind === 'quote' ? t('Quote for {amount}', { amount: money(inv.total, inv.currency) }) : t('Invoice for {amount}', { amount: money(inv.total, inv.currency) }),
        url: `/app/invoices/${inv.id}`,
        tag: `invoice-${inv.id}`,
      }))
    }
    return { ok: true }
  })

const who = (c: InvoiceClient) => c.company || c.name || '—'

/**
 * The client paid and pastes the confirmation SMS. It waits for the business to confirm, like an order's payment; the
 * amount read from the SMS is a suggestion the business can correct. One transaction pays one invoice once.
 */
export const sendInvoiceProof = createServerFn({ method: 'POST' })
  .validator((d: { code: string; sms: string }) => ({ code: isCode(d?.code), sms: String(d?.sms ?? '').slice(0, 1000) }))
  .handler(async ({ data }) => {
    if (!data.code) return { error: 'gone' as const }
    if (!(await take(`invoice-proof:${clientIp()}`, LIMITS.invoiceProofIp))) return { error: 'limit' as const }
    const inv = await findByCode(data.code)
    if (!inv || inv.kind !== 'invoice' || inv.status === 'cancelled') return { error: 'gone' as const }
    const balance = owed({ ...inv, status: inv.status === 'draft' ? 'sent' : inv.status })
    if (balance <= 0) return { error: 'paid' as const }
    if (data.sms.trim().length < 20) return { error: 'short' as const }
    if (!(await take(`invoice-proof-doc:${inv.id}`, LIMITS.invoiceProofDoc))) return { error: 'limit' as const }
    const shop = await first<{ lipa_name: string }>('SELECT lipa_name FROM shops WHERE id = ?', inv.shop_id)
    const parsed = parsePaymentSms(data.sms)
    // The SMS gives an amount in TSh; for a USD invoice the business enters what it got.
    const amount = inv.currency === 'TZS' && parsed.amount != null ? Math.min(parsed.amount * 100, balance) : balance
    const nameOk = namesMatch(parsed.name, shop?.lipa_name ?? '')
    const check: PaymentCheck = {
      parsed,
      amount: parsed.amount == null || inv.currency !== 'TZS' ? 'unknown' : parsed.amount * 100 >= balance ? 'ok' : 'low',
      name: nameOk == null ? 'unknown' : nameOk ? 'ok' : 'mismatch',
      txn: parsed.txnId ? 'ok' : 'unknown',
    }
    try {
      await run(
        `INSERT INTO invoice_payments (id, invoice_id, shop_id, amount, method, reference, sms, txn_id, check_result, by, status, day, created_at)
         VALUES (?, ?, ?, ?, 'mobile', ?, ?, ?, ?, 'client', 'claimed', ?, ?)`,
        newId(), inv.id, inv.shop_id, amount, parsed.txnId ?? '', data.sms, parsed.txnId, JSON.stringify(check), dayOf(now()), now(),
      )
    } catch {
      return { error: 'reused' as const }
    }
    const number = displayNumber(inv.kind, inv.number)
    notifySeller(inv.shop_id, (t) => ({
      title: t('Check a payment: {amount}', { amount: money(amount, inv.currency) }),
      body: t('{client} sent the payment SMS for {number}.', { client: who(inv.client), number }),
      url: `/app/invoices/${inv.id}`,
      tag: `invoice-${inv.id}`,
    }))
    return { ok: true as const }
  })

/** The client accepts a quote from the link (not once it has expired); the business is told and makes the invoice. */
export const acceptQuote = createServerFn({ method: 'POST' })
  .validator((d: { code: string }) => ({ code: isCode(d?.code) }))
  .handler(async ({ data }) => {
    if (!data.code) return { error: 'gone' as const }
    if (!(await take(`invoice-page:${clientIp()}`, LIMITS.invoicePageIp))) return { error: 'limit' as const }
    const inv = await findByCode(data.code)
    if (!inv || inv.kind !== 'quote') return { error: 'gone' as const }
    const state = invoiceState(inv, dayOf(now()))
    if (state === 'accepted' || state === 'invoiced') return { ok: true as const }
    if (!['sent', 'viewed', 'draft'].includes(state)) return { error: state === 'expired' ? ('expired' as const) : ('closed' as const) }
    const res = await run(
      `UPDATE invoices SET status = 'accepted', accepted_at = ?1, sent_at = COALESCE(sent_at, ?1), updated_at = ?1 WHERE id = ?2 AND status IN ('draft', 'sent')`,
      now(),
      inv.id,
    )
    // A second tap (or one at the same instant) found it accepted already: the business was told once.
    if (!res.meta.changes) return { ok: true as const }
    const number = displayNumber(inv.kind, inv.number)
    notifySeller(inv.shop_id, (t) => ({
      title: t('{client} accepted {number}', { client: who(inv.client), number }),
      body: t('Make the invoice from it when you are ready.'),
      url: `/app/invoices/${inv.id}`,
      tag: `invoice-${inv.id}`,
    }))
    return { ok: true as const }
  })
