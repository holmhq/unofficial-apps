// feedback: router, landing page and the projects list.
import { $, el, api } from './lib.js'
import { loadViewer, onViewer, viewer, signIn } from './account.js'
import { projectPage } from './project.js'
import { boardPage } from './board.js'
import { keysPage } from './keys.js'
import { statsPage } from './stats.js'

// First path segments the app itself uses; any other short name may be a
// project's custom address (api/projects.js keeps the same list).
const RESERVED = new Set(['api', 'auth', 'b', 'f', 'projects', 'keys', 'stats', 'assets', 'src', 'vendor',
  'embed', 'widget', 'new', 'settings', 'account', 'admin', 'login', 'logout', 'signin', 'signup', 'help', 'about',
  'privacy', 'terms', 'docs', 'www', 'app', 'holm', 'index'])

const main = $('#main')
// Optional sections pass false or undefined; leave them out of the page.
export const show = (...sections) => main.replaceChildren(...sections.flat(Infinity).filter(Boolean))
export const go = path => { history.pushState(null, '', path); route(); scrollTo(0, 0) }

function landing() {
  document.title = 'feedback'
  show(
    el('section', { class: 'hero' },
      el('div', { class: 'hero-text' },
        el('h1', {}, 'A feedback button for any website.'),
        el('p', { class: 'lede' }, 'Add one line to your site, or share a page of its own with a QR code. Visitors send bugs, ideas and questions, with screenshots if they like, and you sort them in one inbox.'),
        el('p', {}, el('button', { type: 'button', class: 'button primary large', onclick: () => signIn().catch(() => {}) }, 'Sign in to start'))),
      el('div', { class: 'hero-demo', 'aria-label': 'The form your visitors see' },
        el('div', { class: 'browser' },
          el('div', { class: 'browser-bar' }, el('span'), el('span'), el('span')),
          el('div', { class: 'browser-page' },
            el('div', { class: 'fake-line wide' }), el('div', { class: 'fake-line' }), el('div', { class: 'fake-line short' }),
            el('iframe', { src: '/widget.html?p=demo', title: 'A preview of the feedback form', loading: 'lazy' }))))),
    el('section', { class: 'steps' },
      el('h2', {}, 'How it works'),
      el('ol', {},
        el('li', {}, el('strong', {}, 'Make a project'), ' for each site or product.'),
        el('li', {}, el('strong', {}, 'Paste its snippet'), ' into your pages, or share its own page and QR code.'),
        el('li', {}, el('strong', {}, 'Sort what arrives'), ': mark it planned, in progress or done, keep private notes, and choose what people can see, vote on and comment on.'))))
}

async function projectsPage() {
  document.title = 'Your projects – feedback'
  const list = el('ul', { class: 'projects' }, el('li', { class: 'muted' }, 'Loading…'))
  const name = el('input', { name: 'name', placeholder: 'My website', maxlength: '60', autocomplete: 'off', 'aria-label': 'Project name' })
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true })
  const create = el('form', { class: 'new-project', onsubmit: async event => {
    event.preventDefault()
    error.hidden = true
    try {
      const { project } = await api('POST', '/api/projects', { name: name.value })
      go(`/projects/${project.id}/setup`)
    } catch (problem) { error.textContent = problem.message; error.hidden = false }
  } }, name, el('button', { type: 'submit', class: 'button primary' }, 'New project'))
  show(
    el('section', { class: 'page-head' }, el('h1', {}, 'Your projects'),
      el('p', { class: 'lede' }, 'One project per site or product. Each has its own snippet, inbox and board.')),
    create, error, list)
  try {
    const { projects } = await api('GET', '/api/projects')
    const waiting = ({ items, comments }) => [
      items > 0 && `${items} new`,
      comments > 0 && `${comments} ${comments === 1 ? 'comment' : 'comments'} to approve`
    ].filter(Boolean).join(' · ')
    list.replaceChildren(...(projects.length ? projects.map(project => el('li', {},
      el('a', { href: `/projects/${project.id}`, 'data-link': true },
        el('span', { class: 'swatch', style: `--color: ${project.color}` }),
        el('span', { class: 'project-name' }, project.name,
          el('span', { class: 'project-meta' }, project.public ? `Public page${project.slug ? ' /' + project.slug : ''}` : 'Private')),
        waiting(project.waiting) && el('span', { class: 'project-waiting' }, waiting(project.waiting))))) :
      [el('li', { class: 'muted' }, 'No projects yet. Name your first one above.')]))
  } catch (problem) {
    list.replaceChildren(el('li', { class: 'form-error' }, problem.message))
  }
}

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  document.body.classList.remove('on-board')
  let match
  if ((match = /^\/b\/([a-z0-9-]{3,40})(?:\/(\d+))?$/.exec(path))) return boardPage(match[1], match[2] && Number(match[2]))
  if (path === '/keys') return viewer().me ? keysPage() : landing()
  if (path === '/stats') return viewer().me ? statsPage() : landing()
  if ((match = /^\/projects\/([a-z0-9]{8})(?:\/(setup|share|settings|stats|items\/(\d+)))?$/.exec(path))) {
    if (!viewer().me) return landing()
    return projectPage(match[1], match[3] ? Number(match[3]) : match[2] || 'inbox')
  }
  if ((match = /^\/([a-z0-9-]{3,40})(?:\/(\d+))?$/.exec(path)) && !RESERVED.has(match[1])) return boardPage(match[1], match[2] && Number(match[2]))
  return viewer().me ? projectsPage() : landing()
}

// Links inside the app change the page without reloading it.
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-link]')
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (link.href !== location.href) history.pushState(null, '', link.href)
  route()
  scrollTo(0, 0)
  main.focus({ preventScroll: true })
})
addEventListener('popstate', route)
onViewer(route)
loadViewer()

