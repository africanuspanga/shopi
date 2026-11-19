import { useRouter } from '@tanstack/react-router'
import { CalendarClock, Check, Copy, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TimeGrid } from '#/components/booking'
import { WhatsAppMark } from '#/components/brand-icons'
import { BookingPill, ErrorText, Field, FieldGroup, Label, Sheet, Switch } from '#/components/ui'
import { addBooking, addTimeOff, getDayTimes, moveBooking, setBookingStatus, type DiaryBooking } from '#/lib/api/services'
import { DURATIONS, dayOf, dayText, durationText, readTime, servicePrice, timeText, type BookingStatus } from '#/lib/booking'
import { localPhone, waLink } from '#/lib/format'
import { asLang, translate, useLang, useT } from '#/lib/i18n'
import { SHOPI_ORIGIN } from '#/lib/host'

/*
 * The diary's sheets (roadmap `v-services`): one booking with what the business can do with it, adding a booking by
 * hand (a walk-in, a call), moving one, and taking time off.
 */

type T = ReturnType<typeof useT>
export type DiaryShop = { name: string; slug: string; lang: string; location: string }

/** "All day" or "13:00–15:00", then the note. */
export function timeOffLine(t: T, b: { start_min: number | null; end_min: number | null; note: string }) {
  const when = b.start_min == null || b.end_min == null ? t('All day') : `${timeText(b.start_min)}–${timeText(b.end_min)}`
  return [when, b.note].filter(Boolean).join(' · ')
}

/** The client's own page for a booking: where they change or cancel it. Always shopi.tz, which never lapses. */
export const bookingLink = (code: string) => `${SHOPI_ORIGIN}/bk/${code}`

/**
 * What the business sends the client on WhatsApp, in the language clients see the shop in. Shopi has no WhatsApp API
 * yet, so the business sends each one from its own WhatsApp (no cost per message).
 */
export function clientMessage(shop: DiaryShop, b: DiaryBooking, kind: 'remind' | 'confirmed' | 'cancelled' | 'hello') {
  const lang = asLang(shop.lang)
  const tr = (en: string, vars?: Record<string, string | number>) => translate(lang, en, vars)
  const vars = { name: b.customer_name, shop: shop.name, service: b.service_name, day: dayText(lang, b.day, true), time: timeText(b.start_min), link: bookingLink(b.code) }
  if (kind === 'remind') return tr('Hi {name}, a reminder of your booking at {shop}: {service}, {day} at {time}. To change or cancel it: {link}', vars)
  if (kind === 'confirmed') return tr('Hi {name}, your booking at {shop} is confirmed: {service}, {day} at {time}. To change or cancel it: {link}', vars)
  if (kind === 'cancelled')
    return tr('Hi {name}, we are sorry: we have had to cancel your booking at {shop} ({service}, {day} at {time}). You can book another time here: {link}', {
      ...vars,
      link: `${SHOPI_ORIGIN}/${shop.slug}`,
    })
  return tr('Hi {name}, this is {shop}, about your booking: {service}, {day} at {time}.', vars)
}

/** Day and time for the business's own forms: any day, the free times as chips, or any other time typed. */
function PickTime({
  day,
  start,
  duration,
  except,
  onDay,
  onStart,
}: {
  day: string
  start: number | null
  duration: number
  except?: string
  onDay: (day: string) => void
  onStart: (start: number | null) => void
}) {
  const t = useT()
  const [times, setTimes] = useState<number[] | null>(null)
  const [open, setOpen] = useState(true)
  const [other, setOther] = useState(false)
  useEffect(() => {
    let gone = false
    setTimes(null)
    getDayTimes({ data: { day, duration, except } }).then(
      (r) => {
        if (gone) return
        setTimes(r.times)
        setOpen(r.open)
      },
      () => !gone && setTimes([]),
    )
    return () => {
      gone = true
    }
  }, [day, duration, except])
  return (
    <div className="space-y-4">
      <Field label={t('Day')}>
        <input className="input" type="date" value={day} onChange={(e) => e.target.value && onDay(e.target.value)} />
      </Field>
      {!other && (
        <TimeGrid
          times={times ?? []}
          loading={times == null}
          value={start}
          onChange={onStart}
          empty={open ? t('No free time left on this day.') : t('You are closed on this day.')}
        />
      )}
      {other ? (
        <Field label={t('Time')} hint={t('Any time, in or out of your working hours.')}>
          <input className="input tnum" type="time" step={300} value={start == null ? '' : timeText(start)} onChange={(e) => onStart(readTime(e.target.value))} />
        </Field>
      ) : (
        <button
          type="button"
          className="text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          onClick={() => {
            setOther(true)
            onStart(null)
          }}
        >
          {t('Another time')}
        </button>
      )}
    </div>
  )
}

