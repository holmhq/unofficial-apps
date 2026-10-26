// Each member connects one phone: a real one through SMSGate's cloud, or
// the demo phone. The phone's sign-in is sealed (vault.js); the page only
// ever sees the phone's name, when it was last online, its SIMs and
// whether live receipts are on.

import { HttpError, now, random, text } from './lib.js'
import { seal, open, requireVault } from './vault.js'
import * as gateway from './gateway.js'

const ds = (env) => env.holm.app.ds

export const DECLARATION = 'I will send only my own person-to-person texts from this phone: ' +
  'no marketing, no business OTPs or alerts, no bulk messages. In India those need a DLT-registered sender.'

export function findPhone(env, ownerId) {
  return ds(env).findOne('phones', { ownerId })
}

export function requirePhone(env, ownerId) {
  const phone = findPhone(env, ownerId)
  if (!phone) throw new HttpError(409, 'no_phone', 'Connect your phone first.')
  return phone
}

// The phone's SMSGate sign-in, opened from the vault.
export async function credentials(env, phone) {
  if (phone.kind === 'demo') return { demo: true }
  return JSON.parse(await open(env, phone.sealed, `${phone.ownerId}\nphone`))
}

export function publicPhone(phone) {
  if (!phone) return null
  return {
    kind: phone.kind,
    name: phone.deviceName,
    lastSeen: phone.lastSeen || null,
    sims: phone.sims || [],
    defaultSim: phone.defaultSim || null,
    live: Boolean(phone.live),
    signingKey: Boolean(phone.hasSigningKey),
    connectedAt: phone.connectedAt,
    checkedAt: phone.checkedAt || null,
    username: phone.usernameHint || null
  }
}

function requireDeclaration(input) {
  if (input.declare !== true) {
    throw new HttpError(400, 'declare', 'Confirm that you will send only personal texts from this phone.')
  }
}

// Connect a real phone: check the username and password against SMSGate,
// then keep them sealed. Connecting again replaces the old phone.
export async function connect(env, member, input) {
  requireDeclaration(input)
  const username = text(input.username, 100)
  const password = text(input.password, 200)
  const signingKey = text(input.signingKey, 200)
  if (!username || !password) throw new HttpError(400, 'missing', 'Paste the username and password from the SMS Gateway app.')
  requireVault(env)
  const creds = { username, password, signingKey: signingKey || null }
  const list = gateway.devices(env, creds)
  if (!list.length) {
    throw new HttpError(409, 'no_device', 'That SMSGate account has no phone yet. Open the SMS Gateway app, turn on Cloud server and tap Online.')
  }
  const device = list[0]
  await disconnect(env, member.id, { quiet: true })
  const doc = {
    ownerId: member.id,
    kind: 'smsgate',
    sealed: await seal(env, JSON.stringify(creds), `${member.id}\nphone`),
    usernameHint: username.slice(0, 2) + '•••',
    hasSigningKey: Boolean(signingKey),
    deviceId: device.id,
    deviceName: device.name,
    sims: device.sims,
    lastSeen: device.lastSeen,
    defaultSim: null,
    hookToken: random(32),
    hookIds: [],
    live: false,
    declaration: DECLARATION,
    declaredAt: now(),
    connectedAt: now(),
    checkedAt: now()
  }
  ds(env).insert('phones', doc)
  return findPhone(env, member.id)
}

export async function connectDemo(env, member, input) {
  requireDeclaration(input)
  await disconnect(env, member.id, { quiet: true })
  const device = gateway.devices(env, { demo: true })[0]
  ds(env).insert('phones', {
    ownerId: member.id, kind: 'demo', sealed: null, usernameHint: null, hasSigningKey: false,
    deviceId: device.id, deviceName: device.name, sims: device.sims, lastSeen: device.lastSeen,
    defaultSim: null, hookToken: null, hookIds: [], live: true,
    declaration: DECLARATION, declaredAt: now(), connectedAt: now(), checkedAt: now()
  })
  return findPhone(env, member.id)
}

