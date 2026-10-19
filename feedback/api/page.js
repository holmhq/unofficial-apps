import { holm } from "./_holm.js";
// A public page's look: its logo and cover picture. They're resized as
// they're uploaded, kept beside the project's files (so deleting the project
// deletes them), and served to anyone, since the page they dress is public.
import { now, reject } from './lib.js'

const MAX_BYTES = 10 * 1024 * 1024
const PICTURE = /^image\/(png|jpeg|webp|gif)$/
// A logo keeps its shape inside 512 pixels, as PNG for transparency; a cover
// is a wide JPEG.
const SIZES = {
  logo: { width: 512, height: 512, fit: 'contain', format: 'png', mime: 'image/png' },
  cover: { width: 1800, height: 640, fit: 'cover', format: 'jpeg', quality: 82, mime: 'image/jpeg' }
}

export const isPicture = which => which in SIZES
const pathOf = (projectId, which) => `files/${projectId}/page/${which}`

// The picture's public address; the version changes it whenever it does.
export const pictureURL = (doc, which) => doc[which] ? `/api/pictures/${doc.id}/${which}?v=${doc[which].v}` : null

// Stores the request's one upload and returns what the project keeps.
export function storePicture(projectId, which, request) {
  const file = Object.values(request.files || {})[0]
  if (!file) reject(400, 'no_file', 'Choose a picture.')
  if (!PICTURE.test(String(file.type || '').toLowerCase())) reject(415, 'file_type', 'Use a PNG, JPEG, WebP or GIF picture.')
  if ((file.size || 0) > MAX_BYTES) reject(413, 'too_large', 'Pictures can be up to 10 MB.')
  const { mime, ...options } = SIZES[which]
  let resized
  try { resized = holm.image.resize(file.data, options) } catch { reject(415, 'unreadable', 'That picture couldn’t be read. Try a PNG or a JPEG.') }
  holm.app.s3.put(pathOf(projectId, which), resized.data, mime)
  return { v: now().toString(36), mime, width: resized.width, height: resized.height }
}

export function removePicture(projectId, which) {
  holm.app.s3.delete(pathOf(projectId, which))
}

export function servePicture(doc, which) {
  const blob = doc && doc[which] ? holm.app.s3.get(pathOf(doc.id, which)) : null
  if (!blob) reject(404, 'not_found', 'No picture here.')
  return {
    status: 200, body: blob.data,
    headers: { 'Content-Type': doc[which].mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }
  }
}
