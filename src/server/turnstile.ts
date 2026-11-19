import { env } from 'cloudflare:workers'
import { isShopDomain } from '#/server/domains'
import { clientIp, count, overLimit } from '#/server/limits'

/** What each form says it is, checked against the token so one form's token can't be spent on another. */
export type HumanAction = 'signup' | 'order' | 'alert' | 'book'

const HOST = 'shopi.tz'

/**
 * Cloudflare Turnstile (`src/lib/turnstile.tsx` in the browser): whether a real person sent this request.
 *
 * A token that fails the check is refused. A request with no token, or one Cloudflare can't check right now, is let
 * through only a few times an hour per `fallback` key: a buyer whose phone can't run the check can still order, but a
 * bot that skips it gets no further than that. Without `TURNSTILE_SECRET` (local work, or before it is set) everything passes.
 */
export async function isHuman(token: unknown, action: HumanAction, fallback: { key: string; limit: { max: number; window: number } }) {
  const secret = env.TURNSTILE_SECRET
  if (!secret) return true
  const verdict = typeof token === 'string' && token && token.length <= 2048 ? await verify(secret, token, action) : 'unknown'
  if (verdict !== 'unknown') return verdict === 'human'
  const key = `unchecked-${fallback.key}`
  if (await overLimit(key, fallback.limit)) return false
  await count(key)
  return true
}

async function verify(secret: string, token: string, action: HumanAction): Promise<'human' | 'bot' | 'unknown'> {
  let res: {
    success: boolean
    action?: string
    hostname?: string
    'error-codes'?: string[]
    metadata?: { result_with_testing_key?: boolean }
  }
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: clientIp() }),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) throw new Error(`siteverify ${r.status}`)
    res = await r.json()
  } catch (e) {
    console.error('[turnstile]', e)
    return 'unknown'
  }
  if (!res.success) {
    // A wrong secret is our mistake, not the buyer's: let the fallback decide, and say so in the logs.
    if (res['error-codes']?.some((c) => c === 'invalid-input-secret' || c === 'missing-input-secret' || c === 'internal-error')) {
      console.error('[turnstile]', res['error-codes'])
      return 'unknown'
    }
    return 'bot'
  }
  // Cloudflare's test keys (local work) answer for example.com with no action.
  if (res.metadata?.result_with_testing_key) return 'human'
  if (res.action !== action) return 'bot'
  // shopi.tz, or a shop's own domain (src/server/domains.ts).
  return res.hostname === HOST || (!!res.hostname && (await isShopDomain(res.hostname))) ? 'human' : 'bot'
}
