import { createFileRoute, getRouteApi, notFound, useNavigate } from '@tanstack/react-router'
import { CalendarCheck, Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DayStrip, TimeGrid, serviceMeta } from '#/components/booking'
import { MadeWithShopi, ShopTopBar } from '#/components/shop'
import { CardHead, ErrorText, Field, Img, useEntrance } from '#/components/ui'
import { track, visit } from '#/lib/analytics'
import { bookService, getBookPage, getFreeTimes } from '#/lib/api/booking'
import { dayLabel, dayText, servicePrice, timeText } from '#/lib/booking'
import { eg, useLang, useT } from '#/lib/i18n'
import { useHumanCheck } from '#/lib/turnstile'

/**
 * A service's page, where a client books it (roadmap `v-services`): pick a day, pick one of the free times, leave a
 * name and a WhatsApp number. Only free times are ever shown, never who else is booked.
 */
export const Route = createFileRoute('/$shop/book/$id')({
  loader: async ({ params, parentMatchPromise }) => {
    // The shop first: a link the shop no longer uses is sent on to its new one there (`$shop/route.tsx`).
    await parentMatchPromise
    const data = await getBookPage({ data: { slug: params.shop, id: params.id } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({
    meta: [...(loaderData ? [{ title: loaderData.service.name }] : []), { name: 'robots', content: 'noindex' }],
  }),
  notFoundComponent: Gone,
  component: BookPage,
})
const parent = getRouteApi('/$shop')

/** What this phone remembers from the buyer's last order or booking (the same note checkout keeps). Never sent anywhere. */
const BUYER_KEY = 'shopi_buyer'

function Step({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return <CardHead icon={<span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-13 text-white">{n}</span>} title={title} sub={sub} />
}

function Gone() {
  const t = useT()
  const { shop } = parent.useLoaderData()
  return (
    <div className="min-h-dvh bg-page">
      <ShopTopBar shop={shop} back />
      <main className="mx-auto max-w-[560px] px-4 pt-16 text-center">
        <h1 className="title text-24">{t('This can’t be booked right now')}</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-15 leading-relaxed text-muted">{t('The service may have changed. See what {shop} offers now.', { shop: shop.name })}</p>
        <a href={`/${shop.slug}`} className="btn mt-8">
          {t('Back to {shop}', { shop: shop.name })}
        </a>
      </main>
    </div>
  )
}

function BookPage() {
  const rise = useEntrance()
  const t = useT()
  const lang = useLang()
  const navigate = useNavigate()
  const { shop } = parent.useLoaderData()
  const { service, days, confirm } = Route.useLoaderData()
  const demo = shop.status === 'demo'
  const check = useHumanCheck('book', !demo)
  const firstOpen = days.find((d) => d.open)?.day ?? days[0].day
  const [day, setDay] = useState(firstOpen)
  const [times, setTimes] = useState<number[] | null>(null)
  const [start, setStart] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [noting, setNoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const price = servicePrice(t, service)

  useEffect(() => {
    track('view_service', { shopId: shop.id, productId: service.id })
  }, [shop.id, service.id])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? '{}') ?? {}
      if (typeof saved.name === 'string') setName(saved.name)
      if (typeof saved.phone === 'string') setPhone(saved.phone)
    } catch {
      /* first visit */
    }
  }, [])

  // The free times of the chosen day. A day that turns out full moves nothing: the client picks another.
  const [reload, setReload] = useState(0)
  const picked = useRef(false)
  const looked = useRef(0)
  useEffect(() => {
    let gone = false
    setTimes(null)
    setStart(null)
    getFreeTimes({ data: { shopId: shop.id, serviceId: service.id, day } }).then(
      (r) => {
        if (gone) return
        // The page opens on the first day that still has a free time (today is often full by the afternoon); once
        // the client has chosen a day themselves, a full day stays and says so.
        const later = days.filter((d) => d.open && d.day > day)[0]
        if (!r.times.length && !picked.current && later && looked.current < 14) {
          looked.current += 1
          return setDay(later.day)
        }
        setTimes(r.times)
      },
      () => !gone && setTimes([]),
    )
    return () => {
      gone = true
    }
  }, [shop.id, service.id, day, reload, days])

  async function book(e: React.FormEvent) {
    e.preventDefault()
    if (start == null) return setError(t('Choose a time.'))
    setBusy(true)
    setError('')
    const human = await check.token()
    if (human === null) {
      setBusy(false)
      return setError(t('Tap the box above to show you’re not a robot, then try again.'))
    }
    try {
      const res = await bookService({ data: { shopId: shop.id, serviceId: service.id, day, start, name, phone, note, visit: visit(), human } })
      if ('error' in res) {
        setBusy(false)
        if (res.error === 'taken') {
          setReload((n) => n + 1)
          return setError(t('Someone just took that time. Choose another.'))
        }
        return setError(
          {
            name: t('Enter your name.'),
            phone: t('Enter your WhatsApp number, like 0754 123 456.'),
            many: t('This number already has two bookings coming up here. Change or cancel one from its link, or message {shop}.', { shop: shop.name }),
            demo: t('This is a sample shop, so it takes no bookings.'),
            bot: t('We couldn’t check that you’re not a robot. Reload the page and try again.'),
            limit: t('Too many tries from this connection. Wait a little and try again.'),
            gone: t('This service is no longer offered.'),
            shop: t('This service is no longer offered.'),
          }[res.error ?? 'gone'],
        )
      }
      try {
        const saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? '{}') ?? {}
        localStorage.setItem(BUYER_KEY, JSON.stringify({ ...saved, name: name.trim(), phone: phone.trim() }))
      } catch {
        /* storage blocked */
      }
      track('book', { shopId: shop.id, productId: service.id })
      await navigate({ to: '/bk/$code', params: { code: res.code } })
    } catch {
      setBusy(false)
      setError(t('Something went wrong. Check your connection and try again.'))
    }
  }

  const summary = (
    <div className="flex items-center gap-4">
      {service.images[0] && <Img k={service.images[0]} size="thumb" alt="" priority className="h-[72px] w-[72px] shrink-0 rounded-16" />}
      <div className="min-w-0">
        <h1 className="title text-20 break-words">{service.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-14 text-muted">
          <Clock size={14} strokeWidth={1.75} className="shrink-0" />
          {serviceMeta(t, service)}
        </p>
        {price && <p className="tnum mt-0.5 text-15 text-ink-2">{price}</p>}
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-page pb-12">
      <ShopTopBar shop={shop} back />
      <form onSubmit={book} className={`${rise} mx-auto grid max-w-[1120px] gap-3 px-4 pt-3 md:gap-4 md:px-10 md:pt-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start`}>
        <div className="min-w-0 space-y-3 md:space-y-4">
          <section className="card p-5 md:p-6 lg:hidden">
            {summary}
            {service.description && <p className="mt-4 text-14 leading-relaxed whitespace-pre-line text-ink-2">{service.description}</p>}
          </section>

          <section className="card overflow-hidden p-5 md:p-6">
            <Step n={1} title={t('Choose a day')} />
            <DayStrip
              className="mt-4"
              days={days}
              value={day}
              onChange={(d) => {
                picked.current = true
                setDay(d)
              }}
            />
          </section>

          <section className="card p-5 md:p-6">
            <Step n={2} title={t('Choose a time')} sub={dayLabel(t, lang, day, Date.now(), true)} />
            <div className="mt-4">
              <TimeGrid times={times ?? []} loading={times == null} value={start} onChange={setStart} empty={t('No free time left on this day. Try another day.')} />
            </div>
          </section>

          <section className="card p-5 md:p-6">
            <Step n={3} title={t('Your details')} />
            <div className="mt-4 space-y-4">
              <Field label={t('Your name')}>
                <input className="input" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('WhatsApp number')} hint={t('{shop} messages you here about your booking.', { shop: shop.name })}>
                <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder={eg(t, '0754 123 456')} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              {noting ? (
                <Field label={t('Note for {shop}', { shop: shop.name })} aside={t('Optional')}>
                  <textarea className="input min-h-20 py-3 leading-relaxed" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              ) : (
                <button type="button" className="text-14 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => setNoting(true)}>
                  {t('Add a note')}
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24">
          <section className="card p-5 md:p-6">
            <div className="hidden lg:block">
              {summary}
              {service.description && <p className="mt-4 text-14 leading-relaxed whitespace-pre-line text-ink-2">{service.description}</p>}
              <div className="my-5 border-t border-line" />
            </div>
            <p className="flex items-center gap-2.5 text-15">
              <CalendarCheck size={18} strokeWidth={1.75} className="shrink-0 text-muted" />
              {start == null ? (
                <span className="text-muted">{t('Choose a day and a time')}</span>
              ) : (
                <span className="font-medium">
                  {dayText(lang, day, true)} · <span className="tnum">{timeText(start)}</span>
                </span>
              )}
            </p>
            <div ref={check.slot} className="mt-4" />
            <ErrorText>{error}</ErrorText>
            <button className="btn btn-shop btn-lg mt-3 w-full text-white" disabled={busy || demo || start == null || !name.trim() || !phone.trim()}>
              {busy ? t('Booking') : confirm ? t('Ask for this time') : t('Book this time')}
            </button>
            <p className="mt-3 text-center text-13 leading-5 text-muted">
              {demo
                ? t('This is a sample shop, so it takes no bookings.')
                : confirm
                  ? t('{shop} confirms each booking. You can change or cancel it from your booking link.', { shop: shop.name })
                  : t('You pay {shop} at your visit. You can change or cancel from your booking link.', { shop: shop.name })}
            </p>
          </section>
          <MadeWithShopi shopSlug={shop.slug} />
        </aside>
      </form>
    </div>
  )
}
