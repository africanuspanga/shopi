/**
 * Gives the sample shop "Zee's Store" six months of history, after it was onboarded by hand through the UI.
 * It keeps the real account, shop settings, products and photos, and only fills in the past (and today so far):
 * the shop's start date, when each dress was added, visits, orders, taps and shares.
 *
 * Visits follow Analytics v2: each visit is a session from one visitor (some come back), from one source
 * (Instagram, TikTok, WhatsApp...), sometimes through a tagged link, on a phone, mostly in Dar. Each order comes from a
 * visit that looked at the dress, added it to the bag and started checkout, so the funnel adds up.
 * Everything here is fictional. Safe to run again: it replaces what it made last time.
 *
 *   node scripts/seed-zee-history.mjs                 # local database, six months
 *   node scripts/seed-zee-history.mjs --days 90       # a shorter history
 *   node scripts/seed-zee-history.mjs --remote        # the live database (Zee's Store is a public sample there)
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SLUG = 'zee-store'
const remote = process.argv.includes('--remote')
const where = remote ? '--remote' : '--local'
const daysAt = process.argv.indexOf('--days')
const OUT = join(process.cwd(), '.demo')
mkdirSync(OUT, { recursive: true })

const d1 = (sql) =>
  JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'shopi', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results

let [shop] = d1(`SELECT id, owner_id, slug FROM shops WHERE slug IN ('${SLUG}', 'zeestore') OR name = 'Zee''s Store' LIMIT 1`)
if (!shop) throw new Error("Zee's Store not found. Onboard it through the UI first.")
const products = d1(`SELECT id, name, price, images FROM products WHERE shop_id = '${shop.id}' ORDER BY created_at`)
const areas = d1(`SELECT name, fee FROM delivery_areas WHERE shop_id = '${shop.id}' ORDER BY sort`)

const DAY = 86400_000
const NOW = Date.now()
const TZ = 3 * 3600_000
const startOfToday = Math.floor((NOW + TZ) / DAY) * DAY - TZ
const DAYS = daysAt > 0 ? Math.max(14, Number(process.argv[daysAt + 1]) || 182) : 182
// Dates below are written for six months; a shorter history keeps them in proportion.
const ago = (days) => Math.max(1, Math.round((days * DAYS) / 182))

let seed = 20261108
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (a) => a[Math.floor(rand() * a.length)]
const between = (a, b) => a + Math.floor(rand() * (b - a + 1))
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0)
  for (const [v, w] of pairs) if ((r -= w) < 0) return v
  return pairs[0][0]
}
const id = (p = 'zh') => p + Array.from({ length: 14 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand() * 36)]).join('')
const uuid = () => Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')
const code = () => Array.from({ length: 6 }, () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(rand() * 32)]).join('')
const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

// The first six dresses were there at launch; the rest arrived as the shop grew (days ago).
const ADDED = { 'Gauni la Lulu (Lace nyeupe)': 128, 'Kaftani ya Bahari': 95, 'Gauni la Anga (Bodycon)': 61, 'Gauni la Jua': 27 }
// Some dresses simply sell better.
const POPULAR = { 'Gauni la Zumaridi': 3, 'Gauni fupi la Kariakoo': 3, 'Gauni la Anga (Bodycon)': 2.5, 'Gauni la Moto (Strapless)': 2, 'Gauni la Jua': 2 }
// Sizes per dress, with stock per size. The kaftan is one size.
const SIZE_RUNS = {
  'Kaftani ya Bahari': [['Free size', 4]],
  'Gauni la Lulu (Lace nyeupe)': [['S', 1], ['M', 2], ['L', 0]],
  'Gauni la Anga (Bodycon)': [['S', 3], ['M', 4], ['L', 3]],
  'Gauni la Moto (Strapless)': [['S', 2], ['M', 4], ['L', 3]],
  'Gauni la Zambarau (Maxi)': [['S', 1], ['M', 2], ['L', 1], ['XL', 1]],
}
const DEFAULT_RUN = [['S', 2], ['M', 4], ['L', 3], ['XL', 2], ['XXL', 1]]
for (const p of products) {
  p.sizes = (SIZE_RUNS[p.name] ?? DEFAULT_RUN).map(([label, stock]) => ({ label, stock }))
  p.addedAgo = ADDED[p.name] ? ago(ADDED[p.name]) : DAYS
  p.weight = POPULAR[p.name] ?? 1
  p.image = JSON.parse(p.images)[0] ?? null
  p.views = 0
}
const live = (daysAgo) => products.filter((p) => p.addedAgo >= daysAgo)
const pickProduct = (list) => weighted(list.map((p) => [p, p.weight]))

const NAMES = ['Neema Kileo', 'Rehema Mushi', 'Fatma Ali', 'Halima Omari', 'Grace Mwakyusa', 'Zawadi Mrema', 'Saida Hassan', 'Joyce Lyimo', 'Mariam Juma', 'Esther Swai', 'Khadija Nassor', 'Upendo Massawe', 'Asha Bakari', 'Tumaini Shayo', 'Lulu Mbwambo', 'Rose Temba', 'Aisha Mohamed', 'Happy Mwakalinga', 'Witness Urio', 'Salma Abdallah', 'Agnes Mollel', 'Mwanaisha Kombo', 'Pendo Kimaro', 'Bahati Ngowi']
const LANDMARKS = ['karibu na Shell', 'jirani na msikiti', 'nyuma ya shule ya msingi', 'geti jeusi, nyumba ya pili', 'mbele ya duka la dawa', 'karibu na kituo cha daladala', 'ghorofa ya tatu, mlango 12', 'karibu na Mlimani City']

// Where visits come from, and the seller's tagged links on each channel.
const SOURCES = [['instagram', 50], ['tiktok', 22], ['whatsapp', 20], ['direct', 6], ['google', 2]]
const TAGS = { instagram: ['instagram-bio', 0.4], whatsapp: ['whatsapp-status', 0.3], tiktok: ['tiktok-bio', 0.25] }
const LINKS = [['instagram-bio', 'Instagram bio', 150], ['whatsapp-status', 'WhatsApp status', 120], ['tiktok-bio', 'TikTok bio', 60]]
const DEVICES = [['android', 76], ['iphone', 19], ['computer', 4], ['tablet', 1]]
const CITIES = [['Dar es Salaam', 88], ['Arusha', 3], ['Dodoma', 3], ['Mwanza', 3], ['Zanzibar', 3]]
// Visits through the day, Tanzania time: lunch and evening peaks.
const HOURS = Array.from({ length: 24 }, (_, h) => [h, h < 6 ? 0.3 : h < 9 ? 1 : h < 12 ? 2 : h < 15 ? 3.2 : h < 18 ? 2.4 : h < 23 ? 4.2 : 1.2])

// Visitors: about a third of visits are people who came before.
const visitors = []
const visitor = () => {
  if (visitors.length > 20 && rand() < 0.34) return pick(visitors)
  const v = { id: uuid(), device: weighted(DEVICES), city: weighted(CITIES) }
  visitors.push(v)
  return v
}
// Buyers: about a third of orders are from someone who has bought before. Their numbers are 0700 numbers, the range
// Shopi's demos keep for fictional people, so a tester who taps "WhatsApp the buyer" on the live sample reaches nobody real.
const buyers = []
const buyer = () => {
  if (buyers.length > 8 && rand() < 0.33) return pick(buyers)
  const b = { name: pick(NAMES), phone: `+255700${between(100000, 999999)}`, area: pick(areas) }
  buyers.push(b)
  return b
}

const sql = [
  `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = '${shop.id}' AND id LIKE 'zh%');`,
  `DELETE FROM orders WHERE shop_id = '${shop.id}' AND id LIKE 'zh%';`,
  `DELETE FROM events WHERE shop_id = '${shop.id}';`,
  `DELETE FROM links WHERE shop_id = '${shop.id}';`,
  `UPDATE shops SET slug = '${SLUG}', created_at = ${startOfToday - DAYS * DAY + 10 * 3600_000} WHERE id = '${shop.id}';`,
  `UPDATE users SET created_at = ${startOfToday - DAYS * DAY + 9 * 3600_000} WHERE id = '${shop.owner_id}';`,
  ...LINKS.map(([tag, label, since]) => `INSERT INTO links (shop_id, tag, label, created_at) VALUES ('${shop.id}', '${tag}', '${label}', ${startOfToday - ago(since) * DAY + 12 * 3600_000});`),
]
const orders = []
const items = []
const events = []
const codes = new Set()
const ev = (s, type, t, productId = null, detail = null) =>
  events.push(`('${shop.id}', ${q(productId)}, '${type}', '${s.source}', ${t}, '${s.visitor.id}', '${s.id}', ${q(s.tag)}, ${q(detail)}, '${s.visitor.device}', ${q(s.visitor.city)})`)

/** One visit: lands on the shop or straight on a product, looks around, maybe adds to the bag and checks out. */
function session(dayStart, daysAgo, latest, { orders: wantsOrder = false } = {}) {
  const hour = weighted(HOURS)
  let t = dayStart + hour * 3600_000 + Math.floor(rand() * 3600_000)
  if (t > latest) t = dayStart + Math.floor(rand() * Math.max(1, latest - dayStart))
  const source = weighted(SOURCES)
  const tagRule = TAGS[source]
  const tag = tagRule && rand() < tagRule[1] && LINKS.find(([x, , since]) => x === tagRule[0] && ago(since) >= daysAgo) ? tagRule[0] : null
  const s = { id: uuid(), visitor: visitor(), source, tag, start: t }
  const list = live(daysAgo)
  const seen = new Set()
  const view = (p) => {
    ev(s, 'view_product', (t += between(20, 90) * 1000), p.id)
    if (!seen.has(p.id)) p.views++
    seen.add(p.id)
  }
  if (rand() < 0.78) ev(s, 'view_shop', t)
  else view(pickProduct(list))
  const looks = wantsOrder ? between(1, 3) : weighted([[0, 30], [1, 32], [2, 20], [3, 12], [4, 6]])
  for (let k = 0; k < looks; k++) view(pickProduct(list))
  let chosen = null
  if (seen.size && (wantsOrder || rand() < 0.22)) {
    chosen = list.find((p) => seen.has(p.id)) ?? pickProduct(list)
    ev(s, 'add_to_cart', (t += between(30, 120) * 1000), chosen.id, rand() < 0.35 ? 'quick' : 'page')
    if (wantsOrder || rand() < 0.5) ev(s, 'checkout_start', (t += between(20, 90) * 1000))
  }
  if (rand() < 0.05) ev(s, 'whatsapp_click', (t += 15_000), seen.size ? [...seen][0] : null, weighted([['shop', 60], ['product', 30], ['footer', 10]]))
  if (rand() < 0.025) ev(s, 'social_click', (t += 15_000), null, weighted([['instagram', 70], ['tiktok', 25], ['facebook', 5]]))
  if (rand() < 0.035) ev(s, 'share', (t += 15_000), seen.size ? [...seen][0] : null, weighted([['whatsapp', 70], ['copy', 20], ['native', 10]]))
  return { ...s, end: t, chosen }
}

