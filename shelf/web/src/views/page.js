// /s/<slug>: someone's highlights from one article or book, for anyone with the link, always
// the ones they have now. The words and where they come from, notes only if they chose to
// show them, and a word about Shelf for whoever wants their own.

import { h, ic, fill } from '../ui.js'
import { mark } from '../icons.js'
import { credit, state, go } from '../shell.js'
import { favicon } from '../bits.js'

const STORE = 'https://unofficial.zyt.app/apps/shelf'

export function sharedPage(slug) {
  const main = h('main.qp-main.sp-main', h('div.qp-loading', h('span.shimmer'), h('span.shimmer'), h('span.shimmer')))
  const signedIn = state.me && state.me.signed_in
  const el = h('div.quote-page',
    h('header.l-top.glass',
      h('a.brand', { href: '/', onclick: (e) => { if (signedIn) { e.preventDefault(); go('/') } } }, h('span.brand-mark', mark(17)), h('span.brand-name', 'Shelf')),
      h('span.grow'),
      signedIn ? h('a.btn.plain', { href: '/', onclick: (e) => { e.preventDefault(); go('/') } }, 'Your shelf') : h('a.btn.primary.small', { href: STORE }, 'Get Shelf')),
    main,
    h('footer.l-foot', credit()))

  ;(async () => {
    let p
    try {
      const r = await fetch('/api/s/' + slug, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error(r.status === 404 ? 'gone' : 'error')
      p = await r.json()
    } catch (e) {
      fill(main, h('div.empty', h('div.empty-ic', ic('highlighter', 28, 1.7)), h('b', e.message === 'gone' ? 'These highlights aren’t shared any more' : 'These highlights couldn’t load'), h('p', e.message === 'gone' ? 'Whoever shared them turned the link off.' : 'Check your connection and try again.')))
      return
    }
    document.title = 'Highlights from ' + p.title + ' · Shelf'
    const n = p.highlights.length
    const source = p.url
      ? h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.title, ic('arrowUpRight', 15, 2.2))
      : h('span', p.title)
    fill(main,
      h('header.sp-head',
        p.image && p.kind !== 'article' ? h('img.sp-cover', { src: p.image, alt: '', onerror: (e) => e.target.remove() }) : p.url ? favicon({ host: p.host, site: p.site }, 34) : null,
        h('div.grow',
          h('h1.sp-title', source),
          h('small', [p.author, p.site || p.host].filter(Boolean).join(' · ')))),
      h('p.qp-by', ic('highlighter', 14, 2.2), (n === 1 ? '1 highlight' : n + ' highlights') + (p.by ? ' by ' + p.by : '') + ' in Shelf'),
      n ? h('ol.sp-list', p.highlights.map((x) => h('li',
        h('blockquote.sp-quote', h('span', x.quote)),
        x.note ? h('p.sp-note', ic('notebookPen', 14, 2), h('span', x.note)) : null,
        x.loc ? h('small.sp-loc', x.loc) : null))) : h('p.qp-by', 'No highlights yet.'),
      h('div.qp-cta',
        h('span.brand-mark.qp-mark', mark(22)),
        h('div.grow',
          h('b', 'Keep your own shelf'),
          h('p', 'Shelf saves articles and books to read on a server you run: a calm reader, highlights that come back to you, and Claude reading with you.')),
        h('div.qp-btns',
          h('a.btn.primary', { href: STORE }, 'Get Shelf'),
          p.url ? h('a.btn', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Read the original') : null)))
  })()
  return { el }
}
