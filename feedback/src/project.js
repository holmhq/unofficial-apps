// A project: its inbox, one item at a time, its stats, how to share and set
// it up, and its settings.
import { el, api, ago, glyph, copyButton, store, size, inkOn, lighten, STATUS, KIND, KIND_SETS } from './lib.js'
import { show, go } from './app.js'
import { statsView } from './stats.js'
import { qrSVG, qrColor, poster } from './qr.js'

const OPEN = ['new', 'planned', 'progress']
const FILTERS = [['open', 'Open'], ['new', 'New'], ['planned', 'Planned'], ['progress', 'In progress'], ['done', 'Done'], ['closed', 'Closed'], ['all', 'All']]
const COLORS = ['#c2410c', '#b42318', '#7c3aed', '#1d4ed8', '#0e7c66', '#26233a']
const TABS = [['inbox', 'Inbox', ''], ['stats', 'Stats', '/stats'], ['form', 'Form', '/form'], ['share', 'Share', '/share'], ['setup', 'Set up', '/setup'], ['settings', 'Settings', '/settings']]
const QUESTION_TYPES = [['text', 'Short answer'], ['select', 'Dropdown'], ['radio', 'One choice'], ['checkbox', 'Checkboxes']]
const ASK = [['off', 'Off'], ['optional', 'Optional'], ['required', 'Required']]
// The button on a site, as embed.js draws it.
const LAUNCHER = 'M12 0C5.38 0 0 5.38 0 12C0 13.95 0.48 15.89 1.41 17.62L0.03 22.74C-0.06 23.09 0.04 23.45 0.29 23.71C0.55 23.96 0.91 24.06 1.26 23.97L6.38 22.59C8.11 23.51 10.05 24 12 24C15.31 24 18.31 22.65 20.48 20.48C22.65 18.31 24 15.31 24 12C24 5.38 18.62 0 12 0ZM12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2C17.52 2 22 6.48 22 12C22 17.52 17.52 22 12 22ZM8.5 10C8.5 10.55 8.05 11 7.5 11C6.95 11 6.5 10.55 6.5 10C6.5 9.45 6.95 9 7.5 9C8.05 9 8.5 9.45 8.5 10ZM14.61 13.2C15.05 13.54 15.13 14.17 14.8 14.61C14.12 15.49 13.1 16 12 16C10.9 16 9.88 15.49 9.2 14.61C8.87 14.17 8.96 13.54 9.4 13.2C9.83 12.87 10.46 12.96 10.8 13.4C11.38 14.16 12.62 14.16 13.21 13.4C13.54 12.96 14.16 12.87 14.61 13.2ZM17.5 10C17.5 10.55 17.05 11 16.5 11C15.95 11 15.5 10.55 15.5 10C15.5 9.45 15.95 9 16.5 9C17.05 9 17.5 9.45 17.5 10Z'

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
  const tab = typeof view === 'number' ? 'inbox' : view
  shell.nav.querySelectorAll('a').forEach(link => link.dataset.tab === tab ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'))
  const { project } = shell
  document.title = `${project.name} – feedback`
  if (view === 'setup') return setup(project)
  if (view === 'form') return formTab(project)
  if (view === 'share') return share(project)
  if (view === 'settings') return settings(project)
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

function inbox(project, items) {
  let filter = store.get('filter', 'open')
  // Filters beyond status last while you move between tabs.
  const more = shell.filters?.project === project.id ? shell.filters : (shell.filters = { project: project.id, kind: '', photos: false, text: '', answers: {} })
  const list = el('ul', { class: 'tickets' })
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' })
  const matchesStatus = (item, key) => key === 'all' || (key === 'open' ? OPEN.includes(item.status) : item.status === key)
  const matchesMore = item => {
    if (more.kind && item.kind !== more.kind) return false
    if (more.photos && !item.files.some(file => file.kind === 'image')) return false
    for (const [id, wanted] of Object.entries(more.answers)) {
      if (!wanted) continue
      const answer = item.answers.find(entry => entry.id === id)
      if (!answer || !(Array.isArray(answer.value) ? answer.value.includes(wanted) : answer.value === wanted)) return false
    }
    if (more.text) {
      const haystack = [item.title, item.body, item.email, item.phone, ...item.answers.map(answerText)].join(' ').toLowerCase()
      if (!haystack.includes(more.text.toLowerCase())) return false
    }
    return true
  }
  const waiting = items.reduce((total, item) => total + item.pending, 0)
  const kinds = [...new Set([...project.kinds, ...items.map(item => item.kind)])]
  const select = (label, value, options, onchange) => el('select', { 'aria-label': label, onchange: event => { onchange(event.target.value); paint() } },
    el('option', { value: '' }, label), options.map(([key, text]) => el('option', { value: key, selected: value === key }, text)))
  const bar = el('div', { class: 'filters' },
    el('input', { type: 'search', placeholder: 'Search', value: more.text, 'aria-label': 'Search the inbox', oninput: event => { more.text = event.target.value.trim(); paint() } }),
    select('Any kind', more.kind, kinds.map(kind => [kind, KIND[kind]]), value => { more.kind = value }),
    choiceFields(project).map(field => select(field.label, more.answers[field.id] || '', field.options.map(option => [option, option]), value => { more.answers[field.id] = value })),
    el('button', { type: 'button', class: 'chip-toggle', 'aria-pressed': String(more.photos), onclick: event => { more.photos = !more.photos; event.currentTarget.setAttribute('aria-pressed', String(more.photos)); paint() } }, glyph('camera', 'glyph line'), 'With photos'))

  const paint = () => {
    const pool = items.filter(matchesMore)
    chips.replaceChildren(...FILTERS.map(([key, label]) => el('button', {
      type: 'button', 'aria-pressed': String(key === filter),
      onclick: () => { filter = key; store.set('filter', key); paint() }
    }, label, el('span', { class: 'count' }, pool.filter(item => matchesStatus(item, key)).length))))
    const shown = pool.filter(item => matchesStatus(item, filter))
    list.replaceChildren(...(shown.length ? shown.map(item => el('li', {},
      el('a', { class: 'ticket', href: `/projects/${project.id}/items/${item.number}`, 'data-link': true },
        stub(item),
        el('span', { class: 'ticket-body' },
          el('span', { class: 'ticket-title' }, item.title),
          item.answers.length > 0 && el('span', { class: 'ticket-answers' }, item.answers.map(answer => answer.type === 'text' ? `${answer.label}: ${answerText(answer)}` : answerText(answer)).join(' · ')),
          el('span', { class: 'ticket-meta' },
            KIND[item.kind], ' from ', item.source === 'page' ? 'your feedback page' : item.page ? item.page.replace(/^https?:\/\//, '') : 'an unknown page', ', ', ago(item.createdAt),
            item.files.length ? `, ${item.files.length} ${item.files.length === 1 ? 'file' : 'files'}` : '',
            item.notes ? `, ${item.notes} ${item.notes === 1 ? 'note' : 'notes'}` : '',
            item.public ? `, on the page with ${item.votes} ${item.votes === 1 ? 'vote' : 'votes'}` : ''),
          item.pending > 0 && el('span', { class: 'ticket-waiting' }, glyph('comment'), `${item.pending} ${item.pending === 1 ? 'comment' : 'comments'} to approve`)),
        el('span', { class: `pill status-${item.status}` }, STATUS[item.status])))) :
      [el('li', { class: 'empty' }, items.length
        ? 'Nothing here. Try another filter.'
        : el('span', {}, 'No feedback yet. ', el('a', { href: `/projects/${project.id}/setup`, 'data-link': true }, 'Add the snippet to your site'),
          ' or ', el('a', { href: `/projects/${project.id}/share`, 'data-link': true }, 'share your feedback page'), ', and it will arrive here.'))]))
  }
  paint()
  put(waiting > 0 && el('p', { class: 'notice' }, glyph('comment'), `${waiting} ${waiting === 1 ? 'comment is' : 'comments are'} waiting for your approval.`),
    items.length > 0 && bar, chips, list)
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
  const kind = el('select', { 'aria-label': 'Kind', onchange: event => save({ kind: event.target.value }) },
    [...new Set([...project.kinds, item.kind])].map(key => el('option', { value: key }, KIND[key])))
  const shown = el('input', { type: 'checkbox', onchange: event => save({ public: event.target.checked }) })
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

function setup(project) {
  const draft = { ...project }
  const origin = location.origin
  const snippet = () => [
    `<script src="${origin}/embed.js" data-project="${project.id}"`,
    draft.label !== 'Feedback' ? ` data-label="${draft.label.replace(/"/g, '&quot;')}"` : '',
    draft.color !== '#c2410c' ? ` data-color="${draft.color}"` : '',
    draft.position === 'left' ? ' data-position="left"' : '',
    ' async></script>'
  ].join('')
  const code = el('code', {}, snippet())
  const preview = el('iframe', { class: 'preview', title: 'A preview of your feedback form', src: `/widget.html?p=${project.id}&preview=1` })
  const launcherText = el('span', {}, draft.label)
  const ns = 'http://www.w3.org/2000/svg'
  const launcherIcon = document.createElementNS(ns, 'svg')
  launcherIcon.setAttribute('viewBox', '0 0 24 24')
  launcherIcon.setAttribute('aria-hidden', 'true')
  launcherIcon.innerHTML = `<path d="${LAUNCHER}"/>`
  const launcher = el('span', { class: 'launcher', 'aria-hidden': 'true' }, launcherIcon, launcherText)
  const stage = el('div', { class: 'stage' }, preview, launcher)

  // Every change shows at once: in the snippet, the button and the form.
  const sync = () => {
    code.textContent = snippet()
    launcherText.textContent = draft.label
    launcher.style.setProperty('--color', draft.color)
    stage.dataset.side = draft.position
    preview.contentWindow?.postMessage({ source: 'feedback-setup', config: { name: project.name, label: draft.label, color: draft.color } }, location.origin)
  }
  preview.addEventListener('load', sync)

  const status = el('p', { class: 'muted', role: 'status' })
  const label = el('input', { value: draft.label, maxlength: '24', oninput: event => { draft.label = event.target.value || 'Feedback'; sync() } })
  const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Button colour' })
  const custom = el('input', { type: 'color', value: draft.color, 'aria-label': 'Custom colour', oninput: event => { draft.color = event.target.value; paintSwatches(); sync() } })
  const paintSwatches = () => {
    swatches.querySelectorAll('.swatch').forEach(button => button.setAttribute('aria-pressed', String(draft.color === button.dataset.color)))
    custom.value = draft.color
  }
  swatches.append(...COLORS.map(color => el('button', {
    type: 'button', class: 'swatch', 'data-color': color, style: `--color: ${color}`, 'aria-label': color,
    onclick: () => { draft.color = color; paintSwatches(); sync() }
  })), custom)
  paintSwatches()
  const side = el('select', { onchange: event => { draft.position = event.target.value; sync() } },
    el('option', { value: 'right', selected: draft.position === 'right' }, 'Bottom right'),
    el('option', { value: 'left', selected: draft.position === 'left' }, 'Bottom left'))
  const sites = el('textarea', { rows: '3', placeholder: 'https://example.com', spellcheck: 'false' })
  sites.value = draft.origins.join('\n')

  const saveButton = el('button', { type: 'submit', class: 'button primary' }, 'Save')
  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    saveButton.disabled = true
    try {
      const origins = sites.value.split(/[\s,]+/).filter(Boolean)
      project = (await api('PATCH', '/api/projects/' + project.id, { label: draft.label, color: draft.color, position: draft.position, origins })).project
      Object.assign(draft, project)
      shell.project = project
      status.textContent = 'Saved. Sites with the snippet pick it up on their next page load.'
      sync()
    } catch (problem) { status.textContent = problem.message }
    saveButton.disabled = false
  } },
    el('label', { class: 'field' }, el('span', {}, 'Button text'), label),
    el('div', { class: 'field' }, el('span', {}, 'Colour'), swatches),
    el('label', { class: 'field' }, el('span', {}, 'Position'), side),
    el('label', { class: 'field' }, el('span', {}, 'Allowed sites, one per line'), sites,
      el('small', {}, 'Leave empty to accept feedback from any site. Your own feedback page is always allowed.')),
    el('div', { class: 'form-actions' }, status, saveButton))

  put(
    el('section', { class: 'snippet' },
      el('h2', {}, 'Add it to your site'),
      el('p', { class: 'muted' }, 'Paste this before the closing ', el('code', {}, '</body>'), ' of every page that should have the button.'),
      el('pre', {}, code),
      copyButton(() => code.textContent, 'Copy snippet'),
      el('p', { class: 'muted' }, 'To open the form from your own link or button instead, add ', el('code', {}, 'data-button="none"'),
        ' and call ', el('code', {}, 'HolmFeedback.open()'), '.')),
    el('div', { class: 'setup-grid' },
      el('section', {}, el('h2', {}, 'Look and rules'), form),
      el('section', {}, el('h2', {}, 'Preview'), el('p', { class: 'muted section-note' }, 'Changes show here as you make them.'), stage)))
  sync()
}

