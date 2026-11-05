// What every page shares: who's signed in, moving between pages, the account button and its
// menu, the footer credit, and the things you can do to photos (from the viewer or a
// selection): favourite, add to an album, download, move to the Trash and back.

import { h, ic, avatar, menu, segmented, haptic, toast, sheet, confirm, copyField, closeMenus, fill } from './ui.js'
import { holmMark, heartFill } from './icons.js'
import * as api from './api.js'
import * as theme from './theme.js'
import { lib, change, destroy, createAlbum, albums as allAlbums, shareAlbum, photoURL, forget, updateAlbum } from './store.js'
import { bytes, count } from './time.js'
import { placeholder } from './grid.js'
import { zip } from './zip.js'

export const state = { me: null }
export const SOURCE = 'https://github.com/holmhq/unofficial-apps/tree/main/roll'
export const FEEDBACK_PROJECT = 'vwuhexv2'

export async function loadMe(prefetched) {
  try {
    state.me = await (prefetched || api.get('/api/me?return=' + encodeURIComponent(location.pathname + location.search)))
  } catch {
    state.me = state.me || { signed_in: false, login_url: '/auth/login' }
  }
  lib.me = state.me
  try {
    if (state.me.signed_in) localStorage.setItem('roll:me', JSON.stringify({ id: state.me.id, name: state.me.name, picture: state.me.picture, signed_in: true }))
    else localStorage.removeItem('roll:me')
  } catch {}
  return state.me
}

export function cachedMe() {
  try { return JSON.parse(localStorage.getItem('roll:me') || 'null') } catch { return null }
}

/* ---- Moving between pages ------------------------------------------------------- */

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

/* ---- The account button ---------------------------------------------------------- */

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
  const items = [
    m
      ? h('div.me', avatar({ key: m.email || m.name, name: m.name, picture: m.picture }), h('div.grow', h('b.trunc', m.name || 'You'), h('small.trunc', m.email || '')))
      : h('div.me', h('span.avatar.ghost', ic('user', 22, 2)), h('div.grow', h('b', 'Not signed in'), h('small', 'Sign in to keep your photos here'))),
    m ? usage() : null,
    'sep',
    surfaces && surfaces.analytics && me.admin ? { label: 'Analytics', icon: 'chartColumn', href: surfaces.analytics } : null,
    m ? { label: 'Connect via MCP…', icon: 'mcp', onclick: () => mcpSheet() } : null,
    m || (surfaces && surfaces.analytics && me.admin) ? 'sep' : null,
    h('div.menu-theme', themes),
    'sep',
    m ? { label: 'Sign out', icon: 'logOut', onclick: signOut } : { label: 'Sign in', icon: 'user', onclick: signIn }
  ]
  menu(anchor, items, { align: 'end' })
}

/* ---- Connect via MCP --------------------------------------------------------------- */

