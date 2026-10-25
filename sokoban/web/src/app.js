// Sokoban — start-up. Applies the theme, mounts the chrome and the play
// screen, learns who is signed in, and keeps a signed-in member's solved
// levels in step with the server. Signed out, everything stays in this
// browser and the game needs no network at all.

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

const game = mountPlay(document.getElementById('play'), {
  hudSlot: chrome.hudSlot,
  openLevels: () => chrome.openLevels({ current: game.index, onPick: (i) => game.setLevel(i) }),
  openLeaderboard: () => chrome.openLeaderboard(),
  isSignedIn: () => !!state.me,
  isBlocked: () => chrome.isOpen(),
  signIn,
  toast: chrome.toast,
  onWin(level, result, isBest) {
    if (state.me && isBest) send([{ level: level.id, path: result.path }], { announce: true })
  }
})

// Sends solutions to the server, which replays each one before keeping it,
// and folds the member's bests from every device back into this one.
async function send(solutions, { announce = false } = {}) {
  try {
    const data = await api('/api/progress', { method: 'POST', body: JSON.stringify({ solutions }) })
    setOffline(false)
    if (prefs.merge(data.bests)) game.refresh()
    if (announce && data.board.improved) chrome.toast(`Saved: ${data.board.score.toLocaleString()} points on the leaderboard`)
    else if (!announce && data.saved.length) {
      chrome.toast(`${data.saved.length} solved ${data.saved.length === 1 ? 'level' : 'levels'} saved to your account`)
    }
    chrome.refreshBoard()
  } catch (e) {
    if (e.offline) setOffline(true)
    else if (e.status === 401) { state.me = null; chrome.refreshAccount() }
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
  // Sends every solve on this device; the server keeps only improvements.
  if (state.me) send(prefs.solutions())
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
