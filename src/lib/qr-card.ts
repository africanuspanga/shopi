/**
 * A shop's QR card, drawn in the browser (no server, no library), to print on packaging, a stall or a receipt, or to
 * post. 1200 x 1880 px, about A6. Top: the shop in its own colour, with its logo and its name in its own font (Shop
 * look). Middle: the code on a white card, the shop's logo in its centre. Under it: "Scan to shop" in the shop's
 * language and the link. At the foot: the Shopi wordmark.
 *
 * The code opens `shopi.tz/<shop>?s=qr`: the address that never changes (an own domain can lapse; a printed sticker
 * can't be updated), tagged so Analytics counts the scans. Level H keeps it readable with the logo on top; a long link
 * that would need version 7 or more (an alignment square in the middle) drops the logo and uses level Q instead.
 */
import { encodeQr, type Qr } from '#/lib/qr'
import { asFont, cleanHex, shopColors, type FontId } from '#/lib/theme'

export type QrCardInput = {
  /** What the code opens. */
  url: string
  /** The link written under the code, e.g. shopi.tz/zees-store. */
  link: string
  name: string
  /** A quiet line under the name (the shop's location); may be empty. */
  place: string
  /** A same-origin image URL for the logo, or null for initials. */
  logo: string | null
  color: string | null
  font: string | null
  /** "Scan to shop", already in the shop's language. */
  scan: string
  /** The Shopi wordmark as an image (an SVG drawn from the page's own Wordmark). */
  wordmark: HTMLImageElement | null
}

export const CARD_W = 1200
export const CARD_H = 1880

const INK = '#0a0a0a'
const INK2 = '#4d4b47'
const MONO = '"Geist Mono", ui-monospace, monospace'
const SANS = '"Mona Sans", system-ui, sans-serif'

/** How each Shop look style sets a name (the same spacing as `.display` in styles.css). */
const NAME_TYPE: Record<FontId, { family: string; weight: number; track: number; stretch?: CanvasFontStretch }> = {
  clean: { family: SANS, weight: 600, track: -0.045, stretch: 'semi-expanded' },
  elegant: { family: '"Shop Elegant", serif', weight: 600, track: -0.015 },
  bold: { family: '"Shop Bold", sans-serif', weight: 400, track: 0.005 },
  friendly: { family: '"Shop Friendly", sans-serif', weight: 600, track: -0.01 },
  modern: { family: '"Shop Modern", sans-serif', weight: 600, track: -0.035 },
  handmade: { family: '"Shop Handmade", cursive', weight: 600, track: 0 },
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'S'
  )
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}

/** Words into at most `max` lines of `width`, the last one cut with "…". */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length <= max) return { lines, fits: lines.every((l) => ctx.measureText(l).width <= width) }
  const kept = lines.slice(0, max)
  let last = `${kept[max - 1]} ${lines.slice(max).join(' ')}`
  while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  kept[max - 1] = `${last.trimEnd()}…`
  return { lines: kept, fits: false }
}

/** The code: rounded dots for data, rounded squares for the three finder patterns. `eye` colours their centres. */
function drawCode(ctx: CanvasRenderingContext2D, qr: Qr, x0: number, y0: number, m: number, eye: string, hole: { x: number; y: number; w: number } | null) {
  ctx.fillStyle = INK
  const inHole = (x: number, y: number) => hole && x >= hole.x && x < hole.x + hole.w && y >= hole.y && y < hole.y + hole.w
  const gap = m * 0.06
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x] || qr.finder[y][x] || inHole(x, y)) continue
      roundRect(ctx, x0 + x * m + gap, y0 + y * m + gap, m - gap * 2, m - gap * 2, m * 0.32)
      ctx.fill()
    }
  }
  for (const [fx, fy] of [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ]) {
    const x = x0 + fx * m
    const y = y0 + fy * m
    ctx.fillStyle = INK
    roundRect(ctx, x, y, 7 * m, 7 * m, 2 * m)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x + m, y + m, 5 * m, 5 * m, 1.35 * m)
    ctx.fill()
    ctx.fillStyle = eye
    roundRect(ctx, x + 2 * m, y + 2 * m, 3 * m, 3 * m, 0.9 * m)
    ctx.fill()
  }
}

