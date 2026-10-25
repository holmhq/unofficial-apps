// 3dsvg: turn SVGs, text and pixel art into 3D in the browser.
//
// The editor runs entirely in the page. This handler adds accounts: a
// member's saved shapes live in their own storage (settings in member DS,
// the SVG, thumbnail and any texture image in member S3), and a shape can
// get a share link. A share is a copy in shared storage under a random
// token; the owner's later saves refresh it, and turning it off deletes it.

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (status, error) => json({ error }, status)

const MAX_SHAPES = 500
const MAX_SVG = 2_000_000
const MAX_DESIGN = 64_000
const MAX_THUMB = 400_000
const MAX_TEXTURE = 6_000_000

// Plain text: no control characters, collapsed spaces, bounded length.
const clean = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Images are served only as the type their first bytes prove.
function imageType(buffer) {
  const b = new Uint8Array(buffer.slice(0, 12))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

function serveImage(object, cache) {
  if (!object) return new Response('Not found.', { status: 404 })
  return new Response(object.data, {
    headers: {
      'Content-Type': object.mime,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'"
    }
  })
}

// The design arrives as JSON text. The SVG, any texture image and the
// source code travel as files, so the stored design keeps only settings.
function readDesign(text) {
  if (typeof text !== 'string' || text.length > MAX_DESIGN * 4) return null
  let design
  try { design = JSON.parse(text) } catch { return null }
  if (!design || typeof design !== 'object' || Array.isArray(design)) return null
  design = { ...design, code: '', file: design.file ? { name: clean(design.file.name, 120) || 'shape.svg' } : null }
  if (design.texture && typeof design.texture === 'object') design.texture = { ...design.texture, image: null }
  return JSON.stringify(design).length <= MAX_DESIGN ? design : null
}

async function fileBytes(form, name, max) {
  const file = form.get(name)
  if (!file || typeof file === 'string' || file.size === 0) return { none: true }
  if (file.size > max) return { error: 'too large' }
  return { data: await file.arrayBuffer() }
}

// Reads a save from the editor: name, design, SVG, thumbnail and texture.
async function readSave(request) {
  let form
  try { form = await request.formData() } catch { return { error: 'Send the shape as a form.' } }
  const name = clean(form.get('name'), 80) || 'Untitled'
  const design = readDesign(form.get('design'))
  if (!design) return { error: 'The design could not be read.' }
  const svgField = form.get('svg')
  const svg = typeof svgField === 'string' ? svgField : svgField ? await svgField.text() : ''
  if (!svg || !/<svg[\s>]/i.test(svg)) return { error: 'There is no shape to save.' }
  if (svg.length > MAX_SVG) return { error: 'That SVG is too large to save (2 MB at most).' }
  const thumb = await fileBytes(form, 'thumb', MAX_THUMB)
  const texture = await fileBytes(form, 'texture', MAX_TEXTURE)
  if (thumb.error) return { error: 'The preview image is too large.' }
  if (texture.error) return { error: 'The texture image is too large (6 MB at most).' }
  const thumbType = thumb.data && imageType(thumb.data)
  const textureType = texture.data && imageType(texture.data)
  if (thumb.data && !thumbType) return { error: 'The preview must be a JPEG or PNG image.' }
  if (texture.data && !textureType) return { error: 'The texture must be a JPEG, PNG, GIF or WebP image.' }
  return {
    name, design, svg,
    thumb: thumb.data ? { data: thumb.data, mime: thumbType } : null,
    texture: texture.data ? { data: texture.data, mime: textureType } : null
  }
}

const shapeDTO = doc => ({
  id: doc.id,
  name: doc.name,
  tab: doc.design?.tab || 'draw',
  shareToken: doc.shareToken || null,
  hasThumb: !!doc.hasThumb,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
})

// Puts the stored files back into the design for the editor.
function fullDesign(design, svg, textureURL) {
  const d = { ...design }
  if (d.tab === 'code') d.code = svg
  if (d.tab === 'file') d.file = { name: d.file?.name || 'shape.svg', svg }
  if (d.texture && textureURL) d.texture = { ...d.texture, image: textureURL }
  return d
}

const text = object => (object ? new TextDecoder().decode(object.data) : '')

// Copies a member's shape into shared storage under its share token.
function publishShare(env, member, doc, token) {
  const mine = env.holm.app.member.s3
  const { ds, s3 } = env.holm.app
  const svg = mine.get(`shapes/${doc.id}/svg`)
  const thumb = mine.get(`shapes/${doc.id}/thumb`)
  const texture = mine.get(`shapes/${doc.id}/texture`)
  if (svg) s3.put(`shares/${token}/svg`, svg.data, 'text/plain')
  if (thumb) s3.put(`shares/${token}/thumb`, thumb.data, thumb.mime)
  else s3.delete(`shares/${token}/thumb`)
  if (texture) s3.put(`shares/${token}/texture`, texture.data, texture.mime)
  else s3.delete(`shares/${token}/texture`)
  const fields = { token, member: member.id, shape: doc.id, name: doc.name, design: doc.design, hasTexture: !!texture, hasThumb: !!thumb, updatedAt: new Date().toISOString() }
  const existing = ds.findOne('shares', { token })
  if (existing) ds.update('shares', { id: existing.id }, { $set: fields })
  else ds.insert('shares', fields)
}

function unpublishShare(env, token) {
  if (!token) return
  const { ds, s3 } = env.holm.app
  ds.delete('shares', { token })
  for (const part of ['svg', 'thumb', 'texture']) s3.delete(`shares/${token}/${part}`)
}

// The editor page with the share's own title and preview image, so a
// pasted link shows the shape.
async function sharePage(request, env, share) {
  const url = new URL(request.url)
  const page = await env.holm.web.fetch(new Request(new URL('/', url), { headers: request.headers }))
  let html = await page.text()
  const title = share ? `${share.name} · 3dsvg` : 'Link turned off · 3dsvg'
  const description = share ? 'A 3D shape made with 3dsvg. Drag to turn it; make your own from an SVG, text or pixel art.' : 'This share link was turned off by its owner.'
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(?:name|property)=["'](?:description|og:[^"']*|twitter:[^"']*)["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
  const tags = [
    `<title>${escapeHTML(title)}</title>`,
    `<meta name="description" content="${escapeHTML(description)}">`,
    '<meta name="robots" content="noindex">',
    `<link rel="canonical" href="${escapeHTML(url.origin + url.pathname)}">`,
    `<meta property="og:title" content="${escapeHTML(title)}">`,
    `<meta property="og:description" content="${escapeHTML(description)}">`,
    `<meta property="og:url" content="${escapeHTML(url.origin + url.pathname)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="3dsvg">'
  ]
  if (share?.hasThumb) {
    const image = `${url.origin}/api/shares/${share.token}/thumb?v=${encodeURIComponent(share.updatedAt)}`
    tags.push(`<meta property="og:image" content="${escapeHTML(image)}">`, '<meta name="twitter:card" content="summary">', `<meta name="twitter:image" content="${escapeHTML(image)}">`)
  }
  html = html.replace(/<\/head>/i, `${tags.join('\n  ')}\n</head>`)
  const headers = new Headers(page.headers)
  headers.delete('Content-Length')
  headers.delete('ETag')
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-cache')
  return new Response(html, { status: share ? 200 : 404, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    const { auth } = env.holm

    const sharePath = /^\/s\/([A-Za-z0-9_-]{10,40})$/.exec(path)
    if (sharePath && (method === 'GET' || method === 'HEAD')) {
      return sharePage(request, env, env.holm.app.ds.findOne('shares', { token: sharePath[1] }))
    }

    if (path !== '/api' && !path.startsWith('/api/')) return env.holm.web.fetch(request)

    if (path === '/api/me' && method === 'GET') {
      const member = auth.getMember()
      const next = url.searchParams.get('next') || '/'
      return json({
        member: member && { name: member.name || '', email: member.email || '', picture: member.picture || null },
        loginURL: auth.getLoginURL(next.startsWith('/') && !next.startsWith('//') ? next : '/'),
        logoutURL: member ? auth.getLogoutURL() : null
      })
    }

    // ── Public: shares ──

    const share = /^\/api\/shares\/([A-Za-z0-9_-]{10,40})(?:\/(thumb|texture))?$/.exec(path)
    if (share && method === 'GET') {
      const [, token, part] = share
      const doc = env.holm.app.ds.findOne('shares', { token })
      if (!doc) return fail(404, 'This link was turned off, or never existed.')
      const { s3 } = env.holm.app
      if (part) return serveImage(s3.get(`shares/${token}/${part}`), 'public, max-age=300')
      const svg = text(s3.get(`shares/${token}/svg`))
      const v = encodeURIComponent(doc.updatedAt)
      return json({
        name: doc.name,
        updatedAt: doc.updatedAt,
        svg,
        design: fullDesign(doc.design, svg, doc.hasTexture ? `/api/shares/${token}/texture?v=${v}` : null)
      })
    }

    // ── Signed in: saved shapes ──

    const member = auth.getMember()
    if (!member) return fail(401, 'Sign in to keep your shapes.')
    const { ds, s3 } = env.holm.app.member

    if (path === '/api/shapes' && method === 'GET') {
      const docs = ds.find('shapes', {}, { limit: MAX_SHAPES, order: 'desc' })
      docs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      return json({ shapes: docs.map(shapeDTO) })
    }

    if (path === '/api/shapes' && method === 'POST') {
      const save = await readSave(request)
      if (save.error) return fail(400, save.error)
      if (ds.count('shapes', {}) >= MAX_SHAPES) return fail(400, `You can keep up to ${MAX_SHAPES} shapes. Delete one to make room.`)
      const now = new Date().toISOString()
      const doc = { name: save.name, design: save.design, hasThumb: !!save.thumb, hasTexture: !!save.texture, shareToken: null, createdAt: now, updatedAt: now }
      const id = ds.insert('shapes', doc)
      s3.put(`shapes/${id}/svg`, save.svg, 'text/plain')
      if (save.thumb) s3.put(`shapes/${id}/thumb`, save.thumb.data, save.thumb.mime)
      if (save.texture) s3.put(`shapes/${id}/texture`, save.texture.data, save.texture.mime)
      return json({ shape: shapeDTO({ ...doc, id }) }, 201)
    }

    const one = /^\/api\/shapes\/([^/]+)(?:\/(thumb|texture|share))?$/.exec(path)
    if (!one) return fail(404, 'No such route.')
    const id = decodeURIComponent(one[1])
    const part = one[2]
    const doc = ds.findOne('shapes', { id })
    if (!doc) return fail(404, 'That shape is gone. It may have been deleted on another device.')

    if ((part === 'thumb' || part === 'texture') && method === 'GET') {
      return serveImage(s3.get(`shapes/${id}/${part}`), 'private, max-age=300')
    }

    if (part === 'share' && method === 'POST') {
      const token = doc.shareToken || newToken()
      publishShare(env, member, doc, token)
      if (!doc.shareToken) ds.update('shapes', { id }, { $set: { shareToken: token } })
      return json({ shape: shapeDTO({ ...doc, shareToken: token }) })
    }

    if (part === 'share' && method === 'DELETE') {
      unpublishShare(env, doc.shareToken)
      ds.update('shapes', { id }, { $set: { shareToken: null } })
      return json({ shape: shapeDTO({ ...doc, shareToken: null }) })
    }

    if (part) return fail(404, 'No such route.')

    if (method === 'GET') {
      const svg = text(s3.get(`shapes/${id}/svg`))
      const v = encodeURIComponent(doc.updatedAt)
      return json({ shape: shapeDTO(doc), svg, design: fullDesign(doc.design, svg, doc.hasTexture ? `/api/shapes/${id}/texture?v=${v}` : null) })
    }

    if (method === 'PUT') {
      const save = await readSave(request)
      if (save.error) return fail(400, save.error)
      const fields = { name: save.name, design: save.design, hasThumb: !!save.thumb, hasTexture: !!save.texture, updatedAt: new Date().toISOString() }
      s3.put(`shapes/${id}/svg`, save.svg, 'text/plain')
      if (save.thumb) s3.put(`shapes/${id}/thumb`, save.thumb.data, save.thumb.mime)
      else s3.delete(`shapes/${id}/thumb`)
      if (save.texture) s3.put(`shapes/${id}/texture`, save.texture.data, save.texture.mime)
      else s3.delete(`shapes/${id}/texture`)
      ds.update('shapes', { id }, { $set: fields })
      const next = { ...doc, ...fields }
      if (doc.shareToken) publishShare(env, member, next, doc.shareToken)
      return json({ shape: shapeDTO(next) })
    }

    if (method === 'PATCH') {
      let body
      try { body = await request.json() } catch { return fail(400, 'Send the new name as JSON.') }
      const name = clean(body?.name, 80)
      if (!name) return fail(400, 'Give the shape a name.')
      ds.update('shapes', { id }, { $set: { name } })
      if (doc.shareToken) env.holm.app.ds.update('shares', { token: doc.shareToken }, { $set: { name } })
      return json({ shape: shapeDTO({ ...doc, name }) })
    }

    if (method === 'DELETE') {
      unpublishShare(env, doc.shareToken)
      for (const p of ['svg', 'thumb', 'texture']) s3.delete(`shapes/${id}/${p}`)
      ds.delete('shapes', { id })
      return json({ ok: true })
    }

    return fail(405, 'That method is not allowed here.')
  }
}
