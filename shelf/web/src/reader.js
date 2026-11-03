// The reader: one article at a time, set in Newsreader, with the reading position kept as you
// go, highlights and notes, text settings, a summary from the node's AI, and listening.
//
// Highlights are anchored by where they sit in the article's text (start and end), with the
// quoted words and a little text either side, so they find their place again even if the
// article is fetched afresh.

import { h, ic, fill, toast, menu, sheet, copyText, haptic, reduced, wide, closeMenus } from './ui.js'
import { starFill } from './icons.js'
import { lib, on, update, remove, progress, article, marksFor, addMark, noteMark, removeMark, summarize, makeReadable, isWorking, minutes, tone, tags as allTags } from './store.js'
import { failure, go } from './shell.js'
import { favicon, when } from './bits.js'

const SIZES = [16, 17, 18, 19, 20, 22, 24, 26]
const WIDTHS = { narrow: 560, normal: 660, wide: 780 }

function settings() {
  let s = null
  try { s = JSON.parse(localStorage.getItem('shelf:read') || 'null') } catch {}
  return { font: 'serif', size: innerWidth < 760 ? 2 : 4, width: 'normal', paper: false, ...(s || {}) }
}
function keep(s) { try { localStorage.setItem('shelf:read', JSON.stringify(s)) } catch {} }

