// A project's public board: the items its owner chose to show, by status,
// with one vote per browser.
import { el, api, glyph, store, STATUS, KIND } from './lib.js'
import { show } from './app.js'

const SECTIONS = ['progress', 'planned', 'new', 'done']
const TITLES = { progress: 'In progress', planned: 'Planned', new: 'Under review', done: 'Done' }

function voterToken() {
  let token = store.get('voter')
  if (!/^[a-z0-9]{16,40}$/.test(token || '')) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 24)
    store.set('voter', token)
  }
  return token
}

export async function boardPage(id) {
  show(el('p', { class: 'muted page-loading' }, 'Loading…'))
  let data
  try {
    data = await api('GET', '/api/boards/' + id)
  } catch (problem) {
    document.title = 'Board not found – feedback'
    return show(el('section', { class: 'page-head' }, el('h1', {}, 'No public board here'), el('p', { class: 'lede' }, problem.message)))
  }
  const { project, items } = data
  document.title = `${project.name} – feedback`
  document.getElementById('main').style.setProperty('--project', project.color)
  const voted = new Set(store.get('voted', []))
  const card = item => {
    const count = el('span', {}, item.votes)
    const button = el('button', {
      type: 'button', class: 'vote', 'aria-pressed': String(voted.has(item.id)),
      'aria-label': `Vote for #${item.number}, ${item.votes} ${item.votes === 1 ? 'vote' : 'votes'}`,
      onclick: async () => {
        if (voted.has(item.id)) return
        try {
          const reply = await api('POST', `/api/boards/${project.id}/items/${item.id}/vote`, { voter: voterToken() })
          voted.add(item.id)
          store.set('voted', [...voted])
          count.textContent = reply.votes
          button.setAttribute('aria-pressed', 'true')
        } catch (problem) { alert(problem.message) }
      }
    }, glyph('up'), count)
    return el('li', { class: 'board-card' }, button,
      el('div', {},
        el('h3', {}, item.title),
        item.body !== item.title && el('p', {}, item.body.slice(item.title.length).trim().slice(0, 280)),
        el('span', { class: 'muted' }, KIND[item.kind], ' #', item.number)))
  }
  // The board has the project's own feedback button, so readers can add to it.
  if (!window.HolmFeedback && !document.querySelector('script[data-project]')) {
    document.body.append(el('script', { src: '/embed.js', 'data-project': project.id, 'data-color': project.color, async: true }))
  }
  show(
    el('section', { class: 'page-head board-head', style: `--project: ${project.color}` },
      el('h1', {}, project.name),
      el('p', { class: 'lede' }, 'What people have asked for, and where it stands. Vote for what matters to you.')),
    items.length === 0 && el('p', { class: 'empty' }, 'Nothing on the board yet.'),
    SECTIONS.map(status => {
      const list = items.filter(item => item.status === status).sort((a, b) => b.votes - a.votes)
      return list.length > 0 && el('section', { class: 'board-section' },
        el('h2', {}, el('span', { class: `pill status-${status}` }, TITLES[status] || STATUS[status]), el('span', { class: 'muted' }, list.length)),
        el('ul', { class: 'board-list' }, list.map(card)))
    }))
}
