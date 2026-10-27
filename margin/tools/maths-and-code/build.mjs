// Writes the files Margin vendors for maths and code, with their licences:
//   api/vendor/highlight/highlight.mjs   highlight.js core + languages (server, at save)
//   api/vendor/katex/katex.mjs           KaTeX (server, at save)
//   web/vendor/katex/                    KaTeX for the editor's preview, its CSS and fonts
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';

const API = '../../api/vendor';
const WEB = '../../web/vendor';
const pkg = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));

await build({ entryPoints: ['highlight-entry.js'], bundle: true, format: 'esm', minify: true, legalComments: 'none', target: 'es2020', outfile: `${API}/highlight/highlight.mjs` });
// Holm's JavaScript engine reads \p{L}-style classes but not XID_Start/XID_Continue (used for
// Python identifiers), so spell those with the general categories they're made of.
const hl = `${API}/highlight/highlight.mjs`;
const patched = readFileSync(hl, 'utf8')
  .replaceAll('[\\p{XID_Start}_]\\p{XID_Continue}*', '[\\p{L}\\p{Nl}_][\\p{L}\\p{Nl}\\p{Mn}\\p{Mc}\\p{Nd}\\p{Pc}]*');
if (/\\p\{XID_/.test(patched)) throw new Error('highlight.js has an XID property class this build does not rewrite yet.');
writeFileSync(hl, patched);
writeFileSync(`${API}/highlight/LICENSE`, `highlight.js ${pkg('highlight.js').version} (BSD-3-Clause)\n\n${readFileSync('node_modules/highlight.js/LICENSE', 'utf8')}`);

const katexLicense = `KaTeX ${pkg('katex').version} (MIT)\n\n${readFileSync('node_modules/katex/LICENSE', 'utf8')}`;
for (const dir of [`${API}/katex`, `${WEB}/katex`]) {
  await build({ entryPoints: ['node_modules/katex/dist/katex.mjs'], bundle: true, format: 'esm', minify: true, legalComments: 'none', target: 'es2020', outfile: `${dir}/katex.mjs` });
  writeFileSync(`${dir}/LICENSE`, katexLicense);
}
// Browsers that read KaTeX's CSS all take WOFF2, so only those fonts ship.
const css = readFileSync('node_modules/katex/dist/katex.min.css', 'utf8').replace(/src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"\)(,url\([^)]+\) format\("[^"]+"\))+/g, 'src:url($1) format("woff2")');
rmSync(`${WEB}/katex/fonts`, { recursive: true, force: true });
mkdirSync(`${WEB}/katex/fonts`, { recursive: true });
writeFileSync(`${WEB}/katex/katex.css`, css);
let fonts = 0;
for (const file of readdirSync('node_modules/katex/dist/fonts')) if (file.endsWith('.woff2')) { copyFileSync(`node_modules/katex/dist/fonts/${file}`, `${WEB}/katex/fonts/${file}`); fonts++; }
console.log(`highlight.js ${pkg('highlight.js').version}, KaTeX ${pkg('katex').version}, ${fonts} fonts`);
