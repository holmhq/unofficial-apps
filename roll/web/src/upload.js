// Adding photos. Each file is read here first: its date, camera and place from EXIF, a
// fingerprint to catch photos already in the library, a preview of at most 2048 px and a
// thumbnail made on a canvas (which leaves the metadata behind), and a ThumbHash so the
// tile has its colours before the thumbnail arrives. The tile shows at once with a ring;
// the copies go up first, then the original in its own request.

import { h, ic, toast, sheet, fill } from './ui.js'
import * as api from './api.js'
import { lib, added, updated, hasHash, change, pend, unpend, local } from './store.js'
import { readExif } from './exif.js'
import { placeName } from './places.js'
import { rgbaToThumbHash } from '../vendor/thumbhash/thumbhash.js'
import { todayWall } from './time.js'

const MAX_ORIGINAL = 30 * 1024 * 1024
const PREVIEW = 2048
const THUMB_H = 480
const jobs = []
let preparing = 0
let sending = 0
let serial = 0
let batchStart = 0

const IMAGE = /^image\/(jpeg|png|webp|gif|avif|heic|heif|bmp)$/i
const isImage = (f) => IMAGE.test(f.type) || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f.name)

export function addFiles(files, { album = null } = {}) {
  const list = [...files]
  const images = list.filter(isImage)
  const others = list.length - images.length
  if (!images.length) {
    toast(others ? 'Roll keeps photos. Videos and other files aren’t supported yet.' : 'Nothing to add.', { kind: 'info', ms: 4200 })
    return
  }
  if (!jobs.some((j) => j.state !== 'done' && j.state !== 'failed' && j.state !== 'skipped')) { jobs.length = 0; batchStart = Date.now() }
  for (const file of images) jobs.push({ file, album, state: 'waiting', progress: 0, id: null, note: null })
  if (others) jobs.push({ file: { name: `${others} other ${others === 1 ? 'file' : 'files'}` }, state: 'skipped', note: 'Not a photo' })
  tray.show()
  pump()
}

function pump() {
  while (preparing < 2) {
    const job = jobs.find((j) => j.state === 'waiting')
    if (!job) break
    preparing++
    job.state = 'reading'
    prepare(job).catch((error) => fail(job, error)).finally(() => { preparing--; pump() })
  }
  while (sending < 2) {
    const job = jobs.find((j) => j.state === 'ready')
    if (!job) break
    sending++
    job.state = 'sending'
    send(job).catch((error) => fail(job, error)).finally(() => { sending--; pump() })
  }
  tray.update()
  if (!jobs.some((j) => ['waiting', 'reading', 'ready', 'sending'].includes(j.state))) finish()
}

function fail(job, error) {
  job.state = 'failed'
  job.note = (error && error.message) || 'Couldn’t add this photo.'
  if (job.local) { unpend(job.local); job.local = null }
}

/* ---- Reading a file --------------------------------------------------------------- */

async function prepare(job) {
  const file = job.file
  if (file.size > 200 * 1024 * 1024) throw new Error('Larger than 200 MB.')
  const [exif, hash] = await Promise.all([readExif(file), fingerprint(file)])
  if (hash && hasHash(hash)) { job.state = 'skipped'; job.note = 'Already in your library'; job.id = hasHash(hash); return }
  let source
  try { source = await decode(file) } catch {
    throw new Error(/hei[cf]/i.test(file.type + file.name) ? 'This browser can’t open HEIC photos. Safari can, or export them as JPEG.' : 'This file isn’t a photo this browser can open.')
  }
  const w = source.width
  const hh = source.height
  if (!w || !hh) throw new Error('This photo has no size.')
  const k = Math.min(1, PREVIEW / Math.max(w, hh))
  const pw = Math.max(1, Math.round(w * k))
  const ph = Math.max(1, Math.round(hh * k))
  const previewCanvas = shrink(source, w, hh, pw, ph)
  if (source.close) source.close()
  const tk = Math.min(1, THUMB_H / ph, 1440 / pw)
  const thumbCanvas = shrink(previewCanvas, pw, ph, Math.max(1, Math.round(pw * tk)), Math.max(1, Math.round(ph * tk)))
  const [preview, thumb] = await Promise.all([jpeg(previewCanvas, 0.86), jpeg(thumbCanvas, 0.8)])
  if (!preview || !thumb) throw new Error('Couldn’t make copies of this photo.')
  const th = thumbhash(thumbCanvas)
  const place = exif.gps ? await placeName(exif.gps) : null
  const taken = exif.taken || wallClock(file.lastModified || Date.now())
  job.meta = {
    name: file.name, type: file.type || guessType(file.name), size: file.size, w, h: hh, taken,
    offset: exif.offset || (exif.taken ? null : localOffset(file.lastModified || Date.now())),
    camera: exif.camera || null, lens: exif.lens || null, exp: exif.exp || null, gps: exif.gps || null, place, th, hash
  }
  job.preview = preview
  job.thumb = thumb
  job.local = 'local-' + (++serial)
  local.set(job.local, URL.createObjectURL(thumb))
  pend({ ...job.meta, id: job.local, fav: false, trashed: 0, albums: job.album ? [job.album] : [], orig: false, pending: true, progress: 0 })
  job.state = 'ready'
}

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch {}
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { width: img.naturalWidth, height: img.naturalHeight, draw: img }
  } finally { setTimeout(() => URL.revokeObjectURL(url), 30000) }
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function draw(src, w, h) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src.draw || src, 0, 0, w, h)
  return c
}

