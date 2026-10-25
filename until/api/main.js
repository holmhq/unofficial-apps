// Until: count down the days to anything, and rate each day as it passes.
//
// Signed-out visitors keep their trackers in the browser. Signed-in members
// keep them here, in their own document store, so they follow them to every
// device; a browser hands its trackers over once with /api/import-local.

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (status, error) => json({ error }, status)

const MAX_TRACKERS = 500
const MAX_DAYS = 36525 // about a hundred years
const DAY_MS = 86_400_000
const ICONS = ['CalendarDays', 'Flag', 'Gift', 'Heart', 'Hourglass', 'Mountain', 'Plane', 'Rocket', 'Sparkles', 'Sprout', 'SunMedium', 'Waves']
const FAMILIES = ['garden', 'signal']
const APPEARANCES = ['system', 'light', 'dark']

// Plain text: no control characters, collapsed spaces, bounded length.
const clean = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

// Calendar days are 'YYYY-MM-DD' strings, counted in UTC so the server's own
// time zone never shifts them.
const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = day => typeof day === 'string' && DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)

// Ratings are 1 to 5 stars keyed by day, only for days inside the tracker.
function cleanRatings(input, startDate, targetDate) {
  const out = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const [day, raw] of Object.entries(input)) {
    const stars = Math.round(Number(raw))
    if (!isDay(day) || !(stars >= 1 && stars <= 5)) continue
    if (daysBetween(startDate, day) < 0 || daysBetween(day, targetDate) < 0) continue
    out[day] = stars
  }
  return out
}

// Checks a tracker's fields and returns them, or a sentence for the person.
// A tracker is a run of `count` days from `startDate`; `targetDate` is its
// last day and can stand in for `count`.
function readTracker(input) {
  const title = clean(input.title, 80)
  if (!title) return { error: 'Give the tracker a title.' }
  const startDate = input.startDate
  if (!isDay(startDate)) return { error: 'Pick a start date.' }
  let count = Math.floor(Number(input.count))
  if (!(count >= 1) && isDay(input.targetDate)) count = daysBetween(startDate, input.targetDate) + 1
  if (!(count >= 1)) return { error: 'The end comes before the start.' }
  if (count > MAX_DAYS) return { error: 'Keep it under a hundred years.' }
  const targetDate = addDays(startDate, count - 1)
  return {
    tracker: {
      title,
      subtitle: clean(input.subtitle, 120),
      icon: ICONS.includes(input.icon) ? input.icon : 'CalendarDays',
      startDate,
      count,
      targetDate,
      ratings: cleanRatings(input.ratings, startDate, targetDate),
      sourceLocalId: clean(input.sourceLocalId, 64) || null
    }
  }
}

const trackerDTO = doc => ({
  id: doc.id, title: doc.title, subtitle: doc.subtitle || '', icon: doc.icon,
  startDate: doc.startDate, count: doc.count, targetDate: doc.targetDate,
  ratings: doc.ratings || {}, sourceLocalId: doc.sourceLocalId || null,
  createdAt: doc.createdAt || null, updatedAt: doc.updatedAt || null
})

// Two trackers with the same title, subtitle and days are the same tracker.
const fingerprint = t => [t.title, t.subtitle, t.startDate, t.count].map(v => String(v ?? '').toLowerCase()).join('|')

function readSettings(input) {
  if (!input) return null
  return {
    themeFamily: FAMILIES.includes(input.themeFamily) ? input.themeFamily : 'garden',
    appearance: APPEARANCES.includes(input.appearance) ? input.appearance : 'system'
  }
}

