// The feedback form, shared by the panel on a site (widget.js) and a
// project's own page (board.js): kind, message, files and an email.
import { el, glyph, size, KIND, KIND_SETS } from './lib.js'

const PROMPTS = {
  bug: 'What went wrong? What did you expect to happen?',
  idea: 'What would make this better?',
  question: 'What would you like to know?',
  praise: 'What did you love?',
  problem: 'What went wrong? Where, and when?'
}
const MAX_FILES = 4
const MAX_TOTAL = 8 * 1024 * 1024
const ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/csv,application/json,.txt,.log,.csv,.json,.heic,.mov'

// Big photos shrink before they're sent: at most 2048 pixels a side, as JPEG.
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// On a phone, a camera button: one tap to a photo.
const touch = () => matchMedia('(pointer: coarse)').matches

// Options: endpoint to POST to, the project's kinds, whether files are
// allowed, preview (sends nothing), extra context fields, and onSent(number)
// once it's in.
export function composer({ endpoint, kinds = KIND_SETS.site, attachments = true, preview = false, context = {}, onSent, fine }) {
  // A place starts on praise; a site on an idea.
  let kind = kinds.includes('praise') ? 'praise' : 'idea'
  const files = []
  const message = el('textarea', { name: 'body', required: true, maxlength: '4000', rows: '5' })
  const email = el('input', { name: 'email', type: 'email', autocomplete: 'email', maxlength: '200', placeholder: 'you@example.com' })
  const trap = el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', class: 'trap', 'aria-hidden': 'true' })
  const error = el('p', { class: 'error', role: 'alert', hidden: true })
  const send = el('button', { type: 'submit', class: 'send' }, 'Send')
  const showError = text => { error.textContent = text; error.hidden = false }

  const choices = el('div', { class: 'kinds', role: 'radiogroup', 'aria-label': 'Kind of feedback' })
  const paintKinds = () => {
    message.placeholder = PROMPTS[kind]
    message.setAttribute('aria-label', PROMPTS[kind])
    choices.replaceChildren(...kinds.map(id => el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(id === kind),
      onclick: () => { kind = id; paintKinds() }
    }, glyph(id), KIND[id])))
  }
  paintKinds()

  const list = el('ul', { class: 'files', hidden: true })
  const paintFiles = () => {
    list.hidden = !files.length
    list.replaceChildren(...files.map((entry, index) => el('li', {},
      entry.url ? el('img', { src: entry.url, alt: '' }) : glyph('file', 'glyph line'),
      el('span', { class: 'file-name' }, entry.file.name),
      el('span', { class: 'file-size' }, size(entry.file.size)),
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
  const picker = el('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true, onchange: () => { add([...picker.files]); picker.value = '' } })
  const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { add([...camera.files]); camera.value = '' } })
  const attachRow = attachments && el('div', { class: 'attach-row' },
    touch() && el('button', { type: 'button', class: 'attach camera', onclick: () => camera.click() }, glyph('camera', 'glyph line'), 'Take a photo'),
    el('button', { type: 'button', class: 'attach', onclick: () => picker.click() }, glyph('clip', 'glyph line'), 'Add files'),
    el('span', { class: 'attach-hint' }, 'Pictures, videos or PDFs, 8 MB'),
    picker, camera)

  const onSubmit = async event => {
    event.preventDefault()
    error.hidden = true
    if (message.value.trim().length < 3 && !files.length) { showError(attachments ? 'Write a few words or add a photo.' : 'Write a few words first.'); message.focus(); return }
    if (preview) return onSent(null)
    send.disabled = true
    send.textContent = files.length ? 'Uploading…' : 'Sending…'
    try {
      const fields = { kind, body: message.value, email: email.value, website: trap.value, ...context }
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
      send.textContent = 'Send'
    }
  }

  const form = el('form', { class: 'compose', onsubmit: onSubmit, novalidate: true },
    choices,
    message,
    attachRow,
    list,
    el('label', { class: 'field' }, el('span', {}, 'Email, if you’d like a reply'), email),
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
