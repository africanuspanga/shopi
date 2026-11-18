import { now, run } from '#/server/db'
import type { SetupOutcome } from '#/lib/setup'

/** Moves the shop's setup on to `step` (never back) and notes how it was passed and how long its screen took. */
export async function passStep(shopId: string, step: number, outcome: SetupOutcome, secs: number | null) {
  // Only shops in the setup move: a shop opened before it (setup_step NULL) never enters it.
  const res = await run(
    'UPDATE shops SET setup_step = MAX(setup_step, ?) WHERE id = ? AND setup_step IS NOT NULL',
    step,
    shopId,
  )
  if (!res.meta.changes) return
  await run('INSERT INTO setup_steps (shop_id, step, outcome, seconds, created_at) VALUES (?, ?, ?, ?, ?)', shopId, step, outcome, secs, now())
}
