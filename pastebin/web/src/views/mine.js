// The owner's pastes: state, timers, quick copy, revoke and delete.

import { h, icon, api, ago, fullDate, copyText, confirmDialog, toast, spinner, plural, shareUrl } from '../lib.js'

export function mountMine(main, ctx) {
  let destroyed = false
  let cursor = null
  const list = h('div.list')
  const more = h('button.btn', { type: 'button', hidden: true, onclick: () => load(true) }, 'Show older pastes')
  const page = h('section.page',
    h('header.page-head', h('h1', 'My pastes'), h('p', 'Every link you’ve made, and whether it still works.')),
    list,
    h('div', { style: { marginTop: '16px', textAlign: 'center' } }, more))

  if (!ctx.me()) {
    main.replaceChildren(h('section.page.page-narrow', h('div.empty',
      h('h2', 'Sign in to see your pastes'),
      h('p', 'Your links, their timers and their views are listed here once you sign in.'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => ctx.signIn().catch(() => {}) }, 'Sign in'))))
    return { destroy() {} }
  }

  main.replaceChildren(spinner())
  load(false)

  async function load(append) {
    more.disabled = true
    try {
      const res = await api('GET', '/api/pastes' + (append && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''))
      if (destroyed) return
      cursor = res.cursor || null
      if (!append) list.replaceChildren()
      for (const p of res.pastes || []) list.append(row(p))
      more.hidden = !cursor
      more.disabled = false
      if (!append) main.replaceChildren(page)
      if (!list.children.length) {
        main.replaceChildren(h('section.page.page-narrow', h('div.empty',
          h('h2', 'No pastes yet'),
          h('p', 'Paste some text or drop a file, and the link will show up here with its timer.'),
          h('a.btn.btn-primary', { href: '/', 'data-link': true }, icon('plus'), 'New paste'))))
      }
    } catch (err) {
      if (destroyed) return
      if (err.status === 401) { ctx.setMe(null); ctx.navigate('/mine', true); return }
      main.replaceChildren(h('section.page.page-narrow', h('div.empty',
        h('h2', 'Couldn’t load your pastes'), h('p', err.message),
        h('button.btn.btn-primary', { type: 'button', onclick: () => { main.replaceChildren(spinner()); load(false) } }, 'Try again'))))
    }
  }

  function row(p) {
    const live = p.state === 'live'
    const name = p.title || p.excerpt || firstLine(p) || 'Untitled'
    const kind = p.files && p.files.length ? (p.files[0].kind === 'image' ? 'image' : p.files[0].kind === 'video' ? 'video' : 'file') : 'text'
    const node = h('div.row', { class: live ? null : 'is-dead' },
      h('span.file-ico', icon(kind)),
      h('div.row-main',
        live
          ? h('a.row-title', { href: '/p/' + p.slug, 'data-link': true, class: p.title ? null : 'muted' }, name)
          : h('span.row-title', { class: p.title ? null : 'muted' }, name),
        h('div.row-sub',
          stateLabel(p),
          h('span', { title: fullDate(p.createdAt) }, 'Created ' + ago(p.createdAt)),
          live && !p.burnAfterRead ? h('span', p.views ? plural(p.views, 'view') : 'No views') : null,
          p.files && p.files.length ? h('span', plural(p.files.length, 'file')) : null,
          p.showAuthor ? h('span', 'Shows your name') : null)),
      h('div.row-actions',
        live ? h('button.btn.btn-sm', { type: 'button', onclick: () => copyText(shareUrl(p.slug), 'Link copied') }, icon('copy'), 'Copy link') : null,
        live ? h('button.btn.btn-quiet.btn-sm.btn-icon', { type: 'button', title: 'Revoke link', 'aria-label': 'Revoke link to ' + name, onclick: () => revoke(p, node) }, icon('ban')) : null,
        h('button.btn.btn-quiet.btn-sm.btn-icon', { type: 'button', title: 'Delete', 'aria-label': 'Delete ' + name, onclick: () => remove(p, node) }, icon('trash'))))
    return node
  }

  async function revoke(p, node) {
    const ok = await confirmDialog({
      title: 'Revoke this link?',
      body: 'The link stops working right away and the content is deleted. The entry stays in this list.',
      confirm: 'Revoke link', danger: true,
    })
    if (!ok) return
    try {
      const res = await api('POST', '/api/pastes/' + encodeURIComponent(p.slug) + '/revoke')
      node.replaceWith(row(res.paste || Object.assign({}, p, { state: 'revoked' })))
      toast('Link revoked')
    } catch (err) { toast(err.message, 'error') }
  }

  async function remove(p, node) {
    const ok = await confirmDialog({
      title: 'Delete this paste?',
      body: p.state === 'live'
        ? 'The link stops working, the content is deleted, and it disappears from this list.'
        : 'It disappears from this list.',
      confirm: 'Delete', danger: true,
    })
    if (!ok) return
    try {
      await api('DELETE', '/api/pastes/' + encodeURIComponent(p.slug))
      node.remove()
      toast('Deleted')
      if (!list.children.length && !cursor) load(false)
    } catch (err) { toast(err.message, 'error') }
  }

  return { destroy() { destroyed = true } }
}

function firstLine(p) {
  const files = p.files || []
  if (files.length) return files.length === 1 ? files[0].name : files[0].name + ' and ' + plural(files.length - 1, 'more file')
  return ''
}

function stateLabel(p) {
  if (p.state === 'revoked') return h('span.state.dead', 'Revoked')
  if (p.state === 'expired') return h('span.state.dead', 'Expired')
  if (p.state === 'burned') return h('span.state.dead', 'Opened ' + ago(p.openedAt))
  if (p.burnAfterRead) return h('span.state.once', p.expiresAt ? 'Opens once, expires ' + ago(p.expiresAt) : 'Opens once')
  if (p.expiresAt) return h('span.state.live', 'Expires ' + ago(p.expiresAt))
  return h('span.state.live', 'Live')
}
