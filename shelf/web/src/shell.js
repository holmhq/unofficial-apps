// What every page shares: who's signed in, moving between pages, the account button and its
// menu, the footer credit, and the sheets for saving a link, connecting Claude, the bookmarklet
// and bringing in an export.

import { h, ic, avatar, menu, segmented, haptic, toast, sheet, copyText, fill } from './ui.js'
import { holmMark } from './icons.js'
import * as api from './api.js'
import * as theme from './theme.js'
import { lib, save, forget, importLinks } from './store.js'

export const state = { me: null }
export const SOURCE = 'https://github.com/holmhq/unofficial-apps/tree/main/shelf'
export const FEEDBACK_PROJECT = 'rizukuta'

export async function loadMe(prefetched) {
  try {
    state.me = await (prefetched || api.get('/api/me?return=' + encodeURIComponent(location.pathname + location.search)))
  } catch {
    state.me = state.me || { signed_in: false, login_url: '/auth/login' }
  }
  lib.me = state.me
  try {
    if (state.me.signed_in) localStorage.setItem('shelf:me', JSON.stringify({ id: state.me.id, name: state.me.name, email: state.me.email, picture: state.me.picture, channel: state.me.channel, mcp: state.me.mcp, signed_in: true }))
    else localStorage.removeItem('shelf:me')
  } catch {}
  return state.me
}

export function cachedMe() {
  try { return JSON.parse(localStorage.getItem('shelf:me') || 'null') } catch { return null }
}

/* ---- Moving between pages ------------------------------------------------------------------- */

let render = () => {}
export function setRenderer(fn) { render = fn }

export function go(path, { replace = false } = {}) {
  if (path === location.pathname + location.search && !replace) return render()
  history[replace ? 'replaceState' : 'pushState']({}, '', path)
  render()
}

export function link(href, attrs = {}, ...kids) {
  return h('a', {
    href,
    ...attrs,
    onclick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return
      event.preventDefault()
      if (attrs.onclick) attrs.onclick(event)
      go(href)
    }
  }, ...kids)
}

export function signIn() {
  const back = encodeURIComponent(location.pathname + location.search)
  location.href = state.me && state.me.login_url ? state.me.login_url : '/auth/login?return_to=' + back
}

