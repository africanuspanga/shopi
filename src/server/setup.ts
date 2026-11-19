import { now, run } from '#/server/db'
import type { SetupOutcome } from '#/lib/setup'

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
