import { getRequestHeader } from '@tanstack/react-start/server'
import { first, now, run } from '#/server/db'

const MINUTE = 60_000

/**
 * The limits. Phones in Tanzania often share one carrier IP, so per-IP limits are generous and only stop floods; the
 * real guard against password guessing is per phone number: 10 wrong passwords in an hour lock that number for the hour.
 */
export const LIMITS = {
  loginFails: { max: 10, window: 60 * MINUTE },
  loginIp: { max: 60, window: 15 * MINUTE },
  signupIp: { max: 30, window: 60 * MINUTE },
  // Requests the bot check (src/server/turnstile.ts) could not vouch for: sign-ups across Shopi, orders and
  // back-in-stock requests per shop.
  uncheckedSignup: { max: 5, window: 60 * MINUTE },
  uncheckedOrder: { max: 3, window: 60 * MINUTE },
  uncheckedAlert: { max: 5, window: 60 * MINUTE },
  // Photos a shop's bulk import fetches from links (src/routes/api/photo.ts): a big sheet, not an open proxy.
  photoFetch: { max: 1500, window: 60 * MINUTE },
  // Google Maps short links a buyer pastes at checkout, opened by the server (expandMapLink), per IP.
  mapLink: { max: 30, window: 60 * MINUTE },
  // Domains a shop connects (each one is a Cloudflare custom hostname, billed past the first 100).
  domainAdd: { max: 5, window: 24 * 60 * MINUTE },
  // Times a shop changes its own link (changeShopLink): each change leaves a former link nobody else can take.
  shopLink: { max: 3, window: 24 * 60 * MINUTE },
  // The setup's step 1 opened again with Back, for a shop nobody has opened yet: its link simply moves (merchant.ts).
  setupLink: { max: 10, window: 24 * 60 * MINUTE },
  // Tembo payments (src/server/billing.ts), per shop: each start or Lipa Namba is a Selcom order, each push a PIN
  // prompt on someone's phone.
  payStart: { max: 8, window: 60 * MINUTE },
  payPush: { max: 6, window: 10 * MINUTE },
  payLipa: { max: 10, window: 60 * MINUTE },
  // Selcom's callbacks, per IP. None is trusted (the outcome is asked from Selcom), so this only stops floods.
  selcomHook: { max: 120, window: 10 * MINUTE },
  // Confirm links a seller asks for (each is an email from hello@shopi.tz), and an admin's test sends.
  // Per seller, per address (many accounts can't all write to one person) and across Shopi.
  emailSend: { max: 5, window: 60 * MINUTE },
  emailTo: { max: 3, window: 60 * MINUTE },
  emailAll: { max: 200, window: 60 * MINUTE },
  emailTest: { max: 20, window: 60 * MINUTE },
  // Shop assistants (src/server/staff.ts): invite links a shop makes, and invite pages opened or accepted per IP.
  staffInvite: { max: 10, window: 60 * MINUTE },
  joinIp: { max: 60, window: 60 * MINUTE },
  // Bookings (src/lib/api/booking.ts): times booked per IP (phones share carrier IPs, so this only stops floods; the
  // real guard is two upcoming bookings per WhatsApp number), bookings the bot check couldn't vouch for per shop, and
  // booking pages opened or changed per IP (the code in the link is the key, so guessing is slowed).
  bookIp: { max: 30, window: 60 * MINUTE },
  uncheckedBook: { max: 5, window: 60 * MINUTE },
  bookPageIp: { max: 120, window: 10 * MINUTE },
  // A backstop per shop (a busy salon takes far fewer), and moves of one booking (each one notifies the business).
  bookShop: { max: 40, window: 60 * MINUTE },
  bookMove: { max: 5, window: 60 * MINUTE },
  // Invoices (src/lib/api/invoice-public.ts): invoice pages opened per IP (the code in the link is the key, so guessing
  // is slowed), payment proofs sent per IP, and per invoice (each one notifies the business).
  invoicePageIp: { max: 120, window: 10 * MINUTE },
  invoiceProofIp: { max: 20, window: 60 * MINUTE },
  invoiceProofDoc: { max: 5, window: 60 * MINUTE },
  // The AI assistant for buyers (src/server/assistant.ts): questions per IP to one shop and across Shopi (carrier IPs
  // are shared, so these only stop floods), a backstop per shop, and chats the bot check couldn't vouch for per shop.
  askIp: { max: 40, window: 60 * MINUTE },
  askIpAll: { max: 150, window: 60 * MINUTE },
  askShop: { max: 150, window: 60 * MINUTE },
  // Across Shopi, every shop's assistant together: a backstop on the bill and on Groq's limits, which the sellers'
  // "Write it for me" shares.
  askAll: { max: 600, window: 60 * MINUTE },
  uncheckedAsk: { max: 10, window: 60 * MINUTE },
} as const

/** The visitor's IP as Cloudflare saw it. */
export const clientIp = () => getRequestHeader('cf-connecting-ip') ?? 'unknown'

/** Whether `key` already reached its limit in the window. */
export async function overLimit(key: string, limit: { max: number; window: number }) {
  const row = await first<{ n: number }>('SELECT COUNT(*) n FROM limits WHERE key = ? AND at > ?', key, now() - limit.window)
  return (row?.n ?? 0) >= limit.max
}

/** Counts one attempt for `key`. */
export async function count(key: string) {
  await run('INSERT INTO limits (key, at) VALUES (?, ?)', key, now())
}

/**
 * Counts one attempt and says whether it is allowed, in that order, so a burst of simultaneous requests can't all read
 * the count before any of them writes it (overLimit then count can). Over-refuses rather than under-refuses.
 */
export async function take(key: string, limit: { max: number; window: number }) {
  await count(key)
  const row = await first<{ n: number }>('SELECT COUNT(*) n FROM limits WHERE key = ? AND at > ?', key, now() - limit.window)
  return (row?.n ?? 0) <= limit.max
}

/** Forgets `key`'s attempts, e.g. a phone's failed logins once the right password is used. */
export async function forget(key: string) {
  await run('DELETE FROM limits WHERE key = ?', key)
}

/** For the nightly job: no limit looks back more than a day. */
export async function purgeLimits() {
  const res = await run('DELETE FROM limits WHERE at < ?', now() - 24 * 60 * MINUTE)
  return { deleted: res.meta.changes }
}
