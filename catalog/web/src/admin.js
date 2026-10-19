// /admin: for the node's owner and admins. Show or hide apps, see light
// numbers, approve reviews and choose the site's tint.
import { el, api, icon, stars, date, applyTint } from './lib.js'
import { viewer, signIn } from './account.js'

const TINTS = [
  ['Teal', '#0e7c66'], ['Prussian', '#173a72'], ['Indigo', '#4338ca'],
  ['Plum', '#7a3e72'], ['Ember', '#b4441f'], ['Graphite', '#3d4a52']
]
let filter = 'pending'

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const numbers = row => `${plural(row.view, 'view')}, ${plural(row.get, 'Get')}, ${plural(row.copy, 'copied command')}`

// Contrast against the page, so a pale custom tint gets a warning.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const readable = hex => (luminance('#f2f5f4') + 0.05) / (luminance(hex) + 0.05) >= 3

export async function adminPage(main, show) {
  document.title = 'Admin – Unofficial Holm apps'
  const { me, admin } = viewer()
  if (!me) {
    return show(el('section', { class: 'masthead' }, el('h1', {}, 'Admin'),
      el('p', { class: 'lede' }, 'Sign in to manage the store.'),
      el('p', {}, el('button', { type: 'button', class: 'button primary', onclick: () => signIn().catch(() => {}) }, 'Sign in'))))
  }
  if (!admin) {
    return show(el('section', { class: 'masthead' }, el('h1', {}, 'Admin'),
      el('p', { class: 'lede' }, 'Only the node’s owner and admins can manage this store.')))
  }
  show(el('section', { class: 'masthead' }, el('h1', {}, 'Admin'), el('p', { class: 'lede' }, 'Loading…')))
  let data
  try {
    data = await api('GET', '/api/admin')
  } catch (problem) {
    return show(el('section', { class: 'masthead' }, el('h1', {}, 'Admin'), el('p', { class: 'notice' }, problem.message)))
  }
  const paint = () => show(el('div', { class: 'admin' },
    el('section', { class: 'masthead' }, el('h1', {}, 'Admin'),
      el('p', { class: 'lede' }, 'Choose what the store shows, approve reviews and set its colour.')),
    appsSection(data, paint),
    reviewsSection(data, paint),
    tintSection(data, paint)))
  paint()
}

function appsSection(data, paint) {
  const hidden = new Set(data.settings.hidden)
  const empty = { view: 0, get: 0, copy: 0 }
  return el('section', {},
    el('h2', {}, 'Apps'),
    el('p', { class: 'numbers' }, 'Views count once per visitor per tab; Gets and copied commands count every time. Admins aren’t counted.'),
    data.apps.map(app => {
      const shown = !hidden.has(app.path)
      const row = data.stats[app.path] || { week: empty, month: empty }
      const toggle = el('button', {
        type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(shown),
        'aria-label': `Show ${app.title} in the store`,
        onclick: async () => {
          const next = new Set(hidden)
          shown ? next.add(app.path) : next.delete(app.path)
          toggle.disabled = true
          try {
            data.settings = (await api('PUT', '/api/admin/settings', { hidden: [...next] })).settings
          } catch (problem) { alert(problem.message) }
          paint()
        }
      })
      return el('div', { class: 'admin-app' },
        icon(app, 's'),
        el('div', {},
          el('strong', {}, app.title), el('span', { class: 'version' }, 'v' + app.version),
          el('p', { class: 'numbers' }, 'This week: ', numbers(row.week), '.'),
          el('p', { class: 'numbers' }, 'Last 30 days: ', numbers(row.month), '.')),
        el('span', { class: 'switch-label' }, shown ? 'Shown' : 'Hidden'),
        toggle)
    }))
}

