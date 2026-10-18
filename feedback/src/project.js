// A project: its inbox, one item at a time, its stats, its look, its form,
// how to share it and how to set it up.
import { el, api, ago, glyph, store, size, inkOn, lighten, picker, segmented, codeBox, STATUS, KIND, KIND_SETS } from './lib.js'
import { show, go } from './app.js'
import { statsView } from './stats.js'
import { qrSVG, qrColor, poster } from './qr.js'
import { ratingLabel } from './compose.js'
import { ICON_NAMES, icon, mark } from './icons.js'

const OPEN = ['new', 'planned', 'progress']
const FILTERS = [['open', 'Open'], ['new', 'New'], ['planned', 'Planned'], ['progress', 'In progress'], ['done', 'Done'], ['closed', 'Closed'], ['all', 'All']]
const COLORS = ['#c2410c', '#b42318', '#be185d', '#7c3aed', '#1d4ed8', '#0e7c66', '#26233a']
const TABS = [['inbox', 'Inbox', ''], ['stats', 'Stats', '/stats'], ['design', 'Design', '/design'], ['form', 'Form', '/form'], ['share', 'Share', '/share'], ['setup', 'Set up', '/setup']]
const QUESTION_TYPES = [
  { value: 'text', label: 'Short answer', icon: 'short', hint: 'A line of text' },
  { value: 'select', label: 'Dropdown', icon: 'dropdown', hint: 'One from a list' },
  { value: 'radio', label: 'One choice', icon: 'radio', hint: 'Buttons; pick one' },
  { value: 'checkbox', label: 'Checkboxes', icon: 'boxes', hint: 'Pick any, or one box to tick' }]
const ASK = [{ value: 'off', label: 'Off' }, { value: 'optional', label: 'Optional' }, { value: 'required', label: 'Required' }]
const BUTTON_STYLES = [{ value: 'pill', label: 'Text', icon: 'button-pill' }, { value: 'icon', label: 'Icon', icon: 'button-icon' }, { value: 'none', label: 'Your link', icon: 'link' }]
const SIDES = [{ value: 'left', label: 'Left', icon: 'side-left' }, { value: 'right', label: 'Right', icon: 'side-right' }]
const THEMES = [{ value: 'light', label: 'Light', icon: 'sun', line: false }, { value: 'dark', label: 'Dark', icon: 'moon', line: false }, { value: 'auto', label: 'Auto', icon: 'system', line: false }]

const pageURL = project => `${location.origin}/${project.slug || 'b/' + project.id}`

// The project's head and tabs are drawn once; each tab swaps only what's
// below them. `shell.ticket` drops replies from a tab already left.
let shell = null

function frame(project) {
  const title = el('h1', {}, project.name)
  const nav = el('nav', { class: 'tabs', 'aria-label': project.name },
    TABS.map(([key, label, path]) => el('a', { href: `/projects/${project.id}${path}`, 'data-link': true, 'data-tab': key }, label)))
  const body = el('div', { class: 'project-body' })
  const root = el('div', {},
    el('section', { class: 'page-head' },
      el('a', { class: 'back', href: '/', 'data-link': true }, glyph('chevron'), 'Projects'),
      title, nav),
    body)
  return { project, items: null, ticket: 0, root, title, nav, body }
}

// Optional parts pass false or undefined; leave them out.
const put = (...parts) => shell.body.replaceChildren(...parts.flat(Infinity).filter(Boolean))

// After a rename, the head follows.
function renamed(project) {
  shell.project = project
  shell.title.textContent = project.name
  shell.nav.setAttribute('aria-label', project.name)
  document.title = `${project.name} – feedback`
}

// A ticket stub: the item's number and kind on a perforated edge, in the
// colour of its status, like a carbon copy.
function stub(item) {
  return el('span', { class: `stub status-${item.status}` },
    glyph(item.kind), el('span', { class: 'number' }, '#' + item.number))
}

