import { first, now } from '#/server/db'
import { cleanCode, type DiscountKind, type DiscountRule } from '#/lib/discounts'

export type DiscountDbRow = {
  id: string
  shop_id: string
  code: string
  kind: DiscountKind
  value: number
  min_order: number | null
  ends_at: number | null
  max_uses: number | null
  active: number
  created_at: number
}

/** Orders that used a code since it was made. Cancelled orders give their use back. */
export async function usesOf(d: Pick<DiscountDbRow, 'shop_id' | 'code' | 'created_at'>) {
  const row = await first<{ n: number }>(
    `SELECT COUNT(*) n FROM orders WHERE shop_id = ? AND discount_code = ? AND status != 'cancelled' AND created_at >= ?`,
    d.shop_id,
    d.code,
    d.created_at,
  )
  return row?.n ?? 0
}

/** A code buyers can use in this shop right now, or why not. Switched-off codes look unknown to buyers. */
export async function liveDiscount(shopId: string, raw: string): Promise<{ rule: DiscountRule } | { error: 'unknown' | 'ended' | 'used_up' }> {
  const code = cleanCode(raw)
  if (!code) return { error: 'unknown' }
  const d = await first<DiscountDbRow>('SELECT * FROM discounts WHERE shop_id = ? AND code = ?', shopId, code)
  if (!d || !d.active) return { error: 'unknown' }
  if (d.ends_at != null && d.ends_at < now()) return { error: 'ended' }
  if (d.max_uses != null && (await usesOf(d)) >= d.max_uses) return { error: 'used_up' }
  return { rule: { code: d.code, kind: d.kind, value: d.value, min_order: d.min_order } }
}
