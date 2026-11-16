import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { requireShop } from '#/server/auth'
import { first, newId, now, run } from '#/server/db'
import { pushKey, send } from '#/server/push'
import { asLang, msg, translate } from '#/lib/i18n'

/** The key browsers need to subscribe; null when notifications aren't set up on this server. */
export const getPushKey = createServerFn({ method: 'GET' }).handler(async () => pushKey())

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }
const key = (v: unknown) => (typeof v === 'string' && /^[\w-]{16,200}={0,2}$/.test(v) ? v : '')
// Only the browsers' own push services: the server sends to this address, so it must never be anywhere else.
const PUSH_HOSTS = /(^|\.)(googleapis\.com|google\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/
const endpoint = (v: unknown) => {
  try {
    const url = new URL(String(v))
    return url.protocol === 'https:' && PUSH_HOSTS.test(url.hostname) && url.href.length <= 1000 ? url.href : ''
  } catch {
    return ''
  }
}

/** This phone or browser gets the seller's notifications, in the language they use the app in now. */
export const savePushSubscription = createServerFn({ method: 'POST' })
  .validator((d: Sub) => ({ endpoint: endpoint(d.endpoint), p256dh: key(d.keys?.p256dh), auth: key(d.keys?.auth) }))
  .handler(async ({ data }) => {
    if (!data.endpoint || !data.p256dh || !data.auth) return { error: 'invalid' as const }
    const { user, shop } = await requireShop()
    const lang = asLang(getCookie('shopi_lang'))
    await run(
      `INSERT INTO push_subscriptions (id, user_id, shop_id, endpoint, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, shop_id = excluded.shop_id, p256dh = excluded.p256dh,
         auth = excluded.auth, lang = excluded.lang`,
      newId(), user.id, shop.id, data.endpoint, data.p256dh, data.auth, lang, now(),
    )
    return { ok: true as const }
  })

/** The seller opened Shopi from the Home Screen: remember when and on what, for the owner dashboard's install count. */
export const markAppInstalled = createServerFn({ method: 'POST' })
  .validator((d: { platform?: string }) => ({ platform: d?.platform === 'android' || d?.platform === 'ios' ? d.platform : 'other' }))
  .handler(async ({ data }) => {
    const { user } = await requireShop()
    await run('UPDATE users SET app_seen_at = ?, app_platform = ? WHERE id = ?', now(), data.platform, user.id)
    return { ok: true as const }
  })

export const removePushSubscription = createServerFn({ method: 'POST' })
  .validator((d: { endpoint: string }) => ({ endpoint: endpoint(d.endpoint) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('DELETE FROM push_subscriptions WHERE endpoint = ? AND shop_id = ?', data.endpoint, shop.id)
    return { ok: true as const }
  })

/** A sample notification to this phone, so the seller sees what a new order looks like. */
export const testPush = createServerFn({ method: 'POST' })
  .validator((d: { endpoint: string }) => ({ endpoint: endpoint(d.endpoint) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const sub = await first<{ id: string; endpoint: string; p256dh: string; auth: string; lang: string }>(
      'SELECT id, endpoint, p256dh, auth, lang FROM push_subscriptions WHERE endpoint = ? AND shop_id = ?',
      data.endpoint,
      shop.id,
    )
    if (!sub || !pushKey()) return { error: 'off' as const }
    const lang = asLang(sub.lang)
    const ok = await send(sub, {
      title: translate(lang, 'Notifications are on'),
      body: translate(lang, msg('New orders and payments to check will show up like this on this phone.')),
      url: '/app/orders',
      tag: 'test',
    })
    return ok ? { ok: true as const } : { error: 'failed' as const }
  })
