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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