// How to add Roll to Claude, ChatGPT or Claude Code, and what its tools do. The address
// comes from /api/me, so each host shows its own.
export function mcpSheet() {
  const mcp = (state.me && state.me.mcp) || location.origin + '/_holm/mcp'
  const command = 'claude mcp add --transport http roll ' + mcp
  const row = (lead, title, text) => h('div.row.is-static', lead, h('div.grow', h('b', title), h('small', text)))
  const step = (n, title, text) => row(h('span.row-ic.is-num', String(n)), title, text)
  const can = (icon, title, text) => row(h('span.row-ic', ic(icon, 17, 2)), title, text)
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: h('div.group',
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it Roll and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude sees only your library.')),
    chatgpt: h('div.group',
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it Roll, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick Roll from + in a chat.')),
    code: h('div.mcp-code',
      copyField(command),
      h('p.sheet-note', 'Run it in a terminal, then type ', h('code', '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div.group',
      can('images', 'Find photos', 'By date, place, album or words.'),
      can('sparkles', 'On this day', 'Photos from this date in past years.'),
      can('bookImage', 'Albums', 'Make them, fill them, share by link.'),
      can('heart', 'Tidy up', 'Favourite, trash and restore photos.'))
  }
  const show = (v) => Object.entries(panes).forEach(([k, el]) => { el.classList.toggle('is-on', k === v); el.inert = k !== v })
  show('claude')
  // A menu item that opened it is gone by now, so closing goes back to the account button.
  const back = () => {
    const at = document.activeElement
    if (at && at !== document.body && !at.closest('.layer')) return
    const b = [...document.querySelectorAll('.avatar-btn')].find((x) => x.offsetParent)
    if (b) b.focus({ preventScroll: true })
  }
  return sheet({
    title: 'Connect via MCP',
    cancel: null,
    done: 'Done',
    wide: true,
    onClose: back,
    body: () => h('div.sheet-stack.mcp-sheet',
      h('div.mcp-hero', { 'aria-hidden': 'true' },
        h('img.mcp-app', { src: '/icon-192.png', alt: '', width: 60, height: 60 }),
        h('span.mcp-link', h('i'), h('i'), h('i'), h('i'), h('i')),
        h('span.mcp-tile', ic('mcp', 32))),
      h('div.sheet-label', 'Connector address'),
      copyField(mcp),
      segmented([
        { value: 'claude', label: 'Claude' },
        { value: 'chatgpt', label: 'ChatGPT' },
        { value: 'code', label: 'Claude Code' },
        { value: 'tools', label: 'Tools' }
      ], 'claude', show, { label: 'Where to connect' }),
      h('div.mcp-panes', ...Object.values(panes)))
  })
}

export function usage() {
  const q = lib.quota
  const f = q ? Math.min(1, lib.used / q) : 0
  return h('div.usage', h('div.usage-text', h('span', ic('hardDrive', 15, 2)), h('span.grow', q ? `${bytes(lib.used)} of ${bytes(q)}` : `${bytes(lib.used)} used`), h('span.num', count(lib.photos.size, 'photo'))),
    q ? h('div.meter', { 'data-full': f > 0.9 ? 'yes' : null }, h('i', { style: { transform: `scaleX(${f})` } })) : null)
}

/* ---- Footer credit and feedback ------------------------------------------------------- */

let feedbackScript = null
export function feedback() {
  if (!FEEDBACK_PROJECT) return
  if (!feedbackScript) {
    feedbackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/feedback/embed.js'
      Object.assign(s.dataset, { project: FEEDBACK_PROJECT, origin: 'https://feedback.zyt.app', color: '#f0592a', button: 'none' })
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

/* ---- Asking for a name ----------------------------------------------------------------- */

export function askName({ title, value = '', action, placeholder: hint = 'Album name' }) {
  let input
  return sheet({
    title,
    done: action,
    onDone: (close) => close(input.value.trim() || null),
    body: (close) => {
      input = h('input.field', { type: 'text', value, placeholder: hint, maxlength: '80', autofocus: true, enterkeyhint: 'done', 'aria-label': hint })
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); close(input.value.trim() || null) } })
      requestAnimationFrame(() => { input.focus(); input.select() })
      return h('div.name-body', input)
    }
  })
}

/* ---- Photo actions ------------------------------------------------------------------------ */

const plural = (n, word = 'photo') => `${n.toLocaleString()} ${n === 1 ? word : word + 's'}`

export async function favorite(ids, on) {
  try { await change(ids, on ? 'fav' : 'unfav') } catch (e) { failure(e) }
}

export async function toTrash(ids) {
  try {
    await change(ids, 'trash')
    toast(ids.length === 1 ? 'Moved to Trash' : `Moved ${plural(ids.length)} to Trash`, { kind: 'good', action: { label: 'Undo', onclick: () => change(ids, 'restore').catch(failure) } })
    return true
  } catch (e) { failure(e); return false }
}

export async function restore(ids) {
  try {
    await change(ids, 'restore')
    toast(ids.length === 1 ? 'Restored to your library' : `Restored ${plural(ids.length)}`)
    return true
  } catch (e) { failure(e); return false }
}

export async function deleteForGood(ids) {
  const ok = await confirm({ title: ids.length === 1 ? 'Delete this photo for good?' : `Delete ${plural(ids.length)} for good?`, text: 'They’re removed from this server, originals too. This can’t be undone.', action: 'Delete for good' })
  if (!ok) return false
  try { await destroy(ids); toast(ids.length === 1 ? 'Deleted' : `Deleted ${plural(ids.length)}`); return true } catch (e) { failure(e); return false }
}

export async function removeFromAlbum(ids, album) {
  try {
    await change(ids, 'remove', album.id)
    toast(`Removed from ${album.title}`, { action: { label: 'Undo', onclick: () => change(ids, 'add', album.id).catch(failure) } })
    return true
  } catch (e) { failure(e); return false }
}

// A menu of albums beside the button (a sheet on a phone), with a new one at the top.
export function albumPicker(anchor, ids, { onDone } = {}) {
  const list = allAlbums()
  const add = async (album) => {
    try {
      const fresh = ids.filter((id) => !(lib.photos.get(id).albums || []).includes(album.id))
      if (fresh.length) await change(fresh, 'add', album.id)
      toast(fresh.length ? `Added to ${album.title}` : `Already in ${album.title}`, { kind: fresh.length ? 'good' : 'info', action: fresh.length ? { label: 'View', onclick: () => go('/albums/' + album.id) } : null })
      if (onDone) onDone(album)
    } catch (e) { failure(e) }
  }
  const create = async () => {
    const title = await askName({ title: 'New album', action: 'Create' })
    if (!title) return
    try {
      const album = await createAlbum(title, ids)
      toast(`Added to ${album.title}`, { action: { label: 'View', onclick: () => go('/albums/' + album.id) } })
      if (onDone) onDone(album)
    } catch (e) { failure(e) }
  }
  const row = (a) => {
    const cover = a.coverPhoto
    const thumb = h('span.pick-thumb', cover ? { style: { 'background-image': `url(${placeholder(cover.th) || ''})` } } : {}, cover ? h('img', { src: photoURL(cover, 't'), alt: '', loading: 'lazy' }) : ic('image', 16, 2))
    return h('button.menu-item.pick', { type: 'button', role: 'menuitem', onclick: () => { menuClose(); add(a) } }, thumb, h('span.grow.trunc', a.title), h('small.num', a.count.toLocaleString()))
  }
  let menuClose = () => {}
  if (innerWidth < 760) {
    sheet({
      title: 'Add to album', cancel: 'Cancel',
      body: (close) => {
        menuClose = () => close()
        return h('div.pick-list', h('button.menu-item.pick.is-new', { type: 'button', onclick: () => { close(); create() } }, h('span.pick-thumb', ic('plus', 18, 2.2)), h('span.grow', 'New album')), list.map(row))
      }
    })
    return
  }
  menuClose = () => closeMenus()
  menu(anchor, [
    { label: 'New album…', icon: 'folderPlus', onclick: create },
    list.length ? 'sep' : null,
    list.length ? h('div.pick-list.is-menu', list.map(row)) : null
  ], { align: 'end' })
}

// Download one photo as its original, or several as one ZIP.
export async function download(photos, { share = null } = {}) {
  if (photos.length === 1) {
    const p = photos[0]
    const a = h('a', { href: photoURL(p, share ? 'p' : 'o', share) + (share ? '&dl=1' : '?dl=1'), download: '' })
    document.body.append(a)
    a.click()
    a.remove()
    return
  }
  toast(`Preparing ${plural(photos.length)}…`, { kind: 'info', ms: 60000 })
  try {
    const files = []
    let size = 0
    for (const p of photos) {
      const r = await fetch(photoURL(p, share ? 'p' : 'o', share))
      if (!r.ok) continue
      const data = new Uint8Array(await r.arrayBuffer())
      size += data.length
      if (size > 1.5e9) break
      const name = p.orig && !share ? p.name : String(p.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg'
      files.push({ name: share ? `photo-${files.length + 1}.jpg` : name, data, date: new Date(p.taken + new Date(p.taken).getTimezoneOffset() * 60000) })
    }
    const blob = zip(files)
    const url = URL.createObjectURL(blob)
    const a = h('a', { href: url, download: `Roll ${new Date().toISOString().slice(0, 10)}.zip` })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    toast(`Downloaded ${plural(files.length)}`)
  } catch (e) { failure(e) }
}

// On a phone, the share sheet with the photo itself; elsewhere, a download.
export async function sharePhoto(p) {
  try {
    const r = await fetch(photoURL(p, 'p'))
    const blob = await r.blob()
    const file = new File([blob], String(p.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return }
  } catch (e) { if (e && e.name === 'AbortError') return }
  download([p])
}

// What the viewer offers for a photo, by where it was opened.
export function viewerActions({ album = null } = {}) {
  return (p, context) => {
    if (context === 'trash') {
      return {
        restore: (x) => restore([x.id]).then((ok) => { if (!ok) throw new Error('kept') }),
        destroy: (x) => deleteForGood([x.id])
      }
    }
    return {
      favorite: (x) => favorite([x.id], !lib.photos.get(x.id).fav),
      album: (x, anchor) => albumPicker(anchor, [x.id]),
      share: innerWidth < 760 && navigator.share ? (x) => sharePhoto(x) : null,
      download: (x) => download([x]),
      trash: (x) => toTrash([x.id]).then((ok) => { if (!ok) throw new Error('kept') }),
      more: (x, { gone }) => [
        { label: x.orig ? 'Download original' : 'Download', icon: 'download', onclick: () => download([x]) },
        album ? { label: 'Use as album cover', icon: 'image', onclick: () => updateAlbum(album.id, { cover: x.id }).then(() => toast('Album cover changed')).catch(failure) } : null,
        album ? { label: `Remove from ${album.title}`, icon: 'circleMinus', onclick: () => removeFromAlbum([x.id], album).then((ok) => ok && gone()) } : null
      ].filter(Boolean)
    }
  }
}

// The album's link: on or off, and the address to copy.
export function shareSheet(albumId) {
  let album = lib.albums.get(albumId)
  const url = () => location.origin + '/s/' + album.share
  return sheet({
    title: 'Share album', cancel: null, done: 'Done',
    body: () => {
      const body = h('div.share-body')
      const draw = () => {
        const on = !!album.share
        const sw = h('input.switch', { type: 'checkbox', role: 'switch', 'aria-label': 'Share by link', checked: on })
        sw.addEventListener('change', async () => {
          sw.disabled = true
          try { album = await shareAlbum(album.id, sw.checked); haptic(); draw() } catch (e) { failure(e); sw.checked = !sw.checked; sw.disabled = false }
        })
        fill(body,
          h('div.group', h('label.row', h('span.row-ic', { 'data-tone': on ? 'accent' : 'grey' }, ic('link', 17, 2)), h('div.grow', h('b', 'Anyone with the link'), h('small', on ? 'can see these photos, without places, cameras or file names' : 'Off: only you can see this album')), sw)),
          on ? copyField(url()) : null,
          on ? h('a.btn.share-open', { href: url(), target: '_blank', rel: 'noopener' }, ic('externalLink', 17, 2), 'Open') : null)
      }
      draw()
      return body
    }
  })
}

export { plural, heartFill }
