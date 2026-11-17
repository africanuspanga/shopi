import { Link, useRouteContext } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { can, type Feature } from '#/lib/plans'
import { useT } from '#/lib/i18n'

/** Whether the logged-in seller's shop has a Tembo feature (the plan rides with the session; `src/lib/plans.ts`). */
export function useCan(feature: Feature, opts: { using?: boolean } = {}) {
  const { shop } = useRouteContext({ from: '/app' })
  return can(shop.plan, feature, opts)
}

/** A small label beside a Tembo feature's name. */
export function TemboPill({ className = '' }: { className?: string }) {
  return <span className={`inline-flex h-5 shrink-0 items-center rounded-full bg-ink px-2 text-[12px] font-medium text-white ${className}`}>Tembo</span>
}

/**
 * Where a free shop meets a Tembo feature: what it does, and the way to Tembo. Never on buyer pages. Until billing is
 * live the plan page says paying opens soon.
 */
export function TemboLock({ title, body, className = '' }: { title: string; body: string; className?: string }) {
  const t = useT()
  return (
    <div className={`rounded-[20px] bg-page p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <TemboPill />
        <p className="text-[15px] font-semibold">{title}</p>
      </div>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{body}</p>
      <Link to="/app/plan" className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
        {t('See what Tembo adds')} <ArrowRight size={14} strokeWidth={1.75} />
      </Link>
    </div>
  )
}