function order(s, daysAgo, { status, method, b, product, size } = {}) {
  const list = live(daysAgo)
  const lines = [{ p: product ?? s.chosen ?? pickProduct(list), qty: rand() < 0.9 ? 1 : 2 }]
  if (!product && rand() < 0.28) {
    const extra = pickProduct(list)
    if (extra !== lines[0].p) lines.push({ p: extra, qty: 1 })
  }
  const who = b ?? buyer()
  const created = s.end + between(2, 9) * 60_000
  const subtotal = lines.reduce((sum, l) => sum + l.p.price * l.qty, 0)
  const fee = who.area?.fee ?? 0
  const total = subtotal + fee
  const pay = method ?? (rand() < 0.58 ? 'lipa' : 'cod')
  const st = status ?? (daysAgo >= 3 ? (rand() < 0.94 ? 'delivered' : 'cancelled') : pick(['delivered', 'delivered', 'dispatched', 'confirmed']))
  const paid = pay === 'lipa' && !['cancelled', 'awaiting_payment'].includes(st)
  let c = code()
  while (codes.has(c)) c = code()
  codes.add(c)
  const txn = paid ? (code() + code()).slice(0, 10) : null
  const sms = paid ? `${txn} Confirmed. Tsh${total.toLocaleString('en-US')}.00 paid to ZEES STORE. New balance is Tsh${between(5, 90) * 1000}.` : null
  const check = paid ? JSON.stringify({ parsed: { txnId: txn, amount: total, name: 'ZEES STORE' }, amount: 'ok', name: 'ok', txn: 'ok' }) : null
  const oid = id()
  orders.push(
    `(${q(oid)}, '${shop.id}', '${c}', ${q(who.name)}, ${q(who.phone)}, ${q(who.area?.name ?? '')}, ${q(who.landmark ?? pick(LANDMARKS))}, '', ${subtotal}, ${fee}, ${total}, '${pay}', '${st}', ${q(sms)}, ${q(txn)}, ${q(check)}, ${paid ? created + 900_000 : 'NULL'}, ${created}, ${created + between(2, 30) * 3600_000}, '${s.source}', ${q(s.tag)}, '${s.visitor.id}', '${s.id}')`,
  )
  // M and L sell most, like real dress shops.
  const sizeFor = (p) => size ?? (p.sizes.length === 1 ? p.sizes[0].label : pick([...p.sizes, ...p.sizes.filter((x) => x.label === 'M' || x.label === 'L')]).label)
  for (const l of lines) items.push(`(${q(oid)}, '${l.p.id}', ${q(l.p.name)}, ${l.p.price}, ${l.qty}, ${q(l.p.image)}, ${q(sizeFor(l.p))})`)
  // Many buyers tap "Message on WhatsApp" on their order page.
  if (rand() < 0.4) ev(s, 'whatsapp_click', created + 60_000, null, 'order')
}

