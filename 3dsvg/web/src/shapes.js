// Saved shapes: the Save button's popover, the My shapes panel, and share
// links. Everything here needs a signed-in member; signed out, the design
// still stays in this browser.

import { h, dialog, toast, copyText, isPhone } from './ui.js'
import { icon } from './icons.js'
import { state, on, emit, setShape, replaceDesign, isDirty } from './state.js'
import { defaultDesign, normalize } from './design.js'
import { signIn } from './account.js'

const AFTER_SIGN_IN = '3dsvg:after-sign-in'
let viewer = null
export const useViewer = v => { viewer = v }

// ── Talking to the server ──

async function api(path, { method = 'GET', body, form } = {}) {
  const init = { method, headers: { accept: 'application/json' } }
  if (form) init.body = form
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json' }
  let r
  try { r = await fetch(path, init) } catch { throw new Error('No connection. Try again when you are back online.') }
  if (r.status === 413) throw new Error('That is too large for this server.')
  const data = await r.json().catch(() => ({}))
  if (r.status === 401) { state.me = null; emit('me', null) }
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}).`)
  return data
}

let shapes = null // the member's list, newest first, once loaded
let listing = null

export function loadShapes(force = false) {
  if (!state.me) { shapes = null; emit('shapes'); return Promise.resolve(null) }
  if (listing && !force) return listing
  listing = api('/api/shapes').then(d => { shapes = d.shapes; emit('shapes'); return shapes })
    .catch(e => { emit('shapes', e); return null })
    .finally(() => { listing = null })
  return listing
}

const upsert = shape => {
  if (!shapes) return
  shapes = [shape, ...shapes.filter(s => s.id !== shape.id)]
  emit('shapes')
}

// ── Saving ──

function dataURLBlob(url) {
  const [head, data] = url.split(',')
  const mime = /data:([^;,]+)/.exec(head)?.[1] || 'application/octet-stream'
  const bytes = head.includes(';base64') ? atob(data) : decodeURIComponent(data)
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i)
  return new Blob([out], { type: mime })
}

// A square JPEG of the stage, for the shapes grid and link previews. A
// shape still being built is waited for, up to ten seconds.
async function thumbnail() {
  for (let i = 0; i < 100 && viewer?.isLoading(); i++) await new Promise(resolve => setTimeout(resolve, 100))
  return new Promise(resolve => {
    if (!viewer?.hasShape()) return resolve(null)
    const img = new Image()
    img.onload = () => {
      const c = h('canvas', { width: 512, height: 512 })
      c.getContext('2d').drawImage(img, 0, 0, 512, 512)
      c.toBlob(resolve, 'image/jpeg', 0.85)
    }
    img.onerror = () => resolve(null)
    img.src = viewer.capture(512, true, 1)
  })
}

function suggestedName() {
  const d = state.design
  const tab = state.shownTab
  if (tab === 'text' && d.text.trim()) return d.text.trim().slice(0, 80)
  if (tab === 'file' && d.file) return d.file.name.replace(/\.svg$/i, '').slice(0, 80) || 'Uploaded shape'
  if (tab === 'draw') return 'Pixel art'
  return 'SVG shape'
}

async function saveForm(name) {
  const design = { ...state.design, tab: state.shownTab, code: '', file: state.design.file ? { name: state.design.file.name } : null }
  const form = new FormData()
  form.set('name', name)
  form.set('svg', new Blob([state.shownSvg], { type: 'text/plain' }), 'shape.svg')
  const image = state.design.texture.image
  if (image && !state.design.texture.preset) {
    const blob = image.startsWith('data:') ? dataURLBlob(image) : await fetch(image).then(r => (r.ok ? r.blob() : null)).catch(() => null)
    if (blob) form.set('texture', blob, 'texture')
  }
  design.texture = { ...design.texture, image: null }
  form.set('design', JSON.stringify(design))
  const thumb = await thumbnail()
  if (thumb) form.set('thumb', thumb, 'thumb.jpg')
  return form
}

export async function save(name, { asNew = false } = {}) {
  if (!state.shownSvg) throw new Error('There is no shape to save yet.')
  const form = await saveForm(name)
  const current = state.shape
  const { shape } = current && !asNew
    ? await api(`/api/shapes/${encodeURIComponent(current.id)}`, { method: 'PUT', form })
    : await api('/api/shapes', { method: 'POST', form })
  setShape({ id: shape.id, name: shape.name, shareToken: shape.shareToken })
  upsert(shape)
  return shape
}

async function openShape(id) {
  const data = await api(`/api/shapes/${encodeURIComponent(id)}`)
  replaceDesign(data.design)
  setShape({ id: data.shape.id, name: data.shape.name, shareToken: data.shape.shareToken })
  viewer?.reset()
}

const shareURL = token => `${location.origin}/s/${token}`

async function setSharing(id, on) {
  const { shape } = await api(`/api/shapes/${encodeURIComponent(id)}/share`, { method: on ? 'POST' : 'DELETE' })
  if (state.shape?.id === id) setShape({ ...state.shape, shareToken: shape.shareToken }, { saved: false })
  upsert(shape)
  return shape
}

async function rename(id, name) {
  const { shape } = await api(`/api/shapes/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } })
  if (state.shape?.id === id) setShape({ ...state.shape, name: shape.name }, { saved: false })
  upsert(shape)
}

