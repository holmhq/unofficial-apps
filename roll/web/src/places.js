// Names a place from a photo's coordinates, on this device, with nothing sent anywhere:
// /data/places.txt lists every town and city of 15,000 people or more from GeoNames
// (CC BY 4.0). Within 25 km of one, the photo is named after it, bigger towns winning over
// nearer small ones ("New York City" rather than a suburb); further out, after the region of
// the nearest town ("Valais, Switzerland"); far from any, after its country.

let loading = null

function load() {
  if (!loading) {
    loading = fetch('/data/places.txt').then((r) => (r.ok ? r.text() : Promise.reject(new Error('places')))).then((text) => {
      const countries = new Map()
      const regions = new Map()
      const lat = []
      const lon = []
      const size = []
      const info = []
      for (const line of text.split('\n')) {
        if (!line) continue
        if (line[0] === '@') { const i = line.indexOf(' '); countries.set(line.slice(1, i), line.slice(i + 1)); continue }
        if (line[0] === '#') { const i = line.indexOf(' '); regions.set(line.slice(1, i), line.slice(i + 1)); continue }
        const parts = line.split(' ')
        lat.push(+parts[0]); lon.push(+parts[1]); size.push(+parts[4]); info.push([parts[2], parts[3], parts.slice(5).join(' ')])
      }
      return { countries, regions, lat: Float32Array.from(lat), lon: Float32Array.from(lon), size: Uint8Array.from(size), info }
    }).catch((error) => { loading = null; throw error })
  }
  return loading
}

const RAD = Math.PI / 180
const KM = 111.2

export async function placeName([la, lo]) {
  try {
    const db = await load()
    const cos = Math.cos(la * RAD)
    let nearest = -1
    let nearestD = Infinity
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < db.lat.length; i++) {
      const dy = db.lat[i] - la
      if (dy > 3 || dy < -3) continue
      let dx = db.lon[i] - lo
      if (dx > 180) dx -= 360
      if (dx < -180) dx += 360
      const km = Math.sqrt(dy * dy + (dx * cos) * (dx * cos)) * KM
      if (km < nearestD) { nearestD = km; nearest = i }
      if (km <= 25) {
        // A town of 15,000 weighs 1, a city of 1.5 million 3, so a big city 6 km away beats a
        // small town 2 km away.
        const score = (km + 0.5) / (1 + (db.size[i] - 42) / 10)
        if (score < bestScore) { bestScore = score; best = i }
      }
    }
    if (best >= 0) {
      const [cc, , name] = db.info[best]
      return `${name}, ${db.countries.get(cc) || cc}`
    }
    if (nearest < 0 || nearestD > 300) return null
    const [cc, a1] = db.info[nearest]
    const country = db.countries.get(cc) || cc
    const region = nearestD <= 100 ? db.regions.get(cc + '.' + a1) : null
    return region && region !== country ? `${region}, ${country}` : country
  } catch {
    return null
  }
}
