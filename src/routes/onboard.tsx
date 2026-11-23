import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, Link2, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AuthLayout, StepBar } from '#/components/auth'
import { LivePhone, OrderNotice, PaymentStep, PhoneStep, PreviewAside, ProductStep, SetupNext, ShopCard, LiveStep, StepHead, previewShop, useMoveOn, useStepClock, type PreviewProduct, type PreviewService } from '#/components/setup'
import { ErrorText, Field, FieldGroup, ShopAvatar, ShopLangChoice, showFirstError } from '#/components/ui'
import { checkShopLink, checkSlug, createShop, expandSocialLink, updateSetupShop } from '#/lib/api/merchant'
import { getSetup, type SetupShop } from '#/lib/api/setup'
import { ALL_CATEGORIES, CATEGORIES, INVOICE_CATEGORIES, SERVICE_CATEGORIES, asShopKind, localPhone, normalizePhone, slugify, type ShopKind } from '#/lib/format'
import { HoursStep, ServiceStep } from '#/components/setup-services'
import { BillDetailsStep, BillPayStep, FirstInvoiceStep, sampleDoc } from '#/components/setup-invoices'
import { InvoiceDocument } from '#/components/invoice'
import type { DocData } from '#/lib/invoice'
import { eg, LANGUAGES, asLang, useLang, useT, type Lang } from '#/lib/i18n'
import { logout, setLang } from '#/lib/api/session'
import { catchInstallPrompt } from '#/lib/push'
import { SETUP_STEPS, hasPage, inSetup } from '#/lib/setup'
import { nameFromHandle, readSocialLink, type SocialFind } from '#/lib/social'

/**
 * The five-step setup (roadmap `o-flow`, decision n1; src/lib/setup.ts): 1 Your shop, 2 Your first product, 3 How buyers
 * pay, 4 Your shop is live, 5 Orders on your phone. One decision per screen; each is saved as it is passed, so a seller
 * who leaves comes back to the step they stopped at (Home sends them here until the setup is done).
 */
export const Route = createFileRoute('/onboard')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) throw redirect({ to: '/signup' })
    const shop = context.session.shop
    // An assistant never sees the owner's setup (src/lib/staff.ts).
    if (shop && (shop.role !== 'owner' || !inSetup(shop.setup))) throw redirect({ to: '/app' })
  },
  loader: () => getSetup(),
  head: () => ({ meta: [{ title: 'Set up your shop · Shopi' }] }),
  component: Onboard,
})

const stay = () => {}

