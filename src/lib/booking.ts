/**
 * Shopi for services (roadmap `v-services`, the founder's answers of 19 Nov 2026), safe in the browser and on the
 * server: the business's working hours, which times are free, and how days and times are written.
 *
 * Everything is Tanzania time (UTC+3, no daylight saving). A day is 'YYYY-MM-DD' and a time is minutes from midnight,
 * so "is 10:00 on Saturday free" never depends on where the server or the phone is.
 */
import { msg, type Lang } from '#/lib/i18n'
import { shortDay } from '#/lib/format'

const TZ = 3 * 3600_000
const DAY = 86400_000

/** One weekday's hours, or null when the business is closed that day. Minutes from midnight. */
export type DayHours = { open: number; close: number } | null

export type BookSettings = {
  /** Seven days, Sunday first (the order of getUTCDay). */
  days: DayHours[]
  /** A break on every working day (lunch), or null. */
  rest: { from: number; to: number } | null
  /** How many days ahead clients can book. */
  ahead: number
  /** How many clients can be served at the same time (a salon with three stylists: 3). */
  seats: number
  /** true: a booking waits as a request until the business confirms it. false: it is confirmed at once. */
  confirm: boolean
}

export const AHEAD_CHOICES = [7, 14, 30, 60]
export const SEATS_MAX = 20
/** A client can't book a time that starts sooner than this, so the business is never surprised at the door. */
export const NOTICE_MIN = 60
/** How long a service can take, and the choices the form offers. */
export const DURATION_MAX = 8 * 60
export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]
/** Upcoming bookings one WhatsApp number may hold in one shop: one person can't fill a competitor's day. */
export const BOOKINGS_PER_PHONE = 2
export const SERVICES_MAX = 100

/** Monday to Saturday, 09:00 to 18:00: what the hours screen starts from. */
export const DEFAULT_BOOK: BookSettings = {
  days: [null, ...Array.from({ length: 6 }, () => ({ open: 9 * 60, close: 18 * 60 }))],
  rest: null,
  ahead: 30,
  seats: 1,
  confirm: false,
}

const minute = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? n : null
}

/** The saved settings, checked; null when the business hasn't set its hours (or they can't be read). */
export function parseBook(raw: unknown): BookSettings | null {
  let v: unknown = raw
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Partial<BookSettings>
  if (!Array.isArray(o.days) || o.days.length !== 7) return null
  const days = o.days.map((d): DayHours => {
    const open = minute(d?.open)
    const close = minute(d?.close)
    return d && open != null && close != null && close > open ? { open, close } : null
  })
  const from = minute(o.rest?.from)
  const to = minute(o.rest?.to)
  const ahead = Math.round(Number(o.ahead))
  const seats = Math.round(Number(o.seats))
  return {
    days,
    rest: from != null && to != null && to > from ? { from, to } : null,
    ahead: Number.isFinite(ahead) ? Math.min(90, Math.max(1, ahead)) : DEFAULT_BOOK.ahead,
    seats: Number.isFinite(seats) ? Math.min(SEATS_MAX, Math.max(1, seats)) : 1,
    confirm: !!o.confirm,
  }
}

/** Whether the business works at all: hours saved with every day closed can't be booked. */
export const opensSomeDay = (b: BookSettings | null) => !!b && b.days.some(Boolean)

/* ---------- Days and times ---------- */

/** The day in Tanzania at `ms`: '2026-11-21'. */
export const dayOf = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10)
/** Minutes from midnight in Tanzania at `ms`. */
export const minuteOf = (ms: number) => Math.floor((((ms + TZ) % DAY) + DAY) % DAY / 60_000)
/** A real calendar day written YYYY-MM-DD ('2026-02-31' is refused: JavaScript would read it as 3 March). */
export const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const ms = Date.parse(`${v}T00:00:00Z`)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v
}
/** The moment (ms) of `min` minutes into `day`, Tanzania time. */
export const momentOf = (day: string, min = 0) => Date.parse(`${day}T00:00:00Z`) - TZ + min * 60_000
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
/** 0 Sunday … 6 Saturday. */
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
/** The Monday of the week `day` is in. */
export const weekStart = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7))

