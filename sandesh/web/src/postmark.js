// The postmark pressed onto each sent text, drawn as SVG in the text's
// colour (violet ink; red when the text came back). It names the state
// along the top of the ring and carries the time in the middle, like a
// post office's date stamp. Delivered texts get the double ring.

const LABELS = {
  scheduled: 'SCHEDULED',
  sent: 'SENT',
  delivered: 'DELIVERED',
  failed: 'RETURNED',
  received: 'RECEIVED'
}

const monthFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

// A tilt between −14° and +8°, fixed for each text so it doesn't wobble
// when the list redraws.
export function tilt(seed) {
  let hash = 7
  for (const ch of String(seed)) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0
  return (hash % 23) - 14
}

export function postmark(state, iso, seed) {
  const label = LABELS[state]
  if (!label) return ''
  const d = iso ? new Date(iso) : new Date()
  const time = timeFmt.format(d)
  const day = monthFmt.format(d).toUpperCase()
  const id = 'pm' + Math.abs(tilt(seed + state)) + String(seed).replace(/[^a-z0-9]/gi, '').slice(-8)
  const double = state === 'delivered'
  const dashed = state === 'scheduled'
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><path id="${id}" d="M 12 32 A 20 20 0 0 1 52 32"/></defs>
  <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="2.2"${dashed ? ' stroke-dasharray="4 3"' : ''}/>
  ${double ? '<circle cx="32" cy="32" r="25.5" fill="none" stroke="currentColor" stroke-width="1"/>' : ''}
  <text font-size="${label.length > 7 ? 8.4 : 9.6}" letter-spacing="${label.length > 7 ? 0.5 : 1.6}" text-anchor="middle"><textPath href="#${id}" startOffset="50%">${label}</textPath></text>
  <line x1="13" y1="35.5" x2="51" y2="35.5" stroke="currentColor" stroke-width="1"/>
  <text x="32" y="46" font-size="11" text-anchor="middle">${time}</text>
  <text x="32" y="54.5" font-size="7" letter-spacing="0.8" text-anchor="middle">${day}</text>
</svg>`
}
