// Strata — start-up. Applies the theme, mounts the chrome and the play
// screen, learns who is signed in, and sends a signed-in member's best game
// to the server, which replays it before it counts. Signed out, everything
// stays in this browser and the game needs no network at all.

import { init as initTheme } from './theme.js'
import { mountChrome } from './ui.js'
import { mountPlay } from './game.js'
import { unlock as unlockAudio } from './audio.js'
import { prefs } from './state.js'

initTheme()

// Block iOS pinch-zoom: the board is the input surface.
for (const type of ['gesturestart', 'gesturechange']) {
  window.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

// Browsers allow sound only after the first tap or key press.
const unlock = () => {
  unlockAudio()
  window.removeEventListener('pointerdown', unlock)
  window.removeEventListener('keydown', unlock)
}
window.addEventListener('pointerdown', unlock)
window.addEventListener('keydown', unlock)

const state = { me: null, loginURL: null, logoutURL: null, offline: false }

async function api(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }
    })
  } catch (_e) {
    throw { offline: true }
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw { status: response.status, message: data && data.error }
  return data
}

const root = document.getElementById('app')
const chrome = mountChrome(root, {
  me: () => state.me,
  offline: () => state.offline,
  signIn,
  signOut,
  loadBoard: () => api('/api/leaderboard')
})

mountPlay(document.getElementById('play'), {
  hudSlot: chrome.hudSlot,
  openLeaderboard: () => chrome.openLeaderboard(),
  isSignedIn: () => !!state.me,
  isOffline: () => state.offline,
  isBlocked: () => chrome.isOpen(),
  signIn,
  onOver(record, isBest) {
    if (state.me && isBest) send(record, { announce: true })
  }
})

// Sends a finished game. The server replays it from its seed and keeps it
// if it beats the member's best; the best from every device comes back.
async function send(record, { announce = false } = {}) {
  try {
    const data = await api('/api/games', {
      method: 'POST',
      body: JSON.stringify({ seed: record.seed, log: record.log, score: record.score })
    })
    setOffline(false)
    prefs.markSynced()
    prefs.merge(data.best)
    if (data.board.improved) chrome.toast(`Saved: ${data.board.score.toLocaleString()} points on the leaderboard`)
    else if (announce) chrome.toast(`Saved. Your best on the leaderboard is ${data.board.score.toLocaleString()}`)
    chrome.refreshBoard()
  } catch (e) {
    if (e.offline) setOffline(true)
    else if (e.status === 401) { state.me = null; chrome.refreshAccount() }
    else if (e.status === 422) { prefs.markSynced(); if (announce) chrome.toast('That game could not be checked, so it was not saved.') }
    else if (announce) chrome.toast('Could not save to the leaderboard; it will try again next time.')
  }
}

function setOffline(offline) {
  if (state.offline === offline) return
  state.offline = offline
  chrome.refreshAccount()
}

async function start() {
  try {
    const me = await api('/api/me?next=' + encodeURIComponent(location.pathname))
    state.me = me.member
    state.loginURL = me.loginURL
    state.logoutURL = me.logoutURL
    state.offline = false
  } catch (e) {
    state.offline = !!e.offline
  }
  chrome.refreshAccount()
  if (!state.me) return
  // A best game this device hasn't sent yet goes now; otherwise the
  // member's best from other devices comes here.
  const unsent = prefs.unsent()
  if (unsent) return send(unsent)
  try {
    const data = await api('/api/best')
    prefs.merge(data.best)
  } catch (_e) {}
}

function signIn() {
  if (state.loginURL) location.href = state.loginURL
}

async function signOut() {
  if (!state.logoutURL) return
  try {
    await fetch(state.logoutURL, { method: 'POST', headers: { accept: 'application/json' } })
  } catch (_e) {
    chrome.toast('Could not sign out while offline.')
    return
  }
  location.reload()
}

window.addEventListener('online', () => start())
start()

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
