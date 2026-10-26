// Sandesh's server. Signed-in members connect a phone and text from the
// page; their API keys text from scripts; their phone reports back through
// signed webhooks.
//
// Page (signed in, same origin):
//   GET    /api/me                       who is signed in, sign-in/out URLs, live channel
//   GET    /api/state                    phone, today's usage and the limits
//   POST   /api/phone                    connect a phone { username, password, signingKey?, declare }
//   POST   /api/phone/demo               connect the demo phone { declare }
//   POST   /api/phone/check              ask SMSGate how the phone is
//   PATCH  /api/phone                    { signingKey?, defaultSim? }
//   POST   /api/phone/live               turn on live receipts and replies
//   DELETE /api/phone                    forget the phone
//   GET    /api/threads                  conversations
//   GET    /api/threads/:number          one conversation (?before= pages back)
//   PATCH  /api/threads/:number          { name }
//   DELETE /api/threads/:number          delete a conversation
//   POST   /api/messages                 send { to, body | template: { id, vars }, sim?, scheduleAt?, personal? }
//   POST   /api/messages/refresh         catch up on receipts { number? }
//   DELETE /api/messages/:id             cancel a scheduled or queued text
//   GET    /api/templates, POST, PATCH /api/templates/:id, DELETE
//   GET    /api/optouts, POST { number }, DELETE /api/optouts/:number
//   GET    /api/keys, POST { name, allow? }, DELETE /api/keys/:id
//   DELETE /api/account                  delete everything Sandesh keeps for you
//
// API (Authorization: Bearer sd_…):
//   POST   /api/v1/messages              { to, body | template: { id, vars }, sim?, scheduleAt? }
//   GET    /api/v1/messages              recent texts (?limit=)
//   GET    /api/v1/messages/:id          one text, with each number's state
//   GET    /api/v1/replies               texts received (?since=)
//   GET    /api/v1/templates             saved templates
//
// Phone: POST /hooks/:token             signed receipts and replies (hooks.js)

import { HttpError, json, failure, readJSON, requireMember, displayName, now } from './lib.js'
import * as phones from './phone.js'
import * as messages from './messages.js'
import * as keys from './keys.js'
import * as lists from './lists.js'
import { limits, usage } from './guard.js'
import { vaultReady } from './vault.js'
import { receive } from './hooks.js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (path.startsWith('/hooks/')) return await receive(request, env, path.slice(7))
      if (path.startsWith('/api/v1/')) return await api(request, env, url)
      if (path.startsWith('/api/')) return await page(request, env, url)
      return env.holm.web.fetch(request)
    } catch (error) {
      if (error instanceof HttpError) return failure(error)
      env.holm.log.error(`${request.method} ${path}: ${error && error.stack || error}`)
      return json({ error: { code: 'server_error', message: 'Something went wrong on our side. Try again.' } }, 500)
    }
  }
}

const notFound = () => { throw new HttpError(404, 'not_found', 'No such route.') }
const match = (path, re) => {
  const m = re.exec(path)
  return m ? m.slice(1).map(decodeURIComponent) : null
}

/* ---- The page's routes ----------------------------------------------- */

