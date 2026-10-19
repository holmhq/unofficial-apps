// Syntax highlighting on top of the vendored highlight.js (window.hljs).

const hljs = window.hljs

const NAMES = {
  plaintext: 'Plain text', bash: 'Bash', shell: 'Shell session', c: 'C', cpp: 'C++', csharp: 'C#',
  css: 'CSS', diff: 'Diff', dockerfile: 'Dockerfile', go: 'Go', graphql: 'GraphQL', ini: 'INI / TOML',
  java: 'Java', javascript: 'JavaScript', json: 'JSON', kotlin: 'Kotlin', less: 'Less', lua: 'Lua',
  makefile: 'Makefile', markdown: 'Markdown', nginx: 'Nginx', objectivec: 'Objective-C', perl: 'Perl',
  php: 'PHP', python: 'Python', 'python-repl': 'Python REPL', r: 'R', ruby: 'Ruby', rust: 'Rust',
  scss: 'SCSS', sql: 'SQL', swift: 'Swift', typescript: 'TypeScript', vbnet: 'VB.NET', wasm: 'WebAssembly',
  xml: 'HTML / XML', yaml: 'YAML',
}

// Auto-detection only weighs common languages; the long tail causes false hits.
const DETECT = ['bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'dockerfile', 'go', 'ini', 'java', 'javascript',
  'json', 'kotlin', 'lua', 'makefile', 'markdown', 'php', 'python', 'ruby', 'rust', 'scss', 'sql', 'swift',
  'typescript', 'xml', 'yaml', 'nginx']

const EXT = {
  bash: 'sh', shell: 'sh', c: 'c', cpp: 'cpp', csharp: 'cs', css: 'css', diff: 'diff', dockerfile: 'Dockerfile',
  go: 'go', graphql: 'graphql', ini: 'ini', java: 'java', javascript: 'js', json: 'json', kotlin: 'kt', less: 'less',
  lua: 'lua', makefile: 'mk', markdown: 'md', nginx: 'conf', objectivec: 'm', perl: 'pl', php: 'php', python: 'py',
  'python-repl': 'txt', r: 'r', ruby: 'rb', rust: 'rs', scss: 'scss', sql: 'sql', swift: 'swift', typescript: 'ts',
  vbnet: 'vb', wasm: 'wat', xml: 'html', yaml: 'yaml', plaintext: 'txt',
}

const BY_EXT = {}
for (const [lang, ext] of Object.entries(EXT)) if (!BY_EXT[ext.toLowerCase()]) BY_EXT[ext.toLowerCase()] = lang
Object.assign(BY_EXT, {
  mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', tsx: 'typescript', yml: 'yaml', htm: 'xml', svg: 'xml',
  zsh: 'bash', toml: 'ini', h: 'c', hpp: 'cpp', cc: 'cpp', log: 'plaintext', txt: 'plaintext', csv: 'plaintext',
  patch: 'diff', vue: 'xml', env: 'bash',
})

// Highlighting cost grows fast; past this, show plain text.
export const HIGHLIGHT_LIMIT = 200 * 1024

export function languages() {
  return Object.keys(NAMES)
    .filter(id => id === 'plaintext' || (hljs && hljs.getLanguage(id)))
    .map(id => [id, NAMES[id]])
    .sort((a, b) => (a[0] === 'plaintext' ? -1 : b[0] === 'plaintext' ? 1 : a[1].localeCompare(b[1])))
}

export function langName(id) {
  return NAMES[id] || (id ? id : 'Plain text')
}

export function detect(text) {
  if (!hljs || !text || !text.trim()) return 'plaintext'
  const sample = text.length > 8000 ? text.slice(0, 8000) : text
  try {
    const res = hljs.highlightAuto(sample, DETECT.filter(l => hljs.getLanguage(l)))
    return res.language && res.relevance >= 5 ? res.language : 'plaintext'
  } catch (e) {
    return 'plaintext'
  }
}

export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function highlight(text, lang) {
  if (!hljs || !lang || lang === 'plaintext' || !hljs.getLanguage(lang) || text.length > HIGHLIGHT_LIMIT) {
    return escapeHTML(text)
  }
  try {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
  } catch (e) {
    return escapeHTML(text)
  }
}

// Split highlighted HTML into one string per line, closing spans at each line
// end and reopening them on the next, so every line is self-contained.
export function splitLines(html) {
  const lines = []
  const open = []
  let cur = ''
  const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)|(<)/g
  let m
  while ((m = re.exec(html))) {
    if (m[1]) { open.push(m[1]); cur += m[1] }
    else if (m[2]) { open.pop(); cur += m[2] }
    else if (m[3]) {
      lines.push(cur + '</span>'.repeat(open.length))
      cur = open.join('')
    } else cur += m[0]
  }
  lines.push(cur + '</span>'.repeat(open.length))
  return lines
}

export function extFor(lang) {
  return EXT[lang] || 'txt'
}

export function langForFile(name) {
  const lower = String(name || '').toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'makefile') return 'makefile'
  const ext = lower.includes('.') ? lower.split('.').pop() : ''
  return BY_EXT[ext] || 'plaintext'
}
