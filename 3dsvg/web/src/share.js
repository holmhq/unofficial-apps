// A shared shape at /s/<token>: the shape alone on the stage, to turn and
// zoom, with a way to open a copy in the editor.

import { h } from './ui.js'
import { icon } from './icons.js'
import { normalize, viewProps } from './design.js'
import { createViewer } from './scene.js'
import { accountButton } from './account.js'
import { REMIX_KEY } from './state.js'

export async function startShare(token) {
  for (const id of ['tools', 'settings', 'camera']) document.getElementById(id).remove()
  const app = document.getElementById('app')
  document.getElementById('actions').append(accountButton().el)

  let data = null
  try {
    const r = await fetch(`/api/shares/${encodeURIComponent(token)}`, { headers: { accept: 'application/json' } })
    if (r.ok) data = await r.json()
    else if (r.status !== 404) throw new Error()
  } catch {
    return app.append(h('div', { class: 'viewer-gone' }, h('h1', {}, 'This shape didn’t load'), h('p', {}, 'Check your connection and try again.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Try again')))
  }
  if (!data) {
    return app.append(h('div', { class: 'viewer-gone' }, icon('link-2-off', 40), h('h1', {}, 'This link was turned off'), h('p', {}, 'Its owner stopped sharing it, or it never existed.'),
      h('a', { class: 'btn primary', href: '/' }, icon('sparkles', 15), 'Make your own')))
  }

  const design = normalize(data.design)
  createViewer(document.getElementById('stage'), { ...viewProps(design, data.svg), scrollZoom: true })
  document.title = `${data.name} · 3dsvg`
  app.append(
    h('div', { class: 'viewer-title glass' }, h('strong', {}, data.name), h('span', {}, 'Drag to turn it. Made with 3dsvg.')),
    h('div', { class: 'viewer-cta' },
      h('button', {
        class: 'btn primary', type: 'button',
        onclick: () => {
          sessionStorage.setItem(REMIX_KEY, JSON.stringify({ design: data.design }))
          location.href = '/'
        }
      }, icon('pencil', 15), 'Edit a copy')))
}
