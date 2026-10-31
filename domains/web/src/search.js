// One search: the names made from what was typed, grouped by label, checked shortest first
// through the chosen provider, with AI ideas joining when they arrive. The page listens:
//
//   'groups'    new label groups to draw            payload: [group]
//   'cell'      a name changed state                payload: cell
//   'progress'  counts changed                      payload: search
//   'ai'        the AI's state changed              payload: search
//   'provider'  a fallback provider took over       payload: { from, to, reason }
//
// group: { key, label, kind, why, aiKind, score, cells: [cell] }
// cell:  { domain, label, tld, kind, why, score, group, state, result }
//        state: queued, checking, free, taken, maybe, unknown

import * as gen from './gen.js'
import * as catalog from './catalog.js'
import { MAX_ANY } from './settings.js'
import { provider as providerById, fallback } from './providers/index.js'

export const PASS = 300
const AI_EXTRA = 240
const CACHE_MS = 15 * 60 * 1000
const LOCAL_LABELS = 28
const DEAR = 200

// Answers from the last quarter of an hour, so changing a filter doesn't ask twice.
const known = new Map()
export function remembered(domain) {
  const k = known.get(domain)
  return k && Date.now() - k.at < CACHE_MS ? k.result : null
}
export function forget(domain) { known.delete(domain) }

export const HACKS = '·hacks'

export class Search {
  constructor(query, settings, listener) {
    this.query = query
    this.settings = { ...settings, kinds: { ...settings.kinds } }
    this.listen = listener || (() => {})
    this.parsed = gen.parse(query, catalog.has)
    this.tlds = catalog.tldsFor(settings)
    this.max = settings.max >= MAX_ANY ? 63 : settings.max
    this.groups = new Map()
    this.cells = new Map()
    this.queue = []
    this.limit = PASS
    this.sent = 0
    this.done = 0
    this.free = 0
    this.ai = settings.kinds.ai && this.parsed.words.length ? 'thinking' : 'off'
    this.aiNote = ''
    this.provider = providerById(settings.provider)
    this.switched = null
    this.started = Date.now()
    this.finished = 0
    this.controller = new AbortController()
  }

  get empty() { return !this.parsed.words.length }
  get running() { return !this.controller.signal.aborted && this.done < this.sent }
  get waiting() { return this.queue.length }

  emit(type, payload) {
    if (!this.controller.signal.aborted) this.listen(type, payload, this)
  }

  start() {
    if (this.empty) return this
    this.add(gen.labels(this.parsed, { max: this.max, kinds: this.settings.kinds, limit: LOCAL_LABELS }))
    if (this.ai === 'thinking') this.askAI()
    this.pump()
    return this
  }

  cancel() { this.controller.abort() }

  add(list) {
    const hackTlds = this.settings.kinds.hack ? catalog.all().filter((r) => !r.t.includes('.') && r.t.length <= 4).map((r) => r.t) : []
    const cells = gen.expand(list, this.tlds, { hackTlds, typed: this.parsed.typedTld })
    const fresh = []
    for (const l of list) {
      if (this.groups.has(l.label)) continue
      const g = { key: l.label, label: l.label, kind: l.kind, why: l.why, aiKind: l.aiKind || null, score: l.score, cells: [] }
      this.groups.set(l.label, g)
      fresh.push(g)
    }
    for (const cell of cells) {
      if (this.cells.has(cell.domain)) continue
      let g = this.groups.get(cell.group)
      if (!g && cell.group === HACKS) {
        g = { key: HACKS, label: 'Domain hacks', kind: 'hack', why: 'The extension finishes the word', score: cell.score, cells: [] }
        this.groups.set(HACKS, g)
        fresh.push(g)
      }
      if (!g) continue
      cell.state = 'queued'
      cell.result = null
      this.cells.set(cell.domain, cell)
      g.cells.push(cell)
      const kept = remembered(cell.domain)
      if (kept) { this.sent++; this.settle(kept, true) } else this.queue.push(cell)
    }
    this.queue.sort((a, b) => a.score - b.score)
    if (fresh.length) this.emit('groups', fresh)
    this.emit('progress', this)
    return cells.length
  }

