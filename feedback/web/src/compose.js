// The feedback form, shared by the panel on a site (widget.js) and a
// project's own page (board.js): kind, a star rating, message, files, the
// project's own questions and contact details.
import { el, glyph, size, picker, KIND, KIND_SETS } from './lib.js'

const PROMPTS = {
  issue: 'What went wrong? What did you expect to happen?',
  idea: 'What would make this better?',
  question: 'What would you like to know?',
  praise: 'What did you love?',
  problem: 'What went wrong? Where, and when?'
}
const MAX_FILES = 4
const MAX_TOTAL = 8 * 1024 * 1024
const ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/csv,application/json,.txt,.log,.csv,.json,.heic,.mov'

// The rating is feed-stars, Holm's own star component, from its CDN: pinned
// to one commit of github.com/holmhq/cdn and checked against its hash. If it
// can't load, plain stars stand in.
const STARS = 'https://cdn.jsdelivr.net/gh/holmhq/cdn@9a7a089cadc57f338f393ec56e1460cbd725b0ce/libs/ui/feed-stars/v-0.0.3/feed-stars.min.mjs'
const STARS_HASH = 'sha384-ViNwawf1ukR3jQWH/hYZkg5R8mas5aCtmGgDEjozYHpcOyeGvF1divll69B62K3E'
const RATING_WORDS = ['', 'Bad', 'Not great', 'Okay', 'Good', 'Great']
let starsLoading = null
export function loadStars() {
  starsLoading ||= new Promise(resolve => {
    if (customElements.get('feed-stars')) return resolve(true)
    const script = el('script', { type: 'module', src: STARS, integrity: STARS_HASH, crossorigin: 'anonymous' })
    script.addEventListener('load', () => customElements.whenDefined('feed-stars').then(() => resolve(true)))
    script.addEventListener('error', () => resolve(false))
    setTimeout(() => resolve(!!customElements.get('feed-stars')), 6000)
    document.head.append(script)
  })
  return starsLoading
}

// The words above the stars, when the owner hasn't written their own.
export const ratingLabel = (rating, place) => rating.label || (place ? 'How was your visit?' : 'How are we doing?')

// One to five stars. feed-stars lights the one picked, with a face that
// goes from glum to delighted; the stand-in fills up to it.
function ratingInput(onChange) {
  let value = 0
  const word = el('span', { class: 'rating-word', 'aria-live': 'polite' })
  const set = n => { value = n; word.textContent = RATING_WORDS[n]; onChange() }
  const slot = el('div', { class: 'rating-stars' })
  const plain = () => {
    const buttons = [1, 2, 3, 4, 5].map(n => el('button', {
      type: 'button', role: 'radio', 'aria-label': `${n} ${n === 1 ? 'star' : 'stars'}`,
      onclick: () => { set(n === value ? 0 : n); paint() }
    }, glyph('star')))
    const paint = () => buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i + 1 === value))
      button.classList.toggle('lit', i < value)
    })
    paint()
    return el('div', { class: 'plain-stars', role: 'radiogroup', 'aria-label': 'Rating' }, buttons)
  }
  loadStars().then(ready => {
    if (!ready) return slot.replaceChildren(plain())
    const element = document.createElement('feed-stars')
    element.setAttribute('aria-label', 'Rating')
    element.addEventListener('change', event => set(event.detail.value))
    slot.replaceChildren(element)
  })
  return { node: el('div', { class: 'rating-row' }, slot, word), read: () => value, focus: () => slot.scrollIntoView({ block: 'nearest' }) }
}

