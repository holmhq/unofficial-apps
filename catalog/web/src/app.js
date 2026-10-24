// The store: a front page of every app, and a page for each one. Data comes
// from the repository's index.json: embedded in the page by the server, or
// through /api/index.
import { $, el, icon, bytes, paragraphs, stars, track, applyTint, REPO } from './lib.js'
import { openInstall } from './install.js'
import { loadViewer, onViewer, setViewer } from './account.js'
import { reviewsSection } from './reviews.js'
import { adminPage } from './admin.js'

const ref = new URLSearchParams(location.search).get('ref') || 'main'
const withRef = path => ref === 'main' ? path : path + '?ref=' + encodeURIComponent(ref)
const main = $('#main')
let index = null

// Optional sections pass false or undefined; leave them out of the page.
const show = (...sections) => main.replaceChildren(...sections.filter(Boolean))

const subtitle = app => (app.listing && app.listing.subtitle) || app.description
// At main, images come from /api/media under a URL that carries their hash, which the
// edge can cache; other refs read them through /api/file.
const shotURL = (app, shot) => ref === 'main' && shot.hash
  ? `/api/media/${app.path}/${shot.path.replace(/^listing\//, '')}?v=${shot.hash}`
  : `/api/file?ref=${encodeURIComponent(ref)}&app=${app.path}&path=${encodeURIComponent(shot.path)}`
// PROMPT.md wraps its lines at 80 columns; rejoin them so the prompt reflows
// on a phone, keeping paragraphs and list items.
const reflow = text => text.replace(/\n(?!\n|- )\s*/g, ' ')
const external = (href, ...children) => el('a', { href, rel: 'noopener', target: '_blank' }, ...children)

// A screenshot the store hasn't cached yet can come back busy, since the node
// limits how many files an app fetches at once: try it again a few times.
function shotImage(attributes) {
  const image = el('img', attributes)
  let tries = 0
  image.addEventListener('error', () => {
    if (++tries > 3) return
    setTimeout(() => { image.src = attributes.src + '&retry=' + tries }, 400 * tries * tries)
  })
  return image
}

const getButton = app => el('button', { type: 'button', class: 'get', 'aria-label': 'Get ' + app.title, onclick: () => openInstall(app) }, 'Get')

// Category, rating, and for admins whether the store is hiding the app.
const meta = app => [
  app.listing && app.listing.category,
  app.rating && [stars(app.rating.average, false), ` ${app.rating.average.toFixed(1)}`],
  app.hidden && 'Hidden from the store'
].filter(Boolean).flatMap((part, i) => i ? ['  ', part] : [part])

function chevron() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 12 20')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'M10 2 2 10l8 8')
  svg.append(path)
  return svg
}

function row(app) {
  return el('li', { class: 'row' },
    el('a', { class: 'row-link', href: withRef('/apps/' + app.path), 'data-link': true },
      icon(app, 'm'),
      el('span', { class: 'row-text' },
        el('span', { class: 'row-title' }, app.title),
        el('span', { class: 'row-sub' }, subtitle(app)),
        el('span', { class: 'row-meta' }, meta(app)))),
    getButton(app))
}

function featured(app) {
  const shot = app.listing.screenshots[0]
  return el('section', { class: 'feature', style: app.themeColor ? `--tile: ${app.themeColor}` : null },
    el('div', { class: 'feature-text' },
      icon(app, 'l'),
      el('h2', {}, el('a', { href: withRef('/apps/' + app.path), 'data-link': true }, app.title)),
      el('p', {}, subtitle(app)),
      getButton(app)),
    el('div', { class: 'feature-shot' },
      shotImage({ src: shotURL(app, shot), alt: shot.alt, width: shot.width, height: shot.height })))
}

function storefront() {
  document.title = 'Unofficial Holm apps'
  const feature = index.apps.find(app => app.listing && app.listing.featured && app.listing.screenshots.length)
  show(
    el('section', { class: 'masthead' },
      el('h1', {}, 'Apps'),
      el('p', { class: 'lede' }, 'Small, real apps for your Holm node, each built by a coding agent from a short prompt.')),
    feature && featured(feature),
    el('section', { class: 'shelf' },
      el('h2', {}, 'All apps'),
      el('ul', { class: 'rows' }, index.apps.map(row))))
}

const fact = (value, label) => value && el('li', {}, el('strong', {}, value), el('span', {}, label))
const info = (label, ...value) => el('div', {}, el('dt', {}, label), el('dd', {}, ...value))

