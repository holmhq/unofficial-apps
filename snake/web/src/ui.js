// Snake — app chrome: the navbar, the account menu (look, sound, sign-in),
// the leaderboard drawer and toasts.

import { prefs } from './state.js'
import { PALETTES } from './theme.js'
import { icon } from './icons.js'
import { duration } from './game.js'

/* ---- tiny DOM helper ---- */
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') n.className = v
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue
    n.append(kid)
  }
  return n
}
function svg(name, size) {
  const span = h('span', { class: 'ico', 'aria-hidden': 'true' })
  span.innerHTML = icon(name, size)
  return span
}

// Holm adds globalThis.__HOLM_SURFACES__ to the page for people allowed to
// see the app's analytics; its analytics entry is that page's address.
function analyticsURL() {
  const surfaces = globalThis.__HOLM_SURFACES__
  const url = surfaces && surfaces.analytics
  return typeof url === 'string' && url ? url : null
}

const THEMES = [
  { id: 'light', glyph: 'sun', label: 'Light' },
  { id: 'dark', glyph: 'moon', label: 'Dark' },
  { id: 'system', glyph: 'monitor', label: 'Same as device' }
]

export function avatar(person, cls = '') {
  const a = h('span', { class: `avatar ${cls}`.trim() })
  const initials = () => {
    const parts = String((person && person.name) || '').split(/\s+/).filter(Boolean)
    a.replaceChildren(h('span', { class: 'initials' }, parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '·'))
  }
  if (person && person.picture) {
    const img = h('img', { src: person.picture, alt: '', referrerpolicy: 'no-referrer' })
    img.addEventListener('error', initials)
    a.append(img)
  } else {
    initials()
  }
  return a
}