for (let d = DAYS; d >= 1; d--) {
  const dayStart = startOfToday - d * DAY
  const weekday = new Date(dayStart + TZ).getUTCDay()
  const weekend = weekday === 5 || weekday === 6 ? 1.4 : weekday === 0 ? 0.8 : 1
  const growth = 0.5 + 4.2 * ((DAYS - d) / DAYS) ** 1.3 // about 0.5 orders a day at launch, about 4.5 now
  const payday = new Date(dayStart + TZ).getUTCDate() >= 25 || new Date(dayStart + TZ).getUTCDate() <= 2 ? 1.3 : 1
  const target = Math.max(0, Math.round(growth * weekend * payday * (0.6 + rand() * 0.8)))
  const visits = Math.round(target * between(16, 26) + between(8, 30) * (1 + growth / 3))
  const latest = dayStart + DAY - 1
  for (let v = 0; v < visits - target; v++) session(dayStart, d, latest)
  for (let o = 0; o < target; o++) order(session(dayStart, d, latest, { orders: true }), d)
  if (rand() < 0.3) ev({ id: uuid(), visitor: { id: shop.owner_id.padEnd(16, '0'), device: 'android', city: 'Dar es Salaam' }, source: 'direct', tag: null }, 'seller_share', dayStart + 11 * 3600_000, pickProduct(live(d)).id, pick(['whatsapp', 'copy']))
}

