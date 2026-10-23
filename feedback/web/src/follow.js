// After sending with an email, the thank-you grows a code step: a code goes
// to that address, and entering it lets the sender follow what they sent
// (replies by email, and "Your feedback" when signed in with it). Skipping
// it changes nothing. Holm's challenge for sending the code is solved here,
// in the background, from the app's own /_holm/challenge.js.
import { el } from './lib.js'

const WAIT = 30

let solver = null
const loadSolver = () => (solver ||= import('/_holm/challenge.js'))

async function call(operation, input, headers = {}) {
  const response = await fetch('/api/' + operation, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input)
  })
  const reply = await response.json().catch(() => ({}))
  if (!response.ok || reply.ok === false) throw new Error(reply.error?.message || 'That didn’t work. Try again.')
  return reply
}

async function sendCode(token) {
  const { fetchChallenge, solve } = await loadSolver()
  const proof = await solve(await fetchChallenge('follow.send'))
  return call('follow.send', { token }, proof)
}

export function followStep({ token, email }) {
  const note = el('p', {}, 'Sending a code to ', el('strong', {}, email), '…')
  const code = el('input', {
    class: 'follow-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6',
    placeholder: '······', 'aria-label': 'The 6-digit code from the email', disabled: true
  })
  const error = el('p', { class: 'error', role: 'alert', hidden: true })
  const again = el('button', { type: 'button', class: 'follow-link', disabled: true, onclick: () => request() })
  const skip = el('button', { type: 'button', class: 'follow-link', onclick: () => box.remove() }, 'Skip')
  const box = el('section', { class: 'follow', 'aria-label': 'Follow replies' },
    el('h3', {}, 'Follow replies?'), note, code, error, el('div', { class: 'follow-actions' }, again, skip))
  const fail = message => { error.textContent = message; error.hidden = false }

  let timer = null
  const countdown = () => {
    let left = WAIT
    clearInterval(timer)
    const paint = () => {
      again.disabled = left > 0
      again.textContent = left > 0 ? `New code in ${left}s` : 'Send a new code'
    }
    paint()
    timer = setInterval(() => { left--; paint(); if (left <= 0) clearInterval(timer) }, 1000)
  }

  async function request() {
    error.hidden = true
    again.disabled = true
    try {
      const reply = await sendCode(token)
      if (reply.verified) return done()
      note.replaceChildren('We sent a code to ', el('strong', {}, email), '. Enter it to get replies by email and see what you’ve sent, any time.')
      code.disabled = false
      code.value = ''
      code.focus({ preventScroll: true })
    } catch (problem) {
      note.replaceChildren('Get replies by email at ', el('strong', {}, email), '?')
      fail(problem.message)
    }
    countdown()
  }

  // Six digits check themselves, typed or pasted.
  code.addEventListener('input', async () => {
    code.value = code.value.replace(/\D/g, '').slice(0, 6)
    error.hidden = true
    if (code.value.length < 6) return
    code.disabled = true
    try {
      await call('follow.verify', { token, code: code.value })
      done()
    } catch (problem) {
      fail(problem.message)
      code.disabled = false
      code.select()
    }
  })

  function done() {
    clearInterval(timer)
    box.classList.add('followed')
    box.replaceChildren(
      el('h3', {}, 'You’re following it'),
      el('p', {}, 'Replies go to ', el('strong', {}, email), '. Sign in to feedback with this email to see everything you’ve sent.'),
      el('a', { class: 'follow-link', href: `${location.origin}/mine`, target: '_blank', rel: 'noopener' }, 'Your feedback'))
  }

  request()
  return box
}
