// A workspace's library: photos, screenshots and drawings (SVG) for shot slides and logos.
// Bytes live in app storage under media/<id>; the record keeps type, size and pixel size.
// Pictures come in from the studio (shrunk in the browser), from an upload link (a page or
// curl) or from Claude (assets.put). Smaller copies are made the first time a page asks for
// one, at /media/<id>-w640.jpg and the like, and kept beside the original. A /media address
// is hard to guess but not private: shared decks show their pictures to anyone with the link.
import { reject, randomId, int, sha256 } from './lib/util.js';

const IMAGE_MAX = 12 * 1024 * 1024;
const SVG_MAX = 512 * 1024;
const MAX_FILES = 500;
// The longest side Deck keeps. Larger photos are shrunk once, when they arrive.
const KEEP = 2560;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
// Holm's image tools read these (and write JPEG, or PNG for PNG).
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const WIDTHS = [320, 640, 960, 1280, 1600, 2048];
const VARIANT = /^(?:w(\d{3,4})|og)$/;

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
  if (ascii(4, 8) === 'ftyp' && (ascii(8, 12) === 'avif' || ascii(8, 12) === 'avis')) return 'image/avif';
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

// A JPEG's EXIF orientation (1 is upright). Holm's resize ignores it, so Deck leaves turned
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
// rather than cleaned. Slides show them through <img>, and /media answers with a sandbox.
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

export function inLibrary(env, wid, id) {
  if (!/^[a-z0-9]{6,20}$/.test(id || '')) return false;
  return env.holm.app.ds.find('media', { mediaId: id, wid }, { limit: 1 }).length > 0;
}

// Keep a file in a workspace's library: check it, shrink a large photo, store it, describe it.
export function storeMedia(env, wid, account, bytes, meta = {}) {
  if (!bytes || !bytes.byteLength) reject(400, 'invalid_input', 'The file is empty.');
  if (bytes.byteLength > IMAGE_MAX) reject(413, 'too_large', 'That picture is too large (12 MB at most).');
  const mime = sniff(bytes);
  if (!mime) reject(415, 'unsupported', 'Use a JPEG, PNG, GIF, WebP or AVIF picture, or an SVG drawing.');
  if (env.holm.app.ds.count('media', { wid }) >= MAX_FILES) reject(409, 'too_many', `A library holds ${MAX_FILES} pictures. Delete some first.`);
  let size = { width: int(meta.width, 0, 0, 20000), height: int(meta.height, 0, 0, 20000) };
  let upright = true;
  let stored = mime;
  if (mime === 'image/svg+xml') {
    const svg = checkSVG(bytes);
    bytes = svg.bytes;
    size = { width: svg.width, height: svg.height };
  } else {
    const turn = mime === 'image/jpeg' ? orientation(bytes) : 1;
    upright = turn === 1;
    const read = dimensions(bytes, mime);
    // A turned photo's header has the sides the other way round from how it shows (5–8);
    // a browser that measured it knows better.
    if (read.width && (upright || !size.width)) size = turn >= 5 ? { width: read.height, height: read.width } : read;
    if (RESIZABLE.has(mime) && upright && Math.max(size.width, size.height) > KEEP) {
      const side = size.width >= size.height ? { width: KEEP } : { height: KEEP };
      const small = env.holm.image.resize(bytes, { ...side, quality: 84 });
      bytes = small.data;
      size = { width: small.width, height: small.height };
      if (mime === 'image/webp') stored = 'image/jpeg';
    }
  }
  const id = randomId(14);
  const record = {
    mediaId: id, wid, mime: stored, size: bytes.byteLength, name: String(meta.name || '').slice(0, 120),
    width: size.width, height: size.height, alt: String(meta.alt || '').slice(0, 300), upright,
    owner: account, via: meta.via || 'web', createdAt: Date.now(),
  };
  env.holm.app.s3.put(`media/${id}`, bytes, stored);
  env.holm.app.ds.insert('media', record);
  return describe(record);
}

