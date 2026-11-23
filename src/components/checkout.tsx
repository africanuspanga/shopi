import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Banknote, Check, LocateFixed, MapPin, Minus, Plus, ShieldCheck, Smartphone, TicketPercent, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { MadeWithShopi, ShopTopBar } from '#/components/shop'
import { CardHead, ErrorText, Field, Img, Label } from '#/components/ui'
import { checkDiscount } from '#/lib/api/discounts'
import { expandMapLink, placeOrder, type PublicShop } from '#/lib/api/store'
import { track, visit } from '#/lib/analytics'
import { cleanCode, codeKey, discountLabel, discountOff, type DiscountRule } from '#/lib/discounts'
import { DAR_AREAS, optionText, tzs } from '#/lib/format'
import { eg, useT } from '#/lib/i18n'
import { ROUGH_M, asPin, distance, pinLink, readMapLink, type Pin } from '#/lib/location'
import { useHumanCheck } from '#/lib/turnstile'

const BUYER_KEY = 'shopi_buyer'
const FORM_ID = 'checkout'

/** What this phone remembers from the buyer's last order, so the next checkout is one screen. Never sent anywhere. */
type SavedBuyer = { name?: string; phone?: string; area?: string; landmark?: string; pin?: Pin | null; payment?: 'lipa' | 'cod' }

/** The same Tanzanian number written two ways ("0754 123 456", "+255754123456"). */
const samePhone = (a?: string, b?: string) => !!a && !!b && a.replace(/\D/g, '').slice(-9) === b.replace(/\D/g, '').slice(-9)

/** A line at checkout: from the buyer's own bag, or from a bag link the seller made (fixed, at the seller's price). */
export type CheckoutLine = {
  key: string
  productId: string
  name: string
  image: string | null
  size: string | null
  /** What the size is (see OPTION_KINDS): "Colour Red" rather than "Size Red". */
  option?: string | null
  qty: number
  /** Per piece. */
  price: number
  /** Stock left for this line, for the + button; null when not counted. */
  left: number | null
  /** Why a bag link's line can't be ordered any more, in words. */
  problem?: string | null
}

type Area = { id: string; name: string; fee: number }

/** The top of checkout and bag pages: back to the shop, the shop, and the promise about money. */
export function CheckoutHeader({ shop }: { shop: Pick<PublicShop, 'slug' | 'name' | 'logo_key'> }) {
  const t = useT()
  return (
    <div className="mb-2 md:mb-4">
      <ShopTopBar
        shop={shop}
        back
        right={
          <span className="hidden items-center gap-1.5 text-13 text-muted sm:flex">
            <ShieldCheck size={16} strokeWidth={1.75} /> {t('You pay the seller directly')}
          </span>
        }
      />
    </div>
  )
}

/**
 * Checkout: the bag, the buyer's details, delivery and payment, and the receipt with the total.
 * With `onQty` the buyer can change their own bag. With `bagCode` the lines come from a bag link and stay as the seller made them.
 */
