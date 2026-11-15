import { Link, useRouteContext } from '@tanstack/react-router'
import { Bell, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { WhatsAppMark } from '#/components/brand-icons'
import { ErrorText, Field, Img, Sheet } from '#/components/ui'
import { askStockAlert, doneStockAlert, type StockAlert } from '#/lib/api/alerts'
import type { PublicProduct, PublicShop } from '#/lib/api/store'
import { imageOf, localPhone, optionText, timeAgo, waLink } from '#/lib/format'
import { useLang, useT } from '#/lib/i18n'
import { useHumanCheck } from '#/lib/turnstile'
import { useOrigin } from '#/lib/share'

const ASKED_KEY = 'shopi_alerts'
const BUYER_KEY = 'shopi_buyer'
const keyOf = (productId: string, size: string | null) => `${productId}|${size ?? ''}`

/** What this phone already asked to hear about, so the page can say so instead of asking again. */
export function useAsked(productId: string, size: string | null) {
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    try {
      setAsked((JSON.parse(localStorage.getItem(ASKED_KEY) ?? '[]') as string[]).includes(keyOf(productId, size)))
    } catch {
      setAsked(false)
    }
  }, [productId, size])
  const remember = () => {
    setAsked(true)
    try {
      const list = JSON.parse(localStorage.getItem(ASKED_KEY) ?? '[]') as string[]
      localStorage.setItem(ASKED_KEY, JSON.stringify([...list.filter((k) => k !== keyOf(productId, size)), keyOf(productId, size)].slice(-50)))
    } catch {
      /* storage blocked: the alert is saved anyway */
    }
  }
  return { asked, remember }
}

/** A buyer leaves a WhatsApp number for a sold-out product or option. Tapping the button is their consent. */
export function NotifySheet({
  shop,
  product,
  size,
  open,
  onClose,
  onDone,
}: {
  shop: Pick<PublicShop, 'id' | 'name'>
  product: PublicProduct
  size: string | null
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const check = useHumanCheck('alert', open && !done)
  useEffect(() => {
    if (!open) return
    setDone(false)
    setError('')
    try {
      const saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? '{}') as { phone?: string }
      if (saved.phone) setPhone((p) => p || saved.phone!)
    } catch {
      /* first visit */
    }
  }, [open])

  const what = size ? `${product.name}, ${optionText(t, product.option_name, size)}` : product.name

  async function ask() {
    setBusy(true)
    setError('')
    const human = await check.token()
    if (human === null) {
      setBusy(false)
      return setError(t('Tap the box above to show you’re not a robot, then try again.'))
    }
    const res = await askStockAlert({ data: { shopId: shop.id, productId: product.id, size, phone, human } })
    setBusy(false)
    if ('error' in res) {
      return setError(
        res.error === 'phone'
          ? t('That phone number looks wrong. Example: 0754 123 456')
          : res.error === 'in_stock'
            ? t('Good news: it is in stock now. Close this and add it to your bag.')
            : res.error === 'demo'
              ? t('This is a demo shop. Messages are switched off.')
              : res.error === 'bot'
                ? t('We couldn’t check that you’re not a robot. Wait a minute and try again.')
                : t('Something went wrong. Try again.'),
      )
    }
    setDone(true)
    onDone()
  }

  return (
    <Sheet open={open} onClose={onClose} title={done ? t('You’re on the list') : t('Get a message when it’s back')}>
      <div className="flex items-center gap-4">
        <Img size="thumb" k={imageOf(product, size)} alt={product.name} className="h-20 w-16 shrink-0 rounded-[10px]" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[15px] font-medium">{product.name}</p>
          {size && <p className="text-[14px] text-ink-2">{optionText(t, product.option_name, size)}</p>}
          <p className="mt-0.5 text-[13px] text-muted">{t('Sold out')}</p>
        </div>
      </div>
      {done ? (
        <div className="fade">
          <p className="mt-6 flex items-start gap-3 rounded-[16px] bg-page px-4 py-4 text-[15px] leading-relaxed">
            <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" />
            {t('{shop} will message you on WhatsApp when {what} is back.', { shop: shop.name, what })}
          </p>
          <button type="button" className="btn btn-lg mt-5 w-full" onClick={onClose}>
            {t('Done')}
          </button>
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            ask()
          }}
        >
          <Field label={t('Your WhatsApp number')}>
            <input className="input tnum" type="tel" inputMode="tel" autoComplete="tel" placeholder="0754 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <p className="text-[13px] leading-5 text-muted">
            {t('By tapping Notify me, you agree that {shop} may message you on WhatsApp about this product. Shopi deletes your number once they have, or after 90 days.', { shop: shop.name })}{' '}
            <Link to="/privacy" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
              {t('Privacy')}
            </Link>
          </p>
          <div ref={check.slot} />
          <ErrorText>{error}</ErrorText>
          <button className="btn btn-shop btn-lg w-full" disabled={busy || phone.replace(/\D/g, '').length < 9}>
            <Bell size={17} strokeWidth={1.75} /> {busy ? t('Saving') : t('Notify me')}
          </button>
        </form>
      )}
    </Sheet>
  )
}

