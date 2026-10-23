// A project's public page, for people who arrive from a link or a QR code:
// a feedback form anyone can use, then the items the owner chose to show, by
// status, with votes and comments. It wears the project's name and colour,
// not the app's.
import { el, api, glyph, store, ago, inkOn, lighten, STATUS, KIND, KIND_SETS } from './lib.js'
import { show } from './app.js'
import { composer, sentMark } from './compose.js'
import { mark as markOf } from './icons.js'
import { followStep } from './follow.js'

const SECTIONS = ['progress', 'planned', 'new', 'done']
const TITLES = { progress: 'In progress', planned: 'Planned', new: 'Under review', done: 'Done' }
// One fetch per page load, so moving between the list and an item neither
// refetches nor counts another visit.
const cache = new Map()

function voterToken() {
  let token = store.get('voter')
  if (!/^[a-z0-9]{16,40}$/.test(token || '')) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 24)
    store.set('voter', token)
  }
  return token
}

// The project's colour leads; dark mode uses a lighter step of it.
function paint(project) {
  const style = document.body.style
  const dark = lighten(project.color, 0.3)
  style.setProperty('--project', project.color)
  style.setProperty('--project-ink', inkOn(project.color))
  style.setProperty('--project-d', dark)
  style.setProperty('--project-d-ink', inkOn(dark))
  style.setProperty('--project-soft', lighten(project.color, 0.55))
}

// What the top of the page says when the owner hasn't written it.
const defaults = project => ({
  title: `Tell ${project.name} what you think`,
  intro: project.kinds.includes('praise')
    ? 'Loved something? Something not right? Tell us, with a photo if you like. It goes straight to the team.'
    : 'Report an issue, suggest an idea or ask a question. It goes straight to the team.'
})

export async function boardPage(key, number) {
  let data = cache.get(key)
  if (!data) {
    show(el('p', { class: 'muted page-loading' }, 'Loading…'))
    // QR codes and emails tag their links, so scans count on their own.
    const via = new URLSearchParams(location.search).get('via')
    try {
      data = await api('GET', `/api/boards/${encodeURIComponent(key)}?visit=1${/^(qr|email)$/.test(via || '') ? '&via=' + via : ''}`)
    } catch (problem) {
      document.title = 'Not found – feedback'
      return show(el('section', { class: 'page-head' }, el('h1', {}, 'No feedback page here'), el('p', { class: 'lede' }, problem.message)))
    }
    for (const name of [key, data.project.id, data.project.slug]) if (name) cache.set(name, data)
  }
  const { project } = data
  // The custom address is the one to share; old /b/<id> links move to it.
  const base = project.slug ? `/${project.slug}` : `/b/${project.id}`
  const want = base + (number ? `/${number}` : '')
  if (location.pathname + location.search !== want) history.replaceState(null, '', want)
  document.body.classList.add('on-board')
  paint(project)
  const item = number && data.items.find(entry => entry.number === number)
  return item ? itemView(data, item, base) : listView(data, base)
}

// The project's logo, or its icon on its colour.
const mark = project => markOf(project, 'board-mark')

// The page's top: its cover (or a pattern in its colour), logo and name. An
// item's page has the name row only.
function brand(project, cover = true) {
  const name = el('span', { class: 'board-name' }, el('strong', {}, project.name), el('span', { class: 'muted' }, 'Feedback'))
  if (!cover) return el('header', { class: 'board-brand' }, mark(project), name)
  return el('header', { class: 'board-hero' },
    el('div', { class: project.cover ? 'board-cover' : 'board-cover pattern', style: project.cover ? `background-image: url("${project.cover}")` : null }),
    el('div', { class: 'board-id' }, mark(project), name))
}

// The body without its first line when that line is the title.
const rest = item => {
  const [first, ...more] = item.body.split('\n')
  return first === item.title ? more.join('\n').trim() : item.body
}

const powered = () => el('p', { class: 'powered' }, 'Powered by ', el('a', { href: '/' }, 'feedback'))

function voteButton(project, item, voted, large) {
  const count = el('span', {}, item.votes)
  const button = el('button', {
    type: 'button', class: large ? 'vote large' : 'vote', 'aria-pressed': String(voted.has(item.id)),
    'aria-label': `Vote for #${item.number}, ${item.votes} ${item.votes === 1 ? 'vote' : 'votes'}`,
    onclick: async () => {
      if (voted.has(item.id)) return
      try {
        const reply = await api('POST', `/api/boards/${project.id}/items/${item.id}/vote`, { voter: voterToken() })
        voted.add(item.id)
        store.set('voted', [...voted])
        item.votes = reply.votes
        count.textContent = reply.votes
        button.setAttribute('aria-pressed', 'true')
      } catch (problem) { alert(problem.message) }
    }
  }, glyph('up'), count)
  return button
}

function thanks(project, number, again, follow) {
  return el('div', { class: 'board-thanks', role: 'status' },
    sentMark(),
    el('h2', {}, 'Thanks, it’s sent'),
    el('p', {}, number ? `It’s #${number} in ${project.name}’s inbox.` : `It’s in ${project.name}’s inbox.`,
      ' If they add it to this page, it will show up below.'),
    follow && followStep(follow),
    el('button', { type: 'button', class: 'button', onclick: again }, 'Send another'))
}

