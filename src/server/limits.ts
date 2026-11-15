import { getRequestHeader } from '@tanstack/react-start/server'
import { first, now, run } from '#/server/db'

const MINUTE = 60_000

/**
 * The limits. Phones in Tanzania often share one carrier IP, so per-IP limits are generous and only stop floods; the
 * real guard against password guessing is per phone number: 10 wrong passwords in an hour lock that number for the hour.
 */
export const LIMITS = {
  loginFails: { max: 10, window: 60 * MINUTE },
  loginIp: { max: 60, window: 15 * MINUTE },
  signupIp: { max: 30, window: 60 * MINUTE },
  // Requests the bot check (src/server/turnstile.ts) could not vouch for: sign-ups across Shopi, orders and
  // back-in-stock requests per shop.
  uncheckedSignup: { max: 5, window: 60 * MINUTE },
  uncheckedOrder: { max: 3, window: 60 * MINUTE },
  uncheckedAlert: { max: 5, window: 60 * MINUTE },
  // Photos a shop's bulk import fetches from links (src/routes/api/photo.ts): a big sheet, not an open proxy.
  photoFetch: { max: 1500, window: 60 * MINUTE },
} as const

/** The visitor's IP as Cloudflare saw it. */
export const clientIp = () => getRequestHeader('cf-connecting-ip') ?? 'unknown'

/** Whether `key` already reached its limit in the window. */
export async function overLimit(key: string, limit: { max: number; window: number }) {
  const row = await first<{ n: number }>('SELECT COUNT(*) n FROM limits WHERE key = ? AND at > ?', key, now() - limit.window)
  return (row?.n ?? 0) >= limit.max
}

/** Counts one attempt for `key`. */
export async function count(key: string) {
  await run('INSERT INTO limits (key, at) VALUES (?, ?)', key, now())
}

/** Forgets `key`'s attempts, e.g. a phone's failed logins once the right password is used. */
export async function forget(key: string) {
  await run('DELETE FROM limits WHERE key = ?', key)
}

/** For the nightly job: no limit looks back more than a day. */
export async function purgeLimits() {
  const res = await run('DELETE FROM limits WHERE at < ?', now() - 24 * 60 * MINUTE)
  return { deleted: res.meta.changes }
}
