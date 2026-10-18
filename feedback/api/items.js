// Feedback items: sent by anyone through a project's widget, triaged by the
// project's owner, and shown on the public board only when the owner says so.
import { ds, kv, now, iso, text, reject, random, member, profile } from './lib.js'
import { findProject, ownProject } from './projects.js'

export const KINDS = ['bug', 'idea', 'question']
export const STATUSES = ['new', 'planned', 'progress', 'done', 'closed']
const HOURLY_LIMIT = 120
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

function itemDTO(doc) {
  return {
    id: doc.id, number: doc.number, kind: doc.kind, status: doc.status, public: !!doc.public,
    title: doc.title, body: doc.body, email: doc.email || '', page: doc.page || '', pageTitle: doc.pageTitle || '',
    browser: doc.browser || '', viewport: doc.viewport || '', votes: doc.votes || 0,
    createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt)
  }
}

// What the public board shows: never the email, page or browser.
const boardDTO = doc => ({ id: doc.id, number: doc.number, kind: doc.kind, status: doc.status, title: doc.title, body: doc.body, votes: doc.votes || 0, createdAt: iso(doc.createdAt) })

// The page an item came from, without its query or fragment, which can carry
// tokens the sender never meant to share.
function page(value) {
  try {
    const url = new URL(String(value || ''))
    return /^https?:$/.test(url.protocol) ? (url.origin + url.pathname).slice(0, 500) : ''
  } catch { return '' }
}

export function submit(projectId, input, request) {
  const project = findProject(projectId)
  if (!project) reject(404, 'not_found', 'This feedback form isn’t set up.')
  // A filled-in hidden field means a bot; it is told the item was sent.
  if (input.website) return { sent: true }
  const from = page(input.url)
  if (project.origins.length && !project.origins.includes(from ? new URL(from).origin : '')) {
    reject(403, 'site_not_allowed', 'This site isn’t allowed to send feedback to this project.')
  }
  const hour = new Date(now()).toISOString().slice(0, 13)
  if (kv().increment(`rate:${project.id}:${hour}`, 1) > HOURLY_LIMIT) reject(429, 'busy', 'Too much feedback this hour. Try again later.')
  const words = text(input.body, 4000, true)
  if (words.length < 3) reject(400, 'invalid_body', 'Write a few words first.')
  const email = text(input.email, 200)
  if (email && !EMAIL.test(email)) reject(400, 'invalid_email', 'That email address doesn’t look right.')
  const agent = (request.headers && (request.headers['User-Agent'] || request.headers['user-agent'])) || ''
  const doc = {
    id: random(24),
    project: project.id,
    number: kv().increment('seq:' + project.id, 1),
    kind: KINDS.includes(input.kind) ? input.kind : 'idea',
    status: 'new', public: false, votes: 0,
    title: words.split('\n')[0].slice(0, 90),
    body: words, email,
    page: from, pageTitle: text(input.title, 200),
    browser: text(Array.isArray(agent) ? agent[0] : agent, 300),
    viewport: /^\d{2,5}x\d{2,5}$/.test(input.viewport || '') ? input.viewport : '',
    createdAt: now(), updatedAt: now()
  }
  ds().insert('items', doc)
  return { sent: true, number: doc.number }
}

export function listItems(projectId) {
  const project = ownProject(projectId)
  return ds().find('items', { project: project.id }, { limit: 500, orderBy: 'createdAt', order: 'desc' }).map(itemDTO)
}

function ownItem(id) {
  const doc = typeof id === 'string' && id.length <= 64 ? ds().findOne('items', { id }) : null
  if (!doc) reject(404, 'not_found', 'Item not found.')
  ownProject(doc.project)
  return doc
}

export function updateItem(id, input) {
  const doc = ownItem(id)
  const changes = { updatedAt: now() }
  if ('status' in input) changes.status = STATUSES.includes(input.status) ? input.status : reject(400, 'invalid_status', 'Unknown status.')
  if ('kind' in input) changes.kind = KINDS.includes(input.kind) ? input.kind : reject(400, 'invalid_kind', 'Unknown kind.')
  if ('public' in input) changes.public = input.public === true
  if ('title' in input) changes.title = text(input.title, 90) || doc.title
  ds().update('items', { id: doc.id }, { $set: changes })
  return itemDTO(ds().findOne('items', { id: doc.id }))
}

export function deleteItem(id) {
  const doc = ownItem(id)
  ds().delete('notes', { item: doc.id })
  ds().delete('items', { id: doc.id })
}

// Notes are the owner's own, never shown to the sender or the board.
export function listNotes(itemId) {
  const doc = ownItem(itemId)
  return ds().find('notes', { item: doc.id }, { limit: 200, orderBy: 'createdAt', order: 'asc' })
    .map(note => ({ id: note.id, name: note.name, avatar: note.avatar, body: note.body, createdAt: iso(note.createdAt) }))
}

export function addNote(itemId, input) {
  const doc = ownItem(itemId)
  const words = text(input.body, 4000, true)
  if (!words) reject(400, 'invalid_note', 'Write a note first.')
  const who = profile(member())
  ds().insert('notes', { id: random(24), item: doc.id, project: doc.project, name: who.name, avatar: who.avatar, body: words, createdAt: now() })
  return listNotes(itemId)
}

// The public board: the items an owner has made public, by status.
export function board(projectId) {
  const project = findProject(projectId)
  if (!project || !project.public) reject(404, 'not_found', 'This board isn’t public.')
  const items = ds().find('items', { project: project.id, public: true }, { limit: 300, orderBy: 'createdAt', order: 'desc' })
  return { project: { id: project.id, name: project.name, color: project.color }, items: items.map(boardDTO) }
}

// One vote per browser: the board keeps a random token in local storage and
// the server remembers which tokens voted. Light, not tamper-proof.
export function vote(projectId, itemId, input) {
  const project = findProject(projectId)
  if (!project || !project.public) reject(404, 'not_found', 'This board isn’t public.')
  const doc = typeof itemId === 'string' && itemId.length <= 64 ? ds().findOne('items', { id: itemId }) : null
  if (!doc || doc.project !== project.id || !doc.public) reject(404, 'not_found', 'Item not found.')
  const voter = /^[a-z0-9]{16,40}$/.test(input.voter || '') ? input.voter : reject(400, 'invalid_voter', 'Missing voter token.')
  const key = `vote:${doc.id}:${voter}`
  if (!kv().get(key)) {
    kv().set(key, 1)
    ds().update('items', { id: doc.id }, { $inc: { votes: 1 } })
  }
  return { votes: ds().findOne('items', { id: doc.id }).votes || 0, voted: true }
}
