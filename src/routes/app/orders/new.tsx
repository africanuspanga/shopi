import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Minus, PackagePlus, PenLine, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useHideFloatingNav } from '#/components/floating-nav'
import { ProductPicker } from '#/components/product-picker'
import { CardHead, ErrorText, Field, Img, Page, Switch, TopBar } from '#/components/ui'
import { listMyProducts, recordSale, type ProductRow } from '#/lib/api/merchant'
import { PAYMENT_LABEL, priceOf, tzs, type PaymentMethod } from '#/lib/format'
import { eg, useT } from '#/lib/i18n'

export const Route = createFileRoute('/app/orders/new')({
  loader: () => listMyProducts(),
  head: () => ({ meta: [{ title: 'Record a sale · Shopi' }] }),
  component: RecordSale,
})

type Line = { key: number; product?: ProductRow; name: string; price: string; qty: number; size: string | null }

const PAYMENTS: PaymentMethod[] = ['cash', 'lipa', 'mobile', 'bank']
/** Today in Tanzania time, as YYYY-MM-DD for the date field. */
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9)
const money = (s: string) => (s ? Number(s).toLocaleString('en-US') : '')

function RecordSale() {
  const t = useT()
  const router = useRouter()
  const navigate = useNavigate()
  const products = Route.useLoaderData()
  const [lines, setLines] = useState<Line[]>([])
  const [picking, setPicking] = useState(false)
  const [buyer, setBuyer] = useState({ name: '', phone: '' })
  const [payment, setPayment] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(today())
  const [handed, setHanded] = useState(true)
  const [takeStock, setTakeStock] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A form keeps the seller's attention on finishing: no capsule here.
  useHideFloatingNav(true)

  const total = lines.reduce((s, l) => s + (Number(l.price) || 0) * l.qty, 0)
  const hasProducts = lines.some((l) => l.product)
  const update = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const add = (l: Omit<Line, 'key'>) => setLines([...lines, { ...l, key: Date.now() + Math.random() }])

  async function save() {
    const ready = lines.filter((l) => (l.product || l.name.trim()) && Number(l.price) > 0)
    if (!ready.length) return setError(t('Add what you sold, with its price.'))
    const noSize = ready.find((l) => l.product?.sizes && !l.size)
    if (noSize) return setError(t('Choose a size for {product}.', { product: noSize.product!.name }))
    setBusy(true)
    setError('')
    // Noon Tanzania time on the chosen day, so the sale lands on that day; today means now.
    const at = date === today() ? Date.now() : new Date(`${date}T12:00:00+03:00`).getTime()
    const res = await recordSale({
      data: {
        lines: ready.map((l) => ({ productId: l.product?.id, name: l.name, price: Number(l.price), qty: l.qty, size: l.size })),
        name: buyer.name,
        phone: buyer.phone,
        payment,
        date: at,
        status: handed ? 'delivered' : 'confirmed',
        takeStock,
        note,
      },
    })
    setBusy(false)
    if ('error' in res) return setError(res.error === 'size' ? t('Choose a size for {product}.', { product: res.product ?? '' }) : t('Add what you sold, with its price.'))
    await router.invalidate()
    navigate({ to: '/app/orders/$id', params: { id: res.id } })
  }

  return (
    <Page wide>
      <TopBar back="/app/orders" title={t('Record a sale')} sub={t('A sale made in person, on a call or in a WhatsApp chat. It counts in your sales.')} />
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-10">
        <div className="space-y-8">
          <section>
            <CardHead title={t('What was sold')} />
            {lines.length > 0 && (
              <div className="card mt-3 divide-y divide-line overflow-hidden">
                {lines.map((l) => (
                  <div key={l.key} className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      {l.product ? (
                        <>
                          <Img size="thumb" k={l.product.images[0]} alt={l.product.name} className="h-12 w-10 shrink-0 rounded-8" />
                          <p className="min-w-0 flex-1 truncate text-15 font-medium">{l.product.name}</p>
                        </>
                      ) : (
                        <input
                          className="input h-11 min-w-0 flex-1"
                          value={l.name}
                          placeholder={t('What you sold')}
                          aria-label={t('What you sold')}
                          onChange={(e) => update(l.key, { name: e.target.value })}
                        />
                      )}
                      <button type="button" className="icon-btn shrink-0" aria-label={t('Remove')} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <X size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                    {l.product?.sizes && (
                      <div className="flex flex-wrap gap-2">
                        {l.product.sizes.map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            className="chip h-9 px-3"
                            aria-pressed={l.size === s.label}
                            onClick={() =>
                              update(l.key, {
                                size: s.label,
                                // The price follows the option until the seller types one of their own.
                                price: l.product && l.price === String(priceOf(l.product, l.size)) ? String(priceOf(l.product, s.label)) : l.price,
                              })
                            }
                          >
                            {s.label}
                            {s.stock != null && <span className="text-12 opacity-60">{s.stock}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
                        <button type="button" className="flex h-11 w-11 items-center justify-center" aria-label={t('Fewer')} onClick={() => update(l.key, { qty: Math.max(1, l.qty - 1) })}>
                          <Minus size={16} strokeWidth={2.25} />
                        </button>
                        <span className="tnum w-6 text-center text-15">{l.qty}</span>
                        <button type="button" className="flex h-11 w-11 items-center justify-center" aria-label={t('More')} onClick={() => update(l.key, { qty: Math.min(999, l.qty + 1) })}>
                          <Plus size={16} strokeWidth={2.25} />
                        </button>
                      </div>
                      <label className="input flex h-11 min-w-0 flex-1 items-center gap-1.5 px-3">
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
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {products.length > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                  <PackagePlus size={16} strokeWidth={1.75} /> {t('Add from your products')}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => add({ name: '', price: '', qty: 1, size: null })}>
                <PenLine size={16} strokeWidth={1.75} /> {t('Something else')}
              </button>
            </div>
          </section>

          <section>
            <CardHead title={t('How they paid')} />
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('How they paid')}>
              {PAYMENTS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={payment === m} className="chip" aria-pressed={payment === m} onClick={() => setPayment(m)}>
                  {t(PAYMENT_LABEL[m])}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <CardHead title={t('Details')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Buyer’s name')} aside={t('Optional')}>
                <input className="input" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
              </Field>
              <Field label={t('Buyer’s phone')} aside={t('Optional')}>
                <input className="input tnum" type="tel" inputMode="tel" placeholder={eg(t, '0754 123 456')} value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
              </Field>
              <Field label={t('Date of the sale')}>
                <input className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value || today())} />
              </Field>
              <Field label={t('Note')} aside={t('Optional')}>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <div className="card divide-y divide-line px-5">
              <div className="py-3">
                <Switch
                  label={t('Already handed over')}
                  sub={handed ? t('The buyer has it.') : t('Paid, still to send. It waits in Orders under To send.')}
                  checked={handed}
                  onChange={setHanded}
                />
              </div>
              {hasProducts && (
                <div className="py-3">
                  <Switch label={t('Take it from stock')} sub={t('Cancelling the sale later puts it back.')} checked={takeStock} onChange={setTakeStock} />
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="mt-8 md:sticky md:top-6 md:mt-10">
          <div className="receipt px-5 pt-5 pb-6">
            <div className="space-y-2 text-14">
              {lines.length === 0 && <p className="text-muted">{t('Nothing added yet')}</p>}
              {lines.map((l) => (
                <div key={l.key} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-ink-2">
                    {l.qty} × {l.product?.name || l.name || t('Item')}
                    {l.size ? ` · ${l.size}` : ''}
                  </span>
                  <span className="font-mono text-13">{tzs((Number(l.price) || 0) * l.qty)}</span>
                </div>
              ))}
            </div>
            <div className="receipt-rule mt-4 flex items-baseline justify-between pt-4">
              <span className="text-15 font-medium">{t('Total')}</span>
              <span className="font-mono text-20 font-medium tracking-tight">{tzs(total)}</span>
            </div>
          </div>
          <ErrorText>{error}</ErrorText>
          <button type="button" className="btn btn-lg mt-4 w-full" disabled={busy} onClick={save}>
            {busy ? t('Saving') : t('Record sale')}
          </button>
        </aside>
      </div>

      <ProductPicker
        open={picking}
        title={t('Add from your products')}
        products={products}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          const size = p.sizes?.length === 1 ? p.sizes[0].label : null
          add({ product: p, name: p.name, price: String(priceOf(p, size)), qty: 1, size })
          setPicking(false)
        }}
      />
    </Page>
  )
}
