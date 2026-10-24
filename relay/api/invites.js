import { holm } from "./_holm.js";
// Relay API — privacy-first invites.
//
// Privacy invariant: the app NEVER reveals whether a username exists.
// Sending an invite always returns the same message and always creates an
// outbox entry showing "pending" — even when the target does not exist yet.
// Only an accepted invite resolves (a chat appears). Decline / non-existence
// stay indistinguishable as "pending" forever in the sender's outbox.
//
// Pending-by-username invites (target not yet on Relay) are resolved when the
// username is later claimed, making "invite will be sent if such a user exists"
// literally true.

import {
  genId, now, cleanUsername, validUsername,
  cleanEmail, validEmail, dayStamp,
  getJSON, setJSON, listJSON,
  inviteKey, inboxKey, outboxKey, pendingUserKey,
  emailTokenKey, emailRateKey,
  getProfile, getProfileByUsername,
  isBlocked, addBlock,
  channelForUser, ok, bad, json, notFound, forbidden, requireProfile,
  EMAIL_INVITE_TTL_MS, EMAIL_INVITES_PER_DAY, MAX_INVITE_NOTE
} from './lib.js'
import { createPairRoom, addMemberToRoom, roomDTO, getRoom, participant } from './rooms.js'

var PENDING_MSG = function (username) {
  return 'Invite will be sent to @' + username + ' if they’re on Relay.'
}

// Recipient-facing view of an invite (shows the sender).
export function inviteInboxDTO(invite) {
  if (!invite) return null
  return {
    id: invite.id,
    fromUsername: invite.fromUsername,
    fromDisplayName: invite.fromDisplayName,
    fromPicture: invite.fromPicture,
    status: invite.status,
    createdAt: invite.createdAt,
    groupRoomId: invite.groupRoomId || null,
    groupName: invite.groupName || '',
    channel: invite.channel || 'username',
    note: invite.note || ''
  }
}

// Sender-facing view. Status is NORMALIZED for privacy: only 'accepted' (with
// the resulting room) is ever revealed; pending / declined / unresolved all
// read as 'pending'.
export function inviteOutboxDTO(invite) {
  if (!invite) return null
  var accepted = invite.status === 'accepted'
  return {
    id: invite.id,
    toUsername: invite.toUsername,
    channel: invite.channel || 'username',
    toEmail: invite.toEmail || '',
    status: accepted ? 'accepted' : 'pending',
    roomId: accepted ? invite.roomId : null,
    createdAt: invite.createdAt
  }
}

function pushUnique(listKey, id) {
  var list = listJSON(listKey)
  for (var i = 0; i < list.length; i++) { if (list[i] === id) return }
  list.unshift(id)
  setJSON(listKey, list)
}

