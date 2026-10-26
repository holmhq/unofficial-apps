// Live receipts and replies from a member's phone. SMSGate's app on the
// phone POSTs each event to /hooks/<token>, where the token names the
// phone. The body is signed: X-Signature is the hex HMAC-SHA256 of the raw
// body followed by the X-Timestamp value, keyed with the phone's signing
// key. Zend checks the signature in constant time, refuses timestamps
// more than five minutes off, and skips an event it has already seen
// (SMSGate retries with the same envelope id).

import { json, now } from './lib.js'
import { credentials, notify } from './phone.js'
import { receipt, incoming } from './messages.js'

const WINDOW = 300
const encoder = new TextEncoder()

export async function receive(request, env, token) {
  if (request.method !== 'POST') return json({ error: { code: 'method', message: 'Use POST.' } }, 405)
  const phone = /^[a-z0-9]{32}$/.test(token) ? env.holm.app.ds.findOne('phones', { hookToken: token }) : null
  if (!phone || !phone.hasSigningKey) return json({ error: { code: 'not_found', message: 'Unknown webhook.' } }, 404)

  const raw = await request.text()
  const stamp = request.headers.get('x-timestamp') || ''
  const signature = (request.headers.get('x-signature') || '').trim().toLowerCase()
  if (!/^\d{9,11}$/.test(stamp) || Math.abs(now() / 1000 - Number(stamp)) > WINDOW || !/^[0-9a-f]{64}$/.test(signature)) {
    return json({ error: { code: 'unsigned', message: 'Missing, stale or malformed signature.' } }, 401)
  }
  const { signingKey } = await credentials(env, phone)
  const key = await crypto.subtle.importKey('raw', encoder.encode(signingKey || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const good = await crypto.subtle.verify('HMAC', key, hexBytes(signature), encoder.encode(raw + stamp))
  if (!good) return json({ error: { code: 'bad_signature', message: 'Signature does not match.' } }, 401)

  let event
  try { event = JSON.parse(raw) } catch { return json({ error: { code: 'invalid_json', message: 'Send JSON.' } }, 400) }
  const kv = env.holm.app.kv
  const seen = event && event.id ? `seen:${phone.id}:${String(event.id).slice(0, 64)}` : null
  if (seen && kv.get(seen)) return json({ ok: true, duplicate: true })

  const p = (event && event.payload) || {}
  const at = (value) => {
    const ms = Date.parse(value || '')
    return Number.isFinite(ms) ? ms : now()
  }
  let changed = null
  const states = { 'sms:sent': ['sent', p.sentAt], 'sms:delivered': ['delivered', p.deliveredAt], 'sms:failed': ['failed', p.failedAt] }
  const kind = event && event.event
  if (states[kind]) {
    const [state, when] = states[kind]
    const result = receipt(env, phone.ownerId, {
      group: p.messageId, number: p.recipient || p.phoneNumber, state, at: at(when),
      error: state === 'failed' ? String(p.reason || 'Failed').slice(0, 200) : null
    })
    // A receipt can beat the text's own record by a moment, so for a fresh
    // event ask SMSGate to try again shortly. (Its retries are signed anew;
    // the event's own time says how fresh it is.) Older unknown ids are
    // texts sent some other way, and are let go.
    if (!result.found && now() - at(when) < 120000) {
      return json({ error: { code: 'not_yet', message: 'Unknown text; retry shortly.' } }, 503)
    }
    changed = result.number
  }
  if (kind === 'sms:received') {
    changed = incoming(env, phone.ownerId, { from: p.sender || p.phoneNumber, body: p.message, at: at(p.receivedAt), sim: p.simNumber })
  }
  if (seen) kv.set(seen, 1, 3 * 86400000)
  env.holm.app.ds.update('phones', { id: phone.id }, { $set: { lastSeen: now() } })
  if (changed) notify(env, phone.ownerId, { type: 'update', numbers: [changed], event: event.event })
  return json({ ok: true })
}

function hexBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}
