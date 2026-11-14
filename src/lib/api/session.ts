import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { currentUser, endSession, hashPassword, startSession, verifyPassword } from '#/server/auth'
import { first, newId, now, run } from '#/server/db'
import { LIMITS, clientIp, count, forget, overLimit } from '#/server/limits'
import { normalizePhone } from '#/lib/format'
import { asLang, type Lang } from '#/lib/i18n'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const lang: Lang = asLang(getCookie('shopi_lang'))
  const user = await currentUser()
  const shop = user
    ? await first<{ id: string; slug: string; name: string; logo_key: string | null }>(
        'SELECT id, slug, name, logo_key FROM shops WHERE owner_id = ? LIMIT 1',
        user.id,
      )
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
  .validator((d: { name: string; phone: string; password: string }) => ({
    name: String(d.name ?? '').trim().slice(0, 60),
    phone: normalizePhone(String(d.phone ?? '')),
    password: String(d.password ?? ''),
  }))
  .handler(async ({ data }) => {
    const ipKey = `signup-ip:${clientIp()}`
    if (await overLimit(ipKey, LIMITS.signupIp)) return { error: 'limit' as const }
    await count(ipKey)
    if (!data.name) return { error: 'name' as const }
    if (!data.phone) return { error: 'phone' as const }
    if (data.password.length < 6) return { error: 'password' as const }
    const exists = await first('SELECT id FROM users WHERE phone = ?', data.phone)
    if (exists) return { error: 'exists' as const }
    const id = newId()
    await run(
      'INSERT INTO users (id, phone, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      id,
      data.phone,
      data.name,
      await hashPassword(data.password),
      now(),
    )
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
