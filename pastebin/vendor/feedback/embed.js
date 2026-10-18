/*
 * The feedback button for any website. Add it with:
 *
 *   <script src="https://feedback.example.com/embed.js" data-project="abcd2345" async></script>
 *
 * Optional: data-label="Feedback", data-color="#c2410c", data-position="right" | "left",
 * data-button="none" to hide the button and open the form from your own
 * control with window.HolmFeedback.open(), and data-origin="https://feedback.example.com"
 * when this file is copied into the site itself (Holm-hosted sites must, since
 * their pages only run their own scripts).
 *
 * The button and panel live in a shadow root, so the page's CSS and this
 * script's never mix. The form itself is an iframe on the feedback app's own
 * origin; it is sent the page's address without its query or fragment.
 */
(function () {
  var script = document.currentScript
  if (!script || window.HolmFeedback) return
  var data = script.dataset
  var origin
  try { origin = new URL(data.origin || script.src).origin } catch (error) { return }
  var project = data.project
  if (!/^[a-z0-9]{8}$/.test(project || '')) return

  var color = /^#[0-9a-fA-F]{6}$/.test(data.color || '') ? data.color : '#c2410c'
  var side = data.position === 'left' ? 'left' : 'right'
  var label = (data.label || 'Feedback').slice(0, 24)

  var host = document.createElement('div')
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;'
  var root = host.attachShadow({ mode: 'closed' })
  root.innerHTML =
    '<style>' +
    ':host { all: initial; }' +
    '.button { position: fixed; bottom: 20px; ' + side + ': 20px; display: inline-flex; align-items: center; gap: 8px;' +
    '  padding: 11px 16px 11px 13px; border: 0; border-radius: 999px; background: ' + color + '; color: #fff;' +
    '  font: 600 15px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: -0.01em; cursor: pointer;' +
    '  box-shadow: 0 1px 2px rgba(0,0,0,.18), 0 10px 26px -10px rgba(0,0,0,.45); }' +
    '.button:hover { filter: brightness(1.07); }' +
    '.button:focus-visible { outline: 3px solid ' + color + '; outline-offset: 3px; }' +
    '.button svg { width: 18px; height: 18px; fill: currentColor; }' +
    '.panel { position: fixed; bottom: 80px; ' + side + ': 20px; width: 380px; height: min(560px, calc(100vh - 100px));' +
    '  border: 0; border-radius: 18px; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.12), 0 24px 60px -16px rgba(0,0,0,.45);' +
    '  opacity: 0; transform: translateY(12px); transition: opacity .16s, transform .16s; pointer-events: none; }' +
    '.panel.open { opacity: 1; transform: none; pointer-events: auto; }' +
    '@media (max-width: 480px) { .panel { left: 0; right: 0; bottom: 0; width: 100%; height: 88vh; border-radius: 18px 18px 0 0; }' +
    '  .panel.open ~ .button { display: none; } }' +
    '@media (prefers-reduced-motion: reduce) { .panel { transition: none; } }' +
    '</style>'

  var panel = document.createElement('iframe')
  panel.className = 'panel'
  panel.title = label
  panel.setAttribute('aria-hidden', 'true')
  var button = document.createElement('button')
  button.type = 'button'
  button.className = 'button'
  button.setAttribute('aria-expanded', 'false')
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2h16a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-8l-6 5v-5H4a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm7 4v6h2V6h-2Zm0 8v2h2v-2h-2Z"/></svg>'
  button.appendChild(document.createTextNode(label))
  if (data.button === 'none') button.style.display = 'none'
  root.appendChild(panel)
  root.appendChild(button)

  var open = false
  function page() {
    var url = location.origin + location.pathname
    return origin + '/widget.html?p=' + project +
      '&url=' + encodeURIComponent(url) +
      '&title=' + encodeURIComponent(document.title.slice(0, 200)) +
      '&viewport=' + innerWidth + 'x' + innerHeight
  }
  function show() {
    if (!panel.src) panel.src = page()
    open = true
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')
    button.setAttribute('aria-expanded', 'true')
    panel.focus()
  }
  function hide() {
    open = false
    panel.classList.remove('open')
    panel.setAttribute('aria-hidden', 'true')
    button.setAttribute('aria-expanded', 'false')
    if (data.button !== 'none') button.focus()
  }
  button.addEventListener('click', function () { open ? hide() : show() })
  document.addEventListener('keydown', function (event) { if (open && event.key === 'Escape') hide() })
  window.addEventListener('message', function (event) {
    if (event.origin !== origin || !event.data || event.data.source !== 'holm-feedback') return
    if (event.data.type === 'close') hide()
  })

  window.HolmFeedback = { open: show, close: hide }
  ;(document.body || document.documentElement).appendChild(host)
})()
