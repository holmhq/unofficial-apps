import { ok, fail, reject, body, member, profile } from './lib.js'
import { findProject, publicConfig, listProjects, createProject, updateProject, deleteProject, ownProject, projectDTO } from './projects.js'
import { submit, submitToWidget, listItems, updateItem, deleteItem, itemFile, listNotes, addNote, board, publicProject, publicItem, vote } from './items.js'
import { approvedComments, postComment, listComments, reply, approve, deleteComment } from './comments.js'
import { count, accountStats, projectStats } from './stats.js'
import { owner, listKeys, createKey, deleteKey } from './keys.js'

async function route(request, method, parts) {
  const [, area, id, sub, subId, action] = parts
  const query = request.query || {}

  if (area === 'me' && parts.length === 2 && method === 'GET') {
    const value = member()
    return ok({ authenticated: !!value, member: value ? { ...profile(value), email: value.email || '' } : null })
  }

  // Public: what a site's widget needs, and where it sends to. The widget
  // asks with ?open=1 when someone opens it, which counts as an open.
  if (area === 'embed' && id) {
    if (parts.length === 3 && method === 'GET') {
      const project = findProject(id)
      if (!project) reject(404, 'not_found', 'This feedback form isn’t set up.')
      if (query.open === '1') count(project.id, 'opens')
      return ok({ project: publicConfig(project) })
    }
    if (sub === 'items' && parts.length === 4 && method === 'POST') return ok(submitToWidget(id, body(request), request), 201)
  }

  // Public: a project's own page, by custom address or id, if its owner made
  // it public. Visitors send feedback, vote and comment there.
  if (area === 'boards' && id) {
    if (parts.length === 3 && method === 'GET') return ok(board(id, query))
    if (sub === 'items' && parts.length === 4 && method === 'POST') return ok(submit(publicProject(id), body(request), request, 'page'), 201)
    if (sub === 'items' && subId && action === 'vote' && parts.length === 6 && method === 'POST') return ok(vote(id, subId, body(request)))
    if (sub === 'items' && subId && action === 'comments' && parts.length === 6) {
      const project = publicProject(id)
      const item = publicItem(project, subId)
      if (method === 'GET') return ok({ comments: approvedComments(item) })
      if (method === 'POST') return ok(postComment(project, item, body(request)), 201)
    }
  }

  // API keys: only the signed-in person manages them.
  if (area === 'keys') {
    if (parts.length === 2 && method === 'GET') return ok({ keys: listKeys() })
    if (parts.length === 2 && method === 'POST') return ok(await createKey(body(request)), 201)
    if (parts.length === 3 && method === 'DELETE') { deleteKey(id); return ok() }
  }

  // The owner's side, signed in or with an API key.
  if (area === 'stats' && parts.length === 2 && method === 'GET') return ok(accountStats(await owner(request), query.days))

  if (area === 'projects') {
    const user = await owner(request)
    if (parts.length === 2 && method === 'GET') return ok({ projects: listProjects(user) })
    if (parts.length === 2 && method === 'POST') return ok({ project: createProject(user, body(request)) }, 201)
    if (parts.length === 3 && method === 'GET') return ok({ project: projectDTO(ownProject(user, id)) })
    if (parts.length === 3 && method === 'PATCH') return ok({ project: updateProject(user, id, body(request)) })
    if (parts.length === 3 && method === 'DELETE') { deleteProject(user, id); return ok() }
    if (sub === 'items' && parts.length === 4 && method === 'GET') return ok({ items: listItems(user, id, query.status) })
    if (sub === 'stats' && parts.length === 4 && method === 'GET') return ok(projectStats(ownProject(user, id), query.days))
  }

  if (area === 'items' && id) {
    const user = await owner(request)
    if (parts.length === 3 && method === 'PATCH') return ok({ item: updateItem(user, id, body(request)) })
    if (parts.length === 3 && method === 'DELETE') { deleteItem(user, id); return ok() }
    if (sub === 'files' && subId && parts.length === 5 && method === 'GET') return itemFile(user, id, subId, query)
    if (sub === 'notes' && parts.length === 4 && method === 'GET') return ok({ notes: listNotes(user, id) })
    if (sub === 'notes' && parts.length === 4 && method === 'POST') return ok({ notes: addNote(user, id, body(request)) }, 201)
    if (sub === 'comments' && parts.length === 4 && method === 'GET') return ok({ comments: listComments(user, id) })
    if (sub === 'comments' && parts.length === 4 && method === 'POST') return ok({ comments: reply(user, id, body(request)) }, 201)
  }

  if (area === 'comments' && id && parts.length === 3) {
    const user = await owner(request)
    if (method === 'PATCH') {
      if (body(request).approved !== true) reject(400, 'invalid_change', 'Comments can only be approved; delete one to remove it.')
      return ok({ comment: approve(user, id) })
    }
    if (method === 'DELETE') { deleteComment(user, id); return ok() }
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
