// The inbox: the person's notifications, kept current over realtime, and what happens when
// one arrives: the sound plays, a browser notification shows, the voice follows once fal.ai
// has made it, and the card says which device heard it. One tab per browser plays (they
// elect one over a BroadcastChannel), every tab shows the card.
import * as api from './api.js'
import * as audio from './audio.js'
import * as notify from './notify.js'
import { subscribe } from './live.js'
import { state, deviceLabel } from './shell.js'

const TAB = Math.random().toString(36).slice(2, 10)
const SESSION_START = Date.now()
const listeners = new Set()
const waiters = new Map()
let unsubscribe = null
let bc = null
try { bc = new BroadcastChannel('ralk') } catch { bc = null }

export const inbox = {
  notes: [],
  status: 'idle', // connecting | live | down
  playing: null, // { id, phase: 'sound' | 'voice' }
  unarmed: [], // ids that arrived while this tab could not play
  loaded: false,
}

const emit = (type, detail = null) => { for (const fn of listeners) { try { fn(type, detail) } catch {} } }
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn) }
const find = (id) => inbox.notes.find((n) => n.id === id)
const terminal = (n) => n.speech === 'none' || n.speech === 'ready' || n.speech === 'failed' || n.speech === 'fetching'

function merge(id, patch) {
  const n = find(id)
  if (!n) return null
  Object.assign(n, patch)
  const w = waiters.get(id)
  if (w && terminal(n)) { waiters.delete(id); w() }
  emit('note', n)
  return n
}

export async function reload() {
  const { notes } = await api.get('/api/notes?limit=80')
  const local = new Map(inbox.notes.map((n) => [n.id, n]))
  inbox.notes = notes.map((n) => Object.assign(local.get(n.id) || {}, n))
  inbox.loaded = true
  emit('list')
}

export function start() {
  stop()
  if (!state.me || !state.me.signed_in || !state.me.channel) return
  inbox.status = 'connecting'
  emit('status')
  reload().catch(() => {})
  unsubscribe = subscribe(state.me.channel, (m) => {
    if (m.type === 'ready') { inbox.status = 'live'; emit('status'); if (m.again) reload().catch(() => {}); return }
    if (m.type === 'down') { inbox.status = 'down'; emit('status'); return }
    if (m.type === 'note') return arrive(m.note)
    if (m.type === 'speech') return merge(m.id, { speech: m.speech, error: m.error || null, audio: m.audio || (find(m.id) || {}).audio || null })
    if (m.type === 'heard') return merge(m.id, { heard: m.heard })
    if (m.type === 'cleared') { inbox.notes = []; emit('list'); return }
    if (m.type === 'play') return elect('play:' + m.sound + ':' + Date.now()).then((mine) => { if (mine) audio.play(m.sound, { tag: 'play' }) })
    if (m.type === 'prefs') { state.me.prefs = m.prefs; emit('prefs'); return }
    if (m.type === 'rotated') { api.get('/api/me').then((me) => { state.me = me; start() }).catch(() => {}) }
  })
}

export function stop() {
  if (unsubscribe) unsubscribe()
  unsubscribe = null
  inbox.status = 'idle'
}

// Which tab of this browser plays: the one that can (armed), then the one in view, then
// the lowest id. 160 ms of claims, so a note never plays twice from one machine.
const claims = new Map()
if (bc) bc.addEventListener('message', (e) => {
  const m = e.data
  if (!m || m.t !== 'claim') return
  const list = claims.get(m.id)
  if (list) list.push(m)
})
function elect(id) {
  if (!bc) return Promise.resolve(true)
  const mine = { t: 'claim', id, tab: TAB, score: (audio.armed() && audio.isOn() ? 2 : 0) + (document.visibilityState === 'visible' ? 1 : 0) }
  const list = [mine]
  claims.set(id, list)
  bc.postMessage(mine)
  return new Promise((resolve) => setTimeout(() => {
    claims.delete(id)
    list.sort((a, b) => b.score - a.score || (a.tab < b.tab ? -1 : 1))
    resolve(list[0].tab === TAB)
  }, 160))
}

