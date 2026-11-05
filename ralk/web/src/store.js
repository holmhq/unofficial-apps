// What the page last saw from the server, kept in this browser so the page draws at once
// and then catches up, the way an app on a phone opens on what it showed last time: who's
// signed in, the sound catalog, and the person's latest notifications (kept under their
// address, so someone else signing in here never sees them). Signing out forgets it all.

const PREFIX = 'ralk:c:'

export function peek(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : undefined
  } catch { return undefined }
}

// Keep a fresh answer. Says whether it differs from what was kept.
export function keep(key, value) {
  const raw = JSON.stringify(value)
  try {
    if (localStorage.getItem(PREFIX + key) === raw) return false
    localStorage.setItem(PREFIX + key, raw)
  } catch {}
  return true
}

export function forget() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k)
    }
  } catch {}
}
