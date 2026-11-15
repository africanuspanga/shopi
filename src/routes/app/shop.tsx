import { Link, createFileRoute, useBlocker, useRouter } from '@tanstack/react-router'
import { Camera, Check, ChevronRight, Copy, LogOut, Palette, Plus, TicketPercent, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useHideFloatingNav } from '#/components/floating-nav'
import { PhoneAppSettings } from '#/components/phone-app'
import { ErrorText, Field, LangSwitch, Page, ShopAvatar, ShopLangChoice, Switch, Toast, TopBar } from '#/components/ui'
import { getMyShop, updateShop } from '#/lib/api/merchant'
import { logout } from '#/lib/api/session'
import { CATEGORIES, NETWORKS, mapsLink, tinDigits } from '#/lib/format'
import { asLang, useT } from '#/lib/i18n'
import { FONTS, MOTO, asFont, cleanHex } from '#/lib/theme'
import { uploadImage } from '#/lib/upload'

export const Route = createFileRoute('/app/shop')({
  loader: () => getMyShop(),
  component: ShopSettings,
})

/** Neighbourhoods sellers in Dar deliver to most. Names only: each seller sets their own fee. */
const DAR_AREAS = [
  'Kariakoo', 'Posta', 'Upanga', 'Kinondoni', 'Mikocheni', 'Msasani', 'Masaki', 'Oysterbay', 'Sinza', 'Mwenge',
  'Kijitonyama', 'Ubungo', 'Kimara', 'Mbezi', 'Tegeta', 'Kigamboni', 'Temeke', 'Tabata', 'Ilala', 'Buguruni', 'Ukonga',
]

