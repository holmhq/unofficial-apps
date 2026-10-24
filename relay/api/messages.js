import { holm } from "./_holm.js";
// Relay API — messages: send, list, delete, typing.

import {
  genId, now, MAX_TEXT, MESSAGE_PAGE_DEFAULT, MESSAGE_PAGE_MAX, MAX_ATTACHMENT_BYTES,
  setJSON, attachmentKey,
  bad, ok, json, notFound, forbidden, requireProfile,
  firstUploadedFile, channelForUser
} from './lib.js'
import { getRoom, participant, moveRoomToTop, accountRoomMessage } from './rooms.js'
import { createAttachment, attachmentDTO } from './attachments.js'

export function messageDTO(message) {
  if (!message) return null
  var out = {
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    senderName: message.senderName,
    senderUsername: message.senderUsername,
    text: message.text || '',
    forwardedFrom: message.forwardedFrom || null,
    replyTo: message.replyTo ? (message.replyTo.deleted ? { id: message.replyTo.id, deleted: true } : message.replyTo) : null,
    ts: message.ts,
    deleted: !!message.deletedAt,
    deletedBy: message.deletedBy || null,
    attachments: []
  }
  var attachments = message.attachments || []
  for (var i = 0; i < attachments.length; i++) out.attachments.push(attachmentDTO(attachments[i]))
  return out
}

function replySnapshot(message) {
  var attachment = (message.attachments || [])[0]
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    text: String(message.text || '').slice(0, 160),
    kind: attachment ? (attachment.kind || 'file') : 'text',
    attName: attachment ? (attachment.name || '') : ''
  }
}

function boundedMessageLimit(value) {
  if (value === undefined || value === null || value === '') return MESSAGE_PAGE_DEFAULT
  var n = Number(value)
  if (!Number.isFinite(n) || Math.floor(n) !== n || n <= 0) return MESSAGE_PAGE_DEFAULT
  return Math.min(MESSAGE_PAGE_MAX, Math.max(1, n))
}

// Copy an existing attachment's blobs into `room` under a fresh id, so a
// forwarded message in another chat is self-contained (target members can open
// it; deleting the source doesn't orphan it). Returns the new meta, or null if
// the source blob is missing.
function copyAttachment(room, member, src) {
  if (!src || !src.originalPath) return null
  var id = genId('att')
  var basePath = 'rooms/' + room.id + '/attachments/' + id + '/'
  var orig = holm.app.s3.get(src.originalPath)
  if (!orig) return null
  var originalPath = basePath + 'original-' + (src.name || 'file')
  holm.app.s3.put(originalPath, orig.data, src.mime || 'application/octet-stream')
  var meta = {
    id: id, roomId: room.id, ownerId: member.id,
    kind: src.kind || 'file', name: src.name || 'file', mime: src.mime || 'application/octet-stream',
    size: src.size || null, originalPath: originalPath, ext: src.ext || '', createdAt: now()
  }
  if (meta.kind === 'image') {
    meta.width = src.width || null; meta.height = src.height || null
    if (src.optimizedPath) {
      var opt = holm.app.s3.get(src.optimizedPath)
      if (opt) { var op = basePath + 'optimized.jpg'; holm.app.s3.put(op, opt.data, 'image/jpeg'); meta.optimizedPath = op; meta.optimizedMime = 'image/jpeg' }
    }
    if (src.previewPath) {
      var prev = holm.app.s3.get(src.previewPath)
      if (prev) { var pp = basePath + 'preview.jpg'; holm.app.s3.put(pp, prev.data, 'image/jpeg'); meta.previewPath = pp; meta.previewMime = 'image/jpeg' }
    }
  }
  setJSON(attachmentKey(id), meta)
  return meta
}

function previewFor(text, attachments) {
  var clean = String(text || '').trim()
  if (clean) return clean.length > 90 ? clean.slice(0, 87) + '…' : clean
  if (attachments && attachments.length) {
    if (attachments[0].kind === 'image') return 'Photo'
    return 'File: ' + attachments[0].name
  }
  return ''
}

