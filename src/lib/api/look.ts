import { createServerFn } from '@tanstack/react-start'
import { requireShop } from '#/server/auth'
import { first, run } from '#/server/db'
import { removePhotos } from '#/server/media'
import { MOTO, asFont, cleanHex } from '#/lib/theme'

/**
 * Saves a shop's look: colour (any #rrggbb; the readability rules are applied where it is shown, src/lib/theme.ts),
 * the style of its name and headings, and the cover photo. Shopi orange and the clean style are stored as NULL,
 * so a shop that never chose keeps following Shopi's defaults. A replaced cover leaves storage.
 */
export const saveShopLook = createServerFn({ method: 'POST' })
  .validator((d: { color: string | null; font: string; cover: string | null }) => d)
  .handler(async ({ data }) => {
    const { shop } = await requireShop()
    const color = cleanHex(data.color)
    const font = asFont(data.font)
    const cover = typeof data.cover === 'string' && data.cover.startsWith(`s/${shop.id}/`) ? data.cover.slice(0, 100) : null
    const before = await first<{ cover_key: string | null }>('SELECT cover_key FROM shops WHERE id = ?', shop.id)
    await run(
      'UPDATE shops SET theme_color = ?, theme_font = ?, cover_key = ? WHERE id = ?',
      color && color !== MOTO ? color : null,
      font === 'clean' ? null : font,
      cover,
      shop.id,
    )
    if (before?.cover_key && before.cover_key !== cover) await removePhotos(shop.id, [before.cover_key])
    return { ok: true as const }
  })
