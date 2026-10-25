// Two dialogs from the top right: download the shape as a 3D model, and
// embed it in a React site with the 3dsvg package from npm.

import { h, dialog, toast, copyText, downloadBlob } from './ui.js'
import { icon } from './icons.js'
import { state } from './state.js'
import { embedSnippet } from './design.js'
import { fileBase } from './capture.js'

const FORMATS = [
  { value: 'glb', label: 'GLB', ext: '.glb', tag: 'Recommended', detail: 'Looks like the editor: full colour, material and texture. Opens in Blender, Unity, AR and web viewers.' },
  { value: 'stl', label: 'STL', ext: '.stl', tag: 'For 3D printing', detail: 'Geometry only, with no colour or material. Opens in any slicer, such as Cura, Bambu Studio or PrusaSlicer.' },
  { value: 'obj', label: 'OBJ', ext: '.obj', tag: 'Universal mesh', detail: 'Geometry only. For a tool that doesn’t take GLB.', more: true },
  { value: 'ply', label: 'PLY', ext: '.ply', tag: 'Scans and point clouds', detail: 'Geometry only, and rarely needed; most people want GLB.', more: true }
]

export function downloadDialog(viewer) {
  if (!viewer.hasShape()) return toast('There is nothing on the stage yet.')
  let chosen = 'glb'
  const cards = FORMATS.map(f => {
    const card = h('button', { class: 'format-card', type: 'button', 'aria-pressed': 'false' },
      h('span', { class: 'top' }, h('strong', {}, f.label), h('span', { class: 'ext' }, f.ext), h('span', { class: 'tag' }, f.tag), h('span', { class: 'radio' })),
      h('p', {}, f.detail))
    card.addEventListener('click', () => { chosen = f.value; paint() })
    return card
  })
  const label = h('span', {})
  const go = h('button', { class: 'btn primary block', type: 'button' }, icon('download', 15), label)
  const paint = () => {
    FORMATS.forEach((f, i) => {
      cards[i].classList.toggle('selected', f.value === chosen)
      cards[i].setAttribute('aria-pressed', String(f.value === chosen))
    })
    label.textContent = `Download ${FORMATS.find(f => f.value === chosen).ext}`
  }
  const moreBody = h('div', { class: 'stack', hidden: true }, cards.filter((_, i) => FORMATS[i].more))
  const more = h('button', { class: 'disclosure', type: 'button', 'aria-expanded': 'false' }, icon('chevron-down', 14), 'Other formats')
  more.addEventListener('click', () => { moreBody.hidden = !moreBody.hidden; more.setAttribute('aria-expanded', String(!moreBody.hidden)) })
  go.addEventListener('click', async () => {
    go.disabled = true
    label.textContent = 'Building the model…'
    // Let the label paint before the work holds the page.
    await new Promise(resolve => setTimeout(resolve, 50))
    try {
      const blob = await viewer.exportModel(chosen)
      if (!blob) throw new Error('There is nothing on the stage yet.')
      downloadBlob(blob, `${fileBase()}.${chosen}`)
      d.close()
    } catch (e) {
      toast(e.message || 'The model could not be made.', { tone: 'error' })
    } finally { go.disabled = false; paint() }
  })
  paint()
  const d = dialog({ title: 'Download 3D model' },
    h('div', { class: 'stack' }, cards.filter((_, i) => !FORMATS[i].more), more, moreBody),
    go)
}

function codeBlock(code, label) {
  const copy = h('button', { class: 'icon-btn small', type: 'button', 'aria-label': `Copy ${label}`, title: 'Copy' }, icon('copy', 14))
  copy.addEventListener('click', async () => {
    await copyText(code)
    copy.replaceChildren(icon('check', 14))
    toast('Copied')
    setTimeout(() => copy.replaceChildren(icon('copy', 14)), 2000)
  })
  return h('div', { class: 'code-block' }, h('header', {}, h('span', {}, label), copy), h('pre', {}, code))
}

export function embedDialog() {
  const text = state.design.tab === 'text' && state.shownTab === 'text'
  const design = { ...state.design, tab: text ? 'text' : state.shownTab }
  const step = (n, title, ...body) => h('div', { class: 'step' }, h('div', { class: 'step-title' }, h('span', { class: 'step-num' }, n), title), ...body)
  dialog({ title: 'Embed' },
    h('p', { class: 'hint' }, 'Put this shape on your own React site with ', h('a', { href: 'https://www.npmjs.com/package/3dsvg', target: '_blank', rel: 'noopener' }, 'the 3dsvg package'), ', made by the authors of the original editor.'),
    step(1, 'Install the package', codeBlock('npm install 3dsvg', 'Terminal')),
    step(2, text ? 'Add the component to your project' : 'Copy and paste into your component', codeBlock(embedSnippet(design, state.shownSvg), 'your-component.tsx')),
    state.shape?.shareToken && step(3, 'Or link to it', h('p', { class: 'hint' }, 'Anyone can open its share link: ', h('a', { href: `/s/${state.shape.shareToken}`, target: '_blank', rel: 'noopener' }, `${location.host}/s/${state.shape.shareToken}`))))
}
