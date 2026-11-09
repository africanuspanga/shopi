/**
 * First-party analytics, in the buyer's browser. No third-party trackers and nothing personal: a random visitor ID
 * kept on the phone, and a visit (session) that ends after 30 quiet minutes. Each visit remembers where it came from
 * (Instagram, TikTok, WhatsApp...) and the seller's link tag (?s=bio), and every event in it carries both, so orders
 * can be credited to their source. Events go to /api/e with sendBeacon, so a tap that leaves the page still counts.
 *
 * The visitor and session model follows Minilytics (MIT, github.com/surendrapandar/minilytics).
 */

import { linkTag } from '#/lib/format'

const VISITOR_KEY = 'rizk_vid'
const SESSION_KEY = 'rizk_sess'
const SESSION_MS = 30 * 60_000

export type EventType =
  | 'view_shop'
  | 'view_product'
  | 'add_to_cart'
  | 'checkout_start'
  | 'whatsapp_click'
  | 'social_click'
  | 'share'
  | 'seller_share'

export type Visit = { vid: string; sid: string; source: string; tag: string }
type Session = { id: string; source: string; tag: string; last: number }

/** Apps that open links in an in-app browser or hand them to Chrome, by user agent or Android package. */
const APPS: [RegExp, string][] = [
  [/Instagram|com\.instagram/i, 'instagram'],
  [/musical_ly|TikTok|BytedanceWebview|com\.zhiliaoapp|com\.ss\.android/i, 'tiktok'],
  [/FBAN|FBAV|FB_IAB|com\.facebook/i, 'facebook'],
  [/WhatsApp|com\.whatsapp/i, 'whatsapp'],
  [/Snapchat|com\.snapchat/i, 'snapchat'],
  [/Telegram|org\.telegram/i, 'telegram'],
  [/Twitter|com\.twitter/i, 'x'],
  [/com\.google\.android\.gm/i, 'email'],
]

/** Websites that send visitors, by hostname. */
const SITES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'telegram'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)(mail\.google\.com|outlook\.(com|live\.com))$/, 'email'],
]

/** Where this visit came from: the app the buyer is in, else the site that linked here, else "direct". */
export function trafficSource(): string {
  if (typeof window === 'undefined') return ''
  const ua = navigator.userAgent
  for (const [re, name] of APPS) if (re.test(ua)) return name
  const ref = document.referrer
  if (!ref) return 'direct'
  if (ref.startsWith('android-app://')) {
    for (const [re, name] of APPS) if (re.test(ref)) return name
    return 'direct'
  }
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '')
    if (host === window.location.hostname) return 'direct'
    for (const [re, name] of SITES) if (re.test(host)) return name
    return host.slice(0, 40)
  } catch {
    return 'direct'
  }
}

const tagOf = (raw: string | null) => linkTag(raw ?? '')

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or storage blocked: this page view still counts */
  }
}

/** The visitor and the current visit. A new visit starts after 30 quiet minutes, or when a tagged link is opened. */
export function visit(): Visit {
  const vid = read<string>(VISITOR_KEY) ?? uid()
  write(VISITOR_KEY, vid)
  const tag = tagOf(new URLSearchParams(window.location.search).get('s'))
  const now = Date.now()
  let s = read<Session>(SESSION_KEY)
  if (!s || now - s.last > SESSION_MS || (tag && tag !== s.tag)) s = { id: uid(), source: trafficSource(), tag, last: now }
  s.last = now
  write(SESSION_KEY, s)
  return { vid, sid: s.id, source: s.source, tag: s.tag }
}

/** Shops whose owner is the one browsing: their own visits are never counted. */
const ownShops = new Set<string>()
export function ignoreShop(shopId: string) {
  ownShops.add(shopId)
}

/** The same event twice within a moment is one event (a re-render, or React running effects twice in development). */
const recent = new Map<string, number>()
const REPEAT_MS = 1500

/** Record something a buyer did. Fire and forget: it never blocks or breaks the page. */
export function track(type: EventType, data: { shopId: string; productId?: string; detail?: string }) {
  if (typeof window === 'undefined' || ownShops.has(data.shopId)) return
  const key = `${type}|${data.shopId}|${data.productId ?? ''}|${data.detail ?? ''}`
  const t = Date.now()
  if (t - (recent.get(key) ?? 0) < REPEAT_MS) return
  recent.set(key, t)
  try {
    const body = JSON.stringify({ ...data, type, ...visit() })
    const sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }))
    if (!sent) fetch('/api/e', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
  } catch {
    /* analytics must never break shopping */
  }
}
