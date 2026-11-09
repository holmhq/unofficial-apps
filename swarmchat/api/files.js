// Attachments: upstream SwarmChat's files.py and server.send_files (5ee0c0e, MIT) on Holm S3.
//
// Each swarm stores a file once per content (blobs <swarm>:<sha256> -> an S3 object), counted by the messages that
// refer to it. Members see a random attachment id, the name, size and type, never the hash. A download is checked
// against the message's chat. The upload body is upstream's: one line of JSON, then the files' bytes back to back.
import { Err, hex, sha256 } from './store.js';

const HEADER_LIMIT = 65536;
const MIME = /^[A-Za-z0-9][\w!#$&^.+-]*\/[A-Za-z0-9][\w!#$&^.+-]*$/;
const TYPES = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', log: 'text/plain',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  xml: 'application/xml', yaml: 'application/yaml', yml: 'application/yaml', py: 'text/x-python', sh: 'application/x-sh',
  diff: 'text/x-diff', patch: 'text/x-diff', c: 'text/x-c', h: 'text/x-c', go: 'text/x-go', rs: 'text/x-rust', java: 'text/x-java',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  pdf: 'application/pdf', zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar', wasm: 'application/wasm',
  mp3: 'audio/mpeg', wav: 'audio/x-wav', mp4: 'video/mp4', webm: 'video/webm', ogg: 'audio/ogg',
};
const IMAGE_BYTES = 25000000;
const IMAGE_PIXELS = 25000000;
const TEXT_HEAD = 16384;
const TEXT_LINES = 8;
const TEXT_WIDTH = 200;

// A media type such as text/plain, or null: it goes into a reply's Content-Type header.
export const mime = (kind) => (typeof kind === 'string' && kind.length <= 100 && MIME.test(kind) ? kind : null);

export function guess(name) {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  return (ext && TYPES[ext]) || null;
}

// A file name that cannot point anywhere else: no folders, no '..', no control characters.
export function safeName(name) {
  let n = String(name ?? '').replace(/\\/g, '/');
  n = n.slice(n.lastIndexOf('/') + 1).trim();
  n = [...n].filter((c) => !/[\p{C}]/u.test(c)).join('');
  n = [...n].slice(0, 200).join('');
  return n === '' || n === '.' || n === '..' ? 'file' : n;
}

// ------------------------------------------------------------------ what the viewer shows in place

const u16 = (b, i, le) => (le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
const u32 = (b, i, le) => (le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 16777216 : b[i] * 16777216 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]));
const i32le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const eq = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

function orientation(t) {
  const le = eq(t, 0, 'II') ? true : eq(t, 0, 'MM') ? false : null;
  if (le === null) return 1;
  const ifd = u32(t, 4, le);
  if (ifd + 2 > t.length) return 1;
  const n = u16(t, ifd, le);
  for (let i = 0; i < n; i++) {
    const at = ifd + 2 + 12 * i;
    if (at + 10 > t.length) break;
    if (u16(t, at, le) === 0x0112) return u16(t, at + 8, le);
  }
  return 1;
}

function jpeg(b) {
  let i = 2;
  let turned = false;
  for (;;) {
    if (b[i++] !== 0xff) return null;
    let marker = b[i++];
    while (marker === 0xff) marker = b[i++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = u16(b, i, false);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const h = u16(b, i + 3, false);
      const w = u16(b, i + 5, false);
      return turned ? [h, w] : [w, h];
    }
    if (marker === 0xe1 && eq(b, i + 2, 'Exif\0\0')) turned = [5, 6, 7, 8].includes(orientation(b.subarray(i + 8, i + length)));
    i += length;
    if (i >= b.length) return null;
  }
}

