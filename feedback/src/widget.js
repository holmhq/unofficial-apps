// The form inside a site's feedback panel. It runs on the feedback app's own
// origin, so sending is a same-origin request; the host page only learns
// that the panel should close.
import { el, inkOn } from './lib.js'
import { composer } from './compose.js'

const params = new URLSearchParams(location.search)
const projectId = params.get('p') || ''
// The landing page shows the form for project "demo", which never sends.
const preview = params.has('preview') || projectId === 'demo'
const root = document.getElementById('widget')

let config = { name: '', label: 'Feedback', color: '#c2410c', attachments: true }
// Unsaved settings from the set-up page win over the saved ones.
let override = {}

const close = () => parent.postMessage({ source: 'holm-feedback', type: 'close' }, '*')
addEventListener('keydown', event => { if (event.key === 'Escape') close() })

function paintColor() {
  document.documentElement.style.setProperty('--color', config.color)
  document.documentElement.style.setProperty('--on-color', inkOn(config.color))
}

function header() {
  return el('header', {},
    el('h1', {}, config.name ? `Send feedback to ${config.name}` : 'Send feedback'),
    el('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: close }, '×'))
}

function form() {
  root.replaceChildren(header(), composer({
    endpoint: `/api/embed/${projectId}/items`,
    attachments: config.attachments,
    preview,
    context: { url: params.get('url') || '', title: params.get('title') || '', viewport: params.get('viewport') || '' },
    onSent: thanks,
    fine: preview ? 'Preview: nothing is sent.' : 'Sent with the address of this page, without anything after a ? or #.'
  }))
}

function thanks(number) {
  const ns = 'http://www.w3.org/2000/svg'
  const tick = document.createElementNS(ns, 'svg')
  tick.setAttribute('viewBox', '0 0 24 24')
  tick.setAttribute('aria-hidden', 'true')
  tick.innerHTML = '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.3 6.3L10.5 14l-2.8-2.8-1.4 1.4 4.2 4.2 7.2-7.1-1.4-1.4Z"/>'
  root.replaceChildren(header(), el('div', { class: 'thanks' },
    tick,
    el('h2', {}, 'Thanks, it’s sent'),
    el('p', {}, number ? `It’s #${number} in ${config.name ? config.name + '’s' : 'their'} inbox.` : preview ? 'This is a preview, so nothing was sent.' : 'It’s in their inbox.'),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'send', onclick: form }, 'Send another'),
      el('button', { type: 'button', class: 'quiet', onclick: close }, 'Close'))))
}

// The set-up page sends its unsaved settings, so the preview follows them as
// they change.
if (preview) {
  addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || event.data.source !== 'feedback-setup') return
    override = event.data.config || {}
    const next = { ...config, ...override }
    const rebuild = next.attachments !== config.attachments
    config = next
    paintColor()
    const title = root.querySelector('header h1')
    if (title) title.textContent = config.name ? `Send feedback to ${config.name}` : 'Send feedback'
    if (rebuild && root.querySelector('form')) form()
  })
}

async function start() {
  paintColor()
  if (projectId === 'demo') return form()
  try {
    const response = await fetch('/api/embed/' + encodeURIComponent(projectId) + (preview ? '' : '?open=1'))
    const reply = await response.json()
    if (!reply.ok) throw new Error(reply.error?.message)
    config = { ...reply.project, ...override }
    paintColor()
    form()
  } catch {
    root.replaceChildren(header(), el('p', { class: 'missing' }, 'This feedback form isn’t set up. If you run this site, check the project in its embed snippet.'))
  }
}

start()