export async function projectPage(id, view) {
  if (!shell || shell.project.id !== id || !shell.root.isConnected) {
    show(el('p', { class: 'muted page-loading' }, 'Loading…'))
    try {
      shell = frame((await api('GET', '/api/projects/' + id)).project)
    } catch (problem) {
      shell = null
      return show(el('section', { class: 'page-head' }, el('h1', {}, 'Not found'), el('p', { class: 'lede' }, problem.message, ' ',
        el('a', { href: '/', 'data-link': true }, 'Your projects'), '.')))
    }
    show(shell.root)
  }
  const ticket = ++shell.ticket
  const tab = typeof view === 'number' ? 'inbox' : view === 'settings' ? 'setup' : view
  shell.nav.querySelectorAll('a').forEach(link => link.dataset.tab === tab ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'))
  const { project } = shell
  document.title = `${project.name} – feedback`
  if (view === 'setup' || view === 'settings') return setup(project)
  if (view === 'design') return design(project)
  if (view === 'form') return formTab(project)
  if (view === 'share') return share(project)
  if (view === 'stats') return put(statsView({ project }))

  // The inbox and its items: draw what's known at once, then again only if
  // a fresh copy differs.
  const draw = items => {
    const item = typeof view === 'number' && items.find(entry => entry.number === view)
    return item ? itemPage(project, item) : inbox(project, items)
  }
  const known = shell.items
  if (known) draw(known)
  else put(el('p', { class: 'muted page-loading' }, 'Loading…'))
  try {
    const { items } = await api('GET', `/api/projects/${id}/items`)
    if (ticket !== shell.ticket) return
    shell.items = items
    if (!known || JSON.stringify(known) !== JSON.stringify(items)) draw(items)
  } catch (problem) {
    if (ticket === shell.ticket && !known) put(el('p', { class: 'form-error' }, problem.message))
  }
}

// An answer as words: a value, a list, or a ticked box's question.
const answerText = answer => answer.value === true ? answer.label : Array.isArray(answer.value) ? answer.value.join(', ') : answer.value
const choiceFields = project => project.fields.filter(field => field.type !== 'text' && field.options.length)

// How the inbox sorts, and how far back it looks.
const SORTS = [
  { value: 'new', label: 'Newest first' }, { value: 'old', label: 'Oldest first' },
  { value: 'votes', label: 'Most votes' }, { value: 'active', label: 'Recently changed' },
  { value: 'high', label: 'Highest rated' }, { value: 'low', label: 'Lowest rated' }]
const TIMES = [{ value: 'today', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]
const PAGE = 50
const time = value => Date.parse(value) || 0
const ORDER = {
  new: (a, b) => time(b.createdAt) - time(a.createdAt),
  old: (a, b) => time(a.createdAt) - time(b.createdAt),
  votes: (a, b) => b.votes - a.votes || ORDER.new(a, b),
  active: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  high: (a, b) => (b.rating || 0) - (a.rating || 0) || ORDER.new(a, b),
  low: (a, b) => (a.rating || 6) - (b.rating || 6) || ORDER.new(a, b)
}
// Where an item came from: the feedback page, or the site that sent it.
const sourceOf = item => {
  if (item.source === 'page') return 'page'
  try { return new URL(item.page).origin } catch { return 'unknown' }
}
const sourceName = source => source === 'page' ? 'Your feedback page' : source === 'unknown' ? 'An unknown page' : source.replace(/^https?:\/\//, '')

// "/" jumps to the inbox's search box.
document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, textarea, select, [contenteditable]')) return
  const box = document.querySelector('.filters input[type="search"]')
  if (box) { event.preventDefault(); box.focus() }
})

// The inbox: search, sort, filters that each say how many they'd leave, and
// the list fifty at a time.
function inbox(project, items) {
  let filter = store.get('filter', 'open')
  let sort = store.get('sort', 'new')
  let limit = PAGE
  // Filters beyond status last while you move between tabs.
  const blank = () => ({ project: project.id, kind: '', rating: '', time: '', from: '', photos: false, contact: false, shown: false, waiting: false, text: '', answers: {} })
  const more = shell.filters?.project === project.id ? shell.filters : (shell.filters = blank())
  const list = el('ul', { class: 'tickets' })
  const chips = el('div', { class: 'chips inbox-chips', role: 'group', 'aria-label': 'Filter by status' })
  const summary = el('p', { class: 'inbox-summary', role: 'status' })
  const moreButton = el('button', { type: 'button', class: 'button show-more', onclick: () => { limit += PAGE; paint() } })
  const matchesStatus = (item, key) => key === 'all' || (key === 'open' ? OPEN.includes(item.status) : item.status === key)
  const since = () => {
    if (!more.time) return 0
    if (more.time === 'today') { const day = new Date(); day.setHours(0, 0, 0, 0); return day.getTime() }
    return Date.now() - Number(more.time) * 86400000
  }
  const matchesMore = item => {
    if (more.kind && item.kind !== more.kind) return false
    if (more.rating && String(item.rating) !== more.rating) return false
    if (more.time && time(item.createdAt) < since()) return false
    if (more.from && sourceOf(item) !== more.from) return false
    if (more.photos && !item.files.some(file => file.kind === 'image')) return false
    if (more.contact && !item.email && !item.phone) return false
    if (more.shown && !item.public) return false
    if (more.waiting && !item.pending) return false
    for (const [id, wanted] of Object.entries(more.answers)) {
      if (!wanted) continue
      const answer = item.answers.find(entry => entry.id === id)
      if (!answer || !(Array.isArray(answer.value) ? answer.value.includes(wanted) : answer.value === wanted)) return false
    }
    if (more.text) {
      const words = more.text.toLowerCase().split(/\s+/)
      const haystack = ['#' + item.number, item.title, item.body, item.email, item.phone, item.page, item.pageTitle, ...item.answers.map(answerText)].join(' ').toLowerCase()
      if (!words.every(word => haystack.includes(word))) return false
    }
    return true
  }
  const set = () => ['kind', 'rating', 'time', 'from', 'photos', 'contact', 'shown', 'waiting'].filter(key => more[key]).length + Object.values(more.answers).filter(Boolean).length
  const active = () => !!more.text || set() > 0
  const waiting = items.reduce((total, item) => total + item.pending, 0)
  const kinds = [...new Set([...project.kinds, ...items.map(item => item.kind)])]
  const sources = [...new Set(items.map(sourceOf))]
  // Each filter is a dropdown that reads as a chip, dark once it's set.
  const dropdown = (label, key, options, set = value => { more[key] = value }) => picker({
    label, value: key in more ? more[key] : more.answers[key] || '', className: 'filter',
    options: [{ value: '', label }, ...options],
    onchange: next => { set(next); limit = PAGE; paint() }
  })
  const toggle = (key, label, icon) => el('button', {
    type: 'button', class: 'chip-toggle', 'aria-pressed': String(more[key]),
    onclick: event => { more[key] = !more[key]; event.currentTarget.setAttribute('aria-pressed', String(more[key])); limit = PAGE; paint() }
  }, icon && glyph(icon, 'glyph line'), label)
  const rated = project.rating.ask !== 'off' || items.some(item => item.rating)
  const asks = project.contact.email !== 'off' || project.contact.phone !== 'off' || items.some(item => item.email || item.phone)
  const search = el('input', { type: 'search', placeholder: 'Search words, emails, answers or #12', value: more.text, 'aria-label': 'Search the inbox', 'aria-keyshortcuts': '/',
    oninput: event => { more.text = event.target.value.trim(); limit = PAGE; paint() } })
  const sorter = picker({ label: 'Sort', value: sort, className: 'filter sort', options: SORTS.filter(option => rated || !['high', 'low'].includes(option.value)),
    onchange: value => { sort = value; store.set('sort', value); paint() } })
  const clear = el('button', { type: 'button', class: 'clear-filters', onclick: () => { shell.filters = null; inbox(project, items) } }, glyph('x', 'glyph line'), 'Clear')
  // On a phone the filters fold behind a button that counts the ones set.
  const setCount = el('span', { class: 'count' })
  const fold = el('button', { type: 'button', class: 'chip-toggle filters-fold', 'aria-expanded': 'false', 'aria-controls': 'inbox-filters',
    onclick: () => { const open = !bar.classList.toggle('folded'); fold.setAttribute('aria-expanded', String(open)) } }, glyph('sliders', 'glyph line'), 'Filters', setCount)
  const bar = el('div', { class: 'filters folded' },
    el('div', { class: 'filters-top' }, el('span', { class: 'search' }, glyph('search', 'glyph line'), search, el('kbd', {}, '/')), fold, sorter),
    el('div', { class: 'filters-more', id: 'inbox-filters' },
      dropdown('Any time', 'time', TIMES),
      dropdown('Any kind', 'kind', kinds.map(kind => ({ value: kind, label: KIND[kind], icon: kind, line: false }))),
      rated && dropdown('Any rating', 'rating', [5, 4, 3, 2, 1].map(n => ({ value: String(n), label: `${n} ${n === 1 ? 'star' : 'stars'}`, icon: 'star', line: false }))),
      sources.length > 1 && dropdown('From anywhere', 'from', sources.map(source => ({ value: source, label: sourceName(source), icon: source === 'page' ? 'link' : 'globe' }))),
      choiceFields(project).map(field => dropdown(field.label, field.id, field.options.map(option => ({ value: option, label: option })), value => { more.answers[field.id] = value })),
      toggle('photos', 'With photos', 'camera'),
      asks && toggle('contact', 'Can reply', 'reply'),
      (project.public || items.some(item => item.public)) && toggle('shown', 'On your page', 'out'),
      waiting > 0 && toggle('waiting', 'Comments to approve', null),
      clear))

  const paint = () => {
    const pool = items.filter(matchesMore)
    clear.hidden = !active()
    setCount.textContent = set() || ''
    chips.replaceChildren(...FILTERS.map(([key, label]) => el('button', {
      type: 'button', 'aria-pressed': String(key === filter),
      onclick: () => { filter = key; store.set('filter', key); limit = PAGE; paint() }
    }, label, el('span', { class: 'count' }, pool.filter(item => matchesStatus(item, key)).length))))
    const shown = pool.filter(item => matchesStatus(item, filter)).sort(ORDER[sort] || ORDER.new)
    const page = shown.slice(0, limit)
    summary.replaceChildren(...[
      el('strong', {}, shown.length), ` ${shown.length === 1 ? 'item' : 'items'}`,
      shown.length < items.length && el('span', { class: 'muted' }, ` of ${items.length}`),
      items.length >= 1000 && el('span', { class: 'muted' }, ' · the newest 1,000 are here')].filter(Boolean))
    moreButton.hidden = shown.length <= limit
    moreButton.textContent = `Show ${Math.min(PAGE, shown.length - limit)} more · ${shown.length - limit} left`
    list.replaceChildren(...(page.length ? page.map(item => el('li', {},
      el('a', { class: 'ticket', href: `/projects/${project.id}/items/${item.number}`, 'data-link': true },
        stub(item),
        el('span', { class: 'ticket-body' },
          el('span', { class: 'ticket-title' }, item.rating && el('span', { class: 'ticket-rating', 'aria-label': `${item.rating} out of 5` }, glyph('star'), item.rating), item.title),
          item.answers.length > 0 && el('span', { class: 'ticket-answers' }, item.answers.map(answer => answer.type === 'text' ? `${answer.label}: ${answerText(answer)}` : answerText(answer)).join(' · ')),
          el('span', { class: 'ticket-meta' },
            KIND[item.kind], ' from ', item.source === 'page' ? 'your feedback page' : item.page ? item.page.replace(/^https?:\/\//, '') : 'an unknown page', ', ', ago(item.createdAt),
            item.files.length ? `, ${item.files.length} ${item.files.length === 1 ? 'file' : 'files'}` : '',
            item.notes ? `, ${item.notes} ${item.notes === 1 ? 'note' : 'notes'}` : '',
            item.public ? `, on the page with ${item.votes} ${item.votes === 1 ? 'vote' : 'votes'}` : ''),
          item.pending > 0 && el('span', { class: 'ticket-waiting' }, glyph('comment'), `${item.pending} ${item.pending === 1 ? 'comment' : 'comments'} to approve`)),
        el('span', { class: `pill status-${item.status}` }, STATUS[item.status])))) :
      [el('li', { class: 'empty' }, items.length
        ? el('span', {}, 'Nothing matches. ', active() ? el('button', { type: 'button', class: 'link-button', onclick: () => clear.click() }, 'Clear the filters') : 'Try another status', '.')
        : el('span', {}, 'No feedback yet. ', el('a', { href: `/projects/${project.id}/setup`, 'data-link': true }, 'Add the snippet to your site'),
          ' or ', el('a', { href: `/projects/${project.id}/share`, 'data-link': true }, 'share your feedback page'), ', and it will arrive here.'))]))
  }
  paint()
  put(waiting > 0 && el('p', { class: 'notice' }, glyph('comment'), `${waiting} ${waiting === 1 ? 'comment is' : 'comments are'} waiting for your approval.`),
    items.length > 0 && bar, chips, items.length > 0 && summary, list, moreButton)
}

function attachments(item) {
  if (!item.files.length) return null
  const url = (file, extra = '') => `/api/items/${item.id}/files/${file.index}${extra}`
  const pictures = item.files.filter(file => file.preview)
  const others = item.files.filter(file => !file.preview)
  return el('section', { class: 'attachments', 'aria-label': 'Files' },
    pictures.length > 0 && el('ul', { class: 'pictures' }, pictures.map(file => el('li', {},
      el('a', { href: url(file), target: '_blank', rel: 'noopener' }, el('img', { src: url(file, '?preview=1'), alt: file.name, loading: 'lazy' }))))),
    others.length > 0 && el('ul', { class: 'file-list' }, others.map(file => el('li', {},
      glyph('file', 'glyph line'),
      el('a', { href: url(file), target: '_blank', rel: 'noopener' }, file.name),
      el('span', { class: 'muted' }, size(file.size)),
      el('a', { class: 'icon-link', href: url(file, '?download=1'), 'aria-label': `Download ${file.name}` }, glyph('download', 'glyph line'))))))
}

function publicComments(project, item) {
  const list = el('ol', { class: 'comments' })
  const load = () => api('GET', `/api/items/${item.id}/comments`).then(reply => paint(reply.comments)).catch(() => {})
  const act = async (method, path, data) => {
    try { await api(method, path, data); load() } catch (problem) { alert(problem.message) }
  }
  const paint = comments => list.replaceChildren(...(comments.length ? comments.map(comment => el('li', { class: comment.approved ? (comment.team ? 'team' : null) : 'waiting' },
    el('div', { class: 'comment-by' },
      el('strong', {}, comment.name || 'Someone'),
      comment.team && el('span', { class: 'team-badge' }, 'Team'),
      !comment.approved && el('span', { class: 'waiting-badge' }, 'Waiting'),
      el('span', { class: 'muted' }, ago(comment.createdAt))),
    el('p', {}, comment.body),
    el('div', { class: 'comment-actions' },
      !comment.approved && el('button', { type: 'button', class: 'button primary', onclick: () => act('PATCH', '/api/comments/' + comment.id, { approved: true }) }, 'Approve'),
      el('button', { type: 'button', class: 'button danger', onclick: () => confirm('Delete this comment?') && act('DELETE', '/api/comments/' + comment.id) }, 'Delete')))) :
    [el('li', { class: 'muted empty-comments' }, 'No comments yet.')]))
  load()

  const body = el('textarea', { rows: '2', maxlength: '2000', placeholder: `Reply publicly as ${project.name}`, 'aria-label': 'Public reply' })
  const form = el('form', { class: 'add-note', onsubmit: async event => {
    event.preventDefault()
    if (!body.value.trim()) return
    try { paint((await api('POST', `/api/items/${item.id}/comments`, { body: body.value })).comments); body.value = '' } catch (problem) { alert(problem.message) }
  } }, body, el('button', { type: 'submit', class: 'button' }, 'Reply'))
  return el('section', { class: 'notes-section' },
    el('h3', {}, 'Public comments'),
    el('p', { class: 'muted section-note' }, item.public
      ? 'Visitors’ comments wait here until you approve them. Your replies show at once.'
      : 'Show this item on your public page and visitors can comment on it.'),
    list, item.public && form)
}

// Changes show at once and are undone if the server says no; only the
// parts they touch are redrawn.
function itemPage(project, item) {
  document.title = `#${item.number} ${item.title} – feedback`
  // The team's thread: when it came in, then notes and every change, in order.
  const notes = el('ol', { class: 'notes thread' })
  const who = [item.email, item.phone].filter(Boolean).join(', ')
  const paintNotes = list => notes.replaceChildren(
    el('li', { class: 'event' }, glyph(item.kind), el('span', {},
      el('strong', {}, who || 'Someone'), ' sent it from ', item.source === 'page' ? 'your feedback page' : (item.pageTitle || item.page || 'a site'),
      el('span', { class: 'muted' }, ' · ', ago(item.createdAt)))),
    ...list.map(note => note.type === 'event'
      ? el('li', { class: 'event' }, el('img', { src: note.avatar, alt: '', referrerpolicy: 'no-referrer' }),
          el('span', {}, el('strong', {}, note.name), ' ', note.body, el('span', { class: 'muted' }, ' · ', ago(note.createdAt))))
      : el('li', {},
          el('div', { class: 'note-by' }, el('img', { src: note.avatar, alt: '', referrerpolicy: 'no-referrer' }), el('strong', {}, note.name), el('span', { class: 'muted' }, ago(note.createdAt))),
          el('p', {}, note.body))))
  const loadNotes = () => api('GET', `/api/items/${item.id}/notes`).then(reply => paintNotes(reply.notes)).catch(() => {})
  loadNotes()

  let ticketStub = stub(item)
  let comments = publicComments(project, item)
  const statuses = el('div', { class: 'statuses', role: 'radiogroup', 'aria-label': 'Status' },
    Object.entries(STATUS).map(([key, label]) => el('button', {
      type: 'button', role: 'radio', class: `status-${key}`, 'data-status': key,
      onclick: () => item.status !== key && save({ status: key })
    }, label)))
  const kind = picker({
    label: 'Kind', value: item.kind, className: 'inline',
    options: [...new Set([...project.kinds, item.kind])].map(key => ({ value: key, label: KIND[key], icon: key, line: false })),
    onchange: value => save({ kind: value })
  })
  const shown = el('input', { type: 'checkbox', class: 'switch', onchange: event => save({ public: event.target.checked }) })
  const paint = (before = {}) => {
    const next = stub(item)
    ticketStub.replaceWith(next)
    ticketStub = next
    statuses.querySelectorAll('button').forEach(button => button.setAttribute('aria-checked', String(button.dataset.status === item.status)))
    kind.value = item.kind
    shown.checked = item.public
    if ('public' in before && before.public !== item.public) {
      const fresh = publicComments(project, item)
      comments.replaceWith(fresh)
      comments = fresh
    }
  }
  const remember = () => { if (shell?.items) shell.items = shell.items.map(entry => entry.id === item.id ? item : entry) }
  const save = async changes => {
    const before = item
    item = { ...item, ...changes }
    paint(before)
    try {
      item = (await api('PATCH', '/api/items/' + item.id, changes)).item
      remember()
      loadNotes()
    } catch (problem) {
      const failed = item
      item = before
      paint(failed)
      alert(problem.message)
    }
  }
  paint()

  const noteBody = el('textarea', { rows: '3', maxlength: '4000', placeholder: 'A note for your team; the sender never sees it', 'aria-label': 'Add a note' })
  const addNote = el('form', { class: 'add-note', onsubmit: async event => {
    event.preventDefault()
    if (!noteBody.value.trim()) return
    try {
      paintNotes((await api('POST', `/api/items/${item.id}/notes`, { body: noteBody.value })).notes)
      noteBody.value = ''
    } catch (problem) { alert(problem.message) }
  } }, noteBody, el('button', { type: 'submit', class: 'button' }, 'Add note'))

  const fact = (label, ...value) => value.some(Boolean) && el('div', {}, el('dt', {}, label), el('dd', {}, ...value))
  put(el('article', { class: 'item' },
    el('header', { class: 'item-head' }, ticketStub, el('h2', {}, item.title)),
    statuses,
    el('p', { class: 'item-body' }, item.body),
    attachments(item),
    el('dl', { class: 'facts' },
      fact('Kind', kind),
      fact('Rating', item.rating && el('span', { class: 'stars-row', role: 'img', 'aria-label': `${item.rating} out of 5` },
        [1, 2, 3, 4, 5].map(n => glyph('star', n <= item.rating ? 'glyph lit' : 'glyph')), el('span', { class: 'muted' }, `${item.rating} of 5`))),
      fact('Sent', new Date(item.createdAt).toLocaleString()),
      fact('From', item.source === 'page'
        ? el('a', { href: pageURL(project), target: '_blank', rel: 'noopener' }, 'Your feedback page')
        : item.page && el('a', { href: item.page, rel: 'noopener noreferrer', target: '_blank' }, item.pageTitle || item.page)),
      item.answers.map(answer => fact(answer.label, answerText(answer) === answer.label ? 'Yes' : answerText(answer))),
      fact('Email', item.email && el('a', { href: 'mailto:' + item.email }, item.email)),
      fact('Phone', item.phone && el('a', { href: 'tel:' + item.phone.replace(/[^\d+]/g, '') }, item.phone)),
      fact('Browser', item.browser),
      fact('Window', item.viewport && item.viewport.replace('x', ' × '))),
    el('div', { class: 'item-actions' },
      el('label', { class: 'toggle' }, shown,
        project.public ? 'Show on your public page' : 'Show on your public page (the page is off)'),
      el('button', { type: 'button', class: 'button danger', onclick: async () => {
        if (!confirm(`Delete #${item.number} for good?`)) return
        try {
          await api('DELETE', '/api/items/' + item.id)
          if (shell?.items) shell.items = shell.items.filter(entry => entry.id !== item.id)
          go(`/projects/${project.id}`)
        } catch (problem) { alert(problem.message) }
      } }, 'Delete')),
    comments,
    el('section', { class: 'notes-section' }, el('h3', {}, 'Thread'),
      el('p', { class: 'muted section-note' }, 'Your team’s notes and every change, in order. Only you see this.'), notes, addNote)))
}


// A live preview: the stand-in site (preview.html) running the real
// embed.js, sent the unsaved settings as they change. The button opens and
// closes it as on a site; it shows at a computer's width or a phone's.
function previewPane(project, config) {
  const frame = el('iframe', { class: 'preview-frame', title: 'A preview of the button and the form on a site', src: `/preview.html?p=${project.id}` })
  const send = () => frame.contentWindow?.postMessage({ source: 'feedback-setup', config: config() }, location.origin)
  const listen = event => {
    if (!frame.isConnected) return removeEventListener('message', listen)
    if (event.source === frame.contentWindow && event.data?.source === 'holm-feedback' && event.data.type === 'preview-ready') send()
  }
  addEventListener('message', listen)
  const stage = el('div', { class: 'preview-stage', 'data-device': store.get('device', 'desktop') }, frame)
  const device = segmented({
    label: 'Preview size', value: stage.dataset.device, className: 'small',
    options: [{ value: 'desktop', label: '', title: 'Computer', icon: 'desktop' }, { value: 'phone', label: '', title: 'Phone', icon: 'phone' }],
    onchange: value => { store.set('device', value); stage.dataset.device = value }
  })
  return {
    node: el('section', { class: 'preview-pane', 'aria-label': 'Preview' },
      el('div', { class: 'preview-head' }, el('h2', {}, 'Preview'), device),
      stage,
      el('p', { class: 'muted section-note' }, 'Click the button to open and close it, as on a site. Changes show as you make them.')),
    send
  }
}

// A titled group of settings.
const group = (title, ...children) => el('fieldset', { class: 'group' }, el('legend', {}, title), ...children)

// A form's save bar: it lights up once something changed.
function saveBar(saved) {
  const status = el('p', { class: 'muted', role: 'status' }, saved)
  const button = el('button', { type: 'submit', class: 'button primary', disabled: true }, 'Save')
  return {
    node: el('div', { class: 'form-actions save-bar' }, status, button),
    changed: () => { button.disabled = false; status.textContent = 'Not saved yet.' },
    busy: () => { button.disabled = true; status.textContent = 'Saving…' },
    failed: message => { button.disabled = false; status.textContent = message }
  }
}

// The look: name, colour, logo and cover, the words at the top of the panel
// and the page, the button, and the panel's theme. The logo and cover upload
// as they're picked; the rest waits for Save.
function design(project, saved = '') {
  const draft = { name: project.name, color: project.color, icon: project.icon, title: project.title, intro: project.intro, label: project.label, position: project.position, button: project.button, theme: project.theme }
  let base = project
  const pane = previewPane(project, () => ({ ...base, ...draft }))
  const bar = saveBar(saved)
  const changed = () => { bar.changed(); pane.send() }
  const input = (key, attrs, fallback = '') => el('input', { ...attrs, value: draft[key], oninput: event => { draft[key] = event.target.value || fallback; changed() } })

  const picked = pictures(project, next => { base = { ...base, logo: next.logo, cover: next.cover }; pane.send() }, () => draft.icon)
  const icons = iconPicker(draft.icon, value => { draft.icon = value; picked.refresh(); changed() })
  const custom = el('input', { type: 'color', value: draft.color, 'aria-label': 'Any colour', oninput: event => { draft.color = event.target.value; paintSwatches(); changed() } })
  const customSwatch = el('label', { class: 'swatch custom', title: 'Any colour' }, custom)
  const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour' },
    COLORS.map(color => el('button', {
      type: 'button', class: 'swatch', 'data-color': color, style: `--color: ${color}`, 'aria-label': color,
      onclick: () => { draft.color = color; paintSwatches(); changed() }
    })), customSwatch)
  const paintSwatches = () => {
    icons.style.setProperty('--pick', draft.color)
    icons.style.setProperty('--pick-ink', inkOn(draft.color))
    swatches.querySelectorAll('button.swatch').forEach(button => button.setAttribute('aria-pressed', String(draft.color === button.dataset.color)))
    custom.value = draft.color
    customSwatch.classList.toggle('chosen', !COLORS.includes(draft.color))
    customSwatch.style.setProperty('--color', draft.color)
  }
  paintSwatches()


  const place = project.kinds.includes('praise')
  const intro = el('textarea', { rows: '3', maxlength: '280', placeholder: place
    ? 'Loved something? Something not right? Tell us, with a photo if you like. It goes straight to the team.'
    : 'Report an issue, suggest an idea or ask a question. It goes straight to the team.',
  oninput: event => { draft.intro = event.target.value; changed() } })
  intro.value = draft.intro

  const labelField = el('label', { class: 'field', hidden: draft.button !== 'pill' }, el('span', {}, 'Button text'), input('label', { maxlength: '24', placeholder: 'Feedback' }, 'Feedback'))
  const ownLink = el('p', { class: 'hint', hidden: draft.button !== 'none' }, 'No button on your pages: open the form from a link or button of your own. ',
    el('a', { href: `/projects/${project.id}/setup`, 'data-link': true, 'data-tab': 'setup' }, 'Set up'), ' shows the line to add.')

  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    bar.busy()
    try {
      const next = (await api('PATCH', '/api/projects/' + project.id, draft)).project
      renamed(next)
      design(next, 'Saved. Your sites show it on their next page load, with the same snippet.')
    } catch (problem) { bar.failed(problem.message) }
  } },
    group('Brand',
      el('label', { class: 'field' }, el('span', {}, 'Name'), input('name', { maxlength: '60', required: true })),
      el('div', { class: 'field' }, el('span', {}, 'Colour'), swatches),
      el('div', { class: 'field' }, el('span', {}, 'Icon'), icons,
        el('small', {}, 'On the panel, your page and your projects, wherever there’s no logo.')),
      picked),
    group('Words',
      el('label', { class: 'field' }, el('span', {}, 'Title'), input('title', { maxlength: '80', placeholder: `Tell ${project.name} what you think` })),
      el('label', { class: 'field' }, el('span', {}, 'Description'), intro),
      el('p', { class: 'hint' }, 'At the top of the form on your site, and of your feedback page.')),
    group('Button',
      el('div', { class: 'field' }, el('span', {}, 'Style'), segmented({
        label: 'Button style', value: draft.button, options: BUTTON_STYLES,
        onchange: value => { draft.button = value; labelField.hidden = value !== 'pill'; ownLink.hidden = value !== 'none'; changed() }
      })),
      labelField,
      el('div', { class: 'field' }, el('span', {}, 'Corner'), segmented({ label: 'Corner', value: draft.position, options: SIDES, onchange: value => { draft.position = value; changed() } })),
      ownLink),
    group('Panel',
      el('div', { class: 'field' }, el('span', {}, 'Theme'), segmented({ label: 'Panel theme', value: draft.theme, options: THEMES, onchange: value => { draft.theme = value; changed() } })),
      el('p', { class: 'hint' }, 'Auto follows each visitor’s own light or dark setting.')),
    bar.node)

  put(el('div', { class: 'design-grid' }, form, pane.node))
}

