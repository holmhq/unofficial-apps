// Until's page: the list of trackers, the sheets that add, edit and rate
// them, and the account menu. Signed out, trackers live in this browser;
// signed in, they live in the member's own storage on the node.

import { h, openSheet, closeTopSheet, say } from './ui.js'
import { icon } from './icons.js'
import * as days from './dates.js'

const LOCAL = 'until:countdowns:v1'   // signed-out trackers, on this device
const SETTINGS = 'until:settings:v1'  // colour and appearance
const SYNCED = 'until:account:v1'     // a member's trackers as last loaded, for offline launches
const BARS = { garden: { light: '#eff8f1', dark: '#102019' }, signal: { light: '#fff3ef', dark: '#201620' } }

// The rating is feed-stars, Holm's own star component, from its CDN: pinned
// to one commit of github.com/holmhq/cdn and checked against its hash. If it
// can't load, plain stars stand in.
const STARS = 'https://cdn.jsdelivr.net/gh/holmhq/cdn@9a7a089cadc57f338f393ec56e1460cbd725b0ce/libs/ui/feed-stars/v-0.0.3/feed-stars.min.mjs'
const STARS_HASH = 'sha384-ViNwawf1ukR3jQWH/hYZkg5R8mas5aCtmGgDEjozYHpcOyeGvF1divll69B62K3E'

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} },
  drop(key) { try { localStorage.removeItem(key) } catch {} }
}

const state = {
  me: null,
  loginURL: '/auth/login',
  logoutURL: null,
  mode: 'loading', // 'device' signed out, 'account' signed in, 'offline' signed in with no network
  trackers: [],
  shownOn: days.today()
}

const saved = store.get(SETTINGS, {}) || {}
const settings = {
  themeFamily: saved.themeFamily === 'signal' ? 'signal' : 'garden',
  appearance: ['light', 'dark'].includes(saved.appearance) ? saved.appearance : 'system'
}

async function api(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw Object.assign(new Error("You're offline, so that wasn't saved."), { offline: true })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: response.status })
  return data
}

// ── Theme ──

const darkQuery = matchMedia('(prefers-color-scheme: dark)')

function applyTheme() {
  const mode = settings.appearance === 'system' ? (darkQuery.matches ? 'dark' : 'light') : settings.appearance
  const root = document.documentElement
  root.dataset.themeFamily = settings.themeFamily
  root.dataset.themeMode = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BARS[settings.themeFamily][mode])
}

function setSetting(key, value) {
  settings[key] = value
  store.set(SETTINGS, settings)
  applyTheme()
  renderAccount(true)
  if (state.mode === 'account') api('/api/settings', { method: 'PATCH', body: settings }).catch(() => {})
}

darkQuery.addEventListener('change', applyTheme)

// ── Loading ──

const deviceTrackers = () =>
  (store.get(LOCAL, []) || []).filter(x => x && typeof x === 'object').map(days.normalize).filter(t => t.title)

async function start() {
  try {
    const me = await api(`/api/me?next=${encodeURIComponent(location.pathname)}`)
    state.me = me.member
    state.loginURL = me.loginURL
    state.logoutURL = me.logoutURL
  } catch (error) {
    if (error.offline && store.get(SYNCED, null)) return showOffline()
  }
  renderAccount()
  await load()
}

async function load() {
  if (!state.me) {
    state.mode = 'device'
    state.trackers = deviceTrackers()
    store.drop(SYNCED)
    return render()
  }
  try {
    const [list, remote] = await Promise.all([api('/api/countdowns'), api('/api/settings').catch(() => null)])
    state.mode = 'account'
    state.trackers = list.countdowns.map(days.normalize)
    store.set(SYNCED, state.trackers)
    // A first visit since signing in keeps this device's choice and saves it.
    if (remote?.settings) {
      Object.assign(settings, remote.settings)
      store.set(SETTINGS, settings)
      applyTheme()
      renderAccount()
    } else {
      api('/api/settings', { method: 'PATCH', body: settings }).catch(() => {})
    }
    say('')
  } catch (error) {
    if (error.status === 401) {
      state.me = null
      renderAccount()
      return load()
    }
    return showOffline()
  }
  render()
}

function showOffline() {
  state.mode = 'offline'
  state.trackers = (store.get(SYNCED, []) || []).map(days.normalize)
  renderAccount()
  say("You're offline. These are your trackers as of the last sync; reconnect to change them.", { lasting: true })
  render()
}

