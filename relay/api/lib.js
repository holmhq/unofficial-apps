import { holm } from "./_holm.js";
// Relay API — shared helpers, auth gates, and storage access.
// App-scoped KV/DS/S3 so profiles, invites, rooms, messages, and attachments
// are centrally queryable while every handler enforces membership.

export const MESSAGE_PAGE_DEFAULT = 20
export const MESSAGE_PAGE_MAX = 50
export const MAX_TEXT = 8000
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024 // 16 MiB: what a node parses as one form file
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/

// Email invites: canonical base for join links, address validation, single-use
// token TTL, and a per-member daily send cap (anti-abuse — outbound email is a
// spam vector).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const EMAIL_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
export const EMAIL_INVITES_PER_DAY = 20
export const MAX_INVITE_NOTE = 280

// ── HTTP helpers ───────────────────────────────────────────────────
export function json(status, body, headers) {
  return { status: status, body: body, headers: headers || {} }
}
export function ok(body) { return json(200, body) }
export function bad(message) { return json(400, { ok: false, error: message }) }
export function notFound(message) { return json(404, { ok: false, error: message || 'Not found' }) }
export function unauthorized() {
  return json(401, { ok: false, error: 'Sign in required', loginUrl: holm.auth.getLoginURL('/') })
}
export function forbidden(message) { return json(403, { ok: false, error: message || 'Forbidden' }) }

// ── ids & time ─────────────────────────────────────────────────────
export function genId(prefix) {
  var rand
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var bytes = crypto.getRandomValues(new Uint8Array(12))
      rand = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0') }).join('')
    }
  } catch (_e) {}
  if (!rand) rand = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10)
  return (prefix || 'id') + '_' + Date.now().toString(36) + rand
}
export function now() { return Date.now() }

// ── usernames ──────────────────────────────────────────────────────
export function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}
export function validUsername(username) { return USERNAME_RE.test(username || '') }

// ── email + dates ──────────────────────────────────────────────────
export function cleanEmail(value) { return String(value || '').trim().toLowerCase() }
export function validEmail(value) {
  var v = cleanEmail(value)
  return v.length <= 254 && EMAIL_RE.test(v)
}
// UTC day bucket (yyyy-mm-dd) for per-member rate limits.
export function dayStamp() { return new Date().toISOString().slice(0, 10) }