// The form: what it's for (its kinds), a star rating, which contact details
// to ask for, files, and up to eight questions of the owner's own.
function formTab(project, saved = '') {
  const draft = {
    for: project.for, attachments: project.attachments, contact: { ...project.contact }, rating: { ...project.rating },
    fields: project.fields.map(field => ({ ...field, options: [...field.options] }))
  }
  const pane = previewPane(project, () => ({
    ...project, attachments: draft.attachments, kinds: KIND_SETS[draft.for], contact: draft.contact, rating: draft.rating,
    // A question still being written shows once it has a label (and two choices).
    fields: draft.fields.filter(field => field.label.trim() && (field.type === 'text' || field.type === 'checkbox' || field.options.filter(Boolean).length >= 2))
      .map(field => ({ ...field, options: field.options.filter(Boolean) }))
  }))
  const bar = saveBar(saved)
  const changed = () => { bar.changed(); pane.send() }

  const ratingWords = el('input', { value: draft.rating.label, maxlength: '60', oninput: event => { draft.rating.label = event.target.value; changed() } })
  const madeFor = el('div', { class: 'choice-cards', role: 'radiogroup', 'aria-label': 'Made for' })
  const paintFor = () => {
    ratingWords.placeholder = ratingLabel({ label: '' }, draft.for === 'place')
    madeFor.replaceChildren(...[['site', 'globe', 'A website or app', 'Issue, Idea, Question'], ['place', 'pin', 'A place or event', 'Praise, Problem, Idea']]
      .map(([value, icon, title, kinds]) => el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(draft.for === value),
        onclick: () => { if (draft.for !== value) { draft.for = value; paintFor(); changed() } }
      }, glyph(icon, 'glyph line'), el('strong', {}, title), el('small', {}, kinds))))
  }
  paintFor()
  const ratingWordsField = el('label', { class: 'field', hidden: draft.rating.ask === 'off' }, el('span', {}, 'Words above the stars'), ratingWords)
  const ask = key => segmented({ label: `Ask for ${key}`, value: draft.contact[key], options: ASK, onchange: value => { draft.contact[key] = value; changed() } })

  const list = el('ol', { class: 'questions' })
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => 'abcdefghijkmnpqrstuvwxyz23456789'[byte % 32]).join('')
  const add = picker({
    label: 'Add a question', menu: true, className: 'add-question', options: QUESTION_TYPES,
    onchange: type => {
      draft.fields.push({ id: newId(), type, label: '', required: false, options: type === 'text' ? [] : ['', ''] })
      paintList()
      changed()
      list.lastElementChild.querySelector('input').focus()
    }
  })
  const paintList = () => {
    list.replaceChildren(...draft.fields.map((field, index) => {
      const options = el('textarea', { rows: '3', placeholder: 'One choice per line', 'aria-label': 'Choices', oninput: event => { field.options = event.target.value.split('\n').map(line => line.trim()); changed() } })
      options.value = field.options.join('\n')
      const move = step => { draft.fields.splice(index + step, 0, draft.fields.splice(index, 1)[0]); paintList(); changed() }
      return el('li', { class: 'question' },
        el('div', { class: 'question-row' },
          picker({
            label: 'Kind of question', value: field.type, options: QUESTION_TYPES, className: 'question-type',
            onchange: value => {
              field.type = value
              if (value !== 'text' && field.options.filter(Boolean).length < 2) field.options = [...field.options.filter(Boolean), '', ''].slice(0, 2)
              paintList()
              changed()
            }
          }),
          el('input', { value: field.label, maxlength: '80', placeholder: 'The question, like “Table number”', 'aria-label': 'Question', oninput: event => { field.label = event.target.value; changed() } })),
        field.type !== 'text' && options,
        field.type === 'checkbox' && el('small', { class: 'muted' }, 'Leave the choices empty for a single box to tick.'),
        el('div', { class: 'question-row end' },
          el('label', { class: 'toggle' }, el('input', { type: 'checkbox', class: 'switch', checked: field.required, onchange: event => { field.required = event.target.checked; changed() } }), 'Required'),
          el('span', { class: 'question-tools' },
            el('button', { type: 'button', class: 'icon-button', disabled: index === 0, 'aria-label': 'Move up', title: 'Move up', onclick: () => move(-1) }, glyph('down', 'glyph line up')),
            el('button', { type: 'button', class: 'icon-button', disabled: index === draft.fields.length - 1, 'aria-label': 'Move down', title: 'Move down', onclick: () => move(1) }, glyph('down', 'glyph line')),
            el('button', { type: 'button', class: 'icon-button danger', 'aria-label': 'Remove the question', title: 'Remove', onclick: () => { draft.fields.splice(index, 1); paintList(); changed() } }, glyph('x', 'glyph line')))))
    }), ...(draft.fields.length ? [] : [el('li', { class: 'muted empty-questions' }, 'No questions of your own yet. People pick a kind and write a message.')]))
    add.querySelector('button').disabled = draft.fields.length >= 8
  }
  paintList()

  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    bar.busy()
    try {
      const fields = draft.fields.map(field => ({ ...field, options: field.options.filter(Boolean) }))
      const next = (await api('PATCH', '/api/projects/' + project.id, { for: draft.for, attachments: draft.attachments, contact: draft.contact, rating: draft.rating, fields })).project
      shell.project = next
      formTab(next, 'Saved. The form on your sites and your page asks this now.')
    } catch (problem) { bar.failed(problem.message) }
  } },
    group('Made for', madeFor, el('p', { class: 'hint' }, 'A shop, restaurant, venue or event gets kinds that suit people there.')),
    group('Rating',
      el('div', { class: 'field' }, el('span', {}, 'Ask for one to five stars'), segmented({
        label: 'Ask for a rating', value: draft.rating.ask, options: ASK,
        onchange: value => { draft.rating.ask = value; ratingWordsField.hidden = value === 'off'; changed() }
      })),
      ratingWordsField),
    group('Contact',
      el('div', { class: 'field' }, el('span', {}, 'Email'), ask('email')),
      el('div', { class: 'field' }, el('span', {}, 'Phone number'), ask('phone')),
      el('label', { class: 'toggle' }, el('input', { type: 'checkbox', class: 'switch', checked: draft.attachments, onchange: event => { draft.attachments = event.target.checked; changed() } }), 'People can attach photos, videos and PDFs')),
    group('Your questions',
      el('p', { class: 'hint' }, 'Up to eight: a table number, which meal, how they heard of you. Answers show on each item, and the inbox filters by them.'),
      list, add),
    bar.node)

  put(el('div', { class: 'design-grid' }, form, pane.node))
}

