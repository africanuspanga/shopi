import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, ImageIcon, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AuthLayout, StepBar } from '#/components/auth'
import { ErrorText, Field, ShopAvatar } from '#/components/ui'
import { checkSlug, createShop } from '#/lib/api/merchant'
import { CATEGORIES, slugify } from '#/lib/format'
import { useT } from '#/lib/i18n'

export const Route = createFileRoute('/onboard')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) throw redirect({ to: '/signup' })
    if (context.session.shop) throw redirect({ to: '/app' })
  },
  head: () => ({ meta: [{ title: 'Name your shop · RIZK' }] }),
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

  return (
    <AuthLayout aside={<ShopPreview name={name} slug={slug} category={categoryLabel} />}>
      <StepBar step={2} of={2} />
      <h1 className="title mt-6 text-[32px] md:text-[38px]">{t('Name your shop')}</h1>
      <p className="mt-2 text-[15px] text-muted">{t('Choose the link with care: it stays the same, so the places you share it keep working.')}</p>

      <div className="mt-6 flex items-center gap-3 rounded-[18px] bg-card p-3 shadow-[inset_0_0_0_1px_var(--color-line)] lg:hidden">
        <ShopAvatar name={name || 'R'} logo={null} className="h-11 w-11 text-[15px]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{name || t('Your shop')}</p>
          <p className="code truncate text-[13px] text-muted">rizk.tz/{slug || 'yourshop'}</p>
        </div>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const res = await createShop({ data: { name, slug, category, whatsapp } })
          setBusy(false)
          if ('error' in res) return setError(res.error === 'name' ? t('Enter a shop name.') : t('That link is taken. Try another.'))
          await router.invalidate()
          router.navigate({ to: '/app' })
        }}
      >
        <Field label={t('Shop name')}>
          <input className="input" placeholder="Zuri Fashion" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('Shop link')} hint={status}>
          <span className={`input flex items-center ${free === false && !checking && slug.length >= 3 ? 'shadow-[inset_0_0_0_1.5px_var(--color-bad)]' : ''}`}>
            <span className="text-muted">rizk.tz/</span>
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

/** Desktop: the shop takes shape on the right as the seller types. */
function ShopPreview({ name, slug, category }: { name: string; slug: string; category: string }) {
  const t = useT()
  return (
    <>
      <p className="text-[15px] text-white/60">{t('Your shop, as buyers will see it')}</p>
      <div className="mt-auto mb-auto w-full max-w-[460px] self-center rounded-[28px] bg-card p-6 text-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <p className="code truncate text-[13px] text-muted">rizk.tz/{slug || 'yourshop'}</p>
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
