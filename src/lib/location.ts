/**
 * Where the buyer wants delivery, as a map pin (checkout v2). A pin comes from the phone's GPS or from a location link the
 * buyer pastes (Google Maps, WhatsApp, Apple Maps, OpenStreetMap, or plain coordinates). Google's short links
 * (maps.app.goo.gl) hide the place, so the server opens them (`expandMapLink` in api/store.ts) to read where they lead.
 * Nothing here needs a Google key: the seller opens the pin with a plain Google Maps link.
 */
export type Pin = { lat: number; lng: number; /** How close, in metres, when it came from GPS. */ m?: number | null }

export type MapLinkFind = { kind: 'pin'; lat: number; lng: number } | { kind: 'short'; url: string }

/** Google's short-link hosts, the only ones the server opens. */
export const MAPS_SHORT = /^(maps\.app\.goo\.gl|goo\.gl)$/
/** Where a short link may lead while the server follows it. */
export const MAPS_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.[a-z.]+|consent\.google\.[a-z.]+)$/

// Real coordinates in links always have decimals; "Plot 12, 34 Ali Hassan Road" must not become a pin.
const PAIR = /(?<![\d.])(-?\d{1,2}\.\d+)\s*,\s*\+?\s*(-?\d{1,3}\.\d+)/

/** A pin from two numbers, or null when they aren't a place on Earth (0,0 is what broken links give). */
export function asPin(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat)
  const b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 }
}

function pair(text: string | null | undefined) {
  const m = text ? PAIR.exec(text) : null
  return m ? asPin(m[1], m[2]) : null
}

/** Reads a pasted location: a link from a maps app, `geo:` or plain coordinates ("-6.7712, 39.2345"). */
export function readMapLink(text: string): MapLinkFind | null {
  const raw = text.trim()
  if (!raw) return null
  const geo = /^geo:\s*([^?;]+)/i.exec(raw)
  if (geo) return found(pair(geo[1]))
  const link = raw.match(/\S*(goo\.gl|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.apple\.com|openstreetmap\.org)\S*/i)?.[0]
  if (!link) {
    // Plain coordinates, only when that is all the text is.
    return /^[-+]?\d{1,2}\.\d{3,}\s*,?\s+[-+]?\d{1,3}\.\d{3,}$|^[-+]?\d{1,2}\.\d{3,},[-+]?\d{1,3}\.\d{3,}$/.test(raw)
      ? found(asPin(...(raw.replace(/\+/g, '').split(/[\s,]+/) as [string, string])))
      : null
  }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (MAPS_SHORT.test(host) && (host !== 'goo.gl' || url.pathname.startsWith('/maps'))) return { kind: 'short', url: url.href }
  return found(pinFromUrl(url))
}

const found = (p: { lat: number; lng: number } | null): MapLinkFind | null => (p ? { kind: 'pin', ...p } : null)

/** The place a maps URL points at. The place's own marker wins over the map's centre (`@lat,lng`). */
export function pinFromUrl(url: URL): { lat: number; lng: number } | null {
  const href = safeDecode(url.href)
  const marker = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(href)
  if (marker) return asPin(marker[1], marker[2])
  for (const key of ['q', 'query', 'll', 'sll', 'daddr', 'destination', 'center']) {
    const p = pair(url.searchParams.get(key))
    if (p) return p
  }
  const osm = asPin(url.searchParams.get('mlat'), url.searchParams.get('mlon'))
  if (osm) return osm
  // /maps/search/-6.77,+39.23 and /maps/place/-6.77,39.23 (a dropped pin)
  const path = /\/maps\/(?:search|place|dir)\/([^/@]+)/.exec(safeDecode(url.pathname))
  const inPath = path ? pair(path[1]) : null
  if (inPath) return inPath
  const hash = /map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/.exec(url.hash)
  if (hash) return asPin(hash[1], hash[2])
  const centre = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(href)
  if (centre) return asPin(centre[1], centre[2])
  // Google's consent page carries the real address in `continue`.
  const next = url.searchParams.get('continue')
  if (next) {
    try {
      return pinFromUrl(new URL(next))
    } catch {
      return null
    }
  }
  return null
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

/** Opens the pin in Google Maps (the app on a phone). Google's documented Maps URL; no key. */
export const pinLink = (p: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`

/** Above this, a GPS fix is rough (a laptop, or a phone indoors): the rider needs words too. */
export const ROUGH_M = 300

/** "12 m", "1.2 km". */
export function distance(m: number) {
  if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}
