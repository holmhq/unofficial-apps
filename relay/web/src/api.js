// Relay — API client (auth-aware fetch wrapper).

async function request(method, path, opts) {
  opts = opts || {};
  const init = { method, credentials: 'include', headers: {} };
  if (opts.body instanceof FormData) {
    init.body = opts.body;
  } else if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  let url = path;
  if (opts.query) url += '?' + new URLSearchParams(opts.query).toString();

  let res, data = null;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const err = new Error('Network error');
    err.network = true;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) data = await res.json().catch(() => null);
  else { try { data = await res.json(); } catch (_e) { data = null; } }

  if (!res.ok) {
    const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('GET', '/api/health'),
  me: () => request('GET', '/api/me'),
  claimProfile: (username) => request('POST', '/api/profile', { body: { username } }),
  updateProfile: (displayName) => request('PATCH', '/api/profile', { body: { displayName } }),
  setProfilePhoto: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/profile/photo', { body: fd });
  },
  clearProfilePhoto: () => request('POST', '/api/profile/photo/clear'),

  sendInvite: (username, roomId) => request('POST', '/api/invites', { body: roomId ? { username, roomId } : { username } }),
  sendEmailInvite: (email, note) => request('POST', '/api/invites/email', { body: note ? { email, note } : { email } }),
  redeemJoin: (token) => request('POST', '/api/invites/redeem', { body: { token } }),
  incoming: () => request('GET', '/api/invites'),
  outbox: () => request('GET', '/api/invites/outbox'),
  acceptInvite: (id) => request('POST', '/api/invites/' + encodeURIComponent(id) + '/accept'),
  declineInvite: (id) => request('POST', '/api/invites/' + encodeURIComponent(id) + '/decline'),
  blockInvite: (id) => request('POST', '/api/invites/' + encodeURIComponent(id) + '/block'),

  createGroup: (name, slug) => request('POST', '/api/groups', { body: slug ? { name, slug } : { name } }),
  leaveGroup: (roomId) => request('POST', '/api/groups/' + encodeURIComponent(roomId) + '/leave'),
  setGroupSlug: (roomId, slug) => request('POST', '/api/groups/' + encodeURIComponent(roomId) + '/slug', { body: { slug } }),

  conversations: () => request('GET', '/api/conversations'),
  markRead: (roomId, upTo) => request('POST', '/api/rooms/' + encodeURIComponent(roomId) + '/read', { body: { upTo } }),
  setAlias: (roomId, displayName) => request('POST', '/api/contacts/alias', { body: { roomId, displayName } }),
  setContactAvatar: (roomId, file) => {
    const fd = new FormData();
    fd.append('roomId', roomId);
    fd.append('file', file);
    return request('POST', '/api/contacts/avatar', { body: fd });
  },
  clearContactAvatar: (roomId) => request('POST', '/api/contacts/avatar/clear', { body: { roomId } }),
  contactAvatarUrl: (contactId) => '/api/contacts/' + encodeURIComponent(contactId) + '/avatar',
  messages: (roomId, opts = {}) => {
    const query = { roomId };
    if (opts.limit !== undefined) query.limit = opts.limit;
    if (opts.cursor) query.cursor = opts.cursor;
    return request('GET', '/api/messages', { query });
  },
  sendMessage: (roomId, text, file, onProgress, replyToId) => {
    if (file) {
      if (onProgress) return api.sendMessageWithProgress(roomId, text, file, onProgress, replyToId);
      const fd = new FormData();
      fd.append('roomId', roomId);
      if (text) fd.append('text', text);
      if (replyToId) fd.append('replyToId', replyToId);
      fd.append('file', file);
      return request('POST', '/api/messages', { body: fd });
    }
    return request('POST', '/api/messages', { body: { roomId, text, replyToId } });
  },
  // File sends go through XHR so we can report upload progress (fetch can't).
  // Mirrors request()'s error shape ({ status, data, network }) for the caller.
  sendMessageWithProgress: (roomId, text, file, onProgress, replyToId) => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('roomId', roomId);
    if (text) fd.append('text', text);
    if (replyToId) fd.append('replyToId', replyToId);
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/messages');
    xhr.withCredentials = true;
    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); });
    }
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch (_e) { body = null; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else { const err = new Error((body && body.error) || ('Upload failed (' + xhr.status + ')')); err.status = xhr.status; err.data = body; reject(err); }
    };
    xhr.onerror = () => { const err = new Error('Network error'); err.network = true; reject(err); };
    xhr.onabort = () => { const err = new Error('Upload aborted'); reject(err); };
    xhr.send(fd);
  }),
  deleteMessage: (id) => request('DELETE', '/api/messages/' + encodeURIComponent(id)),
  forwardMessage: (messageId, targetRoomId) => request('POST', '/api/messages/forward', { body: { messageId, targetRoomId } }),
  setTyping: (roomId, typing) => request('POST', '/api/typing', { body: { roomId, typing } }),

  attachmentUrl: (id, variant) => '/api/attachments/' + encodeURIComponent(id) + '?variant=' + (variant || 'original'),

  preview: (url) => request('GET', '/api/preview', { query: { url } }),
  previewImageUrl: (u) => '/api/preview/image?u=' + encodeURIComponent(u)
};
