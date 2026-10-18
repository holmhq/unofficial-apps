// Stats: how many people saw a form and how many sent something, per day,
// for one project or every project an owner has. Counts are of events, not
// people; api/stats.js keeps them.
import { el, api, store, glyph, KIND } from './lib.js'
import { show } from './app.js'

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']]
const ns = 'http://www.w3.org/2000/svg'
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(ns, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}
const number = n => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K' : n.toLocaleString()
const dayLabel = (day, long) => new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
// "Saw the form" is a page visit or an opened panel.
const seen = (daily, i) => daily.visits[i] + daily.opens[i]

export function statsPage() {
  document.title = 'Stats – feedback'
  show(
    el('section', { class: 'page-head' },
      el('h1', {}, 'Stats'),
      el('p', { class: 'lede' }, 'How many people saw your forms and how many sent something, across every project.')),
    statsView({}))
}

export function statsView({ project }) {
  let days = store.get('range', 30)
  const root = el('div', { class: 'stats' })
  const body = el('div', { class: 'stats-body' }, el('p', { class: 'muted' }, 'Loading…'))
  const ranges = el('div', { class: 'chips', role: 'group', 'aria-label': 'Date range' })
  const paintRanges = () => ranges.replaceChildren(...RANGES.map(([n, label]) => el('button', {
    type: 'button', 'aria-pressed': String(n === days), onclick: () => { days = n; store.set('range', n); paintRanges(); load() }
  }, label)))
  const load = async () => {
    body.classList.add('refreshing')
    try {
      const data = await api('GET', project ? `/api/projects/${project.id}/stats?days=${days}` : `/api/stats?days=${days}`)
      body.replaceChildren(...render(data, project))
    } catch (problem) {
      body.replaceChildren(el('p', { class: 'form-error' }, problem.message))
    }
    body.classList.remove('refreshing')
  }
  paintRanges()
  root.append(ranges, body)
  load()
  return root
}

function render(data, project) {
  const { totals, daily } = data
  const sawTotal = totals.visits + totals.opens
  const tile = (label, value, note, lead) => el('div', { class: lead ? 'tile lead' : 'tile' },
    el('span', { class: 'tile-label' }, label), el('strong', {}, number(value)), note && el('span', { class: 'tile-note' }, note))
  const parts = [
    el('div', { class: 'tiles' },
      tile('Sent', totals.sent, sawTotal ? `${Math.round(totals.sent / sawTotal * 100)}% of those who saw a form` : 'Nobody has seen a form yet', true),
      tile('Opened the form', totals.opens, 'On your sites'),
      tile('Page visits', totals.visits, totals.scans || totals.emails
        ? `${number(totals.scans)} scanned a QR code, ${number(totals.emails)} came from email`
        : 'Your feedback page'),
      tile('Votes', totals.votes),
      tile('Comments', totals.comments)),
    chart(data)
  ]
  if (project) {
    parts.push(el('div', { class: 'breakdowns' },
      bars('Where it came from', data.pages.map(entry => [entry.page, entry.count]), 'Nothing sent in this range.'),
      bars('What kind', Object.entries(data.kinds).map(([kind, n]) => [KIND[kind], n]), 'Nothing sent in this range.')),
      ratings(data.ratings || []))
  } else if (data.projects.length) {
    parts.push(el('section', { class: 'by-project' },
      el('h2', {}, 'By project'),
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Project'), ['Saw', 'Sent', 'Votes', 'Comments'].map(label => el('th', { scope: 'col', class: 'num' }, label)))),
        el('tbody', {}, data.projects.map(entry => el('tr', {},
          el('th', { scope: 'row' }, el('a', { href: `/projects/${entry.id}/stats`, 'data-link': true }, el('span', { class: 'swatch', style: `--color: ${entry.color}` }), entry.name)),
          [entry.totals.visits + entry.totals.opens, entry.totals.sent, entry.totals.votes, entry.totals.comments].map(n => el('td', { class: 'num' }, number(n)))))))))
  }
  return parts
}

