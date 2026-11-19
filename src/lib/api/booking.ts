import { createServerFn } from '@tanstack/react-start'
import { first, now, run } from '#/server/db'
import { BOOKING_COLS, closedDays, dayLoad, heldBy, insertBooking, moveBookingTo, type BookingRow } from '#/server/bookings'
import { LIMITS, clientIp, take } from '#/server/limits'
import { isHuman } from '#/server/turnstile'
import { notifySeller } from '#/server/push'
import { normalizePhone } from '#/lib/format'
import { BOOKINGS_PER_PHONE, bookableDays, dayText, freeTimes, isDay, opensSomeDay, parseBook, timeText } from '#/lib/booking'

/**
 * Booking a service, for clients (roadmap `v-services`): the service's page, the free times of a day, booking one, and
 * the client's own booking page (shopi.tz/bk/<code>), where they cancel or move it. Clients only ever get free times
 * back, never who else is booked.
 */

export type PublicService = {
  id: string
  name: string
  description: string
  /** Minutes. */
  duration: number
  price: number
  price_from: number
  by_name: string
  images: string[]
}

const isId = (v: unknown) => (typeof v === 'string' && /^[\w-]{8,64}$/.test(v) ? v : null)
const word = (v: unknown, max = 40) =>
  typeof v === 'string'
    ? v
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
    : ''

type ShopForBooking = { id: string; status: string; book: string | null }
const findShop = (shopId: string) => first<ShopForBooking>(`SELECT id, status, book FROM shops WHERE id = ? AND status IN ('active', 'demo')`, shopId)

/** A service's page: the service, and the days a client may look at (closed weekdays and days off are marked). */
export const getBookPage = createServerFn({ method: 'GET' })
  .validator((d: { slug: string; id: string }) => ({ slug: String(d.slug).toLowerCase(), id: String(d.id) }))
  .handler(async ({ data }) => {
    const row = await first<Omit<PublicService, 'images'> & { images: string; shop_id: string; book: string | null }>(
      `SELECT v.id, v.name, v.description, v.duration, v.price, v.price_from, v.by_name, v.images, s.id shop_id, s.book
       FROM services v JOIN shops s ON s.id = v.shop_id
       WHERE s.slug = ? AND s.status IN ('active', 'demo') AND v.id = ? AND v.active = 1`,
      data.slug,
      data.id,
    )
    const book = parseBook(row?.book)
    if (!row || !book || !opensSomeDay(book)) return null
    const { images, shop_id, book: _book, ...service } = row
    const days = bookableDays(book, now())
    const off = new Set(await closedDays(shop_id, days[0].day, days[days.length - 1].day))
    return {
      service: { ...service, images: JSON.parse(images) as string[] } as PublicService,
      days: days.map((d) => ({ day: d.day, open: d.open && !off.has(d.day) })),
      /** The business confirms each booking itself: the client's booking starts as a request. */
      confirm: book.confirm,
    }
  })

/**
 * The free times of one day, as minutes from midnight. With `code` (the client's own booking, being moved) that
 * booking's place doesn't count against it and its length is used.
 */
export const getFreeTimes = createServerFn({ method: 'GET' })
  .validator((d: { shopId: string; serviceId?: string; code?: string; day: string }) => ({
    shopId: String(d.shopId),
    serviceId: String(d.serviceId ?? ''),
    code: String(d.code ?? '').toUpperCase(),
    day: String(d.day),
  }))
  .handler(async ({ data }) => {
    const shop = await findShop(data.shopId)
    const book = parseBook(shop?.book)
    if (!shop || !book || !isDay(data.day)) return { times: [] as number[] }
    // With a code this answers differently for a booking that exists, so it is slowed like the booking page.
    if (data.code && !(await take(`bk-ip:${clientIp()}`, LIMITS.bookPageIp))) return { times: [] as number[] }
    const own = data.code ? await first<{ id: string; duration: number }>('SELECT id, duration FROM bookings WHERE shop_id = ? AND code = ?', shop.id, data.code) : null
    const service = own ?? (await first<{ duration: number }>('SELECT duration FROM services WHERE shop_id = ? AND id = ? AND active = 1', shop.id, data.serviceId))
    if (!service) return { times: [] as number[] }
    const load = await dayLoad(shop.id, data.day, own?.id)
    return { times: freeTimes(book, { day: data.day, duration: service.duration, ...load, now: now() }) }
  })

