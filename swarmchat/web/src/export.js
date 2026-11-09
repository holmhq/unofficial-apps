// A swarm's export in the browser: the same upstream data folder `swarmchat.mjs export DIR` writes (server.json,
// users, state, chats/<id>/log/*.jsonl, blobs), renumbered into upstream's log lines, as one .zip to download.
// Upstream's own `swarmchat view --data DIR` opens the unzipped folder.
import { api } from './kit.js'

const SEGMENT = 10000

export async function exportSwarm(swarm, onProgress = () => {}) {
  const call = (name, body) => api(`/api/swarms/${swarm}/${name}`, { method: 'POST', body })
  let page = await call('export_page', { after: 0, limit: 500 })
  const first = page
  const chats = new Map((first.chats || []).map((c) => [c.id, c]))
  const logs = new Map()
  const blobs = new Map()
  const logOf = (id) => {
    if (!logs.has(id)) logs.set(id, { line: 0, lines: [], seqs: new Map(), deleted: new Set() })
    return logs.get(id)
  }
  const lineOf = (log, seq) => {
    seq = Number(seq)
    if (log.seqs.has(seq)) return log.seqs.get(seq)
    let best = 0
    for (const [s, line] of log.seqs) if (s <= seq && line > best) best = line
    return best
  }
  const mapId = (chat, log, id) => {
    const m = /^([0-9a-f]{6,32}):(\d+)$/.exec(String(id || '').trim())
    return m && m[1] === chat && log.seqs.has(Number(m[2])) ? `${chat}:${log.seqs.get(Number(m[2]))}` : id
  }
  const created = (c) => ({
    kind: 'created', from: c.created_by, at: c.created_at, members: c.members, name: c.name ?? null,
    ...(c.public ? { public: true } : {}), ...(c.description ? { description: c.description } : {}),
  })
  const push = (log, e) => log.lines.push(JSON.stringify({ seq: ++log.line, ...e }))
  let done = 0
  for (;;) {
    for (const e of page.events || []) {
      const chat = chats.get(e.chat)
      if (!chat) continue
      const log = logOf(e.chat)
      if (log.line === 0 && e.kind !== 'created') push(log, created(chat))
      const base = { kind: e.kind, from: e.from, at: e.at }
      switch (e.kind) {
        case 'created':
          push(log, { kind: 'created', from: e.from, at: e.at, members: e.members, name: e.name ?? null, ...(e.public ? { public: true } : {}), ...(e.description ? { description: e.description } : {}) })
          break
        case 'message': {
          log.seqs.set(Number(e.seq), log.line + 1)
          const reply = e.reply_to ? { reply_to: mapId(e.chat, log, e.reply_to) } : {}
          if (e.deleted) { log.deleted.add(Number(e.seq)); push(log, { kind: 'message', from: e.from, at: e.at, ...reply }) } else {
            for (const f of e.attachments || []) if (f.sha256) blobs.set(f.sha256, f.size)
            push(log, { kind: 'message', from: e.from, text: e.text ?? '', ...(e.attachments?.length ? { attachments: e.attachments } : {}), ...reply, ...(e.mentions?.length ? { mentions: e.mentions } : {}), at: e.at })
          }
          break
        }
        case 'edit':
          if (log.deleted.has(Number(e.target))) push(log, { ...base, target: lineOf(log, e.target), text: '' })
          else push(log, { ...base, target: lineOf(log, e.target), text: e.text ?? '', ...(e.mentions ? { mentions: e.mentions } : {}) })
          break
        case 'delete': push(log, { ...base, target: lineOf(log, e.target) }); break
        case 'react': push(log, { ...base, target: lineOf(log, e.target), emoji: e.emoji, remove: !!e.remove }); break
        case 'read': { const upto = lineOf(log, e.upto); if (upto) push(log, { ...base, upto }); break }
        case 'added': case 'removed': push(log, { ...base, users: e.users || [] }); break
        case 'renamed': push(log, { ...base, name: e.name }); break
        case 'described': push(log, { ...base, description: e.description ?? '' }); break
        case 'managers': push(log, { ...base, ...(e.added?.length ? { added: e.added } : {}), ...(e.removed?.length ? { removed: e.removed } : {}) }); break
        case 'visibility': push(log, { ...base, public: !!e.public }); break
        default: { const { n: _n, chat: _c, seq: _s, ...rest } = e; push(log, rest) }
      }
    }
    done += (page.events || []).length
    onProgress(`Reading history… ${done.toLocaleString('en-US')} events`)
    if (page.next === null || page.next === undefined) break
    page = await call('export_page', { after: page.next, limit: 500 })
  }
  const files = []
  const add = (path, data) => files.push({ path, data: typeof data === 'string' ? new TextEncoder().encode(data) : data })
  const json = (x) => JSON.stringify(x, null, 1)
  const root = 'swarmchat-' + String(first.swarm?.name || swarm).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '/'
  add(root + 'server.json', json({ format: 1, created_at: first.swarm?.created_at || new Date().toISOString(), segment: SEGMENT }))
  if (first.policy && Object.keys(first.policy).length) add(root + 'policy.json', json(first.policy))
  const retired = new Set()
  for (const r of first.retired || []) { retired.add(r.id); add(`${root}retired/${r.id}.json`, json({ id: r.id, deleted_at: r.deleted_at })) }
  for (const u of (first.users || []).filter((x) => !retired.has(x.id))) {
    add(`${root}users/${u.id}.json`, json({ id: u.id, name: u.name || u.id, fields: u.fields || {}, status: u.status || '', token_sha256: u.token_sha256 || '', created_at: u.created_at }))
    const s = first.state?.[u.id] || {}
    const read = {}
    for (const [chat, seq] of Object.entries(s.read || {})) { const line = logs.has(chat) ? lineOf(logs.get(chat), seq) : 0; if (line) read[chat] = line }
    add(`${root}state/${u.id}.json`, json({ read, notify: s.notify || {} }))
  }
  for (const c of chats.values()) {
    const meta = { id: c.id, name: c.name ?? null, members: c.members || [], created_by: c.created_by, created_at: c.created_at }
    if (c.name) meta.managers = c.managers || [c.created_by]
    if (c.public) meta.public = true
    if (c.description) meta.description = c.description
    if (c.archived) meta.archived = true
    add(`${root}chats/${c.id}/meta.json`, json(meta))
    const log = logOf(c.id)
    if (log.line === 0) push(log, created(c))
    for (let i = 0; i < log.lines.length; i += SEGMENT) add(`${root}chats/${c.id}/log/${String(i / SEGMENT + 1).padStart(6, '0')}.jsonl`, log.lines.slice(i, i + SEGMENT).join('\n') + '\n')
  }
  let k = 0
  for (const sha of blobs.keys()) {
    if (!/^[0-9a-f]{64}$/.test(sha)) continue
    onProgress(`Fetching files… ${++k} of ${blobs.size}`)
    const res = await fetch(`/api/swarms/${swarm}/export_file`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: sha }) })
    if (res.ok) add(`${root}blobs/${sha.slice(0, 2)}/${sha}`, new Uint8Array(await res.arrayBuffer()))
  }
  onProgress('Packing…')
  return { blob: zip(files), name: root.slice(0, -1) + '.zip', chats: chats.size, files: blobs.size }
}

// ---------------------------------------------------------------------- a .zip with stored (uncompressed) files

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files) {
  const parts = []
  const central = []
  let offset = 0
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const f of files) {
    const name = new TextEncoder().encode(f.path)
    const crc = crc32(f.data)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true)
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true)
    head.setUint32(18, f.data.length, true); head.setUint32(22, f.data.length, true); head.setUint16(26, name.length, true)
    parts.push(head.buffer, name, f.data)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true)
    dir.setUint16(12, time, true); dir.setUint16(14, date, true); dir.setUint32(16, crc, true)
    dir.setUint32(20, f.data.length, true); dir.setUint32(24, f.data.length, true); dir.setUint16(28, name.length, true)
    dir.setUint32(38, (0o100600 << 16) >>> 0, true); dir.setUint32(42, offset, true)
    central.push(dir.buffer, name)
    offset += 30 + name.length + f.data.length
  }
  const size = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}
