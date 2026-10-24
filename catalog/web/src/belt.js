/**
 * Belt: apps riding from the store into your node. A belt runs out of a store
 * cabinet, through a gate, into a node drum; each crate is one of the store's
 * apps, its place in the list punched as dots on its lid. Crates grow out of
 * the cabinet's mouth and shrink into the drum, so no wall is ever crossed.
 * Hovering never stops the belt: it springs the clock's rate down to the
 * slider's value, so a crate can be read. The crate nearest the pointer lifts,
 * takes the bright edge from the drum, and gives its app's name to the read-out.
 * The app names come from the stage's data-apps, comma-separated.
 *
 * Ambient: the loop runs while the stage is on screen. Under reduced motion the
 * resting rate is 0, so the belt stands still until hovered.
 */
const {
  Cam, fit, proj, unproj, facing, rings, prism, rrect, circ, ringAt, run, poly, open, seg, clamp, r2,
  spring, stepS, reducedMotion, mk, solid, put, flatDot, place, register, pointer, disposer,
} = HL;

const L = 200, BW = 26, BT = 5, CUBE = 16, SPEED = 1 / 11, GATE = 96, GH = 38;
// uneven, so the belt is a composition at every moment, not a metronome
const PHASE = [0.04, 0.23, 0.41, 0.62, 0.8];
const SD = 26, SH = 50, NR = 22, NH = 32, NX = L + NR - 2;
const NAMES = ["catalog", "feedback", "overlap", "pastebin", "relay"];

