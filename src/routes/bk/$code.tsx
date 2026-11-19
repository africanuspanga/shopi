import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { CalendarClock, Check, Clock, Copy, MapPin, Navigation } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DayStrip, TimeGrid } from '#/components/booking'
import { WhatsAppMark } from '#/components/brand-icons'
import { MadeWithShopi, ShopTopBar } from '#/components/shop'
import { NotFound } from '#/components/not-found'
import { WhatsAppHelp, useWhatsApp } from '#/components/whatsapp'
import { CardHead, ErrorText, useEntrance } from '#/components/ui'
import { track } from '#/lib/analytics'
import { cancelMyBooking, getFreeTimes, getMyBooking, moveMyBooking, type MyBooking } from '#/lib/api/booking'
import { dayLabel, dayText, durationText, servicePrice, timeText } from '#/lib/booking'
import { mapsLink, waLink } from '#/lib/format'
import { LangProvider, asLang, useLang, useT } from '#/lib/i18n'
import { themeStyle } from '#/lib/theme'

/**
 * A client's booking (roadmap `v-services`): what is booked and when, with Change the time and Cancel until it
 * starts. The code in the link is the key, so the page is never indexed and the business sends the link itself.
 */
export const Route = createFileRoute('/bk/$code')({
  loader: async ({ params }) => {
    const booking = await getMyBooking({ data: { code: params.code } })
    if (!booking) throw notFound()
    return booking
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.service_name} · ${loaderData.shop.name}` : 'Shopi' }, { name: 'robots', content: 'noindex' }],
  }),
  notFoundComponent: () => <NotFound title="We can't find this booking" body="Check the link, or ask the business to send it again on WhatsApp." />,
  component: BookingPage,
})

/** Like the order page: in the language the business chose, in its colour. */
function BookingPage() {
  const b = Route.useLoaderData()
  return (
    <LangProvider value={asLang(b.shop.lang)}>
      <div className="contents" style={themeStyle(b.shop.theme_color)}>
        <Booking b={b} />
      </div>
    </LangProvider>
  )
}

function Booking({ b }: { b: MyBooking }) {
  const rise = useEntrance()
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const chat = useWhatsApp(() => track('whatsapp_click', { shopId: b.shop.id, detail: 'order' }))
  const price = servicePrice(t, b)
  const when = `${dayText(lang, b.day, true)}, ${timeText(b.start_min)}`
  const hello = t('Hi {shop}, about my booking: {service}, {when}.', { shop: b.shop.name, service: b.service_name, when })
  const directions = mapsLink(b.shop.maps_url)
  const past = b.start_at <= Date.now()

  const head =
    b.status === 'cancelled'
      ? { title: t('This booking is cancelled'), sub: b.cancelled_by === 'shop' ? t('{shop} cancelled it. Message them, or book another time.', { shop: b.shop.name }) : t('The time is free again. You can book another one.') }
      : b.status === 'requested'
        ? { title: t('Waiting for {shop} to confirm', { shop: b.shop.name }), sub: t('Your time is held. {shop} confirms each booking, and this page shows it as soon as they do.', { shop: b.shop.name }) }
        : b.status === 'done'
          ? { title: t('Thank you for coming'), sub: t('Book your next visit when you are ready.') }
          : b.status === 'noshow'
            ? { title: t('This booking has passed'), sub: t('{shop} marked that you didn’t come. Book another time when you are ready.', { shop: b.shop.name }) }
            : past
              ? { title: t('This booking has started'), sub: t('See you at {shop}.', { shop: b.shop.name }) }
              : { title: t('You’re booked'), sub: t('Keep this page: you can change the time or cancel here until your booking starts.') }

  async function cancel() {
    if (!window.confirm(t('Cancel this booking?'))) return
    setBusy(true)
    setError('')
    try {
      const res = await cancelMyBooking({ data: { code: b.code } })
      if ('error' in res) setError(res.error === 'late' ? t('This booking can no longer be cancelled here. Message {shop}.', { shop: b.shop.name }) : t('Something went wrong. Try again.'))
      await router.invalidate()
    } catch {
      setError(t('Something went wrong. Check your connection and try again.'))
    }
    setBusy(false)
  }

  return (
    <div className="min-h-dvh bg-page pb-12">
      <ShopTopBar shop={b.shop} />
      <main className="mx-auto max-w-[560px] px-4 pt-3 md:pt-10">
        <section className={`${rise} card p-6 md:p-8`}>
          <p className="meta">
            {t('Booking')} <span className="code text-ink">#{b.code}</span>
          </p>
          <h1 className="title mt-3 text-28">{head.title}</h1>
          <p className="mt-2 text-15 leading-relaxed text-ink-2">{head.sub}</p>

          <div className={`mt-6 rounded-16 bg-page p-5 ${b.status === 'cancelled' ? 'opacity-60' : ''}`}>
            <p className={`title text-24 ${b.status === 'cancelled' ? 'line-through' : ''}`}>
              {dayLabel(t, lang, b.day, Date.now(), true)} · <span className="tnum">{timeText(b.start_min)}</span>
            </p>
            {dayLabel(t, lang, b.day) !== dayText(lang, b.day) && <p className="mt-1 text-14 text-muted">{dayText(lang, b.day, true)}</p>}
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-15">
              <p className="font-medium">{b.service_name}</p>
              <p className="flex items-center gap-2 text-14 text-ink-2">
                <Clock size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
                {durationText(t, b.duration)} · {t('until {time}', { time: timeText(b.end_min) })}
              </p>
              {b.shop.location && (
                <p className="flex items-start gap-2 text-14 text-ink-2">
                  <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" />
                  {b.shop.location}
                </p>
              )}
              {price && (
                <p className="tnum pt-1 text-14 text-ink-2">
                  {price} · {t('you pay {shop} at your visit', { shop: b.shop.name })}
                </p>
              )}
            </div>
            {b.note && <p className="mt-4 border-t border-line pt-4 text-14 leading-relaxed text-ink-2">{b.note}</p>}
          </div>

          {moving ? (
            <Move b={b} onClose={() => setMoving(false)} />
          ) : (
            <>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {b.shop.whatsapp && (
                  <a className="btn h-12" href={waLink(b.shop.whatsapp, hello)} target="_blank" rel="noreferrer" onClick={chat.onClick}>
                    <WhatsAppMark size={18} /> {t('Message {shop}', { shop: b.shop.name })}
                  </a>
                )}
                {directions && b.status !== 'cancelled' && (
                  <a className="btn btn-ghost h-12" href={directions} target="_blank" rel="noreferrer">
                    <Navigation size={16} strokeWidth={1.75} /> {t('Directions')}
                  </a>
                )}
                {b.open && (
                  <button type="button" className="btn btn-ghost h-12" disabled={busy} onClick={() => setMoving(true)}>
                    <CalendarClock size={16} strokeWidth={1.75} /> {t('Change the time')}
                  </button>
                )}
                {!b.open && b.status !== 'requested' && b.status !== 'confirmed' && (
                  <a className="btn btn-shop h-12 text-white" href={`/${b.shop.slug}`}>
                    {t('Book another time')}
                  </a>
                )}
              </div>
              {b.shop.whatsapp && <WhatsAppHelp show={chat.tapped} phone={b.shop.whatsapp} text={hello} />}
              <ErrorText>{error}</ErrorText>
              {b.open && (
                <button type="button" className="btn mt-2 w-full bg-transparent text-bad hover:bg-bad/[0.06]" disabled={busy} onClick={cancel}>
                  {busy ? t('Cancelling') : t('Cancel booking')}
                </button>
              )}
            </>
          )}
        </section>

        {b.open && !moving && (
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-20 bg-card px-5 py-4 text-left"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href)
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              } catch {
                /* clipboard blocked: the address bar has the link */
              }
            }}
          >
            <span className="min-w-0">
              <span className="block text-14 font-medium">{t('Keep this link')}</span>
              <span className="block text-13 leading-5 text-muted">{t('It is the only way back to this booking. Anyone with it can change it.')}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-14 font-medium">
              {copied ? <Check size={16} strokeWidth={2.25} className="text-ok" /> : <Copy size={16} strokeWidth={1.75} />}
              {copied ? t('Copied') : 'Copy'}
            </span>
          </button>
        )}
        <MadeWithShopi shopSlug={b.shop.slug} invite />
      </main>
    </div>
  )
}

/** Moving the booking: the same day strip and free times as booking it, with its own place left out. */
function Move({ b, onClose }: { b: MyBooking; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const [day, setDay] = useState(b.days.find((d) => d.day === b.day && d.open)?.day ?? b.days.find((d) => d.open)?.day ?? b.day)
  const [times, setTimes] = useState<number[] | null>(null)
  const [start, setStart] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let gone = false
    setTimes(null)
    setStart(null)
    getFreeTimes({ data: { shopId: b.shop.id, code: b.code, day } }).then(
      // Its own time is free to it, but choosing it again would change nothing.
      (r) => !gone && setTimes(r.times.filter((m) => !(day === b.day && m === b.start_min))),
      () => !gone && setTimes([]),
    )
    return () => {
      gone = true
    }
  }, [b.shop.id, b.code, b.day, b.start_min, day, reload])

  async function save() {
    if (start == null) return
    setBusy(true)
    setError('')
    try {
      const res = await moveMyBooking({ data: { code: b.code, day, start } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'taken') {
          setReload((n) => n + 1)
          return setError(t('Someone just took that time. Choose another.'))
        }
        return setError(res.error === 'late' ? t('This booking can no longer be changed here. Message {shop}.', { shop: b.shop.name }) : t('Something went wrong. Try again.'))
      }
      await router.invalidate()
      onClose()
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Check your connection and try again.'))
    }
  }

  return (
    <div className="fade mt-6 border-t border-line pt-6">
      <CardHead title={t('Choose a new time')} />
      <DayStrip className="mt-4" days={b.days} value={day} onChange={setDay} />
      <p className="mt-5 mb-3 text-13 text-muted">{dayLabel(t, lang, day, Date.now(), true)}</p>
      <TimeGrid times={times ?? []} loading={times == null} value={start} onChange={setStart} empty={t('No free time left on this day. Try another day.')} />
      <ErrorText>{error}</ErrorText>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={onClose}>
          {t('Keep my time')}
        </button>
        <button type="button" className="btn btn-shop w-full text-white" disabled={busy || start == null} onClick={save}>
          {busy ? t('Saving') : t('Move my booking')}
        </button>
      </div>
    </div>
  )
}
