// feedback: router, landing page and the projects list.
import { $, el, api, glyph, inkOn } from './lib.js'
import { mark } from './icons.js'
import { loadViewer, onViewer, viewer, signIn } from './account.js'
import { projectPage } from './project.js'
import { boardPage, sharedPage } from './board.js'
import { keysPage } from './keys.js'
import { statsPage } from './stats.js'
import { changelogPage } from './changelog.js'
import { openLink, lockedPage, remembered } from './link.js'
import { minePage, stopPage } from './mine.js'

// First path segments the app itself uses; any other short name may be a
// project's custom address (api/projects.js keeps the same list).
const RESERVED = new Set(['api', 'auth', 'b', 'f', 'projects', 'keys', 'stats', 'assets', 'src', 'vendor',
  'embed', 'widget', 'new', 'settings', 'account', 'admin', 'login', 'logout', 'signin', 'signup', 'help', 'about',
  'privacy', 'terms', 'docs', 'www', 'app', 'holm', 'index', 'changelog', 'preview', 'mine', 'stop'])

const main = $('#main')
// Optional sections pass false or undefined; leave them out of the page.
export const show = (...sections) => main.replaceChildren(...sections.flat(Infinity).filter(Boolean))
export const go = path => { history.pushState(null, '', path); route(); scrollTo(0, 0) }

function landing() {
  document.title = 'feedback'
  show(
    el('section', { class: 'hero' },
      el('div', { class: 'hero-text' },
        el('h1', {}, 'Hear what people think.'),
        el('p', { class: 'lede' }, 'A button on your website. A QR code on your tables, counter or event. People send ideas, problems and photos in seconds; you read them in one inbox and count every scan.'),
        el('p', {}, el('button', { type: 'button', class: 'button primary large', onclick: () => signIn().catch(() => {}) }, 'Sign in to start'))),
      el('div', { class: 'hero-demo', 'aria-label': 'The form your visitors see' },
        el('div', { class: 'browser' },
          el('div', { class: 'browser-bar' }, el('span'), el('span'), el('span')),
          el('div', { class: 'browser-page' },
            el('div', { class: 'fake-line wide' }), el('div', { class: 'fake-line' }), el('div', { class: 'fake-line short' }),
            demoForm())))),
    el('section', { class: 'steps' },
      el('h2', {}, 'How it works'),
      el('ol', {},
        el('li', {}, el('strong', {}, 'Make a project'), ' for a website, a shop, a restaurant or an event.'),
        el('li', {}, el('strong', {}, 'Paste its snippet'), ' into your pages, or print its QR code, or email its link.'),
        el('li', {}, el('strong', {}, 'Sort what arrives'), ': mark it planned, in progress or done, keep private notes, and choose what people can see, vote on and comment on.'))))
}

// The landing page's form, as tall as what's in it.
function demoForm() {
  const frame = el('iframe', { src: '/widget.html?p=demo', title: 'A preview of the feedback form', loading: 'lazy' })
  const listen = event => {
    if (!frame.isConnected) return removeEventListener('message', listen)
    if (event.source === frame.contentWindow && event.data?.source === 'holm-feedback' && event.data.type === 'size') frame.style.height = event.data.height + 'px'
  }
  addEventListener('message', listen)
  return frame
}

