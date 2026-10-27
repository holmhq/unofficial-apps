// Drawn covers: small isometric technical drawings, one per post. The same module runs on
// the server (the cover inline and as an image) and in the browser, where reader.js
// re-renders it as the pointer moves. The pointer only sets a target; each frame eases the
// state toward it and every position is computed from the state, so nothing jumps or
// drifts off its path. Plain code: no imports, no DOM, no Intl, no randomness, and the
// same element structure for every state of a cover so a page can patch it in place.

export const MOTIFS = ['week', 'energy', 'people', 'network', 'stack', 'inbox', 'bars', 'rings'];
export const LOOKS = ['paper', 'flat', 'blocks'];
export const TONES = { lilac: '#b9adff', tangerine: '#ff8a4c', mint: '#86e3c3', butter: '#ffd84d', sky: '#8ccbff', coral: '#ff9b8f' };

// Blocks: a stronger ground for each tone and three flat shapes that sit behind the drawing.
const STRONG = { lilac: '#6b5cff', tangerine: '#ff7a45', mint: '#14a079', butter: '#e3a008', sky: '#2f7de1', coral: '#f2545b' };
const SHAPES = {
  lilac: ['#ffd84d', '#2a1d5a', '#ff8fb1'],
  tangerine: ['#ffd84d', '#2a1d5a', '#ffb38a'],
  mint: ['#ffd84d', '#0b4f3c', '#b9f0dc'],
  butter: ['#ff6a3d', '#2a1d5a', '#fff1b8'],
  sky: ['#ffd84d', '#0d2b5c', '#a9d6ff'],
  coral: ['#ffd84d', '#2a1d5a', '#ffc2bd'],
};

