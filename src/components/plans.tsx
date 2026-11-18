import { Check } from 'lucide-react'
import { PLANS, TEMBO_MONTH } from '#/lib/plans'
import { useT } from '#/lib/i18n'

type Plan = (typeof PLANS)[number]
const money = (n: number) => n.toLocaleString('en-US')

/**
 * A plan's price, the way the founder asked for it (17 Nov): Tembo per year, with what that is a month beside it so it
 * reads as small as it is; Free as TSh 0 with no time limit. `dark` for the ink card.
 */
export function PlanPrice({ plan, dark = false, className = '' }: { plan: Plan; dark?: boolean; className?: string }) {
  const t = useT()
  const quiet = dark ? 'text-white/70' : 'text-muted'
  return (
    <div className={className}>
      <p className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-17 font-medium md:text-20">TSh</span>
        <span className="display text-48 md:text-64">{money(plan.price)}</span>
        <span className={`text-15 ${quiet}`}>{plan.price ? t('a year') : t('no time limit')}</span>
      </p>
      <p className={`mt-1 text-14 ${quiet}`}>
        {plan.price ? t('About TSh {n} a month', { n: money(TEMBO_MONTH) }) : t('Open your shop and sell, for as long as you like')}
      </p>
    </div>
  )
}

/** A plan's list. Items not built yet carry a "Soon" pill, so the card never promises what Shopi can't do today. */
export function PlanItems({ plan, dark = false, className = '' }: { plan: Plan; dark?: boolean; className?: string }) {
  const t = useT()
  return (
    <ul className={`space-y-3 text-15 ${className}`}>
      {plan.items.map((x) => (
        <li key={x.text} className="flex items-start gap-3">
          <Check size={18} strokeWidth={2.25} className="mt-[3px] shrink-0" />
          <span>
            {t(x.text)}
            {x.soon && (
              <span className={`ml-2 inline-flex h-5 items-center rounded-full px-2 align-[2px] text-12 font-medium ${dark ? 'bg-white/15 text-white' : 'bg-well text-ink-2'}`}>
                {t('Soon')}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
