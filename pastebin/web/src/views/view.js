// A paste: owner controls, the fuse, highlighted text, media, the burn seal
// and the gone states.

import { h, icon, api, bytes, ago, left, fullDate, copyText, confirmDialog, toast, spinner, slugify, EXPIRY, plural, store, local, shareUrl } from '../lib.js'
import { highlight, splitLines, langName, extFor, langForFile, detect, HIGHLIGHT_LIMIT } from '../code.js'
import { renderMarkdown } from '../markdown.js'

const GONE = {
  not_found: ['Nothing at this link', 'Check that the whole link was copied. Links are case-sensitive.'],
  expired: ['This paste has expired', 'It reached its time limit and was deleted. Ask the sender for a new link.'],
  burned: ['This paste has been opened', 'It could be opened once, and it already was. If that wasn’t you, tell the sender.'],
  revoked: ['This link was revoked', 'The sender withdrew it. Ask them for a new link if you still need it.'],
}

export function mountView(main, slug, ctx) {
  let timers = []
  let destroyed = false
  const clearTimers = () => { timers.forEach(clearInterval); timers = [] }

  main.replaceChildren(spinner())
  load()

  async function load() {
    try {
      const paste = localize((await api('GET', '/api/p/' + encodeURIComponent(slug))).paste)
      let owner = null
      if (paste.isOwner) {
        try { owner = (await api('GET', '/api/pastes/' + encodeURIComponent(slug))).paste } catch (e) { /* public view still works */ }
      }
      if (!destroyed) render(paste, owner)
    } catch (err) {
      if (destroyed) return
      if (err.status === 404 || err.status === 410) gone(err.code)
      else failed(err)
    }
  }

  function failed(err) {
    main.replaceChildren(h('section.page.gone',
      h('h1', 'Couldn’t load this paste'),
      h('p', err.message),
      h('button.btn.btn-primary', { type: 'button', onclick: () => { main.replaceChildren(spinner()); load() } }, 'Try again')))
  }

  function gone(code) {
    clearTimers()
    const [title, body] = GONE[code] || GONE.not_found
    document.title = title + ' · pastebin'
    main.replaceChildren(h('section.page.gone',
      h('div.gone-sheet', { 'aria-hidden': 'true' },
        [22, 40, 58, 76, 94].map((top, i) => h('i', { style: { top: top + 'px', width: [62, 48, 70, 35, 55][i] + '%' } }))),
      h('h1', title),
      h('p', body),
      h('a.btn.btn-primary', { href: '/', 'data-link': true }, icon('plus'), 'Create a paste')))
  }

  function render(paste, owner) {
    clearTimers()
    document.title = (paste.title || 'Untitled paste') + ' · pastebin'
    const view = h('article.view')

    if (owner) view.append(ownerBar(paste, owner))
    view.append(head(paste))
    const fuse = fuseFor(paste)
    if (fuse) view.append(fuse)

    if (paste.sealed) view.append(seal(paste))
    else view.append(...body(paste))

    main.replaceChildren(view)
  }

  // ── owner controls ──
  function ownerBar(paste, owner) {
    let justMade = false
    try { justMade = sessionStorage.getItem('pb.created') === paste.slug; sessionStorage.removeItem('pb.created') } catch (e) { /* ignore */ }

    const field = h('input.link-field', { value: paste.url, readonly: true, 'aria-label': 'Link to this paste', onfocus: e => e.target.select() })
    const copyBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => copyText(paste.url, 'Link copied') }, icon('copy'), 'Copy link')
    const shareBtn = navigator.share
      ? h('button.btn.btn-icon', { type: 'button', 'aria-label': 'Share', title: 'Share', onclick: () => navigator.share({ url: paste.url, title: paste.title || 'Paste' }).catch(() => {}) }, icon('share'))
      : null

    const expiry = h('select.select', { 'aria-label': 'Change expiry', style: { width: 'auto', minHeight: '34px' } },
      h('option', { value: '' }, paste.expiresAt ? 'Expires ' + ago(paste.expiresAt) : 'Never expires'),
      EXPIRY.filter(([v]) => !(v === 'never' && !paste.expiresAt)).map(([v, label]) =>
        h('option', { value: v }, v === 'never' ? 'Never expire' : 'Expire in ' + label.toLowerCase())))
    expiry.addEventListener('change', async () => {
      if (!expiry.value) return
      expiry.disabled = true
      try {
        await api('PATCH', '/api/pastes/' + encodeURIComponent(paste.slug), { expires_in: expiry.value })
        toast(expiry.value === 'never' ? 'Expiry removed' : 'Expiry updated')
        load()
      } catch (err) { toast(err.message, 'error'); expiry.disabled = false; expiry.value = '' }
    })

    const authorBox = h('input', { type: 'checkbox', checked: !!owner.showAuthor })
    authorBox.addEventListener('change', async () => {
      authorBox.disabled = true
      try {
        await api('PATCH', '/api/pastes/' + encodeURIComponent(paste.slug), { show_author: authorBox.checked })
        toast(authorBox.checked ? 'Your name is now shown' : 'Your name is now hidden')
        load()
      } catch (err) { toast(err.message, 'error'); authorBox.checked = !authorBox.checked; authorBox.disabled = false }
    })

    const revokeBtn = h('button.btn.btn-danger.btn-sm', { type: 'button', onclick: async () => {
      const ok = await confirmDialog({
        title: 'Revoke this link?',
        body: 'The link stops working right away and the content is deleted. This can’t be undone.',
        confirm: 'Revoke link', danger: true,
      })
      if (!ok) return
      try {
        await api('POST', '/api/pastes/' + encodeURIComponent(paste.slug) + '/revoke')
        toast('Link revoked')
        ctx.navigate('/mine')
      } catch (err) { toast(err.message, 'error') }
    } }, icon('ban'), 'Revoke')

    const stats = paste.burnAfterRead
      ? (owner.openedAt ? 'Opened ' + ago(owner.openedAt) : 'Not opened yet')
      : (owner.views ? 'Viewed ' + plural(owner.views, 'time') : 'No views yet')

    return h('section.owner-bar', { class: justMade ? 'just-made' : null, 'aria-label': 'Your paste' },
      h('div.link-row', field, copyBtn, shareBtn),
      paste.burnAfterRead ? h('p.owner-note', icon('flame'), 'Only you see this preview. Anyone else can open the link once, then it’s destroyed.') : null,
      h('div.owner-controls',
        expiry,
        h('label.switch', authorBox, h('span.switch-track'), h('span.switch-text', h('span', 'Show my name'))),
        h('span.spacer'),
        h('span.owner-stats', stats),
        revokeBtn))
  }

  // ── heading ──
  function head(paste) {
    const parts = []
    if (paste.content) {
      const lines = paste.content.replace(/\n$/, '').split('\n').length
      if (!paste.language) paste.language = (paste.title && langForFile(paste.title) !== 'plaintext') ? langForFile(paste.title) : detect(paste.content)
      parts.push(langName(paste.language) + ', ' + plural(lines, 'line'))
    }
    if (paste.files && paste.files.length) parts.push(plural(paste.files.length, 'file'))
    let sentence = parts.join(' and ')
    sentence = sentence ? sentence + ', created ' + ago(paste.createdAt) : 'Created ' + ago(paste.createdAt)
    if (paste.sealed) sentence = 'Shared ' + ago(paste.createdAt)

    return h('header.paste-head',
      h('h1.paste-title', { class: paste.title || paste.sealed ? null : 'untitled' }, paste.sealed ? 'A one-time paste' : (paste.title || 'Untitled')),
      h('div.paste-sub',
        paste.author ? h('span.author', h('img', { src: paste.author.avatar, alt: '', referrerpolicy: 'no-referrer' }), paste.author.name) : null,
        h('span', { title: fullDate(paste.createdAt) }, sentence)))
  }

  // ── fuse ──
  function fuseFor(paste) {
    if (paste.burnAfterRead && !paste.expiresAt) {
      return h('div.fuse.once', h('span.fuse-line', h('i')), h('span.fuse-label', icon('flame'), 'Opens once'))
    }
    if (!paste.expiresAt) return null
    const start = Date.parse(paste.createdAt)
    const end = Date.parse(paste.expiresAt)
    const bar = h('i')
    const label = h('span.fuse-label', icon(paste.burnAfterRead ? 'flame' : 'clock'), h('span'))
    const fuse = h('div.fuse', { class: paste.burnAfterRead ? 'once-timed' : null, role: 'timer', 'aria-label': 'Time left' }, h('span.fuse-line', bar), label)
    const tick = () => {
      const remaining = end - Date.now()
      if (remaining <= 0) {
        if (!paste.isOwner) gone('expired')
        else { label.lastChild.textContent = 'Expired'; fuse.style.setProperty('--life', 0) }
        clearTimers()
        return
      }
      const life = Math.max(0, Math.min(1, remaining / Math.max(1, end - start)))
      fuse.style.setProperty('--life', life.toFixed(4))
      fuse.classList.toggle('low', life < 0.1 || remaining < 5 * 60e3)
      label.lastChild.textContent = (paste.burnAfterRead ? 'Opens once, expires in ' : 'Expires in ') + left(remaining)
    }
    tick()
    timers.push(setInterval(tick, end - Date.now() < 3600e3 ? 1000 : 30000))
    return fuse
  }

  // ── content ──
  function body(paste) {
    const out = []
    if (paste.content != null && paste.content !== '') out.push(codeSheet(paste.content, paste.language, {
      name: paste.title, rawUrl: paste.raw_url, slug: paste.slug,
    }))
    if (paste.files && paste.files.length) out.push(filesBlock(paste.files))
    return out
  }

  function seal(paste) {
    const openBtn = h('button.btn.btn-primary', { type: 'button' }, icon('eye'), 'Open paste')
    const box = h('section.sheet.seal', { 'aria-labelledby': 'seal-h' },
      h('div.seal-lines', { 'aria-hidden': 'true' },
        [78, 64, 88, 40, 72, 55, 83, 30, 66].map(w => h('i', { style: { width: w + '%' } }))),
      h('div.seal-body',
        h('div.seal-badge', icon('flame')),
        h('h2#seal-h', 'This paste opens once'),
        h('p', paste.author ? paste.author.name + ' sent you something that can be viewed one time. After you open it, it’s deleted for good.' : 'Someone sent you something that can be viewed one time. After you open it, it’s deleted for good.'),
        openBtn))
    openBtn.addEventListener('click', async () => {
      openBtn.disabled = true
      openBtn.replaceChildren('Opening…')
      try {
        const opened = localize((await api('POST', '/api/p/' + encodeURIComponent(paste.slug) + '/open')).paste)
        const parts = body(opened)
        const wrap = h('div.develop',
          h('p.burn-banner', icon('flame'),
            (opened.files && opened.files.length)
              ? 'This paste is now deleted from the server. Files stay downloadable for 10 minutes. Copy anything you need before leaving.'
              : 'This paste is now deleted from the server. Copy anything you need before leaving.'),
          ...parts)
        const view = box.parentNode
        view.querySelector('.paste-head').replaceWith(head(opened))
        const oldFuse = view.querySelector('.fuse')
        if (oldFuse) oldFuse.remove()
        clearTimers()
        box.replaceWith(wrap)
      } catch (err) {
        if (err.status === 410 || err.status === 404) gone(err.code)
        else { toast(err.message, 'error'); openBtn.disabled = false; openBtn.replaceChildren(icon('eye'), 'Open paste') }
      }
    })
    return box
  }

  return { destroy() { destroyed = true; clearTimers() } }
}

