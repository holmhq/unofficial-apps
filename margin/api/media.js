// Photos, drawings (SVG) and short videos for posts, covers and avatars. Bytes live in app
// storage under media/<id>; the record keeps type, size and pixel size so pages reserve the
// space. Photos come in from Studio (shrunk in the browser), from an upload link (a page or
// curl) or from Claude (media.upload). Smaller copies are made the first time a page asks for
// one, at /media/<id>-w640.jpg and the like, and kept beside the original.
import { byId } from './lib/store.js';
import { reject, json, randomId, int, sha256 } from './lib/util.js';

const IMAGE_MAX = 12 * 1024 * 1024;
const VIDEO_MAX = 20 * 1024 * 1024;
const SVG_MAX = 512 * 1024;
// The longest side Margin keeps. Larger photos are shrunk once, when they arrive.
const KEEP = 2048;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
// Holm's image tools read these (and write JPEG, or PNG for PNG).
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const WIDTHS = [320, 640, 960, 1280, 1600, 2048];
// og: the 1200 × 630 crop link previews use.
const VARIANT = /^(?:w(\d{3,4})|og)$/;

// Addresses carry an extension so Markdown alone tells a video from a photo.
export const mediaPath = (id, mime) => `/media/${id}.${EXT[mime] || 'bin'}`;
const variantExt = (mime) => (mime === 'image/png' ? 'png' : 'jpg');
export const variantPath = (id, mime, variant) => `/media/${id}-${variant}.${variantExt(mime)}`;

// Trust the bytes, not the name: read the first few to learn the type.
export function sniff(bytes) {
  const b = new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  const head = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength))).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

