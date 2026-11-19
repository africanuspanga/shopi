import { Minus, Plus } from 'lucide-react'
import { FieldGroup, Switch } from '#/components/ui'
import { AHEAD_CHOICES, SEATS_MAX, readTime, timeText, weekdayName, type BookSettings } from '#/lib/booking'
import { useLang, useT } from '#/lib/i18n'

/*
 * A business's working hours (roadmap `v-services`): the days and hours it works, its break, and the booking rules.
 * The hours page shows all of it; the setup shows the days and hours only.
 */

/** Monday first, the way a week is read here; the settings keep Sunday first (getUTCDay). */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

/** A time field. An end time of 00:00 means midnight at the end of the day. */
function TimeInput({ value, onChange, label, end = false, disabled = false }: { value: number; onChange: (min: number) => void; label: string; end?: boolean; disabled?: boolean }) {
  return (
    <input
      type="time"
      step={900}
      aria-label={label}
      disabled={disabled}
      className="input tnum h-11 w-[84px] px-2 text-center text-15 disabled:text-faint sm:w-[104px] max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
      value={timeText(value % (24 * 60))}
      onChange={(e) => {
        const min = readTime(e.target.value)
        if (min != null) onChange(end && min === 0 ? 24 * 60 : min)
      }}
    />
  )
}

/** The seven days: a switch each, and the hours of the days it is on. */
export function WeekHours({ value, onChange }: { value: BookSettings; onChange: (next: BookSettings) => void }) {
  const t = useT()
  const lang = useLang()
  const setDay = (d: number, hours: BookSettings['days'][number]) => onChange({ ...value, days: value.days.map((x, i) => (i === d ? hours : x)) })
  // A day switched on starts with the hours of a day already on, so a week is set in a few taps.
  const model = value.days.find(Boolean) ?? { open: 9 * 60, close: 18 * 60 }
  return (
    <ul className="divide-y divide-line">
      {WEEK.map((d) => {
        const hours = value.days[d]
        const name = weekdayName(lang, d)
        return (
          <li key={d} className="flex min-h-[68px] flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
            <label className="flex cursor-pointer items-center gap-3 sm:min-w-[136px]">
              <span className="relative inline-flex shrink-0">
                <input type="checkbox" className="peer sr-only" checked={!!hours} onChange={(e) => setDay(d, e.target.checked ? { ...model } : null)} />
                <span className="h-7 w-12 rounded-full bg-raised transition-colors duration-200 peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
                <span className="absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgb(10_10_10/0.2)] transition-transform duration-200 ease-[var(--ease-out)] peer-checked:translate-x-5" />
              </span>
              {/* Phones get the short name, so a day and its hours stay on one line. */}
              <span className={`text-15 font-medium ${hours ? '' : 'text-muted'}`}>
                <span className="sm:hidden">{weekdayName(lang, d, false)}</span>
                <span className="hidden sm:inline">{name}</span>
              </span>
            </label>
            {hours ? (
              <span className="flex items-center gap-2">
                <TimeInput label={t('{day}: opens', { day: name })} value={hours.open} onChange={(open) => open < 24 * 60 - 15 && setDay(d, { open, close: Math.max(hours.close, open + 15) })} />
                <span className="text-muted">–</span>
                <TimeInput end label={t('{day}: closes', { day: name })} value={hours.close} onChange={(close) => close > hours.open && setDay(d, { open: hours.open, close })} />
              </span>
            ) : (
              <span className="text-14 text-muted">{t('Closed')}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A break on every working day, when no client can book. */
export function BreakHours({ value, onChange }: { value: BookSettings; onChange: (next: BookSettings) => void }) {
  const t = useT()
  const rest = value.rest
  return (
    <div>
      <Switch
        label={t('A break every working day')}
        sub={t('Lunch or prayers: clients can’t book into it.')}
        checked={!!rest}
        onChange={(on) => onChange({ ...value, rest: on ? { from: 13 * 60, to: 14 * 60 } : null })}
      />
      {rest && (
        <div className="fade mt-3 flex items-center gap-2">
          <TimeInput label={t('Break starts')} value={rest.from} onChange={(from) => from < 24 * 60 - 15 && onChange({ ...value, rest: { from, to: Math.max(rest.to, from + 15) } })} />
          <span className="text-muted">–</span>
          <TimeInput end label={t('Break ends')} value={rest.to} onChange={(to) => to > rest.from && onChange({ ...value, rest: { from: rest.from, to } })} />
        </div>
      )}
    </div>
  )
}

/** How many clients are served at the same time: a salon with three stylists serves 3. */
export function SeatsField({ value, onChange }: { value: BookSettings; onChange: (next: BookSettings) => void }) {
  const t = useT()
  const set = (n: number) => onChange({ ...value, seats: Math.min(SEATS_MAX, Math.max(1, n)) })
  return (
    <FieldGroup label={t('Clients at the same time')} hint={t('How many clients you serve at once. A salon with three stylists: 3.')}>
      <div className="flex items-center gap-3">
        <button type="button" className="icon-btn bg-well" aria-label={t('Fewer')} disabled={value.seats <= 1} onClick={() => set(value.seats - 1)}>
          <Minus size={18} strokeWidth={1.75} />
        </button>
        <span className="tnum w-8 text-center text-20 font-semibold" aria-live="polite">
          {value.seats}
        </span>
        <button type="button" className="icon-btn bg-well" aria-label={t('More')} disabled={value.seats >= SEATS_MAX} onClick={() => set(value.seats + 1)}>
          <Plus size={18} strokeWidth={1.75} />
        </button>
      </div>
    </FieldGroup>
  )
}

/** How far ahead clients book, and whether the business confirms each booking itself. */
export function BookRules({ value, onChange }: { value: BookSettings; onChange: (next: BookSettings) => void }) {
  const t = useT()
  const ahead: Record<number, string> = { 7: t('1 week'), 14: t('2 weeks'), 30: t('1 month'), 60: t('2 months') }
  return (
    <div className="space-y-6">
      <SeatsField value={value} onChange={onChange} />
      <FieldGroup label={t('How far ahead clients can book')} radio>
        <div className="flex flex-wrap gap-2">
          {AHEAD_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value.ahead === n} aria-pressed={value.ahead === n} className="chip" onClick={() => onChange({ ...value, ahead: n })}>
              {ahead[n]}
            </button>
          ))}
        </div>
      </FieldGroup>
      <div className="rounded-16 bg-page p-4">
        <Switch
          label={t('I confirm each booking myself')}
          sub={value.confirm ? t('On: a booking waits until you confirm it. The time is held meanwhile.') : t('Off: a client’s booking is confirmed at once.')}
          checked={value.confirm}
          onChange={(confirm) => onChange({ ...value, confirm })}
        />
      </div>
    </div>
  )
}
