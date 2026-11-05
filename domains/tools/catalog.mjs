#!/usr/bin/env node
// Refresh web/data/tlds.json: the extensions Namecheap sells and their list prices. The same
// file goes to api/tlds.json, for the MCP tools, which can't read web/.
//
//   node tools/catalog.mjs              fetch both feeds with a real browser, then write
//   node tools/catalog.mjs a.json b.json  build from saved copies of the two feeds
//
// The feeds are Namecheap's own website JSON (tlds.ashx and the pricing details the
// TLD pages use). They sit behind a browser check, so plain HTTP clients (curl, a
// Holm server) get 403; this script opens them in Chromium through playwright-core
// (set PLAYWRIGHT_CORE to its path if it isn't installed here). Prices are what the
// site showed, in US dollars, for one year; checkout is the real price.

import { readFileSync, writeFileSync } from 'node:fs'

const OUT = new URL('../web/data/tlds.json', import.meta.url)
const OUT_API = new URL('../api/tlds.json', import.meta.url)
const TLDS = 'https://www.namecheap.com/domains/tlds.ashx'
const PRICING = 'https://www.namecheap.com/api/v1/ncpl/landingpages/gateway/getdomainspricingdetails'

async function fetchFeeds() {
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args: ['--disable-blink-features=AutomationControlled'] })
  try {
    const page = await (await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' })).newPage()
    await page.goto(TLDS, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForFunction(() => document.body.innerText.trim().startsWith('['), null, { timeout: 30000 })
    const tlds = JSON.parse(await page.evaluate(() => document.body.innerText))
    const pricing = await page.evaluate(async (url) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ request: { Term: '', Duration: 1, TldsRequestType: 'ExceptTlds', Tlds: [] } }) })
      return r.json()
    }, PRICING)
    return { tlds, pricing }
  } finally {
    await browser.close()
  }
}

const money = (n) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : null)

const [a, b] = process.argv.slice(2)
const { tlds, pricing } = a && b ? { tlds: JSON.parse(readFileSync(a, 'utf8')), pricing: JSON.parse(readFileSync(b, 'utf8')) } : await fetchFeeds()
const details = new Map(pricing.filter((p) => p && p.Tld).map((p) => [p.Tld.toLowerCase(), p]))

const out = []
for (const t of tlds) {
  const name = String(t.Name || '').toLowerCase()
  const price = t.Pricing || {}
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(name) || money(price.Price) == null) continue
  const d = details.get(name) || {}
  const row = { t: name, p: money(price.Price), r: money(price.Renewal) ?? money(price.Price) }
  if (money(price.Regular) && money(price.Regular) !== row.p) row.g = money(price.Regular)
  if (t.Type === 'CCTLD') row.cc = 1
  if ((t.Categories || []).some((c) => c.CategoryName === 'popular')) row.pop = 1
  if (t.TldsState === 'eap') row.eap = 1
  if ((t.MinRegisterYears || 1) > 1) row.min = t.MinRegisterYears
  if (d.NeedsExtendedAttributes) row.x = 1
  if (t.Type === 'CCTLD' && d.Country) row.c = d.Country
  if (price.Hint) row.h = String(price.Hint).slice(0, 40)
  out.push(row)
}
out.sort((x, y) => (x.t < y.t ? -1 : 1))
const doc = { source: 'namecheap', currency: 'USD', updated: new Date().toISOString().slice(0, 10), tlds: out }
writeFileSync(OUT, JSON.stringify(doc) + '\n')
writeFileSync(OUT_API, JSON.stringify(doc) + '\n')
console.log(`wrote ${out.length} extensions to web/data/tlds.json`)