function download(blob, name) {
  const link = el('a', { href: URL.createObjectURL(blob), download: name })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// Sends one picture as multipart; replies like the JSON routes.
async function upload(path, file) {
  const data = new FormData()
  data.append('file', file, file.name)
  const response = await fetch(path, { method: 'POST', body: data })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.ok === false) throw new Error(body.error?.message || 'That didn’t upload. Try again.')
  return body
}

// The logo and cover, each with a thumbnail, a picker and a way back to the
// default. They upload as soon as they're picked; onChange hears the result.
function pictures(project, onChange, iconOf = () => project.icon) {
  const status = el('p', { class: 'muted picture-status', role: 'status' })
  const block = el('div', { class: 'pictures-pick' })
  const tint = () => `--accent: ${project.color}; --accent-ink: ${inkOn(project.color)}; --project-soft: ${lighten(project.color, 0.55)}`
  const done = (next, message) => { project = next; shell.project = next; onChange(next); paint(); status.textContent = message }
  const pick = (which, label, hint) => {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: async () => {
      const file = input.files[0]
      if (!file) return
      status.textContent = `Uploading the ${which}…`
      try { done((await upload(`/api/projects/${project.id}/${which}`, file)).project, `The ${which} is up.`) } catch (problem) { status.textContent = problem.message }
    } })
    const thumb = which === 'logo'
      ? mark({ ...project, icon: iconOf() }, 'board-mark', 'has-logo', { style: project.logo ? null : tint() })
      : el('span', { class: project.cover ? 'board-cover' : 'board-cover pattern', style: project.cover ? `background-image: url("${project.cover}")` : tint() })
    return el('div', { class: `picture ${which}-pick` },
      thumb,
      el('div', { class: 'picture-text' },
        el('strong', {}, label),
        el('small', { class: 'muted' }, hint),
        el('span', { class: 'picture-actions' },
          el('button', { type: 'button', class: 'button small', onclick: () => input.click() }, project[which] ? 'Change' : 'Upload'),
          project[which] && el('button', { type: 'button', class: 'button small danger', onclick: async () => {
            try { done((await api('DELETE', `/api/projects/${project.id}/${which}`)).project, `Back to the default ${which}.`) } catch (problem) { status.textContent = problem.message }
          } }, 'Remove'),
          input)))
  }
  const paint = () => block.replaceChildren(
    pick('logo', 'Logo', 'Square or wide. A PNG with a clear background looks best.'),
    pick('cover', 'Cover', 'A wide picture, about 1800 × 640. Without one, a pattern in your colour.'),
    status)
  paint()
  block.refresh = paint
  return block
}

