// Pick a time zone: search by city, region or name, with each zone's time
// right now, so "the one where it's 9:40 PM" is easy to spot. Also the
// host's own zone as a row, in Availability and in Profile.
import { h, ic, sheet, fill, toast } from '../ui.js'
import { zones, gmt, here, city, offsetIn, zonePayload } from '../zones.js'
import * as t from '../time.js'
import * as api from '../api.js'
import * as store from '../store.js'
import { state, failure } from '../shell.js'
import { sound } from '../sound.js'

// The host's zone: tap to choose another. Their hours keep their times of
// day there (9 to 5 stays 9 to 5). When this device is somewhere the clock
// reads differently (they're travelling), a second row offers its zone.
export function hostZone({ onChange } = {}) {
  const el = h('div.group.zone-group')
  function paint() {
    const x = state.me.host
    const now = Date.now()
    const local = here()
    const rows = [h('button.row-btn', { type: 'button', onclick: () => change() },
      ic('globe', 19, 2),
      h('span.grow', h('b', city(x.tz)), h('small', `${x.tzLabel} · ${gmt(offsetIn(x.tz, now))}`)),
      h('span.row-value.num', t.clock(now, x.tz)),
      ic('chevronRight', 17, 2.2))]
    if (local !== x.tz && offsetIn(local, now) !== offsetIn(x.tz, now)) {
      rows.push(h('button.row-btn.zone-here', { type: 'button', onclick: () => change(local) },
        ic('mapPin', 19, 2),
        h('span.grow', h('b', `Switch to ${city(local)}`), h('small', `This device’s time zone · ${gmt(offsetIn(local, now))}`)),
        h('span.row-value.num', t.clock(now, local))))
    }
    fill(el, rows)
  }
  async function change(zone) {
    const was = state.me.host.tz
    const z = zone || await zonePicker(was, { title: 'Your time zone' })
    if (!z || z === was) return
    try {
      const r = await api.patch('/api/host', zonePayload(z))
      state.me.host = r.host
      store.keep('me', state.me)
      paint()
      sound.pop()
      toast(`Your hours are in ${city(z)} time now`)
      if (onChange) onChange(z)
    } catch (error) { failure(error) }
  }
  paint()
  return { el, paint }
}

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
