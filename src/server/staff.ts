import { all, first, newId, now, run } from '#/server/db'
import { SESSION_DAYS } from '#/server/auth'
import { INVITE_DAYS, type StaffRole } from '#/lib/staff'

/**
 * Shop assistants (roadmap `t-staff`; rules in src/lib/staff.ts). An invite link carries a random code; only its
 * SHA-256 is stored, so the database never holds a working link. A link works once, for INVITE_DAYS.
 */

export async function hashCode(code: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The code in an invite link: 24 random letters and digits (about 124 bits), never stored as it is. */
export const inviteCode = () => newId(24)
export const cleanInviteCode = (v: unknown) => (/^[a-z0-9]{24}$/.test(String(v ?? '')) ? String(v) : null)

/** A fresh link for an assistant who hasn't joined yet: the old link stops working. */
export async function renewInvite(staffId: string, shopId: string) {
  const code = inviteCode()
  const res = await run(
    'UPDATE shop_staff SET invite_hash = ?, invite_until = ? WHERE id = ? AND shop_id = ? AND user_id IS NULL',
    await hashCode(code),
    now() + INVITE_DAYS * 86400_000,
    staffId,
    shopId,
  )
  return res.meta.changes === 1 ? code : null
}

export type StaffRow = {
  id: string
  name: string
  phone: string
  role: StaffRole
  created_at: number
  joined_at: number | null
  invite_until: number | null
  /** When they last logged in, worked out from their newest session (as /admin does); null before they join. */
  last_seen: number | null
}

export async function listStaff(shopId: string) {
  return all<StaffRow>(
    `SELECT st.id, st.name, st.phone, st.role, st.created_at, st.joined_at, st.invite_until,
       (SELECT MAX(expires_at) - ? FROM sessions WHERE user_id = st.user_id) last_seen
     FROM shop_staff st WHERE st.shop_id = ? ORDER BY st.created_at`,
    SESSION_DAYS * 86400_000,
    shopId,
  )
}

export type Invite = {
  id: string
  shop_id: string
  name: string
  phone: string
  role: StaffRole
  shop_name: string
  slug: string
  logo_key: string | null
  owner_name: string
}

/** The invite behind a link, while it still works: not used, not past its days, the shop still open. */
export async function findInvite(code: string) {
  return first<Invite>(
    `SELECT st.id, st.shop_id, st.name, st.phone, st.role, s.name shop_name, s.slug, s.logo_key, u.name owner_name
     FROM shop_staff st JOIN shops s ON s.id = st.shop_id JOIN users u ON u.id = s.owner_id
     WHERE st.invite_hash = ? AND st.user_id IS NULL AND st.invite_until > ? AND s.status IN ('active', 'demo')`,
    await hashCode(code),
    now(),
  )
}

/** Whether this login already runs a shop, as its owner or as an assistant (one login, one shop). */
export async function runsAShop(userId: string) {
  return !!(await first(
    'SELECT 1 FROM shops WHERE owner_id = ?1 UNION ALL SELECT 1 FROM shop_staff WHERE user_id = ?1 LIMIT 1',
    userId,
  ))
}
