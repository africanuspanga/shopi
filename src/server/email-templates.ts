import { translate, type Lang } from '#/lib/i18n'
import { localPhone, tzs } from '#/lib/format'
import type { EmailKind } from '#/lib/email'
import { TEMBO_PRICE } from '#/lib/plans'

/**
 * The emails Shopi sends sellers (src/server/email.ts), as plain HTML in Shopi's look: a sand page, a white card, ink
 * text, a black pill button, and the receipt slip in mono only where there is money. Inline styles and tables, because
 * email apps ignore stylesheets; Mona Sans where the app has it, the phone's own font elsewhere. Every email also has a
 * text version. Pure: no database, no network, so /admin can preview them with sample data.
 */

type T = (en: string, vars?: Record<string, string | number>) => string
export type Rendered = { subject: string; html: string; text: string }

export const SITE = 'https://shopi.tz'
const C = { page: '#f4f3f0', card: '#ffffff', ink: '#0a0a0a', ink2: '#4d4b47', muted: '#6d6a65', line: '#e4e3df', slip: '#f7f6f3', moto: '#ff4f17' }
const SANS = `'Mona Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
const MONO = `'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** "12 November 2026" in Dar, in the email's language. */
export const emailDate = (ms: number, lang: Lang) =>
  new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' })
const shortDate = (ms: number, lang: Lang) => new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Dar_es_Salaam' })

/** 255754123456 → 0754 *** 456: enough to recognise the number, not to copy it. */
export const maskPhone = (raw: string) => {
  const local = localPhone(raw.startsWith('+') ? raw : `+${raw}`)
  return /^0\d{3} \d{3} \d{3}$/.test(local) ? `${local.slice(0, 4)} *** ${local.slice(9)}` : local
}

type Shell = {
  lang: Lang
  subject: string
  /** The line email apps show after the subject. */
  preheader: string
  title: string
  /** HTML paragraphs and blocks, already escaped. */
  body: string
  button?: { label: string; url: string }
  /** Small print under the button. */
  after?: string
  /** Why this email came; and, for optional kinds, the link that stops it. */
  reason: string
  stop?: { label: string; url: string }
  /** The text version's own body lines. */
  text: string[]
}

const p = (html: string, style = '') => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink2};${style}">${html}</p>`

function shell(s: Shell): Rendered {
  const button = s.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px"><tr><td style="border-radius:999px;background:${C.ink}">
<a href="${esc(s.button.url)}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:15px;font-weight:500;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px">${esc(s.button.label)}</a></td></tr></table>`
    : ''
  const after = s.after ? `<p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">${s.after}</p>` : ''
  const stop = s.stop ? ` <a href="${esc(s.stop.url)}" style="color:${C.muted};text-decoration:underline">${esc(s.stop.label)}</a>` : ''
  const html = `<!doctype html>
<html lang="${s.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(s.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(s.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 8px 18px"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/brand/shopi-wordmark-email.png" width="64" height="22" alt="shopi" style="display:block;border:0;outline:none"></a></td></tr>
<tr><td style="background:${C.card};border-radius:20px;padding:30px 26px 28px">
<h1 style="margin:0 0 14px;font-family:${SANS};font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:${C.ink}">${esc(s.title)}</h1>
${s.body}${button}${after}
</td></tr>
<tr><td style="padding:18px 8px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">${esc(s.reason)}${stop}<br>Shopi · <a href="${SITE}" style="color:${C.muted};text-decoration:none">shopi.tz</a> · Driftmark Technologies Limited, Dar es Salaam</td></tr>
</table></td></tr></table></body></html>`
  const text = [
    s.title,
    '',
    ...s.text,
    ...(s.button ? ['', `${s.button.label}: ${s.button.url}`] : []),
    '',
    '--',
    s.reason,
    ...(s.stop ? [`${s.stop.label}: ${s.stop.url}`] : []),
    'Shopi · https://shopi.tz',
  ].join('\n')
  return { subject: s.subject, html, text }
}

/** The receipt slip: label and value rows in mono, a dashed rule, the total last. Only on money. */
function slip(rows: [string, string][], total: [string, string]) {
  const row = ([k, v]: [string, string], strong = false) =>
    `<tr><td style="padding:5px 0;font-family:${MONO};font-size:13px;color:${strong ? C.ink : C.muted};${strong ? 'font-weight:600;' : ''}">${esc(k)}</td><td align="right" style="padding:5px 0 5px 12px;font-family:${MONO};font-size:13px;color:${C.ink};${strong ? 'font-weight:600;' : ''}word-break:break-all">${esc(v)}</td></tr>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;background:${C.slip};border-radius:14px"><tr><td style="padding:14px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map((r) => row(r)).join('')}
<tr><td colspan="2" style="padding:6px 0 0;border-top:1px dashed ${C.line};font-size:0;line-height:0">&nbsp;</td></tr>${row(total, true)}</table>
</td></tr></table>`
}

