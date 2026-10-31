#!/usr/bin/env node
// Refresh api/rdap.json, the registry RDAP servers for the extensions in
// web/data/tlds.json, from IANA's bootstrap file (RFC 9224), and print the egress rules a
// node needs for the RDAP adapter:
//
//   node tools/rdap.mjs                  write api/rdap.json
//   node tools/rdap.mjs --allow <app-id> also print one `holm net allow` per server host

import { readFileSync, writeFileSync } from 'node:fs'

const BOOTSTRAP = 'https://data.iana.org/rdap/dns.json'
const catalog = JSON.parse(readFileSync(new URL('../web/data/tlds.json', import.meta.url), 'utf8'))
const response = await fetch(BOOTSTRAP)
if (!response.ok) throw new Error(`IANA answered ${response.status}`)
const bootstrap = await response.json()
const servers = {}
for (const [tlds, urls] of bootstrap.services) {
  const url = urls.find((u) => u.startsWith('https://')) || null
  if (url) for (const t of tlds) servers[t.toLowerCase()] = url.endsWith('/') ? url : url + '/'
}
const wanted = {}
for (const { t } of catalog.tlds) {
  const top = t.split('.').pop()
  if (servers[top]) wanted[top] = servers[top]
}
writeFileSync(new URL('../api/rdap.json', import.meta.url), JSON.stringify({ publication: bootstrap.publication, servers: wanted }) + '\n')
const hosts = [...new Set(Object.values(wanted).map((u) => new URL(u).host))].sort()
console.log(`wrote ${Object.keys(wanted).length} extensions on ${hosts.length} RDAP hosts to api/rdap.json`)
const i = process.argv.indexOf('--allow')
if (i > 0) for (const host of hosts) console.log(`holm @<peer> net allow ${host} --app ${process.argv[i + 1] || '<app-id>'} --timeout 3000`)
