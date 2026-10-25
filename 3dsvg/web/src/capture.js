// The camera bar at the bottom: a shutter for stills and video, the frame
// shape, and loop counts for recordings. A still or a recording opens a
// preview to adjust and download.

import { h, dialog, toast, download, downloadBlob, toggle, binder } from './ui.js'
import { icon } from './icons.js'
import { state, on, emit } from './state.js'
import { CYCLE_SECONDS } from './scene.js'

const ASPECTS = [
  { value: 'free', label: 'Auto', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '9:16', label: '9:16', ratio: 9 / 16 }
]
const RESOLUTIONS = [
  { value: 1280, label: '720p' },
  { value: 1920, label: '1080p' },
  { value: 2560, label: '1440p' },
  { value: 3840, label: '4K' }
]
const BITS = { low: 4_000_000, mid: 12_000_000, high: 24_000_000 }

export function fileBase() {
  const name = state.shape?.name || (state.shownTab === 'text' ? state.design.text : '')
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || '3dsvg'
}

// The first container this browser can record a canvas into.
function recorderType() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4']
  return types.find(t => globalThis.MediaRecorder?.isTypeSupported?.(t)) || ''
}

const select = (options, value, onchange, label) => {
  const s = h('select', { class: 'select', 'aria-label': label }, options.map(o => h('option', { value: o.value }, o.label)))
  s.value = String(value)
  s.addEventListener('change', () => onchange(s.value))
  return s
}

