// Book sample meetings through Kalendar's real bookings.create operation,
// solving Holm's challenge here, for testing and store screenshots.
//
//   node tools/book.mjs <origin> <handle> [count] [--host Host-header]
//
// Invitees are made up and use example.com addresses, so no real person is
// emailed. Each takes the next open time a few days apart.
import { createHash } from 'node:crypto'

const [origin, handle, countArg = '6'] = process.argv.slice(2)
const hostHeader = process.argv.includes('--host') ? process.argv[process.argv.indexOf('--host') + 1] : null
if (!origin || !handle) {
  console.error('usage: node tools/book.mjs <origin> <handle> [count] [--host Host-header]')
  process.exit(1)
}
const headers = hostHeader ? { host: hostHeader } : {}

const PEOPLE = [
  ['Maya Lindqvist', 'Can we go over the onboarding flow? I have a few screens to show.'],
  ['Jonah Park', ''],
  ['Priya Raman', 'Following up on the proposal from last week.'],
  ['Leo Martins', 'Quick intro: we met at the design meetup.'],
  ['Hana Sato', ''],
  ['Noah Fischer', 'Pricing questions for a team of 12.'],
  ['Ava Brooks', ''],
  ['Elena Rossi', 'Would love feedback on our pitch deck.']
]

async function get(path) {
  const r = await fetch(origin + path, { headers })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

function solve({ challenge, bits, parts }) {
  const nonces = []
  for (let part = 0; part < parts; part++) {
    for (let n = 0; ; n++) {
      const d = createHash('sha256').update(`${challenge}:${part}:${n}`).digest()
      let ok = true
      let b = bits
      let i = 0
      for (; b >= 8; b -= 8) if (d[i++] !== 0) { ok = false; break }
      if (ok && b && d[i] >> (8 - b) !== 0) ok = false
      if (ok) { nonces.push(n); break }
    }
  }
  return { 'Holm-Challenge': challenge, 'Holm-Challenge-Solution': nonces.join(',') }
}

const page = await get(`/api/u/${handle}`)
const now = Date.now()
let made = 0
for (let i = 0; made < Number(countArg) && i < PEOPLE.length * 3; i++) {
  const event = page.events[i % page.events.length]
  const { slots } = await get(`/api/u/${handle}/${event.slug}/slots?from=${now}&to=${now + 21 * 86400000}`)
  if (!slots.length) continue
  const start = slots[Math.min(slots.length - 1, Math.floor(slots.length * ((made * 0.13 + 0.02) % 1)))]
  const [name, notes] = PEOPLE[made % PEOPLE.length]
  const proof = solve(await get('/_holm/challenge?operation=bookings.create'))
  const body = {
    handle, event: event.slug, start, name, notes,
    email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
    tz: 'Europe/London', tzLabel: 'Greenwich Mean Time', offset: 0
  }
  const r = await fetch(origin + '/api/bookings.create', { method: 'POST', headers: { ...headers, ...proof, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const out = await r.json().catch(() => null)
  if (!r.ok) { console.error(r.status, JSON.stringify(out)); continue }
  made++
  console.log(`${name} · ${event.title} · ${new Date(start).toISOString()} · emailed ${JSON.stringify(out.emailed)} · ${origin}/b/${out.booking.id}?t=${out.token}`)
}