// The form: what it's for (its kinds), which contact details to ask for,
// files, and up to eight questions of the owner's own, with a preview that
// follows every change.
function formTab(project, saved = '') {
  const draft = {
    for: project.for, attachments: project.attachments, contact: { ...project.contact },
    fields: project.fields.map(field => ({ ...field, options: [...field.options] }))
  }
  const preview = el('iframe', { class: 'preview', title: 'A preview of your feedback form', src: `/widget.html?p=${project.id}&preview=1` })
  const sync = () => preview.contentWindow?.postMessage({ source: 'feedback-setup', config: {
    name: project.name, color: project.color, attachments: draft.attachments, kinds: KIND_SETS[draft.for], contact: draft.contact,
    // A question still being written shows once it has a label (and two choices).
    fields: draft.fields.filter(field => field.label.trim() && (field.type === 'text' || field.type === 'checkbox' || field.options.filter(Boolean).length >= 2))
      .map(field => ({ ...field, options: field.options.filter(Boolean) }))
  } }, location.origin)
  preview.addEventListener('load', sync)

  const madeFor = el('select', { onchange: event => { draft.for = event.target.value; sync() } },
    el('option', { value: 'site', selected: draft.for === 'site' }, 'A website or app: Bug, Idea, Question'),
    el('option', { value: 'place', selected: draft.for === 'place' }, 'A place or event: Praise, Problem, Idea'))
  const segmented = key => {
    const group = el('div', { class: 'chips segmented', role: 'group', 'aria-label': `Ask for ${key}` })
    const paint = () => group.replaceChildren(...ASK.map(([value, label]) => el('button', {
      type: 'button', 'aria-pressed': String(draft.contact[key] === value),
      onclick: () => { draft.contact[key] = value; paint(); sync() }
    }, label)))
    paint()
    return group
  }
  const files = el('input', { type: 'checkbox', checked: draft.attachments, onchange: event => { draft.attachments = event.target.checked; sync() } })

  const list = el('ol', { class: 'questions' })
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => 'abcdefghijkmnpqrstuvwxyz23456789'[byte % 32]).join('')
  const paintList = () => {
    list.replaceChildren(...draft.fields.map((field, index) => {
      const options = el('textarea', { rows: '3', placeholder: 'One choice per line', 'aria-label': 'Choices', oninput: event => { field.options = event.target.value.split('\n').map(line => line.trim()); sync() } })
      options.value = field.options.join('\n')
      const move = step => { draft.fields.splice(index + step, 0, draft.fields.splice(index, 1)[0]); paintList(); sync() }
      return el('li', { class: 'question' },
        el('div', { class: 'question-row' },
          el('select', { 'aria-label': 'Kind of question', onchange: event => { field.type = event.target.value; paintList(); sync() } },
            QUESTION_TYPES.map(([value, label]) => el('option', { value, selected: field.type === value }, label))),
          el('input', { value: field.label, maxlength: '80', placeholder: 'The question, like “Table number”', 'aria-label': 'Question', oninput: event => { field.label = event.target.value; sync() } })),
        field.type !== 'text' && options,
        field.type === 'checkbox' && el('small', { class: 'muted' }, 'Leave the choices empty for a single box to tick.'),
        el('div', { class: 'question-row end' },
          el('label', { class: 'toggle' }, el('input', { type: 'checkbox', checked: field.required, onchange: event => { field.required = event.target.checked; sync() } }), 'Required'),
          el('span', { class: 'question-tools' },
            el('button', { type: 'button', class: 'button', disabled: index === 0, 'aria-label': 'Move up', onclick: () => move(-1) }, '↑'),
            el('button', { type: 'button', class: 'button', disabled: index === draft.fields.length - 1, 'aria-label': 'Move down', onclick: () => move(1) }, '↓'),
            el('button', { type: 'button', class: 'button danger', onclick: () => { draft.fields.splice(index, 1); paintList(); sync() } }, 'Remove'))))
    }), ...(draft.fields.length ? [] : [el('li', { class: 'muted empty-questions' }, 'No questions of your own yet. People write a message and pick a kind.')]))
    add.disabled = draft.fields.length >= 8
  }
  const add = el('select', { class: 'button add-question', 'aria-label': 'Add a question', onchange: event => {
    if (!event.target.value) return
    draft.fields.push({ id: newId(), type: event.target.value, label: '', required: false, options: event.target.value === 'text' ? [] : ['', ''] })
    event.target.value = ''
    paintList()
    list.lastElementChild.querySelector('input').focus()
  } }, el('option', { value: '' }, '+ Add a question'), QUESTION_TYPES.map(([value, label]) => el('option', { value }, label)))
  paintList()

  const status = el('p', { class: 'muted', role: 'status' }, saved)
  const saveButton = el('button', { type: 'submit', class: 'button primary' }, 'Save')
  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    saveButton.disabled = true
    try {
      const fields = draft.fields.map(field => ({ ...field, options: field.options.filter(Boolean) }))
      const next = (await api('PATCH', '/api/projects/' + project.id, { for: draft.for, attachments: draft.attachments, contact: draft.contact, fields })).project
      shell.project = next
      formTab(next, 'Saved. The form on your site and page shows it now.')
    } catch (problem) { status.textContent = problem.message; saveButton.disabled = false }
  } },
    el('label', { class: 'field' }, el('span', {}, 'Made for'), madeFor,
      el('small', {}, 'A shop, restaurant, venue or event gets kinds that suit people there.')),
    el('div', { class: 'field' }, el('span', {}, 'Ask for an email'), segmented('email')),
    el('div', { class: 'field' }, el('span', {}, 'Ask for a phone number'), segmented('phone')),
    el('label', { class: 'toggle' }, files, 'People can attach photos, videos and PDFs'),
    el('div', { class: 'field' }, el('span', {}, 'Your questions'),
      el('small', {}, 'Up to eight: a table number, which meal, how they heard of you. Answers show on each item, and the inbox can filter by them.'),
      list, add),
    el('div', { class: 'form-actions' }, status, saveButton))

  put(el('div', { class: 'setup-grid' },
    el('section', {}, el('h2', {}, 'What the form asks'), form),
    el('section', {}, el('h2', {}, 'Preview'), el('p', { class: 'muted section-note' }, 'Changes show here as you make them.'), el('div', { class: 'stage' }, preview))))
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