export function handleMessages(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var roomId = request.query && request.query.roomId ? String(request.query.roomId) : ''
  var limit = boundedMessageLimit(request.query && request.query.limit)
  var cursor = request.query && request.query.cursor ? String(request.query.cursor) : ''
  var room = getRoom(roomId)
  if (!room) return notFound('Chat not found')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this chat')

  var opts = { limit: limit, orderBy: 'ts', order: 'desc', page: true }
  if (cursor) opts.cursor = cursor
  var page = holm.app.ds.find('messages', { roomId: room.id }, opts)
  if (!page || !Array.isArray(page.rows)) {
    return json(500, { ok: false, error: 'Message pagination unavailable' })
  }
  var rows = page.rows.slice().reverse()
  var messages = []
  for (var i = 0; i < rows.length; i++) messages.push(messageDTO(rows[i]))
  var nextCursor = page.cursor ? String(page.cursor) : ''
  return ok({ ok: true, messages: messages, page: { limit: limit, cursor: nextCursor, hasMore: !!nextCursor } })
}

export function handleSendMessage(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  var roomId = body.roomId ? String(body.roomId) : ''
  var room = getRoom(roomId)
  if (!room) return notFound('Chat not found')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this chat')

  var text = body.text === undefined || body.text === null ? '' : String(body.text).trim()
  if (text.length > MAX_TEXT) return bad('Message is too long')
  var file = firstUploadedFile(request.files)
  if (file && file.size && file.size > MAX_ATTACHMENT_BYTES) return bad('File too large (max 16 MB)')
  if (!text && !file) return bad('Send text or attach a file')

  var replyToId = String(body.replyToId || '')
  var replyTo = null
  if (replyToId) {
    var targets = holm.app.ds.find('messages', { id: replyToId }, { limit: 1 }) || []
    var target = targets[0]
    if (!target || target.roomId !== room.id || target.deletedAt) {
      return json(400, { ok: false, error: 'Cannot reply to that message', code: 'reply_invalid' })
    }
    replyTo = replySnapshot(target)
  }

  var attachments = []
  if (file) {
    try {
      attachments.push(createAttachment(room, ctx.member, file))
    } catch (e) {
      // Storage failure: never persist a message pointing at a missing blob.
      return bad(e && e.message ? e.message : 'Could not store attachment')
    }
  }

  var message = {
    id: genId('msg'),
    roomId: room.id,
    senderId: ctx.member.id,
    senderName: ctx.profile.displayName,
    senderUsername: ctx.profile.username,
    text: text,
    replyToId: replyToId || null,
    replyTo: replyTo,
    attachments: attachments,
    ts: now()
  }
  holm.app.ds.insert('messages', message)

  var preview = previewFor(text, attachments)
  room.lastAt = message.ts
  room.lastPreview = preview
  accountRoomMessage(room, ctx.member.id)
  holm.app.kv.set('room:' + room.id, JSON.stringify(room))
  for (var i = 0; i < room.members.length; i++) moveRoomToTop(room.members[i], room.id)

  var dto = messageDTO(message)
  // Deliver the message on EACH member's own secret channel, never a per-room
  // one. Anyone who knows a plain channel's name can subscribe to it, so content
  // on a room channel would reach a non-member who learned the room's id.
  // Per-member delivery makes membership the only gate (see channelForUser).
  for (var j = 0; j < room.members.length; j++) {
    var mid = room.members[j]
    holm.realtime.broadcast(channelForUser(mid), { type: 'relay:message', message: dto })
    holm.realtime.broadcast(channelForUser(mid), { type: 'relay:conversation', roomId: room.id })
    if (mid !== ctx.member.id) {
      holm.realtime.broadcast(channelForUser(mid), {
        type: 'relay:messageNotify',
        roomId: room.id,
        senderName: ctx.profile.displayName,
        senderUsername: ctx.profile.username,
        preview: preview
      })
    }
  }
  return { status: 201, body: { ok: true, message: dto } }
}

// Sender-owned delete-for-everyone → tombstone shown to both participants.
export function handleDeleteMessage(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var messageId = decodeURIComponent(parts[3] || '')
  var rows = holm.app.ds.find('messages', { id: messageId }, { limit: 1 }) || []
  var message = rows[0]
  if (!message) return notFound('Message not found')
  if (message.senderId !== ctx.member.id) return forbidden('You can only delete your own messages')

  message.text = ''
  message.attachments = []
  message.deletedAt = now()
  message.deletedBy = ctx.member.id
  holm.app.ds.update('messages', { id: messageId }, { $set: {
    text: '', attachments: [], deletedAt: message.deletedAt, deletedBy: ctx.member.id
  } })

  // Page every reference and scrub by id; keep replyToId for later queries.
  var cursor = ''
  do {
    var opts = { limit: MESSAGE_PAGE_MAX, orderBy: 'ts', order: 'desc', page: true }
    if (cursor) opts.cursor = cursor
    var page = holm.app.ds.find('messages', { replyToId: messageId }, opts)
    if (!page || !Array.isArray(page.rows)) return json(500, { ok: false, error: 'Reply cleanup unavailable' })
    for (var r = 0; r < page.rows.length; r++) {
      holm.app.ds.update('messages', { id: page.rows[r].id }, { $set: { replyTo: { id: messageId, deleted: true } } })
    }
    cursor = page.cursor ? String(page.cursor) : ''
  } while (cursor)

  var dto = messageDTO(message)
  var delRoom = getRoom(message.roomId)
  var delMembers = delRoom ? (delRoom.members || []) : []
  // Per-member delivery: never broadcast content on a room channel.
  for (var i = 0; i < delMembers.length; i++) {
    holm.realtime.broadcast(channelForUser(delMembers[i]), { type: 'relay:messageDeleted', messageId: message.id, roomId: message.roomId, message: dto })
  }
  return ok({ ok: true, message: dto })
}

