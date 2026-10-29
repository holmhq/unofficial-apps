// A host's stats: who opens their page, from where, on what, and for how long.
// No cookies and no addresses: a random id kept in this browser tells one
// visitor from another, the place is the visitor's time zone, and nothing is
// sent when the browser asks not to be tracked. The host's own visits don't count.
import { state } from './shell.js'
import { here } from './zones.js'

const ID = 'kalendar:visitor'
const SOURCE = 'kalendar:source'

const quiet = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'

function visitor() {
  try {
    let v = localStorage.getItem(ID)
    if (!v || !/^[a-z0-9]{16,40}$/.test(v)) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      v = [...bytes].map((b) => (b % 36).toString(36)).join('') + Date.now().toString(36)
      localStorage.setItem(ID, v.slice(0, 40))
    }
    return localStorage.getItem(ID)
  } catch { return null }
}

function device() {
  const ua = navigator.userAgent || ''
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Android/.test(ua) && !/Mobi/.test(ua))) return 'tablet'
  if ((navigator.userAgentData && navigator.userAgentData.mobile) || /Mobi|iPhone|iPod|Android/i.test(ua)) return 'phone'
  return 'desktop'
}

// Where this visit came from: a ?ref= or utm_source, else the referring
// site, else "direct". Kept for the visit, so later pages carry it too.
function source() {
  try {
    const saved = sessionStorage.getItem(SOURCE)
    if (saved) return saved
    const params = new URLSearchParams(location.search)
    let s = params.get('ref') || params.get('utm_source') || ''
    if (!s && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\.|^m\.|^l\./, '')
      if (host && host !== location.hostname) s = host === 't.co' ? 'x.com' : host === 'lnkd.in' ? 'linkedin.com' : host
    }
    s = (s || 'direct').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 60) || 'direct'
    sessionStorage.setItem(SOURCE, s)
    return s
  } catch { return 'direct' }
}

const mine = (handle) => !!(state.me && state.me.host && state.me.host.handle === handle)

function send(body) {
  const data = JSON.stringify(body)
  try {
    if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([data], { type: 'text/plain' }))) return
  } catch {}
  fetch('/api/hit', { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {})
}

// One page: its view now, then how long it was looked at when it's left.
export function page(handle, { event = null } = {}) {
  if (quiet() || mine(handle)) return { click() {}, pick() {}, leave() {} }
  const v = visitor()
  if (!v) return { click() {}, pick() {}, leave() {} }
  const base = { h: handle, v, ...(event ? { e: event } : {}), p: event ? 'event' : 'profile' }
  send({ ...base, k: 'view', ref: source(), tz: here(), d: device() })
  let shown = document.visibilityState === 'visible' ? performance.now() : null
  let total = 0
  let picked = false
  let done = false
  const onVis = () => {
    if (document.visibilityState === 'hidden') { if (shown !== null) total += performance.now() - shown; shown = null; flush(false) } else shown = performance.now()
  }
  const flush = (final) => {
    if (done) return
    const ms = Math.round(total + (shown !== null ? performance.now() - shown : 0))
    if (ms < 500) return
    if (final) done = true
    total = 0
    if (shown !== null) shown = performance.now()
    send({ ...base, k: 'leave', ms })
  }
  addEventListener('visibilitychange', onVis)
  addEventListener('pagehide', () => flush(true), { once: true })
  return {
    click(target) { send({ ...base, k: 'click', t: target }) },
    pick() { if (!picked) { picked = true; send({ ...base, k: 'pick' }) } },
    leave() { removeEventListener('visibilitychange', onVis); flush(true) }
  }
}
