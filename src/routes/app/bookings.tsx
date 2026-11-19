import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { CalendarClock, CalendarOff, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DayStrip, weekDays } from '#/components/booking'
import { AddBookingSheet, BookingSheet, TimeOffSheet, timeOffLine } from '#/components/diary'
import { BookingPill, CardHead, Chips, Empty, Notice, Page, TopBar } from '#/components/ui'
import { getDiary, removeTimeOff, type DayOff, type DiaryBooking } from '#/lib/api/services'
import { addDays, dayLabel, dayOf, dayText, durationText, isDay, servicePrice, timeText, weekStart, weekdayName, weekdayOf, type BookSettings } from '#/lib/booking'
import { useLang, useT } from '#/lib/i18n'

/**
 * The diary (roadmap `v-services`): every booked session by day or by week, so the business always knows who is
 * coming when. A week is loaded at a time (Monday to Sunday); the day view shows one of its days.
 */
export const Route = createFileRoute('/app/bookings')({
  validateSearch: (s: Record<string, unknown>): { day?: string; view?: 'week'; add?: 1 } => ({
    day: isDay(s.day) ? s.day : undefined,
    view: s.view === 'week' ? 'week' : undefined,
    // From the + sheet and the sidebar: the page opens with "Add a booking" up.
    add: s.add ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ week: weekStart(search.day ?? dayOf(Date.now())) }),
  loader: ({ deps }) => getDiary({ data: { from: deps.week, days: 7 } }),
  head: () => ({ meta: [{ title: 'Bookings · Shopi' }] }),
  component: Diary,
})

/** A cancelled booking no longer holds its time; the diary still lists it, quietly. */
const live = (b: DiaryBooking) => b.status !== 'cancelled'

