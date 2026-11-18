import { env, waitUntil } from 'cloudflare:workers'
import { all, first, now, run } from '#/server/db'
import { EMAIL_LIVE, OPTIONAL_KINDS, type EmailKind } from '#/lib/email'
import { asLang, type Lang } from '#/lib/i18n'
import { SITE, renderEmail, type EmailData, type Rendered } from '#/server/email-templates'

/**
 * Email to sellers through Resend (roadmap `o-email`, 18 Nov 2026). From hello@shopi.tz (the domain is verified with
 * DKIM in Cloudflare; DMARC is p=reject, so a bad setup bounces rather than lands in spam). Replies go to the same
 * address, which forwards to the founder.
 *
 * - Any saved address gets mail; there is no confirm step (the founder, 18 Nov). The first email says the address is
 *   set and lets its owner remove it with one tap.
 * - EMAIL_LIVE off: only admins get mail; anything else is logged as `held`.
 * - No RESEND_API_KEY (local): nothing is sent; the email's links are printed (`dry`).
 * - Sends happen after the response (`later`) or in the nightly job, never while a seller waits.
 * - `email_log` keeps the kind and outcome per user, never the body or address; about 13 months.
 */

const DAY = 86_400_000
const FROM = 'Shopi <hello@shopi.tz>'

export const emailReady = () => !!env.RESEND_API_KEY

/** Runs after the response has gone; a failure is logged, never thrown at the seller. */
export function later(task: Promise<unknown>) {
  waitUntil(task.catch((e) => console.error('[email]', e instanceof Error ? e.message : e)))
}

async function log(userId: string | null, kind: string, status: string, providerId: string | null = null, error: string | null = null) {
  await run(
    'INSERT INTO email_log (user_id, kind, status, provider_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    userId,
    kind,
    status,
    providerId,
    error?.slice(0, 300) ?? null,
    now(),
  )
}

