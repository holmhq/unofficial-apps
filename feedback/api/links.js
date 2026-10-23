// Inbox links: an owner (signed in, or a script with a key) asks for a link
// that opens one project's inbox without signing in. The link opens once,
// within 5 minutes, and becomes a session that locks after 5 idle minutes,
// and after 8 hours whatever happens. Only hashes of the link and the
// session are stored (the session's as `sid`: Holm's DS reserves `session`).
import { ds, now, iso, reject, random } from './lib.js'
import { sha256, header } from './keys.js'
import { ownProject } from './projects.js'

const OPEN_MS = 5 * 60000
// The page locks after 5 idle minutes and tells the server at most every
// 30 s that someone is there, so the server waits those 30 s longer.
export const IDLE_MS = 5 * 60000
const GRACE_MS = 30000
const MAX_MS = 8 * 3600000
const MAX_WAITING = 20
const COOKIE = 'fb_link'

const cookie = (value, seconds) => `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${seconds}`

// Unopened links past their 5 minutes and sessions past either limit.
function prune() {
  const at = now()
  ds().delete('links', { $or: [{ endsAt: { $lt: at } }, { lastSeenAt: { $lt: at - IDLE_MS - GRACE_MS } }] })
}

export async function mintLink(user, projectId, origin) {
  const project = ownProject(user, projectId)
  prune()
  if (ds().count('links', { project: project.id, spent: false }) >= MAX_WAITING) reject(429, 'too_many_links', 'Too many unopened links for this project. Try again in a few minutes.')
  const token = random(32)
  const at = now()
  ds().insert('links', {
    id: random(16), project: project.id, ownerId: user.id, ownerName: user.name, ownerAvatar: user.avatar,
    token: await sha256(token), sid: '', spent: false, createdAt: at, lastSeenAt: at, endsAt: at + OPEN_MS
  })
  return { url: `${origin}/v/${token}`, expiresAt: iso(at + OPEN_MS) }
}

// Spends the link: only the first open wins, even if two arrive at once.
export async function openLink(input) {
  const token = typeof input.token === 'string' && /^[a-z0-9]{32}$/.test(input.token) ? input.token : null
  const doc = token && ds().findOne('links', { token: await sha256(token) })
  const at = now()
  const gone = () => reject(410, 'link_used', 'This link has expired or was already opened. Open the inbox again from your app.')
  if (!doc || doc.spent || doc.endsAt < at) gone()
  const session = random(32)
  const claim = ds().update('links', { id: doc.id }, { $set: { spent: true, sid: await sha256(session), lastSeenAt: at, endsAt: at + MAX_MS } }, { ifRevision: doc._rev })
  if (!claim.ok || !claim.count) gone()
  return { project: doc.project, idleMs: IDLE_MS, endsInMs: MAX_MS, cookie: cookie(session, MAX_MS / 1000) }
}

async function session(request) {
  const value = (header(request, 'cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1)
  if (!/^[a-z0-9]{32}$/.test(value || '')) return null
  return ds().findOne('links', { sid: await sha256(value) })
}

const live = (doc, at) => doc && doc.spent && at - doc.lastSeenAt <= IDLE_MS + GRACE_MS && at < doc.endsAt

// The page's session, which acts for the owner on one project's inbox. Each
// call counts as someone being there.
export async function linkUser(request) {
  const doc = await session(request)
  const at = now()
  if (!live(doc, at)) reject(401, 'link_locked', 'This inbox is locked. Open it again from your app.')
  ds().update('links', { id: doc.id }, { $set: { lastSeenAt: at } })
  return { id: doc.ownerId, name: doc.ownerName, avatar: doc.ownerAvatar, project: doc.project, endsInMs: doc.endsAt - at }
}

export async function linkState(request) {
  try {
    const user = await linkUser(request)
    return { project: user.project, idleMs: IDLE_MS, endsInMs: user.endsInMs }
  } catch (error) {
    if (error.code === 'link_locked') return null
    throw error
  }
}

// Locking ends the session at once, whether or not it is still live.
export async function closeLink(request) {
  const doc = await session(request)
  if (doc) ds().delete('links', { id: doc.id })
  return cookie('', 0)
}
