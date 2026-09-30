// Checks the UKO sockets relay end to end: make a room key, join "<MerchantRequestID>$<key>", POST a Daraja-shaped callback to
// <sockets>/mpesa/callback?key=<key>&sig=<HMAC-SHA256(SOCKETS_API_KEY, key)>, expect the `callback` event back in the room,
// and check that the same post without the sig is refused.
//   SOCKETS_API_KEY=<same value as the sockets server> node scripts/sockets-relay-test.mjs [https://uko-sockets.onrender.com]
import { createHmac, randomBytes } from 'node:crypto'
import { io } from 'socket.io-client'

const URL = process.argv[2] || process.env.VITE_SOCKETS_URL || 'https://uko-sockets.onrender.com'
const SECRET = process.env.SOCKETS_API_KEY || ''
const merchant = 'TEST-MR-' + Math.random().toString(36).slice(2, 10).toUpperCase()
const checkout = 'ws_CO_' + Date.now()
const key = randomBytes(16).toString('hex')
const room = `${merchant}$${key}`
const t0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)
if (!SECRET) log('warning: SOCKETS_API_KEY not set — only works against a sockets server without one')

const s = io(URL, { transports: ['websocket', 'polling'], timeout: 20000 })
const timer = setTimeout(() => { log('FAIL: no callback event within 60s'); process.exit(1) }, 60000)

s.on('connect_error', (e) => log('connect_error', e.message))
s.on('connect', async () => {
  log('connected', s.id, '→', URL)
  s.emit('user', room)
  log('joined room', room)
  const body = { Body: { stkCallback: { MerchantRequestID: merchant, CheckoutRequestID: checkout, ResultCode: 0, ResultDesc: 'The service request is processed successfully.',
    CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1 }, { Name: 'MpesaReceiptNumber', Value: 'TEST1234XYZ' }, { Name: 'TransactionDate', Value: 20260914120000 }, { Name: 'PhoneNumber', Value: 254700000000 }] } } } }
  await new Promise((r) => setTimeout(r, 500))
  const post = (qs) => fetch(`${URL}/mpesa/callback?${qs}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (SECRET) {
    const forged = await post(new URLSearchParams({ key }))
    log(forged.status === 401 ? 'PASS: unsigned post refused (401)' : `FAIL: unsigned post answered ${forged.status}`)
  }
  const qs = new URLSearchParams({ key, ...(SECRET ? { sig: createHmac('sha256', SECRET).update(key).digest('hex') } : {}) })
  const res = await post(qs)
  log('POST /mpesa/callback →', res.status, (await res.text()).slice(0, 120))
})
s.on('callback', (payload) => {
  const cb = payload?.data
  log('callback event received:', JSON.stringify(cb))
  const ok = cb?.MerchantRequestID === merchant && cb?.CheckoutRequestID === checkout && cb?.ResultCode === 0
  log(ok ? 'PASS: relay works for room ' + room : 'FAIL: payload mismatch')
  clearTimeout(timer)
  s.disconnect()
  setTimeout(() => process.exit(ok ? 0 : 1), 200)
})
