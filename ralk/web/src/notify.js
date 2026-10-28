// Browser notifications: the permission, and showing one through the service worker when
// there is one (so it works installed on Android), else straight from the page.

export function permission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function ask() {
  if (!('Notification' in window)) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}

export async function show({ title, body = '', tag, icon = '/icon-192.png', data = null }) {
  if (permission() !== 'granted') return false
  const options = { body, tag, icon, badge: '/icon-192.png', silent: true, renotify: false, data }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg && reg.showNotification) { await reg.showNotification(title, options); return true }
    }
  } catch {}
  try {
    const n = new Notification(title, options)
    n.onclick = () => { try { window.focus() } catch {} n.close() }
    return true
  } catch { return false }
}
