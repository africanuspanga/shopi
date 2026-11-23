import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, Link2, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AuthLayout, StepBar } from '#/components/auth'
import { LivePhone, OrderNotice, PaymentStep, PhoneStep, PreviewAside, ProductStep, ShopCard, LiveStep, StepHead, previewShop, useStepClock, type PreviewProduct, type PreviewService } from '#/components/setup'
import { ErrorText, Field, FieldGroup, ShopAvatar, ShopLangChoice, showFirstError } from '#/components/ui'
import { checkSlug, createShop, expandSocialLink } from '#/lib/api/merchant'
import { getSetup } from '#/lib/api/setup'
import { ALL_CATEGORIES, CATEGORIES, INVOICE_CATEGORIES, SERVICE_CATEGORIES, localPhone, normalizePhone, slugify, type ShopKind } from '#/lib/format'
import { HoursStep, ServiceStep } from '#/components/setup-services'
import { BillDetailsStep, BillPayStep, FirstInvoiceStep, sampleDoc } from '#/components/setup-invoices'
import { InvoiceDocument } from '#/components/invoice'
import type { DocData } from '#/lib/invoice'
import { LANGUAGES, useLang, useT, type Lang } from '#/lib/i18n'
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
  const redo = again && at === 4 && nothingYet
  const step = redo ? 2 : at
  // The step the page opened on shows at once (it may be drawn by the server); the ones after it rise in.
  const [opened] = useState(step)
  const bar = <StepBar step={step} of={SETUP_STEPS} />
  const { session } = Route.useRouteContext()
  if (!data.shop) return <ShopStep bar={bar} leave={leave} />

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
    <AuthLayout topRight={leave} aside={aside}>
      <div key={step} className={step === opened ? '' : 'rise'}>
        {bills && step === 2 ? (
          <BillDetailsStep shop={shop} bar={bar} onDoc={onDoc} />
        ) : bills && step === 3 ? (
          <BillPayStep shop={shop} owner={owner} bar={bar} onDoc={onDoc} />
        ) : bills && step === 4 ? (
          <FirstInvoiceStep shop={shop} bar={bar} onDoc={onDoc} />
        ) : bills ? (
          <PhoneStep shop={shop} product={null} bills bar={bar} />
        ) : step === 2 ? (
          serves ? (
            <ServiceStep shop={shop} bar={bar} onDraft={onServiceDraft} onLater={redo ? back : undefined} />
          ) : (
            <ProductStep shop={shop} ai={data.ai} bar={bar} onDraft={onDraft} onLater={redo ? back : undefined} />
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
          <PhoneStep shop={shop} product={first} service={serves ? (data.services[0] ?? null) : undefined} bar={bar} />
        )}
      </div>
    </AuthLayout>
  )
}

/**
 * Step 1, Your shop: paste an Instagram, TikTok or WhatsApp link or type the name; the link is claimed under it; what
 * it sells. The shop's language (the app's) and WhatsApp (the sign-up number) are one quiet line with Change.
 */
