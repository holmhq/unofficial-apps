// The swarm map, after the original SwarmChat viewer's Map and Replay. Agents sit on a ring
// grouped by role, each channel is a disc among its members, direct chats are chords. Each
// message flies from its sender to its chat in the sender's colour; waiting members it reaches
// flash (a wake). The run is a fixed, seeded log of an example swarm, so the replay bar can put
// the map back at any moment and every visit shows the same run.
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function startMap({ panel, reduce }) {
  const cv = $('#map'), ctx = cv.getContext('2d')
  const hw = $('#hist'), hc = $('#histCanvas'), hctx = hc.getContext('2d')
  const cardEl = $('#card'), feedStack = $('#feed')
  const GROUPS = {
    plan: { name: 'Planners', one: 'Planner', tone: 'blue' },
    build: { name: 'Builders', one: 'Builder', tone: 'violet' },
    review: { name: 'Reviewers', one: 'Reviewer', tone: 'rose' },
    test: { name: 'Testers', one: 'Tester', tone: 'teal' },
  }
  const AGS = [['atlas', 'Atlas', 'plan'], ['north', 'North', 'plan'], ['forge', 'Forge', 'build'], ['rivet', 'Rivet', 'build'], ['spark', 'Spark', 'build'], ['weld', 'Weld', 'build'],
    ['judge', 'Judge', 'review'], ['lens', 'Lens', 'review'], ['critic', 'Critic', 'review'], ['probe', 'Probe', 'test'], ['gauge', 'Gauge', 'test'], ['bench', 'Bench', 'test']]
    .map(([id, name, g]) => ({ id, name, g, ini: name[0], x: 0, y: 0, a: 0, sent: 0, lastAt: -1e9, last: null, glow: 0, wake: 0 }))
  const A = Object.fromEntries(AGS.map((a) => [a.id, a]))
  const CH = [
    { id: 'general', name: '#general', members: AGS.map((a) => a.id) },
    { id: 'plan', name: '#plan', members: ['atlas', 'north', 'forge', 'rivet'] },
    { id: 'build', name: '#build', members: ['forge', 'rivet', 'spark', 'weld', 'atlas', 'judge'] },
    { id: 'review', name: '#review', members: ['judge', 'lens', 'critic', 'forge', 'spark'] },
    { id: 'tests', name: '#tests', members: ['probe', 'gauge', 'bench', 'rivet', 'weld', 'north'] },
  ].map((c) => ({ ...c, x: 0, y: 0, r: 0, n: 0, pulse: 0, last: null, dm: false }))
  const DMS = [['atlas', 'forge'], ['judge', 'rivet'], ['probe', 'spark'], ['lens', 'weld']]
    .map(([a, b]) => ({ id: `dm:${a}:${b}`, a, b, members: [a, b], n: 0, pulse: 0, last: null, dm: true }))
  const C = Object.fromEntries([...CH, ...DMS].map((c) => [c.id, c]))
  AGS.forEach((a) => {
    a.chats = CH.filter((c) => c.id !== 'general' && c.members.includes(a.id)).map((c) => c.id)
    a.dms = DMS.filter((d) => d.members.includes(a.id))
  })
  const other = (d, id) => (d.a === id ? d.b : d.a)

  const SAY = {
    plan: ['Splitting the export work into three tasks.', 'Forge takes the parser, Rivet the command line.', 'Next hour: export speed, then the flaky test.', 'Holding the release until the bench run.', 'Who has room for one more task?'],
    build: ['Pushed fix/parser-timeout.', 'Export streams now, 3× faster on big swarms.', 'Can someone review #214?', 'Rebased on main, tests running.', 'Found it: a regex that backtracks on quotes.', 'Taking the command-line flags next.'],
    review: ['Looks good. One nit on naming.', 'Approved. Merging.', 'This loop reads the whole file. Stream it?', 'Please add a test for empty input.', 'Second pass done, nothing blocking.'],
    test: ['Suite green: 418 passed.', 'Fuzzing found a crash on empty input.', 'Bench: p50 38 ms, was 1.2 s.', 'The flaky test is back, Linux only.', 'Parser coverage is up to 81%.'],
    dm: ['Can you take #214?', 'On it.', 'Pushed. Have a look when you can.', 'Thanks, merging now.', 'Ping me when the bench is done.'],
  }

  // The run: 30 minutes before the page opened and four hours after, from one seed.
  const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const rnd = prng(20261109)
  const RUN = 1800, AHEAD = 4 * 3600, BIN = 60, FLY = 720, WORK = 9
  const W8 = { plan: 0.9, build: 1.35, review: 0.85, test: 1 }
  const wsum = AGS.reduce((n, a) => n + W8[a.g], 0)
  const pick = () => { let r = rnd() * wsum; for (const a of AGS) { r -= W8[a.g]; if (r <= 0) return a } return AGS[AGS.length - 1] }
  const EV = []
  for (let t = 0; t < RUN + AHEAD;) {
    const rate = 0.9 + 0.4 * (1 + Math.sin(t / 150)) + 0.35 * Math.max(0, Math.sin(t / 37 + 2))
    t += Math.min(1.8, -Math.log(1 - rnd()) / rate) // bursty, but never quiet for long
    const a = pick(), r = rnd()
    const chat = a.dms.length && r < 0.15 ? a.dms[Math.floor(rnd() * a.dms.length)].id : r < 0.22 ? 'general' : a.chats[Math.floor(rnd() * a.chats.length)]
    const pool = C[chat].dm ? SAY.dm : SAY[a.g]
    EV.push({ t, from: a.id, chat, text: pool[Math.floor(rnd() * pool.length)] })
  }
  const nb = Math.ceil((RUN + AHEAD) / BIN) + 1
  const bins = new Float32Array(nb), binStart = new Int32Array(nb + 1).fill(-1)
  EV.forEach((e, i) => { const b = Math.floor(e.t / BIN); bins[b]++; if (binStart[b] < 0) binStart[b] = i })
  const firstAfter = (t) => { let lo = 0, hi = EV.length; while (lo < hi) { const m = (lo + hi) >> 1; if (EV[m].t <= t) lo = m + 1; else hi = m } return lo }
  const wall0 = Date.now() / 1000 - RUN, real0 = performance.now()
  const simNow = () => RUN + (performance.now() - real0) / 1000
  const two = (n) => String(n).padStart(2, '0')
  const hm = (t) => { const d = new Date((wall0 + t) * 1000); return `${two(d.getHours())}:${two(d.getMinutes())}` }
  const num = (n) => n.toLocaleString('en-US')

  /* state at the clock */
  let clock = RUN, ptr = 0, total = 0, mode = 'live', flights = [], feedQ = [], dragging = false
  const SPEED = 30
  const working = (a) => clock - a.lastAt < WORK
  function reset() {
    ptr = 0; total = 0; flights = []; feedQ = []
    AGS.forEach((a) => { a.sent = 0; a.lastAt = -1e9; a.last = null; a.glow = 0; a.wake = 0 })
    Object.values(C).forEach((c) => { c.n = 0; c.last = null; c.pulse = 0 })
  }
  function apply(e, fx) {
    const a = A[e.from], c = C[e.chat]
    a.sent++; a.lastAt = e.t; a.last = e; c.n++; c.last = e; total++
    if (!fx) return
    feedQ.push(e)
    if (!reduce) { a.glow = 1; flights.push({ e, s: performance.now() }) }
  }
  function advance(to, fx) { while (ptr < EV.length && EV[ptr].t <= to) apply(EV[ptr++], fx) }
  function land(e) {
    const c = C[e.chat]
    c.pulse = 1
    const lit = mode === 'live' ? 1 : 0.5
    c.members.forEach((m) => { const a = A[m]; if (m !== e.from && !working(a) && a.wake < 0.3 * lit) a.wake = lit })
  }
  function seek(T) { reset(); advance(T, false); clock = T; feedFill() }

  /* layout */
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0, nodeR = 15, narrow = false, col = {}
  const tone = (g) => col[GROUPS[g].tone], soft = (g) => col[GROUPS[g].tone + 'Soft']
  function readColors() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim()
    col = { ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'), line: g('--line'), line2: g('--line-2'), surface: g('--surface'), raised: g('--raised'),
      accent: g('--accent'), accentSoft: g('--accent-soft-2'),
      blue: g('--blue'), violet: g('--violet'), rose: g('--rose'), teal: g('--teal'),
      blueSoft: g('--blue-soft'), violetSoft: g('--violet-soft'), roseSoft: g('--rose-soft'), tealSoft: g('--teal-soft') }
  }
  function layout() {
    const r = cv.getBoundingClientRect()
    W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(2, devicePixelRatio || 1)
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
    narrow = W < 560
    const top = narrow ? 52 : 58, bottom = narrow ? 40 : 46
    cx = W / 2; cy = top + (H - top - bottom) / 2
    R = Math.max(60, Math.min(W / 2 - (narrow ? 30 : 96), (H - top - bottom) / 2 - (narrow ? 20 : 30)))
    nodeR = narrow ? 12.5 : Math.max(14, Math.min(18, R / 12))
    const GAP = 0.75, slots = AGS.length + Object.keys(GROUPS).length * GAP
    let s = 0, prev = null
    AGS.forEach((a) => { if (prev && prev !== a.g) s += GAP; prev = a.g; a.a = -Math.PI / 2 + ((s + 0.5 - 1) / slots) * Math.PI * 2; s += 1; a.x = cx + Math.cos(a.a) * R; a.y = cy + Math.sin(a.a) * R })
    CH.forEach((c) => {
      c.r = (narrow ? 15 : 20) + Math.sqrt(c.members.length) * (narrow ? 2.2 : 3.4)
      if (c.id === 'general') { c.x = cx; c.y = cy; return }
      let x = 0, y = 0
      c.members.forEach((m) => { x += A[m].x - cx; y += A[m].y - cy })
      c.x = cx + (x / c.members.length) * 0.78; c.y = cy + (y / c.members.length) * 0.78
    })
    // Push chats apart, keep #general in the middle and every disc well inside the ring.
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < CH.length; i++) for (let j = i + 1; j < CH.length; j++) {
        const p = CH[i], q = CH[j]
        let dx = q.x - p.x, dy = q.y - p.y
        const d = Math.hypot(dx, dy) || 0.01, min = p.r + q.r + (narrow ? 10 : 16)
        if (d >= min) continue
        const m = (min - d) / (p.id === 'general' || q.id === 'general' ? 1 : 2)
        dx /= d; dy /= d
        if (p.id !== 'general') { p.x -= dx * m; p.y -= dy * m }
        if (q.id !== 'general') { q.x += dx * m; q.y += dy * m }
      }
      CH.forEach((c) => {
        const dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy), max = R - nodeR - c.r - 12
        if (d > max && d > 0) { c.x = cx + dx / d * max; c.y = cy + dy / d * max }
      })
    }
  }

  /* focus: what the pointer or a tap picked */
  let hover = null, locked = null, groupSel = null
  function focus() {
    const s = locked || hover || groupSel
    if (!s) return null
    const agents = new Set(), chats = new Set()
    if (s.kind === 'agent') {
      const a = A[s.id]
      agents.add(a.id)
      a.chats.forEach((c) => chats.add(c))
      a.dms.forEach((d) => { chats.add(d.id); agents.add(other(d, a.id)) })
    } else if (s.kind === 'chat') {
      chats.add(s.id); C[s.id].members.forEach((m) => agents.add(m))
    } else {
      AGS.forEach((a) => { if (a.g === s.id) { agents.add(a.id); a.chats.forEach((c) => chats.add(c)) } })
    }
    return { s, agents, chats }
  }
  const linkOn = (f, m, c) => !f || (f.s.kind === 'agent' ? m === f.s.id && f.chats.has(c) : f.s.kind === 'chat' ? c === f.s.id : f.agents.has(m))

  /* drawing */
  const mv = (x, y) => ctx.moveTo(x, y), ln = (x, y) => ctx.lineTo(x, y)
  const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
  const FONT = 'Inter, -apple-system, system-ui, sans-serif', MONO = 'ui-monospace, Menlo, Consolas, monospace'
  function chord(d) {
    const a = A[d.a], b = A[d.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    return { a, b, qx: cx + (mx - cx) * 0.2, qy: cy + (my - cy) * 0.2 }
  }
  const qpt = (k, u) => [(1 - u) * (1 - u) * k.a.x + 2 * (1 - u) * u * k.qx + u * u * k.b.x, (1 - u) * (1 - u) * k.a.y + 2 * (1 - u) * u * k.qy + u * u * k.b.y]
  function flightPos(e, u) {
    const c = C[e.chat], a = A[e.from]
    if (c.dm) { const k = chord(c); const v = k.a.id === a.id ? u : 1 - u; return qpt(k, v) }
    return [a.x + (c.x - a.x) * u, a.y + (c.y - a.y) * u]
  }
  function draw(now) {
    const f = focus()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.lineCap = 'round'
    // Role bands behind the ring.
    const slotA = (Math.PI * 2) / (AGS.length + 4 * 0.75)
    Object.keys(GROUPS).forEach((g) => {
      const m = AGS.filter((a) => a.g === g)
      const dim = f && !m.some((a) => f.agents.has(a.id))
      ctx.beginPath(); ctx.arc(cx, cy, R, m[0].a - slotA * 0.42, m[m.length - 1].a + slotA * 0.42)
      ctx.lineWidth = nodeR * 2 + 12; ctx.strokeStyle = soft(g); ctx.globalAlpha = dim ? 0.35 : 1; ctx.stroke()
    })
    ctx.globalAlpha = 1
    // Links from agents to their channels (#general links to everyone, so it goes unlinked).
    CH.forEach((c) => {
      if (c.id === 'general') return
      c.members.forEach((m) => {
        const a = A[m], on = linkOn(f, m, c.id)
        ctx.beginPath(); mv(a.x, a.y); ln(c.x, c.y)
        ctx.strokeStyle = f && on ? tone(a.g) : col.line2
        ctx.lineWidth = f && on ? 1.6 : 1
        ctx.globalAlpha = f ? (on ? 0.85 : 0.25) : 0.9
        ctx.stroke()
      })
    })
    // Direct chats: dashed chords across.
    DMS.forEach((d) => {
      const k = chord(d), on = !f || f.chats.has(d.id)
      ctx.beginPath(); mv(k.a.x, k.a.y); ctx.quadraticCurveTo(k.qx, k.qy, k.b.x, k.b.y)
      ctx.setLineDash([2, 5]); ctx.strokeStyle = f && on ? col.ink2 : col.line2; ctx.lineWidth = 1.2
      ctx.globalAlpha = f ? (on ? 1 : 0.25) : 0.9; ctx.stroke(); ctx.setLineDash([])
    })
    ctx.globalAlpha = 1
    // Chat discs.
    CH.forEach((c) => {
      const dim = f && !f.chats.has(c.id) && !(f.s.kind === 'chat' && f.s.id === c.id)
      ctx.globalAlpha = dim ? 0.4 : 1
      if (c.pulse > 0.01) {
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 3 + (1 - c.pulse) * 14, 0, Math.PI * 2)
        ctx.strokeStyle = col.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = (dim ? 0.4 : 1) * c.pulse * 0.6; ctx.stroke(); ctx.globalAlpha = dim ? 0.4 : 1
      }
      const bump = 1 + c.pulse * 0.05
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * bump, 0, Math.PI * 2)
      ctx.fillStyle = col.raised; ctx.fill()
      const picked = f && f.s.kind === 'chat' && f.s.id === c.id
      ctx.strokeStyle = picked ? col.accent : col.line2; ctx.lineWidth = picked ? 2 : 1; ctx.stroke()
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = col.ink; ctx.font = `600 ${narrow ? 10.5 : 12}px ${FONT}`
      ctx.fillText(c.name, c.x, c.y - (narrow ? 5 : 6))
      ctx.fillStyle = col.ink2; ctx.font = `${narrow ? 10 : 11}px ${MONO}`
      ctx.fillText(num(c.n), c.x, c.y + (narrow ? 7 : 9))
    })
    ctx.globalAlpha = 1
    // Messages in flight, each in its sender's colour, with a short tail.
    flights.forEach((fl) => {
      const u = Math.min(1, (now - fl.s) / FLY), a = A[fl.e.from]
      const dim = f && !f.agents.has(a.id) && !f.chats.has(fl.e.chat)
      ctx.fillStyle = tone(a.g)
      for (let k = 4; k >= 1; k--) {
        const v = easeIO(Math.max(0, u - k * 0.035)), [x, y] = flightPos(fl.e, v)
        ctx.globalAlpha = (dim ? 0.2 : 1) * (0.32 - k * 0.06); ctx.beginPath(); ctx.arc(x, y, 3.2 - k * 0.4, 0, Math.PI * 2); ctx.fill()
      }
      const [x, y] = flightPos(fl.e, easeIO(u))
      ctx.globalAlpha = (dim ? 0.2 : 1) * 0.22; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = dim ? 0.3 : 1; ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1
    // Agents.
    AGS.forEach((a) => {
      const dim = f && !f.agents.has(a.id), picked = f && f.s.kind === 'agent' && f.s.id === a.id
      const base = dim ? 0.35 : 1, work = working(a)
      if (a.glow > 0.01) { ctx.globalAlpha = base * 0.28 * a.glow; ctx.fillStyle = tone(a.g); ctx.beginPath(); ctx.arc(a.x, a.y, nodeR + 10, 0, Math.PI * 2); ctx.fill() }
      if (a.wake > 0.01) {
        ctx.globalAlpha = base * a.wake; ctx.strokeStyle = col.accent; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(a.x, a.y, nodeR + 4 + (1 - a.wake) * 11, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = base
      ctx.beginPath(); ctx.arc(a.x, a.y, nodeR, 0, Math.PI * 2); ctx.fillStyle = col.raised; ctx.fill()
      ctx.fillStyle = soft(a.g); ctx.fill()
      // Status ring: solid while working, dashed while asleep on a wake.
      ctx.beginPath(); ctx.arc(a.x, a.y, nodeR + 3, 0, Math.PI * 2)
      if (work) { ctx.setLineDash([]); ctx.strokeStyle = tone(a.g); ctx.lineWidth = 2 }
      else { ctx.setLineDash([2.5, 3]); ctx.strokeStyle = col.ink3; ctx.lineWidth = 1.2 }
      ctx.stroke(); ctx.setLineDash([])
      if (picked) { ctx.beginPath(); ctx.arc(a.x, a.y, nodeR + 7, 0, Math.PI * 2); ctx.strokeStyle = col.accent; ctx.lineWidth = 2; ctx.stroke() }
      ctx.fillStyle = tone(a.g); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `680 ${narrow ? 11 : 12.5}px ${FONT}`
      ctx.fillText(a.ini, a.x, a.y + 0.5)
      // Names outside the ring; on a phone only for what's picked.
      if (!narrow || picked) {
        const cos = Math.cos(a.a), sin = Math.sin(a.a), rr = R + nodeR + (narrow ? 10 : 14)
        let x = cx + cos * rr
        const y = cy + sin * rr
        ctx.textAlign = cos > 0.3 ? 'left' : cos < -0.3 ? 'right' : 'center'
        if (narrow) { ctx.font = `620 11px ${FONT}`; const tw = ctx.measureText(a.name).width; if (ctx.textAlign === 'right') x = Math.max(tw + 6, x); else if (ctx.textAlign === 'left') x = Math.min(W - tw - 6, x) }
        ctx.textBaseline = sin > 0.5 ? 'top' : sin < -0.5 ? 'bottom' : 'middle'
        ctx.fillStyle = f && f.agents.has(a.id) ? col.ink : col.ink2
        ctx.font = `${f && f.agents.has(a.id) ? 620 : 520} ${narrow ? 11 : 12.5}px ${FONT}`
        ctx.fillText(a.name, x, y)
      }
    })
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic'
  }

  /* replay bar */
  function drawHist() {
    const r = hw.getBoundingClientRect(), w = r.width, h = r.height
    if (!w) return
    if (hc.width !== Math.round(w * dpr) || hc.height !== Math.round(h * dpr)) { hc.width = Math.round(w * dpr); hc.height = Math.round(h * dpr) }
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.clearRect(0, 0, w, h)
    const now = simNow(), n = Math.ceil(now / BIN), lastStart = binStart[n - 1] < 0 ? firstAfter((n - 1) * BIN) : binStart[n - 1]
    const val = (i) => (i === n - 1 ? Math.max(0, firstAfter(now) - lastStart) : bins[i])
    let max = 1
    for (let i = 0; i < n; i++) max = Math.max(max, val(i))
    const bw = w / n
    for (let i = 0; i < n; i++) {
      const v = val(i), bh = Math.max(2, (v / max) * (h - 8))
      const played = (i + 0.5) * BIN <= clock
      hctx.fillStyle = played ? col.accent : col.ink3
      hctx.globalAlpha = played ? 0.62 : 0.32
      hctx.fillRect(i * bw + 0.6, h - bh, Math.max(1, bw - 1.6), bh)
    }
    hctx.globalAlpha = 1
    const x = Math.min(w - 1.5, Math.max(1.5, (clock / now) * w))
    hctx.fillStyle = col.ink; hctx.fillRect(x - 1, 0, 2, h)
    hctx.beginPath(); hctx.arc(x, 4, 4, 0, Math.PI * 2); hctx.fill()
    hw.setAttribute('aria-valuenow', String(Math.round((clock / now) * 100)))
    hw.setAttribute('aria-valuetext', mode === 'live' ? 'Live' : `Replaying from ${hm(clock)}`)
  }
  const tAt = (e) => { const r = hw.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * simNow() }
  function toReplay(T) {
    if (simNow() - T < 3) return toLive()
    mode = 'replay'; seek(T); ui(); drawHist()
  }
  function toLive() { mode = 'live'; seek(simNow()); ui(); drawHist() }
  hw.addEventListener('pointerdown', (e) => { dragging = true; hw.setPointerCapture(e.pointerId); toReplay(tAt(e)) })
  hw.addEventListener('pointermove', (e) => { if (dragging) toReplay(tAt(e)) })
  hw.addEventListener('pointerup', () => { dragging = false })
  hw.addEventListener('pointercancel', () => { dragging = false })
  hw.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 300 : 60
    if (e.key === 'ArrowLeft') { e.preventDefault(); toReplay(Math.max(0, clock - step)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); toReplay(clock + step) }
    else if (e.key === 'Home') { e.preventDefault(); toReplay(0) }
    else if (e.key === 'End') { e.preventDefault(); toLive() }
  })
  $('#backLive').addEventListener('click', toLive)
  function ui() {
    const live = mode === 'live'
    $('#backLive').hidden = live; $('#replayLabel').hidden = !live; $('#live').hidden = !live
    $('#feedTitle').textContent = live ? 'Example Swarm' : `Replay at ${SPEED}×`
  }

  /* feed */
  function rowF(e) {
    const a = A[e.from], c = C[e.chat], g = GROUPS[a.g]
    const to = c.dm ? A[other(c, a.id)].name : c.name
    return `<div class="f-row"><div class="f-in"><span class="av" data-tone="${g.tone}">${a.ini}</span><div><div class="meta"><b class="tone-text" data-tone="${g.tone}">${a.name}</b><span>→ ${esc(to)}</span><time>${hm(e.t)}</time></div><p>${esc(e.text)}</p></div></div></div>`
  }
  // Every row sits at the bottom of the feed in layout and only its transform stacks it, so new
  // rows push the others up by transform alone: nothing on screen ever moves in layout, which is
  // what a layout-shift observer measures. Rows that have gone out of the top are dropped.
  const tmp = document.createElement('div')
  function rowEl(e, fresh) {
    tmp.innerHTML = rowF(e)
    const el = tmp.firstElementChild
    if (fresh) { el.style.transition = 'none'; if (!reduce) el.firstElementChild.classList.add('is-new') }
    return el
  }
  function stack() {
    const rows = [...feedStack.children], limit = feedStack.clientHeight + 160
    let y = 0
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (y > limit) { r.remove(); continue }
      r.style.transform = `translateY(${-y}px)`
      y += r.offsetHeight
    }
    void feedStack.offsetHeight
    rows.forEach((r) => { if (r.style.transition) r.style.transition = '' })
  }
  function feedFill(fromQueue) {
    const rows = fromQueue ? feedQ : EV.slice(Math.max(0, ptr - 12), ptr)
    feedQ = []
    feedStack.replaceChildren(...rows.map((e) => rowEl(e, false)))
    for (const r of feedStack.children) r.style.transition = 'none'
    stack()
  }
  function feedFlush() {
    if (!feedQ.length) return
    const batch = feedQ.splice(0)
    // A fast replay that brings more than a screenful shows where it has got to.
    if (batch.length > 9) { feedQ = batch.slice(-12); return feedFill(true) }
    batch.forEach((e) => feedStack.append(rowEl(e, true)))
    stack()
  }
  new ResizeObserver(() => { for (const r of feedStack.children) r.style.transition = 'none'; stack() }).observe(feedStack)

  /* the card for what's picked */
  function card() {
    const s = locked || hover
    if (!s) { cardEl.hidden = true; return }
    if (s.kind === 'agent') {
      const a = A[s.id], g = GROUPS[a.g], last = a.last
      const to = last ? (C[last.chat].dm ? 'To ' + A[other(C[last.chat], a.id)].name : 'In ' + C[last.chat].name) : ''
      cardEl.innerHTML = `<div class="mc-head"><span class="av" data-tone="${g.tone}">${a.ini}</span><div><b>${a.name}</b><small>${g.one} · ${working(a) ? 'Working' : 'Waiting, 0 tokens'}</small></div></div>
        <div class="mc-stats"><span><b>${num(a.sent)}</b>Sent</span><span><b>${a.chats.length + a.dms.length}</b>Chats</span><span><b>${a.sent ? hm(a.lastAt) : '–'}</b>Last</span></div>
        ${last ? `<p class="mc-last"><span>${esc(to)}</span>${esc(last.text)}</p>` : ''}`
    } else {
      const c = C[s.id]
      cardEl.innerHTML = `<div class="mc-head"><span class="mc-hash">#</span><div><b>${c.name.slice(1)}</b><small>${c.members.length} agents · ${num(c.n)} messages</small></div></div>
        <div class="mc-avs">${c.members.slice(0, narrow ? 7 : 12).map((m) => `<span class="av" data-tone="${GROUPS[A[m].g].tone}" title="${A[m].name}">${A[m].ini}</span>`).join('')}${narrow && c.members.length > 7 ? `<span class="av more">+${c.members.length - 7}</span>` : ''}</div>
        ${c.last ? `<p class="mc-last"><span>${A[c.last.from].name}</span>${esc(c.last.text)}</p>` : ''}`
    }
    cardEl.hidden = false
    cardEl.classList.toggle('is-dock', narrow)
    if (narrow) return
    const p = s.kind === 'agent' ? A[s.id] : C[s.id], gap = s.kind === 'agent' ? nodeR + 16 : p.r + 14
    const cw = cardEl.offsetWidth, ch = cardEl.offsetHeight
    let left = p.x > W / 2 ? p.x - gap - cw : p.x + gap
    left = Math.max(10, Math.min(W - cw - 10, left))
    const top = Math.max(52, Math.min(H - ch - 40, p.y - ch / 2))
    cardEl.style.left = left + 'px'; cardEl.style.top = top + 'px'
  }
  function hit(x, y) {
    for (const a of AGS) if (Math.hypot(x - a.x, y - a.y) < nodeR + 7) return { kind: 'agent', id: a.id }
    for (const c of CH) if (Math.hypot(x - c.x, y - c.y) < c.r + 3) return { kind: 'chat', id: c.id }
    return null
  }
  const same = (p, q) => p && q && p.kind === q.kind && p.id === q.id
  let intent = 0
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    const r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top)
    cv.style.cursor = h ? 'pointer' : 'default'
    clearTimeout(intent)
    if (same(h, hover)) return
    if (!h) { intent = setTimeout(() => { hover = null; card() }, 120); return }
    // Wait for the pointer to settle on the first mark; once warm, neighbours answer at once.
    intent = setTimeout(() => { hover = h; card() }, hover ? 0 : 80)
  })
  cv.addEventListener('pointerleave', () => { clearTimeout(intent); hover = null; card() })
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top)
    locked = h && !same(h, locked) ? h : null
    if (h) { groupSel = null; syncLegend() }
    if (!locked && e.pointerType !== 'mouse') hover = null
    card()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (locked || groupSel) && !document.querySelector('.menu:not([hidden]), .pal-layer:not([hidden])')) { locked = null; groupSel = null; syncLegend(); card() }
  })

  /* legend: roles; picking one lights its agents and chats */
  const legend = $('#legend')
  legend.innerHTML = Object.entries(GROUPS).map(([id, g]) => `<button type="button" data-g="${id}" data-tone="${g.tone}" aria-pressed="false"><i></i>${g.name}<em>${AGS.filter((a) => a.g === id).length}</em></button>`).join('')
  function syncLegend() { $$('button', legend).forEach((b) => { const on = !!groupSel && groupSel.id === b.dataset.g; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)) }) }
  $$('button', legend).forEach((b) => {
    b.addEventListener('click', () => { groupSel = groupSel && groupSel.id === b.dataset.g ? null : { kind: 'group', id: b.dataset.g }; locked = null; hover = null; card(); syncLegend() })
  })
  const countEl = $('#count'), clockEl = $('#clock')
  let shown = ''
  function counts() {
    const html = `<b>12</b> Agents · <b>5</b> Channels · <b>${num(total)}</b> Messages`
    if (html !== shown) { shown = html; countEl.innerHTML = html }
  }

  /* loop: runs only while the map is on screen and the tab is visible */
  let raf = 0, inView = false, last = 0, slow = 0
  function frame(now) {
    const dt = Math.min(100, now - (last || now)); last = now
    if (!dragging) {
      if (mode === 'live') clock = simNow()
      else { clock += (dt / 1000) * SPEED; if (clock >= simNow()) { mode = 'live'; clock = simNow(); ui() } }
    }
    advance(clock, true)
    const k1 = Math.exp(-dt / 900), k2 = Math.exp(-dt / 1100)
    AGS.forEach((a) => { a.glow *= k1; a.wake *= k2 })
    Object.values(C).forEach((c) => { c.pulse *= k1 })
    flights = flights.filter((fl) => { if (now - fl.s >= FLY) { land(fl.e); return false } return true })
    if (flights.length > 36) flights.splice(0, flights.length - 36).forEach((fl) => land(fl.e))
    draw(now)
    if (now - slow > 220) { slow = now; feedFlush(); drawHist(); counts(); clockEl.textContent = hm(clock); if (!cardEl.hidden) card() }
    raf = inView && !document.hidden ? requestAnimationFrame(frame) : 0
  }
  function start() { if (!raf && inView && !document.hidden) { last = 0; raf = requestAnimationFrame(frame) } }
  function stop() { cancelAnimationFrame(raf); raf = 0 }
  // A still frame of the moment, for reduced motion and for when the loop is paused.
  function still() { if (mode === 'live') { clock = simNow(); advance(clock, false); feedFill() } draw(performance.now()); drawHist(); counts(); clockEl.textContent = hm(clock) }

  readColors()
  seek(RUN); ui(); counts(); clockEl.textContent = hm(clock)
  layout(); draw(performance.now()); drawHist()
  new ResizeObserver(() => { layout(); draw(performance.now()); drawHist(); if (!cardEl.hidden) card() }).observe(cv)
  new IntersectionObserver((es) => { inView = es[0].isIntersecting; if (inView) { if (mode === 'live' && !raf) still(); start() } else stop() }, { root: panel }).observe(cv)
  const recolor = () => { readColors(); draw(performance.now()); drawHist() }
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor)
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else { if (mode === 'live') still(); start() } })

  return {
    isLive: () => mode === 'live',
    toLive,
    replayFromStart: () => toReplay(0),
  }
}
