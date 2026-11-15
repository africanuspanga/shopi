import type { CSSProperties } from 'react'
import { msg } from '#/lib/i18n'

/**
 * A shop's look (A9): its colour, the style of its name and headings, and a cover photo.
 *
 * The colour replaces Moto on that shop's buyer pages: the bag count, sale tags, "Only 2 left", the active tab in the
 * capsule. It goes through the same tokens (--color-moto and friends, set on a wrapper), so components need no
 * changes. The main buy buttons (`.btn-shop`) take it too, but only when white text on it passes the readability
 * check; otherwise they stay ink. Everything else stays black and white. Shopi's own logo dot stays Moto.
 */

export const MOTO = '#ff4f17'
const INK = '#0a0a0a'
const WHITE = '#ffffff'
/** The sand page: the strictest light background coloured text sits on (checkout). */
const PAGE = '#f4f3f0'

/** The 12 tested colours. Each one works with these rules; the first is Shopi's own. */
export const COLORS: { hex: string; name: string }[] = [
  { hex: MOTO, name: msg('Shopi orange') },
  { hex: '#d7263d', name: msg('Red') },
  { hex: '#e0457b', name: msg('Rose') },
  { hex: '#a4167c', name: msg('Berry') },
  { hex: '#6a3fd0', name: msg('Purple') },
  { hex: '#23408e', name: msg('Navy') },
  { hex: '#1f76d6', name: msg('Blue') },
  { hex: '#0b8379', name: msg('Teal') },
  { hex: '#2f7d32', name: msg('Green') },
  { hex: '#c9971c', name: msg('Gold') },
  { hex: '#7b4a2d', name: msg('Coffee') },
  { hex: INK, name: msg('Black') },
]

export type FontId = 'clean' | 'elegant' | 'bold' | 'friendly' | 'modern' | 'handmade'

/** The 6 styles for the shop's name and headings. Prices, details, checkout and receipts always stay in Mona Sans. */
export const FONTS: { id: FontId; name: string; feel: string; file: string | null }[] = [
  { id: 'clean', name: msg('Clean'), feel: msg('Shopi’s own. Works for anything'), file: null },
  { id: 'elegant', name: msg('Elegant'), feel: msg('Like a fashion magazine'), file: '/fonts/shop-elegant.v1.woff2' },
  { id: 'bold', name: msg('Bold'), feel: msg('Tall, loud letters'), file: '/fonts/shop-bold.v1.woff2' },
  { id: 'friendly', name: msg('Friendly'), feel: msg('Soft and rounded'), file: '/fonts/shop-friendly.v1.woff2' },
  { id: 'modern', name: msg('Modern'), feel: msg('Sharp and techy'), file: '/fonts/shop-modern.v1.woff2' },
  { id: 'handmade', name: msg('Handmade'), feel: msg('Like handwriting'), file: '/fonts/shop-handmade.v1.woff2' },
]

export const asFont = (v: unknown): FontId => (FONTS.some((f) => f.id === v) ? (v as FontId) : 'clean')
/** The `data-font` value for a page: none for the clean style, which is the app's own type. */
export const fontAttr = (v: unknown) => (asFont(v) === 'clean' ? undefined : asFont(v))
/** '#AbC123' or 'abc123' -> '#abc123'; null when it isn't a colour. */
export function cleanHex(v: unknown): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v ?? '').trim())
  return m ? `#${m[1].toLowerCase()}` : null
}

/* ---------- Colour maths: WCAG contrast, and OKLab to change lightness without changing the hue ---------- */

type RGB = [number, number, number]
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast ratio, 1 to 21. 4.5 is the bar for text. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