  // Send what fits under the limit.
  pump() {
    const room = Math.max(0, this.limit - this.sent)
    if (!room || !this.queue.length) return
    const batch = this.queue.splice(0, room)
    this.sent += batch.length
    for (const cell of batch) { cell.state = 'checking'; this.emit('cell', cell) }
    this.emit('progress', this)
    this.run(batch, this.provider)
  }

  run(batch, provider) {
    const names = batch.filter((c) => !c.result).map((c) => c.domain)
    if (!names.length) return
    provider.check(names, (r) => this.settle(r), { signal: this.controller.signal }).catch((error) => {
      const other = error && error.code === 'unreachable' ? fallback(provider.id) : null
      if (other && !this.controller.signal.aborted) {
        this.provider = other
        this.switched = { from: provider, to: other, reason: error.message }
        this.emit('provider', this.switched)
        this.run(batch, other)
        return
      }
      for (const cell of batch) if (!cell.result) this.settle({ name: cell.domain, status: 'unknown', source: provider.id, reason: (error && error.message) || 'No answer' })
    })
  }

  settle(result, cached = false) {
    const cell = this.cells.get(result.name)
    if (!cell || cell.result) return
    cell.result = result
    cell.state = result.status
    if (!cached && result.status !== 'unknown') known.set(cell.domain, { result, at: Date.now() })
    this.done++
    if (result.status === 'free') this.free++
    this.emit('cell', cell)
    if (this.done >= this.sent && !this.queue.length) this.finished = Date.now()
    this.emit('progress', this)
  }

  more() {
    this.limit = this.sent + PASS
    this.pump()
  }

  async recheck(domain) {
    forget(domain)
    const cell = this.cells.get(domain)
    if (!cell) return null
    cell.result = null
    cell.state = 'checking'
    this.done--
    this.emit('cell', cell)
    await this.provider.check([domain], (r) => { cell.result = null; this.settle(r) }).catch(() => this.settle({ name: domain, status: 'unknown', source: this.provider.id, reason: 'No answer' }))
    return cell
  }

  async askAI() {
    let data = null
    try {
      const response = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ text: this.parsed.words.join(' ').slice(0, 60), max: Math.min(20, this.max) }),
        signal: this.controller.signal,
      })
      data = await response.json().catch(() => null)
      if (response.status === 429) throw new Error('You’ve asked for a lot of AI ideas this hour. They’ll be back soon.')
      if (!response.ok) throw new Error('AI ideas aren’t available right now.')
    } catch (error) {
      if (this.controller.signal.aborted) return
      this.ai = 'error'
      this.aiNote = error.message || 'AI ideas aren’t available right now.'
      this.emit('ai', this)
      return
    }
    const have = new Set(this.groups.keys())
    const list = gen.aiLabels(data && data.ideas, have, this.max)
    this.ai = list.length ? 'done' : data && data.note ? 'error' : 'empty'
    this.aiNote = (data && data.note) || (list.length ? '' : 'No new ideas this time.')
    this.aiCount = list.length
    const before = this.queue.length
    this.add(list)
    this.limit += Math.min(AI_EXTRA, this.queue.length - before)
    this.emit('ai', this)
    this.pump()
  }

  // Free names, shortest first, then cheapest; premium and very dear ones after the rest.
  best(filter = () => true, n = 12) {
    const out = []
    for (const cell of this.cells.values()) if (cell.state === 'free' && filter(cell)) out.push(cell)
    const price = (c) => { const p = catalog.priceOf(c.result, c.tld); return p ? p.first : 1e9 }
    const dear = (c) => (c.result && c.result.premium) || price(c) > DEAR ? 1 : 0
    return out.sort((a, b) => dear(a) - dear(b) || a.domain.length - b.domain.length || price(a) - price(b) || a.score - b.score).slice(0, n)
  }
}
