/**
 * "Paste your Instagram, TikTok or WhatsApp link" at setup: reads a link the seller copied from their own page and gives
 * back what Shopi can fill from it. Nothing is fetched from Meta or TikTok; only TikTok's short links (vm.tiktok.com)
 * are opened on the server to see where they lead (`expandSocialLink` in api/merchant.ts).
 */
export type SocialFind =
  | { kind: 'instagram' | 'tiktok' | 'facebook'; handle: string }
  | { kind: 'whatsapp'; phone: string }
  /** A TikTok short link: the server opens it to find the profile. */
  | { kind: 'short'; url: string }
  /** A WhatsApp link that hides the number (wa.me/message/…). */
  | { kind: 'hidden' }

const NOT_PROFILES = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'tv', 'direct', 'share', 'video', 'tag', 'discover', 'login', 'watch', 'groups', 'events', 'marketplace', 'profile.php'])

/** TikTok's short-link hosts, the only ones the server will open. */
export const TIKTOK_SHORT = /^(vm|vt)\.tiktok\.com$|^(www\.)?tiktok\.com$/

export function readSocialLink(text: string): SocialFind | null {
  const raw = text.trim().match(/\S*(instagram\.com|instagr\.am|tiktok\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com)\S*/i)?.[0]
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|web)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  const first = decodeURIComponent(parts[0] ?? '')

  if (host === 'instagram.com' || host === 'instagr.am') {
    return /^[\w.]{1,30}$/.test(first) && !NOT_PROFILES.has(first.toLowerCase()) ? { kind: 'instagram', handle: first } : null
  }
  if (host.endsWith('tiktok.com')) {
    if (first.startsWith('@') && /^@[\w.]{2,24}$/.test(first)) return { kind: 'tiktok', handle: first.slice(1) }
    if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || first === 't') return { kind: 'short', url: url.href }
    return null
  }
  if (host === 'facebook.com' || host === 'fb.com') {
    return /^[\w.-]{2,80}$/.test(first) && !NOT_PROFILES.has(first.toLowerCase()) ? { kind: 'facebook', handle: first } : null
  }
  if (host === 'wa.me' || host.endsWith('whatsapp.com')) {
    // wa.me/255754123456, wa.me/c/255754123456 (a catalogue), api.whatsapp.com/send?phone=255754123456
    const digits = (url.searchParams.get('phone') ?? (first === 'c' ? parts[1] : first) ?? '').replace(/\D/g, '')
    if (digits.length >= 9) return { kind: 'whatsapp', phone: digits }
    return first === 'message' || first === 'qr' ? { kind: 'hidden' } : null
  }
  return null
}

/** "zuri.fashion_tz" -> "Zuri Fashion Tz": a first draft of the shop's name, which the seller then corrects. */
export function nameFromHandle(handle: string) {
  return handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 60)
}
