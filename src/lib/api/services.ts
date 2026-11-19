import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, db, first, newId, now, run } from '#/server/db'
import { removePhotos } from '#/server/media'
import { BOOKING_COLS, dayLoad, insertBooking, moveBookingTo, shopBook, type BookingRow, type ServiceRow } from '#/server/bookings'
import { passStep } from '#/server/setup'
import { normalizePhone } from '#/lib/format'
import {
  AHEAD_CHOICES, DURATION_MAX, SEATS_MAX, SERVICES_MAX, addDays, dayOf, freeTimes, hasPlace, isDay, parseBook, weekdayOf,
  type BookSettings, type BookingStatus,
} from '#/lib/booking'

/**
 * Services and the diary, for the business (roadmap `v-services`). Areas (src/lib/staff.ts): services are `products`
 * work, the diary is `orders` work, and the working hours are the shop's settings (`manage`).
 */

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const sellsServices = async (shopId: string) => !!(await first(`SELECT 1 FROM shops WHERE id = ? AND kind = 'services'`, shopId))

export type MyService = Omit<ServiceRow, 'images'> & { images: string[]; /** Bookings still to come. */ upcoming: number }

/** The shop's services, its booking settings (null until the hours are set) and what it shows first. */
export const getMyServices = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop(['products', 'orders', 'manage'])
  const [rows, s] = await Promise.all([
    all<ServiceRow & { upcoming: number }>(
      `SELECT v.id, v.name, v.description, v.duration, v.price, v.price_from, v.by_name, v.images, v.active, v.sort, v.created_at,
         (SELECT COUNT(*) FROM bookings b WHERE b.service_id = v.id AND b.status IN ('requested','confirmed') AND b.start_at > ?2) upcoming
       FROM services v WHERE v.shop_id = ?1 ORDER BY v.sort, v.created_at`,
      shop.id,
      now(),
    ),
    first<{ book: string | null; kind: string }>('SELECT book, kind FROM shops WHERE id = ?', shop.id),
  ])
  return {
    services: rows.map((r): MyService => ({ ...r, images: JSON.parse(r.images) as string[] })),
    book: parseBook(s?.book),
    kind: s?.kind === 'services' ? ('services' as const) : ('products' as const),
  }
})

export type ServiceInput = {
  id?: string
  name: string
  description?: string
  duration: number | string
  price: number | string
  price_from?: boolean
  by_name?: string
  images?: string[]
  active?: boolean
}

