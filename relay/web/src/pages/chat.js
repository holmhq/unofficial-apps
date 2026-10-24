// Relay — chat thread.
// Incremental keyed renderer: messages are appended/updated in place instead of
// clearing + rebuilding the whole thread, so a send (which can fire render up
// to 3× — optimistic, HTTP reconcile, realtime echo) no longer flickers.
// Deterministic send states (uploading → sending → sent → failed) drive the
// WhatsApp-style tick in the meta. Honest: Relay has no receipts, so there is
// no fake delivered/read double-tick.

import { el, clear, avatarEl, toast, openSheet, closeSheet, openLightbox, saveFile } from '../ui.js';
import { iconEl } from '../icons.js';
import { api } from '../api.js';
import { data, on, emit, session, conversationSync } from '../state.js';
import * as rt from '../realtime.js';
import { play } from '../sound.js';

const MAX_BYTES = 16 * 1024 * 1024; // mirror server cap; pre-check before the upload

function isImage(type) { return /^image\//i.test(type || ''); }

// Photos shrink in the browser before they're sent: at most 2048 pixels a side,
// as JPEG at quality 0.82 (about 300 KB), so a 48 MP phone photo uploads in a
// second instead of tens. The server still makes its 1280 px and preview copies.
// iPhone HEIC photos become JPEG whatever their size, since most browsers can't
// show HEIC; Safari decodes them, and where a browser can't, the original goes.
// Other files, GIFs and small photos are sent as they are.
async function shrinkPhoto(file) {
  const heic = /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!heic && (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 1.5 * 1024 * 1024)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || (!heic && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
function kindOf(file) {
  var t = file && file.type ? file.type : '';
  if (isImage(t)) return 'image';
  if (/^audio\//i.test(t)) return 'audio';
  if (/^video\//i.test(t)) return 'video';
  return 'file';
}

// URL detection + safe linkify (text nodes + <a>; never innerHTML, so message
// text can't inject markup). "www."-prefixed bare hosts get an https:// href.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.!,?;:)\]]/i;
function firstUrl(text) {
  const m = URL_RE.exec(String(text || ''));
  if (!m) return null;
  const raw = m[0];
  return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
}
function linkify(text) {
  const frag = document.createDocumentFragment();
  let rest = String(text || ''), m;
  while ((m = URL_RE.exec(rest))) {
    if (m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, m.index)));
    const raw = m[0];
    const href = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    const a = el('a', { class: 'bubble-link', href, target: '_blank', rel: 'noopener noreferrer nofollow', text: raw });
    a.addEventListener('click', (e) => e.stopPropagation());
    frag.appendChild(a);
    rest = rest.slice(m.index + raw.length);
  }
  if (rest) frag.appendChild(document.createTextNode(rest));
  return frag;
}

// Per-page link-preview cache (url -> preview|null) so re-renders don't refetch.
const previewCache = new Map();
function attachPreviewCard(bubble, url, onFill) {
  const card = el('a', { class: 'preview-card', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' });
  card.appendChild(el('div', { class: 'preview-skel' }));   // skeleton while loading
  bubble.appendChild(card);
  function render(p) {
    clear(card);
    if (!p || (!p.title && !p.image)) { card.remove(); return; }   // nothing useful to show
    if (p.image) {
      const img = el('img', { class: 'preview-img', alt: '', loading: 'lazy', src: api.previewImageUrl(p.image) });
      img.addEventListener('error', () => { if (img.getAttribute('src') !== p.image) img.src = p.image; }); // proxy → direct fallback
      card.appendChild(el('div', { class: 'preview-thumb' }, img));
      card.classList.add('has-img');
    }
    card.appendChild(el('div', { class: 'preview-body' },
      el('div', { class: 'preview-host mono', text: p.host || '' }),
      p.title ? el('div', { class: 'preview-title', text: p.title }) : null,
      p.description ? el('div', { class: 'preview-desc', text: p.description }) : null));
    if (typeof onFill === 'function') onFill();
  }
  if (previewCache.has(url)) { render(previewCache.get(url)); return; }
  api.preview(url)
    .then((res) => { const p = (res && res.preview) || null; previewCache.set(url, p); render(p); })
    .catch(() => { previewCache.set(url, null); card.remove(); });
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDay(ts) {
  const d = new Date(ts); const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function dayKey(ts) { return new Date(ts).toDateString(); }

export function mount(container, ctx) {
  const room = ctx.room || {};
  const roomId = room.id || ctx.roomId;
  const me = session.member && session.member.id;
  const myProfile = session.profile || {};
  const them = { username: room.username, displayName: room.title, picture: room.picture, avatar: room.avatar };
  const isGroup = room.type === 'group';
  const memberProfiles = room.memberProfiles || [];
  const profileById = (id) => memberProfiles.find((p) => p.id === id) || null;

  const thread = el('div', { class: 'thread' });
  const newMsgBtn = el('button', { class: 'newmsg-btn', 'aria-label': 'Scroll to latest', onclick: () => { scrollToBottom(true); hideNewMsg(); } },
    iconEl('chevron-left', { cls: 'rot', size: '18px' }),
    el('span', { class: 'newmsg-count' }));
  const input = el('textarea', { class: 'composer-input', rows: '1', placeholder: 'Message', autocomplete: 'off' });
  // No `accept` filter: the server stores any file (.md, .json, …) as a file chip.
  const fileInput = el('input', { type: 'file', style: { display: 'none' } });
  const attachBtn = el('button', { class: 'composer-attach', 'aria-label': 'Attach', onclick: () => fileInput.click() },
    iconEl('paperclip', { size: '20px' }));
  const sendBtn = el('button', { class: 'composer-send', 'aria-label': 'Send', onclick: () => send(input.value) },
    iconEl('arrow-up', { size: '20px' }));
  const replyHost = el('div', { class: 'reply-host' });
  const composer = el('div', { class: 'composer safe-bottom' },
    replyHost, el('div', { class: 'composer-row' }, attachBtn, input, sendBtn), fileInput);

  container.appendChild(thread);
  container.appendChild(newMsgBtn);
  container.appendChild(composer);

  const msgs = (data.messages[roomId] = data.messages[roomId] || []);
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!msgs[i] || !/^opt_/.test(msgs[i].id)) msgs.splice(i, 1);
  }
  const blobUrls = new Set(); // object URLs we created for optimistic image previews
  const PAGE_LIMIT = 20;
  let pageCursor = '';
  let hasOlder = false;
  let loadingInitial = true;
  let loadingOlder = false;
  let initialError = '';
  let olderError = '';
  let initialLoadSeq = 0;
  let olderLoadSeq = 0;
  let anchorPinUntil = 0;
  let activeAnchorGrowthCleanup = null;
  const topLoadStatus = el('div', { class: 'older-status', 'aria-live': 'polite' });
  const topLoadBtn = el('button', {
    class: 'older-load-btn',
    type: 'button',
    onclick: () => loadOlder()
  });
  const topLoadEl = el('div', { class: 'older-load' });

  // ── incremental render state ──────────────────────────────────────────────
  const rowMap = new Map();        // messageId → row element (keyed, stable across updates)
  const emptyEl = el('div', { class: 'thread-empty' },
    el('p', { text: isGroup
      ? ('This is the start of ' + (room.title || 'the group') + '.')
      : ('This is the start of your conversation with @' + (room.username || 'them') + '.') }),
    el('p', { class: 'muted', text: isGroup ? 'Invite members from group info, then say hi.' : 'Say hi, or attach a photo.' }));
  let typingEl = null;             // single managed typing row
  let lastDayKey = null;           // last date separator inserted
  let lastMsg = null;              // last appended message (drives first-in-run grouping)
  let otherTyping = false;
  let typingTimer = null;
  let lastTypingSent = 0;
  let nearBottom = true;
  let unreadCount = 0;             // messages arrived while scrolled up
  let unreadDividerEl = null;      // "New messages" divider above the first unread
  let mounted = true;
  let syncInflight = null;
  function newestRenderedTs() {
    let upTo = 0;
    rowMap.forEach((row) => {
      const m = row._msg;
      if (m && !/^opt_/.test(m.id)) upTo = Math.max(upTo, Number(m.ts) || 0);
    });
    return upTo;
  }
  function markRead(upTo = newestRenderedTs()) {
    if (!mounted || document.hidden || loadingInitial || initialError) return Promise.resolve();
    const readerId = me;
    const reads = conversationSync.reads;
    const applied = conversationSync.applied;
    const seq = (reads[roomId] || 0) + 1;
    conversationSync.reads[roomId] = seq;
    conversationSync.generation++;
    return api.markRead(roomId, upTo)
      .then((res) => {
        if (!session.member || session.member.id !== readerId || reads !== conversationSync.reads || seq !== reads[roomId] || !res || !res.room) return;
        conversationSync.generation++;
        if (applied !== conversationSync.applied) {
          emit('conversations:refresh'); // One fresh list; never patch over a newer applied list.
          return;
        }
        const c = data.conversations.find((x) => x.id === roomId);
        if (c) Object.assign(c, res.room);
        else data.conversations.push(res.room);
        emit('conversations');
        emit('room:read', Object.assign({}, res.room, { readAt: res.readAt }));
      })
      .catch(() => {});
  }
  // One convergence path for foreground/reconnect and open-room unread refreshes.
  function syncMessages() {
    if (!mounted || document.hidden) return Promise.resolve();
    if (syncInflight) return syncInflight;
    const pending = (initialError
      ? loadInitial()
      : catchUpMessages().then((rendered) => { if (rendered) return markRead(); }))
      .finally(() => { if (syncInflight === pending) syncInflight = null; });
    syncInflight = pending;
    return pending;
  }
  const unsubSync = on('sync', syncMessages);
  const unsubConversations = on('conversations', (event) => {
    const c = data.conversations.find((x) => x.id === roomId);
    if (event && event.refreshed && c && c.unread > 0) syncMessages();
  });

  // ── status / classes ──────────────────────────────────────────────────────
  const side = (m) => (m.senderId === me ? 'me' : 'them');
  // The sender profile behind a message. DM threads use the single `them`;
  // group threads resolve per-sender (every member sees every other member).
  const senderOf = (m) => {
    if (side(m) === 'me') return myProfile;
    if (isGroup) return profileById(m.senderId) || { username: m.senderUsername, displayName: m.senderName };
    return them;
  };
  function statusOf(m) {
    if (m.deleted) return 'deleted';
    if (m.failed) return 'failed';
    if (m.uploading) return 'uploading';
    if (m.pending) return 'sending';
    return 'sent';
  }
  function bubbleClass(m) {
    return 'bubble ' + side(m) + ' ' + statusOf(m);
  }
  function tickIcon(st) {
    if (st === 'failed') return 'alert-triangle';
    if (st === 'uploading') return 'refresh-cw';
    if (st === 'sending') return 'clock';
    return 'check';
  }
  function stateTitle(st) {
    if (st === 'failed') return 'Failed to send — tap to retry';
    if (st === 'uploading') return 'Uploading';
    if (st === 'sending') return 'Sending';
    return 'Sent';
  }
  const hasImage = (m) => (m.attachments || []).some((a) => a.isImage || a.kind === 'image');

  // ── reply / quote ─────────────────────────────────────────────────────────
  // `replyTo` mirrors the server snapshot ({ id, senderId, senderName, text,
  // kind, attName } or { id, deleted:true }) so the quote renders without a lookup.
  let replyingTo = null;           // message the composer is replying to
  function replySnapshot(m) {
    const att = (m.attachments || [])[0];
    return { id: m.id, senderId: m.senderId, senderName: m.senderName, text: String(m.text || '').slice(0, 160),
      kind: att ? (att.kind || (att.isImage ? 'image' : 'file')) : 'text', attName: att ? (att.name || '') : '' };
  }
  function quoteName(q) {
    if (q.senderId === me) return 'You';
    const p = isGroup ? profileById(q.senderId) : them;
    return (p && (p.displayName || p.username)) || q.senderName || 'Message';
  }
  function quoteSnippet(q) {
    if (q.deleted) return 'Message deleted';
    if (q.text) return q.text;
    if (q.kind === 'image') return 'Photo';
    if (q.kind === 'video') return 'Video';
    if (q.kind === 'audio') return 'Audio';
    return q.attName ? 'File: ' + q.attName : 'Message';
  }
  function quoteBlock(q) {
    return el('button', { class: 'bubble-quote' + (q.deleted ? ' deleted' : ''), type: 'button',
      onclick: (e) => { e.stopPropagation(); jumpToMessage(q.id); } },
      q.deleted ? null : el('div', { class: 'quote-name', text: quoteName(q) }),
      el('div', { class: 'quote-text', text: quoteSnippet(q) }));
  }
  function jumpToMessage(id) {
    const row = rowMap.get(id);
    if (!row) { toast('Original message is further up', 'reply'); return; }
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1400);
  }
  function renderReplyChip() {
    clear(replyHost);
    if (!replyingTo) return;
    const q = replySnapshot(replyingTo);
    replyHost.appendChild(el('div', { class: 'reply-chip' },
      el('div', { class: 'reply-chip-body' },
        el('div', { class: 'reply-chip-name', text: 'Replying to ' + quoteName(q) }),
        el('div', { class: 'reply-chip-text', text: quoteSnippet(q) })),
      el('button', { class: 'reply-chip-close', type: 'button', 'aria-label': 'Cancel reply', onclick: () => cancelReply() },
        iconEl('x', { size: '16px' }))));
  }
  function startReply(m) {
    if (!m || m.deleted || /^opt_/.test(m.id)) return;
    replyingTo = m;
    renderReplyChip();
    input.focus();
  }
  function cancelReply() {
    if (!replyingTo) return false;
    replyingTo = null;
    renderReplyChip();
    return true;
  }

  // Clipboard API first; execCommand fallback for older WebViews.
  function copyText(text) {
    const done = () => toast('Copied', 'check');
    const fallback = () => {
      const ta = el('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' } });
      ta.value = text;
      try {
        document.body.appendChild(ta); ta.select();
        if (!document.execCommand('copy')) throw new Error('Copy failed');
        done();
      } catch (_e) { toast('Could not copy', 'alert-triangle'); }
      finally { ta.remove(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // Ordered list of image attachments currently in the thread (msgs order), each
  // with its highest-res src + a caption. Drives the lightbox's prev/next so you
  // can sweep every image in the conversation from any one of them.
  function lightboxItems() {
    const items = [];
    msgs.forEach((m) => {
      if (m.deleted) return;
      (m.attachments || []).forEach((att) => {
        if (att.isImage || att.kind === 'image') {
          const displaySrc = m._preview || att.optimizedUrl || att.url || api.attachmentUrl(att.id);
          const boxSrc = att.url || displaySrc;
          const who = m.senderId === me ? 'You' : (them.displayName || them.username || 'Them');
          const parts = [];
          if (m.text) parts.push(m.text);
          parts.push(who + ' · ' + fmtTime(m.ts));
          items.push({ src: boxSrc, caption: parts.join('  ·  '), attId: att.id,
            save: { url: att.url || boxSrc, name: att.name } });
        }
      });
    });
    return items;
  }

  // Small "save to device" button for an attachment. Only meaningful once the
  // file is stored (att.url present) — never on an in-flight optimistic upload.
  function downloadBtn(att, cls) {
    return el('button', {
      class: 'attach-dl' + (cls ? ' ' + cls : ''), type: 'button',
      'aria-label': 'Save ' + (att.name || 'file'), title: 'Save',
      onclick: (e) => { e.stopPropagation(); saveFile(att.url || api.attachmentUrl(att.id), att.name); }
    }, iconEl('download', { size: '15px' }));
  }

  function pinIfNearBottom() {
    if (Date.now() < anchorPinUntil) return;
    if (nearBottom) scrollToBottom(false);
  }

  function applyImageGeometry(img, att) {
    const w = Number(att && att.width);
    const h = Number(att && att.height);
    img.style.aspectRatio = (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) ? (w + ' / ' + h) : '';
  }

  function pinOnImageLoad(img) {
    if (img._relayPinOnLoad) return;
    img._relayPinOnLoad = true;
    img.addEventListener('load', pinIfNearBottom);
  }

  // ── bubble builders ───────────────────────────────────────────────────────
  // Build (or rebuild) a bubble's content in place. When refreshing an existing
  // image message, pass `reuseImg` to keep the <img> node and just swap its src
  // — the old frame stays painted until the new one decodes, so there is no blink.
  function renderBubbleContent(b, m, reuseImg) {
    clear(b);
    if (m.deleted) {
      b.appendChild(el('div', { class: 'bubble-text deleted-note' },
        iconEl('trash-2', { size: '13px' }), el('span', { text: 'Message deleted' })));
    } else {
      if (m.forwardedFrom) b.appendChild(el('div', { class: 'bubble-forward' },
        iconEl('send', { size: '11px' }), el('span', { text: 'Forwarded' })));
      if (m.replyTo) b.appendChild(quoteBlock(m.replyTo));
      if (m.text) { const tw = el('div', { class: 'bubble-text' }); tw.appendChild(linkify(m.text)); b.appendChild(tw); }
      (m.attachments || []).forEach((att) => {
        if (att.isImage || att.kind === 'image') {
          const displaySrc = m._preview || att.optimizedUrl || att.url || api.attachmentUrl(att.id);
          const boxSrc = att.url || displaySrc; // lightbox opens the highest-res available
          let img;
          if (reuseImg) {
            img = reuseImg;
            if (img.getAttribute('src') !== displaySrc) swapImgSrc(img, displaySrc);
          } else {
            img = el('img', { class: 'bubble-img', src: displaySrc, loading: 'lazy' });
          }
          applyImageGeometry(img, att);
          pinOnImageLoad(img);
          img.onclick = (e) => {
            e.stopPropagation();
            const items = lightboxItems();
            const idx = items.findIndex((it) => it.attId === att.id);
            openLightbox({ items, index: idx < 0 ? 0 : idx });
          };
          b.appendChild(img);
        } else if ((att.isAudio || att.kind === 'audio') && att.url) {
          const audio = el('audio', { class: 'bubble-audio', controls: '', preload: 'metadata', src: att.url });
          audio.addEventListener('loadedmetadata', pinIfNearBottom, { once: true });
          b.appendChild(el('div', { class: 'bubble-media-row' },
            audio,
            downloadBtn(att, 'bubble-media-dl')));
        } else if ((att.isVideo || att.kind === 'video') && att.url) {
          const video = el('video', { class: 'bubble-video', controls: '', preload: 'metadata', playsinline: '', src: att.url });
          video.addEventListener('loadedmetadata', pinIfNearBottom, { once: true });
          b.appendChild(el('div', { class: 'bubble-media-col' },
            video,
            downloadBtn(att, 'bubble-media-dl')));
        } else {
          const href = att.url || api.attachmentUrl(att.id);
          b.appendChild(el('div', { class: 'bubble-file' },
            el('a', { class: 'bubble-file-main', href, target: '_blank', rel: 'noopener' },
              iconEl('file-text', { size: '16px' }),
              el('span', { class: 'bubble-file-name', text: att.name }),
              el('small', { class: 'bubble-file-size', text: fmtSize(att.size) })),
            att.url ? downloadBtn(att, 'bubble-file-dl') : null));
        }
      });
      const pvUrl = firstUrl(m.text);
      if (pvUrl) attachPreviewCard(b, pvUrl, pinIfNearBottom);
      if (statusOf(m) === 'uploading') {
        b.appendChild(el('div', { class: 'bubble-progress' },
          el('div', { class: 'bubble-progress-bar', style: { width: Math.round((m._progress || 0) * 100) + '%' } })));
      }
    }

    const meta = el('div', { class: 'bubble-meta mono' },
      el('span', { class: 'bubble-time', text: fmtTime(m.ts) }));
    if (side(m) === 'me' && !m.deleted) {
      const st = statusOf(m);
      const stateEl = el('span', { class: 'bubble-state ' + st, title: stateTitle(st) });
      stateEl.appendChild(st === 'uploading'
        ? el('span', { class: 'spin' }, iconEl('refresh-cw', { size: '12px' }))
        : iconEl(tickIcon(st), { size: '13px' }));
      meta.appendChild(stateEl);
    }
    b.appendChild(meta);
  }

  // Swap an image's src and revoke the prior blob URL only after the new one
  // finishes loading — the <img> keeps the old frame until then (no blink).
  function swapImgSrc(img, newSrc) {
    const oldSrc = img.getAttribute('src');
    if (oldSrc === newSrc) return;
    if (oldSrc && /^blob:/.test(oldSrc)) {
      img.addEventListener('load', () => URL.revokeObjectURL(oldSrc), { once: true });
    }
    img.src = newSrc;
  }

  function buildBubble(m) {
    const b = el('div', { class: bubbleClass(m) });
    renderBubbleContent(b, m, null);
    return b;
  }

  // ── keyed append / update (the hot paths — never clear the whole thread) ───
  function appendMessage(m) {
    if (rowMap.has(m.id)) { applyMessage(m); return rowMap.get(m.id); }
    if (emptyEl.parentNode) emptyEl.remove();

    const dk = dayKey(m.ts);
    if (dk !== lastDayKey) { thread.appendChild(dateSep(m.ts)); lastDayKey = dk; lastMsg = null; }

    const firstInRun = !lastMsg || lastMsg.senderId !== m.senderId || dayKey(lastMsg.ts) !== dk;
    const row = el('div', { class: 'msg-row ' + side(m) + (firstInRun ? ' first' : '') });
    if (side(m) === 'them') {
      const sndr = isGroup ? senderOf(m) : them;
      row.appendChild(firstInRun ? avatarEl(sndr, 30) : el('div', { class: 'avatar-spacer' }));
    }

    const bubble = buildBubble(m);
    if (!m.deleted) {
      // Any message can be forwarded; your own sent messages can also be deleted.
      // A failed (your) bubble instead offers tap-to-retry on tap.
      attachLongPress(bubble, () => openMessageMenu(row._msg));
      attachSwipeReply(row, bubble, () => startReply(row._msg));
      // Desktop: right-click opens the same menu (links/media keep the native one).
      bubble.addEventListener('contextmenu', (ev) => {
        if (ev.target.closest('a, img, video, audio') || row._msg.deleted) return;
        ev.preventDefault();
        openMessageMenu(row._msg);
      });
      bubble.addEventListener('click', (ev) => { if (statusOf(row._msg) === 'failed') { ev.stopPropagation(); retry(row._msg); } });
    }
    // Group threads label each sender above the first bubble of their run.
    if (isGroup && side(m) === 'them' && firstInRun && !m.deleted) {
      const sndr = senderOf(m);
      row.appendChild(el('div', { class: 'bubble-col' },
        el('div', { class: 'sender-name', text: sndr.displayName || sndr.username || 'Member' }),
        bubble));
    } else {
      row.appendChild(bubble);
    }
    row._bubble = bubble; row._msg = m;

    if (typingEl && typingEl.parentNode) thread.insertBefore(row, typingEl);
    else thread.appendChild(row);
    rowMap.set(m.id, row);
    lastMsg = m;
    return row;
  }

  // Update an existing message's row in place. Resolves the row by id, or by the
  // optimistic `optOldId` when the server id is landing for the first time.
  // Rebuilds the one bubble's content (status/tick/progress/delete) while
  // preserving the image node to avoid blink.
  function applyMessage(m, optOldId) {
    let row = rowMap.get(m.id);
    if (!row && optOldId) {
      row = rowMap.get(optOldId);
      if (row) { rowMap.delete(optOldId); rowMap.set(m.id, row); }
    }
    if (!row) { appendMessage(m); return; }
    const prev = row._msg;
    row._msg = m;
    const reuseImg = (hasImage(prev) && hasImage(m)) ? row._bubble.querySelector('.bubble-img') : null;
    renderBubbleContent(row._bubble, m, reuseImg);
    row._bubble.className = bubbleClass(m);
  }

  function dateSep(ts) { return el('div', { class: 'date-sep' }, el('span', { text: fmtDay(ts) })); }

  function typingRow() {
    return el('div', { class: 'msg-row them typing-row' },
      avatarEl(them, 30),
      el('div', { class: 'bubble them typing' },
        el('span', { class: 'dot' }), el('span', { class: 'dot' }), el('span', { class: 'dot' })));
  }

  function setPageState(res) {
    const page = res && res.page ? res.page : null;
    pageCursor = page && page.cursor ? String(page.cursor) : '';
    hasOlder = !!pageCursor;
  }

  function renderTopLoad() {
    clear(topLoadEl);
    topLoadEl.hidden = false;
    topLoadEl.className = 'older-load';
    topLoadBtn.className = 'older-load-btn';
    topLoadBtn.disabled = false;
    topLoadBtn.removeAttribute('aria-disabled');
    topLoadBtn.onclick = () => loadOlder();
    topLoadBtn.textContent = 'Load earlier messages';
    topLoadStatus.textContent = '';
    topLoadStatus.className = 'older-status';

    if (loadingInitial) {
      topLoadEl.classList.add('loading');
      topLoadStatus.textContent = 'Loading messages...';
      topLoadEl.appendChild(topLoadStatus);
    } else if (loadingOlder) {
      topLoadEl.classList.add('loading');
      topLoadBtn.textContent = 'Loading earlier messages...';
      topLoadBtn.disabled = true;
      topLoadBtn.setAttribute('aria-disabled', 'true');
      topLoadStatus.textContent = 'Loading earlier messages';
      topLoadEl.appendChild(topLoadBtn);
      topLoadEl.appendChild(topLoadStatus);
    } else if (initialError) {
      topLoadEl.classList.add('error');
      topLoadBtn.textContent = 'Retry loading messages';
      topLoadBtn.onclick = () => loadInitial();
      topLoadStatus.textContent = initialError;
      topLoadEl.appendChild(topLoadStatus);
      topLoadEl.appendChild(topLoadBtn);
    } else if (olderError) {
      topLoadEl.classList.add('error');
      topLoadBtn.textContent = 'Retry earlier messages';
      topLoadStatus.textContent = olderError;
      topLoadEl.appendChild(topLoadStatus);
      topLoadEl.appendChild(topLoadBtn);
    } else if (hasOlder) {
      topLoadEl.appendChild(topLoadBtn);
    } else if (msgs.length) {
      topLoadEl.classList.add('done');
      topLoadStatus.textContent = 'Beginning of conversation';
      topLoadEl.appendChild(topLoadStatus);
    } else {
      topLoadEl.hidden = true;
    }
  }

  // Full rebuild — for initial load, paged prepends, tab re-entry, typing toggle.
  function fullRender() {
    clear(thread);
    rowMap.clear();
    lastDayKey = null;
    lastMsg = null;
    typingEl = null;
    renderTopLoad();
    thread.appendChild(topLoadEl);
    if (!msgs.length && !otherTyping) {
      if (loadingInitial || initialError) return;
      thread.appendChild(emptyEl);
      return;
    }
    msgs.forEach((m) => appendMessage(m));
    setTypingVisual(otherTyping);
  }

  // ── scrolling + new-message indicator ─────────────────────────────────────
  function scrollToBottom(smooth) {
    nearBottom = true;
    thread.scrollTo({ top: thread.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }
  function showNewMsg(row) {
    if (!unreadDividerEl && row && row.parentNode) {
      unreadDividerEl = el('div', { class: 'newmsg-sep' }, el('span', { text: 'New messages' }));
      thread.insertBefore(unreadDividerEl, row);
    }
    unreadCount++;
    updateNewMsgBtn();
  }
  function hideNewMsg() {
    if (unreadDividerEl) { unreadDividerEl.remove(); unreadDividerEl = null; }
    unreadCount = 0;
    updateNewMsgBtn();
  }
  function updateNewMsgBtn() {
    const show = ((!nearBottom && msgs.length > 0) || unreadCount > 0);
    newMsgBtn.classList.toggle('show', show);
    const countEl = newMsgBtn.querySelector('.newmsg-count');
    countEl.textContent = unreadCount > 0 ? String(unreadCount) : '';
    countEl.style.display = unreadCount > 0 ? '' : 'none';
  }

  thread.addEventListener('scroll', () => {
    const dist = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    nearBottom = dist < 120;
    updateNewMsgBtn();
    if (nearBottom && unreadCount) hideNewMsg();
    if (thread.scrollTop <= 40) loadOlder();
  });

  function cleanupAnchorGrowth() {
    if (activeAnchorGrowthCleanup) {
      activeAnchorGrowthCleanup();
      activeAnchorGrowthCleanup = null;
    }
  }

  function cancelAnchorGrowthForInteraction(e) {
    if (!activeAnchorGrowthCleanup) return;
    if (e && e.type === 'keydown') {
      const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (!keys.includes(e.key)) return;
    }
    cleanupAnchorGrowth();
  }

  function captureAnchor() {
    const anchor = { id: '', top: 0, scrollHeight: thread.scrollHeight, scrollTop: thread.scrollTop };
    const threadTop = thread.getBoundingClientRect().top;
    const rows = thread.querySelectorAll('.msg-row');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row._msg || /^opt_/.test(row._msg.id)) continue;
      const rect = row.getBoundingClientRect();
      if (rect.bottom > threadTop + 1) {
        anchor.id = row._msg.id;
        anchor.top = rect.top;
        return anchor;
      }
    }
    return anchor;
  }

  function restoreAnchor(anchor) {
    if (!anchor) return null;
    if (anchor.id) {
      const row = rowMap.get(anchor.id);
      if (row) {
        thread.scrollTop += row.getBoundingClientRect().top - anchor.top;
        return row;
      }
    }
    thread.scrollTop = anchor.scrollTop + (thread.scrollHeight - anchor.scrollHeight);
    return null;
  }

  function watchAnchorGrowth(anchor) {
    cleanupAnchorGrowth();
    if (!anchor || !anchor.id || typeof ResizeObserver === 'undefined') return;
    const row = rowMap.get(anchor.id);
    if (!row) return;
    const children = Array.prototype.slice.call(thread.children);
    const rowIndex = children.indexOf(row);
    if (rowIndex <= 0) return;
    let raf = 0;
    let timeout = 0;
    let canceled = false;
    const adjust = () => {
      raf = 0;
      if (canceled) return;
      const current = rowMap.get(anchor.id);
      if (current) thread.scrollTop += current.getBoundingClientRect().top - anchor.top;
    };
    const ro = new ResizeObserver(() => {
      if (canceled) return;
      if (!raf) raf = requestAnimationFrame(adjust);
    });
    const cleanup = () => {
      if (canceled) return;
      canceled = true;
      if (raf) cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
      ro.disconnect();
      if (activeAnchorGrowthCleanup === cleanup) activeAnchorGrowthCleanup = null;
    };
    activeAnchorGrowthCleanup = cleanup;
    children.slice(Math.max(0, rowIndex - 80), rowIndex + 1).forEach((node) => ro.observe(node));
    timeout = setTimeout(cleanup, 1600);
  }

  thread.addEventListener('wheel', cancelAnchorGrowthForInteraction, { passive: true });
  thread.addEventListener('touchmove', cancelAnchorGrowthForInteraction, { passive: true });
  thread.addEventListener('pointerdown', cancelAnchorGrowthForInteraction);
  thread.addEventListener('keydown', cancelAnchorGrowthForInteraction);
  document.addEventListener('keydown', cancelAnchorGrowthForInteraction);

  // ── typing visual ─────────────────────────────────────────────────────────
  function setTypingVisual(on) {
    if (on && !typingEl) { typingEl = typingRow(); thread.appendChild(typingEl); scrollToBottom(true); }
    else if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }

  // ── send ──────────────────────────────────────────────────────────────────
  function autoSize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }

  // A tombstone invalidates every loaded quote, not just the latest page.
  function applyTombstone(id) {
    msgs.forEach((m) => {
      let changed = false;
      if (m.id === id) { m.deleted = true; m.text = ''; m.attachments = []; changed = true; }
      if (m.replyTo && m.replyTo.id === id) { m.replyTo = { id, deleted: true }; changed = true; }
      if (changed) applyMessage(m);
    });
    if (replyingTo && replyingTo.id === id) cancelReply();
  }

  // Drop the optimistic placeholder (if any) and upsert by server id.
  // Tombstones also scrub loaded quotes before HTTP/realtime reconciliation renders.
  function reconcileMessage(serverMsg, optTempId) {
    if (!serverMsg) return;
    if (optTempId) {
      const oi = msgs.findIndex((m) => m.id === optTempId);
      if (oi >= 0) msgs.splice(oi, 1);
    }
    const ei = msgs.findIndex((m) => m.id === serverMsg.id);
    if (ei >= 0) msgs[ei] = serverMsg;
    else msgs.push(serverMsg);
    if (serverMsg.deleted) applyTombstone(serverMsg.id);
    if (serverMsg.replyTo && serverMsg.replyTo.deleted) applyTombstone(serverMsg.replyTo.id);
  }

  function catchUpMessages() {
    if (!mounted || loadingInitial || initialError) return Promise.resolve(false);
    const wasEmpty = msgs.length === 0;
    return api.messages(roomId, { limit: PAGE_LIMIT })
      .then((res) => {
        if (!mounted) return false;
        const latest = (res && res.messages) || [];
        latest.forEach((m) => {
          if (m.deleted) applyTombstone(m.id);
          if (m.replyTo && m.replyTo.deleted) applyTombstone(m.replyTo.id);
        });
        if (msgs.some((m) => !/^opt_/.test(m.id)) && res && res.page && res.page.hasMore && !latest.some((m) => rowMap.has(m.id))) {
          // No overlap: replace the gapped history and let the normal older cursor recover it.
          return loadInitial(true).then(() => false); // Initial load already marks read.
        }
        // Leave unconfirmed own sends to HTTP reconciliation; still catch up peers.
        const pendingSend = msgs.some((m) => /^opt_/.test(m.id) && !m.failed);
        const fetched = latest.filter((m) => !pendingSend || m.senderId !== me || rowMap.has(m.id));
        if (wasEmpty && !msgs.length) {
          setPageState(res);
          mergeInitialMessages(fetched);
          fullRender();
        } else {
          fetched.forEach((m) => { reconcileMessage(m); applyMessage(m); });
        }
        pinIfNearBottom();
        return true;
      })
      .catch(() => false);
  }

  function mergeInitialMessages(fetched) {
    const mergedById = new Map();
    (fetched || []).forEach((m) => {
      if (m && m.id) mergedById.set(m.id, m);
    });
    msgs.forEach((m) => {
      if (m && m.id && !mergedById.has(m.id)) mergedById.set(m.id, m);
    });
    const merged = Array.from(mergedById.values())
      .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    msgs.length = 0;
    merged.forEach((m) => msgs.push(m));
    (fetched || []).forEach((m) => {
      if (m.deleted) applyTombstone(m.id);
      if (m.replyTo && m.replyTo.deleted) applyTombstone(m.replyTo.id);
    });
  }

  function mergeOlderMessages(fetched) {
    const existingById = new Map();
    msgs.forEach((m, i) => { if (m && m.id) existingById.set(m.id, i); });
    const prepend = [];
    fetched.forEach((m) => {
      if (!m || !m.id) return;
      const currentIndex = existingById.get(m.id);
      if (currentIndex !== undefined && currentIndex >= 0) {
        msgs[currentIndex] = m;
      } else if (currentIndex === undefined) {
        prepend.push(m);
        existingById.set(m.id, -1);
      }
    });
    if (prepend.length) msgs.unshift(...prepend);
    fetched.forEach((m) => {
      if (m.deleted) applyTombstone(m.id);
      if (m.replyTo && m.replyTo.deleted) applyTombstone(m.replyTo.id);
    });
    return prepend.length;
  }

  function loadOlder() {
    if (!mounted || loadingInitial || loadingOlder || !hasOlder || !pageCursor) return;
    const seq = ++olderLoadSeq;
    const cursor = pageCursor;
    const anchor = captureAnchor();
    loadingOlder = true;
    olderError = '';
    renderTopLoad();
    api.messages(roomId, { limit: PAGE_LIMIT, cursor })
      .then((res) => {
        if (!mounted || seq !== olderLoadSeq || cursor !== pageCursor) return;
        const fetched = (res && res.messages) || [];
        const changed = mergeOlderMessages(fetched);
        setPageState(res);
        loadingOlder = false;
        olderError = '';
        if (changed || fetched.length) {
          anchorPinUntil = Date.now() + 1700;
          fullRender();
          restoreAnchor(anchor);
          watchAnchorGrowth(anchor);
        } else {
          renderTopLoad();
        }
      })
      .catch(() => {
        if (!mounted || seq !== olderLoadSeq) return;
        loadingOlder = false;
        olderError = 'Could not load earlier messages';
        renderTopLoad();
      });
  }

  const olderObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadOlder();
      }, { root: thread, threshold: 0.01 })
    : null;
  if (olderObserver) olderObserver.observe(topLoadEl);

  // Core transmit (shared by send + retry). Resolves/rejects the optimistic row.
  function transmit(opt) {
    const file = opt._file;
    const call = file
      ? api.sendMessageWithProgress(roomId, opt.text, file, (p) => {
          opt._progress = p;
          const row = rowMap.get(opt.id);
          const bar = row && row._bubble.querySelector('.bubble-progress-bar');
          if (bar) bar.style.width = Math.round(p * 100) + '%';
        }, opt._replyToId)
      : api.sendMessage(roomId, opt.text, null, null, opt._replyToId);

    call.then((res) => {
      const confirmed = res.message;
      reconcileMessage(confirmed, opt.id); // data array: drop opt, upsert confirmed
      applyMessage(confirmed, opt.id);     // DOM: remap row → server id, flip to sent
      play('send');
    }).catch((err) => {
      opt.failed = true; opt.uploading = false; opt.pending = false; opt._progress = 0;
      // The quoted message was deleted meanwhile: drop the quote so a retry can land.
      if (opt._replyToId && err && err.data && err.data.code === 'reply_invalid') {
        opt._replyToId = null; opt.replyTo = null;
        toast('The original was deleted. Tap the message to send it without the quote.', 'alert-triangle');
      } else {
        toast((err && err.data && err.data.error) || (err && err.message) || 'Could not send message', 'alert-triangle');
      }
      applyMessage(opt); // stay in the array as a failed bubble (tap to retry)
    });
  }

  function send(textValue, file) {
    const text = String(textValue || '').trim();
    if (!text && !file) return;
    if (file && file.size > MAX_BYTES) { toast('File too large (max 16 MB)', 'alert-triangle'); return; }
    input.value = ''; autoSize();
    setTyping(false);

    let optAtt = null, optPreview = null;
    if (file) {
      const kind = kindOf(file);
      const img = kind === 'image';
      optAtt = { id: 'opt_att', kind, isImage: img, isAudio: kind === 'audio', isVideo: kind === 'video', name: file.name, mime: file.type, size: file.size, optimizedUrl: null, url: null };
      if (img) { optPreview = URL.createObjectURL(file); blobUrls.add(optPreview); }
    }
    const quoted = replyingTo;
    cancelReply();
    const opt = {
      id: 'opt_' + Date.now(), roomId, senderId: me,
      senderName: myProfile.displayName, senderUsername: myProfile.username,
      text, attachments: optAtt ? [optAtt] : [], ts: Date.now(),
      replyTo: quoted ? replySnapshot(quoted) : null, _replyToId: quoted ? quoted.id : null,
      uploading: !!file, pending: !file, _preview: optPreview, _file: file || null, _progress: 0
    };
    msgs.push(opt);
    appendMessage(opt);
    scrollToBottom(true); // own send always pins to the latest
    updateNewMsgBtn();
    transmit(opt);
  }

  function retry(m) {
    m.failed = false; m.pending = !m._file; m.uploading = !!m._file; m._progress = 0;
    applyMessage(m);
    transmit(m);
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const text = input.value;
    fileInput.value = '';
    send(text, await shrinkPhoto(f));
  });

  input.addEventListener('input', () => { autoSize(); setTyping(true); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
    // Esc cancels a pending reply before the global handler backs out of the chat.
    else if (e.key === 'Escape' && replyingTo) { e.preventDefault(); e.stopPropagation(); cancelReply(); }
  });

  // The composer is position:fixed at the visual-viewport bottom (styles.css),
  // so it rises above the iOS keyboard WITHOUT shrinking the app shell (which is
  // what lifted the tab bar and sent the scroll to the top). We measure its
  // height so the thread reserves room and stays scrolled to the latest message
  // just above it. (Framework7-style: shell stays full-height; only the docked
  // input tracks the keyboard via the visual viewport.)
  const docEl = document.documentElement;
  const setComposerH = () => container.style.setProperty('--composer-h', composer.offsetHeight + 'px');
  setComposerH();
  const composerRO = new ResizeObserver(setComposerH);
  composerRO.observe(composer);
  input.addEventListener('focus', () => {
    docEl.classList.add('keyboard');   // --sab→0 (home-indicator covered) + enable --kb
    scrollToBottom(false);             // pin the latest above the rising composer
  });
  input.addEventListener('blur', () => docEl.classList.remove('keyboard'));
  // As the keyboard animates in/out, keep the thread pinned to the latest only if
  // the user was already at the bottom — never fight a manual scroll-up.
  const onVV = () => { if (nearBottom) scrollToBottom(false); };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onVV);

  // ── typing broadcast ──────────────────────────────────────────────────────
  function setTyping(typing) {
    if (typing) {
      const now = Date.now();
      if (now - lastTypingSent > 2500) { api.setTyping(roomId, true).catch(() => {}); lastTypingSent = now; }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setTyping(false), 2200);
    } else {
      clearTimeout(typingTimer);
      if (lastTypingSent) { api.setTyping(roomId, false).catch(() => {}); lastTypingSent = 0; }
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  function askDelete(m) {
    openSheet(el('div', { class: 'sheet-body' },
      el('div', { class: 'sheet-title', text: 'Delete message?' }),
      el('p', { class: 'sheet-sub', text: 'This message will be deleted for everyone in this chat.' }),
      el('button', { class: 'btn block danger', onclick: () => { doDelete(m); closeSheet(); } },
        iconEl('trash-2', { size: '18px' }), 'Delete'),
      el('button', { class: 'btn ghost block', onclick: () => closeSheet() }, 'Cancel')
    ));
  }
  function doDelete(m) {
    api.deleteMessage(m.id)
      .then(() => applyTombstone(m.id))
      .catch(() => {});
  }

  // ── forward ───────────────────────────────────────────────────────────────
  // Long-press any message → menu. Forward is universal; Delete only for your
  // own sent messages. Forwarding opens a picker of your other chats and re-sends
  // the message (text + attachments) into the chosen one — handled server-side so
  // cross-room attachment access stays correct.
  function openMessageMenu(m) {
    if (!m || m.deleted) return;
    const actions = [];
    if (!/^opt_/.test(m.id)) {
      actions.push(el('button', { class: 'btn block', onclick: () => { closeSheet(); startReply(m); } },
        iconEl('reply', { size: '18px' }), 'Reply'));
    }
    if (m.text) {
      actions.push(el('button', { class: 'btn block', onclick: () => { copyText(m.text); closeSheet(); } },
        iconEl('copy', { size: '18px' }), 'Copy'));
    }
    actions.push(el('button', { class: 'btn block', onclick: () => { closeSheet(); openForwardPicker(m); } },
      iconEl('send', { size: '18px' }), 'Forward'));
    if (side(m) === 'me' && !m.deleted) {
      actions.push(el('button', { class: 'btn block danger', onclick: () => { closeSheet(); askDelete(m); } },
        iconEl('trash-2', { size: '18px' }), 'Delete'));
    }
    const label = m.text ? (m.text.length > 40 ? m.text.slice(0, 37) + '…' : m.text) : (hasImage(m) ? 'Photo' : 'Message');
    openSheet(el('div', { class: 'sheet-body' },
      el('div', { class: 'sheet-title', text: label }),
      el('div', { style: { marginTop: '6px' } }, ...actions),
      el('button', { class: 'btn ghost block', onclick: () => closeSheet() }, 'Cancel')
    ));
  }

  function openForwardPicker(m) {
    const rooms = (data.conversations || []).filter((c) => c.id !== roomId);
    const body = el('div', { class: 'sheet-body' },
      el('div', { class: 'sheet-title', text: 'Forward to' }),
      rooms.length ? null : el('p', { class: 'sheet-sub', text: 'No other chats to forward to yet.' }));
    rooms.forEach((c) => {
      body.appendChild(el('button', { class: 'picker-row', onclick: () => doForward(m, c) },
        avatarEl({ picture: c.picture, avatar: c.avatar, username: c.username, displayName: c.title }, 40),
        el('div', { class: 'picker-name', text: c.title || ('@' + (c.username || '')) })));
    });
    body.appendChild(el('button', { class: 'btn ghost block', style: { marginTop: '10px' }, onclick: () => closeSheet() }, 'Cancel'));
    openSheet(body);
  }

  function doForward(m, target) {
    closeSheet();
    api.forwardMessage(m.id, target.id)
      .then(() => { toast('Forwarded to ' + (target.title || target.username || 'chat'), 'send'); play('send'); })
      .catch(() => toast('Could not forward', 'x'));
  }

  // ── realtime ──────────────────────────────────────────────────────────────
  // Content arrives on my own secret channel, never a per-room one: a leaked
  // room URL must not let a non-member listen in. The channel carries payloads
  // for every room I'm in, so filter to THIS thread. main.js's onUserData
  // handles notify/conversation/invite on the same channel (realtime.js fans a
  // channel out to all registered handlers).
  const unsub = session.channel ? rt.channel(session.channel, (payload) => {
    if (!payload) return;
    const prid = payload.message ? payload.message.roomId : payload.roomId;
    if (prid && prid !== roomId) return;          // a different room's payload
    if (payload.type === 'relay:message' && payload.message) {
      const sm = payload.message;
      if (sm.deleted) {
        reconcileMessage(sm);
        applyMessage(sm);
      } else if (sm.senderId === me) {
        // Our own echo: reconcile against the pending placeholder (the HTTP
        // response may still be in flight) instead of pushing a 2nd bubble.
        const opt = msgs.find((m) => /^opt_/.test(m.id));
        reconcileMessage(sm, opt ? opt.id : null);
        applyMessage(sm, opt ? opt.id : null);
      } else if (!rowMap.has(sm.id)) {
        reconcileMessage(sm);
        const row = appendMessage(sm);
        play('receive');
        if (nearBottom) scrollToBottom(true);
        else showNewMsg(row);
      }
      if (sm.replyTo && sm.replyTo.deleted) applyTombstone(sm.replyTo.id);
      markRead();
    } else if (payload.type === 'relay:messageDeleted' && payload.messageId) {
      applyTombstone(payload.messageId);
    } else if (payload.type === 'relay:typing') {
      if (payload.memberId !== me) {
        const was = otherTyping;
        otherTyping = !!payload.typing;
        if (was !== otherTyping) { setTypingVisual(otherTyping); if (otherTyping) scrollToBottom(true); }
      }
    }
  }) : () => {};

  // ── load ──────────────────────────────────────────────────────────────────
  function loadInitial(reset = false) {
    const seq = ++initialLoadSeq;
    if (reset) {
      olderLoadSeq++;
      loadingOlder = false;
      cleanupAnchorGrowth();
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (!/^opt_/.test(msgs[i].id)) msgs.splice(i, 1);
      }
      hideNewMsg();
    }
    loadingInitial = true;
    initialError = '';
    olderError = '';
    if (reset) fullRender();
    else renderTopLoad();
    return api.messages(roomId, { limit: PAGE_LIMIT })
    .then((res) => {
      if (!mounted || seq !== initialLoadSeq) return;
      setPageState(res);
      mergeInitialMessages((res && res.messages) || []);
      loadingInitial = false;
      initialError = '';
      fullRender();
      scrollToBottom(false);
      return markRead();
    })
    .catch(() => {
      if (!mounted || seq !== initialLoadSeq) return;
      loadingInitial = false;
      initialError = 'Could not load messages';
      pageCursor = '';
      hasOlder = false;
      fullRender();
    });
  }

  loadInitial();
  fullRender();
  scrollToBottom(false);
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    setTimeout(() => input.focus(), 120);
  }

  return () => { mounted = false; cleanupAnchorGrowth(); unsub(); unsubSync(); unsubConversations(); if (olderObserver) olderObserver.disconnect(); document.removeEventListener('keydown', cancelAnchorGrowthForInteraction); clearTimeout(typingTimer); blobUrls.forEach((u) => URL.revokeObjectURL(u));
    composerRO.disconnect();
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', onVV);
    docEl.classList.remove('keyboard'); };
}

