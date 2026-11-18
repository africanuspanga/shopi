import { db, first, all, run, now } from '#/server/db'
import { notifySeller } from '#/server/push'
import { LIMITS, count, overLimit } from '#/server/limits'
import { BILLING_LIVE, DAY, TEMBO_PRICE } from '#/lib/plans'
import { SHOPI_ORIGIN } from '#/lib/host'
import {
  LIPA_USSD,
  ORDER_MINUTES,
  createManualOrder,
  createMobileCheckout,
  describeSelcomFailure,
  extractEventId,
  extractOrderId,
  normalizeStatus,
  orderStatus,
  pushAgain,
  type FailureCode,
} from '#/server/selcom'

/**
 * Tembo billing (roadmap `billing`, 18 Nov 2026): CV Chap Chap's Selcom flow, copied on the founder's word ("copy
 * everything from there"). The rules that matter:
 * - The payment row is written before Selcom is called, and its id is Selcom's order id (`SHOPI-…`).
 * - Nothing the browser or a callback says is trusted: the outcome always comes from Selcom's order-status.
 * - `completePayment` flips pending (or failed) to completed in one batch with the shop's new Tembo end, so only one
 *   caller ever extends a shop, however many polls, callbacks and re-checks arrive.
 * - When the PIN prompt doesn't come, the seller pays the order's own Lipa number by hand (*150*50*1#).
 * - The cron re-checks pending rows every 5 minutes and closes them as abandoned after 2 hours.
 * Never rebuild "paste the SMS receipt" here: CV retired it as insecure.
 */

const MINUTE = 60_000
/** A paid Tembo year. */
export const TEMBO_DAYS = 365
/** A Lipa Namba is handed out only while at least 5 of Selcom's 30 minutes remain, so nobody is mid-USSD at the close. */
export const MANUAL_WINDOW = 25 * MINUTE
/** The cron leaves a payment alone for its first 2 minutes (the seller's screen is checking it), and gives up after 2 hours. */
export const RECHECK_AFTER = 2 * MINUTE
export const ABANDON_AFTER = 120 * MINUTE

export type PaymentRow = {
  id: string
  shop_id: string
  user_id: string | null
  amount: number
  phone: string
  status: 'pending' | 'completed' | 'failed'
  manual_for: string | null
  payment_token: string | null
  reference: string | null
  transid: string | null
  result: string | null
  resultcode: string | null
  reason: string | null
  paid_until: number | null
  created_at: number
  completed_at: number | null
}

/** Before billing opens to everyone, the owner can pay (the founder's one real payment, end to end). */
export const canPay = (user: { is_admin: number } | null | undefined) => BILLING_LIVE || !!user?.is_admin

/** Selcom's order id: the prefix splits Shopi's money from CV Chap Chap's in the shared Driftmark account. */
export function newPaymentId() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('')
  return `SHOPI-${Date.now()}-${hex.toUpperCase()}`
}

/** Selcom's callback address. Live it is always shopi.tz (Selcom must reach it); locally, the dev server. */
export function webhookUrl(origin: string) {
  return `${/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : SHOPI_ORIGIN}/api/selcom`
}

const remarks = (slug: string) => `Shopi Tembo ${slug}`
const cut = (v: unknown) => (v == null ? null : JSON.stringify(v).slice(0, 4000))
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const paymentById = (id: string) => first<PaymentRow>('SELECT * FROM payments WHERE id = ?', id)

async function event(paymentId: string, type: string, source: string, detail?: unknown) {
  await run('INSERT INTO payment_events (payment_id, type, source, detail, created_at) VALUES (?, ?, ?, ?, ?)', paymentId, type, source, cut(detail), now())
}

/* ---------- Completing and failing ---------- */

export type Source = 'start' | 'status' | 'webhook' | 'reconcile' | 'admin'

/**
 * The single way a payment completes. One D1 batch (a transaction): the shop's Tembo end moves to the later of now and
 * its current end, plus a year, only while the row isn't completed yet; then the row flips. A second caller finds it
 * completed and changes nothing. A late payment on a row closed as abandoned still completes: the money arrived.
 */
