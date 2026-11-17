import { planState } from '#/lib/plans'
import { first } from '#/server/db'

/** A shop's plan: demo, free, or Tembo while its paid year runs (`src/lib/plans.ts`). */
export async function shopPlan(shopId: string) {
  const s = await first<{ status: string; plan: string; paid_until: number | null }>('SELECT status, plan, paid_until FROM shops WHERE id = ?', shopId)
  return s ? planState(s) : null
}