// POST /api/invites  { username }  — constant response, never reveals existence.
export function handleSendInvite(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var raw = cleanUsername(request.body && request.body.username ? request.body.username : '')
  // Even an invalid format returns the same line — no information leaked.
  if (!validUsername(raw)) return ok({ ok: true, sent: false, message: PENDING_MSG(raw || 'username') })

  var target = getProfileByUsername(raw)
  var myProfile = ctx.profile

  if (target && target.memberId === ctx.member.id) {
    // Inviting yourself: silently no-op.
    return ok({ ok: true, sent: false, message: PENDING_MSG(raw) })
  }

  if (target && isBlocked(target.memberId, ctx.member.id)) {
    // Recipient has blocked this sender — silent no-op (sender never learns).
    return ok({ ok: true, sent: false, message: PENDING_MSG(raw) })
  }

  // Optional roomId → a group invite (consent still required: the recipient must
  // accept before they're added). Only members of the group may invite into it.
  var groupRoomId = null
  var groupName = ''
  var bodyRoomId = request.body && request.body.roomId ? String(request.body.roomId) : ''
  if (bodyRoomId) {
    var gr = getRoom(bodyRoomId)
    if (!gr || gr.type !== 'group' || !participant(gr, ctx.member.id)) {
      // Not a group this caller can invite to — respond identically, no invite.
      return ok({ ok: true, sent: false, message: PENDING_MSG(raw) })
    }
    groupRoomId = gr.id
    groupName = gr.title || 'Group'
    if (target && gr.members.indexOf(target.memberId) >= 0) {
      // Already a member — indistinguishable no-op.
      return ok({ ok: true, sent: false, message: PENDING_MSG(raw) })
    }
  }

  // Avoid duplicate outbox spam if there is an unresolved prior invite to the
  // same username (and same group) from this member.
  var existingOutbox = listJSON(outboxKey(ctx.member.id))
  for (var i = 0; i < existingOutbox.length; i++) {
    var prev = getJSON(inviteKey(existingOutbox[i]))
    if (prev && prev.toUsername === raw && prev.status !== 'accepted' && (prev.groupRoomId || null) === (groupRoomId || null)) {
      return ok({ ok: true, sent: false, message: PENDING_MSG(raw) })
    }
  }

  var invite = {
    id: genId('inv'),
    fromMemberId: ctx.member.id,
    fromUsername: myProfile.username,
    fromDisplayName: myProfile.displayName,
    fromPicture: myProfile.picture || '',
    toMemberId: target ? target.memberId : null,
    toUsername: raw,
    groupRoomId: groupRoomId,
    groupName: groupName,
    status: 'pending',
    roomId: null,
    createdAt: now()
  }
  setJSON(inviteKey(invite.id), invite)
  pushUnique(outboxKey(ctx.member.id), invite.id)

  if (target) {
    // Target exists: deliver into their inbox + notify in realtime.
    pushUnique(inboxKey(target.memberId), invite.id)
    holm.realtime.broadcast(channelForUser(target.memberId), {
      type: 'relay:invite',
      invite: inviteInboxDTO(invite)
    })
  } else {
    // Target not on Relay yet: queue by username for later resolution.
    pushUnique(pendingUserKey(raw), invite.id)
  }

  return ok({ ok: true, sent: true, message: PENDING_MSG(raw) })
}

// ── email invites ────────────────────────────────────────────────────────────
// Invite someone who isn't on Relay yet, by email. A single-use, expiring token
// is emailed as a join link; it's redeemed (handleRedeemJoin) after the recipient
// signs up + claims a username, which delivers the invite into their inbox.
// Privacy note: an email invite intentionally reveals the SENDER to the recipient
// (you chose to email them). The recipient still consents by accepting, and the
// sender only ever learns about acceptance (status normalization unchanged).