export async function signOut() {
  try { await fetch(state.me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  forget()
  location.href = '/'
}

/* ---- The account button ------------------------------------------------------------------------- */

export function accountButton() {
  const m = state.me && state.me.signed_in ? state.me : null
  const btn = h('button.avatar-btn', { type: 'button', 'aria-label': m ? `Account: ${m.name}` : 'Sign in', 'aria-haspopup': 'menu' },
    m ? avatar({ key: m.email || m.name, name: m.name, picture: m.picture }) : h('span.avatar.ghost', ic('user', 17, 2)))
  btn.addEventListener('click', () => { haptic(); accountMenu(btn) })
  return btn
}

function accountMenu(anchor) {
  const me = state.me || {}
  const m = me.signed_in ? me : null
  const themes = segmented([
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'Match this device', icon: 'sunMoon' }
  ], theme.mode(), (value) => {
    const r = themes.getBoundingClientRect()
    theme.setMode(value, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, { label: 'Appearance', icons: true })
  const surfaces = globalThis.__HOLM_SURFACES__
  menu(anchor, [
    m
      ? h('div.me', avatar({ key: m.email || m.name, name: m.name, picture: m.picture }), h('div.grow', h('b.trunc', m.name || 'You'), h('small.trunc', m.email || '')))
      : h('div.me', h('span.avatar.ghost', ic('user', 22, 2)), h('div.grow', h('b', 'Not signed in'), h('small', 'Sign in to keep a shelf here'))),
    'sep',
    m ? { label: 'Save a link', icon: 'bookmarkPlus', onclick: () => saveSheet() } : null,
    m ? { label: 'Bring in your links…', icon: 'fileUp', onclick: () => importSheet() } : null,
    m ? { label: 'Save from anywhere', icon: 'plug', onclick: () => connectSheet() } : null,
    m && innerWidth >= 900 ? { label: 'Keyboard shortcuts', icon: 'keyboard', onclick: () => keysSheet() } : null,
    m ? 'sep' : null,
    h('div.menu-theme', themes),
    surfaces && surfaces.analytics && me.admin ? 'sep' : null,
    surfaces && surfaces.analytics && me.admin ? { label: 'Analytics', icon: 'chartColumn', href: surfaces.analytics } : null,
    'sep',
    m ? { label: 'Sign out', icon: 'logOut', onclick: signOut } : { label: 'Sign in', icon: 'user', onclick: signIn }
  ], { align: 'end' })
}

/* ---- Footer credit and feedback ---------------------------------------------------------------------- */

let feedbackScript = null
export function feedback() {
  if (!FEEDBACK_PROJECT) return
  if (!feedbackScript) {
    feedbackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/feedback/embed.js'
      Object.assign(s.dataset, { project: FEEDBACK_PROJECT, origin: 'https://feedback.zyt.app', color: '#1d1d1f', button: 'none' })
      s.onload = () => resolve()
      s.onerror = () => { feedbackScript = null; reject(new Error('Feedback isn’t available right now.')) }
      document.head.append(s)
    })
  }
  feedbackScript.then(() => (globalThis.HolmFeedback || globalThis.ZytFeedback)?.open?.()).catch((error) => toast(error.message, { kind: 'bad' }))
}

export function credit() {
  return h('p.credit',
    h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener' }, holmMark(11), h('span', 'A Holm app')),
    FEEDBACK_PROJECT ? h('i') : null,
    FEEDBACK_PROJECT ? h('button', { type: 'button', onclick: feedback }, 'Feedback') : null,
    h('i'),
    h('a', { href: SOURCE, target: '_blank', rel: 'noopener' }, 'Source'))
}

export function failure(error) {
  toast(error && error.message ? error.message : 'Something went wrong.', { kind: 'bad' })
}

/* ---- Saving a link ------------------------------------------------------------------------------------- */

export const looksLikeURL = (s) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(String(s || '').trim())
export const asURL = (s) => { const t = String(s || '').trim(); return /^https?:\/\//i.test(t) ? t : 'https://' + t }

export async function saveURL(raw, { via = 'app', quiet = false } = {}) {
  if (!looksLikeURL(raw)) { toast('That doesn’t look like a web address.', { kind: 'bad' }); return null }
  try {
    const r = await save(asURL(raw), { via })
    if (!quiet) toast(r.existing ? 'Already on your shelf, moved to the top' : 'Saved to your reading list', { kind: r.existing ? 'info' : 'good', action: { label: 'Read', onclick: () => go('/read/' + r.item.id) } })
    haptic(12)
    return r.item
  } catch (e) { failure(e); return null }
}

export function saveSheet(prefill = '') {
  let input
  return sheet({
    title: 'Save a link',
    done: 'Save',
    onDone: async (close) => {
      const value = input.value.trim()
      if (!value) { input.focus(); return }
      const item = await saveURL(value)
      if (item) close(item)
    },
    body: (close) => {
      input = h('input.field', { type: 'url', value: prefill, placeholder: 'https://', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', autofocus: true, enterkeyhint: 'done', inputmode: 'url', 'aria-label': 'Web address' })
      input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const item = await saveURL(input.value)
        if (item) close(item)
      })
      const paste = navigator.clipboard && navigator.clipboard.readText
        ? h('button.btn', { type: 'button', onclick: async () => { try { const t = await navigator.clipboard.readText(); if (t) { input.value = t.trim(); input.focus() } } catch { toast('Paste with ⌘V or a long press instead.', { kind: 'info' }) } } }, ic('clipboardPaste', 17, 2), 'Paste')
        : null
      requestAnimationFrame(() => { input.focus() })
      return [
        h('div.save-field', input, paste),
        h('p.sheet-note', 'Shelf fetches the page on your server and keeps a clean copy to read, with its pictures. ', h('button.btn.plain.small', { type: 'button', style: { padding: '0', height: 'auto', 'text-decoration': 'underline' }, onclick: () => { close(); connectSheet() } }, 'Save from anywhere'))
      ]
    }
  })
}

/* ---- Saving from elsewhere: the bookmarklet, phones, Claude ------------------------------------------------ */

export function bookmarkletCode() {
  const origin = location.origin
  const code = `(function(){var u=location.href,t=document.title;var w=window.open('${origin}/add?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t)+'&via=bookmarklet','shelf','width=420,height=520');if(!w)location.href='${origin}/add?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t)+'&back=1';})()`
  return 'javascript:' + encodeURIComponent(code).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%3D/g, '=').replace(/%3F/g, '?').replace(/%26/g, '&').replace(/%2B/g, '+').replace(/%3B/g, ';')
}

export function connectSheet() {
  const mcp = (state.me && state.me.mcp) || location.origin + '/_holm/mcp'
  return sheet({
    title: 'Save from anywhere',
    cancel: null,
    done: 'Done',
    wide: true,
    body: () => [
      h('div.sheet-label', 'In your browser'),
      h('div.group', h('div.row', h('span.row-ic', ic('bookmark', 17, 2)), h('div.grow', h('b', 'The Save to Shelf button'), h('small', innerWidth >= 760 ? 'Drag it to your bookmarks bar. Click it on any page to save that page.' : 'On a computer, open Shelf and drag this button from here to the bookmarks bar.')),
        innerWidth >= 760 ? h('a.bookmarklet', { href: bookmarkletCode(), onclick: (e) => { e.preventDefault(); toast('Drag this button to your bookmarks bar.', { kind: 'info' }) }, title: 'Drag to your bookmarks bar' }, ic('bookmarkPlus', 16, 2.2), 'Save to Shelf') : null)),
      h('div.sheet-label', 'On your phone'),
      h('div.group',
        h('div.row', h('span.row-ic', ic('smartphone', 17, 2)), h('div.grow', h('b', 'Android'), h('small', 'Add Shelf to your home screen from the browser menu. Shelf then shows up when you share a page.'))),
        h('div.row', h('span.row-ic', ic('share', 17, 2)), h('div.grow', h('b', 'iPhone and iPad'), h('small', 'Copy a page’s link, then in Shelf tap + and Paste.')))),
      h('div.sheet-label', 'With Claude'),
      h('div.group', h('div.row', h('span.row-ic.is-hl', ic('bot', 17, 2)), h('div.grow', h('b', 'Add Shelf as a connector'), h('small', 'In Claude, add a custom connector with this address and sign in. Claude can then list, read and search your shelf, read your highlights, and save links for you.')))),
      h('div.save-field', h('input.field.is-mono', { type: 'text', value: mcp, readonly: true, 'aria-label': 'Connector address', onfocus: (e) => e.target.select() }), h('button.btn', { type: 'button', onclick: () => copyText(mcp, 'Address copied') }, ic('copy', 17, 2), 'Copy'))
    ]
  })
}

/* ---- Bringing in an export ----------------------------------------------------------------------------- */

export function importSheet() {
  return sheet({
    title: 'Bring in your links',
    cancel: null,
    done: 'Close',
    body: (close) => {
      const body = h('div', { style: { display: 'grid', gap: '14px' } })
      const pick = h('input', { type: 'file', accept: '.csv,.html,.htm,.txt,.json,text/csv,text/html,text/plain,application/json', hidden: true })
      const start = () => pick.click()
      pick.addEventListener('change', async () => {
        const file = pick.files && pick.files[0]
        if (!file) return
        const { parseExport } = await import('./importer.js')
        let rows
        try { rows = parseExport(await file.text(), file.name) } catch (e) { toast(e.message, { kind: 'bad' }); return }
        if (!rows.length) { toast('No links were found in that file.', { kind: 'bad' }); return }
        const bar = h('i')
        const label = h('small.num', `0 of ${rows.length.toLocaleString()}`)
        fill(body, h('div.import-prog', h('b', `Bringing in ${rows.length.toLocaleString()} links…`), h('div.meter', bar), label))
        try {
          const r = await importLinks(rows, (f, n) => { bar.style.transform = `scaleX(${f})`; label.textContent = `${Math.round(f * rows.length).toLocaleString()} of ${rows.length.toLocaleString()} · ${n.added.toLocaleString()} new` })
          fill(body, h('div.empty', { style: { margin: '10px auto 0' } }, h('div.empty-ic', ic('circleCheck', 28, 1.8)), h('b', `${r.added.toLocaleString()} links added`),
            h('p', (r.skipped ? `${r.skipped.toLocaleString()} were already here or couldn’t be read. ` : '') + 'The newest are being made readable now; the rest are fetched when you open them.'),
            h('button.btn.primary', { type: 'button', onclick: () => { close(); go('/') } }, 'See your reading list')))
        } catch (e) { failure(e); fill(body, ...intro()) }
      })
      const intro = () => [
        h('p.sheet-note', 'Pick the file you exported. Shelf reads the links, their titles, tags, and whether you’d read them.'),
        h('div.group',
          h('div.row', h('span.row-ic', ic('fileText', 17, 2)), h('div.grow', h('b', 'Pocket'), h('small', 'The CSV from Pocket’s export'))),
          h('div.row', h('span.row-ic', ic('fileText', 17, 2)), h('div.grow', h('b', 'Instapaper'), h('small', 'Settings → Export → CSV'))),
          h('div.row', h('span.row-ic', ic('fileText', 17, 2)), h('div.grow', h('b', 'Browser bookmarks, Omnivore, Raindrop'), h('small', 'An HTML bookmarks file, or any list of links')))),
        h('button.btn.primary.large.block', { type: 'button', onclick: start }, ic('fileUp', 18, 2.2), 'Choose a file'),
        pick
      ]
      fill(body, ...intro())
      return body
    }
  })
}

/* ---- Keyboard shortcuts ----------------------------------------------------------------------------------- */

export function keysSheet() {
  const row = (keys, what) => [h('span', keys.map((k) => h('kbd', k))), h('div', what)]
  return sheet({
    title: 'Keyboard shortcuts', cancel: null, done: 'Done',
    body: () => h('div.keys',
      row(['J', 'K'], 'Next and previous in the list'),
      row(['↵'], 'Read the one you’re on'),
      row(['E'], 'Archive, or back to the list'),
      row(['S'], 'Favourite'),
      row(['H'], 'Highlight what you selected'),
      row(['L'], 'Listen'),
      row(['A'], 'Save a link'),
      row(['/'], 'Search'),
      row(['⌘', 'V'], 'Paste a link anywhere to save it'),
      row(['Esc'], 'Close the article'))
  })
}