function Diary() {
  const t = useT()
  const lang = useLang()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const data = Route.useLoaderData()
  const { shop } = Route.useRouteContext()
  const search = Route.useSearch()
  const day = search.day ?? data.today
  const week = search.view === 'week'
  const [openId, setOpenIdOnly] = useState<string | null>(null)
  // Kept as it was when opened: a booking confirmed from the list above may sit in another week, and its sheet stays.
  const [kept, setKept] = useState<DiaryBooking | null>(null)
  const [adding, setAdding] = useState(!!search.add)
  const [off, setOff] = useState(false)
  useEffect(() => {
    if (!search.add) return
    setAdding(true)
    navigate({ search: { day: search.day, view: search.view }, replace: true })
  }, [search.add, search.day, search.view, navigate])
  const go = (next: string, view = search.view) => navigate({ search: { day: next === data.today ? undefined : next, view }, replace: true })

  // The open booking follows the list, so a change made in its sheet shows in both.
  const setOpenId = (id: string | null) => {
    setKept(id ? ([...data.bookings, ...data.toConfirm].find((b) => b.id === id) ?? null) : null)
    setOpenIdOnly(id)
  }
  const opened = openId ? ([...data.bookings, ...data.toConfirm].find((b) => b.id === openId) ?? kept) : null
  const marks: Record<string, number> = {}
  for (const b of data.bookings) if (live(b)) marks[b.day] = (marks[b.day] ?? 0) + 1
  const todays = data.bookings.filter((b) => b.day === day)
  const coming = todays.filter(live).length
  const noServices = data.services.length === 0

  const actions = (
    <>
      <button type="button" className="btn btn-ghost btn-sm h-10 w-10 px-0 md:w-auto md:px-[14px]" aria-label={t('Take time off')} onClick={() => setOff(true)}>
        <CalendarOff size={16} strokeWidth={1.75} /> <span className="hidden md:inline">{t('Time off')}</span>
      </button>
      <button type="button" className="btn btn-sm h-10" onClick={() => setAdding(true)}>
        <Plus size={16} strokeWidth={2.25} /> <span className="md:hidden">{t('Add')}</span>
        <span className="hidden md:inline">{t('Add a booking')}</span>
      </button>
    </>
  )

  return (
    <Page nav wide>
      <TopBar title={t('Bookings')} sub={t('Who is coming, and when')} right={actions} />
      {/* A services-first shop's phone capsule has no Orders tab: its orders are one tap from the diary. */}
      {shop.kind === 'services' && (
        <Link to="/app/orders" className="-mt-2 mb-4 flex w-fit items-center gap-1 text-14 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 md:hidden">
          {t('Orders')} <ChevronRight size={14} strokeWidth={1.75} />
        </Link>
      )}

      {noServices && data.bookings.length === 0 ? (
        <Empty
          icon={<CalendarClock size={20} strokeWidth={1.75} />}
          title={t('Your diary is empty')}
          body={t('Add the services clients can book. Each booking shows here, by day and by week.')}
          action={
            <Link to="/app/services" className="btn btn-sm">
              <Plus size={16} strokeWidth={2.25} /> {t('Add service')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {!data.book && (
              <Notice signal icon={<CalendarClock size={18} strokeWidth={1.75} />} title={t('Set your working hours')} sub={t('Clients can book once you say which days and hours you work.')} to="/app/hours" />
            )}
            {data.toConfirm.length > 0 && <ToConfirm list={data.toConfirm} onOpen={setOpenId} />}
            {data.tomorrow > 0 && day !== addDays(data.today, 1) && (
              <Notice
                icon={data.tomorrow}
                title={t(data.tomorrow === 1 ? '{n} client tomorrow' : '{n} clients tomorrow', { n: data.tomorrow })}
                sub={t('Open each booking and send a reminder on WhatsApp.')}
                onClick={() => go(addDays(data.today, 1), undefined)}
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Chips
              value={week ? 'week' : 'day'}
              onChange={(v) => navigate({ search: { day: search.day, view: v === 'week' ? 'week' : undefined }, replace: true })}
              options={[
                { id: 'day', label: t('Day') },
                { id: 'week', label: t('Week') },
              ]}
              className="mx-0 px-0"
            />
            <div className="flex shrink-0 items-center gap-1">
              {day !== data.today && (
                <button type="button" className="btn btn-quiet btn-sm mr-1" onClick={() => go(data.today)}>
                  {t('Today')}
                </button>
              )}
              <button type="button" className="icon-btn" aria-label={t('The week before')} onClick={() => go(addDays(day, -7))}>
                <ChevronLeft size={18} strokeWidth={1.75} />
              </button>
              <button type="button" className="icon-btn" aria-label={t('The week after')} onClick={() => go(addDays(day, 7))}>
                <ChevronRight size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {week ? (
            <WeekView data={data} onOpen={setOpenId} onDay={(d) => go(d, undefined)} />
          ) : (
            <>
              <DayStrip fit className="mt-4" days={weekDays(data.from)} value={day} onChange={(d) => go(d)} marks={marks} />
              <section className="card mt-4 overflow-hidden">
                <CardHead
                  className="px-5 pt-5 md:px-6"
                  title={dayLabel(t, lang, day, Date.now(), true)}
                  right={<span className="text-13 text-muted">{[coming ? t(coming === 1 ? '{n} booking' : '{n} bookings', { n: coming }) : '', hoursOf(t, data.book, day)].filter(Boolean).join(' · ')}</span>}
                />
                <DayList
                  bookings={todays}
                  blocks={data.blocks.filter((b) => b.day === day)}
                  onOpen={setOpenId}
                  onUnblock={async (id) => {
                    await removeTimeOff({ data: { id } })
                    router.invalidate()
                  }}
                />
              </section>
            </>
          )}
        </>
      )}

      <BookingSheet booking={opened} shop={data.shop} onClose={() => setOpenId(null)} />
      <AddBookingSheet open={adding} onClose={() => setAdding(false)} day={day} services={data.services} />
      <TimeOffSheet open={off} onClose={() => setOff(false)} onSaved={() => router.invalidate()} day={day} />
    </Page>
  )
}

/** "09:00–18:00", or "Closed" for a day the business doesn't work. Nothing until the hours are set. */
function hoursOf(t: ReturnType<typeof useT>, book: BookSettings | null, day: string) {
  if (!book) return ''
  const h = book.days[weekdayOf(day)]
  return h ? `${timeText(h.open)}–${timeText(h.close)}` : t('Closed')
}

/** Requests waiting for the business (it chose to confirm each booking itself). */
function ToConfirm({ list, onOpen }: { list: DiaryBooking[]; onOpen: (id: string) => void }) {
  const t = useT()
  const lang = useLang()
  return (
    <section className="card overflow-hidden">
      <CardHead
        className="px-5 pt-5 md:px-6"
        icon={<span className="signal" aria-hidden />}
        title={t(list.length === 1 ? '{n} booking to confirm' : '{n} bookings to confirm', { n: list.length })}
      />
      <ul className="mt-2 divide-y divide-line">
        {list.map((b) => (
          <li key={b.id}>
            <button type="button" className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-page md:px-6" onClick={() => onOpen(b.id)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-15 font-medium">{b.customer_name}</span>
                <span className="block truncate text-13 text-muted">
                  {b.service_name} · {dayText(lang, b.day)} <span className="tnum">{timeText(b.start_min)}</span>
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One day, in time order: each booking a row (the time, who, what, the status), time off between them. */
function DayList({ bookings, blocks, onOpen, onUnblock }: { bookings: DiaryBooking[]; blocks: DayOff[]; onOpen: (id: string) => void; onUnblock: (id: string) => void }) {
  const t = useT()
  const rows = [
    ...bookings.map((b) => ({ at: b.start_min, b, k: null as DayOff | null })),
    ...blocks.map((k) => ({ at: k.start_min ?? -1, b: null as DiaryBooking | null, k })),
  ].sort((x, y) => x.at - y.at)
  if (!rows.length) return <p className="px-5 pt-3 pb-8 text-14 text-muted md:px-6">{t('No bookings on this day.')}</p>
  return (
    <ul className="mt-2 divide-y divide-line">
      {rows.map(({ b, k }) =>
        b ? (
          <li key={b.id}>
            <button type="button" className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-page md:items-center md:px-6" onClick={() => onOpen(b.id)}>
              <span className={`w-12 shrink-0 ${live(b) ? '' : 'text-muted line-through'}`}>
                <span className="tnum block text-15 font-semibold">{timeText(b.start_min)}</span>
                <span className="tnum block text-12 text-muted">{timeText(b.end_min)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`truncate text-15 font-medium ${live(b) ? '' : 'text-muted'}`}>{b.customer_name}</span>
                  {!!b.price && <span className="tnum shrink-0 text-14 text-ink-2 md:hidden">{servicePrice(t, b)}</span>}
                </span>
                <span className="mt-1 flex items-center gap-2.5">
                  <BookingPill status={b.status} />
                  <span className="truncate text-13 text-muted">
                    {b.service_name} · {durationText(t, b.duration)}
                  </span>
                </span>
                {b.note && <span className="mt-1 line-clamp-1 block text-13 text-ink-2">{b.note}</span>}
              </span>
              {!!b.price && <span className="tnum hidden shrink-0 text-14 text-ink-2 md:block">{servicePrice(t, b)}</span>}
              <ChevronRight size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-faint md:mt-0" />
            </button>
          </li>
        ) : (
          <li key={k!.id} className="flex items-center gap-4 bg-page/60 px-5 py-3 md:px-6">
            <span className="flex w-12 shrink-0 justify-start text-muted">
              <CalendarOff size={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-14 font-medium text-ink-2">{t('Time off')}</span>
              <span className="block truncate text-13 text-muted">{timeOffLine(t, k!)}</span>
            </span>
            <button type="button" className="icon-btn h-9 w-9" aria-label={t('Remove this time off')} onClick={() => onUnblock(k!.id)}>
              <X size={16} strokeWidth={1.75} />
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

type DiaryData = Awaited<ReturnType<typeof getDiary>>

/** The week: seven columns from lg up, a list of days on phones. Each booking is a small row that opens. */
function WeekView({ data, onOpen, onDay }: { data: DiaryData; onOpen: (id: string) => void; onDay: (day: string) => void }) {
  const t = useT()
  const lang = useLang()
  const days = weekDays(data.from)
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-7 lg:gap-2">
      {days.map(({ day }) => {
        const list = data.bookings.filter((b) => b.day === day && live(b))
        const offDay = data.blocks.filter((b) => b.day === day)
        const today = day === data.today
        const closed = !!data.book && !data.book.days[weekdayOf(day)]
        return (
          <section key={day} className="card min-w-0 p-3 lg:min-h-[280px]">
            <button type="button" className="flex w-full items-center gap-2 rounded-12 px-2 py-1.5 text-left transition-colors hover:bg-page lg:flex-col lg:items-start lg:gap-0" onClick={() => onDay(day)}>
              <span className="text-13 text-muted">{weekdayName(lang, weekdayOf(day), false)}</span>
              <span className={`tnum flex h-8 min-w-8 items-center justify-center rounded-full text-15 font-semibold ${today ? 'bg-ink px-2 text-white' : ''}`}>{Number(day.slice(8))}</span>
              <span className="ml-auto text-13 text-muted lg:hidden">{list.length ? t(list.length === 1 ? '{n} booking' : '{n} bookings', { n: list.length }) : closed ? t('Closed') : ''}</span>
            </button>
            <ul className="mt-1 flex flex-col gap-1.5">
              {offDay.map((k) => (
                <li key={k.id} className="rounded-12 bg-well/70 px-2.5 py-2 text-12 text-muted" style={{ order: k.start_min ?? -1 }}>
                  {t('Time off')} · {timeOffLine(t, k)}
                </li>
              ))}
              {list.map((b) => (
                <li key={b.id} style={{ order: b.start_min }}>
                  <button
                    type="button"
                    className={`w-full rounded-12 px-2.5 py-2 text-left transition-colors hover:bg-raised ${b.status === 'requested' ? 'bg-moto-soft' : 'bg-page'}`}
                    onClick={() => onOpen(b.id)}
                  >
                    <span className="flex items-baseline gap-2 lg:block">
                      <span className="tnum text-13 font-semibold">{timeText(b.start_min)}</span>
                      <span className="block truncate text-13">{b.customer_name}</span>
                    </span>
                    <span className="block truncate text-12 text-muted">{b.service_name}</span>
                  </button>
                </li>
              ))}
              {!list.length && !offDay.length && <li className="hidden px-2.5 py-2 text-12 text-faint lg:block">{closed ? t('Closed') : '–'}</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
