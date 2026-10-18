// The form inside a site's feedback panel. It runs on the feedback app's own
// origin, so sending is a same-origin request; the host page only learns how
// tall the panel should be and when to close it.
import { el, glyph, inkOn, lighten, KIND_SETS } from './lib.js'
import { composer, sentMark, loadStars } from './compose.js'

const params = new URLSearchParams(location.search)
const projectId = params.get('p') || ''
// The landing page shows the form for project "demo", which never sends.
const demo = projectId === 'demo'
const preview = params.has('preview') || demo
const root = document.getElementById('widget')

const DEFAULTS = {
  name: '', title: '', intro: '', color: '#c2410c', theme: 'light', logo: null, cover: null, attachments: true,
  kinds: KIND_SETS.site, fields: [], contact: { email: 'optional', phone: 'off' }, rating: { ask: 'off', label: '' }
}
const DEMO = { ...DEFAULTS, name: 'Acme', rating: { ask: 'optional', label: '' } }
let config = demo ? DEMO : DEFAULTS
// Unsaved settings from the Design and Form tabs win over the saved ones.
let override = {}

// Messages to the page around the panel (embed.js), if there is one.
const tell = message => { if (parent !== window) parent.postMessage({ source: 'holm-feedback', ...message }, '*') }
const close = () => tell({ type: 'close' })
addEventListener('keydown', event => { if (event.key === 'Escape') close() })

function paint() {
  const style = document.documentElement.style
  const dark = lighten(config.color, 0.3)
  style.setProperty('--accent-l', config.color)
  style.setProperty('--accent-l-ink', inkOn(config.color))
  style.setProperty('--accent-d', dark)
  style.setProperty('--accent-d-ink', inkOn(dark))
  style.setProperty('--accent-soft', lighten(config.color, 0.55))
  document.documentElement.dataset.theme = config.theme || 'light'
}

const place = () => config.kinds.includes('praise')
const titleOf = () => config.title || (config.name ? `Tell ${config.name} what you think` : 'Send feedback')
const introOf = () => config.intro || (place()
  ? 'Loved something? Something not right? Tell us, with a photo if you like. It goes straight to the team.'
  : 'Report an issue, suggest an idea or ask a question. It goes straight to the team.')

// The project's logo, or its initial on its colour.
const mark = () => config.logo
  ? el('span', { class: 'mark logo' }, el('img', { src: config.logo, alt: '' }))
  : el('span', { class: 'mark', 'aria-hidden': 'true' }, (config.name || 'F').trim().charAt(0).toUpperCase())

function header(words = true) {
  return el('header', { class: config.cover ? 'head' : 'head plain' },
    el('div', { class: config.cover ? 'cover' : 'cover pattern', style: config.cover ? `background-image: url("${config.cover}")` : null }),
    el('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: close }, glyph('x')),
    mark(),
    words && el('div', { class: 'titles' }, el('h1', {}, titleOf()), el('p', { class: 'intro' }, introOf())))
}

function form() {
  root.replaceChildren(header(), el('div', { class: 'body' }, composer({
    endpoint: `/api/embed/${projectId}/items`,
    kinds: config.kinds,
    fields: config.fields,
    contact: config.contact,
    rating: config.rating,
    attachments: config.attachments,
    preview,
    context: { url: params.get('url') || '', title: params.get('title') || '', viewport: params.get('viewport') || '' },
    onSent: thanks,
    fine: preview ? 'Preview: nothing is sent.' : 'Sent with the address of this page, without anything after a ? or #.'
  })))
}

function thanks(number) {
  root.replaceChildren(header(false), el('div', { class: 'thanks' },
    sentMark(),
    el('h2', {}, 'Thanks, it’s sent'),
    el('p', {}, number ? `It’s #${number} in ${config.name ? config.name + '’s' : 'their'} inbox.` : preview ? 'This is a preview, so nothing was sent.' : 'It’s in their inbox.'),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'again', onclick: form }, 'Send another'),
      el('button', { type: 'button', class: 'quiet', onclick: close }, 'Close'))))
}

// The panel follows the content's height, so it never shows empty space.
new ResizeObserver(() => tell({ type: 'size', height: Math.ceil(root.getBoundingClientRect().height) })).observe(root)

// Opens count once per page, when the panel first opens; a preview counts
// nothing. Copies of embed.js from before 0.6 (host=2 is missing) only load
// the form when it opens, so loading counts. On a computer the message takes
// the focus, ready for typing.
let counted = false
const countOpen = () => {
  if (!counted && !preview) fetch(`/api/embed/${encodeURIComponent(projectId)}/open`, { method: 'POST' }).catch(() => {})
  counted = true
}
if (params.get('host') !== '2') countOpen()
addEventListener('message', event => {
  if (event.source !== parent || !event.data || event.data.source !== 'holm-feedback-host') return
  if (event.data.type !== 'open') return
  countOpen()
  if (!preview && matchMedia('(pointer: fine)').matches) root.querySelector('textarea')?.focus({ preventScroll: true })
})

// The Design and Form tabs send their unsaved settings, so the preview
// follows them as they change; only a change to the questions redraws the
// form.
if (preview) {
  addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || event.data.source !== 'feedback-setup') return
    override = event.data.config || {}
    const next = { ...config, ...override }
    const shape = c => JSON.stringify([c.attachments, c.kinds, c.fields, c.contact, c.rating])
    const rebuild = shape(next) !== shape(config)
    config = next
    paint()
    if (config.rating.ask !== 'off') loadStars()
    if (rebuild && root.querySelector('form')) return form()
    const head = root.querySelector('header')
    if (head) head.replaceWith(header(!!head.querySelector('.titles')))
  })
}

function ready() {
  root.classList.add('entering')
  setTimeout(() => root.classList.remove('entering'), 700)
  tell({ type: 'ready', theme: config.theme })
}

async function start() {
  paint()
  if (demo) { form(); return ready() }
  try {
    const response = await fetch('/api/embed/' + encodeURIComponent(projectId))
    const reply = await response.json()
    if (!reply.ok) throw new Error(reply.error?.message)
    config = { ...DEFAULTS, ...reply.project, ...override }
    paint()
    if (config.rating.ask !== 'off') await Promise.race([loadStars(), new Promise(resolve => setTimeout(resolve, 1200))])
    form()
  } catch {
    root.replaceChildren(header(false), el('p', { class: 'missing' }, 'This feedback form isn’t set up. If you run this site, check the project in its embed snippet.'))
  }
  ready()
}

start()