function Onboard() {
  const t = useT()
  const router = useRouter()
  const data = Route.useLoaderData()
  const [draft, setDraft] = useState<PreviewProduct | null>(null)
  const [payLine, setPayLine] = useState('')
  const onDraft = useCallback((p: PreviewProduct) => setDraft(p), [])
  const [serviceDraft, setServiceDraft] = useState<PreviewService | null>(null)
  const onServiceDraft = useCallback((v: PreviewService) => setServiceDraft(v), [])
  const [invoiceDraft, setInvoiceDraft] = useState<DocData | null>(null)
  const onDoc = useCallback((d: DocData) => setInvoiceDraft(d), [])
  // Chrome offers to install Shopi once per visit: keep the offer for step 5's Install button.
  useEffect(() => catchInstallPrompt(), [])
  // Finished between loads (another tab): Home.
  useEffect(() => {
    if (data.shop && data.step == null) router.navigate({ to: '/app' })
  }, [data.shop, data.step, router])

  // Someone on the wrong account (another number, or an owner with no shop) needs a way out of setup.
  const leave = (
    <button
      type="button"
      className="text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink"
      onClick={async () => {
        await logout()
        await router.invalidate()
        router.navigate({ to: '/login' })
      }}
    >
      {t('Log out')}
    </button>
  )

  const at = data.shop ? (data.step ?? SETUP_STEPS) : 1
  // A seller who skipped the first product (or service) can add it from "Your shop is live": step 2 opens again, and
  // saving it, or "later", comes back. Nothing is stored: the shop's own step never goes back (src/lib/setup.ts).
  const [again, setAgain] = useState(false)
  const nothingYet = !!data.shop && data.shop.kind !== 'invoices' && (data.shop.kind === 'services' ? data.services.length === 0 : data.products.length === 0)
  // Back (the review of 23 Nov 2026, row 4): a step before the shop's own, opened again with what was saved. Saving
  // or passing it moves on to the step after it, until the seller is back where the shop is. Nothing is stored here
  // either: a reload shows the shop's own step.
  const [seen, setSeen] = useState<number | null>(null)
  useEffect(() => {
    if (seen != null && seen >= at) setSeen(null)
  }, [seen, at])
  const next = useCallback(() => setSeen((n) => (n == null ? null : n + 1)), [])
  const shown = seen != null && seen < at ? seen : at
  // The detour works from "Your shop is live" however the seller got there (its own turn, or Back from step 5), and
  // its save returns there: while it is open, saving moves nothing on.
  const redo = again && shown === 4 && nothingYet
  const step = redo ? 2 : shown
  const onward = redo ? stay : next
  // The step the page opened on shows at once (it may be drawn by the server); the ones after it rise in.
  const [opened] = useState(step)
  const goBack = () => {
    if (redo) setAgain(false)
    else setSeen(step - 1)
    window.scrollTo(0, 0)
  }
  const bar = <StepBar step={step} of={SETUP_STEPS} onBack={data.shop && step > 1 ? goBack : undefined} />
  const { session } = Route.useRouteContext()
  if (!data.shop || step === 1)
    return (
      <SetupNext.Provider value={onward}>
        <ShopStep key={data.shop ? 'again' : 'new'} bar={bar} leave={leave} shop={data.shop} products={data.products} services={data.shop?.kind === 'services' ? data.services : undefined} />
      </SetupNext.Provider>
    )

  const shop = data.shop
  const first = data.products[0] ?? null
  const owner = session.user?.name ?? ''
  const back = () => {
    setAgain(false)
    window.scrollTo(0, 0)
  }
  const asShop = previewShop(shop)
  // A business that sells services (roadmap `v-services`): its first service and its hours instead of a product and
  // a Lipa Namba, and bookings where a shop has orders.
  const serves = shop.kind === 'services'
  // A business that sends invoices (roadmap `v-invoices`): how it looks on invoices, how clients pay, its first invoice;
  // the preview is the invoice itself.
  const bills = shop.kind === 'invoices'
  const services: PreviewService[] | undefined = serves ? data.services : undefined
  const label = serves ? t('Your page, as clients will see it') : t('Your shop, as buyers will see it')
  const aside =
    bills && step >= 2 && step <= 4 ? (
      <PreviewAside label={t('Your invoices, as clients will see them')}>
        <InvoiceDocument doc={invoiceDraft ?? sampleDoc(shop, t)} className="max-h-[78vh] overflow-y-auto" />
      </PreviewAside>
    ) : bills && step === 5 ? (
      <>
        <p className="text-15 text-white/60">{t('What a payment looks like on your phone')}</p>
        <div className="mt-auto mb-auto flex w-full justify-center self-center">
          <OrderNotice shop={shop} product={null} bills className="scale-[1.15]" />
        </div>
      </>
    ) : step === 2 ? (
      <PreviewAside label={label}>
        {serves ? <ShopCard shop={asShop} products={[]} services={serviceDraft ? [serviceDraft] : []} /> : <ShopCard shop={asShop} products={draft ? [draft] : []} note={t('Your products go here.')} />}
      </PreviewAside>
    ) : step === 3 ? (
      <PreviewAside label={label}>
        <ShopCard shop={asShop} products={data.products} services={services} payment={serves ? undefined : payLine} />
      </PreviewAside>
    ) : step === 4 ? (
      <>
        <p className="text-15 text-white/60">{t('Open now at shopi.tz/{slug}', { slug: shop.slug })}</p>
        <div className="mt-auto mb-auto self-center">
          <LivePhone shop={shop} products={data.products} services={services} ai={data.ai} />
        </div>
      </>
    ) : (
      <>
        <p className="text-15 text-white/60">{serves ? t('What a new booking looks like') : t('What a new order looks like')}</p>
        <div className="mt-auto mb-auto flex w-full justify-center self-center">
          <OrderNotice shop={shop} product={first} service={serves ? (data.services[0] ?? null) : undefined} className="scale-[1.15]" />
        </div>
      </>
    )

  return (
    <SetupNext.Provider value={onward}>
    <AuthLayout steady topRight={leave} aside={aside}>
      <div key={step} className={step === opened ? '' : 'rise'}>
        {bills && step === 2 ? (
          <BillDetailsStep shop={shop} bar={bar} onDoc={onDoc} />
        ) : bills && step === 3 ? (
          <BillPayStep shop={shop} owner={owner} bar={bar} onDoc={onDoc} />
        ) : bills && step === 4 ? (
          <FirstInvoiceStep shop={shop} bar={bar} onDoc={onDoc} saved={data.invoice} />
        ) : bills ? (
          <PhoneStep shop={shop} product={null} bills bar={bar} login={session.user?.phone ?? ''} />
        ) : step === 2 ? (
          serves ? (
            <ServiceStep shop={shop} bar={bar} onDraft={onServiceDraft} onLater={redo ? back : undefined} editing={data.services[0] ?? null} />
          ) : (
            <ProductStep shop={shop} ai={data.ai} bar={bar} onDraft={onDraft} onLater={redo ? back : undefined} editing={data.editing} />
          )
        ) : step === 3 ? (
          serves ? <HoursStep shop={shop} bar={bar} services={data.services} /> : <PaymentStep shop={shop} owner={owner} bar={bar} onDraft={setPayLine} />
        ) : step === 4 ? (
          <LiveStep
            shop={shop}
            products={data.products}
            services={services}
            ai={data.ai}
            bar={bar}
            onAddFirst={() => {
              setAgain(true)
              window.scrollTo(0, 0)
            }}
          />
        ) : (
          <PhoneStep shop={shop} product={first} service={serves ? (data.services[0] ?? null) : undefined} bar={bar} login={session.user?.phone ?? ''} />
        )}
      </div>
    </AuthLayout>
    </SetupNext.Provider>
  )
}