function localize(paste) {
  paste.url = shareUrl(paste.slug)
  if (paste.raw_url) paste.raw_url = local(paste.raw_url)
  if (paste.author && paste.author.avatar) paste.author.avatar = local(paste.author.avatar)
  for (const f of paste.files || []) {
    f.url = local(f.url)
    f.previewUrl = local(f.previewUrl)
    f.downloadUrl = local(f.downloadUrl)
  }
  return paste
}

// A highlighted, line-numbered text sheet with copy/raw/download/wrap.
export function codeSheet(text, lang, { name, rawUrl, slug, downloadUrl } = {}) {
  // API and CLI pastes often arrive without a language; guess it here.
  lang = lang || (name && langForFile(name) !== 'plaintext' ? langForFile(name) : detect(text))
  const prose = lang === 'plaintext' || lang === 'markdown'
  let wrap = store.get('pb.wrap', null)
  if (wrap == null) wrap = prose || window.matchMedia('(max-width: 720px)').matches

  const codeEl = h('div.code', { class: wrap ? 'wrap' : null, role: 'region', 'aria-label': 'Paste content', tabindex: '0' })
  const lines = splitLines(highlight(text, lang))
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  codeEl.innerHTML = lines.map((l, i) => '<span class="ln" id="L' + (i + 1) + '"><span class="lc">' + (l || ' ') + '</span></span>').join('')

  const wrapBtn = h('button.btn.btn-quiet.btn-sm', { type: 'button', 'aria-pressed': String(wrap), title: 'Wrap long lines' }, icon('wrap'), h('span.lbl', 'Wrap'))
  wrapBtn.addEventListener('click', () => {
    wrap = !wrap
    store.set('pb.wrap', wrap)
    codeEl.classList.toggle('wrap', wrap)
    wrapBtn.setAttribute('aria-pressed', String(wrap))
  })

  const fileName = (slugify(name) || slug || 'paste') + (name && /\.[a-z0-9]{1,8}$/i.test(name) ? '' : '.' + extFor(lang))
  const download = () => {
    if (downloadUrl) { location.href = downloadUrl; return }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = h('a', { href: url, download: fileName })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Attached text files start folded so a long log doesn't bury the rest.
  const clip = !!downloadUrl && lines.length > 24
  const showAll = clip ? h('div.show-all', h('button.btn.btn-quiet.btn-sm', { type: 'button', onclick: e => {
    e.currentTarget.closest('.code-sheet').classList.remove('clipped'); e.currentTarget.parentNode.remove()
  } }, 'Show all ' + plural(lines.length, 'line'))) : null

  // Markdown opens rendered (GitHub-flavoured); Source shows the text.
  const scroll = h('div.code-scroll', codeEl)
  let preview = null
  let modeSwitch = null
  if (lang === 'markdown') {
    preview = h('div.md', { role: 'document', 'aria-label': 'Rendered Markdown' }, h('p.md-wait', 'Rendering…'))
    const setMode = mode => {
      preview.hidden = mode !== 'preview'
      scroll.hidden = mode === 'preview'
      wrapBtn.hidden = mode === 'preview'
      modeSwitch.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)))
    }
    modeSwitch = h('div.mode', { role: 'group', 'aria-label': 'View' },
      h('button', { type: 'button', 'data-mode': 'preview', onclick: () => setMode('preview') }, 'Preview'),
      h('button', { type: 'button', 'data-mode': 'source', onclick: () => setMode('source') }, 'Source'))
    setMode('preview')
    renderMarkdown(text)
      .then(body => {
        preview.replaceChildren(body)
        // A shared link may point at a heading.
        if (location.hash.startsWith('#md-')) {
          const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
          if (target) target.scrollIntoView()
        }
      })
      .catch(() => { setMode('source'); modeSwitch.remove() })
  }

  return h('section.sheet.code-sheet', { class: clip ? 'clipped' : null },
    h('div.sheet-bar',
      h('span.lang-tag', downloadUrl && name ? name : langName(lang)),
      modeSwitch,
      h('span.grow'),
      wrapBtn,
      rawUrl ? h('a.btn.btn-quiet.btn-sm', { href: rawUrl, target: '_blank', rel: 'noopener', title: 'Open as plain text' }, icon('raw'), h('span.lbl', 'Raw')) : null,
      h('button.btn.btn-quiet.btn-sm', { type: 'button', title: 'Download', onclick: download }, icon('download'), h('span.lbl', 'Download')),
      h('button.btn.btn-sm', { type: 'button', onclick: () => copyText(text, 'Copied ' + plural(lines.length, 'line')) }, icon('copy'), h('span.lbl', 'Copy'))),
    preview,
    scroll,
    showAll,
    text.length > HIGHLIGHT_LIMIT ? h('p.too-long', 'Highlighting is off for pastes over 200 KB.') : null)
}