export type AddedData = { email: string; shop: string; weekly: boolean; remove: string }
export type ReceiptData = { shop: string; amount: number; until: number; paidAt: number; phone: string; order: string; transid: string | null }
export type RenewalData = { shop: string; left: 0 | 1 | 7; until: number }
export type WeeklyData = {
  shop: string
  from: number
  to: number
  visits: number
  orders: number
  sales: number
  prev: { visits: number; orders: number; sales: number }
  top: { name: string; sold: number } | null
  toCheck: number
}
export type EmailData = { added: AddedData; receipt: ReceiptData; renewal: RenewalData; weekly: WeeklyData }

/** One email, in the seller's language. `stop` is the unsubscribe page for optional kinds (src/server/email.ts). */
export function renderEmail<K extends EmailKind>(kind: K, data: EmailData[K], lang: Lang, stop?: string): Rendered {
  const t: T = (en, vars) => translate(lang, en, vars)
  switch (kind) {
    case 'added': {
      const d = data as AddedData
      const line = d.weekly
        ? t('Shopi sends {shop}’s Tembo receipts and reminders to {email}, and a summary of your week each Monday.', { shop: '{shop}', email: '{email}' })
        : t('Shopi sends {shop}’s Tembo receipts and reminders to {email}.', { shop: '{shop}', email: '{email}' })
      // The address and shop go in after translating, escaped, so neither can carry markup into the email.
      const html = esc(line).replace('{shop}', esc(d.shop)).replace('{email}', `<b style="color:${C.ink};font-weight:500">${esc(d.email)}</b>`)
      return shell({
        lang,
        subject: t('Your email is set for {shop}', { shop: d.shop }),
        preheader: t('Not you? Remove this address with one tap.'),
        title: t('Your email is set'),
        body: p(html),
        button: { label: t('Open Shopi'), url: `${SITE}/app` },
        after: `${esc(t('Not you, or not your shop?'))} <a href="${esc(d.remove)}" style="color:${C.ink};text-decoration:underline">${esc(t('Remove this address'))}</a>`,
        reason: t('You get this email because this address was added to a shop on Shopi.'),
        text: [line.replace('{shop}', d.shop).replace('{email}', d.email), '', `${t('Not you, or not your shop?')} ${t('Remove this address')}: ${d.remove}`],
      })
    }
    case 'receipt': {
      const d = data as ReceiptData
      const rows: [string, string][] = [
        [t('Shop'), d.shop],
        [t('Plan'), t('Tembo, 1 year')],
        [t('Paid on'), emailDate(d.paidAt, lang)],
        [t('Paid from'), maskPhone(d.phone)],
        ...(d.transid ? ([[t('Reference'), d.transid]] as [string, string][]) : []),
      ]
      return shell({
        lang,
        subject: t('Receipt: Tembo for {shop}', { shop: d.shop }),
        preheader: t('{amount} received. Tembo runs until {date}.', { amount: tzs(d.amount), date: emailDate(d.until, lang) }),
        title: t('Tembo is on'),
        // The order id is too long for the slip's value column on a phone: it goes under the slip, small.
        body:
          p(esc(t('We received your payment. Tembo runs until {date}.', { date: emailDate(d.until, lang) }))) +
          slip(rows, [t('Total'), tzs(d.amount)]) +
          `<p style="margin:8px 0 0;font-family:${MONO};font-size:11px;line-height:1.5;color:${C.muted};word-break:break-all">${esc(t('Order'))} ${esc(d.order)}</p>`,
        button: { label: t('Open your plan'), url: `${SITE}/app/plan` },
        after: esc(t('Paid to Driftmark Technologies Limited, which runs Shopi. Keep this email as your receipt. It is not a TRA fiscal receipt.')),
        reason: t('You get this email because you paid for Tembo on Shopi.'),
        text: [
          t('We received your payment. Tembo runs until {date}.', { date: emailDate(d.until, lang) }),
          '',
          ...rows.map(([k, v]) => `${k}: ${v}`),
          `${t('Total')}: ${tzs(d.amount)}`,
          `${t('Order')}: ${d.order}`,
          '',
          t('Paid to Driftmark Technologies Limited, which runs Shopi. Keep this email as your receipt. It is not a TRA fiscal receipt.'),
        ],
      })
    }
    case 'renewal': {
      const d = data as RenewalData
      const title = d.left === 7 ? t('Tembo ends in 7 days') : d.left === 1 ? t('Tembo ends tomorrow') : t('Tembo ends today')
      const line = t('Your year of Tembo ends on {date}. Renew for {amount} to keep your own domain, fonts and full analytics. If you don’t, {shop} stays open on Free and nothing is deleted.', {
        date: emailDate(d.until - 1, lang),
        amount: tzs(TEMBO_PRICE),
        shop: d.shop,
      })
      return shell({
        lang,
        subject: `${title}: ${d.shop}`,
        preheader: line,
        title,
        body: p(esc(line)),
        button: { label: t('Renew Tembo'), url: `${SITE}/app/plan` },
        reason: t('You get this email because your shop has Tembo.'),
        text: [line],
      })
    }
    case 'weekly': {
      const d = data as WeeklyData
      const range = `${shortDate(d.from, lang)} – ${shortDate(d.to - 1, lang)}`
      // Rows, not columns: three figures side by side cramp on a phone (TSh 540,000 alone fills a third).
      const change = (now: number, before: number) => {
        if (!before) return now ? t('new') : '–'
        const pct = Math.round(((now - before) / before) * 100)
        return pct === 0 ? '0%' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`
      }
      const stats: [string, string, string][] = [
        [t('Visits'), d.visits.toLocaleString('en-US'), change(d.visits, d.prev.visits)],
        [t('Orders'), d.orders.toLocaleString('en-US'), change(d.orders, d.prev.orders)],
        [t('Sales'), tzs(d.sales), change(d.sales, d.prev.sales)],
      ]
      const statRow = ([k, v, c]: [string, string, string], i: number) =>
        `<tr><td style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${SANS};font-size:14px;color:${C.ink2}">${esc(k)}</td><td align="right" style="padding:10px 0 10px 12px;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${SANS};font-size:17px;font-weight:600;color:${C.ink};white-space:nowrap">${esc(v)}</td><td align="right" style="width:64px;padding:10px 0 10px 12px;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${SANS};font-size:13px;color:${C.muted};white-space:nowrap">${esc(c)}</td></tr>`
      const grid = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 16px;background:${C.slip};border-radius:14px"><tr><td style="padding:4px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stats.map(statRow).join('')}</table></td></tr></table>`
      const check = d.toCheck
        ? p(`<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${C.moto};margin-right:8px;vertical-align:1px"></span>${esc(t(d.toCheck === 1 ? '1 payment is waiting for you to check.' : '{n} payments are waiting for you to check.', { n: d.toCheck }))}`, `color:${C.ink}`)
        : ''
      const top = d.top ? p(esc(t('Best seller: {name}, {n} sold.', { name: d.top.name, n: d.top.sold }))) : ''
      return shell({
        lang,
        subject: t('{shop}: your week', { shop: d.shop }),
        preheader: `${t('Visits')} ${d.visits} · ${t('Orders')} ${d.orders} · ${tzs(d.sales)}`,
        title: t('Your week at {shop}', { shop: d.shop }),
        body: p(esc(`${range} · ${t('compared with the week before')}`), `font-size:13px;color:${C.muted};margin-bottom:10px`) + grid + check + top,
        button: { label: t('Open Shopi'), url: `${SITE}/app` },
        reason: t('You get this summary each Monday because you chose it in Shop settings.'),
        stop: stop ? { label: t('Stop the weekly summary'), url: stop } : undefined,
        text: [
          `${range} · ${t('compared with the week before')}`,
          ...stats.map(([k, v, c]) => `${k}: ${v} (${c})`),
          ...(d.toCheck ? [t(d.toCheck === 1 ? '1 payment is waiting for you to check.' : '{n} payments are waiting for you to check.', { n: d.toCheck })] : []),
          ...(d.top ? [t('Best seller: {name}, {n} sold.', { name: d.top.name, n: d.top.sold })] : []),
        ],
      })
    }
  }
  throw new Error(`[email] no template for ${kind}`)
}

/** Sample data for /admin's previews and test sends. */
export function sampleEmail(kind: EmailKind, at: number): EmailData[EmailKind] {
  const DAY = 86_400_000
  switch (kind) {
    case 'added':
      return { email: 'zee@example.com', shop: 'Zee’s Store', weekly: true, remove: `${SITE}/email/off?w=remove&example=1` }
    case 'receipt':
      return { shop: 'Zee’s Store', amount: 99000, until: at + 365 * DAY, paidAt: at, phone: '255754123456', order: 'SHOPI-1763460000000-a1b2c3d4e5', transid: '8KJ2H3L9QX' }
    case 'renewal':
      return { shop: 'Zee’s Store', left: 7, until: at + 7 * DAY }
    case 'weekly':
      return { shop: 'Zee’s Store', from: at - 7 * DAY, to: at, visits: 412, orders: 9, sales: 540000, prev: { visits: 356, orders: 11, sales: 480000 }, top: { name: 'Gauni la Jua', sold: 4 }, toCheck: 1 }
  }
}
