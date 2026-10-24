import { holm } from "./_holm.js";
// Relay API — viewer-scoped custom contact photo.
// Mirrors the alias flow: a photo I set for a contact is visible only to me.
// Stored as a 256px JPEG in app S3 under a viewer-scoped path; the path is
// held in KV (contactPictureKey) and surfaced through roomDTO so the Chats
// list, Friends tab, and contact sheet pick it up with no per-page wiring.

import {
  getJSON, setJSON, contactPictureKey,
  ok, bad, notFound, forbidden, requireProfile, firstUploadedFile
} from './lib.js'
import { getRoom, participant, otherMemberId } from './rooms.js'

var PHOTO_SIZE = 256

// POST /api/contacts/avatar  (multipart: roomId + file) — set my photo for the contact.
export function handleSetContactAvatar(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  var roomId = String(body.roomId || '')
  var room = getRoom(roomId)
  if (!room) return notFound('Chat not found')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this chat')

  var contactId = otherMemberId(room, ctx.member.id)
  if (!contactId) return bad('No contact in this chat')

  var file = firstUploadedFile(request.files)
  if (!file) return bad('No image provided')
  var bytes = file.data
  if (!bytes || !bytes.byteLength) return bad('Image is empty')

  try {
    var out = holm.image.resize(bytes, { width: PHOTO_SIZE, height: PHOTO_SIZE, format: 'jpeg', quality: 84 })
    var path = 'contacts/' + ctx.member.id + '/' + contactId + '.jpg'
    holm.app.s3.put(path, out.data, 'image/jpeg')
    holm.app.kv.set(contactPictureKey(ctx.member.id, contactId), path)
  } catch (e) {
    return bad('Could not process image')
  }
  return ok({ ok: true, path: path })
}

// POST /api/contacts/avatar/clear  (body: roomId) — remove my custom photo for the contact.
export function handleClearContactAvatar(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  var roomId = String(body.roomId || '')
  var room = getRoom(roomId)
  if (!room) return notFound('Chat not found')
  if (!participant(room, ctx.member.id)) return forbidden('You are not in this chat')

  var contactId = otherMemberId(room, ctx.member.id)
  var key = contactPictureKey(ctx.member.id, contactId)
  var path = holm.app.kv.get(key)
  holm.app.kv.set(key, '')
  if (path && holm.app.s3 && typeof holm.app.s3.delete === 'function') {
    try { holm.app.s3.delete(path) } catch (_e) {}
  }
  return ok({ ok: true })
}

// GET /api/contacts/<contactId>/avatar — serve my stored photo for the contact.
// Viewer-scoped: only I can read the path I wrote, so a signed-in gate is
// sufficient. 404 (client falls back to the generated avatar) when unset.
export function handleContactAvatar(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var contactId = decodeURIComponent(parts[3] || '')

  var path = holm.app.kv.get(contactPictureKey(ctx.member.id, contactId))
  if (!path) return notFound('No custom avatar')
  var blob = holm.app.s3.get(path)
  if (!blob || !blob.data) return notFound('No custom avatar')
  return {
    status: 200,
    body: blob.data,
    headers: {
      'Content-Type': blob.mime || 'image/jpeg',
      'Cache-Control': 'private, max-age=300'
    }
  }
}
