// Themes: a theme is theme.json, Mustache templates, partials and assets (CSS, fonts,
// images). Margin renders every reading page through the active theme. Themes cannot run
// JavaScript: the validator refuses scripts, event handlers and outside URLs, and only
// Margin's own hooks may print raw HTML. Built-in themes live in api/themes/<id>/ with
// their assets in web/themes/<id>/; saved themes live in app storage.
import Mustache from './vendor/mustache/mustache.js';
import { reject, text, escapeHTML } from './lib/util.js';
import { rows, touch } from './lib/store.js';

export const BUILT_IN = ['quiet', 'editorial'];
export const TEMPLATES = ['layout', 'home', 'blog', 'list', 'post', 'error'];
export const LAYOUTS = ['panel', 'margin'];
const TEXT_TYPES = { css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', md: 'text/markdown' };
const BINARY_TYPES = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon' };
const RAW_ALLOWED = new Set(['body', 'margin.head', 'margin.foot', 'margin.account', 'margin.actions', 'margin.comments', 'post.body']);
const SETTING_TYPES = ['text', 'textarea', 'color', 'boolean', 'select', 'url'];
const LIMITS = { files: 80, text: 200000, asset: 1500000, total: 6000000 };

// Names a template may start a lookup from; anything else is a warning, not an error.
export const ROOTS = {
  common: ['site', 'theme', 'page', 'margin', 'viewer', 'latest', 'featured', 'writers', 'tags', 'q', 'year'],
  layout: ['body'],
  home: ['posts', 'pagination'],
  blog: ['blog', 'posts', 'pagination'],
  list: ['list', 'posts', 'pagination'],
  post: ['post', 'blog', 'related', 'more', 'newer', 'older', 'comments'],
  error: ['error'],
};

const extOf = (path) => (path.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

// ---------- loading ----------

function builtIn(env, id) {
  const p = env.holm.private;
  const base = `themes/${id}`;
  const manifest = JSON.parse(p.read(`${base}/theme.json`));
  const templates = {};
  for (const name of TEMPLATES) templates[name] = p.read(`${base}/templates/${name}.html`);
  const partials = {};
  let listed = [];
  try { listed = p.list(`${base}/partials`) || []; } catch { listed = []; }
  for (const entry of listed) {
    const path = typeof entry === 'string' ? entry : entry && (entry.path || entry.name);
    if (!path || !path.endsWith('.html')) continue;
    const name = path.split('/').pop().replace(/\.html$/, '');
    partials[name] = p.read(`${base}/partials/${name}.html`);
  }
  return { ...normalize(manifest), id, builtIn: true, rev: 'b', templates, partials, assets: `/themes/${id}` };
}

function saved(env, id) {
  const row = env.holm.app.ds.find('themes', { themeId: id }, { limit: 1 })[0];
  if (!row) return null;
  const object = env.holm.app.s3.get(`themes/${id}/${row.rev}.json`);
  if (!object) return null;
  const bundle = JSON.parse(new TextDecoder().decode(object.data));
  return { ...normalize(bundle.manifest), id, builtIn: false, rev: row.rev, templates: bundle.templates, partials: bundle.partials || {}, assets: `/t/${id}.${row.rev}`, assetList: bundle.assets || [] };
}

export function loadTheme(env, ctx, id) {
  const key = 'theme:' + id;
  if (ctx && ctx.cache.has(key)) return ctx.cache.get(key);
  let theme = null;
  try { theme = BUILT_IN.includes(id) ? builtIn(env, id) : saved(env, id); } catch (error) {
    console.error('theme failed to load', id, String(error && error.message || error).slice(0, 300));
    theme = null;
  }
  if (!theme && id !== 'quiet') theme = loadTheme(env, ctx, 'quiet');
  if (ctx) ctx.cache.set(key, theme);
  return theme;
}

function normalize(manifest) {
  const m = manifest || {};
  return {
    name: m.name || m.id || 'Theme',
    version: m.version || '0.0.0',
    description: m.description || '',
    comments: LAYOUTS.includes(m.comments) ? m.comments : 'panel',
    settings: Array.isArray(m.settings) ? m.settings : [],
    queries: m.queries && typeof m.queries === 'object' ? m.queries : {},
    manifest: m,
  };
}

// Effective setting values: saved ones over the theme's defaults, cleaned by type.
export function settingValues(theme, saved = {}) {
  const out = {};
  for (const s of theme.settings) {
    const value = saved[s.key] !== undefined ? saved[s.key] : s.default;
    out[s.key] = cleanSetting(s, value);
  }
  return out;
}

export function cleanSetting(s, value) {
  if (s.type === 'boolean') return value === true || value === 'true';
  if (s.type === 'color') return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : (s.default || '');
  if (s.type === 'select') return (s.options || []).some((o) => (o.value ?? o) === value) ? value : s.default;
  if (s.type === 'url') {
    const v = String(value || '').trim();
    return /^(https?:\/\/|\/(?!\/))/.test(v) ? v.slice(0, 500) : '';
  }
  const v = String(value ?? '').slice(0, s.type === 'textarea' ? 2000 : 300);
  return v.replace(/^\s*javascript:/i, '');
}

// ---------- rendering ----------

// Escape only what HTML needs; Mustache's default also rewrites / and =, which garbles URLs.
Mustache.escape = escapeHTML;

export function renderPage(theme, template, view) {
  const partials = (name) => theme.partials[name];
  const body = Mustache.render(theme.templates[template] || theme.templates.error, view, partials);
  return Mustache.render(theme.templates.layout, { ...view, body }, partials);
}

// ---------- validation ----------

function lineOf(src, index) { return src.slice(0, Math.max(0, index)).split('\n').length; }

function checkMarkup(file, src, errors) {
  const rules = [
    [/<script\b/i, 'Themes cannot include <script>. Margin adds its own scripts through {{{margin.foot}}}.'],
    [/<(iframe|frame|object|embed|applet|base|portal)\b/i, 'Themes cannot include <$1>.'],
    [/<meta[^>]+http-equiv/i, 'Themes cannot set http-equiv meta tags.'],
    [/\son[a-z]+\s*=/i, 'Event handler attributes (onclick=…) are not allowed.'],
    [/(java|vb)script\s*:/i, 'javascript: addresses are not allowed.'],
    [/\bsrcdoc\s*=/i, 'srcdoc is not allowed.'],
    [/<form\b/i, 'Themes cannot include forms.'],
    [/\b(src|href|action|poster|srcset)\s*=\s*["']?\s*(https?:)?\/\//i, 'Load assets from the theme, not another site (no http:// or // addresses in src or href).'],
    [/@import/i, '@import is not allowed in templates.'],
  ];
  for (const [re, message] of rules) {
    const m = re.exec(src);
    if (!m) continue;
    // Plain links to other sites are fine in <a href>.
    if (re.source.startsWith('\\b(src|href') && /<a\b[^>]*$/i.test(src.slice(Math.max(0, m.index - 300), m.index))) continue;
    errors.push({ file, line: lineOf(src, m.index), message: message.replace('$1', m[1] || '') });
  }
}

function checkCSS(file, src, errors) {
  const rules = [
    [/@import\s+(url\()?\s*["']?\s*(https?:)?\/\//i, 'CSS cannot @import from another site. Put the file in the theme.'],
    [/url\(\s*["']?\s*(https?:)?\/\//i, 'CSS url() must point inside the theme (or data:), not another site.'],
    [/expression\s*\(/i, 'CSS expressions are not allowed.'],
    [/(java|vb)script\s*:/i, 'javascript: is not allowed in CSS.'],
    [/-moz-binding|behavior\s*:/i, 'That CSS property is not allowed.'],
    [/<\/style/i, 'CSS cannot close a style element.'],
  ];
  for (const [re, message] of rules) {
    const m = re.exec(src);
    if (m) errors.push({ file, line: lineOf(src, m.index), message });
  }
}

function walk(tokens, file, src, template, errors, warnings, depth) {
  // The layout wraps every page, so it may read any page's data.
  const roots = new Set(template === 'layout' ? Object.values(ROOTS).flat() : [...ROOTS.common, ...(ROOTS[template] || [])]);
  for (const t of tokens) {
    const [type, value, start] = t;
    if (type === '&' && !RAW_ALLOWED.has(value) && !value.endsWith('.body')) {
      errors.push({ file, line: lineOf(src, start), message: `{{{${value}}}} prints raw HTML. Only ${[...RAW_ALLOWED].join(', ')} may use triple braces; use {{${value}}} instead.` });
    }
    if ((type === 'name' || type === '&' || type === '#' || type === '^') && depth === 0 && template && value !== '.') {
      const root = value.split('.')[0];
      if (!roots.has(root)) warnings.push({ file, line: lineOf(src, start), message: `"${value}" is not part of the ${template} page's data; it will print nothing.` });
    }
    if (type === '>' && depth >= 0) t.partial = value;
    if ((type === '#' || type === '^') && Array.isArray(t[4])) walk(t[4], file, src, template, errors, warnings, depth + 1);
  }
}

function collectPartials(tokens, out) {
  for (const t of tokens) {
    if (t[0] === '>') out.add(t[1]);
    if (Array.isArray(t[4])) collectPartials(t[4], out);
  }
}

function hasHook(tokens, name) {
  for (const t of tokens) {
    if ((t[0] === '&' || t[0] === 'name') && t[1] === name) return true;
    if (Array.isArray(t[4]) && hasHook(t[4], name)) return true;
  }
  return false;
}

// files: { "theme.json": "...", "templates/post.html": "...", "assets/theme.css": "...",
//          "assets/font.woff2": { base64: "..." } }
export function validate(files) {
  const errors = [];
  const warnings = [];
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return { ok: false, errors: [{ file: '', message: 'Send files as an object of path → contents.' }], warnings };
  }
  const paths = Object.keys(files);
  if (paths.length > LIMITS.files) errors.push({ file: '', message: `A theme has ${LIMITS.files} files at most (got ${paths.length}).` });
  let total = 0;
  const templates = {};
  const partials = {};
  const assets = [];
  let manifest = null;
  for (const path of paths) {
    const value = files[path];
    if (!/^(theme\.json|templates\/[a-z0-9_-]+\.html|partials\/[a-z0-9_-]+\.html|assets\/[a-z0-9_./-]+)$/i.test(path) || path.includes('..')) {
      errors.push({ file: path, message: 'Unexpected file. A theme has theme.json, templates/*.html, partials/*.html and assets/*.' });
      continue;
    }
    const ext = extOf(path);
    const binary = value && typeof value === 'object';
    if (binary) {
      if (!BINARY_TYPES[ext]) { errors.push({ file: path, message: 'Only fonts and images may be sent as base64.' }); continue; }
      const size = Math.floor(String(value.base64 || '').length * 0.75);
      if (size > LIMITS.asset) errors.push({ file: path, message: `Assets are ${Math.round(LIMITS.asset / 1e6 * 10) / 10} MB at most.` });
      total += size;
      assets.push({ path: path.slice(7), type: BINARY_TYPES[ext], size });
      continue;
    }
    if (typeof value !== 'string') { errors.push({ file: path, message: 'Text files are sent as strings.' }); continue; }
    if (path.startsWith('assets/') && !TEXT_TYPES[ext]) { errors.push({ file: path, message: `.${ext} files must be sent as { base64 }.` }); continue; }
    if (value.length > LIMITS.text) errors.push({ file: path, message: `Text files are ${LIMITS.text / 1000} KB at most.` });
    total += value.length;
    if (path === 'theme.json') {
      try { manifest = JSON.parse(value); } catch (error) { errors.push({ file: path, message: `theme.json is not valid JSON: ${String(error.message).slice(0, 120)}` }); }
    } else if (path.startsWith('templates/')) templates[path.slice(10, -5)] = value;
    else if (path.startsWith('partials/')) partials[path.slice(9, -5)] = value;
    else {
      if (ext === 'css') checkCSS(path, value, errors);
      if (ext === 'svg') checkMarkup(path, value, errors);
      assets.push({ path: path.slice(7), type: TEXT_TYPES[ext], size: value.length });
    }
  }
  if (total > LIMITS.total) errors.push({ file: '', message: `A theme is ${LIMITS.total / 1e6} MB at most.` });

  // theme.json
  if (!manifest) {
    if (!files['theme.json']) errors.push({ file: 'theme.json', message: 'theme.json is missing.' });
  } else {
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(manifest.id || '')) errors.push({ file: 'theme.json', message: 'id is 2–32 lowercase letters, digits and hyphens, starting with a letter.' });
    if (!manifest.name || String(manifest.name).length > 40) errors.push({ file: 'theme.json', message: 'name is required (40 characters at most).' });
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) errors.push({ file: 'theme.json', message: 'version looks like 1.0.0.' });
    if (manifest.comments && !LAYOUTS.includes(manifest.comments)) errors.push({ file: 'theme.json', message: `comments is one of ${LAYOUTS.join(', ')}.` });
    if (manifest.settings !== undefined) {
      if (!Array.isArray(manifest.settings) || manifest.settings.length > 40) errors.push({ file: 'theme.json', message: 'settings is a list of up to 40 entries.' });
      else for (const s of manifest.settings) {
        if (!s || !/^[a-z][a-z0-9_]{0,39}$/.test(s.key || '')) errors.push({ file: 'theme.json', message: `Setting key "${s && s.key}" must be lowercase letters, digits and _.` });
        else if (!SETTING_TYPES.includes(s.type)) errors.push({ file: 'theme.json', message: `Setting "${s.key}" type is one of ${SETTING_TYPES.join(', ')}.` });
        else if (s.type === 'select' && !Array.isArray(s.options)) errors.push({ file: 'theme.json', message: `Setting "${s.key}" needs options.` });
      }
    }
    if (manifest.queries !== undefined) {
      if (typeof manifest.queries !== 'object' || Array.isArray(manifest.queries)) errors.push({ file: 'theme.json', message: 'queries maps a template name to named queries.' });
      else for (const [tpl, named] of Object.entries(manifest.queries)) {
        if (!TEMPLATES.includes(tpl)) errors.push({ file: 'theme.json', message: `queries.${tpl}: not a template name.` });
        for (const [name, q] of Object.entries(named || {})) {
          if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) errors.push({ file: 'theme.json', message: `queries.${tpl}.${name}: names are lowercase letters, digits and _.` });
          const keys = Object.keys(q || {}).filter((k) => !['blog', 'tag', 'featured', 'limit', 'offset', 'exclude_current'].includes(k));
          if (keys.length) errors.push({ file: 'theme.json', message: `queries.${tpl}.${name}: unknown filter ${keys.join(', ')}.` });
        }
      }
    }
  }

  // Templates: present, parse, hooks, markup rules.
  for (const name of TEMPLATES) if (!templates[name]) errors.push({ file: `templates/${name}.html`, message: 'This template is required.' });
  const used = new Set();
  const parse = (file, src, template) => {
    let tokens;
    try { tokens = Mustache.parse(src); } catch (error) {
      errors.push({ file, message: `Template does not parse: ${String(error.message).slice(0, 200)}` });
      return null;
    }
    checkMarkup(file, src, errors);
    walk(tokens, file, src, template, errors, warnings, 0);
    collectPartials(tokens, used);
    return tokens;
  };
  const parsed = {};
  for (const [name, src] of Object.entries(templates)) {
    if (!TEMPLATES.includes(name)) warnings.push({ file: `templates/${name}.html`, message: 'Margin does not use this template.' });
    parsed[name] = parse(`templates/${name}.html`, src, TEMPLATES.includes(name) ? name : null);
  }
  for (const [name, src] of Object.entries(partials)) parse(`partials/${name}.html`, src, null);
  for (const name of used) if (!partials[name]) errors.push({ file: 'partials/', message: `{{> ${name}}} is used but partials/${name}.html is missing.` });
  if (parsed.layout) {
    for (const hook of ['margin.head', 'margin.foot', 'body']) if (!hasHook(parsed.layout, hook)) errors.push({ file: 'templates/layout.html', message: `layout.html must print {{{${hook}}}}.` });
    if (!hasHook(parsed.layout, 'margin.account')) warnings.push({ file: 'templates/layout.html', message: 'No {{{margin.account}}}: readers will have no sign-in button.' });
  }
  if (parsed.post) {
    if (!hasHook(parsed.post, 'post.body') && !hasHook(parsed.post, 'body')) errors.push({ file: 'templates/post.html', message: 'post.html must print {{{post.body}}}.' });
    if (!hasHook(parsed.post, 'margin.actions')) warnings.push({ file: 'templates/post.html', message: 'No {{{margin.actions}}}: no claps or comment button.' });
    if (!hasHook(parsed.post, 'margin.comments')) warnings.push({ file: 'templates/post.html', message: 'No {{{margin.comments}}}: responses will not show.' });
  }
  const css = paths.filter((p) => p.endsWith('.css'));
  if (!css.length) warnings.push({ file: 'assets/', message: 'No CSS file: pages will use browser defaults.' });
  else if (!css.some((p) => /prefers-color-scheme|data-theme/.test(files[p] || ''))) warnings.push({ file: css[0], message: 'No dark styles found (prefers-color-scheme or [data-theme="dark"]).' });
  return { ok: !errors.length, errors, warnings, manifest, templates, partials, assets };
}

// ---------- storage ----------

export function listThemes(env) {
  const out = [];
  for (const id of BUILT_IN) {
    try {
      const m = JSON.parse(env.holm.private.read(`themes/${id}/theme.json`));
      out.push({ id, name: m.name, version: m.version, description: m.description || '', comments: m.comments || 'panel', built_in: true });
    } catch { /* skip a broken built-in */ }
  }
  for (const row of rows(env, 'themes', {}, 200)) {
    out.push({ id: row.themeId, name: row.name, version: row.version, description: row.description || '', comments: row.comments || 'panel', built_in: false, updated_at: new Date(row.updatedAt).toISOString(), size: row.size });
  }
  return out;
}

export function saveTheme(env, ctx, files) {
  const result = validate(files);
  if (!result.ok) reject(422, 'theme_invalid', `The theme has ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}.`, { errors: result.errors, warnings: result.warnings });
  const id = result.manifest.id;
  if (BUILT_IN.includes(id)) reject(409, 'built_in', `"${id}" is a built-in theme. Give your copy a new id, such as "${id}-2".`);
  const rev = Date.now().toString(36);
  const bundle = { manifest: result.manifest, templates: result.templates, partials: result.partials, assets: result.assets };
  env.holm.app.s3.put(`themes/${id}/${rev}.json`, JSON.stringify(bundle), 'application/json');
  for (const [path, value] of Object.entries(files)) {
    if (!path.startsWith('assets/')) continue;
    const name = path.slice(7);
    if (value && typeof value === 'object') {
      const bin = atob(value.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      env.holm.app.s3.put(`themes/${id}/${rev}/${name}`, bytes.buffer, BINARY_TYPES[extOf(path)]);
    } else {
      env.holm.app.s3.put(`themes/${id}/${rev}/${name}`, value, TEXT_TYPES[extOf(path)] || 'text/plain');
    }
  }
  const size = result.assets.reduce((n, a) => n + a.size, 0) + JSON.stringify(bundle).length;
  const doc = { themeId: id, name: result.manifest.name, version: result.manifest.version, description: result.manifest.description || '', comments: result.manifest.comments || 'panel', rev, size, updatedBy: ctx.member.id, updatedAt: Date.now() };
  const existing = env.holm.app.ds.find('themes', { themeId: id }, { limit: 1 })[0];
  if (existing) env.holm.app.ds.update('themes', { id: existing.id }, { $set: doc });
  else env.holm.app.ds.insert('themes', doc);
  touch(env);
  return { id, rev, warnings: result.warnings };
}

export function deleteTheme(env, id, active) {
  if (BUILT_IN.includes(id)) reject(400, 'built_in', 'Built-in themes cannot be removed.');
  if (id === active) reject(409, 'active', 'Switch to another theme first.');
  const row = env.holm.app.ds.find('themes', { themeId: id }, { limit: 1 })[0];
  if (!row) reject(404, 'not_found', 'No such theme.');
  env.holm.app.ds.delete('themes', { id: row.id });
  return { deleted: true };
}

// Every file of a theme, for download, editing over MCP, or making a copy.
export async function themeFiles(env, id, origin) {
  const files = {};
  const binaries = [];
  if (BUILT_IN.includes(id)) {
    const p = env.holm.private;
    files['theme.json'] = p.read(`themes/${id}/theme.json`);
    for (const name of TEMPLATES) files[`templates/${name}.html`] = p.read(`themes/${id}/templates/${name}.html`);
    let listed = [];
    try { listed = p.list(`themes/${id}/partials`) || []; } catch { listed = []; }
    for (const entry of listed) {
      const path = typeof entry === 'string' ? entry : entry && (entry.path || entry.name);
      if (path && path.endsWith('.html')) {
        const name = path.split('/').pop();
        files[`partials/${name}`] = p.read(`themes/${id}/partials/${name}`);
      }
    }
    const manifest = JSON.parse(files['theme.json']);
    for (const asset of manifest.assets || []) {
      const url = `/themes/${id}/${asset}`;
      if (TEXT_TYPES[extOf(asset)]) {
        const res = await env.holm.web.fetch(new Request(origin + url));
        // A copy keeps working without re-uploading fonts: point at the built-in's files.
        if (res.ok) files[`assets/${asset}`] = (await res.text()).replace(/url\((['"]?)(?![a-z]+:|\/)([^'")]+\.(woff2?|ttf|otf|png|jpe?g|webp|gif|avif|ico))\1\)/gi, (m, q, file) => `url(${q}/themes/${id}/${file}${q})`);
      } else binaries.push({ path: `assets/${asset}`, url });
    }
  } else {
    const theme = saved(env, id);
    if (!theme) reject(404, 'not_found', 'No such theme.');
    files['theme.json'] = JSON.stringify(theme.manifest, null, 2);
    for (const [name, src] of Object.entries(theme.templates)) files[`templates/${name}.html`] = src;
    for (const [name, src] of Object.entries(theme.partials)) files[`partials/${name}.html`] = src;
    for (const asset of theme.assetList) {
      if (TEXT_TYPES[extOf(asset.path)]) {
        const object = env.holm.app.s3.get(`themes/${id}/${theme.rev}/${asset.path}`);
        if (object) files[`assets/${asset.path}`] = new TextDecoder().decode(object.data);
      } else binaries.push({ path: `assets/${asset.path}`, url: `/t/${id}.${theme.rev}/${asset.path}` });
    }
  }
  return { id, files, binaries };
}

export function serveAsset(env, key, path) {
  const m = /^([a-z][a-z0-9-]{1,31})\.([a-z0-9]+)$/.exec(key);
  if (!m || !/^[a-z0-9_./-]+$/i.test(path) || path.includes('..')) return new Response('Not found', { status: 404 });
  const object = env.holm.app.s3.get(`themes/${m[1]}/${m[2]}/${path}`);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.data, { headers: {
    'Content-Type': object.mime || TEXT_TYPES[extOf(path)] || BINARY_TYPES[extOf(path)] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export function themeId(value) { return text(value, 40, 'Theme', true); }
