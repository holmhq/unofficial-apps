// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"), and each one only ever sees the
// caller's own phone, conversations and drafts.
//
// No tool sends a text. Sending calls out to the person's phone, which named operations
// can't do, and a text on someone's own number can't be taken back. drafts_create leaves a
// draft that the open Zend page shows at once; the person checks it there and taps Send
// (drafts.js).

import { HttpError, iso } from './lib.js'
import { normalizePhone, formatPhone } from './sms.js'
import { findPhone, publicPhone, notify } from './phone.js'
import { rename } from './messages.js'
import { templates } from './lists.js'
import { limits, usage } from './guard.js'
import * as drafts from './drafts.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 422: 'APP_INVALID_INPUT', 429: 'APP_RATE_LIMITED' }

// The signed-in caller, and Zend's own errors as the contract's: same message, no details.
async function op(env, run) {
  try {
    const member = env.holm.auth.getMember()
    if (!member || !member.id) throw new HttpError(401, 'sign_in', 'Sign in to Zend first.')
    return await run(member.id)
  } catch (error) {
    if (error instanceof HttpError) {
      const out = new Error(error.message)
      out.code = CODES[error.status] || 'APP_INVALID_INPUT'
      out.status = error.status === 422 ? 400 : error.status
      out.public = true
      throw out
    }
    throw error
  }
}

const ds = (env) => env.holm.app.ds
const count = (value, min, max, fallback) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback)
const origin = (env) => env.holm.app.kv.get('site:origin') || ''
const link = (env, path) => (origin(env) ? origin(env) + path : undefined)
const chatLink = (env, number) => link(env, '/t/' + encodeURIComponent(number))
const nameOf = (t) => (t && t.name) || formatPhone(t.number)

// A conversation by its number (any usual form) or the name the person gave it.
function chatOf(env, ownerId, value) {
  const raw = String(value || '').trim()
  if (!raw) throw new HttpError(400, 'chat', 'Say which conversation: a number, or the name you gave it.')
  const number = normalizePhone(raw)
  const rows = number
    ? ds(env).find('threads', { ownerId, number }, { limit: 1 })
    : ds(env).find('threads', { ownerId }, { limit: 500 }).filter(t => t.name && t.name.toLowerCase() === raw.toLowerCase())
  if (rows.length > 1) throw new HttpError(409, 'ambiguous', `More than one conversation is called “${raw}”. Use its number from chats_list.`)
  if (!rows.length) throw new HttpError(404, 'not_found', number ? 'No conversation with that number yet.' : 'No conversation by that name. Use chats_list to find it.')
  return rows[0]
}

function chatBrief(env, t, blocked) {
  return {
    number: t.number,
    name: t.name || undefined,
    unread: t.unread || undefined,
    last: t.lastAt ? { from: t.lastDir === 'in' ? 'them' : 'you', text: t.lastBody, at: iso(t.lastAt), state: t.lastDir === 'out' ? t.lastState : undefined } : undefined,
    opted_out: blocked && blocked.has(t.number) ? true : undefined,
    open: chatLink(env, t.number)
  }
}

function textBrief(m, who) {
  const out = m.dir === 'out'
  return {
    id: m.id,
    from: out ? 'you' : who,
    text: m.body,
    at: iso(m.at),
    state: out ? m.state : undefined,
    error: m.error || undefined,
    sends_at: m.scheduleAt && m.state === 'scheduled' ? iso(m.scheduleAt) : undefined,
    sim: m.sim || undefined
  }
}

function draftBrief(env, d, names) {
  return {
    id: d.id,
    to: d.to.map(n => (names.get(n) ? `${names.get(n)} (${formatPhone(n)})` : formatPhone(n))),
    text: d.body,
    sim: d.sim || undefined,
    sends_at: d.scheduleAt ? iso(d.scheduleAt) : undefined,
    reads_like_business: d.business || undefined,
    drafted: iso(d.at),
    expires: iso(d.expiresAt),
    open: link(env, '/new?draft=' + encodeURIComponent(d.id))
  }
}

const names = (env, ownerId) => new Map(ds(env).find('threads', { ownerId }, { limit: 500 }).filter(t => t.name).map(t => [t.number, t.name]))

/* ---- Conversations ---------------------------------------------------- */

export function chatsList(input, env) {
  return op(env, (id) => {
    const blocked = new Set(ds(env).find('optouts', { ownerId: id }, { limit: 1000 }).map(o => o.number))
    let rows = ds(env).find('threads', { ownerId: id }, { limit: 500 }).filter(t => t.lastAt).sort((a, b) => b.lastAt - a.lastAt)
    if (input.unread) rows = rows.filter(t => t.unread > 0)
    const q = String(input.search || '').trim().toLowerCase()
    if (q) {
      const digits = q.replace(/\D/g, '')
      rows = rows.filter(t => (t.name || '').toLowerCase().includes(q) || (digits.length > 2 && t.number.includes(digits)) || (t.lastBody || '').toLowerCase().includes(q))
    }
    const limit = count(input.limit, 1, 100, 30)
    return {
      chats: rows.slice(0, limit).map(t => chatBrief(env, t, blocked)),
      more: rows.length > limit ? rows.length - limit : undefined,
      drafts_waiting: drafts.waiting(env, id).length || undefined
    }
  })
}

