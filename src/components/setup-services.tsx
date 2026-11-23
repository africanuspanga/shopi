import { useRouter } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { ServiceForm } from '#/components/booking'
import { BreakHours, SeatsField, WeekHours } from '#/components/hours'
import { LaterLink, PreviewToggle, ShopCard, StepHead, previewShop, usePass, useStepClock, type PreviewService } from '#/components/setup'
import { ErrorText } from '#/components/ui'
import type { SetupShop } from '#/lib/api/setup'
import { saveBookSettings } from '#/lib/api/services'
import { DEFAULT_BOOK, type BookSettings } from '#/lib/booking'
import { useT } from '#/lib/i18n'

/*
 * The setup for a business that sells services (roadmap `v-services`): step 2 is its first service and step 3 its
 * working hours, where a shop that sells products adds a product and says how buyers pay. Steps 1, 4 and 5 are shared
 * (src/routes/onboard.tsx, src/components/setup.tsx).
 */

/** Step 2: the first service. A name, how long it takes and a price are enough; clients book it once the hours are set. */
export function ServiceStep({
  shop,
  bar,
  onDraft,
  onLater,
}: {
  shop: SetupShop
  bar: React.ReactNode
  onDraft: (v: PreviewService) => void
  /** Opened again from "Your page is live" by a business that skipped it: "later" goes back there. */
  onLater?: () => void
}) {
  const t = useT()
  const router = useRouter()
  const pass = usePass(2)
  const [draft, setDraft] = useState<PreviewService>({ name: '', duration: 60, price: 0, price_from: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const follow = useCallback(
    (d: { name: string; duration: number; price: number; price_from: boolean }) => {
      const v = { name: d.name, duration: d.duration, price: d.price, price_from: d.price_from }
      setDraft(v)
      onDraft(v)
    },
    [onDraft],
  )

  async function skip() {
    if (onLater) return onLater()
    setBusy(true)
    setError('')
    if (!(await pass('skip'))) {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <>
      <StepHead bar={bar} title={t('Your first service')} sub={t('What clients book, how long it takes and the price. You add the rest after setup.')} />
      <PreviewToggle shop={previewShop(shop)} title={t('Your page, as clients will see it')}>
        <ShopCard shop={previewShop(shop)} products={[]} services={[draft]} />
      </PreviewToggle>
      <div className="mt-6">
        <ServiceForm
          plain
          service={null}
          saveLabel={t('Save and continue')}
          onDraft={follow}
          onSaved={async () => {
            // Saving the service passed the step (saveService); the route now shows the next one.
            await router.invalidate()
            window.scrollTo(0, 0)
          }}
        />
        <ErrorText>{error}</ErrorText>
        {/* A link, not a second button: the first service is what clients come to book. */}
        <div className="mt-2">
          <LaterLink onClick={skip} disabled={busy} />
        </div>
      </div>
    </>
  )
}

/** Step 3: the working days and hours. Clients only see times inside them, and can't book until they are saved. */
export function HoursStep({ shop, bar, services }: { shop: SetupShop; bar: React.ReactNode; services: PreviewService[] }) {
  const t = useT()
  const router = useRouter()
  const clock = useStepClock()
  const [book, setBook] = useState<BookSettings>(DEFAULT_BOOK)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await saveBookSettings({ data: { book, seconds: clock() } })
      if ('error' in res) {
        setBusy(false)
        return setError(
          {
            hours: t('Check the hours: each day closes after it opens.'),
            closed: t('Switch on at least one working day.'),
            rest: t('The break covers every working hour. Shorten it.'),
          }[res.error ?? 'hours'],
        )
      }
      await router.invalidate()
      window.scrollTo(0, 0)
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  // No "I'll do this later" here (the founder, 23 Nov 2026): without saved hours no client can book, and the hours
  // shown are already a working week, so saving them is the one tap that passes this step.
  return (
    <>
      <StepHead bar={bar} title={t('When you work')} sub={t('Clients only see free times inside these hours. Switch off the days you are closed.')} />
      <PreviewToggle shop={previewShop(shop)} title={t('Your page, as clients will see it')}>
        <ShopCard shop={previewShop(shop)} products={[]} services={services} />
      </PreviewToggle>
      <div className="mt-4">
        <WeekHours value={book} onChange={setBook} />
        <div className="border-t border-line pt-4">
          <BreakHours value={book} onChange={setBook} />
        </div>
        <div className="mt-6">
          <SeatsField value={book} onChange={setBook} />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        <button type="button" className="btn btn-lg w-full" disabled={busy} onClick={save}>
          {busy ? t('Saving') : t('Save and continue')}
        </button>
      </div>
    </>
  )
}