export function CheckoutView({
  shop,
  areas,
  lines,
  title,
  intro,
  onQty,
  bagCode,
  prefill,
  blocked,
  foot,
  discounts = false,
  onPlaced,
}: {
  shop: PublicShop
  areas: Area[]
  lines: CheckoutLine[]
  title: string
  intro?: ReactNode
  onQty?: (key: string, qty: number) => void
  bagCode?: string
  prefill?: { name: string; phone: string }
  /** Why this can't be ordered right now (something in a bag link sold out). */
  blocked?: string
  /** A quiet line under the button. */
  foot?: ReactNode
  /** The shop has discount codes: show the field. Bag links never do. */
  discounts?: boolean
  onPlaced: (code: string) => Promise<void> | void
}) {
  const t = useT()
  const canLipa = !!shop.lipa_number
  const canCod = !!shop.cod_enabled
  const demo = shop.status === 'demo'
  // `landmark` is the note for the rider (the column kept its name).
  const [form, setForm] = useState({ name: '', phone: '', area: '', landmark: '', note: '' })
  const [pin, setPin] = useState<Pin | null>(null)
  // A returning buyer sees who and where as one card, with Change.
  const [returning, setReturning] = useState(false)
  const [sellerNote, setSellerNote] = useState(false)
  const [payment, setPayment] = useState<'lipa' | 'cod'>(canLipa ? 'lipa' : 'cod')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState<DiscountRule | null>(null)
  const check = useHumanCheck('order', !demo)

  useEffect(() => {
    // Once per checkout visit; the bag changing size is not a new checkout.
    track('checkout_start', { shopId: shop.id })
  }, [shop.id])

  useEffect(() => {
    // A code that came in a link is applied by itself; one that no longer works is quietly dropped.
    if (!discounts) return
    let saved = ''
    try {
      saved = localStorage.getItem(codeKey(shop.id)) ?? ''
    } catch {
      /* storage blocked */
    }
    if (!saved) return
    checkDiscount({ data: { shopId: shop.id, code: saved } }).then((res) => {
      if ('rule' in res) setApplied(res.rule)
      else forgetCode(shop.id)
    })
  }, [discounts, shop.id])

  useEffect(() => {
    // The seller's details for the buyer win over what this phone remembers from the last order.
    let saved: SavedBuyer = {}
    try {
      saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? '{}') ?? {}
    } catch {
      /* first visit */
    }
    const name = prefill?.name || saved.name || ''
    const phone = prefill?.phone || saved.phone || ''
    // Where to deliver belongs to whoever saved it: a bag link made for someone else starts without it.
    const same = !prefill?.phone || samePhone(prefill.phone, saved.phone)
    const area = same ? (saved.area ?? '') : ''
    setForm((f) => ({ ...f, name, phone, area, landmark: same ? (saved.landmark ?? '') : '' }))
    const savedPin = same && saved.pin ? asPin(saved.pin.lat, saved.pin.lng) : null
    setPin(savedPin ? { ...savedPin, m: saved.pin?.m ?? null } : null)
    if (saved.payment === 'lipa' ? canLipa : saved.payment === 'cod' ? canCod : false) setPayment(saved.payment!)
    setReturning(!!(name && phone && area))
  }, [prefill?.name, prefill?.phone, canLipa, canCod])

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const fixed = !onQty
  const off = applied ? discountOff(applied, subtotal) : 0
  const total = subtotal - off

  const notAvailable = bagCode
    ? t('Something in this bag is no longer available. Ask {shop} for a new link.', { shop: shop.name })
    : null
  const errors: Record<string, string> = {
    name: t('Enter your name'),
    phone: t('That phone number looks wrong. Example: 0754 123 456'),
    area: t('Write your area'),
    stock: notAvailable ?? t('One item does not have enough stock. Lower the quantity.'),
    size: notAvailable ?? t('Pick a size for every item'),
    gone: notAvailable ?? t('One item is no longer available. Remove it.'),
    payment: t('That way to pay is not available'),
    empty: t('Your bag is empty'),
    shop: t('This shop is not taking orders right now'),
    demo: t('This is a demo shop. Orders are switched off.'),
    bag: t('This bag link can no longer be used. Ask {shop} for a new one.', { shop: shop.name }),
    discount: t('That discount code no longer works, so it was taken off. Check the new total and place your order.'),
    bot: t('We couldn’t check that you’re not a robot. Try again in a minute, or order from {shop} on WhatsApp.', { shop: shop.name }),
  }

  const bag = (
    <section className="card overflow-hidden">
      <CardHead title={t('Your bag')} right={<span className="meta">{t(count === 1 ? '{n} item' : '{n} items', { n: count })}</span>} className="px-5 pt-4 pb-1" />
      <div className="divide-y divide-line">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-3 px-5 py-3.5">
            <Img size="thumb" k={l.image} alt={l.name} className={`h-[68px] w-14 shrink-0 rounded-12 ${l.problem ? 'opacity-50' : ''}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 font-medium">{l.name}</p>
              <p className="mt-0.5 text-13 text-muted">
                {l.size ? `${optionText(t, l.option, l.size)} · ` : ''}
                {fixed && l.qty > 1 ? `${l.qty} × ` : ''}
                <span className="tnum">{tzs(l.price)}</span>
              </p>
              {l.problem && <p className="mt-0.5 text-13 text-moto-ink">{l.problem}</p>}
            </div>
            {onQty ? (
              <div className="flex h-9 items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
                <button
                  type="button"
                  className="flex h-full w-9 items-center justify-center text-ink-2"
                  aria-label={l.qty === 1 ? t('Remove') : t('Fewer')}
                  onClick={() => onQty(l.key, l.qty - 1)}
                >
                  {l.qty === 1 ? <Trash2 size={14} strokeWidth={1.75} /> : <Minus size={14} strokeWidth={1.75} />}
                </button>
                <span className="tnum w-5 text-center text-14 font-medium">{l.qty}</span>
                <button
                  type="button"
                  className="flex h-full w-9 items-center justify-center text-ink-2 disabled:text-faint"
                  aria-label={t('More')}
                  disabled={l.left != null && l.qty >= l.left}
                  onClick={() => onQty(l.key, l.left == null ? l.qty + 1 : Math.min(l.left, l.qty + 1))}
                >
                  <Plus size={14} strokeWidth={1.75} />
                </button>
              </div>
            ) : (
              <p className="shrink-0 font-mono text-13">{tzs(l.price * l.qty)}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )

  const summary = (
    <div className="space-y-4">
      {discounts && !bagCode && (
        <DiscountField
          shopId={shop.id}
          applied={applied}
          subtotal={subtotal}
          onApply={(rule) => {
            setApplied(rule)
            setError('')
          }}
          onRemove={() => {
            setApplied(null)
            forgetCode(shop.id)
          }}
        />
      )}
      <div className="receipt px-5 pt-5 pb-6">
        <div className="space-y-2.5 text-14">
          <Row label={t('Items ({n})', { n: count })} value={tzs(subtotal)} />
          {off > 0 && applied && <Row label={t('Discount ({code})', { code: applied.code })} value={`−${tzs(off)}`} />}
          <Row label={t('Delivery')} value={t('Agreed on WhatsApp')} quiet />
        </div>
        <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
          <span className="text-15 font-medium">{t('Total')}</span>
          <span className="font-mono text-20 font-medium tracking-tight">{tzs(total)}</span>
        </div>
      </div>
      <div ref={check.slot} />
      <ErrorText>{error || blocked}</ErrorText>
      <button form={FORM_ID} className="btn btn-shop btn-lg w-full" disabled={busy || demo || !!blocked || (!canLipa && !canCod)}>
        {demo ? t('Orders are off in this demo shop') : busy ? t('Placing your order') : t('Place order')}
      </button>
      {foot && <p className="text-center text-13 leading-5 text-muted">{foot}</p>}
      <p className="flex items-start justify-center gap-2 text-center text-13 leading-5 text-muted">
        <ShieldCheck size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        {t('You pay the seller directly. Shopi never holds your money.')}
      </p>
      <p className="text-center text-12 leading-5 text-muted">
        {t('Your details go to {shop} to deliver your order.', { shop: shop.name })}{' '}
        <Link to="/privacy" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
          {t('Privacy')}
        </Link>
      </p>
    </div>
  )

  return (
    <div className="min-h-dvh bg-page">
      <CheckoutHeader shop={shop} />
      <main className="mx-auto max-w-[1120px] px-4 pb-16 md:grid md:grid-cols-[minmax(0,1fr)_400px] md:items-start md:gap-12 md:px-10">
        <div className="min-w-0">
          <h1 className="title mt-2 mb-6 text-28 md:mt-6 md:mb-8 md:text-40">{title}</h1>
          {intro && <div className="-mt-2 mb-8 md:-mt-4">{intro}</div>}
          <div className="mb-8 md:hidden">{bag}</div>

          <form
            id={FORM_ID}
            className="space-y-8"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!form.area.trim()) {
                setReturning(false)
                return setError(t('Write your area'))
              }
              setBusy(true)
              setError('')
              const human = await check.token()
              if (human === null) {
                setBusy(false)
                return setError(t('Tap the box above to show you’re not a robot, then try again.'))
              }
              const res = await placeOrder({
                data: {
                  shopId: shop.id,
                  ...(bagCode ? { bag: bagCode } : { items: lines.map((l) => ({ productId: l.productId, qty: l.qty, size: l.size })) }),
                  ...(applied && off > 0 ? { discount: applied.code } : {}),
                  ...form,
                  pin,
                  payment,
                  visit: visit(),
                  human,
                },
              })
              setBusy(false)
              if ('error' in res) {
                if (res.error === 'discount') {
                  setApplied(null)
                  forgetCode(shop.id)
                }
                return setError(errors[res.error ?? 'shop'] ?? errors.shop)
              }
              try {
                const keep: SavedBuyer = { name: form.name, phone: form.phone, area: form.area.trim(), landmark: form.landmark, pin, payment }
                localStorage.setItem(BUYER_KEY, JSON.stringify(keep))
              } catch {
                /* ignore */
              }
              if (applied) forgetCode(shop.id)
              await onPlaced(res.code)
            }}
          >
            {returning ? (
              <Block title={t('Deliver to')}>
                <div className="card flex items-start gap-4 p-5">
                  <div className="min-w-0 flex-1 text-15 leading-6">
                    <p className="font-medium">
                      {form.name} · <span className="tnum">{form.phone}</span>
                    </p>
                    <p className="text-ink-2">
                      {form.area}
                      {form.landmark ? ` · ${form.landmark}` : ''}
                    </p>
                    {pin && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-13 text-muted">
                        <MapPin size={14} strokeWidth={1.75} /> {t('Location shared')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                    onClick={() => setReturning(false)}
                  >
                    {t('Change')}
                  </button>
                </div>
              </Block>
            ) : (
              <>
                <Block title={t('Your details')} sub={t('The seller calls or messages you on this number')}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Name')}>
                      <input className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label={t('Phone number')}>
                      <input
                        className="input tnum"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder={eg(t, '0754 123 456')}
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </Field>
                  </div>
                </Block>

                <Block title={t('Delivery')} sub={t('You agree the delivery fee with the seller on WhatsApp.')}>
                  <LocationField pin={pin} onPin={setPin} />
                  <div className="mt-5 grid gap-4">
                    <Field label={t('Your area')}>
                      <input
                        // Suggestions show as the buyer types; Chrome's arrow would make it look like a picker.
                        className="input [&::-webkit-calendar-picker-indicator]:hidden"
                        list="checkout-areas"
                        autoComplete="off"
                        value={form.area}
                        placeholder={t('e.g. Sinza, Goba, Kibaha')}
                        aria-invalid={!!error && !form.area.trim()}
                        onChange={(e) => setForm({ ...form, area: e.target.value })}
                      />
                      <datalist id="checkout-areas">
                        {suggestions(areas).map((a) => (
                          <option key={a} value={a} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label={t('Note for the rider')} aside={t('Optional')} hint={t('A street, a landmark, the colour of the gate')}>
                      <input className="input" value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
                    </Field>
                  </div>
                </Block>
              </>
            )}

            {sellerNote || form.note ? (
              <div className={sellerNote ? 'fade' : ''}>
                <Field label={t('Note for the seller')} aside={t('Optional')}>
                  <input className="input" autoFocus={sellerNote} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
              </div>
            ) : (
              <button
                type="button"
                className="-mt-2 flex items-center gap-2 text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                onClick={() => setSellerNote(true)}
              >
                <Plus size={16} strokeWidth={1.75} /> {t('Add a note for the seller')}
              </button>
            )}

            <Block title={t('Payment')}>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('Payment')}>
                {canLipa && (
                  <PayOption
                    active={payment === 'lipa'}
                    onClick={() => setPayment('lipa')}
                    icon={<Smartphone size={20} strokeWidth={1.75} />}
                    title={t('Mobile money')}
                    sub={
                      shop.lipa_network
                        ? t('Pay the seller’s {network} Lipa Namba after you order', { network: shop.lipa_network })
                        : t('Pay the seller’s Lipa Namba after you order')
                    }
                  />
                )}
                {canCod && (
                  <PayOption
                    active={payment === 'cod'}
                    onClick={() => setPayment('cod')}
                    icon={<Banknote size={20} strokeWidth={1.75} />}
                    title={t('Cash on delivery')}
                    sub={t('Pay the rider when your order arrives')}
                  />
                )}
              </div>
            </Block>
          </form>

          <div className="mt-10 md:hidden">{summary}</div>
          <div className="md:hidden">
            {shop.badge && <MadeWithShopi shopSlug={shop.slug} />}
          </div>
        </div>

        <aside className="hidden space-y-4 md:sticky md:top-6 md:block">
          {bag}
          {summary}
        </aside>
      </main>
    </div>
  )
}

/** Spellings to offer as the buyer types their area: the shop's own areas first, then common ones in Dar. */
function suggestions(areas: Area[]) {
  const names = areas.map((a) => a.name)
  return [...names, ...DAR_AREAS.filter((d) => !names.some((n) => n.toLowerCase() === d.toLowerCase()))]
}

/**
 * "Share my location": the phone's GPS gives a pin the seller opens in Google Maps and sends to the rider. A buyer who
 * says no, or is on a laptop, can paste a location link (WhatsApp, Google Maps) or just type the area. Without a Google
 * key there is no map here yet; the pin and the words go to the seller.
 */
function LocationField({ pin, onPin }: { pin: Pin | null; onPin: (pin: Pin | null) => void }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'finding' | 'denied' | 'failed'>('idle')
  const [pasting, setPasting] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [reading, setReading] = useState(false)

  function locate() {
    if (!('geolocation' in navigator)) return setState('failed')
    setState('finding')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = asPin(pos.coords.latitude, pos.coords.longitude)
        if (!p) return setState('failed')
        onPin({ ...p, m: Math.round(pos.coords.accuracy) })
        setState('idle')
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    )
  }

  async function readLink(text: string) {
    setLinkError('')
    const found = readMapLink(text)
    const notALink = t('That link has no location in it. In WhatsApp or Google Maps, share the location and copy its link.')
    if (!found) return setLinkError(notALink)
    let p: { lat: number; lng: number } | null = found.kind === 'pin' ? found : null
    if (found.kind === 'short') {
      setReading(true)
      const res = await expandMapLink({ data: { url: found.url } }).catch(() => ({ pin: null }))
      setReading(false)
      p = res.pin
    }
    if (!p) return setLinkError(notALink)
    onPin({ ...p, m: null })
    setPasting(false)
    setLink('')
  }

  if (pin) {
    const rough = pin.m != null && pin.m > ROUGH_M
    return (
      <div className="fade flex items-center gap-3 rounded-16 bg-card p-4 shadow-[inset_0_0_0_1.5px_var(--color-ink)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
          <MapPin size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-15 font-medium">{t('Location shared')}</p>
          <p className={`text-13 leading-5 ${rough ? 'text-ink-2' : 'text-muted'}`}>
            {pin.m == null
              ? t('From your link')
              : rough
                ? t('Rough, about {d}. Add a note for the rider.', { d: distance(pin.m) })
                : t('Accurate to about {d}', { d: distance(pin.m) })}
          </p>
          <a
            href={pinLink(pin)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-13 font-medium whitespace-nowrap text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            {t('Check on the map')} <ArrowUpRight size={14} strokeWidth={1.75} />
          </a>
        </div>
        <button
          type="button"
          aria-label={t('Remove location')}
          className="shrink-0 text-13 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          onClick={() => onPin(null)}
        >
          {t('Remove')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={state === 'finding'}
        className="flex w-full items-center gap-3 rounded-16 bg-card p-4 text-left shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] active:scale-[0.99] disabled:opacity-70"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-well text-ink">
          <LocateFixed size={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-15 font-medium">{state === 'finding' ? t('Finding your location') : t('Share my location')}</span>
          <span className="block text-13 text-muted">{t('So the rider comes straight to you')}</span>
        </span>
      </button>
      {state === 'denied' && <p className="fade mt-2 text-13 leading-5 text-ink-2">{t('Location is off for this page. Type your area below, or paste a location link.')}</p>}
      {state === 'failed' && <p className="fade mt-2 text-13 leading-5 text-ink-2">{t('We couldn’t find you. Try again, or type your area below.')}</p>}
      {pasting ? (
        <div className="fade mt-4">
          <Label htmlFor="checkout-map-link">{t('Location link')}</Label>
          <div className="flex gap-2">
            <input
              id="checkout-map-link"
              className="input min-w-0 flex-1"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={eg(t, 'https://maps.app.goo.gl/…')}
              value={link}
              aria-invalid={!!linkError}
              onChange={(e) => {
                setLink(e.target.value)
                setLinkError('')
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (!text) return
                e.preventDefault()
                setLink(text)
                readLink(text)
              }}
            />
            <button type="button" className="btn btn-ghost shrink-0" disabled={!link.trim() || reading} onClick={() => readLink(link)}>
              {reading ? t('Reading') : t('Use it')}
            </button>
          </div>
          {linkError && <p className="mt-2 text-13 leading-5 text-bad">{linkError}</p>}
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 text-13 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
          onClick={() => setPasting(true)}
        >
          {t('Paste a location link instead')}
        </button>
      )}
    </div>
  )
}

function forgetCode(shopId: string) {
  try {
    localStorage.removeItem(codeKey(shopId))
  } catch {
    /* storage blocked */
  }
}

/** "Have a discount code?" until the buyer opens it; then a field; once applied, the code with a way to remove it. */
function DiscountField({
  shopId,
  applied,
  subtotal,
  onApply,
  onRemove,
}: {
  shopId: string
  applied: DiscountRule | null
  subtotal: number
  onApply: (rule: DiscountRule) => void
  onRemove: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (applied) {
    const short = applied.min_order != null && subtotal < applied.min_order
    return (
      <div className="flex items-center gap-3 rounded-16 bg-card px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <TicketPercent size={18} strokeWidth={1.75} className="shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <p className="code truncate text-14">{applied.code}</p>
          <p className="text-13 text-muted">
            {short ? t('Works on orders from {min}', { min: tzs(applied.min_order!) }) : discountLabel(t, applied)}
          </p>
        </div>
        <button type="button" className="shrink-0 text-13 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={onRemove}>
          {t('Remove')}
        </button>
      </div>
    )
  }
  if (!open) {
    return (
      <button
        type="button"
        className="flex items-center gap-2 text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        onClick={() => setOpen(true)}
      >
        <TicketPercent size={16} strokeWidth={1.75} /> {t('Have a discount code?')}
      </button>
    )
  }
  async function apply(e: FormEvent) {
    e.preventDefault()
    const code = cleanCode(value)
    if (!code) return
    setBusy(true)
    setError('')
    const res = await checkDiscount({ data: { shopId, code } })
    setBusy(false)
    if ('rule' in res) {
      setValue('')
      setOpen(false)
      return onApply(res.rule)
    }
    setError(
      res.error === 'ended' ? t('This code has ended.') : res.error === 'used_up' ? t('This code has been used up.') : t('We don’t know that code. Check the spelling.'),
    )
  }
  return (
    <form onSubmit={apply} className="fade">
      <Label htmlFor={`discount-${shopId}`}>{t('Discount code')}</Label>
      <div className="flex gap-2">
        <input
          id={`discount-${shopId}`}
          className="input code min-w-0 flex-1 uppercase"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={eg(t, 'EID10')}
          value={value}
          aria-invalid={!!error}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
        />
        <button className="btn btn-ghost shrink-0" disabled={busy || !cleanCode(value)}>
          {busy ? t('Checking') : t('Apply')}
        </button>
      </div>
      {error && <p className="mt-2 text-13 text-bad">{error}</p>}
    </form>
  )
}

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="title text-17">{title}</h2>
      {sub && <p className="mt-1 text-14 text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Row({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className={`font-mono text-13 ${quiet ? 'text-muted' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

function PayOption({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col gap-3 rounded-20 bg-card p-4 transition-shadow ${active ? 'shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]'}`}
    >
      <input type="radio" name="payment" className="sr-only" checked={active} onChange={onClick} />
      <span className="flex items-center justify-between">
        <span className="text-ink">{icon}</span>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${active ? 'bg-ink text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}>
          {active && <Check size={12} strokeWidth={2.25} />}
        </span>
      </span>
      <span>
        <span className="block text-15 font-medium">{title}</span>
        <span className="mt-0.5 block text-13 leading-5 text-muted">{sub}</span>
      </span>
    </label>
  )
}
