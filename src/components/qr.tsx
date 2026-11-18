import { useMemo } from 'react'
import { SHOPI_ORIGIN } from '#/lib/host'
import { useT } from '#/lib/i18n'
import { encodeQr } from '#/lib/qr'

/**
 * A shop's QR code (18 Nov 2026, the founder): for sellers a printable card (`QrSheet` in `qr-sheet.tsx`, from Home and Shop settings),
 * for buyers a plain code in the shop's Info sheet (`QrCode`) to open the shop on another phone. Both open
 * `shopi.tz/<shop>?s=qr`, the address that never changes, tagged so Analytics counts the scans.
 */
export const qrUrl = (slug: string) => `${SHOPI_ORIGIN}/${slug}?s=qr`

/** The code alone, as SVG: rounded dots and rounded finder squares, ink on white. Level M: small and quick to read. */
export function QrCode({ text, className = '', label }: { text: string; className?: string; label: string }) {
  const qr = useMemo(() => encodeQr(text, 'M'), [text])
  const quiet = 3
  const n = qr.size + quiet * 2
  const finders = [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ]
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} role="img" aria-label={label}>
      <rect width={n} height={n} rx={2} fill="#ffffff" />
      <g fill="#0a0a0a" transform={`translate(${quiet} ${quiet})`}>
        {qr.modules.flatMap((row, y) =>
          row.map((dark, x) => (dark && !qr.finder[y][x] ? <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.3} /> : null)),
        )}
        {finders.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width={7} height={7} rx={2} />
            <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.35} fill="#ffffff" />
            <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} />
          </g>
        ))}
      </g>
    </svg>
  )
}

/**
 * Buyers: the shop's code beside "Open this shop on another phone", in the Info sheet on phones and under the facts on
 * desktop, where scanning it is how a buyer moves from the computer to their phone. `plain`: no sand box around it.
 */
export function ShopQr({ slug, name, className = '', plain = false }: { slug: string; name: string; className?: string; plain?: boolean }) {
  const t = useT()
  return (
    <div className={`flex items-center gap-4 ${plain ? '' : 'rounded-[16px] bg-page p-4'} ${className}`}>
      <QrCode text={qrUrl(slug)} label={t('QR code for {shop}', { shop: name })} className="size-[92px] shrink-0 rounded-[10px] shadow-[inset_0_0_0_1px_rgb(10_10_10/0.08)]" />
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{t('Open this shop on another phone')}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{t('Point the phone’s camera at the code.')}</p>
        <p className="code mt-1 truncate text-[12px] text-ink-2">shopi.tz/{slug}</p>
      </div>
    </div>
  )
}