function webp(b) {
  if (eq(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return [u16(b, 26, true) & 0x3fff, u16(b, 28, true) & 0x3fff];
  if (eq(b, 12, 'VP8L') && b[20] === 0x2f) return [1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | (b[22] >> 6))];
  if (eq(b, 12, 'VP8X')) return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
  return null;
}

// The type and size in pixels of a PNG, JPEG, GIF, WebP or BMP, from its bytes (never its name). null otherwise.
export function image(b) {
  if (b.length > IMAGE_BYTES || b.length < 26) return null;
  let kind;
  let size = null;
  try {
    if (b[0] === 0x89 && eq(b, 1, 'PNG\r\n\x1a\n') && eq(b, 12, 'IHDR')) { kind = 'image/png'; size = [u32(b, 16, false), u32(b, 20, false)]; }
    else if (eq(b, 0, 'GIF87a') || eq(b, 0, 'GIF89a')) { kind = 'image/gif'; size = [u16(b, 6, true), u16(b, 8, true)]; }
    else if (eq(b, 0, 'RIFF') && eq(b, 8, 'WEBP')) { kind = 'image/webp'; size = webp(b); }
    else if (eq(b, 0, 'BM') && [12, 40, 52, 56, 108, 124].includes(u32(b, 14, true))) {
      kind = 'image/bmp';
      size = b[14] === 12 ? [u16(b, 18, true), u16(b, 20, true)] : [i32le(b, 18), Math.abs(i32le(b, 22))];
    } else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { kind = 'image/jpeg'; size = jpeg(b); }
  } catch { return null; }
  if (!size) return null;
  const [w, h] = size;
  if (!(w > 0 && h > 0 && w * h <= IMAGE_PIXELS)) return null;
  return { type: kind, width: w, height: h };
}

// The first lines of a file that is text: UTF-8 with no NUL byte in its first 16 KB. null otherwise.
export function textHead(b) {
  const head = b.subarray(0, TEXT_HEAD);
  const whole = b.length <= TEXT_HEAD;
  if (!head.length || head.includes(0)) return null;
  let text;
  try {
    let cut = head;
    if (!whole) { // a character cut off at the end of what was read is not a fault
      let i = head.length - 1;
      let back = 0;
      while (i >= 0 && back < 4 && (head[i] & 0xc0) === 0x80) { i--; back++; }
      if (i >= 0 && head[i] >= 0xc0) {
        const need = head[i] >= 0xf0 ? 4 : head[i] >= 0xe0 ? 3 : 2;
        if (back + 1 < need) cut = head.subarray(0, i);
      }
    }
    text = new TextDecoder('utf-8', { fatal: true }).decode(cut);
  } catch { return null; }
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '' && lines.length > 1) lines.pop();
  const shown = lines.slice(0, TEXT_LINES);
  const out = {
    preview: shown.map((l) => l.slice(0, TEXT_WIDTH)).join('\n'),
    more: !whole || lines.length > TEXT_LINES || shown.some((l) => l.length > TEXT_WIDTH),
  };
  if (whole) out.lines = lines.length;
  return out;
}

// ------------------------------------------------------------------ storing

class Retry extends Error {}

// Plans where each file's bytes go: an existing object of this swarm with the same content, or a new one.
function plan(s, files, force) {
  const plans = new Map();
  for (const f of files) {
    if (plans.has(f.sha256)) continue;
    const b = force ? null : s.ds.findOne('blobs', `${s.id}:${f.sha256}`);
    plans.set(f.sha256, b && (b.refs || 0) > 0 ? { key: b.key, put: false } : { key: `b/${s.id}/${f.sha256.slice(0, 32)}/${hex(6)}`, put: true, bytes: f.bytes });
  }
  return plans;
}

function counter(s, plans, attachments, orphans) {
  return (tx) => {
    for (const a of attachments) {
      const id = `${s.id}:${a.sha256}`;
      const p = plans.get(a.sha256);
      const b = tx.findOne('blobs', id);
      if (b && (b.refs || 0) > 0) {
        tx.update('blobs', { id }, { $set: { refs: b.refs + 1 } });
        if (p.put && b.key !== p.key) orphans.add(p.key);
      } else {
        if (!p.put) throw new Retry('stored file went away');
        if (b) tx.update('blobs', { id }, { $set: { refs: 1, key: p.key, size: a.size } });
        else tx.insert('blobs', { id, swarm: s.id, refs: 1, key: p.key, size: a.size });
      }
      s.usage(tx, a.size);
    }
  };
}

