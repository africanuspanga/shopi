import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { first } from '#/server/db'
import { shopPlan } from '#/server/plan'
import { aiAllowance, recordUse, writeDescription } from '#/server/ai'
import { CATEGORIES, OPTION_KINDS, optionKind } from '#/lib/format'
import { asLang } from '#/lib/i18n'

/** AI for the logged-in seller (src/server/ai.ts). */

/** Whether "Write it for me" shows, and how many a free shop has left this month. */
export const getAiAllowance = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
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
    const { shop } = await requireShop()
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