// The project's icon: one of the vendored set, or its first letter.
function iconPicker(value, onchange) {
  const names = ['letter', ...ICON_NAMES]
  const title = name => name === 'letter' ? 'First letter' : name.replace(/-\d$/, '').replace(/^face-/, '').replace(/-/g, ' ')
  const grid = el('div', { class: 'icon-grid', role: 'group', 'aria-label': 'Icon' })
  const paint = () => grid.replaceChildren(...names.map(name => el('button', {
    type: 'button', 'aria-pressed': String(name === value), 'aria-label': title(name), title: title(name),
    onclick: () => { if (name !== value) { value = name; paint(); onchange(name) } }
  }, name === 'letter' ? el('span', { class: 'letter' }, 'Aa') : icon(name))))
  paint()
  return grid
}

// The snippet for a site. A Holm site runs only its own scripts and can't
// ask this app for the look, so it gets a copy of embed.js and the look
// written into its tag.
const quote = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
function snippetFor(project, where) {
  if (where !== 'holm') return `<script src="${location.origin}/embed.js" data-project="${project.id}" async></script>`
  const look = [
    project.label !== 'Feedback' && ` data-label="${quote(project.label)}"`,
    project.color !== '#c2410c' && ` data-color="${project.color}"`,
    project.position === 'left' && ' data-position="left"',
    project.button !== 'pill' && ` data-button="${project.button}"`,
    project.theme !== 'light' && ` data-theme="${project.theme}"`
  ].filter(Boolean).join('')
  return `<script src="/embed.js" data-project="${project.id}" data-origin="${location.origin}"${look} async></script>`
}

