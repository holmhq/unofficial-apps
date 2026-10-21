// Feedback items: sent by anyone through a project's widget, triaged by the
// project's owner, and shown on the public board only when the owner says so.
import { ds, kv, now, iso, text, reject, random, kindOf } from './lib.js'
import { holm } from './_holm.js'
import { findBoard, kindsOf, iconOf, projectFactory } from './projects.js'
import { fileFactory, remove, fileDTO, serve } from './files.js'
import { count, statsFactory } from './stats.js'
import { pictureURL } from './page.js'
import { contactOf, fieldsOf, ratingOf, answersFor, contactFor, ratingFor } from './form.js'

// Every kind there is; each project offers one set of three (KIND_SETS).
export const KINDS = ['issue', 'idea', 'question', 'praise', 'problem']
export const STATUSES = ['new', 'planned', 'progress', 'done', 'closed']
const HOURLY_LIMIT = 120
// The inbox reads the newest items in one go and filters them in the browser.
const INBOX_LIMIT = 1000

function itemDTO(doc) {
  return {
    id: doc.id, number: doc.number, kind: kindOf(doc.kind), status: doc.status, public: !!doc.public,
    title: doc.title, body: doc.body, rating: doc.rating || null, email: doc.email || '', phone: doc.phone || '', answers: doc.answers || [],
    page: doc.page || '', pageTitle: doc.pageTitle || '',
    browser: doc.browser || '', viewport: doc.viewport || '', votes: doc.votes || 0, source: doc.source || 'widget',
    files: (doc.files || []).map(fileDTO), comments: doc.comments || 0, pending: doc.pending || 0, notes: doc.notes || 0,
    createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt)
  }
}

// What the public board shows: never the email, page, browser or files.
const boardDTO = doc => ({ id: doc.id, number: doc.number, kind: kindOf(doc.kind), status: doc.status, title: doc.title, body: doc.body, votes: doc.votes || 0, comments: doc.comments || 0, createdAt: iso(doc.createdAt) })

// The page an item came from, without its query or fragment, which can carry
// tokens the sender never meant to share.
function page(value) {
  try {
    const url = new URL(String(value || ''))
    return /^https?:$/.test(url.protocol) ? (url.origin + url.pathname).slice(0, 500) : ''
  } catch { return '' }
}