async function readJSON(request) {
  try { return await request.json() } catch { return null }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    if (path !== '/api' && !path.startsWith('/api/')) return env.holm.web.fetch(request)

    const { auth } = env.holm
    const member = auth.getMember()

    if (path === '/api/health' && method === 'GET') return json({ ok: true })

    if (path === '/api/me' && method === 'GET') {
      const next = url.searchParams.get('next') || '/'
      return json({
        member: member && { name: member.name || '', email: member.email || '', picture: member.picture || null },
        loginURL: auth.getLoginURL(next.startsWith('/') && !next.startsWith('//') ? next : '/'),
        logoutURL: member ? auth.getLogoutURL() : null
      })
    }

    if (!member) return fail(401, 'Sign in to keep your trackers in your account.')
    const { ds, kv } = env.holm.app.member

    if (path === '/api/countdowns' && method === 'GET') {
      const docs = ds.find('countdowns', {}, { limit: MAX_TRACKERS, order: 'asc' })
      return json({ countdowns: docs.map(trackerDTO) })
    }

    if (path === '/api/countdowns' && method === 'POST') {
      const body = await readJSON(request)
      if (!body) return fail(400, 'Send the tracker as JSON.')
      const { tracker, error } = readTracker(body)
      if (error) return fail(400, error)
      // The browser names each new tracker, so a retry after a timeout finds
      // the first attempt instead of making a second copy.
      if (tracker.sourceLocalId) {
        const earlier = ds.findOne('countdowns', { sourceLocalId: tracker.sourceLocalId })
        if (earlier) return json({ countdown: trackerDTO(earlier) })
      }
      if (ds.count('countdowns', {}) >= MAX_TRACKERS) return fail(400, `You can keep up to ${MAX_TRACKERS} trackers.`)
      const now = new Date().toISOString()
      const doc = { ...tracker, createdAt: now, updatedAt: now }
      const id = ds.insert('countdowns', doc)
      return json({ countdown: trackerDTO({ ...doc, id }) })
    }

    const match = /^\/api\/countdowns\/([^/]+)$/.exec(path)
    if (match) {
      const id = decodeURIComponent(match[1])
      const current = ds.findOne('countdowns', { id })
      if (!current) return fail(404, 'That tracker is gone. It may have been deleted on another device.')

      if (method === 'PATCH') {
        const body = await readJSON(request)
        if (!body) return fail(400, 'Send the changes as JSON.')
        const merged = { ...trackerDTO(current), ...body }
        // A new start keeps the length; a target date sent without a count
        // sets the length instead.
        if (body.targetDate != null && body.count == null) delete merged.count
        else delete merged.targetDate
        const { tracker, error } = readTracker(merged)
        if (error) return fail(400, error)
        const next = { ...tracker, sourceLocalId: tracker.sourceLocalId || current.sourceLocalId || null, updatedAt: new Date().toISOString() }
        ds.update('countdowns', { id }, { $set: next })
        return json({ countdown: trackerDTO({ ...current, ...next, id }) })
      }

      if (method === 'DELETE') {
        ds.delete('countdowns', { id })
        return json({ ok: true })
      }
    }

    if (path === '/api/settings' && method === 'GET') {
      // Settings once lived in a 'settings' document; read it until replaced.
      const saved = kv.get('settings') ?? ds.findOne('settings', { id: 'preferences_v1' })
      return json({ settings: readSettings(saved) })
    }

    if (path === '/api/settings' && method === 'PATCH') {
      const settings = readSettings(await readJSON(request))
      if (!settings) return fail(400, 'Send the settings as JSON.')
      kv.set('settings', settings)
      return json({ settings })
    }

    if (path === '/api/import-local' && method === 'POST') {
      const body = await readJSON(request)
      const incoming = body && body.countdowns
      if (!Array.isArray(incoming)) return fail(400, 'Send { countdowns: [...] }.')
      const existing = ds.find('countdowns', {}, { limit: MAX_TRACKERS, order: 'asc' })
      const seenIds = new Set(existing.map(t => t.sourceLocalId).filter(Boolean))
      const seen = new Set(existing.map(fingerprint))
      let room = MAX_TRACKERS - existing.length
      // skipped: already in the account; full: no room left under the cap.
      const summary = { total: incoming.length, created: 0, skipped: 0, invalid: 0, full: 0 }
      const now = new Date().toISOString()
      const docs = []
      for (const raw of incoming.slice(0, MAX_TRACKERS)) {
        const { tracker } = readTracker({ ...raw, sourceLocalId: raw && (raw.sourceLocalId || raw.id) })
        if (!tracker) { summary.invalid++; continue }
        const key = fingerprint(tracker)
        if ((tracker.sourceLocalId && seenIds.has(tracker.sourceLocalId)) || seen.has(key)) { summary.skipped++; continue }
        if (room <= 0) { summary.full++; continue }
        seenIds.add(tracker.sourceLocalId)
        seen.add(key)
        room--
        docs.push({ ...tracker, createdAt: now, updatedAt: now })
      }
      ds.transaction(tx => { for (const doc of docs) tx.insert('countdowns', doc) })
      summary.created = docs.length
      return json({ summary })
    }

    return fail(404, 'No such route.')
  }
}
