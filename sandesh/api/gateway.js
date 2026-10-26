// The phone's side. A real phone runs SMSGate ("SMS Gateway for Android",
// https://sms-gate.app) in cloud mode: Sandesh calls SMSGate's cloud API
// with the username and password the app shows on the phone, through
// env.holm.net (the node's operator allows api.sms-gate.app for this app),
// and the phone sends each text on its own SIM. A demo phone sends nothing:
// its texts pretend to be sent and delivered, and it answers some of them,
// so anyone can try Sandesh before installing anything.

import { HttpError, random, now } from './lib.js'

const BASE = 'https://api.sms-gate.app/3rdparty/v1'

// SMSGate's message states, as Sandesh shows them.
const STATES = {
  Pending: 'queued', Processed: 'queued', Sent: 'sent', Delivered: 'delivered',
  Failed: 'failed', Cancelling: 'cancelled', Cancelled: 'cancelled'
}
export const mapState = (state) => STATES[state] || 'queued'

// How far along a state is; a webhook or poll never moves a text backwards.
const RANK = { scheduled: 0, queued: 1, sent: 2, delivered: 3, failed: 3, cancelled: 3, received: 3 }
export const later = (next, current) => next !== current && (RANK[next] ?? 0) >= (RANK[current] ?? 0) && current !== 'delivered'

