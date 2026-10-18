// Projects: one per site or product. Each has its own embed snippet, inbox
// and optional public board, and belongs to the member who made it.
import { ds, now, iso, text, reject, random, requireMember } from './lib.js'

const COLOR = /^#[0-9a-fA-F]{6}$/
const MAX_PROJECTS = 20

export function projectDTO(doc) {
  return {
    id: doc.id, name: doc.name, label: doc.label, color: doc.color, position: doc.position,
    origins: doc.origins, public: doc.public, createdAt: iso(doc.createdAt)
  }
}

// The parts a visitor's browser may see: no owner, no allowed sites.
export const publicConfig = doc => ({ id: doc.id, name: doc.name, label: doc.label, color: doc.color, position: doc.position })

export function findProject(id) {
  return /^[a-z0-9]{8}$/.test(id || '') ? ds().findOne('projects', { id }) : null
}

// A project the signed-in member owns, or a 404 that doesn't reveal others.
export function ownProject(id) {
  const user = requireMember()
  const doc = findProject(id)
  if (!doc || doc.ownerId !== user.id) reject(404, 'not_found', 'Project not found.')
  return doc
}

function origins(value) {
  if (!Array.isArray(value)) reject(400, 'invalid_origins', 'Allowed sites are a list.')
  return [...new Set(value.slice(0, 20).map(entry => {
    try {
      const url = new URL(String(entry).trim())
      if (!/^https?:$/.test(url.protocol)) throw new Error()
      return url.origin
    } catch {
      reject(400, 'invalid_origin', `“${String(entry).slice(0, 80)}” isn't a site address like https://example.com.`)
    }
  }))]
}

function settings(input, doc = {}) {
  const out = {}
  if ('name' in input) out.name = text(input.name, 60) || reject(400, 'invalid_name', 'Give the project a name.')
  if ('label' in input) out.label = text(input.label, 24) || 'Feedback'
  if ('color' in input) out.color = COLOR.test(input.color || '') ? input.color.toLowerCase() : reject(400, 'invalid_color', 'A colour is like #c2410c.')
  if ('position' in input) out.position = input.position === 'left' ? 'left' : 'right'
  if ('origins' in input) out.origins = origins(input.origins)
  if ('public' in input) out.public = input.public === true
  return { ...doc, ...out }
}

export function listProjects() {
  const user = requireMember()
  return ds().find('projects', { ownerId: user.id }, { limit: MAX_PROJECTS, orderBy: 'createdAt', order: 'desc' }).map(projectDTO)
}

export function createProject(input) {
  const user = requireMember()
  if (ds().count('projects', { ownerId: user.id }) >= MAX_PROJECTS) reject(409, 'too_many', `You can have up to ${MAX_PROJECTS} projects.`)
  const doc = settings({ label: 'Feedback', color: '#c2410c', position: 'right', origins: [], public: false, ...input })
  let id = random(8)
  while (findProject(id)) id = random(8)
  ds().insert('projects', { ...doc, id, ownerId: user.id, createdAt: now() })
  return projectDTO(findProject(id))
}

export function updateProject(id, input) {
  const doc = ownProject(id)
  const next = settings(input)
  ds().update('projects', { id: doc.id }, { $set: next })
  return projectDTO(findProject(doc.id))
}

export function deleteProject(id) {
  const doc = ownProject(id)
  ds().delete('notes', { project: doc.id })
  ds().delete('items', { project: doc.id })
  ds().delete('projects', { id: doc.id })
}
