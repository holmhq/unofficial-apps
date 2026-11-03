// /q/<slug>: a highlight someone shared, for anyone with the link. The words, where they come
// from, who highlighted them, and a word about Shelf for whoever wants their own.

import { h, ic, fill } from '../ui.js'
import { mark } from '../icons.js'
import { credit, state, go } from '../shell.js'
import { favicon } from '../bits.js'

const STORE = 'https://unofficial.zyt.app/apps/shelf'

export function quotePage(slug) {
  const main = h('main.qp-main', h('div.qp-loading', h('span.shimmer'), h('span.shimmer'), h('span.shimmer')))
  const signedIn = state.me && state.me.signed_in
  const el = h('div.quote-page',
    h('header.l-top.glass',
      h('a.brand', { href: '/', onclick: (e) => { if (signedIn) { e.preventDefault(); go('/') } } }, h('span.brand-mark', mark(17)), h('span.brand-name', 'Shelf')),
      h('span.grow'),
      signedIn ? h('a.btn.plain', { href: '/', onclick: (e) => { e.preventDefault(); go('/') } }, 'Your shelf') : h('a.btn.primary.small', { href: STORE }, 'Get Shelf')),
    main,
    h('footer.l-foot', credit()))

  ;(async () => {
    let q
    try {
      const r = await fetch('/api/q/' + slug, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error(r.status === 404 ? 'gone' : 'error')
      q = await r.json()
    } catch (e) {
      fill(main, h('div.empty', h('div.empty-ic', ic('highlighter', 28, 1.7)), h('b', e.message === 'gone' ? 'This highlight isn’t shared any more' : 'This highlight couldn’t load'), h('p', e.message === 'gone' ? 'Whoever shared it turned the link off.' : 'Check your connection and try again.')))
      return
    }
    document.title = '“' + (q.quote.length > 60 ? q.quote.slice(0, 58) + '…' : q.quote) + '” · Shelf'
    const when = q.at ? new Date(q.at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) : ''
    fill(main,
      h('figure.qp-fig',
        h('blockquote.qp-quote', h('span', q.quote)),
        h('figcaption.qp-src',
          favicon({ host: q.host, site: q.site }, 22),
          h('div.grow',
            h('a', { href: q.url, target: '_blank', rel: 'noopener noreferrer' }, q.title || q.host, ic('arrowUpRight', 14, 2.2)),
            h('small', [q.site || q.host, q.author].filter(Boolean).join(' · '))))),
      h('p.qp-by', ic('highlighter', 14, 2.2), q.by ? `Highlighted by ${q.by} in Shelf` : 'Highlighted in Shelf', when ? ' · ' + when : ''),
      h('div.qp-cta',
        h('span.brand-mark.qp-mark', mark(22)),
        h('div.grow',
          h('b', 'Keep your own shelf'),
          h('p', 'Shelf saves articles to read later on a server you run: a calm reader, highlights like this one, reading offline, and Claude reading with you.')),
        h('div.qp-btns',
          h('a.btn.primary', { href: STORE }, 'Get Shelf'),
          h('a.btn', { href: q.url, target: '_blank', rel: 'noopener noreferrer' }, 'Read the article'))))
  })()
  return { el }
}