// The page's logo and cover, each with a preview, a picker and a way back
// to the default.
function pictures(project, status) {
  const pick = (which, label, hint, preview) => {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: async () => {
      const file = input.files[0]
      if (!file) return
      status.textContent = `Uploading the ${which}…`
      try {
        const { project: next } = await upload(`/api/projects/${project.id}/${which}`, file)
        shell.project = next
        share(next, `The ${which} is up.`)
      } catch (problem) { status.textContent = problem.message }
    } })
    return el('div', { class: `picture ${which}-pick` },
      preview,
      el('div', { class: 'picture-text' },
        el('strong', {}, label),
        el('small', { class: 'muted' }, hint),
        el('span', { class: 'picture-actions' },
          el('button', { type: 'button', class: 'button', onclick: () => input.click() }, project[which] ? 'Change' : 'Upload'),
          project[which] && el('button', { type: 'button', class: 'button danger', onclick: async () => {
            try {
              const { project: next } = await api('DELETE', `/api/projects/${project.id}/${which}`)
              shell.project = next
              share(next, `Back to the default ${which}.`)
            } catch (problem) { status.textContent = problem.message }
          } }, 'Remove'),
          input)))
  }
  const tint = `--accent: ${project.color}; --accent-ink: ${inkOn(project.color)}; --project-soft: ${lighten(project.color, 0.55)}`
  return el('section', { class: 'page-look' },
    el('h2', {}, 'Logo and cover'),
    el('p', { class: 'muted section-note' }, 'Without them the page uses your initial and a pattern in your colour.'),
    pick('logo', 'Logo', 'Square or wide. A PNG with a clear background looks best.',
      project.logo ? el('span', { class: 'board-mark has-logo' }, el('img', { src: project.logo, alt: '' }))
        : el('span', { class: 'board-mark', style: tint, 'aria-hidden': 'true' }, project.name.trim().charAt(0).toUpperCase() || '?')),
    pick('cover', 'Cover', 'A wide picture across the top, about 1800 × 640.',
      el('span', { class: project.cover ? 'board-cover' : 'board-cover pattern', style: project.cover ? `background-image: url("${project.cover}")` : tint })))
}