// Ask SMSGate when the phone was last online, and which SIMs it has.
export async function check(env, ownerId) {
  const phone = requirePhone(env, ownerId)
  const creds = await credentials(env, phone)
  const list = gateway.devices(env, creds)
  const device = list.find(d => d.id === phone.deviceId) || list[0]
  const patch = device
    ? { deviceId: device.id, deviceName: device.name, sims: device.sims, lastSeen: device.lastSeen, checkedAt: now() }
    : { checkedAt: now() }
  ds(env).update('phones', { id: phone.id }, { $set: patch })
  return findPhone(env, ownerId)
}

// Change the signing key or the default SIM.
export async function update(env, ownerId, input) {
  const phone = requirePhone(env, ownerId)
  const patch = {}
  if ('defaultSim' in input) {
    const sim = input.defaultSim == null ? null : Number(input.defaultSim)
    if (sim !== null && !(phone.sims || []).some(s => s.slot === sim)) throw new HttpError(400, 'sim', 'That phone has no such SIM.')
    patch.defaultSim = sim
  }
  if ('signingKey' in input && phone.kind !== 'demo') {
    const creds = await credentials(env, phone)
    creds.signingKey = text(input.signingKey, 200) || null
    patch.sealed = await seal(env, JSON.stringify(creds), `${ownerId}\nphone`)
    patch.hasSigningKey = Boolean(creds.signingKey)
    if (!creds.signingKey) patch.live = false
  }
  ds(env).update('phones', { id: phone.id }, { $set: patch })
  return findPhone(env, ownerId)
}

// Live receipts and replies: SMSGate calls this app's /hooks/<token> on
// each event, signed with the phone's signing key. The phone itself makes
// the call, so it needs an HTTPS address with a real certificate.
export async function goLive(env, ownerId, origin) {
  const phone = requirePhone(env, ownerId)
  if (phone.kind === 'demo') return phone
  if (!phone.hasSigningKey) {
    throw new HttpError(400, 'signing_key', "Paste the phone's signing key first (SMS Gateway app → Settings → Webhooks → Signing Key).")
  }
  if (!origin.startsWith('https://')) {
    throw new HttpError(409, 'needs_https', 'Live receipts need this app on an HTTPS address the phone can reach. Sandesh checks for receipts while it is open instead.')
  }
  const creds = await credentials(env, phone)
  const ids = gateway.registerHooks(env, creds, `${origin}/hooks/${phone.hookToken}`, phone.deviceId)
  ds(env).update('phones', { id: phone.id }, { $set: { hookIds: ids, live: ids.length === gateway.EVENTS.length } })
  return findPhone(env, ownerId)
}

// Forget the phone: remove its webhooks from SMSGate (best effort) and the
// sealed sign-in. Conversations stay until the member deletes them.
export async function disconnect(env, ownerId, { quiet = false } = {}) {
  const phone = findPhone(env, ownerId)
  if (!phone) {
    if (quiet) return
    throw new HttpError(404, 'no_phone', 'No phone is connected.')
  }
  if (phone.kind !== 'demo' && (phone.hookIds || []).length) {
    try { gateway.removeHooks(env, await credentials(env, phone), phone.hookIds) } catch {}
  }
  ds(env).delete('phones', { id: phone.id })
}

// Each member's live updates travel on a channel named with a random
// secret that only they are given (the guide's private: channels need a
// realtime policy this app doesn't assume).
export function channel(env, ownerId) {
  const kv = env.holm.app.kv
  let name = kv.get(`chan:${ownerId}`)
  if (!name) {
    name = 'sd-' + random(24)
    kv.set(`chan:${ownerId}`, name)
  }
  return name
}

export function notify(env, ownerId, data) {
  const name = env.holm.app.kv.get(`chan:${ownerId}`)
  if (name) {
    try { env.holm.realtime.broadcast(name, data) } catch {}
  }
}