// The stars people gave: their average, and how many gave each.
function ratings(counts) {
  const total = counts.reduce((sum, n) => sum + n, 0)
  if (!total) return null
  const average = counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / total
  return el('section', { class: 'ratings' },
    el('div', { class: 'rating-average' },
      el('span', { class: 'tile-label' }, 'Average rating'),
      el('strong', {}, average.toFixed(1)),
      el('span', { class: 'stars-row', role: 'img', 'aria-label': `${average.toFixed(1)} out of 5` },
        [1, 2, 3, 4, 5].map(n => glyph('star', n <= Math.round(average) ? 'glyph lit' : 'glyph'))),
      el('span', { class: 'tile-note' }, `From ${number(total)} ${total === 1 ? 'rating' : 'ratings'}`)),
    bars('Stars given', [5, 4, 3, 2, 1].map(n => [`${n} ${n === 1 ? 'star' : 'stars'}`, counts[n - 1]]), ''))
}

// A single-series bar list: label, a thin bar, the count.
function bars(title, rows, empty) {
  const max = Math.max(1, ...rows.map(([, n]) => n))
  const shown = rows.filter(([, n]) => n > 0)
  return el('section', { class: 'bars' },
    el('h2', {}, title),
    shown.length ? el('ul', {}, shown.map(([label, n]) => el('li', {},
      el('span', { class: 'bar-label' }, label),
      el('span', { class: 'bar-track' }, el('span', { class: 'bar', style: `width: ${Math.max(2, n / max * 100)}%` })),
      el('span', { class: 'bar-value' }, number(n))))) : el('p', { class: 'muted' }, empty))
}