function share(project, saved = '') {
  const origin = location.origin.replace(/^https?:\/\//, '')
  const place = project.kinds.includes('praise')
  const on = el('input', { type: 'checkbox', checked: project.public })
  const slug = el('input', { value: project.slug || '', maxlength: '40', placeholder: project.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-site', spellcheck: 'false', autocapitalize: 'none', 'aria-label': 'Custom address' })
  const title = el('input', { value: project.title, maxlength: '80', placeholder: `Tell ${project.name} what you think` })
  const intro = el('textarea', { rows: '3', maxlength: '280', placeholder: place
    ? 'Loved something? Something not right? Tell us, with a photo if you like. It goes straight to the team.'
    : 'Report a bug, suggest an idea or ask a question. It goes straight to the team.' })
  intro.value = project.intro
  const status = el('p', { class: 'muted', role: 'status' }, saved)
  const saveButton = el('button', { type: 'submit', class: 'button primary' }, 'Save')
  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    saveButton.disabled = true
    try {
      project = (await api('PATCH', '/api/projects/' + project.id, { public: on.checked, slug: slug.value.trim(), title: title.value, intro: intro.value })).project
      shell.project = project
      share(project, 'Saved.')
    } catch (problem) { status.textContent = problem.message; saveButton.disabled = false }
  } },
    el('label', { class: 'toggle' }, on, 'Turn on the public page'),
    el('label', { class: 'field' }, el('span', {}, 'Custom address'),
      el('span', { class: 'prefixed' }, el('span', { class: 'prefix' }, origin + '/'), slug),
      el('small', {}, 'Letters, digits and hyphens. Changing it breaks links and QR codes you’ve already shared; ', el('code', {}, `/b/${project.id}`), ' always works.')),
    el('label', { class: 'field' }, el('span', {}, 'Title'), title),
    el('label', { class: 'field' }, el('span', {}, 'Description'), intro),
    el('div', { class: 'form-actions' }, status, saveButton))

  // The QR code and emails tag their links, so Stats can tell scans and
  // email visits apart from the rest.
  const url = pageURL(project)
  const scanURL = url + '?via=qr'
  const color = qrColor(project.color)
  const code = el('div', { class: 'qr', role: 'img', 'aria-label': `QR code for ${url}` })
  code.innerHTML = qrSVG(scanURL, color)
  const mail = `mailto:?subject=${encodeURIComponent(project.title || `Tell ${project.name} what you think`)}` +
    `&body=${encodeURIComponent(`We'd love to hear from you. It takes a minute:\n\n${url}?via=email\n`)}`
  const handout = project.public && el('section', { class: 'handout' },
    el('h2', {}, 'Link and QR code'),
    el('div', { class: 'link-row' },
      el('code', {}, url),
      copyButton(url, 'Copy link'),
      el('a', { class: 'button', href: mail }, 'Email it'),
      el('a', { class: 'button', href: url, target: '_blank', rel: 'noopener' }, 'Open', glyph('out', 'glyph line'))),
    el('div', { class: 'qr-row' },
      code,
      el('div', { class: 'qr-actions' },
        el('p', { class: 'muted' }, place
          ? 'Put it on tables, the counter, a menu or an event badge. People who scan it can send feedback, with a photo, straight away. Stats count the scans.'
          : 'Print it on a receipt, a card or a slide. People who scan it land on the page and can send feedback straight away. Stats count the scans.'),
        el('button', { type: 'button', class: 'button primary', onclick: async () => download(await poster(url, project, scanURL), `${project.slug || project.id}-poster.png`) }, glyph('download', 'glyph line'), 'Poster (PNG)'),
        el('button', { type: 'button', class: 'button', onclick: () => download(new Blob([qrSVG(scanURL, color)], { type: 'image/svg+xml' }), `${project.slug || project.id}-qr.svg`) }, glyph('download', 'glyph line'), 'QR code (SVG)'))))

  put(
    el('div', { class: 'share-grid' },
      el('section', {},
        el('h2', {}, 'Your feedback page'),
        el('p', { class: 'muted section-note' }, 'A page of its own where anyone can send feedback, see the items you make public, vote and comment. Comments wait for your approval.'),
        form,
        pictures(project, status)),
      handout || el('section', { class: 'handout off' }, el('h2', {}, 'Link and QR code'), el('p', { class: 'muted' }, 'Turn the page on to get its link and QR code.'))))
}

