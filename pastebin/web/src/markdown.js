// GitHub-flavoured Markdown, rendered safely. marked turns the text into HTML
// and DOMPurify strips anything that could run script on this origin. Both
// load on first use, so pastes that aren't Markdown never download them.

import { h, icon, copyText } from './lib.js'
import { highlight } from './code.js'

let ready = null

function load() {
  if (!ready) {
    ready = Promise.all([import('/vendor/marked/marked.esm.js'), loadScript('/vendor/dompurify/purify.min.js')])
      .then(([m]) => {
        const purify = window.DOMPurify
        purify.addHook('afterSanitizeAttributes', node => {
          if (node.tagName === 'A' && node.hasAttribute('href')) {
            const url = safeURL(node.getAttribute('href'))
            if (url && url.origin !== location.origin) {
              node.setAttribute('target', '_blank')
              node.setAttribute('rel', 'noopener noreferrer nofollow')
            }
          }
          // Images from other sites would tell them who is reading this paste,
          // so they stay off until the reader asks for them.
          if (node.tagName === 'IMG') {
            const src = node.getAttribute('src') || ''
            const url = safeURL(src)
            if (url && url.origin !== location.origin && url.protocol !== 'data:') {
              node.setAttribute('data-src', src)
              node.removeAttribute('src')
              node.removeAttribute('srcset')
              node.classList.add('remote-img')
            }
            node.setAttribute('loading', 'lazy')
          }
        })
        return { marked: new m.Marked({ gfm: true, breaks: false }), purify }
      })
    ready.catch(() => { ready = null })
  }
  return ready
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.DOMPurify) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load ' + src))
    document.head.append(s)
  })
}

function safeURL(value) {
  try { return new URL(value, location.href) } catch (e) { return null }
}

const SANITIZE = {
  USE_PROFILES: { html: true },
  // Media and forms have no place in a paste; style could restyle the app.
  FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'picture', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['style'],
  // Prefix ids and names so a heading called "main" can't collide with the app.
  SANITIZE_NAMED_PROPS: true,
  RETURN_DOM_FRAGMENT: true,
}

export async function renderMarkdown(text) {
  const { marked, purify } = await load()
  const fragment = purify.sanitize(marked.parse(text), SANITIZE)
  const root = h('div.md-body')
  root.append(fragment)

  // Task list items: checkboxes are display-only.
  root.querySelectorAll('input').forEach(input => {
    if (input.type !== 'checkbox') return input.remove()
    input.disabled = true
    const li = input.closest('li')
    if (li) li.classList.add('task')
  })

  // Headings get GitHub-style anchors.
  const seen = new Map()
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    let slug = el.textContent.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'section'
    const n = seen.get(slug) || 0
    seen.set(slug, n + 1)
    if (n) slug += '-' + n
    el.id = 'md-' + slug
    el.prepend(h('a.md-anchor', { href: '#' + el.id, 'aria-label': 'Link to this section' }, '#'))
  })

  // Fenced code: highlight known languages and offer a copy button.
  root.querySelectorAll('pre > code').forEach(code => {
    const lang = ((code.className.match(/language-([\w+#.-]+)/) || [])[1] || '').toLowerCase()
    const raw = code.textContent
    if (lang) code.innerHTML = highlight(raw, lang)
    const pre = code.parentNode
    pre.classList.add('md-pre')
    pre.append(h('button.md-copy', { type: 'button', 'aria-label': 'Copy code', title: 'Copy', onclick: () => copyText(raw.replace(/\n$/, '')) }, icon('copy')))
  })

  // Wide tables scroll sideways instead of stretching the page.
  root.querySelectorAll('table').forEach(table => {
    const wrap = h('div.md-table')
    table.replaceWith(wrap)
    wrap.append(table)
  })

  const remote = root.querySelectorAll('img.remote-img')
  if (remote.length) {
    const bar = h('p.md-images',
      icon('image'),
      h('span', remote.length === 1 ? 'An image from another site is hidden, so that site can’t see who’s reading.' : remote.length + ' images from other sites are hidden, so those sites can’t see who’s reading.'),
      h('button.btn.btn-sm', { type: 'button', onclick: () => {
        remote.forEach(img => { img.src = img.dataset.src; img.classList.remove('remote-img') })
        bar.remove()
      } }, remote.length === 1 ? 'Show image' : 'Show images'))
    root.prepend(bar)
  }
  return root
}
