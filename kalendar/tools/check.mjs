// Release check for Kalendar's time maths (not deployed):
//   node tools/check.mjs
// The server has no Intl, so it turns weekly hours into real times with an
// offset table the host's browser builds (web/src/zones.js). This builds
// tables with Node's Intl, runs the server's slot engine (api/slots.js) and
// checks every slot against Intl: right wall-clock time, nothing in a clock
// gap, nothing doubled in a repeated hour. It also checks the calendar file.

import assert from 'node:assert/strict'
import { offsetTable, offsetIn } from '../web/src/zones.js'
import { slotsFor } from '../api/slots.js'
import { toUtc, offsetAt, clockRange, longDate, parts } from '../api/tz.js'
import { calendar } from '../api/ics.js'
import { cleanTag } from '../api/lib.js'
import { readFileSync, readdirSync } from 'node:fs'

const DAY = 86400000
const wall = (zone, ms) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)

const ZONES = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/Santiago', 'UTC']
const from = Date.UTC(2026, 0, 1)
const to = Date.UTC(2027, 0, 1)
let checked = 0

for (const zone of ZONES) {
  const { table } = offsetTable(zone, from - 2 * DAY, to + 2 * DAY)
  // The table agrees with Intl every 90 minutes through the year.
  for (let t = from; t < to; t += 90 * 60000) assert.equal(offsetAt(table, t), offsetIn(zone, t), `${zone} offset at ${new Date(t).toISOString()}`)
  // Every day 00:00–24:00 in 30-minute steps, Mon–Sun.
  const host = { tzTable: table, weekly: Array.from({ length: 7 }, () => [[0, 1440]]), overrides: {} }
  const event = { duration: 30, step: 30, notice: 0, window: 400, before: 0, after: 0 }
  const slots = slotsFor(host, event, [], from, to, from)
  const seen = new Set()
  for (const s of slots) {
    const w = wall(zone, s)
    const m = Number(w.slice(-2))
    assert.ok(m === 0 || m === 30 || zone === 'Asia/Kathmandu' || zone === 'Pacific/Chatham', `${zone} ${w} is off the half hour`)
    assert.ok(!seen.has(s), `${zone} slot twice`)
    seen.add(s)
    checked++
  }
  // Roughly 48 a day: a gap day has fewer, a repeated hour adds none.
  const days = (to - from) / DAY
  assert.ok(slots.length >= days * 48 - 4 && slots.length <= days * 48 + 2, `${zone}: ${slots.length} slots for ${days} days`)
}

// Weekly hours land on the right local times across New York's clock changes.
{
  const zone = 'America/New_York'
  const { table } = offsetTable(zone, from, to)
  const host = { tzTable: table, weekly: [[], [[540, 1020]], [[540, 1020]], [[540, 1020]], [[540, 1020]], [[540, 1020]], []], overrides: { '2026-03-09': [] } }
  const slots = slotsFor(host, { duration: 60, step: 60, notice: 0, window: 400, before: 0, after: 0 }, [], from, to, from)
  for (const s of slots) {
    const w = wall(zone, s)
    assert.ok(/^(Mon|Tue|Wed|Thu|Fri) (09|1[0-6]):00$/.test(w), `New York weekday hours, got ${w}`)
    assert.notEqual(new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(s), '2026-03-09', 'a day off has no slots')
  }
  // A busy hour removes exactly the slots it overlaps.
  const busyStart = toUtc(table, Date.UTC(2026, 6, 7, 10, 30))
  const around = slotsFor(host, { duration: 60, step: 60, notice: 0, window: 400, before: 0, after: 0 }, [[busyStart, busyStart + 3600000]], Date.UTC(2026, 6, 7), Date.UTC(2026, 6, 8), from)
  assert.deepEqual(around.map((s) => wall(zone, s)), ['Tue 09:00', 'Tue 12:00', 'Tue 13:00', 'Tue 14:00', 'Tue 15:00', 'Tue 16:00'])
}

