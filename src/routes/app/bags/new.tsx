import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Minus, PackagePlus, Plus, ShoppingBag, X } from 'lucide-react'
import { useState } from 'react'
import { useHideFloatingNav } from '#/components/floating-nav'
import { ProductPicker } from '#/components/product-picker'
import { CardHead, Empty, ErrorText, Field, Img, Page, TopBar } from '#/components/ui'
import { createBagLink } from '#/lib/api/bags'
import { listMyProducts, type ProductRow } from '#/lib/api/merchant'
import { priceOf, tzs } from '#/lib/format'
import { eg, useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/bags/new')({
  loader: () => listMyProducts(),
  head: () => ({ meta: [{ title: 'New bag link · Shopi' }] }),
  component: NewBag,
})

type Line = { key: number; product: ProductRow; size: string | null; qty: number; price: string }

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9)
const money = (s: string) => (s ? Number(s).toLocaleString('en-US') : '')
/** Stock left for a product, or for one of its sizes; null when not counted. */
const leftOf = (p: ProductRow, size: string | null) => (p.sizes ? (size ? (p.sizes.find((s) => s.label === size)?.stock ?? null) : null) : p.stock)

function NewBag() {
  const t = useT()
  const navigate = useNavigate()
  const products = Route.useLoaderData()
  const [lines, setLines] = useState<Line[]>([])
  const [picking, setPicking] = useState(false)
  const [buyer, setBuyer] = useState({ name: '', phone: '', note: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A form keeps the seller's attention on finishing: no capsule here.
  useHideFloatingNav(true)

  const total = lines.reduce((s, l) => s + (Number(l.price) || 0) * l.qty, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const update = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  async function make() {
    if (!lines.length) return setError(t('Add what goes in the bag.'))
    const noSize = lines.find((l) => l.product.sizes && !l.size)
    if (noSize) return setError(t('Choose a size for {product}.', { product: noSize.product.name }))
    if (!total) return setError(t('Give the bag a price.'))
    setBusy(true)
    setError('')
    const res = await createBagLink({
      data: { items: lines.map((l) => ({ productId: l.product.id, size: l.size, qty: l.qty, price: Number(l.price) || 0 })), ...buyer },
    })
    setBusy(false)
    if ('error' in res) {
      return setError(
        res.error === 'size'
          ? t('Choose a size for {product}.', { product: res.product ?? '' })
          : res.error === 'phone'
            ? t('That phone number looks wrong. Example: 0754 123 456')
            : res.error === 'price'
              ? t('Give the bag a price.')
              : t('Something went wrong. Try again.'),
      )
    }
    navigate({ to: '/app/bags/$id', params: { id: res.id }, search: { made: true } })
  }

  return (
    <Page wide>
      <TopBar
        back="/app/bags"
        title={t('New bag link')}
        sub={t('Build a bag for one buyer. They open the link, add where to deliver and pay you.')}
      />
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-10">
        <div className="space-y-8">
          <section>
            <CardHead title={t('What goes in the bag')} sub={t('Change a price if you agreed a different one. Products hidden from your shop can go in too.')} />
            {lines.length === 0 ? (
              <div className="mt-3">
                <Empty
                  icon={<ShoppingBag size={20} strokeWidth={1.75} />}
                  title={t('The bag is empty')}
                  body={t('Add the products you agreed with the buyer.')}
                  action={
                    <button type="button" className="btn btn-sm" onClick={() => setPicking(true)} disabled={!products.length}>
                      <PackagePlus size={16} strokeWidth={1.75} /> {t('Add from your products')}
                    </button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="card mt-3 divide-y divide-line overflow-hidden">
                  {lines.map((l) => {
                    const left = leftOf(l.product, l.size)
                    const shopPrice = priceOf(l.product, l.size)
                    const changed = l.price !== '' && Number(l.price) !== shopPrice
                    return (
                      <div key={l.key} className="space-y-3 p-4">
                        <div className="flex items-center gap-3">
                          <Img size="thumb" k={l.product.images[0]} alt={l.product.name} className="h-12 w-10 shrink-0 rounded-8" />
                          <p className="min-w-0 flex-1 truncate text-15 font-medium">{l.product.name}</p>
                          <button type="button" className="icon-btn shrink-0" aria-label={t('Remove')} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                            <X size={16} strokeWidth={1.75} />
                          </button>
                        </div>
                        {l.product.sizes && (
                          <div className="flex flex-wrap gap-2">
                            {l.product.sizes.map((s) => (
                              <button
                                key={s.label}
                                type="button"
                                className="chip h-9 px-3"
                                disabled={s.stock === 0}
                                aria-pressed={l.size === s.label}
                                onClick={() =>
                                  update(l.key, {
                                    size: s.label,
                                    qty: s.stock != null ? Math.min(l.qty, s.stock) : l.qty,
                                    // The price follows the option until the seller types one of their own.
                                    price: l.price === String(priceOf(l.product, l.size)) ? String(priceOf(l.product, s.label)) : l.price,
                                  })
                                }
                              >
                                {s.label}
                                {s.stock != null && s.stock > 0 && <span className="text-12 opacity-60">{s.stock}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 shrink-0 items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
                            <button type="button" className="flex h-11 w-11 items-center justify-center disabled:text-faint" aria-label={t('Fewer')} disabled={l.qty <= 1} onClick={() => update(l.key, { qty: l.qty - 1 })}>
                              <Minus size={16} strokeWidth={2.25} />
                            </button>
                            <span className="tnum w-6 text-center text-15">{l.qty}</span>
                            <button
                              type="button"
                              className="flex h-11 w-11 items-center justify-center disabled:text-faint"
                              aria-label={t('More')}
                              disabled={l.qty >= 99 || (left != null && l.qty >= left)}
                              onClick={() => update(l.key, { qty: l.qty + 1 })}
                            >
                              <Plus size={16} strokeWidth={2.25} />
                            </button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <label className="input flex h-11 items-center gap-1.5 px-3">
                              <span className="text-13 text-muted">TSh</span>
                              <input
                                className="tnum min-w-0 flex-1 bg-transparent text-right outline-none"
                                inputMode="numeric"
                                aria-label={t('Price each')}
                                placeholder="0"
                                value={money(l.price)}
                                onChange={(e) => update(l.key, { price: digits(e.target.value) })}
                              />
                            </label>
                            {changed && <p className="mt-1.5 text-right text-12 text-muted">{t('Shop price {price}', { price: tzs(shopPrice) })}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setPicking(true)}>
                  <Plus size={16} strokeWidth={2.25} /> {t('Add another product')}
                </button>
              </>
            )}
          </section>

          <section className="space-y-4">
            <CardHead title={t('For whom')} sub={t('Optional. Their name and number fill in the checkout for them.')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Buyer’s name')} aside={t('Optional')}>
                <input className="input" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
              </Field>
              <Field label={t('Buyer’s WhatsApp')} aside={t('Optional')}>
                <input className="input tnum" type="tel" inputMode="tel" placeholder={eg(t, '0754 123 456')} value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
              </Field>
            </div>
            <Field label={t('Note for the buyer')} aside={t('Optional')} hint={t('They see it on the bag. For example: as we agreed, delivery on Saturday.')}>
              <textarea className="input" rows={2} maxLength={300} value={buyer.note} onChange={(e) => setBuyer({ ...buyer, note: e.target.value })} />
            </Field>
          </section>
        </div>

        <aside className="mt-8 md:sticky md:top-6 md:mt-10">
          <div className="receipt px-5 pt-5 pb-6">
            <div className="space-y-2 text-14">
              {lines.length === 0 && <p className="text-muted">{t('Nothing in the bag yet')}</p>}
              {lines.map((l) => (
                <div key={l.key} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-ink-2">
                    {l.qty} × {l.product.name}
                    {l.size ? ` · ${l.size}` : ''}
                  </span>
                  <span className="font-mono text-13">{tzs((Number(l.price) || 0) * l.qty)}</span>
                </div>
              ))}
            </div>
            <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
              <span className="text-15 font-medium">{t(count === 1 ? 'Total, {n} item' : 'Total, {n} items', { n: count })}</span>
              <span className="font-mono text-20 font-medium tracking-tight">{tzs(total)}</span>
            </div>
          </div>
          <ErrorText>{error}</ErrorText>
          <button type="button" className="btn btn-lg mt-4 w-full" disabled={busy || !lines.length} onClick={make}>
            {busy ? t('Making the link') : t('Make the link')}
          </button>
          <p className="mt-3 text-center text-13 leading-5 text-muted">{t('The link works once and ends after 7 days. Delivery is agreed on WhatsApp, as always.')}</p>
        </aside>
      </div>

      <ProductPicker
        open={picking}
        title={t('Add to the bag')}
        products={products}
        disableSoldOut
        onClose={() => setPicking(false)}
        onPick={(p) => {
          const open = p.sizes?.filter((s) => s.stock !== 0) ?? []
          const size = open.length === 1 ? open[0].label : null
          setLines([...lines, { key: Date.now() + Math.random(), product: p, size, qty: 1, price: String(priceOf(p, size)) }])
          setPicking(false)
        }}
      />
    </Page>
  )
}