/** Adding a booking by hand: a walk-in, a call, a chat. So the link never offers a time that is already taken. */
export function AddBookingSheet({
  open,
  onClose,
  day,
  services,
}: {
  open: boolean
  onClose: () => void
  day: string
  services: { id: string; name: string; duration: number; price: number; price_from: number }[]
}) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} title={t('Add a booking')}>
      {open && <AddBooking day={day} services={services} onClose={onClose} />}
    </Sheet>
  )
}

function AddBooking({ day: firstDay, services, onClose }: { day: string; services: { id: string; name: string; duration: number; price: number; price_from: number }[]; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(60)
  const [day, setDay] = useState(firstDay < dayOf(Date.now()) ? dayOf(Date.now()) : firstDay)
  const [start, setStart] = useState<number | null>(null)
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listed = services.find((s) => s.id === serviceId)
  const length = listed?.duration ?? duration

  async function save(force = false) {
    if (start == null) return setError(t('Choose a time.'))
    setBusy(true)
    setError('')
    try {
      const res = await addBooking({ data: { serviceId: listed?.id, name, duration, day, start, customer, phone, note, force } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'full') return setFull(true)
        return setError(
          {
            name: t('Enter the client’s name.'),
            service: t('Say what the booking is for.'),
            duration: t('How long it takes is between 5 minutes and 8 hours.'),
            time: t('That time doesn’t fit in the day. Choose another.'),
          }[res.error ?? 'time'],
        )
      }
      await router.invalidate()
      onClose()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save(full)
      }}
    >
      <FieldGroup label={t('Service')} radio>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={serviceId === s.id}
              aria-pressed={serviceId === s.id}
              className="chip"
              onClick={() => {
                setServiceId(s.id)
                setStart(null)
                setFull(false)
              }}
            >
              {s.name}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={!listed}
            aria-pressed={!listed}
            className="chip"
            onClick={() => {
              setServiceId('')
              setStart(null)
              setFull(false)
            }}
          >
            {t('Something else')}
          </button>
        </div>
      </FieldGroup>
      {!listed && (
        <div className="fade space-y-5">
          <Field label={t('What it is')}>
            <input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <FieldGroup label={t('How long it takes')} radio>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={duration === d}
                  aria-pressed={duration === d}
                  className="chip"
                  onClick={() => {
                    setDuration(d)
                    setStart(null)
                  }}
                >
                  {durationText(t, d)}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>
      )}
      <PickTime
        day={day}
        start={start}
        duration={length}
        onDay={(d) => {
          setDay(d)
          setStart(null)
          setFull(false)
        }}
        onStart={(s) => {
          setStart(s)
          setFull(false)
        }}
      />
      <Field label={t('Client’s name')}>
        <input className="input" maxLength={60} autoComplete="off" value={customer} onChange={(e) => setCustomer(e.target.value)} />
      </Field>
      <Field label={t('Client’s WhatsApp number')} aside={t('Optional')} hint={t('With a number you can send a reminder the day before.')}>
        <input className="input" type="tel" inputMode="tel" autoComplete="off" placeholder="0754 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label={t('Note')} aside={t('Optional')}>
        <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {full && <p className="rounded-16 bg-moto-soft px-4 py-3 text-14 leading-relaxed text-moto-ink">{t('That time is already full. Add this booking anyway?')}</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-lg w-full" disabled={busy || !customer.trim() || start == null}>
        {busy ? t('Saving') : full ? t('Add it anyway') : t('Add the booking')}
      </button>
    </form>
  )
}

/** Time off: a whole day, or a few hours of one. */
export function TimeOffSheet({ open, onClose, onSaved, day }: { open: boolean; onClose: () => void; onSaved: () => void; day?: string }) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} title={t('Take time off')}>
      {open && <TimeOff day={day} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  )
}

