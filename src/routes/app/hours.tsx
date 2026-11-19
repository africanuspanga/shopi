import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { BookRules, BreakHours, WeekHours } from '#/components/hours'
import { TimeOffSheet, timeOffLine } from '#/components/diary'
import { Card, ErrorText, Nothing, Page, Toast, TopBar } from '#/components/ui'
import { getBookSettings, removeTimeOff, saveBookSettings } from '#/lib/api/services'
import { DEFAULT_BOOK, dayText, type BookSettings } from '#/lib/booking'
import { useLang, useT } from '#/lib/i18n'

/**
 * Working hours (roadmap `v-services`): the days and hours the business works, its break, how bookings behave, and
 * the days it takes off. Clients only see times inside these hours; nothing can be booked until they are saved once.
 */
export const Route = createFileRoute('/app/hours')({
  loader: () => getBookSettings(),
  head: () => ({ meta: [{ title: 'Working hours · Shopi' }] }),
  component: Hours,
})

function Hours() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const data = Route.useLoaderData()
  const [book, setBook] = useState<BookSettings>(data.book ?? DEFAULT_BOOK)
  const [saved, setSaved] = useState(JSON.stringify(data.book))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [adding, setAdding] = useState(false)
  const dirty = JSON.stringify(book) !== saved

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await saveBookSettings({ data: { book } })
      if ('error' in res) {
        setError(
          {
            hours: t('Check the hours: each day closes after it opens.'),
            closed: t('Switch on at least one working day.'),
            rest: t('The break covers every working hour. Shorten it.'),
          }[res.error ?? 'hours'],
        )
      } else {
        setSaved(JSON.stringify(book))
        setDone(true)
        setTimeout(() => setDone(false), 1800)
        await router.invalidate()
      }
    } catch {
      setError(t('Something went wrong. Try again.'))
    }
    setBusy(false)
  }

  return (
    <Page nav wide>
      <TopBar
        back="/app/services"
        title={t('Working hours')}
        sub={data.book ? t('Clients can book inside these hours') : t('Say when you work, and clients can book')}
      />

      <div className="grid items-start gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3 md:space-y-4">
          <Card title={t('Days and hours')} sub={t('Switch off the days you are closed.')}>
            <div className="mt-2">
              <WeekHours value={book} onChange={setBook} />
            </div>
            <div className="mt-2 border-t border-line pt-4">
              <BreakHours value={book} onChange={setBook} />
            </div>
          </Card>
        </div>

        <div className="space-y-3 md:space-y-4">
          <Card title={t('Bookings')}>
            <div className="mt-4">
              <BookRules value={book} onChange={setBook} />
            </div>
          </Card>

          <Card
            title={t('Time off')}
            sub={t('A holiday, a day off, a few hours away. Clients can’t book into it.')}
            right={
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(true)}>
                <Plus size={16} strokeWidth={2.25} /> {t('Add')}
              </button>
            }
          >
            <div className="mt-4">
              {data.blocks.length === 0 ? (
                <Nothing>{t('No time off coming up.')}</Nothing>
              ) : (
                <ul className="divide-y divide-line">
                  {data.blocks.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-15 font-medium">{dayText(lang, b.day, true)}</span>
                        <span className="block truncate text-13 text-muted">{timeOffLine(t, b)}</span>
                      </span>
                      <button
                        type="button"
                        className="icon-btn h-9 w-9"
                        aria-label={t('Remove time off on {day}', { day: dayText(lang, b.day) })}
                        onClick={async () => {
                          await removeTimeOff({ data: { id: b.id } })
                          router.invalidate()
                        }}
                      >
                        <X size={16} strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 max-w-[560px]">
        <ErrorText>{error}</ErrorText>
        <button type="button" className="btn btn-lg mt-2 w-full md:w-auto md:px-10" disabled={busy || (!dirty && !!data.book)} onClick={save}>
          {busy ? t('Saving') : data.book ? t('Save changes') : t('Save and open bookings')}
        </button>
      </div>

      <TimeOffSheet open={adding} onClose={() => setAdding(false)} onSaved={() => router.invalidate()} />
      <Toast show={done}>
        <Check size={16} strokeWidth={2.25} /> {t('Saved')}
      </Toast>
    </Page>
  )
}
