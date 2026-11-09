/**
 * Gives the sample shop "Zee's Store" six months of history, after it was onboarded by hand through the UI.
 * It keeps the real account, shop settings, products and photos, and only backfills the past:
 * the shop's start date, when each dress was added, orders, visits, shares and product views.
 * Everything here is fictional. Safe to run again: it replaces what it made last time.
 *
 *   node scripts/seed-zee-history.mjs        # local database only
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SLUG = 'zee-store'
const OUT = join(process.cwd(), '.demo')
mkdirSync(OUT, { recursive: true })

const d1 = (sql) =>
  JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'rizk', '--local', '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results

let [shop] = d1(`SELECT id, owner_id, slug FROM shops WHERE slug IN ('${SLUG}', 'zeestore') OR name = 'Zee''s Store' LIMIT 1`)
if (!shop) throw new Error("Zee's Store not found. Onboard it through the UI first.")
const products = d1(`SELECT id, name, price, images FROM products WHERE shop_id = '${shop.id}' ORDER BY created_at`)
const areas = d1(`SELECT name, fee FROM delivery_areas WHERE shop_id = '${shop.id}' ORDER BY sort`)

const DAY = 86400_000
const NOW = Date.now()
const TZ = 3 * 3600_000
const startOfToday = Math.floor((NOW + TZ) / DAY) * DAY - TZ
const DAYS = 182

let seed = 20261108
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (a) => a[Math.floor(rand() * a.length)]
const between = (a, b) => a + Math.floor(rand() * (b - a + 1))
const id = () => 'zh' + Array.from({ length: 14 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand() * 36)]).join('')
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
  p.addedAgo = ADDED[p.name] ?? DAYS
  p.weight = POPULAR[p.name] ?? 1
  p.image = JSON.parse(p.images)[0] ?? null
  p.views = 0
}
const live = (daysAgo) => products.filter((p) => p.addedAgo >= daysAgo)
const weighted = (list) => {
  let r = rand() * list.reduce((s, p) => s + p.weight, 0)
  for (const p of list) if ((r -= p.weight) < 0) return p
  return list[0]
}

const NAMES = ['Neema Kileo', 'Rehema Mushi', 'Fatma Ali', 'Halima Omari', 'Grace Mwakyusa', 'Zawadi Mrema', 'Saida Hassan', 'Joyce Lyimo', 'Mariam Juma', 'Esther Swai', 'Khadija Nassor', 'Upendo Massawe', 'Asha Bakari', 'Tumaini Shayo', 'Lulu Mbwambo', 'Rose Temba', 'Aisha Mohamed', 'Happy Mwakalinga', 'Witness Urio', 'Salma Abdallah', 'Agnes Mollel', 'Mwanaisha Kombo', 'Pendo Kimaro', 'Bahati Ngowi']
const LANDMARKS = ['karibu na Shell', 'jirani na msikiti', 'nyuma ya shule ya msingi', 'geti jeusi, nyumba ya pili', 'mbele ya duka la dawa', 'karibu na kituo cha daladala', 'ghorofa ya tatu, mlango 12', 'karibu na Mlimani City']
const SOURCES = [['instagram', 50], ['tiktok', 22], ['whatsapp', 20], ['direct', 8]]
const source = () => {
  let r = rand() * 100
  for (const [s, w] of SOURCES) if ((r -= w) < 0) return s
  return 'direct'
}
// Loyal buyers come back: about a third of orders are from someone who has bought before.
const buyers = []
const buyer = () => {
  if (buyers.length > 8 && rand() < 0.33) return pick(buyers)
  const b = { name: pick(NAMES), phone: `+2557${between(10000000, 99999999)}`, area: pick(areas) }
  buyers.push(b)
  return b
}

const sql = [
  `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = '${shop.id}' AND id LIKE 'zh%');`,
  `DELETE FROM orders WHERE shop_id = '${shop.id}' AND id LIKE 'zh%';`,
  `DELETE FROM events WHERE shop_id = '${shop.id}' AND created_at < ${startOfToday};`,
  `UPDATE shops SET slug = '${SLUG}', created_at = ${startOfToday - DAYS * DAY + 10 * 3600_000} WHERE id = '${shop.id}';`,
  `UPDATE users SET created_at = ${startOfToday - DAYS * DAY + 9 * 3600_000} WHERE id = '${shop.owner_id}';`,
]
const orders = []
const items = []
const events = []
const codes = new Set()

for (let d = DAYS; d >= 1; d--) {
  const dayStart = startOfToday - d * DAY
  const weekday = new Date(dayStart + TZ).getUTCDay()
  const weekend = weekday === 5 || weekday === 6 ? 1.4 : weekday === 0 ? 0.8 : 1
  const growth = 0.5 + 4.2 * ((DAYS - d) / DAYS) ** 1.3 // ~0.5 a day at launch, ~4.5 a day now
  const payday = new Date(dayStart + TZ).getUTCDate() >= 25 || new Date(dayStart + TZ).getUTCDate() <= 2 ? 1.3 : 1
  const target = Math.max(0, Math.round(growth * weekend * payday * (0.6 + rand() * 0.8)))
  const visits = Math.round(target * between(16, 26) + between(8, 30) * (1 + growth / 3))
  const list = live(d)

  for (let v = 0; v < visits; v++) {
    const t = dayStart + 7 * 3600_000 + Math.floor(rand() * 16 * 3600_000)
    const s = source()
    events.push(`('${shop.id}', NULL, 'view_shop', '${s}', ${t})`)
    for (let k = between(0, 3); k > 0; k--) {
      const p = weighted(list)
      p.views++
      events.push(`('${shop.id}', '${p.id}', 'view_product', '${s}', ${t + k * 25_000})`)
    }
    if (rand() < 0.05) events.push(`('${shop.id}', ${q(weighted(list).id)}, 'share', '${s}', ${t + 90_000})`)
  }

  for (let o = 0; o < target; o++) {
    const created = dayStart + 8 * 3600_000 + Math.floor(rand() * 14 * 3600_000)
    const lines = []
    for (let n = rand() < 0.72 ? 1 : rand() < 0.75 ? 2 : 3; n > 0; n--) {
      const p = weighted(list)
      if (!lines.some((l) => l.p === p)) lines.push({ p, qty: rand() < 0.9 ? 1 : 2 })
    }
    const b = buyer()
    const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0)
    const fee = b.area?.fee ?? 0
    const total = subtotal + fee
    const method = rand() < 0.58 ? 'lipa' : 'cod'
    let status = d >= 3 ? (rand() < 0.94 ? 'delivered' : 'cancelled') : pick(['delivered', 'delivered', 'dispatched', 'confirmed'])
    const paid = method === 'lipa' && status !== 'cancelled'
    let c = code()
    while (codes.has(c)) c = code()
    codes.add(c)
    const txn = paid ? (code() + code()).slice(0, 10) : null
    const sms = paid ? `${txn} Imethibitishwa. Tsh${total.toLocaleString('en-US')}.00 imelipwa kwa ZEES STORE. Salio jipya ni Tsh${between(5, 90) * 1000}.` : null
    const check = paid ? JSON.stringify({ parsed: { txnId: txn, amount: total, name: 'ZEES STORE' }, amount: 'ok', name: 'ok', txn: 'ok' }) : null
    const oid = id()
    orders.push(
      `(${q(oid)}, '${shop.id}', '${c}', ${q(b.name)}, ${q(b.phone)}, ${q(b.area?.name ?? '')}, ${q(pick(LANDMARKS))}, '', ${subtotal}, ${fee}, ${total}, '${method}', '${status}', ${q(sms)}, ${q(txn)}, ${q(check)}, ${paid ? created + 900_000 : 'NULL'}, ${created}, ${created + between(2, 30) * 3600_000})`,
    )
    // M and L sell most, like real dress shops.
    const sizeFor = (p) => (p.sizes.length === 1 ? p.sizes[0].label : pick([...p.sizes, ...p.sizes.filter((s) => s.label === 'M' || s.label === 'L')]).label)
    for (const l of lines) items.push(`(${q(oid)}, '${l.p.id}', ${q(l.p.name)}, ${l.p.price}, ${l.qty}, ${q(l.p.image)}, ${q(sizeFor(l.p))})`)
    events.push(`('${shop.id}', '${lines[0].p.id}', 'add_to_cart', '${source()}', ${created - 150_000})`)
  }
}

for (const p of products) {
  const total = p.sizes.reduce((s, x) => s + x.stock, 0)
  sql.push(`UPDATE products SET created_at = ${startOfToday - p.addedAgo * DAY + 11 * 3600_000}, views = views + ${p.views}, sizes = ${q(JSON.stringify(p.sizes))}, stock = ${total} WHERE id = '${p.id}';`)
}
const chunk = (rows, head) => {
  for (let i = 0; i < rows.length; i += 200) sql.push(`${head} VALUES ${rows.slice(i, i + 200).join(',\n')};`)
}
chunk(orders, 'INSERT INTO orders (id, shop_id, code, customer_name, customer_phone, area, landmark, note, subtotal, delivery_fee, total, payment_method, status, payment_sms, txn_id, payment_check, paid_claimed_at, created_at, updated_at)')
chunk(items, 'INSERT INTO order_items (order_id, product_id, name, price, qty, image, variant)')
chunk(events, 'INSERT INTO events (shop_id, product_id, type, source, created_at)')

const file = join(OUT, 'zee-history.sql')
writeFileSync(file, sql.join('\n'))
execFileSync('npx', ['wrangler', 'd1', 'execute', 'rizk', '--local', '--file', file], { stdio: ['ignore', 'ignore', 'inherit'] })
console.log(`Zee's Store: ${orders.length} orders, ${events.length} events over ${DAYS} days -> rizk.tz/${SLUG}`)
