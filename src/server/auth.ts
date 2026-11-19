import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'
import { first, newId, now, run } from './db'
import { can, planState } from '#/lib/plans'
import { allows, type Area, type Role } from '#/lib/staff'

const COOKIE = 'shopi_sid'
export const SESSION_DAYS = 60
const ITERATIONS = 100_000

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256)
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt))}`
}

export async function verifyPassword(password: string, stored: string) {
  const [, , salt, hash] = stored.split('$')
  if (!salt || !hash) return false
  const got = new Uint8Array(await derive(password, unb64(salt)))
  const want = unb64(hash)
  if (got.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]
  return diff === 0
}

export async function startSession(userId: string) {
  const token = newId(32)
  const expires = now() + SESSION_DAYS * 86400_000
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires)
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
}

export async function endSession() {
  const token = getCookie(COOKIE)
  if (token) await run('DELETE FROM sessions WHERE token = ?', token)
  deleteCookie(COOKIE, { path: '/' })
}

export type SessionUser = { id: string; phone: string; name: string; is_admin: number }

export async function currentUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE)
  if (!token) return null
  return first<SessionUser>(
    `SELECT u.id, u.phone, u.name, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    token,
    now(),
  )
}

export async function requireUser() {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return user
}

export type OwnShop = { id: string; slug: string; name: string }

/** The owner dashboard (/admin): only users with is_admin. Anyone else gets the same answer as a missing page. */
export async function requireAdmin() {
  const user = await currentUser()
  if (!user?.is_admin) throw new Error('NOT_FOUND')
  return user
}

export type MyShop = OwnShop & {
  logo_key: string | null
  status: string
  plan: string
  paid_until: number | null
  setup_step: number | null
  /** What the shop shows first: 'products' or 'services' (src/lib/booking.ts). */
  kind: string
  owner_id: string
  role: Role
  /** An assistant whose shop is no longer on Tembo: kept, but can't help run it until it renews (src/lib/staff.ts). */
  paused: boolean
}

/**
 * The shop this login runs: the one it owns, else the one it helps run as an assistant (one login, one shop). The
 * session, every seller server function and the upload endpoints read it here.
 */
export async function myShop(userId: string): Promise<MyShop | null> {
  const row = await first<Omit<MyShop, 'paused'> & { rank: number }>(
    `SELECT id, slug, name, logo_key, status, plan, paid_until, setup_step, kind, owner_id, 'owner' role, 0 rank
       FROM shops WHERE owner_id = ?1
     UNION ALL
     SELECT s.id, s.slug, s.name, s.logo_key, s.status, s.plan, s.paid_until, s.setup_step, s.kind, s.owner_id, st.role, 1 rank
       FROM shop_staff st JOIN shops s ON s.id = st.shop_id
       WHERE st.user_id = ?1 AND s.status IN ('active', 'demo')
     ORDER BY rank LIMIT 1`,
    userId,
  )
  if (!row) return null
  const { rank: _, ...shop } = row
  return { ...shop, paused: shop.role !== 'owner' && !can(planState(shop), 'staff') }
}

/**
 * The logged-in seller's shop, for a server function that needs `area` (src/lib/staff.ts). With no area only the owner
 * passes, so a function nobody has looked at stays the owner's. A paused assistant gets nothing.
 */
export async function requireShop(area: Area | Area[] = 'owner') {
  const user = await requireUser()
  const mine = await myShop(user.id)
  if (!mine || mine.paused) throw new Error('NO_SHOP')
  if (!allows(mine.role, area)) throw new Error('NOT_ALLOWED')
  const shop: OwnShop = { id: mine.id, slug: mine.slug, name: mine.name }
  return { user, shop, role: mine.role }
}

/** For the raw endpoints (uploads, downloads): the shop, or null when this login may not do `area` there. */
export async function shopFor(area: Area | Area[]) {
  const user = await currentUser()
  if (!user) return { user: null, shop: null }
  const mine = await myShop(user.id)
  if (!mine || mine.paused || !allows(mine.role, area)) return { user, shop: null }
  return { user, shop: { id: mine.id, slug: mine.slug, name: mine.name } as OwnShop }
}