// Halve until close, then draw at size: smoother than one big step down.
function shrink(src, sw, sh, w, h) {
  let cur = src
  let cw = sw
  let ch = sh
  while (cw / 2 >= w * 1.15 && ch / 2 >= 1) {
    const nw = Math.round(cw / 2)
    const nh = Math.round(ch / 2)
    cur = draw(cur, nw, nh)
    cw = nw
    ch = nh
  }
  return draw(cur, w, h)
}

const jpeg = (c, q) => new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', q))

function thumbhash(c) {
  const k = Math.min(1, 100 / Math.max(c.width, c.height))
  const small = draw(c, Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)))
  const data = small.getContext('2d').getImageData(0, 0, small.width, small.height)
  const hash = rgbaToThumbHash(small.width, small.height, data.data)
  let bin = ''
  for (const b of hash) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function fingerprint(file) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

const wallClock = (t) => t - new Date(t).getTimezoneOffset() * 60000
function localOffset(t) {
  const m = -new Date(t).getTimezoneOffset()
  const a = Math.abs(m)
  return (m < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0')
}
const guessType = (name) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif' })[(name.split('.').pop() || '').toLowerCase()] || 'image/jpeg'

/* ---- Sending --------------------------------------------------------------------------- */

async function send(job) {
  const form = new FormData()
  form.set('meta', JSON.stringify(job.meta))
  form.set('thumb', job.thumb, 'thumb.jpg')
  form.set('preview', job.preview, 'preview.jpg')
  const small = job.thumb.size + job.preview.size
  const big = job.file.size <= MAX_ORIGINAL ? job.file.size : 0
  const total = small + big
  const progress = (f) => { job.progress = f; ring(job.local, f) }
  const r = await api.send('POST', '/api/photos', form, { onProgress: (f) => progress((f * small) / total * 0.98) })
  const photo = r.photo
  unpend(job.local, photo.id)
  job.local = null
  job.id = photo.id
  if (r.duplicate) { job.state = 'skipped'; job.note = 'Already in your library'; added(photo, r.v); return }
  added(photo, r.v)
  if (big && !photo.orig) {
    try {
      const o = await api.send('PUT', `/api/photos/${photo.id}/original`, job.file, { headers: { 'content-type': job.meta.type || 'application/octet-stream' }, onProgress: (f) => { job.progress = (small + f * big) / total } })
      updated(o.photo, o.v)
    } catch (error) {
      job.note = error.status === 413 ? error.message : 'The original didn’t arrive; Roll kept a 2048 px copy.'
    }
  } else if (!big) job.note = 'Larger than 30 MB, so Roll kept a 2048 px copy.'
  job.progress = 1
  job.state = 'done'
}

function ring(id, f) {
  if (!id) return
  const el = document.querySelector(`.tile[data-id="${id}"] .tile-up`)
  if (el) el.style.setProperty('--p', String(f))
}

async function finish() {
  const byAlbum = new Map()
  for (const j of jobs) if (j.album && j.id && (j.state === 'done' || j.state === 'skipped') && !j.filed) { j.filed = true; if (!byAlbum.has(j.album)) byAlbum.set(j.album, []); byAlbum.get(j.album).push(j.id) }
  for (const [album, ids] of byAlbum) { try { await change(ids, 'add', album) } catch {} }
  tray.update()
}

/* ---- The tray ------------------------------------------------------------------------------ */

const tray = (() => {
  let el = null
  let hideTimer = 0
  let open = false
  const counts = () => {
    const c = { all: 0, done: 0, failed: 0, skipped: 0, active: 0, progress: 0 }
    for (const j of jobs) {
      if (j.state === 'skipped' && !j.id && j.note === 'Not a photo') { c.failed += 0; continue }
      c.all++
      if (j.state === 'done') c.done++
      else if (j.state === 'failed') c.failed++
      else if (j.state === 'skipped') c.skipped++
      else c.active++
      c.progress += j.state === 'done' || j.state === 'failed' || j.state === 'skipped' ? 1 : (j.progress || 0)
    }
    return c
  }
  function show() {
    if (!el) {
      el = h('div.tray', { role: 'status', 'aria-live': 'polite' })
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tray-x')) { hide(); return }
        if (e.target.closest('.tray-more')) { details(); return }
      })
      document.body.append(el)
    }
    clearTimeout(hideTimer)
    requestAnimationFrame(() => el.classList.add('is-on'))
    update()
  }
  function hide() {
    if (!el) return
    el.classList.remove('is-on')
    open = false
  }
  function update() {
    if (!el) return
    const c = counts()
    const busy = c.active > 0
    const f = c.all ? c.progress / c.all : 0
    const head = busy
      ? `Adding ${Math.min(c.all, c.done + c.skipped + c.failed + 1).toLocaleString()} of ${c.all.toLocaleString()}`
      : c.done ? `${c.done.toLocaleString()} ${c.done === 1 ? 'photo' : 'photos'} added` : c.skipped ? 'Already in your library' : 'Nothing added'
    const notes = [c.skipped && (busy || c.done) ? `${c.skipped} already here` : null, c.failed ? `${c.failed} couldn’t be added` : null].filter(Boolean).join(' · ')
    const speed = busy && c.done > 2 ? estimate(c) : null
    el.classList.toggle('is-busy', busy)
    el.classList.toggle('has-errors', c.failed > 0)
    el.style.setProperty('--p', String(f))
    fill(el,
      h('span.tray-ring', busy ? h('i') : ic(c.failed && !c.done ? 'triangleAlert' : 'check', 16, 2.6)),
      h('div.tray-text', h('b', head), notes || speed ? h('small', [notes, speed].filter(Boolean).join(' · ')) : null),
      c.failed || c.skipped ? h('button.tray-more', { type: 'button' }, 'Details') : null,
      busy ? null : h('button.tray-x', { type: 'button', 'aria-label': 'Close' }, ic('x', 16, 2.2)))
    if (!busy) {
      clearTimeout(hideTimer)
      if (!c.failed && !open) hideTimer = setTimeout(hide, 5200)
    }
  }
  function estimate(c) {
    const spent = (Date.now() - batchStart) / 1000
    const left = Math.round((spent / Math.max(0.01, c.progress)) * (c.all - c.progress))
    if (!Number.isFinite(left) || left < 5) return null
    return left < 90 ? `about ${left} s left` : `about ${Math.round(left / 60)} min left`
  }
  function details() {
    open = true
    clearTimeout(hideTimer)
    sheet({
      title: 'Added photos', cancel: null, done: 'Done', onClose: () => { open = false; update() },
      body: () => h('div.group', jobs.filter((j) => j.note).map((j) => h('div.row.is-static',
        h('span.row-ic', { 'data-tone': j.state === 'failed' ? 'red' : 'grey' }, ic(j.state === 'failed' ? 'circleX' : j.state === 'skipped' ? 'circleCheck' : 'info', 17, 2)),
        h('div.grow', h('b.trunc', j.file.name), h('small', j.note)))))
    })
  }
  return { show, update, hide }
})()

