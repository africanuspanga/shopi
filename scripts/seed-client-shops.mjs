/**
 * Seeds real seller shops from data folders kept outside this repo (a shop.json plus a photos/ folder).
 * Safe to run twice: ids and photo keys come from the shop's link and each product's key, so a second run
 * updates the same rows and keeps product links, views, stock held by orders and the seller's password.
 *
 *   node scripts/seed-client-shops.mjs <folder> [<folder> ...]            # local database and photo storage
 *   node scripts/seed-client-shops.mjs <folder> --remote                   # the live database and R2 bucket
 *   node scripts/seed-client-shops.mjs <folder> --logins <file.md>         # where passwords are kept
 *   node scripts/seed-client-shops.mjs <folder> --reupload                 # upload photos again (after wiping local state)
 *
 * shop.json: slug, name, owner {name, phone}, category, bio, location, hours, whatsapp, instagram, tiktok,
 * facebook, lipa {number, name, network, personal} or null, cod, areas [{name, fee}],
 * logo {file, crop: [x, y, w, h], background, pad}, products [{key, name, price, compare_price?, stock?,
 * sizes?: [{label, stock}], description, photos: ["file" | {file, fit: "pad"}]}].
 *
 * Each owner gets a temporary password, written to the logins file (default: LOGINS.local.md next to the
 * data folders) and never printed. An owner who already exists keeps their password.
 */
