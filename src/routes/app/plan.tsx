import { createFileRoute } from '@tanstack/react-router'
import { PlanItems, PlanPrice } from '#/components/plans'
import { Page, TopBar, useEntrance } from '#/components/ui'
import { getMyPlan } from '#/lib/api/merchant'
import { useLang, useT } from '#/lib/i18n'
import { BILLING_LIVE, PLANS, TEMBO_PRICE, type PlanState } from '#/lib/plans'

export const Route = createFileRoute('/app/plan')({
  loader: () => getMyPlan(),
  head: () => ({ meta: [{ title: 'Your plan · Shopi' }] }),
  component: PlanPage,
})

/** Free or Tembo (17 Nov 2026): what the shop is on, and what Tembo adds. Paying opens with billing (Selcom). */
function PlanPage() {
  const t = useT()
  const { plan } = Route.useLoaderData()
  const current = plan?.kind === 'tembo' ? 'tembo' : plan?.kind === 'free' ? 'free' : null
  return (
    <Page nav wide>
      <TopBar back="/app" title={t('Your plan')} sub={t('Shopi is free for as long as you sell. Tembo adds more, once a year. No commission on your sales.')} />
      {plan && <Status plan={plan} />}

      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:gap-6">
        {PLANS.map((p) => {
          const dark = p.id === 'tembo'
          return (
            <div key={p.id} className={`flex flex-col rounded-[28px] p-6 md:p-8 ${dark ? 'bg-ink text-white' : 'card'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="title text-[22px]">{t(p.name)}</p>
                  <p className={`mt-1 text-[14px] ${dark ? 'text-white/70' : 'text-ink-2'}`}>{t(p.lead)}</p>
                </div>
                {current === p.id && (
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${dark ? 'bg-white text-ink' : 'bg-ink text-white'}`}>{t('Your plan')}</span>
                )}
              </div>
              <PlanPrice plan={p} dark={dark} className="mt-5" />
              <PlanItems plan={p} dark={dark} className="mt-6 flex-1" />
              {p.id === 'tembo' && current !== 'tembo' && plan?.kind !== 'demo' && (
                <button type="button" className="btn btn-lg mt-8 w-full bg-white text-ink" disabled={!BILLING_LIVE}>
                  {BILLING_LIVE ? t('Pay {amount} by mobile money', { amount: `TSh ${TEMBO_PRICE.toLocaleString('en-US')}` }) : t('Paying for Tembo opens soon')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 max-w-[60ch] text-[14px] leading-relaxed text-muted">
        {t('If Tembo ends unpaid, your shop goes back to Free and keeps selling. Nothing is deleted.')}
      </p>
    </Page>
  )
}

function Status({ plan }: { plan: PlanState }) {
  const rise = useEntrance()
  const t = useT()
  const lang = useLang()
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' })

  const [title, line, note] =
    plan.kind === 'demo'
      ? [t('Demo shop'), t('Sample shop. It never needs a plan.'), '']
      : plan.kind === 'tembo'
        ? ['Tembo', t('Paid until {date}.', { date: date(plan.until) }), plan.daysLeft <= 30 ? t('Renew before {date} to keep Tembo.', { date: date(plan.until) }) : '']
        : [t('Free'), t('Your shop is free for as long as you like. See what Tembo adds below.'), '']

  return (
    <section className={`${rise} card p-6 md:p-8`}>
      <p className="text-[14px] text-muted">{t('Your plan')}</p>
      <h2 className="title mt-2 text-[26px] md:text-[34px]">{title}</h2>
      <p className="mt-2 text-[15px] text-ink-2">{line}</p>
      {note && <p className="mt-4 inline-flex rounded-full bg-moto-soft px-3 py-1.5 text-[13px] text-moto-ink">{note}</p>}
    </section>
  )
}