function filesBlock(files) {
  const images = files.filter(f => f.kind === 'image')
  const others = files.filter(f => f.kind !== 'image')
  const block = h('section.files', { 'aria-label': 'Files' })

  if (images.length) {
    const gallery = h('div.gallery', { class: images.length === 1 ? 'single' : null })
    images.forEach((f, i) => gallery.append(
      h('button.shot', { type: 'button', 'aria-label': 'View ' + f.name, onclick: () => lightbox(images, i) },
        h('img', { src: images.length === 1 ? f.url : (f.previewUrl || f.url), alt: f.name, loading: 'lazy', width: f.width || null, height: f.height || null }))))
    block.append(gallery)
  }

  for (const f of others) {
    if (f.kind === 'video') {
      block.append(h('div.media-card',
        h('video', { src: f.url, controls: true, playsInline: true, preload: 'metadata' }),
        fileRow(f)))
    } else if (f.kind === 'audio') {
      block.append(h('div.media-card', h('div.audio-wrap', h('audio', { src: f.url, controls: true, preload: 'metadata' })), fileRow(f)))
    } else if (f.kind === 'text' && f.size <= 512 * 1024) {
      const holder = h('div', fileRow(f))
      block.append(holder)
      fetch(f.url, { credentials: 'same-origin' })
        .then(r => (r.ok ? r.text() : Promise.reject(r)))
        .then(t => holder.replaceWith(codeSheet(t, langForFile(f.name), { name: f.name, rawUrl: f.url, downloadUrl: f.downloadUrl })))
        .catch(() => {})
    } else {
      block.append(fileRow(f, f.kind === 'pdf'))
    }
  }
  return block
}

