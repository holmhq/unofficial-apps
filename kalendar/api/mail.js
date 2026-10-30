// The emails: a booking confirmed, cancelled or moved, and a request for
// other times sent, accepted, declined or withdrawn, to the person who
// booked and to the host. Tables and inline styles so they hold together in
// Gmail, Outlook and Apple Mail; Inter where the client loads web fonts;
// dark mode where it's supported. Each has a plain-text twin.
import { esc } from './lib.js'
import { parts, clockRange, longDate, shortDate, clock, gmt, offsetAt } from './tz.js'

const C = {
  page: '#f2f2f7', card: '#ffffff', ink: '#1d1d1f', ink2: '#6e6e73', ink3: '#8e8e93', line: '#e5e5ea',
  accent: '#e0352b', green: '#1f8a3b', greenSoft: '#e7f6eb', red: '#d70015', redSoft: '#fdecec', blue: '#0a66d8', blueSoft: '#e8f0fc',
  amber: '#a35200', amberSoft: '#fdf1e1', well: '#f5f5f7'
}
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function layout({ base, title, preheader, body, footer }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; src: url('${esc(base)}/assets/inter-latin.woff2') format('woff2'); }
body { margin: 0; padding: 0; background: ${C.page}; -webkit-text-size-adjust: 100%; }
a { color: ${C.accent}; }
.btn a { text-decoration: none; }
@media (prefers-color-scheme: dark) {
  body, .bg { background: #000000 !important; }
  .card { background: #1c1c1e !important; }
  .ink { color: #f5f5f7 !important; }
  .ink2 { color: #a1a1a6 !important; }
  .ink3 { color: #8e8e93 !important; }
  .line { border-color: #38383b !important; }
  .tile { background: #2c2c2e !important; border-color: #3a3a3c !important; }
  .pill { background: #2c2c2e !important; border-color: #3a3a3c !important; }
  .pill a { color: #f5f5f7 !important; }
  .quote { background: #2c2c2e !important; }
  .ask { background: #2c2c2e !important; }
}
@media (max-width: 620px) {
  .pad { padding: 28px 22px !important; }
  .h1 { font-size: 25px !important; }
}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.page};">
<tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT};">
<tr><td style="padding:0 6px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:9px;vertical-align:middle;"><img src="${esc(base)}/icon-192.png" width="26" height="26" alt="" style="display:block;border-radius:7px;"></td>
    <td class="ink" style="vertical-align:middle;font-size:15px;font-weight:650;letter-spacing:-0.01em;color:${C.ink};">Kalendar</td>
  </tr></table>
</td></tr>
<tr><td class="card pad" style="background:${C.card};border-radius:22px;padding:36px 40px;">
${body}
</td></tr>
<tr><td class="ink3" style="padding:20px 10px 0;font-size:12px;line-height:1.6;color:${C.ink3};text-align:center;">
${footer}<br>
<a href="https://holmhq.com" style="color:${C.ink3};text-decoration:none;">A Holm app</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function badge(label, color, soft) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
<td style="background:${soft};color:${color};border-radius:999px;padding:5px 11px 5px 10px;font-size:12px;font-weight:650;letter-spacing:0.02em;">&#9679;&nbsp; ${esc(label)}</td>
</tr></table>`
}

function heading(title, lead) {
  return `<h1 class="ink h1" style="margin:0;font-size:28px;line-height:1.15;font-weight:720;letter-spacing:-0.022em;color:${C.ink};">${esc(title)}</h1>
${lead ? `<p class="ink2" style="margin:8px 0 0;font-size:16px;line-height:1.45;font-weight:420;color:${C.ink2};">${lead}</p>` : ''}`
}

// The date as a small calendar page, like the Calendar app's icon, beside
// the day, the time and the zone.
function when({ start, end, offset, h24, zone, struck = false }) {
  const p = parts(start, offset)
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const strike = struck ? 'text-decoration:line-through;' : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px;"><tr>
<td width="66" style="vertical-align:top;">
  <table role="presentation" width="66" cellpadding="0" cellspacing="0" border="0" class="tile" style="border:1px solid ${C.line};border-radius:15px;background:#ffffff;border-collapse:separate;">
    <tr><td style="padding:8px 0 0;text-align:center;font-size:11px;line-height:1;font-weight:700;letter-spacing:0.08em;color:${struck ? C.ink3 : C.accent};">${days[p.weekday]}</td></tr>
    <tr><td class="ink" style="padding:3px 0 9px;text-align:center;font-size:32px;line-height:1;font-weight:300;letter-spacing:-0.03em;color:${struck ? C.ink3 : C.ink};${strike}">${p.day}</td></tr>
  </table>
</td>
<td style="vertical-align:middle;padding-left:16px;">
  <div class="ink" style="font-size:17px;line-height:1.3;font-weight:620;letter-spacing:-0.012em;color:${struck ? C.ink3 : C.ink};${strike}">${esc(longDate(p))}</div>
  <div class="ink" style="margin-top:3px;font-size:16px;line-height:1.35;font-weight:450;color:${struck ? C.ink3 : C.ink};font-variant-numeric:tabular-nums;${strike}">${esc(clockRange(start, end, offset, h24))}</div>
  <div class="ink2" style="margin-top:3px;font-size:13px;line-height:1.4;font-weight:420;color:${C.ink2};">${esc(zone)} · ${gmt(offset)}</div>
</td>
</tr></table>`
}

function rows(items) {
  const cells = items.filter(Boolean).map(([label, value]) => `<tr>
<td class="ink3 line" width="84" style="padding:13px 0;border-top:1px solid ${C.line};vertical-align:top;font-size:12px;line-height:1.6;font-weight:620;letter-spacing:0.05em;text-transform:uppercase;color:${C.ink3};">${esc(label)}</td>
<td class="ink line" style="padding:12px 0;border-top:1px solid ${C.line};vertical-align:top;font-size:15px;line-height:1.5;font-weight:420;color:${C.ink};">${value}</td>
</tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">${cells}</table>`
}

const guestsOf = (b) => (Array.isArray(b.guests) ? b.guests : [])
const guestRow = (b) => (guestsOf(b).length ? ['Guests', guestsOf(b).map(esc).join('<br>')] : null)

function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;"><tr>
<td class="btn" style="background:${C.accent};border-radius:13px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:620;letter-spacing:-0.008em;color:#ffffff;text-decoration:none;">${esc(label)}</a></td>
</tr></table>`
}

// Someone's own words, in a soft tinted block.
function quote(textValue) {
  return `<div class="quote ink2" style="background:${C.well};border-radius:12px;padding:10px 13px;color:${C.ink2};white-space:pre-wrap;">${esc(textValue)}</div>`
}

// The stretches a guest painted, one per line, in the reader's zone.
function stretches(ranges, offsetOf, h24, struck = false) {
  const items = ranges.map(([a, z]) => {
    const off = offsetOf(a)
    return `<tr><td class="${struck ? 'ink3' : 'ink'}" style="padding:7px 0;font-size:15px;line-height:1.4;color:${struck ? C.ink3 : C.ink};font-variant-numeric:tabular-nums;${struck ? 'text-decoration:line-through;' : ''}"><b style="font-weight:620;">${esc(shortDate(parts(a, off)))}</b>&nbsp;&nbsp;${esc(clockRange(a, z, off, h24))}</td></tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ask" style="margin:24px 0 0;background:${C.well};border-radius:16px;"><tr><td style="padding:10px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
</td></tr></table>`
}
const plainStretches = (ranges, offsetOf, h24) => ranges.map(([a, z]) => `- ${shortDate(parts(a, offsetOf(a)))}, ${clockRange(a, z, offsetOf(a), h24)}`).join('\n')

function changeBox(links) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
<td class="line ink2" style="border-top:1px solid ${C.line};padding-top:18px;font-size:14px;line-height:1.5;color:${C.ink2};">
Need a change? <a href="${esc(links.reschedule)}" style="color:${C.accent};font-weight:600;text-decoration:none;">Reschedule</a>
&nbsp;or&nbsp; <a href="${esc(links.manage)}" style="color:${C.accent};font-weight:600;text-decoration:none;">cancel</a>
</td></tr></table>`
}

function where(location, { hostName, phone, forHost }) {
  const l = location || { kind: 'none' }
  if (l.kind === 'video') return l.value ? `Video call · <a href="${esc(l.value)}" style="color:${C.accent};text-decoration:none;font-weight:600;">Join</a><br><span class="ink2" style="font-size:13px;color:${C.ink2};word-break:break-all;">${esc(l.value)}</span>` : 'Video call · the link will follow'
  if (l.kind === 'phone') return forHost ? `Phone call · call <a href="tel:${esc(phone)}" style="color:${C.accent};text-decoration:none;">${esc(phone)}</a>` : `Phone call · ${esc(hostName)} will call you at ${esc(phone)}`
  if (l.kind === 'place') return `${esc(l.value)}<br><a href="https://maps.apple.com/?q=${encodeURIComponent(l.value)}" style="color:${C.accent};text-decoration:none;font-size:13px;font-weight:600;">Open in Maps</a>`
  if (l.kind === 'custom') return esc(l.value)
  return null
}

function plainPlace(location, hostName, phone) {
  const l = location || { kind: 'none' }
  if (l.kind === 'video') return l.value ? `Video call, join at ${l.value}` : 'Video call, the link will follow'
  if (l.kind === 'phone') return `Phone call, ${hostName} will call you at ${phone}`
  if (l.kind === 'place' || l.kind === 'custom') return l.value
  return ''
}

const at = (start, offset, h24) => `${shortDate(parts(start, offset))} at ${clock(parts(start, offset), h24)}`

// To the person who booked: confirmed, rescheduled or cancelled.
export function inviteeMail(kind, c) {
  const { b, host, base } = c
  const offset = b.offset
  const time = { start: b.start, end: b.end, offset, h24: b.h24, zone: b.tzLabel }
  const footer = `Sent by Kalendar for ${esc(host.name)}. You booked at <a href="${esc(base)}/@${esc(host.handle)}" style="color:${C.ink3};">${esc(base.replace(/^https?:\/\//, ''))}/@${esc(host.handle)}</a>.`
  const place = where(b.location, { hostName: host.name, phone: b.phone })
  const ranges = b.ranges || [[b.start, b.end]]
  const guestOffset = () => offset
  if (kind === 'requested') {
    const body = badge('Request sent', C.amber, C.amberSoft) +
      heading(`You asked ${host.name} for a time`, `${esc(b.eventTitle)} · ${b.duration} minutes. You’ll hear back by email.`) +
      stretches(ranges, guestOffset, b.h24) +
      `<p class="ink2" style="margin:10px 0 0;font-size:13px;color:${C.ink2};">${esc(b.tzLabel)} · ${gmt(offset)}</p>` +
      (b.notes ? rows([['Notes', quote(b.notes)]]) : '') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
<td class="line ink2" style="border-top:1px solid ${C.line};padding-top:18px;font-size:14px;line-height:1.5;color:${C.ink2};">Changed your mind? <a href="${esc(c.links.manage)}" style="color:${C.accent};font-weight:600;text-decoration:none;">Withdraw the request</a></td></tr></table>`
    return {
      subject: `Request sent: ${b.eventTitle} with ${host.name}`,
      html: layout({ base, title: 'Request sent', preheader: `${host.name} will pick a time from what you offered, or let you know.`, body, footer }),
      text: [`You asked ${host.name} for ${b.eventTitle} (${b.duration} min) at one of these times (${b.tzLabel}):`, plainStretches(ranges, guestOffset, b.h24), `You'll hear back by email.`, `Withdraw the request: ${c.links.manage}`].join('\n\n')
    }
  }
  if (kind === 'declined') {
    const body = badge('Not this time', C.ink2, C.well) +
      heading(`${host.name} can’t make those times`, `${esc(b.eventTitle)} · ${b.duration} minutes.`) +
      stretches(ranges, guestOffset, b.h24, true) +
      (b.reason ? rows([['Note', quote(b.reason)]]) : '') +
      button('See open times', c.links.rebook)
    return {
      subject: `${host.name} can’t make those times`,
      html: layout({ base, title: 'Request declined', preheader: `${host.name} declined your request for ${b.eventTitle}.`, body, footer }),
      text: [`${host.name} can't make the times you asked for (${b.eventTitle}).`, b.reason ? `Note: ${b.reason}` : '', `See open times: ${c.links.rebook}`].filter(Boolean).join('\n\n')
    }
  }
  if (kind === 'cancelled') {
    const byHost = b.cancelledBy === 'host'
    const body = badge('Cancelled', C.red, C.redSoft) +
      heading(`${b.eventTitle} with ${host.name} is off`, byHost ? `${esc(host.name)} cancelled it.` : 'You cancelled it. There’s nothing else to do.') +
      when({ ...time, struck: true }) +
      (b.reason ? rows([['Note', quote(b.reason)]]) : '') +
      button('Pick another time', c.links.rebook)
    return {
      subject: `Cancelled: ${b.eventTitle} with ${host.name} — ${at(b.start, offset, b.h24)}`,
      html: layout({ base, title: 'Cancelled', preheader: `${b.eventTitle} on ${at(b.start, offset, b.h24)} is cancelled.`, body, footer }),
      text: [`${b.eventTitle} with ${host.name} is cancelled${byHost ? ` by ${host.name}` : ''}.`, `Was: ${longDate(parts(b.start, offset))}, ${clockRange(b.start, b.end, offset, b.h24)} (${b.tzLabel})`, b.reason ? `Note: ${b.reason}` : '', `Pick another time: ${c.links.rebook}`].filter(Boolean).join('\n\n')
    }
  }
  const moved = kind === 'rescheduled'
  const accepted = kind === 'accepted'
  const body = (moved ? badge('Rescheduled', C.blue, C.blueSoft) : badge(accepted ? 'Accepted' : 'Confirmed', C.green, C.greenSoft)) +
    heading(moved ? `Your time with ${host.name} moved` : accepted ? `${host.name} said yes` : `You’re booked with ${host.name}`, `${esc(b.eventTitle)} · ${b.duration} minutes`) +
    when(time) +
    (moved && c.old ? `<p class="ink3" style="margin:10px 0 0 82px;font-size:13px;color:${C.ink3};">Was <span style="text-decoration:line-through;">${esc(at(c.old.start, offset, b.h24))}</span></p>` : '') +
    rows([place ? ['Where', place] : null, ['Host', `${esc(host.name)}`], ['Invitee', `${esc(b.name)} · ${esc(b.email)}`], guestRow(b)]) +
    changeBox(c.links)
  return {
    subject: moved ? `Rescheduled: ${b.eventTitle} with ${host.name} — now ${at(b.start, offset, b.h24)}` : `${accepted ? 'Accepted' : 'Confirmed'}: ${b.eventTitle} with ${host.name} — ${at(b.start, offset, b.h24)}`,
    html: layout({ base, title: moved ? 'Rescheduled' : accepted ? 'Accepted' : 'Confirmed', preheader: `${longDate(parts(b.start, offset))}, ${clockRange(b.start, b.end, offset, b.h24)}.`, body, footer }),
    text: [
      moved ? `Your ${b.eventTitle} with ${host.name} moved.` : accepted ? `${host.name} said yes: ${b.eventTitle}.` : `You're booked: ${b.eventTitle} with ${host.name}.`,
      `${longDate(parts(b.start, offset))}\n${clockRange(b.start, b.end, offset, b.h24)} (${b.tzLabel}, ${gmt(offset)})`,
      moved && c.old ? `Was: ${at(c.old.start, offset, b.h24)}` : '',
      plainPlace(b.location, host.name, b.phone) ? `Where: ${plainPlace(b.location, host.name, b.phone)}` : '',
      guestsOf(b).length ? `Guests: ${guestsOf(b).join(', ')}` : '',
      `Reschedule: ${c.links.reschedule}\nCancel: ${c.links.manage}`
    ].filter(Boolean).join('\n\n')
  }
}

// To the host: a new booking, a moved one, or a cancelled one.
export function hostMail(kind, c) {
  const { b, host, base } = c
  const offset = c.hostOffset
  const h24 = false
  const time = { start: b.start, end: b.end, offset, h24, zone: host.tzLabel }
  const footer = `You get these because people book you at <a href="${esc(base)}/@${esc(host.handle)}" style="color:${C.ink3};">${esc(base.replace(/^https?:\/\//, ''))}/@${esc(host.handle)}</a>. Turn them off in Kalendar.`
  const who = `${esc(b.name)}<br><a href="mailto:${esc(b.email)}" style="color:${C.accent};text-decoration:none;">${esc(b.email)}</a>`
  const place = where(b.location, { hostName: host.name, phone: b.phone, forHost: true })
  const ranges = b.ranges || [[b.start, b.end]]
  const hostOffset = (ms) => (c.hostTable ? offsetAt(c.hostTable, ms) : offset)
  if (kind === 'requested') {
    const body = badge('Request', C.amber, C.amberSoft) +
      heading(`${b.name} asks for a time`, `${esc(b.eventTitle)} · ${b.duration} min, at any time in ${ranges.length === 1 ? 'this stretch' : 'these stretches'}. Nothing is booked until you accept.`) +
      stretches(ranges, hostOffset, h24) +
      `<p class="ink2" style="margin:10px 0 0;font-size:13px;color:${C.ink2};">${esc(host.tzLabel)}</p>` +
      rows([['From', who], b.phone ? ['Phone', esc(b.phone)] : null, b.notes ? ['Notes', quote(b.notes)] : null, ['Their zone', `${esc(b.tzLabel)} · ${gmt(b.offset)}`]]) +
      button('Accept or decline', c.links.review)
    return {
      subject: `Request: ${b.name} asks for ${b.eventTitle}`,
      html: layout({ base, title: 'Request', preheader: `${b.name} asks for ${b.eventTitle}, ${shortDate(parts(ranges[0][0], hostOffset(ranges[0][0])))} or later.`, body, footer }),
      text: [`${b.name} (${b.email}) asks for ${b.eventTitle} (${b.duration} min) at any time in:`, plainStretches(ranges, hostOffset, h24), b.notes ? `Notes:\n${b.notes}` : '', `Accept or decline: ${c.links.review}`].filter(Boolean).join('\n\n')
    }
  }
  if (kind === 'withdrawn') {
    const body = badge('Withdrawn', C.ink2, C.well) +
      heading(`${b.name} withdrew their request`, `${esc(b.eventTitle)} · ${b.duration} min. There’s nothing to do.`) +
      rows([['From', who], b.reason ? ['Note', quote(b.reason)] : null]) +
      button('Open Kalendar', c.links.dashboard)
    return {
      subject: `Withdrawn: ${b.name}’s request`,
      html: layout({ base, title: 'Withdrawn', preheader: `${b.name} withdrew their request for ${b.eventTitle}.`, body, footer }),
      text: [`${b.name} (${b.email}) withdrew their request for ${b.eventTitle}.`, b.reason ? `Note: ${b.reason}` : '', `Kalendar: ${c.links.dashboard}`].filter(Boolean).join('\n\n')
    }
  }
  if (kind === 'cancelled') {
    const byYou = b.cancelledBy === 'host'
    const body = badge('Cancelled', C.red, C.redSoft) +
      heading(byYou ? `You cancelled with ${b.name}` : `${b.name} cancelled`, `${esc(b.eventTitle)} · ${b.duration} min. ${byYou ? 'They’ve been told, and the' : 'The'} time is free again.`) +
      when({ ...time, struck: true }) +
      rows([['Invitee', who], b.reason ? ['Note', quote(b.reason)] : null]) +
      button('Open Kalendar', c.links.dashboard)
    return {
      subject: `Cancelled: ${b.name} — ${at(b.start, offset, h24)}`,
      html: layout({ base, title: 'Cancelled', preheader: `${byYou ? 'You cancelled' : `${b.name} cancelled`} ${b.eventTitle} on ${at(b.start, offset, h24)}.`, body, footer }),
      text: [byYou ? `You cancelled ${b.eventTitle} with ${b.name} (${b.email}). They've been told.` : `${b.name} (${b.email}) cancelled ${b.eventTitle}.`, `Was: ${longDate(parts(b.start, offset))}, ${clockRange(b.start, b.end, offset, h24)}`, b.reason ? `Note: ${b.reason}` : '', `Kalendar: ${c.links.dashboard}`].filter(Boolean).join('\n\n')
    }
  }
  const moved = kind === 'rescheduled'
  const accepted = kind === 'accepted'
  const body = (moved ? badge('Rescheduled', C.blue, C.blueSoft) : accepted ? badge('Accepted', C.green, C.greenSoft) : badge('New booking', C.accent, '#fdeceb')) +
    heading(moved ? `${b.name} moved their time` : accepted ? `You’re meeting ${b.name}` : `${b.name} booked you`, `${esc(b.eventTitle)} · ${b.duration} min`) +
    when(time) +
    (moved && c.old ? `<p class="ink3" style="margin:10px 0 0 82px;font-size:13px;color:${C.ink3};">Was <span style="text-decoration:line-through;">${esc(at(c.old.start, offset, h24))}</span></p>` : '') +
    rows([['Invitee', who], guestRow(b), place ? ['Where', place] : null, b.phone && b.location.kind !== 'phone' ? ['Phone', esc(b.phone)] : null, b.notes ? ['Notes', quote(b.notes)] : null, ['Their zone', `${esc(b.tzLabel)} · ${gmt(b.offset)}`]]) +
    button('Open Kalendar', c.links.dashboard)
  return {
    subject: moved ? `Rescheduled: ${b.name} — now ${at(b.start, offset, h24)}` : `${accepted ? 'Accepted' : 'New booking'}: ${b.name} — ${at(b.start, offset, h24)}`,
    html: layout({ base, title: moved ? 'Rescheduled' : accepted ? 'Accepted' : 'New booking', preheader: `${b.eventTitle} · ${longDate(parts(b.start, offset))}, ${clockRange(b.start, b.end, offset, h24)}`, body, footer }),
    text: [
      moved ? `${b.name} moved ${b.eventTitle}.` : accepted ? `You accepted ${b.name}'s request: ${b.eventTitle}.` : `${b.name} booked ${b.eventTitle}.`,
      `${longDate(parts(b.start, offset))}\n${clockRange(b.start, b.end, offset, h24)} (${host.tzLabel})`,
      moved && c.old ? `Was: ${at(c.old.start, offset, h24)}` : '',
      `Invitee: ${b.name} <${b.email}>`,
      guestsOf(b).length ? `Guests: ${guestsOf(b).join(', ')}` : '',
      b.phone ? `Phone: ${b.phone}` : '',
      b.notes ? `Notes:\n${b.notes}` : '',
      `Kalendar: ${c.links.dashboard}`
    ].filter(Boolean).join('\n\n')
  }
}

// To someone the booker invited: the same meeting, without the links to
// change it, which only the booker has.
export function guestMail(kind, c) {
  const { b, host, base } = c
  const offset = b.offset
  const time = { start: b.start, end: b.end, offset, h24: b.h24, zone: b.tzLabel }
  const footer = `Sent by Kalendar for ${esc(host.name)}, because ${esc(b.name)} invited you.`
  const others = [b.name, ...guestsOf(b)]
  if (kind === 'cancelled') {
    const lead = c.removed ? `${b.name} took you off the guest list.` : b.cancelledBy === 'host' ? `${host.name} cancelled it.` : `${b.name} cancelled it.`
    const body = badge('Cancelled', C.red, C.redSoft) +
      heading(`${b.eventTitle} with ${host.name} is off`, `${esc(lead)} There’s nothing to do.`) +
      when({ ...time, struck: true })
    return {
      subject: `Cancelled: ${b.eventTitle} with ${host.name} — ${at(b.start, offset, b.h24)}`,
      html: layout({ base, title: 'Cancelled', preheader: `${b.eventTitle} on ${at(b.start, offset, b.h24)} is off.`, body, footer }),
      text: [`${b.eventTitle} with ${host.name} is off. ${lead}`, `Was: ${longDate(parts(b.start, offset))}, ${clockRange(b.start, b.end, offset, b.h24)} (${b.tzLabel})`].join('\n\n')
    }
  }
  const moved = kind === 'rescheduled'
  const place = where(b.location, { hostName: host.name, phone: b.phone })
  const body = (moved ? badge('Rescheduled', C.blue, C.blueSoft) : badge('Invitation', C.green, C.greenSoft)) +
    heading(moved ? `${b.eventTitle} with ${host.name} moved` : `${b.name} invited you`, `${esc(b.eventTitle)} with ${esc(host.name)} · ${b.duration} minutes`) +
    when(time) +
    rows([place ? ['Where', place] : null, ['Host', esc(host.name)], ['Guests', others.map(esc).join('<br>')]]) +
    `<p class="ink2" style="margin:24px 0 0;font-size:14px;line-height:1.5;color:${C.ink2};">Only ${esc(b.name)} can move or cancel it. You’ll hear if they do.</p>`
  return {
    subject: moved ? `Rescheduled: ${b.eventTitle} with ${host.name} — now ${at(b.start, offset, b.h24)}` : `Invitation: ${b.eventTitle} with ${host.name} — ${at(b.start, offset, b.h24)}`,
    html: layout({ base, title: moved ? 'Rescheduled' : 'Invitation', preheader: `${longDate(parts(b.start, offset))}, ${clockRange(b.start, b.end, offset, b.h24)}.`, body, footer }),
    text: [
      moved ? `${b.eventTitle} with ${host.name} moved.` : `${b.name} invited you to ${b.eventTitle} with ${host.name}.`,
      `${longDate(parts(b.start, offset))}\n${clockRange(b.start, b.end, offset, b.h24)} (${b.tzLabel}, ${gmt(offset)})`,
      plainPlace(b.location, host.name, b.phone) ? `Where: ${plainPlace(b.location, host.name, b.phone)}` : '',
      `Guests: ${others.join(', ')}`,
      `Only ${b.name} can move or cancel it.`
    ].filter(Boolean).join('\n\n')
  }
}

// The link that confirms an address a host added for booking email.
export function verifyMail({ base, host, address, link }) {
  const body = heading('Confirm this address', `${esc(host.name)} wants Kalendar’s booking emails at <b style="font-weight:620;">${esc(address)}</b>. Confirm it’s yours.`) +
    button('Confirm address', link) +
    `<p class="ink3" style="margin:22px 0 0;font-size:13px;line-height:1.5;color:${C.ink3};">The link works for a week. If you didn’t ask for this, ignore it, and nothing will be sent here.</p>`
  return {
    subject: 'Confirm your address for Kalendar',
    html: layout({ base, title: 'Confirm your address', preheader: 'One tap to get booking emails here.', body, footer: `For ${esc(host.name)} on <a href="${esc(base)}/@${esc(host.handle)}" style="color:${C.ink3};">${esc(base.replace(/^https?:\/\//, ''))}/@${esc(host.handle)}</a>.` }),
    text: [`${host.name} wants Kalendar's booking emails at ${address}. Confirm it's yours:`, link, `The link works for a week. If you didn't ask for this, ignore it.`].join('\n\n')
  }
}

function attempt(env, request) {
  try {
    return env.holm.email.send(request) || { ok: false }
  } catch (error) {
    return { ok: false, code: 'EMAIL_FAILED', message: String(error && error.message || error) }
  }
}

// Sends one email, with its calendar invite when it has one. If Holm turns
// the invite down, the email still goes, without it; a node from before
// invites ignores the field and sends it plain.
export function send(env, to, mail) {
  if (!to) return { ok: false, code: 'NO_ADDRESS' }
  const plain = { to, subject: mail.subject, body: mail.text, html: mail.html }
  let result = attempt(env, mail.calendar ? { ...plain, calendar: mail.calendar } : plain)
  if (mail.calendar && !result.ok && (result.code === 'EMAIL_SEND_INVALID_REQUEST' || /calendar/i.test(result.message || ''))) {
    env.holm.log.warn('invite refused: ' + String(result.message || result.code).slice(0, 200))
    result = attempt(env, plain)
  }
  if (!result.ok) env.holm.log.warn(`email not sent: ${result.code} ${String(result.message || '').slice(0, 200)}`)
  return result.ok ? { ok: true, from: senderOf(result.from) } : { ok: false, code: result.code || 'EMAIL_FAILED' }
}

// Holm reports the address it sent from, as `Name <address>` or the bare
// address. The host's invites name it as their organizer.
export function senderOf(from) {
  const text = String(from || '').trim()
  const m = /^"?([^"<]*?)"?\s*<([^<>\s@]+@[^<>\s@]+)>$/.exec(text) || /^()([^<>\s@"]+@[^<>\s@"]+)$/.exec(text)
  return m ? { name: m[1] || 'Kalendar', email: m[2] } : null
}
