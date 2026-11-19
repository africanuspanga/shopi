import { all, db, first, newId, now, shortCode } from '#/server/db'
import { BOOKINGS_PER_PHONE, HOLDING_SQL, momentOf, parseBook, type Block, type BookSettings, type BookingStatus, type Busy } from '#/lib/booking'

/**
 * Bookings (roadmap `v-services`): what the public pages and the seller's diary share. The rules (hours, the break,
 * free times) are in src/lib/booking.ts; here is the part only the database can promise: two clients never take the
 * same place, because the check and the write are one statement.
 */

export type ServiceRow = {
  id: string
  name: string
  description: string
  duration: number
  price: number
  price_from: number
  by_name: string
  images: string
  active: number
  sort: number
  created_at: number
}

export type BookingRow = {
  id: string
  code: string
  service_id: string | null
  service_name: string
  duration: number
  price: number
  price_from: number
  day: string
  start_min: number
  end_min: number
  start_at: number
  customer_name: string
  customer_phone: string
  note: string
  status: BookingStatus
  cancelled_by: string | null
  origin: string
  created_at: number
}

export const BOOKING_COLS = `id, code, service_id, service_name, duration, price, price_from, day, start_min, end_min, start_at,
  customer_name, customer_phone, note, status, cancelled_by, origin, created_at`

/** The shop's booking settings; null when it hasn't set its hours, so nothing can be booked. */
export async function shopBook(shopId: string): Promise<BookSettings | null> {
  const row = await first<{ book: string | null }>('SELECT book FROM shops WHERE id = ?', shopId)
  return parseBook(row?.book)
}

/** What already holds time on a day: the bookings (leaving out `except`, the booking being moved) and the blocks. */
export async function dayLoad(shopId: string, day: string, except = ''): Promise<{ busy: Busy[]; blocks: Block[] }> {
  const [busy, blocks] = await db().batch([
    db()
      .prepare(`SELECT start_min start, end_min end FROM bookings WHERE shop_id = ? AND day = ? AND status IN ${HOLDING_SQL} AND id != ?`)
      .bind(shopId, day, except),
    db().prepare('SELECT start_min start, end_min end FROM book_blocks WHERE shop_id = ? AND day = ?').bind(shopId, day),
  ])
  return { busy: busy.results as Busy[], blocks: blocks.results as Block[] }
}

/**
 * True while [start, end) on `day` is free: no block over it and a place left throughout (the number of clients only
 * rises when a booking starts, so those moments are the ones counted). Params: ?1 shop, ?2 day, ?3 start, ?4 end,
 * ?5 seats, ?6 the booking to leave out. The same rule as `whyNot` in lib/booking.ts, said in SQL so that it holds
 * when two clients tap the same time at once.
 */
const FREE = `
  NOT EXISTS (SELECT 1 FROM book_blocks k WHERE k.shop_id = ?1 AND k.day = ?2
    AND (k.start_min IS NULL OR (k.start_min < ?4 AND k.end_min > ?3)))
  AND NOT EXISTS (
    SELECT 1 FROM (
      SELECT ?3 p
      UNION SELECT start_min FROM bookings WHERE shop_id = ?1 AND day = ?2 AND status IN ${HOLDING_SQL} AND id != ?6
        AND start_min > ?3 AND start_min < ?4
    ) pts
    WHERE (SELECT COUNT(*) FROM bookings b WHERE b.shop_id = ?1 AND b.day = ?2 AND b.status IN ${HOLDING_SQL} AND b.id != ?6
      AND b.start_min <= pts.p AND b.end_min > pts.p) >= ?5
  )`

export type NewBooking = {
  shopId: string
  service: { id: string | null; name: string; duration: number; price: number; price_from: number }
  day: string
  start: number
  name: string
  phone: string
  note: string
  status: BookingStatus
  origin: 'online' | 'manual'
  visit?: { vid: string | null; sid: string | null; source: string; tag: string | null }
  /** Clients at once. `null` skips the check: the business may add a walk-in over a full time. */
  seats: number | null
}