/** A client books a time. The time is checked again as it is saved, so two clients can't both get it. */
export const bookService = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      shopId: string
      serviceId: string
      day: string
      start: number
      name: string
      phone: string
      note?: string
      visit?: { vid?: string; sid?: string; source?: string; tag?: string }
      /** The Turnstile token (src/lib/turnstile.tsx). */
      human?: string
    }) => d ?? ({} as typeof d),
  )
  .handler(async ({ data }) => {
    const shop = await findShop(String(data.shopId))
    const book = parseBook(shop?.book)
    if (!shop || !book) return { error: 'shop' as const }
    const name = String(data.name ?? '').trim().slice(0, 60)
    const phone = normalizePhone(String(data.phone ?? ''))
    const start = Math.round(Number(data.start))
    if (!name) return { error: 'name' as const }
    // A Tanzanian mobile number, written one way: the limit of two bookings per number counts on it.
    if (!/^\+255[67]\d{8}$/.test(phone)) return { error: 'phone' as const }
    if (!isDay(data.day) || !Number.isFinite(start)) return { error: 'taken' as const }
    if (!(await take(`book-ip:${clientIp()}`, LIMITS.bookIp))) return { error: 'limit' as const }
    if (shop.status === 'demo') return { error: 'demo' as const }
    const service = await first<{ id: string; name: string; duration: number; price: number; price_from: number }>(
      'SELECT id, name, duration, price, price_from FROM services WHERE shop_id = ? AND id = ? AND active = 1',
      shop.id,
      String(data.serviceId),
    )
    if (!service) return { error: 'gone' as const }
    const load = await dayLoad(shop.id, data.day)
    // Only a time the page would offer (10:07 would leave gaps no one can book), checked again as it is saved.
    if (!freeTimes(book, { day: data.day, duration: service.duration, ...load, now: now() }).includes(start)) return { error: 'taken' as const }
    // One person can't fill the diary: a number holds two upcoming bookings in a shop at most.
    if ((await heldBy(shop.id, phone)) >= BOOKINGS_PER_PHONE) return { error: 'many' as const }
    // The bot check comes after the cheap refusals, so junk doesn't spend the allowance of phones that can't run it.
    if (!(await isHuman(data.human, 'book', { key: `book:${shop.id}`, limit: LIMITS.uncheckedBook }))) return { error: 'bot' as const }
    if (!(await take(`book-shop:${shop.id}`, LIMITS.bookShop))) return { error: 'limit' as const }
    const status = book.confirm ? ('requested' as const) : ('confirmed' as const)
    const made = await insertBooking({
      shopId: shop.id,
      service,
      day: data.day,
      start,
      name,
      phone,
      note: String(data.note ?? '').trim().slice(0, 300),
      status,
      origin: 'online',
      seats: book.seats,
      visit: { vid: isId(data.visit?.vid), sid: isId(data.visit?.sid), source: word(data.visit?.source) || 'direct', tag: word(data.visit?.tag) || null },
    })
    // Someone took it between the check and the save.
    if (!made) return { error: 'taken' as const }
    const when = { day: data.day, time: timeText(start) }
    notifySeller(shop.id, (t, lang) => ({
      title: book.confirm ? t('Booking to confirm: {name}', { name }) : t('New booking: {name}', { name }),
      body: `${service.name} · ${dayText(lang, when.day)} ${when.time}`,
      url: `/app/bookings?day=${when.day}`,
      tag: `booking-${made.id}`,
    }))
    return { ok: true as const, code: made.code }
  })

export type MyBooking = Pick<BookingRow, 'code' | 'service_id' | 'service_name' | 'duration' | 'price' | 'price_from' | 'day' | 'start_min' | 'end_min' | 'start_at' | 'customer_name' | 'note' | 'status' | 'cancelled_by' | 'origin'> & {
  shop: {
    id: string
    slug: string
    name: string
    logo_key: string | null
    whatsapp: string
    location: string
    maps_url: string
    lang: string
    theme_color: string | null
    status: string
  }
  /** Still coming and not yet started: the client can cancel or move it. */
  open: boolean
  /** The days the client may move it to. */
  days: { day: string; open: boolean }[]
}

