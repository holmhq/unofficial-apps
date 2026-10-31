// The RDAP adapter: RDAP is the registries' own open lookup (RFC 9083). This app's server
// asks each extension's registry, found through IANA's list, whether a name has a record:
// none means free to try. It knows nothing about premium prices, and some country
// extensions (.io, .co, .me, .sh, .gg among them) have no RDAP server yet, so those come
// back unknown. The server keeps answers ten minutes and caps lookups per minute.

const PER_CALL = 20
const PARALLEL = 3

async function call(names) {
  const response = await fetch('/api/rdap', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ names }),
  })
  if (response.status === 429) throw Object.assign(new Error('The registries are busy. Try again in a minute.'), { code: 'rate' })
  if (!response.ok) throw new Error('The registries didn’t answer.')
  const data = await response.json()
  return (data && data.results) || []
}

async function check(names, onResult, { signal } = {}) {
  const chunks = []
  for (let i = 0; i < names.length; i += PER_CALL) chunks.push(names.slice(i, i + PER_CALL))
  let failure = null
  const worker = async () => {
    while (chunks.length && !(signal && signal.aborted)) {
      const chunk = chunks.shift()
      let results = []
      try { if (!failure) results = await call(chunk) } catch (error) { failure = error }
      const got = new Map(results.map((r) => [r.name, r]))
      for (const name of chunk) {
        if (signal && signal.aborted) return
        const r = got.get(name)
        if (!r) { onResult({ name, status: 'unknown', source: 'rdap', reason: failure ? failure.message : 'No answer' }); continue }
        onResult({ name, status: r.status, source: 'rdap', lookup: 'RDAP', registrar: r.registrar, since: r.since, reason: r.reason || (r.status === 'free' ? 'The registry has no record of it. It may still hold some names back.' : '') })
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
}

export default {
  id: 'rdap',
  name: 'Registries (RDAP)',
  about: 'Asks each registry’s public RDAP server through this app: whether a name has a record. No premium prices, and a few country extensions aren’t covered.',
  live: true,
  check,
  warm() {},
}
