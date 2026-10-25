// The editor: the 3D stage with the tools, settings, camera and account
// around it. The stage follows the design; previews pause the animation.

import { h, toast, isPhone } from './ui.js'
import { icon } from './icons.js'
import { state, on, setDesign, startSvgs, replaceDesign, setShape, REMIX_KEY } from './state.js'
import { viewProps, normalize, defaultDesign } from './design.js'
import { createViewer } from './scene.js'
import { createTools, readSvgFile } from './tools.js'
import { createSettings } from './settings.js'
import { createCamera } from './capture.js'
import { downloadDialog, embedDialog } from './dialogs.js'
import { accountButton } from './account.js'
import { saveButton, useViewer, loadShapes } from './shapes.js'

export function startEditor() {
  takeRemix()

  const settingsEl = document.getElementById('settings')
  let lighting = false
  const viewer = createViewer(document.getElementById('stage'), { scrollZoom: true, ...props() })
  useViewer(viewer)

  function props() {
    const p = viewProps(state.design, state.shownSvg)
    if (state.previewOpen) { p.animate = 'none'; p.resetOnIdle = false }
    p.showLightHelper = lighting && !settingsEl.hidden
    return p
  }
  const push = () => viewer.update(props())
  on('design', push)
  on('svg', push)
  on('preview', push)

  // A spinner when a big SVG takes more than a moment to build.
  const loader = document.getElementById('loader')
  const loaderText = document.getElementById('loader-text')
  let loaderTimer = 0
  viewer.on('loading', (busy, pct) => {
    loaderText.textContent = pct > 0 && pct < 100 ? `${pct}%` : 'Loading…'
    if (busy && !loaderTimer) loaderTimer = setTimeout(() => loader.classList.add('show'), 800)
    if (!busy) { clearTimeout(loaderTimer); loaderTimer = 0; loader.classList.remove('show') }
  })

  // ── Panels ──

  const tools = createTools(document.getElementById('tools'))

  const settingsButton = h('button', { class: 'round-btn glass', type: 'button', title: 'Settings', 'aria-label': 'Settings', 'aria-expanded': 'false' }, icon('settings-2', 16))
  const showSettings = open => {
    settingsEl.hidden = !open
    document.getElementById('app').classList.toggle('settings-open', open)
    settingsButton.classList.toggle('on', open)
    settingsButton.setAttribute('aria-expanded', String(open))
    if (open && isPhone()) tools.hide()
    push()
  }
  createSettings(settingsEl, {
    onClose: () => showSettings(false),
    onReset: () => viewer.reset(),
    onLighting: open => { lighting = open; push() }
  })
  settingsButton.addEventListener('click', () => showSettings(settingsEl.hidden))
  // On a phone the tools and settings share the screen, so one closes the other.
  document.getElementById('tools').addEventListener('click', () => { if (isPhone() && !settingsEl.hidden) showSettings(false) })

  const actions = document.getElementById('actions')
  actions.append(
    saveButton().el,
    h('button', { class: 'round-btn glass', type: 'button', title: 'Download 3D model', 'aria-label': 'Download 3D model', onclick: () => downloadDialog(viewer) }, icon('download', 16)),
    h('button', { class: 'round-btn glass', type: 'button', title: 'Embed', 'aria-label': 'Embed', onclick: embedDialog }, icon('code-xml', 16)),
    settingsButton,
    accountButton().el)

  createCamera(document.getElementById('camera'), viewer)

  // ── Drop an SVG anywhere ──

  let depth = 0
  let zone = null
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
  addEventListener('dragenter', e => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (depth++ === 0) {
      zone = h('div', { class: 'drop-zone' }, icon('upload', 56), 'Drop SVG file')
      document.body.append(zone)
    }
  })
  addEventListener('dragleave', e => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (--depth <= 0) { depth = 0; zone?.remove(); zone = null }
  })
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault() })
  addEventListener('drop', async e => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    zone?.remove()
    zone = null
    const got = await readSvgFile(e.dataTransfer.files[0])
    if (got?.error) return toast(got.error, { tone: 'error' })
    if (got) { setDesign({ file: got, tab: 'file' }); tools.show('file') }
  })

  on('me', me => { if (me) loadShapes() })
  startSvgs()
}

// A shared shape's "Edit a copy" lands here with the design to open.
function takeRemix() {
  let remix = null
  try { remix = JSON.parse(sessionStorage.getItem(REMIX_KEY)) } catch {}
  sessionStorage.removeItem(REMIX_KEY)
  if (!remix?.design) return
  const scratch = !state.shape && JSON.stringify(normalize(state.design)) === JSON.stringify(defaultDesign())
  if (!scratch && !confirm('Replace the design on screen with the shared shape? What’s on screen isn’t saved.')) return
  if (state.shape) setShape(null)
  replaceDesign(remix.design)
}
