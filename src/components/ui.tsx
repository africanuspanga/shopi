import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ImageIcon, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { STATUS_LABEL, imgUrl, type OrderStatus } from '#/lib/format'
import { SWAHILI_ENABLED, useLang, useT, type Lang } from '#/lib/i18n'
import { setLang } from '#/lib/api/session'

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

/** Screen header: optional back button, a title that names the place, and up to two actions. */
export function TopBar({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex min-h-12 items-center gap-3 md:mb-8">
      {back && <BackButton to={back} />}
      <div className="min-w-0 flex-1">
        <h1 className="title truncate text-[24px] md:text-[30px]">{title}</h1>
        {sub && <p className="mt-1 line-clamp-2 text-[14px] text-pretty text-muted">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
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

export function Img({ k, alt, className = '', eager = false }: { k: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  if (!k) {
    return (
      <div className={`flex items-center justify-center bg-well text-faint ${className}`} role="img" aria-label={alt}>
        <ImageIcon size={20} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={imgUrl(k)}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
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
      {initials || 'R'}
    </span>
  )
}

/** Money with a quiet currency: "TSh" small, the figure large. */
export function Money({ value, className = '', cur = 'text-[0.5em] text-current/55' }: { value: number; className?: string; cur?: string }) {
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      <span className={`mr-[0.25em] align-[0.12em] font-medium ${cur}`}>TSh</span>
      {Math.round(value).toLocaleString('en-US')}
    </span>
  )
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

/** RIZK wordmark with its orange full stop. Geometry: design/brand/glyphs.py (Mona Sans ExtraBold, 120% width). Regenerate, do not hand-edit. */
export function Wordmark({ className = 'h-5 w-auto', title = 'RIZK', dot = '#FF4F17' }: { className?: string; title?: string; dot?: string }) {
  return (
    <svg viewBox="0 0 390.04 100" className={className} fill="currentColor" role="img" aria-label={title}>
      <path transform="translate(0 0)" d="M0 100V0H63.37Q70.78 0 76.61 1.3Q82.44 2.61 86.69 5.08Q90.95 7.54 93.69 10.97Q96.43 14.4 97.74 18.72Q99.04 23.05 99.04 28.26Q99.04 38 93.96 44.38Q88.89 50.75 80.66 53.22V54.05Q85.73 54.87 89.3 57.2Q92.87 59.53 94.65 63.31Q96.43 67.08 96.43 72.57V89.57Q96.43 92.59 96.64 94.92Q96.84 97.26 97.67 100H69.55Q69 97.81 68.86 95.27Q68.72 92.73 68.72 89.85V76.82Q68.72 72.43 67.42 69.82Q66.12 67.22 63.1 66.05Q60.08 64.88 54.73 64.88H25.51V45.13H54.32Q63.92 45.13 67.42 41.63Q70.92 38.13 70.92 32.51Q70.92 29.22 69.75 26.95Q68.59 24.69 66.39 23.32Q64.2 21.95 61.11 21.4Q58.02 20.85 54.32 20.85H27.57V100Z" />
      <path transform="translate(108.04 0)" d="M0 100V0H27.57V100Z" />
      <path transform="translate(147.61 0)" d="M0 100V78.19L55.14 21.81H2.61V0H89.3V21.95L33.88 78.19H90.67V100Z" />
      <path transform="translate(247.28 0)" d="M74.21 100 44.03 60.36 26.06 78.74V46.64L70.64 0H106.31L63.79 41.56L109.19 100ZM0 100V0H27.57V100Z" />
      <circle cx="376.26" cy="86.22" r="13.79" fill={dot} />
    </svg>
  )
}
