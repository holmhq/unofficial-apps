import { h, api, avatar, icon, toast, confetti, segmented, store, personColor } from './ui.js'
import { session, signIn, navigate } from './app.js'
import { createGrid } from './grid.js'
import { connect, presence } from './live.js'
import {
  bestTimes, calendarFile, dayLabel, dayLabelLong, googleLink, localHint, minutes, rangeLabel,
  viewerZone, zoneDifference, zoneName
} from './time.js'
import * as sound from './sound.js'

export async function planView(view, slug) {
  view.append(h('div', { class: 'skeleton', style: { height: '9rem', marginBottom: '1.2rem' } }), h('div', { class: 'skeleton', style: { height: '28rem' } }))
  let data
  try { data = await api(`/api/plans/${slug}`) } catch (e) {
    view.replaceChildren(h('div', { class: 'card empty' },
      h('h1', { class: 'title' }, e.status === 404 ? 'This plan is gone' : 'Could not open this plan'),
      h('p', {}, e.message),
      h('a', { class: 'button accent', href: '/' }, 'Go home')))
    return
  }

  let plan = data.plan
  let people = data.people
  const keys = store.get('keys', {})
  let me = people.find(p => p.me) || people.find(p => keys[slug]?.id === p.id) || null
  let mode = me && !me.slots.includes('1') ? 'mine' : 'all'
  let filter = null
  let pinned = null
  const here = new Map()
  const rows = (plan.end - plan.start) / plan.step
  const viewer = viewerZone()
  const isNew = new URLSearchParams(location.search).has('new')
  if (isNew) history.replaceState(null, '', `/p/${slug}`)

  const keyFor = () => keys[slug]?.key
  const personById = id => people.find(p => p.id === id)

  // Header
  const settledSlot = h('div')
  const hereSlot = h('div', { class: 'here' })
  const head = h('section', { class: 'plan-head' })
  function drawHead() {
    head.replaceChildren(
      h('div', {},
        h('div', { class: 'who' }, avatar({ name: plan.ownerName, picture: plan.ownerPicture, color: 3 }, '1.7rem'), `${plan.ownerName} is planning`),
        h('h1', { class: 'title' }, plan.title),
        plan.note ? h('p', { class: 'note' }, plan.note) : null,
        h('div', { class: 'plan-meta' },
          h('span', { class: 'badge' }, `${plan.days.length} ${plan.days.length === 1 ? 'date' : 'dates'}`),
          h('span', { class: 'badge' }, `${minutes(plan.start)} – ${plan.end === 1440 ? 'midnight' : minutes(plan.end)}`),
          h('span', { class: 'badge' }, `${zoneName(plan.tz)} time`))),
      h('div', { class: 'plan-actions' },
        hereSlot,
        h('button', { class: 'button accent', type: 'button', onclick: share }, icon('link'), 'Share'),
        plan.mine ? ownerMenu() : null))
  }

  function ownerMenu() {
    const menu = h('div', { class: 'menu', hidden: true, role: 'menu' },
      h('button', { type: 'button', role: 'menuitem', onclick: editPlan }, icon('edit'), 'Edit name and note'),
      h('button', { type: 'button', role: 'menuitem', class: 'danger', onclick: deletePlan }, icon('trash'), 'Delete plan'))
    const button = h('button', { class: 'icon-button', type: 'button', 'aria-haspopup': 'menu', title: 'More' }, icon('more'))
    button.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden })
    document.addEventListener('click', () => { menu.hidden = true })
    return h('div', { class: 'menu-wrap' }, button, menu)
  }

  // The settled time
  function drawSettled() {
    settledSlot.replaceChildren()
    if (!plan.final) return
    const f = plan.final
    const day = plan.days[f.day]
    const hint = localHint(day, plan.start + f.from * plan.step, plan.tz, viewer)
    const url = `${location.origin}/p/${slug}`
    settledSlot.append(h('div', { class: 'card settled' },
      h('span', { class: 'seal', 'aria-hidden': 'true' }, icon('check')),
      h('div', {},
        h('div', { class: 'kicker' }, 'It’s settled'),
        h('div', { class: 'when' }, `${dayLabelLong(day)}, ${rangeLabel(plan, f)}`),
        h('div', { class: 'muted' }, `${zoneName(plan.tz)} time${hint ? ` · ${hint} for you` : ''}`)),
      h('div', { class: 'actions' },
        h('button', { class: 'button gold small', type: 'button', onclick: () => downloadCalendar(url) }, icon('calendar'), 'Add to calendar'),
        h('a', { class: 'button quiet small', href: googleLink(plan, f, url), target: '_blank', rel: 'noopener noreferrer' }, 'Google Calendar', icon('out')),
        plan.mine ? h('button', { class: 'button quiet small', type: 'button', onclick: () => settle(null) }, 'Reopen') : null)))
  }
  function downloadCalendar(url) {
    const { body } = calendarFile(plan, plan.final, url)
    const a = h('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/calendar' })), download: `${plan.title.replace(/[^\w\- ]+/g, '').trim() || 'overlap'}.ics` })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // The grid
  const grid = createGrid(plan, { describe, onPaint: paint, onBlocked: nudgeJoin })
  document.title = `${plan.title} · overlap`
  const liveStatus = h('span', { class: 'status-live', title: 'Updates arrive live' }, 'Connecting')
  const modeSwitch = segmented([['mine', 'My times'], ['all', 'Everyone']], mode, v => { mode = v; sound.tick(); drawBoard(); refreshGrid() }, 'View')
  const boardHead = h('div', { class: 'board-head' })
  const diff = zoneDifference(plan.days[0], plan.tz, viewer)
  const zoneNote = diff ? h('p', { class: 'zone-note' }, `Times are in ${zoneName(plan.tz)} time. You are in ${zoneName(viewer)} (${diff}); hover a time to see yours.`) : null
  const board = h('section', { class: 'card board', 'aria-label': 'Availability' }, boardHead, zoneNote, grid.el)
  function drawBoard() {
    boardHead.replaceChildren(
      me ? modeSwitch : h('span', { class: 'painting-hint' }, 'Everyone’s free time'),
      mode === 'mine' && me
        ? h('span', { class: 'painting-hint' }, h('span', { class: 'dot' }), matchMedia('(hover: none)').matches ? 'Tap or drag the times you’re free · scroll on the times at left' : `Drag over the times you’re free · ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z'} undoes`)
        : people.length
          ? h('span', { class: 'legend' }, '0', h('span', { class: 'ramp' }), `${people.length} free`)
          : h('span', { class: 'legend' }, 'Nobody has answered yet'),
      liveStatus)
  }
  function refreshGrid() {
    const view = filter || pinned
    grid.update({ people, mine: me, mode: me ? mode : 'all', filter: view, final: plan.final })
  }

  function describe(d, r) {
    const day = plan.days[d]
    const at = plan.start + r * plan.step
    const free = people.filter(p => p.slots[d * rows + r] === '1')
    const busy = people.filter(p => p.slots[d * rows + r] !== '1')
    const hint = localHint(day, at, plan.tz, viewer)
    return h('div', {},
      h('strong', {}, `${dayLabel(day)} · ${minutes(at)} – ${minutes(at + plan.step)}`),
      hint ? h('div', { class: 'local' }, `${hint} your time`) : null,
      people.length
        ? h('div', {}, `${free.length} of ${people.length} free`,
          h('div', { class: 'names' },
            free.map(p => h('span', { vars: { '--c': personColor(p.color) } }, h('i'), p.name)),
            busy.map(p => h('span', { class: 'out' }, p.name))))
        : h('div', { class: 'local' }, 'No answers yet'))
  }

  // Painting and saving
  // Saves run one at a time: a paint marks the answer dirty, and the writer
  // keeps sending the latest slots until nothing newer is waiting.
  let saveTimer = null
  let dirty = false
  let writing = null
  const status = h('div', { class: 'saving', 'aria-live': 'polite' })
  const undoStack = []
  function paint(slots, changed, { undo = false } = {}) {
    if (!me) return
    if (!undo) { undoStack.push(me.slots); if (undoStack.length > 50) undoStack.shift() }
    me = { ...me, slots }
    people = people.map(p => (p.id === me.id ? me : p))
    refreshGrid(); drawSide()
    status.textContent = 'Saving…'
    dirty = true
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 260)
  }
  function save({ keepalive = false } = {}) {
    clearTimeout(saveTimer)
    saveTimer = null
    if (writing) return writing
    writing = (async () => {
      while (dirty && me) {
        dirty = false
        const slots = me.slots
        try {
          await api(`/api/plans/${slug}/people/${me.id}`, { method: 'PUT', body: { slots, sid: pulse.sid }, key: keyFor(), keepalive })
        } catch (e) {
          status.textContent = ''
          toast(e.message)
          break
        }
      }
      writing = null
      if (!dirty) status.textContent = 'Saved'
    })()
    return writing
  }
  const pending = () => dirty || !!writing
  const flush = () => { if (dirty) save({ keepalive: true }) }
  addEventListener('pagehide', flush)

  function nudgeJoin() {
    const input = youPanel.querySelector('.join input')
    if (!input) return
    youPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    input.focus({ preventScroll: true })
    youPanel.classList.remove('nudge'); void youPanel.offsetWidth; youPanel.classList.add('nudge')
    sound.tick()
  }
  const onKey = e => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && me && undoStack.length && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
      e.preventDefault()
      paint(undoStack.pop(), [], { undo: true })
      sound.paint(rows - 1, rows, false)
      toast('Undone', { ms: 1200 })
    }
  }
  addEventListener('keydown', onKey)

  // Side panels
  const youPanel = h('section', { class: 'card panel you-panel' })
  const bestPanel = h('section', { class: 'card panel' })
  const peoplePanel = h('section', { class: 'card panel' })
  const side = h('aside', { class: 'side' }, youPanel, bestPanel, peoplePanel)

  function drawYou() {
    const typing = youPanel.querySelector('.join input')
    const typed = typing?.value
    const hadFocus = !!typing && document.activeElement === typing
    youPanel.replaceChildren()
    youPanel.classList.toggle('joining', !me)
    if (!me) {
      const name = h('input', { class: 'input', maxlength: '40', placeholder: 'Your name', value: typed ?? session.me?.name ?? '', autocomplete: 'name', 'aria-label': 'Your name' })
      if (hadFocus) requestAnimationFrame(() => name.focus({ preventScroll: true }))
      const button = h('button', { class: 'button accent', type: 'submit' }, 'Join')
      const form = h('form', { class: 'join' },
        h('h2', {}, 'Add your times'),
        h('p', {}, session.me ? 'You’re signed in, so you can edit your times from any device.' : 'Just a name. You can come back and change your times on this device.'),
        h('div', { class: 'join-row' }, name, button),
        session.me ? null : h('p', { class: 'muted', style: { fontSize: '0.85rem' } }, 'Or ', h('button', { class: 'link-button', type: 'button', onclick: () => signIn(location.pathname) }, 'sign in'), ' to use them everywhere.'))
      form.addEventListener('submit', async e => {
        e.preventDefault()
        if (!name.value.trim()) { name.focus(); return }
        button.disabled = true
        try {
          const result = await api(`/api/plans/${slug}/people`, { method: 'POST', body: { name: name.value } })
          if (result.key) { keys[slug] = { id: result.person.id, key: result.key }; store.set('keys', keys) }
          me = result.person
          if (!personById(me.id)) people = [...people, me]
          mode = 'mine'
          modeSwitch.set('mine')
          sound.join()
          pulse.update()
          drawAll()
        } catch (err) { toast(err.message); button.disabled = false }
      })
      youPanel.append(form)
      if (!isNew) requestAnimationFrame(() => { if (matchMedia('(hover: hover)').matches) name.focus({ preventScroll: true }) })
      return
    }
    const nameInput = h('input', { class: 'name-input', value: me.name, maxlength: '40', 'aria-label': 'Your name' })
    const commitName = async () => {
      const value = nameInput.value.trim()
      if (!value || value === me.name) { nameInput.value = me.name; return }
      try {
        const { person } = await api(`/api/plans/${slug}/people/${me.id}`, { method: 'PUT', body: { name: value, sid: pulse.sid }, key: keyFor() })
        me = { ...me, name: person.name }
        people = people.map(p => (p.id === me.id ? me : p))
        pulse.update(); drawPeople()
        toast('Name changed')
      } catch (e) { toast(e.message); nameInput.value = me.name }
    }
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); if (e.key === 'Escape') { nameInput.value = me.name; nameInput.blur() } })
    nameInput.addEventListener('blur', commitName)
    const hours = me.slots.split('').filter(x => x === '1').length * plan.step / 60
    youPanel.append(
      h('h2', {}, 'You', h('small', {}, hours ? `${formatHours(hours)} free` : 'nothing marked yet')),
      h('div', { class: 'me' }, avatar(me, '2.4rem'), nameInput),
      status,
      h('div', { class: 'me-actions' },
        h('button', { class: 'button quiet small', type: 'button', onclick: () => { if (me.slots.includes('1')) { paint('0'.repeat(me.slots.length)); sound.paint(rows - 1, rows, false) } } }, icon('eraser'), 'Clear my times'),
        h('button', { class: 'button quiet small', type: 'button', onclick: leave }, 'Leave')))
  }

  function drawBest() {
    const best = bestTimes(plan, people)
    bestPanel.replaceChildren(h('h2', {}, 'Best times', people.length ? h('small', {}, `${people.length} answered`) : null))
    if (!best.length) {
      bestPanel.append(h('p', { class: 'muted', style: { margin: 0 } }, people.length ? 'No times overlap yet.' : 'When people add their times, the best ones show up here.'))
      return
    }
    const list = h('ol', { class: 'best' })
    best.forEach((run, i) => {
      const who = run.who.map(personById).filter(Boolean)
      const missing = people.filter(p => !run.who.includes(p.id))
      const item = h('li', { class: i === 0 && run.who.length > 1 ? 'top' : '', tabindex: '0', vars: { '--i': String(i) } },
        h('div', { class: 'when' }, `${dayLabel(plan.days[run.day])} · ${rangeLabel(plan, run)}`),
        h('div', { class: 'count' }, `${run.who.length}`, h('small', {}, `of ${people.length}`)),
        h('div', { class: 'who' },
          h('span', { class: 'stack' }, who.slice(0, 6).map(p => avatar(p))),
          missing.length ? h('span', {}, missing.length <= 2 ? `not ${missing.map(p => p.name).join(' or ')}` : `${missing.length} can’t`) : h('span', {}, 'everyone')),
        plan.mine ? h('button', { class: 'button gold small pick', type: 'button', onclick: e => { e.stopPropagation(); settle({ day: run.day, from: run.from, to: run.to }) } }, icon('check'), plan.final ? 'Pick this instead' : 'Pick this time') : null)
      const show = () => { grid.pulse(run) }
      item.addEventListener('click', show)
      item.addEventListener('keydown', e => { if (e.key === 'Enter') show() })
      list.append(item)
    })
    bestPanel.append(list)
  }

  function drawPeople() {
    peoplePanel.replaceChildren(h('h2', {}, 'People', h('small', {}, people.length ? String(people.length) : '')))
    if (!people.length) {
      peoplePanel.append(h('div', { class: 'join' },
        h('p', {}, 'Nobody has answered yet. Share the link and watch the grid fill in.'),
        h('button', { class: 'button quiet small', type: 'button', onclick: share }, icon('link'), 'Share link')))
      return
    }
    const list = h('ul', { class: 'people' })
    for (const p of people) {
      const hours = p.slots.split('').filter(x => x === '1').length * plan.step / 60
      const li = h('li', { class: pinned?.id === p.id ? 'on' : '', 'data-id': p.id, vars: { '--c': personColor(p.color) } },
        avatar(p),
        h('span', { class: 'pname' }, p.name, p.id === me?.id ? h('small', {}, 'you') : null),
        h('span', { class: 'hours' }, hours ? formatHours(hours) : '—'),
        plan.mine && p.id !== me?.id ? h('button', { class: 'remove', type: 'button', title: `Remove ${p.name}`, onclick: e => { e.stopPropagation(); removePerson(p) } }, icon('x')) : null)
      li.addEventListener('pointerenter', () => { filter = p; refreshGrid() })
      li.addEventListener('pointerleave', () => { filter = null; refreshGrid() })
      li.addEventListener('click', () => { pinned = pinned?.id === p.id ? null : p; drawPeople(); refreshGrid() })
      list.append(li)
    }
    peoplePanel.append(list, h('p', { class: 'muted', style: { fontSize: '0.8rem', margin: '0.6rem 0 0' } }, 'Point at someone to see only their times; click to keep it.'))
  }

  function drawHere() {
    const now = Date.now()
    for (const [sid, v] of here) if (now - v.at > 50000) here.delete(sid)
    const others = [...here.values()]
    hereSlot.replaceChildren()
    if (!others.length) return
    hereSlot.append(
      h('span', { class: 'stack' }, others.slice(0, 5).map(v => avatar({ name: v.name || '?', color: v.color < 0 ? 4 : v.color }, '1.7rem'))),
      `${others.length} here now`)
  }
  const hereTimer = setInterval(drawHere, 10000)

  function drawSide() { drawYou(); drawBest(); drawPeople() }
  function drawAll() { drawHead(); drawSettled(); drawBoard(); refreshGrid(); drawSide(); drawHere() }

  // Actions
  async function settle(final) {
    try {
      const result = await api(`/api/plans/${slug}`, { method: 'PATCH', body: { final } })
      const was = plan.final
      plan = { ...plan, ...result.plan }
      drawAll()
      if (final && !was) celebrate()
    } catch (e) { toast(e.message) }
  }
  function celebrate() {
    sound.settle()
    confetti([...people.map(p => personColor(p.color)), '#e6a100'])
    settledSlot.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  async function leave() {
    if (!confirm('Leave this plan? Your times will be removed.')) return
    try {
      await api(`/api/plans/${slug}/people/${me.id}`, { method: 'DELETE', key: keyFor() })
      people = people.filter(p => p.id !== me.id)
      delete keys[slug]; store.set('keys', keys)
      me = null; mode = 'all'
      pulse.update()
      drawAll()
    } catch (e) { toast(e.message) }
  }
  async function removePerson(p) {
    if (!confirm(`Remove ${p.name} and their times?`)) return
    try {
      await api(`/api/plans/${slug}/people/${p.id}`, { method: 'DELETE' })
      people = people.filter(x => x.id !== p.id)
      drawAll()
    } catch (e) { toast(e.message) }
  }
  function share() {
    const url = `${location.origin}/p/${slug}`
    const input = h('input', { class: 'input', value: url, readonly: true, 'aria-label': 'Link to this plan' })
    const copy = h('button', { class: 'button accent', type: 'button' }, 'Copy')
    const dialog = h('dialog', { class: 'sheet' },
      h('h2', {}, isNewShare ? 'Your plan is ready' : 'Share this plan'),
      h('p', {}, 'Anyone with the link can add their times. They’ll appear here as they answer.'),
      h('div', { class: 'share-row' }, input, copy),
      h('div', { class: 'sheet-actions' },
        navigator.share ? h('button', { class: 'button quiet', type: 'button', onclick: () => navigator.share({ title: plan.title, text: `Which times work for you? ${plan.title}`, url }).catch(() => {}) }, 'More options…') : null,
        h('button', { class: 'button quiet', type: 'button', onclick: () => dialog.close() }, 'Done')))
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url) } catch { input.select(); document.execCommand?.('copy') }
      copy.replaceChildren(icon('check'), 'Copied')
      sound.tick()
      setTimeout(() => copy.replaceChildren('Copy'), 1800)
    })
    dialog.addEventListener('close', () => dialog.remove())
    document.body.append(dialog)
    dialog.showModal()
    input.select()
    isNewShare = false
  }
  let isNewShare = isNew
  function editPlan() {
    const title = h('input', { class: 'input headline', value: plan.title, maxlength: '80', 'aria-label': 'Name' })
    const note = h('textarea', { class: 'textarea', maxlength: '280', 'aria-label': 'Note' }, plan.note || '')
    const dialog = h('dialog', { class: 'sheet' })
    const form = h('form', { method: 'dialog' },
      h('h2', {}, 'Edit plan'),
      h('div', { style: { display: 'grid', gap: '0.8rem' } }, title, note),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'button quiet', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { class: 'button accent', type: 'submit' }, 'Save')))
    form.addEventListener('submit', async e => {
      e.preventDefault()
      try {
        const result = await api(`/api/plans/${slug}`, { method: 'PATCH', body: { title: title.value, note: note.value } })
        plan = { ...plan, ...result.plan }
        drawHead(); drawSettled()
        dialog.close()
      } catch (err) { toast(err.message) }
    })
    dialog.append(form)
    dialog.addEventListener('close', () => dialog.remove())
    document.body.append(dialog)
    dialog.showModal()
  }
  function deletePlan() {
    const dialog = h('dialog', { class: 'sheet' },
      h('h2', {}, 'Delete this plan?'),
      h('p', {}, 'Everyone’s times go with it, and the link stops working. This cannot be undone.'),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'button quiet', type: 'button', onclick: () => dialog.close() }, 'Keep it'),
        h('button', { class: 'button danger', type: 'button', onclick: async () => {
          try { await api(`/api/plans/${slug}`, { method: 'DELETE' }); dialog.close(); toast('Plan deleted'); navigate('/') } catch (e) { toast(e.message) }
        } }, icon('trash'), 'Delete')))
    dialog.addEventListener('close', () => dialog.remove())
    document.body.append(dialog)
    dialog.showModal()
  }

  // Live updates
  function onMessage(msg) {
    if (buffered) { buffered.push(msg); return }
    if (msg.t === 'person') {
      const incoming = msg.person
      const old = personById(incoming.id)
      if (me && incoming.id === me.id) {
        if (msg.by === pulse.sid || pending()) return
        me = { ...incoming, me: true }
        people = people.map(p => (p.id === me.id ? me : p))
        drawAll()
        return
      }
      if (!old) {
        people = [...people, incoming]
        // Our own join can broadcast before its POST answers; only greet others.
        setTimeout(() => {
          if (me?.id === incoming.id || !personById(incoming.id)) return
          toast(`${incoming.name} joined`, { person: incoming })
          sound.join()
        }, 500)
      } else {
        const changed = []
        for (let i = 0; i < incoming.slots.length; i++) if (incoming.slots[i] !== old.slots[i]) changed.push(i)
        people = people.map(p => (p.id === incoming.id ? incoming : p))
        if (changed.length) {
          refreshGrid()
          grid.flash(changed, personColor(incoming.color))
          sound.drop()
          peoplePanel.querySelector(`li[data-id="${incoming.id}"] .avatar`)?.classList.add('bump')
        }
      }
      if (pinned?.id === incoming.id) pinned = incoming
      refreshGrid(); drawBest(); drawPeople(); drawBoard()
    } else if (msg.t === 'gone') {
      if (me?.id === msg.id) { me = null; delete keys[slug]; store.set('keys', keys); toast('The organiser removed you from this plan.') }
      people = people.filter(p => p.id !== msg.id)
      drawAll()
    } else if (msg.t === 'plan') {
      const was = plan.final
      plan = { ...msg.plan, mine: plan.mine }
      drawAll()
      if (plan.final && JSON.stringify(plan.final) !== JSON.stringify(was)) {
        if (!was) celebrate()
        else toast('The time changed')
      }
    } else if (msg.t === 'deleted') {
      toast('The organiser deleted this plan.')
      navigate('/', { replace: true })
    } else if (msg.t === 'here') {
      if (msg.sid === pulse.sid) return
      if (msg.leaving) here.delete(msg.sid)
      else here.set(msg.sid, { name: msg.name, color: msg.color, at: Date.now() })
      drawHere()
    }
  }
  // After every subscription, reload the plan so nothing between the snapshot
  // and the subscription is missed. Live events that arrive meanwhile wait and
  // replay on top, and unsaved local paint always wins over the snapshot.
  let buffered = null
  async function catchUp() {
    buffered = []
    try {
      const fresh = await api(`/api/plans/${slug}`)
      const local = me && pending() ? me.slots : null
      plan = { ...fresh.plan, mine: plan.mine || fresh.plan.mine }
      people = fresh.people
      if (me) {
        const server = personById(me.id)
        me = server ? { ...server, me: true, ...(local ? { slots: local } : {}) } : null
        if (me) people = people.map(p => (p.id === me.id ? me : p))
      }
    } catch {}
    const queue = buffered
    buffered = null
    for (const msg of queue) onMessage(msg)
    drawAll()
  }

  const pulse = presence(slug, () => (me ? { name: me.name, color: me.color } : { name: session.me?.name || '', color: -1 }))
  const socket = connect(slug, {
    onMessage,
    onStatus: on => { liveStatus.textContent = on ? 'Live' : 'Reconnecting…'; liveStatus.classList.toggle('on', on) },
    onSubscribed: catchUp
  })

  view.replaceChildren(head, settledSlot, h('div', { class: 'layout' }, board, side))
  drawAll()
  if (isNew && plan.mine) share()

  return {
    destroy() {
      socket.close()
      pulse.stop()
      clearInterval(hereTimer)
      removeEventListener('keydown', onKey)
      flush()
      removeEventListener('pagehide', flush)
      grid.destroy()
    }
  }
}

const formatHours = n => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')} h`