// Set up: the snippet for the kind of site it goes on, where the button is
// live (it updates by itself), which sites may send feedback, and deleting
// the project.
function setup(project) {
  let where = store.get('install', 'site')
  let seen = []
  const steps = el('div', { class: 'install-steps' })
  const paintSteps = () => {
    const own = project.button === 'none' && el('div', { class: 'step' },
      el('p', {}, 'Your button is set to “Your link”, so add this wherever the form should open from:'),
      codeBox(`<button type="button" onclick="HolmFeedback.open()">${quote(project.label)}</button>`))
    steps.replaceChildren(...(where === 'holm' ? [
      el('div', { class: 'step' },
        el('p', {}, el('strong', {}, '1. '), 'Put a copy of embed.js at the root of your app.'),
        el('a', { class: 'button small', href: '/embed.js', download: 'embed.js' }, glyph('download', 'glyph line'), 'Download embed.js')),
      el('div', { class: 'step' },
        el('p', {}, el('strong', {}, '2. '), 'Paste this before the closing ', el('code', {}, '</body>'), ' of each page.'),
        codeBox(snippetFor(project, 'holm'))),
      el('div', { class: 'step' },
        el('p', {}, el('strong', {}, '3. '), 'Let its pages show the form. The node’s operator runs this once:'),
        codeBox(`holm policy set security.csp.frame_src "${location.origin}" --app <your-app-id>`)),
      own,
      el('p', { class: 'hint' }, 'The look is written into this tag; copy it again after you change it in Design.')
    ] : [
      el('div', { class: 'step' },
        el('p', {}, 'Paste this before the closing ', el('code', {}, '</body>'), ' of every page that should have the button.'),
        codeBox(snippetFor(project, 'site'))),
      own,
      el('p', { class: 'hint' }, 'Change the look in Design whenever you like: your pages pick it up on their next load, with this same snippet. An older snippet with data-label, data-color or data-position keeps those.')
    ]).filter(Boolean))
  }
  paintSteps()

  const live = el('div', { class: 'live', 'aria-live': 'polite' })
  const allowed = origin => !project.origins.length || project.origins.includes(origin)
  const paintLive = () => live.replaceChildren(seen.length
    ? el('ul', { class: 'live-list' }, seen.map(entry => el('li', {},
        el('span', { class: allowed(entry.origin) ? 'live-dot' : 'live-dot blocked', 'aria-hidden': 'true' }),
        el('span', { class: 'live-site' },
          el('strong', {}, entry.origin.replace(/^https?:\/\//, '')),
          el('small', { class: 'muted' }, allowed(entry.origin) ? `Seen ${ago(entry.seenAt)}` : `Seen ${ago(entry.seenAt)}, but not an allowed site`)),
        !allowed(entry.origin) && el('button', { type: 'button', class: 'button small', onclick: () => saveOrigins([...project.origins, entry.origin]) }, 'Allow'))))
    : el('p', { class: 'waiting' }, el('span', { class: 'live-dot waiting', 'aria-hidden': 'true' }),
        'Waiting for the button to load on a site. Once a page with the snippet opens, it shows up here.'))
  const poll = async () => {
    if (!live.isConnected) return
    try {
      seen = (await api('GET', `/api/projects/${project.id}/installs`)).installs
      paintLive()
    } catch {}
    setTimeout(poll, 8000)
  }

  const chips = el('ul', { class: 'site-chips' })
  const sitesStatus = el('p', { class: 'muted', role: 'status' })
  const saveOrigins = async origins => {
    sitesStatus.textContent = 'Saving…'
    try {
      project = (await api('PATCH', '/api/projects/' + project.id, { origins })).project
      shell.project = project
      paintSites()
      paintLive()
      sitesStatus.textContent = project.origins.length ? 'Saved. Only these sites can send feedback now.' : 'Saved. Any site can send feedback.'
    } catch (problem) { sitesStatus.textContent = problem.message }
  }
  const paintSites = () => chips.replaceChildren(...(project.origins.length
    ? project.origins.map(origin => el('li', {}, origin.replace(/^https?:\/\//, ''),
        el('button', { type: 'button', 'aria-label': `Stop allowing ${origin}`, onclick: () => saveOrigins(project.origins.filter(entry => entry !== origin)) }, glyph('x', 'glyph line'))))
    : [el('li', { class: 'any' }, 'Any site')]))
  paintSites()
  const site = el('input', { placeholder: 'example.com', spellcheck: 'false', autocapitalize: 'none', autocomplete: 'off', 'aria-label': 'A site to allow' })
  const addSite = el('form', { class: 'joined', onsubmit: event => {
    event.preventDefault()
    const value = site.value.trim()
    if (!value) return
    let origin
    try { origin = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value).origin } catch { sitesStatus.textContent = `“${value}” isn’t a site address.`; return }
    site.value = ''
    saveOrigins([...new Set([...project.origins, origin])])
  } }, site, el('button', { type: 'submit' }, 'Allow'))

  put(
    el('div', { class: 'setup-columns' },
      el('section', { class: 'install' },
        el('div', { class: 'section-head' }, el('h2', {}, 'Add it to your site'),
          segmented({
            label: 'Kind of site', value: where, className: 'small',
            options: [{ value: 'site', label: 'Any website', icon: 'globe' }, { value: 'holm', label: 'A Holm app', icon: 'apps' }],
            onchange: value => { where = value; store.set('install', value); paintSteps() }
          })),
        steps),
      el('div', { class: 'setup-side' },
        el('section', { class: 'live-section' }, el('h2', {}, 'Where it’s live'), live),
        el('section', { class: 'sites' },
          el('h2', {}, 'Allowed sites'),
          el('p', { class: 'muted section-note' }, 'Only these sites can send feedback through the button. With none, any site can. Your feedback page always can.'),
          chips, addSite, sitesStatus))),
    el('section', { class: 'danger-zone' },
      el('h2', {}, 'Delete project'),
      el('p', { class: 'muted' }, 'Deletes the project with every item, file, comment, note and stat in it. The snippet and the public page stop working.'),
      el('button', { type: 'button', class: 'button danger', onclick: async () => {
        if (!confirm(`Delete ${project.name} and all its feedback for good?`)) return
        try { await api('DELETE', '/api/projects/' + project.id); shell = null; go('/') } catch (problem) { alert(problem.message) }
      } }, 'Delete project')))
  paintLive()
  poll()
}

// Share: the project's own page, on or off, at its address; its link to
// copy or email, and its QR code and poster.
function share(project, saved = '') {
  const host = location.origin.replace(/^https?:\/\//, '')
  const place = project.kinds.includes('praise')
  const status = el('p', { class: 'muted', role: 'status' }, saved)
  const on = el('input', { type: 'checkbox', class: 'switch', checked: project.public, onchange: async () => {
    try {
      const next = (await api('PATCH', '/api/projects/' + project.id, { public: on.checked })).project
      shell.project = next
      share(next, next.public ? 'Your page is on.' : 'Your page is off.')
    } catch (problem) { on.checked = !on.checked; status.textContent = problem.message }
  } })
  const slug = el('input', { value: project.slug || '', maxlength: '40', placeholder: project.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-site', spellcheck: 'false', autocapitalize: 'none', 'aria-label': 'Custom address' })
  const address = el('form', { class: 'field', onsubmit: async event => {
    event.preventDefault()
    try {
      const next = (await api('PATCH', '/api/projects/' + project.id, { slug: slug.value.trim() })).project
      shell.project = next
      share(next, 'The address is saved.')
    } catch (problem) { status.textContent = problem.message }
  } },
    el('label', { for: 'page-slug' }, 'Address'),
    el('span', { class: 'prefixed joined' }, el('span', { class: 'prefix' }, host + '/'), Object.assign(slug, { id: 'page-slug' }), el('button', { type: 'submit' }, 'Save')),
    el('small', {}, 'Letters, digits and hyphens. Changing it breaks links and QR codes you’ve already shared; ', el('code', {}, `/b/${project.id}`), ' always works.'))

  // The QR code and emails tag their links, so Stats can tell scans and
  // email visits apart from the rest.
  const url = pageURL(project)
  const scanURL = url + '?via=qr'
  const color = qrColor(project.color)
  const code = el('div', { class: 'qr', role: 'img', 'aria-label': `QR code for ${url}` })
  code.innerHTML = qrSVG(scanURL, color)
  const mail = `mailto:?subject=${encodeURIComponent(project.title || `Tell ${project.name} what you think`)}` +
    `&body=${encodeURIComponent(`We'd love to hear from you. It takes a minute:\n\n${url}?via=email\n`)}`
  const handout = project.public ? el('section', { class: 'handout' },
    el('h2', {}, 'Link and QR code'),
    codeBox(url, 'Copy link'),
    el('div', { class: 'link-actions' },
      el('a', { class: 'button small', href: mail }, 'Email it'),
      el('a', { class: 'button small', href: url, target: '_blank', rel: 'noopener' }, 'Open', glyph('out', 'glyph line'))),
    el('div', { class: 'qr-row' },
      code,
      el('div', { class: 'qr-actions' },
        el('p', { class: 'muted' }, place
          ? 'Put it on tables, the counter, a menu or an event badge. People who scan it can send feedback, with a photo, straight away. Stats count the scans.'
          : 'Print it on a receipt, a card or a slide. People who scan it land on the page and can send feedback straight away. Stats count the scans.'),
        el('button', { type: 'button', class: 'button primary', onclick: async () => download(await poster(url, project, scanURL), `${project.slug || project.id}-poster.png`) }, glyph('download', 'glyph line'), 'Poster (PNG)'),
        el('button', { type: 'button', class: 'button', onclick: () => download(new Blob([qrSVG(scanURL, color)], { type: 'image/svg+xml' }), `${project.slug || project.id}-qr.svg`) }, glyph('download', 'glyph line'), 'QR code (SVG)'))))
    : el('section', { class: 'handout off' }, el('h2', {}, 'Link and QR code'), el('p', { class: 'muted' }, 'Turn the page on to get its link and QR code.'))

  put(el('div', { class: 'share-grid' },
    el('section', { class: 'setup' },
      el('div', {},
        el('h2', {}, 'Your feedback page'),
        el('p', { class: 'muted section-note' }, 'A page of its own where anyone can send feedback, see the items you make public, vote and comment. Comments wait for your approval.')),
      el('label', { class: 'toggle big' }, on, project.public ? 'The page is on' : 'The page is off'),
      address,
      el('p', { class: 'hint' }, 'Its title, words, logo, cover and colour are in ', el('a', { href: `/projects/${project.id}/design`, 'data-link': true, 'data-tab': 'design' }, 'Design'), '.'),
      status),
    handout))
}
