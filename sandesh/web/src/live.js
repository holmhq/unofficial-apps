// Live updates over the node's /_ws socket: the server announces on the
// member's own channel (a name with a random secret, given only to them)
// whenever a receipt or a reply arrives. Reconnects with a growing pause
// and subscribes again each time.

let socket = null
let wait = 1000

export function connect(channel, onUpdate) {
  if (!channel) return
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${scheme}://${location.host}/_ws`)
  socket.addEventListener('open', () => {
    wait = 1000
    socket.send(JSON.stringify({ type: 'subscribe', channel }))
  })
  socket.addEventListener('message', (event) => {
    for (const line of String(event.data).split('\n')) {
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
      if (message.type === 'subscribed') onUpdate({ type: 'resync' })
      if (message.type === 'message' && message.channel === channel) onUpdate(message.data || {})
    }
  })
  socket.addEventListener('close', () => {
    setTimeout(() => connect(channel, onUpdate), wait)
    wait = Math.min(wait * 2, 30000)
  })
}
