import { Link } from '@tanstack/react-router'
import { Banknote, Check, Minus, Plus, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { MadeWithShopi } from '#/components/shop'
import { BackButton, ErrorText, Field, Img, ShopAvatar } from '#/components/ui'
import { placeOrder, type PublicShop } from '#/lib/api/store'
import { track, visit } from '#/lib/analytics'
import { tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'

const BUYER_KEY = 'shopi_buyer'
const OTHER = 'other'
const FORM_ID = 'checkout'

/** A line at checkout: from the buyer's own bag, or from a bag link the seller made (fixed, at the seller's price). */
export type CheckoutLine = {
  key: string
  productId: string
  name: string
  image: string | null
  size: string | null
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
    <header className="mx-auto flex h-16 max-w-[1120px] items-center gap-3 px-4 md:h-20 md:px-10">
      <BackButton to={`/${shop.slug}`} />
      <Link to="/$shop" params={{ shop: shop.slug }} className="flex min-w-0 items-center gap-2.5">
        <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-8 w-8 text-[12px]" />
        <span className="truncate text-[15px] font-semibold">{shop.name}</span>
      </Link>
      <span className="ml-auto hidden items-center gap-1.5 text-[13px] text-muted sm:flex">
        <ShieldCheck size={15} strokeWidth={1.6} /> {t('You pay the seller directly')}
      </span>
    </header>
  )
}

/**
 * Checkout: the bag, the buyer's details, delivery and payment, and the receipt with the total.
 * With `onQty` the buyer can change their own bag. With `bagCode` the lines come from a bag link and stay as the seller made them.
 */
export function CheckoutView({
  shop,
  areas,
  paused,
  lines,
  title,
  intro,
  onQty,
  bagCode,
  prefill,
  blocked,
  foot,
  onPlaced,
}: {
  shop: PublicShop
  areas: Area[]
  paused: boolean
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
  onPlaced: (code: string) => Promise<void> | void
}) {
  const t = useT()
  const canLipa = !!shop.lipa_number
  const canCod = !!shop.cod_enabled
  const demo = shop.status === 'demo'
  const [form, setForm] = useState({ name: '', phone: '', areaId: '', areaOther: '', landmark: '', note: '' })
  const [payment, setPayment] = useState<'lipa' | 'cod'>(canLipa ? 'lipa' : 'cod')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Once per checkout visit; the bag changing size is not a new checkout.
    track('checkout_start', { shopId: shop.id })
  }, [shop.id])

  useEffect(() => {
    // The seller's details for the buyer win over what this phone remembers from the last order.
    let saved: { name?: string; phone?: string; landmark?: string } = {}
    try {
      saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? '{}')
    } catch {
      /* first visit */
    }
    setForm((f) => ({
      ...f,
      name: prefill?.name || saved.name || '',
      phone: prefill?.phone || saved.phone || '',
      landmark: saved.landmark ?? '',
    }))
  }, [prefill?.name, prefill?.phone])

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const fixed = !onQty

  const notAvailable = bagCode
    ? t('Something in this bag is no longer available. Ask {shop} for a new link.', { shop: shop.name })
    : null
  const errors: Record<string, string> = {
    name: t('Enter your name'),
    phone: t('That phone number looks wrong. Example: 0754 123 456'),
    stock: notAvailable ?? t('One item does not have enough stock. Lower the quantity.'),
    size: notAvailable ?? t('Pick a size for every item'),
    gone: notAvailable ?? t('One item is no longer available. Remove it.'),
    payment: t('That way to pay is not available'),
    empty: t('Your bag is empty'),
    shop: t('This shop is not taking orders right now'),
    demo: t('This is a demo shop. Orders are switched off.'),
    paused: t('This shop is taking a break. Message the seller on WhatsApp.'),
    bag: t('This bag link can no longer be used. Ask {shop} for a new one.', { shop: shop.name }),
  }

  const bag = (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h2 className="text-[15px] font-semibold">{t('Your bag')}</h2>
        <p className="meta">{t(count === 1 ? '{n} item' : '{n} items', { n: count })}</p>
      </div>
      <div className="divide-y divide-line">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-3 px-5 py-3.5">
            <Img size="thumb" k={l.image} alt={l.name} className={`h-[68px] w-14 shrink-0 rounded-[10px] ${l.problem ? 'opacity-50' : ''}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{l.name}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {l.size ? `${t('Size {size}', { size: l.size })} · ` : ''}
                {fixed && l.qty > 1 ? `${l.qty} × ` : ''}
                <span className="tnum">{tzs(l.price)}</span>
              </p>
              {l.problem && <p className="mt-0.5 text-[13px] text-moto-ink">{l.problem}</p>}
            </div>
            {onQty ? (
              <div className="flex h-9 items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
                <button
                  type="button"
                  className="flex h-full w-9 items-center justify-center text-ink-2"
                  aria-label={l.qty === 1 ? t('Remove') : t('Fewer')}
                  onClick={() => onQty(l.key, l.qty - 1)}
                >
                  {l.qty === 1 ? <Trash2 size={14} strokeWidth={1.6} /> : <Minus size={14} strokeWidth={1.75} />}
                </button>
                <span className="tnum w-5 text-center text-[14px] font-medium">{l.qty}</span>
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
              <p className="shrink-0 font-mono text-[13px]">{tzs(l.price * l.qty)}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )

  const summary = (
    <div className="space-y-4">
      <div className="receipt px-5 pt-5 pb-6">
        <div className="space-y-2.5 text-[14px]">
          <Row label={t('Items ({n})', { n: count })} value={tzs(subtotal)} />
          <Row label={t('Delivery')} value={t('Agreed on WhatsApp')} quiet />
        </div>
        <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
          <span className="text-[15px] font-medium">{t('Total')}</span>
          <span className="font-mono text-[20px] font-medium tracking-tight">{tzs(subtotal)}</span>
        </div>
      </div>
      <ErrorText>{error || blocked}</ErrorText>
      <button form={FORM_ID} className="btn btn-lg w-full" disabled={busy || demo || paused || !!blocked || (!canLipa && !canCod)}>
        {demo ? t('Orders are off in this demo shop') : paused ? t('This shop is taking a break') : busy ? t('Placing your order') : t('Place order')}
      </button>
      {foot && <p className="text-center text-[13px] leading-5 text-muted">{foot}</p>}
      <p className="flex items-start justify-center gap-2 text-center text-[13px] leading-5 text-muted">
        <ShieldCheck size={15} strokeWidth={1.6} className="mt-0.5 shrink-0" />
        {t('You pay the seller directly. Shopi never holds your money.')}
      </p>
      <p className="text-center text-[12px] leading-5 text-muted">
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
          <h1 className="title mt-2 mb-6 text-[28px] md:mt-6 md:mb-8 md:text-[40px]">{title}</h1>
          {intro && <div className="-mt-2 mb-8 md:-mt-4">{intro}</div>}
          <div className="mb-8 md:hidden">{bag}</div>

          <form
            id={FORM_ID}
            className="space-y-8"
            onSubmit={async (e) => {
              e.preventDefault()
              if (areas.length && !form.areaId) return setError(t('Choose where to deliver'))
              if ((!areas.length || form.areaId === OTHER) && !form.areaOther.trim()) return setError(t('Write your area'))
              setBusy(true)
              setError('')
              const res = await placeOrder({
                data: {
                  shopId: shop.id,
                  ...(bagCode ? { bag: bagCode } : { items: lines.map((l) => ({ productId: l.productId, qty: l.qty, size: l.size })) }),
                  ...form,
                  payment,
                  visit: visit(),
                },
              })
              setBusy(false)
              if ('error' in res) return setError(errors[res.error ?? 'shop'] ?? errors.shop)
              try {
                localStorage.setItem(BUYER_KEY, JSON.stringify({ name: form.name, phone: form.phone, landmark: form.landmark }))
              } catch {
                /* ignore */
              }
              await onPlaced(res.code)
            }}
          >
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
                    placeholder="0754 123 456"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
            </Block>

            <Block title={t('Delivery')} sub={t('You agree the delivery fee with the seller on WhatsApp.')}>
              {areas.length > 0 && (
                <div className="card divide-y divide-line overflow-hidden" role="radiogroup" aria-label={t('Delivery area')}>
                  {[...areas, { id: OTHER, name: t('My area is not listed') }].map((a) => {
                    const on = form.areaId === a.id
                    return (
                      <label key={a.id} className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors ${on ? 'bg-well' : 'hover:bg-page'}`}>
                        <input type="radio" name="area" className="sr-only" checked={on} onChange={() => setForm({ ...form, areaId: a.id })} />
                        <Radio on={on} />
                        <span className="flex-1 text-[15px]">{a.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {(!areas.length || form.areaId === OTHER) && (
                <div className={areas.length ? 'fade mt-4' : ''}>
                  <Field label={t('Your area')}>
                    <input className="input" value={form.areaOther} onChange={(e) => setForm({ ...form, areaOther: e.target.value })} placeholder={t('e.g. Goba, Bunju, Kibaha')} />
                  </Field>
                </div>
              )}
              <div className="mt-4 grid gap-4">
                <Field label={t('Nearby landmark')} hint={t('e.g. near the Shell station, house with a black gate')}>
                  <input className="input" value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
                </Field>
                <Field label={t('Note for the seller')} aside={t('Optional')}>
                  <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
              </div>
            </Block>

            <Block title={t('Payment')}>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('Payment')}>
                {canLipa && (
                  <PayOption
                    active={payment === 'lipa'}
                    onClick={() => setPayment('lipa')}
                    icon={<Smartphone size={20} strokeWidth={1.5} />}
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
                    icon={<Banknote size={20} strokeWidth={1.5} />}
                    title={t('Cash on delivery')}
                    sub={t('Pay the rider when your order arrives')}
                  />
                )}
              </div>
            </Block>
          </form>

          <div className="mt-10 md:hidden">{summary}</div>
          <div className="md:hidden">
            <MadeWithShopi />
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

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="title text-[18px]">{title}</h2>
      {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${on ? 'bg-ink' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}>
      {on && <span className="h-2 w-2 rounded-full bg-white" />}
    </span>
  )
}

function Row({ label, value, quiet = false }: { label: string; value: string; quiet?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className={`font-mono text-[13px] ${quiet ? 'text-muted' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

function PayOption({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col gap-3 rounded-[20px] bg-card p-4 transition-shadow ${active ? 'shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]'}`}
    >
      <input type="radio" name="payment" className="sr-only" checked={active} onChange={onClick} />
      <span className="flex items-center justify-between">
        <span className="text-ink">{icon}</span>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${active ? 'bg-ink text-white' : 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]'}`}>
          {active && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
      <span>
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-muted">{sub}</span>
      </span>
    </label>
  )
}