addEventListener('online', () => { if (state.mode === 'offline') start() })

// A page left open overnight moves on to the new day when it's looked at again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.shownOn !== days.today() && state.mode !== 'loading') render()
})

// ── Saving ──

function keep(trackers) {
  state.trackers = trackers
  if (state.mode === 'account') store.set(SYNCED, trackers)
  if (state.mode === 'device') store.set(LOCAL, trackers)
  render()
}

// Saves new fields for a tracker, or a new tracker under the browser-made
// key, which lets a retry find the first attempt instead of adding a copy.
async function saveTracker(fields, existing, key) {
  const now = new Date().toISOString()
  if (state.mode === 'account') {
    const { countdown } = existing
      ? await api(`/api/countdowns/${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: fields })
      : await api('/api/countdowns', { method: 'POST', body: { ...fields, sourceLocalId: key } })
    const t = days.normalize(countdown)
    keep(existing ? state.trackers.map(x => x.id === t.id ? t : x) : [...state.trackers.filter(x => x.id !== t.id), t])
  } else if (state.mode === 'device') {
    const list = deviceTrackers()
    keep(existing
      ? list.map(x => x.id === existing.id ? days.normalize({ ...x, ...fields, updatedAt: now }) : x)
      : [...list, days.normalize({ ...fields, id: key, createdAt: now, updatedAt: now })])
  } else {
    throw new Error("You're offline. Reconnect to make changes.")
  }
}

async function removeTracker(t) {
  if (state.mode === 'account') await api(`/api/countdowns/${encodeURIComponent(t.id)}`, { method: 'DELETE' })
  else if (state.mode !== 'device') throw new Error("You're offline. Reconnect to make changes.")
  keep((state.mode === 'device' ? deviceTrackers() : state.trackers).filter(x => x.id !== t.id))
}

async function importDevice(button) {
  button.disabled = true
  try {
    const { summary } = await api('/api/import-local', { method: 'POST', body: { countdowns: deviceTrackers() } })
    const parts = [`Moved ${days.plural(summary.created, 'tracker')} to your account.`]
    if (summary.skipped) parts.push(`${summary.skipped} ${summary.skipped === 1 ? 'was' : 'were'} already there.`)
    if (summary.full) parts.push(`${summary.full} didn't fit, so they stay on this device.`)
    else store.drop(LOCAL)
    await load()
    say(parts.join(' '))
  } catch (error) {
    say(error.message)
    button.disabled = false
  }
}

function clearDevice() {
  if (!confirm('Remove the trackers saved on this device? Your account keeps its own.')) return
  store.drop(LOCAL)
  render()
}

// ── The list ──

const notes = document.getElementById('notes')
const trackersEl = document.getElementById('trackers')
const addButton = document.getElementById('add')
addButton.append(icon('plus', 22))
addButton.addEventListener('click', () => openEditor())

const counted = new Set() // cards that have already counted down once
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')

function render() {
  state.shownOn = days.today()
  const editable = state.mode === 'account' || state.mode === 'device'
  addButton.hidden = !editable

  const onDevice = state.mode === 'account' ? deviceTrackers().length : 0
  notes.replaceChildren(onDevice ? h('section', { class: 'panel import-panel' },
    h('p', { class: 'panel-title' }, `${days.plural(onDevice, 'tracker')} on this device`),
    h('p', { class: 'panel-subtitle' }, 'You made these before signing in. Move them to your account to see them on every device.'),
    h('div', { class: 'panel-actions' },
      h('button', { class: 'chip-btn', type: 'button', onclick: event => importDevice(event.currentTarget) }, icon('download', 14), 'Move to my account'),
      h('button', { class: 'chip-btn danger', type: 'button', onclick: clearDevice }, icon('trash-2', 14), 'Remove from device'))) : '')

  const list = days.sortTrackers(state.trackers)
  if (!list.length) {
    trackersEl.replaceChildren(h('section', { class: 'empty-state' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon('hourglass', 32)),
      h('p', { class: 'empty-title' }, 'Nothing on the horizon'),
      h('p', { class: 'empty-copy' }, editable ? 'Add a tracker and keep the days in sight.' : 'Nothing was saved here before you went offline.'),
      editable && h('button', { class: 'primary-btn inline-cta', type: 'button', onclick: () => openEditor() }, icon('plus', 16), 'Create tracker')))
    return
  }
  trackersEl.replaceChildren(h('ul', { class: 'countdown-list' }, list.map(t => card(t, editable))))
}

function card(t, editable) {
  const big = days.bigNumber(t)
  const phase = days.phase(t)
  const left = days.daysBetween(days.today(), t.targetDate)
  const number = h('p', { class: `day-value ${phase === 'past' ? 'overdue' : left === 0 ? 'today' : 'upcoming'}` }, String(big))
  const key = `${t.id}:${big}`
  if (!counted.has(key)) {
    counted.add(key)
    number.classList.add('enter')
    if (phase === 'running') countDown(number, Math.max(big + 1, t.count), big)
  }
  const stars = t.ratings[days.today()]
  const open = () => openRating(t.id)
  return h('li', {
    class: 'countdown-card', role: 'button', tabindex: '0', 'aria-label': `${t.title}: ${days.caption(t)}. Rate a day`,
    onclick: open,
    onkeydown: event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open() } }
  }, h('article', { class: 'card-body' },
    h('div', { class: 'day-column' }, number, h('p', { class: 'day-caption' }, days.caption(t))),
    h('div', { class: 'card-copy' },
      h('p', { class: 'card-title' }, icon(t.icon, 13), h('span', { class: 'card-title-text' }, t.title)),
      t.subtitle && h('p', { class: 'card-subtitle' }, t.subtitle),
      h('p', { class: 'card-date' }, days.formatRange(t.startDate, t.targetDate)),
      stars && h('p', { class: 'card-rating' }, `${days.plural(stars, 'star')} today`)),
    editable && h('div', { class: 'card-actions' },
      h('button', { class: 'ghost-btn', type: 'button', 'aria-label': `Edit ${t.title}`, onclick: event => { event.stopPropagation(); openEditor(t) } }, icon('pencil', 14)))))
}

