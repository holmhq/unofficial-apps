// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"). Each one runs the same handler
// as the app's own API, so a person only ever reads and writes the chats they're in, and a
// message Claude sends reaches everyone in the chat live, as one typed in Relay would.

import { bind, holm } from './_holm.js'
import { cleanUsername, getProfileByUsername, pairKey, groupslugKey, channelForUser } from './lib.js'
import { handleConversations, handleMarkRoomRead, getRoom, roomDTO, participant, roomReadAtKey } from './rooms.js'
import { handleMessages, handleSendMessage, messageDTO } from './messages.js'
import {
  handleSendInvite, handleSendEmailInvite, handleIncomingInvites, handleOutbox,
  handleAcceptInvite, handleDeclineInvite, handleBlockInvite
} from './invites.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 429: 'APP_RATE_LIMITED', 503: 'APP_UNAVAILABLE' }

function fail(status, message) {
  const error = new Error(message)
  error.code = CODES[status] || 'APP_INVALID_INPUT'
  error.status = status
  error.public = true
  throw error
}

// Run one of the app's own handlers, turning its { status, body } into a result or an error.
function run(handler, request) {
  return settle(handler(request))
}

function settle(result) {
  const out = result || {}
  const status = out.status || 200
  if (status < 400) return out.body
  if (out.body && out.body.needsProfile) fail(409, 'Open Relay once and pick a username first.')
  fail(status, (out.body && out.body.error) || 'Relay couldn’t do that.')
}

function signedIn(env) {
  bind(env.holm)
  const member = holm.auth.getMember()
  if (!member || !member.id) fail(401, 'Sign in to Relay first.')
  return member
}

const NO_CHAT = 'No chat by that name. Use chats_list to find it.'

// A chat by its id, a friend's @username, or a group's handle. A username you share no chat
// with gets the same answer as one that doesn't exist: Relay never says who is on it.
function chatId(member, value) {
  const raw = String(value || '').trim()
  if (!raw) fail(400, 'Say which chat: its id from chats_list, or a friend’s @username.')
  if (/^room_[a-z0-9]+$/.test(raw)) return raw
  const name = cleanUsername(raw)
  const friend = name && getProfileByUsername(name)
  const direct = friend && friend.memberId !== member.id ? holm.app.kv.get(pairKey(member.id, friend.memberId)) : ''
  const group = raw.startsWith('@') ? '' : holm.app.kv.get(groupslugKey(raw))
  const id = direct || group
  if (!id) fail(404, NO_CHAT)
  return id
}

const iso = (ts) => (ts ? new Date(ts).toISOString() : undefined)
const origin = () => holm.app.kv.get('site:origin') || ''
const count = (value, min, max, fallback) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback)

function chatBrief(c) {
  const group = c.type === 'group'
  const base = origin()
  return {
    id: c.id,
    kind: group ? 'group' : 'friend',
    name: c.title,
    username: c.username ? '@' + c.username : undefined,
    members: group ? (c.memberProfiles || []).map((p) => (p.username ? '@' + p.username : p.displayName)) : undefined,
    last_message: c.lastPreview || undefined,
    last_at: iso(c.lastAt),
    unread: c.unread || undefined,
    open: base ? base + '/chat/' + encodeURIComponent(c.id) : undefined
  }
}

function messageBrief(m, me) {
  const reply = m.replyTo
  return {
    id: m.id,
    from: m.senderId === me ? 'you' : (m.senderName || 'Someone') + (m.senderUsername ? ' (@' + m.senderUsername + ')' : ''),
    at: iso(m.ts),
    text: m.deleted ? undefined : m.text || undefined,
    deleted: m.deleted || undefined,
    forwarded_from: m.forwardedFrom ? '@' + m.forwardedFrom : undefined,
    reply_to: reply ? (reply.deleted ? { id: reply.id, deleted: true } : { id: reply.id, from: reply.senderId === me ? 'you' : reply.senderName, text: reply.text || undefined }) : undefined,
    attachments: m.attachments && m.attachments.length ? m.attachments.map((a) => ({ kind: a.kind, name: a.name, size: a.size || undefined })) : undefined
  }
}

export function chatsList(input, env) {
  signedIn(env)
  let chats = run(handleConversations).conversations || []
  if (input.unread) chats = chats.filter((c) => c.unread > 0)
  if (input.kind) chats = chats.filter((c) => (c.type === 'group') === (input.kind === 'group'))
  const limit = count(input.limit, 1, 100, 30)
  return { chats: chats.slice(0, limit).map(chatBrief), more: chats.length > limit || undefined }
}

export function messagesList(input, env) {
  const member = signedIn(env)
  const roomId = chatId(member, input.chat)
  const query = { roomId, limit: String(count(input.limit, 1, 50, 20)) }
  if (input.before) query.cursor = String(input.before)
  const body = run(handleMessages, { query })
  return {
    chat: chatBrief(roomDTO(getRoom(roomId), member.id)),
    messages: (body.messages || []).map((m) => messageBrief(m, member.id)),
    before: body.page && body.page.hasMore ? body.page.cursor : undefined
  }
}