function bytesOf(view) {
  return view.byteOffset === 0 && view.byteLength === view.buffer.byteLength ? view.buffer : view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

export async function sendFiles(s, request) {
  const st = s.settings;
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > st.max_attachment + HEADER_LIMIT) throw new Err(413, `The files on one message may hold ${st.max_attachment} bytes in all.`);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > st.max_attachment + HEADER_LIMIT) throw new Err(413, `The files on one message may hold ${st.max_attachment} bytes in all.`);
  const nl = buf.indexOf(10);
  if (nl < 0 || nl > HEADER_LIMIT) throw new Err(400, 'Start with one line of JSON describing the message and its files.');
  let header;
  try { header = JSON.parse(new TextDecoder().decode(buf.subarray(0, nl))); } catch { throw new Err(400, 'The first line must be JSON.'); }
  if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Err(400, 'The first line must be a JSON object.');
  if (header.ack) { s.confirm(header.ack); delete header.ack; }
  const files = header.files;
  if (!Array.isArray(files) || !files.length) throw new Err(400, 'Name at least one file.');
  if (files.length > st.max_attachments) throw new Err(413, `At most ${st.max_attachments} files on one message.`);
  for (const f of files) {
    if (!f || typeof f !== 'object' || !Number.isInteger(f.size) || f.size < 0) throw new Err(400, 'Each file needs a name and a whole-number size.');
    if (f.size > st.max_attachment) throw new Err(413, `${safeName(f.name)} is larger than ${st.max_attachment} bytes.`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total !== buf.length - nl - 1) throw new Err(400, "The file sizes do not add up to the request's length.");
  if (total > st.max_attachment) throw new Err(413, `The files on one message may hold ${st.max_attachment} bytes in all; these hold ${total}.`);
  const text = typeof header.text === 'string' ? header.text : '';
  if (text.length > st.max_text) throw new Err(400, `The message is longer than ${st.max_text} characters.`);
  if (!header.chat) throw new Err(400, 'Say where to send: a #channel, a person, people separated by commas, or a chat id.');
  const chat = await s.chatRef(header.chat, true);
  s.member(chat);
  s.open(chat);
  const refusal = s.policy.send(s.me, chat.members, chat.name, chat.id);
  if (refusal) throw new Err(403, refusal);
  if (s.row.workspace) {
    const people = await import('./people.js');
    const cap = people.caps(s.env).bytes_per_workspace;
    const used = people.workspaceBytes(s.env, s.row);
    if (cap && used + total > cap) throw new Err(413, `These files would take this workspace past its ${cap} bytes of stored files: ${used} are stored. Delete messages with files no one needs, or ask the app admin.`);
  }
  if (st.quota) {
    const used = s.ds.findOne('swarm_n', s.id)?.bytes || 0;
    if (used + total > st.quota) throw new Err(413, `These files would take this swarm past its ${st.quota} bytes of stored files: ${used} are stored. Delete messages with files no one needs.`);
  }
  let off = nl + 1;
  const parts = [];
  for (const f of files) {
    const bytes = buf.subarray(off, off + f.size);
    off += f.size;
    const name = safeName(f.name);
    const a = { id: 'a' + hex(8), name, size: f.size, type: mime(f.type) || guess(name) || 'application/octet-stream', sha256: await sha256(bytes) };
    if (f.folder) a.folder = true;
    else {
      const pic = image(bytes);
      if (pic) a.image = pic;
      else { const t = textHead(bytes); if (t) a.text = t; }
    }
    parts.push({ a, bytes, sha256: a.sha256, size: f.size });
  }
  const attachments = parts.map((p) => p.a);
  for (let attempt = 0; ; attempt++) {
    const plans = plan(s, parts, attempt > 0);
    const put = [];
    for (const p of plans.values()) if (p.put) { s.env.holm.app.s3.put(p.key, bytesOf(p.bytes), 'application/octet-stream'); put.push(p.key); }
    const orphans = new Set();
    try {
      const message = s.send(chat, text, header.reply_to || null, attachments, counter(s, plans, attachments, orphans));
      for (const key of orphans) { try { s.env.holm.app.s3.delete(key); } catch { /* swept with the swarm */ } }
      s.forget(chat);
      return { message, chat: s.summary(s.chat(chat.id)) };
    } catch (e) {
      for (const key of put) { try { s.env.holm.app.s3.delete(key); } catch { /* swept with the swarm */ } }
      if (!(e instanceof Retry)) throw e;
      if (attempt) throw new Err(503, 'The server is busy. Send again.');
    }
  }
}

// (the attachment row, a Response) for members of its chat while its message stands. me=null for the viewer.
export function download(s, p, me = s.me) {
  const id = typeof p.id === 'string' ? p.id : '';
  const f = id ? s.ds.findOne('files', id) : null;
  const chat = f && f.swarm === s.id ? s.chat(f.chat) : null;
  if (!f || !chat || (me !== null && !chat.members.includes(me)) || !s.sees(me, chat, f.seq)) {
    throw new Err(404, `No attachment ${id} in your chats.`);
  }
  const blob = s.ds.findOne('blobs', `${s.id}:${f.sha256}`);
  const obj = blob ? s.env.holm.app.s3.get(blob.key) : null;
  if (!obj) throw new Err(404, `No attachment ${id} in your chats.`);
  const info = { id: f.id, name: f.name, size: f.size, type: f.type, ...(f.folder ? { folder: true } : {}) };
  return new Response(obj.data, {
    status: 200,
    headers: {
      'content-type': mime(f.type) || 'application/octet-stream',
      'x-attachment': JSON.stringify(info).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`),
      'cache-control': 'no-store',
    },
  });
}