function call(env, creds, method, path, body) {
  let response
  try {
    response = env.holm.net.fetch(BASE + path, {
      method,
      headers: {
        authorization: 'Basic ' + btoa(`${creds.username}:${creds.password}`),
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
  } catch (error) {
    const message = String(error && error.message || error)
    if (/NET_BLOCKED/.test(message)) {
      throw new HttpError(503, 'egress_blocked',
        `This node doesn't let Sandesh reach SMSGate's cloud yet. The node's operator runs: holm net allow api.sms-gate.app --app ${env.holm.app.id}`)
    }
    throw new HttpError(502, 'gateway_unreachable', "Couldn't reach SMSGate's cloud just now. Try again in a moment.")
  }
  let data = null
  try { data = response.json() } catch {}
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'gateway_auth', "SMSGate didn't accept that username and password. Copy them again from the Home tab of the SMS Gateway app.")
  }
  if (response.status === 503) {
    throw new HttpError(503, 'phone_busy', "SMSGate is holding too many texts for your phone. Check the phone is on and online, then try again.")
  }
  if (!response.ok) {
    const detail = data && data.message ? `: ${data.message}` : ''
    throw new HttpError(502, 'gateway_error', `SMSGate answered ${response.status}${detail}`)
  }
  return data
}

/* ---- Phone ----------------------------------------------------------- */

// The account's phones, newest seen first. A phone signed in to the same
// SMSGate account more than once shows up once per install.
export function devices(env, creds) {
  if (creds.demo) return [demoDevice()]
  const list = call(env, creds, 'GET', '/devices') || []
  return list
    .filter(d => !d.deletedAt)
    .map(d => ({
      id: d.id,
      name: d.name || 'Android phone',
      lastSeen: d.lastSeen ? Date.parse(d.lastSeen) : null,
      sims: (d.simCards || []).map(s => ({
        slot: s.simNumber, carrier: s.carrierName || null, number: s.phoneNumber || null
      }))
    }))
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
}

function demoDevice() {
  return {
    id: 'demo', name: 'Demo phone', lastSeen: now(),
    sims: [{ slot: 1, carrier: 'Demo SIM 1', number: null }, { slot: 2, carrier: 'Demo SIM 2', number: null }]
  }
}

/* ---- Texts ----------------------------------------------------------- */

// Hand one text to the phone for up to 10 numbers. `id` is Sandesh's own,
// so receipts can find the text before SMSGate has answered.
export function send(env, creds, { id, text, numbers, sim, scheduleAt, deviceId }) {
  if (creds.demo) {
    return { id, recipients: numbers.map(n => ({ number: n, state: scheduleAt ? 'scheduled' : 'queued', error: null })) }
  }
  const data = call(env, creds, 'POST', '/messages', {
    id,
    textMessage: { text },
    phoneNumbers: numbers,
    withDeliveryReport: true,
    ttl: 86400,
    ...(sim ? { simNumber: sim } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(scheduleAt ? { scheduleAt: new Date(scheduleAt).toISOString() } : {})
  })
  return { id: (data && data.id) || id, recipients: recipients(data, numbers, scheduleAt) }
}

// Where SMSGate has got to with a text, for each number.
export function status(env, creds, id, numbers) {
  if (creds.demo) return null
  return { recipients: recipients(call(env, creds, 'GET', `/messages/${encodeURIComponent(id)}`), numbers) }
}

function recipients(data, numbers, scheduleAt) {
  const list = (data && data.recipients) || []
  return numbers.map(number => {
    const found = list.find(r => samePhone(r.phoneNumber, number))
    const state = found ? mapState(found.state) : mapState(data && data.state)
    return { number, state: scheduleAt && state === 'queued' ? 'scheduled' : state, error: (found && found.error) || null }
  })
}

const digits = (value) => String(value || '').replace(/\D/g, '')
export const samePhone = (a, b) => {
  const x = digits(a)
  const y = digits(b)
  return x.length >= 10 && y.length >= 10 && x.slice(-10) === y.slice(-10)
}

// Cancel a text still waiting on the phone (a scheduled one, say).
export function cancel(env, creds, id) {
  if (creds.demo) return
  call(env, creds, 'DELETE', `/messages/${encodeURIComponent(id)}`)
}

/* ---- Webhooks -------------------------------------------------------- */

export const EVENTS = ['sms:sent', 'sms:delivered', 'sms:failed', 'sms:received']

// Point the phone's receipts and replies at `url`, replacing any webhooks
// this app registered earlier (on this host) for the same account.
export function registerHooks(env, creds, url, deviceId) {
  if (creds.demo) return []
  const base = url.slice(0, url.lastIndexOf('/') + 1)
  const existing = call(env, creds, 'GET', '/webhooks') || []
  for (const hook of existing) {
    if (String(hook.url || '').startsWith(base)) call(env, creds, 'DELETE', `/webhooks/${encodeURIComponent(hook.id)}`)
  }
  return EVENTS.map(event => {
    const hook = call(env, creds, 'POST', '/webhooks', { url, event, ...(deviceId ? { deviceId } : {}) })
    return hook && hook.id
  }).filter(Boolean)
}

export function removeHooks(env, creds, ids) {
  if (creds.demo) return
  for (const id of ids || []) {
    try { call(env, creds, 'DELETE', `/webhooks/${encodeURIComponent(id)}`) } catch {}
  }
}

/* ---- The demo phone ---------------------------------------------------- */

// Where a demo text has got to `ms` after it was sent. Numbers ending in
// 0000 have no signal, so their texts fail; the rest are sent after two
// seconds and delivered after five.
export function demoState(number, sentAt, scheduleAt, ms) {
  const start = scheduleAt || sentAt
  if (ms < start) return { state: 'scheduled' }
  if (digits(number).endsWith('0000')) return ms - start > 3000 ? { state: 'failed', error: 'No signal (demo)' } : { state: 'queued' }
  if (ms - start > 5000) return { state: 'delivered' }
  if (ms - start > 2000) return { state: 'sent' }
  return { state: 'queued' }
}

// A demo contact answers the first text after it is delivered. Numbers
// ending in 9999 reply STOP, to show what an opt-out looks like.
const REPLIES = ['👍', 'Got it, thanks!', 'ठीक है, मिलते हैं', 'Will call you in a bit', 'Haha yes 😄', 'Okay, see you then']

export function demoReply(number, text) {
  if (digits(number).endsWith('9999')) return 'STOP'
  if (/\?\s*$/.test(text)) return 'Yes, sounds good'
  return REPLIES[(digits(number).slice(-3) * 1 + text.length) % REPLIES.length]
}

export const newMessageId = () => 'sd' + random(22)
