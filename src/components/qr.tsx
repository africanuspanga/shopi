import { Download } from 'lucide-react'
import { Suspense, lazy, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { QrShop } from '#/components/qr-sheet'
import { SHOPI_ORIGIN } from '#/lib/host'
import { useT } from '#/lib/i18n'
import { encodeQr } from '#/lib/qr'
import { Wordmark } from '#/components/ui'

/**
 * A shop's QR code (18 Nov 2026, the founder): for sellers a printable card (`QrSheet` in `qr-sheet.tsx`, from Home
 * and Shop settings); for buyers a code on the shop page (`ShopQr`) that opens the same Shopi-branded card to save or
 * share. Everything opens `shopi.tz/<shop>?s=qr`, the address that never changes, tagged so Analytics counts scans.
 * This file stays light for buyer pages: the card's drawing loads only when its sheet opens.
 */
export const qrUrl = (slug: string) => `${SHOPI_ORIGIN}/${slug}?s=qr`

const QrCardSheet = lazy(() => import('#/components/qr-sheet').then((m) => ({ default: m.QrCardSheet })))

/**
 * The code alone, as SVG: rounded dots and finder squares, ink on white. `brand` puts the shopi wordmark in the middle
 * (the founder, 18 Nov: "we are a new company, no one knows the bag icon"; level H reads with part of the code
 * covered); without it, level M keeps it small and quick to read.
 */
export function QrCode({ text, className = '', label, brand = false }: { text: string; className?: string; label: string; brand?: boolean }) {
  const qr = useMemo(() => encodeQr(text, brand ? 'H' : 'M'), [text, brand])
  const quiet = 3
  const n = qr.size + quiet * 2
  // The wordmark is wide (about 3.2 to 1), so its space is too: about 40% of the side by 5 to 7 modules, near 6% of the
  // code, well inside what level H restores.
  let hole: { x: number; y: number; w: number; h: number } | null = null
  if (brand && qr.size <= 41) {
    let w = Math.round(qr.size * 0.42)
    if (w % 2 === 0) w += 1
    let h = Math.round(w / 3.2) + 2
    if (h % 2 === 0) h += 1
    hole = { x: (qr.size - w) / 2, y: (qr.size - h) / 2, w, h }
  }
  const inHole = (x: number, y: number) => !!hole && x >= hole.x && x < hole.x + hole.w && y >= hole.y && y < hole.y + hole.h
  const finders = [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ]
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} role="img" aria-label={label} style={{ color: '#0a0a0a' }}>
      <rect width={n} height={n} rx={2} fill="#ffffff" />
      <g fill="#0a0a0a" transform={`translate(${quiet} ${quiet})`}>
        {qr.modules.flatMap((row, y) =>
          row.map((dark, x) => (dark && !qr.finder[y][x] && !inHole(x, y) ? <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.3} /> : null)),
        )}
        {finders.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width={7} height={7} rx={2} />
            <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.35} fill="#ffffff" />
            <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} />
          </g>
        ))}
        {hole && <Wordmark title="Shopi" box={{ x: hole.x + 0.6, y: hole.y + 0.6, width: hole.w - 1.2, height: hole.h - 1.2 }} className="" />}
      </g>
    </svg>
  )
}

/**
 * Buyers: the shop's code beside "Open this shop on another phone", in the Info sheet on phones and under the facts on
 * desktop (scanning it is how a buyer moves from the computer to their phone). Tapping the code or "Save or share"
 * opens the full card. `plain`: no sand box around it.
 */
export function ShopQr({ shop, className = '', plain = false }: { shop: QrShop; className?: string; plain?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className={`flex items-center gap-4 ${plain ? '' : 'rounded-[16px] bg-page p-4'} ${className}`}>
      <button type="button" className="shrink-0 rounded-[10px] transition-transform active:scale-[0.97]" onClick={() => setOpen(true)} aria-label={t('Save or share the QR code')}>
        <QrCode text={qrUrl(shop.slug)} label={t('QR code for {shop}', { shop: shop.name })} brand className="size-[96px] rounded-[10px] shadow-[inset_0_0_0_1px_rgb(10_10_10/0.08)]" />
      </button>
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{t('Open this shop on another phone')}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{t('Point the phone’s camera at the code.')}</p>
        <button type="button" className="btn btn-sm btn-ghost mt-2.5" onClick={() => setOpen(true)}>
          <Download size={15} strokeWidth={1.6} /> {t('Save or share')}
        </button>
      </div>
      {/* On the page's body: inside the Info sheet, its animated frame would otherwise hold this sheet inside it. */}
      {open &&
        createPortal(
          <Suspense fallback={null}>
            <QrCardSheet open={open} onClose={() => setOpen(false)} shop={shop} who="buyer" />
          </Suspense>,
          document.body,
        )}
    </div>
  )
}
