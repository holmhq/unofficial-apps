// A project: its inbox, one item at a time, and its setup.
import { el, api, ago, glyph, copyButton, store, STATUS, KIND } from './lib.js'
import { show, go } from './app.js'

const OPEN = ['new', 'planned', 'progress']
const FILTERS = [['open', 'Open'], ['new', 'New'], ['planned', 'Planned'], ['progress', 'In progress'], ['done', 'Done'], ['closed', 'Closed'], ['all', 'All']]
const COLORS = ['#c2410c', '#b42318', '#7c3aed', '#1d4ed8', '#0e7c66', '#26233a']

function tabs(project, active) {
  return el('nav', { class: 'tabs', 'aria-label': project.name },
    el('a', { href: `/projects/${project.id}`, 'data-link': true, 'aria-current': active === 'inbox' ? 'page' : null }, 'Inbox'),
    el('a', { href: `/projects/${project.id}/setup`, 'data-link': true, 'aria-current': active === 'setup' ? 'page' : null }, 'Set up'),
    project.public && el('a', { href: `/b/${project.id}`, 'data-link': true }, 'Public board'))
}

function head(project, active) {
  return el('section', { class: 'page-head' },
    el('a', { class: 'back', href: '/', 'data-link': true }, glyph('chevron'), 'Projects'),
    el('h1', {}, project.name),
    tabs(project, active))
}

// A ticket stub: the item's number and kind on a perforated edge, in the
// colour of its status, like a carbon copy.
function stub(item) {
  return el('span', { class: `stub status-${item.status}` },
    glyph(item.kind), el('span', { class: 'number' }, '#' + item.number))
}

export async function projectPage(id, view) {
  show(el('p', { class: 'muted page-loading' }, 'Loading…'))
  let project, items
  try {
    ;[{ project }, { items }] = await Promise.all([api('GET', '/api/projects/' + id), api('GET', `/api/projects/${id}/items`)])
  } catch (problem) {
    return show(el('section', { class: 'page-head' }, el('h1', {}, 'Not found'), el('p', { class: 'lede' }, problem.message, ' ',
      el('a', { href: '/', 'data-link': true }, 'Your projects'), '.')))
  }
  document.title = `${project.name} – feedback`
  if (view === 'setup') return setup(project)
  if (typeof view === 'number') {
    const item = items.find(entry => entry.number === view)
    return item ? itemPage(project, item) : inbox(project, items)
  }
  inbox(project, items)
}

