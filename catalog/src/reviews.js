// Ratings and reviews on an app's page. Anyone signed in can write one; it
// appears to others once an admin approves it.
import { $, el, api, stars, date } from './lib.js'
import { viewer, signIn } from './account.js'

function reviewCard(review, extra = []) {
  return el('li', { class: 'review' + (review.status ? ' mine' : '') },
    review.status && el('span', { class: 'review-state' }, review.status === 'rejected' ? 'Not published' : 'Waiting for approval'),
    el('div', { class: 'review-top' },
      el('h3', {}, review.title || 'Review'),
      el('time', { datetime: review.date }, date(review.date))),
    stars(review.rating),
    review.body && el('p', {}, review.body),
    el('div', { class: 'review-by' }, el('img', { src: review.avatar, alt: '', referrerpolicy: 'no-referrer' }), review.name),
    extra.length > 0 && el('div', { class: 'review-actions' }, extra))
}

// The page can be redrawn while the form is open (signing in does that), so
// the form refreshes whichever reviews section is current.
let refreshCurrent = () => {}

export function reviewsSection(app) {
  const section = el('section', { class: 'reviews', 'aria-labelledby': 'reviews-title' })
  const paint = data => {
    const rating = app.rating
    const own = data && data.mine
    const write = el('button', { type: 'button', class: 'button', onclick: () => openForm(app, own) },
      own ? 'Edit your review' : 'Write a review')
    section.replaceChildren(
      el('div', { class: 'section-head' }, el('h2', { id: 'reviews-title' }, 'Ratings and reviews'), write),
      rating
        ? el('div', { class: 'summary' }, el('strong', {}, rating.average.toFixed(1)),
            el('div', {}, stars(rating.average), el('span', { class: 'count' }, `out of 5, from ${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}`)))
        : el('p', { class: 'rating-meta' }, data ? 'No reviews yet. Tried it? Write the first one.' : 'Loading reviews…'),
      data && el('ul', { class: 'review-list' },
        own && own.status !== 'approved' && reviewCard(own, [
          el('button', { type: 'button', class: 'button', onclick: () => openForm(app, own) }, 'Edit'),
          el('button', { type: 'button', class: 'button danger', onclick: () => removeOwn(app) }, 'Delete')
        ]),
        data.reviews.map(review => reviewCard(review))))
  }
  const refresh = async () => {
    try { paint(await api('GET', '/api/reviews/' + app.path)) } catch { paint({ reviews: [], mine: null }) }
  }
  refreshCurrent = refresh
  paint(null)
  refresh()
  return section
}

async function removeOwn(app) {
  if (!confirm('Delete your review?')) return
  try { await api('DELETE', '/api/reviews/' + app.path) } catch {}
  refreshCurrent()
}

async function openForm(app, existing) {
  if (!viewer().me) {
    try { await signIn() } catch { return }
  }
  const dialog = $('#review')
  let rating = existing ? existing.rating : 0
  const pick = el('div', { class: 'star-pick', role: 'radiogroup', 'aria-label': 'Your rating' })
  const paintStars = () => pick.replaceChildren(...[1, 2, 3, 4, 5].map(n => el('button', {
    type: 'button', role: 'radio', class: n <= rating ? 'on' : null,
    'aria-checked': String(n === rating), 'aria-label': `${n} star${n === 1 ? '' : 's'}`,
    onclick: () => { rating = n; paintStars() }
  }, '★')))
  paintStars()
  const title = el('input', { name: 'title', maxlength: '80', value: existing ? existing.title : '', autocomplete: 'off' })
  const words = el('textarea', { name: 'body', maxlength: '2000' })
  words.value = existing ? existing.body : ''
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true })
  const submit = el('button', { type: 'submit', class: 'button primary' }, existing ? 'Send changes' : 'Submit review')
  const form = el('form', { onsubmit: async event => {
    event.preventDefault()
    if (!rating) { error.textContent = 'Choose one to five stars.'; error.hidden = false; return }
    submit.disabled = true
    try {
      await api('PUT', '/api/reviews/' + app.path, { rating, title: title.value, body: words.value })
      dialog.close()
      refreshCurrent()
    } catch (problem) {
      error.textContent = problem.message
      error.hidden = false
      submit.disabled = false
    }
  } },
    pick,
    el('label', { class: 'field' }, el('span', {}, 'Title'), title),
    el('label', { class: 'field' }, el('span', {}, 'Review'), words),
    el('p', { class: 'form-note' }, 'Reviews appear once an admin approves them. Your name and picture are shown with it.'),
    error,
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'button', onclick: () => dialog.close() }, 'Cancel'),
      submit))
  dialog.replaceChildren(el('div', { class: 'sheet-inner' },
    el('header', { class: 'sheet-head' },
      el('div', {}, el('h2', { id: 'review-title' }, existing ? 'Edit your review' : 'Review ' + app.title),
        el('p', {}, 'As ' + viewer().me.name))),
    form))
  dialog.showModal()
}

$('#review').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close()
})
