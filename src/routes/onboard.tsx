import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, ImageIcon, Link2, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AuthLayout, StepBar } from '#/components/auth'
import { ErrorText, Field, ShopAvatar, ShopLangChoice } from '#/components/ui'
import { checkSlug, createShop, expandSocialLink, saveShopBasics } from '#/lib/api/merchant'
import { CATEGORIES, mapsLink, normalizePhone, slugify, tinDigits } from '#/lib/format'
import { useLang, useT, type Lang } from '#/lib/i18n'
import { setLang } from '#/lib/api/session'
import { nameFromHandle, readSocialLink, type SocialFind } from '#/lib/social'

export const Route = createFileRoute('/onboard')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) throw redirect({ to: '/signup' })
    if (context.session.shop) throw redirect({ to: '/app' })
  },
  head: () => ({ meta: [{ title: 'Name your shop · Shopi' }] }),
  component: Onboard,
})

function Onboard() {
  const t = useT()
  const router = useRouter()
  const { session } = Route.useRouteContext()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [category, setCategory] = useState('fashion')
  const [whatsapp, setWhatsapp] = useState(session.user?.phone ?? '')
  const [free, setFree] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)
  // A link the seller pasted from their Instagram, TikTok or WhatsApp (lib/social.ts) and what it filled in.
  const [link, setLink] = useState('')
  const [linkNote, setLinkNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [socials, setSocials] = useState({ instagram: '', tiktok: '', facebook: '' })
  // The shop's language, first: choosing it also switches these screens and the seller's app to it.
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
        <Loader2 size={13} className="animate-spin" /> {t('Checking')}
      </span>
    ) : free ? (
      <span className="flex items-center gap-1.5 text-ok">
        <Check size={14} strokeWidth={2.5} /> {t('Available')}
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-bad">
        <X size={14} strokeWidth={2.5} /> {t('Taken. Try another')}
      </span>
    )

  const categoryLabel = t(CATEGORIES.find((c) => c.id === category)?.label ?? 'Other')

  function applyFind(found: SocialFind | null) {
    if (!found) return setLinkNote({ ok: false, text: t('We can’t read that link. Copy it from your Instagram, TikTok or WhatsApp profile.') })
    if (found.kind === 'hidden') return setLinkNote({ ok: false, text: t('That WhatsApp link hides the number. Type your WhatsApp number below.') })
    if (found.kind === 'whatsapp') {
      setWhatsapp(normalizePhone(found.phone) || `+${found.phone}`)
      return setLinkNote({ ok: true, text: t('Your WhatsApp number is filled in below.') })
    }
    if (found.kind === 'short') return
    const site = found.kind === 'instagram' ? 'Instagram' : found.kind === 'tiktok' ? 'TikTok' : 'Facebook'
    setSocials((s) => ({ ...s, [found.kind]: found.kind === 'facebook' ? `facebook.com/${found.handle}` : found.handle }))
    const named = !!name.trim()
    if (!named) setName(nameFromHandle(found.handle))
    setLinkNote({
      ok: true,
      text: named
        ? t('Your {site} is added to your shop.', { site })
        : t('From your {site}: a shop name and link to start from. Change them below.', { site }),
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

  const finish = async () => {
    await router.invalidate()
    router.navigate({ to: '/app' })
  }

  if (created)
    return (
      <AuthLayout aside={<ShopPreview name={name} slug={slug} category={categoryLabel} />}>
        <BasicsStep onDone={finish} initial={socials} />
      </AuthLayout>
    )

  return (
    <AuthLayout aside={<ShopPreview name={name} slug={slug} category={categoryLabel} />}>
      <StepBar step={2} of={3} />
      <h1 className="title mt-6 text-[32px] md:text-[38px]">{t('Name your shop')}</h1>
      <p className="mt-2 text-[15px] text-muted">{t('Choose the link with care: it stays the same, so the places you share it keep working.')}</p>

      <div className="mt-6 flex items-center gap-3 rounded-[18px] bg-card p-3 shadow-[inset_0_0_0_1px_var(--color-line)] lg:hidden">
        <ShopAvatar name={name || 'R'} logo={null} className="h-11 w-11 text-[15px]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{name || t('Your shop')}</p>
          <p className="code truncate text-[13px] text-muted">shopi.tz/{slug || 'yourshop'}</p>
        </div>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const res = await createShop({ data: { name, slug, category, whatsapp, lang: shopLang, ...socials } })
          setBusy(false)
          if ('error' in res) return setError(res.error === 'name' ? t('Enter a shop name.') : t('That link is taken. Try another.'))
          setCreated(true)
          window.scrollTo(0, 0)
        }}
      >
        <ShopLangChoice value={shopLang} onChange={chooseLang} hint={t('Buyers see your shop in this language. You can change it later in Shop settings.')} />
        <Field
          label={t('Your Instagram, TikTok or WhatsApp link')}
          aside={t('Optional')}
          hint={
            linkNote ? (
              <span className={`flex items-start gap-1.5 ${linkNote.ok ? 'text-ink-2' : 'text-bad'}`}>
                {linkNote.ok && <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ok" />}
                {linkNote.text}
              </span>
            ) : (
              t('Paste the link to your page and we fill in what we can.')
            )
          }
        >
          <span className="input flex items-center gap-2.5">
            <Link2 size={16} strokeWidth={1.6} className="shrink-0 text-muted" />
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
        <Field label={t('Shop name')}>
          <input className="input" placeholder="Zuri Fashion" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('Shop link')} hint={status}>
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
              }}
            />
          </span>
        </Field>
        <Field label={t('Shop WhatsApp')} hint={t('Buyers message you here about orders')}>
          <input className="input" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </Field>
        <div>
          <p className="label">{t('What do you sell?')}</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {t(c.label)}
              </button>
            ))}
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-lg w-full" disabled={busy || free === false || checking || !name.trim()}>
          {busy ? t('Opening your shop') : t('Open my shop')}
        </button>
      </form>
    </AuthLayout>
  )
}