async function arrive(note) {
  if (find(note.id)) return merge(note.id, note)
  note.fresh = true
  inbox.notes.unshift(note)
  inbox.notes = inbox.notes.slice(0, 200)
  emit('list')
  const mine = await elect(note.id)
  if (!mine) return
  const can = audio.armed() && audio.isOn()
  if (!can) { inbox.unarmed.push(note.id); emit('unarmed') }
  const away = document.hidden || !document.hasFocus()
  if (away && (note.title || note.say)) notify.show({ title: note.project ? `${note.title} · ${note.project}` : note.title, body: note.body || (note.say && note.kind === 'say' ? '' : note.say) || '', tag: note.id })
  // The card says which device heard it: after the sound, and again after the voice.
  const heard = () => api.post(`/api/notes/${note.id}/heard`, { device: deviceLabel() }).then(({ heard: h }) => merge(note.id, { heard: h })).catch(() => {})
  if (can && note.sound && note.sound !== 'none') {
    inbox.playing = { id: note.id, phase: 'sound' }
    emit('playing')
    let played = false
    try { played = !!(await audio.play(note.sound, { tag: note.id })) } catch {}
    inbox.playing = null
    emit('playing')
    if (played) heard()
  }
  if (note.say) {
    await waitForVoice(note.id)
    const n = find(note.id)
    if (n && n.audio && audio.armed() && audio.isOn()) {
      inbox.playing = { id: note.id, phase: 'voice' }
      emit('playing')
      let played = false
      try { played = !!(await playVoice(n)) } catch (error) { merge(note.id, { speech: 'failed', error: error.message || 'The voice could not be played here.' }) }
      inbox.playing = null
      emit('playing')
      if (played) heard()
    }
  }
}

// The voice of a note: from storage through Web Audio, or fal.ai's copy through an audio
// element while the server keeps its own copy (so the next play, and the same line again,
// come from storage).
export async function playVoice(n) {
  if (!n.audio) return false
  if (n.audio.stored) return audio.speak(n.audio.src, { tag: n.id })
  const played = audio.speakRemote(n.audio.src, { tag: n.id })
  api.post(`/api/notes/${n.id}/keep`).then(({ note }) => merge(n.id, note)).catch(() => {})
  return played
}

// Resolve once the line's audio can be fetched (or it failed). The server tells us over
// realtime; polling every second covers a missed message, and up to 90 seconds in all.
export function waitForVoice(id) {
  const until = Date.now() + 90000
  return new Promise((resolve) => {
    const step = async () => {
      const n = find(id)
      if (!n || terminal(n) || Date.now() > until) { waiters.delete(id); return resolve() }
      let fired = false
      const once = () => { if (!fired) { fired = true; resolve() } }
      waiters.set(id, once)
      await new Promise((r) => setTimeout(r, 1000))
      if (fired) return
      try {
        const { note } = await api.get(`/api/notes/${id}/speech`)
        merge(id, note)
      } catch {}
      if (!fired) step()
    }
    step()
  })
}

// Play a card again on this device: its sound, then its voice if there is one.
export async function replay(note) {
  if (!(await audio.arm())) return false
  inbox.playing = { id: note.id, phase: 'sound' }
  emit('playing')
  try {
    if (note.sound && note.sound !== 'none') await audio.play(note.sound, { force: true, tag: note.id })
    if (note.say && note.audio) {
      inbox.playing = { id: note.id, phase: 'voice' }
      emit('playing')
      await playVoice(note)
    }
  } catch (error) {
    inbox.playing = null
    emit('playing')
    throw error
  }
  inbox.playing = null
  emit('playing')
  return true
}

// After the tab is armed, play the latest note that arrived unheard in this session.
export async function catchUp() {
  const ids = inbox.unarmed.splice(0)
  emit('unarmed')
  const latest = ids.map(find).filter(Boolean).sort((a, b) => b.at - a.at)[0]
  if (latest && latest.at > SESSION_START - 1) await replay(latest).catch(() => {})
}

export const TESTS = {
  done: { title: 'Build finished', body: '212 tests passed in 3.1 s. Deploying to staging.', project: 'ralk' },
  attention: { title: 'Needs your approval', body: 'Claude wants to run: git push origin main', project: 'ralk' },
  question: { title: 'Keep the old API too?', body: 'Removing /v1 breaks the CLI from last month. Keep both for a release?', project: 'ralk' },
  error: { title: 'Build failed on main', body: 'TypeError: cannot read properties of undefined (reading "id") in notes.js:41', project: 'ralk' },
  info: { title: 'Notes written', body: 'Draft of the release notes is in RELEASES.md.', project: 'ralk' },
  start: { title: 'Starting the full test suite', body: 'About four minutes. Step away.', project: 'ralk' },
  voice: { kind: 'attention', title: 'Deploy needs your approval', body: 'Olivia reads this one out.', say: 'The deploy to staging is ready. It needs your approval before it goes out.', project: 'ralk' },
}

export function test(kind) {
  const t = TESTS[kind]
  return api.post('/api/notes', { kind: t.kind || kind, title: t.title, body: t.body, say: t.say, project: t.project })
}

export async function clear() {
  await api.del('/api/notes')
  inbox.notes = []
  emit('list')
}
