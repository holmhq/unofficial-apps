// A member's saved templates and opt-out list.

import { HttpError, now, iso, text } from './lib.js'
import { checkTemplate, normalizePhone } from './sms.js'

const ds = (env) => env.holm.app.ds
const MAX_TEMPLATES = 50

/* ---- Templates ------------------------------------------------------- */

const templateDTO = (t) => ({ id: t.id, name: t.name, body: t.body, uses: t.uses || 0, at: iso(t.at), check: checkTemplate(t.body) })

export function templates(env, ownerId) {
  return ds(env).find('templates', { ownerId }, { limit: MAX_TEMPLATES })
    .sort((a, b) => (b.uses || 0) - (a.uses || 0) || b.at - a.at)
    .map(templateDTO)
}

function validTemplate(input) {
  const name = text(input.name, 60)
  const body = String(input.body ?? '').trim().slice(0, 1000)
  if (!name) throw new HttpError(400, 'name', 'Give the template a name.')
  const result = checkTemplate(body)
  if (!result.ok) throw new HttpError(400, 'template', result.issues.find(i => i.level === 'error').text)
  return { name, body }
}

export function createTemplate(env, ownerId, input) {
  if (ds(env).count('templates', { ownerId }) >= MAX_TEMPLATES) throw new HttpError(409, 'too_many', `You can keep up to ${MAX_TEMPLATES} templates.`)
  const doc = { ownerId, ...validTemplate(input), uses: 0, at: now() }
  doc.id = ds(env).insert('templates', doc)
  return templateDTO(doc)
}

export function updateTemplate(env, ownerId, id, input) {
  const doc = ds(env).findOne('templates', { id: String(id), ownerId })
  if (!doc) throw new HttpError(404, 'not_found', 'No such template.')
  const patch = validTemplate({ name: input.name ?? doc.name, body: input.body ?? doc.body })
  ds(env).update('templates', { id: doc.id }, { $set: patch })
  return templateDTO({ ...doc, ...patch })
}

export function deleteTemplate(env, ownerId, id) {
  if (!ds(env).findOne('templates', { id: String(id), ownerId })) throw new HttpError(404, 'not_found', 'No such template.')
  ds(env).delete('templates', { id: String(id), ownerId })
}

/* ---- Opt-outs -------------------------------------------------------- */

export function optouts(env, ownerId) {
  return ds(env).find('optouts', { ownerId }, { limit: 1000, order: 'desc' })
    .map(o => ({ number: o.number, reason: o.reason, at: iso(o.at) }))
}

export function addOptout(env, ownerId, input) {
  const number = normalizePhone(input.number)
  if (!number) throw new HttpError(400, 'bad_number', 'Not a phone number.')
  if (!ds(env).findOne('optouts', { ownerId, number })) ds(env).insert('optouts', { ownerId, number, reason: 'manual', at: now() })
  return { number }
}

export function removeOptout(env, ownerId, value) {
  const number = normalizePhone(value)
  if (!number) throw new HttpError(400, 'bad_number', 'Not a phone number.')
  ds(env).delete('optouts', { ownerId, number })
}