function ShopStep({ bar, leave }: { bar: React.ReactNode; leave: React.ReactNode }) {
  const t = useT()
  const router = useRouter()
  const clock = useStepClock()
  const { session } = Route.useRouteContext()
  const firstName = (session.user?.name ?? '').trim().split(/\s+/)[0]
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [category, setCategory] = useState('fashion')
  // Products (ordered and delivered), services (booked by time) or invoices (billed, paid later): it decides the next
  // steps and what the link shows first. A business can add the others later.
  const [kind, setKind] = useState<ShopKind>('products')
  const chooseKind = (next: ShopKind) => {
    setKind(next)
    setCategory(next === 'services' ? 'salon' : next === 'invoices' ? 'freelance' : 'fashion')
  }
  const [whatsapp, setWhatsapp] = useState(session.user?.phone ?? '')
  const [free, setFree] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  // What is missing, said on its own box.
  const [missing, setMissing] = useState<{ name?: string; slug?: string }>({})
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  // A salon and a business that sends invoices have a page; a seller of products has a shop (the founder, 23 Nov 2026).
  const page = hasPage(kind)
  // A link the seller pasted from their Instagram, TikTok or WhatsApp (lib/social.ts) and what it filled in.
  const [link, setLink] = useState('')
  const [linkNote, setLinkNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [socials, setSocials] = useState({ instagram: '', tiktok: '', facebook: '' })
  // The shop's language follows the app's; choosing another also switches these screens and the seller's app to it.
  const lang = useLang()
  const [shopLang, setShopLang] = useState<Lang>(lang)
  const chooseLang = async (next: Lang) => {
    setShopLang(next)
    if (next === lang) return
    await setLang({ data: { lang: next } })
    router.invalidate()
  }

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  useEffect(() => {
    if (slug.length < 3) {
      setFree(null)
      setChecking(false)
      return
    }
    setChecking(true)
    const id = setTimeout(async () => {
      setFree((await checkSlug({ data: { slug } })).free)
      setChecking(false)
    }, 350)
    return () => clearTimeout(id)
  }, [slug])

  const status =
    slug.length < 3 ? (
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
    if (!named) setName(nameFromHandle(found.handle))
    setLinkNote({
      ok: true,
      text: named ? t('Your {site} is added to your shop.', { site }) : t('From your {site}: a shop name and link to start from. Change them below.', { site }),
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
  const categoryLabel = t(ALL_CATEGORIES.find((c) => c.id === category)?.label ?? 'Other')

  return (
    <AuthLayout
      topRight={leave}
      aside={
        <PreviewAside label={page ? t('Your page, as clients will see it') : t('Your shop, as buyers will see it')}>
          <ShopCard shop={{ name, slug, logo: null, category }} products={[]} services={kind === 'services' ? [] : undefined} note={kind === 'services' ? t('Your services go here. You add them next.') : t('Your products go here. You add them next.')} />
        </PreviewAside>
      }
    >
      <StepHead
        bar={bar}
        title={page ? t('Your page') : t('Your shop')}
        sub={
          page
            ? firstName
              ? t('Welcome, {name}. A name and a link, and your page is open.', { name: firstName })
              : t('A name and a link, and your page is open.')
            : firstName
              ? t('Welcome, {name}. A name and a link, and your shop is open.', { name: firstName })
              : t('A name and a link, and your shop is open.')
        }
      />

      <div className="mt-6 flex items-center gap-3 rounded-16 bg-card p-3 shadow-[inset_0_0_0_1px_var(--color-line)] lg:hidden">
        <ShopAvatar name={name || 'S'} logo={null} className="h-11 w-11 text-15" />
        <div className="min-w-0">
          <p className="truncate text-15 font-semibold">{name || (page ? t('Your business') : t('Your shop'))}</p>
          <p className="code truncate text-13 text-muted">shopi.tz/{slug || 'yourshop'}</p>
        </div>
        <span className="ml-auto hidden shrink-0 rounded-full bg-page px-2.5 py-1 text-12 text-ink-2 min-[400px]:inline">{categoryLabel}</span>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy || checking) return
          setError('')
          const noName = page ? t('Enter your business name.') : t('Enter a shop name.')
          const gaps: typeof missing = {}
          if (!name.trim()) gaps.name = noName
          if (slug.length < 3) gaps.slug = t('At least 3 letters or numbers')
          else if (free === false) gaps.slug = t('That link is taken. Try another.')
          setMissing(gaps)
          if (Object.keys(gaps).length) return showFirstError()
          setBusy(true)
          try {
            const res = await createShop({ data: { name, slug, category, kind, whatsapp, lang: shopLang, ...socials, seconds: clock() } })
            if ('error' in res) {
              setBusy(false)
              if (res.error === 'staff') return setError(t('This number helps run another shop on Shopi. To open your own shop, sign up with another number.'))
              setMissing(res.error === 'name' ? { name: noName } : { slug: t('That link is taken. Try another.') })
              return showFirstError()
            }
            await router.invalidate()
            window.scrollTo(0, 0)
          } catch {
            setBusy(false)
            setError(t('Something went wrong. Try again.'))
          }
        }}
      >
        <Field
          label={t('Your Instagram, TikTok or WhatsApp link')}
          aside={t('Optional')}
          hint={
            linkNote ? (
              <span className={`flex items-start gap-1.5 ${linkNote.ok ? 'text-ink-2' : 'text-bad'}`}>
                {linkNote.ok && <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-ok" />}
                {linkNote.text}
              </span>
            ) : (
              t('Paste the link to your page and we fill in what we can.')
            )
          }
        >
          <span className="input flex items-center gap-2.5">
            <Link2 size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={link}
              onChange={(e) => readLink(e.target.value)}
              placeholder="instagram.com/dukalako"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </span>
        </Field>
        <Field label={page ? t('Business name') : t('Shop name')} error={missing.name}>
          <input
            className="input"
            placeholder="Zuri Fashion"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setMissing({})
            }}
          />
        </Field>
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
        <FieldGroup label={t('What do you sell?')} radio>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['products', t('Products'), t('Buyers order, you deliver')],
                ['services', t('Services'), t('Clients book a time with you')],
                ['invoices', t('Invoices'), t('You bill clients, they pay later')],
              ] as const
            ).map(([id, title, sub]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={kind === id}
                onClick={() => chooseKind(id)}
                className={`rounded-16 px-4 py-3 text-left transition-colors ${kind === id ? 'bg-ink text-white' : 'bg-card shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-well'}`}
              >
                <span className="block text-15 font-medium">{title}</span>
                <span className={`mt-0.5 block text-13 leading-5 ${kind === id ? 'text-white/70' : 'text-muted'}`}>{sub}</span>
              </button>
            ))}
          </div>
        </FieldGroup>
        <FieldGroup label={kind === 'products' ? t('What kind of products?') : t('What kind of business?')}>
          <div className="flex flex-wrap gap-2">
            {(kind === 'services' ? SERVICE_CATEGORIES : kind === 'invoices' ? INVOICE_CATEGORIES : CATEGORIES).map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
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
            <Field label={page ? t('Business WhatsApp') : t('Shop WhatsApp')} hint={page ? t('Clients message you here') : t('Buyers message you here about orders')}>
              <input className="input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 rounded-16 bg-well/70 px-4 py-3">
            <p className="min-w-0 text-14 leading-5 text-ink-2">
              <span className="font-medium text-ink">{langName}</span> · <span className="code">{localPhone(normalizePhone(whatsapp) || whatsapp)}</span>
              <span className="mt-0.5 block text-13 text-muted">{page ? t('The language clients see, and the WhatsApp they message.') : t('The language buyers see, and the WhatsApp they message.')}</span>
            </p>
            <button type="button" className="shrink-0 text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => setDetails(true)}>
              {t('Change')}
            </button>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        {/* Never greyed out: a tap says what is missing, on its own box. */}
        <button className="btn btn-lg w-full" disabled={busy}>
          {busy ? (page ? t('Opening your page') : t('Opening your shop')) : page ? t('Open my page') : t('Open my shop')}
        </button>
      </form>
    </AuthLayout>
  )
}
