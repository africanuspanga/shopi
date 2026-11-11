import { Link } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MiniStore, NewOrderCard, Phone } from '#/components/showcase'
import { Wordmark } from '#/components/ui'
import { useT } from '#/lib/i18n'

/** Sign-in and sign-up: the form on the left, the product on a dark panel on the right (desktop only). */
export function AuthLayout({ children, topRight, aside }: { children: ReactNode; topRight?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-dvh flex-col px-4 pt-[max(8px,env(safe-area-inset-top))] pb-10 md:px-10">
        <header className="flex h-16 items-center justify-between">
          <Link to="/" aria-label="Shopi">
            <Wordmark className="h-[22px] w-auto" />
          </Link>
          {topRight}
        </header>
        <main className="rise mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-8">{children}</main>
      </div>
      <aside className="sticky top-0 hidden h-dvh p-3 lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] bg-ink p-10 text-white">{aside ?? <ProductAside />}</div>
      </aside>
    </div>
  )
}

function ProductAside() {
  const t = useT()
  return (
    <>
      <p className="display text-[44px] xl:text-[56px]">
        {t('Your shop in one link')}<span className="text-moto">.</span>
      </p>
      <p className="mt-4 max-w-[26rem] text-[16px] leading-relaxed text-white/60">{t('One link for your Instagram, TikTok and WhatsApp. Buyers order by themselves; you see every order in one place.')}</p>
      <div className="relative mt-auto h-[480px] xl:h-[540px]">
        <Phone className="absolute top-0 left-1/2 h-[620px] w-[310px] -translate-x-1/2 xl:h-[660px] xl:w-[328px]">
          <MiniStore />
        </Phone>
        <NewOrderCard className="absolute top-[250px] left-[calc(50%-270px)] xl:left-[calc(50%-300px)]" />
      </div>
    </>
  )
}

export function StepBar({ step, of }: { step: number; of: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: of }).map((_, i) => (
        <span key={i} className={`h-1 w-8 rounded-full ${i < step ? 'bg-ink' : 'bg-raised'}`} />
      ))}
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
        {show ? <EyeOff size={17} strokeWidth={1.6} /> : <Eye size={17} strokeWidth={1.6} />}
      </button>
    </span>
  )
}
