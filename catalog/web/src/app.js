// The store: a front page of every app, and a page for each one. Data comes
// from the repository's index.json: embedded in the page by the server, or
// through /api/index.
import { $, el, icon, bytes, paragraphs, stars, track, applyTint, store, REPO } from './lib.js'
import { openInstall } from './install.js'
import { loadViewer, onViewer, setViewer } from './account.js'
import { reviewsSection } from './reviews.js'
import { adminPage } from './admin.js'
import { startPage, isStart } from './start.js'

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

function featured(app, lazy = false) {
  const shot = app.listing.screenshots[0]
  return el('section', { class: 'feature', style: app.themeColor ? `--tile: ${app.themeColor}` : null },
    el('div', { class: 'feature-text' },
      icon(app, 'l'),
      el('h2', {}, el('a', { href: withRef('/apps/' + app.path), 'data-link': true }, app.title)),
      el('p', {}, subtitle(app)),
      getButton(app)),
    el('div', { class: 'feature-shot' },
      shotImage({ src: shotURL(app, shot), alt: shot.alt, width: shot.width, height: shot.height, loading: lazy ? 'lazy' : null })))
}

// The cover, when several apps are featured: a slideshow of their cards. It
// moves on every few seconds, and holds while a pointer is over it or focus is
// in it, and never for reduced motion. A mouse drags it, a finger swipes it.
function carousel(apps) {
  const track = el('div', { class: 'carousel-track' }, apps.map((app, i) => el('div', {
    class: 'slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${apps.length}: ${app.title}`
  }, featured(app, i > 0))))
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const width = () => track.children[1].offsetLeft - track.children[0].offsetLeft
  let at = 0
  const go = i => {
    at = (i + apps.length) % apps.length
    track.scrollTo({ left: track.children[at].offsetLeft, behavior: still.matches ? 'instant' : 'smooth' })
  }
  track.addEventListener('scroll', () => { at = Math.round(track.scrollLeft / width()) }, { passive: true })

  // The clock starts over whenever a hand lets go, so a slide never moves the
  // moment someone stops looking at it.
  let timer = null, held = false
  const run = () => {
    clearInterval(timer)
    if (still.matches) return
    timer = setInterval(() => {
      if (!track.isConnected) return clearInterval(timer)
      if (!held && !document.hidden) go(at + 1)
    }, 6000)
  }
  const hold = on => { held = on; if (!on) run() }

  // Dragging with a mouse: the track follows the pointer, then settles on the
  // next slide if it went a fifth of the way there, or back if not. A drag
  // isn't a click on the card under it.
  let drag = null, dragged = false
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    drag = { x: event.clientX, left: track.scrollLeft, from: at }
    dragged = false
  })
  track.addEventListener('pointermove', event => {
    if (!drag) return
    const dx = event.clientX - drag.x
    if (!dragged && Math.abs(dx) < 6) return
    if (!dragged) {
      dragged = true
      track.setPointerCapture(event.pointerId)
      track.classList.add('dragging')
    }
    track.scrollLeft = drag.left - dx
  })
  const drop = () => {
    if (!drag) return
    const moved = (track.scrollLeft - drag.left) / width()
    const from = drag.from
    drag = null
    if (!dragged) return
    // Snapping stays off until the slide has eased into place, or it would jump there first.
    track.classList.replace('dragging', 'settling')
    const settled = () => track.classList.remove('settling')
    track.addEventListener('scrollend', settled, { once: true })
    setTimeout(settled, 800)
    go(moved > 0.2 ? Math.min(from + 1, apps.length - 1) : moved < -0.2 ? Math.max(from - 1, 0) : from)
  }
  track.addEventListener('pointerup', drop)
  track.addEventListener('pointercancel', drop)
  track.addEventListener('click', event => {
    if (!dragged) return
    event.preventDefault()
    event.stopPropagation()
    dragged = false
  }, true)
  track.addEventListener('dragstart', event => event.preventDefault())

  const root = el('section', { class: 'carousel', 'aria-roledescription': 'carousel', 'aria-label': 'Featured apps' }, track)
  root.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hold(true) })
  root.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') hold(false) })
  track.addEventListener('touchstart', () => hold(true), { passive: true })
  track.addEventListener('touchend', () => hold(false), { passive: true })
  root.addEventListener('focusin', () => hold(true))
  root.addEventListener('focusout', () => hold(false))
  run()
  return root
}

// A grid view's cell: the icon, then the name and a Get button as an icon.
// The icon repeats the name's link for the pointer, so it is skipped by keys.
function card(app) {
  const href = withRef('/apps/' + app.path)
  return el('li', { class: 'app-card' },
    el('a', { class: 'app-card-icon', href, 'data-link': true, tabindex: '-1', 'aria-hidden': 'true' }, icon(app, 'l')),
    el('div', { class: 'app-card-foot' },
      el('a', { class: 'app-card-name', href, 'data-link': true, title: subtitle(app) }, app.title, app.hidden ? el('span', { class: 'app-card-hidden' }, ' · hidden') : null),
      el('button', { type: 'button', class: 'get-icon', 'aria-label': 'Get ' + app.title, title: 'Get ' + app.title, onclick: () => openInstall(app) }, glyph(GET))))
}