import { execFileSync } from 'node:child_process'
import { createHash, pbkdf2Sync, randomBytes, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const remote = args.includes('--remote')
const target = remote ? '--remote' : '--local'
const loginsAt = args.indexOf('--logins')
const reupload = args.includes('--reupload')
const folders = args.filter((a, i) => !a.startsWith('--') && (loginsAt < 0 || i !== loginsAt + 1)).map((f) => resolve(f))
if (!folders.length) {
  console.error('Usage: node scripts/seed-client-shops.mjs <folder> [<folder> ...] [--remote] [--logins <file.md>] [--reupload]')
  process.exit(1)
}
const LOGINS = loginsAt >= 0 ? resolve(args[loginsAt + 1]) : join(dirname(folders[0]), 'LOGINS.local.md')

/* ---------- The app's own rules ---------- */

// Read from src/lib/format.ts so the reserved words never drift from the app's.
const formatTs = readFileSync(join(APP, 'src/lib/format.ts'), 'utf8')
const wordSet = (name) => new Set([...formatTs.match(new RegExp(`${name} = new Set\\(\\[([^\\]]*)\\]`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
const RESERVED_SLUGS = wordSet('RESERVED_SLUGS')
const RESERVED_PRODUCT_SLUGS = wordSet('RESERVED_PRODUCT_SLUGS')
const CATEGORIES = new Set([...formatTs.matchAll(/\{ id: '([a-z]+)', label:/g)].map((m) => m[1]))
const NETWORKS = new Set([...formatTs.match(/NETWORKS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))

/** Same as productSlug() in src/lib/format.ts. */
function productSlug(name) {
  const out = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return out || 'product'
}

/** Same as normalizePhone() in src/lib/format.ts. */
function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '')
  if (/^0[67]\d{8}$/.test(digits)) return `+255${digits.slice(1)}`
  if (/^[67]\d{8}$/.test(digits)) return `+255${digits}`
  if (/^255[67]\d{8}$/.test(digits)) return `+${digits}`
  if (digits.length >= 9 && digits.length <= 15) return `+${digits}`
  return ''
}

/** Same format as hashPassword() in src/server/auth.ts. */
function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256')
  return `pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** An id in newId()'s alphabet, derived from a name so every run (and local and live) gets the same one. */
const stableId = (name, len = 16) =>
  Array.from(createHash('sha256').update(`rizk-seed:${name}`) /* keep this salt: changing it would give every seeded shop and product a new id */.digest().subarray(0, len), (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('')

/** Easy to type on a phone, about 70 bits: xxxx-xxxx-xxxx-xx with no 0/o/1/l/i. */
function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  const s = Array.from({ length: 14 }, () => a[randomInt(a.length)]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`
}

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

/* ---------- Wrangler ---------- */

const wrangler = (...a) => execFileSync('npx', ['wrangler', ...a], { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })
const query = (sql) => JSON.parse(wrangler('d1', 'execute', 'rizk', target, '--json', '--command', sql))[0].results

/* ---------- Checks ---------- */

function check(shop, dir) {
  const problems = []
  const need = (ok, what) => ok || problems.push(what)
  need(/^[a-z0-9-]{3,30}$/.test(shop.slug) && !RESERVED_SLUGS.has(shop.slug), `slug "${shop.slug}" is invalid or reserved`)
  need(shop.name && shop.name.length <= 60, 'name is empty or longer than 60')
  need(normalizePhone(shop.owner?.phone), 'owner phone is missing')
  need(CATEGORIES.has(shop.category), `category "${shop.category}" is not one of ${[...CATEGORIES].join(', ')}`)
  need((shop.bio ?? '').length <= 300, `bio is ${shop.bio?.length} characters (max 300)`)
  need((shop.location ?? '').length <= 200, 'location is longer than 200')
  need((shop.hours ?? '').length <= 100, 'hours are longer than 100')
  if (shop.lipa) need(NETWORKS.has(shop.lipa.network), `network "${shop.lipa.network}" is not one of ${[...NETWORKS].join(', ')}`)
  if (shop.logo) need(existsSync(join(dir, 'photos', shop.logo.file)), `logo ${shop.logo.file} is missing`)
  const keys = new Set()
  for (const p of shop.products) {
    need(p.key && !keys.has(p.key), `product key "${p.key}" is missing or repeated`)
    keys.add(p.key)
    need(p.name && p.name.length <= 100, `"${p.name}": name is empty or longer than 100`)
    need(Number.isInteger(p.price) && p.price > 0, `"${p.name}": price must be a whole number of shillings`)
    need(p.compare_price == null || p.compare_price > p.price, `"${p.name}": old price must be higher than the price`)
    need((p.description ?? '').length <= 2000, `"${p.name}": description is ${p.description?.length} characters (max 2000)`)
    need((p.photos ?? []).length <= 6, `"${p.name}": ${p.photos.length} photos (max 6)`)
    for (const ph of p.photos ?? []) need(existsSync(join(dir, 'photos', ph.file ?? ph)), `"${p.name}": photo ${ph.file ?? ph} is missing`)
  }
  if (problems.length) {
    console.error(`${basename(dir)}/shop.json:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
}

/* ---------- Photos ---------- */

/** The mean colour of the two edges a photo is extended from (top and bottom, or left and right), to pad it without a seam. */
async function edgeColour(img, w, h, vertical) {
  const t = Math.max(1, Math.round(Math.min(w, h) * 0.02))
  const strips = vertical
    ? [{ left: 0, top: 0, width: w, height: t }, { left: 0, top: h - t, width: w, height: t }]
    : [{ left: 0, top: 0, width: t, height: h }, { left: w - t, top: 0, width: t, height: h }]
  // stats() reads the input, not the extract, so each strip is cut out first.
  const stats = async (s) => (await sharp(await sharp(img).extract(s).toBuffer()).stats()).channels.slice(0, 3).map((c) => c.mean)
  const means = await Promise.all(strips.map(stats))
  const [r, g, b] = [0, 1, 2].map((i) => Math.round(means.reduce((sum, m) => sum + m[i], 0) / means.length))
  return { r, g, b }
}

/**
 * A product photo as WebP, at most 1600 px. `fit: "pad"` widens or heightens it to 4:5 with its own edge colour,
 * for product shots on a plain ground that the app's 4:5 frame would otherwise cut.
 */
async function productPhoto(file, fit) {
  let img = await sharp(file).rotate().flatten({ background: '#ffffff' }).toBuffer()
  if (fit === 'pad') {
    const { width: w, height: h } = await sharp(img).metadata()
    const W = Math.max(w, Math.round((h * 4) / 5))
    const H = Math.max(h, Math.round((w * 5) / 4))
    const background = await edgeColour(img, w, h, H > h)
    const [left, top] = [Math.floor((W - w) / 2), Math.floor((H - h) / 2)]
    img = await sharp(img).extend({ left, right: W - w - left, top, bottom: H - h - top, background }).toBuffer()
  }
  return sharp(img).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
}

/** The shop's mark cut from its logo, centred on a square so the round avatar never clips it. */
async function logoPhoto(file, { crop, background = '#ffffff', pad = 0.15 }) {
  let img = sharp(file).rotate()
  if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] })
  const buf = await img.flatten({ background }).toBuffer()
  const { width: w, height: h } = await sharp(buf).metadata()
  const side = Math.round(Math.max(w, h) * (1 + 2 * pad))
  const [left, top] = [Math.floor((side - w) / 2), Math.floor((side - h) / 2)]
  return sharp(buf)
    .extend({ left, right: side - w - left, top, bottom: side - h - top, background })
    .resize(512, 512)
    .webp({ quality: 85 })
    .toBuffer()
}

/* ---------- Logins ---------- */

function readLogins() {
  if (!existsSync(LOGINS)) return new Map()
  const rows = readFileSync(LOGINS, 'utf8').matchAll(/^\| (.+?) \| (\S+) \| (\+\d+) \| (\S+) \|$/gm)
  return new Map([...rows].map((m) => [m[3], { shop: m[1], link: m[2], phone: m[3], password: m[4] }]))
}

function writeLogins(logins) {
  const rows = [...logins.values()].map((l) => `| ${l.shop} | ${l.link} | ${l.phone} | ${l.password} |`)
  writeFileSync(
    LOGINS,
    `# Client shop logins (private: never commit, never paste in a chat)

Temporary passwords made by \`app/scripts/seed-client-shops.mjs\`. Log in at https://rizktz.store/login with the phone
and password. Shopi has no password reset or change yet, so hand each login only to its owner.
The same login works on the local copy (http://localhost:3000/login) after a local seed.

| Shop | Link | Phone (login) | Password |
| --- | --- | --- | --- |
${rows.join('\n')}
`,
  )
}

/* ---------- Seed one shop ---------- */

async function seed(dir, logins) {
  const shop = JSON.parse(readFileSync(join(dir, 'shop.json'), 'utf8'))
  check(shop, dir)
  const phone = normalizePhone(shop.owner.phone)
  const userId = stableId(`user:${phone}`)
  const shopId = stableId(`shop:${shop.slug}`)
  const build = join(dir, '.build')
  mkdirSync(build, { recursive: true })

  // Never take over a link or a phone number someone else already uses.
  const [slugOwner] = query(`SELECT id, owner_id FROM shops WHERE slug = ${q(shop.slug)}`)
  if (slugOwner && slugOwner.id !== shopId) throw new Error(`shopi.tz/${shop.slug} already belongs to another shop (${slugOwner.id})`)
  const [phoneUser] = query(`SELECT id FROM users WHERE phone = ${q(phone)}`)
  if (phoneUser && phoneUser.id !== userId) throw new Error(`${phone} already has an account (${phoneUser.id}); seed by hand or ask the owner`)
  const [ownShop] = query(`SELECT id FROM shops WHERE owner_id = ${q(userId)} AND id != ${q(shopId)}`)
  if (ownShop) throw new Error(`${phone} already owns another shop (${ownShop.id})`)

  let login = logins.get(phone)
  if (!login) {
    login = { password: tempPassword() }
    logins.set(phone, login)
  }
  Object.assign(login, { shop: shop.name, link: `rizktz.store/${shop.slug}`, phone })
  writeLogins(logins)

  /* Photos: convert, then upload the ones this target doesn't have yet. A key comes from the file's bytes, so a
     changed photo gets a new link and never meets a cached old one (the app serves photos as immutable). */
  const uploads = []
  const store = (webp) => {
    const key = `s/${shopId}/${stableId(`img:${createHash('sha256').update(webp).digest('hex')}`, 12)}.webp`
    const out = join(build, basename(key))
    if (!existsSync(out)) writeFileSync(out, webp)
    uploads.push([key, out])
    return key
  }
  const logoKey = shop.logo ? store(await logoPhoto(join(dir, 'photos', shop.logo.file), shop.logo)) : null
  const products = []
  for (const p of shop.products) {
    const images = []
    for (const ph of p.photos ?? []) images.push(store(await productPhoto(join(dir, 'photos', ph.file ?? ph), ph.fit ?? 'none')))
    products.push({ ...p, id: stableId(`product:${shop.slug}:${p.key}`), images })
  }
  const doneFile = join(build, `uploaded${remote ? '-remote' : '-local'}.json`)
  const done = new Set(!reupload && existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, 'utf8')) : [])
  for (const [key, file] of uploads) {
    if (done.has(key)) continue
    wrangler('r2', 'object', 'put', `rizk-media/${key}`, target, '--file', file, '--content-type', 'image/webp')
    done.add(key)
    writeFileSync(doneFile, JSON.stringify([...done], null, 1))
  }

  /* Product links: kept once set, otherwise unique within the shop, as in saveProduct(). */
  const existing = query(`SELECT id, slug FROM products WHERE shop_id = ${q(shopId)}`)
  const slugOf = new Map(existing.map((r) => [r.id, r.slug]))
  const taken = new Set(existing.filter((r) => r.slug && !products.some((p) => p.id === r.id)).map((r) => r.slug))
  for (const p of products) {
    let slug = slugOf.get(p.id)
    if (!slug) {
      const base = productSlug(p.name)
      slug = base
      for (let i = 2; taken.has(slug) || RESERVED_PRODUCT_SLUGS.has(slug); i++) slug = `${base}-${i}`
    }
    taken.add(slug)
    p.slug = slug
  }

  /* Rows */
  const t = Date.now()
  const lipa = shop.lipa ?? { number: '', name: '', network: '', personal: false }
  const sql = [
    `INSERT INTO users (id, phone, name, pass_hash, created_at) VALUES (${q(userId)}, ${q(phone)}, ${q(shop.owner.name)}, ${q(hashPassword(login.password))}, ${t})
     ON CONFLICT(id) DO UPDATE SET name = excluded.name;`,
    `INSERT INTO shops (id, owner_id, slug, name, bio, category, logo_key, whatsapp, instagram, tiktok, facebook, location, hours,
       lipa_number, lipa_name, lipa_network, lipa_is_personal, cod_enabled, created_at)
     VALUES (${[shopId, userId, shop.slug, shop.name, shop.bio ?? '', shop.category, logoKey, normalizePhone(shop.whatsapp) || phone,
       (shop.instagram ?? '').replace(/^@/, ''), (shop.tiktok ?? '').replace(/^@/, ''), shop.facebook ?? '', shop.location ?? '', shop.hours ?? '',
       lipa.number.replace(/\s+/g, ''), lipa.name, lipa.network, lipa.personal ? 1 : 0, shop.cod === false ? 0 : 1, t].map(q).join(', ')})
     ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, bio = excluded.bio, category = excluded.category,
       logo_key = excluded.logo_key, whatsapp = excluded.whatsapp, instagram = excluded.instagram, tiktok = excluded.tiktok,
       facebook = excluded.facebook, location = excluded.location, hours = excluded.hours, lipa_number = excluded.lipa_number,
       lipa_name = excluded.lipa_name, lipa_network = excluded.lipa_network, lipa_is_personal = excluded.lipa_is_personal,
       cod_enabled = excluded.cod_enabled;`,
    `DELETE FROM delivery_areas WHERE shop_id = ${q(shopId)};`,
    ...(shop.areas ?? []).map(
      (a, i) => `INSERT INTO delivery_areas (id, shop_id, name, fee, sort) VALUES (${q(stableId(`area:${shop.slug}:${a.name}`))}, ${q(shopId)}, ${q(a.name)}, ${a.fee}, ${i});`,
    ),
    // The shop's first product is newest, so the storefront (newest first) keeps the seller's order.
    ...products.map((p, i) => {
      const sizes = p.sizes?.length ? JSON.stringify(p.sizes) : null
      const stock = p.sizes?.length ? p.sizes.reduce((s, x) => (s == null || x.stock == null ? null : s + x.stock), 0) : (p.stock ?? null)
      return `INSERT INTO products (id, shop_id, slug, name, description, price, compare_price, stock, sizes, images, active, created_at)
        VALUES (${[p.id, shopId, p.slug, p.name, p.description ?? '', p.price, p.compare_price ?? null, stock, sizes, JSON.stringify(p.images), 1, t - i * 1000].map(q).join(', ')})
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, price = excluded.price,
          compare_price = excluded.compare_price, stock = excluded.stock, sizes = excluded.sizes, images = excluded.images;`
    }),
  ]
  const sqlFile = join(build, `seed${remote ? '-remote' : '-local'}.sql`)
  writeFileSync(sqlFile, sql.join('\n'))
  wrangler('d1', 'execute', 'rizk', target, '--yes', '--file', sqlFile)

  const photos = products.reduce((s, p) => s + p.images.length, 0)
  console.log(`${shop.name}: /${shop.slug} · ${products.length} products · ${photos} photos${logoKey ? ' + logo' : ''} · ${(shop.areas ?? []).length} delivery areas · ${remote ? 'live' : 'local'}`)
}

const logins = readLogins()
for (const dir of folders) await seed(dir, logins)
console.log(`Logins: ${LOGINS} (not printed)`)
