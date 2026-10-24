import { holm } from "./_holm.js";
// Relay API router (ESM). Thin dispatcher into domain modules.

import {
  handleMe, handleCreateProfile, handleUpdateProfile,
  handleSetProfilePhoto, handleClearProfilePhoto, handleProfilePhoto
} from './profiles.js'
import {
  handleSendInvite, handleSendEmailInvite, handleRedeemJoin,
  handleIncomingInvites, handleOutbox,
  handleAcceptInvite, handleDeclineInvite, handleBlockInvite
} from './invites.js'
import { handleConversations, handleSetAlias, handleMarkRoomRead, handleCreateGroup, handleLeaveGroup, handleSetGroupSlug } from './rooms.js'
import {
  handleSetContactAvatar, handleClearContactAvatar, handleContactAvatar
} from './contacts.js'
import {
  handleMessages, handleSendMessage, handleForwardMessage, handleDeleteMessage, handleTyping
} from './messages.js'
import { handleAttachment } from './attachments.js'
import { handlePreview, handlePreviewImage } from './previews.js'

function now() { return Date.now() }

export default async function handler(request) {
  var method = request.method
  var path = request.path

  if (method === 'GET' && path === '/api/health') {
    return { body: { ok: true, app: 'relay', version: holm.version, ts: now() } }
  }

  if (method === 'GET' && path === '/api/me') return handleMe()
  if (method === 'POST' && path === '/api/profile') return handleCreateProfile(request)
  if (method === 'PATCH' && path === '/api/profile') return handleUpdateProfile(request)
  if (method === 'POST' && path === '/api/profile/photo') return handleSetProfilePhoto(request)
  if (method === 'POST' && path === '/api/profile/photo/clear') return handleClearProfilePhoto(request)
  if (method === 'GET' && path.indexOf('/api/profile/photo/') === 0) return handleProfilePhoto(request)

  if (method === 'POST' && path === '/api/invites') return handleSendInvite(request)
  if (method === 'POST' && path === '/api/invites/email') return handleSendEmailInvite(request)
  if (method === 'POST' && path === '/api/invites/redeem') return handleRedeemJoin(request)
  if (method === 'GET' && path === '/api/invites') return handleIncomingInvites()
  if (method === 'GET' && path === '/api/invites/outbox') return handleOutbox()
  if (method === 'POST' && path.indexOf('/api/invites/') === 0 && path.indexOf('/accept') === path.length - 7) {
    return handleAcceptInvite(request)
  }
  if (method === 'POST' && path.indexOf('/api/invites/') === 0 && path.indexOf('/decline') === path.length - 8) {
    return handleDeclineInvite(request)
  }
  if (method === 'POST' && path.indexOf('/api/invites/') === 0 && path.indexOf('/block') === path.length - 6) {
    return handleBlockInvite(request)
  }

  if (method === 'GET' && path === '/api/conversations') return handleConversations()
  if (method === 'POST' && path.indexOf('/api/rooms/') === 0 && path.indexOf('/read') === path.length - 5) {
    return handleMarkRoomRead(request)
  }
  if (method === 'POST' && path === '/api/groups') return handleCreateGroup(request)
  if (method === 'POST' && path.indexOf('/api/groups/') === 0 && path.indexOf('/leave') === path.length - 6) {
    return handleLeaveGroup(request)
  }
  if (method === 'POST' && path.indexOf('/api/groups/') === 0 && path.indexOf('/slug') === path.length - 5) {
    return handleSetGroupSlug(request)
  }
  if (method === 'POST' && path === '/api/contacts/alias') return handleSetAlias(request)
  if (method === 'POST' && path === '/api/contacts/avatar') return handleSetContactAvatar(request)
  if (method === 'POST' && path === '/api/contacts/avatar/clear') return handleClearContactAvatar(request)
  if (method === 'GET' && path.indexOf('/api/contacts/') === 0 && path.indexOf('/avatar') === path.length - 7) {
    return handleContactAvatar(request)
  }
  if (method === 'GET' && path === '/api/messages') return handleMessages(request)
  if (method === 'POST' && path === '/api/messages') return handleSendMessage(request)
  if (method === 'POST' && path === '/api/messages/forward') return handleForwardMessage(request)
  if (method === 'DELETE' && path.indexOf('/api/messages/') === 0) return handleDeleteMessage(request)
  if (method === 'POST' && path === '/api/typing') return handleTyping(request)

  if (method === 'GET' && path.indexOf('/api/attachments/') === 0) return handleAttachment(request)

  if (method === 'GET' && path === '/api/preview') return handlePreview(request)
  if (method === 'GET' && path.indexOf('/api/preview/image') === 0) return handlePreviewImage(request)

  return { status: 404, body: { ok: false, error: 'Not found: ' + method + ' ' + path } }
}
