import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { readPicks, writePicks } from '#/server/picks'

/** The seller's top picks, as product ids in their order (the product form needs to know whether there is room). */
export const getMyPicks = createServerFn({ method: 'GET' }).handler(async () => {
  const { shop } = await requireShop()
  return readPicks(shop.id)
})

/** Replace the seller's top picks with these products, in this order (up to four). Answers with what was saved. */
export const savePicks = createServerFn({ method: 'POST' })
  .validator((d: { ids: string[] }) => ({ ids: Array.isArray(d?.ids) ? d.ids.slice(0, 10).map(String) : [] }))
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    return { ok: true as const, ids: await writePicks(shop.id, data.ids) }
  })