// Pixel size from the file's header, without decoding it.
function dimensions(bytes, mime) {
  const b = new Uint8Array(bytes);
  const u16 = (i) => (b[i] << 8) | b[i + 1];
  const le16 = (i) => b[i] | (b[i + 1] << 8);
  const le24 = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (mime === 'image/png') return { width: (b[16] << 24 >>> 0) + (b[17] << 16) + u16(18), height: (b[20] << 24 >>> 0) + (b[21] << 16) + u16(22) };
  if (mime === 'image/gif') return { width: le16(6), height: le16(8) };
  if (mime === 'image/webp') {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8X') return { width: 1 + le24(24), height: 1 + le24(27) };
    if (chunk === 'VP8L') { const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0; return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8 ') return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
  }
  if (mime === 'image/jpeg') {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return { width: 0, height: 0 };
}

// An MP4 or MOV's picture size, from the first track header with one (moov → trak → tkhd).
// Only the small boxes are read; the media data is skipped by its length.
function videoSize(bytes) {
  const b = new Uint8Array(bytes);
  const view = new DataView(bytes);
  const type = (i) => String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
  function walk(start, end) {
    for (let i = start; i + 8 <= end;) {
      let size = view.getUint32(i);
      if (size === 1 && i + 16 <= end) size = view.getUint32(i + 8) * 4294967296 + view.getUint32(i + 12);
      if (size === 0) size = end - i;
      if (size < 8) return null;
      const t = type(i);
      if (t === 'moov' || t === 'trak') { const found = walk(i + 8, Math.min(end, i + size)); if (found) return found; }
      if (t === 'tkhd' && i + 8 + 92 <= end) {
        const at = i + 8 + (b[i + 8] === 1 ? 88 : 76);
        const width = Math.round(view.getUint32(at) / 65536);
        const height = Math.round(view.getUint32(at + 4) / 65536);
        if (width && height) return { width, height };
      }
      i += size;
    }
    return null;
  }
  try { return walk(0, b.length) || { width: 0, height: 0 }; } catch { return { width: 0, height: 0 }; }
}

// A JPEG's EXIF orientation (1 is upright). Holm's resize ignores it, so Margin leaves turned
// photos as they came rather than make sideways copies.
function orientation(bytes) {
  const b = new Uint8Array(bytes);
  for (let i = 2; i + 4 < b.length && b[i] === 0xff;) {
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1 && String.fromCharCode(...b.slice(i + 4, i + 8)) === 'Exif') {
      const t = i + 10;
      const le = b[t] === 0x49;
      const r16 = (k) => (le ? b[k] | (b[k + 1] << 8) : (b[k] << 8) | b[k + 1]);
      const r32 = (k) => (le ? (b[k] | (b[k + 1] << 8) | (b[k + 2] << 16) | (b[k + 3] << 24)) : ((b[k] << 24) | (b[k + 1] << 16) | (b[k + 2] << 8) | b[k + 3])) >>> 0;
      const ifd = t + r32(t + 4);
      for (let n = 0, count = r16(ifd); n < count; n++) {
        const e = ifd + 2 + n * 12;
        if (r16(e) === 0x0112) return r16(e + 8);
      }
      return 1;
    }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return 1;
}

// Drawings are welcome as SVG, but not ones that run code or load anything: those are refused
// rather than cleaned. Pages show them through <img>, and /media answers with a sandbox.
function checkSVG(bytes) {
  if (bytes.byteLength > SVG_MAX) reject(413, 'too_large', 'That drawing is too large (512 KB at most).');
  let text = new TextDecoder().decode(bytes).replace(/^﻿/, '');
  const bad = [/<script/i, /\son[a-z]+\s*=/i, /<foreignObject/i, /<!(DOCTYPE|ENTITY)/i, /javascript:/i, /<(iframe|embed|object|audio|video|image)\b/i, /(?:xlink:)?href\s*=\s*["']\s*(?!#)/i, /url\(\s*['"]?\s*(?!#)/i, /@import/i];
  if (bad.some((re) => re.test(text))) reject(422, 'invalid_svg', 'That drawing has scripts, embedded images or links to other files. Send plain shapes and text, with any styles inline.');
  if (!/<svg[^>]*\sxmlns=/i.test(text)) text = text.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const tag = (text.match(/<svg[^>]*>/i) || [''])[0];
  const num = (name) => { const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, 'i').exec(tag); return m ? Math.round(Number(m[1])) : 0; };
  let width = num('width');
  let height = num('height');
  const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(tag);
  if ((!width || !height) && box) { width = Math.round(Number(box[1])); height = Math.round(Number(box[2])); }
  return { bytes: new TextEncoder().encode(text).buffer, width, height };
}

// Who may upload: anyone who has picked a name on Margin, and Margin's admins.
export function requireUploader(ctx) {
  if (!ctx.member || !((ctx.person && ctx.person.handle) || ctx.admin)) reject(403, 'forbidden', 'Pick your name on Margin before you upload.');
}

// Keep a file for an account: check it, shrink a large photo, store it, and describe it.
export function storeMedia(env, owner, bytes, meta = {}) {
  if (!bytes || !bytes.byteLength) reject(400, 'invalid_input', 'The file is empty.');
  if (bytes.byteLength > VIDEO_MAX) reject(413, 'too_large', 'That file is too large (20 MB at most for video, 12 MB for photos).');
  const mime = sniff(bytes);
  if (!mime) reject(415, 'unsupported', 'Use a JPEG, PNG, GIF, WebP or AVIF photo, an SVG drawing, or an MP4, WebM or MOV video.');
  if (mime.startsWith('image/') && mime !== 'image/svg+xml' && bytes.byteLength > IMAGE_MAX) reject(413, 'too_large', 'That photo is too large (12 MB at most).');
  let size = { width: int(meta.width, 0, 0, 20000), height: int(meta.height, 0, 0, 20000) };
  let upright = true;
  if (mime === 'image/svg+xml') {
    const svg = checkSVG(bytes);
    bytes = svg.bytes;
    size = { width: svg.width, height: svg.height };
  } else if (mime.startsWith('image/')) {
    const turn = mime === 'image/jpeg' ? orientation(bytes) : 1;
    upright = turn === 1;
    const read = dimensions(bytes, mime);
    // A turned photo's header has the sides the other way round from how it shows (5–8);
    // a browser that measured it knows better.
    if (read.width && (upright || !size.width)) size = turn >= 5 ? { width: read.height, height: read.width } : read;
    if (RESIZABLE.has(mime) && upright && Math.max(size.width, size.height) > KEEP) {
      const side = size.width >= size.height ? { width: KEEP } : { height: KEEP };
      const small = env.holm.image.resize(bytes, { ...side, quality: 82 });
      bytes = small.data;
      size = { width: small.width, height: small.height };
      if (mime === 'image/webp') meta.converted = 'image/jpeg';
    }
  } else if (mime !== 'video/webm' && !size.width) {
    size = videoSize(bytes);
  }
  const stored = meta.converted || mime;
  const id = randomId(14);
  const record = {
    mediaId: id, mime: stored, size: bytes.byteLength, name: String(meta.name || '').slice(0, 120),
    width: size.width, height: size.height, alt: String(meta.alt || '').slice(0, 300), upright,
    owner: owner.id, via: meta.via || 'web', createdAt: Date.now(),
  };
  env.holm.app.s3.put(`media/${id}`, bytes, stored);
  const docId = env.holm.app.ds.insert('media', record);
  return { ...describe(record), docId };
}

// What Studio and Claude learn about a file: its address, size and the smaller copies.
function describe(m) {
  const url = mediaPath(m.mediaId, m.mime);
  const out = { id: m.mediaId, url, mime: m.mime, width: m.width, height: m.height, size: m.size, name: m.name || '', alt: m.alt || '' };
  out.markdown = m.mime.startsWith('video/') ? `![${m.alt || ''}](${url})` : `![${(m.alt || '').replace(/[[\]]/g, '')}](${url})`;
  if (canVary(m)) {
    out.sizes = {};
    for (const w of WIDTHS) if (w < m.width) out.sizes[`w${w}`] = variantPath(m.mediaId, m.mime, `w${w}`);
    out.sizes.og = variantPath(m.mediaId, m.mime, 'og');
  }
  return out;
}

const canVary = (m) => RESIZABLE.has(m.mime) && m.upright !== false && m.width > 0;

// Studio's uploads: a form with the file and the size the browser measured.
export async function upload(env, ctx, request) {
  requireUploader(ctx);
  const { bytes, fields } = await readUpload(request);
  return storeMedia(env, { id: ctx.member.id }, bytes, { ...fields, via: 'studio' });
}

async function readUpload(request) {
  const type = request.headers.get('content-type') || '';
  if (!/multipart\/form-data/i.test(type)) {
    try { return { bytes: await request.arrayBuffer(), fields: {} }; } catch (error) { tooLarge(error); }
  }
  let form;
  try { form = await request.formData(); } catch (error) { tooLarge(error); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) reject(400, 'invalid_input', 'Choose a file.');
  if (file.size > VIDEO_MAX) reject(413, 'too_large', 'That file is too large (20 MB at most for video, 12 MB for photos).');
  return { bytes: await file.arrayBuffer(), fields: { name: file.name, width: form.get('width'), height: form.get('height'), alt: form.get('alt') } };
}

function tooLarge(error) {
  if (/budget|too large|413/i.test(String(error && error.message))) reject(413, 'too_large', 'That file is too large for this server.');
  reject(400, 'invalid_input', 'Send the file as a form upload (-F file=@photo.jpg) or as the request body.');
}

// ---------- upload links ----------
// Claude asks for one with media.link. Anyone holding it adds up to ten files to the
// person's library for an hour: in a browser (the page shrinks photos first) or with curl.

const LINK_TTL = 3600 * 1000;
const LINK_FILES = 10;

export async function createUploadLink(env, ctx, origin) {
  requireUploader(ctx);
  const token = randomId(24);
  const expires = Date.now() + LINK_TTL;
  env.holm.app.kv.set('upload:' + await sha256(token), { member: ctx.member.id, expires }, LINK_TTL);
  const url = `${origin}/upload/${token}`;
  return {
    url, expires_at: new Date(expires).toISOString(), files: LINK_FILES,
    curl: `curl -sS -F file=@photo.jpg -F alt="What it shows" ${url}`,
    guide: 'Give the person this link to add photos or a video from their phone or computer, or send files to it yourself with curl (one file per request). Each answer, and media_list afterwards, has the Markdown to put in a post.',
  };
}

async function linkFor(env, token) {
  if (!/^[a-z0-9]{24}$/.test(token || '')) return null;
  const key = 'upload:' + await sha256(token);
  const link = env.holm.app.kv.get(key);
  if (!link || link.expires < Date.now()) return null;
  return { ...link, key, used: env.holm.app.kv.get(key + ':n') || 0 };
}

export async function uploadLinkStatus(env, token) {
  const link = await linkFor(env, token);
  if (!link) return { valid: false, reason: 'This upload link has expired. Ask Claude for a new one.' };
  return { valid: true, expires_at: new Date(link.expires).toISOString(), files_left: Math.max(0, LINK_FILES - link.used) };
}

export async function uploadWithLink(env, token, request) {
  const link = await linkFor(env, token);
  if (!link) reject(410, 'expired', 'This upload link has expired. Ask Claude for a new one.');
  if (link.used >= LINK_FILES) reject(429, 'link_used', `This link has taken its ${LINK_FILES} files. Ask Claude for a new one.`);
  const { bytes, fields } = await readUpload(request);
  const url = new URL(request.url);
  if (!fields.alt && url.searchParams.get('alt')) fields.alt = url.searchParams.get('alt');
  if (!fields.name && url.searchParams.get('name')) fields.name = url.searchParams.get('name');
  // Counted once stored, so a refused file doesn't use up the link.
  const out = storeMedia(env, { id: link.member }, bytes, { ...fields, via: 'link' });
  delete out.docId;
  const used = env.holm.app.kv.increment(link.key + ':n');
  return { ...out, files_left: Math.max(0, LINK_FILES - (Number(used) || link.used + 1)) };
}

// ---------- reading ----------

export function mediaInfo(env, id) {
  if (!/^[a-z0-9]{6,20}$/.test(id || '')) return null;
  const row = env.holm.app.ds.find('media', { mediaId: id }, { limit: 1 })[0];
  return row ? { width: row.width, height: row.height, mime: row.mime, alt: row.alt, upright: row.upright !== false } : null;
}

// srcset for a stored photo: the smaller copies below its width, and the photo itself.
export function srcsetFor(id, info) {
  if (!info || !canVary({ ...info, mediaId: id })) return '';
  const list = WIDTHS.filter((w) => w < info.width && w >= 640).map((w) => `${variantPath(id, info.mime, `w${w}`)} ${w}w`);
  if (!list.length) return '';
  list.push(`${mediaPath(id, info.mime)} ${info.width}w`);
  return list.join(', ');
}

const HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

// /media/<id>.<ext>, or a smaller copy: /media/<id>-w640.jpg, /media/<id>-og.jpg.
export function serve(env, request, id, variant) {
  if (!/^[a-z0-9]{6,20}$/.test(id)) return new Response('Not found', { status: 404 });
  if (variant) {
    const m = VARIANT.exec(variant);
    const width = m && m[1] ? Number(m[1]) : 0;
    if (!m || (width && !WIDTHS.includes(width))) return new Response('Not found', { status: 404 });
    const copy = variantOf(env, id, variant, width);
    if (copy) return new Response(copy.data, { headers: { ...HEADERS, 'Content-Type': copy.mime, 'Content-Length': String(copy.data.byteLength) } });
  }
  const object = env.holm.app.s3.get(`media/${id}`);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = { ...HEADERS, 'Content-Type': object.mime || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const total = object.data.byteLength;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    if (!range[1]) end = total - 1;
    start = Math.max(0, start);
    end = Math.min(total - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    return new Response(new Uint8Array(object.data, start, end - start + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(object.data, { headers: { ...headers, 'Content-Length': String(total) } });
}

// A smaller copy, made on first request and kept. Null means "serve the original" (a GIF, a
// drawing, a video, a turned photo, or a size it already is).
function variantOf(env, id, variant, width) {
  const key = `media/${id}/${variant}`;
  const kept = env.holm.app.s3.get(key);
  if (kept) return { data: kept.data, mime: kept.mime };
  const row = env.holm.app.ds.find('media', { mediaId: id }, { limit: 1 })[0];
  if (!row || !canVary(row)) return null;
  if (width && width >= row.width) return null;
  const original = env.holm.app.s3.get(`media/${id}`);
  if (!original) return null;
  const options = width ? { width, quality: 82 } : { width: 1200, height: 630, fit: 'cover', quality: 82 };
  let made;
  try { made = env.holm.image.resize(original.data, options); } catch (error) {
    console.warn('media resize failed', id, variant, String(error && error.message || error).slice(0, 200));
    return null;
  }
  const mime = row.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  env.holm.app.s3.put(key, made.data, mime);
  return { data: made.data, mime };
}

export function mediaById(env, id) { return byId(env, 'media', id); }

export function listMine(env, ctx, limit = 60) {
  return env.holm.app.ds.find('media', { owner: ctx.member.id }, { limit, order: 'desc' }).map(describe);
}

export const mediaResponse = (value) => json(value, 201);
