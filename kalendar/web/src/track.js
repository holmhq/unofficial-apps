// A host's stats: who opens their page, from where, on what, and for how long.
// No cookies and no addresses: a random id kept in this browser tells one
// visitor from another, the place is the visitor's time zone, and nothing is
// sent when the browser asks not to be tracked. The host's own visits don't count.
//
// Two answers to "from where": the site that linked here (the referrer), and
// the tag of one of the host's tracked links — /@avery?ref=sundown-2026, or
// #ref=, or utm_campaign — with &via=qr when it was a scanned code. The tag
// is kept here for 30 days, so a booking made on a later visit still counts
// for the link that brought them, and it's taken off the address so a guest
// who passes the page on doesn't pass it on too.
import { state } from './shell.js'
import { here } from './zones.js'

const ID = 'kalendar:visitor'
const SOURCE = 'kalendar:source'
const TAGS = 'kalendar:tags'
const KEEP = 30 * 86400000
const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

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

// Where this visit came from: a utm_source that names a site, else the
// referring site, else "direct". Kept for the visit, so later pages carry it too.
function source() {
  try {
    const saved = sessionStorage.getItem(SOURCE)
    if (saved) return saved
    const params = new URLSearchParams(location.search)
    let s = (params.get('utm_source') || '').toLowerCase()
    if (!DOMAIN.test(s)) s = ''
    if (!s && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\.|^m\.|^l\./, '')
      if (host && host !== location.hostname) s = host === 't.co' ? 'x.com' : host === 'lnkd.in' ? 'linkedin.com' : host
    }
    s = (s || 'direct').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 60) || 'direct'
    sessionStorage.setItem(SOURCE, s)
    return s
  } catch { return 'direct' }
}

const clean = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 40).replace(/[-._]+$/, '')

let scanned = false

// Read a tag off the address (query or hash), keep it for this host, and
// take it off the address bar. Runs once per page that a guest lands on.
function readTag(handle) {
  const params = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const utm = params.get('utm_source') || ''
  const raw = params.get('ref') || hash.get('ref') || params.get('utm_campaign') || (utm && !DOMAIN.test(utm.toLowerCase()) ? utm : '')
  const via = (params.get('via') || hash.get('via') || '').toLowerCase()
  const tag = clean(raw)
  // A browser that asks not to be tracked keeps no tag either.
  if (TAG.test(tag) && !quiet()) {
    scanned = via === 'qr'
    try {
      const all = JSON.parse(localStorage.getItem(TAGS) || '{}')
      all[handle.toLowerCase()] = { tag, at: Date.now() }
      localStorage.setItem(TAGS, JSON.stringify(all))
    } catch {}
  }
  if (params.has('ref') || params.has('via') || params.has('utm_campaign') || params.has('utm_source') || params.has('utm_medium') || params.has('utm_content') || hash.has('ref')) {
    for (const k of ['ref', 'via', 'utm_campaign', 'utm_source', 'utm_medium', 'utm_content', 'utm_term']) params.delete(k)
    const q = params.toString()
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + (hash.has('ref') ? '' : location.hash))
  }
}

// The tag that brought this guest to this host, if it's recent.
export function tag(handle) {
  if (quiet()) return null
  try {
    const kept = JSON.parse(localStorage.getItem(TAGS) || '{}')[String(handle).toLowerCase()]
    return kept && Date.now() - kept.at < KEEP && TAG.test(kept.tag) ? kept.tag : null
  } catch { return null }
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
  readTag(handle)
  if (quiet() || mine(handle)) return { click() {}, pick() {}, leave() {} }
  const v = visitor()
  if (!v) return { click() {}, pick() {}, leave() {} }
  const g = tag(handle)
  const base = { h: handle, v, ...(event ? { e: event } : {}), p: event ? 'event' : 'profile', ...(g ? { g } : {}) }
  send({ ...base, k: 'view', ref: source(), tz: here(), d: device(), ...(scanned ? { w: 'qr' } : {}) })
  scanned = false
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