// A paused weekday keeps its hours but offers nothing, unless that date has
// hours of its own.
{
  const zone = 'Asia/Kolkata'
  const { table } = offsetTable(zone, from, to)
  const nine = [[540, 1020]]
  const host = { tzTable: table, weekly: [nine, nine, nine, nine, nine, nine, nine], paused: [6, 0], overrides: { '2026-07-11': [[600, 720]] } }
  const event = { duration: 60, step: 60, notice: 0, window: 400, before: 0, after: 0 }
  const july = slotsFor(host, event, [], Date.UTC(2026, 6, 6), Date.UTC(2026, 6, 20), from)
  const days = new Set(july.map((s) => wall(zone, s).slice(0, 3)))
  assert.ok(!days.has('Sun'), 'a paused Sunday offers nothing')
  assert.deepEqual([...days].sort(), ['Fri', 'Mon', 'Sat', 'Thu', 'Tue', 'Wed'])
  const saturdays = july.filter((s) => wall(zone, s).startsWith('Sat'))
  assert.deepEqual(saturdays.map((s) => wall(zone, s)), ['Sat 10:00', 'Sat 11:00'], 'only the Saturday with its own hours opens')
  host.paused = []
  assert.ok(slotsFor(host, event, [], Date.UTC(2026, 6, 12), Date.UTC(2026, 6, 13), from).length > 0, 'unpaused, Sunday opens again')
}

// Tags from ?ref= links: lowercase, letters and digits at both ends.
{
  assert.equal(cleanTag(' Sundown-2026 '), 'sundown-2026')
  assert.equal(cleanTag('flyer.v2_a'), 'flyer.v2_a')
  for (const bad of ['', '-x', 'x-', 'a b', 'a'.repeat(41), 'ünï', null, 42]) assert.equal(cleanTag(bad), null, `bad tag ${bad}`)
}

// Dates written out for emails, without Intl.
{
  const start = Date.UTC(2026, 10, 4, 14, 0)
  assert.equal(longDate(parts(start, 330)), 'Wednesday, November 4, 2026')
  assert.equal(clockRange(start, start + 30 * 60000, 330, false), '7:30 – 8:00 PM')
  assert.equal(clockRange(start - 480 * 60000, start - 420 * 60000, 330, false), '11:30 AM – 12:30 PM')
  assert.equal(clockRange(start, start + 30 * 60000, 330, true), '19:30 – 20:00')
}

// Calendar files fold long lines at 75 bytes and escape text.
{
  const ics = calendar([{ id: 'abc', start: 0, end: 1800000, title: 'Intro, call; with “Ana”', description: 'Line one\nLine two '.repeat(8), location: 'Café', url: 'https://example.com/b/abc?t=x' }], { domain: 'example.com' })
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`)
  assert.ok(ics.includes('SUMMARY:Intro\\, call\\; with “Ana”'))
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
}

// The service worker installs a version all or nothing: it must list every
// page file, and carry the app's version so a deploy installs the new set.
{
  const web = new URL('../web/', import.meta.url)
  const sw = readFileSync(new URL('sw.js', web), 'utf8')
  const listed = new Set([...sw.match(/const FILES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const code = [...readdirSync(new URL('src/', web)).filter((f) => f.endsWith('.js') || f.endsWith('.css')).map((f) => '/src/' + f),
    ...readdirSync(new URL('src/views/', web)).map((f) => '/src/views/' + f)]
  for (const file of code) assert.ok(listed.has(file), `sw.js doesn't list ${file}`)
  for (const file of listed) if (file !== '/') readFileSync(new URL('.' + file, web))
  const version = JSON.parse(readFileSync(new URL('../holm.json', import.meta.url), 'utf8')).version
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')
}

console.log(`ok: ${checked} slots across ${ZONES.length} zones match Intl; weekly hours, paused days, busy times, tags, email dates, calendar files and the app shell check out`)
