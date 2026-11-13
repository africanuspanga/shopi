import { createFileRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { Page, TopBar } from '#/components/ui'
import { getMyPlan } from '#/lib/api/merchant'
import { useLang, useT } from '#/lib/i18n'
import { BILLING_LIVE, PLANS, SETUP_TRIAL_DAYS, type PlanState } from '#/lib/plans'

export const Route = createFileRoute('/app/plan')({
  loader: () => getMyPlan(),
  head: () => ({ meta: [{ title: 'Your plan · Shopi' }] }),
  component: PlanPage,
})

function PlanPage() {
  const t = useT()
  const { plan } = Route.useLoaderData()
  const current = plan && (plan.kind === 'paid' || plan.kind === 'ended') ? plan.plan : null
  return (
    <Page nav wide>
      <TopBar back="/app" title={t('Your plan')} sub={t('Paid once a year by mobile money. No commission on your sales.')} />
      {plan && <Status plan={plan} />}

      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:gap-6">
        {PLANS.map((p) => (
          <div key={p.id} className="card flex flex-col p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="title text-[22px]">{p.name}</p>
                <p className="mt-1 text-[14px] text-ink-2">{t(p.lead)}</p>
              </div>
              {current === p.id && <span className="rounded-full bg-ink px-3 py-1 text-[13px] font-medium text-white">{t('Your plan')}</span>}
            </div>
            <p className="mt-5 flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[18px] font-medium">TSh</span>
              <span className="display text-[48px] md:text-[56px]">{p.price.toLocaleString('en-US')}</span>
              <span className="text-[15px] text-muted">/ {t('year')}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-[15px]">
              {p.items.map((x) => (
                <li key={x} className="flex items-start gap-3">
                  <Check size={17} strokeWidth={2} className="mt-[3px] shrink-0" /> {t(x)}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-lg mt-8 w-full" disabled={!BILLING_LIVE}>
              {BILLING_LIVE ? t('Pay {amount} by mobile money', { amount: `TSh ${p.price.toLocaleString('en-US')}` }) : t('Paying in Shopi opens soon')}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-[60ch] text-[14px] leading-relaxed text-muted">
        {t('If a plan ends unpaid, your shop takes a break: buyers still see it and can message you on WhatsApp, but can’t order. Nothing is deleted, and paying opens it again.')}
      </p>
    </Page>
  )
}

function Status({ plan }: { plan: PlanState }) {
  const t = useT()
  const lang = useLang()
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' })

  let title = ''
  let line = ''
  let note = ''
  if (plan.kind === 'demo') {
    title = t('Demo shop')
    line = t('Sample shop. It never needs a plan.')
  } else if (plan.kind === 'trial') {
    title = t(plan.daysLeft === 1 ? '{n} day left in your free trial' : '{n} days left in your free trial', { n: plan.daysLeft })
    line = t('Your trial ends on {date}.', { date: date(plan.until) })
    if (plan.setupBonus) note = t('Finish setting up your shop to get {n} days free.', { n: SETUP_TRIAL_DAYS })
  } else if (plan.kind === 'paid') {
    title = PLANS.find((p) => p.id === plan.plan)?.name ?? ''
    line = t('Paid until {date}.', { date: date(plan.until) })
  } else {
    title = plan.plan ? t('Your plan has ended') : t('Your free trial has ended')
    line = plan.paused
      ? t('Your shop is taking a break. Choose a plan to open it again.')
      : t('You can keep selling. Paying by mobile money opens in Shopi soon, and we will tell you on WhatsApp.')
  }

  return (
    <section className="rise rounded-[28px] bg-ink p-6 text-white md:p-8">
      <p className="text-[14px] text-white/60">{t('Your plan')}</p>
      <h2 className="title mt-2 text-[26px] md:text-[34px]">{title}</h2>
      <p className="mt-2 text-[15px] text-white/75">{line}</p>
      {note && <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white/85">{note}</p>}
    </section>
  )
}
