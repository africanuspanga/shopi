import { useCallback, useState } from 'react'
import { ServiceForm } from '#/components/booking'
import { SimpleHours, WeekHours, sameHours } from '#/components/hours'
import { LaterLink, PreviewFrame, PreviewToggle, ShopScreen, StepHead, previewShop, useMoveOn, usePass, useStepClock, type PreviewService } from '#/components/setup'
import { ErrorText, showFirstError } from '#/components/ui'
import type { SetupService, SetupShop } from '#/lib/api/setup'
import { saveBookSettings } from '#/lib/api/services'
import { DEFAULT_BOOK, parseBook, type BookSettings } from '#/lib/booking'
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
  editing,
}: {
  shop: SetupShop
  bar: React.ReactNode
  onDraft: (v: PreviewService) => void
  /** Opened again from "Your page is live" by a business that skipped it: "later" goes back there. */
  onLater?: () => void
  /** Opened again with Back: the service saved here, to correct. */
  editing?: SetupService | null
}) {
  const t = useT()
  const moveOn = useMoveOn()
  const pass = usePass(2)
  const [draft, setDraft] = useState<PreviewService>(editing ?? { name: '', duration: 60, price: 0, price_from: false })
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
      <StepHead
        bar={bar}
        title={t('Your first service')}
        sub={t('What clients book, how long it takes and the price. You add the rest after setup.')}
        aside={
          <PreviewToggle title={t('Your page, as clients will see it')}>
            <PreviewFrame>
              <ShopScreen kind="services" shop={previewShop(shop)} products={[]} services={[draft]} />
            </PreviewFrame>
          </PreviewToggle>
        }
      />
      <div className="mt-6">
        <ServiceForm
          plain
          service={editing ?? null}
          saveLabel={t('Save and continue')}
          onDraft={follow}
          // Saving the service passed the step (saveService); the route now shows the next one.
          onSaved={moveOn}
        />
        <ErrorText>{error}</ErrorText>
        {/* A link, not a second button: the first service is what clients come to book. */}
        {!editing && (
          <div className="mt-2">
            <LaterLink onClick={skip} disabled={busy} />
          </div>
        )}
      </div>
    </>
  )
}

/** Step 3: the working days and hours. Clients only see times inside them, and can't book until they are saved. */
export function HoursStep({ shop, bar, services }: { shop: SetupShop; bar: React.ReactNode; services: PreviewService[] }) {
  const t = useT()
  const moveOn = useMoveOn()
  const clock = useStepClock()
  // Opened again with Back: the hours saved; the first time, a typical working week.
  const [book, setBook] = useState<BookSettings>(() => parseBook(shop.book) ?? DEFAULT_BOOK)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // One pair of hours for the days that are on, or (a business whose days differ) the list of seven.
  const [each, setEach] = useState(() => !sameHours(book))
  const [noDay, setNoDay] = useState(false)
  const change = (next: BookSettings) => {
    setBook(next)
    setNoDay(false)
  }

  async function save() {
    setError('')
    // Said on the days themselves, like every missing answer in the setup.
    if (!book.days.some(Boolean)) {
      setNoDay(true)
      return showFirstError()
    }
    setBusy(true)
    try {
      const res = await saveBookSettings({ data: { book, seconds: clock() } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'closed') {
          setNoDay(true)
          return showFirstError()
        }
        return setError(res.error === 'rest' ? t('The break covers every working hour. Shorten it.') : t('Check the hours: each day closes after it opens.'))
      }
      await moveOn()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  const quiet = 'flex min-h-11 items-center text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink'
  // No "I'll do this later" here (the founder, 23 Nov 2026): without saved hours no client can book, and the hours
  // shown are already a working week, so saving them is the one tap that passes this step.
  return (
    <>
      <StepHead
        bar={bar}
        title={t('When you work')}
        sub={t('Clients book only inside these hours. Change what is different.')}
        aside={
          <PreviewToggle title={t('Your page, as clients will see it')}>
            <PreviewFrame>
              <ShopScreen live kind="services" shop={previewShop(shop)} products={[]} services={services} />
            </PreviewFrame>
          </PreviewToggle>
        }
      />
      <div className="mt-6">
        {each ? (
          <>
            {noDay && <p role="alert" data-invalid="" className="mb-1 text-13 text-bad">{t('Switch on at least one working day.')}</p>}
            <WeekHours full value={book} onChange={change} />
            {sameHours(book) && (
              <button type="button" className={quiet} onClick={() => setEach(false)}>
                {t('The same hours every day')}
              </button>
            )}
          </>
        ) : (
          <>
            <SimpleHours value={book} onChange={change} error={noDay ? t('Choose at least one day you work.') : undefined} />
            <button type="button" className={`${quiet} mt-2`} onClick={() => setEach(true)}>
              {t('Different hours on some days')}
            </button>
          </>
        )}
        <p className="mt-2 text-13 leading-5 text-muted">{t('A lunch break and serving several clients at once are in Working hours, after setup.')}</p>
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
