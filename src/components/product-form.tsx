import { useBlocker, useRouteContext, useRouter } from '@tanstack/react-router'
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { WriteItForMe } from '#/components/ai-write'
import { ShareActions, prettyUrl } from '#/components/share'
import { Tag } from '#/components/shop'
import { ErrorText, Field, Img, Sheet, Switch, Toast, TopBar } from '#/components/ui'
import { deleteProduct, saveProduct, type ProductRow } from '#/lib/api/merchant'
import { track } from '#/lib/analytics'
import { OPTION_KINDS, SIZE_PRESETS, optionKind, tzs, type OptionKind } from '#/lib/format'
import { useT } from '#/lib/i18n'
import { uploadImage } from '#/lib/upload'
import { useOrigin } from '#/lib/share'

const MAX_PHOTOS = 6
const FORM_ID = 'product-form'
/** One option as typed: stock and price as digits ('' = not counted / the product's price), image as a photo key ('' = none). */
type SizeRow = { label: string; stock: string; price: string; image: string }
const KINDS = Object.keys(OPTION_KINDS) as OptionKind[]
/** What a seller might type for each kind, as a hint in the empty field. */
const EXAMPLE: Record<OptionKind, string> = { size: 'M', colour: 'Red', style: 'Long sleeve', model: 'iPhone 13', flavour: 'Vanilla' }
const blankRow = (): SizeRow => ({ label: '', stock: '', price: '', image: '' })

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
    sizes: product?.sizes
      ? product.sizes.map((s) => ({ label: s.label, stock: s.stock == null ? '' : String(s.stock), price: s.price ? String(s.price) : '', image: s.image ?? '' }))
      : null,
    option: optionKind(product?.option_name),
    pick: product?.pick_rank != null,
  }
}

/** A shop has up to this many top picks (MAX_PICKS in src/server/picks.ts). */
const MAX_PICKS = 4