export const saveService = createServerFn({ method: 'POST' })
  .validator((d: ServiceInput) => d ?? ({} as ServiceInput))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('products')
    const name = str(data.name, 80)
    const duration = int(data.duration)
    if (!name) return { error: 'name' as const }
    if (duration < 5 || duration > DURATION_MAX) return { error: 'duration' as const }
    const price = int(data.price)
    // Only this shop's own uploads.
    const images = JSON.stringify((Array.isArray(data.images) ? data.images : []).filter((k) => typeof k === 'string' && k.startsWith(`s/${shop.id}/`)).slice(0, 4))
    const active = data.active === false ? 0 : 1
    if (data.id) {
      const before = await first<{ images: string }>('SELECT images FROM services WHERE id = ? AND shop_id = ?', data.id, shop.id)
      if (!before) return { error: 'gone' as const }
      await run(
        `UPDATE services SET name = ?, description = ?, duration = ?, price = ?, price_from = ?, by_name = ?, images = ?, active = ? WHERE id = ? AND shop_id = ?`,
        name, str(data.description, 600), duration, price, data.price_from && price ? 1 : 0, str(data.by_name, 40), images, active, data.id, shop.id,
      )
      const kept = new Set(JSON.parse(images) as string[])
      await removePhotos(shop.id, (JSON.parse(before.images) as string[]).filter((k) => !kept.has(k)))
      return { ok: true as const, id: data.id }
    }
    const held = await first<{ n: number; last: number | null }>('SELECT COUNT(*) n, MAX(sort) last FROM services WHERE shop_id = ?', shop.id)
    if ((held?.n ?? 0) >= SERVICES_MAX) return { error: 'limit' as const }
    const id = newId()
    await run(
      `INSERT INTO services (id, shop_id, name, description, duration, price, price_from, by_name, images, active, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, shop.id, name, str(data.description, 600), duration, price, data.price_from && price ? 1 : 0, str(data.by_name, 40), images, active, (held?.last ?? -1) + 1, now(),
    )
    // The setup's second step for a business that sells services (src/lib/setup.ts).
    if (await sellsServices(shop.id)) await passStep(shop.id, 2, 'done', null)
    return { ok: true as const, id }
  })

/** Removes a service. Its bookings stay in the diary with the name and price they were made with. */
export const deleteService = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('products')
    const gone = await first<{ images: string }>('SELECT images FROM services WHERE id = ? AND shop_id = ?', data.id, shop.id)
    await run('DELETE FROM services WHERE id = ? AND shop_id = ?', data.id, shop.id)
    if (gone) await removePhotos(shop.id, JSON.parse(gone.images) as string[])
    return { ok: true as const }
  })

/** The order clients see the services in. */
export const sortServices = createServerFn({ method: 'POST' })
  .validator((d: { ids: string[] }) => ({ ids: (Array.isArray(d.ids) ? d.ids : []).map(String).slice(0, SERVICES_MAX) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('products')
    if (data.ids.length) await db().batch(data.ids.map((id, i) => db().prepare('UPDATE services SET sort = ? WHERE id = ? AND shop_id = ?').bind(i, id, shop.id)))
    return { ok: true as const }
  })

/* ---------- Working hours ---------- */

export type DayOff = { id: string; day: string; start_min: number | null; end_min: number | null; note: string }

/** The hours screen: the settings (null: never set) and the time off still to come. */
export const getBookSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop('manage')
  const [book, blocks, kind] = await Promise.all([
    shopBook(shop.id),
    all<DayOff>('SELECT id, day, start_min, end_min, note FROM book_blocks WHERE shop_id = ? AND day >= ? ORDER BY day, start_min', shop.id, dayOf(now())),
    first<{ kind: string }>('SELECT kind FROM shops WHERE id = ?', shop.id),
  ])
  return { book, blocks, kind: kind?.kind === 'services' ? ('services' as const) : ('products' as const) }
})

export const saveBookSettings = createServerFn({ method: 'POST' })
  .validator((d: { book: BookSettings; kind?: string; seconds?: number }) => d ?? ({} as { book: BookSettings; kind?: string; seconds?: number }))
  .handler(async ({ data }) => {
    const { shop, role } = await requireShop('manage')
    const book = parseBook(data.book)
    if (!book) return { error: 'hours' as const }
    if (!book.days.some(Boolean)) return { error: 'closed' as const }
    if (!AHEAD_CHOICES.includes(book.ahead)) book.ahead = 30
    book.seats = Math.min(SEATS_MAX, Math.max(1, book.seats))
    // The break must leave working time on at least one day.
    if (book.rest && book.days.every((d) => !d || (book.rest!.from <= d.open && book.rest!.to >= d.close))) return { error: 'rest' as const }
    await run('UPDATE shops SET book = ? WHERE id = ?', JSON.stringify(book), shop.id)
    if (data.kind === 'services' || data.kind === 'products') await run('UPDATE shops SET kind = ? WHERE id = ?', data.kind, shop.id)
    // The setup's third step for a business that sells services: its hours instead of a Lipa Namba.
    if (role === 'owner' && (await sellsServices(shop.id))) {
      const secs = Math.round(Number(data.seconds))
      await passStep(shop.id, 3, 'done', Number.isFinite(secs) && secs >= 0 ? Math.min(secs, 3600) : null)
    }
    return { ok: true as const }
  })

/** What the shop shows first, products or services (Shop settings). */
export const setShopKind = createServerFn({ method: 'POST' })
  .validator((d: { kind: string }) => ({ kind: d.kind === 'services' ? 'services' : 'products' }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('manage')
    await run('UPDATE shops SET kind = ? WHERE id = ?', data.kind, shop.id)
    return { ok: true as const }
  })

/**
 * Time off: a whole day (a holiday) or part of one (a long lunch, a funeral). Clients can't book into it. Bookings
 * already made in it stay: the answer counts them so the screen can say to tell those clients.
 */
export const addTimeOff = createServerFn({ method: 'POST' })
  .validator((d: { day: string; start?: number | null; end?: number | null; note?: string }) => d ?? ({ day: '' } as { day: string; start?: number | null; end?: number | null; note?: string }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop(['orders', 'manage'])
    if (!isDay(data.day) || data.day < dayOf(now())) return { error: 'day' as const }
    const whole = data.start == null || data.end == null
    const start = whole ? null : Math.round(Number(data.start))
    const end = whole ? null : Math.round(Number(data.end))
    if (!whole && !(start! >= 0 && end! <= 24 * 60 && end! > start!)) return { error: 'time' as const }
    const held = await first<{ n: number }>('SELECT COUNT(*) n FROM book_blocks WHERE shop_id = ? AND day >= ?', shop.id, dayOf(now()))
    if ((held?.n ?? 0) >= 200) return { error: 'limit' as const }
    await run(
      'INSERT INTO book_blocks (id, shop_id, day, start_min, end_min, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId(), shop.id, data.day, start, end, str(data.note, 80), now(),
    )
    const inside = await first<{ n: number }>(
      `SELECT COUNT(*) n FROM bookings WHERE shop_id = ?1 AND day = ?2 AND status IN ('requested','confirmed')
         AND (?3 IS NULL OR (start_min < ?4 AND end_min > ?3))`,
      shop.id, data.day, start, end,
    )
    return { ok: true as const, booked: inside?.n ?? 0 }
  })

export const removeTimeOff = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop(['orders', 'manage'])
    await run('DELETE FROM book_blocks WHERE id = ? AND shop_id = ?', data.id, shop.id)
    return { ok: true as const }
  })

/* ---------- The diary ---------- */

export type DiaryBooking = BookingRow

/** The diary for a run of days (a day, or a week from its Monday): every booking, the time off, the settings. */
export const getDiary = createServerFn({ method: 'GET' })
  .validator((d: { from: string; days?: number }) => ({
    from: isDay(d.from) ? d.from : dayOf(Date.now()),
    days: Math.min(31, Math.max(1, Math.round(Number(d.days ?? 1)) || 1)),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const to = addDays(data.from, data.days - 1)
    const today = dayOf(now())
    const [bookings, blocks, s, services, toConfirm, tomorrow] = await Promise.all([
      all<DiaryBooking>(`SELECT ${BOOKING_COLS} FROM bookings WHERE shop_id = ? AND day >= ? AND day <= ? ORDER BY day, start_min, created_at`, shop.id, data.from, to),
      all<DayOff>('SELECT id, day, start_min, end_min, note FROM book_blocks WHERE shop_id = ? AND day >= ? AND day <= ? ORDER BY day, start_min', shop.id, data.from, to),
      first<{ book: string | null; name: string; slug: string; lang: string; location: string }>('SELECT book, name, slug, lang, location FROM shops WHERE id = ?', shop.id),
      all<{ id: string; name: string; duration: number; price: number; price_from: number }>(
        'SELECT id, name, duration, price, price_from FROM services WHERE shop_id = ? AND active = 1 ORDER BY sort, created_at',
        shop.id,
      ),
      // Requests waiting for the business, wherever they are in the diary.
      all<DiaryBooking>(`SELECT ${BOOKING_COLS} FROM bookings WHERE shop_id = ? AND status = 'requested' AND start_at > ? ORDER BY start_at LIMIT 50`, shop.id, now()),
      first<{ n: number }>(`SELECT COUNT(*) n FROM bookings WHERE shop_id = ? AND day = ? AND status = 'confirmed'`, shop.id, addDays(today, 1)),
    ])
    return {
      from: data.from,
      days: data.days,
      today,
      bookings,
      blocks,
      book: parseBook(s?.book),
      shop: { name: s?.name ?? shop.name, slug: s?.slug ?? shop.slug, lang: s?.lang ?? 'en', location: s?.location ?? '' },
      services,
      toConfirm,
      tomorrow: tomorrow?.n ?? 0,
    }
  })

/** Free times of a day for the business's own forms (adding a booking, moving one). `except`: the booking being moved. */
export const getDayTimes = createServerFn({ method: 'GET' })
  .validator((d: { day: string; duration: number; except?: string }) => ({
    day: String(d.day),
    duration: Math.round(Number(d.duration)),
    except: String(d.except ?? ''),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const book = await shopBook(shop.id)
    if (!book || !isDay(data.day) || !(data.duration >= 5)) return { times: [] as number[], open: false }
    const load = await dayLoad(shop.id, data.day, data.except)
    // The business may book right up to now: the one-hour notice is for clients.
    const t = now() - 61 * 60_000
    return { times: freeTimes({ ...book, ahead: 366 }, { day: data.day, duration: data.duration, ...load, now: t }), open: !!book.days[weekdayOf(data.day)] }
  })

/**
 * The business adds a booking itself: a walk-in, a call, a chat. Any time is allowed, in or out of the working hours;
 * a time that is already full answers `full` once, and saves when sent again with `force`.
 */
export const addBooking = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      serviceId?: string
      /** Without a listed service: what it is and how long it takes. */
      name?: string
      duration?: number
      day: string
      start: number
      customer: string
      phone?: string
      note?: string
      force?: boolean
    }) => d,
  )
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const customer = str(data.customer, 60)
    const start = Math.round(Number(data.start))
    if (!customer) return { error: 'name' as const }
    if (!isDay(data.day) || !(start >= 0 && start < 24 * 60)) return { error: 'time' as const }
    const listed = data.serviceId
      ? await first<{ id: string; name: string; duration: number; price: number; price_from: number }>(
          'SELECT id, name, duration, price, price_from FROM services WHERE id = ? AND shop_id = ?',
          String(data.serviceId),
          shop.id,
        )
      : null
    const service = listed ?? { id: null, name: str(data.name, 80), duration: Math.round(Number(data.duration)), price: 0, price_from: 0 }
    if (!service.name) return { error: 'service' as const }
    if (!(service.duration >= 5 && service.duration <= DURATION_MAX)) return { error: 'duration' as const }
    if (start + service.duration > 24 * 60) return { error: 'time' as const }
    const book = await shopBook(shop.id)
    if (!data.force) {
      const load = await dayLoad(shop.id, data.day)
      if (!hasPlace(start, service.duration, load.busy, book?.seats ?? 1)) return { error: 'full' as const }
    }
    const made = await insertBooking({
      shopId: shop.id,
      service,
      day: data.day,
      start,
      name: customer,
      phone: normalizePhone(str(data.phone, 30)),
      note: str(data.note, 300),
      status: 'confirmed',
      origin: 'manual',
      seats: null,
    })
    return made ? { ok: true as const, id: made.id } : { error: 'time' as const }
  })

/** Confirm a request, mark a client as served or as not having come, or cancel. A cancelled booking frees its time. */
export const setBookingStatus = createServerFn({ method: 'POST' })
  .validator((d: { id: string; status: BookingStatus }) => ({ id: String(d.id), status: d.status }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const b = await first<{ status: BookingStatus; start_at: number }>('SELECT status, start_at FROM bookings WHERE id = ? AND shop_id = ?', data.id, shop.id)
    if (!b) return { error: 'gone' as const }
    const next = data.status
    const allowed: Record<BookingStatus, BookingStatus[]> = {
      requested: ['confirmed', 'cancelled'],
      confirmed: ['done', 'noshow', 'cancelled'],
      // A slip of the finger can be put right.
      done: ['confirmed', 'noshow'],
      noshow: ['confirmed', 'done'],
      cancelled: [],
    }
    if (!allowed[b.status]?.includes(next)) return { error: 'status' as const }
    // Served or didn't come only once the time has come.
    if ((next === 'done' || next === 'noshow') && b.start_at > now()) return { error: 'status' as const }
    const res = await run(
      'UPDATE bookings SET status = ?, cancelled_by = ?, updated_at = ? WHERE id = ? AND shop_id = ? AND status = ?',
      next, next === 'cancelled' ? 'shop' : null, now(), data.id, shop.id, b.status,
    )
    // The client cancelled or moved it meanwhile.
    if (!res.meta.changes) return { error: 'status' as const }
    return { ok: true as const }
  })

/** The business moves a booking. Like adding one: a full time answers `full` once, then `force` saves it. */
export const moveBooking = createServerFn({ method: 'POST' })
  .validator((d: { id: string; day: string; start: number; force?: boolean }) => ({ id: String(d.id), day: String(d.day), start: Math.round(Number(d.start)), force: !!d.force }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('orders')
    const b = await first<{ duration: number }>(`SELECT duration FROM bookings WHERE id = ? AND shop_id = ? AND status IN ('requested','confirmed')`, data.id, shop.id)
    if (!b) return { error: 'gone' as const }
    if (!isDay(data.day) || !(data.start >= 0 && data.start + b.duration <= 24 * 60)) return { error: 'time' as const }
    if (!data.force) {
      const [book, load] = await Promise.all([shopBook(shop.id), dayLoad(shop.id, data.day, data.id)])
      if (!hasPlace(data.start, b.duration, load.busy, book?.seats ?? 1)) return { error: 'full' as const }
    }
    const moved = await moveBookingTo({ id: data.id, shopId: shop.id, day: data.day, start: data.start, duration: b.duration, seats: null })
    return moved ? { ok: true as const } : { error: 'gone' as const }
  })
