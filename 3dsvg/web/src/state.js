// The editor's state: the design, the SVG it shows, who is signed in and
// which saved shape is open. Changes go through set*() and are announced, so
// the panels and the 3D view follow along.

import { normalize, defaultDesign } from './design.js'
import { pixelsToSvg } from './pixels.js'
import { loadFont, textToSvg } from './fonts.js'

const DESIGN_KEY = '3dsvg:design:v1'
const SHAPE_KEY = '3dsvg:shape:v1'
const SETTINGS_KEY = '3dsvg:settings:v1'
// A shared shape's "Edit a copy" hands its design to the editor here.
export const REMIX_KEY = '3dsvg:remix'

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } },
  drop(key) { try { localStorage.removeItem(key) } catch {} }
}

export const state = {
  design: normalize(store.get(DESIGN_KEY) || defaultDesign()),
  svgs: { draw: '', text: '', code: '', file: '' },
  shownSvg: '',
  shownTab: 'draw',
  fontLoading: false,
  me: undefined, // undefined while asking, null signed out
  loginURL: '/auth/login',
  logoutURL: null,
  shape: store.get(SHAPE_KEY), // { id, name, shareToken, key } of the open saved shape
  settings: { appearance: 'system', ...store.get(SETTINGS_KEY) },
  previewOpen: false
}

const listeners = {}
export const on = (event, fn) => { (listeners[event] ||= []).push(fn) }
export const emit = (event, ...args) => (listeners[event] || []).forEach(fn => fn(...args))

// ── Design ──

let saveTimer = 0
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!store.set(DESIGN_KEY, state.design)) {
      // Too big for this browser's storage: keep everything but the image.
      store.set(DESIGN_KEY, { ...state.design, texture: { ...state.design.texture, image: null } })
    }
  }, 300)
}

const SOURCE_KEYS = ['tab', 'pixels', 'text', 'font', 'code', 'file']

export function setDesign(patch) {
  Object.assign(state.design, patch)
  if (SOURCE_KEYS.some(k => k in patch)) refreshSvgs(patch)
  persist()
  emit('design', patch)
}

// Replaces the whole design, as when a saved shape opens.
export function replaceDesign(design) {
  state.design = normalize(design)
  refreshSvgs(null)
  persist()
  emit('design', null)
  emit('replaced')
}

// ── The SVG on show ──
// Each source tab makes its own SVG. A tab with nothing in it keeps showing
// the last shape, so switching to an empty tab never blanks the stage.

let textVersion = 0
function refreshSvgs(patch) {
  const d = state.design
  const all = !patch
  if (all || 'pixels' in patch) state.svgs.draw = pixelsToSvg(d.pixels)
  if (all || 'code' in patch) state.svgs.code = d.code.trim()
  if (all || 'file' in patch) state.svgs.file = d.file?.svg || ''
  if (all || 'text' in patch || 'font' in patch) {
    const text = d.text.trim()
    const mine = ++textVersion
    if (!text) state.svgs.text = ''
    else {
      state.fontLoading = true
      emit('font', true)
      loadFont(d.font).then(font => {
        if (mine !== textVersion) return
        state.svgs.text = textToSvg(text, font)
        state.fontLoading = false
        emit('font', false)
        pickShown()
      }, () => {
        if (mine !== textVersion) return
        state.fontLoading = false
        emit('font', false)
      })
    }
  }
  pickShown()
}

function pickShown() {
  const tab = state.design.tab
  const svg = state.svgs[tab]
  if (svg) {
    if (svg === state.shownSvg && tab === state.shownTab) return
    state.shownSvg = svg
    state.shownTab = tab
  } else if (state.shownSvg) return
  emit('svg', state.shownSvg)
}

export function startSvgs() { refreshSvgs(null) }

// ── The open saved shape ──

// A short fingerprint of the design and its SVG, for "changed since saved".
function designKey() {
  const text = JSON.stringify(state.design) + state.shownSvg
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36) + ':' + text.length
}

// shape is { id, name, shareToken } or null. saved: the design on screen is
// what the account holds, as after opening or saving.
export function setShape(shape, { saved = true } = {}) {
  if (shape && saved) shape = { ...shape, key: designKey() }
  else if (shape && state.shape?.id === shape.id) shape = { ...shape, key: state.shape.key }
  state.shape = shape
  if (shape) store.set(SHAPE_KEY, shape)
  else store.drop(SHAPE_KEY)
  emit('shape', shape)
}

export const isDirty = () => !!state.shape && state.shape.key !== designKey()

// ── Settings ──

export function setSetting(key, value) {
  state.settings[key] = value
  store.set(SETTINGS_KEY, state.settings)
  emit('settings', key)
}
