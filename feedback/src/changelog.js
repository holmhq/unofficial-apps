// /changelog: what changed in each version, newest first, from
// changelog.json beside index.html.
import { el } from './lib.js'
import { show } from './app.js'

const day = value => new Date(value + 'T12:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

export async function changelogPage() {
  document.title = 'Changelog – feedback'
  const list = el('ol', { class: 'releases' }, el('li', { class: 'muted' }, 'Loading…'))
  show(
    el('section', { class: 'page-head' },
      el('h1', {}, 'Changelog'),
      el('p', { class: 'lede' }, 'What’s new in feedback, newest first.')),
    list)
  try {
    const response = await fetch('/changelog.json', { cache: 'no-cache' })
    const { releases } = await response.json()
    list.replaceChildren(...releases.map((release, index) => el('li', { class: index === 0 ? 'release latest' : 'release' },
      el('div', { class: 'release-when' },
        el('span', { class: 'version' }, 'v' + release.version),
        el('time', { datetime: release.date }, day(release.date))),
      el('article', {},
        el('h2', {}, release.title, index === 0 && el('span', { class: 'new-badge' }, 'Latest')),
        el('ul', {}, release.changes.map(change => el('li', {}, change)))))))
  } catch {
    list.replaceChildren(el('li', { class: 'form-error' }, 'The changelog didn’t load. Try again.'))
  }
}