/** The logo (or initials) in a circle of radius `r` at (cx, cy). */
function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, initials: string, cx: number, cy: number, r: number, fill: string, text: string) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  if (logo) {
    ctx.clip()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    // Cover: the shorter side fills the circle.
    const s = Math.max((r * 2) / logo.width, (r * 2) / logo.height)
    ctx.drawImage(logo, cx - (logo.width * s) / 2, cy - (logo.height * s) / 2, logo.width * s, logo.height * s)
  } else {
    ctx.fillStyle = fill
    ctx.fill()
    ctx.fillStyle = text
    ctx.font = `600 ${Math.round(r * 0.78)}px ${SANS}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, cx, cy + r * 0.04)
  }
  ctx.restore()
}

export async function drawQrCard(d: QrCardInput): Promise<HTMLCanvasElement> {
  const font = asFont(d.font)
  const type = NAME_TYPE[font]
  await Promise.all([
    document.fonts.load(`${type.weight} 80px ${type.family}`),
    document.fonts.load(`600 60px ${SANS}`),
    document.fonts.load(`400 38px ${MONO}`),
  ]).catch(() => {})
  await document.fonts.ready
  const logo = d.logo ? await loadImage(d.logo) : null

  const color = cleanHex(d.color)
  const c = color ? shopColors(color) : null
  // A shop with its own colour wears it; Shopi's default is the black of its own cards.
  const band = c ? c.fill : INK
  const onBand = c ? c.onFill : '#ffffff'
  const eye = c ? c.text : INK

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = band
  ctx.fillRect(0, 0, CARD_W, 900)

  // The shop: logo, name in its own font, place, centred together in the coloured top above the card.
  const initials = initialsOf(d.name)
  ctx.fillStyle = onBand
  ctx.textAlign = 'center'
  let size = 96
  let lines: string[] = [d.name]
  for (; size >= 56; size -= 4) {
    ctx.font = `${type.weight} ${size}px ${type.family}`
    if (type.stretch) ctx.fontStretch = type.stretch
    ctx.letterSpacing = `${(type.track * size).toFixed(1)}px`
    const w = wrap(ctx, d.name, 1040, 2)
    lines = w.lines
    if (w.fits) break
  }
  const lead = size * 1.02
  const LOGO = 200
  const nameH = size * 0.78 + (lines.length - 1) * lead
  const placeH = d.place ? 62 : 0
  const blockH = LOGO + 56 + nameH + placeH
  const top = Math.max(40, (610 - blockH) / 2)
  const logoY = top + LOGO / 2
  const nameY = top + LOGO + 56 + size * 0.78

  ctx.save()
  ctx.beginPath()
  ctx.arc(CARD_W / 2, logoY, 100, 0, Math.PI * 2)
  ctx.fillStyle = onBand === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(10,10,10,0.12)'
  ctx.fill()
  ctx.restore()
  drawLogo(ctx, logo, initials, CARD_W / 2, logoY, 88, onBand, band)

  ctx.fillStyle = onBand
  ctx.textAlign = 'center'
  ctx.font = `${type.weight} ${size}px ${type.family}`
  if (type.stretch) ctx.fontStretch = type.stretch
  ctx.letterSpacing = `${(type.track * size).toFixed(1)}px`
  lines.forEach((l, i) => ctx.fillText(l, CARD_W / 2, nameY + i * lead))
  ctx.letterSpacing = '0px'
  ctx.fontStretch = 'normal'
  if (d.place) {
    ctx.globalAlpha = 0.72
    ctx.font = `400 36px ${SANS}`
    const place = wrap(ctx, d.place, 900, 1).lines[0]
    ctx.fillText(place, CARD_W / 2, nameY + (lines.length - 1) * lead + placeH)
    ctx.globalAlpha = 1
  }

  // The white card with the code.
  const card = { x: 150, y: 640, w: 900 }
  ctx.save()
  ctx.shadowColor = 'rgba(10,10,10,0.14)'
  ctx.shadowBlur = 48
  ctx.shadowOffsetY = 16
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, card.x, card.y, card.w, card.w, 64)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(10,10,10,0.08)'
  ctx.lineWidth = 3
  roundRect(ctx, card.x, card.y, card.w, card.w, 64)
  ctx.stroke()

  let qr = encodeQr(d.url, 'H')
  const withLogo = qr.size <= 41
  if (!withLogo) qr = encodeQr(d.url, 'Q')
  // A quiet margin of four modules inside the card.
  const m = card.w / (qr.size + 8)
  const x0 = card.x + (card.w - qr.size * m) / 2
  const y0 = card.y + (card.w - qr.size * m) / 2
  // The logo's place in the middle: an odd number of modules, about a fifth of the side.
  let hole: { x: number; y: number; w: number } | null = null
  if (withLogo) {
    let w = Math.round(qr.size * 0.22)
    if (w % 2 === 0) w += 1
    const start = Math.floor((qr.size - w) / 2)
    hole = { x: start, y: start, w }
  }
  drawCode(ctx, qr, x0, y0, m, eye, hole)
  if (hole) {
    const cx = x0 + (hole.x + hole.w / 2) * m
    const cy = y0 + (hole.y + hole.w / 2) * m
    const r = (hole.w * m) / 2 - m * 0.45
    drawLogo(ctx, logo, initials, cx, cy, r, c ? c.fill : INK, c ? c.onFill : '#ffffff')
  }

  // Scan to shop, the link, and Shopi.
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.font = `600 62px ${SANS}`
  ctx.fontStretch = 'semi-expanded'
  ctx.letterSpacing = '-1.8px'
  ctx.fillText(d.scan, CARD_W / 2, 1652)
  ctx.fontStretch = 'normal'
  ctx.letterSpacing = '0px'
  ctx.fillStyle = INK2
  ctx.font = `400 38px ${MONO}`
  ctx.fillText(wrap(ctx, d.link, 1040, 1).lines[0], CARD_W / 2, 1714)

  if (d.wordmark) {
    const h = 54
    const w = (h * 405.76) / 127.78
    ctx.drawImage(d.wordmark, CARD_W / 2 - w / 2, 1770, w, h)
  }
  return canvas
}

/** The Wordmark's SVG (already on the page) as an image a canvas can draw, letters in ink. */
export function wordmarkImage(svg: SVGSVGElement | null) {
  if (!svg) return Promise.resolve(null)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '1218')
  clone.setAttribute('height', '384')
  clone.setAttribute('fill', INK)
  clone.removeAttribute('class')
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`
  return loadImage(src)
}

export const cardBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
