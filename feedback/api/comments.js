// Public comments on board items. A visitor's comment waits for the owner's
// approval before anyone else sees it; the owner's own replies appear at
// once, under the project's name. Each item keeps two counts: `comments`
// (shown) and `pending` (waiting).
import { ds, kv, now, iso, text, reject, random } from './lib.js'
import { ownProject } from './projects.js'
import { count } from './stats.js'

const HOURLY_LIMIT = 60

const publicDTO = doc => ({ id: doc.id, name: doc.name, body: doc.body, team: !!doc.byOwner, createdAt: iso(doc.createdAt) })
const ownerDTO = doc => ({ ...publicDTO(doc), approved: !!doc.approved })

export function approvedComments(item) {
  return ds().find('comments', { item: item.id, approved: true }, { limit: 200, orderBy: 'createdAt', order: 'asc' }).map(publicDTO)
}

// From the public page. A filled-in hidden field means a bot; it is told
// the comment was sent.
export function postComment(project, item, input) {
  if (input.website) return { sent: true }
  const hour = new Date(now()).toISOString().slice(0, 13)
  if (kv().increment(`crate:${project.id}:${hour}`, 1) > HOURLY_LIMIT) reject(429, 'busy', 'Too many comments this hour. Try again later.')
  const words = text(input.body, 2000, true)
  if (words.length < 2) reject(400, 'invalid_body', 'Write a comment first.')
  ds().transaction(tx => {
    tx.insert('comments', { id: random(24), item: item.id, project: project.id, name: text(input.name, 40), body: words, byOwner: false, approved: false, createdAt: now() })
    tx.update('items', { id: item.id }, { $inc: { pending: 1 } })
  })
  count(project.id, 'comments')
  return { sent: true }
}

function ownItem(user, id) {
  const doc = typeof id === 'string' && id.length <= 64 ? ds().findOne('items', { id }) : null
  if (!doc) reject(404, 'not_found', 'Item not found.')
  return { item: doc, project: ownProject(user, doc.project) }
}

function ownComment(user, id) {
  const doc = typeof id === 'string' && id.length <= 64 ? ds().findOne('comments', { id }) : null
  if (!doc) reject(404, 'not_found', 'Comment not found.')
  ownProject(user, doc.project)
  return doc
}

export function listComments(user, itemId) {
  const { item } = ownItem(user, itemId)
  return ds().find('comments', { item: item.id }, { limit: 200, orderBy: 'createdAt', order: 'asc' }).map(ownerDTO)
}

export function reply(user, itemId, input) {
  const { item, project } = ownItem(user, itemId)
  const words = text(input.body, 2000, true)
  if (!words) reject(400, 'invalid_body', 'Write a reply first.')
  ds().transaction(tx => {
    tx.insert('comments', { id: random(24), item: item.id, project: project.id, name: project.name, body: words, byOwner: true, approved: true, createdAt: now() })
    tx.update('items', { id: item.id }, { $inc: { comments: 1 } })
  })
  return listComments(user, itemId)
}

export function approve(user, id) {
  const doc = ownComment(user, id)
  if (!doc.approved) {
    ds().transaction(tx => {
      tx.update('comments', { id: doc.id }, { $set: { approved: true } })
      tx.update('items', { id: doc.item }, { $inc: { pending: -1, comments: 1 } })
    })
  }
  return ownerDTO(ds().findOne('comments', { id: doc.id }))
}

export function deleteComment(user, id) {
  const doc = ownComment(user, id)
  ds().transaction(tx => {
    tx.delete('comments', { id: doc.id })
    tx.update('items', { id: doc.item }, { $inc: doc.approved ? { comments: -1 } : { pending: -1 } })
  })
}
