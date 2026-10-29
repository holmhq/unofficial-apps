// Tracked links: your page's link with a tag on the end (?ref=sundown-2026),
// one for each place you share it — a flyer, a newsletter, a talk — so
// Insights can tell them apart. Each has its own QR code, which adds
// &via=qr, so scans count on their own. Saved on the host (PATCH /api/host
// { tags }); visits and bookings that came through one carry its tag.
import { h, ic, fill, sheet, confirm, toast, nope, copyText, haptic } from '../ui.js'
import * as api from '../api.js'
import { state, failure, pageURL } from '../shell.js'
import { sound } from '../sound.js'
import { field } from './common.js'
import { qrSVG, qrPNG, save } from '../qr.js'

const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/
export const tagOf = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 40).replace(/[-._]+$/, '')

export function linkURL(host, link, { qr = false } = {}) {
  return `${pageURL(host.handle)}${link.slug ? '/' + link.slug : ''}?ref=${link.tag}${qr ? '&via=qr' : ''}`
}

async function saveTags(tags) {
  const r = await api.patch('/api/host', { tags })
  state.me.host = r.host
  return r.host
}

// A new link: name it, choose the page it opens, and it's ready.
export async function newLink(events = []) {
  const host = state.me.host
  const taken = new Set((host.tags || []).map((x) => x.tag))
  let touched = false
  const name = h('input.input', { maxlength: '60', placeholder: 'Sundown 2026 flyer', autocomplete: 'off', autofocus: true, enterkeyhint: 'next' })
  const tag = h('input.slug-input', { maxlength: '40', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Tag', placeholder: 'sundown-2026' })
  const page = h('select.select', { 'aria-label': 'Opens' },
    h('option', { value: '' }, 'Your page'),
    events.filter((e) => e.active !== false).map((e) => h('option', { value: e.slug }, e.title)))
  const preview = h('p.link-preview.num')
  const unique = (v) => { let x = v || 'link'; for (let i = 2; taken.has(x); i++) x = `${v}-${i}`; return x }
  const paint = () => fill(preview, `${location.host}/@${host.handle}${page.value ? '/' + page.value : ''}`, h('wbr'), '?ref=', h('b', tag.value || tagOf(name.value) || '…'))
  name.addEventListener('input', () => { if (!touched) tag.value = unique(tagOf(name.value)); paint() })
  tag.addEventListener('input', () => { touched = true; paint() })
  tag.addEventListener('blur', () => { tag.value = tagOf(tag.value); paint() })
  page.addEventListener('change', paint)
  paint()
  const nameField = field({ label: 'Name', input: name, hint: 'Where you’ll share it. Only you see this.' })
  const tagField = field({ label: 'Tag', input: h('div.slug-field', h('span', '?ref='), tag) })
  const made = await sheet({
    title: 'New link',
    done: 'Create',
    body: () => [
      h('p.sheet-lead', 'Make one for each place you share your page, so Insights can tell them apart. Its QR code counts scans on its own.'),
      nameField, tagField, field({ label: 'Opens', input: page }), preview
    ],
    onDone: async (close) => {
      const label = name.value.trim()
      const t = tagOf(tag.value || tagOf(label))
      nameField.setError(label ? '' : 'Give it a name.')
      tagField.setError(!t || !TAG.test(t) ? 'Use letters, numbers and dashes.' : taken.has(t) ? 'You already have a link with this tag.' : '')
      if (!label) { nope(name); return }
      if (!t || !TAG.test(t) || taken.has(t)) { nope(tag); return }
      const link = { tag: t, label, slug: page.value || null, createdAt: Date.now() }
      try {
        await saveTags([...(host.tags || []), link])
        sound.pop()
        close(link)
      } catch (error) { failure(error) }
    }
  })
  if (made) await showLink(made, null, { fresh: true })
  return made
}

// One link: its QR code to save or show, its address to copy, and how it's doing.
export async function showLink(link, numbers = null, { fresh = false } = {}) {
  const host = state.me.host
  const url = linkURL(host, link)
  const scan = linkURL(host, link, { qr: true })
  const code = h('div.qr-code', { html: qrSVG(scan), role: 'img', 'aria-label': `QR code for ${link.label}` })
  const n = numbers || {}
  const deleted = await sheet({
    title: link.label,
    cancel: 'Done',
    body: (close) => [
      h('div.qr-card',
        code,
        h('b.qr-name', link.label),
        h('span.qr-url.num', url.replace(/^https?:\/\//, ''))),
      fresh ? h('p.sheet-lead.center', 'Share the link where you post it, or print the code. Scans count separately.') : null,
      numbers ? h('div.link-stats',
        h('div', h('b.num', String(n.visitors || 0)), h('span', 'Visitors')),
        h('div', h('b.num', String(n.scans || 0)), h('span', 'From the code')),
        h('div', h('b.num', String(n.bookings || 0)), h('span', 'Booked'))) : null,
      h('div.sheet-actions',
        h('button.btn.primary.block', { type: 'button', onclick: () => { copyText(url, 'Link copied'); sound.pop(); haptic() } }, ic('copy', 18, 2.2), 'Copy link'),
        h('div.btn-pair',
          h('button.btn.block', { type: 'button', onclick: async () => { save(await qrPNG(scan), `kalendar-${link.tag}.png`); sound.pop() } }, ic('download', 18, 2.2), 'Save code'),
          navigator.share && matchMedia('(pointer: coarse)').matches
            ? h('button.btn.block', { type: 'button', onclick: () => navigator.share({ title: link.label, url }).catch(() => {}) }, ic('share', 18, 2.2), 'Share')
            : h('button.btn.block', { type: 'button', onclick: () => { save(new Blob([qrSVG(scan)], { type: 'image/svg+xml' }), `kalendar-${link.tag}.svg`); sound.pop() } }, ic('download', 18, 2.2), 'Save SVG'))),
      h('button.btn.plain-danger', { type: 'button', onclick: () => close('delete') }, 'Delete link')
    ]
  })
  if (deleted !== 'delete') return false
  const ok = await confirm({ title: `Delete “${link.label}”?`, text: 'The link keeps working, but visits through it count as untagged from now on. Its numbers so far stay in Insights.', action: 'Delete link' })
  if (!ok) return false
  try {
    await saveTags((state.me.host.tags || []).filter((x) => x.tag !== link.tag))
    sound.remove()
    toast('Link deleted')
    return true
  } catch (error) { failure(error); return false }
}
