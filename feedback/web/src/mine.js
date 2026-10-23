// Your feedback: what the signed-in person sent with an email they confirmed
// by code, on every project, and where each one stands. Nothing the team
// keeps to itself shows here.
import { el, api, ago, glyph, inkOn, STATUS, KIND } from './lib.js'
import { show } from './app.js'
import { viewer, signIn } from './account.js'
import { mark } from './icons.js'

const head = (...lede) => el('section', { class: 'page-head compact' }, el('h1', {}, 'Your feedback'), el('p', { class: 'lede' }, ...lede))

export async function minePage() {
  document.title = 'Your feedback – feedback'
  if (!viewer().me) {
    return show(head('Sign in with the email you sent feedback from, and confirmed with a code, to see everything you sent and where it stands.'),
      el('p', {}, el('button', { type: 'button', class: 'button primary large', onclick: () => signIn().catch(() => {}) }, 'Sign in')))
  }
  show(head('Everything you sent with a confirmed email, newest first.'), el('p', { class: 'muted page-loading' }, 'Loading…'))
  let data
  try {
    data = await api('GET', '/api/mine')
  } catch (problem) {
    return show(head(problem.message))
  }
  const { email, projects } = data
  if (!email) return show(head('Your account has no email address, so there’s nothing to match. Sign in with the address you sent feedback from.'))
  if (!projects.length) {
    return show(head('Feedback you send with ', el('strong', {}, email), ' shows up here once you confirm it with the code we email you.'))
  }
  show(head('What you sent from ', el('strong', {}, email), ', newest first.'),
    projects.map(project => el('section', { class: 'mine-project', 'aria-label': project.name, style: `--color: ${project.color}; --color-ink: ${inkOn(project.color)}` },
      el('header', { class: 'mine-head' }, mark(project, 'project-mark'), el('h2', {}, project.name),
        el('span', { class: 'muted' }, `${project.items.length} sent`)),
      el('ol', { class: 'mine-items' }, project.items.map(item => el('li', {}, itemCard(project, item)))))))
}

// One item: what they sent, then their conversation with the team, and a
// box to answer. A one-line message is its title already, so it isn't
// repeated.
function itemCard(project, item) {
  const talk = el('ol', { class: 'mine-talk' })
  const paint = conversation => talk.replaceChildren(...conversation.map(entry => el('li', { class: entry.from === 'you' ? 'from-you' : 'from-team' },
    el('div', { class: 'note-by' }, el('strong', {}, entry.from === 'you' ? 'You' : project.name), el('span', { class: 'muted' }, ago(entry.createdAt))),
    el('p', {}, entry.body))))
  paint(item.conversation || [])
  const words = el('textarea', { rows: '2', maxlength: '4000', placeholder: `Write to ${project.name}`, 'aria-label': `Write to ${project.name}` })
  const reply = el('form', { class: 'add-note', onsubmit: async event => {
    event.preventDefault()
    if (!words.value.trim()) return
    try {
      paint((await api('POST', `/api/mine/${item.id}/replies`, { body: words.value })).conversation)
      words.value = ''
    } catch (problem) { alert(problem.message) }
  } }, words, el('button', { type: 'submit', class: 'button' }, 'Send'))
  const replies = (item.conversation || []).filter(entry => entry.from === 'team').length
  return el('details', { open: replies > 0 || null },
    el('summary', {},
      el('span', { class: 'mine-kind' }, glyph(item.kind), el('span', {}, '#' + item.number)),
      el('span', { class: 'mine-title' }, item.title,
        el('span', { class: 'muted' }, `${KIND[item.kind] || 'Feedback'}, ${ago(item.createdAt)}`, replies ? `, ${replies} ${replies === 1 ? 'reply' : 'replies'}` : '')),
      el('span', { class: `pill status-${item.status}` }, STATUS[item.status] || item.status)),
    el('div', { class: 'mine-open' },
      item.body && item.body.trim() !== item.title && el('p', { class: 'mine-body' }, item.body),
      talk, reply,
      !item.emails && el('p', { class: 'muted mine-note' }, 'You stopped emails about this one; replies still show here.')))
}

// From a reply email: stop emails about that item, after a click (link
// checkers that open the link change nothing).
export function stopPage(token) {
  document.title = 'Stop emails – feedback'
  const status = el('p', { class: 'lede' }, 'You’ll stop getting emails about this item. Replies still show in Your feedback when you sign in.')
  const button = el('button', { type: 'button', class: 'button primary large', onclick: async () => {
    button.disabled = true
    try {
      const reply = await api('POST', '/api/stop', { token })
      status.textContent = `Done. No more emails about it${reply.project ? ` from ${reply.project}` : ''}.`
      button.remove()
    } catch (problem) {
      status.textContent = problem.message
      button.disabled = false
    }
  } }, 'Stop emails')
  show(el('section', { class: 'page-head' }, el('h1', {}, 'Stop emails?'), status, button))
}
