import { holm } from "./_holm.js";
// Relay API — member profile + username claim.

import {
  cleanUsername, validUsername, suggestedUsername,
  getJSON, getProfile, setJSON, profileKey, usernameKey, roomKey, roomListKey,
  channelForUser, firstUploadedFile, isImageMime,
  memberDTO, ok, json, bad, notFound, requireMember, requireProfile
} from './lib.js'
import { resolvePendingUserInvites } from './invites.js'

var PROFILE_PHOTO_BYTES = 5 * 1024 * 1024, PROFILE_PHOTO_SIZE = 256

export function handleMe() {
  var member = holm.auth.getMember()
  var profile = member && member.id ? getProfile(member.id) : null
  return ok({
    ok: true,
    loggedIn: !!member,
    member: memberDTO(member),
    profile: profile,
    needsOnboarding: !!member && !profile,
    suggestedUsername: member ? suggestedUsername(member) : '',
    channel: member && member.id ? channelForUser(member.id) : ''
  })
}

// POST /api/profile { username } — claim a username.
// Resolves any invites queued against this username once claimed.
export function handleCreateProfile(request) {
  var auth = requireMember()
  if (auth.error) return auth.error

  var existing = getProfile(auth.member.id)
  if (existing) return ok({ ok: true, profile: existing })

  var username = cleanUsername(request.body && request.body.username ? request.body.username : '')
  if (!username) username = suggestedUsername(auth.member)
  if (!validUsername(username)) return bad('Username must be 3–24 letters, numbers, or underscores')

  var owner = holm.app.kv.get(usernameKey(username))
  if (owner && owner !== auth.member.id) {
    return json(409, { ok: false, error: 'That username is taken', suggested: suggestedUsername(auth.member) })
  }

  var displayName = auth.member.name || (auth.member.email ? String(auth.member.email).split('@')[0] : username)
  var profile = {
    memberId: auth.member.id,
    username: username,
    displayName: displayName,
    picture: auth.member.picture || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  setJSON(profileKey(auth.member.id), profile)
  holm.app.kv.set(usernameKey(username), auth.member.id)

  // Fire any invites that were queued against this username before it existed.
  resolvePendingUserInvites(username, profile)

  return json(201, { ok: true, profile: profile })
}

function profilePhotoPath(memberId) { return 'profiles/' + encodeURIComponent(memberId) + '/avatar.jpg' }
function profilePhotoUrl(memberId) { return '/api/profile/photo/' + encodeURIComponent(memberId) }

function safeDecodeMemberId(value) {
  var raw = String(value || '')
  if (!raw || raw.length > 220) return ''
  var id = ''
  try { id = decodeURIComponent(raw) } catch (_e) {}
  if (!id || id.length > 160 || /[\/\\\x00-\x1f\x7f]/.test(id)) return ''
  return id
}

function addRoomMemberIds(out, room) {
  function add(value) {
    if (!value) return
    if (typeof value === 'string') out[value] = true
    else if (typeof value === 'object') add(value.memberId || value.id || value.userId)
  }
  ;['memberIds', 'members', 'participants'].forEach((name) => {
    var list = room && room[name]
    if (Array.isArray(list)) list.forEach(add)
    else if (list && typeof list === 'object') Object.keys(list).forEach((key) => {
      if (list[key]) add(key)
    })
  })
}

function notifyProfileChanged(memberId) {
  var rooms = getJSON(roomListKey(memberId))
  if (!Array.isArray(rooms)) return
  rooms.forEach((entry) => {
    var roomId = typeof entry === 'string' ? entry : (entry && (entry.id || entry.roomId))
    if (!roomId) return
    var room = getJSON(roomKey(roomId))
    if (!room) return
    var members = {}; addRoomMemberIds(members, room)
    Object.keys(members).forEach((id) =>
      holm.realtime.broadcast(channelForUser(id), { type: 'relay:conversation', roomId: roomId })
    )
  })
}

function saveProfileAndNotify(profile) {
  setJSON(profileKey(profile.memberId), profile)
  try { notifyProfileChanged(profile.memberId) } catch (_e) {}
  return ok({ ok: true, profile })
}

export function handleUpdateProfile(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var body = request.body || {}
  if (!Object.prototype.hasOwnProperty.call(body, 'displayName')) return bad('Display name is required')
  var displayName = String(body.displayName || '').trim()
  if (!displayName || displayName.length > 60) return bad('Display name must be 1-60 characters')

  return saveProfileAndNotify(Object.assign({}, ctx.profile, { displayName: displayName, updatedAt: Date.now() }))
}

export function handleSetProfilePhoto(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var file = firstUploadedFile(request.files)
  if (!file) return bad('No image provided')
  var declared = typeof file.size === 'number' ? file.size : 0
  if (declared > PROFILE_PHOTO_BYTES) return bad('Image must be 5 MiB or smaller')
  if (!isImageMime(file.type || file.mime || '')) return bad('File must be an image')

  var bytes = file.data
  var length = (bytes && (bytes.byteLength || bytes.length)) || (typeof file.size === 'number' ? file.size : 0)
  if (!bytes || !length) return bad('Image is empty')
  if (length > PROFILE_PHOTO_BYTES) return bad('Image must be 5 MiB or smaller')

  try {
    var out = holm.image.resize(bytes, { width: PROFILE_PHOTO_SIZE, height: PROFILE_PHOTO_SIZE, fit: 'cover', format: 'jpeg', quality: 84 })
    holm.app.s3.put(profilePhotoPath(ctx.member.id), out.data, 'image/jpeg')
  } catch (_e) { return bad('Could not process image') }
  return saveProfileAndNotify(Object.assign({}, ctx.profile, { picture: profilePhotoUrl(ctx.member.id), updatedAt: Date.now() }))
}

export function handleClearProfilePhoto() {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  if (holm.app.s3 && typeof holm.app.s3.delete === 'function') {
    try { holm.app.s3.delete(profilePhotoPath(ctx.member.id)) } catch (_e) {}
  }
  return saveProfileAndNotify(Object.assign({}, ctx.profile, { picture: ctx.member.picture || '', updatedAt: Date.now() }))
}

export function handleProfilePhoto(request) {
  var auth = requireMember()
  if (auth.error) return auth.error
  var parts = request.path.split('/')
  var memberId = safeDecodeMemberId(parts[4] || '')
  if (!memberId) return bad('Invalid member id')
  if (!getProfile(memberId)) return notFound('Profile not found')

  var blob = holm.app.s3.get(profilePhotoPath(memberId))
  if (!blob || !blob.data) return notFound('No profile photo')
  return { status: 200, body: blob.data, headers: {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  } }
}