/**
 * Saves a booking if its time is still free (and, for a client's own booking, while their number holds fewer than
 * BOOKINGS_PER_PHONE upcoming ones). Returns the new row's id and code, or null when the time was taken meanwhile.
 */
export async function insertBooking(b: NewBooking): Promise<{ id: string; code: string } | null> {
  const id = newId()
  const code = shortCode(8)
  const t = now()
  const end = b.start + b.service.duration
  const guard = b.seats == null ? '1' : FREE
  const phoneGuard =
    b.origin === 'online'
      ? `AND (SELECT COUNT(*) FROM bookings WHERE shop_id = ?1 AND customer_phone = ?7 AND origin = 'online'
           AND status IN ('requested','confirmed') AND start_at > ?8) < ${BOOKINGS_PER_PHONE}`
      : ''
  const res = await db()
    .prepare(
      `INSERT INTO bookings (id, shop_id, code, service_id, service_name, duration, price, price_from, day, start_min, end_min, start_at,
         customer_name, customer_phone, note, status, origin, source, link_tag, visitor_id, session_id, created_at, updated_at)
       SELECT ?9, ?1, ?10, ?11, ?12, ?13, ?14, ?15, ?2, ?3, ?4, ?16, ?17, ?7, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?8, ?8
       WHERE ${guard} ${phoneGuard}`,
    )
    .bind(
      b.shopId, b.day, b.start, end, b.seats ?? 0, '', b.phone, t,
      id, code, b.service.id, b.service.name, b.service.duration, b.service.price, b.service.price_from,
      momentOf(b.day, b.start), b.name, b.note, b.status, b.origin,
      b.visit?.source ?? '', b.visit?.tag ?? '', b.visit?.vid ?? null, b.visit?.sid ?? null,
    )
    .run()
  return res.meta.changes ? { id, code } : null
}

/**
 * Moves a booking to another time if that time is free (its own place doesn't count against it). Only a booking that
 * is still coming (requested or confirmed) moves. `seats` null skips the check, for the business.
 */
export async function moveBookingTo(o: { id: string; shopId: string; day: string; start: number; duration: number; seats: number | null; status?: BookingStatus }) {
  const end = o.start + o.duration
  const res = await db()
    .prepare(
      `UPDATE bookings SET day = ?2, start_min = ?3, end_min = ?4, start_at = ?7, updated_at = ?8, status = COALESCE(?9, status)
       WHERE id = ?6 AND shop_id = ?1 AND status IN ('requested','confirmed') AND ${o.seats == null ? '1' : FREE}`,
    )
    .bind(o.shopId, o.day, o.start, end, o.seats ?? 0, o.id, momentOf(o.day, o.start), now(), o.status ?? null)
    .run()
  return res.meta.changes > 0
}

/** How many upcoming bookings a number already holds in a shop (the client's own, made on the link). */
export async function heldBy(shopId: string, phone: string) {
  const row = await first<{ n: number }>(
    `SELECT COUNT(*) n FROM bookings WHERE shop_id = ? AND customer_phone = ? AND origin = 'online' AND status IN ('requested','confirmed') AND start_at > ?`,
    shopId,
    phone,
    now(),
  )
  return row?.n ?? 0
}

/** Days in a range that a whole-day block closes. */
export async function closedDays(shopId: string, from: string, to: string) {
  const rows = await all<{ day: string }>('SELECT DISTINCT day FROM book_blocks WHERE shop_id = ? AND day >= ? AND day <= ? AND start_min IS NULL', shopId, from, to)
  return rows.map((r) => r.day)
}

/** Bookings kept about 13 months after their day, then deleted by the nightly job (Privacy page). */
export const BOOKING_MONTHS = 13

export async function purgeBookings() {
  const cut = new Date(now() - BOOKING_MONTHS * 30.5 * 86400_000).toISOString().slice(0, 10)
  const [b, k] = await db().batch([
    db().prepare('DELETE FROM bookings WHERE day < ?').bind(cut),
    db().prepare('DELETE FROM book_blocks WHERE day < ?').bind(cut),
  ])
  return { bookings: b.meta.changes, blocks: k.meta.changes }
}
