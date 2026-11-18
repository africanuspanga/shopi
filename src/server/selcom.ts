import { env } from 'cloudflare:workers'

/**
 * Selcom, through Driftmark's signing proxy: a port of CV Chap Chap's `src/lib/payments/providers/selcom.ts` (read
 * 18 Nov 2026). Selcom only answers whitelisted IPs, so every call goes to the proxy on the whitelisted droplet, which
 * signs it, adds the vendor and forwards it; Selcom's callback comes straight to /api/selcom. Notes:
 * `design/notes/selcom-from-cv-chap-chap.md` in the workspace.
 *
 * Differences from CV: timeouts on every call (neither side had one), Shopi's own email fallback and remarks, and the
 * failure kinds are codes the screen translates (`describeSelcomFailure`).
 */

export type PayStatus = 'pending' | 'completed' | 'failed'

export type SelcomStatus = {
  status: PayStatus
  reason: string | null
  reference: string | null
  transid: string | null
  amount: number | null
  result: string | null
  resultcode: string | null
  raw: unknown
}

type Op = 'createMinimalOrder' | 'walletPushUSSD' | 'orderStatus'

/** Selcom closes an unpaid order after this long, so the re-check can reach a verdict. */
export const ORDER_MINUTES = 30
/** The USSD menu that takes a Lipa number, on every Tanzanian network. */
export const LIPA_USSD = '*150*50*1#'

export const selcomReady = () => !!(env.SELCOM_PROXY_URL && env.SELCOM_PROXY_TOKEN)

