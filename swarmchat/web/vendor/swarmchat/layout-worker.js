'use strict';
// The map's layout, in a worker of its own file (so the node's Content-Security-Policy allows it). Vendored from
// upstream SwarmChat 5ee0c0e (swarmchat/page/app.js, MIT, see LICENSE beside this file), unchanged but for this line.
// The layout runs in a worker, so the page never stops answering. Forces as in Fruchterman and Reingold: every pair
// pushes apart, every link pulls together, and each step moves less than the one before.
function layoutWorker() {
  self.onmessage = e => {
    const {x, y, mass, a, b, pull, iterations, heat, k} = e.data;
    const n = x.length, dx = new Float32Array(n), dy = new Float32Array(n), kk = k * k, far = (12 * k) ** 2;
    for (let it = 0; it < iterations; it++) {
      dx.fill(0); dy.fill(0);
      if (n <= 2500) {
        for (let i = 0; i < n; i++) {
          const xi = x[i], yi = y[i], mi = mass[i];
          for (let j = i + 1; j < n; j++) {
            let ex = xi - x[j], ey = yi - y[j], d2 = ex * ex + ey * ey;
            if (d2 > far) continue;
            if (d2 < 0.01) { ex = Math.random() - 0.5; ey = Math.random() - 0.5; d2 = 0.5; }
            const f = kk * mi * mass[j] / d2;
            dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
          }
        }
      } else {  // many nodes: only neighbours within a few cells push
        const cell = 6 * k, grid = new Map();
        for (let i = 0; i < n; i++) {
          const key = Math.floor(x[i] / cell) * 65536 + Math.floor(y[i] / cell);
          (grid.get(key) || grid.set(key, []).get(key)).push(i);
        }
        for (let i = 0; i < n; i++) {
          const cx = Math.floor(x[i] / cell), cy = Math.floor(y[i] / cell);
          for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
            const list = grid.get(gx * 65536 + gy);
            if (!list) continue;
            for (const j of list) {
              if (j <= i) continue;
              let ex = x[i] - x[j], ey = y[i] - y[j], d2 = ex * ex + ey * ey;
              if (d2 < 0.01) { ex = Math.random() - 0.5; ey = Math.random() - 0.5; d2 = 0.5; }
              const f = kk * mass[i] * mass[j] / d2;
              dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
            }
          }
        }
      }
      for (let e2 = 0; e2 < a.length; e2++) {
        const i = a[e2], j = b[e2], ex = x[j] - x[i], ey = y[j] - y[i];
        const d = Math.sqrt(ex * ex + ey * ey) || 0.1, f = d / k * pull[e2];
        dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f;
      }
      const t = heat * (1 - it / iterations) + 0.5;
      for (let i = 0; i < n; i++) {
        dx[i] -= x[i] * 0.03; dy[i] -= y[i] * 0.03;
        const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, s = Math.min(d, t) / d;
        x[i] += dx[i] * s; y[i] += dy[i] * s;
      }
      if (it % 8 === 7 || it === iterations - 1) self.postMessage({x, y, done: it === iterations - 1});
    }
  };
}

layoutWorker();
