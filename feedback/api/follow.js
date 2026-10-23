// Following an item: someone who left an email confirms it with a one-time
// code, and from then on feedback treats that address as theirs. Signed in
// with it, they see everything they sent and confirmed, on every project
// ("Your feedback"). An address nobody confirmed stays on the item as typed,
// but feedback never emails it and never ties it to an account.
//
// The form gets a follow token as the item is saved, asks for a code
// (follow.send, behind Holm's challenge and rate limit, and at most
// PER_HOUR codes an hour to one address), then checks it (follow.verify).
import { ds, kv, now, iso, text, reject, random, member, requireMember, profile } from './lib.js'
import { holm } from './_holm.js'
import { sha256 } from './keys.js'
import { findProject, iconOf } from './projects.js'
import { pictureURL } from './page.js'

const FOLLOW_MS = 30 * 60000
const CODE_MS = 10 * 60000
const TRIES = 5
const PER_HOUR = 3

export const norm = email => String(email || '').trim().toLowerCase()
const tokenOf = input => typeof input.token === 'string' && /^[a-z0-9]{32}$/.test(input.token) ? input.token : null

// As an item with an email is saved. `store` is the caller's KV.
export function followToken(store, item) {
  if (!item.email) return null
  const token = random(32)
  store.set('follow:' + token, { item: item.id }, FOLLOW_MS)
  return token
}

function followed(token) {
  const follow = token && kv().get('follow:' + token)
  const item = follow && ds().findOne('items', { id: follow.item })
  if (!item || !item.email) reject(404, 'not_found', 'This can’t be followed any more. Send it again to follow it.')
  return item
}

export async function sendCode(input) {
  const token = tokenOf(input)
  const item = followed(token)
  if (item.emailVerified) return { sent: false, verified: true }
  const hour = new Date(now()).toISOString().slice(0, 13)
  if (kv().increment(`codes:${norm(item.email)}:${hour}`, 1) > PER_HOUR) reject(429, 'too_many_codes', 'Too many codes for this address this hour. Try again later.')
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
  const expiresAt = now() + CODE_MS
  kv().set('code:' + token, { hash: await sha256(`${token}:${code}`), tries: 0, expiresAt }, CODE_MS)
  const name = findProject(item.project)?.name || 'the team'
  const lines = [
    `Your code is ${code}.`,
    `Enter it in the form to follow what you sent to ${name}. You'll get their replies by email, and when you sign in to https://feedback.zyt.app/mine with this address you'll see everything you've sent.`,
    'It works for 10 minutes.',
    `If you didn't send feedback to ${name}, ignore this email.`
  ]
  let sent
  try {
    sent = holm.email.send({ to: item.email, subject: `${code} is your code to follow your feedback`, body: lines.join('\n\n') })
  } catch (error) {
    console.error('code email', String(error && error.message || error))
  }
  if (!sent || sent.ok === false) {
    kv().delete('code:' + token)
    reject(502, 'email_failed', 'The code couldn’t be sent. Try again in a moment.')
  }
  return { sent: true, expiresIn: CODE_MS / 1000 }
}