var EMAIL_CONFIRM = 'Invitation emailed. They’ll appear in Friends once they join and accept.'

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Delete a token→invite index entry (some runtimes lack kv.delete → blank it,
// which still reads back falsy on redemption).
function dropToken(token) {
  if (!token) return
  var k = emailTokenKey(token)
  if (holm.app.kv && typeof holm.app.kv.delete === 'function') {
    try { holm.app.kv.delete(k); return } catch (_e) {}
  }
  holm.app.kv.set(k, '')
}

function buildInviteEmail(origin, senderName, senderUsername, note, token) {
  var url = origin + '/join/' + encodeURIComponent(token)
  var who = senderName || ('@' + senderUsername)
  var subject = who + ' invited you to Relay'
  var noteText = note ? ('\n\nThey added a note:\n“' + note + '”') : ''
  var body =
    who + ' (@' + senderUsername + ') invited you to connect on Relay — a private, ' +
    'mobile-first messenger.' + noteText + '\n\n' +
    'Join and connect:\n' + url + '\n\n' +
    'This invite link works once and expires in 14 days. ' +
    'If you don’t know ' + who + ', you can ignore this email.'
  var noteHtml = note
    ? '<tr><td style="padding:0 0 18px"><div style="border-left:3px solid #6a3fe0;padding:10px 14px;background:#f5f5fb;border-radius:8px;color:#3f3f55;font-size:15px;line-height:1.5">' +
        escapeHtml(note) + '</div></td></tr>'
    : ''
  var html =
    '<!doctype html><html><body style="margin:0;background:#f3f3f7;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
    '<tr><td style="padding:0 0 10px"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a8aa0;font-weight:600">Relay</div></td></tr>' +
    '<tr><td style="padding:0 0 16px"><div style="font-size:22px;font-weight:700;color:#1a1a24;line-height:1.3">' +
      escapeHtml(who) + ' invited you to Relay</div></td></tr>' +
    '<tr><td style="padding:0 0 18px"><div style="font-size:16px;color:#454556;line-height:1.55">' +
      escapeHtml(who) + ' <span style="color:#8a8aa0">(@' + escapeHtml(senderUsername) + ')</span> wants to connect on Relay, a private mobile-first messenger.</div></td></tr>' +
    noteHtml +
    '<tr><td style="padding:6px 0 22px"><a href="' + escapeHtml(url) + '" style="display:inline-block;background:#6a3fe0;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:13px 26px;border-radius:10px">Join Relay &amp; connect</a></td></tr>' +
    '<tr><td><div style="font-size:13px;color:#9a9aae;line-height:1.5">This link works once and expires in 14 days. If you don’t know ' +
      escapeHtml(who) + ', you can ignore this email — nothing was shared with them.</div></td></tr>' +
    '</table></body></html>'
  return { subject: subject, body: body, html: html }
}

// POST /api/invites/email  { email, note? } — DM email invite.
export async function handleSendEmailInvite(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var myProfile = ctx.profile

  var email = cleanEmail(request.body && request.body.email ? request.body.email : '')
  if (!validEmail(email)) return bad('Enter a valid email address')

  // Don't email your own address.
  if (ctx.member.email && cleanEmail(ctx.member.email) === email) {
    return ok({ ok: true, sent: false, message: EMAIL_CONFIRM })
  }

  var note = String(request.body && request.body.note ? request.body.note : '').trim().slice(0, MAX_INVITE_NOTE)

  // Per-member daily cap (outbound email is a spam vector). Only successful
  // sends are counted, so transient failures don't burn the quota.
  var rk = emailRateKey(ctx.member.id, dayStamp())
  var count = parseInt(holm.app.kv.get(rk) || '0', 10) || 0
  if (count >= EMAIL_INVITES_PER_DAY) {
    return json(429, { ok: false, error: 'Daily invite limit reached. Try again tomorrow.' })
  }

  // Re-invites re-surface rather than spawn duplicates: reuse an unresolved
  // email invite to the same address, rotating its token (old link dies) +
  // extending the TTL + resetting it to pending.
  var invite = null
  var existingOutbox = listJSON(outboxKey(ctx.member.id))
  for (var i = 0; i < existingOutbox.length; i++) {
    var prev = getJSON(inviteKey(existingOutbox[i]))
    if (prev && prev.channel === 'email' && prev.toEmail === email && prev.status !== 'accepted') {
      invite = prev
      break
    }
  }

  var token = genId('jn')
  if (invite) {
    dropToken(invite.token)
    invite.token = token
    invite.tokenConsumed = false
    invite.note = note
    invite.status = 'pending'
    invite.expiresAt = now() + EMAIL_INVITE_TTL_MS
    invite.resentAt = now()
  } else {
    invite = {
      id: genId('inv'),
      fromMemberId: ctx.member.id,
      fromUsername: myProfile.username,
      fromDisplayName: myProfile.displayName,
      fromPicture: myProfile.picture || '',
      toMemberId: null,
      toUsername: '',
      channel: 'email',
      toEmail: email,
      note: note,
      token: token,
      tokenConsumed: false,
      expiresAt: now() + EMAIL_INVITE_TTL_MS,
      groupRoomId: null,
      groupName: '',
      status: 'pending',
      roomId: null,
      createdAt: now()
    }
    pushUnique(outboxKey(ctx.member.id), invite.id)
  }
  setJSON(inviteKey(invite.id), invite)
  holm.app.kv.set(emailTokenKey(token), invite.id)

  // Platform email primitive — sends from the canonical app identity only.
  var mail = buildInviteEmail(request.origin, myProfile.displayName, myProfile.username, note, token)
  var result = null
  try {
    result = await holm.email.send({ to: email, subject: mail.subject, body: mail.body, html: mail.html })
  } catch (_e) {
    result = { ok: false, code: 'EMAIL_SEND_EXCEPTION' }
  }

  if (!result || !result.ok) {
    // Operator/platform gap (disabled, identity/provider not ready) or transient.
    // Don't leak platform codes to the client; the invite record + token are kept
    // so a retry reuses them. Holm already logs failed sends server-side.
    return json(503, { ok: false, error: 'Couldn’t send the invite email right now. Please try again.' })
  }

  holm.app.kv.set(rk, String(count + 1))
  return ok({ ok: true, sent: true, message: EMAIL_CONFIRM })
}

// POST /api/invites/redeem  { token } — consume a join link after the recipient
// has signed up + claimed a username; delivers the sender's invite into their
// inbox (single-use). Neutral on any failure (stale / expired / already used).
export function handleRedeemJoin(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var token = String(request.body && request.body.token ? request.body.token : '').trim()
  if (!token) return ok({ ok: true, redeemed: false })

  var inviteId = holm.app.kv.get(emailTokenKey(token))
  if (!inviteId) return ok({ ok: true, redeemed: false })
  var invite = getJSON(inviteKey(inviteId))
  if (!invite || invite.channel !== 'email') return ok({ ok: true, redeemed: false })
  if (invite.tokenConsumed || (invite.expiresAt && now() > invite.expiresAt)) return ok({ ok: true, redeemed: false })
  if (invite.fromMemberId === ctx.member.id) return ok({ ok: true, redeemed: false })
  // Bound to a different member already.
  if (invite.toMemberId && invite.toMemberId !== ctx.member.id) return ok({ ok: true, redeemed: false })

  // Consume the token regardless of outcome (single-use).
  invite.tokenConsumed = true
  invite.redeemedAt = now()

  // Redeemer has blocked this sender → consume silently, don't deliver.
  if (isBlocked(ctx.member.id, invite.fromMemberId)) {
    setJSON(inviteKey(invite.id), invite)
    dropToken(token)
    return ok({ ok: true, redeemed: false })
  }

  invite.toMemberId = ctx.member.id
  invite.status = 'pending'
  setJSON(inviteKey(invite.id), invite)
  dropToken(token)

  pushUnique(inboxKey(ctx.member.id), invite.id)
  holm.realtime.broadcast(channelForUser(ctx.member.id), {
    type: 'relay:invite',
    invite: inviteInboxDTO(invite)
  })
  return ok({ ok: true, redeemed: true, invite: inviteInboxDTO(invite) })
}

// POST /api/invites/:id/block — recipient blocks the sender: decline this invite
// AND drop future invites (email or username) from that sender. Sender never learns.
export function handleBlockInvite(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var id = decodeURIComponent(parts[3] || '')
  var invite = getJSON(inviteKey(id))
  if (!invite) return notFound('Invite not found')
  if (invite.toMemberId !== ctx.member.id) return forbidden('Not your invite')
  invite.status = 'declined'
  invite.declinedAt = now()
  if (invite.token) { dropToken(invite.token); invite.tokenConsumed = true }
  setJSON(inviteKey(invite.id), invite)
  addBlock(ctx.member.id, invite.fromMemberId)
  return ok({ ok: true })
}

// GET /api/invites — incoming pending invites for the caller.
export function handleIncomingInvites() {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var ids = listJSON(inboxKey(ctx.member.id))
  var incoming = []
  for (var i = 0; i < ids.length; i++) {
    var invite = getJSON(inviteKey(ids[i]))
    if (invite && invite.status === 'pending') incoming.push(inviteInboxDTO(invite))
  }
  incoming.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0) })
  return ok({ ok: true, invites: incoming })
}

