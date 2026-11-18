// Run: node scripts/fake-selcom.mjs  (port 8799). .dev.vars: SELCOM_PROXY_URL=http://localhost:8799, SELCOM_PROXY_TOKEN=local-fake-token.
// A fake of Driftmark's Selcom proxy, for local tests only. Never point Shopi at the real proxy locally: it moves money.
// Behaviour by the last 3 digits of the number pushed to:
//   ...000  wallet push refused: 9009 (balance not enough)
//   ...111  push accepted; paid after 6 s, then the callback is sent
//   ...222  push accepted; cancelled by the payer after 6 s
//   ...333  push accepted; nothing happens (pay by Lipa Namba: POST /test/pay?order_id=…)
//   other   push accepted; stays pending
// The real proxy answers 200 for refusals too; so does this one.
import http from 'node:http'
const TOKEN = 'local-fake-token'
const orders = new Map()
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function callback(o) {
  const url = Buffer.from(o.webhook, 'base64').toString()
  const body = { result: 'SUCCESS', resultcode: '000', order_id: o.id, transid: o.transid, reference: o.reference, payment_status: o.status }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    log('callback', o.id, r.status, await r.text())
  } catch (e) {
    log('callback failed', o.id, e.message)
  }
}

function settleLater(o, status, ms) {
  setTimeout(() => {
    if (o.status !== 'PENDING') return
    o.status = status
    log('settled', o.id, status)
    if (status === 'COMPLETED') callback(o)
  }, ms)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  let raw = ''
  for await (const c of req) raw += c
  const body = raw ? JSON.parse(raw) : {}
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }
  if (url.pathname === '/healthz') return send(200, { ok: true })
  if (url.pathname === '/test/pay') {
    const o = orders.get(url.searchParams.get('order_id'))
    if (!o) return send(404, { error: 'no order' })
    o.status = 'COMPLETED'
    log('paid by hand', o.id)
    if (!url.searchParams.get('quiet')) await callback(o)
    return send(200, { ok: true })
  }
  if (url.pathname === '/test/orders') return send(200, [...orders.values()])
  if ((req.headers.authorization || '') !== `Bearer ${TOKEN}`) return send(401, { error: 'unauthorized' })
  const op = url.pathname.replace('/selcom/', '')
  log(op, JSON.stringify(body))
  if (op === 'createMinimalOrder') {
    for (const k of ['order_id', 'buyer_email', 'buyer_name', 'buyer_phone', 'amount', 'currency', 'webhook']) if (!body[k]) return send(200, { result: 'FAIL', resultcode: '400', message: `Parameter ${k} is invalid` })
    const n = orders.size + 1
    const o = { id: body.order_id, amount: body.amount, webhook: body.webhook, reference: `REF${1000 + n}`, transid: `T${5000 + n}`, token: String(81000000 + n), status: 'PENDING', phone: body.buyer_phone }
    orders.set(o.id, o)
    return send(200, { reference: o.reference, transid: o.transid, resultcode: '000', result: 'SUCCESS', message: 'Order creation successful', data: [{ gateway_buyer_uuid: 'x', payment_token: o.token, qr: 'x', payment_gateway_url: 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==' }] })
  }
  if (op === 'walletPushUSSD') {
    const o = orders.get(body.order_id)
    if (!o) return send(200, { result: 'FAIL', resultcode: '404', message: 'Order not found' })
    const tail = String(body.msisdn).slice(-3)
    if (tail === '000') return send(200, { result: 'FAIL', resultcode: '9009', message: 'Balance of customer is not enough' })
    if (tail === '111') settleLater(o, 'COMPLETED', 6000)
    if (tail === '222') settleLater(o, 'USERCANCELLED', 6000)
    return send(200, { reference: o.reference, transid: o.transid, resultcode: '111', result: 'PENDING', message: 'Request in progress. You will receive a callback shortly' })
  }
  if (op === 'orderStatus') {
    const o = orders.get(body.order_id)
    if (!o) return send(200, { result: 'FAIL', resultcode: '404', message: 'Order not found', data: [] })
    return send(200, { result: 'SUCCESS', resultcode: '000', message: 'Order fetch successful', data: [{ order_id: o.id, creation_date: 'x', amount: String(o.amount), payment_status: o.status, transid: o.transid, channel: 'MPESA', reference: o.reference, msisdn: o.phone }] })
  }
  return send(404, { error: 'not_found' })
})
server.listen(8799, () => log('fake Selcom proxy on http://localhost:8799'))