// Ephemeral typing state — broadcast to the room, nothing persisted.
export function handleTyping(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  var roomId = body.roomId ? String(body.roomId) : ''
  var room = getRoom(roomId)
  if (!room || !participant(room, ctx.member.id)) return ok({ ok: true }) // never reveal existence
  var typing = !!body.typing
  // Per-member delivery, as in handleSendMessage.
  for (var i = 0; i < (room.members || []).length; i++) {
    if (room.members[i] === ctx.member.id) continue // never echo your own typing
    holm.realtime.broadcast(channelForUser(room.members[i]), {
      type: 'relay:typing',
      roomId: room.id,
      memberId: ctx.member.id,
      username: ctx.profile.username,
      typing: typing
    })
  }
  return ok({ ok: true })
}

// POST /api/messages/forward { messageId, targetRoomId } — re-send an existing
// message (text + attachments) into another chat you're in. The caller must be a
// participant of BOTH the source room (else you could forward private chats you
// can't see) and the target room. Attachments are copied (see copyAttachment) so
// the forwarded copy stands on its own.
export function handleForwardMessage(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  var messageId = String(body.messageId || '')
  var targetRoomId = String(body.targetRoomId || '')

  var targetRoom = getRoom(targetRoomId)
  if (!targetRoom) return notFound('Chat not found')
  if (!participant(targetRoom, ctx.member.id)) return forbidden('You are not in this chat')

  var rows = holm.app.ds.find('messages', { id: messageId }, { limit: 1 }) || []
  var src = rows[0]
  if (!src) return notFound('Message not found')
  var srcRoom = getRoom(src.roomId)
  if (!srcRoom || !participant(srcRoom, ctx.member.id)) return forbidden('You can only forward from chats you are in')
  if (src.deletedAt) return bad('Cannot forward a deleted message')

  var attachments = []
  for (var i = 0; i < (src.attachments || []).length; i++) {
    var copy = copyAttachment(targetRoom, ctx.member, src.attachments[i])
    if (copy) attachments.push(copy)
  }

  var message = {
    id: genId('msg'),
    roomId: targetRoom.id,
    senderId: ctx.member.id,
    senderName: ctx.profile.displayName,
    senderUsername: ctx.profile.username,
    text: src.text || '',
    forwardedFrom: src.senderUsername || '',
    replyToId: null,
    replyTo: null,
    attachments: attachments,
    ts: now()
  }
  holm.app.ds.insert('messages', message)

  var preview = previewFor(message.text, message.attachments)
  targetRoom.lastAt = message.ts
  targetRoom.lastPreview = preview
  accountRoomMessage(targetRoom, ctx.member.id)
  holm.app.kv.set('room:' + targetRoom.id, JSON.stringify(targetRoom))
  for (var k = 0; k < targetRoom.members.length; k++) moveRoomToTop(targetRoom.members[k], targetRoom.id)

  var dto = messageDTO(message)
  // Per-member delivery, as in handleSendMessage.
  for (var j = 0; j < targetRoom.members.length; j++) {
    var tmid = targetRoom.members[j]
    holm.realtime.broadcast(channelForUser(tmid), { type: 'relay:message', message: dto })
    holm.realtime.broadcast(channelForUser(tmid), { type: 'relay:conversation', roomId: targetRoom.id })
    if (tmid !== ctx.member.id) {
      holm.realtime.broadcast(channelForUser(tmid), {
        type: 'relay:messageNotify',
        roomId: targetRoom.id,
        senderName: ctx.profile.displayName,
        senderUsername: ctx.profile.username,
        preview: preview
      })
    }
  }
  return { status: 201, body: { ok: true, message: dto } }
}