function settings(project, saved = '') {
  const name = el('input', { value: project.name, maxlength: '60', required: true })
  const status = el('p', { class: 'muted', role: 'status' }, saved)
  const saveButton = el('button', { type: 'submit', class: 'button primary' }, 'Save')
  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    saveButton.disabled = true
    try {
      project = (await api('PATCH', '/api/projects/' + project.id, { name: name.value })).project
      renamed(project)
      settings(project, 'Saved.')
    } catch (problem) { status.textContent = problem.message; saveButton.disabled = false }
  } },
    el('label', { class: 'field' }, el('span', {}, 'Project name'), name,
      el('small', {}, 'Shown on the form, your public page and its poster.')),
    el('div', { class: 'form-actions' }, status, saveButton))
  put(
    el('section', { class: 'settings' }, el('h2', {}, 'Project'), form),
    el('section', { class: 'danger-zone' },
      el('h2', {}, 'Delete project'),
      el('p', { class: 'muted' }, 'Deletes the project with every item, file, comment, note and stat in it. The snippet and the public page stop working.'),
      el('button', { type: 'button', class: 'button danger', onclick: async () => {
        if (!confirm(`Delete ${project.name} and all its feedback for good?`)) return
        try { await api('DELETE', '/api/projects/' + project.id); shell = null; go('/') } catch (problem) { alert(problem.message) }
      } }, 'Delete project')))
}
