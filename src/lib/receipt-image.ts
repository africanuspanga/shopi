/**
 * Draws an order as a receipt image in the browser (no server, no library), for "Save as image" and "Share".
 * Same look as the on-screen slip: white paper, mono figures, dashed rules, a torn bottom edge.
 */
import { tzs } from '#/lib/format'

export type ReceiptData = {
  shop: string
  title: string
  code: string
  date: string
  lines: { name: string; detail: string; amount: number }[]
  rows: { label: string; value: string }[]
  total: number
  totalLabel: string
  meta: string[]
  footer: string
}

const W = 1080
const PAD = 72
const SANS = '"Mona Sans", system-ui, sans-serif'
const MONO = '"Geist Mono", ui-monospace, monospace'
const INK = '#0a0a0a'
const INK2 = '#4d4b47'
const MUTED = '#6d6a65'
const LINE = 'rgba(10,10,10,0.15)'

/** Cut a line to fit `max` pixels, ending with "…". */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

export async function drawReceipt(r: ReceiptData): Promise<Blob> {
  await document.fonts?.ready
  const H = 610 + r.lines.length * 104 + r.rows.length * 52 + r.meta.length * 44
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  // Sand around white paper with a torn bottom edge.
  ctx.fillStyle = '#f4f3f0'
  ctx.fillRect(0, 0, W, H)
  const left = 40
  const right = W - 40
  const bottom = H - 56
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(left, 40)
  ctx.lineTo(right, 40)
  ctx.lineTo(right, bottom)
  for (let x = right, up = true; x > left; x -= 16, up = !up) ctx.lineTo(Math.max(left, x - 16), bottom + (up ? 12 : 0))
  ctx.closePath()
  ctx.fill()

  const rule = (y: number) => {
    ctx.save()
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
    ctx.restore()
  }
  const pair = (y: number, l: string, v: string, lFont: string, vFont: string, lColor = INK2, vColor = INK) => {
    ctx.font = vFont
    ctx.fillStyle = vColor
    ctx.textAlign = 'right'
    ctx.fillText(v, W - PAD, y)
    const vw = ctx.measureText(v).width
    ctx.font = lFont
    ctx.fillStyle = lColor
    ctx.textAlign = 'left'
    ctx.fillText(fit(ctx, l, W - PAD * 2 - vw - 32), PAD, y)
  }

  let y = 40 + 96
  ctx.font = `600 44px ${SANS}`
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.fillText(fit(ctx, r.shop, W - PAD * 2), PAD, y)
  y += 52
  pair(y, r.title, `#${r.code}`, `500 30px ${SANS}`, `400 28px ${MONO}`, INK2, MUTED)
  y += 40
  ctx.font = `400 26px ${MONO}`
  ctx.fillStyle = MUTED
  ctx.fillText(r.date, PAD, y)
  y += 40
  rule(y)
  y += 64

  for (const l of r.lines) {
    pair(y, l.name, tzs(l.amount), `400 30px ${SANS}`, `400 28px ${MONO}`, INK, INK)
    y += 40
    ctx.font = `400 26px ${SANS}`
    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'
    ctx.fillText(fit(ctx, l.detail, W - PAD * 2), PAD, y)
    y += 64
  }
  rule(y - 24)
  y += 32
  for (const row of r.rows) {
    pair(y, row.label, row.value, `400 28px ${SANS}`, `400 26px ${MONO}`)
    y += 52
  }
  rule(y - 20)
  y += 52
  pair(y, r.totalLabel, tzs(r.total), `500 32px ${SANS}`, `500 44px ${MONO}`)
  y += 64
  ctx.textAlign = 'left'
  for (const m of r.meta) {
    ctx.font = `400 26px ${SANS}`
    ctx.fillStyle = INK2
    ctx.fillText(fit(ctx, m, W - PAD * 2), PAD, y)
    y += 44
  }
  ctx.font = `400 24px ${MONO}`
  ctx.fillStyle = MUTED
  ctx.fillText(r.footer, PAD, bottom - 40)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
}
