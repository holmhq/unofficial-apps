// One conversation: bubbles grouped by sender and time, a day pill that
// stays at the top while you scroll, ticks for sent and delivered, and the
// composer. A sent text flies up from the composer into place.

import { h, fill, ic, avatar, clock, dayName, full, sameDay, MIN, HOUR, wide, menu, sheet, toast, confirm, copyText, reduced, haptic } from '../ui.js'
import { ticks } from '../icons.js'
import { store, on, loadThread, loadState, addSent, emit } from '../store.js'
import { formatPhone, normalizePhone } from '../sms.js'
import { composer } from '../composer.js'
import { sound } from '../sound.js'
import { go, back, accountButton } from '../main.js'
import { label, rename, remove } from './list.js'
import * as api from '../api.js'

export function thread(params) {
  const number = normalizePhone(params.number) || params.number
  const msgs = h('div.msgs', { role: 'log', 'aria-live': 'polite' })
  const convo = h('div.convo', msgs)
  const toBottom = h('button.to-bottom', { type: 'button', 'aria-label': 'Latest texts', onclick: () => scrollDown(true) }, ic('down', 22, 2.2))
  const keyed = new Map()
  const states = new Map()
  let data = store.open.get(number) || null
  let showFor = null
  let fresh = new Set()
  let unseen = 0
  let flyFrom = null
  let destroyed = false

  const row = () => (store.threads || []).find(t => t.number === number) || { number, name: data && data.name, optedOut: data && data.optedOut }
  const others = () => (store.threads || []).reduce((n, t) => n + (t.number === number ? 0 : t.unread || 0), 0)

  const backBtn = h('button.back.only-narrow', { type: 'button', 'aria-label': 'Back to chats', onclick: back })
  const who = h('button.who', { type: 'button', onclick: details })
  const bar = h('header.bar.glass.thread-bar', backBtn, who,
    h('button.icon-btn', { type: 'button', 'aria-label': 'Details', title: 'Details', onclick: details }, ic('info', 23, 1.8)),
    h('span.only-wide', accountButton()))

  const box = composer({
    numbers: () => [number],
    draftKey: number,
    placeholder: 'Text Message',
    send: async (payload, { text, from }) => {
      // Show the text at once; swap in the server's copy when it answers.
      flyFrom = from
      const temp = { id: 'tmp' + Date.now(), dir: 'out', number, body: text, state: payload.scheduleAt ? 'scheduled' : 'queued', at: new Date().toISOString(), scheduleAt: payload.scheduleAt, sim: payload.sim }
      if (data) { data.messages.push(temp); fresh.add(temp.id); draw() }
      try {
        const result = await api.post('/api/messages', { to: [number], ...payload })
        if (data) data.messages = data.messages.filter(m => m !== temp)
        const real = result.messages.find(m => m.number === number)
        const node = keyed.get(temp.id)
        if (node && real) {
          keyed.delete(temp.id)
          keyed.set(real.id, node)
          node.dataset.id = real.id
          states.set(real.id, temp.state)
        }
        addSent(result)
        if (payload.scheduleAt) toast('Scheduled for ' + whenShort(Date.parse(payload.scheduleAt)))
      } catch (error) {
        if (data) data.messages = data.messages.filter(m => m !== temp)
        draw()
        throw error
      }
    }
  })
  box.onAllow(allowAgain)

  const el = h('div', { style: { display: 'contents' } }, bar, h('div', { style: { position: 'relative', flex: '1', 'min-height': '0', display: 'flex', 'flex-direction': 'column' } }, convo, toBottom), box.el)

  function drawBar() {
    const t = row()
    const named = Boolean(t.name)
    fill(who, avatar({ key: number, name: t.name }), h('span.t', h('b.trunc', label(t)), h('small.trunc.num', named ? formatPhone(number) : 'Add a name')))
    const n = others()
    fill(backBtn, ic('back', 28, 2.2), n ? h('span.count.num', n > 99 ? '99+' : n) : null)
  }

  /* ---- Messages ---------------------------------------------------------- */

  function draw() {
    if (!data) {
      fill(msgs, h('div.convo-start', h('span.shimmer', { style: { width: '72px', height: '72px', 'border-radius': '36px' } }), h('span.shimmer', { style: { width: '120px', height: '16px', 'margin-top': '8px' } })))
      return
    }
    const t = row()
    const nearBottom = convo.scrollHeight - convo.scrollTop - convo.clientHeight < 140
    const list = data.messages
    const items = []
    if (data.more) items.push({ key: 'older', older: true })
    else items.push({ key: 'start', start: true })
    let prev = null
    for (const m of list) {
      if (!prev || !sameDay(prev.at, m.at)) items.push({ key: 'd' + m.at.slice(0, 10) + m.id, day: m.at })
      else if (Date.parse(m.at) - Date.parse(prev.at) > HOUR) items.push({ key: 'g' + m.id, gap: m.at })
      items.push({ key: m.id, m })
      prev = m
    }
    if (t.optedOut || data.optedOut) items.push({ key: 'optout', note: `${label(t)} replied STOP. Zend won’t text this number unless you allow it again.` })

    let arrivedIn = 0
    let deliveredNow = false
    const initial = !keyed.size
    const nodes = items.map((item, i) => {
      let node = keyed.get(item.key)
      if (item.start) {
        if (!node) node = h('div.convo-start')
        fill(node, avatar({ key: number, name: t.name, size: 72 }), h('b', label(t)), h('small.num', t.name ? formatPhone(number) : 'Texts go out from your phone, on your number'))
      } else if (item.older) {
        if (!node) node = h('button.btn.small.older', { type: 'button', onclick: older }, 'Show earlier texts')
      } else if (item.day) {
        if (!node) node = h('div.day', dayName(item.day), ' ', h('span', clock(item.day)))
      } else if (item.gap) {
        if (!node) node = h('div.day', { style: { position: 'static', background: 'none', 'box-shadow': 'none', 'font-weight': '500' } }, clock(item.gap))
      } else if (item.note) {
        if (!node) node = h('div.note', item.note)
      } else {
        const m = item.m
        const before = items[i - 1] && items[i - 1].m
        const after = items[i + 1] && items[i + 1].m
        const isNew = !node
        if (!node) node = bubble(m)
        const prevState = states.get(m.id)
        if (prevState && prevState !== m.state && m.state === 'delivered') deliveredNow = true
        if (isNew && m.dir === 'in' && !initial) arrivedIn++
        states.set(m.id, m.state)
        shape(node, m, before, after)
        if (isNew && !initial && !reduced()) {
          if (m.dir === 'out' && fresh.has(m.id)) node.dataset.fly = '1'
          else node.classList.add(m.dir === 'out' ? 'enter-out' : 'enter-in')
        }
      }
      keyed.set(item.key, node)
      return node
    })
    const current = [...msgs.children]
    if (current.length !== nodes.length || current.some((n, i) => n !== nodes[i])) msgs.replaceChildren(...nodes)
    for (const [key, node] of keyed) if (!node.isConnected) keyed.delete(key)

    // Fly a just-sent text up from the composer.
    for (const node of msgs.querySelectorAll('[data-fly]')) {
      delete node.dataset.fly
      fly(node)
    }
    if (deliveredNow) sound.delivered()
    if (nearBottom || fresh.size) scrollDown(!initial)
    else if (arrivedIn) { unseen += arrivedIn; drawToBottom() }
    fresh = new Set([...fresh].filter(id => !data.messages.some(m => m.id === id)))
  }

  function bubble(m) {
    const text = h('span.text', linkify(m.body))
    const b = h('div.bubble', text, h('span.spacer', { 'aria-hidden': 'true' }), h('span.meta'))
    const node = h('div.msg', { 'data-id': m.id }, b)
    // The id is read when needed: a text shown before the server answered gets its real id later.
    b.addEventListener('click', () => {
      if (window.getSelection && String(window.getSelection()).length) return
      showFor = showFor === node.dataset.id ? null : node.dataset.id
      draw()
    })
    b.addEventListener('contextmenu', (event) => { event.preventDefault(); bubbleMenu(node.dataset.id, { x: event.clientX, y: event.clientY }) })
    let timer = null
    b.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return
      b.classList.add('pressed')
      timer = setTimeout(() => { timer = null; b.classList.remove('pressed'); haptic(14); bubbleMenu(node.dataset.id, b) }, 480)
    })
    const cancel = () => { clearTimeout(timer); timer = null; b.classList.remove('pressed') }
    b.addEventListener('pointerup', cancel)
    b.addEventListener('pointercancel', cancel)
    b.addEventListener('pointerleave', cancel)
    return node
  }

  // Classes for grouping, tails and state; the meta in the bubble; the line under it.
  function shape(node, m, before, after) {
    const joins = (a, b) => a && b && a.dir === b.dir && Date.parse(b.at) - Date.parse(a.at) < 4 * MIN && sameDay(a.at, b.at) &&
      (a.state === 'scheduled') === (b.state === 'scheduled') && (a.state === 'failed') === (b.state === 'failed')
    const cls = ['msg', m.dir]
    if (!joins(before, m)) cls.push('first')
    if (!joins(m, after)) cls.push('last')
    if (m.dir === 'out' && ['scheduled', 'failed', 'cancelled'].includes(m.state)) cls.push(m.state)
    for (const c of ['enter-out', 'enter-in']) if (node.classList.contains(c)) cls.push(c)
    node.className = cls.join(' ')
    const b = node.firstChild
    const meta = b.querySelector('.meta')
    const time = m.state === 'scheduled' && m.scheduleAt ? m.scheduleAt : m.at
    const key = `${m.state}|${time}`
    if (meta.dataset.key !== key) {
      const old = meta.querySelector('.ticks')
      const parts = [m.state === 'scheduled' ? ic('clock', 12, 2.2) : null, h('span', clock(time))]
      if (m.dir === 'out' && ['queued', 'sent', 'delivered'].includes(m.state)) {
        const t = ticks(m.state)
        // Draw the check when a text is sent; slide the second in when it lands.
        if (old && meta.dataset.key) {
          const was = meta.dataset.key.split('|')[0]
          if (m.state === 'sent' && was !== 'sent') { t.classList.add('drawing'); requestAnimationFrame(() => requestAnimationFrame(() => t.classList.remove('drawing'))) }
          if (m.state === 'delivered' && was !== 'delivered') { t.classList.remove('delivered'); requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('delivered'))) }
        }
        parts.push(t)
      }
      fill(meta, parts)
      fill(b.querySelector('.spacer'), [...meta.childNodes].map(n => n.cloneNode(true)))
      meta.dataset.key = key
      b.setAttribute('aria-label', `${m.dir === 'out' ? 'You' : 'Them'}: ${m.body}. ${spoken(m)}`)
    }
    // Under the bubble: why it failed, when it'll go, or (on a tap) its receipt.
    let under = node.querySelector('.under, .receipt-line')
    let next = null
    if (m.dir === 'out' && m.state === 'failed') {
      next = h('div.under.bad', h('b', 'Not delivered'), m.error ? h('span', '· ' + m.error) : null, h('span', '·'), h('button.link', { type: 'button', onclick: () => retry(m) }, 'Try again'))
      if (!node.querySelector('.alert')) node.append(h('span.alert', { 'aria-hidden': 'true' }, ic('bang', 14, 3)))
    } else {
      const a = node.querySelector('.alert')
      a && a.remove()
    }
    if (m.dir === 'out' && m.state === 'scheduled') {
      next = h('div.under.sched', ic('clock', 13, 2.2), h('span', 'Sends ' + whenShort(m.scheduleAt)), h('span', '·'), h('button.link', { type: 'button', onclick: () => cancel(m) }, 'Cancel'))
    }
    if (!next && showFor === m.id) next = h('div.receipt-line.num', receiptText(m))
    const sig = next ? next.className + next.textContent : ''
    if (under && under.dataset.sig === sig) return
    under && under.remove()
    if (next) { next.dataset.sig = sig; node.append(next) }
  }

  function fly(node) {
    const b = node.firstChild
    if (!flyFrom || reduced()) { node.classList.add('enter-out'); return }
    const to = b.getBoundingClientRect()
    const dx = flyFrom.left + 14 - to.left
    const dy = flyFrom.top + flyFrom.height / 2 - (to.top + to.height / 2)
    const sx = Math.min(1, Math.max(.5, (flyFrom.width - 60) / to.width))
    b.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, .8)`, opacity: .3, borderRadius: '19px' },
      { transform: 'none', opacity: 1 }
    ], { duration: 520, easing: 'cubic-bezier(.3,1.25,.5,1)', composite: 'replace' })
    flyFrom = null
  }

  function scrollDown(smooth) {
    requestAnimationFrame(() => {
      convo.scrollTo({ top: convo.scrollHeight, behavior: smooth && !reduced() ? 'smooth' : 'auto' })
      unseen = 0
      drawToBottom()
    })
  }

  function drawToBottom() {
    const away = convo.scrollHeight - convo.scrollTop - convo.clientHeight > 220
    toBottom.classList.toggle('show', away)
    const n = toBottom.querySelector('.n')
    if (unseen && away) {
      if (n) n.textContent = unseen
      else toBottom.append(h('span.n.num', unseen))
    } else if (n) n.remove()
    if (!away) unseen = 0
  }
  convo.addEventListener('scroll', drawToBottom, { passive: true })

  async function older() {
    const first = data.messages[0]
    if (!first) return
    const height = convo.scrollHeight
    const top = convo.scrollTop
    try {
      data = await loadThread(number, first.at)
      draw()
      convo.scrollTop = top + (convo.scrollHeight - height)
    } catch (error) {
      toast(error.message, { kind: 'bad' })
    }
  }

  /* ---- Actions --------------------------------------------------------------- */

  function bubbleMenu(id, at) {
    const m = data.messages.find(x => x.id === id)
    if (!m) return
    const node = keyed.get(id)
    menu(at, [
      { label: 'Copy', icon: 'copy', onclick: () => copyText(m.body, 'Text copied') },
      { label: 'Info', icon: 'info', onclick: () => info(m) },
      m.dir === 'out' && m.state === 'failed' ? { label: 'Try again', icon: 'retry', onclick: () => retry(m) } : null,
      m.dir === 'out' && ['scheduled', 'queued'].includes(m.state) ? { label: m.state === 'scheduled' ? 'Cancel this text' : 'Stop sending', icon: 'x', danger: true, onclick: () => cancel(m) } : null,
      m.dir === 'out' ? { label: 'Send again', icon: 'send', onclick: () => { box.set(m.body); box.focus() } } : null
    ], { align: m.dir === 'out' ? 'end' : 'start', lift: node && node.firstChild && wide() ? null : node && node.firstChild })
  }

  function info(m) {
    const rows = [
      ['Written', full(m.at)],
      m.scheduleAt ? ['Sends', full(m.scheduleAt)] : null,
      m.sentAt ? ['Sent', full(m.sentAt)] : null,
      m.deliveredAt ? ['Delivered', full(m.deliveredAt)] : null,
      m.dir === 'in' ? ['Received', full(m.at)] : null,
      m.state === 'failed' ? ['Not delivered', m.error || 'The phone couldn’t send it'] : null,
      m.sim ? ['SIM', `SIM ${m.sim}`] : null,
      m.parts ? ['Size', `${m.parts} SMS${m.encoding === 'Unicode' ? ', Unicode' : ''}`] : null,
      m.source === 'api' ? ['From', 'An API key'] : null
    ].filter(Boolean)
    sheet({
      title: m.dir === 'out' ? 'Text info' : 'Reply info',
      cancel: null,
      done: 'Done',
      body: () => [
        h('div.group', { style: { padding: '12px 16px', 'font-size': '16px', 'line-height': '1.45', 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' }, class: 'group selectable' }, m.body),
        h('div.group', rows.map(([k, v]) => h('div.item', h('span.t', k), h('span.value.num', v))))
      ]
    })
  }

  async function retry(m) {
    try {
      const result = await api.post('/api/messages', { to: [number], body: m.body, sim: m.sim })
      for (const x of result.messages) fresh.add(x.id)
      sound.send()
      addSent(result)
    } catch (error) {
      sound.error()
      toast(error.message, { kind: 'bad' })
    }
  }

  async function cancel(m) {
    const ok = await confirm({ title: m.state === 'scheduled' ? 'Cancel this text?' : 'Stop sending this text?', text: 'Your phone won’t send it. You can write it again any time.', action: m.state === 'scheduled' ? 'Cancel text' : 'Stop sending' })
    if (!ok) return
    try {
      const { message } = await api.del(`/api/messages/${encodeURIComponent(m.id)}`)
      Object.assign(m, message)
      draw()
      emit({ type: 'thread', number })
      toast('Cancelled')
    } catch (error) {
      toast(error.message, { kind: 'bad' })
    }
  }

  async function allowAgain() {
    const ok = await confirm({ title: 'Text this number again?', text: 'Only if they asked to hear from you again. A STOP reply means stop.', action: 'Allow texts', danger: false })
    if (!ok) return
    try {
      await api.del(`/api/optouts/${encodeURIComponent(number)}`)
      const t = row()
      t.optedOut = false
      if (data) data.optedOut = false
      emit({ type: 'threads' })
      loadState().catch(() => {})
      draw()
      box.refresh()
      toast('They can get your texts again')
    } catch (error) {
      toast(error.message, { kind: 'bad' })
    }
  }

  function details() {
    const t = row()
    const sent = data ? data.messages.filter(m => m.dir === 'out').length : 0
    const got = data ? data.messages.length - sent : 0
    sheet({
      title: '',
      label: `About ${label(t)}`,
      cancel: null,
      done: 'Done',
      body: (close) => [
        h('div', { style: { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '4px', 'margin-top': '-8px' } },
          avatar({ key: number, name: t.name, size: 88 }),
          h('b', { style: { 'font-size': '24px', 'letter-spacing': '-.02em', 'margin-top': '10px' } }, label(t)),
          h('span.muted.num', { style: { 'font-size': '15px' } }, formatPhone(number))),
        h('div.group.icons',
          h('button.item', { type: 'button', onclick: () => { close(); rename(t) } }, h('span.sq.blue', ic('pencil', 16, 2.2)), h('span.t', t.name ? 'Rename' : 'Add a name'), ic('next', 18, 2)),
          h('button.item', { type: 'button', onclick: () => { close(); copyText(number, 'Number copied') } }, h('span.sq.gray', ic('copy', 16, 2.2)), h('span.t', 'Copy number'), h('span.value.num', number)),
          h('div.item', h('span.sq.teal', ic('chats', 16, 2.2)), h('span.t', 'Texts here'), h('span.value.num', data && data.more ? `${sent + got}+` : `${sent} sent · ${got} received`))),
        h('div.group.icons',
          t.optedOut
            ? h('button.item', { type: 'button', onclick: () => { close(); allowAgain() } }, h('span.sq.green', ic('check', 16, 2.4)), h('span.t', 'Allow texts again', h('small', 'They replied STOP or you blocked them')))
            : h('button.item', { type: 'button', onclick: () => { close(); optOut() } }, h('span.sq.red', ic('ban', 16, 2.2)), h('span.t', 'Stop texting this number', h('small', 'Adds it to your opt-out list'))),
          h('button.item.danger', { type: 'button', onclick: () => { close(); remove(t) } }, h('span.sq.red', ic('trash', 16, 2.2)), h('span.t', 'Delete conversation')))
      ]
    })
  }

  async function optOut() {
    const ok = await confirm({ title: 'Stop texting this number?', text: 'Zend won’t send to it until you allow it again.', action: 'Stop texting' })
    if (!ok) return
    try {
      await api.post('/api/optouts', { number })
      const t = row()
      t.optedOut = true
      if (data) data.optedOut = true
      emit({ type: 'threads' })
      draw()
      box.refresh()
      toast('Added to your opt-out list')
    } catch (error) {
      toast(error.message, { kind: 'bad' })
    }
  }

  /* ---- Keeping current ---------------------------------------------------------- */

  const off = on((event) => {
    if (destroyed) return
    if (event.type === 'thread' && event.number === number) {
      data = store.open.get(number)
      drawBar()
      draw()
    }
    if (event.type === 'threads') { drawBar(); box.refresh() }
    if (event.type === 'state') box.refresh()
  })

  drawBar()
  draw()
  loadThread(number).then((d) => {
    data = d
    drawBar()
    draw()
    requestAnimationFrame(() => { convo.scrollTop = convo.scrollHeight })
    if (wide()) box.focus()
  }).catch((error) => {
    fill(msgs, h('div.empty', h('span.glyph', ic('alert', 32, 1.6)), h('h2', 'Couldn’t open this conversation'), h('p', error.message), h('button.btn', { type: 'button', onclick: () => go('/') }, 'Back to chats')))
  })
  requestAnimationFrame(() => { convo.scrollTop = convo.scrollHeight })

  return {
    el,
    destroy() { destroyed = true; off() }
  }
}

/* ---- Helpers ----------------------------------------------------------------------- */

function whenShort(value) {
  const t = typeof value === 'number' ? value : Date.parse(value)
  const days = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return `today at ${clock(t)}`
  if (days === 1) return `tomorrow at ${clock(t)}`
  return full(t).replace(/,?\s(\d{1,2}:\d{2})/, ' at $1')
}

function receiptText(m) {
  if (m.dir === 'in') return `Received ${clock(m.at)}`
  const bits = []
  if (m.state === 'delivered') bits.push(`Delivered ${clock(m.deliveredAt || m.at)}`)
  else if (m.state === 'sent') bits.push(`Sent ${clock(m.sentAt || m.at)}, waiting for delivery`)
  else if (m.state === 'queued') bits.push('Waiting for your phone')
  else if (m.state === 'cancelled') bits.push('Cancelled')
  if (m.sim) bits.push(`SIM ${m.sim}`)
  if (m.parts > 1) bits.push(`${m.parts} SMS`)
  return bits.join(' · ')
}

function spoken(m) {
  if (m.dir === 'in') return `Received ${clock(m.at)}`
  return { queued: 'Sending', sent: 'Sent', delivered: 'Delivered', failed: 'Not delivered', scheduled: 'Scheduled', cancelled: 'Cancelled' }[m.state] || ''
}

// Web addresses in a text become links; everything else stays text.
function linkify(text) {
  const out = []
  const re = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/gi
  let last = 0
  for (const match of String(text).matchAll(re)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(h('a', { href: match[0], target: '_blank', rel: 'noopener noreferrer' }, match[0]))
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
