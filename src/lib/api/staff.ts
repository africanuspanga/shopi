import { createServerFn } from '@tanstack/react-start'
import { currentUser, hashPassword, requireShop, startSession, verifyPassword } from '#/server/auth'
import { db, first, newId, now, run } from '#/server/db'
import { LIMITS, clientIp, count, forget, overLimit } from '#/server/limits'
import { cleanInviteCode, findInvite, hashCode, inviteCode, listStaff, renewInvite, runsAShop } from '#/server/staff'
import { shopPlan } from '#/server/plan'
import { localPhone, normalizePhone } from '#/lib/format'
import { can } from '#/lib/plans'
import { INVITE_DAYS, STAFF_MAX, asStaffRole } from '#/lib/staff'

/**
 * Shop assistants (roadmap `t-staff`, the founder's answers of 18 Nov 2026): the owner's page (/app/staff) and the
 * invite page an assistant opens (/join/<code>). Rules in src/lib/staff.ts.
 */

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)

/** The owner's list: who helps run the shop, and whether the shop can have assistants now (Tembo). */
export const getStaff = createServerFn({ method: 'GET' }).handler(async () => {
  const { user, shop } = await requireShop('owner')
  const plan = await shopPlan(shop.id)
  return { staff: await listStaff(shop.id), can: can(plan, 'staff'), max: STAFF_MAX, owner: user.name, shop: shop.name }
})

/** Adds an assistant and makes their invite link (the code is only ever in this answer and the link). */
export const addStaff = createServerFn({ method: 'POST' })
  .validator((d: { name: string; phone: string; role: string }) => ({
    name: str(d.name, 60),
    phone: normalizePhone(str(d.phone, 30)),
    role: asStaffRole(d.role),
  }))
  .handler(async ({ data }) => {
    const { user, shop } = await requireShop('owner')
    if (!can(await shopPlan(shop.id), 'staff')) return { error: 'tembo' as const }
    if (!data.name) return { error: 'name' as const }
    if (!data.phone) return { error: 'phone' as const }
    if (!data.role) return { error: 'role' as const }
    if (data.phone === user.phone) return { error: 'self' as const }
    const taken = await first<{ n: number; same: number }>('SELECT COUNT(*) n, SUM(phone = ?) same FROM shop_staff WHERE shop_id = ?', data.phone, shop.id)
    if ((taken?.same ?? 0) > 0) return { error: 'same' as const }
    if ((taken?.n ?? 0) >= STAFF_MAX) return { error: 'full' as const }
    // A number that already runs a shop on Shopi (as its owner or an assistant) can't join another: one login, one shop.
    const account = await first<{ id: string }>('SELECT id FROM users WHERE phone = ?', data.phone)
    if (account && (await runsAShop(account.id))) return { error: 'has_shop' as const }
    const key = `staff-invite:${shop.id}`
    if (await overLimit(key, LIMITS.staffInvite)) return { error: 'limit' as const }
    await count(key)
    const code = inviteCode()
    const id = newId()
    let added = false
    try {
      // The limit is checked in the same statement that adds the row, so two adds at once can't make a third.
      const res = await run(
        `INSERT INTO shop_staff (id, shop_id, name, phone, role, invite_hash, invite_until, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COUNT(*) FROM shop_staff WHERE shop_id = ?2) < ?9`,
        id,
        shop.id,
        data.name,
        data.phone,
        data.role,
        await hashCode(code),
        now() + INVITE_DAYS * 86400_000,
        now(),
        STAFF_MAX,
      )
      added = res.meta.changes === 1
    } catch {
      // Two taps at once: the phone's unique index caught the second.
      return { error: 'same' as const }
    }
    if (!added) return { error: 'full' as const }
    return { ok: true as const, id, code }
  })

/** A new link for an assistant who hasn't joined: the old one stops working. */
export const newStaffLink = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('owner')
    if (!can(await shopPlan(shop.id), 'staff')) return { error: 'tembo' as const }
    const key = `staff-invite:${shop.id}`
    if (await overLimit(key, LIMITS.staffInvite)) return { error: 'limit' as const }
    await count(key)
    const code = await renewInvite(data.id, shop.id)
    return code ? { ok: true as const, code } : { error: 'joined' as const }
  })

