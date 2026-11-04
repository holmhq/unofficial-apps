// A small query language for search and saved views, close to Readwise Reader's filtered
// views. Words are searched for; filters narrow; a minus turns one around.
//
//   tag:design  #design          site:nytimes.com     author:thoreau
//   in:list  in:feed  in:archive  in:favourites  (or is:unread, is:archived, is:fav)
//   is:seen  is:unseen  is:started  is:finished
//   kind:article|book|pdf|doc|video|notes
//   has:highlights  has:notes  has:summary  has:tags
//   minutes:<10  minutes:>30  minutes:5-15
//   saved:<7d  saved:>30d  saved:2026-10    (within, older than, in a month)
//   from:claude|feed|import|bookmarklet|share
//   -tag:news   (any filter, turned around)

const KINDS = { article: (i) => (i.kind || 'article') === 'article' && !i.video, book: (i) => i.kind === 'book', pdf: (i) => i.kind === 'pdf', doc: (i) => i.kind === 'doc', video: (i) => !!i.video, notes: (i) => i.kind === 'notes' }
const mins = (i) => (i.words ? Math.max(1, Math.round(i.words / 230)) : 0)

function range(text, value) {
  const m = /^([<>]=?)?(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/.exec(text)
  if (!m) return null
  const a = Number(m[2])
  if (m[3]) return value >= a && value <= Number(m[3])
  if (m[1] === '<') return value < a
  if (m[1] === '<=') return value <= a
  if (m[1] === '>') return value > a
  if (m[1] === '>=') return value >= a
  return value === a
}

function ago(text, at) {
  const m = /^([<>])(\d+)([dwmy])$/.exec(text)
  if (m) {
    const unit = { d: 864e5, w: 7 * 864e5, m: 30 * 864e5, y: 365 * 864e5 }[m[3]]
    const cut = Date.now() - Number(m[2]) * unit
    return m[1] === '<' ? at >= cut : at < cut
  }
  const month = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(text)
  if (month) {
    const d = new Date(at)
    return d.getFullYear() === Number(month[1]) && (!month[2] || d.getMonth() + 1 === Number(month[2])) && (!month[3] || d.getDate() === Number(month[3]))
  }
  return null
}

function test(key, value) {
  const v = value.toLowerCase()
  switch (key) {
    case 'tag': return (i) => (i.tags || []).includes(v.replace(/^#/, ''))
    case 'site': return (i) => (i.site || '').toLowerCase().includes(v) || (i.host || '').includes(v)
    case 'author': return (i) => (i.author || '').toLowerCase().includes(v)
    case 'in': case 'is': {
      if (['list', 'unread', 'later', 'reading'].includes(v)) return (i) => i.state === 'unread' && i.kind !== 'notes'
      if (['feed', 'inbox'].includes(v)) return (i) => i.state === 'feed'
      if (['archive', 'archived', 'done'].includes(v)) return (i) => i.state === 'archived' && i.kind !== 'notes'
      if (['fav', 'favourite', 'favourites', 'favorite', 'favorites', 'shortlist', 'starred'].includes(v)) return (i) => !!i.fav
      if (v === 'seen') return (i) => i.state === 'feed' && i.seen
      if (v === 'unseen') return (i) => i.state === 'feed' && !i.seen
      if (v === 'started') return (i) => i.progress > 0.02 && i.progress < 0.97
      if (v === 'finished') return (i) => i.progress >= 0.97 || i.state === 'archived'
      return null
    }
    case 'kind': case 'type': case 'category': return KINDS[v.replace(/s$/, '')] || KINDS[v] || null
    case 'has': {
      if (v.startsWith('highlight')) return (i) => (i.marks || 0) > 0
      if (v.startsWith('note')) return (i) => !!i.note
      if (v === 'summary') return (i) => !!(i.summary && i.summary.length)
      if (v.startsWith('tag')) return (i) => (i.tags || []).length > 0
      return null
    }
    case 'minutes': case 'min': case 'time': return /^[<>=\d]/.test(v) ? (i) => i.words > 0 && range(v, mins(i)) : null
    case 'words': return (i) => range(v, i.words || 0)
    case 'highlights': return (i) => range(v, i.marks || 0)
    case 'saved': case 'date': return (i) => ago(v, i.saved || 0)
    case 'from': case 'via': return (i) => (i.via || 'app') === v || (v === 'feed' && !!i.feed)
    default: return null
  }
}

// { words, filters: [{ key, value, not, fn }], plain } from a query.
export function parse(text) {
  const words = []
  const filters = []
  for (const raw of String(text || '').match(/-?[\w]+:"[^"]*"|-?[\w]+:\S+|"[^"]+"|\S+/g) || []) {
    const not = raw.startsWith('-') && raw.length > 1 && (raw.includes(':') || raw.startsWith('-#'))
    const token = not ? raw.slice(1) : raw
    const hash = /^#([\p{L}\p{N}_-]+)$/u.exec(token)
    const m = hash ? ['', 'tag', hash[1]] : /^(\w+):"?([^"]*)"?$/.exec(token)
    const fn = m && m[2] ? test(m[1].toLowerCase(), m[2]) : null
    if (fn) filters.push({ key: m[1].toLowerCase(), value: m[2], not, fn })
    else words.push(raw.replace(/^"|"$/g, ''))
  }
  return { words, filters, plain: words.join(' ') }
}

export const hasFilters = (text) => parse(text).filters.length > 0

export function apply(items, query) {
  const { filters } = typeof query === 'string' ? parse(query) : query
  return items.filter((i) => filters.every((f) => (f.not ? !f.fn(i) : f.fn(i))))
}

// The keys, for the help line under the search field.
export const HELP = [
  ['tag:', 'a tag'], ['site:', 'a site'], ['in:', 'list, feed, archive, favourites'], ['kind:', 'book, pdf, video…'],
  ['has:', 'highlights, notes'], ['minutes:', '<10, >30'], ['saved:', '<7d, 2026-10'], ['from:', 'claude, feed']
]
