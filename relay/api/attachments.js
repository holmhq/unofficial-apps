import { holm } from "./_holm.js";
// Relay API — attachments: image-aware upload + variant serving.

import {
  genId, now, cleanFilename, firstUploadedFile, isImageMime, kindForFile, contentDisposition,
  getJSON, setJSON, attachmentKey,
  ok, notFound, forbidden, requireProfile
} from './lib.js'
import { getRoom, participant } from './rooms.js'

export function attachmentDTO(meta) {
  if (!meta) return null
  var base = '/api/attachments/' + encodeURIComponent(meta.id)
  var hasImage = meta.kind === 'image'
  return {
    id: meta.id,
    kind: meta.kind,
    name: meta.name,
    mime: meta.mime,
    size: meta.size,
    width: meta.width || null,
    height: meta.height || null,
    url: base + '?variant=original',
    previewUrl: meta.previewPath ? base + '?variant=preview' : base + '?variant=original',
    optimizedUrl: meta.optimizedPath ? base + '?variant=optimized' : base + '?variant=original',
    isImage: hasImage,
    isAudio: meta.kind === 'audio',
    isVideo: meta.kind === 'video'
  }
}

// Store an uploaded file; for images, derive optimized + preview variants.
export function createAttachment(room, member, file) {
  var id = genId('att')
  var filename = cleanFilename(file.name)
  var mime = file.type || 'application/octet-stream'
  var ext = filename.indexOf('.') >= 0 ? filename.split('.').pop().toLowerCase() : 'bin'
  var basePath = 'rooms/' + room.id + '/attachments/' + id + '/'
  var originalPath = basePath + 'original-' + filename
  try {
    holm.app.s3.put(originalPath, file.data, mime)
  } catch (e) {
    // Surface a typed error so handleSendMessage can reject cleanly instead of
    // leaving an orphan message pointing at a blob that never stored.
    throw new Error('Could not store attachment')
  }

  var meta = {
    id: id,
    roomId: room.id,
    ownerId: member.id,
    kind: kindForFile(mime, ext),
    name: filename,
    mime: mime,
    size: file.size || null,
    originalPath: originalPath,
    ext: ext,
    createdAt: now()
  }

  if (meta.kind === 'image') {
    try {
      var bytes = file.data
      var optimized = holm.image.resize(bytes, { width: 1280, format: 'jpeg', quality: 82 })
      var preview = holm.image.thumbnail(bytes, 360)
      var optimizedPath = basePath + 'optimized.jpg'
      var previewPath = basePath + 'preview.jpg'
      holm.app.s3.put(optimizedPath, optimized.data, 'image/jpeg')
      holm.app.s3.put(previewPath, preview.data, 'image/jpeg')
      meta.optimizedPath = optimizedPath
      meta.previewPath = previewPath
      meta.width = optimized.width || null
      meta.height = optimized.height || null
      meta.optimizedSize = optimized.size || null
      meta.previewSize = preview.size || null
      meta.optimizedMime = 'image/jpeg'
      meta.previewMime = 'image/jpeg'
    } catch (e) {
      meta.processingError = e && e.message ? e.message : String(e)
    }
  }

  setJSON(attachmentKey(id), meta)
  return meta
}

export function handleAttachment(request) {
  var ctx = requireProfile()
  if (ctx.error) return ctx.error
  var parts = request.path.split('/')
  var id = decodeURIComponent(parts[3] || '')
  var meta = getJSON(attachmentKey(id))
  if (!meta) return notFound('Attachment not found')
  var room = getRoom(meta.roomId)
  if (!room || !participant(room, ctx.member.id)) return forbidden('You cannot access this attachment')

  var variant = request.query && request.query.variant ? String(request.query.variant) : 'original'
  var path = meta.originalPath
  var mime = meta.mime || 'application/octet-stream'
  var inline = false
  if (variant === 'preview' && meta.previewPath) {
    path = meta.previewPath; mime = meta.previewMime || 'image/jpeg'; inline = true
  } else if (variant === 'optimized' && meta.optimizedPath) {
    path = meta.optimizedPath; mime = meta.optimizedMime || 'image/jpeg'; inline = true
  } else if (meta.kind === 'image' || meta.kind === 'audio' || meta.kind === 'video') {
    inline = true
  }

  var blob = holm.app.s3.get(path)
  if (!blob) return notFound('Stored file missing')
  return {
    status: 200,
    body: blob.data,
    headers: {
      'Content-Type': blob.mime || mime,
      'Cache-Control': 'private, max-age=60',
      'Content-Disposition': contentDisposition(meta.name, inline)
    }
  }
}