function productPage(app) {
  document.title = `${app.title} – Unofficial Holm apps`
  const listing = app.listing || { screenshots: [] }
  const others = index.apps.filter(other => other !== app)
  track(app.path, 'view')
  show(
    el('nav', { class: 'back' }, el('a', { href: withRef('/'), 'data-link': true }, chevron(), 'Apps')),
    app.hidden && el('p', { class: 'notice' }, 'This app is hidden from the store. Only admins can see this page.'),
    el('header', { class: 'product' },
      icon(app, 'xl'),
      el('div', { class: 'product-text' },
        el('h1', {}, app.title),
        el('p', { class: 'subtitle' }, subtitle(app)),
        el('div', { class: 'actions' },
          getButton(app),
          app.demo && external(app.demo, 'Open the live copy')))),
    el('ul', { class: 'facts' },
      app.rating && fact(`${app.rating.average.toFixed(1)} ★`, `${app.rating.count} ${app.rating.count === 1 ? 'rating' : 'ratings'}`),
      fact(app.version, 'Version'),
      fact(bytes(app.size), 'Size'),
      fact(listing.category, 'Category'),
      fact('MIT', 'License')),
    listing.screenshots.length > 0 && el('section', { class: 'shots', 'aria-label': 'Screenshots' },
      el('ul', {}, listing.screenshots.map(shot => el('li', {},
        shotImage({ src: shotURL(app, shot), alt: shot.alt, width: shot.width, height: shot.height, loading: 'lazy', style: `--ratio: ${(shot.width / shot.height).toFixed(4)}` }))))),
    el('section', { class: 'about' }, paragraphs(listing.description || app.description).map(text => el('p', {}, text))),
    listing.whatsNew && el('section', { class: 'news' },
      el('div', { class: 'section-head' }, el('h2', {}, 'What’s new'), el('span', {}, 'Version ' + app.version)),
      paragraphs(listing.whatsNew).map(text => el('p', {}, text))),
    reviewsSection(app),
    app.prompt && el('section', { class: 'prompt' },
      el('h2', {}, 'Built from a prompt'),
      el('p', {}, 'A coding agent built this app from this request, with Holm’s public reference as its only guide.'),
      el('blockquote', {}, el('pre', {}, reflow(app.prompt))),
      external(`${REPO}/blob/${encodeURI(app.tag)}/${app.path}/PROMPT.md`, 'Read every request in PROMPT.md')),
    el('section', { class: 'info' },
      el('h2', {}, 'Information'),
      el('dl', {},
        info('Repository', external(REPO, 'holmhq/unofficial-apps')),
        info('Release', external(`${REPO}/tree/${encodeURI(app.tag)}/${app.path}`, app.tag)),
        info('Size', bytes(app.size), app.files ? `, ${app.files} files` : ''),
        listing.category && info('Category', listing.category),
        info('License', 'MIT'),
        info('Documentation', external(`${REPO}/blob/${encodeURI(app.tag)}/${app.path}/README.md`, 'README')))),
    others.length > 0 && el('section', { class: 'shelf' },
      el('h2', {}, 'More apps'),
      el('ul', { class: 'rows' }, others.map(row))))
}

function notFound(path) {
  document.title = 'Not found – Unofficial Holm apps'
  show(el('section', { class: 'masthead' },
    el('h1', {}, 'No such app'),
    el('p', { class: 'lede' }, `There is no app called “${path}” in this repository. `,
      el('a', { href: withRef('/'), 'data-link': true }, 'See all apps'), '.')))
}

function route() {
  if (location.pathname.replace(/\/+$/, '') === '/admin') return adminPage(main, show)
  if (!index) return
  const match = /^\/apps\/([a-z0-9-]+)\/?$/.exec(location.pathname)
  if (!match) return storefront()
  const app = index.apps.find(app => app.path === match[1])
  app ? productPage(app) : notFound(match[1])
}

// The feedback form loads only when someone heads for it, so store pages stay light.
const feedback = $('#feedback')
const preloadFeedback = () => globalThis.HolmFeedback && globalThis.HolmFeedback.preload()
feedback.addEventListener('pointerenter', preloadFeedback)
feedback.addEventListener('focus', preloadFeedback)
feedback.addEventListener('click', () => globalThis.HolmFeedback && globalThis.HolmFeedback.open())

// Links inside the store change the page without reloading it.
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

async function load() {
  try {
    const response = await fetch('/api/index?ref=' + encodeURIComponent(ref), { cache: 'no-store' })
    const body = await response.json()
    if (!body.ok) throw new Error(body.error?.message || 'The index could not be read.')
    index = body.index
    applyTint(body.settings && body.settings.tint)
    route()
  } catch (error) {
    main.replaceChildren(el('div', { class: 'status error' },
      el('p', {}, 'The apps didn’t load. ', String(error.message).replace(/\.?$/, '.')),
      el('p', {}, el('button', { type: 'button', class: 'quiet', onclick: () => { main.replaceChildren(el('p', { class: 'status' }, 'Loading the apps…')); load() } }, 'Try again'),
        ' or read ', external(`${REPO}/blob/main/index.json`, 'index.json on GitHub'), '.')))
  }
}

// The server puts the index and the viewer in the page, so it draws at once;
// without them, ask the API for both together.
function embedded() {
  try { return JSON.parse(document.getElementById('boot')?.textContent || 'null') } catch { return null }
}
const boot = embedded()
if (boot && boot.index) {
  index = boot.index
  applyTint(boot.settings && boot.settings.tint)
  setViewer(boot.viewer)
  route()
} else {
  loadViewer(false)
  load()
}

// Signing in or out can change what's visible (admins see hidden apps), so
// the index is read again for the new viewer.
onViewer(() => load())
