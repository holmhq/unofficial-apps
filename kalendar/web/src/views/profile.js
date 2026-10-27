// Someone's page, /@handle: who they are and what you can book with them.
import { h, ic, avatar } from '../ui.js'
import * as api from '../api.js'
import { topBar, link, holmFooter, state, share } from '../shell.js'
import * as t from '../time.js'
import { colorOf, placeLine } from './common.js'
import { missingHost } from './missing.js'

export async function profile(handle) {
  let page
  try {
    page = await api.get(`/api/u/${encodeURIComponent(handle)}`)
  } catch (error) {
    return missingHost(handle, error)
  }
  const { host, events } = page
  const mine = state.me && state.me.host && state.me.host.handle === host.handle
  const cards = events.map((e, i) => {
    const place = placeLine(e.location, host.name)
    return link(`/@${host.handle}/${e.slug}`, { class: 'event-card', style: { '--event': colorOf(e.color), '--i': String(i) } },
      h('span.event-dot'),
      h('div.grow',
        h('b', e.title),
        h('span.event-meta', h('span', ic('clock', 14, 2.1), t.minutesLabel(e.duration)), place ? h('span', ic(place.icon, 14, 2.1), place.text) : null),
        e.description ? h('p', e.description) : null),
      ic('chevronRight', 18, 2.2))
  })
  const el = h('div.app.public', topBar({ right: mine ? [h('button.icon-btn', { type: 'button', 'aria-label': 'Share your link', onclick: () => share(host.handle) }, ic('share', 19, 2))] : [] }),
    h('div.panel',
      h('main.profile',
        h('div.profile-head',
          avatar({ key: host.handle, name: host.name, picture: host.picture, size: 84, cls: '.big' }),
          h('h1', host.name),
          host.bio ? h('p.bio', host.bio) : h('p.bio.quiet', 'Pick what you’d like to talk about.')),
        cards.length ? h('nav.event-list', { 'aria-label': 'Ways to meet' }, cards) : h('div.empty-inline', ic('calendarOff', 22, 1.9), h('p', `${host.name} has nothing open right now.`)),
        h('p.profile-zone', ic('globe', 14, 2), `${host.name}’s hours are in ${host.tzLabel}. You’ll see times in yours.`)),
      holmFooter()))
  return { el }
}
