import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { requireAdmin, requireShop } from '#/server/auth'
import { first } from '#/server/db'
import { LIMITS, count, overLimit } from '#/server/limits'
import { shopPlan } from '#/server/plan'
import { canPay, lipaNamba, paidMeanwhile, paymentById, paymentState, pushTemboAgain, recheckPayment, startTembo } from '#/server/billing'
import { selcomReady } from '#/server/selcom'
import { normalizePhone } from '#/lib/format'

/** Tembo billing for the logged-in seller (src/server/billing.ts). Every payment is checked against the seller's shop. */

const refOf = (d: { ref?: unknown }) => ({ ref: String(d?.ref ?? '').slice(0, 64) })

/** The seller's own payment, or null. A reference from another shop reads as missing. */
async function ownPayment(ref: string) {
  const { shop } = await requireShop()
  const row = ref ? await paymentById(ref) : null
  return row && row.shop_id === shop.id ? { row, shop } : null
}

/** Start a Tembo year: the PIN prompt goes to `phone` (any Tanzanian mobile money number, not only the seller's). */
export const payTembo = createServerFn({ method: 'POST' })
  .validator((d: { phone: string }) => ({ phone: normalizePhone(String(d?.phone ?? '')) }))
  .handler(async ({ data }) => {
    const { user, shop } = await requireShop()
    const plan = await shopPlan(shop.id)
    if (!plan || plan.kind === 'demo' || !canPay(user)) return { error: 'closed' as const }
    if (!selcomReady()) return { error: 'unreachable' as const, retryable: true }
    // Selcom's wallet push takes Tanzanian mobile numbers only: 2556… or 2557….
    if (!/^\+255[67]\d{8}$/.test(data.phone)) return { error: 'number' as const, retryable: true }
    const key = `pay:${shop.id}`
    if (await overLimit(key, LIMITS.payStart)) return { error: 'limit' as const }
    // A payment the seller moved away from may have been paid meanwhile: never start a second year by mistake.
    const paid = await paidMeanwhile(shop.id)
    if (paid) return { paid: true as const, ref: paid.ref, until: paid.until }
    await count(key)
    return startTembo({ shopId: shop.id, slug: shop.slug, userId: user.id, name: user.name, msisdn: data.phone.slice(1), origin: getRequestUrl().origin })
  })

/** Where a payment stands. The screen asks every 3 seconds; a pending one is asked of Selcom live. */
export const temboPayment = createServerFn({ method: 'GET' })
  .validator(refOf)
  .handler(async ({ data }) => {
    const own = await ownPayment(data.ref)
    if (!own) return { status: 'missing' as const }
    return paymentState(own.row)
  })

/** "Send the prompt again": the same order, to the number on it. */
export const temboPushAgain = createServerFn({ method: 'POST' })
  .validator(refOf)
  .handler(async ({ data }) => {
    const own = await ownPayment(data.ref)
    if (!own) return { error: 'settled' as const }
    const key = `pay-push:${own.shop.id}`
    if (await overLimit(key, LIMITS.payPush)) return { error: 'limit' as const }
    await count(key)
    return pushTemboAgain(own.row)
  })

/** The Lipa Namba for a payment: the open order's own number, or a new order to pay by hand. */
export const temboLipaNamba = createServerFn({ method: 'POST' })
  .validator(refOf)
  .handler(async ({ data }) => {
    const own = await ownPayment(data.ref)
    if (!own) return { error: 'closed' as const }
    return lipaNamba(own.row, getRequestUrl().origin, own.shop.slug)
  })

/** The owner dashboard's "Re-check" on one payment. */
export const recheckTemboPayment = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d?.id ?? '').slice(0, 64) }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin()
    const row = await first('SELECT 1 FROM payments WHERE id = ?', data.id)
    if (!row) throw new Error('NOT_FOUND')
    return recheckPayment(data.id, admin.id)
  })
