import { ok, fail, reject, body, member, profile } from './lib.js'
import { findProject, publicConfig, listProjects, createProject, updateProject, deleteProject, ownProject, projectDTO, setPicture, clearPicture } from './projects.js'
import { isPicture, servePicture } from './page.js'
import { submit, submitToWidget, fileItem, listItems, updateItem, deleteItem, itemFile, listNotes, addNote, replyToSender, board, publicProject, publicItem, vote, sharedItem, shared } from './items.js'
import { approvedComments, postComment, listComments, reply, approve, deleteComment } from './comments.js'
import { count, accountStats, projectStats } from './stats.js'
import { owner, header, listKeys, createKey, deleteKey, rotateKey } from './keys.js'
import { seen, installs } from './installs.js'
import { IDLE_MS, mintLink, openLink, linkUser, linkState, closeLink } from './links.js'
import { claim } from './accounts.js'
import { mine, senderReply, stopEmails } from './follow.js'

// An inbox link's page marks its calls (a header, or ?link=1 on a file it
// shows); they act for the project's owner, on that project's inbox only.
const linked = request => !!header(request, 'x-feedback-link') || request.query?.link === '1'
const actor = request => linked(request) ? linkUser(request) : owner(request)
// What only the owner may do, never through an inbox link.
function whole(user) {
  if (user.link) reject(403, 'link_scope', 'An inbox link can only read and sort this inbox.')
  return user
}

