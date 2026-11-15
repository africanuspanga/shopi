import { env } from 'cloudflare:workers'
import { SITE_KEY } from '#/lib/turnstile'

/**
 * Cloudflare's API, for shops' own domains: custom hostnames on the shopi.tz zone (Cloudflare for SaaS: Cloudflare
 * issues the certificate once the seller's CNAME points at customers.shopi.tz) and the hostnames the bot check's widget
 * accepts. Needs the CF_API_TOKEN secret (src/env.d.ts); `cfReady()` is false without it.
 */

const API = 'https://api.cloudflare.com/client/v4'
export const cfReady = () => !!env.CF_API_TOKEN && !!env.CF_ACCOUNT_ID

export class CfError extends Error {
  constructor(public codes: number[], message: string) {
    super(message)
  }
}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json().catch(() => null)) as { success: boolean; errors?: { code: number; message: string }[]; result: T } | null
  if (!body?.success) {
    const errors = body?.errors ?? []
    throw new CfError(errors.map((e) => e.code), errors.map((e) => e.message).join('; ') || `cloudflare ${res.status}`)
  }
  return body.result
}

let zoneId: string | null = null
async function zone() {
  if (!zoneId) zoneId = (await cf<{ id: string }[]>('/zones?name=shopi.tz'))[0]?.id ?? null
  if (!zoneId) throw new CfError([], 'zone shopi.tz not found')
  return zoneId
}

export type CustomHostname = {
  id: string
  hostname: string
  /** 'pending', 'active', 'moved', 'blocked', 'deleted'… */
  status: string
  ssl?: { status: string; validation_errors?: { message: string }[] }
  verification_errors?: string[]
}

/** Asks Cloudflare to serve `hostname` and issue its certificate once the CNAME is in place (HTTP validation). */
export async function createHostname(hostname: string) {
  try {
    return await cf<CustomHostname>(`/zones/${await zone()}/custom_hostnames`, {
      method: 'POST',
      body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } }),
    })
  } catch (e) {
    // Already there (a retry after a dropped answer): use it.
    const found = await cf<CustomHostname[]>(`/zones/${await zone()}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`).catch(() => [])
    if (found[0]) return found[0]
    throw e
  }
}

export const getHostname = async (id: string) => cf<CustomHostname>(`/zones/${await zone()}/custom_hostnames/${id}`)

export async function deleteHostname(id: string) {
  await cf(`/zones/${await zone()}/custom_hostnames/${id}`, { method: 'DELETE' }).catch((e) => {
    if (!(e instanceof CfError && e.codes.includes(1436))) throw e // 1436: not found, already gone
  })
}

/** Turnstile's free plan: 10 hostnames per widget, shopi.tz included. */
const WIDGET_HOSTS = 10

/** Adds or removes a hostname on the bot check's widget. 'full' when there is no room left for one more. */
export async function widgetHost(hostname: string, add: boolean): Promise<'ok' | 'full'> {
  const path = `/accounts/${env.CF_ACCOUNT_ID}/challenges/widgets/${SITE_KEY}`
  const w = await cf<{ name: string; mode: string; domains: string[] }>(path)
  const domains = add ? [...new Set([...w.domains, hostname])] : w.domains.filter((d) => d !== hostname)
  if (domains.length === w.domains.length && domains.every((d) => w.domains.includes(d))) return 'ok'
  if (domains.length > WIDGET_HOSTS) return 'full'
  await cf(path, { method: 'PUT', body: JSON.stringify({ name: w.name, mode: w.mode, domains }) })
  return 'ok'
}