export function mountChrome(root, ctx) {
  /* ---- navbar ---- */
  const boardBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Leaderboard', title: 'Leaderboard', onclick: () => openLeaderboard() }, svg('trophy', 21))
  const hudSlot = h('div', { class: 'hud-slot' })
  const accountBtn = h('button', { class: 'avatar-btn', type: 'button', 'aria-label': 'Account and settings', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => toggleMenu() })
  root.prepend(h('header', { class: 'navbar' }, boardBtn, hudSlot, accountBtn))

  function refreshAccount() {
    const me = ctx.me()
    accountBtn.replaceChildren(me ? avatar(me) : svg('user', 21))
    if (menu) rebuildMenu()
  }

  /* ---- account menu ---- */
  let menu = null
  function toggleMenu() {
    if (menu) return closeMenu()
    menu = buildMenu()
    document.body.append(menu)
    accountBtn.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outsideMenu, true)
  }
  function closeMenu() {
    if (!menu) return
    menu.remove()
    menu = null
    accountBtn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outsideMenu, true)
  }
  function outsideMenu(e) {
    if (menu && !menu.contains(e.target) && !accountBtn.contains(e.target)) closeMenu()
  }
  function rebuildMenu() {
    const next = buildMenu()
    menu.replaceWith(next)
    menu = next
  }
  function positionMenu(pop) {
    const r = accountBtn.getBoundingClientRect()
    pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px'
    pop.style.top = r.bottom + 8 + 'px'
  }
  window.addEventListener('resize', () => { if (menu) positionMenu(menu) })

  function toggle(label, on, fn) {
    return h('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: fn })
  }

  function buildMenu() {
    const me = ctx.me()
    const offline = ctx.offline()
    const head = h('div', { class: 'popover-head' },
      me ? avatar(me, 'lg') : h('span', { class: 'avatar lg' }, svg('user', 24)),
      h('div', { class: 'who' },
        h('div', { class: 'name' }, me ? me.name || 'Signed in' : 'Playing on this device'),
        h('div', { class: 'sub' }, offline ? 'Offline: your best game saves here and is sent later'
          : me ? 'Your best game counts on the leaderboard' : 'Sign in to put your best game on the leaderboard')
      )
    )

    const themes = h('div', { class: 'seg', role: 'group', 'aria-label': 'Appearance' },
      THEMES.map((t) => h('button', {
        type: 'button', class: prefs.theme === t.id ? 'on' : null, 'aria-label': t.label, title: t.label,
        'aria-pressed': String(prefs.theme === t.id), onclick: () => prefs.set('theme', t.id)
      }, svg(t.glyph, 18))))

    const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Colours' },
      PALETTES.map((p) => h('button', {
        type: 'button', class: 'swatch' + (prefs.palette === p.id ? ' on' : ''), 'aria-label': p.label, title: p.label,
        'aria-pressed': String(prefs.palette === p.id), onclick: () => prefs.set('palette', p.id)
      }, h('span', { class: 'dots' }, [p.snake[0], p.snake[1], p.berry, p.bloom].map((c) => h('i', { style: `background:${c}` }))))))

    const analytics = analyticsURL()
    const pop = h('div', { class: 'popover', role: 'menu' },
      head,
      h('div', { class: 'menu-row' }, h('span', { class: 'menu-label' }, 'Appearance'), themes),
      h('div', { class: 'menu-row' }, h('span', { class: 'menu-label' }, 'Colours'), swatches),
      h('div', { class: 'menu-row' }, h('span', { class: 'menu-label' }, 'Sound'), toggle('Sound', prefs.sound, () => prefs.set('sound', !prefs.sound))),
      h('div', { class: 'popover-sep' }),
      analytics && h('a', { class: 'popover-item', href: analytics, target: '_blank', rel: 'noopener', onclick: () => closeMenu() },
        svg('barchart', 19), h('span', {}, 'Analytics')),
      me
        ? h('button', { class: 'popover-item', type: 'button', onclick: () => { closeMenu(); ctx.signOut() } }, svg('logout', 19), h('span', {}, 'Sign out'))
        : !offline && h('button', { class: 'popover-item', type: 'button', onclick: () => { closeMenu(); ctx.signIn() } }, svg('login', 19), h('span', {}, 'Sign in'))
    )
    positionMenu(pop)
    return pop
  }
  prefs.on(() => { if (menu) rebuildMenu() })

  /* ---- scrim and sheets ---- */
  const scrim = h('div', { class: 'scrim' })
  scrim.addEventListener('pointerdown', () => closeTopSheet())
  document.body.append(scrim)

  const stack = []
  // Escape closes the menu or the top sheet before the game sees the key.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (menu) { e.preventDefault(); closeMenu(); accountBtn.focus() }
    else if (stack.length) { e.preventDefault(); closeTopSheet() }
  }, true)
  function pushSheet(sheet) {
    const opener = document.activeElement
    sheet.tabIndex = -1
    stack.push({ sheet, opener })
    document.body.append(sheet)
    requestAnimationFrame(() => {
      scrim.classList.add('show')
      sheet.classList.add('show')
      sheet.focus({ preventScroll: true })
    })
  }
  function closeTopSheet() {
    const top = stack.pop()
    if (!top) { scrim.classList.remove('show'); return }
    top.sheet.classList.remove('show')
    setTimeout(() => top.sheet.remove(), 340)
    if (!stack.length) scrim.classList.remove('show')
    if (top.opener && top.opener.focus && document.contains(top.opener)) top.opener.focus({ preventScroll: true })
    if (top.sheet === boardSheet) boardSheet = null
  }
  function closeAllSheets() {
    while (stack.length) closeTopSheet()
  }
  function sheetBar(title, ...extra) {
    return h('div', { class: 'sheet-bar' },
      h('h2', {}, title),
      h('div', { class: 'grow' }),
      ...extra,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => closeTopSheet() }, svg('x', 20)))
  }

  /* ---- leaderboard ---- */
  let boardSheet = null
  let boardBody = null
  function openLeaderboard() {
    closeMenu()
    if (boardSheet) return
    boardBody = h('div', { class: 'sheet-body' }, h('div', { class: 'lb-empty' }, h('p', {}, 'Loading…')))
    boardSheet = h('div', { class: 'sheet full', role: 'dialog', 'aria-label': 'Leaderboard' },
      sheetBar('Leaderboard', h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Refresh', onclick: () => loadBoard() }, svg('rotateCcw', 19))),
      boardBody)
    pushSheet(boardSheet)
    loadBoard()
  }
  async function loadBoard() {
    const body = boardBody
    let data = null
    try { data = await ctx.loadBoard() } catch (_e) {}
    if (body !== boardBody || !boardSheet) return
    renderBoard(body, data)
  }
  function renderBoard(body, data) {
    const me = ctx.me()
    body.replaceChildren()
    if (!me) {
      body.append(h('div', { class: 'signin-card' },
        svg('trophy', 30),
        h('h3', {}, 'Join the leaderboard'),
        h('p', {}, 'Sign in and your best game goes on the board, once the server has replayed it from the first move to the last.'),
        ctx.offline() ? null : h('button', { class: 'btn', type: 'button', onclick: () => { closeAllSheets(); ctx.signIn() } }, svg('login', 18), 'Sign in')))
    }
    const list = h('div', { class: 'lb-list' })
    if (!data) {
      list.append(h('div', { class: 'lb-empty' }, svg('info', 36), h('p', {}, 'Could not load the leaderboard'),
        h('div', { class: 'sub' }, ctx.offline() ? 'You are offline. Your best game is saved on this device.' : 'Check your connection and try again.')))
    } else if (!data.entries.length) {
      list.append(h('div', { class: 'lb-empty' }, svg('trophy', 36), h('p', {}, 'No scores yet'), h('div', { class: 'sub' }, 'Finish a game while signed in to be first.')))
    } else {
      data.entries.forEach((e) => list.append(row(e)))
    }
    body.append(list)
    if (me && data && data.me && !data.entries.some((e) => e.me)) body.append(pin({ ...data.me, name: 'You' }))
    if (!me && prefs.best) body.append(pin({ name: 'You, on this device', ...prefs.best }, true))
  }
  function row(e) {
    return h('div', { class: 'lb-row' + (e.me ? ' me' : '') },
      h('div', { class: 'rank' + (e.rank <= 3 ? ' podium' : '') }, medal(e.rank)),
      avatar(e, 'sm'),
      h('div', { class: 'who' }, h('div', { class: 'name' }, e.me ? `${e.name} (you)` : e.name), h('div', { class: 'meta' }, meta(e))),
      h('div', { class: 'score' }, e.score.toLocaleString()))
  }
  function pin(e, local = false) {
    return h('div', { class: 'lb-me' },
      h('div', { class: 'rank' }, local || !e.rank ? '·' : medal(e.rank)),
      h('div', { class: 'who' }, h('div', { class: 'name' }, e.name), h('div', { class: 'meta' }, meta(e))),
      h('div', { class: 'score' }, e.score.toLocaleString()))
  }
  function medal(rank) {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank)
  }
  function meta(e) {
    return `Length ${e.length.toLocaleString()} · level ${e.level} · ${duration(e.frames || 0)}`
  }

  /* ---- toast ---- */
  const toastNode = h('div', { class: 'toast', role: 'status' })
  document.body.append(toastNode)
  let toastTimer = null
  function toast(message) {
    toastNode.textContent = message
    clearTimeout(toastTimer)
    requestAnimationFrame(() => toastNode.classList.add('show'))
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2600)
  }

  return {
    hudSlot,
    refreshAccount,
    openLeaderboard,
    refreshBoard: () => { if (boardSheet) loadBoard() },
    isOpen: () => !!menu || stack.length > 0,
    toast
  }
}