// Your projects, in a panel that scrolls on its own: the page around it
// never does. Each row shows the project's mark, the sites it's for, and
// what's waiting.
async function projectsPage() {
  document.title = 'Your projects – feedback'
  document.body.classList.add('fit')
  const list = el('ul', { class: 'projects' }, el('li', { class: 'muted empty' }, 'Loading…'))
  const count = el('span', { class: 'panel-count' })
  const name = el('input', { name: 'name', placeholder: 'Name a new project', maxlength: '60', autocomplete: 'off', 'aria-label': 'New project’s name', required: true })
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true })
  const create = el('form', { class: 'joined new-project', onsubmit: async event => {
    event.preventDefault()
    error.hidden = true
    try {
      const { project } = await api('POST', '/api/projects', { name: name.value })
      go(`/projects/${project.id}/setup`)
    } catch (problem) { error.textContent = problem.message; error.hidden = false }
  } }, name, el('button', { type: 'submit' }, glyph('plus', 'glyph line'), 'Create'))
  show(
    el('section', { class: 'page-head compact' }, el('h1', {}, 'Your projects'),
      el('p', { class: 'lede' }, 'One for each website, shop, restaurant or event.')),
    el('section', { class: 'panel projects-panel', 'aria-label': 'Projects' },
      el('header', { class: 'panel-head' }, el('h2', {}, 'Projects', count), create),
      error, list))
  try {
    const { projects } = await api('GET', '/api/projects')
    count.textContent = projects.length
    const waiting = ({ items, comments }) => [
      items > 0 && `${items} new`,
      comments > 0 && `${comments} to approve`
    ].filter(Boolean).join(' · ')
    const host = origin => origin.replace(/^https?:\/\//, '')
    list.replaceChildren(...(projects.length ? projects.map(project => el('li', { style: `--color: ${project.color}; --color-ink: ${inkOn(project.color)}` },
      mark(project, 'project-mark'),
      el('span', { class: 'project-text' },
        el('a', { class: 'project-link', href: `/projects/${project.id}`, 'data-link': true }, project.name),
        el('span', { class: 'project-meta' },
          project.sites[0] && el('a', { class: 'project-site', href: project.sites[0], target: '_blank', rel: 'noopener', title: project.sites.map(host).join(', ') },
            glyph('globe', 'glyph line'), el('span', { class: 'host' }, host(project.sites[0])), project.sites.length > 1 && el('span', { class: 'more' }, `+${project.sites.length - 1}`)),
          project.public
            ? el('a', { class: 'project-site page-link', href: `/${project.slug || 'b/' + project.id}`, target: '_blank', rel: 'noopener', title: 'The feedback page' }, glyph('out', 'glyph line'), el('span', { class: 'host' }, `/${project.slug || 'b/' + project.id}`))
            : !project.sites[0] && el('span', {}, 'Not on a site yet'))),
      waiting(project.waiting) && el('span', { class: 'project-waiting' }, waiting(project.waiting)),
      glyph('chevron', 'glyph line go'))) :
      [el('li', { class: 'muted empty' }, 'No projects yet. Name your first one above. Sent feedback to someone? See it in ',
        el('a', { href: '/mine', 'data-link': true }, 'Your feedback'), '.')]))
  } catch (problem) {
    list.replaceChildren(el('li', { class: 'form-error empty' }, problem.message))
  }
}

// An inbox link: spend it, then show its inbox (or say why not).
async function openFromLink(token) {
  show(el('p', { class: 'muted page-loading' }, 'Opening the inbox…'))
  try {
    await openLink(token)
    await loadViewer()
  } catch (problem) {
    lockedPage(problem.message)
  }
}

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  document.body.classList.remove('on-board', 'fit')
  document.querySelector('meta[name="robots"]')?.remove()
  let match
  if ((match = /^\/v\/([a-z0-9]{32})$/.exec(path))) return openFromLink(match[1])
  if (path === '/v') return lockedPage()
  if ((match = /^\/s\/([a-z0-9]{24})$/.exec(path))) return sharedPage(match[1])
  // A tab opened from an inbox link shows that inbox and its items, nothing else.
  const { link } = viewer()
  if (link) {
    match = /^\/projects\/([a-z0-9]{8})(?:\/(new|items\/(\d+)))?$/.exec(path)
    if (match?.[1] === link.project) return projectPage(link.project, match[3] ? Number(match[3]) : match[2] || 'inbox')
    history.replaceState(null, '', `/projects/${link.project}`)
    return projectPage(link.project, 'inbox')
  }
  if (remembered() === 'locked' && path.startsWith('/projects/') && !viewer().me) return lockedPage()
  if ((match = /^\/b\/([a-z0-9-]{3,40})(?:\/(\d+))?$/.exec(path))) return boardPage(match[1], match[2] && Number(match[2]))
  if (path === '/keys') return viewer().me ? keysPage() : landing()
  if (path === '/stats') return viewer().me ? statsPage() : landing()
  if (path === '/changelog') return changelogPage()
  if (path === '/mine') return minePage()
  if ((match = /^\/stop\/([a-z0-9]{24})$/.exec(path))) return stopPage(match[1])
  if ((match = /^\/projects\/([a-z0-9]{8})(?:\/(setup|design|form|share|settings|stats|new|items\/(\d+)))?$/.exec(path))) {
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
  // A project's tabs keep the page where it is, and focus on the tab.
  if (link.dataset.tab) return
  scrollTo(0, 0)
  main.focus({ preventScroll: true })
})
addEventListener('popstate', route)
onViewer(route)
loadViewer()

// The footer's Feedback link opens the app's own feedback form (embed.js in
// index.html), once the form says it's there. A copy of the app deployed
// elsewhere doesn't have that project, so the link stays hidden.
const ownFeedback = $('#own-feedback')
const offerFeedback = () => { ownFeedback.hidden = !window.HolmFeedback?.ready }
addEventListener('holmfeedback:ready', offerFeedback)
offerFeedback()
ownFeedback.addEventListener('click', () => window.HolmFeedback ? window.HolmFeedback.open() : (ownFeedback.hidden = true))