export function messagesSend(input, env) {
  const member = signedIn(env)
  const roomId = chatId(member, input.chat)
  const text = String(input.text || '').trim()
  if (!text) fail(400, 'Write something to send.')
  const body = run(handleSendMessage, { body: { roomId, text, replyToId: input.reply_to || '' } })
  return { sent: messageBrief(body.message, member.id), open: origin() ? origin() + '/chat/' + encodeURIComponent(roomId) : undefined }
}

// Unread messages across chats: for each chat with any, the newest ones after the person's
// read watermark, oldest first. Reading them here doesn't mark them read; chats_read does.
export function messagesUnread(input, env) {
  const member = signedIn(env)
  const chats = (run(handleConversations).conversations || []).filter((c) => c.unread > 0)
  const most = count(input.limit, 1, 50, 10)
  const shown = chats.slice(0, count(input.chats, 1, 20, 10))
  return {
    chats: shown.map((c) => {
      const readAt = Number(holm.app.kv.get(roomReadAtKey(c.id, member.id))) || 0
      const rows = holm.app.ds.find('messages', { roomId: c.id, ts: { $gt: readAt }, senderId: { $ne: member.id } },
        { orderBy: 'ts', order: 'desc', limit: Math.min(most, c.unread) }) || []
      return { ...chatBrief(c), messages: rows.reverse().map((m) => messageBrief(messageDTO(m), member.id)) }
    }),
    more_chats: chats.length > shown.length ? chats.length - shown.length : undefined
  }
}

export function chatsRead(input, env) {
  const member = signedIn(env)
  const roomId = chatId(member, input.chat)
  const body = run(handleMarkRoomRead, { path: '/api/rooms/' + encodeURIComponent(roomId) + '/read', body: {} })
  // The person's open Relay pages refresh their chat list, so the badge clears there too.
  holm.realtime.broadcast(channelForUser(member.id), { type: 'relay:conversation', roomId })
  return { chat: chatBrief(body.room) }
}

export function friendsList(input, env) {
  signedIn(env)
  const friends = (run(handleConversations).conversations || []).filter((c) => c.type !== 'group')
  friends.sort((a, b) => a.title.localeCompare(b.title))
  return {
    friends: friends.map((c) => ({
      name: c.title,
      real_name: c.alias ? c.realTitle : undefined,
      username: c.username ? '@' + c.username : undefined,
      chat: c.id,
      last_at: iso(c.lastAt),
      unread: c.unread || undefined
    }))
  }
}

export function invitesList(input, env) {
  signedIn(env)
  const incoming = run(handleIncomingInvites).invites || []
  const sent = (run(handleOutbox).invites || []).slice(0, count(input.limit, 1, 100, 30))
  return {
    waiting_for_you: incoming.map((i) => ({
      id: i.id,
      from: (i.fromDisplayName || 'Someone') + (i.fromUsername ? ' (@' + i.fromUsername + ')' : ''),
      group: i.groupRoomId ? i.groupName || 'a group' : undefined,
      note: i.note || undefined,
      at: iso(i.createdAt)
    })),
    // Relay tells a sender only when an invite is accepted, so the rest read as pending.
    sent: sent.map((i) => ({
      to: i.channel === 'email' ? i.toEmail : '@' + i.toUsername,
      status: i.status,
      chat: i.roomId || undefined,
      at: iso(i.createdAt)
    }))
  }
}

export async function invitesSend(input, env) {
  const member = signedIn(env)
  const username = String(input.username || '').trim()
  const email = String(input.email || '').trim()
  if (!username === !email) fail(400, 'Give either a username or an email address.')
  if (email) {
    if (input.group) fail(400, 'An email invite is to be friends; invite someone into a group by username.')
    const base = origin()
    if (!base) fail(409, 'Open Relay once first, so the invite can link to it.')
    const body = settle(await handleSendEmailInvite({ origin: base, body: { email, note: input.note || '' } }))
    return { message: body.message }
  }
  let roomId = ''
  if (input.group) {
    roomId = chatId(member, input.group)
    const room = getRoom(roomId)
    if (!room || room.type !== 'group' || !participant(room, member.id)) fail(404, 'No group by that name. Use chats_list with kind "group" to find it.')
  }
  // The same answer whether or not the username exists, or has blocked the person.
  const body = run(handleSendInvite, { body: { username, roomId } })
  return { message: body.message }
}

export function invitesAnswer(input, env) {
  signedIn(env)
  const id = String(input.invite || '')
  const handler = { accept: handleAcceptInvite, decline: handleDeclineInvite, block: handleBlockInvite }[input.answer]
  if (!handler) fail(400, 'Answer accept, decline or block.')
  const body = run(handler, { path: '/api/invites/' + encodeURIComponent(id) + '/' + input.answer, body: {} })
  return { answer: input.answer, chat: body.room ? chatBrief(body.room) : undefined }
}