/** The client's booking page. The code in the link is the key: whoever holds it sees and changes this one booking. */
export const getMyBooking = createServerFn({ method: 'GET' })
  .validator((d: { code: string }) => ({ code: String(d.code ?? '').toUpperCase().slice(0, 12) }))
  .handler(async ({ data }): Promise<MyBooking | null> => {
    if (!(await take(`bk-ip:${clientIp()}`, LIMITS.bookPageIp))) return null
    const row = await first<BookingRow & { shop_id: string }>(`SELECT ${BOOKING_COLS}, shop_id FROM bookings WHERE code = ?`, data.code)
    if (!row) return null
    const shop = await first<MyBooking['shop'] & { book: string | null }>(
      `SELECT id, slug, name, logo_key, whatsapp, location, maps_url, lang, theme_color, status, book FROM shops WHERE id = ? AND status IN ('active', 'demo')`,
      row.shop_id,
    )
    if (!shop) return null
    const { book: raw, ...shopOut } = shop
    const book = parseBook(raw)
    const open = (row.status === 'requested' || row.status === 'confirmed') && row.start_at > now()
    let days: MyBooking['days'] = []
    if (open && book) {
      const list = bookableDays(book, now())
      const off = new Set(await closedDays(shop.id, list[0].day, list[list.length - 1].day))
      days = list.map((d) => ({ day: d.day, open: d.open && !off.has(d.day) }))
    }
    const { id: _id, shop_id: _shop, customer_phone: _phone, created_at: _at, ...booking } = row
    return { ...booking, shop: shopOut, open, days }
  })

const ownBooking = (code: string) =>
  first<{ id: string; shop_id: string; status: string; start_at: number; duration: number; customer_name: string; service_name: string; day: string; start_min: number }>(
    'SELECT id, shop_id, status, start_at, duration, customer_name, service_name, day, start_min FROM bookings WHERE code = ?',
    code,
  )

/** The client cancels: the time is free again at once, and the business is told. */
export const cancelMyBooking = createServerFn({ method: 'POST' })
  .validator((d: { code: string }) => ({ code: String(d.code ?? '').toUpperCase().slice(0, 12) }))
  .handler(async ({ data }) => {
    if (!(await take(`bk-ip:${clientIp()}`, LIMITS.bookPageIp))) return { error: 'limit' as const }
    const b = await ownBooking(data.code)
    if (!b) return { error: 'gone' as const }
    const res = await run(
      `UPDATE bookings SET status = 'cancelled', cancelled_by = 'client', updated_at = ?1 WHERE id = ?2 AND status IN ('requested','confirmed') AND start_at > ?1`,
      now(),
      b.id,
    )
    if (!res.meta.changes) return { error: 'late' as const }
    notifySeller(b.shop_id, (t, lang) => ({
      title: t('Booking cancelled: {name}', { name: b.customer_name }),
      body: `${b.service_name} · ${dayText(lang, b.day)} ${timeText(b.start_min)}`,
      url: `/app/bookings?day=${b.day}`,
      tag: `booking-${b.id}`,
    }))
    return { ok: true as const }
  })

/** The client moves their booking to another free time. */
export const moveMyBooking = createServerFn({ method: 'POST' })
  .validator((d: { code: string; day: string; start: number }) => ({
    code: String(d.code ?? '').toUpperCase().slice(0, 12),
    day: String(d.day),
    start: Math.round(Number(d.start)),
  }))
  .handler(async ({ data }) => {
    if (!(await take(`bk-ip:${clientIp()}`, LIMITS.bookPageIp))) return { error: 'limit' as const }
    const b = await ownBooking(data.code)
    if (!b || !isDay(data.day) || !Number.isFinite(data.start)) return { error: 'gone' as const }
    if (!(b.status === 'requested' || b.status === 'confirmed') || b.start_at <= now()) return { error: 'late' as const }
    const shop = await findShop(b.shop_id)
    const book = parseBook(shop?.book)
    if (!shop || !book) return { error: 'gone' as const }
    if (!(await take(`bk-move:${b.id}`, LIMITS.bookMove))) return { error: 'limit' as const }
    const load = await dayLoad(shop.id, data.day, b.id)
    if (!freeTimes(book, { day: data.day, duration: b.duration, ...load, now: now() }).includes(data.start)) return { error: 'taken' as const }
    // A business that confirms each booking confirms the new time too.
    const moved = await moveBookingTo({ id: b.id, shopId: shop.id, day: data.day, start: data.start, duration: b.duration, seats: book.seats, status: book.confirm ? 'requested' : undefined })
    if (!moved) return { error: 'taken' as const }
    notifySeller(shop.id, (t, lang) => ({
      title: t('Booking moved: {name}', { name: b.customer_name }),
      body: t('{service} · now {when} (was {before})', {
        service: b.service_name,
        when: `${dayText(lang, data.day)} ${timeText(data.start)}`,
        before: `${dayText(lang, b.day)} ${timeText(b.start_min)}`,
      }),
      url: `/app/bookings?day=${data.day}`,
      tag: `booking-${b.id}`,
    }))
    return { ok: true as const }
  })
