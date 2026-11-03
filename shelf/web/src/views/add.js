// /add?url=…: where the Save to Shelf bookmark and a phone's share sheet land. It saves the
// link, makes it readable, says so, and closes itself when it was opened as a small window.

import { h, ic, fill } from '../ui.js'
import { mark } from '../icons.js'
import { save, makeReadable, lib } from '../store.js'
import { signIn, state, looksLikeURL, asURL, go } from '../shell.js'

export function addPage() {
  const params = new URLSearchParams(location.search)
  // A phone's share sheet may put the address in "text", after a title.
  let raw = params.get('url') || ''
  if (!raw) {
    const text = params.get('text') || ''
    const found = text.match(/https?:\/\/\S+/)
    raw = found ? found[0] : text
  }
  const title = params.get('title') || ''
  const via = params.get('via') === 'bookmarklet' ? 'bookmarklet' : 'share'
  const popup = !!window.opener || window.name === 'shelf'
  const card = h('div.adder-card')
  const el = h('div.adder', card)

  const finish = (item) => {
    if (popup) setTimeout(() => window.close(), 1400)
    else setTimeout(() => go('/read/' + item.id, { replace: true }), 900)
  }

  ;(async () => {
    if (!state.me || !state.me.signed_in) {
      fill(card, h('span.brand-mark', { style: { width: '44px', height: '44px', 'border-radius': '12px' } }, mark(24)), h('b', 'Sign in to save this'), h('p', raw), h('button.btn.primary.large', { type: 'button', onclick: signIn }, 'Sign in'))
      return
    }
    if (!looksLikeURL(raw)) {
      fill(card, h('b', 'Nothing to save'), h('p', 'This page was opened without a web address to save.'), h('button.btn', { type: 'button', onclick: () => go('/', { replace: true }) }, 'Open Shelf'))
      return
    }
    fill(card, h('div.adder-ok', { style: { background: 'var(--fill)', color: 'var(--ink-2)' } }, ic('loaderCircle', 26, 2.2)), h('b', 'Saving…'), h('p', title || raw))
    card.querySelector('svg').classList.add('spin')
    try {
      const r = await save(asURL(raw), { title, via })
      let item = r.item
      if (item.status === 'pending') {
        fill(card, h('div.adder-ok', ic('check', 26, 2.6)), h('b', r.existing ? 'Already on your shelf' : 'Saved to your reading list'), h('p', title || raw), h('small', { style: { color: 'var(--ink-3)' } }, 'Making it readable…'))
        try { item = (await makeReadable(item.id)) || item } catch {}
      }
      fill(card, h('div.adder-ok', ic('check', 26, 2.6)), h('b', r.existing ? 'Already on your shelf' : 'Saved to your reading list'), h('p', (lib.items.get(item.id) || item).title || title || raw),
        popup ? h('small', { style: { color: 'var(--ink-3)' } }, 'This window closes by itself.') : null)
      finish(item)
    } catch (e) {
      fill(card, h('b', 'Couldn’t save this'), h('p', e.message), h('button.btn', { type: 'button', onclick: () => location.reload() }, 'Try again'))
    }
  })()
  return { el }
}