function listView(data, base) {
  const { project, items } = data
  document.title = `${project.name} – feedback`
  const voted = new Set(store.get('voted', []))
  const shown = items.filter(item => SECTIONS.includes(item.status))

  const card = el('section', { class: 'compose-card', 'aria-labelledby': 'send-title' })
  const fresh = () => card.replaceChildren(
    el('h1', { id: 'send-title' }, project.title || defaults(project).title),
    el('p', { class: 'lede' }, project.intro || defaults(project).intro),
    composer({
      endpoint: `/api/boards/${project.id}/items`,
      kinds: project.kinds || KIND_SETS.site,
      fields: project.fields || [],
      contact: project.contact,
      rating: project.rating,
      attachments: project.attachments,
      onSent: (number, reply = {}) => { card.replaceChildren(thanks(project, number, fresh, reply.follow)); card.scrollIntoView({ block: 'nearest' }) },
      fine: project.contact && project.contact.email === 'off' && project.contact.phone === 'off' ? null : 'Your contact details are only shown to the team.'
    }))
  fresh()

  const ticket = item => el('li', { class: 'board-card' },
    voteButton(project, item, voted),
    el('a', { class: 'board-card-body', href: `${base}/${item.number}`, 'data-link': true },
      el('h3', {}, item.title),
      rest(item) && el('p', {}, rest(item).slice(0, 200)),
      el('span', { class: 'board-meta' },
        el('span', { class: `pill status-${item.status}` }, TITLES[item.status]),
        el('span', {}, KIND[item.kind], ' #', item.number),
        item.comments > 0 && el('span', { class: 'comments-count' }, glyph('comment'), item.comments))))

  let filter = 'all'
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' })
  const list = el('ul', { class: 'board-list' })
  const paintList = () => {
    const counts = Object.fromEntries(SECTIONS.map(status => [status, shown.filter(item => item.status === status).length]))
    chips.replaceChildren(...[['all', 'All', shown.length], ...SECTIONS.filter(status => counts[status]).map(status => [status, TITLES[status], counts[status]])]
      .map(([key, label, n]) => el('button', { type: 'button', 'aria-pressed': String(key === filter), onclick: () => { filter = key; paintList() } },
        label, el('span', { class: 'count' }, n))))
    const order = item => SECTIONS.indexOf(item.status)
    list.replaceChildren(...shown.filter(item => filter === 'all' || item.status === filter)
      .sort((a, b) => order(a) - order(b) || b.votes - a.votes).map(ticket))
  }
  paintList()

  show(
    brand(project),
    el('div', { class: shown.length ? 'board-page' : 'board-page solo' },
      card,
      shown.length > 0 && el('section', { class: 'board-items', id: 'board', 'aria-labelledby': 'board-title' },
        el('h2', { id: 'board-title' }, 'What people have asked for'),
        el('p', { class: 'muted' }, 'Vote for what matters to you, or open one to comment.'),
        chips, list)),
    powered())
}

function itemView(data, item, base) {
  const { project } = data
  document.title = `${item.title} – ${project.name}`
  const voted = new Set(store.get('voted', []))
  const comments = el('ol', { class: 'comments' }, el('li', { class: 'muted' }, 'Loading comments…'))
  api('GET', `/api/boards/${project.id}/items/${item.id}/comments`).then(reply => {
    comments.replaceChildren(...(reply.comments.length ? reply.comments.map(comment => el('li', { class: comment.team ? 'team' : null },
      el('div', { class: 'comment-by' },
        el('strong', {}, comment.name || 'Someone'),
        comment.team && el('span', { class: 'team-badge' }, 'Team'),
        el('span', { class: 'muted' }, ago(comment.createdAt))),
      el('p', {}, comment.body))) : [el('li', { class: 'muted empty-comments' }, 'No comments yet.')]))
  }).catch(() => comments.replaceChildren(el('li', { class: 'form-error' }, 'Comments didn’t load.')))

  const body = el('textarea', { rows: '3', maxlength: '2000', required: true, placeholder: 'Add to this, or say why it matters to you', 'aria-label': 'Your comment' })
  const name = el('input', { maxlength: '40', autocomplete: 'nickname', placeholder: 'Your name (optional)', 'aria-label': 'Your name' })
  const trap = el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'trap', 'aria-hidden': 'true' })
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true })
  const post = el('button', { type: 'submit', class: 'button primary' }, 'Post comment')
  const form = el('form', { class: 'comment-form', novalidate: true, onsubmit: async event => {
    event.preventDefault()
    error.hidden = true
    if (body.value.trim().length < 2) { error.textContent = 'Write a comment first.'; error.hidden = false; return }
    post.disabled = true
    try {
      await api('POST', `/api/boards/${project.id}/items/${item.id}/comments`, { body: body.value, name: name.value, website: trap.value })
      form.replaceWith(el('p', { class: 'comment-sent', role: 'status' }, glyph('check', 'glyph line'), `Thanks. Your comment will show here once ${project.name} approves it.`))
    } catch (problem) { error.textContent = problem.message; error.hidden = false; post.disabled = false }
  } }, body, el('div', { class: 'comment-row' }, name, post), trap, error,
    el('p', { class: 'muted fine' }, `Comments appear once ${project.name} approves them.`))

  show(
    brand(project, false),
    el('article', { class: 'board-item' },
      el('a', { class: 'back', href: base, 'data-link': true }, glyph('chevron'), 'All feedback'),
      el('div', { class: 'board-item-head' },
        voteButton(project, item, voted, true),
        el('div', {},
          el('span', { class: `pill status-${item.status}` }, TITLES[item.status] || STATUS[item.status]),
          el('h1', {}, item.title),
          el('p', { class: 'muted' }, KIND[item.kind], ' #', item.number, ' · ', ago(item.createdAt)))),
      rest(item) && el('p', { class: 'board-item-body' }, rest(item)),
      el('section', { class: 'comments-section', 'aria-labelledby': 'comments-title' },
        el('h2', { id: 'comments-title' }, 'Comments'),
        comments,
        form)),
    powered())
}
