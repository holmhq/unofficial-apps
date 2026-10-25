// A project's form: which contact details to ask for, a star rating, and up
// to eight questions of its own (a short answer, a dropdown, one choice, or
// checkboxes), checked when they're set and again when someone answers.
import { text, reject, random } from './lib.js'

export const FIELD_TYPES = ['text', 'select', 'radio', 'checkbox']
const MAX_FIELDS = 8
const MAX_OPTIONS = 12
const ASK = ['off', 'optional', 'required']
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const PHONE = /^\+?[\d\s().-]{6,24}$/

export const contactOf = doc => ({ email: 'optional', phone: 'off', ...(doc.contact || {}) })
export const fieldsOf = doc => doc.fields || []
export const ratingOf = doc => ({ ask: 'off', label: '', ...(doc.rating || {}) })

export function contactSetting(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_contact', 'Contact is { email, phone }.')
  const out = {}
  for (const key of ['email', 'phone']) {
    out[key] = ASK.includes(value[key]) ? value[key] : reject(400, 'invalid_contact', `Asking for ${key} is off, optional or required.`)
  }
  return out
}

// Whether to ask for one to five stars, and the words above them (empty
// means the form's own, which suits a site or a place).
export function ratingSetting(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_rating', 'Rating is { ask, label }.')
  const ask = ASK.includes(value.ask) ? value.ask : reject(400, 'invalid_rating', 'Asking for a rating is off, optional or required.')
  return { ask, label: text(value.label, 60) }
}

export function fieldsSetting(value) {
  if (!Array.isArray(value)) reject(400, 'invalid_fields', 'Questions are a list.')
  if (value.length > MAX_FIELDS) reject(400, 'too_many_fields', `A form can have up to ${MAX_FIELDS} questions.`)
  const seen = new Set()
  return value.map(field => {
    if (!field || typeof field !== 'object') reject(400, 'invalid_field', 'A question is an object.')
    const type = FIELD_TYPES.includes(field.type) ? field.type : reject(400, 'invalid_field', 'A question is text, select, radio or checkbox.')
    const label = text(field.label, 80) || reject(400, 'invalid_field', 'Every question needs a label.')
    const options = type === 'text' ? [] : [...new Set((Array.isArray(field.options) ? field.options : []).map(option => text(option, 60)).filter(Boolean))]
    if (options.length > MAX_OPTIONS) reject(400, 'invalid_field', `“${label}” can have up to ${MAX_OPTIONS} choices.`)
    if ((type === 'select' || type === 'radio') && options.length < 2) reject(400, 'invalid_field', `“${label}” needs at least two choices.`)
    const id = /^[a-z0-9]{6,12}$/.test(field.id || '') && !seen.has(field.id) ? field.id : random(8)
    seen.add(id)
    return { id, type, label, required: field.required === true, options }
  })
}

// The sender's answers, keyed by question id. Each is kept with the
// question's label as it was, so old answers stay readable after the form
// changes. Checkboxes without choices are a single yes.
export function answersFor(project, input) {
  let raw = input.answers
  if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { raw = {} } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {}
  const out = []
  for (const field of fieldsOf(project)) {
    const given = raw[field.id]
    let value
    if (field.type === 'text') value = typeof given === 'string' ? text(given, 200) : ''
    else if (field.type === 'checkbox' && field.options.length) value = Array.isArray(given) ? field.options.filter(option => given.includes(option)) : []
    else if (field.type === 'checkbox') value = given === true || given === 'true'
    else value = field.options.includes(given) ? given : ''
    const empty = Array.isArray(value) ? !value.length : !value
    if (empty && field.required) reject(400, 'missing_answer', `Please answer “${field.label}”.`)
    if (!empty) out.push({ id: field.id, label: field.label, type: field.type, value })
  }
  return out
}

export function contactFor(project, input) {
  const ask = contactOf(project)
  const email = ask.email === 'off' ? '' : text(input.email, 200)
  if (email && !EMAIL.test(email)) reject(400, 'invalid_email', 'That email address doesn’t look right.')
  if (ask.email === 'required' && !email) reject(400, 'missing_email', 'Please leave your email.')
  const phone = ask.phone === 'off' ? '' : text(input.phone, 30)
  if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 6)) reject(400, 'invalid_phone', 'That phone number doesn’t look right.')
  if (ask.phone === 'required' && !phone) reject(400, 'missing_phone', 'Please leave your phone number.')
  return { email, phone }
}

// One to five stars, or none when the form doesn't ask.
export function ratingFor(project, input) {
  const { ask } = ratingOf(project)
  if (ask === 'off') return null
  const n = Number(input.rating)
  const value = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
  if (!value && ask === 'required') reject(400, 'missing_rating', 'Please pick a rating.')
  return value
}
