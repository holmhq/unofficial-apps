// Builds web/data/places.txt, the offline place names Roll gives photos with a location,
// from GeoNames (https://www.geonames.org, CC BY 4.0):
//   node tools/places.mjs <dir with cities15000.txt, admin1CodesASCII.txt, countryInfo.txt>
// One line per country ("@CC Name"), per region ("#CC.A1 Name") and per town or city of
// 15,000 people or more ("lat lon CC A1 size Name", two decimals; size is ten times the
// log10 of the population). Neighbourhoods (PPLX) and numbered districts ("Paris 16
// Passy") are left out, so a photo in them is named after the city.
import { readFileSync, writeFileSync } from 'node:fs'
const dir = process.argv[2]
const rows = (file) => readFileSync(`${dir}/${file}`, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'))
const countries = new Map(rows('countryInfo.txt').map((r) => [r[0], r[4]]))
const regions = new Map(rows('admin1CodesASCII.txt').map((r) => [r[0], r[1]]))
const cities = rows('cities15000.txt').filter((r) => r[7] !== 'PPLX' && !/\s\d{2}(\s|$)/.test(r[1]))
const usedC = new Set(), usedR = new Set()
const lines = []
for (const r of cities) {
  const [name, lat, lon, cc, a1] = [r[1], (+r[4]).toFixed(2), (+r[5]).toFixed(2), r[8], r[10]]
  const size = Math.round(Math.log10(Math.max(15000, +r[14] || 15000)) * 10)
  usedC.add(cc); if (regions.has(cc + '.' + a1)) usedR.add(cc + '.' + a1)
  lines.push(`${+lat} ${+lon} ${cc} ${a1 || '-'} ${size} ${name}`)
}
const head = [...usedC].sort().filter((c) => countries.has(c)).map((c) => `@${c} ${countries.get(c)}`)
  .concat([...usedR].sort().map((k) => `#${k} ${regions.get(k)}`))
writeFileSync(new URL('../web/data/places.txt', import.meta.url), head.concat(lines).join('\n') + '\n')
console.log(cities.length, 'places,', usedR.size, 'regions,', usedC.size, 'countries')