/** On the seller's product page: who is waiting, a prefilled WhatsApp message for each, and Done, which deletes the number. */
export function WaitingCard({ product, alerts: initial }: { product: { id: string; slug: string | null; name: string }; alerts: StockAlert[] }) {
  const t = useT()
  const lang = useLang()
  const { shop } = useRouteContext({ from: '/app' })
  const url = `${useOrigin()}/${shop.slug}/${product.slug ?? product.id}`
  const [alerts, setAlerts] = useState(initial)
  const [busy, setBusy] = useState('')
  if (!alerts.length) return null
  const back = alerts.filter((a) => a.back).length

  async function done(id: string) {
    setBusy(id)
    await doneStockAlert({ data: { id } })
    setAlerts((list) => list.filter((a) => a.id !== id))
    setBusy('')
  }

  return (
    <section id="waiting" className={`card scroll-mt-6 p-6 ${back ? 'shadow-[inset_0_3px_0_var(--color-moto)]' : ''}`}>
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
        {back > 0 && <span className="signal" />}
        {t(alerts.length === 1 ? '{n} person waiting' : '{n} people waiting', { n: alerts.length })}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        {back
          ? t('What they asked for is back. Message each one on WhatsApp, then tap the check: their number is deleted.')
          : t('They asked for a WhatsApp message when it is back. Restock it, then message each one here.')}
      </p>
      <ul className="mt-3 divide-y divide-line">
        {alerts.map((a) => {
          const what = a.variant ? `${product.name} (${optionText(t, a.product.option_name, a.variant)})` : product.name
          const status = a.back ? t('Back in stock') : a.offered ? t('Still sold out') : t('No longer offered')
          return (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                {/* The time sits by the number, so the second line has room for the option and where it stands on a phone. */}
                <p className="flex items-baseline gap-2">
                  <span className="code truncate text-[14px]">{localPhone(a.phone)}</span>
                  <span className="meta shrink-0">{timeAgo(a.created_at, lang)}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.back ? 'bg-ok' : 'bg-faint'}`} />
                  <span className="truncate">
                    {a.variant ? `${optionText(t, a.product.option_name, a.variant)} · ` : ''}
                    {status}
                  </span>
                </p>
              </div>
              <a
                href={waLink(a.phone, t('Hi, {what} is back in stock at {shop}. You can order it here: {url}', { what, shop: shop.name, url }))}
                target="_blank"
                rel="noreferrer"
                aria-label={t('Message {phone} on WhatsApp', { phone: localPhone(a.phone) })}
                className={`btn btn-sm h-9 shrink-0 px-3 ${a.back ? '' : 'btn-ghost'}`}
              >
                <WhatsAppMark size={16} /> <span className="hidden sm:inline">WhatsApp</span>
              </a>
              <button
                type="button"
                className="icon-btn h-9 w-9 shrink-0"
                disabled={busy === a.id}
                aria-label={t('Mark {phone} as told', { phone: localPhone(a.phone) })}
                title={t('Told them: delete the number')}
                onClick={() => done(a.id)}
              >
                <Check size={16} strokeWidth={2} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
