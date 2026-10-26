// Writes web/vendor/editor/LICENSE: the license of every package inside the bundle.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const result = await build({ entryPoints: ['entry.js'], bundle: true, format: 'esm', write: false, metafile: true, outfile: 'out.js' });
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) packages.add(m[1]);
}
let out = 'Margin\'s editor bundle (tiptap.js) is built from these packages, each under its own license.\n';
for (const name of [...packages].sort()) {
  const dir = join('node_modules', name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE'].map((f) => join(dir, f)).find(existsSync);
  out += `\n${'='.repeat(72)}\n${name} ${pkg.version} (${pkg.license})\n${'='.repeat(72)}\n\n`;
  out += file ? readFileSync(file, 'utf8').trim() + '\n' : `${pkg.license} license; no license file shipped in the package.\n`;
}
writeFileSync('../../web/vendor/editor/LICENSE', out);
console.log(`${packages.size} packages`);
