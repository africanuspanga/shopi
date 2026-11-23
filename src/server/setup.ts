import { first, now, run } from '#/server/db'
import { nextSetupStep, type SetupOutcome } from '#/lib/setup'
import { parseBook } from '#/lib/booking'
import { parseBill } from '#/lib/invoice'

/** Moves the shop's setup on to `step` (never back) and notes how it was passed and how long its screen took. */
export async function passStep(shopId: string, step: number, outcome: SetupOutcome, secs: number | null) {
  // Only shops in the setup move, and only forward: a shop opened before it (setup_step NULL) never enters it, and a
  // step already passed is noted once (a service added later doesn't pass step 2 again).
  const res = await run(
    'UPDATE shops SET setup_step = ?1 WHERE id = ?2 AND setup_step IS NOT NULL AND setup_step < ?1',
    step,
    shopId,
  )
  if (!res.meta.changes) return
  await run('INSERT INTO setup_steps (shop_id, step, outcome, seconds, created_at) VALUES (?, ?, ?, ?, ?)', shopId, step, outcome, secs, now())
}

/** The step the setup shows this shop now (the rule `getSetup` answers with), or null when it is done or never had it. */
export async function setupStepNow(shopId: string): Promise<number | null> {
  const s = await first<{ setup_step: number | null; kind: string; lipa_number: string; book: string | null; bill: string | null; products: number; services: number; invoices: number }>(
    `SELECT setup_step, kind, lipa_number, book, bill,
       (SELECT COUNT(*) FROM products WHERE shop_id = ?1 AND active = 1) products,
       (SELECT COUNT(*) FROM services WHERE shop_id = ?1 AND active = 1) services,
       (SELECT COUNT(*) FROM invoices WHERE shop_id = ?1) invoices
     FROM shops WHERE id = ?1`,
    shopId,
  )
  if (!s) return null
  const bill = parseBill(s.bill)
  return nextSetupStep({ setup: s.setup_step, products: s.products, lipa: !!s.lipa_number, kind: s.kind, services: s.services, hours: !!parseBook(s.book), bill: !!bill, bank: !!bill?.bank, invoices: s.invoices })
}
