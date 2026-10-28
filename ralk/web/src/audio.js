// Everything that makes a sound: one AudioContext, the volume, earshot sounds rendered
// from code (in a worker, cached as buffers), and spoken lines fetched from the server.
// Browsers start audio only after a tap or a key: arm() must be called from one.

const VOL_KEY = 'ralk:volume'
const ON_KEY = 'ralk:sounds'

let ctx = null
let gain = null
let worker = null
let fallback = null
const buffers = new Map()
const pending = new Map()
const listeners = new Set()
let volume = .8
let on = true
try { const v = Number(localStorage.getItem(VOL_KEY)); if (Number.isFinite(v) && v > 0 && v <= 1) volume = v } catch {}
try { on = localStorage.getItem(ON_KEY) !== 'off' } catch {}

const emit = (event) => { for (const fn of listeners) { try { fn(event) } catch {} } }

function context() {
  const C = window.AudioContext || window.webkitAudioContext
  if (!C) return null
  if (!ctx) {
    ctx = new C({ latencyHint: 'interactive' })
    gain = ctx.createGain()
    gain.gain.value = volume
    gain.connect(ctx.destination)
    ctx.addEventListener('statechange', () => emit({ type: 'state', armed: ctx.state === 'running' }))
  }
  return ctx
}

// Call from a tap or a key: resumes the context so sounds can play from then on.
export async function arm() {
  const c = context()
  if (!c) return false
  try { if (c.state !== 'running') await c.resume() } catch {}
  if (c.state === 'running') {
    // A silent buffer unlocks playback on iOS.
    const b = c.createBuffer(1, 1, c.sampleRate)
    const s = c.createBufferSource()
    s.buffer = b
    s.connect(gain)
    s.start()
  }
  emit({ type: 'state', armed: c.state === 'running' })
  return c.state === 'running'
}

export const armed = () => !!ctx && ctx.state === 'running'
export const supported = () => !!(window.AudioContext || window.webkitAudioContext)

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function getVolume() { return volume }
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem(VOL_KEY, String(volume)) } catch {}
  if (gain) gain.gain.setTargetAtTime(volume, ctx.currentTime, .02)
  emit({ type: 'volume', volume })
}

export function isOn() { return on }
export function setOn(value) {
  on = !!value
  try { localStorage.setItem(ON_KEY, on ? 'on' : 'off') } catch {}
  emit({ type: 'on', on })
}

// ---- earshot sounds ----

function renderInWorker(sound) {
  if (pending.has(sound)) return pending.get(sound)
  const p = new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const done = (event) => {
      const m = event.data
      if (!m || m.id !== id) return
      worker.removeEventListener('message', done)
      if (m.error) reject(new Error(m.error))
      else resolve(m)
    }
    try {
      if (!worker) {
        worker = new Worker('/src/render-worker.js', { type: 'module' })
        worker.addEventListener('error', () => { worker = null })
      }
      worker.addEventListener('message', done)
      worker.postMessage({ id, sound })
    } catch (error) { reject(error) }
  }).finally(() => pending.delete(sound))
  pending.set(sound, p)
  return p
}

async function renderHere(sound) {
  if (!fallback) fallback = import('/vendor/earshot/earshot.js')
  const { render } = await fallback
  const out = render(sound)
  return { sr: out.sr, left: out.channels[0], right: out.channels[1] }
}

// The sound as an AudioBuffer, rendered once per page.
export async function buffer(sound) {
  if (buffers.has(sound)) return buffers.get(sound)
  const c = context()
  if (!c) throw new Error('No audio here.')
  let r
  try { r = await renderInWorker(sound) } catch { r = await renderHere(sound) }
  const b = c.createBuffer(2, r.left.length, r.sr)
  b.copyToChannel(r.left, 0)
  b.copyToChannel(r.right, 1)
  buffers.set(sound, b)
  return b
}

export function preload(sounds) {
  let i = 0
  const next = () => { if (i < sounds.length) buffer(sounds[i++]).catch(() => {}).finally(() => (window.requestIdleCallback || setTimeout)(next, 50)) }
  if (context()) (window.requestIdleCallback || setTimeout)(next, 300)
}

let playingNow = 0
export const playing = () => playingNow > 0

function playBuffer(b, tag) {
  return new Promise((resolve) => {
    const c = context()
    const s = c.createBufferSource()
    s.buffer = b
    s.connect(gain)
    playingNow++
    emit({ type: 'playing', tag, start: true, seconds: b.duration })
    s.onended = () => { playingNow--; emit({ type: 'playing', tag, start: false }); resolve(true) }
    s.start()
  })
}

// Play a sound by id; resolves when it ends. Resolves false if sounds are off or not armed.
export async function play(sound, { force = false, tag = null } = {}) {
  if (!sound || sound === 'none') return false
  if (!force && !on) return false
  const c = context()
  if (!c || c.state !== 'running') return false
  const b = await buffer(sound)
  return playBuffer(b, tag || sound)
}

const voices = new Map()
// Fetch and decode a spoken line once per page.
export async function voiceBuffer(url) {
  if (voices.has(url)) return voices.get(url)
  const c = context()
  if (!c) throw new Error('No audio here.')
  const p = (async () => {
    const r = await fetch(url, { credentials: 'same-origin' })
    if (!r.ok) throw new Error(r.status === 409 ? 'not ready' : `audio ${r.status}`)
    const bytes = await r.arrayBuffer()
    return await c.decodeAudioData(bytes)
  })()
  p.catch(() => voices.delete(url))
  voices.set(url, p)
  return p
}

// Speak a line from its audio URL; resolves when it ends (false when not armed).
export async function speak(url, { tag = null } = {}) {
  const c = context()
  if (!c || c.state !== 'running') return false
  const b = await voiceBuffer(url)
  return playBuffer(b, tag || url)
}

// Play a line from another origin (fal.ai's copy) through an audio element, which needs no
// CORS; the volume follows the same setting. Resolves when it ends.
export function speakRemote(url, { tag = null } = {}) {
  return new Promise((resolve, reject) => {
    const el = new Audio()
    el.preload = 'auto'
    el.volume = volume
    el.crossOrigin = null
    let settled = false
    const done = (ok) => { if (settled) return; settled = true; clearTimeout(guard); playingNow--; emit({ type: 'playing', tag, start: false }); el.remove(); ok ? resolve(true) : reject(new Error('The voice could not be played here.')) }
    // A slow link can stall playback; never leave a card "playing" for good.
    const guard = setTimeout(() => done(true), 60000)
    el.addEventListener('ended', () => done(true), { once: true })
    el.addEventListener('error', () => done(false), { once: true })
    el.addEventListener('playing', () => emit({ type: 'playing', tag, start: true, seconds: el.duration || 0 }), { once: true })
    playingNow++
    el.src = url
    el.play().catch(() => done(false))
  })
}

// Keep the context alive across visibility changes (Safari suspends it).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state === 'interrupted') ctx.resume().catch(() => {})
})
