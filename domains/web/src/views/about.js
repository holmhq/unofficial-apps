// How it works: where the names come from, who answers, what the prices mean, and what
// leaves your browser.

import { h, ic, haptic } from '../ui.js'
import * as catalog from '../catalog.js'
import { settings, set, on as onSettings } from '../settings.js'
import { PROVIDERS } from '../providers/index.js'
import { holmFooter, SOURCE } from '../shell.js'

export function aboutView() {
  const providers = h('div.group.prov')
  const paint = () => {
    providers.replaceChildren(...PROVIDERS.map((p) => h('button.row', { type: 'button', 'aria-pressed': String(settings.provider === p.id), onclick: () => { haptic(); set({ provider: p.id }) } },
      h('span.row-icon', ic(p.id === 'namecheap' ? 'zap' : 'globe', 17, 2)),
      h('span.row-main', h('b', p.name), h('small', p.about)),
      settings.provider === p.id ? h('span.tag', 'In use') : null)))
  }
  onSettings(paint)
  paint()

  const page = h('div.page',
    h('h1.large-title', 'How it works'),
    h('div.prose',
      h('p', h('b', 'Names first, then answers. '), 'What you type becomes a list of short labels in your browser: clipped forms (zach), sound-alikes (zak, zack), initials, a dropped vowel (flickr), and, if you like, prefixes, suffixes and domain hacks (inter.net). An AI model adds nicknames, other spellings and new words. Every label meets every extension you picked, and the shortest whole names are asked about first.')),
    h('h3.group-title', 'Lookups'),
    providers,
    h('p.group-note', 'Domains talks to lookup services through adapters, so one can be swapped for another. It uses the Namecheap adapter today, which asks Namecheap’s own live search from your browser. If that can’t be reached it falls back to the RDAP adapter, which asks each registry’s public lookup through this app. Another service, such as a registrar’s official API, is one more adapter.'),
    h('h3.group-title', 'Prices'),
    h('div.prose', h('p', `Prices are ${catalog.registrar.name}’s list prices for one year, saved on ${catalog.updatedLabel()}, in US dollars. Many extensions cost less in the first year than after; each name shows both. A premium name has a price set by its registry, given by the lookup. Checkout always has the final price.`)),
    h('h3.group-title', 'Free, taken, premium'),
    h('div.prose', h('p', h('b', 'Free'), ' means the registry would register the name right now. Nothing is held for you: someone else can take it a minute later. ', h('b', 'Taken'), ' means someone has it; the name’s card says since when and with whom, when that’s known. ', h('b', 'Premium'), ' means free, at a higher price the registry sets.')),
    h('h3.group-title', 'What leaves your browser'),
    h('div.prose', h('p', 'The names to check go from your browser to Namecheap’s search (or, with RDAP, through this app to the registries). For AI ideas, what you typed goes to this app’s server and its AI model; ideas are kept for 30 days so the same name gets them at once, with nothing about who asked. Your filters stay in this browser. Saved names stay here too, unless you sign in, which keeps them with your account.')),
    h('h3.group-title', 'Source'),
    h('div.prose', h('p', 'Domains is an open-source Holm app: a page that does the searching, and a small server for sign-in, saved names, AI ideas and registry lookups. ', h('a', { href: SOURCE, target: '_blank', rel: 'noopener', style: { color: 'var(--ink)', 'font-weight': 'var(--w-strong)', 'text-decoration': 'underline', 'text-underline-offset': '2px', 'text-decoration-color': 'var(--line-2)' } }, 'Read the code'), '.')))
  return { el: h('div.panel', page, holmFooter()), show() {} }
}