async function callProxy<T = unknown>(op: Op, body: Record<string, unknown>): Promise<T> {
  const base = (env.SELCOM_PROXY_URL ?? '').replace(/\/+$/, '')
  const token = env.SELCOM_PROXY_TOKEN ?? ''
  if (!base || !token) throw new Error('Selcom proxy not configured')
  const res = await fetch(`${base}/selcom/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    // A PIN push can take a few seconds at Selcom; a dead proxy must not hold the seller's screen.
    signal: AbortSignal.timeout(25_000),
  })
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text.slice(0, 500) }
    }
  }
  if (!res.ok) {
    const detail = parsed && typeof parsed === 'object' && 'error' in parsed ? String((parsed as { error?: unknown }).error) : `HTTP ${res.status}`
    throw new Error(`Selcom proxy ${op} failed: ${detail}`)
  }
  return parsed as T
}

/** Answers can tuck a field anywhere; find the first key that matches, ignoring case and punctuation. */
const norm = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')

function findValue(input: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map(norm))
  const seen = new Set<unknown>()
  function walk(value: unknown): unknown {
    if (!value || typeof value !== 'object' || seen.has(value)) return undefined
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item)
        if (found !== undefined) return found
      }
      return undefined
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) if (wanted.has(norm(key))) return child
    for (const child of Object.values(value as Record<string, unknown>)) {
      const found = walk(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  return walk(input)
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export const extractReference = (raw: unknown) => asString(findValue(raw, ['reference', 'provider_reference', 'gateway_reference', 'payment_reference']))
export const extractTransid = (raw: unknown) => asString(findValue(raw, ['transid', 'transaction_id', 'transactionid', 'trans_id']))
export const extractOrderId = (raw: unknown) => asString(findValue(raw, ['order_id', 'orderid', 'merchant_order_id']))

export function extractPaymentToken(raw: unknown) {
  const token = asString(findValue(raw, ['payment_token', 'paymenttoken']))
  return token && /^\d{6,12}$/.test(token) ? token : null
}

export function extractEventId(raw: unknown, orderId: string) {
  const explicit = asString(findValue(raw, ['event_id', 'eventid', 'id', 'callback_id']))
  if (explicit) return explicit
  const resultcode = asString(findValue(raw, ['resultcode', 'result_code']))
  return `selcom:${orderId}:${extractTransid(raw) || extractReference(raw) || resultcode || 'callback'}`
}

/**
 * Selcom's status in three words. Only an exact COMPLETED is paid; ambiguous (999) stays pending until it settles;
 * cancelled, rejected, expired and failed are failed.
 */
export function normalizeStatus(raw: unknown): SelcomStatus {
  const statusText = asString(findValue(raw, ['payment_status', 'paymentstatus', 'status'])) ?? ''
  const result = asString(findValue(raw, ['result'])) ?? ''
  const resultcode = asString(findValue(raw, ['resultcode', 'result_code', 'code'])) ?? ''
  const ps = statusText.toUpperCase()
  const r = result.toUpperCase()
  const rc = resultcode.toUpperCase()
  const combined = `${ps} ${r} ${rc}`

  let status: PayStatus = 'pending'
  if (combined.includes('AMBIGUOUS') || combined.includes('AMBIGOUS') || /\b999\b/.test(combined)) status = 'pending'
  else if (['USERCANCELLED', 'USERCANCELED', 'CANCELLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'FAILED'].some((w) => ps.includes(w))) status = 'failed'
  else if (ps === 'COMPLETED') status = 'completed'
  else if (ps.includes('PENDING') || ps.includes('INPROGRESS') || ps.includes('PROCESSING') || /\b(111|927)\b/.test(rc)) status = 'pending'
  else if (r.includes('FAIL')) status = 'failed'
  else if (r.includes('SUCCESS') && rc === '000' && !statusText) status = 'completed'

  return {
    status,
    // A failed order's reason is its payment_status (USERCANCELLED…); "SUCCESS" there only means the lookup worked.
    reason: (status === 'failed' ? statusText || result : result || statusText) || resultcode || null,
    reference: extractReference(raw),
    transid: extractTransid(raw),
    amount: asNumber(findValue(raw, ['amount', 'amount_paid', 'paid_amount', 'transamount'])),
    result: result || null,
    resultcode: resultcode || null,
    raw,
  }
}

/**
 * Selcom answers HTTP 200 even when it refuses. 000 is done, 111 and 927 are in progress, 999 is ambiguous: all safe to
 * go on from. Anything else (103 "ongoing USSD session", 9009 an empty wallet) means no prompt reaches the payer.
 */
function assertAccepted(step: string, raw: unknown) {
  const code = (asString(findValue(raw, ['resultcode', 'result_code', 'code'])) ?? '').trim()
  if (code === '000' || code === '111' || code === '927' || code === '999') return
  const message = asString(findValue(raw, ['message']))
  const result = asString(findValue(raw, ['result']))
  throw new Error(`Selcom ${step} rejected (resultcode=${code || 'unknown'}${result ? `, result=${result}` : ''})${message ? `: ${message}` : ''}`)
}

/**
 * `buyer_email` is mandatory and Selcom refuses a malformed one, which once cost CV four paid attempts in three minutes.
 * The payer is identified by the number, so a bad address falls back to one Shopi owns.
 */
export function safeBuyerEmail(email: string | null | undefined, phone: string) {
  const c = (email || '').trim().toLowerCase()
  const ok = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(c) && !c.includes('..') && c.length <= 100
  if (ok) return c
  return `${phone.replace(/\D/g, '').slice(0, 15) || 'seller'}@shopi.tz`
}

export type FailureCode = 'balance' | 'number' | 'unreachable' | 'other'

/**
 * Turns a refusal into something the seller can act on, and whether trying the same thing again can work: an empty
 * wallet needs a top-up first (in CV, 28 of 36 failures in a fortnight, retried in vain).
 */
export function describeSelcomFailure(err: unknown): { code: FailureCode; selcom: string; retryable: boolean } {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const selcom = raw.match(/resultcode=(\w+)/)?.[1] ?? 'unknown'
  if (/balance of customer is not enough|insufficient/i.test(raw) || selcom === '9009') return { code: 'balance', selcom, retryable: false }
  if (/invalid receiver|msisdn|invalid.*(phone|number)/i.test(raw)) return { code: 'number', selcom, retryable: true }
  if (/fetch failed|timeout|timed out|abort|ECONNRESET|proxy|network/i.test(raw)) return { code: 'unreachable', selcom, retryable: true }
  return { code: 'other', selcom, retryable: true }
}

export type CheckoutParams = { orderId: string; email?: string | null; name: string; phone: string; amount: number; webhookUrl: string; remarks: string }

function minimalOrder(p: CheckoutParams) {
  return {
    order_id: p.orderId,
    buyer_email: safeBuyerEmail(p.email, p.phone),
    buyer_name: p.name.slice(0, 60) || 'Shopi seller',
    buyer_phone: p.phone,
    amount: p.amount,
    currency: 'TZS',
    // Selcom wants URLs base64 encoded, and the callback goes per order, so CV's and Shopi's never mix.
    webhook: btoa(p.webhookUrl),
    buyer_remarks: p.remarks,
    merchant_remarks: p.remarks,
    no_of_items: 1,
    expiry: ORDER_MINUTES,
  }
}

/** An order, then the PIN prompt on the payer's phone. Throws when either is refused, so the row is marked failed. */
export async function createMobileCheckout(p: CheckoutParams) {
  const create = await callProxy('createMinimalOrder', minimalOrder(p))
  assertAccepted('create order', create)
  const reference = extractReference(create)
  const transid = extractTransid(create)
  const push = await callProxy('walletPushUSSD', { transid: transid || reference || p.orderId, order_id: p.orderId, msisdn: p.phone })
  assertAccepted('wallet push', push)
  return { reference, transid: transid || extractTransid(push), paymentToken: extractPaymentToken(create), raw: { create, push } }
}

/**
 * An order with no PIN prompt, paid by hand: the payer dials *150*50*1# and enters the order's own `payment_token` as
 * the Lipa number. Selcom ties the payment to the order, so it completes like a push (proven in CV on 20 Oct 2026).
 */
export async function createManualOrder(p: CheckoutParams) {
  const create = await callProxy('createMinimalOrder', minimalOrder(p))
  assertAccepted('create order', create)
  const paymentToken = extractPaymentToken(create)
  if (!paymentToken) throw new Error('Selcom create order returned no payment_token')
  return { paymentToken, reference: extractReference(create), raw: { create } }
}

/** The PIN prompt again, for an order already open. */
export async function pushAgain(orderId: string, msisdn: string, transid?: string | null) {
  const res = await callProxy('walletPushUSSD', { transid: transid || orderId, order_id: orderId, msisdn })
  assertAccepted('wallet push', res)
  return res
}

/** Selcom's own word on an order, asked live. */
export async function orderStatus(orderId: string) {
  return normalizeStatus(await callProxy('orderStatus', { order_id: orderId }))
}

/** Whether the proxy answers at all (its unauthenticated health check), for the owner dashboard. */
export async function proxyHealth(): Promise<'ok' | 'down' | 'off'> {
  const base = (env.SELCOM_PROXY_URL ?? '').replace(/\/+$/, '')
  if (!base) return 'off'
  try {
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5_000) })
    return res.ok ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}
