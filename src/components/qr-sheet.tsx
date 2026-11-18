import { Download, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { qrUrl } from '#/components/qr'
import { Sheet, Wordmark } from '#/components/ui'
import { getMyQrCard } from '#/lib/api/merchant'
import { track } from '#/lib/analytics'
import { imgUrl } from '#/lib/format'
import { asLang, translate, useT } from '#/lib/i18n'
import { CARD_H, CARD_W, cardBlob, drawQrCard, wordmarkImage } from '#/lib/qr-card'

/** The seller's printable QR card (src/lib/qr-card.ts), from Home and Shop settings. Buyers' side: `components/qr.tsx`. */

type Card = { blob: Blob; url: string; file: string; shopId: string; name: string }

/** The seller's QR card: drawn in the browser, shown, then downloaded or shared as a PNG. */
export function QrSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const mark = useRef<HTMLSpanElement>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    if (!open || card) return
    let live = true
    ;(async () => {
      try {
        const shop = await getMyQrCard()
        const canvas = await drawQrCard({
          url: qrUrl(shop.slug),
          link: `shopi.tz/${shop.slug}`,
          name: shop.name,
          place: shop.location,
          logo: shop.logo_key ? imgUrl(shop.logo_key) : null,
          color: shop.theme_color,
          font: shop.theme_font,
          // The card is for the shop's buyers, so it speaks the shop's language.
          scan: translate(asLang(shop.lang), 'Scan to shop'),
          wordmark: await wordmarkImage(mark.current?.querySelector('svg') ?? null),
        })
        const blob = await cardBlob(canvas)
        if (!blob || !live) return
        const file = `shopi-${shop.slug}-qr.png`
        setCard({ blob, url: URL.createObjectURL(blob), file, shopId: shop.id, name: shop.name })
        setCanShare(!!navigator.canShare?.({ files: [new File([blob], file, { type: 'image/png' })] }))
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [open, card])

  // The image's address lives until the sheet's owner goes away.
  useEffect(
    () => () => {
      if (card) URL.revokeObjectURL(card.url)
    },
    [card],
  )

  const share = async () => {
    if (!card) return
    try {
      await navigator.share({ files: [new File([card.blob], card.file, { type: 'image/png' })], title: card.name })
      track('seller_share', { shopId: card.shopId, detail: 'qr-native' })
    } catch {
      /* closed without sharing */
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Your shop’s QR code')}>
      <span ref={mark} className="hidden" aria-hidden>
        <Wordmark />
      </span>
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[20px] bg-well shadow-[inset_0_0_0_1px_rgb(10_10_10/0.08)]" style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}>
        {card ? (
          <img src={card.url} alt={t('QR code for {shop}', { shop: card.name })} className="fade h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] text-muted">{failed ? t('The QR code could not be made. Try again.') : t('Making your QR code')}</div>
        )}
      </div>
      <p className="mx-auto mt-4 max-w-[44ch] text-center text-[14px] leading-relaxed text-ink-2">
        {t('Print it for your packaging, your stall or your receipts, or post it. Buyers scan it with their phone camera and your shop opens.')}
      </p>
      <div className="mt-5 flex gap-2">
        <a
          href={card?.url}
          download={card?.file}
          aria-disabled={!card}
          className={`btn flex-1 ${card ? '' : 'pointer-events-none opacity-50'}`}
          onClick={() => card && track('seller_share', { shopId: card.shopId, detail: 'qr-download' })}
        >
          <Download size={16} strokeWidth={1.6} /> {t('Download')}
        </a>
        {canShare && (
          <button type="button" className="btn btn-ghost flex-1" onClick={share}>
            <Share2 size={16} strokeWidth={1.6} /> {t('Share')}
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-[13px] text-muted">{t('Scans show in Analytics as the link tag “qr”.')}</p>
    </Sheet>
  )
}
