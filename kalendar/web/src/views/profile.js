// Someone's page, /@handle: who they are, where to find them, and what you
// can book with them, each with the next time that's open.
import { h, ic, fill, avatar } from '../ui.js'
import * as api from '../api.js'
import * as store from '../store.js'
import * as theme from '../theme.js'
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

// It draws at once from what this browser saw last, or from the answer
// index.html asked for while the code loaded; a fresher answer swaps in
// quietly, only if something changed.
export async function profile(handle) {
  const key = 'u:' + handle.toLowerCase()
  const asking = api.get(`/api/u/${encodeURIComponent(handle)}`)
  let page = store.peek(key)
  if (!page) {
    try { page = await asking } catch (error) { return missingHost(handle, error) }
    store.keep(key, page)
  }
  // Each event's own page has what it needs already: open it at once.
  const seed = (p) => { for (const { next, ...event } of p.events) store.keep(`u:${p.host.handle}/${event.slug}`, { host: p.host, event }) }
  seed(page)
  const visit = track.page(page.host.handle)
  const panel = h('div.panel')
  let main = body(page, visit)
  const bar = () => {
    const host = page.host
    const mine = state.me && state.me.host && state.me.host.handle === host.handle
    return topBar({ right: mine ? [h('button.icon-btn', { type: 'button', 'aria-label': 'Share your link', onclick: () => share(host.handle) }, ic('share', 19, 2))] : [] })
  }
  let top = bar()
  fill(panel, main, holmFooter())
  const el = h('div.app.public', top, panel)
  document.title = `Book time with ${page.host.name} · Kalendar`
  asking.then((fresh) => {
    if (!store.keep(key, fresh)) return
    page = fresh
    theme.setAccent(page.host.theme, { scope: theme.scopeOf(location.pathname) })
    seed(page)
    const next = body(page, visit)
    main.replaceWith(next)
    main = next
  }).catch(() => {})
  return {
    el,
    accent: page.host.theme,
    leave: () => visit.leave(),
    me() { const next = bar(); top.replaceWith(next); top = next }
  }
}

function body(page, visit) {
  const { host, events } = page
  const now = Date.now()

  function nextLine(e) {
    if (!e.next || e.next < now) return h('span.next-open.none', e.requests !== false ? 'Nothing open soon · ask for a time' : 'Nothing open soon')
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

  return h('main.profile',
    h('div.profile-head',
      avatar({ key: host.handle, name: host.name, picture: host.picture, size: 92, cls: '.big' }),
      h('h1', host.name),
      role.length ? h('p.role', host.role ? h('span', host.role) : null, host.role && host.company ? h('span.at', ' at ') : null, host.company ? h('span', host.company) : null) : null,
      h('p.where', ic('mapPin', 13, 2.2), h('span', where), h('span.sep', '·'), h('span.quiet', `${t.clock(now, host.tz)} there`)),
      host.bio ? h('p.bio', host.bio) : null,
      links.length || website ? h('div.socials', links, website) : null),
    h('h2.section-label', events.length ? 'Book a time' : ''),
    cards.length ? h('nav.event-list', { 'aria-label': 'Ways to meet' }, cards) : h('div.empty-inline', ic('calendarOff', 22, 1.9), h('p', `${host.name} has nothing open right now.`)),
    h('p.profile-zone', ic('globe', 14, 2), `Times show in your zone. ${host.name.split(' ')[0]}’s hours are in ${host.tzLabel}.`))
}
