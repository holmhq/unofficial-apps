// Release check for Kalendar's time maths (not deployed):
//   node tools/check.mjs
// The server has no Intl, so it turns weekly hours into real times with an
// offset table the host's browser builds (web/src/zones.js). This builds
// tables with Node's Intl, runs the server's slot engine (api/slots.js) and
// checks every slot against Intl: right wall-clock time, nothing in a clock
// gap, nothing doubled in a repeated hour. It also checks the calendar file
// and the invites in booking emails (ICS_OUT=<dir> writes them out too).

import assert from 'node:assert/strict'
import { offsetTable, offsetIn } from '../web/src/zones.js'
import { slotsFor } from '../api/slots.js'
import { toUtc, offsetAt, clockRange, longDate, parts } from '../api/tz.js'
import { calendar } from '../api/ics.js'
import { cleanTag } from '../api/lib.js'
import { guestInvite, hostInvite } from '../api/bookings.js'
import { inviteeMail, hostMail, guestMail, verifyMail, senderOf } from '../api/mail.js'
import { mailbox, THEMES, coverKey } from '../api/hosts.js'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

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

// Booking emails carry an invite Holm's email.send takes: one VCALENDAR whose
// METHOD matches, a UID on each VEVENT, a mailto ORGANIZER for REQUEST and
// CANCEL, no control characters, under 64 KiB. Requests carry none, and a
// move keeps the event's UID one version on. The host's copy comes from
// Kalendar's sender, already accepted, under a UID of its own.
{
  const host = { name: 'Avery "AC" Chen, Studio', email: 'avery@example.com', handle: 'avery' }
  const b = {
    id: 'bk1', start: Date.UTC(2026, 10, 2, 9), end: Date.UTC(2026, 10, 2, 9, 30), eventTitle: 'Intro; call', name: 'Bo, Ito', email: 'bo@example.org',
    status: 'confirmed', sequence: 0, notes: 'Hi\tthere\r\nsecond\u0007 line', location: { kind: 'video', value: 'https://meet.example.com/x' }, createdAt: 0
  }
  const base = 'https://kalendar.example.com'
  const check = (invite, method, organizer = 'avery@example.com') => {
    const { ics } = invite
    assert.equal(invite.method, method)
    assert.ok(Buffer.byteLength(ics) <= 65536)
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(ics), 'control characters')
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`)
    // Unfolded, with plain line ends.
    const flat = ics.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n')
    assert.equal(flat.match(/^BEGIN:VCALENDAR$/gm).length, 1)
    assert.deepEqual(flat.match(/^METHOD:.*$/gm), [`METHOD:${method}`])
    const events = flat.split('BEGIN:VEVENT').slice(1)
    assert.ok(events.length >= 1)
    for (const e of events) {
      assert.match(e, /^UID:.+@kalendar\.example\.com$/m)
      if (method !== 'PUBLISH') assert.ok(e.includes(`":mailto:${organizer}\n`) && /^ORGANIZER;CN="[^"]*":mailto:/m.test(e), 'organizer')
      else assert.doesNotMatch(e, /^ORGANIZER/m)
    }
    return flat
  }
  // Holm reports its sender as `Name <address>` or the bare address.
  const sender = senderOf('Kalendar <kalendar-example@example.net>')
  assert.deepEqual(sender, { name: 'Kalendar', email: 'kalendar-example@example.net' })
  assert.deepEqual(senderOf('"Kal, Endar" <k@example.net>'), { name: 'Kal, Endar', email: 'k@example.net' })
  assert.deepEqual(senderOf('k@example.net'), { name: 'Kalendar', email: 'k@example.net' })
  for (const bad of [undefined, '', 'Kalendar', 'a b@c', '<x@y> z']) assert.equal(senderOf(bad), null)
  const out = process.env.ICS_OUT
  const keep = (name, invite) => { if (out) writeFileSync(`${out}/${name}.${invite.method}.ics`, invite.ics) }
  for (const kind of ['confirmed', 'accepted', 'rescheduled']) {
    const flat = check(guestInvite(kind, b, host, base, `${base}/b/bk1?t=x`), 'REQUEST')
    assert.match(flat, /^ATTENDEE;CN="Bo, Ito";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:bo@example\.org$/m)
    keep(`guest-${kind}`, guestInvite(kind, b, host, base, `${base}/b/bk1?t=x`))
    check(hostInvite(kind, b, host, base), 'PUBLISH')
    const own = check(hostInvite(kind, b, host, base, sender), 'REQUEST', sender.email)
    assert.match(own, /^UID:bk1-host@kalendar\.example\.com$/m)
    assert.match(own, /^ATTENDEE;CN="Avery AC Chen, Studio";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:avery@example\.com$/m)
    keep(`host-${kind}`, hostInvite(kind, b, host, base, sender))
  }
  const gone = { ...b, status: 'cancelled', sequence: 1 }
  assert.match(check(guestInvite('cancelled', gone, host, base, null), 'CANCEL'), /^STATUS:CANCELLED$/m)
  assert.match(check(hostInvite('cancelled', gone, host, base), 'PUBLISH'), /^SEQUENCE:1$/m)
  assert.match(check(hostInvite('cancelled', gone, host, base, sender), 'CANCEL', sender.email), /^UID:bk1-host@/m)
  keep('guest-cancelled', guestInvite('cancelled', gone, host, base, null))
  keep('host-cancelled', hostInvite('cancelled', gone, host, base, sender))
  keep('host-published', hostInvite('confirmed', b, host, base))
  for (const kind of ['requested', 'declined', 'withdrawn']) assert.equal(guestInvite(kind, b, host, base, null), null)
  check(guestInvite('confirmed', b, { ...host, email: null }, base, null), 'PUBLISH')
  // A moved booking is the same calendar event, one version on.
  const movedTo = { ...b, id: 'bk2', uid: 'bk1', sequence: 1 }
  const flat = check(guestInvite('rescheduled', movedTo, host, base, null), 'REQUEST')
  assert.match(flat, /^UID:bk1@kalendar\.example\.com$/m)
  assert.match(flat, /^SEQUENCE:1$/m)
  const hostMoved = check(hostInvite('rescheduled', movedTo, host, base, sender), 'REQUEST', sender.email)
  assert.match(hostMoved, /^UID:bk1-host@kalendar\.example\.com$/m)
  assert.match(hostMoved, /^SEQUENCE:1$/m)
  // The invite adds it to the calendar, so the emails carry no web links to.
  const zone = { tzLabel: 'London', offset: 0, h24: false }
  const c = { b: { ...b, ...zone, duration: 30, slug: 'intro' }, host: { ...host, tzLabel: 'London' }, base, hostOffset: 0,
    links: { manage: `${base}/b/bk1?t=x`, reschedule: `${base}/r`, rebook: `${base}/@avery/intro`, dashboard: `${base}/`, review: `${base}/?r=bk1` } }
  // Each email wears its host's colour, on buttons and links and in dark
  // mode; one it doesn't know, or none, is red.
  for (const [theme, fill, on, text] of [['graphite', '#1d1d1f', '#ffffff', '#1d1d1f'], ['amber', '#f5a00a', '#1d1d1f', '#b25000'], ['nope', '#e0352b', '#ffffff', '#e0352b'], [undefined, '#e0352b', '#ffffff', '#e0352b']]) {
    const v = verifyMail({ base, host: { ...host, theme }, address: 'x@example.com', link: `${base}/c` }).html
    assert.ok(v.includes(`background:${fill};border-radius:13px`) && v.includes(`color:${on};text-decoration:none;">Confirm address`), `${theme} button`)
    const m = inviteeMail('confirmed', { ...c, host: { ...c.host, theme } }).html
    assert.ok(m.includes(`<a class="acc" href="${base}/r" style="color:${text};`), `${theme} links`)
    assert.match(m, /@media \(prefers-color-scheme: dark\)[^]*\.acc \{ color: #[0-9a-f]{6} !important; \}/, `${theme} dark links`)
  }
  for (const kind of ['confirmed', 'accepted', 'rescheduled']) {
    for (const mail of [inviteeMail(kind, c), hostMail(kind, c)]) {
      assert.doesNotMatch(mail.html + mail.text, /calendar\.google\.com|outlook\.live\.com|Add to your calendar|undefined/, kind)
    }
  }
  assert.match(hostMail('cancelled', { ...c, b: { ...c.b, cancelledBy: 'host' } }).subject, /^Cancelled: Bo, Ito/)
  assert.match(hostMail('cancelled', { ...c, b: { ...c.b, cancelledBy: 'host' } }).text, /^You cancelled Intro; call with Bo, Ito/)

  // Guests are on everyone's invite, without a name; theirs has no link to
  // change it. Booking email goes to a confirmed address the host picked.
  const party = { ...b, guests: ['cy@example.net', 'di@example.net'] }
  const all = check(guestInvite('confirmed', party, host, base, `${base}/b/bk1?t=x`), 'REQUEST')
  assert.match(all, /^ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:cy@example\.net$/m)
  assert.equal(all.match(/^ATTENDEE/gm).length, 3)
  assert.match(all, /Reschedule or cancel/)
  const theirs = check(guestInvite('confirmed', party, host, base, null), 'REQUEST')
  assert.doesNotMatch(theirs, /Reschedule or cancel|\?t=/)
  const gone1 = check(guestInvite('cancelled', party, host, base, null, 'di@example.net'), 'CANCEL')
  assert.deepEqual(gone1.match(/^ATTENDEE.*$/gm), ['ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:di@example.net'])
  // Off the list on a move: the booking still stands, the invite says cancelled.
  assert.match(check(guestInvite('cancelled', party, host, base, null, 'di@example.net'), 'CANCEL'), /^STATUS:CANCELLED$/m)
  assert.match(check(hostInvite('confirmed', party, host, base, sender), 'REQUEST', sender.email), /Guests: cy@example\.net\\, di@example\.net/)
  const picked = { ...host, addresses: [{ address: 'work@example.com', verified: true }, { address: 'new@example.com', verified: false }] }
  assert.equal(mailbox({ ...picked, sendTo: 'work@example.com' }), 'work@example.com')
  assert.equal(mailbox({ ...picked, sendTo: 'new@example.com' }), 'avery@example.com')
  assert.equal(mailbox({ ...picked, sendTo: 'gone@example.com' }), 'avery@example.com')
  check(guestInvite('confirmed', b, { ...picked, sendTo: 'work@example.com' }, base, null), 'REQUEST', 'work@example.com')
  const gc = { ...c, b: { ...c.b, guests: party.guests } }
  for (const kind of ['confirmed', 'rescheduled', 'cancelled']) {
    const mail = guestMail(kind, gc)
    assert.doesNotMatch(mail.html + mail.text, /\?t=|undefined|Reschedule<\/a>/, kind)
  }
  assert.match(guestMail('confirmed', gc).subject, /^Invitation: Intro; call with/)
  assert.match(guestMail('cancelled', { ...gc, removed: true }).text, /took you off the guest list/)
  assert.match(inviteeMail('confirmed', gc).text, /Guests: cy@example\.net, di@example\.net/)
}

// A cover's key follows what's drawn on it, and nothing else.
{
  const host = { handle: 'avery', name: 'Avery Chen', role: 'Designer', company: 'Northwind', theme: 'teal', picture: 'https://example.com/a.jpg', bio: 'Hi', weekly: [] }
  const key = coverKey(host)
  assert.match(key, /^[0-9a-f]{16}$/)
  for (const [field, value] of [['name', 'Avery C'], ['role', 'Writer'], ['company', ''], ['handle', 'avery2'], ['theme', 'blue'], ['picture', null]]) {
    assert.notEqual(coverKey({ ...host, [field]: value }), key, `cover key ignores ${field}`)
  }
  for (const [field, value] of [['bio', 'Hello'], ['place', 'Lisbon'], ['weekly', null], ['cover', key]]) {
    assert.equal(coverKey({ ...host, [field]: value }), key, `cover key follows ${field}`)
  }
  assert.equal(coverKey({ ...host, theme: 'nope' }), coverKey({ ...host, theme: undefined }), 'an unknown colour draws red')
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
  // Each colour has a tab icon, kept with the version, and the page's first
  // script knows every colour.
  const others = THEMES.filter((t) => t !== 'red')
  for (const t of others) for (const ext of ['svg', 'png']) assert.ok(listed.has(`/icons/${t}.${ext}`), `sw.js doesn't list /icons/${t}.${ext}`)
  const boot = readFileSync(new URL('index.html', web), 'utf8').match(/\^\(([a-z|]+)\)\$/)[1].split('|')
  assert.deepEqual(boot.sort(), [...others].sort(), 'index.html must know every colour')
}

console.log(`ok: ${checked} slots across ${ZONES.length} zones match Intl; weekly hours, paused days, busy times, tags, email dates, calendar files, email invites, cover keys, the app shell and its tab icons check out`)