/**
 * Step 1, Your shop: its name, with a quiet row to paste an Instagram or TikTok link instead (it gives the name); the
 * link, claimed as it is typed; how customers buy (products, bookings or invoices) and what kind of business it is,
 * with nothing chosen for the seller. The login number, the shop's WhatsApp and its language are one quiet line with
 * Change. Opened again with Back (`shop` given) it shows what was saved and saves the changes (`updateSetupShop`).
 */
function ShopStep({
  bar,
  leave,
  shop,
  products = [],
  services,
}: {
  bar: React.ReactNode
  leave: React.ReactNode
  /** The shop already made: this step was opened again with Back. */
  shop?: SetupShop | null
  products?: PreviewProduct[]
  services?: PreviewService[]
}) {
  const t = useT()
  const router = useRouter()
  const moveOn = useMoveOn()
  const clock = useStepClock()
  const { session } = Route.useRouteContext()
  const firstName = (session.user?.name ?? '').trim().split(/\s+/)[0]
  const login = session.user?.phone ?? ''
  const [name, setName] = useState(shop?.name ?? '')
  const [slug, setSlug] = useState(shop?.slug ?? '')
  // A link already made stays as it is when the name is corrected, unless the seller changes it too.
  const [slugTouched, setSlugTouched] = useState(!!shop)
  // Products (ordered and delivered), services (booked by time) or invoices (billed, paid later): it decides the next
  // steps and what the link shows first. A business can add the others later.
  const [kind, setKind] = useState<ShopKind>(asShopKind(shop?.kind))
  // Nothing is chosen for the seller (a chip already black read as their own answer, and most never changed it).
  const [category, setCategory] = useState(shop?.category ?? '')
  // What is missing, said on its own box.
  const [missing, setMissing] = useState<{ name?: string; slug?: string; category?: string }>({})
  const chooseKind = (next: ShopKind) => {
    if (next === kind) return
    setKind(next)
    setCategory('')
  }
  const [whatsapp, setWhatsapp] = useState(shop?.whatsapp ?? login)
  const [free, setFree] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  // A salon and a business that sends invoices have a page; a seller of products has a shop (the founder, 23 Nov 2026).
  const page = hasPage(kind)
  // A link the seller pasted from their Instagram, TikTok or WhatsApp (lib/social.ts) and what it filled in.
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [linkNote, setLinkNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [socials, setSocials] = useState({ instagram: '', tiktok: '', facebook: '' })
  // The shop's language follows the app's; choosing another also switches these screens and the seller's app to it.
  const lang = useLang()
  const [shopLang, setShopLang] = useState<Lang>(shop ? asLang(shop.lang) : lang)
  const chooseLang = async (next: Lang) => {
    setShopLang(next)
    if (next === lang) return
    await setLang({ data: { lang: next } })
    router.invalidate()
  }

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const own = !!shop && slug === shop.slug
  useEffect(() => {
    if (slug.length < 3 || own) {
      setFree(own ? true : null)
      setChecking(false)
      return
    }
    setChecking(true)
    const id = setTimeout(async () => {
      // Its own former links are free to a shop; to a new one every link in use is taken.
      if (shop) setFree((await checkShopLink({ data: { slug } })).state === 'free')
      else setFree((await checkSlug({ data: { slug } })).free)
      setChecking(false)
    }, 350)
    return () => clearTimeout(id)
  }, [slug, own]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = own ? (
    <span className="text-muted">{t('This is your link today.')}</span>
  ) : slug.length < 3 ? (
    <span className="text-muted">{t('At least 3 letters or numbers')}</span>
  ) : checking ? (
    <span className="flex items-center gap-1.5 text-muted">
      <Loader2 size={14} className="animate-spin" /> {t('Checking')}
    </span>
  ) : free ? (
    <span className="flex items-center gap-1.5 text-ok">
      <Check size={14} strokeWidth={2.25} /> {t('Available')}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-bad">
      <X size={14} strokeWidth={2.25} /> {t('Taken. Try another')}
    </span>
  )

  function applyFind(found: SocialFind | null) {
    if (!found) return setLinkNote({ ok: false, text: t('We can’t read that link. Copy it from your Instagram, TikTok or WhatsApp profile.') })
    if (found.kind === 'hidden') {
      setDetails(true)
      return setLinkNote({ ok: false, text: t('That WhatsApp link hides the number. Type your WhatsApp number below.') })
    }
    if (found.kind === 'whatsapp') {
      setWhatsapp(normalizePhone(found.phone) || `+${found.phone}`)
      return setLinkNote({ ok: true, text: t('Buyers will message you on {phone}.', { phone: localPhone(normalizePhone(found.phone) || `+${found.phone}`) }) })
    }
    if (found.kind === 'short') return
    const site = found.kind === 'instagram' ? 'Instagram' : found.kind === 'tiktok' ? 'TikTok' : 'Facebook'
    setSocials((s) => ({ ...s, [found.kind]: found.kind === 'facebook' ? `facebook.com/${found.handle}` : found.handle }))
    const named = !!name.trim()
    if (!named) {
      setName(nameFromHandle(found.handle))
      setMissing((m) => ({ ...m, name: undefined, slug: undefined }))
    }
    setLinkNote({
      ok: true,
      text: named ? t('Your {site} is added to your shop.', { site }) : t('From your {site}: a name and a link to start from. Change them if they are not right.', { site }),
    })
  }

  async function readLink(value: string) {
    setLink(value)
    if (!value.trim()) return setLinkNote(null)
    // Wait for something that looks like a whole link before saying it can't be read.
    if (!/[./]/.test(value) || value.trim().length < 8) return setLinkNote(null)
    const found = readSocialLink(value)
    if (found?.kind !== 'short') return applyFind(found)
    setLinkNote({ ok: true, text: t('Opening your link') })
    applyFind((await expandSocialLink({ data: { url: found.url } })).found)
  }

  const langName = LANGUAGES.find(([id]) => id === shopLang)?.[1] ?? 'Kiswahili'
  const categoryLabel = category ? t(ALL_CATEGORIES.find((c) => c.id === category)?.label ?? 'Other') : ''
  // What the pasted link does, said on its row: it names the shop, or (with a name typed) joins the shop's page.
  const linkDoes = name.trim() ? (page ? t('We add it to your page.') : t('We add it to your shop.')) : page ? t('We take your business name from it.') : t('We take your shop name from it.')
  const number = localPhone(normalizePhone(whatsapp) || whatsapp)
  const sameNumber = (normalizePhone(whatsapp) || whatsapp) === login

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || checking) return
    setError('')
    const noName = page ? t('Enter your business name.') : t('Enter a shop name.')
    const gaps: typeof missing = {}
    if (!name.trim()) gaps.name = noName
    if (slug.length < 3) gaps.slug = t('At least 3 letters or numbers')
    else if (free === false) gaps.slug = t('That link is taken. Try another.')
    if (!category) gaps.category = kind === 'products' ? t('Choose what you sell.') : t('Choose your kind of business.')
    setMissing(gaps)
    if (Object.keys(gaps).length) return showFirstError()
    setBusy(true)
    try {
      const sent = { name, slug, category, kind, whatsapp, lang: shopLang, ...socials }
      const res = shop ? await updateSetupShop({ data: sent }) : await createShop({ data: { ...sent, seconds: clock() } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'staff') return setError(t('This number helps run another shop on Shopi. To open your own shop, sign up with another number.'))
        // Finished in another tab meanwhile: Home has it from here.
        if (res.error === 'done') return void router.navigate({ to: '/app' })
        if (res.error === 'name') setMissing({ name: noName })
        else if (res.error === 'many') setMissing({ slug: t('This shop has changed its link several times. Write to hello@shopi.tz and we will change it for you.') })
        else if (res.error === 'limit') setMissing({ slug: t('You changed your link a few times today. Try again tomorrow.') })
        else setMissing({ slug: res.error === 'slug' ? t('At least 3 letters or numbers') : t('That link is taken. Try another.') })
        return showFirstError()
      }
      await moveOn()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <AuthLayout
      steady
      topRight={leave}
      aside={
        <PreviewAside label={page ? t('Your page, as clients will see it') : t('Your shop, as buyers will see it')}>
          <ShopCard
            shop={{ name, slug, logo: shop?.logo_key ?? null, category, bio: shop?.bio }}
            products={kind === 'products' ? products : []}
            services={kind === 'services' ? (services ?? []) : undefined}
            note={(kind === 'services' ? services?.length : kind === 'products' && products.length) ? undefined : kind === 'services' ? t('Your services go here. You add them next.') : t('Your products go here. You add them next.')}
          />
        </PreviewAside>
      }
    >
      <StepHead
        bar={bar}
        title={page ? t('Your page') : t('Your shop')}
        sub={
          shop
            ? t('Change what is not right, then continue.')
            : page
              ? firstName
                ? t('Welcome, {name}. A name and a link, and your page is open.', { name: firstName })
                : t('A name and a link, and your page is open.')
              : firstName
                ? t('Welcome, {name}. A name and a link, and your shop is open.', { name: firstName })
                : t('A name and a link, and your shop is open.')
        }
      />

      <div className="mt-6 flex items-center gap-3 rounded-16 bg-card p-3 shadow-[inset_0_0_0_1px_var(--color-line)] lg:hidden">
        <ShopAvatar name={name || 'S'} logo={shop?.logo_key ?? null} className="h-11 w-11 text-15" />
        <div className="min-w-0">
          <p className="truncate text-15 font-semibold">{name || (page ? t('Your business') : t('Your shop'))}</p>
          <p className="code truncate text-13 text-muted">shopi.tz/{slug || 'yourshop'}</p>
        </div>
        {categoryLabel && <span className="ml-auto hidden shrink-0 rounded-full bg-page px-2.5 py-1 text-12 text-ink-2 min-[400px]:inline">{categoryLabel}</span>}
      </div>

      <form className="mt-6 space-y-5" onSubmit={save}>
        <div>
          <Field label={page ? t('Business name') : t('Shop name')} error={missing.name}>
            <input
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setMissing((m) => ({ ...m, name: undefined, slug: undefined }))
              }}
            />
          </Field>
          {/* Optional, so it is one quiet row under the name: it opens to paste, and says what the link is used for. */}
          {linkOpen ? (
            <div className="fade mt-3">
              <Field
                label={t('Your Instagram or TikTok link')}
                aside={t('Optional')}
                hint={
                  linkNote ? (
                    <span className={`flex items-start gap-1.5 ${linkNote.ok ? 'text-ink-2' : 'text-bad'}`}>
                      {linkNote.ok && <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" />}
                      {linkNote.text}
                    </span>
                  ) : (
                    linkDoes
                  )
                }
              >
                <span className="input flex items-center gap-2.5">
                  <Link2 size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    value={link}
                    autoFocus
                    onChange={(e) => readLink(e.target.value)}
                    placeholder={eg(t, 'instagram.com/zurifashion')}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </span>
              </Field>
            </div>
          ) : (
            <button type="button" className="group mt-1 flex min-h-11 w-full items-center gap-2.5 py-1.5 text-left" onClick={() => setLinkOpen(true)}>
              <Link2 size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
              <span className="min-w-0 text-13 leading-5 text-muted">
                <span className="font-medium text-ink-2 underline decoration-line-strong underline-offset-4 group-hover:text-ink">{t('Paste your Instagram or TikTok link')}</span>
                {'. '}
                {linkDoes}
              </span>
            </button>
          )}
        </div>
        <Field
          label={page ? t('Page link') : t('Shop link')}
          error={missing.slug}
          hint={
            <>
              {!missing.slug && status}
              <span className="mt-1 block text-muted">{t('You can change it later in Shop settings.')}</span>
            </>
          }
        >
          <span className={`input flex items-center ${free === false && !checking && slug.length >= 3 ? 'shadow-[inset_0_0_0_1.5px_var(--color-bad)]' : ''}`}>
            <span className="text-muted">shopi.tz/</span>
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={slug}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value, { typing: true }))
                setMissing((m) => ({ ...m, slug: undefined }))
              }}
            />
          </span>
        </Field>
        {/* Asked in the seller's words: a photographer sells neither "products" nor "services" in their own head. */}
        <FieldGroup label={t('How do customers buy from you?')} radio hint={t('You can add the others later.')}>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['products', t('They order products')],
                ['services', t('They book a time')],
                ['invoices', t('I send them an invoice')],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={kind === id}
                onClick={() => chooseKind(id)}
                className={`flex min-h-12 items-start rounded-16 px-4 py-3.5 text-left text-15 leading-5 font-medium transition-colors ${kind === id ? 'bg-ink text-white' : 'bg-card shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-well'}`}
              >
                {title}
              </button>
            ))}
          </div>
        </FieldGroup>
        <FieldGroup label={kind === 'products' ? t('What kind of products?') : t('What kind of business?')} error={missing.category}>
          <div className="flex flex-wrap gap-2">
            {(kind === 'services' ? SERVICE_CATEGORIES : kind === 'invoices' ? INVOICE_CATEGORIES : CATEGORIES).map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={category === c.id}
                onClick={() => {
                  setCategory(c.id)
                  setMissing((m) => ({ ...m, category: undefined }))
                }}
              >
                {t(c.label)}
              </button>
            ))}
          </div>
        </FieldGroup>

        {details ? (
          <div className="fade space-y-5 rounded-16 bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <ShopLangChoice
              value={shopLang}
              onChange={chooseLang}
              hint={page ? t('Clients see your page in this language. You can change it later in Shop settings.') : t('Buyers see your shop in this language. You can change it later in Shop settings.')}
            />
            <Field
              label={page ? t('Business WhatsApp') : t('Shop WhatsApp')}
              hint={page ? t('Clients message you here. You still log in with {phone}.', { phone: localPhone(login) }) : t('Buyers message you here about orders. You still log in with {phone}.', { phone: localPhone(login) })}
            >
              <input className="input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </Field>
          </div>
        ) : (
          // The number typed at sign-up, shown back: it is the login, and until changed the WhatsApp buyers message.
          <div className="flex items-start justify-between gap-1 rounded-16 bg-well/70 py-1.5 pr-1.5 pl-4">
            <p className="min-w-0 py-1.5 text-14 leading-5 text-ink-2">
              {sameNumber
                ? page
                  ? t('You log in with {phone} and clients message it.', { phone: localPhone(login) })
                  : t('You log in with {phone} and buyers message it.', { phone: localPhone(login) })
                : page
                  ? t('You log in with {phone}. Clients message {whatsapp}.', { phone: localPhone(login), whatsapp: number })
                  : t('You log in with {phone}. Buyers message {whatsapp}.', { phone: localPhone(login), whatsapp: number })}
              <span className="mt-0.5 block text-13 text-muted">{page ? t('Clients see your page in {language}.', { language: langName }) : t('Buyers see your shop in {language}.', { language: langName })}</span>
            </p>
            <button type="button" className="flex min-h-11 shrink-0 items-center px-3 text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => setDetails(true)}>
              {t('Change')}
            </button>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        {/* Never greyed out: a tap says what is missing, on its own box. */}
        <button className="btn btn-lg w-full" disabled={busy}>
          {shop ? (busy ? t('Saving') : t('Save and continue')) : busy ? (page ? t('Opening your page') : t('Opening your shop')) : page ? t('Open my page') : t('Open my shop')}
        </button>
      </form>
    </AuthLayout>
  )
}
