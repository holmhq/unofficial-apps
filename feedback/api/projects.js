// Projects: one per site or product. Each has its own embed snippet, inbox
// and optional public page, and belongs to the member who made it.
import { ds, now, iso, text, reject, random } from './lib.js'
import { removeProject as removeFiles } from './files.js'
import { removeProjectStats } from './stats.js'
import { pictureURL, storePicture, removePicture } from './page.js'
import { contactOf, fieldsOf, ratingOf, contactSetting, fieldsSetting, ratingSetting } from './form.js'
import { removeInstalls, installs } from './installs.js'

// Snippets and page links in API replies are absolute. The runtime doesn't
// pass the request host to apps yet, so they use this. Set it to your host.
export const ORIGIN = 'https://feedback.zyt.app'

const COLOR = /^#[0-9a-fA-F]{6}$/
// What a project is for picks the three kinds its form offers.
export const KIND_SETS = { site: ['issue', 'idea', 'question'], place: ['praise', 'problem', 'idea'] }
export const kindsOf = doc => KIND_SETS[doc.for] || KIND_SETS.site
// The button on a site: a pill with its text, a round icon, or none (the
// site opens the form from its own link). The panel is light, dark, or
// follows the visitor's system.
const BUTTONS = ['pill', 'icon', 'none']
const THEMES = ['light', 'dark', 'auto']
// A project's mark, when it has no logo: one of these icons (vendor/lucide,
// which src/icons.js draws) or its initial ("letter"). A new project gets one
// at random; older ones get one picked by their id.
export const ICONS = ['flame', 'rocket', 'globe', 'store', 'utensils', 'coffee', 'shopping-bag', 'heart',
  'star', 'sparkles', 'zap', 'leaf', 'music', 'camera', 'book-open', 'graduation-cap',
  'briefcase', 'building', 'house', 'gamepad-2', 'palette', 'code', 'terminal', 'bot',
  'cloud', 'package', 'map-pin', 'calendar', 'ticket', 'mic', 'film', 'dumbbell',
  'plane', 'pizza', 'wine', 'gift', 'flower-2', 'mountain', 'face-grinning', 'paw-print',
  'gem', 'trophy', 'compass', 'feather', 'wrench', 'shield', 'bike', 'stethoscope']
export const iconOf = doc => doc.icon === 'letter' || ICONS.includes(doc.icon) ? doc.icon
  : ICONS[doc.id.split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7) % ICONS.length]
const MAX_PROJECTS = 20
// A custom address: 3 to 40 lowercase letters, digits and inner hyphens.
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
// First path segments the app itself uses (src/app.js keeps the same list).
export const RESERVED = new Set(['api', 'auth', 'b', 'f', 'projects', 'keys', 'stats', 'assets', 'src', 'vendor',
  'embed', 'widget', 'new', 'settings', 'account', 'admin', 'login', 'logout', 'signin', 'signup', 'help', 'about',
  'privacy', 'terms', 'docs', 'www', 'app', 'holm', 'index', 'changelog', 'preview'])

// The script tag for a site. The button reads the project's look when the
// page loads, so a change here needs no new snippet.
export const snippet = (doc, origin = ORIGIN) => `<script src="${origin}/embed.js" data-project="${doc.id}" async></script>`

export const pageURL = (doc, origin = ORIGIN) => `${origin}/${doc.slug || 'b/' + doc.id}`

export function projectDTO(doc) {
  return {
    ...publicConfig(doc),
    origins: doc.origins, public: doc.public, slug: doc.slug || null, createdAt: iso(doc.createdAt),
    snippet: snippet(doc), board: doc.public ? pageURL(doc) : null
  }
}

// The parts a visitor's browser may see: the button's and the form's look
// and questions, never the owner or the allowed sites.
export const publicConfig = doc => ({
  id: doc.id, name: doc.name, label: doc.label, color: doc.color, position: doc.position,
  button: BUTTONS.includes(doc.button) ? doc.button : 'pill', theme: THEMES.includes(doc.theme) ? doc.theme : 'light',
  title: doc.title || '', intro: doc.intro || '', icon: iconOf(doc), logo: pictureURL(doc, 'logo'), cover: pictureURL(doc, 'cover'),
  attachments: doc.attachments !== false, for: KIND_SETS[doc.for] ? doc.for : 'site', kinds: kindsOf(doc),
  contact: contactOf(doc), rating: ratingOf(doc), fields: fieldsOf(doc)
})

export function findProject(id) {
  return /^[a-z0-9]{8}$/.test(id || '') ? ds().findOne('projects', { id }) : null
}

// A public page's project, by its custom address or its id.
export function findBoard(key) {
  const value = String(key || '').toLowerCase()
  if (!/^[a-z0-9-]{3,40}$/.test(value)) return null
  return ds().findOne('projects', { slug: value }) || findProject(value)
}

// A project the caller owns, or a 404 that doesn't reveal others.
export function ownProject(user, id) {
  const doc = findProject(id)
  if (!doc || doc.ownerId !== user.id) reject(404, 'not_found', 'Project not found.')
  return doc
}