export function usernameFromMember(member) {
  var source = ''
  if (member && member.name) source = member.name
  else if (member && member.email) source = String(member.email).split('@')[0]
  else if (member && member.id) source = member.id
  // "Tomás Ñúñez" suggests tomas_nunez: drop accents before keeping a-z0-9_.
  var base = cleanUsername(source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'))
  if (!base || base.length < 3) base = 'relay'
  if (base.length > 18) base = base.slice(0, 18)
  return base
}

// ── KV JSON helpers ────────────────────────────────────────────────
export function getJSON(key) {
  var raw = holm.app.kv.get(key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch (_e) { return null }
}
export function setJSON(key, value) { holm.app.kv.set(key, JSON.stringify(value)) }
export function listJSON(key) {
  var value = getJSON(key)
  return Array.isArray(value) ? value : []
}

// ── member / profile ───────────────────────────────────────────────
export function memberDTO(member) {
  if (!member) return null
  return {
    id: member.id,
    name: member.name || '',
    email: member.email || '',
    address: member.address || '',
    picture: member.picture || '',
    role: member.role || '',
    status: member.status || ''
  }
}

// ── storage keys ───────────────────────────────────────────────────
export const profileKey = (memberId) => 'profile:' + memberId
export const usernameKey = (username) => 'username:' + username
export const inviteKey = (id) => 'invite:' + id
export const inboxKey = (memberId) => 'invites:inbox:' + memberId
export const outboxKey = (memberId) => 'invites:outbox:' + memberId
export const pendingUserKey = (username) => 'invite:pending-user:' + username
export const emailTokenKey = (token) => 'invite:token:' + token
export const emailRateKey = (memberId, day) => 'invite:emailrate:' + memberId + ':' + day
export const blockKey = (memberId) => 'block:' + memberId
export const roomKey = (roomId) => 'room:' + roomId
export const roomListKey = (memberId) => 'member:rooms:' + memberId
export const attachmentKey = (id) => 'attachment:' + id
export const pairKey = (a, b) => { var ids = [a, b].sort(); return 'pair:' + ids[0] + '|' + ids[1] }
export const aliasKey = (viewerId, contactId) => 'alias:' + viewerId + ':' + contactId
export const contactPictureKey = (viewerId, contactId) => 'contactpic:' + viewerId + ':' + contactId

// ── realtime channels ──────────────────────────────────────────────
// A v1 app can't yet grant an ordinary member a private: channel, and a plain
// channel is open to anyone who knows its name. So each member's channel name
// carries 128 random bits, and only /api/me hands it to that member.
export const channelKey = (memberId) => 'rt:channel:' + memberId
export function channelForUser(memberId) {
  var name = holm.app.kv.get(channelKey(memberId))
  if (name) return name
  var bytes = crypto.getRandomValues(new Uint8Array(16))
  var secret = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0') }).join('')
  holm.app.kv.set(channelKey(memberId), 'relay-' + secret)
  return holm.app.kv.get(channelKey(memberId))
}

export function getProfile(memberId) {
  if (!memberId) return null
  return getJSON(profileKey(memberId))
}
export function getProfileByUsername(username) {
  var id = holm.app.kv.get(usernameKey(cleanUsername(username)))
  if (!id) return null
  return getProfile(id)
}

// ── blocking ───────────────────────────────────────────────────────
// block:<memberId> holds the list of memberIds this member has blocked.
// A blocked sender's invites (email or username) are silently dropped — the
// sender never learns, consistent with the privacy-first invite model.
export function isBlocked(blockerId, senderId) {
  if (!blockerId || !senderId) return false
  return listJSON(blockKey(blockerId)).indexOf(senderId) >= 0
}
export function addBlock(blockerId, senderId) {
  if (!blockerId || !senderId || blockerId === senderId) return
  var list = listJSON(blockKey(blockerId))
  if (list.indexOf(senderId) >= 0) return
  list.unshift(senderId)
  setJSON(blockKey(blockerId), list)
}

export function getAlias(viewerId, contactId) {
  if (!viewerId || !contactId) return ''
  return String(holm.app.kv.get(aliasKey(viewerId, contactId)) || '')
}

export function setAlias(viewerId, contactId, name) {
  if (!viewerId || !contactId) return
  var value = String(name || '').trim()
  var key = aliasKey(viewerId, contactId)
  if (!value) {
    if (holm.app.kv && typeof holm.app.kv.delete === 'function') holm.app.kv.delete(key)
    else holm.app.kv.set(key, '')
    return
  }
  holm.app.kv.set(key, value)
}

// Suggest an available username derived from the member, avoiding collisions.
export function suggestedUsername(member) {
  var base = usernameFromMember(member)
  for (var i = 0; i < 200; i++) {
    var candidate = cleanUsername(i === 0 ? base : (base + i)).slice(0, 24)
    if (candidate.length < 3) candidate = 'relay' + i
    var owner = holm.app.kv.get(usernameKey(candidate))
    if (!owner || (member && owner === member.id)) return candidate
  }
  return 'relay_' + Date.now().toString(36).slice(-6)
}

// ── auth gates ─────────────────────────────────────────────────────
export function requireMember() {
  if (!holm.auth.isLoggedIn()) return { error: unauthorized() }
  var member = holm.auth.getMember()
  if (!member || !member.id) return { error: unauthorized() }
  return { member: member }
}
export function requireProfile() {
  var auth = requireMember()
  if (auth.error) return auth
  var profile = getProfile(auth.member.id)
  if (!profile) {
    return { error: json(409, { ok: false, error: 'Claim a Relay username first', needsProfile: true }) }
  }
  return { member: auth.member, profile: profile }
}

// ── filename / mime helpers ────────────────────────────────────────
export function cleanFilename(name) {
  var value = String(name || 'upload.bin')
    .replace(/\\/g, '/').split('/').pop()
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/^[- ]+|[- ]+$/g, '')
  if (!value) value = 'upload.bin'
  if (value.length > 120) value = value.slice(value.length - 120)
  return value
}
export function firstUploadedFile(files) {
  if (!files) return null
  if (files.file) return files.file
  if (files.upload) return files.upload
  if (files.image) return files.image
  if (files.attachment) return files.attachment
  for (var key in files) {
    if (Object.prototype.hasOwnProperty.call(files, key)) return files[key]
  }
  return null
}
export function isImageMime(mime) {
  return /^image\/(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(String(mime || ''))
}
export function isAudioMime(mime) {
  return /^audio\//i.test(String(mime || ''))
}
export function isVideoMime(mime) {
  return /^video\//i.test(String(mime || ''))
}
// Infer attachment kind from mime, with an extension fallback for uploads that
// arrive as application/octet-stream (mobile recorders, etc.).
var AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'amr']
var VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'ogv', '3gp', 'mpeg', 'mpg']
export function kindForFile(mime, ext) {
  if (isImageMime(mime)) return 'image'
  if (isAudioMime(mime)) return 'audio'
  if (isVideoMime(mime)) return 'video'
  var e = String(ext || '').toLowerCase()
  if (AUDIO_EXTS.indexOf(e) >= 0) return 'audio'
  if (VIDEO_EXTS.indexOf(e) >= 0) return 'video'
  return 'file'
}

// ── group slugs (settable clean-URL handles: /chat/group/<slug>) ────────────
export const GROUP_SLUG_RE = /^[a-z0-9_]{3,30}$/
export const RESERVED_SLUGS = ['group', 'me', 'new', 'create', 'settings', 'discover', 'friends', 'relay', 'admin', 'api', 'auth', 'all', 'everyone', 'admin', 'support']
// Suggest a slug from a group name ("Stanford CS 2026" -> "stanford_cs_2026").
export function suggestSlug(name) {
  return String(name || '').trim().toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
}
export function validSlug(slug) {
  var s = String(slug || '')
  return GROUP_SLUG_RE.test(s) && RESERVED_SLUGS.indexOf(s) < 0
}
// groupslug:<slug> -> roomId index (uniqueness + resolution). A group with no
// slug falls back to the opaque /chat/<roomId> URL.
export const groupslugKey = (slug) => 'groupslug:' + String(slug || '').toLowerCase()
export function contentDisposition(filename, inline) {
  var safe = cleanFilename(filename).replace(/"/g, '')
  return (inline ? 'inline' : 'attachment') + '; filename="' + safe + '"'
}
