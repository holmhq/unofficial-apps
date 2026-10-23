import { holm } from "./_holm.js";
// Attachments: pictures, videos, PDFs and text files a visitor adds to an
// item. They live in the app's blob storage, and only the project's owner can
// open them; the public board never shows them.
import { now, reject } from './lib.js'

export const MAX_FILES = 4
export const MAX_TOTAL = 8 * 1024 * 1024
const DAILY_BYTES = 200 * 1024 * 1024

const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pdf: 'application/pdf', txt: 'text/plain', log: 'text/plain', csv: 'text/csv', json: 'application/json'
}
const ALLOWED = new Set(Object.values(TYPES))
// Files are served sandboxed, so nothing in one can run on the app's origin.
const HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'private, max-age=3600',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
}

export const filename = value =>
  String(value || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '_').trim().slice(0, 120) || 'file'
const cleanName = value => filename(value).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'file'

// Some clients send application/octet-stream; fall back to the extension.
function mimeFor(type, name) {
  const mime = String(type || '').split(';')[0].trim().toLowerCase()
  if (ALLOWED.has(mime)) return mime
  return TYPES[String(name).toLowerCase().split('.').pop()] || mime
}

const kindOf = mime => /^(image|video)\//.test(mime) ? mime.split('/')[0] : mime === 'application/pdf' ? 'pdf' : 'text'

// The request's files in the order the form added them (file0, file1, ...),
// checked against the project's rules before anything is stored.
export function fileFactory(env) {
  const holm = env.holm
  const kv = () => holm.app.kv
  return { uploads, store, remove }

function uploads(request, project) {
  const files = request.files || {}
  const order = field => Number((/(\d+)$/.exec(field) || [0, 0])[1])
  const list = Object.keys(files).sort((a, b) => order(a) - order(b)).map(key => files[key]).filter(Boolean)
  if (!list.length) return []
  if (project.attachments === false || project.account) reject(400, 'no_files', 'This project doesn’t take files.')
  if (list.length > MAX_FILES) reject(400, 'too_many_files', `Attach up to ${MAX_FILES} files.`)
  let total = 0
  const checked = list.map(file => {
    const name = filename(file.name), mime = mimeFor(file.type, name)
    if (!ALLOWED.has(mime)) reject(415, 'file_type', `“${name.slice(0, 60)}” isn’t a picture, video, PDF or text file.`)
    total += file.size || 0
    return { file, name, mime }
  })
  if (total > MAX_TOTAL) reject(413, 'too_large', 'Files can add up to 8 MB.')
  const day = new Date(now()).toISOString().slice(0, 10)
  if (kv().increment(`bytes:${project.id}:${day}`, total) > DAILY_BYTES) {
    reject(429, 'busy', 'This project has taken all the files it can today. Send it without files, or try tomorrow.')
  }
  return checked
}

// Stores checked uploads under the item, with a small JPEG for each picture
// Holm can read. Returns what the item keeps about them.
function store(checked, projectId, itemId) {
  const out = []
  try {
    checked.forEach(({ file, name, mime }, index) => {
      const path = `files/${projectId}/${itemId}/${index}-${cleanName(name)}`
      holm.app.s3.put(path, file.data, mime)
      const meta = { name, mime, size: file.size || 0, kind: kindOf(mime), path, previewPath: null }
      out.push(meta)
      if (meta.kind === 'image') {
        try {
          const preview = holm.image.thumbnail(file.data, 480)
          if (preview) {
            meta.previewPath = `files/${projectId}/${itemId}/${index}-preview.jpg`
            holm.app.s3.put(meta.previewPath, preview.data || preview, 'image/jpeg')
          }
        } catch { /* An encoding Holm can't read keeps only the original. */ }
      }
    })
  } catch (error) {
    remove(out)
    throw error
  }
  return out
}

function remove(files) {
  for (const meta of files || []) {
    holm.app.s3.delete(meta.path)
    if (meta.previewPath) holm.app.s3.delete(meta.previewPath)
  }
}
}

export const uploads = (...args) => fileFactory({ holm }).uploads(...args)
export const store = (...args) => fileFactory({ holm }).store(...args)
export const remove = (...args) => fileFactory({ holm }).remove(...args)

export function removeProject(projectId) {
  for (const entry of holm.app.s3.list(`files/${projectId}/`) || []) holm.app.s3.delete(entry.path || entry.key)
}

// What the owner's views see: no storage paths.
export const fileDTO = (meta, index) => ({ index, name: meta.name, mime: meta.mime, size: meta.size, kind: meta.kind, preview: !!meta.previewPath })

export function serve(meta, preview, download) {
  const blob = holm.app.s3.get(preview && meta.previewPath ? meta.previewPath : meta.path)
  if (!blob) reject(404, 'not_found', 'That file is missing.')
  const type = preview && meta.previewPath ? 'image/jpeg' : meta.kind === 'text' ? `${meta.mime}; charset=utf-8` : meta.mime
  const encoded = encodeURIComponent(meta.name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())
  return {
    status: 200, body: blob.data,
    headers: { ...HEADERS, 'Content-Type': type, 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${cleanName(meta.name)}"; filename*=UTF-8''${encoded}` }
  }
}
