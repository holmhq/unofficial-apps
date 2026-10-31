// Registry lookups for the RDAP adapter (RFC 9083): each extension's registry, found
// through IANA's bootstrap list (rdap.json, from tools/rdap.mjs), says whether a name has a
// record. Up to 20 names a call, within about 3.5 s; answers are kept 10 minutes, and the
// whole app asks at most PER_MINUTE names a minute, since the route is open to all.

const NAME = /^(?=.{3,80}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.([a-z0-9-]+(?:\.[a-z0-9-]+)*)$/
const BUDGET_MS = 3500
const KEEP_MS = 10 * 60 * 1000
const PER_MINUTE = 1200

export function rdap(input, env) {
  const servers = JSON.parse(env.holm.private.read('rdap.json')).servers
  const kv = env.holm.app.kv
  const started = Date.now()
  const results = []
  const names = [...new Set((Array.isArray(input.names) ? input.names : []).map((n) => String(n).toLowerCase().trim()))].slice(0, 20)
  const minute = 'rdap:min:' + Math.floor(started / 60000)
  let used = Number(kv.get(minute)) || 0
  for (const name of names) {
    const m = NAME.exec(name)
    const top = m && m[2].split('.').pop()
    const base = top && servers[top]
    if (!base) { results.push({ name, status: 'unknown', source: 'rdap', reason: m ? 'no RDAP server for this extension' : 'not a domain name' }); continue }
    const kept = kv.get('rdap:' + name)
    if (kept) { results.push(JSON.parse(kept)); continue }
    if (used >= PER_MINUTE) { results.push({ name, status: 'unknown', source: 'rdap', reason: 'busy, try again in a minute' }); continue }
    if (Date.now() - started > BUDGET_MS) { results.push({ name, status: 'unknown', source: 'rdap', reason: 'out of time' }); continue }
    const r = lookup(env, base, name)
    used++
    if (r.status !== 'unknown') kv.set('rdap:' + name, JSON.stringify(r), KEEP_MS)
    results.push(r)
  }
  kv.set(minute, used, 120000)
  return { results }
}

function lookup(env, base, name) {
  let response
  try {
    response = env.holm.net.fetch(base + 'domain/' + encodeURIComponent(name), { headers: { accept: 'application/rdap+json, application/json' } })
  } catch (error) {
    return { name, status: 'unknown', source: 'rdap', reason: 'no answer' }
  }
  if (response.status === 404) return { name, status: 'free', source: 'rdap' }
  if (response.status !== 200) return { name, status: 'unknown', source: 'rdap', reason: 'registry said ' + response.status }
  const out = { name, status: 'taken', source: 'rdap' }
  try {
    const doc = response.json()
    const reg = (doc.events || []).find((e) => e.eventAction === 'registration')
    if (reg && reg.eventDate) out.since = Number(String(reg.eventDate).slice(0, 4)) || undefined
    const registrar = (doc.entities || []).find((e) => (e.roles || []).includes('registrar'))
    const card = registrar && registrar.vcardArray && registrar.vcardArray[1]
    const fn = card && card.find((f) => f[0] === 'fn')
    if (fn && fn[3]) out.registrar = String(fn[3]).slice(0, 80)
  } catch {}
  return out
}
