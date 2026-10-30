// iCalendar files (RFC 5545): one booking for the invitee's "Add to
// calendar", the host's private feed of every booking, and the invite that
// rides in each booking email (RFC 5546: REQUEST, CANCEL or PUBLISH). Plus
// the links Google Calendar and Outlook.com open to add an event.

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// Text drops control characters other than tabs and line ends, which
// become \n.
const escapeText = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

// A parameter value, such as a name: quoted, with no quotes or control
// characters inside.
const param = (value) => '"' + String(value ?? '').replace(/[\x00-\x1f\x7f"]/g, '').trim() + '"'

// Lines longer than 75 bytes continue on the next line after a space.
function fold(line) {
  let out = ''
  let bytes = 0
  for (const ch of line) {
    const cp = ch.codePointAt(0)
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    if (bytes + size > 74) {
      out += '\r\n '
      bytes = 1
    }
    out += ch
    bytes += size
  }
  return out
}

function vevent(e, domain) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.id}@${domain}`,
    `DTSTAMP:${stamp(e.updated || Date.now())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    e.description ? `DESCRIPTION:${escapeText(e.description)}` : null,
    e.location ? `LOCATION:${escapeText(e.location)}` : null,
    e.url ? `URL:${e.url}` : null,
    e.organizer ? `ORGANIZER;CN=${param(e.organizer.name)}:mailto:${e.organizer.email}` : null,
    ...(e.attendees || []).map((a) => `ATTENDEE${a.name ? `;CN=${param(a.name)}` : ''};ROLE=REQ-PARTICIPANT;${a.accepted ? 'PARTSTAT=ACCEPTED;RSVP=FALSE' : 'PARTSTAT=NEEDS-ACTION;RSVP=TRUE'}:mailto:${a.email}`),
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${e.sequence || 0}`,
    'TRANSP:OPAQUE'
  ]
  if (!e.cancelled) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT10M', 'END:VALARM')
  lines.push('END:VEVENT')
  return lines.filter(Boolean)
}

export function calendar(events, { domain, name = null, method = 'PUBLISH' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kalendar//Holm//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`]
  if (name) lines.push(`X-WR-CALNAME:${escapeText(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H')
  for (const e of events) lines.push(...vevent(e, domain))
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function icsResponse(body, filename) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

const q = (params) => Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

export function googleLink(e) {
  return 'https://calendar.google.com/calendar/render?' + q({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}`, details: e.description, location: e.location })
}

export function outlookLink(e) {
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return 'https://outlook.live.com/calendar/0/deeplink/compose?' + q({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title, startdt: iso(e.start), enddt: iso(e.end), body: e.description, location: e.location })
}
