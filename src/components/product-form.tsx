import { useBlocker, useRouteContext, useRouter } from '@tanstack/react-router'
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { ShareActions, prettyUrl } from '#/components/share'
import { Tag } from '#/components/shop'
import { ErrorText, Field, Img, Switch, Toast, TopBar } from '#/components/ui'
import { deleteProduct, saveProduct, type ProductRow } from '#/lib/api/merchant'
import { track } from '#/lib/analytics'
import { SIZE_PRESETS, tzs } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { uploadImage } from '#/lib/upload'
import { useOrigin } from '#/lib/share'

const MAX_PHOTOS = 6
const FORM_ID = 'product-form'
type SizeRow = { label: string; stock: string }

function initial(product?: ProductRow) {
  return {
    form: {
      name: product?.name ?? '',
      description: product?.description ?? '',
      price: product?.price ? String(product.price) : '',
      compare_price: product?.compare_price ? String(product.compare_price) : '',
      stock: product?.stock == null ? '' : String(product.stock),
      active: product ? !!product.active : true,
    },
    images: product?.images ?? [],
    sizes: product?.sizes ? product.sizes.map((s) => ({ label: s.label, stock: s.stock == null ? '' : String(s.stock) })) : null,
  }
}

export function ProductForm({ product, title, back }: { product?: ProductRow; title: string; back: string }) {
  const t = useT()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const start = useRef(initial(product))
  const [form, setForm] = useState(start.current.form)
  const [images, setImages] = useState<string[]>(start.current.images)
  const [sizes, setSizes] = useState<SizeRow[] | null>(start.current.sizes)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedOne, setSavedOne] = useState(false)
  // A ref, not state: navigation runs before React re-renders, and the blocker must already know.
  const leaving = useRef(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })

  const dirty =
    JSON.stringify({ form, images, sizes }) !== JSON.stringify({ form: start.current.form, images: start.current.images, sizes: start.current.sizes }) || uploading > 0
  useBlocker({
    shouldBlockFn: () => !leaving.current && dirty && !window.confirm(t('Leave without saving? Your changes to this product will be lost.')),
    enableBeforeUnload: () => !leaving.current && dirty,
  })

  async function addFiles(files: FileList | null) {
    if (!files) return
    const list = Array.from(files).slice(0, MAX_PHOTOS - images.length - uploading)
    setUploading((n) => n + list.length)
    for (const f of list) {
      try {
        const key = await uploadImage(f)
        setImages((prev) => [...prev, key])
      } catch {
        setError(t('A photo failed to upload. Check your connection and try again.'))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  async function save(again: boolean) {
    setBusy(true)
    setError('')
    const res = await saveProduct({
      data: {
        ...form,
        id: product?.id,
        images,
        sizes: sizes ? sizes.filter((s) => s.label.trim()).map((s) => ({ label: s.label.trim(), stock: s.stock })) : [],
      },
    })
    setBusy(false)
    if ('error' in res) return setError(res.error === 'name' ? t('Give the product a name.') : t('Enter a price.'))
    if (again) {
      const blank = initial()
      start.current = blank
      setForm(blank.form)
      setImages(blank.images)
      setSizes(blank.sizes)
      setSavedOne(true)
      setTimeout(() => setSavedOne(false), 2200)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    leaving.current = true
    router.navigate({ to: '/app/products' })
  }

  const price = Number(form.price.replace(/\D/g, '')) || 0
  const was = Number(form.compare_price.replace(/\D/g, '')) || 0

  return (
    <>
      <TopBar
        back={back}
        title={title}
        right={
          <button form={FORM_ID} className="btn btn-sm h-10 px-5" disabled={busy || uploading > 0}>
            {uploading > 0 && <Loader2 size={15} className="animate-spin" />}
            {uploading > 0 ? t('Waiting for photos') : busy ? t('Saving') : t('Save')}
          </button>
        }
      />
      <form
        id={FORM_ID}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
      >
        <div className="min-w-0 space-y-4">
          <Card title={t('Photos')} sub={t('Up to 6. The first one is the main photo; tap another to make it the main one.')}>
            <div className="hide-scroll -mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
              {images.map((k, i) => (
                <div key={k} className="relative shrink-0">
                  <button
                    type="button"
                    className="block overflow-hidden rounded-[14px]"
                    aria-label={i === 0 ? t('Main photo') : t('Make this the main photo')}
                    onClick={() => i > 0 && setImages([k, ...images.filter((x) => x !== k)])}
                  >
                    <Img k={k} alt="" className="h-[150px] w-[120px]" />
                  </button>
                  {i === 0 && <span className="absolute bottom-2 left-2 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-white">{t('Main')}</span>}
                  <button
                    type="button"
                    aria-label={t('Remove photo')}
                    onClick={() => setImages(images.filter((x) => x !== k))}
                    className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-card/95 shadow-[0_1px_2px_rgb(10_10_10/0.15)] transition-colors hover:bg-card"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {Array.from({ length: uploading }).map((_, i) => (
                <div key={`u${i}`} className="flex h-[150px] w-[120px] shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] bg-well text-[12px] text-muted">
                  <Loader2 size={20} className="animate-spin" />
                  {t('Uploading')}
                </div>
              ))}
              {images.length + uploading < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-[150px] w-[120px] shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong text-[13px] font-medium transition-colors hover:border-ink hover:bg-page"
                >
                  <ImagePlus size={22} strokeWidth={1.5} />
                  {images.length ? t('Add more') : t('Add photos')}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          </Card>

          <Card title={t('Details')}>
            <div className="space-y-4">
              <Field label={t('Name')}>
                <input className="input" value={form.name} onChange={set('name')} placeholder={t('e.g. Kitenge maxi dress')} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('Price')}>
                  <PriceInput value={form.price} onValue={(v) => setForm({ ...form, price: v })} placeholder="35,000" />
                </Field>
                <Field label={t('Was')} aside={t('For a sale')}>
                  <PriceInput value={form.compare_price} onValue={(v) => setForm({ ...form, compare_price: v })} placeholder={t('Optional')} />
                </Field>
              </div>
              <Field label={t('Description')} aside={t('Optional')}>
                <textarea className="input" value={form.description} onChange={set('description')} placeholder={t('Fabric, fit, colours, how to care for it')} />
              </Field>
            </div>
          </Card>

          <Card title={t('Sizes and stock')}>
            <Switch
              label={t('This product comes in sizes')}
              sub={t('Buyers pick a size before they order')}
              checked={!!sizes}
              onChange={(on) => setSizes(on ? (start.current.sizes?.length ? start.current.sizes : []) : null)}
            />
            {sizes ? (
              <div className="fade mt-5">
                {sizes.length === 0 ? (
                  <div>
                    <p className="text-[14px] text-muted">{t('Start from a set')}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {SIZE_PRESETS.map((p) => (
                        <button key={p.label} type="button" className="chip" onClick={() => setSizes(p.sizes.map((label) => ({ label, stock: '' })))}>
                          {t(p.label)} <span className="text-muted">{p.sizes.length > 1 ? `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}` : p.sizes[0]}</span>
                        </button>
                      ))}
                      <button type="button" className="chip" onClick={() => setSizes([{ label: '', stock: '' }])}>
                        <Plus size={14} strokeWidth={2} /> {t('My own')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-x-3 px-1 pb-2 text-[13px] text-muted">
                      <span>{t('Size')}</span>
                      <span>{t('In stock')}</span>
                    </div>
                    <div className="space-y-2">
                      {sizes.map((s, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-x-3">
                          <input
                            className="input h-11"
                            value={s.label}
                            aria-label={t('Size')}
                            placeholder="M"
                            onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                          />
                          <input
                            className="input tnum h-11"
                            inputMode="numeric"
                            value={s.stock}
                            aria-label={t('In stock')}
                            placeholder={t('Not counted')}
                            onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, stock: e.target.value.replace(/\D/g, '') } : x)))}
                          />
                          <button type="button" className="icon-btn" aria-label={t('Remove size')} onClick={() => setSizes(sizes.filter((_, j) => j !== i))}>
                            <X size={16} strokeWidth={1.75} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setSizes([...sizes, { label: '', stock: '' }])}>
                      <Plus size={15} strokeWidth={2} /> {t('Add a size')}
                    </button>
                    <p className="hint">{t('Leave stock empty for sizes you do not count. A size at 0 shows as sold out.')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5">
                <Field label={t('In stock')} hint={t('Leave empty if it never runs out. At 0 it shows as sold out.')}>
                  <input className="input tnum" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, '') })} placeholder={t('Not counted')} />
                </Field>
              </div>
            )}
          </Card>

          <Card>
            <Switch
              label={t('Show in my shop')}
              sub={form.active ? t('Buyers can see and order it') : t('Hidden from buyers. Only you can see it')}
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
            />
          </Card>

          {product?.active ? (
            <div className="lg:hidden">
              <SendCard product={product} />
            </div>
          ) : null}

          <div className="space-y-3 lg:hidden">
            <ErrorText>{error}</ErrorText>
            <SaveButtons product={product} busy={busy} uploading={uploading} onAgain={() => save(true)} />
          </div>

          {product && (
            <button
              type="button"
              className="btn mt-4 w-full bg-transparent text-bad hover:bg-bad/[0.06] lg:w-auto"
              onClick={async () => {
                if (!window.confirm(t('Delete this product? This cannot be undone.'))) return
                await deleteProduct({ data: { id: product.id } })
                leaving.current = true
                router.navigate({ to: '/app/products' })
              }}
            >
              <Trash2 size={16} strokeWidth={1.6} /> {t('Delete product')}
            </button>
          )}
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-8 lg:block">
          <div className="card p-5">
            <p className="text-[13px] text-muted">{t('In your shop')}</p>
            <div className="relative mt-3 aspect-[4/5] overflow-hidden rounded-[14px] bg-well">
              {images[0] ? <Img k={images[0]} alt="" className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-faint"><ImagePlus size={24} strokeWidth={1.5} /></div>}
              {was > price && price > 0 && (
                <div className="absolute top-2.5 left-2.5">
                  <Tag hot>−{Math.round((1 - price / was) * 100)}%</Tag>
                </div>
              )}
            </div>
            <p className="mt-3 truncate text-[14px]">{form.name || t('Product name')}</p>
            <p className="tnum flex items-baseline gap-2 text-[14px] font-medium">
              {price ? tzs(price) : 'TSh —'}
              {was > price && price > 0 && <span className="text-[13px] font-normal text-muted line-through">{tzs(was)}</span>}
            </p>
            {sizes && sizes.some((s) => s.label.trim()) && (
              <p className="meta mt-1 truncate">
                {sizes
                  .filter((s) => s.label.trim() && s.stock !== '0')
                  .map((s) => s.label.trim())
                  .join(' · ')}
              </p>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
          <SaveButtons product={product} busy={busy} uploading={uploading} onAgain={() => save(true)} />
          {product?.active ? <SendCard product={product} /> : null}
        </aside>
      </form>
      <Toast show={savedOne}>
        <Check size={16} strokeWidth={2.25} /> {t('Saved. Add the next one')}
      </Toast>
    </>
  )
}

/** Send one product to a buyer: the link opens straight on it, with its photo and price in the WhatsApp preview. */
function SendCard({ product }: { product: ProductRow }) {
  const t = useT()
  const { shop } = useRouteContext({ from: '/app' })
  const url = `${useOrigin()}/${shop.slug}/${product.slug ?? product.id}`
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">{t('Send this product')}</h2>
      <p className="code mt-1 truncate text-[12px] text-muted">{prettyUrl(url)}</p>
      <div className="mt-4">
        <ShareActions
          url={url}
          title={product.name}
          text={t('Hi, here is {name} for {price}. You can order it here:', { name: product.name, price: tzs(product.price) })}
          onShared={(how) => track('seller_share', { shopId: shop.id, productId: product.id, detail: how })}
        />
      </div>
    </section>
  )
}

function SaveButtons({ product, busy, uploading, onAgain }: { product?: ProductRow; busy: boolean; uploading: number; onAgain: () => void }) {
  const t = useT()
  return (
    <div className="space-y-2">
      <button form={FORM_ID} className="btn btn-lg w-full" disabled={busy || uploading > 0}>
        {uploading > 0 && <Loader2 size={16} className="animate-spin" />}
        {uploading > 0 ? t('Waiting for photos to upload') : busy ? t('Saving') : product ? t('Save changes') : t('Save product')}
      </button>
      {!product && (
        <button type="button" className="btn btn-ghost w-full" disabled={busy || uploading > 0} onClick={onAgain}>
          {t('Save and add another')}
        </button>
      )}
    </div>
  )
}

function Card({ title, sub, children }: { title?: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
      {sub && <p className="mt-1 text-[13px] leading-5 text-muted">{sub}</p>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

/** Shillings with thousands separators as you type; the form keeps digits only. */
function PriceInput({ value, onValue, placeholder }: { value: string; onValue: (digits: string) => void; placeholder: string }) {
  const digits = value.replace(/\D/g, '')
  return (
    <span className="input flex items-center gap-2 px-4">
      <span className="text-[14px] text-muted">TSh</span>
      <input
        className="tnum min-w-0 flex-1 bg-transparent outline-none"
        inputMode="numeric"
        value={digits ? Number(digits).toLocaleString('en-US') : ''}
        onChange={(e) => onValue(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder={placeholder}
      />
    </span>
  )
}