// Newest first in pages, shown oldest first. Reading here doesn't mark anything read.
export function messagesList(input, env) {
  return op(env, (id) => {
    const t = chatOf(env, id, input.chat)
    const options = { page: true, limit: count(input.limit, 1, 60, 20), orderBy: 'at', order: 'desc' }
    if (input.before) options.cursor = String(input.before)
    const page = ds(env).find('messages', { ownerId: id, number: t.number }, options)
    const who = nameOf(t)
    return {
      chat: chatBrief(env, t, null),
      opted_out: ds(env).findOne('optouts', { ownerId: id, number: t.number }) ? true : undefined,
      texts: page.rows.slice().reverse().map(m => textBrief(m, who)),
      before: page.cursor || undefined
    }
  })
}

// Replies not read yet, conversation by conversation, oldest first in each.
export function messagesUnread(input, env) {
  return op(env, (id) => {
    const rows = ds(env).find('threads', { ownerId: id, unread: { $gt: 0 } }, { limit: 500 }).sort((a, b) => b.lastAt - a.lastAt)
    const shown = rows.slice(0, count(input.chats, 1, 20, 10))
    const most = count(input.limit, 1, 50, 10)
    return {
      chats: shown.map(t => {
        const texts = ds(env).find('messages', { ownerId: id, number: t.number, dir: 'in' }, { limit: Math.min(most, t.unread), orderBy: 'at', order: 'desc' })
        return { ...chatBrief(env, t, null), texts: texts.reverse().map(m => textBrief(m, nameOf(t))) }
      }),
      more_chats: rows.length > shown.length ? rows.length - shown.length : undefined
    }
  })
}

export function chatsRead(input, env) {
  return op(env, (id) => {
    const t = chatOf(env, id, input.chat)
    if (t.unread) ds(env).update('threads', { id: t.id }, { $set: { unread: 0 } })
    // The person's open Zend pages reload their list, so the badge clears there too.
    notify(env, id, { type: 'update', numbers: [t.number] })
    return { chat: chatBrief(env, { ...t, unread: 0 }, null) }
  })
}

// By number, which may have no conversation yet, or by the name it has now.
export function chatsRename(input, env) {
  return op(env, (id) => {
    const number = normalizePhone(input.chat) || chatOf(env, id, input.chat).number
    const done = rename(env, id, number, input.name)
    notify(env, id, { type: 'update', numbers: [number] })
    return { number: done.number, name: done.name || undefined }
  })
}

/* ---- Phone and templates ------------------------------------------------ */

export function phoneGet(input, env) {
  return op(env, (id) => {
    const l = limits()
    const use = usage(env, id)
    const phone = publicPhone(findPhone(env, id))
    return {
      phone: phone ? {
        kind: phone.kind === 'demo' ? 'demo phone' : 'Android phone',
        name: phone.name,
        last_seen: phone.kind === 'demo' ? undefined : iso(phone.lastSeen),
        sims: phone.sims.length ? phone.sims.map(s => ({ slot: s.slot, carrier: s.carrier || undefined })) : undefined,
        default_sim: phone.defaultSim || undefined,
        live_receipts: phone.live
      } : null,
      note: phone ? undefined : 'No phone is connected. The person connects one in Zend, under Phone.',
      last_24_hours: { texts: use.texts, people: use.people },
      limits: {
        texts_a_day: l.perDay, people_a_day: l.people, numbers_per_text: l.perText, texts_a_minute: l.perMinute,
        same_text: l.similar.map(s => `${s.max} in ${s.label}`)
      },
      drafts_waiting: drafts.waiting(env, id).length,
      open: link(env, '/phone')
    }
  })
}

export function templatesList(input, env) {
  return op(env, (id) => ({
    templates: templates(env, id).map(t => ({
      id: t.id, name: t.name, text: t.body, blanks: t.check.vars.map(v => v.type), uses: t.uses || undefined
    }))
  }))
}

/* ---- Drafts --------------------------------------------------------------- */

export function draftsCreate(input, env) {
  return op(env, (id) => {
    const made = drafts.create(env, id, { to: input.to, body: input.text, sim: input.sim, scheduleAt: input.send_at })
    const d = draftBrief(env, made.draft, names(env, id))
    return {
      draft: d,
      sms: made.parts,
      sent: false,
      next: 'Nothing has been sent. The person opens the link, or Zend, where the draft waits at the top of Chats, checks it and taps Send.' +
        (made.draft.business ? ' It reads like a business message, so Zend will ask them to confirm it’s personal first.' : '')
    }
  })
}

export function draftsList(input, env) {
  return op(env, (id) => {
    const map = names(env, id)
    return { drafts: drafts.waiting(env, id).map(d => draftBrief(env, d, map)) }
  })
}

export function draftsDiscard(input, env) {
  return op(env, (id) => {
    const d = drafts.discard(env, id, input.draft)
    return { discarded: d.id }
  })
}
