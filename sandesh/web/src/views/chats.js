// Chats: the conversation list, one conversation, and a new text. On a
// phone they take turns; on a computer the list stays on the left.

import { h, ic, toast, sheet, confirm, clock, listTime, dayLabel, label, face, when, fill } from '../dom.js'
import * as api from '../api.js'
import { store, on, loadThreads, loadState } from '../store.js'
import { composer } from '../composer.js'
import { postmark, tilt } from '../postmark.js'
import { normalizePhone, formatPhone } from '../sms.js'
import { go, footer } from '../app.js'

export function chats(params) {
  const search = h('input.input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search conversations', autocomplete: 'off' })
  const rows = h('ul.rows')
  const usage = h('p.usage-line.num')
  const listPanel = h('div.panel', usage, rows, footer('phone-only'))
  const listPane = h('section.list-pane', { 'aria-label': 'Conversations' },
    h('div.list-tools',
      h('label.search', ic('search', 18), search),
      h('a.btn.primary', { href: '/new', 'data-link': '', 'aria-label': 'New text' }, ic('messageSquarePlus', 20), h('span.desktop-only', 'New text'))),
    listPanel)
  const threadPane = h('section.thread-pane')
  const root = h('div.split', listPane, threadPane)

  let current = null          // the open conversation's view
  let params_ = {}

  search.addEventListener('input', drawList)

  function drawList() {
    const phone = store.state && store.state.phone
    if (!phone) {
      usage.textContent = ''
      fill(rows, h('li', connectPrompt()))
      return
    }
    const u = store.state.usage
    usage.textContent = u && u.texts ? `Last 24 hours: ${u.texts} ${u.texts === 1 ? 'text' : 'texts'} to ${u.people} ${u.people === 1 ? 'person' : 'people'}` : ''
    if (!store.threads) {
      fill(rows, ...[1, 2, 3, 4].map(() => h('li.skeleton')))
      return
    }
    const q = search.value.trim().toLowerCase()
    const list = store.threads.filter(t => !q || [t.name, t.number, formatPhone(t.number), t.last && t.last.body].some(v => v && v.toLowerCase().includes(q)))
    if (!store.threads.length) {
      fill(rows, h('li.empty',
        ic('sendHorizontal', 40),
        h('h3', 'Write your first text'),
        h('p', phone.kind === 'demo'
          ? 'The demo phone pretends to send it, and the person may even reply. Numbers ending in 0000 have no signal; 9999 replies STOP.'
          : 'It goes out from your phone, on your SIM, as an ordinary text.'),
        h('a.btn.primary', { href: '/new', 'data-link': '' }, ic('messageSquarePlus', 18), 'New text')))
      return
    }
    if (!list.length) {
      fill(rows, h('li.empty', h('p', `Nothing matches “${search.value.trim()}”.`)))
      return
    }
    fill(rows, ...list.map(rowFor))
  }

  function rowFor(t) {
    const open = params_.number && normalizePhone(params_.number) === t.number
    const last = t.last || {}
    return h('li', h('a.row' + (t.unread ? '.unread' : ''), { href: `/t/${encodeURIComponent(t.number)}`, 'data-link': '', 'aria-current': open ? 'true' : 'false' },
      face(t.number, t.name),
      h('div.who',
        h('div.line1', h('span.name', label(t)), h('time', listTime(last.at))),
        h('div.line2',
          last.dir === 'out' ? tick(last.state) : null,
          h('span.text', last.body ? (last.dir === 'out' ? 'You: ' : '') + last.body : 'No texts yet'),
          t.optedOut ? h('span.tag', 'Opted out') : null,
          t.unread ? h('span.badge', t.unread) : null))))
  }

  function show(p) {
    params_ = p
    const open = Boolean(p.number || p.compose)
    root.classList.toggle('open', open)
    if (current) current.destroy()
    current = null
    if (p.compose) current = newText()
    else if (p.number) current = conversation(p.number)
    fill(threadPane, current ? current.el : h('div.thread-empty', h('div', ic('messagesSquare', 64), h('p', 'Pick a conversation, or write a new text.'))))
    if (current && current.mounted) current.mounted()
    drawList()
  }

  const offs = [
    on((event) => {
      if (event.type === 'threads' || event.type === 'state') {
        drawList()
        if (current && current.threadsChanged) current.threadsChanged()
      }
      if (event.type === 'changed') {
        loadThreads().catch(() => {})
        if (current && current.number && event.numbers.includes(current.number)) current.reload()
      }
    })
  ]

  if (store.state && store.state.phone) loadThreads().catch(error => toast(error.message, { error: true }))
  show(params)

  return {
    el: root,
    update: show,
    destroy() {
      offs.forEach(off => off())
      if (current) current.destroy()
    }
  }
}

