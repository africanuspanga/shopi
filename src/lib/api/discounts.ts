import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, first, newId, now, run } from '#/server/db'
import { liveDiscount, type DiscountDbRow } from '#/server/discounts'
import { cleanCode, endOfDay, type DiscountKind } from '#/lib/discounts'

/** A code in the seller's list, with how much it was used. */
export type DiscountRow = Omit<DiscountDbRow, 'shop_id'> & {
  /** Orders that used it, cancelled ones left out. */
  uses: number
  /** Shillings it took off those orders. */
  off: number
  /** Paid orders' totals with this code. */
  sales: number
}

const PAID = `('confirmed','dispatched','delivered')`

export const listDiscounts = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  return all<DiscountRow>(
    `SELECT d.id, d.code, d.kind, d.value, d.min_order, d.ends_at, d.max_uses, d.active, d.created_at,
       COUNT(o.id) uses, COALESCE(SUM(o.discount), 0) off,
       COALESCE(SUM(CASE WHEN o.status IN ${PAID} THEN o.total END), 0) sales
     FROM discounts d
     LEFT JOIN orders o ON o.shop_id = d.shop_id AND o.discount_code = d.code AND o.status != 'cancelled' AND o.created_at >= d.created_at
     WHERE d.shop_id = ? GROUP BY d.id ORDER BY d.created_at DESC`,
    shop.id,
  )
})

/** Makes or changes a code. Changing a code's name keeps its past orders with the old name. */
export const saveDiscount = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      id?: string
      code: string
      kind: DiscountKind
      value: number | string
      min_order?: number | string | null
      ends_on?: string | null
      max_uses?: number | string | null
      active: boolean
    }) => d,
  )
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const num = (v: unknown) => {
      const n = Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')))
      return String(v ?? '').trim() && Number.isFinite(n) ? n : null
    }
    const code = cleanCode(data.code)
    if (code.length < 3) return { error: 'code' as const }
    const kind: DiscountKind = data.kind === 'amount' ? 'amount' : 'percent'
    const value = num(data.value) ?? 0
    if (kind === 'percent' && (value < 1 || value > 100)) return { error: 'percent' as const }
    if (kind === 'amount' && value < 1) return { error: 'amount' as const }
    const min = num(data.min_order) || null
    const uses = num(data.max_uses) || null
    const ends = data.ends_on ? endOfDay(data.ends_on) : null
    if (ends != null && !Number.isFinite(ends)) return { error: 'date' as const }
    const taken = await first('SELECT 1 FROM discounts WHERE shop_id = ? AND code = ? AND id != ?', shop.id, code, data.id ?? '')
    if (taken) return { error: 'taken' as const }
    if (data.id) {
      await run(
        `UPDATE discounts SET code = ?, kind = ?, value = ?, min_order = ?, ends_at = ?, max_uses = ?, active = ? WHERE id = ? AND shop_id = ?`,
        code, kind, value, min, ends, uses, data.active ? 1 : 0, data.id, shop.id,
      )
      return { ok: true as const, id: data.id }
    }
    const id = newId()
    await run(
      `INSERT INTO discounts (id, shop_id, code, kind, value, min_order, ends_at, max_uses, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, shop.id, code, kind, value, min, ends, uses, data.active ? 1 : 0, now(),
    )
    return { ok: true as const, id }
  })

export const setDiscountActive = createServerFn({ method: 'POST' })
  .validator((d: { id: string; active: boolean }) => ({ id: String(d.id), active: !!d.active }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('UPDATE discounts SET active = ? WHERE id = ? AND shop_id = ?', data.active ? 1 : 0, data.id, shop.id)
    return { ok: true as const }
  })

/** Removes the code. Orders that used it keep its name and the money it took off. */
export const deleteDiscount = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('DELETE FROM discounts WHERE id = ? AND shop_id = ?', data.id, shop.id)
    return { ok: true as const }
  })

/** A buyer applies a code at checkout. placeOrder checks it again; this one is for showing the new total. */
export const checkDiscount = createServerFn({ method: 'GET' })
  .validator((d: { shopId: string; code: string }) => ({ shopId: String(d.shopId), code: String(d.code ?? '') }))
  .handler(async ({ data }) => liveDiscount(data.shopId, data.code))
