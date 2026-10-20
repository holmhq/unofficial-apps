// overlap: find the time that works for everyone.
//
// A signed-in organiser creates a plan: a few dates and a daily time window.
// Anyone with the link adds the times they are free, with just a name; the
// browser keeps a private key for editing them later. Every change is
// broadcast on the plan's realtime channel, so open pages update live.

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (status, error) => json({ error }, status)

const SLUG = /^[a-z2-9]{10}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/
const STEPS = [15, 30, 60]
const MAX_DAYS = 14
const MAX_PEOPLE = 100
const MAX_PLANS = 200
const COLORS = 12
const DAY_MS = 86_400_000

const channel = slug => `plan-${slug}`

// Plain text: no control characters, collapsed spaces, bounded length.
const clean = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

function randomSlug() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), b => alphabet[b % alphabet.length]).join('')
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

const isDay = day => DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
const slotCount = plan => plan.days.length * ((plan.end - plan.start) / plan.step)

// Checks a new plan's settings and returns them, or a sentence for the person.
function readPlan(input) {
  const title = clean(input.title, 80)
  if (!title) return { error: 'Give the plan a name.' }
  const note = clean(input.note, 280)
  const today = Date.now()
  const days = [...new Set((Array.isArray(input.days) ? input.days : []).map(String))]
    .filter(day => isDay(day))
    .filter(day => {
      const t = Date.parse(`${day}T00:00:00Z`)
      return t >= today - 2 * DAY_MS && t <= today + 400 * DAY_MS
    })
    .sort()
  if (!days.length) return { error: 'Pick at least one date.' }
  if (days.length > MAX_DAYS) return { error: `Pick at most ${MAX_DAYS} dates.` }
  const step = Number(input.step)
  if (!STEPS.includes(step)) return { error: 'Slots are 15, 30 or 60 minutes.' }
  const start = Number(input.start)
  const end = Number(input.end)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || start >= end ||
      start % step || end % step) return { error: 'Choose a time window that fits the slot length.' }
  const tz = ZONE.test(String(input.tz || '')) ? String(input.tz) : 'UTC'
  return { plan: { title, note, days, start, end, step, tz } }
}

const planDTO = (plan, member, extra = {}) => ({
  slug: plan.slug, title: plan.title, note: plan.note, ownerName: plan.ownerName,
  ownerPicture: plan.ownerPicture || null, tz: plan.tz, days: plan.days, start: plan.start,
  end: plan.end, step: plan.step, final: plan.final || null, created: plan._createdAt,
  mine: !!member && member.id === plan.ownerId, ...extra
})

