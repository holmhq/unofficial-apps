// Pick a time zone: search by city, region or name, with each zone's time
// right now, so "the one where it's 9:40 PM" is easy to spot.
import { h, ic, sheet, fill } from '../ui.js'
import { zones, gmt } from '../zones.js'
import * as t from '../time.js'
import { sound } from '../sound.js'

export function zonePicker(current, { title = 'Time zone' } = {}) {
  return sheet({
    title,
    cancel: 'Cancel',
    body: (close) => {
      const all = zones()
      const now = Date.now()
      const search = h('input.search-input', { type: 'search', placeholder: 'Search cities or zones', 'aria-label': 'Search time zones', autocomplete: 'off', autofocus: true, enterkeyhint: 'search' })
      const list = h('div.zone-list', { role: 'listbox', 'aria-label': 'Time zones' })
      const row = (z) => h('button.zone-row' + (z.zone === current ? '.on' : ''), {
        type: 'button', role: 'option', 'aria-selected': String(z.zone === current),
        onclick: () => { sound.tap(); close(z.zone) }
      },
      h('div.grow', h('b', z.city), h('small', `${z.name} · ${gmt(z.offset)}`)),
      h('span.zone-now.num', t.clock(now, z.zone)),
      z.zone === current ? ic('check', 18, 2.4) : h('span.zone-check'))
      const paint = () => {
        const q = search.value.trim().toLowerCase()
        const found = q ? all.filter((z) => z.zone.toLowerCase().replace(/_/g, ' ').includes(q) || z.name.toLowerCase().includes(q) || gmt(z.offset).toLowerCase().includes(q)) : all
        fill(list, found.length ? found.map(row) : h('p.empty-small', 'No zone matches that.'))
      }
      search.addEventListener('input', paint)
      paint()
      // Start with your zone in the middle. Scroll the sheet by hand
      // (scrollIntoView would move the page too), once it has its height.
      const centre = () => {
        const on = list.querySelector('.on')
        const body = list.closest('.sheet-body')
        if (!on || !body || !body.clientHeight) return false
        body.scrollTop += on.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 2 + on.offsetHeight / 2
        return true
      }
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!centre()) setTimeout(centre, 120) }))
      return [h('div.search-bar', h('div.search', ic('search', 17, 2), search)), list]
    }
  })
}
