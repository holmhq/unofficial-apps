// Feedback opens Zend's form from feedback.zyt.app in a panel over the page. Holm pages run
// only their own scripts, so the form's script is a copy kept in /vendor/feedback/; it loads
// the first time someone asks for it, and the app's CSP lets the form's frame in
// (security.csp.frame_src). If it can't load, the form opens on its own page instead. Point
// PROJECT at your own project on a feedback app, or drop the Feedback links.
const PROJECT = 'pqtksinv'
const COLOR = '#0a6ff0'
export const FEEDBACK_URL = 'https://feedback.zyt.app/widget?p=' + PROJECT

let loading = null
function load() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/feedback/embed.js'
      Object.assign(s.dataset, { project: PROJECT, origin: 'https://feedback.zyt.app', color: COLOR, button: 'none' })
      s.onload = () => (globalThis.HolmFeedback ? resolve(globalThis.HolmFeedback) : reject(new Error('no form')))
      s.onerror = () => { loading = null; s.remove(); reject(new Error('no form')) }
      document.head.append(s)
    })
  }
  return loading
}

export function openFeedback() {
  load().then((form) => form.open()).catch(() => window.open(FEEDBACK_URL, '_blank', 'noopener'))
}

// Any link marked data-feedback (the footer's) opens the panel; a modified click still
// follows the link to the form's own page.
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[data-feedback]') : null
  if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  openFeedback()
})
