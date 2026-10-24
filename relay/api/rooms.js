import { holm } from "./_holm.js";
// Relay API — DM rooms (pair conversations).

import {
  genId, now, getJSON, setJSON, listJSON,
  roomKey, roomListKey, pairKey,
  getProfile, getAlias, setAlias, contactPictureKey,
  validSlug, groupslugKey,
  channelForUser, ok, bad, json, notFound, forbidden, requireProfile
} from './lib.js'

export function getRoom(roomId) { return getJSON(roomKey(roomId)) }

export function participant(room, memberId) {
  if (!room || !room.members) return false
  for (var i = 0; i < room.members.length; i++) {
    if (room.members[i] === memberId) return true
  }
  return false
}

export function otherMemberId(room, memberId) {
  if (!room || !room.members) return ''
  for (var i = 0; i < room.members.length; i++) {
    if (room.members[i] !== memberId) return room.members[i]
  }
  return ''
}

export function addRoomToMember(memberId, roomId) {
  var list = listJSON(roomListKey(memberId))
  for (var i = 0; i < list.length; i++) { if (list[i] === roomId) return }
  list.unshift(roomId)
  setJSON(roomListKey(memberId), list)
}

export function moveRoomToTop(memberId, roomId) {
  var list = listJSON(roomListKey(memberId))
  var next = [roomId]
  for (var i = 0; i < list.length; i++) { if (list[i] !== roomId) next.push(list[i]) }
  setJSON(roomListKey(memberId), next)
}

// Find or create the 1:1 room between two members.
export function createPairRoom(memberA, memberB) {
  var pkey = pairKey(memberA, memberB)
  var roomId = holm.app.kv.get(pkey)
  var room = roomId ? getJSON(roomKey(roomId)) : null
  if (!room) {
    roomId = genId('room')
    room = {
      id: roomId,
      type: 'dm',
      members: [memberA, memberB],
      createdBy: memberA,
      createdAt: now(),
      lastAt: now(),
      lastPreview: 'Chat opened'
    }
    setJSON(roomKey(roomId), room)
    holm.app.kv.set(pkey, roomId)
  }
  addRoomToMember(memberA, roomId)
  addRoomToMember(memberB, roomId)
  return room
}

// ── groups (multi-member rooms) ────────────────────────────────────────────
// Membership grows only through accepted invites (see invites.js), so a group
// never reveals a member to someone who hasn't consented to join.

export function createGroupRoom(creatorId, name) {
  var roomId = genId('room')
  var room = {
    id: roomId,
    type: 'group',
    title: String(name || '').trim().slice(0, 80) || 'Group',
    members: [creatorId],
    createdBy: creatorId,
    createdAt: now(),
    lastAt: now(),
    lastPreview: 'Group created'
  }
  setJSON(roomKey(roomId), room)
  addRoomToMember(creatorId, roomId)
  return room
}

export function addMemberToRoom(room, memberId) {
  if (!room || !room.members) return
  for (var i = 0; i < room.members.length; i++) { if (room.members[i] === memberId) return }
  room.members.push(memberId)
  setJSON(roomKey(room.id), room)
  addRoomToMember(memberId, room.id)
}

export function removeMemberFromRoom(room, memberId) {
  if (!room || !room.members) return
  var next = []
  for (var i = 0; i < room.members.length; i++) { if (room.members[i] !== memberId) next.push(room.members[i]) }
  room.members = next
  setJSON(roomKey(room.id), room)
  var list = listJSON(roomListKey(memberId))
  var nl = []
  for (var j = 0; j < list.length; j++) { if (list[j] !== room.id) nl.push(list[j]) }
  setJSON(roomListKey(memberId), nl)
}

export function roomDTO(room, viewerId) {
  if (!room) return null
  if (room.type === 'group') return groupRoomDTO(room, viewerId)
  var otherId = otherMemberId(room, viewerId)
  var other = getProfile(otherId)
  var realTitle = other ? (other.displayName || ('@' + other.username)) : (room.title || 'Relay chat')
  var alias = getAlias(viewerId, otherId)
  var title = alias || realTitle
  var realPic = other ? (other.picture || '') : ''
  var generated = '/auth/avatar?seed=' + encodeURIComponent(other ? other.username : room.id)
  // Viewer-scoped custom contact photo (set via the contact sheet). Stored as a
  // blob path in KV; when present it overrides the real/generated avatar for this
  // viewer only — in the Chats list, Friends tab, and contact sheet.
  var customPath = holm.app.kv.get(contactPictureKey(viewerId, otherId))
  var customPic = customPath ? ('/api/contacts/' + encodeURIComponent(otherId) + '/avatar') : ''
  return {
    id: room.id,
    type: room.type || 'dm',
    title: title,
    realTitle: realTitle,
    alias: alias,
    username: other ? other.username : '',
    picture: customPic || realPic,
    avatar: customPic || realPic || generated,
    customPicture: !!customPic,
    members: room.members || [],
    createdAt: room.createdAt,
    lastAt: room.lastAt || room.createdAt,
    lastPreview: room.lastPreview || '',
    msgCount: roomMessageCount(room.id),
    unread: unreadFor(room, viewerId)
  }
}

