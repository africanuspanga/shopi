import { planState } from '#/lib/plans'
import { first } from '#/server/db'

/** A shop's plan state. Setup counts as done with a product, a Lipa Namba, delivery areas and a logo. */
export async function shopPlan(shopId: string) {
  const s = await first<{
    status: string
    plan: string
    created_at: number
    trial_ends: number | null
    paid_until: number | null
    lipa_number: string
    logo_key: string | null
    areas: number
    products: number
  }>(
    `SELECT status, plan, created_at, trial_ends, paid_until, lipa_number, logo_key,
       (SELECT COUNT(*) FROM delivery_areas WHERE shop_id = shops.id) areas,
       (SELECT COUNT(*) FROM products WHERE shop_id = shops.id) products
     FROM shops WHERE id = ?`,
    shopId,
  )
  if (!s) return null
  const setupDone = s.products > 0 && !!s.lipa_number && s.areas > 0 && !!s.logo_key
  return planState(s, setupDone)
}
