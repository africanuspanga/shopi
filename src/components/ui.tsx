import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ImageIcon, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { STATUS_LABEL, imgUrl, type OrderStatus } from '#/lib/format'
import { LANGUAGES, SWAHILI_ENABLED, useLang, useT, type Lang } from '#/lib/i18n'
import { setLang } from '#/lib/api/session'

let navigated = false

/** Called once by the root: from the first move to another page on, screens that open use the entrance (`useEntrance`). */
export function useWatchNavigation() {
  const router = useRouter()
  useEffect(
    () =>
      router.subscribe('onBeforeNavigate', (e) => {
        if (e.pathChanged && e.fromLocation) navigated = true
      }),
    [router],
  )
}

/**
 * The entrance animation (`.rise`, `.rise-2`, `.rise-3`) for content that may be on the first page a visitor opens.
 * That page arrives drawn by the server, and fading it in would hide it until the phone has run the page's scripts
 * (1.3 s on a slow phone, the shop page's bio): so the first page shows at once, and screens opened after it rise.
 * Read once, when the component mounts.
 */
export function useEntrance(name: 'rise' | 'rise-2' | 'rise-3' = 'rise') {
  const [cls] = useState(() => (navigated ? name : ''))
  return cls
}

/** Page frame. narrow: forms and buyer flows. wide: merchant screens and storefronts. */
export function Page({ children, nav = false, wide = false, className = '' }: { children: ReactNode; nav?: boolean; wide?: boolean; className?: string }) {
  return (
    <div
      className={`mx-auto min-h-dvh w-full px-4 pt-[max(12px,env(safe-area-inset-top))] ${wide ? 'max-w-[1240px] md:px-10 md:pt-10' : 'max-w-[560px] md:pt-10'} ${nav ? 'pb-32 md:pb-16' : 'pb-12'} ${className}`}
    >
      {children}
    </div>
  )
}

export function BackButton({ to, label = 'Back' }: { to: string; label?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      aria-label={label}
      className="icon-btn"
      onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to }))}
    >
      <ArrowLeft size={18} strokeWidth={1.75} />
    </button>
  )
}

/**
 * The bar at the top of a seller screen on phones: always there, white, 60px, with what comes before the title (a back
 * button, the shop's logo), the title and up to two actions. It sits at the top of a `Page` and stays while the page
 * scrolls. From `md` up, pages show their own header instead.
 */
export function PhoneBar({ lead, title, right }: { lead?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 -mt-[max(12px,env(safe-area-inset-top))] mb-4 border-b border-line bg-card pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex h-[60px] items-center gap-2.5 px-4 [&_.btn]:h-10 [&_.btn]:px-4 [&_.btn]:text-[14px]">
        {lead}
        <h1 className="title min-w-0 flex-1 truncate text-[20px]">{title}</h1>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>
    </div>
  )
}

/**
 * Screen header: optional back button, a title that names the place, and up to two actions. On phones it is the
 * `PhoneBar` with the sub line under it; from `md` up, the large title in the page.
 */