function roomMsgCountKey(roomId) {
  return 'relay:roomMsgCount:' + roomId
}

function roomUnreadKey(roomId, memberId) {
  return 'relay:roomUnread:' + roomId + ':' + memberId
}

function roomReadAtKey(roomId, memberId) {
  return 'relay:roomReadAt:' + roomId + ':' + memberId
}

function counterValue(value) {
  var n = Number(value)
  if (!isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

export function roomMessageCount(roomId) {
  return counterValue(holm.app.kv.get(roomMsgCountKey(roomId)))
}

export function accountRoomMessage(room, senderId) {
  if (!room || !room.id) return 0
  var total = counterValue(holm.app.kv.increment(roomMsgCountKey(room.id), 1))
  var members = room.members || []
  for (var i = 0; i < members.length; i++) {
    if (members[i] && members[i] !== senderId) holm.app.kv.increment(roomUnreadKey(room.id, members[i]), 1)
  }
  return total
}

function unreadFor(room, viewerId) {
  return counterValue(holm.app.kv.get(roomUnreadKey(room.id, viewerId)))
}

// Group room view. Unlike a DM there's no single "other" member, so the title is
// the group name and every member's profile is exposed to every other member
// (consent-based: you only land here by accepting an invite).
function groupRoomDTO(room, viewerId) {
  var members = room.members || []
  var profiles = []
  for (var i = 0; i < members.length; i++) {
    var p = getProfile(members[i])
    profiles.push({
      id: members[i],
      username: p ? p.username : '',
      displayName: p ? (p.displayName || (p.username ? '@' + p.username : 'Member')) : 'Member',
      picture: p ? (p.picture || '') : ''
    })
  }
  return {
    id: room.id,
    type: 'group',
    slug: room.slug || '',
    title: room.title || 'Group',
    realTitle: room.title || 'Group',
    alias: '',
    username: '',
    picture: '',
    avatar: '', // a group shows its initials on the accent, not a generated face
    customPicture: false,
    members: members,
    memberProfiles: profiles,
    memberCount: members.length,
    createdBy: room.createdBy || '',
    createdAt: room.createdAt,
    lastAt: room.lastAt || room.createdAt,
    lastPreview: room.lastPreview || (members.length + ' members'),
    msgCount: roomMessageCount(room.id),
    unread: unreadFor(room, viewerId)
  }
}

export function handleConversations() {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var ids = listJSON(roomListKey(ctx.member.id))
  var rooms = []
  for (var i = 0; i < ids.length; i++) {
    var room = getJSON(roomKey(ids[i]))
    if (room && participant(room, ctx.member.id)) rooms.push(roomDTO(room, ctx.member.id))
  }
  rooms.sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0) })
  return ok({ ok: true, conversations: rooms })
}

export function handleSetAlias(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error

  var body = request.body || {}
  var roomId = String(body.roomId || '')
  var room = getRoom(roomId)
  if (!room) return notFound('Chat not found')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this chat')

  var contactId = otherMemberId(room, ctx.member.id)
  var name = String(body.displayName || '').trim().slice(0, 60)
  setAlias(ctx.member.id, contactId, name)
  return ok({ ok: true, alias: name })
}

