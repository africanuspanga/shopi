import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { all, first } from '#/server/db'
import { shopPlan } from '#/server/plan'
import { aiAllowance, aiReady, bioLeft, recordUse, writeBio, writeDescription } from '#/server/ai'
import { CATEGORIES, OPTION_KINDS, optionKind } from '#/lib/format'
import { asLang } from '#/lib/i18n'

/** AI for the logged-in seller (src/server/ai.ts). */

/** Whether "Write it for me" shows, and how many a free shop has left this month. */
export const getAiAllowance = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop('products')
  return aiAllowance(shop.id, await shopPlan(shop.id))
})

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

/** A description for the product being edited, in the shop's language. Nothing is saved: it fills the form. */
export const writeProductDescription = createServerFn({ method: 'POST' })
  .validator((d: { name: string; notes?: string; option?: string; options?: string[] }) => ({
    name: str(d?.name, 120),
    notes: str(d?.notes, 1000),
    option: str(d?.option, 20),
    options: Array.isArray(d?.options) ? d.options.map((o) => str(o, 30)).filter(Boolean).slice(0, 30) : [],
  }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('products')
    if (!data.name) return { error: 'name' as const }
    const allowance = await aiAllowance(shop.id, await shopPlan(shop.id))
    if (!allowance.ready) return { error: 'off' as const }
    if (allowance.left === 0) return { error: 'limit' as const, left: 0 }
    if (allowance.busy) return { error: 'busy' as const }
    const s = await first<{ name: string; category: string; location: string; lang: string }>('SELECT name, category, location, lang FROM shops WHERE id = ?', shop.id)
    const category = CATEGORIES.find((c) => c.id === s?.category)?.label ?? 'products'
    const option = optionKind(data.option)
    try {
      const out = await writeDescription({
        name: data.name,
        notes: data.notes,
        option: OPTION_KINDS[option].label.toLowerCase(),
        options: data.options,
        shop: { name: s?.name ?? shop.name, category: category.toLowerCase(), location: s?.location ?? '', lang: asLang(s?.lang) },
      })
      if (!out.text) return { error: 'failed' as const }
      await recordUse(shop.id, 'description', out.tokens)
      return { text: out.text, left: allowance.left === null ? null : allowance.left - 1 }
    } catch (e) {
      console.error('[ai] description failed', e instanceof Error ? e.message : e)
      return { error: 'failed' as const }
    }
  })

/**
 * The line under the shop's name, in the shop's language, from its name, category, location and products (setup step 4,
 * Shop settings). What the seller already typed is taken as facts. Nothing is saved: it fills the field.
 */
export const writeShopBio = createServerFn({ method: 'POST' })
  .validator((d: { notes?: string }) => ({ notes: str(d?.notes, 300) }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop('manage')
    if (!aiReady()) return { error: 'off' as const }
    if ((await bioLeft(shop.id)) === 0) return { error: 'limit' as const }
    const s = await first<{ name: string; category: string; location: string; lang: string }>('SELECT name, category, location, lang FROM shops WHERE id = ?', shop.id)
    const products = await all<{ name: string }>('SELECT name FROM products WHERE shop_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 5', shop.id)
    // With nothing but a category, models invent who the shop is for and how cheap it is (18 Nov, in Swahili): ask
    // the seller for a few words, or a product, first.
    if (!products.length && !data.notes) return { error: 'facts' as const }
    const category = CATEGORIES.find((c) => c.id === s?.category)?.label ?? 'products'
    try {
      const out = await writeBio({
        name: s?.name ?? shop.name,
        category: category.toLowerCase(),
        location: s?.location ?? '',
        products: products.map((p) => p.name),
        notes: data.notes,
        lang: asLang(s?.lang),
      })
      if (!out.text) return { error: 'failed' as const }
      await recordUse(shop.id, 'bio', out.tokens)
      return { text: out.text }
    } catch (e) {
      console.error('[ai] bio failed', e instanceof Error ? e.message : e)
      return { error: 'failed' as const }
    }
  })