/** One email to one address through Resend's API. `oneClick` adds the List-Unsubscribe headers (RFC 8058). */
export async function deliver(to: string, kind: string, mail: Rendered, opts: { userId?: string | null; oneClick?: string; idem?: string } = {}) {
  const userId = opts.userId ?? null
  if (!emailReady()) {
    // Local runs: show what would have gone, links included, so a link in it can be followed by hand.
    const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((u) => !u.endsWith('shopi.tz'))
    console.log('[email] dry run', JSON.stringify({ kind, subject: mail.subject, links }))
    await log(userId, kind, 'dry')
    return { status: 'dry' as const }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Resend refuses requests without one (403), and a Worker's fetch doesn't add it.
        'User-Agent': 'Shopi/1.0 (+https://shopi.tz)',
        // The same email asked for twice within 24 hours (a retried job) goes once.
        ...(opts.idem ? { 'Idempotency-Key': opts.idem.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: 'hello@shopi.tz',
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [{ name: 'kind', value: kind.replace(/[^\w-]/g, '_') }],
        ...(opts.oneClick
          ? {
              headers: {
                'List-Unsubscribe': `<${opts.oneClick}>, <mailto:hello@shopi.tz?subject=Unsubscribe>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json().catch(() => ({}))) as {
      id?: string
      name?: string
      message?: string
    }
    if (!res.ok || !body.id) {
      const error = `${res.status} ${body.name ?? ''} ${body.message ?? ''}`.trim()
      console.error('[email] failed', JSON.stringify({ kind, error }))
      await log(userId, kind, 'failed', null, error)
      return { status: 'failed' as const, error }
    }
    await log(userId, kind, 'sent', body.id)
    return { status: 'sent' as const, id: body.id }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[email] failed', JSON.stringify({ kind, error }))
    await log(userId, kind, 'failed', null, error)
    return { status: 'failed' as const, error }
  }
}

type Recipient = {
  id: string
  email: string | null
  email_ok: number | null
  email_lang: string | null
  email_key: string | null
  is_admin: number
}

const recipient = (userId: string) => first<Recipient>('SELECT id, email, email_ok, email_lang, email_key, is_admin FROM users WHERE id = ?', userId)

/** The page that stops an optional kind (the footer link), and the one-click address mail apps call (the header). */
export const stopUrl = (u: { id: string; email_key: string }, what: 'weekly' | 'news' | 'all' | 'remove') => `${SITE}/email/off?u=${u.id}&k=${u.email_key}&w=${what}`
const oneClickUrl = (u: { id: string; email_key: string }, what: 'weekly' | 'news' | 'all') => `${SITE}/api/email-off?u=${u.id}&k=${u.email_key}&w=${what}`

/** An email to a seller's saved address, in their language. Held while EMAIL_LIVE is off, unless they are an admin. */
export async function sendTo<K extends EmailKind>(userId: string, kind: K, data: EmailData[K], idem?: string) {
  const u = await recipient(userId)
  if (!u?.email || !u.email_ok) return { status: 'none' as const }
  if (!EMAIL_LIVE && !u.is_admin) {
    await log(u.id, kind, 'held')
    return { status: 'held' as const }
  }
  const optional = OPTIONAL_KINDS.includes(kind) && u.email_key
  const what = 'weekly' as const
  const mail = renderEmail(kind, data, asLang(u.email_lang), optional ? stopUrl({ id: u.id, email_key: u.email_key! }, what) : undefined)
  return deliver(u.email, kind, mail, {
    userId: u.id,
    idem,
    oneClick: optional ? oneClickUrl({ id: u.id, email_key: u.email_key! }, what) : undefined,
  })
}

/* ---------- An address added ---------- */

/**
 * "Your email is set", right after a seller saves an address (no confirm step, the founder, 18 Nov). It tells the
 * owner of the address, and gives them one tap to remove it if it isn't theirs. Held while EMAIL_LIVE is off, unless
 * the seller is an admin. `key` is the address's own key, so the link can't remove a later address.
 */
export async function sendAdded(userId: string, email: string, key: string, lang: Lang, shop: string, weekly: boolean) {
  const u = await recipient(userId)
  if (!EMAIL_LIVE && !u?.is_admin) {
    await log(userId, 'added', 'held')
    return
  }
  const mail = renderEmail('added', { email, shop, weekly, remove: stopUrl({ id: userId, email_key: key }, 'remove') }, lang)
  await deliver(email, 'added', mail, { userId, idem: `added-${userId}-${key}` })
}

/**
 * From a link in an email, no log-in (the address's key is the proof): stop the weekly summary, the news or both, or
 * remove the address altogether ("Not you?"). Removing also stops every email to it.
 */
export async function unsubscribe(userId: string, key: string, what: string) {
  if (!/^[\w-]{8,64}$/.test(userId) || !/^[\w-]{16,64}$/.test(key)) return false
  const set =
    what === 'remove'
      ? 'email = NULL, email_ok = NULL, email_weekly = 0, email_news = 0, email_key = NULL'
      : what === 'news'
        ? 'email_news = 0'
        : what === 'all'
          ? 'email_weekly = 0, email_news = 0'
          : 'email_weekly = 0'
  const res = await run(`UPDATE users SET ${set} WHERE id = ? AND email_key = ?`, userId, key)
  return res.meta.changes > 0
}

/* ---------- What Shopi sends ---------- */

/** The Tembo receipt, after a payment completes (src/server/billing.ts). To the shop's owner. */
export async function emailReceipt(paymentId: string) {
  const p = await first<{
    amount: number
    phone: string
    transid: string | null
    paid_until: number
    completed_at: number
    shop: string
    owner: string
  }>(
    `SELECT p.amount, p.phone, p.transid, p.paid_until, p.completed_at, s.name shop, s.owner_id owner
     FROM payments p JOIN shops s ON s.id = p.shop_id WHERE p.id = ? AND p.status = 'completed'`,
    paymentId,
  )
  if (!p) return { status: 'none' as const }
  return sendTo(
    p.owner,
    'receipt',
    {
      shop: p.shop,
      amount: p.amount,
      until: p.paid_until,
      paidAt: p.completed_at,
      phone: p.phone,
      order: paymentId,
      transid: p.transid,
    },
    `receipt-${paymentId}`,
  )
}

/** The start of a day in Dar (UTC+3), in ms. */
const darDayStart = (t: number) => Math.floor((t + 3 * 3600_000) / DAY) * DAY - 3 * 3600_000

/**
 * Mondays, from the nightly job: last week's numbers (Monday to Sunday, Dar) for sellers who chose the summary. A week
 * with no visit and no order sends nothing.
 */
export async function weeklySummaries(t = now()) {
  if (new Date(t + 3 * 3600_000).getUTCDay() !== 1) return { skipped: 'not Monday' }
  const to = darDayStart(t)
  const from = to - 7 * DAY
  const before = from - 7 * DAY
  const rows = await all<{ user_id: string; shop_id: string; shop: string }>(
    `SELECT u.id user_id, s.id shop_id, s.name shop FROM users u JOIN shops s ON s.owner_id = u.id
     WHERE u.email_ok IS NOT NULL AND u.email_weekly = 1 AND s.status = 'active'`,
  )
  let sent = 0
  let failed = 0
  for (const r of rows) {
    // One seller's error (a database blip) never stops the others: the summary only runs on Mondays.
    try {
      const week = async (a: number, b: number) => {
        const n = await first<{
          visits: number
          orders: number
          sales: number
        }>(
          `SELECT
           (SELECT COUNT(DISTINCT CASE WHEN type IN ('view_shop', 'view_product') THEN session_id END) FROM events
              WHERE shop_id = ?1 AND created_at >= ?2 AND created_at < ?3) visits,
           (SELECT COUNT(*) FROM orders WHERE shop_id = ?1 AND created_at >= ?2 AND created_at < ?3 AND status != 'cancelled') orders,
           (SELECT COALESCE(SUM(total), 0) FROM orders WHERE shop_id = ?1 AND created_at >= ?2 AND created_at < ?3
              AND status IN ('confirmed', 'dispatched', 'delivered')) sales`,
          r.shop_id,
          a,
          b,
        )
        return {
          visits: n?.visits ?? 0,
          orders: n?.orders ?? 0,
          sales: n?.sales ?? 0,
        }
      }
      const now7 = await week(from, to)
      if (!now7.visits && !now7.orders) continue
      const prev = await week(before, from)
      const top = await first<{ name: string; sold: number }>(
        `SELECT oi.name, SUM(oi.qty) sold FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.shop_id = ? AND o.created_at >= ? AND o.created_at < ? AND o.status IN ('confirmed', 'dispatched', 'delivered')
       GROUP BY oi.product_id, oi.name ORDER BY sold DESC LIMIT 1`,
        r.shop_id,
        from,
        to,
      )
      const check = await first<{ n: number }>(`SELECT COUNT(*) n FROM orders WHERE shop_id = ? AND status = 'payment_claimed'`, r.shop_id)
      const res = await sendTo(
        r.user_id,
        'weekly',
        {
          shop: r.shop,
          from,
          to,
          ...now7,
          prev,
          top: top ?? null,
          toCheck: check?.n ?? 0,
        },
        `weekly-${r.user_id}-${from}`,
      )
      if (res.status === 'sent' || res.status === 'dry') sent++
    } catch (e) {
      failed++
      console.error(
        '[email] weekly failed',
        JSON.stringify({
          user: r.user_id,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }
  return { sellers: rows.length, sent, failed }
}

/** For the nightly job: the log past about 13 months. */
export async function purgeEmail() {
  const logs = await run('DELETE FROM email_log WHERE created_at < ?', now() - 400 * DAY)
  return { log: logs.meta.changes }
}