const personDTO = (person, member) => ({
  id: person.id, name: person.name, slots: person.slots, color: person.color,
  picture: person.picture || null, member: !!person.memberId,
  me: !!member && person.memberId === member.id, updated: person._updatedAt
})

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    const { app, auth, realtime } = env.holm
    const { ds, kv } = app
    const member = auth.getMember()

    const tell = (slug, message) => {
      try { realtime.broadcast(channel(slug), message) } catch (e) { env.holm.log.warn(`broadcast: ${e}`) }
    }
    const findPlan = slug => (SLUG.test(slug) ? ds.find('plans', { slug }, { limit: 1 })[0] : null) || null
    const people = plan => ds.find('people', { planId: plan.id }, { limit: MAX_PEOPLE, order: 'asc' })
    const body = async () => { try { return await request.json() } catch { return null } }

    // A person's edits need the key the browser was given when they joined,
    // their own sign-in, or the organiser's.
    const mayEdit = async (plan, person) => {
      if (member && (person.memberId === member.id || plan.ownerId === member.id)) return true
      const key = request.headers.get('X-Overlap-Key')
      return !!key && !!person.keyHash && (await sha256(key)) === person.keyHash
    }

    if (path === '/api/me' && method === 'GET') {
      const next = url.searchParams.get('next') || '/'
      return json({
        member: member && { id: member.id, name: member.name || '', email: member.email || '', picture: member.picture || null },
        loginURL: auth.getLoginURL(next.startsWith('/') && !next.startsWith('//') ? next : '/'),
        logoutURL: auth.getLogoutURL()
      })
    }

    if (path === '/api/plans' && method === 'GET') {
      if (!member) return fail(401, 'Sign in to see your plans.')
      const owned = ds.find('plans', { ownerId: member.id }, { limit: 50, order: 'desc' })
      const joined = ds.find('people', { memberId: member.id }, { limit: 50, order: 'desc' })
        .map(person => ds.findOne('plans', person.planId))
        .filter(plan => plan && plan.ownerId !== member.id)
      const withCount = plan => planDTO(plan, member, { people: ds.count('people', { planId: plan.id }) })
      return json({ owned: owned.map(withCount), joined: joined.map(withCount) })
    }

    if (path === '/api/plans' && method === 'POST') {
      if (!member) return fail(401, 'Sign in to start a plan.')
      if (ds.count('plans', { ownerId: member.id }) >= MAX_PLANS) return fail(429, 'You have too many plans. Delete an old one first.')
      const input = await body()
      if (!input) return fail(400, 'Send the plan as JSON.')
      const { plan, error } = readPlan(input)
      if (error) return fail(400, error)
      const slug = randomSlug()
      const id = ds.insert('plans', {
        ...plan, slug, ownerId: member.id, ownerName: clean(member.name || 'The organiser', 60),
        ownerPicture: member.picture || null, final: null
      })
      return json({ plan: planDTO(ds.findOne('plans', id), member) }, 201)
    }

    const match = /^\/api\/plans\/([^/]+)(\/.*)?$/.exec(path)
    if (match) {
      const plan = findPlan(match[1])
      if (!plan) return fail(404, 'This plan does not exist, or it was deleted.')
      const rest = match[2] || ''
      const owner = !!member && member.id === plan.ownerId

      if (rest === '' && method === 'GET') {
        let watching = 0
        try { watching = realtime.count(channel(plan.slug)) } catch {}
        return json({ plan: planDTO(plan, member, { watching }), people: people(plan).map(p => personDTO(p, member)) })
      }

      if (rest === '' && method === 'PATCH') {
        if (!owner) return fail(403, 'Only the organiser can change this plan.')
        const input = await body()
        if (!input) return fail(400, 'Send the change as JSON.')
        const set = {}
        if ('title' in input) {
          set.title = clean(input.title, 80)
          if (!set.title) return fail(400, 'Give the plan a name.')
        }
        if ('note' in input) set.note = clean(input.note, 280)
        if ('final' in input) {
          const f = input.final
          if (f === null) set.final = null
          else {
            const perDay = (plan.end - plan.start) / plan.step
            const day = Number(f?.day), from = Number(f?.from), to = Number(f?.to)
            if (![day, from, to].every(Number.isInteger) || day < 0 || day >= plan.days.length ||
                from < 0 || to > perDay || from >= to) return fail(400, 'That time is not in this plan.')
            set.final = { day, from, to }
          }
        }
        ds.update('plans', { id: plan.id }, { $set: set })
        const updated = planDTO(ds.findOne('plans', plan.id), member)
        tell(plan.slug, { t: 'plan', plan: { ...updated, mine: false } })
        return json({ plan: updated })
      }

      if (rest === '' && method === 'DELETE') {
        if (!owner) return fail(403, 'Only the organiser can delete this plan.')
        ds.transaction(tx => {
          tx.delete('people', { planId: plan.id })
          tx.delete('plans', { id: plan.id })
        })
        tell(plan.slug, { t: 'deleted' })
        return new Response(null, { status: 204 })
      }

      if (rest === '/people' && method === 'POST') {
        if (member) {
          const existing = ds.find('people', { planId: plan.id, memberId: member.id }, { limit: 1 })[0]
          if (existing) return json({ person: personDTO(existing, member) })
        }
        const input = (await body()) || {}
        const name = clean(input.name || member?.name || '', 40)
        if (!name) return fail(400, 'Tell everyone your name.')
        const everyone = people(plan)
        if (everyone.length >= MAX_PEOPLE) return fail(409, 'This plan is full.')
        const taken = new Set(everyone.map(p => p.color))
        const color = Array.from({ length: COLORS }, (_, i) => (everyone.length + i) % COLORS).find(c => !taken.has(c)) ?? everyone.length % COLORS
        const key = crypto.randomUUID()
        const id = ds.insert('people', {
          planId: plan.id, name, color, slots: '0'.repeat(slotCount(plan)),
          memberId: member?.id || null, picture: member?.picture || null, keyHash: await sha256(key)
        })
        const person = personDTO(ds.findOne('people', id), member)
        tell(plan.slug, { t: 'person', person: { ...person, me: false } })
        return json({ person, key }, 201)
      }

      const personMatch = /^\/people\/([^/]+)$/.exec(rest)
      if (personMatch) {
        const person = ds.findOne('people', personMatch[1])
        if (!person || person.planId !== plan.id) return fail(404, 'That person is not in this plan.')
        if (!(await mayEdit(plan, person))) return fail(403, 'You can only change your own times.')

        if (method === 'PUT') {
          const input = await body()
          if (!input) return fail(400, 'Send the times as JSON.')
          const set = {}
          if ('name' in input) {
            set.name = clean(input.name, 40)
            if (!set.name) return fail(400, 'Tell everyone your name.')
          }
          if ('slots' in input) {
            const slots = String(input.slots)
            if (slots.length !== slotCount(plan) || /[^01]/.test(slots)) return fail(400, 'Those times do not fit this plan.')
            set.slots = slots
          }
          ds.update('people', { id: person.id }, { $set: set })
          const updated = personDTO(ds.findOne('people', person.id), member)
          tell(plan.slug, { t: 'person', person: { ...updated, me: false }, by: clean(input.sid, 40) })
          return json({ person: updated })
        }

        if (method === 'DELETE') {
          ds.delete('people', { id: person.id })
          tell(plan.slug, { t: 'gone', id: person.id })
          return new Response(null, { status: 204 })
        }
      }

      // Presence: who has the page open right now. Nothing is stored beyond a
      // few seconds of de-duplication.
      if (rest === '/here' && method === 'POST') {
        const input = (await body()) || {}
        const sid = clean(input.sid, 40)
        if (!/^[A-Za-z0-9-]{8,40}$/.test(sid)) return fail(400, 'Bad session.')
        const name = clean(input.name, 40)
        const color = Number.isInteger(input.color) ? Math.abs(input.color) % COLORS : -1
        const leaving = input.leaving === true
        const seen = `here:${plan.slug}:${sid}`
        const stamp = `${name}|${color}|${leaving}`
        if (kv.get(seen) !== stamp) {
          kv.set(seen, stamp, 4000)
          tell(plan.slug, { t: 'here', sid, name, color, leaving })
        }
        return new Response(null, { status: 204 })
      }

      return fail(405, 'Not allowed.')
    }

    if (path.startsWith('/api/')) return fail(404, 'Not found.')

    // A plan's page is the app itself, with its name in the title and link
    // previews, and kept out of search engines.
    const page = /^\/p\/([^/]+)$/.exec(path)
    if (page && method === 'GET') {
      const plan = findPlan(page[1])
      const shell = await env.holm.web.fetch(new Request(new URL('/', request.url)))
      let html = await shell.text()
      if (plan) {
        const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
        const title = escape(`${plan.title} · overlap`)
        const description = escape(plan.note || `${plan.ownerName} is finding a time that works for everyone. Add yours.`)
        const link = escape(`${url.origin}/p/${plan.slug}`)
        html = html
          .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
          .replace(/<link rel="canonical"[^>]*>\s*/g, '')
          .replace(/<meta (?:name="description"|property="og:(?:title|description|url)")[^>]*>\s*/g, '')
          .replace('</head>', () => `<meta name="robots" content="noindex">\n<meta name="description" content="${description}">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${description}">\n<meta property="og:url" content="${link}">\n</head>`)
      }
      const headers = new Headers(shell.headers)
      headers.delete('Content-Length')
      headers.set('Cache-Control', 'no-store')
      return new Response(html, { status: plan ? 200 : 404, headers })
    }

    return env.holm.web.fetch(request)
  }
}
