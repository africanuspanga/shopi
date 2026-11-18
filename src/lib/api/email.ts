import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { requireAdmin, requireShop } from '#/server/auth'
import { first, newId, run } from '#/server/db'
import { LIMITS, take } from '#/server/limits'
import { deliver, emailReady, later, sendAdded, unsubscribe } from '#/server/email'
import { renderEmail, sampleEmail } from '#/server/email-templates'
import { EMAIL_KINDS, EMAIL_LIVE, isEmail, type EmailKind } from '#/lib/email'
import { asLang } from '#/lib/i18n'

/**
 * The seller's email (src/server/email.ts): optional, added on Home or in Shop settings (n11). It works as soon as it is
 * saved: no confirm step (the founder, 18 Nov).
 */

type Mine = { email: string | null; email_ok: number | null; email_weekly: number; email_news: number; is_admin: number }

/**
 * Whether one more "Your email is set" may go: per seller, per address (many accounts can't all write to one person) and
 * across Shopi. Each check counts the attempt first (`take`), so a burst of requests can't slip through together.
 */
async function mayMail(userId: string, email: string) {
  return (await take(`email:${userId}`, LIMITS.emailSend)) && (await take(`email-to:${email}`, LIMITS.emailTo)) && (await take('email-all', LIMITS.emailAll))
}

/** The address, the two choices, and whether email is open to this seller yet. */
export const getMyEmail = createServerFn({ method: 'GET' }).handler(async () => {
  const { user } = await requireShop()
  const u = await first<Mine>('SELECT email, email_ok, email_weekly, email_news, is_admin FROM users WHERE id = ?', user.id)
  return {
    open: EMAIL_LIVE || !!u?.is_admin,
    email: u?.email ?? null,
    weekly: !!u?.email_weekly,
    news: !!u?.email_news,
  }
})

/**
 * A new address, in use at once, with the seller's choices and the app's language; "Your email is set" goes to it after
 * the response. The weekly summary is the seller's choice on the same form (shown on, easy to switch off).
 */
export const setMyEmail = createServerFn({ method: 'POST' })
  .validator((d: { email: string; weekly?: boolean }) => ({ email: String(d?.email ?? '').trim().toLowerCase(), weekly: !!d?.weekly }))
  .handler(async ({ data }) => {
    const { user, shop } = await requireShop()
    if (!EMAIL_LIVE && !user.is_admin) return { error: 'closed' as const }
    if (!isEmail(data.email)) return { error: 'email' as const }
    if (!(await mayMail(user.id, data.email))) return { error: 'limit' as const }
    const lang = asLang(getCookie('shopi_lang'))
    // A new address gets a new key, so links in mail to an old one ("not you?", stop the summary) stop working.
    const key = newId(24)
    await run(
      `UPDATE users SET email = ?, email_ok = ?, email_lang = ?, email_weekly = ?, email_key = ? WHERE id = ?`,
      data.email,
      Date.now(),
      lang,
      data.weekly ? 1 : 0,
      key,
      user.id,
    )
    later(sendAdded(user.id, data.email, key, lang, shop.name, data.weekly))
    return { ok: true as const }
  })

/** The weekly summary and news from Shopi: on or off. */
export const setEmailPrefs = createServerFn({ method: 'POST' })
  .validator((d: { weekly?: boolean; news?: boolean }) => ({ weekly: d?.weekly, news: d?.news }))
  .handler(async ({ data }) => {
    const { user } = await requireShop()
    if (typeof data.weekly === 'boolean') await run('UPDATE users SET email_weekly = ? WHERE id = ?', data.weekly ? 1 : 0, user.id)
    if (typeof data.news === 'boolean') await run('UPDATE users SET email_news = ? WHERE id = ?', data.news ? 1 : 0, user.id)
    return { ok: true as const }
  })

/** No more email: the address and its choices go. */
export const removeMyEmail = createServerFn({ method: 'POST' }).handler(async () => {
  const { user } = await requireShop()
  await run('UPDATE users SET email = NULL, email_ok = NULL, email_weekly = 0, email_news = 0, email_key = NULL WHERE id = ?', user.id)
  return { ok: true as const }
})

/** From a link in an email (/email/off), after a tap there: stop the summary, or remove the address ("Not you?"). */
export const stopEmail = createServerFn({ method: 'POST' })
  .validator((d: { u: string; k: string; w: string }) => ({ u: String(d?.u ?? '').slice(0, 64), k: String(d?.k ?? '').slice(0, 64), w: String(d?.w ?? 'weekly').slice(0, 10) }))
  .handler(async ({ data }) => ({ ok: await unsubscribe(data.u, data.k, data.w) }))

/**
 * /admin: any kind of email with sample data, to an address the admin types (their own, to see how it lands). Goes even
 * while EMAIL_LIVE is off; marked as a test in the subject.
 */
export const sendTestEmail = createServerFn({ method: 'POST' })
  .validator((d: { to: string; kind: string; lang: string }) => ({
    to: String(d?.to ?? '').trim().toLowerCase(),
    kind: (EMAIL_KINDS as readonly string[]).includes(d?.kind) ? (d.kind as EmailKind) : null,
    lang: asLang(d?.lang),
  }))
  .handler(async ({ data }) => {
    const admin = await requireAdmin()
    if (!data.kind) return { error: 'kind' as const }
    if (!isEmail(data.to)) return { error: 'email' as const }
    if (!(await take(`email-test:${admin.id}`, LIMITS.emailTest))) return { error: 'limit' as const }
    const mail = renderEmail(data.kind, sampleEmail(data.kind, Date.now()), data.lang, data.kind === 'weekly' ? 'https://shopi.tz/email/off?test=1' : undefined)
    const res = await deliver(data.to, `test-${data.kind}`, { ...mail, subject: `[Test] ${mail.subject}` }, { userId: admin.id })
    return { ...res, ready: emailReady() }
  })
