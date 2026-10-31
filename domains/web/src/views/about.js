// How it works: where the names come from, who answers, what the prices mean, and what
// leaves your browser. The lookup service can be picked here.

import { esc, act } from '../dom.js'
import { svg, svgHolm } from '../icons.js'
import * as catalog from '../catalog.js'
import { settings, set } from '../settings.js'
import { PROVIDERS } from '../providers/index.js'
import { SOURCE } from '../shell.js'

export function aboutHTML() {
  const providers = PROVIDERS.map((p) => `<button type="button" class="g-row prov" data-act="provider" data-v="${p.id}" aria-pressed="${settings.provider === p.id}"><span class="ck">${settings.provider === p.id ? svg('check', 17, 2.4) : ''}</span><span class="g-t"><b>${esc(p.name)}</b><small>${esc(p.about)}</small></span></button>`).join('')
  return `<div class="panel"><div class="wrap prose-wrap">
    <div class="col-h"><div class="col-t"><h1 class="lt">How it works</h1></div></div>
    <div class="prose">
      <h3>Names first, then answers</h3>
      <p>What you type becomes short labels in your browser: clipped forms (zach), sound-alikes (zak, zack), initials, a dropped vowel (flickr) and, if you like, prefixes, suffixes and domain hacks (inter.net). Labels nobody could say out loud are left out. An AI model reads what you typed and adds nicknames, other spellings, words from the same world and a few new words. Every label meets every extension you picked, and the shortest whole names are asked about first. <b>More like these</b> asks the AI again, for names in the style of the ones that came back available and the ones you starred.</p>
      <h3>Lookups</h3>
    </div>
    <div class="group">${providers}</div>
    <div class="prose">
      <p class="small">Domains talks to lookup services through adapters, so one can be swapped for another. The Namecheap adapter asks Namecheap’s own live search from your browser. If that can’t be reached, the search falls back to the RDAP adapter, which asks each registry’s public lookup through this app.</p>
      <h3>Available, taken, premium</h3>
      <p><b>Available</b> means the registry would register the name right now. Nothing is held for you: someone else can take it a minute later. <b>Likely</b> means RDAP found no registration, but the registry itself didn’t confirm it. <b>Premium</b> means available, at a higher price the registry sets. Taken names aren’t shown.</p>
      <h3>Prices</h3>
      <p>Prices are ${esc(catalog.registrar.name)}’s list prices for one year, saved on ${esc(catalog.updatedLabel())}, in US dollars. Many extensions cost less in the first year than after; each name shows both. Checkout always has the final price.</p>
      <h3>Saved names and lists</h3>
      <p>Star a name to keep it. Lists collect names for a friend or a project, with a note. Both stay in this browser, or with your account when you sign in. A shared list opens for anyone with its link, on one page, checked again when it’s opened; stop sharing and the link stops working.</p>
      <h3>What leaves your browser</h3>
      <p>The names to check go from your browser to Namecheap’s search (or, with RDAP, through this app to the registries). For AI ideas, what you typed goes to this app’s server and its AI model; ideas are kept for 30 days so the same name gets them at once, with nothing about who asked. Your filters stay in this browser.</p>
      <p class="credit"><a href="https://holmhq.com" target="_blank" rel="noopener">${svgHolm(12)}<span>A Holm app</span></a><i></i><a href="${SOURCE}" target="_blank" rel="noopener">Source</a></p>
    </div>
  </div></div>`
}

act({
  provider: (el) => {
    set({ provider: el.dataset.v })
    const main = document.getElementById('main')
    if (main) main.innerHTML = aboutHTML()
  },
})