/** How big a crate is at belt position u (0..1): smoothstep in over the first 9%, out over the last. */
const size = (u) => { const a = clamp(Math.min(u, 1 - u) / 0.09, 0, 1); return a * a * (3 - 2 * a); };
/** A ring moved to (x, y). */
const at = (ring, x, y) => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + y }));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const names = (stage.dataset.apps || "").split(",").map((s) => s.trim()).filter(Boolean);
  const apps = names.length ? names : NAMES;
  let slow = value, over = null, clock = 0;
  const rate = spring(1, { eps: 0.002 });

  const C = Cam(45, 0.5, 1.5);
  fit(C, [[-SD, -6, 0], [-SD, BW + 6, SH], [-1, -6, SH], [NX + NR, BW / 2, 0], [NX, BW / 2 + NR, 0], [NX - NR, BW / 2, NH], [GATE, -8, GH]], 200, 170);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // the belt, its ends tucked into the cabinet and the drum
  const [bR, bI] = rings(-6, 0, L + 6, BW, 5, 1.3);
  put(solid(g), prism(P, front, bR, bI, 0, BT));
  const slats = mk("path", { class: "nf lo" }, g);

  // the store: a cabinet with a mouth at belt height and two shelves above it
  const [sR, sI] = rings(-SD, -6, -1, BW + 6, 4, 1.4);
  const store = solid(g);
  put(store, prism(P, front, sR, sI, 0, SH));
  const face = (u0, v0, u1, v1, r) => poly(rrect(u0, v0, u1, v1, r, 4).map((q) => P(-1, q.u, q.v)));
  mk("path", { d: face(2, BT + 1, BW - 2, BT + CUBE + 7, 3), class: "nf" }, g);
  mk("path", { d: seg(P(-1, -2, 36), P(-1, BW + 2, 36)) + seg(P(-1, -2, 43), P(-1, BW + 2, 43)), class: "nf lo" }, g);

  // crates and the gate share one layer, re-sorted by depth (x + y at 45°) every frame
  const layer = mk("g", {}, g);
  const pool = PHASE.map(() => {
    const el = { ...solid(layer), dots: [] };
    for (let k = 0; k < 9; k++) el.dots.push(flatDot(el.g, C, 1, "dot off"));
    return el;
  });
  // the lintel's key is past both posts and every crate under it, so it paints last among them
  const gate = [[-9, -4, 0, GH - 4, GATE - 6.5], [BW + 4, BW + 9, 0, GH - 4, GATE + BW + 6.5], [-9, BW + 9, GH - 4, GH, GATE + BW + 9.5]]
    .map(([y0, y1, z0, z1, key]) => {
      const el = solid(layer), [rg, ig] = rings(GATE - 1.8, y0, GATE + 1.8, y1, 1.5, 0.6);
      put(el, prism(P, front, rg, ig, z0, z1));
      return { el, key };
    });

  // your node: a drum, the one file it keeps, banded like a stack of platters; the mark the eye starts on
  const ring = at(circ(NR, 28), NX, BW / 2), inner = at(circ(NR - 1.6, 28), NX, BW / 2);
  const drum = solid(g);
  put(drum, prism(P, front, ring, inner, 0, NH));
  const bands = [NH / 3, (2 * NH) / 3].map((z) => open(ringAt(P, run(ring, front), z))).join("");
  mk("path", { d: bands, class: "nf lo" }, g);
  drum.sil.classList.add("hi");

  const lifts = PHASE.map(() => spring(0, { eps: 0.03 }));
  let order = "", shown = "";

  const B = register(stage, (dt) => {
    let moving = stepS(rate, dt);
    if (!over) rate.t = reducedMotion() ? 0 : 1;
    clock += dt * rate.x;
    const items = PHASE.map((ph, j) => {
      const q = ph + clock * SPEED, u = q - Math.floor(q);
      return { j, x: u * L, s: size(u), app: apps[(j + Math.floor(q) * PHASE.length) % apps.length] };
    });
    // the crate nearest the pointer, on the belt's plane
    let hot = -1, best = 22;
    if (over && Math.abs(over[1] - BW / 2) < 34) {
      for (const it of items) if (it.s > 0.6 && Math.abs(it.x - over[0]) < best) { best = Math.abs(it.x - over[0]); hot = it.j; }
    }
    lifts.forEach((sp, j) => { sp.t = j === hot ? 12 : 0; if (stepS(sp, dt)) moving = true; });
    drum.sil.classList.toggle("hi", hot < 0);

    const draw = gate.map((p, i) => ({ id: "g" + i, key: p.key, g: p.el.g }));
    let name = "rest";
    items.forEach((it) => {
      const el = pool[it.j], sz = CUBE * it.s, x0 = it.x - sz / 2, x1 = it.x + sz / 2, y0 = BW / 2 - sz / 2, y1 = BW / 2 + sz / 2;
      const z0 = BT + lifts[it.j].x, z1 = z0 + sz * 0.9;
      draw.push({ id: it.j, key: it.x + BW / 2, g: el.g });
      if (sz < 0.3) { el.g.setAttribute("visibility", "hidden"); return; }
      el.g.removeAttribute("visibility");
      const [rg, ig] = rings(x0, y0, x1, y1, 2.6 * it.s, 0.9 * it.s);
      put(el, prism(P, front, rg, ig, z0, z1));
      const isHot = it.j === hot;
      el.sil.classList.toggle("hi", isHot);
      if (isHot) name = it.app;
      // the app's place in the store's list, as lit dots on the lid
      const n = (apps.indexOf(it.app) % 9) + 1, pitch = sz * 0.22, rr = r2(0.6 * it.s * C.S);
      el.dots.forEach((d, b) => {
        place(d, P(it.x + ((b % 3) - 1) * pitch, BW / 2 + (Math.floor(b / 3) - 1) * pitch, z1));
        d.setAttribute("rx", String(rr)); d.setAttribute("ry", String(r2(rr * C.k)));
        d.setAttribute("class", b < n ? (isHot ? "dot" : "dot m") : "dot off");
      });
    });
    draw.sort((a, b) => a.key - b.key);
    const sig = draw.map((d) => d.id).join();
    if (sig !== order) { order = sig; draw.forEach((d) => layer.appendChild(d.g)); }

    const off = (((clock * SPEED * L) % 20) + 20) % 20, sl = [];
    for (let x = off; x < L; x += 20) if (x > 4 && x < L - 4) sl.push(seg(P(x, 4, BT), P(x, BW - 4, BT)));
    slats.setAttribute("d", sl.join(""));
    if (name !== shown) { shown = name; read.textContent = name; }
    // Under reduced motion at rest the belt is stopped: sleep until input wakes it.
    if (reducedMotion() && !over && rate.x === 0) return moving;
    return true;
  });
  bag.add(B.unregister);
  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], BT); rate.t = slow; B.wake(); },
    leave: () => { over = null; B.wake(); },
  }));
  bag.add(() => svg.replaceChildren());
  return { set: (v) => { slow = v; if (over) rate.t = v; B.wake(); }, destroy: bag.dispose };
}

hairline({
  name: "belt",
  means: "Apps ride a belt from the store, through a gate, into your node; hovering slows it so you can read the crate under the pointer.",
  rules: [1, 4, 6, 7],
  range: [0.6, 0.2, 0.05],
  tour: [[150, 130], [205, 160], [250, 190], null],
  mount,
});