export function createCamera(root, viewer) {
  const opts = { mode: 'image', resolution: 1920, withBg: true, format: 'mp4', quality: 'high', aspect: 'free', cycles: null }
  let aspectOpen = false
  let aspectTimer = 0
  let recording = null
  let viewfinder = null

  const ratio = () => ASPECTS.find(a => a.value === opts.aspect).ratio
  const cycleSeconds = () => (state.design.animate !== 'none' ? CYCLE_SECONDS[state.design.animate] / state.design.animateSpeed : null)

  function setPreview(open) {
    state.previewOpen = open
    emit('preview', open)
  }

  // ── The bar ──

  function paint() {
    if (recording) { root.hidden = true; return }
    root.hidden = false
    const cyc = opts.mode === 'video' && cycleSeconds()
    const cycles = cyc && h('div', { class: 'pill-bar' }, [1, 2, 3].map(n =>
      h('button', {
        class: `pill small${opts.cycles === n ? ' active' : ''}`, type: 'button',
        title: `Record ${n} animation ${n === 1 ? 'loop' : 'loops'} (${(cyc * n).toFixed(1)} s)`,
        'aria-pressed': String(opts.cycles === n),
        onclick: () => { opts.cycles = opts.cycles === n ? null : n; paint() }
      }, icon('repeat', 12), `${n}x`)))
    const shutter = h('button', {
      class: `shutter${opts.mode === 'video' ? ' video' : ''}`, type: 'button',
      'aria-label': opts.mode === 'video' ? 'Start recording' : 'Take a picture',
      title: opts.mode === 'video' ? 'Record' : 'Take a picture',
      onclick: () => (opts.mode === 'image' ? takePicture() : startRecording())
    }, h('span'))
    const mode = (value, label) => h('button', {
      class: `pill${opts.mode === value ? ' active' : ''}`, type: 'button', 'aria-pressed': String(opts.mode === value),
      onclick: () => { opts.mode = value; paint() }
    }, label)
    const aspects = ASPECTS.filter(a => aspectOpen || a.value === opts.aspect).map(a => h('button', {
      class: `pill small${aspectOpen && a.value === opts.aspect ? ' active' : ''}`, type: 'button',
      title: aspectOpen ? `Frame ${a.label}` : 'Frame shape',
      'aria-label': aspectOpen ? `Frame ${a.label}` : `Frame shape: ${a.label}`,
      onclick: () => {
        if (!aspectOpen) aspectOpen = true
        else { opts.aspect = a.value; aspectOpen = false; frame() }
        paint()
      }
    }, a.label))
    const aspectBox = h('div', { class: 'row', style: { gap: '2px' } }, aspects)
    aspectBox.addEventListener('mouseleave', () => {
      clearTimeout(aspectTimer)
      aspectTimer = setTimeout(() => { if (aspectOpen) { aspectOpen = false; paint() } }, 500)
    })
    aspectBox.addEventListener('mouseenter', () => clearTimeout(aspectTimer))
    root.replaceChildren(cycles || '', shutter,
      h('div', { class: 'pill-bar' }, mode('image', 'Image'), mode('video', 'Video'), h('span', { class: 'pill-sep' }), aspectBox))
  }

  // A darkened frame around the part of the stage a picture will keep.
  function frame() {
    viewfinder?.remove()
    viewfinder = null
    const r = ratio()
    if (!r) return
    const pad = 48
    const availW = innerWidth - pad * 2, availH = innerHeight - pad * 2
    let w, hgt
    if (r > availW / availH) { w = availW; hgt = availW / r } else { hgt = availH; w = availH * r }
    viewfinder = h('div', { class: 'viewfinder', style: { width: `${w}px`, height: `${hgt}px`, left: `calc(50% - ${w / 2}px)`, top: `calc(50% - ${hgt / 2}px)` } })
    document.getElementById('app').append(viewfinder)
  }
  addEventListener('resize', frame)

  // ── Stills ──

  function takePicture() {
    if (!viewer.hasShape()) return toast('There is nothing on the stage yet.')
    setPreview(true)
    const img = h('img', { alt: 'Preview of the picture' })
    const b = binder()
    const shoot = () => { img.src = viewer.capture(720, opts.withBg, ratio()) }
    shoot()
    const save = h('button', { class: 'btn primary', type: 'button' }, icon('download', 15), 'Download PNG')
    save.addEventListener('click', () => {
      download(viewer.capture(opts.resolution, opts.withBg, ratio()), `${fileBase()}.png`)
    })
    const d = dialog({ title: 'Picture', wide: true, onclose: () => setPreview(false) },
      h('div', { class: 'checker' }, img),
      h('div', { class: 'options-row' },
        h('label', {}, 'Resolution', select(RESOLUTIONS, opts.resolution, v => { opts.resolution = Number(v) }, 'Resolution')),
        h('div', { style: { minWidth: '150px' } }, toggle(b, { label: 'Background', get: () => opts.withBg, set: v => { opts.withBg = v; shoot() } }))),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => d.close() }, icon('trash-2', 15), 'Discard'),
        save))
  }

  // ── Recording ──

  function startRecording() {
    const type = recorderType()
    if (!type || !viewer.canvas.captureStream) return toast('This browser can’t record video.', { tone: 'error' })
    if (!viewer.hasShape()) return toast('There is nothing on the stage yet.')
    const cyc = cycleSeconds()
    const autoStop = opts.cycles && cyc ? cyc * opts.cycles * 1000 : 0
    setTimeout(() => {
      const chunks = []
      const stream = viewer.canvas.captureStream(60)
      let recorder
      try { recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: BITS[opts.quality] }) } catch { return toast('This browser can’t record video.', { tone: 'error' }) }
      const started = Date.now()
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: type.split(';')[0] })
        showVideo(blob, (Date.now() - started) / 1000, type.includes('mp4') ? 'mp4' : 'webm')
      }
      recorder.start(100)
      const pillTime = h('span', {}, '0.0s')
      const pill = h('div', { class: 'rec-pill', role: 'status' }, h('span', { class: 'rec-dot' }), pillTime,
        h('button', { class: 'rec-stop', type: 'button', onclick: stop }, icon('square', 12), 'Stop'))
      document.getElementById('app').append(pill)
      const tick = setInterval(() => {
        const t = (Date.now() - started) / 1000
        pillTime.textContent = autoStop ? `${Math.max(0, autoStop / 1000 - t).toFixed(1)}s` : `${t.toFixed(1)}s`
      }, 100)
      const timer = autoStop ? setTimeout(stop, autoStop) : 0
      recording = { recorder, pill, tick, timer }
      paint()
    }, 150)
  }

  function stop() {
    if (!recording) return
    const { recorder, pill, tick, timer } = recording
    clearInterval(tick)
    clearTimeout(timer)
    pill.remove()
    recording = null
    if (recorder.state !== 'inactive') recorder.stop()
    paint()
  }

  function showVideo(blob, duration, recorded) {
    setPreview(true)
    const url = URL.createObjectURL(blob)
    let trim = { start: 0, end: duration }
    let busy = false
    const video = h('video', { src: url, muted: true, loop: true, playsInline: true, autoplay: innerWidth >= 768 })
    video.muted = true
    video.addEventListener('click', () => (video.paused ? video.play() : video.pause()))
    const box = h('div', { class: 'video-box' }, video)
    const r = ratio()
    if (r) { box.style.aspectRatio = String(r); video.style.objectFit = 'cover' }
    const trimmer = createTrimmer(video, url, duration, (start, end) => { trim = { start, end } })
    const status = h('span', {}, `Download ${opts.format.toUpperCase()}`)
    const bar = h('span', { class: 'progress', style: { width: '0%' }, hidden: true })
    const go = h('button', { class: 'btn primary busy', type: 'button' }, bar, h('span', {}, icon('download', 15), status))
    const formatSelect = select([{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }], opts.format, v => { opts.format = v; status.textContent = `Download ${v.toUpperCase()}` }, 'Format')

    go.addEventListener('click', async () => {
      if (busy) return
      busy = true
      go.disabled = true
      bar.hidden = false
      bar.style.width = '5%'
      try {
        const start = trim.start <= 0.05 ? 0 : trim.start
        const end = trim.end >= duration - 0.05 ? duration : trim.end
        const trimmed = start > 0 || end < duration
        const name = `${fileBase()}.${opts.format}`
        // Uncropped and untrimmed in the recorded format: the file as made.
        if (opts.format === recorded && !r && !trimmed) {
          downloadBlob(blob, name)
        } else {
          const { convert } = await import('./ffmpeg.js')
          const out = await convert(blob, {
            input: recorded, format: opts.format, quality: opts.quality, aspect: r, width: opts.resolution,
            trimStart: trimmed ? start : undefined, trimEnd: trimmed ? end : undefined,
            duration: trimmed ? end - start : duration
          }, (text, pct) => {
            if (!d.el.isConnected) return
            status.textContent = pct ? `Converting ${pct}%` : text
            if (pct) bar.style.width = `${pct}%`
          })
          if (d.el.isConnected) downloadBlob(out, name)
        }
      } catch (e) {
        toast(e?.message || 'The video could not be converted.', { tone: 'error' })
      } finally {
        busy = false
        go.disabled = false
        bar.hidden = true
        status.textContent = `Download ${opts.format.toUpperCase()}`
      }
    })

    const d = dialog({ title: 'Video', wide: true, onclose: () => { URL.revokeObjectURL(url); trimmer.destroy(); setPreview(false) } },
      box, trimmer.el,
      h('div', { class: 'options-row' },
        h('label', {}, 'Resolution', select(RESOLUTIONS, opts.resolution, v => { opts.resolution = Number(v) }, 'Resolution')),
        h('label', {}, 'Quality', select([{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Mid' }, { value: 'high', label: 'High' }], opts.quality, v => { opts.quality = v }, 'Quality')),
        h('label', {}, 'Format', formatSelect)),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => d.close() }, icon('trash-2', 15), 'Discard'),
        go))
  }

  on('design', patch => { if (!patch || 'animate' in patch || 'animateSpeed' in patch) paint() })
  paint()
  return { stop }
}

