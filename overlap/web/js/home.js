import { h, api, avatar, icon, reducedMotion } from './ui.js'
import { session, signIn } from './app.js'
import { dayLabel, minutes } from './time.js'

export async function homeView(view) {
  document.title = 'overlap'
  const timers = []
  const hero = h('section', { class: 'hero' },
    h('div', { class: 'hero-copy' },
      h('p', { class: 'kicker' }, 'Group scheduling, without the back-and-forth'),
      h('h1', { class: 'display' }, 'Find the time that works for ', h('em', {}, 'everyone'), '.'),
      h('p', { class: 'lede' }, 'Pick a few dates, share one link, and watch everyone’s free time overlap, live. No accounts needed to answer.'),
      h('div', { class: 'hero-actions' },
        session.me
          ? h('a', { class: 'button accent big', href: '/new' }, icon('plus'), 'Plan a meeting')
          : h('button', { class: 'button accent big', type: 'button', onclick: () => signIn('/new') }, 'Sign in to plan a meeting'),
        h('span', { class: 'muted' }, 'Free, private, and gone when you delete it.'))),
    demo(timers))
  view.append(hero)

  if (!session.me) {
    view.append(h('ol', { class: 'steps' },
      step('Pick some dates', 'Choose the days and the hours you could meet. Each plan is one link.'),
      step('Share the link', 'Friends, clients or a whole team open it and paint the times they are free. Just a name, no sign-up.'),
      step('Watch it overlap', 'The best times rise to the top as people answer. Pick one and everyone sees it at once.')))
    return { destroy: () => timers.forEach(clearTimeout) }
  }

  const list = h('div', { class: 'plans' }, h('div', { class: 'skeleton', style: { height: '8.5rem' } }), h('div', { class: 'skeleton', style: { height: '8.5rem' } }))
  view.append(h('section', {},
    h('div', { class: 'section-head' }, h('h2', {}, 'Your plans'), h('a', { class: 'button small quiet', href: '/new' }, icon('plus'), 'New plan')),
    list))
  try {
    const { owned, joined } = await api('/api/plans')
    const all = [...owned, ...joined]
    if (!all.length) {
      list.replaceWith(h('div', { class: 'card empty' },
        h('h3', { class: 'title' }, 'No plans yet'),
        h('p', {}, 'Start one, and it will wait here for you.'),
        h('a', { class: 'button accent', href: '/new' }, icon('plus'), 'Plan a meeting')))
    } else list.replaceChildren(...all.map((plan, i) => planCard(plan, i)))
  } catch (e) {
    list.replaceChildren(h('p', { class: 'muted' }, e.message))
  }
  return { destroy: () => timers.forEach(clearTimeout) }
}

const step = (title, text) => h('li', { class: 'card' }, h('h3', {}, title), h('p', {}, text))

function planCard(plan, i) {
  const dates = plan.days.length === 1 ? dayLabel(plan.days[0]) : `${dayLabel(plan.days[0])} – ${dayLabel(plan.days.at(-1))}`
  return h('a', { class: 'card plan-card', href: `/p/${plan.slug}`, vars: { '--i': String(i) } },
    h('h3', {}, plan.title),
    h('div', { class: 'meta' },
      h('span', {}, dates),
      h('span', {}, `${minutes(plan.start)} – ${minutes(plan.end)}`)),
    h('div', { class: 'meta' },
      plan.final ? h('span', { class: 'badge gold' }, 'Settled') : h('span', { class: 'badge' }, `${plan.people} ${plan.people === 1 ? 'person' : 'people'}`),
      plan.mine ? null : h('span', { class: 'badge' }, `by ${plan.ownerName}`)))
}

// A looping sketch of the grid: three people answer, the heat builds, and the
// slot that suits all three lights up.
function demo(timers) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const rows = 8
  const people = [
    { name: 'Ana', color: 0, cells: [[0, 1], [0, 2], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [3, 3], [3, 4], [3, 5], [4, 5], [4, 6]] },
    { name: 'Ben', color: 1, cells: [[1, 3], [1, 4], [2, 4], [2, 5], [3, 2], [3, 3], [3, 4], [4, 0], [4, 1], [0, 6], [0, 7]] },
    { name: 'Chloé', color: 2, cells: [[0, 2], [3, 3], [3, 4], [2, 5], [2, 6], [1, 4], [4, 6], [4, 7], [1, 0]] }
  ]
  const grid = h('div', { class: 'demo-grid', 'aria-hidden': 'true' }, h('span'))
  days.forEach(d => grid.append(h('span', { class: 'dlabel' }, d)))
  const cells = []
  for (let r = 0; r < rows; r++) {
    grid.append(h('span', { class: 'tlabel' }, r % 2 ? '' : minutes(540 + r * 30).replace(/:00(?=\D|$)/, '')))
    cells[r] = days.map(() => { const c = h('span', { class: 'dcell' }); grid.append(c); return c })
  }
  const faces = h('span', { class: 'stack' })
  const caption = h('span', {}, 'Waiting for answers…')
  const card = h('div', { class: 'card demo' },
    h('div', { class: 'demo-head' }, h('span', { class: 'demo-title' }, 'Book club'), faces),
    grid,
    h('div', { class: 'demo-foot' }, caption, h('span', { class: 'badge live' }, 'Live')))

  const counts = () => cells.map(row => row.map(() => 0))
  function run() {
    let heat = counts()
    faces.replaceChildren()
    caption.textContent = 'Waiting for answers…'
    cells.flat().forEach(c => { c.style.setProperty('--h', '0'); c.classList.remove('best') })
    let t = 500
    people.forEach((p, i) => {
      timers.push(setTimeout(() => { faces.append(avatar(p, '1.6rem')); caption.textContent = `${p.name} is adding times…` }, t))
      for (const [d, r] of p.cells) {
        t += 90
        timers.push(setTimeout(() => {
          heat[r][d]++
          cells[r][d].style.setProperty('--h', String(heat[r][d] / 3))
        }, t))
      }
      t += 600
    })
    timers.push(setTimeout(() => {
      for (const r of [3, 4]) cells[r][3].classList.add('best')
      caption.replaceChildren(h('strong', {}, `Thu ${minutes(540 + 90)}`), ' works for all three')
    }, t + 200))
    timers.push(setTimeout(run, t + 4200))
  }
  if (reducedMotion()) {
    const heat = counts()
    for (const p of people) for (const [d, r] of p.cells) heat[r][d]++
    cells.forEach((row, r) => row.forEach((c, d) => c.style.setProperty('--h', String(heat[r][d] / 3))))
    for (const r of [3, 4]) cells[r][3].classList.add('best')
    people.forEach(p => faces.append(avatar(p, '1.6rem')))
    caption.replaceChildren(h('strong', {}, `Thu ${minutes(630)}`), ' works for all three')
  } else timers.push(setTimeout(run, 300))
  return card
}
