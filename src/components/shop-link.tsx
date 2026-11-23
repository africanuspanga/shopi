import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { QrCode, qrUrl } from '#/components/qr'
import { ErrorText, Field, Sheet, ShopAvatar } from '#/components/ui'
import { changeShopLink, checkShopLink } from '#/lib/api/merchant'
import { slugify } from '#/lib/format'
import { useT } from '#/lib/i18n'

/**
 * Shop settings, "Change your shop link" (the founder, 23 Nov 2026): the owner types a new link, sees at once whether
 * it is free, and saves. The old link is kept and sends buyers on to the new one (`shop_links`, the `$shop` route), so
 * a link in a bio, an old message or a printed QR code still opens the shop.
 */
export function ChangeLinkSheet({ open, onClose, slug, onChanged }: { open: boolean; onClose: () => void; slug: string; onChanged: (slug: string) => void }) {
  const t = useT()
  const [next, setNext] = useState(slug)
  const [state, setState] = useState<'same' | 'free' | 'short' | 'taken' | null>('same')
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Each time it opens it starts from the link of today.
  useEffect(() => {
    if (!open) return
    setNext(slug)
    setState('same')
    setError('')
  }, [open, slug])

  useEffect(() => {
    if (!open) return
    if (next === slug) return setState('same')
    if (next.length < 3) return setState('short')
    setChecking(true)
    let live = true
    const id = setTimeout(async () => {
      try {
        const res = await checkShopLink({ data: { slug: next } })
        if (live) setState(res.state)
      } catch {
        if (live) setState(null)
      }
      if (live) setChecking(false)
    }, 350)
    return () => {
      live = false
      clearTimeout(id)
      setChecking(false)
    }
  }, [next, slug, open])

  const status =
    state === 'same' ? (
      <span className="text-muted">{t('This is your link today.')}</span>
    ) : state === 'short' ? (
      <span className="text-muted">{t('At least 3 letters or numbers')}</span>
    ) : checking ? (
      <span className="flex items-center gap-1.5 text-muted">
        <Loader2 size={14} className="animate-spin" /> {t('Checking')}
      </span>
    ) : state === 'free' ? (
      <span className="flex items-center gap-1.5 text-ok">
        <Check size={14} strokeWidth={2.25} /> {t('Available')}
      </span>
    ) : state === 'taken' ? (
      <span className="flex items-center gap-1.5 text-bad">
        <X size={14} strokeWidth={2.25} /> {t('Taken. Try another')}
      </span>
    ) : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || checking || state !== 'free') return
    setBusy(true)
    setError('')
    try {
      const res = await changeShopLink({ data: { slug: next } })
      if ('error' in res) {
        setError(
          res.error === 'many'
            ? t('This shop has changed its link several times. Write to hello@shopi.tz and we will change it for you.')
            : res.error === 'limit'
              ? t('You changed your link a few times today. Try again tomorrow.')
              : res.error === 'short'
                ? t('At least 3 letters or numbers')
                : t('That link is taken. Try another.'),
        )
        if (res.error === 'taken') setState('taken')
      } else {
        onChanged(res.slug)
      }
    } catch {
      setError(t('Something went wrong. Try again.'))
    }
    setBusy(false)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Change your shop link')}>
      <form onSubmit={save}>
        <Field label={t('New link')} hint={status}>
          <span className={`input flex items-center ${state === 'taken' && !checking ? 'shadow-[inset_0_0_0_1.5px_var(--color-bad)]' : ''}`}>
            <span className="text-muted">shopi.tz/</span>
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={next}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setNext(slugify(e.target.value, { typing: true }))
                setError('')
              }}
            />
          </span>
        </Field>
        <p className="mt-4 text-14 leading-relaxed text-muted">
          {t('Your old link keeps working: it takes buyers to the new one. Links in your bio, old messages and printed QR codes still open your shop.')}
        </p>
        {error && (
          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <button className="btn btn-lg mt-5 w-full" disabled={busy || checking || state !== 'free'}>
          {busy ? t('Saving') : t('Change my link')}
        </button>
      </form>
    </Sheet>
  )
}

/**
 * The shop's link as a dark card (the looks review of 23 Nov 2026): the logo, the name in the large shop type, the
 * live dot, the whole link in mono and the shop's own QR code. "Your shop is live" in the setup shows it, and Home
 * shows the same card until the first order, so a seller meets one object twice. It takes the place of the dark
 * "Sales today" card, which a shop without orders doesn't have: there is still one dark card on a screen.
 * Buttons on it (`children`): the main one `btn bg-white text-ink hover:bg-white/90`, the others
 * `btn bg-white/10 hover:bg-white/15`.
 */
export function ShopLinkCard({
  shop,
  top,
  note,
  onQr,
  wide = false,
  children,
  className = '',
}: {
  shop: { name: string; slug: string; logo_key: string | null }
  /** At the right of the live dot: a link to the shop, or a quiet fact (visits). */
  top?: ReactNode
  /** Under the link: what to do with it (Home). */
  note?: ReactNode
  /** Opens the printable QR card; the code on the card is the shop's real one. */
  onQr?: () => void
  /** A card as wide as the page (Home, from `xl`): the sign at the left, the code, the note and the buttons at the right. */
  wide?: boolean
  children: ReactNode
  className?: string
}) {
  const t = useT()
  const code = <QrCode text={qrUrl(shop.slug)} label={t('QR code for {shop}', { shop: shop.name })} className="size-full rounded-8" />
  const tile = 'size-14 shrink-0 rounded-12 bg-white p-1'
  const qr = (show: string) =>
    onQr ? (
      <button type="button" className={`${tile} ${show} transition-transform active:scale-[0.97]`} aria-label={t('QR code')} onClick={onQr}>
        {code}
      </button>
    ) : (
      <span className={`${tile} ${show}`}>{code}</span>
    )
  return (
    // On ink the focus ring is white (the app's is ink). The wide layout starts where the page beside the sidebar has
    // room for two columns; under that the card stacks, as on a phone.
    <section className={`rounded-20 bg-ink p-6 text-white md:p-7 [&_:focus-visible]:outline-white ${wide ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:gap-x-12' : ''} ${className}`}>
      <div className="min-w-0">
        <div className="flex min-h-6 items-center justify-between gap-3">
          <p className="flex shrink-0 items-center gap-2.5 text-13 whitespace-nowrap text-white/70">
            <span className="signal shrink-0" aria-hidden /> {t('Live')}
          </p>
          {top}
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          {/* The ring gives a dark logo an edge on ink. */}
          <ShopAvatar onDark name={shop.name} logo={shop.logo_key} className="h-14 w-14 text-17 ring-1 ring-white/20" />
          {qr(wide ? 'block xl:hidden' : 'block')}
        </div>
        <p className="display mt-5 text-32 break-words md:text-40">{shop.name}</p>
        {/* The whole link, never cut short: it is read out, typed and checked letter by letter. */}
        <p className="code mt-2.5 text-17 break-all md:text-20">
          <span className="text-white/50">shopi.tz/</span>
          {shop.slug}
        </p>
      </div>
      <div className={wide ? 'xl:flex xl:flex-col xl:items-end' : ''}>
        {wide && qr('hidden xl:block')}
        {note}
        <div className={`mt-6 ${wide ? 'xl:w-full' : ''}`}>{children}</div>
      </div>
    </section>
  )
}