// ── helpers shared in this module ──────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Long-press (touch + mouse) → callback. Cancels on move/leave/short tap.
// Swipe a bubble right to reply (touch only). Intent is locked on the first
// ~10px of travel so vertical thread scrolling is never hijacked, and touches
// starting at the screen's left edge are left to the iOS back gesture.
function attachSwipeReply(row, bubble, onReply) {
  const THRESHOLD = 56, MAX = 84;
  let x0 = 0, y0 = 0, dx = 0, mode = null, ico = null;
  const reset = () => {
    bubble.style.transition = 'transform 0.18s cubic-bezier(0.22, 0.61, 0.36, 1)';
    bubble.style.transform = '';
    if (ico) { ico.style.opacity = '0'; ico.classList.remove('armed'); }
    mode = null; dx = 0;
  };
  bubble.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || t.clientX < 24) { mode = 'skip'; return; }
    x0 = t.clientX; y0 = t.clientY; dx = 0; mode = null;
  }, { passive: true });
  bubble.addEventListener('touchmove', (e) => {
    if (mode === 'skip' || mode === 'v') return;
    const t = e.touches[0];
    const mx = t.clientX - x0, my = t.clientY - y0;
    if (!mode) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      mode = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.4) ? 'h' : 'v';
      if (mode === 'v') return;
      if (!ico) { ico = el('div', { class: 'swipe-reply-ico' }, iconEl('reply', { size: '15px' })); row.appendChild(ico); }
      ico.style.left = Math.max(2, bubble.offsetLeft - 34) + 'px';
      bubble.style.transition = 'none';
    }
    if (e.cancelable) e.preventDefault();
    dx = Math.min(MAX, Math.max(0, mx));
    bubble.style.transform = 'translateX(' + dx + 'px)';
    ico.style.opacity = String(Math.min(1, dx / THRESHOLD));
    ico.classList.toggle('armed', dx >= THRESHOLD);
  }, { passive: false });
  bubble.addEventListener('touchend', () => {
    if (mode === 'h') { if (dx >= THRESHOLD) onReply(); reset(); } else mode = null;
  });
  bubble.addEventListener('touchcancel', reset);
}

function attachLongPress(node, cb) {
  let timer = null; let fired = false;
  const start = (e) => {
    fired = false;
    timer = setTimeout(() => { fired = true; cb(); if (e.cancelable) e.preventDefault(); }, 480);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  node.addEventListener('touchstart', start, { passive: true });
  node.addEventListener('touchend', cancel);
  node.addEventListener('touchmove', cancel);
  node.addEventListener('touchcancel', cancel);
  node.addEventListener('mousedown', start);
  node.addEventListener('mouseup', cancel);
  node.addEventListener('mouseleave', cancel);
  node.addEventListener('mousemove', cancel);
}
