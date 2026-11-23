import { Link } from '@tanstack/react-router'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MiniStore, NewOrderCard, Phone } from '#/components/showcase'
import { LangSwitch, Wordmark, useEntrance } from '#/components/ui'
import { useT } from '#/lib/i18n'

/**
 * Sign-in and sign-up: the form on the left, the product on a dark panel on the right (desktop only). `steady` is for
 * the setup: every step starts at the same height, where a short log-in form sits in the middle of the screen (a step
 * shorter than the phone used to start lower than the one before it, and the step bar jumped on laptops).
 */
export function AuthLayout({ children, topRight, aside, steady = false }: { children: ReactNode; topRight?: ReactNode; aside?: ReactNode; steady?: boolean }) {
  const rise = useEntrance()
  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-dvh flex-col px-4 pb-10 md:px-10 md:pt-2">
        {/* Phones: the same steady white bar as the rest of Shopi. */}
        <header className="-mx-4 flex h-[60px] items-center justify-between border-b border-line bg-card px-4 pt-[env(safe-area-inset-top)] box-content md:mx-0 md:h-16 md:border-0 md:bg-transparent md:px-0 md:pt-0">
          <Link to="/" aria-label="Shopi">
            <Wordmark className="h-[22px] w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            {topRight}
            <LangSwitch />
          </div>
        </header>
        <main className={`${rise} mx-auto flex w-full max-w-[400px] flex-1 flex-col ${steady ? 'pt-6 pb-8 md:pt-10 lg:pt-16' : 'justify-center py-8'}`}>{children}</main>
      </div>
      <aside className="sticky top-0 hidden h-dvh p-3 lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-32 bg-ink p-10 text-white">{aside ?? <ProductAside />}</div>
      </aside>
    </div>
  )
}

function ProductAside() {
  const t = useT()
  return (
    <>
      <p className="display text-40 xl:text-56">
        {t('Your shop in one link')}<span className="text-moto">.</span>
      </p>
      <p className="mt-4 max-w-[26rem] text-15 leading-relaxed text-white/60">{t('One link for your Instagram, TikTok and WhatsApp. Buyers order by themselves; you see every order in one place.')}</p>
      <div className="relative mt-auto h-[480px] xl:h-[540px]">
        <Phone className="absolute top-0 left-1/2 h-[620px] w-[310px] -translate-x-1/2 xl:h-[660px] xl:w-[328px]">
          <MiniStore />
        </Phone>
        <NewOrderCard className="absolute top-[250px] left-[calc(50%-270px)] xl:left-[calc(50%-300px)]" />
      </div>
    </>
  )
}

/** Where the seller is in the setup: a bar per step and "2 of 5", and from step 2 the way back to the step before. */
export function StepBar({ step, of, onBack }: { step: number; of: number; onBack?: () => void }) {
  const t = useT()
  return (
    <div className="flex h-11 items-center gap-3">
      {onBack && (
        <button type="button" className="-mr-1 -ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-well" aria-label={t('Back')} onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>
      )}
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: of }).map((_, i) => (
          <span key={i} className={`h-1 w-7 rounded-full transition-colors duration-500 ${i < step ? 'bg-ink' : 'bg-raised'}`} />
        ))}
      </div>
      <span className="meta">{t('{n} of {total}', { n: step, total: of })}</span>
    </div>
  )
}

export function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const t = useT()
  const [show, setShow] = useState(false)
  return (
    <span className="input flex items-center gap-2 pr-1.5">
      <input
        className="min-w-0 flex-1 bg-transparent outline-none"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-well hover:text-ink"
        aria-label={show ? t('Hide password') : t('Show password')}
        aria-pressed={show}
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
      </button>
    </span>
  )
}
