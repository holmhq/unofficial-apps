// The daily review: a few highlights, one at a time, on paper. Next keeps one in mind and
// sends it away for a while; a star brings it back more often; the menu sends it sooner,
// later or never, and tunes how often its book or article comes up at all. A finished
// review adds a day to the streak.
//
// The same screen reviews one tag or one source on request, without touching the streak.

import { h, ic, fill, toast, menu, haptic, reduced, wide, sheet, segmented } from '../ui.js'
import { lib, reviewSet, keptReview, reviewed, reviewSize, editMark, tone, update, localDay } from '../store.js'
import { favicon, plural } from '../bits.js'
import { go, failure } from '../shell.js'

const SIZES = [3, 5, 10, 15]

let open = null

export async function openReview({ tag = '', item = '', title = '', again = false } = {}) {
  if (open) return
  const themed = !!(tag || item)
  let data = themed ? null : keptReview()
  let cards = data ? data.cards : []
  let done = new Set(data ? data.done : [])
  let at = 0
  let busy = false

  const closeBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => close() }, ic('x', 22, 2))
  const count = h('small.rv-count')
  const moreBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'More', title: 'More', 'aria-haspopup': 'menu', onclick: () => more() }, ic('ellipsis', 21, 2.1))
  const heading = h('div.rv-head', h('b', themed ? (tag ? '#' + tag : title || 'Review') : 'Daily review'), count)
  const top = h('div.rv-top', closeBtn, heading, moreBtn)
  const prog = h('div.rv-prog', { 'aria-hidden': 'true' })
  const stage = h('div.rv-stage')
  const favBtn = h('button.icon-btn.rv-act', { type: 'button', 'aria-label': 'Favourite', title: 'Favourite (F)', onclick: () => toggleFav() }, ic('star', 22, 1.9))
  const tagBtn = h('button.icon-btn.rv-act', { type: 'button', 'aria-label': 'Tags', title: 'Tags (T)', onclick: () => editTags() }, ic('tag', 21, 1.9))
  const noteBtn = h('button.icon-btn.rv-act', { type: 'button', 'aria-label': 'Note', title: 'Note (N)', onclick: () => editNote() }, ic('notebookPen', 21, 1.9))
  const backBtn = h('button.icon-btn.rv-act', { type: 'button', 'aria-label': 'Previous', title: 'Previous (←)', onclick: () => move(-1) }, ic('arrowLeft', 21, 2))
  const nextBtn = h('button.btn.primary.large.rv-next', { type: 'button', onclick: () => keep() }, h('span', 'Next'), ic('arrowRight', 19, 2.3))
  const bar = h('div.rv-bar', h('div.rv-tools', backBtn, favBtn, tagBtn, noteBtn), nextBtn)
  const box = h('div.review', { role: 'dialog', 'aria-modal': 'true', 'aria-label': themed ? 'Review' : 'Daily review' }, top, prog, stage, bar)
  document.body.append(box)
  open = box
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-in')))
  const previous = document.activeElement

  function close() {
    if (!open) return
    open = null
    document.removeEventListener('keydown', onKey, true)
    box.classList.remove('is-in')
    setTimeout(() => box.remove(), reduced() ? 0 : 420)
    if (previous && previous.focus && document.contains(previous)) previous.focus({ preventScroll: true })
  }

  const current = () => cards[at] || null

  /* ---- Drawing ----------------------------------------------------------------------------------- */

  function cover(src) {
    if (src.kind === 'notes' || src.kind === 'book') {
      return src.image
        ? h('div.rv-cover', h('img', { src: src.image + '/t', alt: '', onerror: (e) => e.target.parentNode.replaceWith(spine(src)) }))
        : spine(src)
    }
    return src.image ? h('div.rv-thumb', h('img', { src: src.image + '/t', alt: '', onerror: (e) => e.target.parentNode.replaceWith(favicon(src, 34)) })) : favicon(src, 34)
  }
  // A book without a picture: a small cloth cover with its initial.
  const spine = (src) => h('div.rv-cover.is-plain', { style: { '--cloth': tone(src.title || 'book') } }, h('span', (src.title || '?').trim().charAt(0).toUpperCase()))

  function size(quote) {
    const n = quote.length
    return n < 120 ? 'is-l' : n < 300 ? 'is-m' : n < 700 ? 'is-s' : 'is-xs'
  }

  function cardEl(c) {
    const { mark: m, item: src } = c
    return h('article.rv-card', { 'data-id': m.id },
      h('button.rv-src', { type: 'button', title: src.url || src.title, onclick: () => openSource(c) },
        cover(src),
        h('div.grow', h('b', src.title), h('small', [src.author, src.kind === 'article' ? (src.site || src.host) : ''].filter(Boolean).join(' · ') || (src.kind === 'notes' ? 'Book' : src.host)))),
      h('blockquote.rv-quote.' + size(m.quote), h('span', m.quote.replace(/\s+\n/g, '\n').trim())),
      m.note ? h('div.rv-note', ic('notebookPen', 15, 2), h('div', m.note)) : null,
      m.tags && m.tags.length || m.loc ? h('div.rv-meta',
        (m.tags || []).map((t) => h('span.rv-tag', h('i', { style: { background: tone(t) } }), t)),
        m.loc ? h('span.rv-loc', m.loc) : null) : null)
  }

  function draw(direction = 0) {
    fill(prog, cards.map((c, n) => h('i' + (done.has(c.mark.id) ? '.is-done' : '') + (n === at ? '.is-now' : ''))))
    prog.hidden = cards.length < 2
    const c = current()
    if (!c) { finish(); return }
    bar.hidden = false
    moreBtn.hidden = false
    count.textContent = `${at + 1} of ${cards.length}`
    backBtn.disabled = at === 0
    favBtn.classList.toggle('is-on', !!c.mark.fav)
    favBtn.classList.add('is-fav')
    favBtn.setAttribute('aria-pressed', String(!!c.mark.fav))
    noteBtn.classList.toggle('is-on', !!c.mark.note)
    nextBtn.firstChild.textContent = at === cards.length - 1 ? 'Done' : 'Next'
    const el = cardEl(c)
    // Everything on the stage leaves, including a card still arriving from a quick press before.
    const leaving = [...stage.children].filter((x) => !x.classList.contains('is-out-l') && !x.classList.contains('is-out-r'))
    if (leaving.length && direction && !reduced()) {
      for (const old of leaving) {
        old.classList.remove('is-in-r', 'is-in-l')
        old.classList.add(direction > 0 ? 'is-out-l' : 'is-out-r')
        old.addEventListener('animationend', () => old.remove(), { once: true })
        setTimeout(() => old.remove(), 500)
      }
      el.classList.add(direction > 0 ? 'is-in-r' : 'is-in-l')
      stage.append(el)
    } else fill(stage, el)
    stage.scrollTop = 0
    swipe(el)
  }

  function finish() {
    bar.hidden = true
    moreBtn.hidden = true
    count.textContent = cards.length ? (themed ? plural(cards.length, 'highlight') : 'Done') : ''
    fill(prog, cards.map(() => h('i.is-done')))
    for (const x of stage.querySelectorAll('.is-out-l, .is-out-r')) x.remove()
    if (!cards.length) {
      fill(stage, h('div.rv-empty',
        h('div.rv-flame.is-quiet', ic('highlighter', 30, 1.8)),
        h('h2', themed ? 'Nothing to review here' : 'Nothing to review today'),
        h('p', themed ? 'There are no highlights to go over in this one.' : 'Highlights come back here a few days after you make them. Highlight something in an article, or bring in your Kindle highlights.'),
        h('button.btn.primary.large', { type: 'button', onclick: () => close() }, 'Close')))
      return
    }
    const s = (data && data.streak) || { n: 0 }
    const picker = segmented(SIZES.map((n) => ({ value: n, label: String(n) })), (data && data.n) || 5, async (n) => {
      try { data = await reviewSize(n); toast(`${n} highlights a day from tomorrow`) } catch (e) { failure(e) }
    }, { label: 'Highlights a day' })
    fill(stage, h('div.rv-done',
      themed ? h('div.rv-flame.is-quiet', ic('check', 30, 2.2)) : h('div.rv-flame', ic('flame', 30, 2), s.n ? h('b', String(s.n)) : null),
      h('h2', themed ? 'All gone over' : 'Review done'),
      h('p', themed
        ? `You went over ${plural(cards.length, 'highlight')}. They’ll come back in your daily review when they’re due.`
        : s.n > 1 ? `${s.n} days in a row. The next review is ready tomorrow.` : 'Day one. The next review is ready tomorrow.'),
      themed ? null : h('div.rv-size', h('span', 'Highlights a day'), picker),
      h('button.btn.primary.large', { type: 'button', autofocus: true, onclick: () => close() }, 'Done')))
    if (!themed && s.n && !reduced()) haptic(18)
  }

  /* ---- Acting on a card ----------------------------------------------------------------------------- */

  async function act(action, { advance = true } = {}) {
    const c = current()
    if (!c || busy) return
    if (advance) {
      done.add(c.mark.id)
      at++
      draw(1)
    }
    try {
      const r = await reviewed(c.mark.id, action)
      c.mark = r.mark
      if (data) data.streak = r.streak
      if (!current()) finish()
    } catch (e) { failure(e) }
  }

  // Looking through a finished review again moves on without sending anything away again.
  const keep = () => (again && done.has((current() || { mark: {} }).mark.id) ? move(1) : act('keep'))
  function move(d) {
    const next = at + d
    if (next < 0 || next > cards.length) return
    at = next
    draw(d)
  }

  async function toggleFav() {
    const c = current()
    if (!c) return
    const on = !c.mark.fav
    c.mark = { ...c.mark, fav: on }
    favBtn.classList.toggle('is-on', on)
    favBtn.setAttribute('aria-pressed', String(on))
    if (on && !reduced()) { favBtn.classList.remove('is-pop'); void favBtn.offsetWidth; favBtn.classList.add('is-pop') }
    haptic(10)
    try { c.mark = await editMark(c.mark.item, c.mark.id, { fav: on }); lib.highlights = null } catch (e) { failure(e) }
  }

  async function editNote() {
    const c = current()
    if (!c) return
    let field
    const value = await sheet({
      title: c.mark.note ? 'Edit note' : 'Add a note',
      done: 'Save',
      onDone: (close) => close(field.value.trim()),
      body: () => {
        field = h('textarea.field.rv-note-field', { placeholder: 'What it makes you think of', maxlength: '4000', autofocus: true, 'aria-label': 'Note' })
        field.value = c.mark.note || ''
        return [h('blockquote.sheet-quote', c.mark.quote.length > 220 ? c.mark.quote.slice(0, 210).trim() + '…' : c.mark.quote), field]
      }
    })
    if (value === undefined || value === true) return
    try {
      c.mark = await editMark(c.mark.item, c.mark.id, { note: value })
      lib.highlights = null
      redrawCard()
    } catch (e) { failure(e) }
  }

  async function editTags() {
    const c = current()
    if (!c) return
    const tags = await tagSheet(c.mark.tags || [], c.mark.quote)
    if (!tags) return
    try {
      c.mark = await editMark(c.mark.item, c.mark.id, { tags })
      lib.highlights = null
      redrawCard()
    } catch (e) { failure(e) }
  }

  function redrawCard() {
    const c = current()
    const old = stage.querySelector('.rv-card:not(.is-out-l):not(.is-out-r)')
    if (c && old) { const el = cardEl(c); old.replaceWith(el); swipe(el) }
    noteBtn.classList.toggle('is-on', !!(c && c.mark.note))
  }

  function openSource(c) {
    const it = lib.items.get(c.item.id)
    if (!it) return
    close()
    go('/read/' + it.id + (c.mark.end ? '?at=' + c.mark.id : ''))
  }

  function more() {
    const c = current()
    const items = []
    if (c) {
      items.push(
        { label: 'Show again sooner', icon: 'chevronsUp', onclick: () => act('sooner').then(() => toast('It’ll come back in a few days')) },
        { label: 'Show again much later', icon: 'chevronsDown', onclick: () => act('later').then(() => toast('It’ll come back in a few months')) },
        { label: 'Don’t show this again', icon: 'eyeOff', onclick: () => discard(c) },
        'sep',
        { label: c.item.kind === 'article' ? 'How often this article comes up…' : 'How often this book comes up…', icon: 'repeat', onclick: () => frequency(c) },
        lib.items.get(c.item.id) ? { label: c.item.kind === 'notes' ? 'Open the book' : 'Open where it was highlighted', icon: 'bookOpen', onclick: () => openSource(c) } : null
      )
    }
    if (!themed && data && (!c || items.length)) {
      if (items.length) items.push('sep')
      items.push({ label: 'Highlights a day…', icon: 'calendarCheck', onclick: () => sizeSheet() })
    }
    menu(moreBtn, items, { align: 'end' })
  }

  async function discard(c) {
    await act('discard')
    toast('It won’t come up in reviews again', { kind: 'info', action: { label: 'Undo', onclick: async () => {
      try { await reviewed(c.mark.id, 'restore'); done.delete(c.mark.id); at = Math.max(0, cards.indexOf(c)); draw(-1) } catch (e) { failure(e) }
    } } })
  }

  async function frequency(c) {
    const it = lib.items.get(c.item.id)
    if (!it) return
    const pick = await sheet({
      title: c.item.kind === 'article' ? 'This article' : 'This book',
      cancel: null,
      done: 'Done',
      body: (close) => {
        const seg = segmented([
          { value: 'never', label: 'Never' }, { value: 'less', label: 'Less' }, { value: 'normal', label: 'Normal' }, { value: 'more', label: 'More' }
        ], it.freq || 'normal', (v) => setTimeout(() => close(v), 200), { label: 'How often' })
        return [h('p.sheet-note', `How often highlights from “${c.item.title}” come up in your daily review.`), seg]
      }
    })
    if (!pick || pick === true || pick === it.freq) return
    try {
      await update(it.id, { freq: pick })
      c.item.freq = pick
      toast(pick === 'never' ? 'It won’t come up in reviews' : pick === 'more' ? 'It’ll come up more often' : pick === 'less' ? 'It’ll come up less often' : 'Back to the usual')
    } catch (e) { failure(e) }
  }

  async function sizeSheet() {
    const n = await sheet({
      title: 'Highlights a day',
      cancel: null,
      done: 'Done',
      body: (close) => [h('p.sheet-note', 'How many highlights each daily review brings back.'), segmented(SIZES.map((x) => ({ value: x, label: String(x) })), (data && data.n) || 5, (v) => setTimeout(() => close(v), 200), { label: 'Highlights a day' })]
    })
    if (!SIZES.includes(n)) return
    try {
      data = await reviewSize(n)
      cards = data.cards
      done = new Set(data.done)
      at = Math.max(0, cards.findIndex((c) => !done.has(c.mark.id)))
      if (at < 0 || done.size >= cards.length) at = cards.length
      draw()
    } catch (e) { failure(e) }
  }

  /* ---- Gestures and keys ---------------------------------------------------------------------------- */

  function swipe(el) {
    let x0 = 0, y0 = 0, dx = 0, mode = null, pid = null
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button')) return
      x0 = e.clientX; y0 = e.clientY; dx = 0; mode = null; pid = e.pointerId
    })
    el.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return
      const mx = e.clientX - x0
      if (!mode) {
        if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(e.clientY - y0) * 1.3) { mode = 'x'; el.setPointerCapture(e.pointerId); el.style.transition = 'none' }
        else if (Math.abs(e.clientY - y0) > 12) { pid = null; return }
        else return
      }
      dx = mx
      el.style.transform = `translate3d(${dx}px,0,0) rotate(${dx / 40}deg)`
    })
    const end = (e) => {
      if (pid !== e.pointerId) return
      pid = null
      if (mode !== 'x') return
      el.style.transition = ''
      if (dx < -80) { haptic(12); el.style.transform = ''; keep() }
      else if (dx > 80 && at > 0) { el.style.transform = ''; move(-1) }
      else el.style.transform = ''
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }

  function onKey(e) {
    if (document.querySelector('.layer.open')) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    if (k === 'Escape') { e.preventDefault(); close(); return }
    if (!current()) { if (k === 'Enter') { e.preventDefault(); close() } return }
    if (k === 'ArrowRight' || k === ' ' || k === 'Enter') { if (e.target.closest && e.target.closest('button') && k !== 'ArrowRight') return; e.preventDefault(); keep() }
    else if (k === 'ArrowLeft') { e.preventDefault(); move(-1) }
    else if (k === 'f' || k === 'F') { e.preventDefault(); toggleFav() }
    else if (k === 't' || k === 'T') { e.preventDefault(); editTags() }
    else if (k === 'n' || k === 'N') { e.preventDefault(); editNote() }
    else if (k === 'd' || k === 'D') { e.preventDefault(); discard(current()) }
  }
  document.addEventListener('keydown', onKey, true)

  /* ---- Loading ----------------------------------------------------------------------------------------- */

  function start() {
    at = again ? 0 : cards.findIndex((c) => !done.has(c.mark.id))
    if (at < 0) at = cards.length
    draw()
  }

  if (data) start()
  else fill(stage, h('div.rv-card.is-loading', h('i'), h('i'), h('i')))
  try {
    const fresh = await reviewSet({ tag, item })
    if (!open) return
    const same = data && JSON.stringify(fresh.cards.map((c) => c.mark.id)) === JSON.stringify(cards.map((c) => c.mark.id))
    data = fresh
    if (!same) { cards = fresh.cards; done = new Set(fresh.done); start() }
    else { for (const c of cards) { const f = fresh.cards.find((x) => x.mark.id === c.mark.id); if (f) { c.mark = f.mark; c.item = f.item } } if (!current()) finish() }
  } catch (e) {
    if (!data) { fill(stage, h('div.rv-empty', h('div.rv-flame.is-quiet', ic('wifiOff', 28, 1.8)), h('h2', 'The review can’t load'), h('p', e.message), h('button.btn.large', { type: 'button', onclick: () => close() }, 'Close'))); bar.hidden = true }
  }
}