// Big photos shrink before they're sent: at most 2048 pixels a side, as JPEG.
// iPhone photos arrive as HEIC, which most browsers can't show, so they become
// JPEG whatever their size. Safari decodes HEIC; where a browser can't, the
// original is sent as it is.
async function shrink(file) {
  const heic = /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name)
  if (!heic && (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob || (!heic && blob.size >= file.size)) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

let uid = 0
const nextId = () => 'q' + (++uid)
const required = on => on && el('span', { class: 'required', 'aria-hidden': 'true' }, ' *')

// One of the project's own questions, and how to read its answer.
function question(field) {
  const id = nextId()
  if (field.type === 'text') {
    const input = el('input', { id, maxlength: '200', required: field.required })
    return { node: el('label', { class: 'field', for: id }, el('span', {}, field.label, required(field.required)), input), read: () => input.value.trim(), focus: input }
  }
  if (field.type === 'select') {
    const choice = picker({ label: field.label, value: '', options: [{ value: '', label: 'Choose…' }, ...field.options.map(option => ({ value: option, label: option }))] })
    return { node: el('div', { class: 'field' }, el('span', {}, field.label, required(field.required)), choice), read: () => choice.value, focus: choice.querySelector('button') }
  }
  if (field.type === 'checkbox' && !field.options.length) {
    const box = el('input', { type: 'checkbox', id })
    return { node: el('label', { class: 'check-one', for: id }, box, el('span', {}, field.label, required(field.required))), read: () => box.checked, focus: box }
  }
  // One choice (radio) or several (checkbox), as pills.
  const type = field.type === 'radio' ? 'radio' : 'checkbox'
  const inputs = field.options.map(option => el('input', { type, name: id, value: option }))
  return {
    node: el('fieldset', { class: 'field choices' }, el('legend', {}, field.label, required(field.required)),
      el('div', { class: 'pills' }, inputs.map((input, i) => el('label', {}, input, el('span', {}, field.options[i]))))),
    read: () => type === 'radio' ? (inputs.find(input => input.checked)?.value || '') : inputs.filter(input => input.checked).map(input => input.value),
    focus: inputs[0]
  }
}

// On a phone, a camera button: one tap to a photo.
const touch = () => matchMedia('(pointer: coarse)').matches

// Options: endpoint to POST to, the project's kinds, its own questions,
// which contact details to ask for, its rating, whether files are allowed,
// preview (sends nothing), extra context fields, and onSent(number) once
// it's in.
export function composer({ endpoint, kinds = KIND_SETS.site, fields = [], contact = { email: 'optional', phone: 'off' }, rating = { ask: 'off', label: '' }, attachments = true, preview = false, context = {}, onSent, fine }) {
  const place = kinds.includes('praise')
  // A place starts on praise; a site on an idea.
  let kind = place ? 'praise' : 'idea'
  const files = []
  const message = el('textarea', { name: 'body', maxlength: '4000', rows: '3' })
  const email = el('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: '200', placeholder: 'you@example.com' })
  const phone = el('input', { name: 'phone', type: 'tel', autocomplete: 'tel', maxlength: '30', placeholder: '+1 555 123 4567' })
  const questions = fields.map(field => ({ field, ...question(field) }))
  const contactField = (input, ask, optional, needed) => ask !== 'off' &&
    el('label', { class: 'field' }, el('span', {}, ask === 'required' ? needed : optional, required(ask === 'required')), input)
  const trap = el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'trap', 'aria-hidden': 'true' })
  const error = el('p', { class: 'error', role: 'alert', hidden: true })
  const sendText = el('span', {}, 'Send')
  const send = el('button', { type: 'submit', class: 'send' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), sendText, glyph('arrow', 'glyph line'))
  const showError = text => { error.textContent = text; error.hidden = false }

  // The kinds: a segmented control whose thumb slides to the choice.
  const kindButtons = kinds.map(id => el('button', {
    type: 'button', role: 'radio', onclick: () => pickKind(id)
  }, glyph(id), el('span', {}, KIND[id])))
  const choices = el('div', { class: 'kinds', role: 'radiogroup', 'aria-label': 'Kind of feedback', style: `--count: ${kinds.length}` },
    el('span', { class: 'kinds-thumb', 'aria-hidden': 'true' }), kindButtons)
  const pickKind = id => {
    kind = id
    message.placeholder = PROMPTS[kind]
    message.setAttribute('aria-label', PROMPTS[kind])
    choices.style.setProperty('--index', kinds.indexOf(kind))
    kindButtons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(kinds[i] === kind))
      button.tabIndex = kinds[i] === kind ? 0 : -1
    })
  }
  choices.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const index = (kinds.indexOf(kind) + step + kinds.length) % kinds.length
    pickKind(kinds[index])
    kindButtons[index].focus()
  })
  pickKind(kind)

  const stars = rating.ask !== 'off' && ratingInput(() => { error.hidden = true })
  const ratingField = stars && el('div', { class: 'field rating' },
    el('span', {}, ratingLabel(rating, place), required(rating.ask === 'required')), stars.node)

  // The message grows with what's written, up to a point.
  const grow = () => {
    message.style.height = 'auto'
    message.style.height = Math.min(message.scrollHeight + 2, 260) + 'px'
  }
  message.addEventListener('input', grow)

  const list = el('ul', { class: 'files', hidden: true })
  const paintFiles = () => {
    list.hidden = !files.length
    list.replaceChildren(...files.map((entry, index) => el('li', { class: entry.url ? 'shot' : 'doc' },
      entry.url ? el('img', { src: entry.url, alt: entry.file.name }) : glyph('file', 'glyph line'),
      !entry.url && el('span', { class: 'file-name' }, entry.file.name),
      !entry.url && el('span', { class: 'file-size' }, size(entry.file.size)),
      el('button', {
        type: 'button', class: 'remove', 'aria-label': `Remove ${entry.file.name}`,
        onclick: () => { if (entry.url) URL.revokeObjectURL(entry.url); files.splice(index, 1); paintFiles() }
      }, glyph('x', 'glyph line')))))
  }
  async function add(incoming) {
    error.hidden = true
    for (const raw of incoming) {
      if (files.length >= MAX_FILES) { showError(`Attach up to ${MAX_FILES} files.`); break }
      const file = await shrink(raw)
      if (files.reduce((total, entry) => total + entry.file.size, 0) + file.size > MAX_TOTAL) { showError('Files can add up to 8 MB.'); continue }
      files.push({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    }
    paintFiles()
  }
  const chooser = el('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true, onchange: () => { add([...chooser.files]); chooser.value = '' } })
  const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { add([...camera.files]); camera.value = '' } })
  // Files attach from the message box's own toolbar.
  const tools = attachments && el('div', { class: 'message-tools' },
    touch() && el('button', { type: 'button', class: 'tool camera', onclick: () => camera.click() }, glyph('camera', 'glyph line'), 'Photo'),
    el('button', { type: 'button', class: 'tool', onclick: () => chooser.click(), title: 'Pictures, videos, PDFs or text, up to 8 MB' }, glyph('clip', 'glyph line'), 'Attach'),
    el('span', { class: 'attach-hint' }, touch() ? 'Up to 8 MB' : 'or paste or drop, up to 8 MB'),
    chooser, camera)
  const box = el('div', { class: 'message' }, message, tools)

  const onSubmit = async event => {
    event.preventDefault()
    error.hidden = true
    const given = stars ? stars.read() : 0
    if (message.value.trim().length < 3 && !files.length && !given) {
      showError(stars ? 'Pick a rating or write a few words.' : attachments ? 'Write a few words or add a photo.' : 'Write a few words first.')
      message.focus()
      return
    }
    if (rating.ask === 'required' && !given) { showError('Please pick a rating.'); stars.focus(); return }
    const answers = {}
    for (const { field, read, focus } of questions) {
      const value = read()
      if (field.required && (Array.isArray(value) ? !value.length : !value)) { showError(`Please answer “${field.label}”.`); focus.focus(); return }
      answers[field.id] = value
    }
    if (contact.email === 'required' && !email.value.trim()) { showError('Please leave your email.'); email.focus(); return }
    if (contact.phone === 'required' && !phone.value.trim()) { showError('Please leave your phone number.'); phone.focus(); return }
    if (preview) return onSent(null)
    send.disabled = true
    send.classList.add('busy')
    sendText.textContent = files.length ? 'Uploading…' : 'Sending…'
    try {
      const fields = { kind, body: message.value, email: email.value, phone: phone.value, answers: JSON.stringify(answers), website: trap.value, ...context }
      if (given) fields.rating = String(given)
      let request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }
      if (files.length) {
        const data = new FormData()
        for (const [key, value] of Object.entries(fields)) data.append(key, value)
        files.forEach((entry, index) => data.append('file' + index, entry.file, entry.file.name))
        request = { method: 'POST', body: data }
      }
      const response = await fetch(endpoint, request)
      const reply = await response.json().catch(() => ({}))
      if (!response.ok || !reply.ok) throw new Error(reply.error?.message || 'It didn’t send. Try again.')
      files.forEach(entry => entry.url && URL.revokeObjectURL(entry.url))
      onSent(reply.number || null)
    } catch (problem) {
      showError(problem.message)
      send.disabled = false
      send.classList.remove('busy')
      sendText.textContent = 'Send'
    }
  }

  const contacts = [contactField(email, contact.email, 'Email, if you’d like a reply', 'Your email'),
    contactField(phone, contact.phone, 'Phone, if you’d like a call', 'Your phone number')].filter(Boolean)
  const form = el('form', { class: 'compose', onsubmit: onSubmit, novalidate: true },
    choices,
    ratingField,
    box,
    list,
    questions.map(entry => entry.node),
    contacts.length > 0 && el('div', { class: 'contacts' }, contacts),
    trap,
    error,
    send,
    fine && el('p', { class: 'fine' }, fine))

  // Pasted and dropped files attach too.
  if (attachments) {
    message.addEventListener('paste', event => {
      const pasted = [...(event.clipboardData?.files || [])]
      if (pasted.length) { event.preventDefault(); add(pasted) }
    })
    form.addEventListener('dragover', event => { event.preventDefault(); form.classList.add('dropping') })
    form.addEventListener('dragleave', event => { if (!form.contains(event.relatedTarget)) form.classList.remove('dropping') })
    form.addEventListener('drop', event => {
      event.preventDefault()
      form.classList.remove('dropping')
      add([...(event.dataTransfer?.files || [])])
    })
  }
  return form
}

// A tick that draws itself, for "it's sent".
export function sentMark() {
  const ns = 'http://www.w3.org/2000/svg'
  const mark = document.createElementNS(ns, 'svg')
  mark.setAttribute('viewBox', '0 0 52 52')
  mark.setAttribute('class', 'sent-mark')
  mark.setAttribute('aria-hidden', 'true')
  mark.innerHTML = '<circle cx="26" cy="26" r="24"/><path d="M15 27.5l7 7 15-16"/>'
  return mark
}
