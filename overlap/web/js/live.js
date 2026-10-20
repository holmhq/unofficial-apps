// The plan's realtime channel. The server broadcasts every change; the page
// subscribes, answers pings, reconnects with back-off, and catches up after
// a gap: the caller reloads the plan after every subscription.

export function connect(slug, { onMessage, onStatus, onSubscribed }) {
  const channel = `plan-${slug}`
  let socket = null
  let closed = false
  let wait = 600
  let retry = null

  function open() {
    if (closed) return
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${scheme}://${location.host}/_ws`)
    socket.addEventListener('open', () => {
      wait = 600
      socket.send(JSON.stringify({ type: 'subscribe', channel }))
    })
    socket.addEventListener('message', event => {
      for (const line of String(event.data).split('\n')) {
        if (!line) continue
        let message
        try { message = JSON.parse(line) } catch { continue }
        if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
        else if (message.type === 'subscribed' && message.channel === channel) {
          onStatus?.(true)
          onSubscribed?.()
        } else if (message.type === 'message' && message.channel === channel) onMessage(message.data)
      }
    })
    socket.addEventListener('close', () => {
      onStatus?.(false)
      if (closed) return
      retry = setTimeout(open, wait)
      wait = Math.min(wait * 2, 12000)
    })
  }
  open()
  return { close() { closed = true; clearTimeout(retry); socket?.close() } }
}

// Presence: a heartbeat every 20 seconds while the page is visible, and a
// goodbye when it is hidden or closed. Others forget a quiet visitor after 50.
export function presence(slug, who) {
  const sid = sessionID()
  const url = `/api/plans/${slug}/here`
  const send = (leaving = false) => {
    const body = JSON.stringify({ sid, ...who(), leaving })
    if (leaving && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    else fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: leaving, credentials: 'same-origin' }).catch(() => {})
  }
  send()
  const timer = setInterval(() => { if (!document.hidden) send() }, 20000)
  const onVisibility = () => send(document.hidden)
  const onHide = () => send(true)
  document.addEventListener('visibilitychange', onVisibility)
  addEventListener('pagehide', onHide)
  return {
    sid,
    update: () => send(),
    stop() {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      removeEventListener('pagehide', onHide)
      send(true)
    }
  }
}

function sessionID() {
  try {
    let id = sessionStorage.getItem('overlap:sid')
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('overlap:sid', id) }
    return id
  } catch { return crypto.randomUUID() }
}