async function route(request, method, parts) {
  const [, area, id, sub, subId, action] = parts
  const query = request.query || {}

  if (area === 'me' && parts.length === 2 && method === 'GET') {
    const value = member()
    const me = { authenticated: !!value, member: value ? { ...profile(value), email: value.email || '' } : null }
    return ok(linked(request) ? { ...me, link: await linkState(request) } : me)
  }

  // What the signed-in person sent with a confirmed email, on every project.
  if (area === 'mine' && parts.length === 2 && method === 'GET') return ok(mine())
  if (area === 'mine' && id && sub === 'replies' && parts.length === 4 && method === 'POST') return ok(senderReply(id, body(request)), 201)
  if (area === 'stop' && parts.length === 2 && method === 'POST') return ok(stopEmails(body(request)))

  // Inbox links: the page spends the link once, says someone is there while
  // they are, and locks.
  if (area === 'link' && parts.length === 3 && method === 'POST') {
    if (id === 'open') {
      const { cookie, ...opened } = await openLink(body(request))
      return ok(opened, 200, { 'Set-Cookie': cookie })
    }
    if (id === 'ping') return ok({ idleMs: IDLE_MS, endsInMs: (await linkUser(request)).endsInMs })
    if (id === 'close') return ok({}, 200, { 'Set-Cookie': await closeLink(request) })
    if (id === 'claim') return ok(claim(await linkUser(request)))
  }

  // Public: what a site's button and form need, and where they send to. The
  // button's script asks from the site's page (with ?from=, its origin) and
  // may keep the reply briefly; the form says when someone opens it.
  if (area === 'embed' && id) {
    if (parts.length === 3 && method === 'GET') {
      const project = findProject(id)
      if (!project) reject(404, 'not_found', 'This feedback form isn’t set up.')
      if (query.from) seen(project.id, query.from)
      // Forms from before 0.6 count their opens this way.
      if (query.open === '1') count(project.id, 'opens')
      return ok({ project: publicConfig(project) }, 200, query.from ? { 'Cache-Control': 'max-age=20' } : {})
    }
    if (sub === 'open' && parts.length === 4 && method === 'POST') {
      if (findProject(id)) count(id, 'opens')
      return ok()
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

  // Public: one item its owner shared by link, with its approved comments,
  // whether or not the project's page is public. Comments sent there wait
  // for the owner's approval, as on a page.
  if (area === 'shared' && id && (parts.length === 3 || (sub === 'comments' && parts.length === 4))) {
    const { project, item } = sharedItem(id)
    if (parts.length === 3 && method === 'GET') return ok(shared(project, item))
    if (parts.length === 4 && method === 'POST') return ok(postComment(project, item, body(request)), 201)
  }

  // Public: a page's logo and cover.
  if (area === 'pictures' && id && isPicture(sub) && parts.length === 4 && method === 'GET') return servePicture(findProject(id), sub)

  // API keys: only the signed-in person manages them, but a key may replace
  // itself.
  if (area === 'keys' && id === 'rotate' && parts.length === 3 && method === 'POST') return ok(await rotateKey(request), 201)
  if (area === 'keys') {
    if (parts.length === 2 && method === 'GET') return ok({ keys: listKeys() })
    if (parts.length === 2 && method === 'POST') return ok(await createKey(body(request)), 201)
    if (parts.length === 3 && method === 'DELETE') { deleteKey(id); return ok() }
  }

  // The owner's side, signed in or with an API key.
  if (area === 'stats' && parts.length === 2 && method === 'GET') return ok(accountStats(await owner(request), query.days))

  if (area === 'projects') {
    const user = await actor(request)
    if (parts.length === 2 && method === 'GET') return ok({ projects: listProjects(whole(user)) })
    if (parts.length === 2 && method === 'POST') return ok({ project: createProject(whole(user), body(request)) }, 201)
    if (parts.length === 3 && method === 'GET') return ok({ project: projectDTO(ownProject(user, id)) })
    if (parts.length === 3 && method === 'PATCH') return ok({ project: updateProject(whole(user), id, body(request)) })
    if (parts.length === 3 && method === 'DELETE') { deleteProject(whole(user), id); return ok() }
    if (sub === 'items' && parts.length === 4 && method === 'GET') return ok({ items: listItems(user, id, query.status) })
    if (sub === 'items' && parts.length === 4 && method === 'POST') return ok({ item: fileItem(user, id, body(request)) }, 201)
    if (sub === 'link' && parts.length === 4 && method === 'POST') return ok(await mintLink(whole(user), id, request.origin), 201)
    if (sub === 'stats' && parts.length === 4 && method === 'GET') return ok(projectStats(ownProject(whole(user), id), query.days))
    if (sub === 'installs' && parts.length === 4 && method === 'GET') return ok({ installs: installs(ownProject(whole(user), id).id) })
    if (isPicture(sub) && parts.length === 4 && method === 'POST') return ok({ project: setPicture(whole(user), id, sub, request) })
    if (isPicture(sub) && parts.length === 4 && method === 'DELETE') return ok({ project: clearPicture(whole(user), id, sub) })
  }

  if (area === 'items' && id) {
    const user = await actor(request)
    if (parts.length === 3 && method === 'PATCH') return ok({ item: updateItem(user, id, body(request)) })
    if (parts.length === 3 && method === 'DELETE') { deleteItem(whole(user), id); return ok() }
    if (sub === 'files' && subId && parts.length === 5 && method === 'GET') return itemFile(user, id, subId, query)
    if (sub === 'notes' && parts.length === 4 && method === 'GET') return ok({ notes: listNotes(user, id) })
    if (sub === 'notes' && parts.length === 4 && method === 'POST') return ok({ notes: addNote(user, id, body(request)) }, 201)
    if (sub === 'replies' && parts.length === 4 && method === 'POST') return ok(replyToSender(user, id, body(request), request.origin), 201)
    if (sub === 'comments' && parts.length === 4 && method === 'GET') return ok({ comments: listComments(user, id) })
    if (sub === 'comments' && parts.length === 4 && method === 'POST') return ok({ comments: reply(user, id, body(request)) }, 201)
  }

  if (area === 'comments' && id && parts.length === 3) {
    const user = await actor(request)
    if (method === 'PATCH') {
      if (body(request).approved !== true) reject(400, 'invalid_change', 'Comments can only be approved; delete one to remove it.')
      return ok({ comment: approve(user, id) })
    }
    if (method === 'DELETE') { deleteComment(whole(user), id); return ok() }
  }

  reject(404, 'not_found', 'Route not found.')
}

async function answer(request, method, parts) {
  try {
    if (parts[0] !== 'api') reject(404, 'not_found', 'Route not found.')
    return await route(request, method, parts)
  } catch (error) {
    if (error.public) return fail(error.status || 400, error.code || 'request_failed', error.message)
    console.error(String((error && error.stack) || error))
    return fail(500, 'internal_error', 'The request could not be completed.')
  }
}

export default async function handler(request) {
  const method = String(request.method || 'GET').toUpperCase()
  const parts = String(request.path || '/').replace(/\/+$/, '').split('/').filter(Boolean)
  const response = await answer(request, method, parts)
  // The button's script reads its project's look from any site, so that
  // reply (and its errors) may be read across origins. It carries no cookies.
  if (parts[1] === 'embed' && parts.length === 3 && method === 'GET') response.headers['Access-Control-Allow-Origin'] = '*'
  return response
}