function inbox(project, items) {
  let filter = store.get('filter', 'open')
  const list = el('ul', { class: 'tickets' })
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' })
  const matches = (item, key) => key === 'all' || (key === 'open' ? OPEN.includes(item.status) : item.status === key)
  const paint = () => {
    chips.replaceChildren(...FILTERS.map(([key, label]) => el('button', {
      type: 'button', 'aria-pressed': String(key === filter),
      onclick: () => { filter = key; store.set('filter', key); paint() }
    }, label, el('span', { class: 'count' }, items.filter(item => matches(item, key)).length))))
    const shown = items.filter(item => matches(item, filter))
    list.replaceChildren(...(shown.length ? shown.map(item => el('li', {},
      el('a', { class: 'ticket', href: `/projects/${project.id}/items/${item.number}`, 'data-link': true },
        stub(item),
        el('span', { class: 'ticket-body' },
          el('span', { class: 'ticket-title' }, item.title),
          el('span', { class: 'ticket-meta' },
            KIND[item.kind], ' from ', item.page ? item.page.replace(/^https?:\/\//, '') : 'an unknown page', ', ', ago(item.createdAt),
            item.public ? `, on the board with ${item.votes} ${item.votes === 1 ? 'vote' : 'votes'}` : '')),
        el('span', { class: `pill status-${item.status}` }, STATUS[item.status])))) :
      [el('li', { class: 'empty' }, items.length
        ? 'Nothing here. Try another filter.'
        : el('span', {}, 'No feedback yet. ', el('a', { href: `/projects/${project.id}/setup`, 'data-link': true }, 'Add the snippet to your site'), ' and it will arrive here.'))]))
  }
  paint()
  show(head(project, 'inbox'), chips, list)
}

function itemPage(project, item) {
  document.title = `#${item.number} ${item.title} – feedback`
  const notes = el('ol', { class: 'notes' })
  const paintNotes = list => notes.replaceChildren(...list.map(note => el('li', {},
    el('div', { class: 'note-by' }, el('img', { src: note.avatar, alt: '', referrerpolicy: 'no-referrer' }), el('strong', {}, note.name), el('span', { class: 'muted' }, ago(note.createdAt))),
    el('p', {}, note.body))))
  api('GET', `/api/items/${item.id}/notes`).then(reply => paintNotes(reply.notes)).catch(() => {})

  const save = async changes => {
    try {
      item = (await api('PATCH', '/api/items/' + item.id, changes)).item
      itemPage(project, item)
    } catch (problem) { alert(problem.message) }
  }
  const noteBody = el('textarea', { rows: '3', maxlength: '4000', placeholder: 'A note only you can see', 'aria-label': 'Add a note' })
  const addNote = el('form', { class: 'add-note', onsubmit: async event => {
    event.preventDefault()
    if (!noteBody.value.trim()) return
    try {
      paintNotes((await api('POST', `/api/items/${item.id}/notes`, { body: noteBody.value })).notes)
      noteBody.value = ''
    } catch (problem) { alert(problem.message) }
  } }, noteBody, el('button', { type: 'submit', class: 'button' }, 'Add note'))

  const fact = (label, ...value) => value.some(Boolean) && el('div', {}, el('dt', {}, label), el('dd', {}, ...value))
  show(
    head(project, 'inbox'),
    el('article', { class: 'item' },
      el('header', { class: 'item-head' }, stub(item), el('h2', {}, item.title)),
      el('div', { class: 'statuses', role: 'radiogroup', 'aria-label': 'Status' },
        Object.entries(STATUS).map(([key, label]) => el('button', {
          type: 'button', role: 'radio', class: `status-${key}`, 'aria-checked': String(item.status === key),
          onclick: () => item.status !== key && save({ status: key })
        }, label))),
      el('p', { class: 'item-body' }, item.body),
      el('dl', { class: 'facts' },
        fact('Kind', el('select', { 'aria-label': 'Kind', onchange: event => save({ kind: event.target.value }) },
          Object.entries(KIND).map(([key, label]) => el('option', { value: key, selected: item.kind === key }, label)))),
        fact('Sent', new Date(item.createdAt).toLocaleString()),
        fact('From', item.page && el('a', { href: item.page, rel: 'noopener noreferrer', target: '_blank' }, item.pageTitle || item.page)),
        fact('Reply to', item.email && el('a', { href: 'mailto:' + item.email }, item.email)),
        fact('Browser', item.browser),
        fact('Window', item.viewport && item.viewport.replace('x', ' × '))),
      el('div', { class: 'item-actions' },
        el('label', { class: 'toggle' },
          el('input', { type: 'checkbox', checked: item.public, onchange: event => save({ public: event.target.checked }) }),
          project.public ? 'Show on the public board' : 'Show on the public board (the board is off)'),
        el('button', { type: 'button', class: 'button danger', onclick: async () => {
          if (!confirm(`Delete #${item.number} for good?`)) return
          try { await api('DELETE', '/api/items/' + item.id); go(`/projects/${project.id}`) } catch (problem) { alert(problem.message) }
        } }, 'Delete')),
      el('section', { class: 'notes-section' }, el('h3', {}, 'Notes'), notes, addNote)))
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
  const status = el('p', { class: 'muted', role: 'status' })
  const name = el('input', { value: draft.name, maxlength: '60', oninput: event => { draft.name = event.target.value } })
  const label = el('input', { value: draft.label, maxlength: '24', oninput: event => { draft.label = event.target.value || 'Feedback'; code.textContent = snippet() } })
  const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Button colour' })
  const paintSwatches = () => swatches.replaceChildren(...COLORS.map(color => el('button', {
    type: 'button', class: 'swatch', style: `--color: ${color}`, 'aria-label': color, 'aria-pressed': String(draft.color === color),
    onclick: () => { draft.color = color; code.textContent = snippet(); paintSwatches() }
  })), el('input', { type: 'color', value: draft.color, 'aria-label': 'Custom colour', oninput: event => { draft.color = event.target.value; code.textContent = snippet(); paintSwatches() } }))
  paintSwatches()
  const side = el('select', { onchange: event => { draft.position = event.target.value; code.textContent = snippet() } },
    el('option', { value: 'right', selected: draft.position === 'right' }, 'Bottom right'),
    el('option', { value: 'left', selected: draft.position === 'left' }, 'Bottom left'))
  const sites = el('textarea', { rows: '3', placeholder: 'https://example.com', spellcheck: 'false' })
  sites.value = draft.origins.join('\n')
  const board = el('input', { type: 'checkbox', checked: draft.public, onchange: event => { draft.public = event.target.checked } })

  const saveButton = el('button', { type: 'submit', class: 'button primary' }, 'Save')
  const form = el('form', { class: 'setup', onsubmit: async event => {
    event.preventDefault()
    saveButton.disabled = true
    try {
      const origins = sites.value.split(/[\s,]+/).filter(Boolean)
      project = (await api('PATCH', '/api/projects/' + project.id, { name: draft.name, label: draft.label, color: draft.color, position: draft.position, origins, public: draft.public })).project
      Object.assign(draft, project)
      status.textContent = 'Saved. The preview and snippet show the new settings.'
      preview.src = `/widget.html?p=${project.id}&preview=1&t=${Date.now()}`
      code.textContent = snippet()
    } catch (problem) { status.textContent = problem.message }
    saveButton.disabled = false
  } },
    el('label', { class: 'field' }, el('span', {}, 'Project name'), name),
    el('label', { class: 'field' }, el('span', {}, 'Button text'), label),
    el('div', { class: 'field' }, el('span', {}, 'Colour'), swatches),
    el('label', { class: 'field' }, el('span', {}, 'Position'), side),
    el('label', { class: 'field' }, el('span', {}, 'Allowed sites, one per line'), sites,
      el('small', {}, 'Leave empty to accept feedback from any site.')),
    el('label', { class: 'toggle' }, board, 'Public board at ', el('code', {}, `${origin}/b/${project.id}`)),
    el('div', { class: 'form-actions' }, status, saveButton))

  show(
    head(project, 'setup'),
    el('section', { class: 'snippet' },
      el('h2', {}, 'Add it to your site'),
      el('p', { class: 'muted' }, 'Paste this before the closing ', el('code', {}, '</body>'), ' of every page that should have the button.'),
      el('pre', {}, code),
      copyButton(() => code.textContent, 'Copy snippet'),
      el('p', { class: 'muted' }, 'To open the form from your own link or button instead, add ', el('code', {}, 'data-button="none"'),
        ' and call ', el('code', {}, 'HolmFeedback.open()'), '.')),
    el('div', { class: 'setup-grid' },
      el('section', {}, el('h2', {}, 'Look and rules'), form),
      el('section', {}, el('h2', {}, 'Preview'), preview)),
    el('section', { class: 'danger-zone' },
      el('h2', {}, 'Delete project'),
      el('p', { class: 'muted' }, 'Deletes the project and every item and note in it. The snippet stops working.'),
      el('button', { type: 'button', class: 'button danger', onclick: async () => {
        if (!confirm(`Delete ${project.name} and all its feedback for good?`)) return
        try { await api('DELETE', '/api/projects/' + project.id); go('/') } catch (problem) { alert(problem.message) }
      } }, 'Delete project')))
}