export async function verifyCode(input) {
  const token = tokenOf(input)
  const pending = token && kv().get('code:' + token)
  if (!pending || pending.expiresAt < now()) reject(410, 'code_expired', 'That code has expired. Send a new one.')
  const item = followed(token)
  if (await sha256(`${token}:${String(input.code || '').replace(/\D/g, '')}`) !== pending.hash) {
    const left = TRIES - pending.tries - 1
    if (left <= 0) {
      kv().delete('code:' + token)
      reject(410, 'code_expired', 'Too many tries. Send a new code.')
    }
    kv().set('code:' + token, { ...pending, tries: pending.tries + 1 }, pending.expiresAt - now())
    reject(400, 'wrong_code', `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
  }
  ds().update('items', { id: item.id }, { $set: { emailVerified: true, emailNorm: norm(item.email) } })
  kv().delete('code:' + token)
  kv().delete('follow:' + token)
  return { verified: true }
}

// The sender's side of an item's thread: the team's replies (as the
// project) and their own, never the team's notes or events.
function conversations(ids) {
  const byItem = new Map(ids.map(id => [id, []]))
  if (ids.length) {
    for (const note of ds().find('notes', { item: { $in: ids }, type: { $in: ['out', 'in'] } }, { limit: 1000, orderBy: 'createdAt', order: 'asc' })) {
      byItem.get(note.item)?.push({ id: note.id, from: note.type === 'in' ? 'you' : 'team', body: note.body, createdAt: iso(note.createdAt) })
    }
  }
  return byItem
}

// A team reply, emailed to the confirmed address with a link to stop them.
// Replies to the email itself don't reach feedback, and it says so.
export function emailReply(item, words, origin) {
  const name = findProject(item.project)?.name || 'The team'
  let stop = item.stop
  if (!stop) {
    stop = random(24)
    ds().update('items', { id: item.id }, { $set: { stop } })
  }
  const body = [
    `${name} replied to what you sent:`,
    words,
    `You wrote: "${item.title}"`,
    `To reply, or to see everything you've sent, sign in with this address at ${origin}/mine. Replies to this email don't reach them.`,
    `Stop emails about this: ${origin}/stop/${stop}`
  ].join('\n\n')
  try {
    const sent = holm.email.send({ to: item.email, subject: `${name} replied: ${item.title}`.slice(0, 150), body })
    return !!sent && sent.ok !== false
  } catch (error) {
    console.error('reply email', String(error && error.message || error))
    return false
  }
}

// The signed-in sender answers on their own item.
export function senderReply(itemId, input) {
  const email = norm(requireMember().email)
  const doc = email && ds().findOne('items', { id: String(itemId), emailNorm: email, emailVerified: true })
  if (!doc) reject(404, 'not_found', 'Not found.')
  const words = text(input.body, 4000, true)
  if (!words) reject(400, 'invalid_reply', 'Write a reply first.')
  const who = profile(member())
  ds().insert('notes', { id: random(24), item: doc.id, project: doc.project, type: 'in', name: who.name, avatar: who.avatar, body: words, createdAt: now() })
  ds().update('items', { id: doc.id }, { $inc: { notes: 1 } })
  ds().update('items', { id: doc.id }, { $set: { replyWaiting: true, updatedAt: now() } })
  return { conversation: conversations([doc.id]).get(doc.id) }
}

// One click from a reply email: no more emails about that item.
export function stopEmails(input) {
  const token = typeof input.token === 'string' && /^[a-z0-9]{24}$/.test(input.token) ? input.token : null
  const doc = token && ds().findOne('items', { stop: token })
  if (!doc) reject(404, 'not_found', 'This link doesn’t work any more.')
  ds().update('items', { id: doc.id }, { $set: { mute: true } })
  return { stopped: true, project: findProject(doc.project)?.name || '' }
}

// Everything the signed-in person sent and confirmed, newest first, by
// project. Never notes, contacts or anything else the team keeps.
export function mine() {
  const email = norm(requireMember().email)
  if (!email) return { email: '', projects: [] }
  const projects = new Map()
  const docs = ds().find('items', { emailNorm: email, emailVerified: true }, { limit: 200, orderBy: 'createdAt', order: 'desc' })
  const talk = conversations(docs.map(doc => doc.id))
  for (const doc of docs) {
    if (!projects.has(doc.project)) {
      const project = findProject(doc.project)
      if (!project) continue
      projects.set(doc.project, {
        id: project.id, name: project.name, color: project.color, icon: iconOf(project), logo: pictureURL(project, 'logo'), items: []
      })
    }
    projects.get(doc.project).items.push({
      id: doc.id, number: doc.number, kind: doc.kind === 'bug' ? 'issue' : doc.kind, status: doc.status,
      title: doc.title, body: doc.body, rating: doc.rating || null, createdAt: iso(doc.createdAt),
      emails: !doc.mute, conversation: talk.get(doc.id)
    })
  }
  return { email, projects: [...projects.values()] }
}