// GET /api/invites/outbox — sent invites (status normalized for privacy).
export function handleOutbox() {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var ids = listJSON(outboxKey(ctx.member.id))
  var sent = []
  for (var i = 0; i < ids.length; i++) {
    var invite = getJSON(inviteKey(ids[i]))
    if (invite) sent.push(inviteOutboxDTO(invite))
  }
  sent.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0) })
  return ok({ ok: true, invites: sent })
}

// POST /api/invites/:id/accept — recipient accepts; pair room opens for both.
export function handleAcceptInvite(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var id = decodeURIComponent(parts[3] || '')
  var invite = getJSON(inviteKey(id))
  if (!invite) return notFound('Invite not found')
  if (invite.toMemberId !== ctx.member.id) return forbidden('Not your invite')
  if (invite.status !== 'pending') return bad('Invite is no longer pending')

  // Group invite: join the existing group instead of opening a new pair room.
  if (invite.groupRoomId) {
    var group = getRoom(invite.groupRoomId)
    if (!group) return notFound('Group not found')
    addMemberToRoom(group, ctx.member.id)
    invite.status = 'accepted'
    invite.roomId = group.id
    invite.acceptedAt = now()
    setJSON(inviteKey(invite.id), invite)
    // Every member (incl. the joiner) refreshes their conversation list.
    for (var gi = 0; gi < (group.members || []).length; gi++) {
      holm.realtime.broadcast(channelForUser(group.members[gi]), { type: 'relay:conversation', roomId: group.id })
    }
    holm.realtime.broadcast(channelForUser(invite.fromMemberId), {
      type: 'relay:inviteAccepted',
      inviteId: invite.id,
      roomId: group.id,
      by: { username: ctx.profile.username, displayName: ctx.profile.displayName, picture: ctx.profile.picture || '' }
    })
    return ok({ ok: true, room: roomDTO(group, ctx.member.id) })
  }

  var room = createPairRoom(invite.fromMemberId, ctx.member.id)
  invite.status = 'accepted'
  invite.roomId = room.id
  invite.acceptedAt = now()
  setJSON(inviteKey(invite.id), invite)

  var fromProfile = getProfile(invite.fromMemberId)
  var toProfile = ctx.profile

  // Sender learns acceptance: a chat appears.
  holm.realtime.broadcast(channelForUser(invite.fromMemberId), {
    type: 'relay:inviteAccepted',
    inviteId: invite.id,
    roomId: room.id,
    by: { username: toProfile.username, displayName: toProfile.displayName, picture: toProfile.picture || '' }
  })
  // Both refresh their conversation lists.
  holm.realtime.broadcast(channelForUser(invite.fromMemberId), { type: 'relay:conversation', roomId: room.id })
  holm.realtime.broadcast(channelForUser(ctx.member.id), { type: 'relay:conversation', roomId: room.id })

  return ok({ ok: true, room: roomDTO(room, ctx.member.id) })
}