// The big number ticks down from the tracker's length to today's count.
function countDown(el, from, to) {
  if (reduceMotion.matches || from <= to) return
  const duration = Math.min(1800, 640 + (from - to) * 34)
  const started = performance.now()
  el.textContent = String(from)
  const step = now => {
    const t = Math.min(1, (now - started) / duration)
    el.textContent = String(Math.round(from - (from - to) * (1 - Math.pow(1 - t, 3))))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ── Adding and editing ──

function openEditor(existing) {
  const t = existing && days.normalize(existing)
  const key = days.localId()
  const form = {
    title: t?.title || '',
    subtitle: t?.subtitle || '',
    icon: t?.icon || days.randomIcon(),
    startDate: t?.startDate || days.today(),
    count: t?.count || 7,
    endDate: '',
    mode: 'days'
  }
  form.endDate = days.addDays(form.startDate, form.count - 1)

  const length = () => form.mode === 'date' ? days.countBetween(form.startDate, form.endDate) : days.validCount(form.count)
  const input = (props, onInput) => h('input', { class: 'field-input', ...props, oninput: event => { onInput(event.target.value); update() } })

  const start = input({ type: 'date', value: form.startDate, 'aria-label': 'From' }, v => { form.startDate = v })
  const countInput = input({ type: 'number', min: '1', max: String(days.MAX_DAYS), step: '1', inputmode: 'numeric', value: String(form.count), 'aria-label': 'Number of days' }, v => { form.count = v })
  const endInput = input({ type: 'date', value: form.endDate, 'aria-label': 'To' }, v => { form.endDate = v })
  const toggle = (label, mode) => h('button', { class: 'field-toggle-btn', type: 'button', onclick: () => setMode(mode) }, label)
  const daysButton = toggle('Days', 'days')
  const dateButton = toggle('Date', 'date')
  const title = input({ type: 'text', maxlength: '80', placeholder: 'Title', value: form.title, enterkeyhint: 'next' }, v => { form.title = v })
  const subtitle = input({ type: 'text', maxlength: '120', placeholder: 'Subtitle (optional)', value: form.subtitle, enterkeyhint: 'done' }, v => { form.subtitle = v })
  const iconButton = h('button', { class: 'icon-chip', type: 'button', 'aria-label': 'Pick another icon' })
  iconButton.addEventListener('click', () => { form.icon = days.randomIcon(form.icon); update() })
  const preview = h('p', { class: 'preview-text' })
  const save = h('button', { class: 'primary-btn icon-only', type: 'submit', 'aria-label': t ? 'Save changes' : 'Save tracker' }, icon('check', 20))
  const problem = h('p', { class: 'sheet-error', role: 'alert', hidden: true })

  let confirming = 0
  const remove = t && h('button', { class: 'chip-btn danger full-width', type: 'button' }, icon('trash-2', 14), h('span', {}, 'Delete'))
  remove?.addEventListener('click', async () => {
    if (!confirming) {
      remove.classList.add('confirm-pending')
      remove.lastChild.textContent = 'Tap again to delete'
      confirming = setTimeout(() => { confirming = 0; remove.classList.remove('confirm-pending'); remove.lastChild.textContent = 'Delete' }, 3000)
      return
    }
    clearTimeout(confirming)
    remove.disabled = true
    try {
      await removeTracker(t)
      sheet.close()
    } catch (error) {
      problem.textContent = error.message
      problem.hidden = false
      remove.disabled = false
    }
  })

  function setMode(mode) {
    if (form.mode === mode) return
    if (mode === 'date') form.endDate = days.addDays(form.startDate, (days.validCount(form.count) || 1) - 1) || form.startDate
    else form.count = days.countBetween(form.startDate, form.endDate) || form.count
    form.mode = mode
    countInput.value = String(form.count)
    endInput.value = form.endDate
    update()
  }

  function update() {
    const n = length()
    const end = n && days.parseDay(form.startDate) ? days.addDays(form.startDate, n - 1) : null
    preview.textContent = end ? `${days.formatRange(form.startDate, end)} · ${days.plural(n, 'day')}` : 'Pick a valid range'
    save.disabled = !form.title.trim() || !end
    countInput.hidden = form.mode !== 'days'
    endInput.hidden = form.mode !== 'date'
    endInput.min = form.startDate
    daysButton.classList.toggle('active', form.mode === 'days')
    daysButton.setAttribute('aria-pressed', String(form.mode === 'days'))
    dateButton.classList.toggle('active', form.mode === 'date')
    dateButton.setAttribute('aria-pressed', String(form.mode === 'date'))
    iconButton.replaceChildren(icon(form.icon, 18))
  }

  async function submit(event) {
    event.preventDefault()
    const n = length()
    if (save.disabled || !n) return
    save.disabled = true
    problem.hidden = true
    try {
      await saveTracker({
        title: form.title.trim(), subtitle: form.subtitle.trim(), icon: form.icon,
        startDate: form.startDate, count: n, targetDate: days.addDays(form.startDate, n - 1)
      }, t, key)
      sheet.close()
    } catch (error) {
      problem.textContent = error.message
      problem.hidden = false
      update()
    }
  }

  const sheet = openSheet('editor-sheet', t ? 'Edit tracker' : 'Add tracker',
    h('header', { class: 'sheet-header' },
      h('p', { class: 'sheet-title' }, t ? 'Edit tracker' : 'Add tracker'),
      h('button', { class: 'ghost-btn', type: 'button', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 16))),
    h('form', { class: 'editor-form', onsubmit: submit },
      h('div', { class: 'range-fields' },
        h('label', { class: 'range-field' }, h('span', { class: 'field-label' }, 'From'), start),
        h('div', { class: 'range-field' },
          h('span', { class: 'field-label-row' },
            h('span', { class: 'field-label' }, 'To'),
            h('span', { class: 'field-toggle', role: 'group', 'aria-label': 'Count to a number of days or a date' }, daysButton, dateButton)),
          countInput, endInput)),
      title,
      subtitle,
      h('div', { class: 'action-row' }, iconButton, preview, save),
      problem,
      remove))
  update()
}

// ── Rating a day ──

let starsLoading = null
function loadStars() {
  starsLoading ||= new Promise(resolve => {
    if (customElements.get('feed-stars')) return resolve(true)
    const script = h('script', { type: 'module', src: STARS, integrity: STARS_HASH, crossorigin: 'anonymous' })
    script.addEventListener('load', () => customElements.whenDefined('feed-stars').then(() => resolve(true)))
    script.addEventListener('error', () => resolve(false))
    setTimeout(() => resolve(!!customElements.get('feed-stars')), 6000)
    document.head.append(script)
  })
  return starsLoading
}

// Five stars that report a pick with onPick(n); feed-stars if it loaded.
function starsInput(value, onPick) {
  const slot = h('div', { class: 'stars-slot' })
  loadStars().then(ready => {
    if (ready) {
      const el = document.createElement('feed-stars')
      el.setAttribute('aria-label', 'Rating')
      el.setAttribute('value', String(value))
      el.addEventListener('change', event => onPick(Number(event.detail?.value) || 0))
      return slot.replaceChildren(el)
    }
    let current = value
    const buttons = [1, 2, 3, 4, 5].map(n => h('button', {
      type: 'button', role: 'radio', 'aria-label': days.plural(n, 'star'),
      onclick: () => { current = n === current ? 0 : n; paint(); onPick(current) }
    }, icon('star', 30)))
    const paint = () => buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i + 1 === current))
      button.classList.toggle('lit', i < current)
    })
    paint()
    slot.replaceChildren(h('div', { class: 'plain-stars', role: 'radiogroup', 'aria-label': 'Rating' }, buttons))
  })
  return slot
}