// Two lines on one axis: everyone who saw a form (context, grey) and what
// was sent (the accent). A crosshair reads out every count for a day, by
// pointer or arrow keys, and the table below holds the same numbers.
function chart(data) {
  const { days, daily } = data
  const saw = days.map((_, i) => seen(daily, i))
  const sent = daily.sent
  const top = Math.max(4, ...saw, ...sent)
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find(s => top / s <= 4) || Math.ceil(top / 4)
  const max = Math.ceil(top / step) * step

  const frame = el('div', { class: 'chart-frame' })
  const tip = el('div', { class: 'chart-tip', hidden: true })
  const figure = el('figure', { class: 'chart' },
    el('figcaption', {},
      el('h2', {}, 'Seen and sent, per day'),
      el('span', { class: 'legend' },
        el('span', { class: 'key sent' }, 'Sent'),
        el('span', { class: 'key saw' }, 'Saw a form'))),
    frame,
    el('details', { class: 'chart-table' },
      el('summary', {}, 'Show as a table'),
      el('table', {},
        el('thead', {}, el('tr', {}, ['Day', 'Visits', 'Scans', 'Email', 'Opens', 'Sent', 'Votes', 'Comments'].map((label, i) => el('th', { scope: 'col', class: i ? 'num' : null }, label)))),
        el('tbody', {}, days.map((day, i) => el('tr', {},
          el('th', { scope: 'row' }, dayLabel(day, true)),
          ['visits', 'scans', 'emails', 'opens', 'sent', 'votes', 'comments'].map(metric => el('td', { class: 'num' }, daily[metric][i]))))))))

  let index = null
  const draw = () => {
    const width = Math.max(260, frame.clientWidth || 600), height = 220
    const m = { left: 34, right: 10, top: 10, bottom: 26 }
    const w = width - m.left - m.right, h = height - m.top - m.bottom
    const x = i => m.left + (days.length === 1 ? w / 2 : i / (days.length - 1) * w)
    const y = v => m.top + h - v / max * h
    const plot = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', tabindex: '0', role: 'img',
      'aria-label': `Per day over ${days.length} days: ${saw.reduce((a, b) => a + b, 0)} saw a form and ${sent.reduce((a, b) => a + b, 0)} sent something. Use the arrow keys to read each day.` })
    for (let v = 0; v <= max; v += step) {
      plot.append(svg('line', { x1: m.left, x2: width - m.right, y1: y(v), y2: y(v), class: 'grid' }))
      const label = svg('text', { x: m.left - 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' })
      label.textContent = number(v)
      plot.append(label)
    }
    for (const i of [0, Math.floor((days.length - 1) / 2), days.length - 1]) {
      const label = svg('text', { x: x(i), y: height - 6, class: 'tick', 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle' })
      label.textContent = dayLabel(days[i])
      plot.append(label)
    }
    const line = values => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
    plot.append(svg('path', { d: `${line(sent)}L${x(days.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`, class: 'area sent' }))
    plot.append(svg('path', { d: line(saw), class: 'line saw' }))
    plot.append(svg('path', { d: line(sent), class: 'line sent' }))
    const last = days.length - 1
    plot.append(svg('circle', { cx: x(last), cy: y(saw[last]), r: 4, class: 'dot saw' }))
    plot.append(svg('circle', { cx: x(last), cy: y(sent[last]), r: 4, class: 'dot sent' }))
    const cross = svg('line', { y1: m.top, y2: m.top + h, class: 'cross', visibility: 'hidden' })
    const sawDot = svg('circle', { r: 4, class: 'dot saw', visibility: 'hidden' })
    const sentDot = svg('circle', { r: 4, class: 'dot sent', visibility: 'hidden' })
    plot.append(cross, sawDot, sentDot)
    const hit = svg('rect', { x: m.left - 6, y: 0, width: w + 12, height, fill: 'transparent' })
    plot.append(hit)

    const point = i => {
      index = i
      if (i == null) { tip.hidden = true; [cross, sawDot, sentDot].forEach(node => node.setAttribute('visibility', 'hidden')); return }
      for (const [node, attrs] of [[cross, { x1: x(i), x2: x(i) }], [sawDot, { cx: x(i), cy: y(saw[i]) }], [sentDot, { cx: x(i), cy: y(sent[i]) }]]) {
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
        node.setAttribute('visibility', 'visible')
      }
      tip.replaceChildren(
        el('span', { class: 'tip-day' }, dayLabel(days[i], true)),
        el('span', { class: 'tip-row sent' }, el('strong', {}, sent[i]), ' sent'),
        el('span', { class: 'tip-row saw' }, el('strong', {}, saw[i]), ' saw a form'),
        el('span', { class: 'tip-more' }, `${daily.visits[i]} page ${daily.visits[i] === 1 ? 'visit' : 'visits'} (${daily.scans[i]} by QR), ${daily.opens[i]} ${daily.opens[i] === 1 ? 'open' : 'opens'}, ${daily.votes[i]} ${daily.votes[i] === 1 ? 'vote' : 'votes'}`))
      tip.hidden = false
      const left = x(i), flip = left > width - 170
      tip.style.left = flip ? '' : `${left + 12}px`
      tip.style.right = flip ? `${width - left + 12}px` : ''
    }
    const nearest = event => {
      const box = plot.getBoundingClientRect()
      const px = (event.clientX - box.left) / box.width * width
      return Math.max(0, Math.min(days.length - 1, Math.round((px - m.left) / (w || 1) * (days.length - 1))))
    }
    hit.addEventListener('pointermove', event => point(nearest(event)))
    hit.addEventListener('pointerdown', event => point(nearest(event)))
    plot.addEventListener('pointerleave', () => point(null))
    plot.addEventListener('blur', () => point(null))
    plot.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const at = index ?? last
      point(event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, at + (event.key === 'ArrowLeft' ? -1 : 1))))
    })
    frame.replaceChildren(plot, tip)
  }
  // Drawn at the frame's real width, and again when that changes.
  new ResizeObserver(() => draw()).observe(frame)
  return figure
}
