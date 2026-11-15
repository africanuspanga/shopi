import { all, first, now, run } from '#/server/db'
import { CfError, cfReady, createHostname, deleteHostname, getHostname, widgetHost } from '#/server/cloudflare'

/** A shop's own domain (migrations/0018_domains.sql). */
export type DomainRow = {
  hostname: string
  shop_id: string
  cf_id: string | null
  status: 'pending' | 'active' | 'failed'
  detail: string
  turnstile: number
  created_at: number
  checked_at: number | null
  active_at: number | null
}

const MINUTE = 60_000
const hosts = new Map<string, { slug: string | null; at: number }>()

/** The shop an active domain serves (cached a minute per Worker), or null. */
export async function shopForHost(host: string) {
  const hit = hosts.get(host)
  if (hit && Date.now() - hit.at < MINUTE) return hit.slug
  const row = await first<{ slug: string }>(
    `SELECT s.slug FROM domains d JOIN shops s ON s.id = d.shop_id
     WHERE d.hostname = ? AND d.status = 'active' AND s.status IN ('active', 'demo')`,
    host,
  )
  hosts.set(host, { slug: row?.slug ?? null, at: Date.now() })
  return row?.slug ?? null
}

/** For the bot check: a token issued on a shop's active domain counts like one from shopi.tz. */
export async function isShopDomain(host: string) {
  return !!(await first('SELECT 1 FROM domains WHERE hostname = ? AND status = ?', host, 'active'))
}

/**
 * Asks Cloudflare where a domain stands (registering it if Cloudflare doesn't have it yet) and saves the answer. Active
 * once Cloudflare serves it with a certificate; then it also goes on the bot check's widget, while there is room.
 */
export async function refreshDomain(row: DomainRow): Promise<DomainRow> {
  if (!cfReady()) return row
  let ch = row.cf_id
    ? await getHostname(row.cf_id).catch((e) => {
        if (e instanceof CfError && e.codes.includes(1436)) return null
        throw e
      })
    : null
  ch ??= await createHostname(row.hostname)
  const live = ch.status === 'active' && ch.ssl?.status === 'active'
  const status: DomainRow['status'] = live ? 'active' : ['blocked', 'moved', 'deleted'].includes(ch.status) ? 'failed' : 'pending'
  const detail = [...(ch.verification_errors ?? []), ...(ch.ssl?.validation_errors ?? []).map((e) => e.message)].join('; ').slice(0, 300)
  let turnstile = row.turnstile
  if (live && !turnstile) {
    const added = await widgetHost(row.hostname, true).catch((e) => (console.error('[domains] turnstile', e), 'full' as const))
    if (added === 'ok') turnstile = 1
    else console.error('[domains] the bot check widget is full; orders on', row.hostname, 'use the unchecked allowance')
  }
  const at = now()
  const active_at = live ? (row.active_at ?? at) : row.active_at
  await run(
    'UPDATE domains SET cf_id = ?, status = ?, detail = ?, turnstile = ?, checked_at = ?, active_at = ? WHERE hostname = ?',
    ch.id, status, detail, turnstile, at, active_at, row.hostname,
  )
  hosts.delete(row.hostname)
  return { ...row, cf_id: ch.id, status, detail, turnstile, checked_at: at, active_at }
}

/** Takes a domain off Cloudflare and the bot check, then out of Shopi. */
export async function dropDomain(row: DomainRow) {
  if (cfReady()) {
    if (row.cf_id) await deleteHostname(row.cf_id)
    if (row.turnstile) await widgetHost(row.hostname, false).catch((e) => console.error('[domains] turnstile', e))
  }
  await run('DELETE FROM domains WHERE hostname = ?', row.hostname)
  hosts.delete(row.hostname)
}

/** For the nightly job: every domain checked again, so one whose CNAME was removed stops being served. */
export async function refreshDomains() {
  if (!cfReady()) return { checked: 0, failed: 0 }
  const rows = await all<DomainRow>('SELECT * FROM domains ORDER BY checked_at LIMIT 200')
  let failed = 0
  for (const row of rows) {
    try {
      await refreshDomain(row)
    } catch (e) {
      failed++
      console.error('[domains]', row.hostname, e)
    }
  }
  return { checked: rows.length, failed }
}
