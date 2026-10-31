// A shared album, for anyone with its link: no account needed. It shows the album's title,
// who shared it and its photos, with the viewer and a download of the full-size copies.
// Places, cameras and file names stay with the owner.

import { h, ic } from '../ui.js'
import { mark } from '../icons.js'
import * as api from '../api.js'
import { accountButton, credit, download, go } from '../shell.js'
import { createGrid } from '../grid.js'
import { openViewer } from '../viewer.js'
import { range, count } from '../time.js'
import { emptyState } from './photos.js'

export function sharedPage(slug) {
  const panel = h('div.panel')
  const head = h('header.share-hero')
  const grid = createGrid({
    panel, share: slug, group: 'day', months: false,
    onOpen: (p, list) => openViewer({ list, index: list.indexOf(p), from: grid, share: slug, context: 'shared', actions: () => ({ download: (x) => download([x], { share: slug }) }) })
  })
  const brand = h('a.brand', { href: '/', 'aria-label': 'Roll' }, h('span.brand-mark', mark(17)), h('span.brand-name', 'Roll'))
  panel.append(head, grid.el, h('div.page-end'), h('div.page-credit', credit()))
  const page = h('section.page', panel, grid.scrub)
  const el = h('div.app.is-shared', h('header.top.glass', h('div.top-l', brand), h('div.top-r', accountButton())), h('div.body', h('main.main', page)))

  head.append(h('div.share-sk', h('i'), h('i'), h('i')))
  const kept = (() => { try { return JSON.parse(sessionStorage.getItem('roll:s:' + slug) || 'null') } catch { return null } })()
  if (kept) draw(kept)
  api.get('/api/s/' + slug).then((data) => {
    try { sessionStorage.setItem('roll:s:' + slug, JSON.stringify(data)) } catch {}
    if (!kept || JSON.stringify(kept) !== JSON.stringify(data)) draw(data)
  }).catch((error) => {
    head.replaceChildren(emptyState({ icon: 'lock', title: 'This album isn’t shared', text: error.status === 404 ? 'The link is wrong, or whoever shared it turned the link off.' : error.message, action: h('a.btn', { href: '/' }, 'Go to Roll') }))
    grid.set([])
  })

  function draw(data) {
    const photos = data.photos.slice().sort((a, b) => b.taken - a.taken || (a.id < b.id ? 1 : -1))
    document.title = `${data.title} · Roll`
    head.replaceChildren(
      h('div.share-meta',
        h('h1.share-title', data.title),
        h('p.page-sub', [data.by ? `Shared by ${data.by}` : null, photos.length ? count(photos.length, 'photo') : 'No photos yet', photos.length ? range(photos[photos.length - 1].taken, photos[0].taken) : null].filter(Boolean).join(' · '))),
      h('div.page-tools',
        data.mine && data.album ? h('button.btn', { type: 'button', onclick: () => go('/albums/' + data.album) }, ic('bookImage', 17, 2), h('span', 'Open in your library')) : null,
        photos.length ? h('button.btn.primary', { type: 'button', onclick: () => download(photos.map((p) => ({ ...p, name: 'photo.jpg' })), { share: slug }) }, ic('download', 17, 2.2), h('span', photos.length === 1 ? 'Download' : 'Download all')) : null))
    grid.set(photos, { animate: false })
  }

  return { el }
}