/** 570 → "09:30". The 24-hour clock: "saa nne" and "10 o'clock" mean different hours, 10:00 means one. */
export function timeText(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
/** "09:30" → 570; null when it isn't a time. */
export function readTime(v: unknown) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim())
  if (!m) return null
  const min = Number(m[1]) * 60 + Number(m[2])
  return Number(m[2]) < 60 && min <= 24 * 60 ? min : null
}

type T = (en: string, vars?: Record<string, string | number>) => string

/**
 * 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h". One hour has its own strings, so Swahili can say "1 hour" and
 * "2 hours" (the founder, 23 Nov 2026: "saa 1" reads as a clock time, seven o'clock).
 */
export function durationText(t: T, min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return t('{n} min', { n: m })
  if (h === 1) return m ? t('1 h {n} min', { n: m }) : t('1 h')
  return m ? t('{h} h {n} min', { h, n: m }) : t('{h} h', { h })
}

const locale = (lang: Lang) => (lang === 'sw' ? 'sw-TZ' : 'en-GB')
const asDate = (day: string) => new Date(`${day}T00:00:00Z`)

/** "Sat 21 Nov" ("Jumamosi 21 Nov" in full with `long`). */
export function dayText(lang: Lang, day: string, long = false) {
  const d = asDate(day)
  const weekday = weekdayName(lang, d.getUTCDay(), long)
  const date = d.toLocaleDateString(locale(lang), { day: 'numeric', month: long ? 'long' : 'short', timeZone: 'UTC' })
  return `${weekday} ${date}`
}
/**
 * A weekday's name from its number (0 Sunday). Short names are the ones sellers write (J2, J3… in Swahili, `shortDay`):
 * the browser's own short Swahili names are the full words.
 */
export const weekdayName = (lang: Lang, weekday: number, long = true) =>
  long ? new Date(Date.UTC(2026, 10, 1 + weekday)).toLocaleDateString(locale(lang), { weekday: 'long', timeZone: 'UTC' }) : shortDay(lang, weekday)
