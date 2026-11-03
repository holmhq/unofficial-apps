// What someone sees signed out: what Shelf is, a look at it with public-domain reading, and
// Sign in.

import { h, ic } from '../ui.js'
import { mark, starFill } from '../icons.js'
import { accountButton, credit, signIn } from '../shell.js'
import { favicon } from '../bits.js'

const SAMPLES = [
  { title: 'Walking', site: 'Project Gutenberg', host: 'gutenberg.org', words: 12400, progress: 0.18, img: 'thoreau', excerpt: 'I wish to speak a word for Nature, for absolute freedom and wildness, as contrasted with a freedom and culture merely civil.', open: true },
  { title: 'Earthrise', site: 'Wikipedia', host: 'en.wikipedia.org', words: 2100, img: 'earthrise', excerpt: 'The photograph William Anders took on Apollo 8 on 24 December 1968, of Earth rising over the Moon.', marks: 2 },
  { title: 'The Great Wave off Kanagawa', site: 'Wikipedia', host: 'en.wikipedia.org', words: 2700, img: 'wave', excerpt: 'Hokusai’s woodblock print, published around 1831, and probably the most recognised work of Japanese art.', fav: true },
  { title: 'On Being Idle', site: 'Project Gutenberg', host: 'gutenberg.org', words: 3600, progress: 0.62, img: 'jerome', excerpt: 'Now, this is a subject on which I flatter myself I really am au fait.' },
  { title: 'The Story of an Hour', site: 'Project Gutenberg', host: 'gutenberg.org', words: 1000, img: 'chopin', excerpt: 'Knowing that Mrs. Mallard was afflicted with a heart trouble, great care was taken to break to her as gently as possible the news.' },
  { title: 'Lighthouse of Alexandria', site: 'Wikipedia', host: 'en.wikipedia.org', words: 2300, img: 'lighthouse', excerpt: 'The Pharos, built by the Ptolemaic Kingdom during the reign of Ptolemy II Philadelphus.' }
]

const WALKING = [
  'I wish to speak a word for Nature, for absolute freedom and wildness, as contrasted with a freedom and culture merely civil,—to regard man as an inhabitant, or a part and parcel of Nature, rather than a member of society.',
  ['I have met with but one or two persons in the course of my life who understood the art of Walking, that is, of taking walks,—who had a genius, so to speak, for ', 'sauntering, which word is beautifully derived “from idle people who roved about the country, in the Middle Ages, and asked charity, under pretence of going à la Sainte Terre,”', ' to the Holy Land, till the children exclaimed, “There goes a Sainte-Terrer,” a Saunterer, a Holy-Lander.'],
  'He who sits still in a house all the time may be the greatest vagrant of all; but the saunterer, in the good sense, is no more vagrant than the meandering river, which is all the while sedulously seeking the shortest course to the sea.'
]

function demoRow(s) {
  const m = Math.round(s.words / 230)
  return h('div.row-wrap', h('div.row-item' + (s.open ? '.is-open' : ''),
    h('div', { style: { 'min-width': '0' } },
      h('div.row-t', s.title),
      h('div.row-x', s.excerpt),
      h('div.meta', favicon(s, 16), h('span.host', s.site), h('i.dot'), s.progress ? h('span.left', `${Math.round(m * (1 - s.progress))} min left`) : h('span', `${m} min`),
        s.marks ? [h('i.dot'), h('span', ic('highlighter', 12, 2.2))] : null, s.fav ? h('span.star', starFill(12)) : null)),
    h('div.pic', h('img.is-in', { src: `/samples/${s.img}.jpg`, alt: '' })),
    s.progress ? h('div.row-prog', h('i', { style: { transform: `scaleX(${s.progress})` } })) : null))
}

export function landing() {
  const feature = (icon, title, text) => h('div.l-f', h('span.ic', ic(icon, 19, 2)), h('b', title), h('p', text))
  const el = h('div.landing',
    h('header.l-top.glass', h('span.brand', h('span.brand-mark', mark(17)), h('span.brand-name', 'Shelf')), h('span.grow'), h('button.btn.plain', { type: 'button', onclick: signIn }, 'Sign in'), accountButton()),
    h('section.l-hero',
      h('div.l-copy',
        h('span.l-kicker', h('i'), 'Read-later, on your own server'),
        h('h1', 'Save it now. ', h('em', 'Read it '), h('mark', 'properly'), ' later.'),
        h('p', 'Shelf keeps the articles you mean to read in a calm reader: no ads, no pop-ups, set in a typeface made for reading. Highlight what matters, pick up where you stopped on any device, and let Claude read your shelf with you.'),
        h('div.l-cta', h('button.btn.primary.large', { type: 'button', onclick: signIn }, 'Start your shelf'), h('small', 'Free on this server. Bring your Pocket export.'))),
      h('div.l-demo', { 'aria-hidden': 'true' },
        h('div.list-col', h('div.page-head', h('h1.large-title', 'Reading list')),
          h('div.chips', h('span.chip.is-on', 'All', h('span.n', '6')), h('span.chip', 'Quick reads', h('span.n', '3')), h('span.chip', 'Long reads', h('span.n', '1')), h('span.chip', 'Started', h('span.n', '2'))),
          h('div.rows', SAMPLES.map(demoRow))),
        h('div.reader', h('div.r-panel', h('article.article',
          h('div.a-site', favicon(SAMPLES[0], 18), h('span', 'Project Gutenberg'), h('span', '·'), h('span', '54 min read')),
          h('h1.a-title', 'Walking'),
          h('div.a-by', h('span', 'Henry David Thoreau'), h('i.dot'), h('span', 'June 1862')),
          h('div.a-sum', h('div.a-sum-h', ic('sparkles', 13, 2), 'Summary'), h('ul', h('li', 'Thoreau argues for wildness over the merely civil, and for walking as a daily practice.'), h('li', 'He traces “saunter” to pilgrims bound for the Holy Land, or to people without land.'))),
          h('div.a-body', WALKING.map((p) => h('p', Array.isArray(p) ? [p[0], h('mark.hl', p[1]), p[2]] : p)))))))),
    h('section.l-features',
      feature('bookmarkPlus', 'Save from anywhere', 'Paste a link, click the Save to Shelf button in your browser, share from your phone, or ask Claude to save something it found.'),
      feature('bookOpen', 'A reader made for reading', 'Newsreader or Inter, the size and width you like, a paper tone for evenings, and your place kept on every device.'),
      feature('highlighter', 'Highlights that stay', 'Select words to highlight them and add a note. Every highlight is searchable, and gathered in one place.'),
      feature('bot', 'Claude reads it with you', 'Connect Shelf to Claude and it can list, search and read what you saved, quote your highlights and save links for you.'),
      feature('headphones', 'Listen', 'Your device reads an article aloud, sentence by sentence, following along on the page. Or ask for a three-line summary first.'),
      feature('libraryBig', 'Yours, and it lasts', 'Articles and their pictures are kept on your server, so they’re there when the site changes or goes. They work offline too.')),
    h('footer.l-foot', credit()))
  return { el }
}
