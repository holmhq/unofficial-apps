// Someone's page, /@handle: who they are, where to find them, and what you
// can book with them, each with the next time that's open.
import { h, ic, avatar } from '../ui.js'
import * as api from '../api.js'
import { topBar, link, holmFooter, state, share } from '../shell.js'
import * as t from '../time.js'
import { city } from '../zones.js'
import { colorOf, placeLine } from './common.js'
import { missingHost } from './missing.js'
import * as track from '../track.js'

// A profile link's site, for its icon and name.
const SITES = [
  [/(^|\.)linkedin\.com$/, 'linkedin', 'LinkedIn'],
  [/(^|\.)(x|twitter)\.com$/, 'xLogo', 'X'],
  [/(^|\.)github\.com$/, 'github', 'GitHub'],
  [/(^|\.)instagram\.com$/, 'instagram', 'Instagram'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube', 'YouTube'],
  [/(^|\.)dribbble\.com$/, 'dribbble', 'Dribbble'],
  [/(^|\.)facebook\.com$/, 'facebook', 'Facebook']
]

export function siteOf(url) {
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { return { icon: 'link', name: url, kind: 'link' } }
  for (const [re, icon, name] of SITES) if (re.test(host)) return { icon, name, kind: icon === 'xLogo' ? 'x' : icon, host }
  return { icon: 'link', name: host, kind: 'other', host }
}

const bare = (url) => { try { const u = new URL(url); return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '') } catch { return url } }

export async function profile(handle) {
  let page
  try {
    page = await api.get(`/api/u/${encodeURIComponent(handle)}`)
  } catch (error) {
    return missingHost(handle, error)
  }
  const { host, events } = page
  const mine = state.me && state.me.host && state.me.host.handle === host.handle
  const visit = track.page(host.handle)
  const now = Date.now()

  function nextLine(e) {
    if (!e.next) return h('span.next-open.none', e.requests !== false ? 'Nothing open soon · ask for a time' : 'Nothing open soon')
    const soon = e.next - now < 86400000
    const rel = t.relativeDay(e.next)
    const day = rel ? rel.toLowerCase() : t.weekday(e.next, undefined, 'short')
    return h('span.next-open' + (soon ? '.near' : ''), h('i'), `Next: ${day}, ${t.clock(e.next)}`)
  }

  const cards = events.map((e, i) => {
    const place = placeLine(e.location, host.name)
    return link(`/@${host.handle}/${e.slug}`, { class: 'event-card', style: { '--event': colorOf(e.color), '--i': String(i) }, onclick: () => visit.click('event:' + e.slug) },
      h('span.event-tile', ic(place ? place.icon : 'calendar', 20, 2)),
      h('div.grow',
        h('b', e.title),
        h('span.event-meta', [t.minutesLabel(e.duration), place && place.text].filter(Boolean).join(' · ')),
        e.description ? h('p', e.description) : null,
        nextLine(e)),
      ic('chevronRight', 18, 2.2))
  })

  const role = [host.role, host.company].filter(Boolean)
  const where = host.place || city(host.tz)
  const links = (host.links || []).map((url) => {
    const site = siteOf(url)
    return h('a.social', { href: url, target: '_blank', rel: 'noopener me', 'aria-label': site.name, title: site.name, onclick: () => visit.click('link:' + site.kind) }, ic(site.icon, 18, 2))
  })
  const website = host.website ? h('a.website', { href: host.website, target: '_blank', rel: 'noopener me', onclick: () => visit.click('website') }, h('span', bare(host.website)), ic('arrowUpRight', 15, 2.4)) : null

  const el = h('div.app.public', topBar({ right: mine ? [h('button.icon-btn', { type: 'button', 'aria-label': 'Share your link', onclick: () => share(host.handle) }, ic('share', 19, 2))] : [] }),
    h('div.panel',
      h('main.profile',
        h('div.profile-head',
          avatar({ key: host.handle, name: host.name, picture: host.picture, size: 92, cls: '.big' }),
          h('h1', host.name),
          role.length ? h('p.role', host.role ? h('span', host.role) : null, host.role && host.company ? h('span.at', ' at ') : null, host.company ? h('span', host.company) : null) : null,
          h('p.where', ic('mapPin', 13, 2.2), h('span', where), h('span.sep', '·'), h('span.quiet', `${t.clock(now, host.tz)} there`)),
          host.bio ? h('p.bio', host.bio) : null,
          links.length || website ? h('div.socials', links, website) : null),
        h('h2.section-label', events.length ? 'Book a time' : ''),
        cards.length ? h('nav.event-list', { 'aria-label': 'Ways to meet' }, cards) : h('div.empty-inline', ic('calendarOff', 22, 1.9), h('p', `${host.name} has nothing open right now.`)),
        h('p.profile-zone', ic('globe', 14, 2), `Times show in your zone. ${host.name.split(' ')[0]}’s hours are in ${host.tzLabel}.`)),
      holmFooter()))
  return { el, leave: () => visit.leave() }
}
