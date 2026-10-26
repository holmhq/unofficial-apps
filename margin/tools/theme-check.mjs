#!/usr/bin/env node
// Check a Margin theme folder with the same validator the server runs before saving.
//   node tools/theme-check.mjs <theme-folder>
// A built-in theme keeps templates in api/themes/<id>/ and assets in web/themes/<id>/;
// pass both: node tools/theme-check.mjs api/themes/quiet web/themes/quiet
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { validate } from '../api/themes.js';

const [root, assets] = process.argv.slice(2);
if (!root) { console.error('Usage: node tools/theme-check.mjs <theme-folder> [assets-folder]'); process.exit(2); }
const BINARY = new Set(['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico']);
const files = {};
function walk(dir, base, prefix = '') {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path, base, prefix); continue; }
    const rel = prefix + relative(base, path).split('\\').join('/');
    if (/\.txt$/.test(name) && prefix) continue;
    files[rel] = BINARY.has(extname(name).toLowerCase()) ? { base64: readFileSync(path).toString('base64') } : readFileSync(path, 'utf8');
  }
}
walk(root, root);
if (assets) walk(assets, assets, 'assets/');
const result = validate(files);
for (const e of result.errors) console.log(`error   ${e.file}${e.line ? ':' + e.line : ''}  ${e.message}`);
for (const w of result.warnings) console.log(`warning ${w.file}${w.line ? ':' + w.line : ''}  ${w.message}`);
console.log(result.ok ? `ok: ${result.manifest.id} ${result.manifest.version} (${Object.keys(files).length} files)` : `${result.errors.length} error(s)`);
process.exit(result.ok ? 0 : 1);
