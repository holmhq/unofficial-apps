// New paste: title, highlighted editor, attachments, and one sentence-shaped
// button that both sets the link options and creates the link.

import { h, icon, api, upload, bytes, store, toast, EXPIRY, plural, shareUrl } from '../lib.js'
import { languages, langName, detect, highlight } from '../code.js'

const MAX_FILES = 10
const MAX_FILE = 25 * 1024 * 1024
const MAX_TOTAL = 50 * 1024 * 1024
const MAX_TEXT = 512 * 1024
const LIVE_HIGHLIGHT = 60 * 1024
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
// Short labels for the expiry word inside the button: "for 1h", "for ever".
const SHORT = { never: 'ever', '10m': '10m', '1h': '1h', '1d': '1d', '7d': '7d', '30d': '30d' }

export function mountCompose(main, ctx) {
  const draft = store.get('pb.draft', { title: '', content: '', language: 'auto' })
  const opts = Object.assign({ expires: 'never', burn: false, showAuthor: false }, store.get('pb.opts', {}))
  const files = [] // { file, url }
  let detected = 'plaintext'
  let busy = false

  // ── editor ──
  const code = h('code')
  const pre = h('pre', { 'aria-hidden': 'true' }, code)
  const ta = h('textarea', {
    spellcheck: false, autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off',
    placeholder: 'Paste or type here. Drop files anywhere on the page.',
    'aria-label': 'Paste content',
  })
  ta.value = draft.content || ''
  const editor = h('div.editor', pre, ta)
  // The panel scrolls; the textarea and its highlight layer grow inside it together.
  const editorScroll = h('div.editor-scroll', editor)

  const langSelect = h('select.select.lang-select', { 'aria-label': 'Language' },
    h('option', { value: 'auto' }, 'Auto-detect'),
    languages().map(([id, name]) => h('option', { value: id }, name)))
  langSelect.value = draft.language && draft.language !== '' ? draft.language : 'auto'
  if (!langSelect.value) langSelect.value = 'auto'

  const stats = h('span.hint')
  const title = h('input.compose-title', {
    type: 'text', placeholder: 'Untitled', maxlength: '120', 'aria-label': 'Title', autocomplete: 'off',
  })
  title.value = draft.title || ''

  // ── attachments ──
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true })
  const attachList = h('div.attachments', { hidden: true })
  const attachBtn = h('button.btn.btn-quiet.btn-sm.btn-icon', {
    type: 'button', 'aria-label': 'Attach files', title: 'Attach files (or drop them anywhere)',
    onclick: () => fileInput.click(),
  }, icon('paperclip'))

  // ── the create button ──
  // "Create [one-time] link [with] my name for [1h] ▾". Clicking an italic
  // word strikes it through rather than removing it, so the button keeps its
  // width and nothing under the cursor moves.
  const tokBurn = h('button.tok', { type: 'button', onclick: () => { opts.burn = !opts.burn; saveOpts(); syncOptions() } }, 'one-time')
  const tokAuthor = h('button.tok', { type: 'button', onclick: () => { opts.showAuthor = !opts.showAuthor; saveOpts(); syncOptions() } }, 'with')
  const tokExpiry = h('button.tok.tok-expiry', { type: 'button', 'aria-haspopup': 'menu', onclick: e => openExpiry(e.currentTarget) })
  const goBtn = h('button.split-go', { type: 'submit', title: (isMac ? '⌘' : 'Ctrl') + '+Enter' }, 'Create')
  const sentence = h('span.split-sentence', goBtn, ' ', tokBurn, ' link ', tokAuthor, ' my name for ', tokExpiry)
  const status = h('span.split-status', { 'aria-live': 'polite' })
  const splitMain = h('div.split-main', {
    // Anywhere on the sentence that isn't a toggle creates the link.
    onclick: e => { if (!e.target.closest('.tok, .split-go')) create() },
  }, sentence, status)
  const moreBtn = h('button.split-more', { type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Choose when the link expires', onclick: e => openExpiry(e.currentTarget) }, icon('down'))
  const split = h('div.split', { role: 'group', 'aria-label': 'Create link' }, splitMain, moreBtn)
  const errorBox = h('p.form-error', { role: 'alert', hidden: true })

  const form = h('form.compose', { onsubmit: e => { e.preventDefault(); create() } },
    title,
    h('div.sheet',
      h('div.sheet-bar', langSelect, h('span.grow'), stats, attachBtn),
      editorScroll),
    fileInput,
    attachList,
    errorBox,
    h('div.create', split))

  main.replaceChildren(form)
  // The composer is an app screen: the page stays put and only the editor scrolls.
  document.body.classList.add('shell')

  // ── behaviour ──
  function effectiveLang() {
    return langSelect.value === 'auto' ? detected : langSelect.value
  }

  let hlFrame = 0
  function renderEditor() {
    cancelAnimationFrame(hlFrame)
    hlFrame = requestAnimationFrame(() => {
      const text = ta.value
      if (text.length > LIVE_HIGHLIGHT) {
        editor.classList.add('plain')
        code.textContent = text + '\n'
      } else {
        editor.classList.remove('plain')
        code.innerHTML = highlight(text, effectiveLang()) + '\n'
      }
      const lines = text ? text.split('\n').length : 0
      const size = new Blob([text]).size
      stats.textContent = text ? plural(lines, 'line') + ', ' + bytes(size) : ''
      stats.style.color = size > MAX_TEXT ? 'var(--ember)' : ''
    })
  }

  let detectTimer = 0
  function scheduleDetect() {
    if (langSelect.value !== 'auto') return
    clearTimeout(detectTimer)
    detectTimer = setTimeout(() => {
      const next = detect(ta.value)
      if (next !== detected) { detected = next; renderEditor() }
      langSelect.options[0].textContent = ta.value.trim() ? 'Auto (' + langName(detected) + ')' : 'Auto-detect'
    }, 250)
  }

  let draftTimer = 0
  function saveDraft() {
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      store.set('pb.draft', { title: title.value, content: ta.value.length <= MAX_TEXT ? ta.value : '', language: langSelect.value })
    }, 300)
  }

  function saveOpts() { store.set('pb.opts', opts) }

  ta.addEventListener('input', () => { renderEditor(); scheduleDetect(); saveDraft(); hideError() })
  title.addEventListener('input', saveDraft)
  title.addEventListener('keydown', e => { if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) { e.preventDefault(); ta.focus() } })
  langSelect.addEventListener('change', () => {
    if (langSelect.value === 'auto') { detected = detect(ta.value) } else langSelect.options[0].textContent = 'Auto-detect'
    renderEditor(); saveDraft()
  })

  // Tab indents; Escape then Tab leaves the editor (keyboard users are not trapped).
  let escaped = false
  ta.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); create(); return }
    if (e.key === 'Escape') { escaped = true; return }
    if (e.key === 'Tab' && !escaped && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      indent(e.shiftKey)
    }
    escaped = false
  })

  function indent(out) {
    const { selectionStart: s, selectionEnd: end, value } = ta
    if (!out && s === end) {
      document.execCommand('insertText', false, '  ') || ta.setRangeText('  ', s, end, 'end')
    } else {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1
      const block = value.slice(lineStart, end)
      const next = out ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^/gm, '  ')
      ta.setSelectionRange(lineStart, end)
      if (!document.execCommand('insertText', false, next)) ta.setRangeText(next, lineStart, end, 'select')
    }
    ta.dispatchEvent(new Event('input'))
  }

  // Pasting an image (screenshot) attaches it.
  ta.addEventListener('paste', e => {
    const items = e.clipboardData && Array.from(e.clipboardData.files || [])
    if (items && items.length && !e.clipboardData.getData('text/plain')) {
      e.preventDefault()
      addFiles(items)
    }
  })

  fileInput.addEventListener('change', () => { addFiles(Array.from(fileInput.files || [])); fileInput.value = '' })

  function addFiles(list) {
    for (const f of list) {
      if (files.length >= MAX_FILES) { showError('A paste can hold up to 10 files.'); break }
      const named = f.name ? f : new File([f], 'pasted-' + Date.now() + '.' + ((f.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')), { type: f.type })
      files.push({ file: named, url: /^(image|video)\//.test(named.type) ? URL.createObjectURL(named) : null })
    }
    renderFiles()
  }

  function renderFiles() {
    attachList.hidden = files.length === 0
    attachList.replaceChildren(...files.map((it, i) => {
      const f = it.file
      const big = f.size > MAX_FILE
      let thumb
      if (it.url && f.type.startsWith('image/')) thumb = h('img', { src: it.url, alt: '' })
      else if (it.url) thumb = h('video', { src: it.url, muted: true, playsInline: true, preload: 'metadata' })
      else thumb = icon(fileKind(f.type))
      return h('div.att', { class: big ? 'too-big' : null },
        h('div.att-thumb', thumb),
        h('div.att-meta', h('strong', { title: f.name }, f.name), h('span', big ? bytes(f.size) + ', over 25 MB' : bytes(f.size))),
        h('button.att-remove', { type: 'button', 'aria-label': 'Remove ' + f.name, onclick: () => removeFile(i) }, icon('x')))
    }))
    hideError()
  }

  function removeFile(i) {
    const [it] = files.splice(i, 1)
    if (it && it.url) URL.revokeObjectURL(it.url)
    renderFiles()
  }

  // Drag and drop anywhere on the page.
  let dragDepth = 0
  const onDragEnter = e => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; document.body.classList.add('dragging') } }
  const onDragOver = e => { if (hasFiles(e)) e.preventDefault() }
  const onDragLeave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging') }
  const onDrop = e => {
    if (!hasFiles(e)) return
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging')
    addFiles(Array.from(e.dataTransfer.files || []))
  }
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)

  function syncOptions() {
    const label = (EXPIRY.find(e => e[0] === opts.expires) || EXPIRY[0])[1].toLowerCase()
    setTok(tokBurn, opts.burn, opts.burn ? 'Opens once, then it’s deleted. Click for a normal link.' : 'Click to make the link work only once.')
    setTok(tokAuthor, opts.showAuthor, opts.showAuthor ? 'Your name and photo show. Click to hide them.' : 'Your name is hidden. Click to show it.')
    tokExpiry.textContent = SHORT[opts.expires] || opts.expires
    tokExpiry.title = opts.expires === 'never' ? 'Never expires. Click to choose.' : 'Expires after ' + label + '. Click to choose.'
    goBtn.setAttribute('aria-label', 'Create ' + (opts.burn ? 'one-time ' : '') + 'link' +
      (opts.showAuthor ? ' with my name' : ' without my name') +
      (opts.expires === 'never' ? ', never expires' : ', expires after ' + label))
    setButton()
  }

  function setTok(el, on, tip) {
    el.classList.toggle('off', !on)
    el.setAttribute('aria-pressed', String(on))
    el.title = tip
  }

  function setButton(text) {
    if (text && !split.classList.contains('busy')) split.style.minWidth = split.offsetWidth + 'px'
    split.classList.toggle('busy', !!text)
    status.textContent = text || ''
    goBtn.disabled = busy
    if (!text) split.style.minWidth = ''
  }

  function openExpiry(anchor) {
    const open = document.querySelector('.menu.expiry-menu')
    if (open) { open.remove(); return }
    const menu = h('div.menu.expiry-menu', { role: 'menu' },
      h('div.menu-label', 'Link expires'),
      EXPIRY.map(([v, label]) => h('button', {
        type: 'button', role: 'menuitemradio', 'aria-checked': String(opts.expires === v),
        onclick: () => { opts.expires = v; saveOpts(); syncOptions(); close() },
      }, v === opts.expires ? icon('check') : h('span.menu-gap'), v === 'never' ? 'Never' : 'After ' + label.toLowerCase())))
    document.body.append(menu)
    const r = split.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const top = below > m.height + 12 ? r.bottom + 8 : r.top - m.height - 8
    menu.style.position = 'fixed'
    menu.style.top = Math.max(8, top) + 'px'
    menu.style.left = Math.min(window.innerWidth - m.width - 8, Math.max(8, r.right - m.width)) + 'px'
    const current = menu.querySelector('[aria-checked="true"]')
    ;(current || menu.querySelector('button')).focus()
    function close() {
      menu.remove()
      document.removeEventListener('click', outside, true)
      document.removeEventListener('keydown', onKey)
      anchor.focus()
    }
    const outside = e => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close() }
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menu.querySelectorAll('button'))
        const i = items.indexOf(document.activeElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
        e.preventDefault()
      }
    }
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', onKey) })
  }

  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false }
  function hideError() { errorBox.hidden = true }

  async function create() {
    if (busy) return
    const content = ta.value
    if (!content.trim() && files.length === 0) { showError('Add some text or a file first.'); ta.focus(); return }
    if (new Blob([content]).size > MAX_TEXT) { showError('Text is limited to 512 KB. Attach it as a file instead.'); return }
    const total = files.reduce((n, it) => n + it.file.size, 0)
    if (files.some(it => it.file.size > MAX_FILE)) { showError('Each file can be up to 25 MB. Remove the larger ones.'); return }
    if (total > MAX_TOTAL) { showError('Files can add up to 50 MB per paste.'); return }

    if (!ctx.me()) {
      try { await ctx.signIn() } catch (e) { return }
      syncOptions()
    }

    busy = true
    setButton(files.length ? 'Uploading…' : 'Creating link…')
    const fields = {
      title: title.value.trim(),
      language: langSelect.value === 'auto' ? (content.trim() ? detected : '') : langSelect.value,
      expires_in: opts.expires,
      burn_after_read: !!opts.burn,
      show_author: !!opts.showAuthor,
    }
    try {
      let res
      if (files.length) {
        const form = new FormData()
        if (content) form.append('content', content)
        for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
        files.forEach((it, i) => form.append(i === 0 ? 'file' : 'file' + i, it.file, it.file.name))
        res = await upload('/api/pastes', form, p => setButton('Uploading ' + Math.round(p * 100) + '%'))
      } else {
        res = await api('POST', '/api/pastes', Object.assign({ content }, fields))
      }
      store.del('pb.draft')
      files.forEach(it => it.url && URL.revokeObjectURL(it.url))
      const url = shareUrl(res.paste.slug)
      let copied = false
      try { await navigator.clipboard.writeText(url); copied = true } catch (e) { /* needs a fresh gesture on some browsers */ }
      try { sessionStorage.setItem('pb.created', res.paste.slug) } catch (e) { /* ignore */ }
      if (copied) toast('Link copied')
      ctx.navigate('/p/' + res.paste.slug)
    } catch (err) {
      busy = false
      setButton()
      if (err.status === 401) { ctx.setMe(null); showError('Your session ended. Sign in again to create the link.') }
      else showError(err.message)
    }
  }

  renderEditor()
  renderFiles()
  syncOptions()
  if (langSelect.value === 'auto' && ta.value.trim()) { detected = detect(ta.value); renderEditor(); langSelect.options[0].textContent = 'Auto (' + langName(detected) + ')' }
  if (!ta.value) setTimeout(() => ta.focus({ preventScroll: true }), 0)

  return {
    onMe: syncOptions,
    destroy() {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      document.body.classList.remove('dragging')
      document.body.classList.remove('shell')
      const menu = document.querySelector('.menu.expiry-menu')
      if (menu) menu.remove()
      files.forEach(it => it.url && URL.revokeObjectURL(it.url))
    },
  }
}

function hasFiles(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')
}

export function fileKind(mime) {
  mime = mime || ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || /json|xml|javascript|yaml|toml/.test(mime)) return 'text'
  return 'file'
}
