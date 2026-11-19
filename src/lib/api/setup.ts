import { createServerFn } from '@tanstack/react-start'
import { requireShop, requireUser } from '#/server/auth'
import { all, first, run } from '#/server/db'
import { passStep } from '#/server/setup'
import { aiReady } from '#/server/ai'
import { NETWORKS, normalizePhone } from '#/lib/format'
import { SETUP_STEPS, nextSetupStep, type SetupOutcome } from '#/lib/setup'
import { parseBook } from '#/lib/booking'

/** The five-step setup's server side (src/lib/setup.ts, src/routes/onboard.tsx). */

export type SetupShop = {
  id: string
  slug: string
  name: string
  category: string
  logo_key: string | null
  lang: string
  whatsapp: string
  bio: string
  location: string
  lipa_number: string
  lipa_network: string
  lipa_name: string
  cod_enabled: number
  setup_step: number | null
  /** 'products' or 'services': what the business chose at step 1. */
  kind: string
  book: string | null
}

export type SetupProduct = { id: string; name: string; price: number; image: string | null }
export type SetupService = { id: string; name: string; duration: number; price: number; price_from: number }

/** Where the seller is in the setup, and what the preview shows. No shop yet means step 1. */
export const getSetup = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  const shop = await first<SetupShop>(
    `SELECT id, slug, name, category, logo_key, lang, whatsapp, bio, location, lipa_number, lipa_network, lipa_name, cod_enabled, setup_step, kind, book
     FROM shops WHERE owner_id = ? LIMIT 1`,
    user.id,
  )
  if (!shop) return { step: 1, shop: null, products: [] as SetupProduct[], services: [] as SetupService[], ai: aiReady() }
  const rows = await all<{ id: string; name: string; price: number; images: string }>(
    'SELECT id, name, price, images FROM products WHERE shop_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 4',
    shop.id,
  )
  // Products buyers can see: an import of rows without photos leaves them hidden, and step 2 still asks for one.
  const count = await first<{ n: number }>('SELECT COUNT(*) n FROM products WHERE shop_id = ? AND active = 1', shop.id)
  const products = rows.map((p) => ({ id: p.id, name: p.name, price: p.price, image: (JSON.parse(p.images) as string[])[0] ?? null }))
  const services = await all<SetupService>('SELECT id, name, duration, price, price_from FROM services WHERE shop_id = ? AND active = 1 ORDER BY sort, created_at LIMIT 4', shop.id)
  return {
    step: nextSetupStep({ setup: shop.setup_step, products: count?.n ?? 0, lipa: !!shop.lipa_number, kind: shop.kind, services: services.length, hours: !!parseBook(shop.book) }),
    shop,
    products,
    services,
    ai: aiReady(),
  }
})

const seconds = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 3600) : null
}

/** A step passed: done (what it asked is saved) or skipped ("I'll do this later"). */
export const passSetupStep = createServerFn({ method: 'POST' })
  .validator((d: { step: number; outcome: SetupOutcome; seconds?: number }) => ({
    step: Math.round(Number(d?.step)),
    outcome: d?.outcome === 'skip' ? ('skip' as const) : ('done' as const),
    seconds: seconds(d?.seconds),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    if (!(data.step >= 2 && data.step <= SETUP_STEPS)) return { error: 'step' as const }
    await passStep(shop.id, data.step, data.outcome, data.seconds)
    return { ok: true as const }
  })

/**
 * Step 3: the Lipa Namba (or a mobile money number) buyers pay to. Cash on delivery stays as it is (on by default). A
 * number that reads as a Tanzanian phone number is marked personal, as the switch in Shop settings would.
 */
export const saveSetupPayment = createServerFn({ method: 'POST' })
  .validator((d: { network: string; number: string; name: string; seconds?: number }) => ({
    network: NETWORKS.includes(String(d?.network)) ? String(d.network) : '',
    number: String(d?.number ?? '').replace(/[^\d+]/g, '').slice(0, 20),
    name: String(d?.name ?? '').trim().slice(0, 80),
    seconds: seconds(d?.seconds),
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    if (!data.network) return { error: 'network' as const }
    if (data.number.replace(/\D/g, '').length < 4) return { error: 'number' as const }
    if (!data.name) return { error: 'name' as const }
    const digits = data.number.replace(/\D/g, '')
    const personal = /^(0|255)?[67]\d{8}$/.test(digits) && !!normalizePhone(digits)
    await run(
      'UPDATE shops SET lipa_network = ?, lipa_number = ?, lipa_name = ?, lipa_is_personal = ? WHERE id = ?',
      data.network,
      digits,
      data.name,
      personal ? 1 : 0,
      shop.id,
    )
    await passStep(shop.id, 3, 'done', data.seconds)
    return { ok: true as const }
  })

/** The shop's line under its name (step 4, and Shop settings saves it with everything else). */
export const saveShopBio = createServerFn({ method: 'POST' })
  .validator((d: { bio: string }) => ({ bio: String(d?.bio ?? '').trim().slice(0, 300) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    await run('UPDATE shops SET bio = ? WHERE id = ?', data.bio, shop.id)
    return { ok: true as const }
  })
