import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { currentUser, endSession, hashPassword, myShop, startSession, verifyPassword } from '#/server/auth'
import { first, newId, now, run } from '#/server/db'
import { LIMITS, clientIp, count, forget, overLimit } from '#/server/limits'
import { isHuman } from '#/server/turnstile'
import { normalizePhone } from '#/lib/format'
import { REF_COOKIE } from '#/lib/host'
import { asLang, type Lang } from '#/lib/i18n'
import { planState } from '#/lib/plans'
import { asShopKind } from '#/lib/format'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const lang: Lang = asLang(getCookie('shopi_lang'))
  const user = await currentUser()
  const row = user ? await myShop(user.id) : null
  // The plan (Free, Tembo, demo) rides with the session, so seller screens ask can() without another request.
  // setup: the furthest setup step passed (src/lib/setup.ts); null for shops opened before the five-step setup.
  // kind: what the shop shows first: products, services (src/lib/booking.ts) or invoices (src/lib/invoice.ts).
  // role: owner, or the assistant's role (src/lib/staff.ts); paused: an assistant whose shop is no longer on Tembo.
  const shop = row
    ? { id: row.id, slug: row.slug, name: row.name, logo_key: row.logo_key, plan: planState(row), setup: row.setup_step, role: row.role, paused: row.paused, kind: asShopKind(row.kind) }
    : null
  return { lang, user, shop }
})

export const setLang = createServerFn({ method: 'POST' })
  .validator((d: { lang: Lang }) => ({ lang: d.lang === 'en' ? 'en' : 'sw' }))
  .handler(async ({ data }) => {
    setCookie('shopi_lang', data.lang, { path: '/', maxAge: 365 * 86400, sameSite: 'lax' })
    return data.lang
  })

export const signup = createServerFn({ method: 'POST' })
  .validator((d: { name: string; phone: string; password: string; human?: string }) => ({
    name: String(d.name ?? '').trim().slice(0, 60),
    phone: normalizePhone(String(d.phone ?? '')),
    password: String(d.password ?? ''),
    human: d.human,
  }))
  .handler(async ({ data }) => {
    const ipKey = `signup-ip:${clientIp()}`
    if (await overLimit(ipKey, LIMITS.signupIp)) return { error: 'limit' as const }
    await count(ipKey)
    if (!data.name) return { error: 'name' as const }
    if (!data.phone) return { error: 'phone' as const }
    if (data.password.length < 6) return { error: 'password' as const }
    if (!(await isHuman(data.human, 'signup', { key: 'signup', limit: LIMITS.uncheckedSignup }))) return { error: 'bot' as const }
    const exists = await first('SELECT id FROM users WHERE phone = ?', data.phone)
    if (exists) return { error: 'exists' as const }
    const id = newId()
    // The shop whose "Open your own shop" link brought them, if any (src/lib/host.ts, refLink).
    const refSlug = String(getCookie(REF_COOKIE) ?? '')
    const ref = /^[a-z0-9-]{3,40}$/.test(refSlug) ? await first<{ id: string }>(`SELECT id FROM shops WHERE slug = ? AND status IN ('active', 'demo')`, refSlug) : null
    await run(
      'INSERT INTO users (id, phone, name, pass_hash, created_at, ref_shop) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      data.phone,
      data.name,
      await hashPassword(data.password),
      now(),
      ref?.id ?? null,
    )
    if (refSlug) setCookie(REF_COOKIE, '', { path: '/', maxAge: 0 })
    await startSession(id)
    return { ok: true as const }
  })

export const login = createServerFn({ method: 'POST' })
  .validator((d: { phone: string; password: string }) => ({
    phone: normalizePhone(String(d.phone ?? '')),
    password: String(d.password ?? ''),
  }))
  .handler(async ({ data }) => {
    // A flood from one IP, or 10 wrong passwords for one number in an hour, waits. The same answer either way.
    const ipKey = `login-ip:${clientIp()}`
    const phoneKey = `login:${data.phone}`
    if ((await overLimit(ipKey, LIMITS.loginIp)) || (data.phone && (await overLimit(phoneKey, LIMITS.loginFails)))) {
      return { error: 'limit' as const }
    }
    await count(ipKey)
    const user = await first<{ id: string; pass_hash: string }>(
      'SELECT id, pass_hash FROM users WHERE phone = ?',
      data.phone,
    )
    if (!user || !(await verifyPassword(data.password, user.pass_hash))) {
      if (data.phone) await count(phoneKey)
      return { error: 'invalid' as const }
    }
    await forget(phoneKey)
    await startSession(user.id)
    return { ok: true as const }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  await endSession()
  return { ok: true }
})