export async function completePayment(id: string, p: { source: Source; amount?: number | null; transid?: string | null; raw?: unknown }) {
  const t = now()
  const [, flipped] = await db().batch([
    db()
      .prepare(
        `UPDATE shops SET plan = 'tembo', paid_until = MAX(COALESCE(paid_until, 0), ?) + ?
         WHERE id = (SELECT shop_id FROM payments WHERE id = ? AND status != 'completed')`,
      )
      .bind(t, TEMBO_DAYS * DAY, id),
    db()
      .prepare(
        `UPDATE payments SET status = 'completed', completed_at = ?, reason = NULL, transid = COALESCE(?, transid), raw = COALESCE(?, raw),
           paid_until = (SELECT paid_until FROM shops WHERE shops.id = payments.shop_id)
         WHERE id = ? AND status != 'completed' RETURNING shop_id, amount, paid_until`,
      )
      .bind(t, p.transid ?? null, cut(p.raw), id),
  ])
  const row = (flipped.results as { shop_id: string; amount: number; paid_until: number }[])[0]
  if (!row) {
    const existing = await first<{ status: string }>('SELECT status FROM payments WHERE id = ?', id)
    return { outcome: existing ? ('already_completed' as const) : ('not_found' as const) }
  }

  await event(id, 'completed', p.source, { amount: p.amount ?? row.amount, transid: p.transid ?? null, until: row.paid_until })
  // Flag, never block: Selcom charged what the order said, so a different figure is worth a person's look.
  if (p.amount != null && p.amount !== row.amount) {
    console.error('[billing] amount mismatch', JSON.stringify({ id, expected: row.amount, paid: p.amount, source: p.source }))
    await event(id, 'amount_mismatch', p.source, { expected: row.amount, paid: p.amount })
  }
  console.log('[billing] completed', JSON.stringify({ id, shop: row.shop_id, source: p.source, until: row.paid_until }))
  notifySeller(row.shop_id, (t, lang) => ({
    title: t('Tembo is on'),
    body: t('TSh {amount} received. Tembo runs until {date}.', { amount: row.amount.toLocaleString('en-US'), date: longDate(row.paid_until, lang) }),
    url: '/app/plan',
    tag: 'tembo',
  }))
  return { outcome: 'completed' as const, until: row.paid_until }
}

/** A payment that didn't go through. Only a pending row changes, so a completed one is never undone. */
export async function failPayment(id: string, p: { reason: string; source: Source; raw?: unknown }) {
  const res = await run(`UPDATE payments SET status = 'failed', reason = ?, raw = COALESCE(?, raw) WHERE id = ? AND status = 'pending'`, p.reason.slice(0, 300), cut(p.raw), id)
  if (res.meta.changes) await event(id, 'failed', p.source, { reason: p.reason.slice(0, 300) })
}

/** Asks Selcom about one payment and records what it says. Throws when Selcom can't be asked. */
export async function settle(row: PaymentRow, source: Source) {
  const s = await orderStatus(row.id)
  if (s.status === 'completed') {
    const done = await completePayment(row.id, { source, amount: s.amount, transid: s.transid, raw: s.raw })
    return { status: 'completed' as const, until: done.until ?? (await paymentById(row.id))?.paid_until ?? null }
  }
  if (s.status === 'failed') await failPayment(row.id, { reason: s.reason ?? 'failed', source, raw: s.raw })
  return { status: s.status, reason: s.reason, until: null }
}

/* ---------- The seller's steps ---------- */

export type StartAnswer = { ok: true; ref: string } | { error: FailureCode; retryable: boolean; ref: string }

