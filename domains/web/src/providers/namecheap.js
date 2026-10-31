// The Namecheap adapter. Namecheap's own search page asks for availability over a WebSocket
// at domain-search.namecheap.com; this page does the same from your browser (the page's
// policy allows that one socket, see api/main.js). The server can't: Namecheap's edge turns
// away server clients, and the HTTP version of the endpoint sends no CORS headers. The
// socket is an undocumented website endpoint, so it can change or close; the search then
// falls back to the RDAP adapter.
//
// Messages out: { type: 'domainStatus', reqID, data: { domains: [...] } }
// Messages in:  { type: 'domainStatusResponse', reqID, data: { name, available, lookupType,
//                 premium, fee, renewalFee, reason, extra: { registrar, createdYear,
//                 extensionsTaken } } }, one per name, in any order.
//
// batch=false answers each name as soon as it's known (batch=true drips them out over
// tens of seconds). Two sockets, ten names a message, kept open a minute between searches.

const URL = 'wss://domain-search.namecheap.com/v1/ws?batch=false&whois=true&trace=true'
const SOCKETS = 2
const PER_MESSAGE = 10
const NAME_TIMEOUT = 20000
const OPEN_TIMEOUT = 8000
const IDLE_CLOSE = 60000

const waiting = new Map() // name -> [{ onResult, timer }]
const sockets = []
let next = 0
let idle = null
let seq = 0

function open() {
  return new Promise((resolve, reject) => {
    let ws
    try { ws = new WebSocket(URL) } catch { reject(Object.assign(new Error('Namecheap can’t be reached from this page.'), { code: 'unreachable' })); return }
    const timer = setTimeout(() => { try { ws.close() } catch {} ; reject(Object.assign(new Error('Namecheap didn’t answer.'), { code: 'unreachable' })) }, OPEN_TIMEOUT)
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws) })
    ws.addEventListener('error', () => { clearTimeout(timer); reject(Object.assign(new Error('Namecheap can’t be reached from this page.'), { code: 'unreachable' })) })
    ws.addEventListener('message', (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg && msg.data && typeof msg.data.name === 'string') deliver(normalize(msg.data))
    })
    ws.addEventListener('close', () => {
      const i = sockets.findIndex((s) => s.ws === ws)
      if (i >= 0) sockets.splice(i, 1)
    })
  })
}

async function pool() {
  const live = sockets.filter((s) => s.ws.readyState === 1)
  if (live.length >= SOCKETS) return live
  const opened = await Promise.allSettled(Array.from({ length: SOCKETS - live.length }, open))
  for (const r of opened) if (r.status === 'fulfilled') sockets.push({ ws: r.value })
  const ready = sockets.filter((s) => s.ws.readyState === 1)
  if (!ready.length) throw opened.find((r) => r.status === 'rejected').reason
  return ready
}

function deliver(result) {
  const list = waiting.get(result.name)
  if (!list) return
  waiting.delete(result.name)
  for (const w of list) { clearTimeout(w.timer); w.onResult(result) }
}

function normalize(d) {
  const name = String(d.name).toLowerCase()
  const extra = d.extra || {}
  const whois = d.whois || {}
  let status = 'unknown'
  if (d.available === true) status = !d.lookupType || d.lookupType === 'EPP' ? 'free' : 'maybe'
  else if (d.available === false) status = 'taken'
  const out = { name, status, source: 'namecheap', lookup: d.lookupType || '' }
  if (d.premium) {
    out.premium = true
    if (d.fee && typeof d.fee.retailAmount === 'number') out.price = d.fee.retailAmount
    if (d.renewalFee && typeof d.renewalFee.retailAmount === 'number') out.renew = d.renewalFee.retailAmount
    out.currency = (d.fee && d.fee.currency) || 'USD'
  }
  if (extra.registrar) out.registrar = String(extra.registrar)
  const since = Number(extra.createdYear || whois.createdYear || 0)
  if (since > 1980) out.since = since
  if (typeof extra.extensionsTaken === 'number') out.elsewhere = extra.extensionsTaken
  if (d.reason) out.reason = String(d.reason).replace(/^\(\d+\)\s*/, '')
  return out
}

async function check(names, onResult, { signal } = {}) {
  clearTimeout(idle)
  const ready = await pool()
  const todo = [...new Set(names.map((n) => n.toLowerCase()))]
  let left = todo.length
  if (!left) return
  await new Promise((resolve) => {
    const done = () => { if (--left === 0) resolve() }
    for (const name of todo) {
      const entry = {
        onResult: (r) => { if (!signal || !signal.aborted) onResult(r); done() },
        timer: setTimeout(() => {
          const list = waiting.get(name)
          if (list) { const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1); if (!list.length) waiting.delete(name) }
          if (!signal || !signal.aborted) onResult({ name, status: 'unknown', source: 'namecheap', reason: 'No answer in time' })
          done()
        }, NAME_TIMEOUT),
      }
      if (!waiting.has(name)) waiting.set(name, [])
      waiting.get(name).push(entry)
    }
    for (let i = 0; i < todo.length; i += PER_MESSAGE) {
      const s = ready[next++ % ready.length]
      try { s.ws.send(JSON.stringify({ type: 'domainStatus', reqID: 'd' + (++seq), data: { domains: todo.slice(i, i + PER_MESSAGE) } })) } catch {}
    }
    if (signal) signal.addEventListener('abort', resolve, { once: true })
  })
  idle = setTimeout(() => { for (const s of sockets.splice(0)) try { s.ws.close() } catch {} }, IDLE_CLOSE)
}

// Open the sockets while someone is still typing, so the first answers come sooner.
export function warm() {
  pool().catch(() => {})
}

export default {
  id: 'namecheap',
  name: 'Namecheap',
  about: 'Asks Namecheap’s live search from your browser: the registry’s answer, with premium prices.',
  live: true,
  check,
  warm,
}
