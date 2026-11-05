// Start-up: the share page at /s/<token>, the editor everywhere else.

import { applyTheme, loadMe } from './account.js'

applyTheme()

const share = /^\/s\/([A-Za-z0-9_-]{10,40})$/.exec(location.pathname)
if (share) {
  const { startShare } = await import('./share.js')
  startShare(share[1])
} else {
  const { startEditor } = await import('./editor.js')
  startEditor()
}
loadMe()

// Feedback in the footer opens the feedback app's form (its embed.js loads
// from /vendor/feedback at the end of the page).
document.getElementById('feedback')?.addEventListener('click', () => (globalThis.HolmFeedback || globalThis.ZytFeedback)?.open?.())

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