function tick(state) {
  if (state === 'delivered') return h('span.tick.delivered', { title: 'Delivered' }, ic('checkCheck', 16))
  if (state === 'sent') return h('span.tick', { title: 'Sent' }, ic('check', 16))
  if (state === 'failed') return h('span.tick.failed', { title: 'Not delivered' }, ic('circleAlert', 16))
  if (state === 'scheduled') return h('span.tick', { title: 'Scheduled' }, ic('calendarClock', 16))
  if (state === 'cancelled') return h('span.tick', { title: 'Cancelled' }, ic('ban', 16))
  return h('span.tick', { title: 'On its way to your phone' }, ic('clock3', 16))
}

function connectPrompt() {
  return h('div.empty',
    ic('smartphone', 44),
    h('h3', 'Connect your phone'),
    h('p', 'Sandesh sends texts through the Android phone in your pocket, on your own SIM. It takes about two minutes.'),
    h('a.btn.primary', { href: '/phone', 'data-link': '' }, 'Connect a phone'),
    h('a.btn.quiet', { href: '/phone?demo=1', 'data-link': '' }, 'Or try the demo phone'))
}

/* ---- One conversation ------------------------------------------------ */

const seen = new Map() // message id → last state drawn, so only changes thump

function conversation(raw) {
  const number = normalizePhone(raw)
  if (!number) {
    return { el: h('div.thread-empty', h('p', 'That is not a phone number.')), destroy() {}, reload() {} }
  }
  const nameEl = h('b', formatPhone(number))
  const subEl = h('span', '')
  const faceSlot = h('span', { style: { display: 'contents' } }, face(number, null, 40))
  const list = h('div.messages', { role: 'log', 'aria-label': 'Texts' }, h('div.loading', h('div.spinner')))
  const panel = h('div.panel', list)
  const banner = h('div.notice.red', { hidden: true })
  const box = composer({
    numbers: () => [number],
    onSent: () => {
      reload(true)
      loadThreads().catch(() => {})
    }
  })
  const head = h('header.thread-head',
    h('a.icon-btn.back', { href: '/', 'data-link': '', 'aria-label': 'Back to conversations' }, ic('arrowLeft')),
    faceSlot,
    h('div.who', nameEl, subEl),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Conversation options', onclick: menu }, ic('ellipsisVertical')))
  const el = h('div', { style: { display: 'contents' } }, head, panel, banner, box.el)

  let data = null
  let alive = true

  async function reload(stick = false) {
    try {
      const next = await api.get(`/api/threads/${encodeURIComponent(number)}`)
      if (!alive) return
      const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80
      data = next
      draw()
      if (stick || nearBottom || !reload.done) panel.scrollTop = panel.scrollHeight
      reload.done = true
      const t = store.threads && store.threads.find(x => x.number === number)
      if (t && t.unread) {
        t.unread = 0
        loadThreads().catch(() => {})
      }
    } catch (error) {
      fill(list, h('div.empty', h('p', error.message)))
    }
  }

  function draw() {
    nameEl.textContent = data.name || formatPhone(number)
    subEl.textContent = data.name ? formatPhone(number) : ''
    fill(faceSlot, face(number, data.name, 40))
    banner.hidden = !data.optedOut
    fill(banner, h('span', 'This number asked you to stop texting. Remove it from your opt-out list only if they ask to hear from you again.'))
    box.el.hidden = data.optedOut
    const items = []
    if (data.more) items.push(h('button.btn.small.more-older', { type: 'button', onclick: older }, 'Show earlier texts'))
    let lastDay = ''
    for (const m of data.messages) {
      const day = dayLabel(m.at)
      if (day !== lastDay) {
        items.push(h('div.day', day))
        lastDay = day
      }
      items.push(message(m))
    }
    if (!data.messages.length) items.push(h('div.empty', h('p', `Write to ${data.name || formatPhone(number)} below.`)))
    fill(list, ...items)
  }

  async function older() {
    const first = data.messages[0]
    if (!first) return
    const prev = await api.get(`/api/threads/${encodeURIComponent(number)}?before=${encodeURIComponent(first.at)}`)
    const height = panel.scrollHeight
    data = { ...data, more: prev.more, messages: [...prev.messages, ...data.messages] }
    draw()
    panel.scrollTop = panel.scrollHeight - height
  }

  function message(m) {
    const out = m.dir === 'out'
    const stampState = out && ['sent', 'delivered', 'failed', 'scheduled'].includes(m.state) ? m.state : null
    const stampTime = m.state === 'delivered' ? m.deliveredAt : m.state === 'sent' ? m.sentAt : m.state === 'scheduled' ? m.scheduleAt : m.at
    const before = seen.get(m.id)
    seen.set(m.id, m.state)
    const meta = [h('span', clock(m.at))]
    if (m.parts > 1) meta.push(h('span', `${m.parts} SMS`))
    if (m.sim) meta.push(h('span', `SIM ${m.sim}`))
    if (out && m.state === 'queued') meta.push(h('span', 'Posting to your phone…'))
    if (out && m.state === 'scheduled') {
      meta.push(h('span', `Sends ${when(m.scheduleAt)}`), h('button', { type: 'button', onclick: () => cancel(m) }, 'Cancel'))
    }
    if (out && m.state === 'cancelled') meta.push(h('span', 'Cancelled'))
    if (out && m.state === 'failed') meta.push(h('span.err', friendlyError(m.error)))
    const el = h('div.msg' + (out ? '.out' : '.in') + (m.state === 'failed' ? '.failed' : '') + (m.state === 'cancelled' ? '.cancelled' : '') + (stampState ? '.stamped' : ''),
      h('div.slip', m.body),
      h('div.meta', meta))
    if (stampState) {
      const stamp = h('div.stamp' + (m.state === 'failed' ? '.returned' : m.state === 'scheduled' ? '.scheduled' : ''), {
        html: postmark(stampState, stampTime, m.id),
        style: { '--tilt': tilt(m.id) + 'deg' },
        title: stampTitle(m)
      })
      if (before && before !== m.state) stamp.classList.add('thump')
      el.append(stamp)
    }
    return el
  }

  async function cancel(m) {
    if (!await confirm('Cancel this text?', 'Your phone will drop it before it goes out.', { action: 'Cancel text' })) return
    try {
      await api.del(`/api/messages/${encodeURIComponent(m.id)}`)
      reload()
      loadThreads().catch(() => {})
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  async function menu() {
    const choice = await sheet(data && data.name ? data.name : formatPhone(number), (close) => ({
      body: h('div.stack',
        h('button.btn', { type: 'button', onclick: () => close('name') }, ic('pencil', 18), data && data.name ? 'Rename' : 'Name this number'),
        data && data.optedOut
          ? h('button.btn', { type: 'button', onclick: () => close('optin') }, ic('undo2', 18), 'Remove from opt-outs')
          : h('button.btn', { type: 'button', onclick: () => close('optout') }, ic('userX', 18), 'Stop texting this number'),
        h('button.btn.danger', { type: 'button', onclick: () => close('delete') }, ic('trash2', 18), 'Delete conversation'))
    }))
    try {
      if (choice === 'name') {
        const input = h('input.input', { value: (data && data.name) || '', maxLength: 40, placeholder: 'Amma, Ravi, Office…', autocomplete: 'off' })
        setTimeout(() => input.focus(), 50)
        const name = await sheet('Name this number', (close) => ({
          body: [h('label.field', h('span', formatPhone(number)), input)],
          foot: [h('button.btn.primary', { type: 'button', onclick: () => close(input.value) }, 'Save name')]
        }))
        if (name === undefined) return
        await api.patch(`/api/threads/${encodeURIComponent(number)}`, { name })
        toast('Name saved')
      }
      if (choice === 'optout') {
        await api.post('/api/optouts', { number })
        toast('Added to your opt-outs. Sandesh won’t text this number.')
      }
      if (choice === 'optin') {
        if (!await confirm('Text this number again?', 'Only if they asked to hear from you again.', { action: 'Remove opt-out' })) return
        await api.del(`/api/optouts/${encodeURIComponent(number)}`)
        toast('Removed from your opt-outs')
      }
      if (choice === 'delete') {
        if (!await confirm('Delete this conversation?', 'Its texts go from Sandesh. Copies on your phone and theirs stay.', { action: 'Delete' })) return
        await api.del(`/api/threads/${encodeURIComponent(number)}`)
        toast('Conversation deleted')
        loadThreads().catch(() => {})
        go('/')
        return
      }
      if (choice) {
        reload()
        loadThreads().catch(() => {})
        loadState().catch(() => {})
      }
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  return {
    el,
    number,
    reload,
    mounted: () => {
      reload(true)
      // Catch up on this conversation's texts once, whatever the phone.
      api.post('/api/messages/refresh', { number }).then(({ changed }) => { if (changed.length) reload() }).catch(() => {})
    },
    destroy() { alive = false }
  }
}

function stampTitle(m) {
  if (m.state === 'delivered') return `Delivered ${when(m.deliveredAt)}`
  if (m.state === 'sent') return `Sent ${when(m.sentAt)}; waiting for the delivery report`
  if (m.state === 'failed') return `Not delivered: ${m.error || 'no reason given'}`
  if (m.state === 'scheduled') return `Scheduled for ${when(m.scheduleAt)}`
  return ''
}

// SMSGate passes on Android's reasons; say them plainly.
function friendlyError(error) {
  const e = String(error || '')
  if (/NO_SERVICE|No signal/i.test(e)) return 'No signal on the phone'
  if (/RADIO_OFF/i.test(e)) return 'The phone is in flight mode'
  if (/NULL_PDU|GENERIC/i.test(e)) return 'The network refused it'
  if (/limit/i.test(e)) return 'Your phone held it back (sending limit)'
  return e ? `Not delivered (${e})` : 'Not delivered'
}

/* ---- A new text ------------------------------------------------------ */

function newText() {
  const chosen = []
  const input = h('input', { type: 'tel', placeholder: 'Name or number', 'aria-label': 'To', autocomplete: 'off', inputMode: 'tel' })
  const to = h('div.to', h('span', 'To'), input)
  const suggest = h('div.panel')
  const box = composer({
    // Any chip that isn't a number holds the send button until it's fixed.
    numbers: () => (chosen.some(c => !c.number) ? [] : chosen.map(c => c.number)),
    onSent: (result) => {
      const numbers = [...new Set(result.messages.map(m => m.number))]
      loadThreads().catch(() => {})
      if (numbers.length === 1) go(`/t/${encodeURIComponent(numbers[0])}`, { replace: true })
      else {
        toast(`Sent to ${numbers.length} people`)
        go('/', { replace: true })
      }
    }
  })
  const head = h('header.thread-head',
    h('a.icon-btn.back', { href: '/', 'data-link': '', 'aria-label': 'Back to conversations' }, ic('arrowLeft')),
    h('div.who', h('b', 'New text'), h('span', 'Up to 10 numbers')))
  const el = h('div', { style: { display: 'contents' } }, head, to, suggest, box.el)

  function add(raw) {
    const value = String(raw || '').trim()
    if (!value) return
    if (chosen.length >= 10) {
      toast('Send to at most 10 numbers at a time.', { error: true })
      return
    }
    const number = normalizePhone(value)
    if (number && chosen.some(c => c.number === number)) return
    const t = store.threads && store.threads.find(x => x.number === number)
    chosen.push({ raw: value, number, name: t && t.name })
    input.value = ''
    draw()
  }

  function draw() {
    const chips = chosen.map((c, i) => h('span.chip' + (c.number ? '' : '.bad'), { title: c.number ? formatPhone(c.number) : 'Not a phone number' },
      c.name || (c.number ? formatPhone(c.number) : c.raw),
      h('button.x', { type: 'button', style: { border: 0, background: 'none', padding: 0, color: 'inherit' }, 'aria-label': 'Remove', onclick: () => { chosen.splice(i, 1); draw() } }, ic('x', 15))))
    fill(to, h('span', 'To'), ...chips, input)
    drawSuggestions()
    box.refresh()
  }

  function drawSuggestions() {
    const q = input.value.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    const list = (store.threads || [])
      .filter(t => !chosen.some(c => c.number === t.number))
      .filter(t => !q || (t.name && t.name.toLowerCase().includes(q)) || (digits && t.number.includes(digits)))
      .slice(0, 8)
    fill(suggest, 
      list.length ? h('p.suggest-head', q ? 'Matches' : 'Recent') : null,
      h('ul.rows', list.map(t => h('li', h('button.row', { type: 'button', style: { width: '100%', border: 0, background: 'none', textAlign: 'left' }, onclick: () => { add(t.number); input.focus() } },
        face(t.number, t.name, 40),
        h('div.who', h('div.line1', h('span.name', label(t))), h('div.line2', h('span.text', t.name ? formatPhone(t.number) : '')))))))
    )
  }

  input.addEventListener('keydown', (event) => {
    if (['Enter', ',', ';'].includes(event.key)) {
      event.preventDefault()
      add(input.value)
    } else if (event.key === 'Backspace' && !input.value && chosen.length) {
      chosen.pop()
      draw()
    }
  })
  input.addEventListener('input', () => {
    // A pasted list, or a full number followed by a space, becomes chips.
    if (/[,;\n]/.test(input.value)) {
      input.value.split(/[,;\n]+/).forEach(add)
      return
    }
    if (/\s$/.test(input.value) && normalizePhone(input.value)) add(input.value)
    drawSuggestions()
    box.refresh()
  })
  input.addEventListener('blur', () => { if (normalizePhone(input.value)) add(input.value) })

  draw()
  return {
    el,
    mounted: () => input.focus(),
    threadsChanged: drawSuggestions,
    destroy() {},
    reload() {}
  }
}