export function handleMarkRoomRead(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var roomId = decodeURIComponent(parts[3] || '')
  var room = getRoom(roomId)
  if (!room) return notFound('Chat not found')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this chat')
  var body = request.body || {}
  var upTo = body.upTo
  if (upTo !== undefined && (typeof upTo !== 'number' || !isFinite(upTo) || upTo < 0)) return bad('Invalid read watermark')
  var readKey = roomReadAtKey(room.id, ctx.member.id)
  var stored = Number(holm.app.kv.get(readKey)) || 0
  var effective = Math.max(stored, upTo === undefined ? (room.lastAt || room.createdAt || 0) : upTo)
  if (effective > stored) holm.app.kv.set(readKey, effective)
  var unread = 0
  if (upTo !== undefined && effective < (room.lastAt || room.createdAt || 0)) {
    var rows = holm.app.ds.find('messages', {
      roomId: room.id, ts: { $gt: effective }, senderId: { $ne: ctx.member.id }
    }, { orderBy: 'ts', order: 'desc', limit: 100 }) || []
    unread = Math.min(99, rows.length)
  }
  holm.app.kv.set(roomUnreadKey(room.id, ctx.member.id), unread)
  return ok({ ok: true, room: roomDTO(room, ctx.member.id), readAt: effective })
}

// POST /api/groups { name, slug? } — create a group; creator is the only member
// until they invite others (who must accept). Optional `slug` sets a clean-URL
// handle (/chat/group/<slug>); if it's invalid/taken the group still creates and
// slugError is returned so the client can prompt to fix it.
export function handleCreateGroup(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  var name = String(body.name || '').trim().slice(0, 80)
  if (!name) return bad('Add a group name')
  var room = createGroupRoom(ctx.member.id, name)
  var slugError = null
  var slug = String(body.slug || '').trim().toLowerCase()
  if (slug) { var r = assignGroupSlug(room, slug); if (!r.ok) slugError = r.error }
  return json(201, { ok: true, room: roomDTO(room, ctx.member.id), slugError: slugError })
}

// Validate + uniqueness-check a group slug (handle), set room.slug + the
// groupslug:<slug> -> roomId index. Empty slug clears it. Caller has authed and
// confirmed the caller is the creator. Returns { ok:true } or { ok:false, error }.
export function assignGroupSlug(room, slug) {
  var s = String(slug || '').trim().toLowerCase()
  var old = room.slug || ''
  if (!s) {
    if (old && holm.app.kv.get(groupslugKey(old)) === room.id) freeSlug(old)
    delete room.slug
    setJSON(roomKey(room.id), room)
    return { ok: true }
  }
  if (!validSlug(s)) return { ok: false, error: 'Handle must be 3–30 chars: a–z, 0–9, _' }
  var owner = holm.app.kv.get(groupslugKey(s))
  if (owner && owner !== room.id) return { ok: false, error: 'That handle is taken' }
  room.slug = s
  setJSON(roomKey(room.id), room)
  holm.app.kv.set(groupslugKey(s), room.id)
  if (old && old !== s && holm.app.kv.get(groupslugKey(old)) === room.id) freeSlug(old)
  return { ok: true }
}
function freeSlug(slug) {
  if (holm.app.kv && typeof holm.app.kv.delete === 'function') holm.app.kv.delete(groupslugKey(slug))
  else holm.app.kv.set(groupslugKey(slug), '')
}

// POST /api/groups/:id/slug { slug } — creator sets / edits / clears the group
// handle. Members get a conversation refresh so they pick up the new slug.
export function handleSetGroupSlug(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var roomId = decodeURIComponent(parts[3] || '')
  var room = getRoom(roomId)
  if (!room) return notFound('Group not found')
  if (room.type !== 'group') return bad('Not a group')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this group')
  if (room.createdBy !== ctx.member.id) return forbidden('Only the creator can set the handle')
  var slug = String((request.body && request.body.slug) || '').trim().toLowerCase()
  var r = assignGroupSlug(room, slug)
  if (!r.ok) return bad(r.error)
  for (var i = 0; i < (room.members || []).length; i++) {
    holm.realtime.broadcast(channelForUser(room.members[i]), { type: 'relay:conversation', roomId: room.id })
  }
  return ok({ ok: true, room: roomDTO(room, ctx.member.id) })
}

// POST /api/groups/:id/leave — remove yourself from a group. Remaining members
// get a conversation refresh (member count / list changes).
export function handleLeaveGroup(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var roomId = decodeURIComponent(parts[3] || '')
  var room = getRoom(roomId)
  if (!room) return notFound('Group not found')
  if (room.type !== 'group') return bad('Not a group')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this group')
  removeMemberFromRoom(room, ctx.member.id)
  for (var i = 0; i < (room.members || []).length; i++) {
    holm.realtime.broadcast(channelForUser(room.members[i]), { type: 'relay:conversation', roomId: room.id })
  }
  return ok({ ok: true })
}
