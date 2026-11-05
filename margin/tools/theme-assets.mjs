#!/usr/bin/env node
// The built-in themes' text assets live in web/themes/<id>/, where pages load them. The
// themes_get tool can't read web/, so api/theme-assets/<id>/ keeps a copy of each.
//   node tools/theme-assets.mjs           fail if a copy differs from web/
//   node tools/theme-assets.mjs --write   refresh the copies
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = /\.(css|html|json|svg|txt|md)$/i;
const write = process.argv.includes('--write');
let bad = 0;
for (const id of ['quiet', 'editorial']) {
  const manifest = JSON.parse(readFileSync(join(app, 'api/themes', id, 'theme.json'), 'utf8'));
  for (const asset of (manifest.assets || []).filter((a) => TEXT.test(a))) {
    const from = join(app, 'web/themes', id, asset);
    const to = join(app, 'api/theme-assets', id, asset);
    const want = readFileSync(from, 'utf8');
    if (existsSync(to) && readFileSync(to, 'utf8') === want) continue;
    if (write) { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, want); console.log('wrote', `api/theme-assets/${id}/${asset}`); }
    else { bad++; console.error('differs:', `api/theme-assets/${id}/${asset}`, '(run with --write)'); }
  }
}
if (bad) process.exit(1);
console.log(write ? 'copies up to date' : 'theme assets match');
