// Insights: who opens your page, where they came from (the site, or one of
// your tracked links), what they opened it on, where they are, what they
// clicked, and how many booked. One hue for every amount; numbers in ink.
// Your own visits don't count. It draws from the last answer at once.
import { h, ic, fill, segmented } from '../ui.js'
import * as api from '../api.js'
import * as store from '../store.js'
import * as t from '../time.js'
import { city } from '../zones.js'
import { colorOf } from './common.js'
import { sound } from '../sound.js'
import { share, state, mine } from '../shell.js'
import { newLink, showLink } from './link-sheet.js'

const SOURCES = {
  direct: 'Direct or email', other: 'Other sites', 'linkedin.com': 'LinkedIn', 'x.com': 'X', 'twitter.com': 'X', 'github.com': 'GitHub',
  'facebook.com': 'Facebook', 'instagram.com': 'Instagram', 'youtube.com': 'YouTube', 'news.ycombinator.com': 'Hacker News',
  'mail.google.com': 'Gmail', 'outlook.live.com': 'Outlook', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo', 'reddit.com': 'Reddit', 'threads.net': 'Threads', 'bsky.app': 'Bluesky'
}
const LINKS = { linkedin: 'LinkedIn', x: 'X', github: 'GitHub', instagram: 'Instagram', youtube: 'YouTube', dribbble: 'Dribbble', facebook: 'Facebook', other: 'Other link', website: 'Website' }
const DEVICES = { phone: ['Phone', 'smartphone'], desktop: ['Computer', 'monitor'], tablet: ['Tablet', 'tablet'] }

const fmt = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
// Bookings can arrive without a counted visit (a direct link, a browser that
// asks not to be tracked), so a rate never shows above 100%.
const pct = (part, whole) => (whole ? `${Math.min(100, Math.round((part / whole) * 1000) / 10)}%` : '0%')

