import { h, api, icon, segmented, toast } from './ui.js'
import { session, signIn, navigate } from './app.js'
import { isoDay, minutes, viewerZone, zones, zoneName } from './time.js'
import * as sound from './sound.js'

const MAX_DAYS = 14

export async function createView(view) {
  document.title = 'New plan · overlap'
  if (!session.me) {
    view.append(h('div', { class: 'card empty' },
      h('h1', { class: 'title' }, 'Sign in to start a plan'),
      h('p', {}, 'Organisers sign in so their plans stay theirs. Everyone you invite answers with just a name.'),
      h('button', { class: 'button accent', type: 'button', onclick: () => signIn('/new') }, 'Sign in')))
    return
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const state = { days: new Set(), start: 540, end: 1080, step: 30, tz: viewerZone(), month: new Date(today.getFullYear(), today.getMonth(), 1) }

  const title = h('input', { class: 'input headline', name: 'title', maxlength: '80', placeholder: 'Team dinner', required: true, autocomplete: 'off', 'aria-label': 'Name of the plan' })
  const note = h('textarea', { class: 'textarea', name: 'note', maxlength: '280', placeholder: 'Anything people should know: where, how long, what to bring.' })

  // Calendar: two months on wide screens; press and drag across days.
  const months = h('div', { class: 'cal-months' })
  const label = h('span', { class: 'muted' })
  const chips = h('div', { class: 'chips' })
  let dragMode = null
  const calendar = h('div', { class: 'cal' },
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, h('span', { 'aria-hidden': 'true' }, '‹')),
      label,
      h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Next month', onclick: () => shift(1) }, h('span', { 'aria-hidden': 'true' }, '›'))),
    months,
    chips)
  addEventListener('pointerup', () => { dragMode = null })

  function shift(n) {
    const next = new Date(state.month.getFullYear(), state.month.getMonth() + n, 1)
    if (next < new Date(today.getFullYear(), today.getMonth(), 1)) return
    state.month = next
    drawCalendar()
  }
  function toggleDay(key, on) {
    if (on && state.days.size >= MAX_DAYS && !state.days.has(key)) { toast(`Up to ${MAX_DAYS} dates per plan.`); return false }
    if (on) state.days.add(key); else state.days.delete(key)
    return true
  }
  function drawCalendar() {
    const count = matchMedia('(max-width: 720px)').matches ? 1 : 2
    months.style.setProperty('--months', String(count))
    months.replaceChildren()
    const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
    const firstDay = weekStart()
    label.textContent = ''
    for (let m = 0; m < count; m++) {
      const first = new Date(state.month.getFullYear(), state.month.getMonth() + m, 1)
      const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': fmtMonth.format(first) })
      for (let i = 0; i < 7; i++) grid.append(h('span', { class: 'dow', 'aria-hidden': 'true' }, weekday.format(new Date(2024, 0, 7 + ((firstDay + i) % 7)))))
      const lead = (first.getDay() - firstDay + 7) % 7
      for (let i = 0; i < lead; i++) grid.append(h('span', { class: 'cal-day blank' }))
      const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      for (let d = 1; d <= daysIn; d++) {
        const date = new Date(first.getFullYear(), first.getMonth(), d)
        const key = isoDay(date)
        const b = h('button', {
          class: `cal-day${date < today ? ' past' : ''}${+date === +today ? ' today' : ''}`, type: 'button',
          'aria-pressed': String(state.days.has(key)), 'aria-label': date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
        }, String(d))
        b.addEventListener('pointerdown', e => {
          e.preventDefault()
          dragMode = !state.days.has(key)
          if (toggleDay(key, dragMode)) { b.setAttribute('aria-pressed', String(dragMode)); sound.paint(d % 10, 10, dragMode) }
          refresh()
        })
        b.addEventListener('pointerenter', () => {
          if (dragMode === null || state.days.has(key) === dragMode) return
          if (toggleDay(key, dragMode)) { b.setAttribute('aria-pressed', String(dragMode)); sound.paint(d % 10, 10, dragMode) }
          refresh()
        })
        b.addEventListener('keydown', e => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          const on = !state.days.has(key)
          if (toggleDay(key, on)) b.setAttribute('aria-pressed', String(on))
          refresh()
        })
        grid.append(b)
      }
      months.append(h('div', { class: 'cal-month' }, h('h4', {}, fmtMonth.format(first)), grid))
    }
  }
  // Touch: a finger dragging across days fires no pointerenter, so follow it.
  months.addEventListener('pointermove', e => {
    if (dragMode === null || e.pointerType === 'mouse') return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el?.classList?.contains('cal-day')) el.dispatchEvent(new PointerEvent('pointerenter'))
  })

  const quick = (text, pick) => h('button', { class: 'chip', type: 'button', onclick: () => { state.days = new Set(pick().slice(0, MAX_DAYS)); sound.tick(); drawCalendar(); refresh() } }, text)
  const upcoming = (n, keep) => { const out = []; for (let i = 0; out.length < n && i < 60; i++) { const d = new Date(today); d.setDate(d.getDate() + i); if (keep(d)) out.push(isoDay(d)) } return out }
  chips.append(
    quick('Next 7 days', () => upcoming(7, () => true)),
    quick('Next 5 weekdays', () => upcoming(5, d => d.getDay() % 6 !== 0)),
    quick('Next weekend', () => upcoming(2, d => d.getDay() % 6 === 0)),
    quick('Clear', () => []))

  // Daily window
  const hours = []
  for (let m = 0; m <= 1440; m += 30) hours.push(m)
  const fromSel = h('select', { class: 'select', 'aria-label': 'Earliest time' }, hours.slice(0, -1).map(m => h('option', { value: m }, minutes(m))))
  const toSel = h('select', { class: 'select', 'aria-label': 'Latest time' }, hours.slice(1).map(m => h('option', { value: m }, m === 1440 ? 'midnight' : minutes(m))))
  fromSel.value = String(state.start)
  toSel.value = String(state.end)
  const span = h('span', { class: 'span' })
  const timeline = h('div', { class: 'timeline', 'aria-hidden': 'true' }, span, h('div', { class: 'ticks' }, ['0', '6', '12', '18', '24'].map(t => h('span', {}, t))))
  const onWindow = () => {
    let a = Number(fromSel.value), b = Number(toSel.value)
    if (b <= a) { b = Math.min(1440, a + 60); toSel.value = String(b) }
    state.start = a; state.end = b
    refresh()
  }
  fromSel.addEventListener('change', onWindow)
  toSel.addEventListener('change', onWindow)
  const steps = segmented([[15, '15 min'], [30, '30 min'], [60, '1 hour']], state.step, v => {
    state.step = v
    state.start = Math.floor(state.start / v) * v
    state.end = Math.min(1440, Math.ceil(state.end / v) * v)
    fromSel.value = String(state.start)
    toSel.value = String(state.end)
    refresh()
  }, 'Slot length')

  const zoneSel = h('select', { class: 'select', 'aria-label': 'Time zone' })
  const list = zones()
  if (!list.includes(state.tz)) list.unshift(state.tz)
  zoneSel.append(...list.map(z => h('option', { value: z }, z.replace(/_/g, ' '))))
  zoneSel.value = state.tz
  zoneSel.addEventListener('change', () => { state.tz = zoneSel.value; refresh() })

  const summary = h('p', { class: 'summary' })
  const create = h('button', { class: 'button accent big', type: 'submit' }, 'Create plan', icon('arrow'))

  function refresh() {
    const n = state.days.size
    span.style.setProperty('--from', `${(state.start / 1440) * 100}%`)
    span.style.setProperty('--to', `${(state.end / 1440) * 100}%`)
    const slots = (state.end - state.start) / state.step
    summary.replaceChildren(n
      ? h('span', {}, h('strong', {}, `${n} ${n === 1 ? 'date' : 'dates'}`), `, ${minutes(state.start)} to ${state.end === 1440 ? 'midnight' : minutes(state.end)}, in ${slots} slots a day · ${zoneName(state.tz)} time`)
      : 'Pick the dates you could meet.')
    create.disabled = !n
  }

  const form = h('form', { class: 'create', novalidate: true },
    h('div', {},
      h('p', { class: 'kicker' }, 'New plan'),
      h('h1', { class: 'title' }, 'What are we planning?')),
    h('div', { class: 'card create-card' },
      h('label', { class: 'field' }, h('span', {}, 'Name'), title),
      h('label', { class: 'field' }, h('span', {}, 'Note (optional)'), note),
      h('div', { class: 'field' }, h('span', {}, 'Dates'), calendar),
      h('div', { class: 'create-row' },
        h('div', { class: 'window' },
          h('span', { class: 'field' }, h('span', {}, 'Each day, between')),
          h('div', { class: 'window-row' }, fromSel, h('span', { class: 'muted' }, 'and'), toSel),
          timeline),
        h('div', { class: 'window' },
          h('span', { class: 'field' }, h('span', {}, 'Slot length')), steps,
          h('label', { class: 'field' }, h('span', {}, 'Time zone'), zoneSel))),
      h('div', { class: 'create-foot' }, summary, create)))

  form.addEventListener('submit', async e => {
    e.preventDefault()
    if (!title.value.trim()) { title.focus(); toast('Give the plan a name.'); return }
    if (state.start % state.step || state.end % state.step) { toast('That window does not fit the slot length.'); return }
    create.disabled = true
    try {
      const { plan } = await api('/api/plans', {
        method: 'POST',
        body: { title: title.value, note: note.value, days: [...state.days].sort(), start: state.start, end: state.end, step: state.step, tz: state.tz }
      })
      sound.join()
      navigate(`/p/${plan.slug}?new=1`)
    } catch (err) {
      toast(err.message)
      create.disabled = false
    }
  })

  view.append(form)
  drawCalendar()
  refresh()
  const onResize = () => drawCalendar()
  const mq = matchMedia('(max-width: 720px)')
  mq.addEventListener('change', onResize)
  title.focus()
  return { destroy: () => mq.removeEventListener('change', onResize) }
}

function weekStart() {
  try {
    const info = new Intl.Locale(navigator.language).weekInfo || new Intl.Locale(navigator.language).getWeekInfo?.()
    if (info?.firstDay) return info.firstDay % 7
  } catch {}
  return 1
}