// One isometric projection for every motif: a unit is A across, B down and V up.
const A = 29.445, B = 17, V = 34;
const R2 = 1.41421356;
const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// ---------- small helpers ----------

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function n1(x) { return (Math.round(x * 10) / 10).toString(); }
function proj(cx, cy) { return (u, v, w) => [cx + (u - v) * A, cy + (u + v) * B - (w || 0) * V]; }
function pt(p) { return n1(p[0]) + ' ' + n1(p[1]); }
function poly(pts) { return 'M' + pts.map(pt).join('L') + 'Z'; }
function line(pts) { return 'M' + pts.map(pt).join('L'); }
function dot(p, r) {
  return 'M' + n1(p[0] - r) + ' ' + n1(p[1]) + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0Z';
}
function ell(c, rx, ry) {
  return 'M' + n1(c[0] - rx) + ' ' + n1(c[1]) + 'A' + n1(rx) + ' ' + n1(ry) + ' 0 1 0 ' + n1(c[0] + rx) + ' ' + n1(c[1])
    + 'A' + n1(rx) + ' ' + n1(ry) + ' 0 1 0 ' + n1(c[0] - rx) + ' ' + n1(c[1]) + 'Z';
}
// A circle of radius r (in units) lying on the ground, seen in projection.
function ring(c, r) { return ell(c, r * R2 * A, r * R2 * B); }
// The side of an upright cylinder: down the left, round the front, up the right.
function side(top, bottom, rx, ry) {
  return 'M' + n1(top[0] - rx) + ' ' + n1(top[1]) + 'L' + n1(bottom[0] - rx) + ' ' + n1(bottom[1])
    + 'A' + n1(rx) + ' ' + n1(ry) + ' 0 0 0 ' + n1(bottom[0] + rx) + ' ' + n1(bottom[1]) + 'L' + n1(top[0] + rx) + ' ' + n1(top[1]) + 'Z';
}
// The three faces of a box that face the viewer.
function box(P, u0, u1, v0, v1, w0, w1) {
  return {
    top: poly([P(u0, v0, w1), P(u1, v0, w1), P(u1, v1, w1), P(u0, v1, w1)]),
    left: poly([P(u0, v1, w0), P(u1, v1, w0), P(u1, v1, w1), P(u0, v1, w1)]),
    right: poly([P(u1, v0, w0), P(u1, v1, w0), P(u1, v1, w1), P(u1, v0, w1)]),
  };
}
function length(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return n;
}
// The polyline from its start up to distance d, and the point there.
function along(pts, d) {
  const out = [pts[0]];
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= seg) {
      const t = seg ? left / seg : 0;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(p);
      return { pts: out, at: p };
    }
    out.push(b);
    left -= seg;
  }
  return { pts: out, at: pts[pts.length - 1] };
}
// The polyline between distances d0 and d1.
function between(pts, d0, d1) {
  const a = along(pts, d0).at;
  const b = along(pts, d1);
  const rest = [a];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc > d0 && acc < d1) rest.push(pts[i]);
  }
  rest.push(b.at);
  return rest;
}

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const x = rgb(a), y = rgb(b);
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.round(x[i] + (y[i] - x[i]) * t);
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}
function esc(s) {
  return String(s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}
// A small linear congruential generator: the same seed always draws the same cover.
function prng(seed) {
  let a = (seed * 9301 + 49297) % 233280 + 1;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

function path(d, fill, stroke, width, more) {
  return '<path d="' + d + '" fill="' + (fill || 'none') + '"'
    + (stroke ? ' stroke="' + stroke + '" stroke-width="' + width + '" vector-effect="non-scaling-stroke"' : '')
    + (more || '') + '/>';
}
function text(x, y, s, opacity, anchor, size) {
  return '<text x="' + n1(x) + '" y="' + n1(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '')
    + ' opacity="' + opacity + '"' + (size ? ' font-size="' + size + '"' : '') + '>' + esc(s) + '</text>';
}
function labelGroup(pal, inner, size) {
  return '<g fill="' + pal.ink + '" font-family="' + FONT + '" font-size="' + (size || 9) + '" letter-spacing="1.3">' + inner + '</g>';
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

// ---------- looks ----------

function palette(n) {
  if (n.look === 'flat') {
    const bg = TONES[n.tone], ink = '#14161a';
    return {
      look: 'flat', bg, ink, labels: true,
      top: mix(bg, '#ffffff', 0.6), left: mix(bg, '#ffffff', 0.32), right: mix(bg, ink, 0.1), board: mix(bg, '#ffffff', 0.3),
      shade: mix(bg, ink, 0.09), soft: mix(bg, ink, 0.05), glass: mix(bg, ink, 0.16),
      acc: '#ffffff', accR: mix('#ffffff', ink, 0.08), accL: mix('#ffffff', ink, 0.16),
      acc2: '#ffffff', acc2Side: mix(bg, '#ffffff', 0.75), mark: ink, lit: '#fff6d6', poche: mix(bg, ink, 0.6),
    };
  }
  if (n.look === 'blocks') {
    const bg = STRONG[n.tone], ink = '#ffffff';
    return {
      look: 'blocks', bg, ink, labels: false, shapes: SHAPES[n.tone],
      top: mix(bg, '#ffffff', 0.3), left: mix(bg, '#ffffff', 0.15), right: mix(bg, '#000000', 0.1), board: mix(bg, '#ffffff', 0.14),
      shade: mix(bg, '#000000', 0.16), soft: mix(bg, '#ffffff', 0.08), glass: mix(bg, '#000000', 0.18),
      acc: '#ffffff', accR: mix('#ffffff', bg, 0.15), accL: mix('#ffffff', bg, 0.3),
      acc2: '#ffd84d', acc2Side: '#f0c43f', mark: '#ffd84d', lit: '#ffd84d', poche: mix(bg, '#ffffff', 0.9),
    };
  }
  const bg = '#f2eee5', ink = '#20242a';
  return {
    look: 'paper', bg, ink, labels: true,
    top: mix(bg, '#ffffff', 0.72), left: mix(bg, '#ffffff', 0.4), right: mix(bg, ink, 0.07), board: mix(bg, '#ffffff', 0.55),
    shade: mix(bg, ink, 0.07), soft: mix(bg, ink, 0.04), glass: mix(bg, ink, 0.14),
    acc: '#ff6a3d', accR: '#e2522a', accL: '#c9431f',
    acc2: '#ffd60a', acc2Side: '#f0c400', mark: '#ff6a3d', lit: '#ffd60a', poche: mix(bg, ink, 0.8),
  };
}

// Three flat shapes behind the drawing, placed by the seed.
function blockShapes(n, pal) {
  const c = pal.shapes, k = n.seed % 4;
  const big = [[548, 64], [92, 64], [548, 300], [92, 300]][k];
  const card = [[-40, 236], [420, 236], [-40, -66], [420, -66]][k];
  const small = [[606, 326], [34, 326], [606, 34], [34, 34]][k];
  return '<circle cx="' + big[0] + '" cy="' + big[1] + '" r="118" fill="' + c[0] + '"/>'
    + '<rect x="' + card[0] + '" y="' + card[1] + '" width="260" height="190" rx="48" fill="' + c[2] + '"/>'
    + '<circle cx="' + small[0] + '" cy="' + small[1] + '" r="46" fill="' + c[1] + '"/>';
}

// A thin board on the ground, with its two front edges and a soft shadow.
function board(P, u0, u1, v0, v1, th, pal) {
  return path(poly([P(u0 + 0.7, v0 + 0.4, -th), P(u1 + 0.7, v0 + 0.4, -th), P(u1 + 0.7, v1 + 0.4, -th), P(u0 + 0.7, v1 + 0.4, -th)]), pal.shade)
    + path(poly([P(u1, v0), P(u1, v1), P(u1, v1, -th), P(u1, v0, -th)]), pal.right, pal.ink, 1)
    + path(poly([P(u0, v1), P(u1, v1), P(u1, v1, -th), P(u0, v1, -th)]), pal.left, pal.ink, 1)
    + path(poly([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]), pal.board, pal.ink, 1.25);
}

// ---------- week: a month, with the day under the pointer lifted out ----------

const week = (() => {
  const CX = 290.6, CY = 78, G = 0.1, H = 16, COLS = 7, ROWS = 5, TH = 0.2, M = 0.16;
  const P = proj(CX, CY);
  const DENSE = [0, 1, 2, 1, 3, 0, 2], SPARSE = [0, 0, 1, 0, 0, 0, 1];
  const count = (n, i, j) => (n.seed % 4 === 0 ? SPARSE : DENSE)[(i * 3 + j * 5 + i * j + n.seed) % 7];
  const cellPts = (u, v) => [P(u + G, v + G), P(u + 1 - G, v + G), P(u + 1 - G, v + 1 - G), P(u + G, v + 1 - G)];
  const lift = (p) => [p[0], p[1] - H];
  const entries = (n, i, j, k, u, v, up) => {
    let d = '';
    for (let e = 0; e < k; e++) {
      const vv = v + 0.3 + e * 0.19, len = 0.3 + ((i + j + e) % 3) * 0.11;
      const a = P(u + 0.2, vv), b = P(u + 0.2 + len, vv);
      d += line(up ? [lift(a), lift(b)] : [a, b]);
    }
    return d;
  };
  return {
    caption: 'THE WEEK, WITH ROOM',
    describe: 'A month calendar drawn in fine lines, one day lifted out of the week with its entries.',
    ease: ['cu', 'cv'],
    init(n) {
      const ti = 1 + n.seed % 5, tj = 1 + Math.floor(n.seed / 5) % 3;
      return { ti, tj, cu: ti, cv: tj };
    },
    pointer(n, s, x, y) {
      const xs = (x * 640 - CX) / A, ys = (y * 360 - CY) / B;
      const u = Math.floor((xs + ys) / 2), v = Math.floor((ys - xs) / 2);
      if (u >= 0 && u < COLS && v >= 0 && v < ROWS) return { ti: u, tj: v, cu: u, cv: v };
      return { ti: s.ti, tj: s.tj, cu: s.ti, cv: s.tj };
    },
    render(n, s, pal, show) {
      const near = [Math.round(s.cu), Math.round(s.cv)];
      let grid = '', weekend = '', ev = '';
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        grid += poly(cellPts(i, j));
        if (i >= 5) weekend += poly(cellPts(i, j));
        if (i !== near[0] || j !== near[1]) ev += entries(n, i, j, count(n, i, j), i, j, false);
      }
      let out = board(P, -M, COLS + M, -M, ROWS + M, TH, pal);
      if (show) {
        let dims = line([P(0, -0.75), P(7, -0.75)]) + line([P(0, -0.6), P(0, -0.9)]) + line([P(7, -0.6), P(7, -0.9)])
          + line([P(-0.75, 0), P(-0.75, 5)]) + line([P(-0.6, 0), P(-0.9, 0)]) + line([P(-0.6, 5), P(-0.9, 5)]);
        out += path(dims, null, pal.ink, 0.75, ' stroke-opacity=".55"');
        let letters = '';
        for (let i = 0; i < 7; i++) { const p = P(i + 0.5, -0.36); letters += text(p[0], p[1] + 3, 'MTWTFSS'.charAt(i), '.6', 'middle'); }
        const dt = P(3.5, -1.2), dl = P(-1.35, 2.5);
        out += labelGroup(pal, letters, 8.5) + labelGroup(pal, text(dt[0], dt[1], '7 DAYS', '.6', 'middle') + text(dl[0], dl[1], '5 WEEKS', '.6', 'middle'));
      }
      out += path(grid, null, pal.ink, 0.75, ' stroke-opacity=".7"');
      out += path(weekend, pal.soft);
      out += path(ev, null, pal.ink, 1.5, ' stroke-opacity=".45"');
      // The lifted day, drawn where the state has it, so it glides between days.
      const c = cellPts(s.cu, s.cv);
      const top = c.map(lift);
      out += path(poly(c), mix(pal.board, pal.ink, 0.18));
      out += '<g><animateTransform attributeName="transform" type="translate" values="0 0; 0 -3; 0 0" dur="3.2s" repeatCount="indefinite"/>'
        + path(poly([top[1], top[2], c[2], c[1]]), pal.accR, pal.ink, 1)
        + path(poly([top[2], top[3], c[3], c[2]]), pal.accL, pal.ink, 1)
        + path(poly(top), pal.acc, pal.ink, 1.25)
        + path(entries(n, s.ti, s.tj, count(n, s.ti, s.tj), s.cu, s.cv, true), null, pal.look === 'blocks' ? pal.bg : pal.ink, 2)
        + '</g>';
      const k = count(n, s.ti, s.tj);
      const readout = DAYS[s.ti] + ' · WEEK ' + (s.tj + 1) + ' · ' + (k === 0 ? 'NOTHING PLANNED' : k + (k === 1 ? ' ENTRY' : ' ENTRIES'));
      return { body: out, readout };
    },
  };
})();

// ---------- energy: a solar array, a battery and a house through the day ----------

const energy = (() => {
  const CX = 320, CY = 178;
  const P = proj(CX, CY);
  const RX = 262, RY = 150, AX = 320, AY = 196;
  const u0 = 2.3, u1 = 3.9, v0 = 2.65, v1 = 3.55, MH = 0.58, GAP = 0.14;
  const pu0 = -1.2, pu1 = 1.2, pv0 = 5.3, pv1 = 6.7, wb = 2.0, wf = 0.8, TH = 0.1;
  const pp = (s, r, dw) => P(pu0 + s * (pu1 - pu0), pv0 + r * (pv1 - pv0), wb + r * (wf - wb) - (dw || 0));
  const hu0 = 4.6, hu1 = 11.5, hv = 0.2, hw = 3.6;
  const wu0 = 5.4, wu1 = 6.9, ww0 = 1.3, ww1 = 2.7, IN = 0.09;
  const sunAt = (t) => {
    const st = Math.min(t / 0.7, 1), th = Math.PI * (1 - st);
    return [AX + RX * Math.cos(th), AY - RY * Math.sin(th)];
  };
  return {
    caption: 'AXONOMETRIC',
    describe: 'A solar array, a home battery and a house wall drawn in fine lines; through the day the battery charges, then lights the house.',
    ease: ['t'],
    init(n) { const t = 0.32 + (n.seed % 5) * 0.04; return { t }; },
    pointer(n, s, x) { return { t: clamp(x, 0, 1) }; },
    render(n, s, pal, show) {
      const t = s.t;
      const day = t < 0.66;
      const charge = day ? Math.min(1, 0.2 + 0.8 * t / 0.55) : Math.max(0.25, 1 - 0.75 * (t - 0.66) / 0.34);
      const night = t > 0.62 ? Math.min(1, (t - 0.62) / 0.12) : 0;
      const sun = sunAt(t);
      const up = t < 0.66 ? 1 : Math.max(0, 1 - (t - 0.66) / 0.05);
      const ground = pal.look === 'blocks' ? pal.shapes[1] : pal.bg;
      let out = '';
      if (pal.look === 'blocks') {
        out += path(poly([P(-4, 1.2), P(10, 1.2), P(10, 10), P(-4, 10)]), pal.shapes[1]);
        out += '<circle cx="' + n1(sun[0]) + '" cy="' + n1(sun[1]) + '" r="44" fill="' + pal.shapes[0] + '" opacity="' + up.toFixed(2) + '"/>';
      }
      let hours = '';
      for (let h = 6; h <= 18; h += 3) hours += dot(sunAt((h - 6) / 18), 1.4);
      out += path('M' + (AX - RX) + ' ' + AY + 'A' + RX + ' ' + RY + ' 0 0 1 ' + (AX + RX) + ' ' + AY, null, pal.ink, 0.75, ' stroke-opacity=".45" stroke-dasharray="1 5"');
      out += path(hours, pal.ink, null, 0, ' fill-opacity=".5"');
      // shadows on the ground
      out += path(poly([P(u0 + 0.55, v0 + 0.3), P(u1 + 0.55, v0 + 0.3), P(u1 + 0.55, v1 + 0.3), P(u0 + 0.55, v1 + 0.3)])
        + poly([P(pu0 + 0.5, pv0 + 0.4), P(pu1 + 0.5, pv0 + 0.4), P(pu1 + 0.5, pv1 + 0.3), P(pu0 + 0.5, pv1 + 0.3)]), pal.shade);
      // the solar array, ground mounted and tilted toward the sun path
      const leg = (a, r) => line([pp(a, r, TH), P(pu0 + a * (pu1 - pu0), pv0 + r * (pv1 - pv0), 0)]);
      out += path(leg(0.08, 0.06) + leg(0.92, 0.06) + line([P(pu0 + 0.2, pv0 + 0.08, 0.15), pp(0.92, 0.06, 0.6)]), null, pal.ink, 0.75);
      out += path(poly([pp(0, 1), pp(1, 1), pp(1, 1, TH), pp(0, 1, TH)]) + poly([pp(1, 1), pp(1, 0), pp(1, 0, TH), pp(1, 1, TH)]), pal.right, pal.ink, 1);
      out += path(poly([pp(0, 0), pp(1, 0), pp(1, 1), pp(0, 1)]), day ? mix(pal.bg, '#ffffff', pal.look === 'paper' ? 0.7 : 0.42) : mix(pal.bg, pal.look === 'blocks' ? '#000000' : pal.ink, 0.1), pal.ink, 1.25);
      let grid = '';
      for (let i = 1; i < 6; i++) grid += line([pp(i / 6, 0), pp(i / 6, 1)]);
      for (let i = 1; i < 3; i++) grid += line([pp(0, i / 3), pp(1, i / 3)]);
      out += path(grid, null, pal.ink, 0.6, ' stroke-opacity=".55"');
      out += path(leg(0.08, 0.94) + leg(0.92, 0.94), null, pal.ink, 0.75);
      // the house wall, cut in section at the top, with a window that lights at dusk
      out += path(poly([P(hu0, hv, 0), P(hu1, hv, 0), P(hu1, hv, hw), P(hu0, hv, hw)]), pal.left, pal.ink, 1.25);
      out += path(poly([P(hu0, hv, hw), P(hu1, hv, hw), P(hu1, hv - 0.34, hw), P(hu0, hv - 0.34, hw)]), pal.poche, pal.ink, 1);
      out += path(line([P(hu0, hv, 0.22), P(hu1, hv, 0.22)]), null, pal.ink, 0.75, ' stroke-opacity=".5"');
      out += path(poly([P(wu0, hv, 0), P(wu1, hv, 0), P(wu1 + 0.7, hv + 1.9, 0), P(wu0 + 0.3, hv + 1.9, 0)]), mix(ground, pal.lit, (pal.look === 'blocks' ? 0.5 : 0.45) * night));
      out += path(poly([P(wu0 + IN, hv, ww0 + IN), P(wu1 - IN, hv, ww0 + IN), P(wu1 - IN, hv, ww1 - IN), P(wu0 + IN, hv, ww1 - IN)]), night > 0.5 ? pal.lit : pal.left);
      out += path(poly([P(wu0, hv, ww0), P(wu1, hv, ww0), P(wu1, hv, ww1), P(wu0, hv, ww1)])
        + poly([P(wu0 + IN, hv, ww0 + IN), P(wu1 - IN, hv, ww0 + IN), P(wu1 - IN, hv, ww1 - IN), P(wu0 + IN, hv, ww1 - IN)])
        + line([P(wu0 - 0.1, hv + 0.16, ww0 - 0.03), P(wu1 + 0.1, hv + 0.16, ww0 - 0.03), P(wu1 + 0.1, hv, ww0 - 0.03)]), null, pal.ink, 1);
      out += path(line([P((wu0 + wu1) / 2, hv, ww0 + IN), P((wu0 + wu1) / 2, hv, ww1 - IN)])
        + line([P(wu0 + IN, hv, (ww0 + ww1) / 2 + 0.15), P(wu1 - IN, hv, (ww0 + ww1) / 2 + 0.15)]), null, pal.ink, 0.75);
      // cables on the ground, current running through them
      const cin = line([P(1.0, 6.62, 0.02), P(2.75, 6.62, 0.02), P(2.75, 3.62, 0.02), P(2.75, v1, 0.16)]);
      const cout = line([P(u1, 3.1, 0.16), P(4.02, 3.1, 0.02), P(5.1, 3.1, 0.02), P(5.1, hv + 0.06, 0.02), P(5.1, hv, 0.16)]);
      out += path(cin + cout, null, pal.ink, 3.4) + path(cin + cout, null, pal.bg, 1.6);
      const flow = pal.look === 'paper' ? pal.mark : pal.look === 'flat' ? pal.ink : pal.mark;
      out += path(cin, null, flow, 2.4, ' stroke-dasharray="0.01 9" opacity="' + (day ? 1 : 0) + '"').replace('/>', '><animate attributeName="stroke-dashoffset" from="0" to="-9.01" dur=".7s" repeatCount="indefinite"/></path>');
      out += path(cout, null, flow, 2.4, ' stroke-dasharray="0.01 9" opacity="' + (t > 0.58 ? 1 : 0) + '"').replace('/>', '><animate attributeName="stroke-dashoffset" from="0" to="-9.01" dur=".7s" repeatCount="indefinite"/></path>');
      // the battery: four modules and a cap, filling as it charges
      for (let k = 0; k < 4; k++) {
        const w0 = 0.1 + k * (MH + GAP), w1 = w0 + MH;
        const frac = clamp(charge * 4 - k, 0, 1);
        const wq = w0 + 0.07 + frac * (MH - 0.14);
        const b = box(P, u0, u1, v0, v1, w0, w1);
        out += path(b.right, pal.right, pal.ink, 1) + path(b.left, pal.left, pal.ink, 1);
        out += path(frac > 0 ? poly([P(u0 + 0.08, v1, w0 + 0.07), P(u1 - 0.08, v1, w0 + 0.07), P(u1 - 0.08, v1, wq), P(u0 + 0.08, v1, wq)]) : '', pal.acc2);
        out += path(frac > 0 ? poly([P(u1, v0 + 0.08, w0 + 0.07), P(u1, v1 - 0.08, w0 + 0.07), P(u1, v1 - 0.08, wq), P(u1, v0 + 0.08, wq)]) : '', pal.acc2Side);
        out += path(b.top, pal.top, pal.ink, 1) + path(line([P(u0 + 0.18, v1, w1 - 0.12), P(u0 + 0.62, v1, w1 - 0.12)]), null, pal.ink, 0.75, ' stroke-opacity=".55"');
      }
      const cw0 = 0.1 + 4 * (MH + GAP), cw1 = cw0 + 0.24;
      const cap = box(P, u0, u1, v0, v1, cw0, cw1);
      out += path(cap.right, pal.right, pal.ink, 1) + path(cap.left, pal.left, pal.ink, 1) + path(cap.top, pal.top, pal.ink, 1);
      out += path(poly([P(u0 + 0.12, v0 + 0.12, cw1), P(u1 - 0.12, v0 + 0.12, cw1), P(u1 - 0.12, v1 - 0.12, cw1), P(u0 + 0.12, v1 - 0.12, cw1)]), null, pal.ink, 0.75, ' stroke-opacity=".5"');
      let on = '', off = '';
      const lit = Math.round(charge * 4);
      for (let i = 0; i < 4; i++) { const p = P(u0 + 0.9 + i * 0.17, v1, cw0 + 0.12); if (i < lit) on += dot(p, 1.7); else off += dot(p, 1.7); }
      out += path(on, flow) + path(off, null, pal.ink, 0.75, ' stroke-opacity=".6"');
      // the sun, always on its path
      out += '<g opacity="' + up.toFixed(2) + '">'
        + '<circle cx="' + n1(sun[0]) + '" cy="' + n1(sun[1]) + '" r="11" fill="none" stroke="' + pal.ink + '" stroke-opacity=".45" stroke-width=".75" vector-effect="non-scaling-stroke"/>'
        + '<circle cx="' + n1(sun[0]) + '" cy="' + n1(sun[1]) + '" r="5.5" fill="' + (pal.look === 'paper' ? pal.acc : pal.look === 'flat' ? '#ffffff' : pal.shapes[0]) + '" stroke="' + pal.ink + '" stroke-width="1" vector-effect="non-scaling-stroke"/></g>';
      const minutes = Math.round((6 + 18 * t) * 60);
      const clock = pad2(Math.floor(minutes / 60) % 24) + ':' + pad2(Math.floor(minutes % 60 / 15) * 15);
      if (show) {
        const cell = P(u1, v0, cw1 - 0.1), win = P(wu1, hv, 2.0);
        out += path(line([pp(0, 0), [104, 150], [40, 150]]) + line([cell, [370, 168], [440, 168]]) + line([win, [548, win[1]], [590, win[1]]]), null, pal.ink, 0.75, ' stroke-opacity=".6"');
        out += path(dot(pp(0, 0), 1.8) + dot(cell, 1.8) + dot(win, 1.8), pal.ink);
        out += labelGroup(pal, text(40, 145, 'PV ARRAY', '.75') + text(374, 163, 'CELLS ' + Math.round(charge * 100) + '%', '.75') + text(552, win[1] - 5, 'LOAD', '.75'));
        out += labelGroup(pal, text(sun[0], sun[1] - 17, clock, (0.7 * up).toFixed(2), 'middle'), 8.5);
      }
      out += '<rect width="640" height="360" fill="#0b0d14" opacity="' + (0.1 * night).toFixed(2) + '"/>';
      return { body: out, readout: clock + ' · ' + (day ? (charge < 1 ? 'CHARGING' : 'FULL') : 'ON BATTERY') };
    },
  };
})();

// ---------- people: a field study, clusters of people on a board ----------

const people = (() => {
  const CX = 275.7, CY = 76, BU = 8, BV = 5, RING = 1.15;
  const P = proj(CX, CY);
  const RB = 0.12, RX = RB * R2 * A, RY = RB * R2 * B;
  const layout = (n) => {
    const R = prng(n.seed + 101);
    const anchors = [[1.55, 1.15], [6.25, 1.2], [1.75, 3.85], [6.35, 3.8]];
    const clusters = anchors.map((a) => ({ u: a[0] + (R() - 0.5) * 0.5, v: a[1] + (R() - 0.5) * 0.35, n: 4 + Math.floor(R() * 6) }));
    const list = [];
    clusters.forEach((c, k) => {
      for (let i = 0; i < c.n; i++) {
        let best = null;
        for (let tries = 0; tries < 14 && !best; tries++) {
          const ang = R() * Math.PI * 2, r = 0.15 + R() * 0.75;
          const u = clamp(c.u + r * Math.cos(ang), 0.35, BU - 0.35), v = clamp(c.v + r * Math.sin(ang), 0.35, BV - 0.35);
          let ok = true;
          for (const q of list) if (Math.hypot(q.u - u, q.v - v) < 0.4) { ok = false; break; }
          if (ok) best = { u, v, k };
        }
        if (best) list.push(best);
      }
      c.n = list.filter((q) => q.k === k).length;
    });
    list.sort((a, b) => (a.u + a.v) - (b.u + b.v));
    return { clusters, list };
  };
  return {
    caption: 'FIELD STUDY',
    describe: 'A field study drawn in fine lines: small figures stand in clusters on a board, and one cluster is marked.',
    ease: ['rise'],
    init(n) { const hi = n.seed % 4; return { hi, rise: [0, 1, 2, 3].map((k) => (k === hi ? 1 : 0)) }; },
    pointer(n, s, x, y) {
      const { clusters } = layout(n);
      let hi = 0, bestD = 1e9;
      clusters.forEach((c, k) => { const p = P(c.u, c.v); const d = Math.hypot(p[0] - x * 640, p[1] - y * 360); if (d < bestD) { bestD = d; hi = k; } });
      return { hi, rise: [0, 1, 2, 3].map((k) => (k === hi ? 1 : 0)) };
    },
    render(n, s, pal, show) {
      const { clusters, list } = layout(n);
      let out = board(P, 0, BU, 0, BV, 0.2, pal);
      let grid = '';
      for (let u = 1; u < BU; u++) for (let v = 1; v < BV; v++) grid += dot(P(u, v), 0.8);
      out += path(grid, pal.ink, null, 0, ' fill-opacity=".28"');
      let nums = '';
      clusters.forEach((c, k) => {
        const on = k === s.hi, ctr = P(c.u, c.v);
        out += path(ring(ctr, RING), null, pal.ink, on ? 1 : 0.75, on ? ' stroke-opacity=".8"' : ' stroke-opacity=".45" stroke-dasharray="2 4"');
        const lx = ctr[0] - RING * R2 * A - 6;
        nums += text(lx, ctr[1] + 3, pad2(k + 1), on ? '.85' : '.5', 'end');
      });
      if (show) out += labelGroup(pal, nums, 8.5);
      for (const q of list) {
        const r = (s.rise && s.rise[q.k]) || 0;
        const h = 0.36 + 0.14 * r;
        const base = P(q.u, q.v), top = P(q.u, q.v, h);
        const lit = r > 0.5;
        out += path(ell(P(q.u + 0.12, q.v + 0.07), RX * 1.3, RY * 1.3), pal.shade);
        out += path(side(top, base, RX, RY), lit ? pal.accR : pal.left, pal.ink, 1);
        out += path(ell(top, RX, RY), lit ? pal.acc : pal.top, pal.ink, 1);
        out += path(dot([top[0], top[1] - 5.6], 2.9), lit ? pal.acc : pal.top, pal.ink, 1);
      }
      const c = clusters[s.hi] || clusters[0];
      return { body: out, readout: 'CLUSTER ' + (s.hi + 1) + ' · ' + c.n + ' PEOPLE' };
    },
  };
})();

// ---------- network: devices syncing with a server ----------

const network = (() => {
  const CX = 342, CY = 62, K = 1.3, KW = 1.15;
  const P = proj(CX, CY);
  const scale = (d) => ({ name: d.name, u0: d.u0 * K, u1: d.u1 * K, v0: d.v0 * K, v1: d.v1 * K, route: d.route.map((p) => [p[0] * K, p[1] * K]) });
  const devices = [
    { name: 'laptop', u0: 1.2, u1: 2.8, v0: 3.2, v1: 4.3, route: [[3.5, 1.6], [3.5, 2.6], [2.0, 2.6], [2.0, 3.2]] },
    { name: 'phone', u0: 0.4, u1: 0.95, v0: 5.2, v1: 6.3, route: [[3.25, 1.6], [3.25, 2.3], [0.68, 2.3], [0.68, 5.2]] },
    { name: 'tablet', u0: 4.6, u1: 5.9, v0: 3.6, v1: 4.6, route: [[4.4, 1.3], [5.2, 1.3], [5.2, 3.6]] },
    { name: 'phone', u0: 6.4, u1: 6.95, v0: 2.2, v1: 3.3, route: [[4.4, 0.9], [6.68, 0.9], [6.68, 2.2]] },
  ].map(scale);
  const SU0 = 3.2 * K, SU1 = 4.4 * K, SV0 = 0.6 * K, SV1 = 1.6 * K, SH = 1.6 * KW;
  const routes = devices.map((d) => d.route.map((p) => P(p[0], p[1], 0.02)));
  const lengths = routes.map(length);
  const longest = Math.max.apply(null, lengths);
  const GAPMAX = 24, END = 16;
  return {
    caption: 'SYNC TOPOLOGY',
    describe: 'Devices drawn in fine lines, linked by cables to a small server; one is offline until its cable closes.',
    ease: ['p'],
    init(n) { return { p: 0.45 + (n.seed % 4) * 0.05 }; },
    pointer(n, s, x) { return { p: clamp(x, 0, 1) }; },
    render(n, s, pal, show) {
      const offline = n.seed % 4;
      const close = clamp((s.p - 0.72) / 0.28, 0, 1);
      const travelled = s.p * (longest + 30);
      let out = '';
      let shade = poly([P(SU0 + 0.7, SV0 + 0.4), P(SU1 + 0.7, SV0 + 0.4), P(SU1 + 0.7, SV1 + 0.4), P(SU0 + 0.7, SV1 + 0.4)]);
      for (const d of devices) shade += poly([P(d.u0 + 0.14, d.v0 + 0.12), P(d.u1 + 0.14, d.v0 + 0.12), P(d.u1 + 0.14, d.v1 + 0.12), P(d.u0 + 0.14, d.v1 + 0.12)]);
      out += path(shade, pal.shade);
      // cables, one with a gap that closes as the packet reaches it
      let cables = '';
      const arrived = [];
      devices.forEach((d, i) => {
        const pts = routes[i], L = lengths[i];
        if (i === offline) {
          const gap = GAPMAX * (1 - close);
          cables += line(between(pts, 0, L - END - gap)) + line(between(pts, L - END, L));
          arrived.push(close >= 1 && travelled >= L);
        } else {
          cables += line(pts);
          arrived.push(travelled >= L);
        }
      });
      out += path(cables, null, pal.ink, 3.4) + path(cables, null, pal.bg, 1.6);
      // the server
      const sv = box(P, SU0, SU1, SV0, SV1, 0, SH);
      out += path(sv.right, pal.right, pal.ink, 1) + path(sv.left, pal.left, pal.ink, 1) + path(sv.top, pal.top, pal.ink, 1.25);
      let slots = '';
      for (let k = 0; k < 5; k++) slots += line([P(SU0 + 0.18, SV1, 0.3 + k * 0.33), P(SU1 - 0.18, SV1, 0.3 + k * 0.33)]);
      out += path(slots, null, pal.ink, 0.75, ' stroke-opacity=".6"');
      out += path(poly([P(SU0 + 0.14, SV0 + 0.14, SH), P(SU1 - 0.14, SV0 + 0.14, SH), P(SU1 - 0.14, SV1 - 0.14, SH), P(SU0 + 0.14, SV1 - 0.14, SH)]), null, pal.ink, 0.75, ' stroke-opacity=".5"');
      let leds = '';
      for (let k = 0; k < 3; k++) leds += dot(P(SU1, SV0 + 0.25 + k * 0.22, SH - 0.3), 1.7);
      out += path(leds, pal.mark).replace('/>', '><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></path>');
      // the devices, back to front
      const order = devices.map((d, i) => i).sort((a, b) => (devices[a].u0 + devices[a].v0) - (devices[b].u0 + devices[b].v0));
      for (const i of order) {
        const d = devices[i];
        const synced = arrived[i];
        const screen = synced ? pal.acc2 : pal.glass;
        const ink = synced ? line : () => '';
        if (d.name === 'laptop') {
          const lidH = 1.15 * KW, lidT = 0.08;
          const base = box(P, d.u0, d.u1, d.v0, d.v1, 0, 0.1);
          const lid = box(P, d.u0, d.u1, d.v0, d.v0 + lidT, 0.1, lidH);
          const f = d.v0 + lidT;
          out += path(lid.right, pal.right, pal.ink, 1) + path(lid.top, pal.top, pal.ink, 1) + path(lid.left, pal.left, pal.ink, 1.25);
          out += path(poly([P(d.u0 + 0.12, f, 0.24), P(d.u1 - 0.12, f, 0.24), P(d.u1 - 0.12, f, lidH - 0.1), P(d.u0 + 0.12, f, lidH - 0.1)]), screen, pal.ink, 0.75);
          out += path(ink([P(d.u0 + 0.32, f, lidH - 0.32), P(d.u0 + 1.2, f, lidH - 0.32)]) + ink([P(d.u0 + 0.32, f, lidH - 0.55), P(d.u0 + 1.5, f, lidH - 0.55)]) + ink([P(d.u0 + 0.32, f, lidH - 0.78), P(d.u0 + 0.9, f, lidH - 0.78)]), null, pal.ink, 1, ' stroke-opacity=".55"');
          out += path(base.right, pal.right, pal.ink, 1) + path(base.left, pal.left, pal.ink, 1) + path(base.top, pal.top, pal.ink, 1.25);
          let keys = '';
          for (let k = 0; k < 4; k++) keys += line([P(d.u0 + 0.24, d.v0 + 0.32 + k * 0.17, 0.1), P(d.u1 - 0.24, d.v0 + 0.32 + k * 0.17, 0.1)]);
          keys += poly([P(d.u0 + 0.7, d.v1 - 0.42, 0.1), P(d.u1 - 0.7, d.v1 - 0.42, 0.1), P(d.u1 - 0.7, d.v1 - 0.12, 0.1), P(d.u0 + 0.7, d.v1 - 0.12, 0.1)]);
          out += path(keys, null, pal.ink, 0.6, ' stroke-opacity=".5"');
        } else {
          const th = 0.08;
          const b = box(P, d.u0, d.u1, d.v0, d.v1, 0, th);
          out += path(b.right, pal.right, pal.ink, 1) + path(b.left, pal.left, pal.ink, 1) + path(b.top, pal.top, pal.ink, 1.25);
          const m = d.name === 'phone' ? 0.08 : 0.12;
          out += path(poly([P(d.u0 + m, d.v0 + m * 1.6, th), P(d.u1 - m, d.v0 + m * 1.6, th), P(d.u1 - m, d.v1 - m * 1.6, th), P(d.u0 + m, d.v1 - m * 1.6, th)]), screen, pal.ink, 0.75);
          const mid = (d.u0 + d.u1) / 2;
          out += path(ink([P(d.u0 + m + 0.1, d.v0 + 0.45, th), P(d.u1 - m - 0.1, d.v0 + 0.45, th)]) + ink([P(d.u0 + m + 0.1, d.v0 + 0.7, th), P(mid, d.v0 + 0.7, th)]), null, pal.ink, 1, ' stroke-opacity=".55"');
        }
      }
      // packets on their way
      let packets = '', halos = '';
      devices.forEach((d, i) => {
        const pts = routes[i], L = lengths[i];
        let at = travelled;
        if (i === offline && close < 1) at = Math.min(at, L - END - GAPMAX * (1 - close) - 3);
        const p = along(pts, clamp(at, 0, L)).at;
        const showIt = !arrived[i] && travelled > 2;
        packets += showIt ? dot(p, 2.6) : '';
        halos += showIt ? dot(p, 5.5) : '';
      });
      out += path(halos, null, pal.ink, 0.75, ' stroke-opacity=".45"') + path(packets, pal.mark, pal.ink, 1);
      const k = arrived.filter(Boolean).length;
      return { body: out, readout: 'SYNCED ' + k + ' OF 4' + (close < 1 ? ' · 1 OFFLINE' : '') };
    },
  };
})();

// ---------- stack: revisions as an exploded stack of pages ----------

const stack = (() => {
  const CX = 262, CY = 176, PU = 4.8, PV = 3.4, T = 0.1, N = 5;
  const P = proj(CX, CY);
  const levels = (spread) => { const g = 0.22 + 0.62 * spread; const out = []; for (let k = 0; k < N; k++) out.push(k * (T + g)); return out; };
  return {
    caption: 'REVISIONS, EXPLODED',
    describe: 'Five revisions of a page drawn as an exploded stack in fine lines; one draft is marked.',
    ease: ['spread'],
    init(n) { return { spread: 0.6, hi: 2 + n.seed % 3 }; },
    pointer(n, s, x, y) {
      const spread = clamp(1.1 - y * 1.25, 0, 1);
      const lv = levels(s.spread);
      let hi = 0, best = 1e9;
      for (let k = 0; k < N; k++) { const p = P(PU / 2, PV / 2, lv[k]); const d = Math.abs(p[1] - y * 360); if (d < best) { best = d; hi = k; } }
      return { spread, hi };
    },
    render(n, s, pal, show) {
      const lv = levels(s.spread);
      const R = prng(n.seed + 7);
      const top = lv[N - 1] + T;
      let out = path(poly([P(0.7, 0.4), P(PU + 0.7, 0.4), P(PU + 0.7, PV + 0.4), P(0.7, PV + 0.4)]), pal.shade);
      out += path(line([P(0, 0), P(0, 0, top)]) + line([P(PU, 0), P(PU, 0, top)]) + line([P(0, PV), P(0, PV, top)]) + line([P(PU, PV), P(PU, PV, top)]), null, pal.ink, 0.75, ' stroke-opacity=".4" stroke-dasharray="2 4"');
      let labels = '', leaders = '';
      for (let k = 0; k < N; k++) {
        const w = lv[k], on = k === s.hi;
        const t0 = 0.35 + k * 0.82;
        out += path(poly([P(t0, -0.34, w + T), P(t0 + 0.8, -0.34, w + T), P(t0 + 0.8, 0, w + T), P(t0, 0, w + T)]), on ? pal.acc : pal.top, pal.ink, 1);
        out += path(poly([P(t0 + 0.8, -0.34, w), P(t0 + 0.8, 0, w), P(t0 + 0.8, 0, w + T), P(t0 + 0.8, -0.34, w + T)]), on ? pal.accR : pal.right, pal.ink, 0.75);
        const b = box(P, 0, PU, 0, PV, w, w + T);
        out += path(b.right, on ? pal.accR : pal.right, pal.ink, 1) + path(b.left, on ? pal.accL : pal.left, pal.ink, 1) + path(b.top, on ? pal.acc : pal.top, pal.ink, on ? 1.25 : 1);
        let title = line([P(0.5, 0.55, w + T), P(0.5 + 1.4 + R() * 0.8, 0.55, w + T)]);
        let rows = '';
        const count = 3 + k;
        for (let r = 0; r < count; r++) {
          const v = 1.0 + r * 0.27;
          if (v > PV - 0.3) break;
          rows += line([P(0.5, v, w + T), P(0.5 + 2.2 + R() * 1.7, v, w + T)]);
        }
        out += path(title, null, pal.look === 'blocks' && on ? pal.bg : pal.ink, 2, ' stroke-opacity="' + (on ? '.85' : '.55') + '"')
          + path(rows, null, pal.look === 'blocks' && on ? pal.bg : pal.ink, 0.75, ' stroke-opacity="' + (on ? '.7' : '.5') + '"');
        if (show) {
          const c = P(PU, 0, w + T / 2);
          leaders += line([c, [c[0] + 20, c[1]]]);
          labels += text(c[0] + 26, c[1] + 3, 'REV ' + pad2(k + 1), on ? '.85' : '.5');
        }
      }
      if (show) out += path(leaders, null, pal.ink, 0.75, ' stroke-opacity=".55"') + labelGroup(pal, labels);
      return { body: out, readout: 'DRAFT ' + (s.hi + 1) + ' OF ' + N };
    },
  };
})();

// ---------- inbox: a tray of standing cards, one lifted out ----------

const inbox = (() => {
  const CX = 229, CY = 132, TU = 8.4, TV = 2.3, WH = 0.6, WT = 0.08, NC = 10, CH = 1.75;
  const P = proj(CX, CY);
  const cardU = (i) => 0.55 + i * 0.78;
  const STATUS = ['ANSWERED', 'WAITING', 'NEW'];
  return {
    caption: 'THE INBOX',
    describe: 'A tray of standing cards drawn in fine lines, one message lifted out to be read.',
    ease: ['lift'],
    init(n) { const hi = 2 + n.seed % 6; const lift = []; for (let i = 0; i < NC; i++) lift.push(i === hi ? 1 : 0); return { hi, lift }; },
    pointer(n, s, x) {
      let hi = 0, best = 1e9;
      for (let i = 0; i < NC; i++) { const cx = CX + (cardU(i) - 1.15) * A; const d = Math.abs(cx - x * 640); if (d < best) { best = d; hi = i; } }
      const lift = [];
      for (let i = 0; i < NC; i++) lift.push(i === hi ? 1 : 0);
      return { hi, lift };
    },
    render(n, s, pal, show) {
      const R = prng(n.seed + 31);
      const status = [];
      for (let i = 0; i < NC; i++) status.push(STATUS[Math.floor(R() * 3)]);
      let out = path(poly([P(0.7, 0.4, 0), P(TU + 0.7, 0.4, 0), P(TU + 0.7, TV + 0.4, 0), P(0.7, TV + 0.4, 0)]), pal.shade);
      out += path(poly([P(0, 0, 0.06), P(TU, 0, 0.06), P(TU, TV, 0.06), P(0, TV, 0.06)]), pal.board, pal.ink, 1);
      const back = box(P, 0, TU, 0, WT, 0.06, WH);
      out += path(back.left, pal.right, pal.ink, 1) + path(back.top, pal.top, pal.ink, 1);
      const sideW = box(P, 0, WT, 0, TV, 0.06, WH);
      out += path(sideW.right, pal.left, pal.ink, 1) + path(sideW.top, pal.top, pal.ink, 1);
      for (let i = 0; i < NC; i++) {
        const u = cardU(i), on = i === s.hi;
        const up = ((s.lift && s.lift[i]) || 0) * 0.95;
        const w0 = 0.1 + up, w1 = CH + up, v0 = 0.25, v1 = TV - 0.25;
        const c = box(P, u, u + 0.05, v0, v1, w0, w1);
        out += path(c.left, on ? pal.accL : pal.left, pal.ink, 1) + path(c.right, on ? pal.acc : pal.top, pal.ink, on ? 1.25 : 1) + path(c.top, pal.top, pal.ink, 1);
        const f = u + 0.05, ink = pal.look === 'blocks' && on ? pal.bg : pal.ink;
        const lines = line([P(f, v0 + 0.25, w1 - 0.3), P(f, v0 + 1.0, w1 - 0.3)]) + line([P(f, v0 + 0.25, w1 - 0.55), P(f, v0 + 1.35, w1 - 0.55)]) + line([P(f, v0 + 0.25, w1 - 0.75), P(f, v0 + 0.85, w1 - 0.75)]);
        out += path(lines, null, ink, 0.75, ' stroke-opacity="' + (on ? '.75' : '.5') + '"');
        out += path(status[i] === 'ANSWERED' ? '' : dot(P(f, v1 - 0.24, w1 - 0.24), 2.2), status[i] === 'NEW' ? pal.mark : 'none', ink, 0.75);
      }
      const front = box(P, 0, TU, TV - WT, TV, 0, WH);
      out += path(front.left, pal.left, pal.ink, 1.25) + path(front.top, pal.top, pal.ink, 1);
      const end = box(P, TU - WT, TU, 0, TV, 0, WH);
      out += path(end.right, pal.right, pal.ink, 1.25) + path(end.top, pal.top, pal.ink, 1);
      out += path(poly([P(3.6, TV, 0.15), P(4.8, TV, 0.15), P(4.8, TV, 0.45), P(3.6, TV, 0.45)]), pal.top, pal.ink, 0.75);
      return { body: out, readout: 'MESSAGE ' + (s.hi + 1) + ' · ' + status[s.hi] };
    },
  };
})();

// ---------- bars: build times as columns, under a target line ----------

const bars = (() => {
  const CX = 250, CY = 116, BU = 8, BV = 3, NB = 8, SCALE = 1.7 / 60, CW = 0.5;
  const P = proj(CX, CY);
  const colU = (i) => 0.5 + i * 0.92;
  const secs = (n) => { const R = prng(n.seed + 53); const out = []; for (let i = 0; i < NB; i++) out.push(Math.round(30 + R() * 40)); return out; };
  return {
    caption: 'BUILD TIMES',
    describe: 'Build times drawn as an isometric bar chart against a dashed target; one build is selected.',
    ease: ['lift'],
    init(n) { const hi = 2 + n.seed % 5; const lift = []; for (let i = 0; i < NB; i++) lift.push(i === hi ? 1 : 0); return { hi, lift }; },
    pointer(n, s, x) {
      let hi = 0, best = 1e9;
      for (let i = 0; i < NB; i++) { const cx = CX + (colU(i) + CW / 2 - 1.45) * A; const d = Math.abs(cx - x * 640); if (d < best) { best = d; hi = i; } }
      const lift = [];
      for (let i = 0; i < NB; i++) lift.push(i === hi ? 1 : 0);
      return { hi, lift };
    },
    render(n, s, pal, show) {
      const t = secs(n);
      const tw = 60 * SCALE;
      let out = board(P, 0, BU, 0, BV, 0.2, pal);
      // the target, a dashed line along the back and the far end at sixty seconds
      out += path(line([P(0, 0, tw), P(BU, 0, tw), P(BU, BV, tw)]) + line([P(0, 0), P(0, 0, tw)]) + line([P(BU, 0), P(BU, 0, tw)]), null, pal.ink, 0.75, ' stroke-opacity=".5" stroke-dasharray="3 4"');
      for (let i = 0; i < NB; i++) {
        const u = colU(i), on = i === s.hi;
        const up = ((s.lift && s.lift[i]) || 0) * 0.18;
        const h = t[i] * SCALE;
        out += path(poly([P(u + 0.14, 1.0 + 0.1), P(u + CW + 0.14, 1.0 + 0.1), P(u + CW + 0.14, 1.95 + 0.1), P(u + 0.14, 1.95 + 0.1)]), pal.shade);
        const b = box(P, u, u + CW, 1.0, 1.95, up, h + up);
        out += path(b.right, on ? pal.accR : pal.right, pal.ink, 1) + path(b.left, on ? pal.accL : pal.left, pal.ink, 1) + path(b.top, on ? pal.acc : pal.top, pal.ink, on ? 1.25 : 1);
        // over the target: a tick on the face where the line would cross
        out += path(t[i] > 60 ? line([P(u + 0.08, 1.95, tw + up), P(u + CW - 0.08, 1.95, tw + up)]) : '', null, pal.look === 'blocks' && on ? pal.bg : pal.ink, 0.75, ' stroke-dasharray="2 2"');
      }
      if (show) {
        let d = line([P(0, BV), P(0, BV, 72 * SCALE)]), labels = '';
        for (const sec of [0, 30, 60]) { const p = P(0, BV, sec * SCALE); d += line([p, [p[0] - 6, p[1]]]); labels += text(p[0] - 10, p[1] + 3, sec ? sec + ' S' : '0', '.6', 'end'); }
        out += path(d, null, pal.ink, 0.75, ' stroke-opacity=".6"') + labelGroup(pal, labels, 8.5);
        const e = P(BU, 0, tw);
        out += labelGroup(pal, text(e[0] + 10, e[1] + 3, 'TARGET 60 S', '.6'), 8.5);
      }
      return { body: out, readout: 'BUILD ' + (10 + n.seed % 20 + s.hi) + ' · ' + t[s.hi] + ' S' };
    },
  };
})();

// ---------- rings: a quiet device, its sound spreading in rings ----------

const rings = (() => {
  const CX = 320, CY = 82, PS = 6, RC = 0.72, HC = 1.65, NR = 5;
  const P = proj(CX, CY);
  const centre = P(PS / 2, PS / 2);
  return {
    caption: 'NOISE FLOOR',
    describe: 'A small device on a plate drawn in fine lines, with rings of sound around it.',
    ease: ['spread'],
    init(n) { return { spread: 0.45 + (n.seed % 4) * 0.1 }; },
    pointer(n, s, x, y) {
      const d = Math.hypot(x * 640 - centre[0], (y * 360 - centre[1]) * 1.6);
      return { spread: clamp((d - 30) / 230, 0, 1) };
    },
    render(n, s, pal, show) {
      let out = board(P, 0, PS, 0, PS, 0.2, pal);
      let ticks = '';
      for (let k = 0; k < NR; k++) {
        const r = 1.1 + k * (0.27 + 0.2 * s.spread);
        const fade = (1 - k / (NR + 1)) * (0.3 + 0.7 * s.spread);
        out += path(ring(centre, r), null, pal.ink, k < 2 ? 1 : 0.75, ' stroke-opacity="' + fade.toFixed(2) + '"' + (k >= 3 ? ' stroke-dasharray="2 4"' : ''));
        if (show && (k === 0 || k === NR - 1)) ticks += text(centre[0] + r * R2 * A + 5, centre[1] - 3, k === 0 ? '−6' : '−' + (6 * NR), (0.4 + 0.4 * fade).toFixed(2), null, 8);
      }
      if (show) out += labelGroup(pal, ticks, 8);
      const rx = RC * R2 * A, ry = RC * R2 * B, top = P(PS / 2, PS / 2, HC);
      out += path(ell(P(PS / 2 + 0.4, PS / 2 + 0.25), rx * 1.15, ry * 1.15), pal.shade);
      out += path(side(top, centre, rx, ry), pal.left, pal.ink, 1.25);
      const seam = P(PS / 2, PS / 2, HC * 0.3);
      out += path('M' + n1(seam[0] - rx) + ' ' + n1(seam[1]) + 'A' + n1(rx) + ' ' + n1(ry) + ' 0 0 0 ' + n1(seam[0] + rx) + ' ' + n1(seam[1]), null, pal.ink, 0.75, ' stroke-opacity=".55"');
      out += path(ell(top, rx, ry), pal.top, pal.ink, 1.25);
      let grille = '';
      for (let k = 1; k <= 3; k++) grille += ell(top, rx * k / 4.2, ry * k / 4.2);
      out += path(grille, null, pal.ink, 0.75, ' stroke-opacity=".55"');
      out += path(dot([top[0] + rx * 0.6, top[1] + ry * 0.4], 1.8), pal.mark).replace('/>', '><animate attributeName="opacity" values="1;.3;1" dur="3s" repeatCount="indefinite"/></path>');
      const db = Math.round(16 + s.spread * 22);
      return { body: out, readout: db + ' DB' };
    },
  };
})();

const DEF = { week, energy, people, network, stack, inbox, bars, rings };

// ---------- the API ----------

// A cover is { motif, look, tone, seed, caption }; anything missing or unknown falls back.
// A string "motif:look:tone:seed" works too.
export function normalize(spec) {
  let s = spec;
  if (typeof s === 'string') { const p = s.split(':'); s = { motif: p[0], look: p[1], tone: p[2], seed: p[3] }; }
  if (!s || typeof s !== 'object') s = {};
  const motif = MOTIFS.indexOf(s.motif) >= 0 ? s.motif : 'week';
  const look = LOOKS.indexOf(s.look) >= 0 ? s.look : 'paper';
  const tone = Object.prototype.hasOwnProperty.call(TONES, s.tone) ? s.tone : 'lilac';
  let seed = Math.floor(Math.abs(Number(s.seed)));
  if (!(seed >= 0)) seed = 0;
  seed = seed % 10000;
  let caption = '';
  if (typeof s.caption === 'string') {
    for (const ch of s.caption) if (ch.charCodeAt(0) >= 32) caption += ch;
    caption = caption.trim().slice(0, 40).toUpperCase();
  }
  return { motif, look, tone, seed, caption };
}

export function initial(spec) {
  const n = normalize(spec);
  return DEF[n.motif].init(n);
}

export function pointer(spec, state, x, y) {
  const n = normalize(spec);
  return DEF[n.motif].pointer(n, state || DEF[n.motif].init(n), clamp(Number(x) || 0, 0, 1), clamp(Number(y) || 0, 0, 1));
}

function approach(a, b) {
  const d = b - a;
  if (Math.abs(d) < 0.002) return { v: b, done: true };
  return { v: a + d * 0.18, done: false };
}

export function step(spec, state, target) {
  const n = normalize(spec);
  const m = DEF[n.motif];
  const out = {};
  let done = true;
  for (const key in state) out[key] = state[key];
  for (const key in target) {
    const t = target[key];
    if (m.ease.indexOf(key) < 0) { out[key] = t; continue; }
    if (Array.isArray(t)) {
      const cur = Array.isArray(state[key]) ? state[key] : [];
      const next = [];
      for (let i = 0; i < t.length; i++) {
        const r = approach(typeof cur[i] === 'number' ? cur[i] : 0, t[i]);
        next.push(r.v);
        if (!r.done) done = false;
      }
      out[key] = next;
    } else {
      const r = approach(typeof state[key] === 'number' ? state[key] : t, t);
      out[key] = r.v;
      if (!r.done) done = false;
    }
  }
  return { state: out, done };
}

export function render(spec, state, options = {}) {
  const n = normalize(spec);
  const m = DEF[n.motif];
  const pal = palette(n);
  const show = pal.labels && options.labels !== false;
  const s = state || m.init(n);
  const drawn = m.render(n, s, pal, show);
  let frame = '';
  if (show) {
    frame = labelGroup(pal, text(28, 36, 'FIG. ' + (1 + n.seed % 12), '.55')
      + text(612, 36, n.caption || m.caption, '.55', 'end')
      + text(28, 340, drawn.readout, '.8'));
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + esc(describe(n)) + '"'
    + ' stroke-linejoin="round" stroke-linecap="round">'
    + '<rect width="640" height="360" fill="' + pal.bg + '"/>'
    + (pal.look === 'blocks' && n.motif !== 'energy' ? blockShapes(n, pal) : '')
    + drawn.body + frame + '</svg>';
}

export function describe(spec) {
  const n = normalize(spec);
  return DEF[n.motif].describe;
}