async function remove(id) {
  await api(`/api/shapes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (state.shape?.id === id) setShape(null)
  if (shapes) { shapes = shapes.filter(s => s.id !== id); emit('shapes') }
}

// Unsaved work on screen that opening something else would replace.
function confirmReplace() {
  if (isDirty()) return confirm(`Discard your unsaved changes to “${state.shape.name}”?`)
  if (!state.shape && JSON.stringify(normalize(state.design)) !== JSON.stringify(defaultDesign())) {
    return confirm('Replace the design on screen? It is not saved.')
  }
  return true
}

function newDesign() {
  if (!confirmReplace()) return
  replaceDesign(defaultDesign())
  setShape(null)
  viewer?.reset()
}

// ── Share controls, used in the Save popover and the shape dialog ──

function shareBox(shape, after = () => {}) {
  const box = h('div', { class: 'share-box' })
  const paint = () => {
    const token = shape.shareToken
    if (!token) {
      box.replaceChildren(
        h('p', {}, 'Anyone with a share link can see and turn this shape. They can’t change it.'),
        h('button', { class: 'btn small', type: 'button', onclick: e => run(e.currentTarget, async () => { shape = await setSharing(shape.id, true); paint(); after(); await copyText(shareURL(shape.shareToken)); toast('Link copied') }) }, icon('link', 14), 'Create share link'))
      return
    }
    const field = h('input', { class: 'field', readonly: true, value: shareURL(token), 'aria-label': 'Share link', onfocus: e => e.target.select() })
    box.replaceChildren(
      h('div', { class: 'share-link' }, field,
        h('button', { class: 'btn small', type: 'button', title: 'Copy link', onclick: async () => { await copyText(shareURL(token)); toast('Link copied') } }, icon('copy', 14))),
      h('p', {}, 'Saving again updates what the link shows.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn small ghost', href: shareURL(token), target: '_blank', rel: 'noopener' }, icon('external-link', 14), 'Open'),
        h('button', { class: 'btn small ghost danger', type: 'button', onclick: e => run(e.currentTarget, async () => { shape = await setSharing(shape.id, false); paint(); after(); toast('Link turned off') }) }, icon('link-2-off', 14), 'Turn off link')))
  }
  paint()
  return box
}

async function run(button, task) {
  button.disabled = true
  try { await task() } catch (e) { toast(e.message, { tone: 'error' }) } finally { if (button.isConnected) button.disabled = false }
}

// ── The Save button and its popover ──

export function saveButton() {
  const wrap = h('div', { class: 'avatar-wrap' })
  const button = h('button', { class: 'round-btn glass', type: 'button', title: 'Save', 'aria-label': 'Save shape', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, icon('save', 16))
  const dot = h('span', { class: 'dot', hidden: true })
  button.append(dot)
  let pop = null

  const close = () => {
    if (!pop) return false
    pop.remove()
    pop = null
    button.setAttribute('aria-expanded', 'false')
    return true
  }

  function open() {
    close()
    const me = state.me
    if (!me) {
      pop = h('section', { class: 'popover glass save-pop', 'aria-label': 'Save' },
        h('h3', {}, 'Keep your shapes'),
        h('p', {}, 'Sign in to save shapes to your account, open them on any device and share them by link. What’s on screen stays here while you sign in.'),
        h('button', { class: 'btn primary block', type: 'button', disabled: me === undefined, onclick: () => { sessionStorage.setItem(AFTER_SIGN_IN, 'save'); signIn() } }, icon('log-in', 15), 'Sign in to save'))
    } else {
      const shape = state.shape
      const name = h('input', { class: 'field', value: shape?.name || suggestedName(), maxlength: 80, 'aria-label': 'Name', autofocus: !isPhone() })
      const note = h('p', { hidden: true })
      const go = asNew => async e => {
        const btn = e.currentTarget
        await run(btn, async () => {
          const saved = await save(name.value.trim() || suggestedName(), { asNew })
          toast(asNew || !shape ? `Saved “${saved.name}” to My shapes` : 'Changes saved')
          open()
        })
      }
      const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: go(false) }, icon('check', 15), shape ? 'Save changes' : 'Save')
      name.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click() })
      pop = h('section', { class: 'popover glass save-pop', 'aria-label': 'Save' },
        h('h3', {}, shape ? 'Saved shape' : 'Save to My shapes'),
        name,
        h('div', { class: 'row' }, saveBtn, shape && h('button', { class: 'btn', type: 'button', onclick: go(true) }, 'Save as new')),
        note,
        shape && shareBox({ ...shape }))
      if (shape && isDirty()) { note.textContent = 'You have changes that aren’t saved yet.'; note.hidden = false }
    }
    wrap.append(pop)
    button.setAttribute('aria-expanded', 'true')
    pop.querySelector('[autofocus]')?.focus()
  }

  button.addEventListener('click', () => { if (!close()) open() })
  document.addEventListener('pointerdown', e => { if (pop && !wrap.contains(e.target) && !e.target.closest?.('.toast')) close() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && close()) button.focus() })

  // A dot on the button while the open shape has unsaved changes.
  let timer = 0
  const check = () => { clearTimeout(timer); timer = setTimeout(() => { dot.hidden = !isDirty() }, 250) }
  on('design', check)
  on('svg', check)
  on('shape', check)

  // Back from signing in to save: open the popover again.
  on('me', me => {
    if (me && sessionStorage.getItem(AFTER_SIGN_IN) === 'save') {
      sessionStorage.removeItem(AFTER_SIGN_IN)
      setTimeout(open, 600)
    }
  })

  wrap.append(button)
  return { el: wrap, close }
}

// ── My shapes panel ──

const ago = iso => {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (!(s >= 0)) return ''
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: Date.parse(iso) < Date.now() - 300 * 86400000 ? 'numeric' : undefined })
}

export function shapesPanel({ onOpen }) {
  const el = h('div', { class: 'stack' })
  let problem = null

  function paint() {
    if (state.me === undefined) return el.replaceChildren(h('p', { class: 'hint pulse' }, 'Loading…'))
    if (!state.me) {
      return el.replaceChildren(h('div', { class: 'empty' }, icon('folder-open', 28),
        h('p', { class: 'hint' }, 'Sign in to keep your shapes, open them on any device and share them by link.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => signIn() }, icon('log-in', 15), 'Sign in')))
    }
    const head = h('div', { class: 'row between' },
      h('strong', {}, 'My shapes'),
      h('button', { class: 'btn small', type: 'button', onclick: newDesign }, icon('plus', 14), 'New'))
    if (problem && !shapes) return el.replaceChildren(head, h('p', { class: 'hint' }, problem.message), h('button', { class: 'btn small', type: 'button', onclick: () => loadShapes(true) }, 'Try again'))
    if (!shapes) return el.replaceChildren(head, h('p', { class: 'hint pulse' }, 'Loading your shapes…'))
    if (!shapes.length) {
      return el.replaceChildren(head, h('div', { class: 'empty' }, icon('save', 26),
        h('p', { class: 'hint' }, 'Nothing saved yet. Make something, then press Save at the top right.')))
    }
    el.replaceChildren(head, h('div', { class: 'shapes-grid' }, shapes.map(card)))
  }

  function card(s) {
    const thumb = s.hasThumb
      ? h('img', { src: `/api/shapes/${encodeURIComponent(s.id)}/thumb?v=${encodeURIComponent(s.updatedAt)}`, alt: '', loading: 'lazy', width: 140, height: 140 })
      : h('span', { class: 'thumb-blank' })
    const openBtn = h('button', { class: 'shape-open', type: 'button', title: `Open ${s.name}` },
      thumb, h('span', { class: 'name' }, s.name),
      h('span', { class: 'meta' }, s.shareToken && icon('link', 11), ago(s.updatedAt)))
    openBtn.addEventListener('click', async () => {
      if (state.shape?.id === s.id && !isDirty()) return onOpen?.()
      if (!confirmReplace()) return
      try { await openShape(s.id); onOpen?.() } catch (e) { toast(e.message, { tone: 'error' }) }
    })
    const more = h('button', { class: 'icon-btn small more', type: 'button', 'aria-label': `Options for ${s.name}`, title: 'Options', onclick: () => shapeDialog(s) }, icon('ellipsis', 16))
    return h('div', { class: `shape-card${state.shape?.id === s.id ? ' current' : ''}` }, openBtn, more)
  }

  on('me', () => { paint(); loadShapes() })
  on('shapes', err => { problem = err || null; paint() })
  on('shape', paint)
  paint()
  return { el, shown: () => { if (state.me && !shapes) loadShapes() } }
}

// Rename, share or delete one shape.
function shapeDialog(s) {
  const name = h('input', { class: 'field', value: s.name, maxlength: 80, 'aria-label': 'Name' })
  const renameBtn = h('button', { class: 'btn small', type: 'button' }, 'Rename')
  renameBtn.addEventListener('click', () => run(renameBtn, async () => {
    const value = name.value.trim()
    if (!value || value === s.name) return
    await rename(s.id, value)
    s = { ...s, name: value }
    toast('Renamed')
  }))
  name.addEventListener('keydown', e => { if (e.key === 'Enter') renameBtn.click() })
  const del = h('button', { class: 'btn small ghost danger', type: 'button' }, icon('trash-2', 14), 'Delete')
  const d = dialog({ title: 'Shape' },
    h('div', { class: 'row' }, name, renameBtn),
    shareBox({ ...s }),
    h('div', { class: 'dialog-foot' }, del))
  del.addEventListener('click', () => {
    if (!confirm(`Delete “${s.name}”?${s.shareToken ? ' Its share link stops working too.' : ''} This can’t be undone.`)) return
    run(del, async () => { await remove(s.id); d.close(); toast('Deleted') })
  })
}