type Lab = [number, number, number]
function toLab(hex: string): Lab {
  const [r, g, b] = toRgb(hex).map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function fromLab([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return toHex([
    gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ])
}

/** The colour made darker (or lighter) in steps, same hue, until it reaches `ratio` against `bg`. */
function shiftUntil(hex: string, bg: string, ratio: number, dir: -1 | 1) {
  const [L, a, b] = toLab(hex)
  for (let step = 0; step <= 100; step++) {
    const next = fromLab([Math.min(1, Math.max(0, L + dir * step * 0.01)), a, b])
    if (contrast(next, bg) >= ratio) return next
  }
  return dir < 0 ? INK : WHITE
}

/** What a colour becomes on a shop, and what the seller is told about it. */
export function shopColors(hex: string) {
  const base = cleanHex(hex) ?? MOTO
  return {
    /** Fills: the bag count, sale tags. */
    fill: base,
    /** Text on those fills: ink or white, whichever reads better. */
    onFill: contrast(base, INK) >= contrast(base, WHITE) ? INK : WHITE,
    /** The colour as text on white and sand ("Only 2 left"), darkened when it is too light to read. */
    text: contrast(base, PAGE) >= 4.5 ? base : shiftUntil(base, PAGE, 4.5, -1),
    /** On the black capsule (the active tab, the bag count): lightened when it would vanish into black. */
    lit: contrast(base, INK) >= 3 ? base : toLab(base)[1] ** 2 + toLab(base)[2] ** 2 < 0.0009 ? WHITE : shiftUntil(base, INK, 3, 1),
    /** A pale wash for backgrounds. */
    soft: fromLab(toLab(base).map((v, i) => (i === 0 ? 0.97 : v * 0.12)) as Lab),
    /** The main buy buttons take the colour only when white text on it is readable. */
    button: contrast(base, WHITE) >= 4.5 ? base : INK,
  }
}

/** The CSS variables for a shop's buyer pages; nothing for Shopi's own orange. */
export function themeStyle(hex: string | null | undefined): CSSProperties | undefined {
  const base = cleanHex(hex)
  if (!base || base === MOTO) return undefined
  const c = shopColors(base)
  return {
    '--color-moto': c.fill,
    '--color-on-moto': c.onFill,
    '--color-moto-ink': c.text,
    '--color-moto-lit': c.lit,
    '--color-on-moto-lit': contrast(c.lit, INK) >= contrast(c.lit, WHITE) ? INK : WHITE,
    '--color-moto-soft': c.soft,
    '--shop-button': c.button,
  } as CSSProperties
}

/** The font file a shop's pages should start loading early, when it has one. */
export const fontFile = (font: unknown) => FONTS.find((f) => f.id === asFont(font))?.file ?? null
export const fontPreload = (font: unknown) => {
  const href = fontFile(font)
  return href ? [{ rel: 'preload', href, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' as const }] : []
}

/* ---------- Colours from the seller's logo (browser only) ---------- */

/**
 * Up to 3 colours a logo is made of, strongest first. Leaves out see-through pixels, near-white, near-black and greys,
 * so a black-and-white logo gives none. Pixels are grouped by hue; each group's colour is the average of its most
 * vivid pixels, because the soft edge where a colour meets black or white would otherwise muddy it.
 */
export async function logoColors(src: string): Promise<string[]> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const groups = new Map<number, { weight: number; px: [number, number, number, number][] }>()
  let counted = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const [L, a, b] = toLab(toHex([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]))
    const chroma = Math.hypot(a, b)
    if (L > 0.94 || L < 0.2 || chroma < 0.05) continue
    counted++
    const hue = Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) / 20) % 18
    const g = groups.get(hue) ?? { weight: 0, px: [] }
    g.weight += chroma
    g.px.push([L, a, b, chroma])
    groups.set(hue, g)
  }
  const picked: { hex: string; hue: number }[] = []
  for (const [hue, g] of [...groups].sort((x, y) => y[1].weight - x[1].weight)) {
    // A colour has to be a real part of the logo, not a few edge pixels.
    if (g.px.length < Math.max(12, counted * 0.06)) continue
    if (picked.some((p) => Math.min(Math.abs(p.hue - hue), 18 - Math.abs(p.hue - hue)) < 2)) continue
    const top = Math.max(...g.px.map((p) => p[3]))
    const vivid = g.px.filter((p) => p[3] >= top * 0.8)
    const mean = (i: number) => vivid.reduce((sum, p) => sum + p[i], 0) / vivid.length
    picked.push({ hue, hex: fromLab([mean(0), mean(1), mean(2)]) })
    if (picked.length === 3) break
  }
  return picked.map((p) => p.hex)
}
