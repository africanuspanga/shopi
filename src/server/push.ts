import { env, waitUntil } from 'cloudflare:workers'
import { buildPushPayload } from '@block65/webcrypto-web-push'
import { all, now, run } from '#/server/db'
import { asLang, translate, type Lang } from '#/lib/i18n'

/**
 * Notifications on the seller's phone (Web Push). The browser gives an address at its push service (Google, Apple,
 * Mozilla) when the seller turns notifications on (`src/lib/push.ts`); a message is encrypted for that one browser
 * and sent there, and `public/sw.js` shows it. The key pair: VAPID_PUBLIC_KEY is a var, VAPID_PRIVATE_KEY a secret.
 * Without them nothing is sent.
 */
export type PushNote = { title: string; body: string; url: string; tag?: string }
type T = (en: string, vars?: Record<string, string | number>) => string

/** The public key browsers subscribe with, or null when the key pair isn't set (then nothing is sent). */
export const pushKey = () => (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null)

/**
 * Sends to every phone where the shop's people turned notifications on, after the response has gone. `to`: `orders`
 * (a new order, a payment to check) reaches the owner and the assistants who handle orders (Orders, Manager) while the
 * shop is on Tembo; `owner` (Tembo itself) reaches the owner only (src/lib/staff.ts).
 */
export function notifySeller(shopId: string, note: (t: T, lang: Lang) => PushNote, to: 'orders' | 'owner' = 'orders') {
  if (!pushKey()) return
  waitUntil(
    (async () => {
      const subs = await all<{ id: string; endpoint: string; p256dh: string; auth: string; lang: string }>(
        `SELECT p.id, p.endpoint, p.p256dh, p.auth, p.lang FROM push_subscriptions p JOIN shops s ON s.id = p.shop_id
         WHERE p.shop_id = ?1 AND (p.user_id = s.owner_id OR (?2 = 'orders'
           AND (s.status = 'demo' OR (s.plan = 'tembo' AND s.paid_until > ?3))
           AND EXISTS (SELECT 1 FROM shop_staff st WHERE st.shop_id = s.id AND st.user_id = p.user_id AND st.role IN ('orders', 'manager'))))`,
        shopId,
        to,
        now(),
      )
      await Promise.all(
        subs.map((s) => {
          const lang = asLang(s.lang)
          return send(s, note((en, vars) => translate(lang, en, vars), lang))
        }),
      )
    })().catch((e) => console.error('[push]', e)),
  )
}

/** Sends one message; an address the push service no longer knows is deleted. Returns whether it was accepted. */
export async function send(sub: { id: string; endpoint: string; p256dh: string; auth: string }, note: PushNote) {
  const payload = await buildPushPayload(
    // Kept a day if the phone is off; "high" wakes a sleeping phone, which a new order deserves.
    { data: note, options: { ttl: 86400, urgency: 'high' } },
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    { subject: 'mailto:hello@shopi.tz', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  )
  const res = await fetch(sub.endpoint, payload)
  if (res.status === 404 || res.status === 410) {
    await run('DELETE FROM push_subscriptions WHERE id = ?', sub.id)
    return false
  }
  if (!res.ok) {
    console.error('[push]', res.status, (await res.text()).slice(0, 200))
    return false
  }
  await run('UPDATE push_subscriptions SET sent_at = ? WHERE id = ?', now(), sub.id)
  return true
}

/** "Amina · Sinza · 2 items": who, where, how much. */
export function orderLine(t: T, o: { name: string; area: string; items: number }) {
  return [o.name, o.area, t(o.items === 1 ? '{n} item' : '{n} items', { n: o.items })].filter(Boolean).join(' · ')
}