/** picks: the shop's top picks (product ids), so the form knows whether there is room for this one. */
export function ProductForm({ product, title, back, top, picks = [] }: { product?: ProductRow; title: string; back: string; top?: ReactNode; picks?: string[] }) {
  const t = useT()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const start = useRef(initial(product))
  const [form, setForm] = useState(start.current.form)
  const [images, setImages] = useState<string[]>(start.current.images)
  const [sizes, setSizes] = useState<SizeRow[] | null>(start.current.sizes)
  const [option, setOption] = useState<OptionKind>(start.current.option)
  const [pick, setPick] = useState(start.current.pick)
  // Room for one more pick: a product already in them always has its place.
  const pickRoom = start.current.pick || picks.filter((id) => id !== product?.id).length < MAX_PICKS
  // The option whose photo is being chosen.
  const [photoFor, setPhotoFor] = useState<number | null>(null)
  const kind = OPTION_KINDS[option]
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedOne, setSavedOne] = useState(false)
  // A ref, not state: navigation runs before React re-renders, and the blocker must already know.
  const leaving = useRef(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })

  const dirty =
    JSON.stringify({ form, images, sizes, option, pick }) !==
      JSON.stringify({ form: start.current.form, images: start.current.images, sizes: start.current.sizes, option: start.current.option, pick: start.current.pick }) ||
    uploading > 0
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
        sizes: sizes
          ? sizes.filter((s) => s.label.trim()).map((s) => ({ label: s.label.trim(), stock: s.stock, price: s.price, image: images.includes(s.image) ? s.image : null }))
          : [],
        option_name: option,
        // Only a change is sent: the server then puts it in the picks (if there is room) or takes it out.
        pick: pick !== start.current.pick ? pick : undefined,
      },
    })
    setBusy(false)
    if ('error' in res)
      return setError(
        res.error === 'name'
          ? t('Give the product a name.')
          : res.error === 'limit'
            ? t('A free shop holds up to 300 products. Tembo has no limit.')
            : t('Enter a price.'),
      )
    if (again) {
      const blank = initial()
      start.current = blank
      setForm(blank.form)
      setImages(blank.images)
      setSizes(blank.sizes)
      setOption(blank.option)
      setPick(blank.pick)
      // The next product needs to know whether the picks have room left.
      if (pick) router.invalidate()
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
          {top}
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
                    <Img size="thumb" k={k} alt="" className="h-[150px] w-[120px]" />
                  </button>
                  {i === 0 && <span className="absolute bottom-2 left-2 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-white">{t('Main')}</span>}
                  <button
                    type="button"
                    aria-label={t('Remove photo')}
                    onClick={() => {
                      setImages(images.filter((x) => x !== k))
                      setSizes(sizes ? sizes.map((x) => (x.image === k ? { ...x, image: '' } : x)) : null)
                    }}
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
              <div>
                <Field label={t('Description')} aside={t('Optional')}>
                  <textarea className="input" value={form.description} onChange={set('description')} placeholder={t('Fabric, fit, colours, how to care for it')} />
                </Field>
                <WriteItForMe
                  name={form.name}
                  notes={form.description}
                  option={option}
                  options={(sizes ?? []).map((r) => r.label).filter(Boolean)}
                  onText={(text) => setForm((f) => ({ ...f, description: text }))}
                />
              </div>
            </div>
          </Card>

          <Card title={t('Options and stock')}>
            <Switch
              label={t('Buyers choose an option')}
              sub={t('A size, colour or style, each with its own stock, and its own price or photo if you like')}
              checked={!!sizes}
              onChange={(on) => setSizes(on ? (start.current.sizes?.length ? start.current.sizes : []) : null)}
            />
            {sizes ? (
              <div className="fade mt-5">
                <p className="label">{t('What buyers choose')}</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('What buyers choose')}>
                  {KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={option === k}
                      aria-pressed={option === k}
                      className="chip"
                      onClick={() => {
                        setOption(k)
                        if (k !== 'size' && sizes.length === 0) setSizes([blankRow()])
                      }}
                    >
                      {t(OPTION_KINDS[k].label)}
                    </button>
                  ))}
                </div>
                {sizes.length === 0 && option !== 'size' ? (
                  <button type="button" className="btn btn-quiet btn-sm mt-5" onClick={() => setSizes([blankRow()])}>
                    <Plus size={15} strokeWidth={2} /> {t('Add an option')}
                  </button>
                ) : sizes.length === 0 ? (
                  <div className="mt-5">
                    <p className="text-[14px] text-muted">{t('Start from a set')}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {SIZE_PRESETS.map((p) => (
                        <button key={p.label} type="button" className="chip" onClick={() => setSizes(p.sizes.map((label) => ({ ...blankRow(), label })))}>
                          {t(p.label)} <span className="text-muted">{p.sizes.length > 1 ? `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}` : p.sizes[0]}</span>
                        </button>
                      ))}
                      <button type="button" className="chip" onClick={() => setSizes([blankRow()])}>
                        <Plus size={14} strokeWidth={2} /> {t('My own')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5">
                    <div className="space-y-3">
                      {sizes.map((s, i) => {
                        const setRow = (patch: Partial<SizeRow>) => setSizes(sizes.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                        const withPhotos = images.length >= 2
                        return (
                          <div
                            key={i}
                            className={`grid items-center gap-x-3 gap-y-2 ${withPhotos ? 'grid-cols-[44px_minmax(0,1fr)_40px] sm:grid-cols-[44px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_40px]' : 'grid-cols-[minmax(0,1fr)_40px] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_40px]'}`}
                          >
                            {withPhotos && (
                              <button
                                type="button"
                                aria-label={s.image ? t('Change the photo for {option}', { option: s.label || t(kind.label) }) : t('Choose a photo for {option}', { option: s.label || t(kind.label) })}
                                onClick={() => setPhotoFor(i)}
                                className={`row-span-2 h-11 w-11 self-start overflow-hidden rounded-[12px] transition-colors sm:order-1 sm:row-span-1 ${s.image && images.includes(s.image) ? '' : 'flex items-center justify-center border border-dashed border-line-strong text-faint hover:border-ink hover:text-ink'}`}
                              >
                                {s.image && images.includes(s.image) ? <Img size="thumb" k={s.image} alt="" className="h-full w-full" /> : <ImagePlus size={17} strokeWidth={1.5} />}
                              </button>
                            )}
                            <input
                              className="input h-11 sm:order-2"
                              value={s.label}
                              aria-label={t(kind.label)}
                              placeholder={EXAMPLE[option]}
                              onChange={(e) => setRow({ label: e.target.value })}
                            />
                            <button type="button" className="icon-btn sm:order-5" aria-label={t('Remove option')} onClick={() => setSizes(sizes.filter((_, j) => j !== i))}>
                              <X size={16} strokeWidth={1.75} />
                            </button>
                            <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
                              <label className="input flex h-11 items-center gap-2 px-3 sm:order-3">
                                <span className="shrink-0 text-[13px] text-muted">{t('Stock')}</span>
                                <input
                                  className="tnum min-w-0 flex-1 bg-transparent text-right outline-none"
                                  inputMode="numeric"
                                  value={s.stock}
                                  aria-label={t('In stock')}
                                  placeholder={t('Any')}
                                  onChange={(e) => setRow({ stock: e.target.value.replace(/\D/g, '') })}
                                />
                              </label>
                              <label className="input flex h-11 items-center gap-2 px-3 sm:order-4">
                                <span className="shrink-0 text-[13px] text-muted">TSh</span>
                                <input
                                  className="tnum min-w-0 flex-1 bg-transparent text-right outline-none"
                                  inputMode="numeric"
                                  value={s.price ? Number(s.price).toLocaleString('en-US') : ''}
                                  aria-label={t('Price for {option}', { option: s.label || t(kind.label) })}
                                  placeholder={price ? price.toLocaleString('en-US') : t('Price')}
                                  onChange={(e) => setRow({ price: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setSizes([...sizes, blankRow()])}>
                      <Plus size={15} strokeWidth={2} /> {t('Add an option')}
                    </button>
                    <p className="hint">
                      {t('Stock left empty is not counted; at 0 an option shows as sold out. A price left empty is the product’s price.')}
                      {images.length >= 2 ? ` ${t('Give an option a photo and it shows when buyers choose it.')}` : ''}
                    </p>
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
            <div className="mt-4 border-t border-line pt-4">
              <Switch
                label={t('Top pick')}
                sub={
                  pick
                    ? t('Buyers see it first, above the rest of your shop')
                    : pickRoom
                      ? t('One of up to 4 products buyers see first')
                      : t('Your 4 top picks are taken. Change them on Products.')
                }
                checked={pick}
                disabled={!pick && !pickRoom}
                onChange={setPick}
              />
            </div>
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
              {images[0] ? <Img size="thumb" k={images[0]} alt="" className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-faint"><ImagePlus size={24} strokeWidth={1.5} /></div>}
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
      <Sheet
        open={photoFor != null && !!sizes?.[photoFor]}
        onClose={() => setPhotoFor(null)}
        title={t('Photo for {option}', { option: (photoFor != null && sizes?.[photoFor]?.label) || t(kind.label) })}
      >
        <p className="-mt-1 mb-4 text-[14px] text-muted">{t('Buyers see it when they choose this option.')}</p>
        <div className="grid grid-cols-3 gap-2">
          {images.map((k) => {
            const on = photoFor != null && sizes?.[photoFor]?.image === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                className={`relative overflow-hidden rounded-[12px] transition-shadow ${on ? 'shadow-[0_0_0_2px_var(--color-ink)]' : ''}`}
                onClick={() => {
                  if (sizes && photoFor != null) setSizes(sizes.map((x, j) => (j === photoFor ? { ...x, image: k } : x)))
                  setPhotoFor(null)
                }}
              >
                <Img size="thumb" k={k} alt="" className="aspect-[4/5] w-full" />
                {on && (
                  <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="btn btn-ghost mt-4 w-full"
          onClick={() => {
            if (sizes && photoFor != null) setSizes(sizes.map((x, j) => (j === photoFor ? { ...x, image: '' } : x)))
            setPhotoFor(null)
          }}
        >
          {t('No photo of its own')}
        </button>
      </Sheet>
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
export function PriceInput({ value, onValue, placeholder }: { value: string; onValue: (digits: string) => void; placeholder: string }) {
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
