import { Link, useRouter } from '@tanstack/react-router'
import { Bell, Check, ChevronDown, ChevronRight, Download, ImagePlus, Loader2, Plus, QrCode as QrCodeIcon, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WriteBio, WriteItForMe } from '#/components/ai-write'
import { InstallSheet } from '#/components/phone-app'
import { PriceInput } from '#/components/product-form'
import { QrSheet } from '#/components/qr-sheet'
import { ShareActions } from '#/components/share'
import { Phone } from '#/components/showcase'
import { ErrorText, Field, FieldGroup, Img, Sheet, ShopAvatar, Toast } from '#/components/ui'
import { saveProduct } from '#/lib/api/merchant'
import { passSetupStep, saveSetupPayment, saveShopBio, type SetupProduct, type SetupShop } from '#/lib/api/setup'
import { track } from '#/lib/analytics'
import { ALL_CATEGORIES, NETWORKS, SIZE_PRESETS, tzs } from '#/lib/format'
import { durationText, servicePrice } from '#/lib/booking'
import { useT } from '#/lib/i18n'
import { usePhoneApp } from '#/lib/push'
import { useOrigin } from '#/lib/share'
import type { SetupOutcome } from '#/lib/setup'
import { uploadImage } from '#/lib/upload'

/*
 * The five-step setup's screens after the first (src/routes/onboard.tsx holds the route and step 1; the rules are in
 * src/lib/setup.ts). Each step saves what it asks at once and moves the shop on; reloading the route shows the next step.
 */

/** Seconds since the step's screen opened, for /admin's "how long each step takes". */
export function useStepClock() {
  const start = useRef(Date.now())
  return () => Math.round((Date.now() - start.current) / 1000)
}

/** Passes a step and reloads the route, which then shows the next one. False when the connection failed. */
export function usePass(step: number) {
  const router = useRouter()
  const clock = useStepClock()
  return async (outcome: SetupOutcome) => {
    try {
      await passSetupStep({ data: { step, outcome, seconds: clock() } })
      await router.invalidate()
      window.scrollTo(0, 0)
      return true
    } catch {
      return false
    }
  }
}

export type PreviewShop = { name: string; slug: string; logo: string | null; category: string; bio?: string }
export type PreviewProduct = { name: string; price: number; image: string | null; uploading?: boolean }
/** A service in the preview of a business that takes bookings (roadmap `v-services`). */
export type PreviewService = { name: string; duration: number; price: number; price_from: number | boolean }

export const previewShop = (s: SetupShop): PreviewShop => ({ name: s.name, slug: s.slug, logo: s.logo_key, category: s.category, bio: s.bio })