// ── Trimmer: a filmstrip with a handle at each end and a playhead ──

const THUMBS = 12
const HANDLE = 14

function createTrimmer(video, url, duration, onchange) {
  let start = 0, end = duration, head = 0
  let dragging = null, wasPlaying = false, raf = 0, seekRaf = 0, pending = null
  const thumbs = h('div', { class: 'film-thumbs' }, Array.from({ length: THUMBS }, () => h('span')))
  const dimL = h('div', { class: 'film-dim', style: { left: '0' } })
  const dimR = h('div', { class: 'film-dim', style: { right: '0' } })
  const framed = h('div', { class: 'film-frame' })
  const playhead = h('div', { class: 'film-head' })
  const chevron = d => `<svg width="6" height="16" viewBox="0 0 6 16"><path d="${d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`
  const hStart = h('div', { class: 'film-handle start', 'data-handle': 'start' })
  const hEnd = h('div', { class: 'film-handle end', 'data-handle': 'end' })
  hStart.innerHTML = chevron('M4 2L2 8L4 14')
  hEnd.innerHTML = chevron('M2 2L4 8L2 14')
  const film = h('div', { class: 'film' }, thumbs, dimL, dimR, framed, playhead, hStart, hEnd)
  const play = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Play or pause' }, icon('play', 16))
  const times = h('div', { class: 'trim-times' }, h('span'), h('span'), h('span'))
  const el = h('div', { class: 'trimmer' }, h('div', { class: 'trim-row' }, play, film), times)

  const width = () => film.clientWidth || 1
  const toPx = t => (t / (duration || 1)) * width()
  const toTime = px => Math.max(0, Math.min(duration, (px / width()) * duration))

  function paint() {
    const l = toPx(start), r = toPx(end), w = width()
    dimL.style.width = `${l}px`
    dimR.style.width = `${Math.max(0, w - r)}px`
    framed.style.left = `${l - HANDLE}px`
    framed.style.width = `${Math.max(0, r - l + HANDLE * 2)}px`
    playhead.style.left = `${toPx(Math.max(start, Math.min(end, head)))}px`
    hStart.style.left = `${Math.max(0, l - HANDLE)}px`
    hStart.style.width = hEnd.style.width = `${HANDLE}px`
    hEnd.style.left = `${Math.min(r, w - HANDLE)}px`
    const [a, b, c] = times.children
    a.textContent = `${start.toFixed(1)}s`
    b.textContent = `${(end - start).toFixed(1)}s`
    c.textContent = `${end.toFixed(1)}s`
  }

  const seek = t => {
    pending = t
    if (!seekRaf) seekRaf = requestAnimationFrame(() => { if (pending !== null) video.currentTime = pending; pending = null; seekRaf = 0 })
  }

  // The playhead follows the video and loops inside the kept part.
  const loop = () => {
    head = video.currentTime
    if (!video.paused && dragging !== 'start' && dragging !== 'end') {
      if (video.currentTime >= end - 0.05 || video.currentTime < start - 0.05) video.currentTime = start
    }
    paint()
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const paintPlay = () => play.replaceChildren(icon(video.paused ? 'play' : 'pause', 16))
  video.addEventListener('play', paintPlay)
  video.addEventListener('pause', paintPlay)
  video.addEventListener('ended', () => { video.currentTime = start; video.play().catch(() => {}) })
  play.addEventListener('click', () => {
    if (video.paused) {
      if (video.currentTime >= end || video.currentTime < start) video.currentTime = start
      video.play().catch(() => {})
    } else video.pause()
  })

  for (const [handle, which] of [[hStart, 'start'], [hEnd, 'end']]) {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault()
      e.stopPropagation()
      dragging = which
      film.setPointerCapture(e.pointerId)
    })
  }
  film.addEventListener('pointerdown', e => {
    if (dragging) return
    wasPlaying = !video.paused
    video.pause()
    const x = e.clientX - film.getBoundingClientRect().left
    seek(Math.max(start, Math.min(end, toTime(x))))
    dragging = 'scrub'
    film.setPointerCapture(e.pointerId)
  })
  film.addEventListener('pointermove', e => {
    if (!dragging) return
    const t = toTime(e.clientX - film.getBoundingClientRect().left)
    if (dragging === 'start') { start = Math.max(0, Math.min(t, end - 0.5)); seek(start) }
    else if (dragging === 'end') { end = Math.min(duration, Math.max(t, start + 0.2)); seek(end) }
    else seek(Math.max(start, Math.min(end, t)))
    onchange(start, end)
  })
  const up = () => {
    if (dragging === 'scrub' && wasPlaying) video.play().catch(() => {})
    dragging = null
  }
  film.addEventListener('pointerup', up)
  film.addEventListener('pointercancel', up)

  // Thumbnails from a second, hidden copy of the video.
  ;(async () => {
    const v = h('video', { src: url, muted: true, preload: 'auto', playsInline: true })
    v.muted = true
    await new Promise(resolve => { v.onloadeddata = resolve; v.onerror = resolve; setTimeout(resolve, 3000) })
    const c = h('canvas', { width: 80, height: 50 })
    const ctx = c.getContext('2d')
    const imgs = []
    for (let i = 0; i < THUMBS; i++) {
      v.currentTime = (i / THUMBS) * duration
      await new Promise(resolve => { v.onseeked = resolve; setTimeout(resolve, 300) })
      try { ctx.drawImage(v, 0, 0, 80, 50); imgs.push(h('img', { src: c.toDataURL('image/jpeg', 0.5), alt: '', draggable: false })) } catch { imgs.push(h('span')) }
    }
    if (el.isConnected) thumbs.replaceChildren(...imgs)
  })()

  paint()
  return { el, destroy: () => cancelAnimationFrame(raf) }
}