// From a site's widget, or ("page") from the project's own public page,
// which the allowed-sites rule doesn't cover.
export function itemFactory(env) {
  const ds = () => env.holm.app.ds
  const kv = () => env.holm.app.kv
  const { findProject, ownProject } = projectFactory(env)
  const { uploads, store, remove } = fileFactory(env)
  const { count } = statsFactory(env)
  return { submit, submitToWidget, listItems, ownItem, updateItem }

function submit(project, input, request, source = 'widget') {
  // A filled-in hidden field means a bot; it is told the item was sent.
  if (input.website) return { sent: true }
  const from = source === 'page' ? '' : page(input.url)
  if (source !== 'page' && project.origins.length && !project.origins.includes(from ? new URL(from).origin : '')) {
    reject(403, 'site_not_allowed', 'This site isn’t allowed to send feedback to this project.')
  }
  const hour = new Date(now()).toISOString().slice(0, 13)
  if (kv().increment(`rate:${project.id}:${hour}`, 1) > HOURLY_LIMIT) reject(429, 'busy', 'Too much feedback this hour. Try again later.')
  const words = text(input.body, 4000, true)
  const answers = answersFor(project, input)
  const { email, phone } = contactFor(project, input)
  const rating = ratingFor(project, input)
  const checked = uploads(request, project)
  // A photo or a rating on its own is enough, for someone at a table in a hurry.
  if (words.length < 3 && !checked.length && !rating) reject(400, 'invalid_body', 'Write a few words, add a photo or pick a rating.')
  const pictures = checked.every(entry => entry.mime.startsWith('image/'))
  const untitled = checked.length ? `${checked.length} ${pictures ? 'photo' : 'file'}${checked.length === 1 ? '' : 's'}` : `Rated ${rating} out of 5`
  const kinds = kindsOf(project)
  const agent = (request.headers && (request.headers['User-Agent'] || request.headers['user-agent'])) || ''
  const id = random(24)
  const files = store(checked, project.id, id)
  const doc = {
    id,
    project: project.id,
    number: kv().increment('seq:' + project.id, 1),
    kind: kinds.includes(kindOf(input.kind)) ? kindOf(input.kind) : 'idea',
    status: 'new', public: false, votes: 0, comments: 0, pending: 0, source,
    title: words.split('\n')[0].slice(0, 90) || untitled,
    body: words, rating, email, phone, answers, files,
    page: from, pageTitle: source === 'page' ? '' : text(input.title, 200),
    browser: text(Array.isArray(agent) ? agent[0] : agent, 300),
    viewport: /^\d{2,5}x\d{2,5}$/.test(input.viewport || '') ? input.viewport : '',
    createdAt: now(), updatedAt: now()
  }
  try { ds().insert('items', doc) } catch (error) { remove(files); throw error }
  count(project.id, 'sent')
  return { sent: true, number: doc.number }
}

function submitToWidget(projectId, input, request) {
  const project = findProject(projectId)
  if (!project) reject(404, 'not_found', 'This feedback form isn’t set up.')
  return submit(project, input, request)
}

function listItems(user, projectId, status) {
  const project = ownProject(user, projectId)
  const query = { project: project.id }
  if (status === 'open') query.status = { $in: ['new', 'planned', 'progress'] }
  else if (STATUSES.includes(status)) query.status = status
  return ds().find('items', query, { limit: INBOX_LIMIT, orderBy: 'createdAt', order: 'desc' }).map(itemDTO)
}

function ownItem(user, id) {
  const doc = typeof id === 'string' && id.length <= 64 ? ds().findOne('items', { id }) : null
  if (!doc) reject(404, 'not_found', 'Item not found.')
  ownProject(user, doc.project)
  return doc
}

function updateItem(user, id, input) {
  const doc = ownItem(user, id)
  const changes = { updatedAt: now() }
  if ('status' in input) changes.status = STATUSES.includes(input.status) ? input.status : reject(400, 'invalid_status', 'Unknown status.')
  if ('kind' in input) changes.kind = KINDS.includes(kindOf(input.kind)) ? kindOf(input.kind) : reject(400, 'invalid_kind', 'Unknown kind.')
  if ('public' in input) changes.public = input.public === true
  if ('title' in input) changes.title = text(input.title, 90) || doc.title
  // The item's thread keeps who changed what, beside the notes.
  const said = []
  if (changes.status && changes.status !== doc.status) said.push(`marked it ${STATUS_NAMES[changes.status]}`)
  if (changes.kind && changes.kind !== kindOf(doc.kind)) said.push(`made it ${KIND_NAMES[changes.kind]}`)
  if ('public' in changes && changes.public !== !!doc.public) said.push(changes.public ? 'showed it on the public page' : 'took it off the public page')
  ds().transaction(tx => {
    tx.update('items', { id: doc.id }, { $set: changes })
    if (said.length) tx.insert('notes', { id: random(24), item: doc.id, project: doc.project, type: 'event', name: user.name, avatar: user.avatar, body: said.join(' and '), createdAt: now() })
  })
  return itemDTO(ds().findOne('items', { id: doc.id }))
}
}

export const submit = (...args) => itemFactory({ holm }).submit(...args)
export const submitToWidget = (...args) => itemFactory({ holm }).submitToWidget(...args)
export const listItems = (...args) => itemFactory({ holm }).listItems(...args)
const ownItem = (...args) => itemFactory({ holm }).ownItem(...args)
export const updateItem = (...args) => itemFactory({ holm }).updateItem(...args)