function TimeOff({ day: firstDay, onClose, onSaved }: { day?: string; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const today = dayOf(Date.now())
  const [day, setDay] = useState(firstDay && firstDay >= today ? firstDay : today)
  const [whole, setWhole] = useState(true)
  const [from, setFrom] = useState(13 * 60)
  const [to, setTo] = useState(15 * 60)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState<number | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await addTimeOff({ data: { day, start: whole ? null : from, end: whole ? null : to, note } })
      if ('error' in res) {
        setBusy(false)
        return setError({ day: t('Choose today or a later day.'), time: t('The end must be after the start.'), limit: t('That is a lot of time off. Remove some first.') }[res.error ?? 'day'])
      }
      onSaved()
      // Bookings already inside it stay: the business tells those clients itself.
      if (res.booked > 0) {
        setBusy(false)
        return setBooked(res.booked)
      }
      onClose()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  if (booked != null)
    return (
      <div>
        <p className="text-15 leading-relaxed text-ink-2">
          {t(
            booked === 1
              ? 'Saved. {n} client is already booked in that time. Their booking stays: open it in the diary to move or cancel it, and tell them on WhatsApp.'
              : 'Saved. {n} clients are already booked in that time. Their bookings stay: open each in the diary to move or cancel it, and tell them on WhatsApp.',
            { n: booked },
          )}
        </p>
        <button type="button" className="btn btn-lg mt-6 w-full" onClick={onClose}>
          {t('OK')}
        </button>
      </div>
    )

  return (
    <form className="space-y-5" onSubmit={save}>
      <Field label={t('Day')}>
        <input className="input" type="date" min={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
      </Field>
      <div className="rounded-16 bg-page p-4">
        <Switch label={t('The whole day')} sub={whole ? t('No client can book on this day') : t('Only the hours below')} checked={whole} onChange={setWhole} />
      </div>
      {!whole && (
        <div className="fade grid grid-cols-2 gap-4">
          <Field label={t('From')}>
            <input className="input tnum" type="time" step={900} value={timeText(from)} onChange={(e) => setFrom(readTime(e.target.value) ?? from)} />
          </Field>
          <Field label={t('To')}>
            <input className="input tnum" type="time" step={900} value={timeText(to % (24 * 60))} onChange={(e) => setTo(readTime(e.target.value) || 24 * 60)} />
          </Field>
        </div>
      )}
      <Field label={t('Note')} aside={t('Optional')} hint={t('Only you see it.')}>
        <input className="input" maxLength={80} placeholder={t('Holiday, training, a family day')} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-lg w-full" disabled={busy}>
        {busy ? t('Saving') : t('Save time off')}
      </button>
    </form>
  )
}

/** One booking: who, what, when, and what the business can do with it now. */
export function BookingSheet({ booking, shop, onClose }: { booking: DiaryBooking | null; shop: DiaryShop; onClose: () => void }) {
  return (
    <Sheet open={!!booking} onClose={onClose} title={booking?.customer_name}>
      {booking && <Booking key={booking.id} b={booking} shop={shop} onClose={onClose} />}
    </Sheet>
  )
}

function Booking({ b, shop, onClose }: { b: DiaryBooking; shop: DiaryShop; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [moving, setMoving] = useState(false)
  const [copied, setCopied] = useState(false)
  // Shown at once; the diary's own row follows when the list reloads.
  const [status, setStatus] = useState<BookingStatus>(b.status)
  const started = b.start_at <= Date.now()
  const price = servicePrice(t, b)

  async function set(next: BookingStatus, ask?: string) {
    if (ask && !window.confirm(ask)) return
    setBusy(true)
    setError('')
    try {
      const res = await setBookingStatus({ data: { id: b.id, status: next } })
      if ('error' in res) setError(t('This booking changed meanwhile. Close it and open it again.'))
      else setStatus(next)
      await router.invalidate()
    } catch {
      setError(t('Something went wrong. Try again.'))
    }
    setBusy(false)
  }

  if (moving) return <MoveBooking b={b} onBack={() => setMoving(false)} onMoved={onClose} />

  const message = status === 'cancelled' ? 'cancelled' : status === 'confirmed' ? (b.status === 'requested' ? 'confirmed' : started ? 'hello' : 'remind') : 'hello'
  const waLabel = message === 'remind' ? t('Send a reminder') : message === 'confirmed' ? t('Tell them it’s confirmed') : message === 'cancelled' ? t('Tell them it’s cancelled') : 'WhatsApp'

  return (
    <div>
      <div className="rounded-16 bg-page p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="title text-20">
              {dayText(lang, b.day)} · <span className="tnum">{timeText(b.start_min)}</span>
            </p>
            <p className="mt-1 text-14 text-ink-2">
              {b.service_name} · {durationText(t, b.duration)}
            </p>
            {price && <p className="tnum mt-0.5 text-14 text-ink-2">{price}</p>}
          </div>
          <BookingPill status={status} />
        </div>
        {b.note && <p className="mt-3 border-t border-line pt-3 text-14 leading-relaxed text-ink-2">{b.note}</p>}
        <p className="meta mt-3">
          {b.origin === 'manual' ? t('Added by you') : t('Booked on your link')}
          {status === 'cancelled' && b.cancelled_by === 'client' ? ` · ${t('Cancelled by the client')}` : ''}
        </p>
      </div>

      {b.customer_phone ? (
        <div className="mt-4">
          <p className="code text-14 text-ink-2">{localPhone(b.customer_phone)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a href={waLink(b.customer_phone, clientMessage(shop, b, message))} target="_blank" rel="noreferrer" className="btn btn-sm h-11">
              <WhatsAppMark size={18} /> {waLabel}
            </a>
            <a href={`tel:${b.customer_phone}`} className="btn btn-ghost btn-sm h-11">
              <Phone size={16} strokeWidth={1.75} /> {t('Call')}
            </a>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-13 text-muted">{t('No number for this client, so no reminder can be sent.')}</p>
      )}

      <div className="mt-5 space-y-2">
        {status === 'requested' && (
          <>
            <button type="button" className="btn btn-lg w-full" disabled={busy} onClick={() => set('confirmed')}>
              <Check size={18} strokeWidth={2.25} /> {t('Confirm the booking')}
            </button>
            <button type="button" className="btn w-full bg-transparent text-bad hover:bg-bad/[0.06]" disabled={busy} onClick={() => set('cancelled', t('Decline this booking? The time becomes free again.'))}>
              {t('Decline')}
            </button>
          </>
        )}
        {status === 'confirmed' && started && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn w-full" disabled={busy} onClick={() => set('done')}>
              <Check size={18} strokeWidth={2.25} /> {t('Done')}
            </button>
            <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => set('noshow')}>
              {t('Didn’t come')}
            </button>
          </div>
        )}
        {(status === 'confirmed' || status === 'requested') && (
          <button type="button" className="btn btn-quiet w-full" disabled={busy} onClick={() => setMoving(true)}>
            <CalendarClock size={16} strokeWidth={1.75} /> {t('Change the time')}
          </button>
        )}
        {status === 'confirmed' && (
          <button
            type="button"
            className="btn w-full bg-transparent text-bad hover:bg-bad/[0.06]"
            disabled={busy}
            onClick={() => set('cancelled', t('Cancel this booking? The time becomes free again. Tell {name} on WhatsApp.', { name: b.customer_name }))}
          >
            {t('Cancel booking')}
          </button>
        )}
        {(status === 'done' || status === 'noshow') && (
          <button type="button" className="btn btn-quiet w-full" disabled={busy} onClick={() => set(status === 'done' ? 'noshow' : 'done')}>
            {status === 'done' ? t('Change to “Didn’t come”') : t('Change to “Done”')}
          </button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>

      {b.origin === 'online' || b.customer_phone ? (
        <button
          type="button"
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-14 bg-page px-4 py-3 text-left"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(bookingLink(b.code))
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            } catch {
              /* clipboard blocked: the link is on the screen */
            }
          }}
        >
          <span className="min-w-0">
            <span className="block text-13 text-muted">{t('The client’s link, to change or cancel')}</span>
            <span className="code block truncate text-13">shopi.tz/bk/{b.code}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-14 font-medium">
            {copied ? <Check size={16} strokeWidth={2.25} className="text-ok" /> : <Copy size={16} strokeWidth={1.75} />}
            {copied ? t('Copied') : 'Copy'}
          </span>
        </button>
      ) : null}
    </div>
  )
}

function MoveBooking({ b, onBack, onMoved }: { b: DiaryBooking; onBack: () => void; onMoved: () => void }) {
  const t = useT()
  const router = useRouter()
  const [day, setDay] = useState(b.day < dayOf(Date.now()) ? dayOf(Date.now()) : b.day)
  const [start, setStart] = useState<number | null>(null)
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (start == null) return
    setBusy(true)
    setError('')
    try {
      const res = await moveBooking({ data: { id: b.id, day, start, force: full } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'full') return setFull(true)
        return setError(res.error === 'time' ? t('That time doesn’t fit in the day. Choose another.') : t('This booking changed meanwhile. Close it and open it again.'))
      }
      await router.invalidate()
      onMoved()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>{t('A new time for {service}', { service: b.service_name })}</Label>
        <p className="text-13 text-muted">{t('Tell {name} on WhatsApp once it is moved.', { name: b.customer_name })}</p>
      </div>
      <PickTime
        day={day}
        start={start}
        duration={b.duration}
        except={b.id}
        onDay={(d) => {
          setDay(d)
          setStart(null)
          setFull(false)
        }}
        onStart={(s) => {
          setStart(s)
          setFull(false)
        }}
      />
      {full && <p className="rounded-16 bg-moto-soft px-4 py-3 text-14 leading-relaxed text-moto-ink">{t('That time is already full. Move it there anyway?')}</p>}
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={onBack}>
          {t('Back')}
        </button>
        <button type="button" className="btn w-full" disabled={busy || start == null} onClick={save}>
          {busy ? t('Saving') : full ? t('Move it anyway') : t('Move the booking')}
        </button>
      </div>
    </div>
  )
}
