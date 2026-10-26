// Photos and short videos for posts, covers and avatars. Bytes live in app storage under
// media/<id>; the record keeps type, size and pixel size so pages reserve the space.
import { byId } from './lib/store.js';
import { reject, json, randomId, int } from './lib/util.js';

const IMAGE_MAX = 12 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
// Addresses carry an extension so Markdown alone tells a video from a photo.
export const mediaPath = (id, mime) => `/media/${id}.${EXT[mime] || 'bin'}`;
const VIDEO_MAX = 20 * 1024 * 1024;

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
  return null;
}

export async function upload(env, ctx, request) {
  if (!ctx.writer) reject(403, 'forbidden', 'Only writers can upload.');
  let form;
  try { form = await request.formData(); } catch (error) {
    if (/budget|too large|413/i.test(String(error && error.message))) reject(413, 'too_large', 'That file is too large for this server.');
    reject(400, 'invalid_input', 'Send the file as a form upload.');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) reject(400, 'invalid_input', 'Choose a file.');
  if (file.size > VIDEO_MAX) reject(413, 'too_large', 'That file is too large (20 MB at most for video, 12 MB for photos).');
  const bytes = await file.arrayBuffer();
  const mime = sniff(bytes);
  if (!mime) reject(415, 'unsupported', 'Use a JPEG, PNG, GIF, WebP or AVIF photo, or an MP4, WebM or MOV video.');
  if (mime.startsWith('image/') && bytes.byteLength > IMAGE_MAX) reject(413, 'too_large', 'That photo is too large (12 MB at most).');
  const id = randomId(14);
  const record = {
    mediaId: id, mime, size: bytes.byteLength, name: String(file.name || '').slice(0, 120),
    width: int(form.get('width'), 0, 0, 20000), height: int(form.get('height'), 0, 0, 20000),
    alt: String(form.get('alt') || '').slice(0, 300), owner: ctx.member.id, createdAt: Date.now(),
  };
  env.holm.app.s3.put(`media/${id}`, bytes, mime);
  const docId = env.holm.app.ds.insert('media', record);
  return { id, url: mediaPath(id, mime), mime, width: record.width, height: record.height, size: record.size, docId };
}

export function mediaInfo(env, id) {
  if (!/^[a-z0-9]{6,20}$/.test(id || '')) return null;
  const row = env.holm.app.ds.find('media', { mediaId: id }, { limit: 1 })[0];
  return row ? { width: row.width, height: row.height, mime: row.mime, alt: row.alt } : null;
}

export function serve(env, request, id) {
  if (!/^[a-z0-9]{6,20}$/.test(id)) return new Response('Not found', { status: 404 });
  const object = env.holm.app.s3.get(`media/${id}`);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = {
    'Content-Type': object.mime || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
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

export function mediaById(env, id) { return byId(env, 'media', id); }

export function listMine(env, ctx, limit = 60) {
  return env.holm.app.ds.find('media', ctx.admin ? {} : { owner: ctx.member.id }, { limit, order: 'desc' })
    .map((m) => ({ id: m.mediaId, url: mediaPath(m.mediaId, m.mime), mime: m.mime, width: m.width, height: m.height, size: m.size, name: m.name }));
}

export const mediaResponse = (value) => json(value, 201);