export function createReader({ onClose = () => {}, onNext = null } = {}) {
  let item = null
  let token = 0
  let marks = []
  let body = null
  let art = null
  let restoring = false
  let speaker = null
  let opts = settings()

  const backBtn = h('button.icon-btn.r-back', { type: 'button', 'aria-label': 'Back to the list', title: 'Back (Esc)', onclick: () => onClose() }, ic('chevronLeft', 24, 2.2))
  const title = h('div.r-title')
  const listenBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Listen', title: 'Listen (L)', onclick: () => listen() }, ic('headphones', 20, 1.9))
  const sumBtn = h('button.icon-btn.is-quiet.sum-btn', { type: 'button', 'aria-label': 'Summarise', title: 'Summarise with AI', onclick: () => summary() }, ic('sparkles', 20, 1.9))
  const aaBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Text settings', title: 'Text settings', 'aria-haspopup': 'dialog', onclick: () => textSettings() }, ic('aLargeSmall', 21, 1.9))
  const favBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Favourite', title: 'Favourite (S)', onclick: () => toggleFav() }, ic('star', 20, 1.9))
  const archBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Archive', title: 'Archive (E)', onclick: () => toggleArchive() }, ic('archive', 20, 1.9))
  const moreBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu', onclick: () => more() }, ic('ellipsis', 20, 2.1))
  const progBar = h('i')
  const bar = h('header.r-bar', backBtn, title, listenBtn, sumBtn, aaBtn, favBtn, archBtn, moreBtn, h('div.r-prog', progBar))
  const panel = h('div.r-panel')
  const el = h('section.reader', { 'aria-label': 'Article' }, bar, panel)

  /* ---- Opening ----------------------------------------------------------------------------- */

  async function open(id, { at = null } = {}) {
    const next = lib.items.get(id)
    if (!next) return false
    const same = item && item.id === id
    stopListening()
    closePops()
    item = next
    const mine = ++token
    marks = []
    drawBar()
    if (!same) {
      panel.scrollTop = 0
      progBar.style.transform = 'scaleX(0)'
      el.classList.remove('is-scrolled')
    }
    applySettings()
    if (!item.opened) update(item.id, { opened: true }).catch(() => {})
    await draw(mine, at)
    return true
  }

  async function draw(mine, at = null) {
    const it = item
    art = h('article.article', { lang: it.lang || null, dir: it.dir || null })
    applySettings()
    const head = [
      h('div.a-site', favicon(it, 18), h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', title: it.url }, h('span', it.site || it.host), ic('arrowUpRight', 13, 2.2)),
        it.words ? [h('span', '·'), h('span', `${minutes(it)} min read`)] : null),
      h('h1.a-title', it.title || it.host),
      byline(it)
    ]
    if (it.status === 'pending' || isWorking(it.id)) {
      fill(panel, fill(art, head, h('div.a-loading', h('div.msg', ic('loaderCircle', 16, 2.2), 'Getting the article from ' + it.host + '…'), [...Array(9)].map(() => h('i')))))
      art.querySelector('.msg svg').classList.add('spin')
      try {
        await makeReadable(it.id)
      } catch (e) {
        if (mine !== token) return
        item = lib.items.get(it.id) || it
        fill(panel, fill(art, head, original(e.message || 'The article couldn’t be fetched.', true)))
        return
      }
      if (mine !== token) return
      item = lib.items.get(it.id) || it
      drawBar()
      return draw(mine, at)
    }
    if (it.status === 'failed' || it.status === 'link') {
      fill(panel, fill(art, head, it.note ? noteBox(it.note) : null, original(it.status === 'failed' ? (it.error || 'Shelf couldn’t make this page readable.') : (it.excerpt || 'This page has no article to read here.'), it.status === 'failed')))
      return
    }
    body = h('div.a-body')
    fill(panel, fill(art, head, h('div.a-loading', [...Array(10)].map(() => h('i')))))
    let html
    try { html = await article(it) } catch (e) {
      if (mine !== token) return
      fill(panel, fill(art, head, original(navigator.onLine ? e.message : 'You’re offline, and this article wasn’t kept on this device yet.', true)))
      return
    }
    if (mine !== token) return
    // Cleaned again as it's drawn, whatever wrote it.
    const { default: DOMPurify } = await import('/vendor/dompurify/purify.es.mjs')
    if (mine !== token) return
    body.replaceChildren(DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math'], FORBID_ATTR: ['style', 'class'] }))
    for (const a of body.querySelectorAll('a[href]')) {
      if (a.getAttribute('href').startsWith('#')) a.addEventListener('click', (e) => { e.preventDefault(); jump(a.getAttribute('href').slice(1)) })
      else { a.target = '_blank'; a.rel = 'noopener noreferrer' }
    }
    // A picture the server couldn't keep loads from its site instead, or goes.
    for (const img of body.querySelectorAll('img')) {
      const gone = () => { const fig = img.closest('figure'); (fig && fig.querySelectorAll('img').length === 1 ? fig : img).remove() }
      img.addEventListener('error', () => {
        if (img.dataset.orig && !img.dataset.tried) { img.dataset.tried = '1'; img.referrerPolicy = 'no-referrer'; img.src = img.dataset.orig; img.addEventListener('error', gone, { once: true }) } else gone()
      }, { once: true })
    }
    // The lead picture goes above the article, unless the article opens with a picture itself.
    const firstImg = body.querySelector('img:not([data-small])')
    let top = firstImg
    while (top && top.parentNode !== body) top = top.parentNode
    const opensWithPicture = !!top && [...body.children].indexOf(top) < 3
    const lead = it.image && !opensWithPicture ? h('img.a-lead', { src: it.image, alt: '', onerror: (e) => e.target.remove() }) : null
    fill(art, head, lead, it.note ? noteBox(it.note) : null, summaryBox(it), body, ending(it))
    // Back to where you were, unless it's finished or nearly so.
    restoring = true
    requestAnimationFrame(() => {
      if (mine !== token) return
      if (at) { const m = marks.find((x) => x.id === at); if (m) flashMark(m.id) }
      else if (it.progress > 0.02 && it.progress < 0.97) panel.scrollTop = it.progress * (panel.scrollHeight - panel.clientHeight)
      onScroll()
      setTimeout(() => { restoring = false }, 120)
    })
    try { marks = await marksFor(it.id) } catch { marks = [] }
    if (mine !== token) return
    paintMarks()
    if (at) requestAnimationFrame(() => flashMark(at))
  }

  function byline(it) {
    const parts = []
    if (it.author) parts.push(h('span', it.author))
    if (it.published) { const d = Date.parse(it.published); if (d) parts.push(h('span', new Date(d).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }))) }
    parts.push(h('span', 'Saved ' + when(it.saved) + (it.via === 'claude' ? ' by Claude' : '')))
    const out = []
    parts.forEach((p, i) => { if (i) out.push(h('i.dot')); out.push(p) })
    return h('div.a-by', out)
  }

  const noteBox = (note) => h('div.a-note', ic('notebookPen', 16, 2), h('div', note))

  function original(message, retry) {
    return h('div.a-orig', h('b', retry ? 'This one couldn’t be made readable' : 'Read it on the site'), h('div', message),
      h('div.btns',
        h('a.btn.primary', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, ic('externalLink', 17, 2), 'Open the original'),
        retry ? h('button.btn', { type: 'button', onclick: () => refetch() }, ic('refreshCw', 17, 2), 'Try again') : null))
  }

  function summaryBox(it) {
    if (!it.summary || !it.summary.length) return null
    return h('div.a-sum', h('div.a-sum-h', ic('sparkles', 13, 2), 'Summary'), h('ul', it.summary.map((p) => h('li', p))))
  }

  function ending(it) {
    const list = onNext ? onNext(it.id, true) : null
    const next = list && list.id !== it.id ? list : null
    return h('div.a-end',
      h('div.ornament', '· · ·'),
      h('div.a-end-btns',
        it.state === 'archived'
          ? h('button.btn', { type: 'button', onclick: () => toggleArchive() }, ic('rotateCcw', 17, 2), 'Back to the reading list')
          : h('button.btn.primary', { type: 'button', onclick: () => toggleArchive(true) }, ic('check', 17, 2.4), 'Finished, archive it'),
        h('button.btn', { type: 'button', onclick: () => toggleFav() }, it.fav ? starFill(16) : ic('star', 17, 2), it.fav ? 'Favourite' : 'Favourite')),
      next ? h('small', 'Up next: ', h('button.btn.plain.small', { type: 'button', style: { 'text-decoration': 'underline', padding: '0 2px', height: 'auto' }, onclick: () => go('/read/' + next.id) }, next.title || next.host)) : null)
  }

  function drawBar() {
    if (!item) return
    title.textContent = item.title || item.host
    favBtn.classList.toggle('is-on', !!item.fav)
    favBtn.classList.toggle('is-fav', !!item.fav)
    favBtn.setAttribute('aria-pressed', String(!!item.fav))
    archBtn.setAttribute('aria-label', item.state === 'archived' ? 'Move back to the reading list' : 'Archive')
    archBtn.title = item.state === 'archived' ? 'Back to the reading list (E)' : 'Archive (E)'
    fill(archBtn, ic(item.state === 'archived' ? 'rotateCcw' : 'archive', 20, 1.9))
    const readable = item.status === 'ready'
    listenBtn.hidden = !readable || !('speechSynthesis' in window)
    sumBtn.hidden = !readable || (item.words || 0) < 120
    aaBtn.hidden = !readable
  }

  /* ---- Scrolling and progress --------------------------------------------------------------- */

  function onScroll() {
    if (!item) return
    const max = panel.scrollHeight - panel.clientHeight
    const f = max > 40 ? Math.min(1, panel.scrollTop / max) : (item.status === 'ready' ? 1 : 0)
    progBar.style.transform = `scaleX(${f})`
    el.classList.toggle('is-scrolled', panel.scrollTop > 110)
    if (!restoring && item.status === 'ready') progress(item.id, f)
  }
  panel.addEventListener('scroll', onScroll, { passive: true })

  function jump(id) {
    const target = body && body.querySelector('#' + CSS.escape(id))
    if (!target) return
    const p = panel.getBoundingClientRect()
    panel.scrollBy({ top: target.getBoundingClientRect().top - p.top - 80, behavior: reduced() ? 'auto' : 'smooth' })
  }

  /* ---- Actions ---------------------------------------------------------------------------------- */

  async function toggleFav() {
    if (!item) return
    haptic()
    const on = !item.fav
    try { await update(item.id, { fav: on }); toast(on ? 'Added to Favourites' : 'Removed from Favourites') } catch (e) { failure(e) }
  }

  async function toggleArchive(finished = false) {
    if (!item) return
    haptic(12)
    const id = item.id
    const was = item.state
    const to = was === 'archived' ? 'unread' : 'archived'
    const next = to === 'archived' && onNext ? onNext(id) : null
    try {
      await update(id, to === 'archived' ? { state: to, progress: finished ? 1 : item.progress } : { state: to })
      toast(to === 'archived' ? 'Archived' : 'Back on your reading list', { action: { label: 'Undo', onclick: () => update(id, { state: was }).catch(failure) } })
      if (to === 'archived') {
        if (next && wide()) go('/read/' + next.id, { replace: true })
        else onClose()
      }
    } catch (e) { failure(e) }
  }

  async function refetch() {
    if (!item) return
    const id = item.id
    const mine = ++token
    lib.items.set(id, { ...item, status: 'pending' })
    item = lib.items.get(id)
    try { await draw(mine) } catch (e) { failure(e) }
  }

  function more() {
    if (!item) return
    const it = item
    const canShare = !!navigator.share && !wide()
    menu(moreBtn, [
      !wide() && it.status === 'ready' && (it.words || 0) >= 120 ? { label: it.summary ? 'Summary' : 'Summarise', icon: 'sparkles', onclick: () => summary() } : null,
      { label: 'Open the original', icon: 'externalLink', onclick: () => window.open(it.url, '_blank', 'noopener') },
      canShare ? { label: 'Share…', icon: 'share', onclick: () => navigator.share({ title: it.title, url: it.url }).catch(() => {}) } : { label: 'Copy link', icon: 'link', onclick: () => copyText(it.url, 'Link copied') },
      { label: 'Tags and note…', icon: 'tag', onclick: () => editTags(it.id) },
      it.status === 'ready' ? { label: 'Fetch the article again', icon: 'refreshCw', onclick: () => refetch() } : null,
      'sep',
      { label: 'Delete', icon: 'trash', danger: true, onclick: () => deleteItem(it.id) }
    ], { align: 'end' })
  }

  async function deleteItem(id) {
    const it = lib.items.get(id)
    try {
      await remove(id)
      onClose()
      toast('Deleted ' + (it.title ? '“' + (it.title.length > 40 ? it.title.slice(0, 38) + '…' : it.title) + '”' : ''), { kind: 'info' })
    } catch (e) { failure(e) }
  }

  /* ---- Text settings ------------------------------------------------------------------------------ */

  function applySettings() {
    el.classList.toggle('is-paper', !!opts.paper)
    if (!art) return
    art.classList.toggle('is-sans', opts.font === 'sans')
    art.style.setProperty('--size', SIZES[opts.size] + 'px')
    art.style.setProperty('--measure', WIDTHS[opts.width] + 'px')
  }

  let aaBox = null
  function textSettings() {
    if (aaBox) { closePops(); return }
    closeMenus()
    const keepAt = panel.scrollTop / Math.max(1, panel.scrollHeight - panel.clientHeight)
    const set = (change) => {
      Object.assign(opts, change)
      keep(opts)
      applySettings()
      panel.scrollTop = keepAt * (panel.scrollHeight - panel.clientHeight)
      draw2()
    }
    const box = h('div.aa', { role: 'dialog', 'aria-label': 'Text settings' })
    const draw2 = () => fill(box,
      h('div.aa-row',
        h('button.serif' + (opts.font === 'serif' ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(opts.font === 'serif'), onclick: () => set({ font: 'serif' }) }, 'Newsreader'),
        h('button' + (opts.font === 'sans' ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(opts.font === 'sans'), onclick: () => set({ font: 'sans' }) }, 'Inter')),
      h('div.aa-size',
        h('button', { type: 'button', 'aria-label': 'Smaller text', disabled: opts.size === 0, onclick: () => set({ size: Math.max(0, opts.size - 1) }), style: { 'font-size': '13px' } }, 'A'),
        h('div.dots', SIZES.map((_, i) => h('i' + (i === opts.size ? '.is-on' : '')))),
        h('button', { type: 'button', 'aria-label': 'Larger text', disabled: opts.size === SIZES.length - 1, onclick: () => set({ size: Math.min(SIZES.length - 1, opts.size + 1) }), style: { 'font-size': '19px' } }, 'A')),
      wide() ? h('div.aa-row', Object.keys(WIDTHS).map((w) => h('button' + (opts.width === w ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(opts.width === w), onclick: () => set({ width: w }) }, w[0].toUpperCase() + w.slice(1)))) : null,
      h('div.aa-row',
        h('button' + (!opts.paper ? '.is-on' : ''), { type: 'button', 'aria-label': 'Plain page', title: 'Plain', 'aria-pressed': String(!opts.paper), onclick: () => set({ paper: false }) }, h('span.tone', { style: { background: 'var(--surface)' } })),
        h('button' + (opts.paper ? '.is-on' : ''), { type: 'button', 'aria-label': 'Paper', title: 'Paper', 'aria-pressed': String(!!opts.paper), onclick: () => set({ paper: true }) }, h('span.tone', { style: { background: 'var(--paper)' } }))))
    draw2()
    document.body.append(box)
    const r = aaBtn.getBoundingClientRect()
    box.style.top = r.bottom + 8 + 'px'
    box.style.left = Math.max(12, Math.min(innerWidth - box.offsetWidth - 12, r.right - box.offsetWidth + 8)) + 'px'
    aaBox = box
    const away = (e) => {
      if (e.type === 'keydown') { if (e.key === 'Escape') closePops(); return }
      if (box.contains(e.target) || aaBtn.contains(e.target)) return
      closePops()
    }
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', away, true) })
    box.cleanup = () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', away, true) }
  }

  /* ---- Highlights -------------------------------------------------------------------------------------- */

  // Text nodes of the article body, in order, with where each starts in the whole text.
  function textMap() {
    const nodes = []
    let at = 0
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ n, at }); at += n.nodeValue.length }
    return { nodes, text: nodes.map((x) => x.n.nodeValue).join('') }
  }

  function offsetOf(map, node, offset) {
    if (node.nodeType !== 3) {
      // A boundary between elements: the first text node at or after it.
      const child = node.childNodes[offset]
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
      walker.currentNode = child || node
      let t = child && child.nodeType === 3 ? child : walker.nextNode()
      if (!t) return map.text.length
      const hit = map.nodes.find((x) => x.n === t)
      return hit ? hit.at : map.text.length
    }
    const hit = map.nodes.find((x) => x.n === node)
    return hit ? hit.at + offset : -1
  }

  // Where a highlight is now: its stored place if the words still match, or else the closest
  // place where the same words appear with the same text around them.
  function locate(map, m) {
    if (map.text.slice(m.start, m.end) === m.quote) return [m.start, m.end]
    let best = -1
    let bestScore = -1
    for (let i = map.text.indexOf(m.quote); i >= 0; i = map.text.indexOf(m.quote, i + 1)) {
      let score = 0
      if (m.prefix && map.text.slice(Math.max(0, i - m.prefix.length), i).endsWith(m.prefix.slice(-12))) score += 2
      if (m.suffix && map.text.slice(i + m.quote.length).startsWith(m.suffix.slice(0, 12))) score += 2
      score -= Math.abs(i - m.start) / 1e6
      if (score > bestScore) { bestScore = score; best = i }
    }
    return best < 0 ? null : [best, best + m.quote.length]
  }

  function wrap(map, start, end, m) {
    const made = []
    for (const { n, at } of map.nodes) {
      const len = n.nodeValue.length
      if (at + len <= start || at >= end) continue
      if (!n.nodeValue.trim() && n.parentNode && /^(UL|OL|TABLE|TBODY|TR)$/.test(n.parentNode.nodeName)) continue
      let node = n
      const from = Math.max(0, start - at)
      const to = Math.min(len, end - at)
      if (to < len) node.splitText(to)
      if (from > 0) node = node.splitText(from)
      const mark = h('mark.hl' + (m.note ? '.has-note' : ''), { 'data-id': m.id, title: m.note || null })
      node.parentNode.insertBefore(mark, node)
      mark.append(node)
      made.push(mark)
    }
    return made
  }

  function paintMarks() {
    if (!body) return
    for (const mk of [...body.querySelectorAll('mark.hl')]) mk.replaceWith(...mk.childNodes)
    body.normalize()
    for (const m of [...marks].sort((a, b) => b.start - a.start)) {
      const map = textMap()
      const place = locate(map, m)
      if (place) wrap(map, place[0], place[1], m)
    }
  }

  function flashMark(id) {
    const first = body && body.querySelector(`mark.hl[data-id="${CSS.escape(id)}"]`)
    if (!first) return
    const p = panel.getBoundingClientRect()
    panel.scrollBy({ top: first.getBoundingClientRect().top - p.top - p.height / 3, behavior: 'auto' })
    for (const mk of body.querySelectorAll(`mark.hl[data-id="${CSS.escape(id)}"]`)) { mk.classList.remove('is-flash'); void mk.offsetWidth; mk.classList.add('is-flash') }
  }

  function selectionInBody() {
    const sel = getSelection()
    if (!body || !sel || sel.isCollapsed || !sel.rangeCount) return null
    const range = sel.getRangeAt(0)
    if (!body.contains(range.commonAncestorContainer)) return null
    const quote = range.toString()
    if (!quote.trim()) return null
    return range
  }

  async function highlight(withNote = false) {
    const range = selectionInBody()
    if (!range || !item) return
    const map = textMap()
    let start = offsetOf(map, range.startContainer, range.startOffset)
    let end = offsetOf(map, range.endContainer, range.endOffset)
    if (start < 0 || end <= start) return
    // Trim spaces off the ends so the highlight sits on the words.
    while (start < end && /\s/.test(map.text[start])) start++
    while (end > start && /\s/.test(map.text[end - 1])) end--
    const quote = map.text.slice(start, end)
    if (quote.length > 5000) { toast('Highlight a few paragraphs at most.', { kind: 'bad' }); return }
    getSelection().removeAllRanges()
    closePops()
    const temp = { id: 'tmp-' + Date.now(), quote, start, end, note: '' }
    wrap(map, start, end, temp)
    haptic(10)
    const id = item.id
    try {
      const saved = await addMark(id, { quote, start, end, prefix: map.text.slice(Math.max(0, start - 48), start), suffix: map.text.slice(end, end + 48) })
      if (!item || item.id !== id) return
      for (const mk of body.querySelectorAll(`mark.hl[data-id="${temp.id}"]`)) mk.dataset.id = saved.id
      marks = lib.marks.get(id) || [...marks, saved]
      if (withNote) editNote(saved)
    } catch (e) {
      failure(e)
      for (const mk of body.querySelectorAll(`mark.hl[data-id="${temp.id}"]`)) mk.replaceWith(...mk.childNodes)
    }
  }

  async function editNote(m) {
    let input
    const note = await sheet({
      title: m.note ? 'Edit note' : 'Add a note',
      done: 'Save',
      onDone: (close) => close(input.value.trim()),
      body: () => {
        input = h('textarea.field', { placeholder: 'What’s worth remembering here?', 'aria-label': 'Note', maxlength: '4000' })
        input.value = m.note || ''
        requestAnimationFrame(() => input.focus())
        return [h('div.hl-card', { style: { cursor: 'default' } }, h('q', h('span', m.quote.length > 280 ? m.quote.slice(0, 278) + '…' : m.quote))), input]
      }
    })
    if (note === undefined || note === (m.note || '')) return
    try {
      const after = await noteMark(item.id, m.id, note)
      marks = marks.map((x) => (x.id === m.id ? after : x))
      for (const mk of body.querySelectorAll(`mark.hl[data-id="${CSS.escape(m.id)}"]`)) { mk.classList.toggle('has-note', !!note); mk.title = note }
      toast(note ? 'Note saved' : 'Note removed')
    } catch (e) { failure(e) }
  }

  // The little bar over a selection or a highlight.
  let pop = null
  function closePops() {
    if (pop) { pop.remove(); pop = null }
    if (aaBox) { aaBox.cleanup(); aaBox.remove(); aaBox = null }
  }
  function placePop(box, rect) {
    document.body.append(box)
    const w = box.offsetWidth
    const left = Math.max(10, Math.min(innerWidth - w - 10, rect.left + rect.width / 2 - w / 2))
    let top = rect.top - box.offsetHeight - 10
    if (top < 70) top = rect.bottom + 10
    box.style.left = left + 'px'
    box.style.top = top + 'px'
  }

  function selectionPop() {
    const range = selectionInBody()
    if (pop && pop.dataset.kind === 'sel') { pop.remove(); pop = null }
    if (!range) return
    const rect = range.getBoundingClientRect()
    pop = h('div.pop', { role: 'toolbar', 'aria-label': 'Selection', 'data-kind': 'sel' },
      h('button', { type: 'button', onpointerdown: (e) => e.preventDefault(), onclick: () => highlight(false) }, h('span.sw'), 'Highlight'),
      h('button', { type: 'button', onpointerdown: (e) => e.preventDefault(), onclick: () => highlight(true) }, ic('notebookPen', 16, 2), 'Note'),
      h('button', { type: 'button', onpointerdown: (e) => e.preventDefault(), onclick: () => { copyText(range.toString().trim(), 'Copied'); closePops() } }, ic('copy', 16, 2), 'Copy'))
    placePop(pop, rect)
  }

  function markPop(mk) {
    closePops()
    const m = marks.find((x) => x.id === mk.dataset.id)
    if (!m) return
    pop = h('div.pop', { role: 'toolbar', 'aria-label': 'Highlight', 'data-kind': 'mark' },
      h('button', { type: 'button', onclick: () => { closePops(); editNote(m) } }, ic('notebookPen', 16, 2), m.note ? 'Edit note' : 'Note'),
      h('button', { type: 'button', onclick: () => { copyText(m.quote, 'Copied'); closePops() } }, ic('copy', 16, 2), 'Copy'),
      h('button', { type: 'button', onclick: async () => { closePops(); const { shareHighlight } = await import('./share.js'); shareHighlight(item, m) } }, ic(m.share ? 'link' : 'share', 16, 2), m.share ? 'Shared' : 'Share'),
      h('button.danger', { type: 'button', onclick: async () => {
        closePops()
        const id = item.id
        for (const x of body.querySelectorAll(`mark.hl[data-id="${CSS.escape(m.id)}"]`)) x.replaceWith(...x.childNodes)
        body.normalize()
        marks = marks.filter((x) => x.id !== m.id)
        try { await removeMark(id, m.id); toast('Highlight removed') } catch (e) { failure(e); marks = await marksFor(id, { fresh: true }); paintMarks() }
      } }, ic('trash', 16, 2), 'Remove'))
    placePop(pop, mk.getBoundingClientRect())
  }

  let selTimer = 0
  document.addEventListener('selectionchange', () => {
    if (!el.isConnected || !item) return
    clearTimeout(selTimer)
    selTimer = setTimeout(selectionPop, wide() ? 60 : 380)
  })
  panel.addEventListener('click', (e) => {
    const mk = e.target.closest('mark.hl')
    if (mk && !selectionInBody()) { e.preventDefault(); markPop(mk) }
  })
  panel.addEventListener('scroll', () => { if (pop && pop.dataset.kind === 'mark') closePops() }, { passive: true })

  /* ---- Summary ------------------------------------------------------------------------------------- */

  async function summary() {
    if (!item || item.status !== 'ready') return
    const existing = art && art.querySelector('.a-sum')
    if (existing) { panel.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return }
    const id = item.id
    const box = h('div.a-sum', h('div.a-sum-h', ic('sparkles', 13, 2), 'Summarising…'), h('span.shimmer'), h('span.shimmer'), h('span.shimmer'))
    const before = art && art.querySelector('.a-body')
    if (before) before.before(box)
    panel.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })
    sumBtn.disabled = true
    try {
      const points = await summarize(id)
      if (!item || item.id !== id) return
      box.replaceWith(summaryBox({ summary: points }))
    } catch (e) {
      box.remove()
      failure(e)
    } finally { sumBtn.disabled = false }
  }

  /* ---- Listening ----------------------------------------------------------------------------------- */

  async function listen() {
    if (!item || !body) return
    if (speaker) { speaker.toggle(); return }
    const { createSpeaker } = await import('./listen.js')
    speaker = createSpeaker({ body, panel, lang: item.lang, title: item.title, site: item.site || item.host, onEnd: (why) => { stopListening(); if (typeof why === 'string') toast(why, { kind: 'info' }) } })
    el.append(speaker.el)
    speaker.start()
    listenBtn.classList.add('is-on')
  }
  function stopListening() {
    if (speaker) { speaker.stop(); speaker.el.remove(); speaker = null }
    listenBtn.classList.remove('is-on')
  }

  /* ---- Tags and notes -------------------------------------------------------------------------------------- */

  async function editTags(id) {
    const it = lib.items.get(id)
    if (!it) return
    const chosen = new Set(it.tags || [])
    let input
    let noteInput
    const known = allTags().map((t) => t.tag)
    const result = await sheet({
      title: 'Tags and note',
      done: 'Save',
      onDone: (close) => {
        const typed = input.value.trim().toLowerCase().replace(/^#/, '')
        if (typed) chosen.add(typed)
        close({ tags: [...chosen], note: noteInput.value.trim() })
      },
      body: () => {
        const chips = h('div.tag-edit')
        const drawChips = () => fill(chips, [...new Set([...known, ...chosen])].map((t) => h('button.chip' + (chosen.has(t) ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(chosen.has(t)), onclick: () => { chosen.has(t) ? chosen.delete(t) : chosen.add(t); drawChips() } }, h('span.tagdot', { style: { background: tone(t), width: '7px', height: '7px', 'border-radius': '50%', display: 'inline-block' } }), t)))
        drawChips()
        input = h('input.field', { type: 'text', placeholder: 'New tag', maxlength: '32', autocapitalize: 'off', enterkeyhint: 'done', 'aria-label': 'New tag' })
        input.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && input.value.trim()) {
            e.preventDefault()
            chosen.add(input.value.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'))
            input.value = ''
            drawChips()
          }
        })
        noteInput = h('textarea.field', { placeholder: 'A note to yourself: why you saved it', maxlength: '2000', 'aria-label': 'Note' })
        noteInput.value = it.note || ''
        return [h('div.sheet-label', 'Tags'), chips, input, h('div.sheet-label', 'Note'), noteInput]
      }
    })
    if (!result) return
    try { await update(id, result); toast('Saved') } catch (e) { failure(e) }
  }

  /* ---- Keeping up with changes ------------------------------------------------------------------------- */

  on((change) => {
    if (!item) return
    if (change.removed === item.id) { item = null; onClose(); return }
    if (change.item !== item.id || change.progressOnly) return
    const now = lib.items.get(item.id)
    if (!now) return
    const before = item
    item = now
    drawBar()
    if (change.working === false && before.status !== now.status) return
    if (change.remote && now.cv !== before.cv && now.status === 'ready' && !isWorking(now.id)) { const mine = ++token; draw(mine) }
    else if (art && (before.fav !== now.fav || before.state !== now.state)) { const end = art.querySelector('.a-end'); if (end) end.replaceWith(ending(now)) }
    if (change.marks === item.id || (change.remote && now.marks !== before.marks)) marksFor(item.id, { fresh: true }).then((m) => { if (item && item.id === now.id) { marks = m; paintMarks() } }).catch(() => {})
  })

  function close() {
    stopListening()
    closePops()
    if (item && item.status === 'ready') progress(item.id, item.progress || 0, { now: true })
    item = null
    token++
  }

  return {
    el, open, close,
    get current() { return item },
    highlight: () => highlight(false),
    listen,
    archive: () => toggleArchive(),
    favourite: () => toggleFav(),
    tags: () => item && editTags(item.id),
    closePops,
    panel
  }
}