function duration(ms) {
  const s = Math.round((ms || 0) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function source(key) {
  if (SOURCES[key]) return SOURCES[key]
  if (/(^|\.)google\.[a-z.]+$/.test(key)) return 'Google'
  return key
}

// A nice top for the axis: 1, 2 or 5 times a power of ten.
function niceTop(max) {
  if (max <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(max))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p
  return 10 * p
}

export function insights({ host, days, onDays }) {
  let countries = null
  let last = null
  let alive = true
  const content = h('div.ins-body')
  const seg = segmented([{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], days, (v) => { days = v; onDays(v); sound.tap(); load() }, { label: 'Range' })
  const el = h('section.tab-page.insights',
    h('div.title-row', h('h1.large-title', 'Insights'), h('div.ins-range', seg)),
    h('p.page-sub', 'Who opens your page, and who books. No cookies: places come from each visitor’s time zone, and your own visits don’t count.'),
    content)

  import('../countries.js').then((m) => { countries = m; if (last && alive) draw(last) }).catch(() => {})

  // What's kept for this range draws at once; the server's answer redraws
  // only if it changed. Only a first draw, after the placeholder, grows in.
  async function load() {
    const key = mine('stats:' + days)
    const kept = store.peek(key)
    if (kept) { last = kept; draw(kept) } else {
      if (last) content.classList.add('stale')
      else fill(content, h('div.skeleton.ins-skel', [0, 1, 2].map(() => h('div.sk-row', h('span'), h('span'), h('span')))))
    }
    const asked = days
    try {
      const r = await api.get('/api/stats?days=' + days)
      if (!alive || asked !== days) return
      const changed = store.keep(key, r)
      last = r
      if (changed || !kept) draw(r, !kept)
    } catch (error) {
      if (!kept) fill(content, h('div.empty', h('span.empty-icon', ic('circleAlert', 26, 1.8)), h('b', 'Can’t load insights'), h('p', error.message), h('button.btn.small', { type: 'button', onclick: load }, 'Try again')))
    }
    content.classList.remove('stale')
  }

  // Tracked links: each one's visitors, scans of its code, and bookings.
  // Tags someone typed by hand show too, in grey, until they're saved.
  function linksCard(r) {
    const saved = state.me.host.tags || []
    const rows = (r.tags || []).length ? r.tags : saved.map((x) => ({ ...x, views: 0, visitors: 0, scans: 0, picks: 0, bookings: 0, requests: 0 }))
    const create = async () => { if (await newLink(r.events || [])) { store.drop(mine('stats:' + days)); load() } }
    const open = async (row) => {
      const link = saved.find((x) => x.tag === row.tag)
      if (!link) return
      if (await showLink(link, row)) { store.drop(mine('stats:' + days)); load() }
    }
    return h('section.ins-card.links-card',
      h('div.card-head',
        h('div.grow', h('h2', 'Tracked links'), h('p.ins-sub', 'Your link with a tag on the end, one for each place you share it')),
        h('button.btn.small.tinted', { type: 'button', onclick: create }, ic('plus', 15, 2.4), 'New link')),
      rows.length
        ? h('div.link-table',
          h('div.lk-tr.head', h('span', 'Link'), h('span', 'Visitors'), h('span', 'Scans'), h('span', 'Booked')),
          rows.map((x) => {
            const isSaved = saved.some((y) => y.tag === x.tag)
            const cells = [
              h('span.lk-name', h('span.lk-icon', ic(isSaved ? 'qrCode' : 'tag', 16, 2)), h('span.lk-text', h('b.trunc', isSaved ? x.label : x.tag), h('small.trunc', isSaved ? `?ref=${x.tag}${x.slug ? ' · /' + x.slug : ''}` : 'Not saved'))),
              h('span.num', fmt(x.visitors)), h('span.num', fmt(x.scans)), h('span.num' + (x.bookings ? '.strong' : ''), fmt(x.bookings))
            ]
            return isSaved ? h('button.lk-tr', { type: 'button', onclick: () => open(x) }, cells) : h('div.lk-tr.unsaved', cells)
          }))
        : h('div.links-empty', ic('qrCode', 22, 1.9), h('p', 'Make a link for a flyer, a newsletter or a talk. Its visits, scans and bookings show here, apart from the rest.')))
  }

  function place(zone) {
    const c = countries && countries.COUNTRY[countries.ZONE[zone]]
    if (zone === 'other') return 'Elsewhere'
    return c ? `${city(zone)}, ${c}` : city(zone)
  }

  function delta(cur, prev) {
    if (!prev && !cur) return h('span.delta', '–')
    if (!prev) return h('span.delta.up', 'New')
    const d = Math.round(((cur - prev) / prev) * 100)
    if (!d) return h('span.delta', 'Same as before')
    return h('span.delta' + (d > 0 ? '.up' : '.down'), `${d > 0 ? '+' : '−'}${Math.abs(d)}%`)
  }

  function tile(label, value, sub) {
    return h('div.kpi', h('span.kpi-label', label), h('b.kpi-value.num', value), h('span.kpi-sub', sub))
  }

  function bars(rows, total, { icon = null } = {}) {
    if (!rows.length) return h('p.panel-empty', 'Nothing yet.')
    const top = Math.max(...rows.map((r) => r.n))
    return h('div.bar-rows', rows.map((r, i) => h('div.bar-row', { title: `${fmt(r.n)}`, style: { '--i': String(i) } },
      h('div.bar-head', h('span.bar-name', r.icon ? ic(r.icon, 15, 2) : null, r.dot ? h('i.ev-dot', { style: { '--event': r.dot } }) : null, h('span.trunc', r.label)), h('span.bar-val.num', total ? pct(r.n, total) : fmt(r.n))),
      h('div.bar-track', h('span', { style: { width: `${Math.max(2, (r.n / top) * 100)}%` } })))))
  }

  function panel(title, sub, body) {
    return h('section.ins-card', h('h2', title), sub ? h('p.ins-sub', sub) : null, body)
  }

  function chart(series, totals) {
    const n = series.length
    const top = niceTop(Math.max(0, ...series.map((d) => d.views)))
    const tip = h('p.chart-tip.num')
    const rest = () => fill(tip, h('b', `${fmt(totals.views)} views`), ` over ${days} days`, totals.bookings ? `, ${fmt(totals.bookings)} booked` : '')
    rest()
    const cols = series.map((d, i) => h('div.cb', { 'data-i': String(i) },
      d.bookings ? h('i.cb-dot', { title: `${d.bookings} booked` }) : null,
      h('span.cb-bar' + (d.views ? '' : '.zero'), { style: { height: `${d.views ? Math.max(1.5, (d.views / top) * 100) : 0}%`, '--i': String(i) } })))
    const plot = h('div.cb-plot', { style: { gap: n > 60 ? '1px' : n > 14 ? '3px' : '10px' } }, cols)
    const label = (key) => t.shortDay(Date.parse(key + 'T12:00:00Z'), 'UTC')
    const pointAt = (x) => {
      const r = plot.getBoundingClientRect()
      const i = Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)))
      plot.dataset.hover = 'on'
      cols.forEach((c, j) => c.classList.toggle('on', j === i))
      const d = series[i]
      fill(tip, h('b', label(d.day)), ` · ${fmt(d.views)} ${d.views === 1 ? 'view' : 'views'} · ${fmt(d.visitors)} ${d.visitors === 1 ? 'visitor' : 'visitors'}`, d.bookings ? ` · ${d.bookings} booked` : '')
    }
    plot.addEventListener('pointermove', (e) => pointAt(e.clientX))
    plot.addEventListener('pointerdown', (e) => pointAt(e.clientX))
    plot.addEventListener('pointerleave', () => { delete plot.dataset.hover; cols.forEach((c) => c.classList.remove('on')); rest() })
    return h('section.ins-card.chart-card',
      h('div.chart-head', h('h2', 'Views by day'),
        h('div.chart-legend', h('span', h('i.lg-bar'), 'Views'), h('span', h('i.lg-dot'), 'A booking'))),
      tip,
      h('div.chart', { role: 'img', 'aria-label': `Page views per day for the last ${days} days: ${fmt(totals.views)} in all.` },
        h('div.cb-grid', [1, .5, 0].map((f) => h('div', h('span.num', fmt(top * f))))),
        plot),
      h('div.cb-axis', h('span', label(series[0].day)), n > 14 ? h('span', label(series[Math.floor(n / 2)].day)) : null, h('span', 'Today')))
  }

  function draw(r, enter = false) {
    const T = r.totals || {}
    const P = r.previous || {}
    content.classList.toggle('enter', enter)
    if (enter) setTimeout(() => content.classList.remove('enter'), 900)
    if (!T.views && !T.bookings && !T.requests) {
      fill(content, h('div.empty.ins-empty',
        h('span.empty-icon', ic('chartColumn', 28, 1.8)),
        h('b', 'No visits yet'),
        h('p', `When people open your page, you’ll see where they came from, what they opened it on and who booked, for the last ${days} days.`),
        h('button.btn.small.tinted', { type: 'button', onclick: () => share(host().handle) }, ic('share', 15, 2.2), 'Share your link')),
      linksCard(r))
      return
    }
    const sources = (r.sources || []).map((x) => ({ label: source(x.key), n: x.n }))
    const devices = (r.devices || []).filter((x) => x.n).map((x) => ({ label: (DEVICES[x.key] || [x.key])[0], icon: (DEVICES[x.key] || [])[1] || null, n: x.n }))
    const zones = (r.zones || []).map((x) => ({ label: place(x.key), n: x.n }))
    const linkRows = (r.links || []).map((x) => { const k = String(x.key).replace(/^link:/, ''); return { label: LINKS[k] || k, n: x.n } })
    const eventRows = (r.events || []).filter((e) => e.clicks).map((e) => ({ label: e.title, dot: colorOf(e.color), n: e.clicks }))
    const clicks = [...eventRows, ...linkRows].sort((a, b) => b.n - a.n).slice(0, 8)
    const visitors = T.visitors || 0
    const funnel = [['Visited', visitors], ['Picked a time', T.picks || 0], ['Booked', T.bookings || 0]]
    fill(content,
      h('div.kpis',
        tile('Page views', fmt(T.views), delta(T.views, P.views)),
        tile('Visitors', fmt(visitors), delta(visitors, P.visitors)),
        tile('Profile clicks', fmt(T.clicks), delta(T.clicks, P.clicks)),
        tile('Bookings', fmt(T.bookings), T.requests ? h('span.delta', `and ${fmt(T.requests)} ${T.requests === 1 ? 'request' : 'requests'}`) : delta(T.bookings, P.bookings)),
        tile('Time on page', duration(T.timeAvg), h('span.delta', 'average per visit'))),
      chart(r.series || [], T),
      linksCard(r),
      h('div.ins-grid',
        panel('Where they come from', 'The site that sent each visitor, or direct', bars(sources, sources.reduce((n, x) => n + x.n, 0))),
        panel('Devices', 'What they opened your page on', bars(devices, devices.reduce((n, x) => n + x.n, 0))),
        panel('Where they are', 'From their time zone, never their address', bars(zones, zones.reduce((n, x) => n + x.n, 0))),
        panel('Profile clicks', 'What people tapped on your page', clicks.length ? bars(clicks, 0) : h('p.panel-empty', 'No clicks yet. Add your website and profiles so there’s something to tap.'))),
      h('div.ins-grid.two',
        panel('From a visit to a booking', `${pct(T.bookings || 0, visitors)} of visitors booked`,
          h('div.funnel', funnel.map(([label, n], i) => h('div.fn-row', { style: { '--i': String(i) } },
            h('span.fn-label', label),
            h('span.fn-track', h('span', { style: { width: `${visitors ? Math.max(1.5, Math.min(100, (n / visitors) * 100)) : 0}%`, opacity: String(.35 + i * .3) } }), h('b.num', fmt(n))),
            h('span.fn-rate.num', i ? pct(n, funnel[i - 1][1]) : ''))))),
        panel('Event types', 'Views of each booking page, and how many booked',
          (r.events || []).length ? h('div.ev-table',
            h('div.ev-tr.head', h('span', 'Event'), h('span', 'Views'), h('span', 'Booked'), h('span', 'Rate')),
            (r.events || []).map((e) => h('div.ev-tr', h('span.ev-name', h('i.ev-dot', { style: { '--event': colorOf(e.color) } }), h('span.trunc', e.title)), h('span.num', fmt(e.views)), h('span.num', fmt(e.bookings)), h('span.num.quiet', pct(e.bookings, e.views))))) : h('p.panel-empty', 'Nothing yet.'))))
  }

  load()
  return { el, refresh: load, leave: () => { alive = false } }
}