function ShopSettings() {
  const t = useT()
  const router = useRouter()
  const data = Route.useLoaderData()
  const initial = useRef({ shop: data.shop, areas: data.areas.map((a) => ({ name: a.name, fee: String(a.fee) })) })
  const [s, setS] = useState(initial.current.shop)
  const [areas, setAreas] = useState(initial.current.areas)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const logoRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setS({ ...s, [k]: e.target.value })
  const dirty = JSON.stringify({ shop: s, areas }) !== JSON.stringify(initial.current)
  // On phones the save bar takes the bottom capsule's place while there is something to save.
  useHideFloatingNav(dirty || !!error)

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm(t('Leave without saving your shop changes?')),
    enableBeforeUnload: () => dirty,
  })

  async function save() {
    const named = areas.filter((a) => a.name.trim())
    if (tinDigits(s.tin ?? '') === null) return setError(t('A TIN has 9 digits, like 123-456-789.'))
    if (mapsLink(s.maps_url ?? '') === null) return setError(t('That isn’t a Google Maps link. In Google Maps, find your shop, tap Share and copy the link.'))
    setBusy(true)
    setError('')
    await updateShop({ data: { ...s, areas: named.map((a) => ({ name: a.name.trim(), fee: 0 })) } })
    initial.current = { shop: s, areas: named }
    setAreas(named)
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.invalidate()
  }

  // Hide neighbourhoods already covered, also inside combined names like "Kariakoo & Posta".
  const unused = DAR_AREAS.filter((name) => !areas.some((a) => a.name.toLowerCase().includes(name.toLowerCase())))

  return (
    <Page nav wide className={dirty ? 'pb-48 md:pb-32' : ''}>
      <TopBar title={t('Shop settings')} sub={t('What buyers see, how they pay, where you deliver')} right={<LangSwitch />} />

      <div className="divide-y divide-line">
        <Group title={t('Profile')} sub={t('Your name, logo and story at the top of your shop.')}>
          <div className="flex items-center gap-5">
            <button type="button" className="group relative shrink-0" onClick={() => logoRef.current?.click()} aria-label={t('Change logo')}>
              <ShopAvatar name={s.name} logo={s.logo_key} className="h-20 w-20 text-[24px]" />
              <span className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white ring-4 ring-card transition-transform group-active:scale-95">
                <Camera size={15} strokeWidth={1.75} />
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-[15px] font-medium">{t('Shop logo')}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-muted">{t('A square photo works best. Without one, buyers see your initials.')}</p>
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  setS({ ...s, logo_key: await uploadImage(f, 400) })
                } catch {
                  setError(t('The logo did not upload. Try again.'))
                }
              }}
            />
          </div>
          <div className="mt-6 space-y-4">
            <Field label={t('Shop name')}>
              <input className="input" value={s.name} onChange={set('name')} />
            </Field>
            <Field label={t('Shop link')} hint={t('Your link stays the same so the ones you already shared keep working.')}>
              <div className="input flex items-center justify-between gap-3 bg-page">
                <span className="code truncate text-[15px] text-ink-2">shopi.tz/{s.slug}</span>
                <button
                  type="button"
                  className="-my-2 -mr-2 flex shrink-0 items-center gap-1.5 rounded-full px-2 py-2.5 text-[13px] font-medium transition-colors hover:bg-well"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`https://shopi.tz/${s.slug}`)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1600)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {copied ? <Check size={15} strokeWidth={2.25} /> : <Copy size={15} strokeWidth={1.6} />}
                  {copied ? t('Copied') : t('Copy')}
                </button>
              </div>
            </Field>
            <ShopLangChoice
              value={asLang(s.lang)}
              onChange={(lang) => setS({ ...s, lang })}
              hint={t('The language buyers see: your shop, checkout and order pages.')}
            />
            <Field label={t('Short bio')} aside={`${s.bio.length}/300`}>
              <textarea className="input" maxLength={300} value={s.bio} onChange={set('bio')} placeholder={t('e.g. Kitenge outfits made in Sinza. Delivery across Dar the same day.')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('What you sell')}>
                <select className="input" value={s.category} onChange={set('category')}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t(c.label)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Opening hours')}>
                <input className="input" value={s.hours} onChange={set('hours')} placeholder={t('Mon to Sat, 9:00 to 19:00')} />
              </Field>
            </div>
            <Field label={t('Where you are')} hint={t('A street or a landmark buyers know')}>
              <input className="input" value={s.location} onChange={set('location')} placeholder={t('e.g. Kariakoo, Mtaa wa Congo')} />
            </Field>
            <Field label={t('Google Maps link')} aside={t('Optional')} hint={t('In Google Maps, find your shop, tap Share and paste the link. Buyers get directions.')}>
              <input
                className="input"
                value={s.maps_url ?? ''}
                onChange={set('maps_url')}
                placeholder="https://maps.app.goo.gl/…"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label={t('TIN (TRA)')} aside={t('Optional')} hint={t('The 9-digit number from TRA. Shown in your shop’s info and on receipts.')}>
              <input
                className="input tnum"
                value={s.tin ?? ''}
                onChange={set('tin')}
                placeholder="123-456-789"
                inputMode="numeric"
                maxLength={11}
              />
            </Field>
          </div>
        </Group>

        <Group title={t('Shop look')} sub={t('Your colour, the style of your name, and a cover photo.')}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="h-10 w-10 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(10_10_10/0.1)]" style={{ background: cleanHex(s.theme_color) ?? MOTO }} />
            <p className="min-w-0 flex-1 text-[14px] text-ink-2">
              {t(FONTS.find((f) => f.id === asFont(s.theme_font))!.name)} · {s.cover_key ? t('With a cover photo') : t('No cover photo')}
            </p>
            <Link to="/app/look" className="btn btn-ghost">
              <Palette size={16} strokeWidth={1.6} /> {t('Change the look')} <ChevronRight size={16} strokeWidth={1.6} />
            </Link>
          </div>
        </Group>

        <Group title={t('Payments')} sub={t('Buyers pay you directly. Shopi never holds your money.')}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Network')}>
                <select className="input" value={s.lipa_network} onChange={set('lipa_network')}>
                  <option value="">{t('Choose')}</option>
                  {NETWORKS.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('Lipa Namba or number')}>
                <input className="input code" inputMode="numeric" value={s.lipa_number} onChange={set('lipa_number')} placeholder="5512345" />
              </Field>
            </div>
            <Field label={t('Name on payments')} hint={t('Exactly as it shows on the payment SMS. We use it to check buyers’ proof.')}>
              <input className="input" value={s.lipa_name} onChange={set('lipa_name')} placeholder={t('e.g. ZEES STORE')} />
            </Field>
            <div className="space-y-4 rounded-[16px] bg-page p-4">
              <Switch
                label={t('This is a personal number')}
                sub={t('You check every payment yourself before confirming')}
                checked={!!s.lipa_is_personal}
                onChange={(v) => setS({ ...s, lipa_is_personal: v ? 1 : 0 })}
              />
              <div className="border-t border-line" />
              <Switch
                label={t('Accept cash on delivery')}
                sub={t('Buyers pay the rider when the order arrives')}
                checked={!!s.cod_enabled}
                onChange={(v) => setS({ ...s, cod_enabled: v ? 1 : 0 })}
              />
            </div>
          </div>
        </Group>

        <Group title={t('Delivery')} sub={t('The areas you deliver to. Buyers pick one at checkout, and you agree the delivery fee with them on WhatsApp.')}>
          <div className="space-y-2">
            {areas.map((a, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-2 sm:gap-x-3">
                <input
                  className="input h-11"
                  value={a.name}
                  aria-label={t('Area')}
                  placeholder="Mikocheni"
                  onChange={(e) => setAreas(areas.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <button type="button" className="icon-btn" aria-label={t('Remove area')} onClick={() => setAreas(areas.filter((_, j) => j !== i))}>
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setAreas([...areas, { name: '', fee: '' }])}>
            <Plus size={15} strokeWidth={2} /> {t('Add an area')}
          </button>
          {unused.length > 0 && (
            <div className="mt-6">
              <p className="text-[13px] text-muted">{t('Quick add in Dar es Salaam')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {unused.map((name) => (
                  <button key={name} type="button" className="chip h-8 px-3 text-[13px]" onClick={() => setAreas([...areas.filter((a) => a.name.trim()), { name, fee: '' }])}>
                    <Plus size={13} strokeWidth={2} /> {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Group>

        <Group title={t('Contact and social')} sub={t('Shown on your shop so buyers can follow and message you.')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp">
              <input className="input" type="tel" value={s.whatsapp} onChange={set('whatsapp')} />
            </Field>
            <Field label="Instagram">
              <Handle value={s.instagram} onChange={set('instagram')} />
            </Field>
            <Field label="TikTok">
              <Handle value={s.tiktok} onChange={set('tiktok')} />
            </Field>
            <Field label="Facebook">
              <input className="input" value={s.facebook} onChange={set('facebook')} placeholder="facebook.com/dukalako" autoCapitalize="none" />
            </Field>
          </div>
        </Group>

        <Group title={t('Discount codes')} sub={t('Codes buyers type at checkout for money off, like EID10. Share them in your status.')}>
          <Link to="/app/discounts" className="btn btn-ghost">
            <TicketPercent size={16} strokeWidth={1.6} /> {t('Discount codes')} <ChevronRight size={16} strokeWidth={1.6} />
          </Link>
        </Group>

        <Group title={t('Plan')} sub={t('Twiga or Tembo, paid once a year. See your trial and your plan.')}>
          <Link to="/app/plan" className="btn btn-ghost">
            {t('See your plan')} <ChevronRight size={16} strokeWidth={1.6} />
          </Link>
        </Group>

        <Group title={t('Notifications')} sub={t('New orders and payments to check, on this phone, even when Shopi is closed.')}>
          <PhoneAppSettings />
        </Group>

        <Group title={t('Account')} sub={t('You are logged in on this phone.')}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await logout()
              await router.invalidate()
              router.navigate({ to: '/' })
            }}
          >
            <LogOut size={16} strokeWidth={1.6} /> {t('Log out')}
          </button>
        </Group>
      </div>

      {(dirty || error) && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:left-[248px] md:px-10 md:pb-6">
          <div className="rise mx-auto flex max-w-[1160px] flex-col gap-3 rounded-[20px] bg-ink p-3 pl-5 text-white shadow-[var(--shadow-float)] sm:flex-row sm:items-center">
            <p className="flex-1 text-[14px]">{error ? <span className="text-[#ffb59c]">{error}</span> : t('You have unsaved changes')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm h-10 flex-1 bg-white/10 hover:bg-white/15"
                onClick={() => {
                  setS(initial.current.shop)
                  setAreas(initial.current.areas)
                  setError('')
                }}
              >
                {t('Discard')}
              </button>
              <button type="button" className="btn btn-sm h-10 flex-1 bg-white text-ink hover:bg-white/90" disabled={busy || !dirty} onClick={save}>
                {busy ? t('Saving') : t('Save changes')}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast show={saved}>
        <Check size={16} strokeWidth={2.25} /> {t('Saved')}
      </Toast>
      {/* Errors outside the save bar, for screen readers */}
      <div className="sr-only">
        <ErrorText>{error}</ErrorText>
      </div>
    </Page>
  )
}

function Group({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 py-8 first:pt-0 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12 lg:py-10">
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">{sub}</p>
      </div>
      <div className="card max-w-[720px] p-5 md:p-6">{children}</div>
    </section>
  )
}

function Handle({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <span className="input flex items-center gap-1 px-4">
      <span className="text-muted">@</span>
      <input className="min-w-0 flex-1 bg-transparent outline-none" value={value.replace(/^@/, '')} onChange={onChange} placeholder="dukalako" autoCapitalize="none" />
    </span>
  )
}