// Today so far: visits up to now, and four orders in different states for the demo.
{
  const latest = NOW - 60_000
  const hoursSoFar = Math.max(1, (NOW - startOfToday) / 3600_000)
  for (let v = 0; v < Math.round(hoursSoFar * 4.5); v++) session(startOfToday, 0, latest)
  const P = (name) => products.find((p) => p.name === name)
  const A = (name) => areas.find((a) => a.name === name)
  const at = (h, m) => Math.min(latest - 600_000, startOfToday + (h * 60 + m) * 60_000)
  const today = [
    { name: 'Fatma Ali', phone: '+255700554411', area: A('Kariakoo & Posta'), landmark: 'mbele ya duka la dawa', product: P('Gauni la Moto (Strapless)'), size: 'S', method: 'lipa', status: 'awaiting_payment', t: at(9, 42) },
    { name: 'Rehema Mushi', phone: '+255700112233', area: A('Masaki & Oysterbay'), landmark: 'ghorofa ya tatu, mlango 12', product: P('Kaftani ya Bahari'), size: 'Free size', method: 'lipa', status: 'confirmed', t: at(11, 20) },
    { name: 'Neema Kileo', phone: '+255700321987', area: A('Sinza & Mwenge'), landmark: 'karibu na kituo cha daladala', product: P('Gauni la Zumaridi'), size: 'L', method: 'cod', status: 'confirmed', t: at(13, 5) },
    { name: 'Lulu Mbwambo', phone: '+255700456789', area: A('Kinondoni & Mikocheni'), landmark: 'Mikocheni B, karibu na Shoppers Plaza, geti la bluu', product: P('Gauni la Jua'), size: 'M', method: 'lipa', status: 'payment_claimed', t: at(16, 47) },
  ]
  for (const o of today) {
    if (!o.product) continue
    const s = session(startOfToday, 0, o.t, { orders: true })
    s.end = Math.min(s.end, o.t)
    order(s, 0, { status: o.status, method: o.method, b: o, product: o.product, size: o.size })
  }
}

for (const p of products) {
  const total = p.sizes.reduce((s, x) => s + x.stock, 0)
  sql.push(`UPDATE products SET created_at = ${startOfToday - p.addedAgo * DAY + 11 * 3600_000}, views = ${p.views}, sizes = ${q(JSON.stringify(p.sizes))}, stock = ${total} WHERE id = '${p.id}';`)
}
const chunk = (rows, head) => {
  for (let i = 0; i < rows.length; i += 200) sql.push(`${head} VALUES ${rows.slice(i, i + 200).join(',\n')};`)
}
chunk(orders, 'INSERT INTO orders (id, shop_id, code, customer_name, customer_phone, area, landmark, note, subtotal, delivery_fee, total, payment_method, status, payment_sms, txn_id, payment_check, paid_claimed_at, created_at, updated_at, source, link_tag, visitor_id, session_id)')
chunk(items, 'INSERT INTO order_items (order_id, product_id, name, price, qty, image, variant)')
chunk(events, 'INSERT INTO events (shop_id, product_id, type, source, created_at, visitor_id, session_id, link_tag, detail, device, city)')

const file = join(OUT, 'zee-history.sql')
writeFileSync(file, sql.join('\n'))
execFileSync('npx', ['wrangler', 'd1', 'execute', 'shopi', where, '--yes', '--file', file], { stdio: ['ignore', 'ignore', 'inherit'] })
console.log(`Zee's Store: ${orders.length} orders, ${events.length} events, ${visitors.length} visitors over ${DAYS} days and today -> ${remote ? 'live' : 'local'} /${SLUG}`)