/** The shop as buyers will see it, taking shape as the seller works: name, line, products, how to pay. */
export function ShopCard({
  shop,
  products,
  services,
  payment,
  bio,
  note,
}: {
  shop: PreviewShop
  products: PreviewProduct[]
  /** Given for a business that sells services: its services show as rows with Book, where products show as a grid. */
  services?: PreviewService[]
  payment?: string
  bio?: ReactNode
  note?: string
}) {
  const t = useT()
  const category = t(ALL_CATEGORIES.find((c) => c.id === shop.category)?.label ?? 'Other')
  return (
    <div className="w-full rounded-28 bg-card p-5 text-ink sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <p className="code min-w-0 truncate text-13 text-muted">shopi.tz/{shop.slug || 'yourshop'}</p>
        {!services && (
          <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-1 pl-3 text-12 font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
            {t('Bag')} <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink text-12 text-white">0</span>
          </span>
        )}
      </div>
      <div className="pt-5">
        <ShopAvatar name={shop.name || 'S'} logo={shop.logo} className="h-14 w-14 text-17" />
        <p className={`display mt-4 text-28 break-words ${shop.name ? '' : 'text-faint'}`}>{shop.name || t('Your shop')}</p>
        {bio ?? (shop.bio ? <p className="mt-2 text-14 leading-relaxed text-ink-2">{shop.bio}</p> : null)}
        <span className="mt-3 inline-flex h-8 items-center rounded-full bg-page px-3 text-13 text-ink-2">{category}</span>
      </div>
      {services && (
        <ul className="mt-5 space-y-2">
          {(services.length ? services : [{ name: '', duration: 0, price: 0, price_from: 0 }]).slice(0, 3).map((v, i) => (
            <li key={i} className="flex items-center gap-3 rounded-14 bg-page px-3 py-3">
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-14 font-medium ${v.name ? '' : 'text-faint'}`}>{v.name || t('Service name')}</span>
                <span className="block truncate text-12 text-muted">{[v.duration ? durationText(t, v.duration) : '', servicePrice(t, v)].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className="flex h-8 shrink-0 items-center rounded-full bg-ink px-3 text-12 font-medium text-white">{t('Book')}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={`mt-5 grid grid-cols-3 gap-2 ${services ? 'hidden' : ''}`}>
        {[0, 1, 2].map((i) => {
          const p = products[i]
          return p ? (
            <div key={i} className="min-w-0">
              <div className="relative aspect-[4/5] overflow-hidden rounded-12 bg-well">
                {p.image ? <Img size="thumb" k={p.image} alt="" className="h-full w-full" /> : <span className="flex h-full items-center justify-center text-faint"><ImagePlus size={18} strokeWidth={1.75} /></span>}
                {p.uploading && (
                  <span className="absolute inset-0 flex items-center justify-center bg-card/60">
                    <Loader2 size={18} className="animate-spin" />
                  </span>
                )}
              </div>
              <p className={`mt-1.5 truncate text-12 ${p.name ? '' : 'text-faint'}`}>{p.name || t('Product name')}</p>
              <p className="tnum text-12 font-medium">{p.price ? tzs(p.price) : 'TSh —'}</p>
            </div>
          ) : (
            <div key={i} className="flex aspect-[4/5] items-center justify-center rounded-12 bg-well text-faint">
              <ImagePlus size={18} strokeWidth={1.75} />
            </div>
          )
        })}
      </div>
      {payment && <p className="mt-4 rounded-14 bg-page px-3 py-2.5 text-13 leading-5 text-ink-2">{payment}</p>}
      {note && <p className="mt-4 text-13 text-muted">{note}</p>}
    </div>
  )
}

/** Desktop: the preview on the dark panel, under a line saying what it is. */
export function PreviewAside({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <p className="text-15 text-white/60">{label}</p>
      <div className="mt-auto mb-auto w-full max-w-[440px] self-center shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]">{children}</div>
    </>
  )
}

/** Phones: the same preview as a small card that opens it. */
export function PreviewToggle({ shop, children }: { shop: PreviewShop; children: ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center gap-3 rounded-16 bg-card p-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-well lg:hidden"
      >
        <ShopAvatar name={shop.name || 'S'} logo={shop.logo} className="h-11 w-11 text-15" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-15 font-semibold">{shop.name}</span>
          <span className="code block truncate text-13 text-muted">shopi.tz/{shop.slug}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 pr-1 text-13 font-medium text-ink-2">
          {t('Preview')} <ChevronRight size={16} strokeWidth={1.75} />
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Your shop, as buyers will see it')}>
        <div className="rounded-28 shadow-[inset_0_0_0_1px_var(--color-line)]">{children}</div>
      </Sheet>
    </>
  )
}

/** The step's heading: the bar, the title and one line under it. */
export function StepHead({ bar, title, sub }: { bar: ReactNode; title: string; sub: ReactNode }) {
  return (
    <>
      {bar}
      <h1 className="title mt-6 text-32 md:text-40">{title}</h1>
      <p className="mt-2 text-15 leading-relaxed text-muted">{sub}</p>
    </>
  )
}

/* ---------- Step 2: the first product ---------- */

const MAX_PHOTOS = 6

export function ProductStep({ shop, ai, bar, onDraft }: { shop: SetupShop; ai: boolean; bar: ReactNode; onDraft: (p: PreviewProduct) => void }) {
  const t = useT()
  const pass = usePass(2)
  const fileRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(0)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [sizes, setSizes] = useState<string[] | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The preview on the right (and in the phone's sheet) follows the form.
  useEffect(() => onDraft({ name, price: Number(price) || 0, image: images[0] ?? null, uploading: uploading > 0 && !images.length }), [name, price, images, uploading, onDraft])

  async function addFiles(files: FileList | null) {
    if (!files) return
    const list = Array.from(files).slice(0, MAX_PHOTOS - images.length - uploading)
    setUploading((n) => n + list.length)
    setError('')
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

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || uploading) return
    if (!images.length) return setError(t('Add a photo of it. Buyers order what they can see.'))
    setBusy(true)
    setError('')
    try {
      const res = await saveProduct({
        data: {
          name,
          description,
          price,
          images,
          sizes: (sizes ?? []).map((label) => ({ label, stock: '' })),
          option_name: 'size',
          active: true,
        },
      })
      if ('error' in res) {
        setBusy(false)
        return setError(res.error === 'name' ? t('Give the product a name.') : res.error === 'limit' ? t('A free shop holds up to 300 products. Tembo has no limit.') : t('Enter a price.'))
      }
    } catch {
      setBusy(false)
      return setError(t('Something went wrong. Try again.'))
    }
    // The product is saved; if moving on fails, a reload shows the next step anyway (the product answers step 2).
    if (!(await pass('done'))) {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  async function skip() {
    setBusy(true)
    setError('')
    if (!(await pass('skip'))) {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <>
      <StepHead bar={bar} title={t('Your first product')} sub={t('A photo, a name and a price. Buyers can order it the moment you save it.')} />
      <PreviewToggle shop={previewShop(shop)}>
        <ShopCard shop={previewShop(shop)} products={[{ name, price: Number(price) || 0, image: images[0] ?? null, uploading: uploading > 0 && !images.length }]} />
      </PreviewToggle>
      <form className="mt-6 space-y-5" onSubmit={save}>
        <FieldGroup label={t('Photos')}>
          <div className="hide-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {images.map((k, i) => (
              <div key={k} className="relative shrink-0">
                <Img size="thumb" k={k} alt="" className={`rounded-14 ${i === 0 ? 'h-[160px] w-[128px]' : 'h-[160px] w-[96px]'}`} />
                {i === 0 && images.length > 1 && <span className="absolute bottom-2 left-2 rounded-full bg-ink px-2.5 py-1 text-11 font-medium text-white">{t('Main')}</span>}
                <button
                  type="button"
                  aria-label={t('Remove photo')}
                  onClick={() => setImages(images.filter((x) => x !== k))}
                  className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-card/95 shadow-[0_1px_2px_rgb(10_10_10/0.15)] transition-colors hover:bg-card"
                >
                  <X size={14} strokeWidth={2.25} />
                </button>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`u${i}`} className="flex h-[160px] w-[128px] shrink-0 flex-col items-center justify-center gap-2 rounded-14 bg-well text-12 text-muted">
                <Loader2 size={20} className="animate-spin" />
                {t('Uploading')}
              </div>
            ))}
            {images.length + uploading < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`flex h-[160px] shrink-0 flex-col items-center justify-center gap-2 rounded-14 border border-dashed border-line-strong px-3 text-center text-13 font-medium transition-colors hover:border-ink hover:bg-card ${images.length || uploading ? 'w-[96px]' : 'w-full max-w-[220px]'}`}
              >
                <ImagePlus size={24} strokeWidth={1.75} />
                {images.length || uploading ? t('Add more') : t('Add a photo')}
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
        </FieldGroup>
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Kitenge maxi dress')} />
        </Field>
        <Field label={t('Price')}>
          <PriceInput value={price} onValue={setPrice} placeholder="35,000" />
        </Field>
        <div>
          <Field label={t('Description')} aside={t('Optional')}>
            <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('Fabric, fit, colours, how to care for it')} />
          </Field>
          {ai && <WriteItForMe name={name} notes={description} option="size" options={sizes ?? []} onText={setDescription} />}
        </div>

        <div className="rounded-16 bg-card shadow-[inset_0_0_0_1px_var(--color-line)]">
          <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-15 font-medium" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
            {sizes?.length ? t('Sizes: {sizes}', { sizes: sizes.join(' · ') }) : t('Buyers choose a size')}
            <ChevronDown size={18} strokeWidth={1.75} className={`shrink-0 text-muted transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          {moreOpen && (
            <div className="fade border-t border-line px-4 pt-3 pb-4">
              <div className="flex flex-wrap gap-2">
                {SIZE_PRESETS.map((p) => (
                  <button key={p.label} type="button" className="chip" aria-pressed={sizes?.join() === p.sizes.join()} onClick={() => setSizes(sizes?.join() === p.sizes.join() ? null : p.sizes)}>
                    {t(p.label)} <span className="text-muted">{p.sizes.length > 1 ? `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}` : p.sizes[0]}</span>
                  </button>
                ))}
              </div>
              <p className="hint">{t('Stock and your own sizes: on Products, after setup.')}</p>
            </div>
          )}
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex flex-col gap-3">
          <button className="btn btn-lg w-full" disabled={busy || uploading > 0}>
            {uploading > 0 && <Loader2 size={16} className="animate-spin" />}
            {uploading > 0 ? t('Waiting for photos to upload') : busy ? t('Saving') : t('Save and continue')}
          </button>
          <button type="button" className="btn btn-lg btn-ghost w-full" disabled={busy} onClick={skip}>
            {t('I’ll do this later')}
          </button>
        </div>
        <p className="text-center text-14 text-muted">
          {t('Many products?')}{' '}
          <Link to="/app/products/import" className="font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            {t('Import them from a sheet')}
          </Link>
        </p>
      </form>
    </>
  )
}

/* ---------- Step 3: how buyers pay ---------- */

/** "Pay with M-Pesa 5512345, or cash on delivery": the payment line the preview shows. */
export function paymentLine(t: ReturnType<typeof useT>, p: { network: string; number: string; cod: boolean }) {
  if (p.network && p.number) return p.cod ? t('Pay with {network} {number}, or cash on delivery', { network: p.network, number: p.number }) : t('Pay with {network} {number}', { network: p.network, number: p.number })
  return p.cod ? t('Cash on delivery') : ''
}

export function PaymentStep({ shop, bar, onDraft }: { shop: SetupShop; bar: ReactNode; onDraft: (line: string) => void }) {
  const t = useT()
  const router = useRouter()
  const pass = usePass(3)
  const clock = useStepClock()
  const [network, setNetwork] = useState(shop.lipa_network)
  const [number, setNumber] = useState(shop.lipa_number)
  const [name, setName] = useState(shop.lipa_name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cod = !!shop.cod_enabled

  useEffect(() => onDraft(paymentLine(t, { network, number, cod })), [network, number, cod, onDraft, t])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await saveSetupPayment({ data: { network, number, name, seconds: clock() } })
      if ('error' in res) {
        setBusy(false)
        return setError(
          res.error === 'network' ? t('Choose the network your number is on.') : res.error === 'number' ? t('Enter your Lipa Namba or number.') : t('Enter the name buyers see when they pay.'),
        )
      }
      await router.invalidate()
      window.scrollTo(0, 0)
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  async function cashOnly() {
    setBusy(true)
    setError('')
    if (!(await pass(cod ? 'done' : 'skip'))) {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <>
      <StepHead
        bar={bar}
        title={t('How buyers pay')}
        sub={cod ? t('Buyers pay you directly; Shopi never holds your money. Cash on delivery is on. Add your Lipa Namba so buyers can also pay before you send.') : t('Buyers pay you directly; Shopi never holds your money. Add your Lipa Namba so buyers can pay before you send.')}
      />
      <PreviewToggle shop={previewShop(shop)}>
        <ShopCard shop={previewShop(shop)} products={[]} payment={paymentLine(t, { network, number, cod })} />
      </PreviewToggle>
      <form className="mt-6 space-y-5" onSubmit={save}>
        <FieldGroup label={t('Network')}>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={network === n} onClick={() => setNetwork(n)}>
                {n}
              </button>
            ))}
          </div>
        </FieldGroup>
        <Field label={t('Lipa Namba or number')}>
          <input className="input code" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="5512345" />
        </Field>
        <Field label={t('Name on payments')} hint={t('Exactly as it shows on the payment SMS. We use it to check buyers’ proof.')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={shop.name.toUpperCase()} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-col gap-3">
          <button className="btn btn-lg w-full" disabled={busy}>
            {busy ? t('Saving') : t('Save and continue')}
          </button>
          <button type="button" className="btn btn-lg btn-ghost w-full" disabled={busy} onClick={cashOnly}>
            {cod ? t('Only cash on delivery for now') : t('I’ll do this later')}
          </button>
        </div>
      </form>
    </>
  )
}

/* ---------- Step 4: the shop is live ---------- */

export function LiveStep({ shop, products, services, ai, bar }: { shop: SetupShop; products: SetupProduct[]; services?: PreviewService[]; ai: boolean; bar: ReactNode }) {
  const t = useT()
  const pass = usePass(4)
  const origin = useOrigin()
  const url = `${origin}/${shop.slug}`
  const [qrOpen, setQrOpen] = useState(false)
  const [igOpen, setIgOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shared = (how: string) => track('seller_share', { shopId: shop.id, detail: `setup-${how}` })

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('', url)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
    shared('copy')
  }

  return (
    <>
      <StepHead
        bar={bar}
        title={t('Your shop is live')}
        sub={
          services
            ? services.length && !shop.book
              ? t('Your link works now. Set your working hours from Home so clients can book, then share it.')
              : services.length
              ? t('Send your link and clients can book. Put it in your Instagram bio so every visitor finds it.')
              : t('Your link works now. Add your first service, then share it so clients have something to book.')
            : products.length
              ? t('Send your link and buyers can order. Put it in your Instagram bio so every visitor finds it.')
              : t('Your link works now. Add your first product from Home, then share it so buyers have something to order.')
        }
      />

      <section className="mt-6 rounded-20 bg-card p-5 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <p className="text-13 text-muted">{t('Your shop link')}</p>
        <p className="code mt-1 truncate text-17">shopi.tz/{shop.slug}</p>
        <div className="mt-4">
          <ShareActions url={url} title={shop.name} text={services ? t('You can now book with us here:') : t('My shop is open. You can order here:')} onShared={shared} />
        </div>
        {/* May wrap: in Swahili the label is long ("QR code ya kuchapisha au kuweka mtandaoni"). */}
        <button type="button" className="btn btn-ghost btn-sm mt-2 h-auto min-h-11 w-full py-2 text-center leading-5 whitespace-normal" onClick={() => setQrOpen(true)}>
          <QrCodeIcon size={16} strokeWidth={1.75} className="shrink-0" /> {t('QR code to print or post')}
        </button>
      </section>

      <div className="mt-4 lg:hidden">
        <div className="rounded-28 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <LiveCard shop={shop} products={products} services={services} ai={ai} />
        </div>
      </div>

      <section className="mt-4 rounded-20 bg-card shadow-[inset_0_0_0_1px_var(--color-line)]">
        <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" aria-expanded={igOpen} onClick={() => setIgOpen(!igOpen)}>
          <span className="min-w-0">
            <span className="block text-15 font-medium">{t('Put it in your Instagram bio')}</span>
            <span className="block text-13 text-muted">{t('Three steps, about a minute')}</span>
          </span>
          <ChevronDown size={18} strokeWidth={1.75} className={`shrink-0 text-muted transition-transform ${igOpen ? 'rotate-180' : ''}`} />
        </button>
        {igOpen && (
          <div className="fade border-t border-line px-5 pt-4 pb-5">
            <BioSteps onCopy={copy} copied={copied} />
          </div>
        )}
      </section>

      {error && (
        <div className="mt-6">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <button
        type="button"
        className="btn btn-lg mt-6 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          if (!(await pass('done'))) {
            setBusy(false)
            setError(t('Something went wrong. Try again.'))
          }
        }}
      >
        {t('Continue')}
      </button>
      <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} />
      <Toast show={copied}>{t('Link copied')}</Toast>
    </>
  )
}

/** Instagram's own steps to a link in the bio, with the link to copy. */
export function BioSteps({ onCopy, copied }: { onCopy: () => void; copied: boolean }) {
  const t = useT()
  const steps = [t('Open Instagram, go to your profile and tap Edit profile.'), t('Tap Links, then Add external link.'), t('Paste your shop link and tap Done.')]
  return (
    <>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-14 leading-5">
            <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-12 font-medium text-white">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-quiet btn-sm mt-4" onClick={onCopy}>
        {copied ? <Check size={16} strokeWidth={2.25} /> : null}
        {copied ? t('Copied') : t('Copy my link')}
      </button>
      <p className="hint">{t('On TikTok it goes under Edit profile, Website. Shopi ticks this off when a buyer arrives from Instagram or TikTok.')}</p>
    </>
  )
}

/** The live shop card with its line about the shop: the seller can add or change it here, with the AI's help. */
export function LiveCard({ shop, products, services, ai }: { shop: SetupShop; products: SetupProduct[]; services?: PreviewService[]; ai: boolean }) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [bio, setBio] = useState(shop.bio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const slot = (
    <button type="button" onClick={() => setOpen(true)} className="group mt-2 block w-full text-left">
      {shop.bio ? (
        <span className="text-14 leading-relaxed text-ink-2 underline decoration-line-strong decoration-dashed underline-offset-4 group-hover:decoration-ink">{shop.bio}</span>
      ) : (
        <span className="flex items-center gap-2 rounded-12 border border-dashed border-line-strong px-3 py-2.5 text-13 font-medium text-ink-2 transition-colors group-hover:border-ink">
          <Plus size={16} strokeWidth={2.25} /> {t('Add a line about your shop')}
        </span>
      )}
    </button>
  )
  return (
    <>
      <ShopCard shop={previewShop(shop)} products={products} services={services} bio={slot} />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('A line about your shop')}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            try {
              await saveShopBio({ data: { bio } })
              await router.invalidate()
              setOpen(false)
            } catch {
              setError(t('Something went wrong. Try again.'))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field label={t('Short bio')} aside={`${bio.length}/300`} hint={t('Buyers read it under your shop’s name.')}>
            <textarea className="input" maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('e.g. Kitenge outfits made in Sinza. Delivery across Dar the same day.')} />
          </Field>
          <WriteBio notes={bio} onText={setBio} ready={ai} />
          {error && (
            <div className="mt-4">
              <ErrorText>{error}</ErrorText>
            </div>
          )}
          <button className="btn btn-lg mt-5 w-full" disabled={busy}>
            {busy ? t('Saving') : t('Save')}
          </button>
        </form>
      </Sheet>
    </>
  )
}

/** Desktop: the live shop in a phone, as buyers open it. */
export function LivePhone({ shop, products, services, ai }: { shop: SetupShop; products: SetupProduct[]; services?: PreviewService[]; ai: boolean }) {
  return (
    <Phone className="mx-auto h-[600px] w-[300px] xl:h-[640px] xl:w-[316px]">
      <div className="hide-scroll h-full overflow-y-auto px-2 pt-12 pb-4">
        <LiveCard shop={shop} products={products} services={services} ai={ai} />
      </div>
    </Phone>
  )
}

/* ---------- Step 5: orders on this phone ---------- */

/** What a new order looks like on the seller's phone, with the shop's own first product. */
export function OrderNotice({
  shop,
  product,
  service,
  bills = false,
  className = '',
}: {
  shop: SetupShop
  product: SetupProduct | null
  /** A business that takes bookings: the notice shows a new booking. */
  service?: PreviewService | null
  /** A business that sends invoices: the notice shows a payment to check. */
  bills?: boolean
  className?: string
}) {
  const t = useT()
  return (
    <div className={`w-full max-w-[340px] rounded-20 bg-card p-4 text-ink shadow-[var(--shadow-float)] ring-1 ring-line ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-13 font-semibold">
          <ShopAvatar name={shop.name} logo={shop.logo_key} className="h-6 w-6 text-11" />
          <span className="truncate">Shopi</span>
        </p>
        <p className="meta shrink-0">{t('now')}</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {service === undefined && product?.image && <Img size="thumb" k={product.image} alt="" className="h-[52px] w-[42px] shrink-0 rounded-8" />}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-14 font-medium">
            <span className="signal shrink-0" />{' '}
            {bills
              ? t('Check a payment: {amount}', { amount: tzs(250_000) })
              : service !== undefined
                ? t('New booking: {name}', { name: 'Neema' })
                : product
                  ? t('New order: {total}', { total: tzs(product.price) })
                  : t('New order')}
          </p>
          <p className="truncate text-12 text-muted">
            {bills
              ? t('{client} sent the payment SMS for {number}.', { client: 'Bahari Logistics', number: 'INV-0001' })
              : service !== undefined
                ? [service?.name, t('Tomorrow'), '10:00'].filter(Boolean).join(' · ')
                : (product?.name ?? shop.name)}
          </p>
        </div>
      </div>
    </div>
  )
}

export function PhoneStep({ shop, product, service, bills = false, bar }: { shop: SetupShop; product: SetupProduct | null; service?: PreviewService | null; bills?: boolean; bar: ReactNode }) {
  const t = useT()
  const router = useRouter()
  const pass = usePass(5)
  const app = usePhoneApp()
  const [guide, setGuide] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function on() {
    setError('')
    const res = await app.turnOn()
    if (res === 'ok') app.test()
    else if (res === 'error') setError(t('Notifications didn’t turn on. Try again.'))
  }

  async function finish() {
    setBusy(true)
    setError('')
    if (await pass(app.state === 'on' ? 'done' : 'skip')) return router.navigate({ to: '/app' })
    setBusy(false)
    setError(t('Something went wrong. Try again.'))
  }

  // Something the seller could still do on this screen: turn notifications on, or (iPhone) install first.
  const waiting = app.state === 'off' || app.state === 'loading' || app.state === 'ios'
  const status =
    app.state === 'on'
      ? t('Notifications are on for this phone.')
      : app.state === 'ios'
        ? t('On iPhone, put Shopi on your Home Screen first. Then open it from there and turn on notifications.')
        : app.state === 'blocked'
          ? t('Notifications are blocked for shopi.tz on this phone. Allow them in your browser’s site settings, then come back.')
          : app.state === 'unsupported'
            ? t('This browser can’t show notifications. On Android use Chrome; on iPhone use Safari and add Shopi to your Home Screen.')
            : ''

  return (
    <>
      {bills ? (
        <StepHead bar={bar} title={t('Payments on your phone')} sub={t('A notification when a client opens your invoice or sends the payment SMS, even when Shopi is closed. And Shopi on your Home Screen, one tap from your invoices.')} />
      ) : service !== undefined ? (
        <StepHead bar={bar} title={t('Bookings on your phone')} sub={t('A notification the moment a client books, even when Shopi is closed. And Shopi on your Home Screen, one tap from your diary.')} />
      ) : (
        <StepHead bar={bar} title={t('Orders on your phone')} sub={t('A notification the moment a buyer orders, even when Shopi is closed. And Shopi on your Home Screen, one tap from your orders.')} />
      )}
      <div className="mt-6 flex justify-center rounded-20 bg-well px-4 py-6 lg:hidden">
        <OrderNotice shop={shop} product={product} service={service} bills={bills} />
      </div>
      {status && (
        <p className="mt-6 flex items-start gap-2.5 text-15 leading-6">
          {app.state === 'on' ? <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" /> : <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-faint" aria-hidden />}
          {status}
        </p>
      )}
      <div className="mt-6 space-y-3">
        <ErrorText>{error}</ErrorText>
        {(app.state === 'off' || app.state === 'loading') && (
          <button type="button" className="btn btn-lg w-full" disabled={app.busy || app.state === 'loading'} onClick={on}>
            <Bell size={18} strokeWidth={1.75} /> {t('Turn on notifications')}
          </button>
        )}
        {!app.installed && app.state !== 'loading' && (
          <button type="button" className={`btn btn-lg w-full ${app.state === 'ios' ? '' : 'btn-ghost'}`} onClick={() => (app.canInstall ? app.install() : setGuide(true))}>
            <Download size={18} strokeWidth={1.75} /> {app.canInstall ? t('Install the app') : t('Put Shopi on your Home Screen')}
          </button>
        )}
        {/* Main once there is nothing left to turn on here (on, blocked, or a browser without notifications). */}
        <button type="button" className={`btn btn-lg w-full ${waiting ? 'btn-ghost' : ''}`} disabled={busy} onClick={finish}>
          {waiting ? t('Not now, go to my shop') : t('Go to my shop')}
        </button>
      </div>
      <InstallSheet open={guide} onClose={() => setGuide(false)} app={app} />
    </>
  )
}