async function page(request, env, url) {
  const { auth } = env.holm
  const path = url.pathname
  const method = request.method
  const route = `${method} ${path}`

  if (route === 'GET /api/me') {
    const member = auth.getMember()
    const next = url.searchParams.get('next') || '/'
    return json({
      member: member ? { name: displayName(member), picture: member.picture || null } : null,
      admin: member ? auth.isAppAdmin() : false,
      channel: member ? phones.channel(env, member.id) : null,
      loginURL: auth.getLoginURL(next.startsWith('/') && !next.startsWith('//') ? next : '/'),
      logoutURL: auth.getLogoutURL()
    })
  }

  const me = requireMember(env)
  const id = me.id
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readJSON(request) : {}

  if (route === 'GET /api/state') return json(state(env, id))

  if (route === 'POST /api/phone') return json({ phone: phones.publicPhone(await phones.connect(env, me, body)) }, 201)
  if (route === 'POST /api/phone/demo') return json({ phone: phones.publicPhone(await phones.connectDemo(env, me, body)) }, 201)
  if (route === 'POST /api/phone/check') return json({ phone: phones.publicPhone(await phones.check(env, id)) })
  if (route === 'PATCH /api/phone') return json({ phone: phones.publicPhone(await phones.update(env, id, body)) })
  if (route === 'POST /api/phone/live') return json({ phone: phones.publicPhone(await phones.goLive(env, id, url.origin)) })
  if (route === 'DELETE /api/phone') {
    await phones.disconnect(env, id)
    return json({ ok: true })
  }

  if (route === 'GET /api/threads') return json({ threads: messages.threads(env, id) })
  const t = match(path, /^\/api\/threads\/([^/]+)$/)
  if (t) {
    if (method === 'GET') return json(messages.thread(env, id, t[0], url.searchParams.get('before')))
    if (method === 'PATCH') return json(messages.rename(env, id, t[0], body.name))
    if (method === 'DELETE') {
      messages.forget(env, id, t[0])
      return json({ ok: true })
    }
  }

  if (route === 'POST /api/messages') {
    const sent = await messages.send(env, id, body, { source: 'web' })
    return json({ ...sent, usage: usageSummary(env, id) }, 201)
  }
  if (route === 'POST /api/messages/refresh') return json({ changed: await messages.refresh(env, id, body.number) })
  const m = match(path, /^\/api\/messages\/([^/]+)$/)
  if (m && method === 'DELETE') return json({ message: await messages.cancel(env, id, m[0]) })

  if (route === 'GET /api/templates') return json({ templates: lists.templates(env, id) })
  if (route === 'POST /api/templates') return json({ template: lists.createTemplate(env, id, body) }, 201)
  const tp = match(path, /^\/api\/templates\/([^/]+)$/)
  if (tp && method === 'PATCH') return json({ template: lists.updateTemplate(env, id, tp[0], body) })
  if (tp && method === 'DELETE') {
    lists.deleteTemplate(env, id, tp[0])
    return json({ ok: true })
  }

  if (route === 'GET /api/optouts') return json({ optouts: lists.optouts(env, id) })
  if (route === 'POST /api/optouts') return json(lists.addOptout(env, id, body), 201)
  const o = match(path, /^\/api\/optouts\/([^/]+)$/)
  if (o && method === 'DELETE') {
    lists.removeOptout(env, id, o[0])
    return json({ ok: true })
  }

  if (route === 'GET /api/keys') return json({ keys: keys.list(env, id) })
  if (route === 'POST /api/keys') return json(await keys.create(env, id, body), 201)
  const k = match(path, /^\/api\/keys\/([^/]+)$/)
  if (k && method === 'DELETE') {
    keys.remove(env, id, k[0])
    return json({ ok: true })
  }

  if (route === 'DELETE /api/account') {
    await phones.disconnect(env, id, { quiet: true })
    const ds = env.holm.app.ds
    for (const name of ['messages', 'threads', 'templates', 'optouts', 'apikeys']) ds.delete(name, { ownerId: id })
    env.holm.app.kv.delete(`chan:${id}`)
    return json({ ok: true })
  }

  return notFound()
}

function usageSummary(env, ownerId) {
  const use = usage(env, ownerId)
  return { texts: use.texts, people: use.people }
}

function state(env, ownerId) {
  const l = limits()
  const ds = env.holm.app.ds
  return {
    phone: phones.publicPhone(phones.findPhone(env, ownerId)),
    vault: vaultReady(env),
    declaration: phones.DECLARATION,
    usage: usageSummary(env, ownerId),
    limits: { perText: l.perText, perMinute: l.perMinute, perDay: l.perDay, people: l.people, similar: l.similar.map(s => ({ max: s.max, window: s.label })) },
    counts: {
      templates: ds.count('templates', { ownerId }),
      keys: ds.count('apikeys', { ownerId }),
      optouts: ds.count('optouts', { ownerId })
    },
    now: new Date(now()).toISOString()
  }
}

/* ---- The API --------------------------------------------------------- */

async function api(request, env, url) {
  const key = await keys.authenticate(env, request)
  const id = key.ownerId
  const path = url.pathname
  const route = `${request.method} ${path}`

  if (route === 'POST /api/v1/messages') {
    // An Idempotency-Key makes a retry safe: the same key within 24 hours
    // returns the first answer instead of texting again.
    const idem = (request.headers.get('idempotency-key') || '').trim()
    if (idem && !/^[\x21-\x7e]{1,128}$/.test(idem)) throw new HttpError(400, 'idempotency_key', 'Idempotency-Key must be 1–128 visible ASCII characters.')
    const slot = idem ? `idem:${key.id}:${idem}` : null
    const kv = env.holm.app.kv
    const earlier = slot ? kv.get(slot) : null
    if (earlier) return json(earlier, 200, { 'idempotent-replayed': 'true' })
    const input = await readJSON(request)
    const sent = await messages.send(env, id, { to: input.to, body: input.body, template: input.template, sim: input.sim, scheduleAt: input.scheduleAt }, { source: 'api', key })
    keys.counted(env, key, sent.messages.length)
    const answer = messages.group(env, id, sent.id)
    if (slot) kv.set(slot, answer, 86400000)
    return json(answer, 202)
  }
  if (route === 'GET /api/v1/messages') return json({ messages: messages.recent(env, id, url.searchParams.get('limit')) })
  const m = match(path, /^\/api\/v1\/messages\/([^/]+)$/)
  if (m && request.method === 'GET') {
    await messages.refresh(env, id).catch(() => {})
    return json(messages.group(env, id, m[0]))
  }
  if (route === 'GET /api/v1/replies') return json({ replies: messages.replies(env, id, url.searchParams.get('since')) })
  if (route === 'GET /api/v1/templates') {
    return json({ templates: lists.templates(env, id).map(t => ({ id: t.id, name: t.name, body: t.body, blanks: t.check.vars.map(v => v.type) })) })
  }
  return notFound()
}