// Tags for a highlight: the ones used before to tap, or a new one.
export async function tagSheet(current, quote = '') {
  const chosen = new Set(current)
  const known = new Set()
  for (const m of (lib.highlights && lib.highlights.marks) || []) for (const t of m.tags || []) known.add(t)
  for (const i of lib.items.values()) for (const t of i.tags || []) known.add(t)
  let input
  const result = await sheet({
    title: 'Tags',
    done: 'Save',
    onDone: (close) => {
      const typed = input.value.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')
      if (typed) chosen.add(typed)
      close([...chosen])
    },
    body: () => {
      const chips = h('div.tag-edit')
      const drawChips = () => fill(chips, [...new Set([...chosen, ...known])].slice(0, 40).map((t) => h('button.chip' + (chosen.has(t) ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(chosen.has(t)), onclick: () => { chosen.has(t) ? chosen.delete(t) : chosen.add(t); drawChips() } },
        h('span.tagdot', { style: { background: tone(t), width: '7px', height: '7px', 'border-radius': '50%', display: 'inline-block' } }), t)))
      drawChips()
      input = h('input.field', { type: 'text', placeholder: 'New tag', maxlength: '32', autocapitalize: 'off', enterkeyhint: 'done', 'aria-label': 'New tag', autofocus: !known.size })
      input.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && input.value.trim()) {
          e.preventDefault()
          chosen.add(input.value.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'))
          input.value = ''
          drawChips()
        }
      })
      return [quote ? h('blockquote.sheet-quote', quote.length > 160 ? quote.slice(0, 150).trim() + '…' : quote) : null, known.size || chosen.size ? chips : null, input]
    }
  })
  return Array.isArray(result) ? result : null
}

export { localDay }