/* ---- Drag, drop and paste ------------------------------------------------------------------- */

// Files dropped anywhere on the page (or pasted) are added; `target()` says which album, if
// the page shows one.
export function acceptDrops(target, canAdd) {
  let depth = 0
  const veil = h('div.drop', h('div.drop-card', ic('imagePlus', 34, 1.6), h('b', 'Drop to add'), h('small')))
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files')
  addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || !canAdd()) return
    e.preventDefault()
    depth++
    const album = target()
    veil.querySelector('small').textContent = album ? `to ${album.title}` : 'to your library'
    if (!veil.isConnected) document.body.append(veil)
    requestAnimationFrame(() => veil.classList.add('is-on'))
  })
  addEventListener('dragover', (e) => { if (hasFiles(e) && canAdd()) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } })
  addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil.classList.remove('is-on') })
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    veil.classList.remove('is-on')
    if (!canAdd()) return
    const album = target()
    addFiles(e.dataTransfer.files, { album: album ? album.id : null })
  })
  addEventListener('paste', (e) => {
    if (!canAdd() || e.target.closest && e.target.closest('input, textarea')) return
    const files = [...(e.clipboardData ? e.clipboardData.files : [])]
    if (!files.length) return
    e.preventDefault()
    const album = target()
    addFiles(files, { album: album ? album.id : null })
  })
}

export function pickFiles(album = null) {
  const input = h('input', { type: 'file', accept: 'image/*,.heic,.heif', multiple: true, hidden: true })
  input.addEventListener('change', () => { if (input.files.length) addFiles(input.files, { album }); input.remove() })
  document.body.append(input)
  input.click()
}

export const busy = () => jobs.some((j) => ['waiting', 'reading', 'ready', 'sending'].includes(j.state))
export { todayWall }