export const setStaffRole = createServerFn({ method: 'POST' })
  .validator((d: { id: string; role: string }) => ({ id: str(d.id, 40), role: asStaffRole(d.role) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('owner')
    if (!data.role) return { error: 'role' as const }
    await run('UPDATE shop_staff SET role = ? WHERE id = ? AND shop_id = ?', data.role, data.id, shop.id)
    return { ok: true as const }
  })

/** Takes an assistant off the shop: their notifications for it stop and their phone is logged out. */
export const removeStaff = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: str(d.id, 40) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('owner')
    const row = await first<{ user_id: string | null }>('SELECT user_id FROM shop_staff WHERE id = ? AND shop_id = ?', data.id, shop.id)
    if (!row) return { ok: true as const }
    await db().batch([
      db().prepare('DELETE FROM shop_staff WHERE id = ? AND shop_id = ?').bind(data.id, shop.id),
      ...(row.user_id
        ? [
            db().prepare('DELETE FROM push_subscriptions WHERE shop_id = ? AND user_id = ?').bind(shop.id, row.user_id),
            db().prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
          ]
        : []),
    ])
    return { ok: true as const }
  })

/* ---------- The invite page (/join/<code>), for the assistant ---------- */

/** What the invite page shows. `account`: whether this number has a Shopi login yet; `me`: who is logged in here. */
export const getInvite = createServerFn({ method: 'GET' })
  .validator((d: { code: string }) => ({ code: cleanInviteCode(d.code) }))
  .handler(async ({ data }) => {
    const ipKey = `join-ip:${clientIp()}`
    if (await overLimit(ipKey, LIMITS.joinIp)) return { error: 'limit' as const }
    await count(ipKey)
    const invite = data.code ? await findInvite(data.code) : null
    if (!invite) return { error: 'ended' as const }
    const account = await first<{ id: string }>('SELECT id FROM users WHERE phone = ?', invite.phone)
    const me = await currentUser()
    return {
      ok: true as const,
      shop: { name: invite.shop_name, slug: invite.slug, logo_key: invite.logo_key },
      owner: invite.owner_name,
      name: invite.name,
      phone: localPhone(invite.phone),
      role: invite.role,
      account: !account ? ('new' as const) : (await runsAShop(account.id)) ? ('busy' as const) : ('existing' as const),
      me: !me ? null : { name: me.name, match: me.phone === invite.phone },
    }
  })

/**
 * Accepts an invite: a new login (name and password) for a number Shopi doesn't know, the password of the login it
 * has, or nothing when that login is the one here. The link works once.
 */
export const acceptInvite = createServerFn({ method: 'POST' })
  .validator((d: { code: string; name?: string; password?: string }) => ({
    code: cleanInviteCode(d.code),
    name: str(d.name, 60),
    password: String(d.password ?? ''),
  }))
  .handler(async ({ data }) => {
    const ipKey = `join-ip:${clientIp()}`
    if (await overLimit(ipKey, LIMITS.joinIp)) return { error: 'limit' as const }
    await count(ipKey)
    const invite = data.code ? await findInvite(data.code) : null
    if (!invite) return { error: 'ended' as const }
    const me = await currentUser()
    if (me && me.phone !== invite.phone) return { error: 'other_login' as const }
    const account = await first<{ id: string; pass_hash: string }>('SELECT id, pass_hash FROM users WHERE phone = ?', invite.phone)
    let userId: string
    let made = false
    if (account) {
      if (await runsAShop(account.id)) return { error: 'busy' as const }
      if (me?.id !== account.id) {
        // The same guard as logging in: 10 wrong passwords for one number in an hour wait.
        const phoneKey = `login:${invite.phone}`
        if (await overLimit(phoneKey, LIMITS.loginFails)) return { error: 'limit' as const }
        if (!(await verifyPassword(data.password, account.pass_hash))) {
          await count(phoneKey)
          return { error: 'password' as const }
        }
        await forget(phoneKey)
      }
      userId = account.id
    } else {
      const name = data.name || invite.name
      if (data.password.length < 6) return { error: 'short' as const }
      userId = newId()
      try {
        await run('INSERT INTO users (id, phone, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', userId, invite.phone, name, await hashPassword(data.password), now())
      } catch {
        // The same link accepted twice at once: the first made the login (unique phone).
        return { error: 'ended' as const }
      }
      made = true
    }
    // Claimed once: the row must still be waiting on this very link.
    let claimed = false
    try {
      const res = await run(
        `UPDATE shop_staff SET user_id = ?1, joined_at = ?2, invite_hash = NULL, invite_until = NULL
         WHERE id = ?3 AND user_id IS NULL AND invite_hash = ?4 AND NOT EXISTS (SELECT 1 FROM shops WHERE owner_id = ?1)`,
        userId,
        now(),
        invite.id,
        await hashCode(data.code!),
      )
      claimed = res.meta.changes === 1
    } catch {
      // This login joined another shop at the same moment (one login, one shop).
    }
    if (!claimed) {
      if (made) await run('DELETE FROM users WHERE id = ?', userId)
      return { error: 'ended' as const }
    }
    if (me?.id !== userId) await startSession(userId)
    return { ok: true as const }
  })
