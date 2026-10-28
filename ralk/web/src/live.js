// Holm realtime: one channel, with reconnects. onMessage gets each message's data, and
// { type: 'ready', again } once subscribed (again: true after a reconnect, when the page
// should read its state afresh because it may have missed messages), and { type: 'down' }
// when the socket closes.
export function subscribe(channel, onMessage) {
  let socket = null
  let closed = false
  let retry = 0
  let timer = 0
  let opened = false
  const open = () => {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/_ws`)
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'subscribe', channel })))
    socket.addEventListener('message', (event) => {
      for (const line of String(event.data).split('\n')) {
        if (!line) continue
        let m
        try { m = JSON.parse(line) } catch { continue }
        if (m.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
        else if (m.type === 'subscribed') { retry = 0; onMessage({ type: 'ready', again: opened }); opened = true }
        else if (m.type === 'message' && m.channel === channel && m.data) onMessage(m.data)
      }
    })
    socket.addEventListener('close', () => {
      if (closed) return
      onMessage({ type: 'down' })
      timer = setTimeout(open, Math.min(20000, 700 * 2 ** retry++))
    })
  }
  open()
  // Phones drop sockets while asleep; come back as soon as the page is visible again.
  const wake = () => { if (document.visibilityState === 'visible' && socket && socket.readyState > 1 && !closed) { clearTimeout(timer); retry = 0; open() } }
  document.addEventListener('visibilitychange', wake)
  addEventListener('online', wake)
  return () => { closed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); removeEventListener('online', wake); try { socket.close() } catch {} }
}
