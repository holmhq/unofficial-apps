// The form inside a site's feedback panel. It runs on the feedback app's own
// origin, so sending is a same-origin request; the host page only learns
// that the panel should close.
const params = new URLSearchParams(location.search)
const projectId = params.get('p') || ''
// The landing page shows the form for project "demo", which never sends.
const preview = params.has('preview') || projectId === 'demo'
const root = document.getElementById('widget')

const KINDS = [
  { id: 'bug', label: 'Bug', prompt: 'What went wrong? What did you expect to happen?', icon: 'M12 3a4 4 0 0 1 4 4v1h1.5l1.8-1.8 1.4 1.4L19 9.3V11h2v2h-2v1a7 7 0 0 1-.4 2.3l2.1 2.1-1.4 1.4-1.7-1.7A7 7 0 0 1 12 21a7 7 0 0 1-5.6-2.9l-1.7 1.7-1.4-1.4 2.1-2.1A7 7 0 0 1 5 14v-1H3v-2h2V9.3L3.3 7.6l1.4-1.4L6.5 8H8V7a4 4 0 0 1 4-4Zm-1 7v9.9a5 5 0 0 0 2 0V10h-2Z' },
  { id: 'idea', label: 'Idea', prompt: 'What would make this better?', icon: 'M12 2a7 7 0 0 1 4 12.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.3A7 7 0 0 1 12 2Zm-3 18h6v2H9v-2Z' },
  { id: 'question', label: 'Question', prompt: 'What would you like to know?', icon: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 14v2h2v-2h-2Zm1-10a4 4 0 0 0-4 4h2a2 2 0 1 1 3 1.7c-1.2.7-2 1.6-2 3.3h2c0-.9.4-1.3 1-1.7A4 4 0 0 0 12 6Z' }
]

let config = { name: '', label: 'Feedback', color: '#c2410c' }
let kind = 'idea'

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (key === 'class') el.className = value
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
    else el.setAttribute(key, value === true ? '' : value)
  }
  el.append(...children.flat(Infinity).filter(child => child != null && child !== false))
  return el
}

function glyph(d) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', d)
  svg.append(path)
  return svg
}

const close = () => parent.postMessage({ source: 'holm-feedback', type: 'close' }, '*')
addEventListener('keydown', event => { if (event.key === 'Escape') close() })

function header() {
  return h('header', {},
    h('h1', {}, config.name ? `Send feedback to ${config.name}` : 'Send feedback'),
    h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: close }, '×'))
}

function form(draft = {}) {
  const message = h('textarea', { name: 'body', required: true, maxlength: '4000', rows: '6' })
  message.value = draft.body || ''
  const email = h('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: '200', placeholder: 'you@example.com', value: draft.email || '' })
  const trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'trap', 'aria-hidden': 'true' })
  const error = h('p', { class: 'error', role: 'alert', hidden: true })
  const send = h('button', { type: 'submit', class: 'send' }, 'Send')
  const kinds = h('div', { class: 'kinds', role: 'radiogroup', 'aria-label': 'Kind of feedback' })
  const paintKinds = () => {
    const current = KINDS.find(k => k.id === kind)
    message.placeholder = current.prompt
    message.setAttribute('aria-label', current.prompt)
    kinds.replaceChildren(...KINDS.map(k => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(k.id === kind),
      onclick: () => { kind = k.id; paintKinds() }
    }, glyph(k.icon), k.label)))
  }
  paintKinds()

  const onSubmit = async event => {
    event.preventDefault()
    error.hidden = true
    if (message.value.trim().length < 3) { error.textContent = 'Write a few words first.'; error.hidden = false; message.focus(); return }
    send.disabled = true
    send.textContent = 'Sending…'
    try {
      let number = null
      if (!preview) {
        const response = await fetch(`/api/embed/${projectId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind, body: message.value, email: email.value, website: trap.value,
            url: params.get('url') || '', title: params.get('title') || '', viewport: params.get('viewport') || ''
          })
        })
        const reply = await response.json().catch(() => ({}))
        if (!response.ok || !reply.ok) throw new Error(reply.error?.message || 'It didn’t send. Try again.')
        number = reply.number
      }
      thanks(number)
    } catch (problem) {
      error.textContent = problem.message
      error.hidden = false
      send.disabled = false
      send.textContent = 'Send'
    }
  }

  root.replaceChildren(header(), h('form', { onsubmit: onSubmit, novalidate: true },
    kinds,
    message,
    h('label', { class: 'field' }, h('span', {}, 'Email, if you’d like a reply'), email),
    trap,
    error,
    send,
    h('p', { class: 'fine' }, preview ? 'Preview: nothing is sent.' : 'Sent with the address of this page, without anything after a ? or #.')))
}

function thanks(number) {
  root.replaceChildren(header(), h('div', { class: 'thanks' },
    glyph('M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.3 6.3L10.5 14l-2.8-2.8-1.4 1.4 4.2 4.2 7.2-7.1-1.4-1.4Z'),
    h('h2', {}, 'Thanks, it’s sent'),
    h('p', {}, number ? `It’s #${number} in ${config.name ? config.name + '’s' : 'their'} inbox.` : preview ? 'This is a preview, so nothing was sent.' : 'It’s in their inbox.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'send', onclick: () => form() }, 'Send another'),
      h('button', { type: 'button', class: 'quiet', onclick: close }, 'Close'))))
}

async function start() {
  if (projectId === 'demo') return form()
  try {
    const response = await fetch('/api/embed/' + encodeURIComponent(projectId))
    const reply = await response.json()
    if (!reply.ok) throw new Error(reply.error?.message)
    config = reply.project
    document.documentElement.style.setProperty('--color', config.color)
    form()
  } catch {
    root.replaceChildren(header(), h('p', { class: 'missing' }, 'This feedback form isn’t set up. If you run this site, check the project in its embed snippet.'))
  }
}

start()