// Line icons for the view switch and the search field, on a 24-unit grid.
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
const LIST = 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'
const GRID = 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z'
const LENS = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4'
const CROSS = 'M7 7l10 10M17 7 7 17'
const GET = 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14'

// What the search looks in, and whether every word typed is there.
const haystack = app => [app.title, app.path, subtitle(app), app.description, app.listing && app.listing.category, app.listing && app.listing.description]
  .filter(Boolean).join(' ').toLowerCase()
const matches = (app, words) => words.every(word => haystack(app).includes(word))

// The front page's own state: the search, kept in the address so it can be
// shared (and Back brings it back), and list or grid, remembered. Both sit
// under the featured app, which stays put, so typing never moves the field.
let query = ''
let view = store.get('view') === 'grid' ? 'grid' : 'list'

function storefront() {
  document.title = 'Unofficial Holm apps'
  query = new URLSearchParams(location.search).get('q') || ''
  const features = index.apps.filter(app => app.listing && app.listing.featured && app.listing.screenshots.length)
  const featureCard = features.length > 1 ? carousel(features) : features[0] && featured(features[0])
  const count = el('span', { class: 'count', 'aria-live': 'polite' })
  const list = el('ul')
  const empty = el('div', { class: 'empty', hidden: true })

  const fill = () => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const found = index.apps.filter(app => matches(app, words))
    list.className = view === 'grid' ? 'cards' : 'rows'
    list.replaceChildren(...found.map(view === 'grid' ? card : row))
    count.textContent = words.length ? `${found.length} of ${index.apps.length}` : String(index.apps.length)
    empty.hidden = found.length > 0
    empty.replaceChildren(
      el('p', {}, 'No app here matches “', query.trim(), '”.'),
      el('p', {}, el('button', { type: 'button', class: 'quiet', onclick: () => setQuery('') }, 'Clear the search'), ', or ',
        el('a', { href: withRef('/start') + '#build', 'data-link': true }, 'build it with your agent'), '.'))
  }

  const input = el('input', {
    type: 'search', name: 'q', value: query, placeholder: 'Search apps', 'aria-label': 'Search apps',
    autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search'
  })
  const clear = el('button', { type: 'button', class: 'clear', 'aria-label': 'Clear the search', onclick: () => { setQuery(''); input.focus() } }, glyph(CROSS))
  const finder = el('form', { class: 'finder', role: 'search', onsubmit: event => { event.preventDefault(); input.blur() } },
    el('label', { class: 'search' }, glyph(LENS), input, el('kbd', { 'aria-hidden': 'true' }, '/'), clear),
    el('div', { class: 'views', role: 'group', 'aria-label': 'Show apps as' },
      [['list', 'List', LIST], ['grid', 'Grid', GRID]].map(([key, label, d]) => el('button', {
        type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(view === key), 'data-view': key,
        onclick: event => {
          view = key
          store.set('view', view)
          for (const button of event.currentTarget.parentNode.children) button.setAttribute('aria-pressed', String(button.dataset.view === view))
          fill()
        }
      }, glyph(d)))))
  const mark = () => finder.classList.toggle('typed', query !== '')
  const setQuery = value => {
    query = value
    input.value = value
    const url = new URL(location.href)
    if (value.trim()) url.searchParams.set('q', value.trim())
    else url.searchParams.delete('q')
    history.replaceState(null, '', url)
    mark()
    fill()
  }
  input.addEventListener('input', () => setQuery(input.value))
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    if (query) setQuery('')
    else input.blur()
  })

  mark()
  fill()
  show(
    el('section', { class: 'masthead' },
      el('h1', {}, 'Apps'),
      el('p', { class: 'lede' }, 'Small, real apps for your Holm node, each built by a coding agent from a short prompt.')),
    featureCard,
    el('section', { class: 'shelf' },
      el('div', { class: 'shelf-head' }, el('h2', {}, 'All apps', count), finder),
      list, empty))
}

// "/" anywhere on the front page goes to the search.
document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
  const at = document.activeElement
  if (at && (/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) || at.isContentEditable)) return
  const search = $('.finder input')
  if (!search) return
  event.preventDefault()
  search.focus()
})

const fact = (value, label) => value && el('li', {}, el('strong', {}, value), el('span', {}, label))
const info = (label, ...value) => el('div', {}, el('dt', {}, label), el('dd', {}, ...value))

function productPage(app) {
  document.title = `${app.title} – Unofficial Holm apps`
  const listing = app.listing || { screenshots: [] }
  const others = index.apps.filter(other => other !== app)
  track(app.path, 'view')
  show(
    back(),
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

const back = () => el('nav', { class: 'back' }, el('a', { href: withRef('/'), 'data-link': true }, chevron(), 'Apps'))

function route() {
  const start = isStart()
  const guide = $('.top-link')
  if (start) guide.setAttribute('aria-current', 'page')
  else guide.removeAttribute('aria-current')
  if (location.pathname.replace(/\/+$/, '') === '/admin') return adminPage(main, show)
  if (start) return startPage(index, show, back())
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
  scrollTo({ top: 0, behavior: 'instant' })
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
    // The guide reads well without the apps.
    if (isStart()) return
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
  if (isStart()) route()
  load()
}

// Signing in or out can change what's visible (admins see hidden apps), so
// the index is read again for the new viewer.
onViewer(() => load())
