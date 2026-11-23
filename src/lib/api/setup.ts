import { createServerFn } from '@tanstack/react-start'
import { requireShop, requireUser } from '#/server/auth'
import { all, first, run } from '#/server/db'
import { passStep } from '#/server/setup'
import { removePhotos } from '#/server/media'
import { aiReady } from '#/server/ai'
import { NETWORKS, normalizePhone, parseSizes, type Size } from '#/lib/format'
import { SETUP_STEPS, nextSetupStep, type SetupOutcome } from '#/lib/setup'
import { parseBook } from '#/lib/booking'
import { parseBill, type Currency } from '#/lib/invoice'
import { INVOICE_COLS, readInvoice, type InvoiceRow } from '#/server/invoices'

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
  /** 'products', 'services' or 'invoices': what the business chose at step 1. */
  kind: string
  book: string | null
  /** Invoice settings (src/lib/invoice.ts, `BillSettings`) and the TIN, for a business that sends invoices. */
  bill: string | null
  tin: string
}

export type SetupProduct = { id: string; name: string; price: number; image: string | null }
/** A service as the setup's form edits it when step 2 is opened again with Back (the same fields as `MyService`). */
export type SetupService = {
  id: string; name: string; description: string; duration: number; price: number; price_from: number; by_name: string; images: string[]
  active: number; sort: number; created_at: number; upcoming: number
}
/** The newest product in full, for step 2 opened again with Back: what its form shows, and the rest to hand back untouched. */
export type SetupEdit = { id: string; name: string; description: string; price: number; compare_price: number | null; stock: number | null; images: string[]; sizes: Size[] | null; option_name: string | null }
/** The business's first invoice, for "Your first invoice is ready" (step 4 of a business that sends invoices). */
export type SetupInvoice = { id: string; code: string; number: number; client: string; phone: string; what: string; total: number; currency: Currency; due_day: string | null; lang: string; sent: boolean }

/** Where the seller is in the setup, and what the preview shows. No shop yet means step 1. */
export const getSetup = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  const shop = await first<SetupShop>(
    `SELECT id, slug, name, category, logo_key, lang, whatsapp, bio, location, lipa_number, lipa_network, lipa_name, cod_enabled, setup_step, kind, book, bill, tin
     FROM shops WHERE owner_id = ? LIMIT 1`,
    user.id,
  )
  if (!shop) return { step: 1, shop: null, products: [] as SetupProduct[], services: [] as SetupService[], editing: null as SetupEdit | null, invoice: null as SetupInvoice | null, ai: aiReady() }
  const rows = await all<{ id: string; name: string; price: number; images: string; description: string; compare_price: number | null; stock: number | null; sizes: string | null; option_name: string | null }>(
    'SELECT id, name, price, images, description, compare_price, stock, sizes, option_name FROM products WHERE shop_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 4',
    shop.id,
  )
  // Products buyers can see: an import of rows without photos leaves them hidden, and step 2 still asks for one.
  const count = await first<{ n: number }>('SELECT COUNT(*) n FROM products WHERE shop_id = ? AND active = 1', shop.id)
  const products = rows.map((p) => ({ id: p.id, name: p.name, price: p.price, image: (JSON.parse(p.images) as string[])[0] ?? null }))
  const services = (
    await all<Omit<SetupService, 'images' | 'upcoming'> & { images: string }>(
      'SELECT id, name, description, duration, price, price_from, by_name, images, active, sort, created_at FROM services WHERE shop_id = ? AND active = 1 ORDER BY sort, created_at LIMIT 4',
      shop.id,
    )
  ).map((v): SetupService => ({ ...v, images: JSON.parse(v.images) as string[], upcoming: 0 }))
  const invoices = (await first<{ n: number }>('SELECT COUNT(*) n FROM invoices WHERE shop_id = ?', shop.id))?.n ?? 0
  const bill = parseBill(shop.bill)
  // A business that sends invoices: its first one, so "Your first invoice is ready" can show it and send it again
  // after a reload or a step back.
  let invoice: SetupInvoice | null = null
  if (shop.kind === 'invoices' && invoices) {
    const r = await first<InvoiceRow>(`SELECT ${INVOICE_COLS} FROM invoices i WHERE i.shop_id = ? AND i.kind = 'invoice' AND i.status != 'cancelled' ORDER BY i.created_at LIMIT 1`, shop.id)
    if (r) {
      const i = readInvoice(r)
      invoice = { id: i.id, code: i.code, number: i.number, client: i.client.company || i.client.name, phone: i.client.phone, what: i.lines[0]?.name ?? '', total: i.total, currency: i.currency, due_day: i.due_day, lang: i.lang, sent: i.status !== 'draft' }
    }
  }
  const newest = rows[0]
  return {
    step: nextSetupStep({
      setup: shop.setup_step, products: count?.n ?? 0, lipa: !!shop.lipa_number, kind: shop.kind, services: services.length, hours: !!parseBook(shop.book),
      bill: !!bill, bank: !!bill?.bank, invoices,
    }),
    shop,
    products,
    services,
    editing: newest
      ? ({ id: newest.id, name: newest.name, description: newest.description, price: newest.price, compare_price: newest.compare_price, stock: newest.stock, images: JSON.parse(newest.images) as string[], sizes: parseSizes(newest.sizes), option_name: newest.option_name } satisfies SetupEdit)
      : null,
    invoice,
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

/**
 * The business's logo, from the setup of a business that sends invoices ("How you look on invoices"): it prints at
 * the top of every invoice. Saved at once, like the bio; Shop settings changes it with everything else. Only one of
 * this shop's own uploads is accepted, and a logo it replaces leaves storage.
 */
export const saveShopLogo = createServerFn({ method: 'POST' })
  .validator((d: { key: string | null }) => ({ key: d?.key ? String(d.key).slice(0, 100) : null }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    if (data.key && !data.key.startsWith(`s/${shop.id}/`)) return { error: 'key' as const }
    const before = await first<{ logo_key: string | null }>('SELECT logo_key FROM shops WHERE id = ?', shop.id)
    await run('UPDATE shops SET logo_key = ? WHERE id = ?', data.key, shop.id)
    if (before?.logo_key && before.logo_key !== data.key) await removePhotos(shop.id, [before.logo_key])
    return { ok: true as const }
  })
