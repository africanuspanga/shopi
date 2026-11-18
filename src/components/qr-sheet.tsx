import { Check, Download, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { qrUrl } from '#/components/qr'
import { Sheet, Wordmark } from '#/components/ui'
import { getMyQrCard } from '#/lib/api/merchant'
import { track } from '#/lib/analytics'
import { imgUrl } from '#/lib/format'
import { SHOPI_ORIGIN } from '#/lib/host'
import { asLang, translate, useT } from '#/lib/i18n'
import { CARD_H, CARD_W, cardBlob, drawQrCard, wordmarkImage } from '#/lib/qr-card'

/**
 * A shop's QR card (src/lib/qr-card.ts) in a sheet, with Download and Share: for the seller (from Home and Shop
 * settings) and for buyers (from the code on the shop page, the founder's ask on 18 Nov: "sharable, downloadable and
 * Shopi branded"). Buyer pages load this file only when the sheet opens; `components/qr.tsx` is the light part.
 */

export type QrShop = { id: string; name: string; slug: string; logo_key: string | null; theme_color: string | null; theme_font: string | null; location: string; lang: string }

type Card = { blob: Blob; url: string; file: string }

/** The card for `shop`, drawn once per opening. `who` decides the words and which event a share counts as. */
export function QrCardSheet({ open, onClose, shop, who }: { open: boolean; onClose: () => void; shop: QrShop | null; who: 'seller' | 'buyer' }) {
  const t = useT()
  const mark = useRef<HTMLSpanElement>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [canShareFile, setCanShareFile] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = shop ? `${SHOPI_ORIGIN}/${shop.slug}` : ''

  useEffect(() => {
    if (!open || !shop || card) return
    let live = true
    ;(async () => {
      try {
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
        setCard({ blob, url: URL.createObjectURL(blob), file })
        setCanShareFile(!!navigator.canShare?.({ files: [new File([blob], file, { type: 'image/png' })] }))
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
    }
  }, [open, shop, card])

  // The image's address lives until the sheet's owner goes away.
  useEffect(
    () => () => {
      if (card) URL.revokeObjectURL(card.url)
    },
    [card],
  )

  const count = (how: string) => {
    if (!shop) return
    if (who === 'seller') track('seller_share', { shopId: shop.id, detail: `qr-${how}` })
    else track('share', { shopId: shop.id, detail: `qr-${how}` })
  }

  // The picture where the phone can share files (WhatsApp, Instagram); the link where it can't; else copy the link.
  const share = async () => {
    if (!card || !shop) return
    try {
      if (canShareFile) {
        await navigator.share({ files: [new File([card.blob], card.file, { type: 'image/png' })], title: shop.name, text: `${shop.name}: ${link}` })
        return count('native')
      }
      if (navigator.share) {
        await navigator.share({ title: shop.name, url: link })
        return count('link')
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      count('copy')
    } catch {
      /* closed without sharing */
    }
  }

  const name = shop?.name ?? ''
  return (
    <Sheet open={open} onClose={onClose} title={who === 'seller' ? t('Your shop’s QR code') : t('QR code for {shop}', { shop: name })}>
      <span ref={mark} className="hidden" aria-hidden>
        <Wordmark />
      </span>
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[20px] bg-well shadow-[inset_0_0_0_1px_rgb(10_10_10/0.08)]" style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}>
        {card ? (
          <img src={card.url} alt={t('QR code for {shop}', { shop: name })} className="fade h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] text-muted">{failed ? t('The QR code could not be made. Try again.') : t('Making the QR code')}</div>
        )}
      </div>
      <p className="mx-auto mt-4 max-w-[44ch] text-center text-[14px] leading-relaxed text-ink-2">
        {who === 'seller'
          ? t('Print it for your packaging, your stall or your receipts, or post it. Buyers scan it with their phone camera and your shop opens.')
          : t('Save it or send it to a friend. Scanning it with a phone camera opens {shop}.', { shop: name })}
      </p>
      <div className="mt-5 flex gap-2">
        <a
          href={card?.url}
          download={card?.file}
          aria-disabled={!card}
          className={`btn flex-1 ${card ? '' : 'pointer-events-none opacity-50'}`}
          onClick={() => card && count('download')}
        >
          <Download size={16} strokeWidth={1.6} /> {t('Download')}
        </a>
        <button type="button" className="btn btn-ghost flex-1" onClick={share} disabled={!card}>
          {copied ? <Check size={16} strokeWidth={2} /> : <Share2 size={16} strokeWidth={1.6} />} {copied ? t('Link copied') : t('Share')}
        </button>
      </div>
      {who === 'seller' && <p className="mt-3 text-center text-[13px] text-muted">{t('Scans show in Analytics as the link tag “qr”.')}</p>}
    </Sheet>
  )
}

/** The seller's card: the shop is read from the server when the sheet first opens. */
export function QrSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [shop, setShop] = useState<QrShop | null>(null)
  useEffect(() => {
    if (!open || shop) return
    getMyQrCard()
      .then(setShop)
      .catch(() => {})
  }, [open, shop])
  return <QrCardSheet open={open} onClose={onClose} shop={shop} who="seller" />
}
