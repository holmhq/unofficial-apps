// PDFs, with Mozilla's pdf.js (vendored in /vendor/pdfjs, loaded the first time a PDF is
// opened). On the way in, the browser reads a PDF's words page by page, for search and for
// Claude, and draws its first page for the list. In the reader, pages are drawn as they come
// near, each with pdf.js's text layer over it so words can be selected and highlighted; a
// highlight belongs to its page ("Page 12") and its place in that page's text.

let lib = null
async function pdfjs() {
  if (!lib) {
    lib = await import('/vendor/pdfjs/pdf.min.mjs')
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'
  }
  return lib
}

async function open(bytes) {
  const p = await pdfjs()
  return p.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

// A page's words as paragraphs: lines from where the words sit, paragraphs from the gaps
// between lines, hyphens at line ends joined back up.
function paragraphs(items) {
  const lines = []
  let line = null
  for (const it of items) {
    if (!('str' in it)) continue
    const y = it.transform[5]
    const size = Math.hypot(it.transform[2], it.transform[3]) || 10
    if (!line || Math.abs(y - line.y) > size * 0.5) { line = { y, size, text: '' }; lines.push(line) }
    line.text += it.str
    if (it.hasEOL) line = null
  }
  const out = []
  let para = ''
  let last = null
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const gap = last ? Math.abs(last.y - l.y) : 0
    if (para && last && gap > Math.max(l.size, last.size) * 1.65) { out.push(para); para = '' }
    if (!para) para = text
    else if (/[A-Za-z]-$/.test(para) && /^[a-z]/.test(text)) para = para.slice(0, -1) + text
    else para += ' ' + text
    last = l
  }
  if (para) out.push(para)
  return out
}

// The words set largest on the first page, which is nearly always the title.
function largest(items) {
  // Upright words only: a stamp down the margin (arXiv's) is large but isn't the title.
  const upright = items.filter((it) => 'str' in it && it.str.trim() && Math.abs(it.transform[1]) < 0.01 && Math.abs(it.transform[2]) < 0.01)
  let size = 0
  for (const it of upright) size = Math.max(size, Math.abs(it.transform[3]))
  if (!size) return ''
  const words = upright.filter((it) => Math.abs(Math.abs(it.transform[3]) - size) < size * 0.08).map((it) => it.str).join(' ')
  const t = clean(words)
  return t.length >= 3 && t.length <= 200 ? t : ''
}

// What Shelf keeps of a PDF: its details, its words as plain HTML (a section per page) and
// as text, and a picture of the first page.
export async function readPDF(bytes, onStep = () => {}) {
  const doc = await open(bytes.slice(0))
  const meta = await doc.getMetadata().catch(() => ({}))
  const info = (meta && meta.info) || {}
  const pages = doc.numPages
  let html = ''
  let text = ''
  let firstLines = []
  let bigLine = ''
  for (let n = 1; n <= Math.min(pages, 3000); n++) {
    if (n % 5 === 1) onStep(n / pages)
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const paras = paragraphs(content.items)
    if (n === 1) { firstLines = paras.slice(0, 3); bigLine = largest(content.items) }
    html += `<section aria-label="Page ${n}">` + paras.map((p) => '<p>' + esc(p) + '</p>').join('') + '</section>'
    text += paras.join('\n\n') + '\n\n'
    page.cleanup()
    if (text.length > 400_000) break
  }
  // The first page, drawn small for the list.
  let cover = null
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 480 / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const g = canvas.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: g, viewport }).promise
    cover = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
  } catch {}
  const given = clean(info.Title)
  const title = given && !/^(untitled|microsoft word|document|paper|slide)/i.test(given) && !/\.(docx?|tex|pdf)$/i.test(given) ? given : bigLine
  const words = (text.match(/\S+/g) || []).length
  await doc.destroy()
  return {
    title: (title || '').slice(0, 300),
    author: clean(info.Author).slice(0, 120),
    pages,
    html,
    text: text.slice(0, 400_000),
    words,
    excerpt: clean(firstLines.join(' ')).slice(0, 300),
    cover
  }
}

// The reader's view of a PDF: a page placeholder for each page at its size, drawn when it
// comes within a screen or two and let go when it's far away. `onPage(n, layer)` hears each
// text layer as it's made, to paint highlights on it.
export async function viewPDF({ bytes, container, panel, onPage = () => {} }) {
  const p = await pdfjs()
  const doc = await open(bytes)
  const first = await doc.getPage(1)
  const base = first.getViewport({ scale: 1 })
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const el = document.createElement('div')
    el.className = 'pdf-page'
    el.dataset.page = String(n)
    el.style.aspectRatio = `${base.width} / ${base.height}`
    container.append(el)
    pages.push({ n, el, drawn: false, task: null, layer: null })
  }
  let width = container.clientWidth
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  async function draw(pg) {
    if (pg.drawn) return
    pg.drawn = true
    const page = await doc.getPage(pg.n)
    const raw = page.getViewport({ scale: 1 })
    const scale = width / raw.width
    const viewport = page.getViewport({ scale })
    pg.el.style.aspectRatio = `${raw.width} / ${raw.height}`
    pg.el.style.setProperty('--scale-factor', String(scale))
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    const layer = document.createElement('div')
    layer.className = 'textLayer'
    pg.el.replaceChildren(canvas, layer)
    try {
      pg.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr }) })
      await pg.task.promise
      const text = new p.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport })
      await text.render()
      if (!pg.drawn) return
      pg.layer = layer
      onPage(pg.n, layer)
    } catch (e) {
      if (!e || e.name !== 'RenderingCancelledException') console.warn('pdf page', pg.n, e)
    }
  }

  function release(pg) {
    if (!pg.drawn) return
    pg.drawn = false
    if (pg.task) try { pg.task.cancel() } catch {}
    pg.layer = null
    pg.el.replaceChildren()
  }

  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const pg = pages[Number(e.target.dataset.page) - 1]
      if (e.isIntersecting) draw(pg)
    }
  }, { root: panel, rootMargin: '1400px 0px' })
  const far = new IntersectionObserver((entries) => {
    for (const e of entries) if (!e.isIntersecting) release(pages[Number(e.target.dataset.page) - 1])
  }, { root: panel, rootMargin: '5000px 0px' })
  for (const pg of pages) { near.observe(pg.el); far.observe(pg.el) }

  // A wider or narrower column redraws what's showing at the new size.
  let resizeTimer = 0
  const resized = new ResizeObserver(() => {
    const w = container.clientWidth
    if (!w || Math.abs(w - width) < 2) return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      width = w
      for (const pg of pages) if (pg.drawn) { release(pg); draw(pg) }
    }, 150)
  })
  resized.observe(container)

  return {
    pages: doc.numPages,
    layer: (n) => (pages[n - 1] && pages[n - 1].layer) || null,
    element: (n) => (pages[n - 1] && pages[n - 1].el) || null,
    draw: (n) => pages[n - 1] && draw(pages[n - 1]),
    destroy() {
      near.disconnect()
      far.disconnect()
      resized.disconnect()
      for (const pg of pages) release(pg)
      doc.destroy()
    }
  }
}