// What the studio and Claude learn about a file: its address, size and smaller copies.
function describe(m) {
  const out = { id: m.mediaId, url: mediaPath(m.mediaId, m.mime), mime: m.mime, width: m.width, height: m.height, size: m.size, name: m.name || '', alt: m.alt || '', added_at: new Date(m.createdAt).toISOString() };
  if (canVary(m)) {
    out.sizes = {};
    for (const w of WIDTHS) if (w < m.width) out.sizes[`w${w}`] = variantPath(m.mediaId, m.mime, `w${w}`);
  }
  return out;
}

const canVary = (m) => RESIZABLE.has(m.mime) && m.upright !== false && m.width > 0;

export function listMedia(env, wid, limit = 200) {
  return env.holm.app.ds.find('media', { wid }, { limit, order: 'desc' }).map(describe);
}

export function deleteMedia(env, wid, id) {
  const row = env.holm.app.ds.find('media', { mediaId: id, wid }, { limit: 1 })[0];
  if (!row) reject(404, 'not_found', 'No such picture in this library.');
  env.holm.app.s3.delete(`media/${id}`);
  for (const v of [...WIDTHS.map((w) => `w${w}`), 'og']) env.holm.app.s3.delete(`media/${id}/${v}`);
  env.holm.app.ds.delete('media', { id: row.id });
  return { deleted: true };
}

// The studio's uploads: a form with the file and the size the browser measured.
export async function readUpload(request) {
  const type = request.headers.get('content-type') || '';
  if (!/multipart\/form-data/i.test(type)) {
    try { return { bytes: await request.arrayBuffer(), fields: {} }; } catch (error) { tooLarge(error); }
  }
  let form;
  try { form = await request.formData(); } catch (error) { tooLarge(error); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) reject(400, 'invalid_input', 'Choose a file.');
  if (file.size > IMAGE_MAX) reject(413, 'too_large', 'That picture is too large (12 MB at most).');
  return { bytes: await file.arrayBuffer(), fields: { name: file.name, width: form.get('width'), height: form.get('height'), alt: form.get('alt') } };
}

function tooLarge(error) {
  if (/budget|too large|413/i.test(String(error && error.message))) reject(413, 'too_large', 'That file is too large for this server.');
  reject(400, 'invalid_input', 'Send the file as a form upload (-F file=@photo.jpg) or as the request body.');
}

// ---------- upload links ----------
// Claude asks for one with assets.link. Anyone holding it adds up to ten pictures to the
// workspace's library for an hour: in a browser (the page shrinks photos first) or with curl.

const LINK_TTL = 3600 * 1000;
const LINK_FILES = 10;

export async function createUploadLink(env, wid, account, origin) {
  const token = randomId(24);
  const expires = Date.now() + LINK_TTL;
  env.holm.app.kv.set('upload:' + await sha256(token), { wid, account, expires }, LINK_TTL);
  const url = `${origin}/upload/${token}`;
  return {
    url, expires_at: new Date(expires).toISOString(), files: LINK_FILES,
    curl: `curl -sS -F file=@screenshot.png -F alt="What it shows" ${url}`,
    guide: 'Give the person this link to add pictures from their phone or computer, or send files to it yourself with curl (one per request). Each answer, and assets_list afterwards, has the /media address to use as a shot slide\'s "image".',
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
  const out = storeMedia(env, link.wid, link.account, bytes, { ...fields, via: 'link' });
  const used = env.holm.app.kv.increment(link.key + ':n');
  return { ...out, files_left: Math.max(0, LINK_FILES - (Number(used) || link.used + 1)) };
}

// ---------- serving ----------

const HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'Access-Control-Allow-Origin': '*',
};

// /media/<id>.<ext>, or a smaller copy: /media/<id>-w640.jpg, /media/<id>-og.jpg.
export function serve(env, id, variant) {
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
  return new Response(object.data, { headers: { ...HEADERS, 'Content-Type': object.mime || 'application/octet-stream', 'Content-Length': String(object.data.byteLength) } });
}

// A smaller copy, made on first request and kept. Null means "serve the original" (a GIF, a
// drawing, a turned photo, or a size it already is).
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