/** "November 2026". */
export const monthText = (lang: Lang, day: string) => asDate(day).toLocaleDateString(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "Mon to Sat, 09:00 to 18:00" when every working day keeps the same hours; else just the days. */
export function hoursLine(t: T, lang: Lang, week: DayHours[]) {
  // Monday first, the way a week is read here.
  const order = [1, 2, 3, 4, 5, 6, 0]
  const open = order.filter((d) => week[d])
  if (!open.length) return t('Closed every day')
  const runs: number[][] = []
  for (const d of open) {
    const last = runs[runs.length - 1]
    if (last && order.indexOf(last[last.length - 1]) === order.indexOf(d) - 1) last.push(d)
    else runs.push([d])
  }
  const name = (d: number) => weekdayName(lang, d, false)
  const days = runs.map((r) => (r.length > 2 ? t('{from} to {to}', { from: name(r[0]), to: name(r[r.length - 1]) }) : r.map(name).join(', '))).join(', ')
  const first = week[open[0]]!
  const same = open.every((d) => week[d]!.open === first.open && week[d]!.close === first.close)
  return same ? `${days} · ${timeText(first.open)}–${timeText(first.close)}` : days
}

/** "Today", "Tomorrow", or the day. */
export function dayLabel(t: T, lang: Lang, day: string, now = Date.now(), long = false) {
  const today = dayOf(now)
  if (day === today) return t('Today')
  if (day === addDays(today, 1)) return t('Tomorrow')
  return dayText(lang, day, long)
}

/* ---------- Free times ---------- */

/** A booking that holds a place, as minutes of its day. */
export type Busy = { start: number; end: number }
/** Time the business took off: part of a day, or all of it (both null). */
export type Block = { start: number | null; end: number | null }

/** Statuses that hold a place. A cancelled booking frees its time. */
export const HOLDING = ['requested', 'confirmed', 'done', 'noshow'] as const
export const HOLDING_SQL = `('requested','confirmed','done','noshow')`

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

/** Whether a client can still take [start, start + duration) on a day with these bookings: a place is free throughout. */
export function hasPlace(start: number, duration: number, busy: Busy[], seats: number) {
  const end = start + duration
  // The number of clients in the room only goes up when a booking starts, so those moments are all that need checking.
  const moments = [start, ...busy.filter((b) => b.start > start && b.start < end).map((b) => b.start)]
  return moments.every((p) => busy.filter((b) => b.start <= p && b.end > p).length < seats)
}

/** Why a time can't be booked, or null when it can. The server asks this again when the client books. */
export function whyNot(
  book: BookSettings,
  o: { day: string; start: number; duration: number; busy: Busy[]; blocks: Block[]; now: number },
): 'closed' | 'past' | 'far' | 'blocked' | 'full' | null {
  const hours = book.days[weekdayOf(o.day)]
  const end = o.start + o.duration
  if (!hours || o.start < hours.open || end > hours.close) return 'closed'
  if (book.rest && overlaps(o.start, end, book.rest.from, book.rest.to)) return 'closed'
  if (momentOf(o.day, o.start) < o.now + NOTICE_MIN * 60_000) return 'past'
  if (o.day > addDays(dayOf(o.now), book.ahead)) return 'far'
  if (o.blocks.some((b) => b.start == null || b.end == null || overlaps(o.start, end, b.start, b.end))) return 'blocked'
  if (!hasPlace(o.start, o.duration, o.busy, book.seats)) return 'full'
  return null
}

/**
 * The times a client can start a service of `duration` minutes on `day`, as minutes from midnight. Times start every
 * 30 minutes from opening (every 15 for a service that isn't a multiple of 30), and again from the end of the break.
 */
export function freeTimes(book: BookSettings, o: { day: string; duration: number; busy: Busy[]; blocks: Block[]; now: number }) {
  const hours = book.days[weekdayOf(o.day)]
  if (!hours) return []
  const step = o.duration % 30 === 0 ? 30 : 15
  const starts = new Set<number>()
  for (let s = hours.open; s + o.duration <= hours.close; s += step) starts.add(s)
  if (book.rest) for (let s = book.rest.to; s + o.duration <= hours.close; s += step) starts.add(s)
  return [...starts].sort((a, b) => a - b).filter((start) => whyNot(book, { ...o, start }) == null)
}

/** The days a client may look at: today up to `ahead` days on, each with whether the business works that day. */
export function bookableDays(book: BookSettings, now = Date.now()) {
  const today = dayOf(now)
  return Array.from({ length: book.ahead + 1 }, (_, i) => {
    const day = addDays(today, i)
    return { day, open: !!book.days[weekdayOf(day)] }
  })
}

/* ---------- Bookings ---------- */

export type BookingStatus = 'requested' | 'confirmed' | 'done' | 'noshow' | 'cancelled'
export const BOOKING_STATUSES: BookingStatus[] = ['requested', 'confirmed', 'done', 'noshow', 'cancelled']

/** Labels and the pill's tone, like STATUS_LABEL for orders (lib/format.ts); `BookingPill` in ui.tsx draws them. */
export const BOOKING_LABEL: Record<BookingStatus, { label: string; tone: string }> = {
  requested: { label: msg('To confirm'), tone: 'act' },
  confirmed: { label: msg('Booked'), tone: 'ok' },
  done: { label: msg('Done'), tone: 'done' },
  noshow: { label: msg('Didn’t come'), tone: 'bad' },
  cancelled: { label: msg('Cancelled'), tone: 'bad' },
}

/** "TSh 15,000" or "From TSh 15,000"; a service the business prices on the day (0) has no price line. */
export function servicePrice(t: T, s: { price: number; price_from: number | boolean }) {
  if (!s.price) return ''
  const money = `TSh ${Math.round(s.price).toLocaleString('en-US')}`
  return s.price_from ? t('From {price}', { price: money }) : money
}
