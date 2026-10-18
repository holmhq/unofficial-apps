import { ok, fail, reject, body, member, profile } from './lib.js'
import { findProject, publicConfig, listProjects, createProject, updateProject, deleteProject, ownProject, projectDTO } from './projects.js'
import { submit, listItems, updateItem, deleteItem, listNotes, addNote, board, vote } from './items.js'
import { owner, listKeys, createKey, deleteKey } from './keys.js'

async function route(request, method, parts) {
  const [, area, id, sub, subId, action] = parts

  if (area === 'me' && parts.length === 2 && method === 'GET') {
    const value = member()
    return ok({ authenticated: !!value, member: value ? { ...profile(value), email: value.email || '' } : null })
  }

  // Public: what a site's widget needs, and where it sends to.
  if (area === 'embed' && id) {
    if (parts.length === 3 && method === 'GET') {
      const project = findProject(id)
      if (!project) reject(404, 'not_found', 'This feedback form isn’t set up.')
      return ok({ project: publicConfig(project) })
    }
    if (sub === 'items' && parts.length === 4 && method === 'POST') return ok(submit(id, body(request), request), 201)
  }

  // Public: a project's board, if its owner made it public.
  if (area === 'boards' && id) {
    if (parts.length === 3 && method === 'GET') return ok(board(id))
    if (sub === 'items' && subId && action === 'vote' && parts.length === 6 && method === 'POST') return ok(vote(id, subId, body(request)))
  }

  // API keys: only the signed-in person manages them.
  if (area === 'keys') {
    if (parts.length === 2 && method === 'GET') return ok({ keys: listKeys() })
    if (parts.length === 2 && method === 'POST') return ok(await createKey(body(request)), 201)
    if (parts.length === 3 && method === 'DELETE') { deleteKey(id); return ok() }
  }

  // The owner's side, signed in or with an API key.
  if (area === 'projects') {
    const user = await owner(request)
    if (parts.length === 2 && method === 'GET') return ok({ projects: listProjects(user) })
    if (parts.length === 2 && method === 'POST') return ok({ project: createProject(user, body(request)) }, 201)
    if (parts.length === 3 && method === 'GET') return ok({ project: projectDTO(ownProject(user, id)) })
    if (parts.length === 3 && method === 'PATCH') return ok({ project: updateProject(user, id, body(request)) })
    if (parts.length === 3 && method === 'DELETE') { deleteProject(user, id); return ok() }
    if (sub === 'items' && parts.length === 4 && method === 'GET') return ok({ items: listItems(user, id, (request.query || {}).status) })
  }

  if (area === 'items' && id) {
    const user = await owner(request)
    if (parts.length === 3 && method === 'PATCH') return ok({ item: updateItem(user, id, body(request)) })
    if (parts.length === 3 && method === 'DELETE') { deleteItem(user, id); return ok() }
    if (sub === 'notes' && parts.length === 4 && method === 'GET') return ok({ notes: listNotes(user, id) })
    if (sub === 'notes' && parts.length === 4 && method === 'POST') return ok({ notes: addNote(user, id, body(request)) }, 201)
  }

  reject(404, 'not_found', 'Route not found.')
}

export default async function handler(request) {
  const method = String(request.method || 'GET').toUpperCase()
  const parts = String(request.path || '/').replace(/\/+$/, '').split('/').filter(Boolean)
  try {
    if (parts[0] !== 'api') reject(404, 'not_found', 'Route not found.')
    return await route(request, method, parts)
  } catch (error) {
    if (error.public) return fail(error.status || 400, error.code || 'request_failed', error.message)
    console.error(String((error && error.stack) || error))
    return fail(500, 'internal_error', 'The request could not be completed.')
  }
}
