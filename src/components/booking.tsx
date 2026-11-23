import { Link } from '@tanstack/react-router'
import { Camera, Clock, Loader2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ErrorText, Field, FieldGroup, Img, Switch, showFirstError } from '#/components/ui'
import type { PublicService } from '#/lib/api/booking'
import { deleteService, saveService, type MyService } from '#/lib/api/services'
import { DURATIONS, DURATION_MAX, addDays, dayOf, durationText, monthText, servicePrice, timeText, weekdayName, weekdayOf } from '#/lib/booking'
import { useLang, useT } from '#/lib/i18n'
import { uploadImage } from '#/lib/upload'

/*
 * Shopi for services (roadmap `v-services`): the parts every booking screen shares. Clients pick a day and a free
 * time on the shop's link; the business uses the same pickers to add a walk-in or move a booking.
 */

/**
 * A row of days to swipe through: the weekday over the date, the chosen one in ink. Days the business is closed can't
 * be chosen. `marks` puts a small count under a day (the diary).
 */
export function DayStrip({
  days,
  value,
  onChange,
  marks,
  fit = false,
  className = '',
}: {
  days: { day: string; open: boolean }[]
  value: string
  onChange: (day: string) => void
  marks?: Record<string, number>
  /** A week of seven days shares the width instead of scrolling (the diary). */
  fit?: boolean
  className?: string
}) {
  const t = useT()
  const lang = useLang()
  const row = useRef<HTMLDivElement>(null)
  const today = dayOf(Date.now())
  // The chosen day stays in view when the strip is long (a month of days) or the page opens on a later one.
  useEffect(() => {
    row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [value])
  return (
    <div className={className}>
      <p className="mb-2 text-13 text-muted">{monthText(lang, value || days[0]?.day || today)}</p>
      <div ref={fit ? undefined : row} className={fit ? 'grid grid-cols-7 gap-1.5 md:flex md:gap-2' : 'hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0'}>
        {days.map((d) => {
          const on = d.day === value
          const n = marks?.[d.day] ?? 0
          return (
            <button
              key={d.day}
              type="button"
              disabled={!d.open}
              aria-pressed={on}
              aria-label={`${weekdayName(lang, weekdayOf(d.day))} ${Number(d.day.slice(8))}${d.open ? '' : `, ${t('Closed')}`}`}
              onClick={() => onChange(d.day)}
              className={`flex h-[68px] ${fit ? 'w-full md:w-14' : 'w-14'} shrink-0 flex-col items-center justify-center gap-0.5 rounded-16 transition-colors ${
                on ? 'bg-ink text-white' : d.open ? 'bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-well' : 'bg-well/60 text-faint'
              }`}
            >
              <span className={`text-12 ${on ? 'text-white/70' : d.open ? 'text-muted' : ''}`}>{d.day === today ? t('Today') : weekdayName(lang, weekdayOf(d.day), false)}</span>
              <span className="tnum text-17 font-semibold">{Number(d.day.slice(8))}</span>
              {marks && <span className={`h-1 w-1 rounded-full ${n ? (on ? 'bg-white' : 'bg-ink') : 'bg-transparent'}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The free times of a day as chips, under Morning, Afternoon and Evening. `loading` keeps the box's height. */
export function TimeGrid({
  times,
  value,
  onChange,
  loading = false,
  empty,
}: {
  times: number[]
  value: number | null
  onChange: (start: number) => void
  loading?: boolean
  empty: ReactNode
}) {
  const t = useT()
  if (loading)
    return (
      <p className="flex min-h-24 items-center justify-center gap-2 text-14 text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('Finding free times')}
      </p>
    )
  if (!times.length) return <div className="rounded-16 bg-well/70 px-4 py-6 text-center text-14 leading-relaxed text-muted">{empty}</div>
  const parts = [
    { label: t('Morning'), list: times.filter((m) => m < 12 * 60) },
    { label: t('Afternoon'), list: times.filter((m) => m >= 12 * 60 && m < 17 * 60) },
    { label: t('Evening'), list: times.filter((m) => m >= 17 * 60) },
  ].filter((p) => p.list.length)
  return (
    <div className="space-y-4">
      {parts.map((p) => (
        <FieldGroup key={p.label} label={p.label} radio>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {p.list.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={value === m} aria-pressed={value === m} className="chip tnum justify-center px-0" onClick={() => onChange(m)}>
                {timeText(m)}
              </button>
            ))}
          </div>
        </FieldGroup>
      ))}
    </div>
  )
}

/** "45 min · with Asha". */
export function serviceMeta(t: ReturnType<typeof useT>, s: { duration: number; by_name?: string }) {
  return [durationText(t, s.duration), s.by_name ? t('with {name}', { name: s.by_name }) : ''].filter(Boolean).join(' · ')
}

/**
 * The services on a shop's page: a row each (a photo when there is one, the name, how long it takes, the price) with
 * Book in the shop's button colour, like Buy on a product. Two columns from md up.
 */
export function ServiceList({ shopSlug, services, onOpen }: { shopSlug: string; services: PublicService[]; onOpen?: (s: PublicService) => void }) {
  const t = useT()
  return (
    <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
      {services.map((s) => (
        <li key={s.id}>
          <Link
            to="/$shop/book/$id"
            params={{ shop: shopSlug, id: s.id }}
            onClick={() => onOpen?.(s)}
            className="group flex h-full items-center gap-4 rounded-20 bg-page p-4 transition-colors hover:bg-well md:p-5"
          >
            {s.images[0] && <Img k={s.images[0]} size="thumb" alt="" className="h-[72px] w-[72px] shrink-0 rounded-16" />}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-15 leading-5 font-medium">{s.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-13 text-muted">
                <Clock size={14} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{serviceMeta(t, s)}</span>
              </span>
              {!!s.price && <span className="tnum mt-1 block text-14 text-ink-2">{servicePrice(t, s)}</span>}
            </span>
            <span className="btn btn-shop btn-sm h-9 shrink-0 px-4 text-white">{t('Book')}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const digits = (s: string, max = 9) => s.replace(/\D/g, '').slice(0, max)
const money = (s: string) => (s ? Number(s).toLocaleString('en-US') : '')

/**
 * A service's fields with their Save: the name, how long it takes, the price (or "from"), then, folded away, a line
 * about it, who does it and a photo. The services page shows it in a sheet; the setup shows it as its second step.
 */
export function ServiceForm({
  service,
  onSaved,
  onDraft,
  saveLabel,
  plain = false,
}: {
  service: MyService | null
  onSaved: () => void | Promise<void>
  /** The setup's preview follows what is typed. */
  onDraft?: (d: { name: string; duration: number; price: number; price_from: boolean; image: string | null }) => void
  saveLabel?: string
  /** The setup: no delete, no on/off switch. */
  plain?: boolean
}) {
  const t = useT()
  const [name, setName] = useState(service?.name ?? '')
  const [duration, setDuration] = useState(service?.duration ?? 60)
  const [other, setOther] = useState(!!service && !DURATIONS.includes(service.duration))
  const [price, setPrice] = useState(service?.price ? String(service.price) : '')
  const [from, setFrom] = useState(!!service?.price_from)
  const [description, setDescription] = useState(service?.description ?? '')
  const [by, setBy] = useState(service?.by_name ?? '')
  const [images, setImages] = useState<string[]>(service?.images ?? [])
  const [active, setActive] = useState(service ? !!service.active : true)
  const [more, setMore] = useState(!!service && !!(service.description || service.by_name || service.images.length))
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [noName, setNoName] = useState(false)

  useEffect(() => {
    onDraft?.({ name, duration, price: Number(price) || 0, price_from: from, image: images[0] ?? null })
  }, [name, duration, price, from, images, onDraft])

  async function pick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      setImages([await uploadImage(file)])
    } catch {
      setError(t('A photo failed to upload. Check your connection and try again.'))
    } finally {
      setUploading(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || uploading) return
    setError('')
    // Said on the box itself, instead of a greyed-out button that gives no reason.
    if (!name.trim()) {
      setNoName(true)
      return showFirstError()
    }
    setBusy(true)
    try {
      const res = await saveService({ data: { id: service?.id, name, duration, price, price_from: from, description, by_name: by, images, active } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'name') {
          setNoName(true)
          return showFirstError()
        }
        return setError(
          {
            name: t('Give the service a name.'),
            duration: t('How long it takes is between 5 minutes and 8 hours.'),
            limit: t('A shop holds up to 100 services.'),
            gone: t('This service is no longer there.'),
          }[res.error ?? 'name'],
        )
      }
      await onSaved()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Try again.'))
    }
  }

  async function remove() {
    if (!service || !window.confirm(t('Delete {name}? Bookings already made stay in your diary.', { name: service.name }))) return
    setBusy(true)
    await deleteService({ data: { id: service.id } })
    await onSaved()
  }

  return (
    <form className="space-y-5" onSubmit={save}>
      <Field label={t('Service')} error={noName ? t('Give the service a name.') : undefined}>
        <input
          className="input"
          placeholder={t('Haircut, braids, massage, consultation')}
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value)
            setNoName(false)
          }}
        />
      </Field>
      <FieldGroup label={t('How long it takes')} radio>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={!other && duration === d}
              aria-pressed={!other && duration === d}
              className="chip"
              onClick={() => {
                setOther(false)
                setDuration(d)
              }}
            >
              {durationText(t, d)}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={other} aria-pressed={other} className="chip" onClick={() => setOther(true)}>
            {t('Other')}
          </button>
        </div>
        {other && (
          <label className="input mt-3 flex items-center gap-2 px-4">
            <input
              className="tnum min-w-0 flex-1 bg-transparent outline-none"
              inputMode="numeric"
              aria-label={t('Minutes')}
              value={duration ? String(duration) : ''}
              onChange={(e) => setDuration(Math.min(DURATION_MAX, Number(digits(e.target.value, 3)) || 0))}
            />
            <span className="text-14 text-muted">{t('minutes')}</span>
          </label>
        )}
      </FieldGroup>
      <Field label={t('Price')} aside={t('Optional')} hint={t('Leave it empty if you agree the price with each client.')}>
        <span className="input flex items-center gap-2 px-4">
          <span className="text-14 text-muted">TSh</span>
          <input className="tnum min-w-0 flex-1 bg-transparent outline-none" inputMode="numeric" placeholder="15,000" value={money(price)} onChange={(e) => setPrice(digits(e.target.value))} />
        </span>
      </Field>
      {!!price && (
        <div className="rounded-16 bg-page p-4">
          <Switch label={t('The price starts from this')} sub={t('Clients see “From TSh {price}”', { price: money(price) })} checked={from} onChange={setFrom} />
        </div>
      )}

      {more ? (
        <div className="fade space-y-5">
          <Field label={t('About it')} aside={t('Optional')}>
            <textarea className="input min-h-24 py-3 leading-relaxed" maxLength={600} placeholder={t('What is included, what the client should bring')} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t('Who does it')} aside={t('Optional')}>
            <input className="input" maxLength={40} placeholder="Asha" value={by} onChange={(e) => setBy(e.target.value)} />
          </Field>
          <FieldGroup label={t('Photo')} aside={t('Optional')}>
            {images[0] ? (
              <div className="relative h-28 w-28">
                <Img k={images[0]} size="thumb" alt="" className="h-28 w-28 rounded-16" />
                <button
                  type="button"
                  aria-label={t('Remove photo')}
                  className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"
                  onClick={() => setImages([])}
                >
                  <X size={14} strokeWidth={2.25} />
                </button>
              </div>
            ) : (
              <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-16 border border-dashed border-line-strong text-13 text-muted transition-colors hover:border-ink hover:text-ink">
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} strokeWidth={1.75} />}
                {uploading ? t('Uploading') : t('Add a photo')}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files)} />
              </label>
            )}
          </FieldGroup>
        </div>
      ) : (
        <button type="button" className="text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => setMore(true)}>
          {t('Add a description, who does it or a photo')}
        </button>
      )}

      {!plain && service && (
        <div className="rounded-16 bg-page p-4">
          <Switch label={t('Clients can book it')} sub={active ? t('On: it shows on your link') : t('Off: hidden from your link')} checked={active} onChange={setActive} />
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-lg w-full" disabled={busy || uploading || !duration}>
        {busy ? t('Saving') : (saveLabel ?? (service ? t('Save changes') : t('Add the service')))}
      </button>
      {!plain && service && (
        <button type="button" className="btn w-full bg-transparent text-bad hover:bg-bad/[0.06]" disabled={busy} onClick={remove}>
          <Trash2 size={16} strokeWidth={1.75} /> {t('Delete service')}
        </button>
      )}
    </form>
  )
}

/** The days of the week `day` is in, Monday first, for the diary's strip. */
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => ({ day: addDays(monday, i), open: true }))