/** Step 3, optional: where buyers find the shop, and its socials. "Skip for now" leaves everything for Shop settings. */
function BasicsStep({ onDone, initial }: { onDone: () => Promise<void>; initial: { instagram: string; tiktok: string; facebook: string } }) {
  const t = useT()
  const [f, setF] = useState({ location: '', maps_url: '', tin: '', ...initial })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const handle = (k: 'instagram' | 'tiktok') => (
    <span className="input flex items-center gap-1 px-4">
      <span className="text-muted">@</span>
      <input className="min-w-0 flex-1 bg-transparent outline-none" value={f[k]} onChange={set(k)} placeholder="dukalako" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    </span>
  )
  return (
    <>
      <StepBar step={3} of={3} />
      <h1 className="title mt-6 text-[32px] md:text-[38px]">{t('Where buyers find you')}</h1>
      <p className="mt-2 text-[15px] text-muted">{t('Your shop is open. Add these now or later in Shop settings.')}</p>
      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (tinDigits(f.tin) === null) return setError(t('A TIN has 9 digits, like 123-456-789.'))
          if (mapsLink(f.maps_url) === null) return setError(t('That isn’t a Google Maps link. In Google Maps, find your shop, tap Share and copy the link.'))
          setBusy(true)
          setError('')
          const res = await saveShopBasics({ data: f })
          if ('error' in res) {
            setBusy(false)
            return setError(res.error === 'tin' ? t('A TIN has 9 digits, like 123-456-789.') : t('That isn’t a Google Maps link. In Google Maps, find your shop, tap Share and copy the link.'))
          }
          await onDone()
        }}
      >
        <Field label={t('Where you are')} aside={t('Optional')} hint={t('A street or a landmark buyers know')}>
          <input className="input" value={f.location} onChange={set('location')} placeholder={t('e.g. Kariakoo, Mtaa wa Congo')} />
        </Field>
        <Field label={t('Google Maps link')} aside={t('Optional')} hint={t('In Google Maps, find your shop, tap Share and paste the link. Buyers get directions.')}>
          <input className="input" value={f.maps_url} onChange={set('maps_url')} placeholder="https://maps.app.goo.gl/…" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field label={t('TIN (TRA)')} aside={t('Optional')} hint={t('The 9-digit number from TRA. Shown in your shop’s info and on receipts.')}>
          <input className="input tnum" value={f.tin} onChange={set('tin')} placeholder="123-456-789" inputMode="numeric" maxLength={11} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Instagram" aside={t('Optional')}>{handle('instagram')}</Field>
          <Field label="TikTok" aside={t('Optional')}>{handle('tiktok')}</Field>
        </div>
        <Field label="Facebook" aside={t('Optional')}>
          <input className="input" value={f.facebook} onChange={set('facebook')} placeholder="facebook.com/dukalako" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-col gap-3">
          <button className="btn btn-lg w-full" disabled={busy}>
            {busy ? t('Saving') : t('Save and continue')}
          </button>
          <button type="button" className="btn btn-lg btn-ghost w-full" disabled={busy} onClick={() => onDone()}>
            {t('Skip for now')}
          </button>
        </div>
      </form>
    </>
  )
}

/** Desktop: the shop takes shape on the right as the seller types. */
function ShopPreview({ name, slug, category }: { name: string; slug: string; category: string }) {
  const t = useT()
  return (
    <>
      <p className="text-[15px] text-white/60">{t('Your shop, as buyers will see it')}</p>
      <div className="mt-auto mb-auto w-full max-w-[460px] self-center rounded-[28px] bg-card p-6 text-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <p className="code truncate text-[13px] text-muted">shopi.tz/{slug || 'yourshop'}</p>
          <span className="flex h-8 items-center gap-1.5 rounded-full pr-1 pl-3 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
            {t('Bag')} <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink text-[12px] text-white">0</span>
          </span>
        </div>
        <div className="pt-6">
          <ShopAvatar name={name || 'R'} logo={null} className="h-16 w-16 text-[20px]" />
          <p className={`display mt-5 text-[36px] break-words ${name ? '' : 'text-faint'}`}>{name || t('Your shop')}</p>
          <span className="mt-4 inline-flex h-8 items-center rounded-full bg-page px-3 text-[13px] text-ink-2">{category}</span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex aspect-[4/5] items-center justify-center rounded-[12px] bg-well text-faint">
              <ImageIcon size={18} strokeWidth={1.5} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted">{t('Your products go here. You add them next.')}</p>
      </div>
    </>
  )
}