/** A Tembo year: the row, then Selcom's order and the PIN prompt on `msisdn` (255XXXXXXXXX). */
export async function startTembo(p: { shopId: string; slug: string; userId: string; name: string; msisdn: string; origin: string }): Promise<StartAnswer> {
  const id = newPaymentId()
  await run('INSERT INTO payments (id, shop_id, user_id, amount, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, p.shopId, p.userId, TEMBO_PRICE, p.msisdn, now())
  await event(id, 'created', 'start', { kind: 'push' })
  try {
    const r = await createMobileCheckout({
      orderId: id,
      name: p.name,
      phone: p.msisdn,
      amount: TEMBO_PRICE,
      webhookUrl: webhookUrl(p.origin),
      remarks: remarks(p.slug),
    })
    const n = normalizeStatus(r.raw)
    await run(
      'UPDATE payments SET reference = ?, transid = ?, payment_token = ?, result = ?, resultcode = ?, raw = ? WHERE id = ?',
      r.reference,
      r.transid,
      r.paymentToken,
      n.result,
      n.resultcode,
      cut(r.raw),
      id,
    )
    return { ok: true, ref: id }
  } catch (e) {
    console.error('[billing] start failed', id, message(e))
    const f = describeSelcomFailure(e)
    if (f.code === 'unreachable') {
      // No answer is not a refusal: the order and the prompt may have reached Selcom, and the seller may still pay.
      // The row stays pending, so the cron asks Selcom about it (in CV a timed-out call leaves the row pending too).
      await event(id, 'start_unanswered', 'start', { error: message(e).slice(0, 300) })
    } else {
      await failPayment(id, { reason: message(e), source: 'start', raw: { error: message(e) } })
    }
    // The prompt may not have come, but the reference still lets the seller pay by Lipa Namba.
    return { error: f.code, retryable: f.retryable, ref: id }
  }
}

/**
 * Before a new payment starts: the shop's payments of the last 35 minutes that are still open, asked of Selcom. A PIN
 * entered late on the number the seller moved away from (or on a sheet they closed) must not lead to a second year paid
 * by mistake. Returns the one that turned out paid, if any.
 */
export async function paidMeanwhile(shopId: string) {
  const open = await all<PaymentRow>(
    `SELECT * FROM payments WHERE shop_id = ? AND status = 'pending' AND created_at > ? ORDER BY created_at DESC LIMIT 3`,
    shopId,
    now() - (ORDER_MINUTES + 5) * MINUTE,
  )
  for (const row of open) {
    try {
      const s = await settle(row, 'status')
      if (s.status === 'completed') return { ref: row.id, until: s.until }
    } catch {
      // Selcom unreachable: the cron settles it later.
    }
  }
  return null
}

export type PayState = { status: 'pending' | 'failed'; reason?: string | null } | { status: 'completed'; until: number | null }

/** What the seller's screen shows: the row, and while it is pending Selcom's live word on it. */
export async function paymentState(row: PaymentRow): Promise<PayState> {
  if (row.status === 'completed') return { status: 'completed', until: row.paid_until }
  if (row.status === 'failed') return { status: 'failed', reason: row.reason }
  try {
    const s = await settle(row, 'status')
    return s.status === 'completed' ? { status: 'completed', until: s.until } : { status: s.status, reason: s.reason }
  } catch {
    // Selcom unreachable for a moment: the screen keeps checking.
    return { status: 'pending' }
  }
}

/** The PIN prompt again: same order, the number on the row, so nothing is charged twice. */
export async function pushTemboAgain(row: PaymentRow) {
  if (row.status !== 'pending') return { error: 'settled' as const }
  try {
    await pushAgain(row.id, row.phone, row.transid || row.reference)
    await event(row.id, 'pushed_again', 'status')
    return { ok: true as const }
  } catch (e) {
    console.error('[billing] push again failed', row.id, message(e))
    return { error: describeSelcomFailure(e).code }
  }
}

export type LipaAnswer =
  | { status: 'pending'; ref: string; lipa: string; amount: number; ussd: string; expiresAt: number }
  | { status: 'completed'; ref: string; until: number | null }
  | { error: FailureCode | 'closed' | 'limit' }

const stillOpen = (row: Pick<PaymentRow, 'created_at'>) => now() - row.created_at < MANUAL_WINDOW
const lipa = (row: PaymentRow): LipaAnswer => ({
  status: 'pending',
  ref: row.id,
  lipa: row.payment_token!,
  amount: row.amount,
  ussd: LIPA_USSD,
  expiresAt: row.created_at + ORDER_MINUTES * MINUTE,
})

/**
 * The Lipa Namba fallback (CV's `/api/payment/manual`): which order's number to show.
 * 1. The order in flight, while it is open: paying it settles the same order a late PIN would, so no double charge.
 * 2. Otherwise an open Lipa Namba order already made for this payment.
 * 3. Otherwise a fresh order with no prompt, for the same year.
 */
export async function lipaNamba(row: PaymentRow, origin: string, slug: string): Promise<LipaAnswer> {
  if (row.status === 'completed') return { status: 'completed', ref: row.id, until: row.paid_until }

  if (row.payment_token && stillOpen(row)) {
    try {
      const live = await orderStatus(row.id)
      if (live.status === 'completed') {
        const done = await completePayment(row.id, { source: 'status', amount: live.amount, transid: live.transid, raw: live.raw })
        return { status: 'completed', ref: row.id, until: done.until ?? null }
      }
      if (live.status === 'pending' && row.status === 'pending') return lipa(row)
    } catch (e) {
      // Nothing says the order closed, so keep it.
      console.warn('[billing] lipa: status check failed, reusing the order', row.id, message(e))
      if (row.status === 'pending') return lipa(row)
    }
  }

  const issued = await first<PaymentRow>(
    `SELECT * FROM payments WHERE manual_for = ? AND status = 'pending' AND payment_token IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    row.id,
  )
  if (issued && stillOpen(issued)) return lipa(issued)

  // Only a new order counts towards the limit; showing a number that exists costs nothing.
  const key = `pay-lipa:${row.shop_id}`
  if (await overLimit(key, LIMITS.payLipa)) return { error: 'limit' }
  await count(key)
  const id = newPaymentId()
  const t = now()
  await run(
    'INSERT INTO payments (id, shop_id, user_id, amount, phone, manual_for, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    row.shop_id,
    row.user_id,
    row.amount,
    row.phone,
    row.id,
    t,
  )
  await event(id, 'created', 'start', { kind: 'lipa', for: row.id })
  try {
    const user = row.user_id ? await first<{ name: string }>('SELECT name FROM users WHERE id = ?', row.user_id) : null
    const order = await createManualOrder({
      orderId: id,
      name: user?.name ?? 'Shopi seller',
      phone: row.phone,
      amount: row.amount,
      webhookUrl: webhookUrl(origin),
      remarks: remarks(slug),
    })
    await run('UPDATE payments SET payment_token = ?, reference = ?, raw = ? WHERE id = ?', order.paymentToken, order.reference, cut(order.raw), id)
    return lipa({ ...row, id, payment_token: order.paymentToken, amount: row.amount, created_at: t })
  } catch (e) {
    console.error('[billing] lipa order failed', id, message(e))
    await failPayment(id, { reason: message(e), source: 'start', raw: { error: message(e) } })
    return { error: describeSelcomFailure(e).code }
  }
}

/* ---------- Selcom's callback ---------- */

/**
 * A callback is a hint, never the truth: whatever it says, the outcome comes from Selcom's order-status, so a forged
 * one can at most make Shopi look up an order's real status. Shopi doesn't hold Selcom's API secret, so signatures are
 * not checked (CV has never seen a verified one either); callers are rate limited instead. Answers 503 when Selcom
 * can't be asked, so Selcom tries again; a pending answer isn't recorded, so the retry that settles it still counts.
 */
export async function handleCallback(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const orderId = extractOrderId(body)
  if (!orderId) return { status: 400, json: { error: 'missing order_id' } }
  // Not Shopi's order (CV Chap Chap shares the merchant account): never look it up from here.
  if (!/^SHOPI-\d{10,16}-[0-9A-F]{10}$/.test(orderId)) return { status: 404, json: { error: 'unknown order' } }

  const eventId = extractEventId(body, orderId)
  const seen = await first('SELECT 1 FROM webhook_events WHERE provider = ? AND event_id = ?', 'selcom', eventId)
  if (seen) return { status: 200, json: { received: true, duplicate: true } }

  let s
  try {
    s = await orderStatus(orderId)
  } catch (e) {
    console.error('[billing] callback: order-status failed', orderId, message(e))
    return { status: 503, json: { error: 'verification_unavailable' } }
  }

  await run(
    `UPDATE payments SET reference = COALESCE(?, reference), transid = COALESCE(?, transid), result = ?, resultcode = ?, raw = ?
     WHERE id = ? AND status != 'completed'`,
    s.reference,
    s.transid,
    s.result,
    s.resultcode,
    cut({ callback: body, confirmed: s.raw }),
    orderId,
  )

  let type: string = s.status
  if (s.status === 'completed') {
    const done = await completePayment(orderId, { source: 'webhook', amount: s.amount, transid: s.transid, raw: { callback: body, confirmed: s.raw } })
    if (done.outcome === 'not_found') {
      console.error('[billing] callback completed an unknown payment', orderId)
      type = 'payment_not_found'
    }
  } else if (s.status === 'failed') {
    await failPayment(orderId, { reason: s.reason ?? 'failed', source: 'webhook', raw: { callback: body, confirmed: s.raw } })
  } else {
    return { status: 200, json: { received: true, pending: true } }
  }
  await run('INSERT OR IGNORE INTO webhook_events (provider, event_id, type, reference, created_at) VALUES (?, ?, ?, ?, ?)', 'selcom', eventId, type, orderId, now())
  return { status: 200, json: { received: true } }
}

/* ---------- The cron and the owner ---------- */

/**
 * Every 5 minutes (src/server/jobs.ts): pending payments older than 2 minutes, asked again. Selcom calls back only on
 * success, so this is how failures and expiries land, and the safety net for a callback that never came. A row Selcom
 * still calls unpaid after 2 hours is closed as abandoned; only rows Selcom itself reports unpaid, so no money is lost.
 */
export async function reconcilePayments() {
  const rows = await all<PaymentRow>(`SELECT * FROM payments WHERE status = 'pending' AND created_at < ? ORDER BY created_at LIMIT 50`, now() - RECHECK_AFTER)
  const sum = { scanned: rows.length, completed: 0, failed: 0, abandoned: 0, pending: 0, errors: 0 }
  for (const row of rows) {
    try {
      const s = await settle(row, 'reconcile')
      if (s.status === 'completed') sum.completed++
      else if (s.status === 'failed') sum.failed++
      else if (row.created_at < now() - ABANDON_AFTER) {
        await failPayment(row.id, { reason: 'abandoned_unpaid', source: 'reconcile' })
        sum.abandoned++
      } else sum.pending++
    } catch (e) {
      sum.errors++
      console.error('[billing] re-check failed', row.id, message(e))
    }
  }
  return sum
}

/** "Re-check" on the owner dashboard: one payment, asked again, with a line in admin_log. */
export async function recheckPayment(id: string, adminId: string) {
  const row = await paymentById(id)
  if (!row) return { error: 'not_found' as const }
  let answer: string
  try {
    const s = await settle(row, 'admin')
    answer = s.status
  } catch (e) {
    answer = `unreachable: ${message(e).slice(0, 120)}`
  }
  await event(id, 'rechecked', 'admin', { by: adminId, answer })
  await run('INSERT INTO admin_log (admin_id, action, shop_id, detail, created_at) VALUES (?, ?, ?, ?, ?)', adminId, 'recheck_payment', row.shop_id, cut({ id, answer }), now())
  const after = await paymentById(id)
  return { status: after?.status ?? row.status, answer }
}

/* ---------- Renewal reminders ---------- */

const darDay = (ms: number) => Math.floor((ms + 3 * 3600_000) / DAY)

export function longDate(ms: number, lang: 'sw' | 'en') {
  return new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' })
}

/**
 * Nightly: a notification 7 days before Tembo ends, the day before and on the day (email joins once `o-email` exists).
 * Only once billing is open, since the message asks the seller to pay.
 */
export async function remindRenewals() {
  if (!BILLING_LIVE) return { skipped: 'billing not live' }
  const t = now()
  const today = darDay(t)
  const shops = await all<{ id: string; paid_until: number }>(
    `SELECT id, paid_until FROM shops WHERE status = 'active' AND plan = 'tembo' AND paid_until > ? AND paid_until <= ?`,
    t,
    t + 9 * DAY,
  )
  let sent = 0
  for (const s of shops) {
    const left = darDay(s.paid_until - 1) - today
    if (left !== 7 && left !== 1 && left !== 0) continue
    sent++
    notifySeller(s.id, (tr) => ({
      title: left === 7 ? tr('Tembo ends in 7 days') : left === 1 ? tr('Tembo ends tomorrow') : tr('Tembo ends today'),
      body: tr('Renew for TSh {amount} to keep your own domain, fonts and full analytics.', { amount: TEMBO_PRICE.toLocaleString('en-US') }),
      url: '/app/plan',
      tag: 'tembo-renew',
    }))
  }
  return { checked: shops.length, sent }
}