// POST /api/invites/:id/decline — recipient declines (sender never learns).
export function handleDeclineInvite(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var id = decodeURIComponent(parts[3] || '')
  var invite = getJSON(inviteKey(id))
  if (!invite) return notFound('Invite not found')
  if (invite.toMemberId !== ctx.member.id) return forbidden('Not your invite')
  if (invite.status !== 'pending') return bad('Invite is no longer pending')
  invite.status = 'declined'
  invite.declinedAt = now()
  setJSON(inviteKey(invite.id), invite)
  return ok({ ok: true })
}

// Called from profile-claim: convert pending-by-username invites into real,
// delivered invites now that the username exists.
export function resolvePendingUserInvites(username, profile) {
  var ids = listJSON(pendingUserKey(username))
  if (!ids.length) return
  for (var i = 0; i < ids.length; i++) {
    var invite = getJSON(inviteKey(ids[i]))
    if (!invite || invite.toMemberId) continue
    invite.toMemberId = profile.memberId
    invite.resolvedAt = now()
    setJSON(inviteKey(invite.id), invite)
    pushUnique(inboxKey(profile.memberId), invite.id)
    holm.realtime.broadcast(channelForUser(profile.memberId), {
      type: 'relay:invite',
      invite: inviteInboxDTO(invite)
    })
  }
  holm.app.kv.set(pendingUserKey(username), JSON.stringify([]))
}