function origins(value) {
  if (!Array.isArray(value)) reject(400, 'invalid_origins', 'Allowed sites are a list.')
  return [...new Set(value.slice(0, 20).map(entry => {
    try {
      const url = new URL(String(entry).trim())
      if (!/^https?:$/.test(url.protocol)) throw new Error()
      return url.origin
    } catch {
      reject(400, 'invalid_origin', `“${String(entry).slice(0, 80)}” isn't a site address like https://example.com.`)
    }
  }))]
}

// First come, first served across the whole app.
function slug(value, id) {
  const wanted = text(value, 60).toLowerCase()
  if (!wanted) return null
  if (!SLUG.test(wanted)) reject(400, 'invalid_slug', 'Use 3 to 40 lowercase letters, digits and hyphens, starting and ending with a letter or digit.')
  const taken = RESERVED.has(wanted) || (findProject(wanted) && wanted !== id) ||
    ds().find('projects', { slug: wanted }, { limit: 2 }).some(doc => doc.id !== id)
  if (taken) reject(409, 'slug_taken', `/${wanted} is taken. Try another.`)
  return wanted
}

function settings(input, doc = {}) {
  const out = {}
  if ('name' in input) out.name = text(input.name, 60) || reject(400, 'invalid_name', 'Give the project a name.')
  if ('label' in input) out.label = text(input.label, 24) || 'Feedback'
  if ('icon' in input) out.icon = input.icon === 'letter' || ICONS.includes(input.icon) ? input.icon : reject(400, 'invalid_icon', 'Pick one of the icons, or "letter".')
  if ('color' in input) out.color = COLOR.test(input.color || '') ? input.color.toLowerCase() : reject(400, 'invalid_color', 'A colour is like #c2410c.')
  if ('position' in input) out.position = input.position === 'left' ? 'left' : 'right'
  if ('button' in input) out.button = BUTTONS.includes(input.button) ? input.button : reject(400, 'invalid_button', 'The button is "pill", "icon" or "none".')
  if ('theme' in input) out.theme = THEMES.includes(input.theme) ? input.theme : reject(400, 'invalid_theme', 'The panel is "light", "dark" or "auto".')
  if ('origins' in input) out.origins = origins(input.origins)
  if ('public' in input) out.public = input.public === true
  if ('slug' in input) out.slug = slug(input.slug, doc.id)
  if ('title' in input) out.title = text(input.title, 80)
  if ('intro' in input) out.intro = text(input.intro, 280, true)
  if ('attachments' in input) out.attachments = input.attachments !== false
  if ('for' in input) out.for = KIND_SETS[input.for] ? input.for : reject(400, 'invalid_for', 'A project is for a "site" or a "place".')
  if ('contact' in input) out.contact = contactSetting(input.contact)
  if ('rating' in input) out.rating = ratingSetting(input.rating)
  if ('fields' in input) out.fields = fieldsSetting(input.fields)
  return out
}

// The projects list also says what is waiting (new items and comments to
// approve) and which sites each is for: its allowed sites, then where its
// button is live.
export function listProjects(user) {
  return ds().find('projects', { ownerId: user.id }, { limit: MAX_PROJECTS, orderBy: 'createdAt', order: 'desc' }).map(doc => ({
    ...projectDTO(doc),
    sites: [...new Set([...doc.origins, ...installs(doc.id).map(entry => entry.origin)])].slice(0, 5),
    waiting: { items: ds().count('items', { project: doc.id, status: 'new' }), comments: ds().count('comments', { project: doc.id, approved: false }) }
  }))
}

export function createProject(user, input) {
  if (ds().count('projects', { ownerId: user.id }) >= MAX_PROJECTS) reject(409, 'too_many', `You can have up to ${MAX_PROJECTS} projects.`)
  let id = random(8)
  while (findProject(id) || ds().findOne('projects', { slug: id })) id = random(8)
  const doc = { icon: ICONS[Math.floor(Math.random() * ICONS.length)], label: 'Feedback', color: '#c2410c', position: 'right', button: 'pill', theme: 'light', origins: [], public: false, slug: null, intro: '', attachments: true, for: 'site', ...settings({ name: '', ...input }, { id }) }
  ds().insert('projects', { ...doc, id, ownerId: user.id, createdAt: now() })
  return projectDTO(findProject(id))
}

export function updateProject(user, id, input) {
  const doc = ownProject(user, id)
  ds().update('projects', { id: doc.id }, { $set: settings(input, doc) })
  return projectDTO(findProject(doc.id))
}

// The public page's logo or cover: upload one, or go back to the default.
export function setPicture(user, id, which, request) {
  const doc = ownProject(user, id)
  ds().update('projects', { id: doc.id }, { $set: { [which]: storePicture(doc.id, which, request) } })
  return projectDTO(findProject(doc.id))
}

export function clearPicture(user, id, which) {
  const doc = ownProject(user, id)
  removePicture(doc.id, which)
  ds().update('projects', { id: doc.id }, { $set: { [which]: null } })
  return projectDTO(findProject(doc.id))
}

export function deleteProject(user, id) {
  const doc = ownProject(user, id)
  removeFiles(doc.id)
  removeProjectStats(doc.id)
  removeInstalls(doc.id)
  ds().delete('comments', { project: doc.id })
  ds().delete('notes', { project: doc.id })
  ds().delete('items', { project: doc.id })
  ds().delete('projects', { id: doc.id })
}