function openRating(id) {
  const find = () => state.trackers.find(x => x.id === id)
  const first = find()
  if (!first) return
  const editable = state.mode !== 'offline'
  const clampDay = (t, day) => days.daysBetween(day, t.startDate) > 0 ? t.startDate : days.daysBetween(t.targetDate, day) > 0 ? t.targetDate : day
  let day = clampDay(first, days.today())
  let picked = 0

  const title = h('p', { class: 'sheet-title' })
  const range = h('p', { class: 'sheet-subtitle' })
  const date = h('p', { class: 'picker-date' })
  const position = h('p', { class: 'picker-position' })
  const prev = h('button', { class: 'ghost-btn nav-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => move(-1) }, icon('chevron-left', 18))
  const next = h('button', { class: 'ghost-btn nav-btn', type: 'button', 'aria-label': 'Next day', onclick: () => move(1) }, icon('chevron-right', 18))
  const starsWrap = h('div', { class: 'stars-wrap' })
  const clear = h('button', { class: 'chip-btn', type: 'button', onclick: () => rate(0) }, 'Clear')
  const save = h('button', { class: 'primary-btn choose-day-btn', type: 'button', onclick: () => rate(picked) }, icon('check', 16), 'Save')
  const problem = h('p', { class: 'sheet-error', role: 'alert', hidden: true })

  function move(delta) {
    day = clampDay(find(), days.addDays(day, delta))
    paint()
  }

  function paint() {
    const t = find()
    if (!t) return sheet.close()
    const future = days.daysBetween(days.today(), day) > 0
    const stored = t.ratings[day] || 0
    picked = stored
    title.textContent = t.title
    range.textContent = days.formatRange(t.startDate, t.targetDate)
    date.textContent = days.formatDay(day)
    position.textContent = future ? `Day ${days.daysBetween(t.startDate, day) + 1} of ${t.count} · not yet` : `Day ${days.daysBetween(t.startDate, day) + 1} of ${t.count}`
    prev.disabled = days.daysBetween(t.startDate, day) <= 0
    next.disabled = days.daysBetween(day, t.targetDate) <= 0
    starsWrap.classList.toggle('disabled', future || !editable)
    starsWrap.replaceChildren(starsInput(stored, n => {
      picked = n
      save.disabled = future || !editable || picked < 1 || picked === stored
    }))
    clear.disabled = future || !editable || !stored
    save.disabled = true
    problem.hidden = true
  }

  async function rate(stars) {
    const t = find()
    if (!t) return
    const ratings = { ...t.ratings }
    if (stars >= 1) ratings[day] = stars
    else delete ratings[day]
    save.disabled = clear.disabled = true
    try {
      await saveTracker({ ratings }, t)
      sheet.close()
    } catch (error) {
      problem.textContent = error.message
      problem.hidden = false
      paint()
    }
  }

  const sheet = openSheet('tracker-sheet', 'Rate a day',
    h('header', { class: 'sheet-header' },
      h('div', { class: 'sheet-title-block' }, title, range),
      h('button', { class: 'ghost-btn', type: 'button', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 16))),
    h('div', { class: 'day-picker' }, prev, h('div', { class: 'day-picker-copy', 'aria-live': 'polite' }, date, position), next),
    starsWrap,
    h('div', { class: 'tracker-actions' }, clear, save),
    problem)
  paint()
}

// ── Account menu ──

const accountRoot = document.getElementById('account')
let menuOpen = false

function renderAccount(keepOpen = false) {
  if (!keepOpen) menuOpen = false
  const me = state.me
  const surfaces = globalThis.__HOLM_SURFACES__
  const segment = (key, value, content, label) => h('button', {
    class: `seg-btn${settings[key] === value ? ' active' : ''}`, type: 'button',
    'aria-pressed': String(settings[key] === value), 'aria-label': label,
    onclick: () => setSetting(key, value)
  }, content)

  const button = h('button', {
    class: `avatar-btn${me ? '' : ' signedout'}`, type: 'button', 'aria-haspopup': 'true', 'aria-expanded': String(menuOpen),
    'aria-label': me ? `Account and settings for ${me.name || me.email || 'you'}` : 'Settings and sign in'
  },
  me?.picture ? h('img', { class: 'avatar-img', src: me.picture, alt: '', referrerpolicy: 'no-referrer' }) : icon('user', 16),
  h('span', { class: `avatar-status-dot${me ? '' : ' signedout'}` }))

  const menu = h('section', { class: 'account-menu', hidden: !menuOpen, 'aria-label': 'Account and settings' },
    state.mode === 'offline'
      ? h('div', { class: 'account-label' }, h('strong', {}, 'Offline'), h('span', {}, 'Showing your trackers as of the last sync.'))
      : me
        ? h('div', { class: 'account-label' }, h('strong', {}, me.name || 'Signed in'), me.email && h('span', {}, me.email))
        : h('div', { class: 'account-label' }, h('strong', {}, 'Not signed in'), h('span', {}, 'Trackers stay on this device.')),
    h('div', { class: 'menu-group' },
      h('p', { class: 'group-label' }, 'Colour'),
      h('div', { class: 'segmented' }, segment('themeFamily', 'garden', 'Green'), segment('themeFamily', 'signal', 'Bloom'))),
    h('div', { class: 'menu-group' },
      h('p', { class: 'group-label' }, 'Appearance'),
      h('div', { class: 'segmented three' },
        segment('appearance', 'light', icon('sun-medium', 18), 'Light'),
        segment('appearance', 'dark', icon('moon', 18), 'Dark'),
        segment('appearance', 'system', icon('monitor', 18), 'Same as device'))),
    surfaces?.analytics && h('a', { class: 'menu-row', href: surfaces.analytics, target: '_blank', rel: 'noopener' }, icon('chart-column', 15), h('span', {}, 'Analytics')),
    state.mode === 'offline' ? null : me
      ? h('button', { class: 'menu-row', type: 'button', onclick: signOut }, icon('log-out', 15), h('span', {}, 'Sign out'))
      : h('button', { class: 'menu-row', type: 'button', onclick: () => { location.href = state.loginURL } }, icon('log-in', 15), h('span', {}, 'Sign in')))

  button.addEventListener('click', () => {
    menuOpen = menu.hidden
    menu.hidden = !menuOpen
    button.setAttribute('aria-expanded', String(menuOpen))
  })
  accountRoot.replaceChildren(button, menu)
}

const closeMenu = () => {
  if (!menuOpen) return false
  menuOpen = false
  accountRoot.querySelector('.account-menu').hidden = true
  accountRoot.querySelector('.avatar-btn').setAttribute('aria-expanded', 'false')
  return true
}

document.addEventListener('pointerdown', event => { if (!accountRoot.contains(event.target)) closeMenu() })
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !closeTopSheet() && closeMenu()) accountRoot.querySelector('.avatar-btn').focus()
})

// Holm signs out on POST only; the synced copy goes with the session.
async function signOut() {
  try { await fetch(state.logoutURL || '/auth/logout', { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  store.drop(SYNCED)
  location.reload()
}

// ── Layout ──

// The list scrolls under the header, so it starts below the header's height.
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--header-h', `${entry.target.offsetHeight}px`)
}).observe(document.getElementById('header'))

// Sheets follow the visible part of the screen, so the keyboard never covers them.
function syncViewport() {
  const vv = visualViewport
  const root = document.documentElement.style
  root.setProperty('--vvh', `${vv?.height || innerHeight}px`)
  root.setProperty('--vvw', `${vv?.width || innerWidth}px`)
  root.setProperty('--vvt', `${vv?.offsetTop || 0}px`)
  root.setProperty('--vvl', `${vv?.offsetLeft || 0}px`)
}
syncViewport()
addEventListener('resize', syncViewport)
visualViewport?.addEventListener('resize', syncViewport)
visualViewport?.addEventListener('scroll', syncViewport)

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})

applyTheme()
renderAccount()
start()
