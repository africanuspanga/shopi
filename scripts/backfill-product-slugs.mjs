/**
 * Gives every product without a readable link name one (migration 0003): "Gauni la Jua" -> /zee-store/gauni-la-jua.
 * Names already set are kept. Safe to run again.
 *
 *   node scripts/backfill-product-slugs.mjs            # local database
 *   node scripts/backfill-product-slugs.mjs --remote   # the live database
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const where = process.argv.includes('--remote') ? '--remote' : '--local'
const d1 = (sql) =>
  JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'rizk', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results

// Same rules as productSlug() and RESERVED_PRODUCT_SLUGS in src/lib/format.ts
const RESERVED = new Set(['checkout', 'p', 'bag', 'cart', 'order', 'orders', 'about'])
const slugOf = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'product'

const rows = d1('SELECT id, shop_id, name, slug FROM products ORDER BY created_at')
const taken = new Map()
for (const r of rows) if (r.slug) (taken.get(r.shop_id) ?? taken.set(r.shop_id, new Set()).get(r.shop_id)).add(r.slug)
const updates = []
for (const r of rows.filter((x) => !x.slug)) {
  const used = taken.get(r.shop_id) ?? taken.set(r.shop_id, new Set()).get(r.shop_id)
  const base = slugOf(r.name)
  let slug = base
  for (let i = 2; used.has(slug) || RESERVED.has(slug); i++) slug = `${base}-${i}`
  used.add(slug)
  updates.push(`UPDATE products SET slug = '${slug}' WHERE id = '${r.id}';`)
}
if (!updates.length) {
  console.log('Every product already has a link name.')
} else {
  const dir = join(process.cwd(), '.demo')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'product-slugs.sql')
  writeFileSync(file, updates.join('\n'))
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'rizk', where, '--file', file], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log(`Gave ${updates.length} products a link name (${where.slice(2)}).`)
}