function reviewsSection(data, paint) {
  const groups = { pending: [], approved: [], rejected: [] }
  for (const review of data.reviews) (groups[review.status] || groups.pending).push(review)
  const titles = Object.fromEntries(data.apps.map(app => [app.path, app.title]))
  const labels = { pending: 'Waiting', approved: 'Published', rejected: 'Rejected' }
  const act = async (review, method, status) => {
    try {
      if (method === 'DELETE') {
        if (!confirm('Delete this review for good?')) return
        await api('DELETE', '/api/admin/reviews/' + review.id)
        data.reviews = data.reviews.filter(other => other.id !== review.id)
      } else {
        const updated = (await api('POST', '/api/admin/reviews/' + review.id, { status })).review
        data.reviews = data.reviews.map(other => other.id === review.id ? updated : other)
      }
    } catch (problem) { alert(problem.message) }
    paint()
  }
  const actions = review => [
    review.status !== 'approved' && el('button', { type: 'button', class: 'button primary', onclick: () => act(review, 'POST', 'approved') }, 'Approve'),
    review.status === 'pending' && el('button', { type: 'button', class: 'button', onclick: () => act(review, 'POST', 'rejected') }, 'Reject'),
    review.status === 'approved' && el('button', { type: 'button', class: 'button', onclick: () => act(review, 'POST', 'pending') }, 'Unpublish'),
    el('button', { type: 'button', class: 'button danger', onclick: () => act(review, 'DELETE') }, 'Delete')
  ].filter(Boolean)
  const list = groups[filter]
  return el('section', {},
    el('h2', {}, 'Reviews'),
    el('div', { class: 'filter', role: 'group', 'aria-label': 'Show reviews' },
      Object.keys(labels).map(key => el('button', {
        type: 'button', 'aria-pressed': String(key === filter),
        onclick: () => { filter = key; paint() }
      }, `${labels[key]} (${groups[key].length})`))),
    list.length
      ? el('ul', { class: 'review-list' }, list.map(review => el('li', { class: 'review' },
          el('div', { class: 'review-top' },
            el('h3', {}, review.title || 'Review'),
            el('time', { datetime: review.date }, date(review.date))),
          el('span', { class: 'app-name' }, titles[review.app] || review.app), ' ', stars(review.rating),
          review.body && el('p', {}, review.body),
          el('div', { class: 'review-by' }, el('img', { src: review.avatar, alt: '', referrerpolicy: 'no-referrer' }), review.name),
          el('div', { class: 'review-actions' }, actions(review)))))
      : el('p', { class: 'numbers' }, filter === 'pending' ? 'Nothing waiting for approval.' : 'None yet.'))
}

function tintSection(data, paint) {
  const saved = data.settings.tint
  let chosen = getComputedStyle(document.documentElement).getPropertyValue('--tint').trim() || saved
  const status = el('p', { class: 'numbers', role: 'status' })
  const save = el('button', { type: 'button', class: 'button primary', onclick: async () => {
    save.disabled = true
    try {
      data.settings = (await api('PUT', '/api/admin/settings', { tint: chosen })).settings
      applyTint(data.settings.tint)
      status.textContent = 'Saved. Everyone now sees this colour.'
    } catch (problem) { status.textContent = problem.message }
    save.disabled = false
  } }, 'Save colour')
  const choose = hex => {
    chosen = hex.toLowerCase()
    document.documentElement.style.setProperty('--tint', chosen)
    status.textContent = readable(chosen) ? (chosen === saved ? '' : 'Previewing. Save to show it to everyone.') : 'This colour is hard to read on the page. Try a darker one.'
    swatches.querySelectorAll('.swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === chosen)))
    picker.value = chosen
  }
  const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Tints' },
    TINTS.map(([name, hex]) => el('button', {
      type: 'button', class: 'swatch', style: `--color: ${hex}`, 'data-color': hex,
      'aria-label': name, 'aria-pressed': String(hex === chosen), title: name, onclick: () => choose(hex)
    })))
  const picker = el('input', { type: 'color', value: chosen, 'aria-label': 'Custom colour' })
  picker.addEventListener('input', () => choose(picker.value))
  return el('section', {},
    el('h2', {}, 'Colour'),
    el('p', { class: 'numbers' }, 'The tint of links, buttons and highlights across the store. Apps keep their own colours.'),
    swatches,
    el('label', { class: 'custom-color' }, picker, 'Custom'),
    el('div', { class: 'preview' },
      el('button', { type: 'button', class: 'get', tabindex: '-1' }, 'Get'),
      el('a', { href: '#', onclick: event => event.preventDefault(), tabindex: '-1' }, 'A link'),
      el('button', { type: 'button', class: 'button primary', tabindex: '-1' }, 'A button')),
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'button', onclick: () => { choose(saved); status.textContent = '' } }, 'Reset'),
      save),
    status)
}
