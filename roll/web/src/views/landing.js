// Signed out: what Roll is, a wall of photos drifting by, and the way in.

import { h, ic, reduced } from '../ui.js'
import { mark } from '../icons.js'
import { accountButton, credit, signIn } from '../shell.js'

const SAMPLES = [
  [1, 440, 660], [2, 440, 293], [3, 440, 293], [4, 440, 293], [5, 440, 660], [6, 440, 293], [7, 440, 293], [8, 440, 660],
  [9, 440, 293], [10, 440, 293], [11, 440, 293], [12, 440, 293], [13, 440, 660], [14, 440, 293], [15, 440, 293]
]

const FEATURES = [
  ['images', 'Every day on a timeline', 'Photos sorted by when they were taken, a heading for each day and its place, and a rail to jump through the years.'],
  ['sparkles', 'On this day', 'Photos from today’s date in earlier years come back as a short story.'],
  ['bookImage', 'Albums you share by link', 'Anyone with the link sees the album, no account needed. You can turn the link off any time.'],
  ['lock', 'Yours, on your server', 'Originals stay where you put them. Shared links leave out places, cameras and file names.']
]

export function landing() {
  const columns = [0, 1, 2].map((c) => {
    const list = SAMPLES.filter((_, i) => i % 3 === c)
    const tiles = [...list, ...list].map(([n, w, hh]) => h('span.wall-tile', { style: { 'aspect-ratio': `${w} / ${hh}` } }, h('img', { src: `/samples/${String(n).padStart(2, '0')}.jpg`, alt: '', width: w, height: hh, loading: n > 6 ? 'lazy' : 'eager', decoding: 'async', draggable: 'false' })))
    return h('div.wall-col', { style: { '--speed': [64, 52, 72][c] + 's', '--start': [0, -18, -36][c] + '%' } }, h('div.wall-track', tiles))
  })
  const wall = h('div.wall', { 'aria-hidden': 'true' }, columns)
  const hero = h('section.hero',
    h('div.hero-copy',
      h('h1.hero-title', 'Your photos,', h('br'), 'at home.'),
      h('p.hero-lede', 'A photo library on your own server. Every day on a timeline, memories from this day in years past, and albums you share with a link.'),
      h('div.hero-actions',
        h('button.btn.primary.large', { type: 'button', onclick: signIn }, 'Sign in to start'),
        h('a.btn.large.plain', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/roll', target: '_blank', rel: 'noopener' }, 'Run your own', ic('externalLink', 15, 2)))),
    wall)
  const features = h('section.features', FEATURES.map(([icon, title, text]) => h('div.feature', h('span.feature-ic', ic(icon, 20, 1.9)), h('b', title), h('p', text))))
  const panel = h('div.panel.landing', hero, features, h('div.page-credit', credit()))
  const brand = h('a.brand', { href: '/', 'aria-label': 'Roll' }, h('span.brand-mark', mark(17)), h('span.brand-name', 'Roll'))
  if (reduced()) wall.classList.add('is-still')
  return { el: h('div.app.is-landing', h('header.top.glass', h('div.top-l', brand), h('div.top-r', accountButton())), h('div.body', h('main.main', h('section.page', panel)))) }
}
