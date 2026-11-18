import { env } from 'cloudflare:workers'
import { db, now, run } from '#/server/db'
import { ALERT_DAYS } from '#/server/alerts'
import { purgeLimits } from '#/server/limits'
import { refreshDomains } from '#/server/domains'
import { reconcilePayments, remindRenewals } from '#/server/billing'
import { purgeAiUses } from '#/server/ai'

// Cron schedules, in UTC (Tanzania is UTC+3). They must match "triggers" in wrangler.jsonc.
export const NIGHTLY = '0 0 * * *' // 03:00 in Dar
export const WEEKLY = '30 0 * * SUN' // Sunday 03:30 in Dar, after the nightly clean-up
export const FREQUENT = '*/5 * * * *' // Tembo payments still pending, asked of Selcom again (src/server/billing.ts)

/** Visit data (`events`) lives 13 months at most (Privacy page). */
export const VISIT_MONTHS = 13
/** Weekly database copies kept in the `shopi-backups` bucket (Privacy page: "up to 5 weeks"). */
export const BACKUP_WEEKS = 5

const DAY = 86400_000

export async function runJob(cron: string) {
  const tasks: [string, () => Promise<unknown>][] =
    cron === NIGHTLY
      ? [
          ['alerts', purgeAlerts],
          ['pins', purgePins],
          ['visits', purgeVisits],
          ['sessions', purgeSessions],
          ['limits', purgeLimits],
          // Shops' own domains: one whose CNAME was removed stops being served (src/server/domains.ts).
          ['domains', refreshDomains],
          // Tembo ends in 7 days, tomorrow or today: a notification (only once billing is live).
          ['renewals', remindRenewals],
          // AI use counts (no text is kept): about 13 months.
          ['ai', purgeAiUses],
        ]
      : cron === WEEKLY
        ? [['backup', backupDatabase]]
        : cron === FREQUENT
          ? [['payments', reconcilePayments]]
          : []
  if (!tasks.length) throw new Error(`[jobs] no job for cron "${cron}"`)
  const failed: string[] = []
  // One task failing doesn't stop the others; the run still ends as failed, so Cloudflare's cron log shows it.
  for (const [name, task] of tasks) {
    try {
      console.log(`[jobs] ${name}`, JSON.stringify(await task()))
    } catch (e) {
      failed.push(name)
      console.error(`[jobs] ${name} failed`, e)
    }
  }
  if (failed.length) throw new Error(`[jobs] failed: ${failed.join(', ')}`)
}

// Each purge removes what would pass its limit before the next night's run, so nothing outlives the promise.

/** Back-in-stock alerts: 90 days at most. */
async function purgeAlerts() {
  const res = await run('DELETE FROM stock_alerts WHERE created_at < ?', now() - (ALERT_DAYS - 1) * DAY)
  return { deleted: res.meta.changes }
}

/** Buyers' delivery pins on orders: 90 days (Privacy page). The area and the rider's note stay. */
export const PIN_DAYS = 90

async function purgePins() {
  const res = await run(
    'UPDATE orders SET lat = NULL, lng = NULL, pin_m = NULL WHERE created_at < ? AND lat IS NOT NULL',
    now() - (PIN_DAYS - 1) * DAY,
  )
  return { cleared: res.meta.changes }
}

/**
 * Visit data: events older than 13 months, and the visitor and visit IDs on orders that old. The order itself stays
 * (sellers keep their records), with its channel (`source`, `link_tag`) as the total that remains.
 */
async function purgeVisits() {
  const cutoff = new Date(now() + DAY)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - VISIT_MONTHS)
  let events = 0
  // In batches, so a backlog never turns into one long write.
  for (;;) {
    const res = await run('DELETE FROM events WHERE rowid IN (SELECT rowid FROM events WHERE created_at < ? LIMIT 5000)', cutoff.getTime())
    events += res.meta.changes
    if (res.meta.changes < 5000) break
  }
  const orders = await run(
    'UPDATE orders SET visitor_id = NULL, session_id = NULL WHERE created_at < ? AND (visitor_id IS NOT NULL OR session_id IS NOT NULL)',
    cutoff.getTime(),
  )
  return { events, orders: orders.meta.changes }
}

/** Seller logins that have ended. */
async function purgeSessions() {
  const res = await run('DELETE FROM sessions WHERE expires_at < ?', now())
  return { deleted: res.meta.changes }
}

/**
 * The whole database as a gzipped SQL file in the private `shopi-backups` bucket (`d1/shopi-YYYY-MM-DD.sql.gz`), the same
 * shape `wrangler d1 export` writes, so it restores with `wrangler d1 execute --file`. D1 Time Travel already covers 30
 * days; this copy survives the database itself being deleted. The newest five are kept.
 */
export async function backupDatabase() {
  const tables = await db()
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid`)
    .all<{ name: string; sql: string }>()
  const extras = await db()
    .prepare(`SELECT sql FROM sqlite_master WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid`)
    .all<{ sql: string }>()

  // SQL text goes through gzip as it is made, so only the compressed file is ever held whole.
  const gzip = new CompressionStream('gzip')
  const writer = gzip.writable.getWriter()
  const file = new Response(gzip.readable).arrayBuffer()
  const encoder = new TextEncoder()
  const write = (text: string) => writer.write(encoder.encode(text))

  await write(`-- Shopi database backup, ${new Date().toISOString()}\nPRAGMA defer_foreign_keys=TRUE;\n`)
  for (const t of tables.results) await write(`${t.sql};\n`)
  const counts: Record<string, number> = {}
  for (const t of tables.results) {
    const name = quoteName(t.name)
    let after = 0
    counts[t.name] = 0
    for (;;) {
      const [columns, ...rows] = await db()
        .prepare(`SELECT rowid AS __rowid, * FROM ${name} WHERE rowid > ? ORDER BY rowid LIMIT 500`)
        .bind(after)
        .raw<unknown[]>({ columnNames: true })
      if (!rows.length) break
      const into = `INSERT INTO ${name} (${(columns as string[]).slice(1).map(quoteName).join(',')}) VALUES `
      await write(rows.map((r) => `${into}(${r.slice(1).map(sqlValue).join(',')});\n`).join(''))
      after = Number(rows[rows.length - 1][0])
      counts[t.name] += rows.length
      if (rows.length < 500) break
    }
  }
  for (const x of extras.results) await write(`${x.sql};\n`)
  await writer.close()
  const bytes = await file

  const key = `d1/shopi-${new Date().toISOString().slice(0, 10)}.sql.gz`
  await env.BACKUPS.put(key, bytes, { httpMetadata: { contentType: 'application/gzip' }, customMetadata: { tables: String(tables.results.length) } })

  // Keep the newest few. Keys sort by date.
  const listed = await env.BACKUPS.list({ prefix: 'd1/' })
  const old = listed.objects.map((o) => o.key).sort().reverse().slice(BACKUP_WEEKS)
  if (old.length) await env.BACKUPS.delete(old)
  return { key, bytes: bytes.byteLength, rows: counts, deleted: old }
}

const quoteName = (name: string) => `"${name.replaceAll('"', '""')}"`

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'`
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v) || Array.isArray(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : Uint8Array.from(v as number[])
    return `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}'`
  }
  return `'${String(v).replaceAll("'", "''")}'`
}