export function TopBar({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <>
      <PhoneBar lead={back && <BackButton to={back} />} title={title} right={right} />
      {sub && <p className="mb-5 text-[14px] text-pretty text-muted md:hidden">{sub}</p>}
      <header className="mb-8 hidden min-h-12 items-center gap-3 md:flex">
        {back && <BackButton to={back} />}
        <div className="min-w-0 flex-1">
          <h1 className="title truncate text-[30px]">{title}</h1>
          {sub && <p className="mt-1 line-clamp-2 text-[14px] text-pretty text-muted">{sub}</p>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </header>
    </>
  )
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { id: T; label: string; count?: number }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={`hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 ${className}`}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className="chip" data-active={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count != null && o.count > 0 ? <span className="tnum opacity-55">{o.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

const DOT: Record<string, string> = { wait: 'bg-wait', act: 'bg-moto', ok: 'bg-ok', done: 'bg-faint', bad: 'bg-bad' }

/** Order status: a quiet dot and label. Only "check payment" asks for attention, in the signal colour. */
export function StatusPill({ status }: { status: OrderStatus }) {
  const t = useT()
  const s = STATUS_LABEL[status]
  if (s.tone === 'act') {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-moto-soft px-2.5 text-[12px] font-medium whitespace-nowrap text-moto-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-moto" />
        {t(s.label)}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap ${status === 'cancelled' ? 'text-muted' : 'text-ink-2'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {t(s.label)}
    </span>
  )
}

/**
 * A stored photo. `size="thumb"` loads the 600px copy (thumbnails, lists); `sizes` lets the browser pick between the
 * 600px copy and the full 1200px photo by the width it will show (grids); neither loads the full photo.
 */
export function Img({
  k,
  alt,
  className = '',
  eager = false,
  priority = false,
  size = 'full',
  sizes,
}: {
  k: string | null | undefined
  alt: string
  className?: string
  eager?: boolean
  /** The page's main photo (what phones measure as "loaded"): fetched before anything else. */
  priority?: boolean
  size?: 'full' | 'thumb'
  sizes?: string
}) {
  if (!k) {
    return (
      <div className={`flex items-center justify-center bg-well text-faint ${className}`} role="img" aria-label={alt}>
        <ImageIcon size={20} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={imgUrl(k, sizes ? 'thumb' : size)}
      srcSet={sizes ? `${imgUrl(k, 'thumb')} 600w, ${imgUrl(k)} 1200w` : undefined}
      sizes={sizes}
      alt={alt}
      loading={eager || priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={`bg-well object-cover ${className}`}
    />
  )
}

/** A shop's logo, or its initials on black when there is none. */
export function ShopAvatar({ name, logo, className = 'h-10 w-10 text-[14px]' }: { name: string; logo: string | null | undefined; className?: string }) {
  if (logo) return <Img k={logo} alt={name} className={`shrink-0 rounded-full ${className}`} eager />
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-white ${className}`}>
      {initials || 'S'}
    </span>
  )
}

/** Money with a quiet currency: "TSh" small, the figure large. */
/** short: from a million up, "TSh 10.99M" (the full figure in the title); for number cards too narrow for every digit. */
export function Money({ value, className = '', cur = 'text-[0.5em] text-current/55', short = false }: { value: number; className?: string; cur?: string; short?: boolean }) {
  const full = Math.round(value).toLocaleString('en-US')
  const cut = short && Math.abs(value) >= 1e6
  return (
    <span className={`tnum whitespace-nowrap ${className}`} title={cut ? `TSh ${full}` : undefined}>
      <span className={`mr-[0.25em] align-[0.12em] font-medium ${cur}`}>TSh</span>
      {cut ? shortNumber(value) : full}
    </span>
  )
}

/** 10,990,000 → 10.99M; 125,400,000 → 125.4M; 2,300,000,000 → 2.3B. Three or four figures, never rounded up a unit. */
export function shortNumber(value: number) {
  const [div, unit] = Math.abs(value) >= 1e9 ? [1e9, 'B'] : [1e6, 'M']
  const v = value / div
  const places = Math.abs(v) >= 100 ? 1 : 2
  const f = 10 ** places
  return `${(Math.trunc(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: places })}${unit}`
}

/** Change against the period before. Up is ink, down is muted: no traffic lights on a seller's own numbers. */
export function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (!before) return <span className="text-[13px] text-muted">{label}</span>
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct >= 0
  return (
    <span className="text-[13px] text-muted">
      <span className={`tnum font-medium ${up ? 'text-ink' : 'text-ink-2'}`}>
        {up ? '↑' : '↓'} {Math.abs(pct)}%
      </span>{' '}
      {label}
    </span>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="fade absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="sheet-up relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] bg-card px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] md:rounded-[28px] md:p-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-raised md:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="title text-[20px]">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function LangSwitch() {
  const lang = useLang()
  const router = useRouter()
  if (!SWAHILI_ENABLED) return null
  const next: Lang = lang === 'sw' ? 'en' : 'sw'
  return (
    <button
      type="button"
      className="icon-btn code text-[12px]"
      aria-label={next === 'en' ? 'English' : 'Kiswahili'}
      onClick={async () => {
        await setLang({ data: { lang: next } })
        router.invalidate()
      }}
    >
      {next.toUpperCase()}
    </button>
  )
}

/** The language buyers see a shop in: two big chips, Kiswahili and English. */
export function ShopLangChoice({ value, onChange, hint }: { value: Lang; onChange: (lang: Lang) => void; hint: string }) {
  const t = useT()
  if (!SWAHILI_ENABLED) return null
  return (
    <div className="field" role="group" aria-label={t('Shop language')}>
      <span className="label">{t('Shop language')}</span>
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map(([id, name]) => (
          <button key={id} type="button" lang={id} className="chip h-12 justify-center text-[15px]" aria-pressed={value === id} onClick={() => onChange(id)}>
            {name}
          </button>
        ))}
      </div>
      <small className="hint">{hint}</small>
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-[14px] bg-bad/[0.06] px-4 py-3 text-[14px] text-bad">
      {children}
    </p>
  )
}

export function Field({ label, children, hint, aside }: { label: string; children: ReactNode; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <label className="field">
      <span className="label flex items-baseline justify-between gap-3">
        {label}
        {aside && <span className="text-[13px] font-normal text-muted">{aside}</span>}
      </span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}

/** A yes/no setting as a full row. */
export function Switch({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {sub && <span className="mt-0.5 block text-[13px] text-muted">{sub}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-raised transition-colors duration-200 peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
        <span className="absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgb(10_10_10/0.2)] transition-transform duration-200 ease-[var(--ease-out)] peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

/** Nothing here yet: says what will appear and how to get it. */
export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-well text-ink-2">{icon}</span>}
      <p className="text-[16px] font-medium">{title}</p>
      {body && <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** Touch a chart and slide sideways to read each bar; vertical swipes still scroll the page. */
export function scrubIndex(e: { clientX: number; currentTarget: HTMLElement }, count: number) {
  const r = e.currentTarget.getBoundingClientRect()
  return Math.min(count - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * count)))
}

/** Short confirmation at the bottom of the screen, gone after a moment. */
export function Toast({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <div
      role="status"
      className="rise fixed inset-x-0 bottom-28 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-[14px] text-white shadow-[var(--shadow-float)] md:bottom-10"
    >
      {children}
    </div>
  )
}

export function TextLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink ${className}`}>
      {children}
    </Link>
  )
}

/** Shopi wordmark with its orange dot on the i. Geometry: design/brand/glyphs.py (Mona Sans ExtraBold, 120% width).
 *  Regenerate with `python3 glyphs.py --tsx`, do not hand-edit. The box runs from the top of the dot to the bottom
 *  of the p, so the ascenders are 78% of the height: a 22px wordmark has 17px ascenders and a 13px x-height. */
export function Wordmark({ className = 'h-[26px] w-auto', title = 'Shopi', dot = '#FF4F17' }: { className?: string; title?: string; dot?: string }) {
  return (
    <svg viewBox="0 -4.88 405.76 127.78" className={className} fill="currentColor" role="img" aria-label={title}>
      <path transform="translate(0 0)" d="M40.88 101.37Q31.28 101.37 23.8 99.66Q16.32 97.94 11.25 94.72Q6.17 91.5 3.36 86.83Q0.55 82.17 0 76.41H26.2Q26.47 79.42 28.26 81.48Q30.04 83.54 33.47 84.57Q36.9 85.6 41.7 85.6Q48.29 85.6 51.78 83.88Q55.28 82.17 55.28 78.88Q55.28 76.13 53.84 74.83Q52.4 73.53 49.04 72.91Q45.68 72.29 39.51 71.74Q25.93 70.37 17.9 67.97Q9.88 65.57 6.17 61.11Q2.47 56.65 2.47 49.11Q2.47 41.7 7.06 36.21Q11.66 30.73 20.3 27.64Q28.94 24.55 41.29 24.55Q52.13 24.55 60.29 27.3Q68.45 30.04 73.39 35.39Q78.33 40.74 79.15 48.42H53.91Q53.5 45.68 51.85 43.9Q50.21 42.11 47.53 41.22Q44.86 40.33 41.15 40.33Q35.39 40.33 31.89 41.91Q28.4 43.48 28.4 46.91Q28.4 49.25 30.04 50.55Q31.69 51.85 35.39 52.47Q39.09 53.09 45.13 53.64Q58.71 54.73 66.67 57.2Q74.62 59.67 78.05 64.33Q81.48 69 81.48 77.09Q81.48 84.5 77.09 89.92Q72.7 95.34 63.79 98.35Q54.87 101.37 40.88 101.37Z" />
      <path transform="translate(89.48 0)" d="M0 100V0H26.75V37.86H27.98Q31.41 31.69 38.55 28.12Q45.68 24.55 54.05 24.55Q61.32 24.55 67.15 26.34Q72.98 28.12 77.23 32.17Q81.48 36.21 83.81 42.87Q86.15 49.52 86.15 59.26V100H59.4V64.06Q59.4 58.02 58.09 53.7Q56.79 49.38 53.57 47.05Q50.34 44.72 44.58 44.72Q39.09 44.72 35.05 47.12Q31 49.52 28.88 53.64Q26.75 57.75 26.75 63.1V100Z" />
      <path transform="translate(182.13 0)" d="M45.27 101.37Q35.12 101.37 26.82 98.83Q18.52 96.3 12.48 91.36Q6.45 86.42 3.22 79.29Q0 72.15 0 62.96Q0 50.75 5.69 42.18Q11.39 33.61 21.54 29.08Q31.69 24.55 45.27 24.55Q55.42 24.55 63.79 27.09Q72.15 29.63 78.12 34.57Q84.09 39.51 87.31 46.64Q90.53 53.77 90.53 62.96Q90.53 75.03 84.91 83.68Q79.29 92.32 69.2 96.84Q59.12 101.37 45.27 101.37ZM45.27 81.07Q51.3 81.07 55.49 78.88Q59.67 76.68 61.8 72.57Q63.92 68.45 63.92 62.96Q63.92 58.71 62.69 55.35Q61.45 51.99 59.12 49.66Q56.79 47.33 53.29 46.02Q49.79 44.72 45.27 44.72Q39.37 44.72 35.19 46.98Q31 49.25 28.88 53.29Q26.75 57.34 26.75 62.96Q26.75 67.22 27.98 70.51Q29.22 73.8 31.55 76.13Q33.88 78.46 37.31 79.77Q40.74 81.07 45.27 81.07Z" />
      <path transform="translate(280.66 0)" d="M0 122.91V25.93H25.24L26.2 36.63H27.02Q30.32 31.41 36.9 28.12Q43.48 24.83 53.77 24.83Q61.87 24.83 68.45 27.43Q75.03 30.04 79.84 35.05Q84.64 40.05 87.24 47.12Q89.85 54.18 89.85 63.1Q89.85 74.76 85.32 83.33Q80.8 91.91 72.63 96.64Q64.47 101.37 53.5 101.37Q47.87 101.37 42.8 99.93Q37.72 98.49 33.88 95.82Q30.04 93.14 27.71 89.3H26.75V122.91ZM45.4 81.34Q50.75 81.34 54.66 79.22Q58.57 77.09 60.84 72.98Q63.1 68.86 63.1 63.1Q63.1 57.2 60.91 53.16Q58.71 49.11 54.73 46.98Q50.75 44.86 45.4 44.86Q39.51 44.86 35.32 47.05Q31.14 49.25 28.94 53.02Q26.75 56.79 26.75 61.73V64.2Q26.75 69 28.94 72.91Q31.14 76.82 35.32 79.08Q39.51 81.34 45.4 81.34Z" />
      <path transform="translate(379.01 0)" d="M0 100V25.93H26.75V100Z" />
      <circle cx="392.38" cy="8.5" r="13.38" fill={dot} />
    </svg>
  )
}