const STATUS_NAMES = { new: 'new', planned: 'planned', progress: 'in progress', done: 'done', closed: 'closed' }
const KIND_NAMES = { issue: 'an issue', idea: 'an idea', question: 'a question', praise: 'praise', problem: 'a problem' }

export function deleteItem(user, id) {
  const doc = ownItem(user, id)
  remove(doc.files)
  ds().delete('comments', { item: doc.id })
  ds().delete('notes', { item: doc.id })
  ds().delete('items', { id: doc.id })
}

export function itemFile(user, id, index, query = {}) {
  const doc = ownItem(user, id)
  const meta = (doc.files || [])[Number(index)]
  if (!meta || !/^\d+$/.test(String(index))) reject(404, 'not_found', 'That file is missing.')
  return serve(meta, query.preview === '1', query.download === '1')
}

// Notes are the owner's own, never shown to the sender or the board.
export function listNotes(user, itemId) {
  const doc = ownItem(user, itemId)
  return ds().find('notes', { item: doc.id }, { limit: 200, orderBy: 'createdAt', order: 'asc' })
    .map(note => ({ id: note.id, type: note.type || 'note', name: note.name, avatar: note.avatar, body: note.body, createdAt: iso(note.createdAt) }))
}

export function addNote(user, itemId, input) {
  const doc = ownItem(user, itemId)
  const words = text(input.body, 4000, true)
  if (!words) reject(400, 'invalid_note', 'Write a note first.')
  ds().transaction(tx => {
    tx.insert('notes', { id: random(24), item: doc.id, project: doc.project, name: user.name, avatar: user.avatar, body: words, createdAt: now() })
    tx.update('items', { id: doc.id }, { $inc: { notes: 1 } })
  })
  return listNotes(user, itemId)
}

// A public page's project, by custom address or id, if its owner made it public.
export function publicProject(key) {
  const project = findBoard(key)
  if (!project || !project.public) reject(404, 'not_found', 'There’s no public feedback page here.')
  return project
}

// The public page: the project, and the items its owner made public.
export function board(key, query = {}) {
  const project = publicProject(key)
  const items = ds().find('items', { project: project.id, public: true }, { limit: 300, orderBy: 'createdAt', order: 'desc' })
  // Links in QR codes and emails say so (?via=qr, ?via=email), so scans and
  // email visits count on their own as well.
  if (query.visit === '1') {
    count(project.id, 'visits')
    if (query.via === 'qr') count(project.id, 'scans')
    if (query.via === 'email') count(project.id, 'emails')
  }
  return {
    project: {
      id: project.id, name: project.name, color: project.color, slug: project.slug || null, title: project.title || '', intro: project.intro || '',
      icon: iconOf(project), logo: pictureURL(project, 'logo'), cover: pictureURL(project, 'cover'), attachments: project.attachments !== false, kinds: kindsOf(project),
      contact: contactOf(project), rating: ratingOf(project), fields: fieldsOf(project)
    },
    items: items.map(boardDTO)
  }
}

export function publicItem(project, itemId) {
  const doc = typeof itemId === 'string' && itemId.length <= 64 ? ds().findOne('items', { id: itemId }) : null
  if (!doc || doc.project !== project.id || !doc.public) reject(404, 'not_found', 'Item not found.')
  return doc
}

// One vote per browser: the board keeps a random token in local storage and
// the server remembers which tokens voted. Light, not tamper-proof.
export function vote(boardKey, itemId, input) {
  const project = publicProject(boardKey)
  const doc = publicItem(project, itemId)
  const voter = /^[a-z0-9]{16,40}$/.test(input.voter || '') ? input.voter : reject(400, 'invalid_voter', 'Missing voter token.')
  const key = `vote:${doc.id}:${voter}`
  if (!kv().get(key)) {
    kv().set(key, 1)
    ds().update('items', { id: doc.id }, { $inc: { votes: 1 } })
    count(project.id, 'votes')
  }
  return { votes: ds().findOne('items', { id: doc.id }).votes || 0, voted: true }
}