function fileRow(f, openable) {
  return h('div.file-row',
    h('span.file-ico', icon(f.kind === 'image' || f.kind === 'video' || f.kind === 'audio' || f.kind === 'pdf' || f.kind === 'text' ? f.kind : 'file')),
    h('div.file-info', h('strong', { title: f.name }, f.name), h('span', bytes(f.size))),
    h('div.file-actions',
      openable ? h('a.btn.btn-sm', { href: f.url, target: '_blank', rel: 'noopener' }, icon('open'), h('span.lbl', 'Open')) : null,
      h('a.btn.btn-sm', { href: f.downloadUrl, download: f.name }, icon('download'), h('span.lbl', 'Download'))))
}

function lightbox(images, start) {
  let i = start
  const img = h('img', { alt: '' })
  const name = h('span.grow')
  const dl = h('a.btn.btn-sm', { download: '' }, icon('download'), h('span.lbl', 'Download'))
  const prev = h('button.btn.btn-icon.lightbox-nav.prev', { type: 'button', 'aria-label': 'Previous image', onclick: () => go(-1) }, icon('left'))
  const next = h('button.btn.btn-icon.lightbox-nav.next', { type: 'button', 'aria-label': 'Next image', onclick: () => go(1) }, icon('right'))
  const box = h('div.lightbox', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Image viewer' },
    h('div.lightbox-bar', name, dl, h('button.btn.btn-sm.btn-icon', { type: 'button', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div.lightbox-stage', { onclick: e => { if (e.target === e.currentTarget) close() } }, img, images.length > 1 ? [prev, next] : null))
  const show = () => {
    const f = images[i]
    img.src = f.url; img.alt = f.name
    name.textContent = f.name + (images.length > 1 ? '  (' + (i + 1) + ' of ' + images.length + ')' : '')
    dl.href = f.downloadUrl; dl.setAttribute('download', f.name)
  }
  function go(d) { i = (i + d + images.length) % images.length; show() }
  function close() { box.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  function onKey(e) {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowLeft' && images.length > 1) go(-1)
    else if (e.key === 'ArrowRight' && images.length > 1) go(1)
  }
  // Swipe between images on touch screens.
  let x0 = null
  box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX }, { passive: true })
  box.addEventListener('touchend', e => {
    if (x0 == null || images.length < 2) return
    const dx = e.changedTouches[0].clientX - x0
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
    x0 = null
  })
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  document.body.append(box)
  show()
  box.querySelector('.lightbox-bar .btn-icon').focus()
}
