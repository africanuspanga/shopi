import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { first, now, run } from '#/server/db'
import { cfReady } from '#/server/cloudflare'
import { dropDomain, refreshDomain, type DomainRow } from '#/server/domains'
import { LIMITS, count, overLimit } from '#/server/limits'
import { CNAME_TARGET, cleanDomain, isApex } from '#/lib/host'
import { can } from '#/lib/plans'
import { shopPlan } from '#/server/plan'

export type MyDomain = {
  /** False until the founder has switched custom domains on (CF_API_TOKEN). */
  ready: boolean
  target: string
  domain: Pick<DomainRow, 'hostname' | 'status' | 'detail' | 'checked_at' | 'active_at'> | null
}

const mine = (shopId: string) => first<DomainRow>('SELECT * FROM domains WHERE shop_id = ?', shopId)
const shown = (d: DomainRow | null): MyDomain['domain'] =>
  d ? { hostname: d.hostname, status: d.status, detail: d.detail, checked_at: d.checked_at, active_at: d.active_at } : null

/** The shop's domain. A pending one is checked again when the page asks, at most every 20 seconds. */
export const getMyDomain = createServerFn({ method: 'GET' }).handler(async (): Promise<MyDomain> => {
  const { shop } = await requireShop()
  let d = await mine(shop.id)
  if (d && d.status === 'pending' && cfReady() && (!d.checked_at || now() - d.checked_at > 20_000)) {
    d = await refreshDomain(d).catch((e) => (console.error('[domains]', e), d))
  }
  return { ready: cfReady(), target: CNAME_TARGET, domain: shown(d) }
})

export const addDomain = createServerFn({ method: 'POST' })
  .validator((d: { domain: string }) => ({ domain: String(d.domain ?? '').slice(0, 300) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    if (!cfReady()) return { error: 'off' as const }
    const host = cleanDomain(data.domain)
    if (!host) return { error: 'invalid' as const }
    if (isApex(host)) return { error: 'apex' as const, suggest: `www.${host}` }
    if (await mine(shop.id)) return { error: 'has' as const }
    if (!can(await shopPlan(shop.id), 'domain')) return { error: 'tembo' as const }
    if (await first('SELECT 1 FROM domains WHERE hostname = ?', host)) return { error: 'taken' as const }
    const key = `domain:${shop.id}`
    if (await overLimit(key, LIMITS.domainAdd)) return { error: 'limit' as const }
    await count(key)
    await run('INSERT INTO domains (hostname, shop_id, created_at) VALUES (?, ?, ?)', host, shop.id, now())
    const row = (await mine(shop.id))!
    // Cloudflare may be slow or down: the domain stays pending and the next check registers it.
    const d = await refreshDomain(row).catch((e) => (console.error('[domains]', e), row))
    return { ok: true as const, domain: shown(d) }
  })

export const checkDomain = createServerFn({ method: 'POST' }).handler(async () => {
  const { shop } = await requireShop()
  const d = await mine(shop.id)
  if (!d) return { domain: null }
  return { domain: shown(await refreshDomain(d).catch((e) => (console.error('[domains]', e), d))) }
})

/** Disconnects the domain: shopi.tz/<shop> keeps working as always. */
export const removeDomain = createServerFn({ method: 'POST' }).handler(async () => {
  const { shop } = await requireShop()
  const d = await mine(shop.id)
  if (d) await dropDomain(d)
  return { ok: true as const }
})
