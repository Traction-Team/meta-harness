'use strict';
/* Hero background variants. See assets/hero-bg.css.
   Pick with [data-bg] on .hero-wrap, ?bg=… in the URL, or the dev switcher. */
(() => {
  const wrap = document.querySelector('.hero-wrap');
  const host = wrap?.querySelector('.hero-bg');
  if (!wrap || !host) return;

  const VARIANTS = ['blueprint', 'pipeline', 'depth', 'contour'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ACCENT = '125,132,240', OK = '76,183,130', WHITE = '255,255,255';

  /* ------------------------------------------------------------ shared */
  function el(tag, cls, attrs = {}) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  function svgEl(tag, attrs = {}, cls) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (cls) n.setAttribute('class', cls);
    return n;
  }
  function rng(seed) { // deterministic so layouts don't change on re-mount
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  // Canvas with DPR cap, resize, and a paused-when-hidden loop.
  function canvasLoop(draw, { fps = 30 } = {}) {
    const canvas = el('canvas');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const state = { w: 0, h: 0, dpr: 1, t: 0 };
    let raf = 0, last = 0, visible = true, onResize = null;
    const size = () => {
      const r = host.getBoundingClientRect();
      state.dpr = Math.min(devicePixelRatio || 1, 1.5);
      state.w = Math.max(1, Math.round(r.width)); state.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      onResize?.(state);
      if (reduced.matches) draw(ctx, state, 0);
    };
    const frame = now => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(now - last, 100) / 1000 : 0;
      if (now - last >= 1000 / fps - 2) { last = now; state.t += dt; draw(ctx, state, dt); }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && !reduced.matches) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { rootMargin: '80px' });
    io.observe(wrap);
    const ro = new ResizeObserver(size); ro.observe(host);
    const onVis = () => document.hidden ? stop() : start();
    document.addEventListener('visibilitychange', onVis);
    size(); start();
    return {
      onResize(fn) { onResize = fn; fn(state); },
      destroy() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.remove(); }
    };
  }
  // Cursor parallax: calls fn(dx, dy) with values in [-1, 1].
  function parallax(fn) {
    if (reduced.matches || !matchMedia('(hover: hover)').matches) return () => {};
    const move = e => {
      const r = wrap.getBoundingClientRect();
      fn(((e.clientX - r.left) / r.width - .5) * 2, ((e.clientY - r.top) / r.height - .5) * 2);
    };
    const leave = () => fn(0, 0);
    wrap.addEventListener('pointermove', move); wrap.addEventListener('pointerleave', leave);
    return () => { wrap.removeEventListener('pointermove', move); wrap.removeEventListener('pointerleave', leave); };
  }
  function fade() { host.appendChild(el('div', 'hero-bg-fade')); }

  /* ------------------------------------------------------------ 1. Living blueprint */
  function blueprint() {
    host.append(el('div', 'bp-grid'), el('div', 'bp-glow'), el('div', 'bp-sweep'), el('i', 'bp-corner tl'), el('i', 'bp-corner tr'));
    const svg = svgEl('svg', { viewBox: '0 0 640 560' }, 'bp-schematic');
    const W = 170, H = 98, CX = 340, CY = [150, 270, 390];
    // Isometric plate coords: a,b in [-1,1] → screen.
    const P = (cy, a, b) => [CX + (a + b) * W / 2, cy + (b - a) * H / 2];
    const rhombus = (cy, s = 1, a0 = 0, b0 = 0) => {
      const pts = [P(cy, a0 + s, b0 - s), P(cy, a0 + s, b0 + s), P(cy, a0 - s, b0 + s), P(cy, a0 - s, b0 - s)];
      return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z';
    };
    const line = (p, q) => `M${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)}`;
    let i = 0;
    const path = (d, cls, parent = svg, draw = true) => {
      const p = svgEl('path', { d, pathLength: '1', style: `--i:${i}` }, `bp-stroke ${cls}${draw ? ' bp-draw' : ''}`);
      parent.appendChild(p); return p;
    };
    const text = (x, y, s, cls = '', anchor = 'start') => {
      const t = svgEl('text', { x, y, 'text-anchor': anchor, style: `--i:${i}` }, `bp-in ${cls}`);
      t.textContent = s; svg.appendChild(t); return t;
    };
    const node = (cy, a, b, cls = '', r = 2.6) => {
      const [x, y] = P(cy, a, b);
      const c = svgEl('circle', { cx: x, cy: y, r, style: `--i:${i}` }, `bp-node bp-in ${cls}`);
      return c;
    };

    // Explode guides (behind everything).
    i = 0;
    for (const [a, b] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) path(line(P(CY[0], a, b), P(CY[2], a, b)), 'faint dash');
    // Height dimension, tucked against the stack.
    i = 1;
    const [dx0] = P(CY[0], -1, -1);
    path(`M${dx0 - 22},${CY[0]}V${CY[2]}M${dx0 - 27},${CY[0]}H${dx0 - 17}M${dx0 - 27},${CY[2]}H${dx0 - 17}`, 'dim');

    const labels = ['01 — SYSTEM', '02 — FACTORY', '03 — OUTPUTS'];
    CY.forEach((cy, li) => {
      i = 2 + li;
      const g = svgEl('g', { style: `--i:${li}` }, 'bp-layer');
      svg.appendChild(g);
      const fill = svgEl('path', { d: rhombus(cy), style: `--i:${i}` }, `bp-fill bp-in${li === 0 ? ' top' : ''}`);
      g.appendChild(fill);
      path(rhombus(cy), '', g);
      path(rhombus(cy, .86), 'faint dash', g);
      if (li === 0) {
        // System: a four-node loop with programs on the wires.
        const A = [-.45, -.4], B = [.42, -.4], C = [.42, .45], D = [-.45, .45];
        for (const [n, m] of [[A, B], [B, C], [C, D], [D, A]]) path(line(P(cy, ...n), P(cy, ...m)), 'dim', g);
        const tr = path(line(P(cy, ...A), P(cy, ...B)), 'accent bp-travel', g, false);
        tr.removeAttribute('pathLength');
        for (const q of [A, B, C, D]) path(rhombus(cy, .11, ...q), '', g);
        g.append(node(cy, 0, -.4, 'on bp-pulse'), node(cy, .42, .02), node(cy, 0, .45), node(cy, -.45, .02));
      } else if (li === 1) {
        // Factory: work moving through three stations.
        for (const a of [-.5, 0, .5]) path(rhombus(cy, .14, a, .02), '', g);
        path(line(P(cy, -.36, .02), P(cy, -.14, .02)), 'dim', g);
        path(line(P(cy, .14, .02), P(cy, .36, .02)), 'dim', g);
        g.append(node(cy, 0, .02, 'on bp-pulse', 2.2), node(cy, .5, .02, 'ok', 2.2));
        path(line(P(cy, -.5, -.42), P(cy, .5, -.42)), 'faint dash', g);
      } else {
        // Outputs: a shipped surface.
        path(rhombus(cy, .5, 0, .02), '', g);
        path(line(P(cy, -.3, -.22), P(cy, .3, -.22)), 'dim', g);
        path(line(P(cy, -.3, .0), P(cy, .12, .0)), 'dim', g);
        g.append(node(cy, .3, .2, 'ok', 2.2));
      }
      // Callout leader + label.
      const [rx, ry] = P(cy, 1, 1);
      path(`M${rx + 8},${ry}H${rx + 40}`, 'dim');
      text(rx + 48, ry + 3.5, labels[li], li === 1 ? 'accent' : '');
    });
    i = 6;
    // Registration mark + drafting notes.
    path('M150,520m-9,0a9,9 0 1,0 18,0a9,9 0 1,0 -18,0M137,520H163M150,507V533', 'dim');
    text(176, 523.5, 'FIG. 01 — SYSTEM STACK', 'faint');
    text(616, 523.5, 'SCALE 1:1 · REV v57', 'faint', 'end');
    host.appendChild(svg);
    fade();
    const stop = parallax((dx, dy) => { svg.style.transform = `translate(${(dx * 10).toFixed(1)}px,${(dy * 7).toFixed(1)}px)`; });
    return { destroy: stop };
  }

  /* ------------------------------------------------------------ 2. Factory pipeline field */
  function pipeline() {
    host.append(el('div', 'pl-dots'), el('div', 'pl-glow'));
    const G = 32; let routes = [], pulses = [];
    const rand = rng(7);
    const build = ({ w, h }) => {
      routes = []; pulses = [];
      const r = rng(11);
      const cols = Math.ceil(w / G), rows = Math.ceil(h / G);
      const n = Math.max(8, Math.min(18, Math.round(cols / 3)));
      for (let k = 0; k < n; k++) {
        let x = -1 - Math.floor(r() * 6), y = 1 + Math.floor(r() * (rows - 2));
        const pts = [[x, y]];
        let len = 0;
        while (x < cols + 1) {
          x += 3 + Math.floor(r() * 9); pts.push([x, y]);
          if (x >= cols + 1) break;
          const dy = (r() < .5 ? -1 : 1) * (1 + Math.floor(r() * 4));
          y = Math.max(1, Math.min(rows - 1, y + dy)); pts.push([x, y]);
        }
        const px = pts.map(([a, b]) => [a * G + 16, b * G + 16]);
        const segs = [];
        for (let s = 0; s < px.length - 1; s++) { const d = Math.hypot(px[s + 1][0] - px[s][0], px[s + 1][1] - px[s][1]); segs.push(d); len += d; }
        const kind = r() < .16 ? OK : r() < .42 ? ACCENT : WHITE;
        routes.push({ px, segs, len, stations: pts.slice(1, -1).filter(() => r() < .2).map(p => [p[0] * G + 16, p[1] * G + 16]) });
        const count = 1 + (r() < .35 ? 1 : 0);
        for (let c = 0; c < count; c++) pulses.push({ route: routes.length - 1, pos: r() * len, speed: 55 + r() * 70, color: kind });
      }
    };
    const at = (rt, d) => {
      let s = 0;
      while (s < rt.segs.length - 1 && d > rt.segs[s]) { d -= rt.segs[s]; s++; }
      const [x0, y0] = rt.px[s], [x1, y1] = rt.px[s + 1], t = Math.max(0, Math.min(1, d / rt.segs[s]));
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    };
    const loop = canvasLoop((ctx, st, dt) => {
      const { w, h } = st;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      // Wires.
      ctx.strokeStyle = `rgba(${WHITE},.10)`;
      ctx.beginPath();
      for (const rt of routes) { ctx.moveTo(rt.px[0][0], rt.px[0][1]); for (let k = 1; k < rt.px.length; k++) ctx.lineTo(rt.px[k][0], rt.px[k][1]); }
      ctx.stroke();
      // Bends + stations.
      ctx.fillStyle = `rgba(${WHITE},.16)`;
      for (const rt of routes) for (let k = 1; k < rt.px.length - 1; k++) { ctx.beginPath(); ctx.arc(rt.px[k][0], rt.px[k][1], 1.4, 0, 7); ctx.fill(); }
      ctx.strokeStyle = `rgba(${WHITE},.22)`; ctx.fillStyle = '#0b0c0d';
      for (const rt of routes) for (const [x, y] of rt.stations) { ctx.beginPath(); ctx.rect(x - 3.5, y - 3.5, 7, 7); ctx.fill(); ctx.stroke(); }
      // Pulses with tails.
      for (const p of pulses) {
        const rt = routes[p.route];
        p.pos = (p.pos + p.speed * dt) % rt.len;
        const TAIL = 70, steps = 14;
        for (let s = 0; s < steps; s++) {
          const d0 = p.pos - (TAIL / steps) * (s + 1), d1 = p.pos - (TAIL / steps) * s;
          if (d1 <= 0) break;
          const a = at(rt, Math.max(0, d0)), b = at(rt, d1);
          ctx.strokeStyle = `rgba(${p.color},${(.75 * (1 - s / steps) ** 1.6).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        const [hx, hy] = at(rt, p.pos);
        const gl = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
        gl.addColorStop(0, `rgba(${p.color},.35)`); gl.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${p.color},1)`; ctx.beginPath(); ctx.arc(hx, hy, 1.7, 0, 7); ctx.fill();
      }
    });
    loop.onResize(build);
    fade();
    return { destroy: () => loop.destroy() };
  }

  /* ------------------------------------------------------------ 3. Layered depth grid */
  function depth() {
    const scene = el('div', 'dg-scene');
    scene.append(el('div', 'dg-horizon-glow'), el('div', 'dg-floor'), el('div', 'dg-horizon'));
    const plates = el('div', 'dg-plates');
    const spec = [
      { w: 380, x: 30, y: -120, z: -140, a: .2, d: '0s' },
      { w: 320, x: 0, y: 0, z: -20, a: .6, d: '-3.4s', accent: true },
      { w: 250, x: -30, y: 118, z: 90, a: .34, d: '-6.8s' }
    ];
    for (const s of spec) {
      const p = el('div', `dg-plate${s.accent ? ' accent' : ''}`);
      p.style.cssText = `--w:${s.w}px;--x:${s.x}px;--y:${s.y}px;--z:${s.z}px;--a:${s.a};--d:${s.d}`;
      const svg = svgEl('svg', { viewBox: '0 0 100 58' });
      svg.append(svgEl('path', { d: 'M50 0L100 29L50 58L0 29Z' }), svgEl('path', { d: 'M50 8.7L85 29L50 49.3L15 29Z' }, 'inner'));
      p.appendChild(svg); plates.appendChild(p);
    }
    scene.appendChild(plates);
    host.appendChild(scene);
    fade();
    const stop = parallax((dx, dy) => { plates.style.transform = `rotateY(${(dx * 7).toFixed(2)}deg) rotateX(${(-dy * 5).toFixed(2)}deg)`; });
    return { destroy: stop };
  }

  /* ------------------------------------------------------------ 4. Contour / signal field */
  function contour() {
    host.append(el('div', 'ct-glow'));
    // 3D value noise.
    const perm = new Uint8Array(512); { const r = rng(3); const p = [...Array(256).keys()]; for (let k = 255; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [p[k], p[j]] = [p[j], p[k]]; } for (let k = 0; k < 512; k++) perm[k] = p[k & 255]; }
    const hash = (x, y, z) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255;
    const sm = t => t * t * (3 - 2 * t), lp = (a, b, t) => a + (b - a) * t;
    const noise = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
      const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
      return lp(lp(lp(c(0, 0, 0), c(1, 0, 0), u), lp(c(0, 1, 0), c(1, 1, 0), u), v), lp(lp(c(0, 0, 1), c(1, 0, 1), u), lp(c(0, 1, 1), c(1, 1, 1), u), v), w);
    };
    const CELL = 14, LEVELS = 8, L0 = .36, L1 = .74;
    let cols = 0, rows = 0, field = new Float32Array(0);
    const SEG = [null, [3, 2], [1, 2], [3, 1], [0, 1], [0, 3, 1, 2], [0, 2], [0, 3], [0, 3], [0, 2], [0, 1, 2, 3], [0, 1], [3, 1], [1, 2], [3, 2], null];
    const loop = canvasLoop((ctx, st) => {
      const { w, h, t } = st;
      const nc = Math.ceil(w / CELL) + 1, nr = Math.ceil(h / CELL) + 1;
      if (nc !== cols || nr !== rows) { cols = nc; rows = nr; field = new Float32Array(cols * rows); }
      const s = 1 / 320, z = t * .11, drift = t * 6;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = i * CELL + drift, y = j * CELL;
        field[j * cols + i] = .58 * noise(x * s, y * s, z) + .3 * noise(x * s * 2.1 + 9, y * s * 2.1 + 4, z * 1.4 + 3) + .12 * noise(x * s * 4.3, y * s * 4.3, z * 1.9 + 7);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1; ctx.lineCap = 'round';
      const ex = (i, j, e, L) => { // edge point
        const x0 = i * CELL, y0 = j * CELL;
        const a = field[j * cols + i], b = field[j * cols + i + 1], c = field[(j + 1) * cols + i + 1], d = field[(j + 1) * cols + i];
        switch (e) {
          case 0: return [x0 + CELL * (L - a) / (b - a), y0];
          case 1: return [x0 + CELL, y0 + CELL * (L - b) / (c - b)];
          case 2: return [x0 + CELL * (L - d) / (c - d), y0 + CELL];
          default: return [x0, y0 + CELL * (L - a) / (d - a)];
        }
      };
      for (let l = 0; l < LEVELS; l++) {
        const L = L0 + (L1 - L0) * l / (LEVELS - 1), k = l / (LEVELS - 1);
        ctx.strokeStyle = k > .72 ? `rgba(${ACCENT},${(.18 + k * .32).toFixed(3)})` : `rgba(${WHITE},${(.05 + k * .13).toFixed(3)})`;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
          const idx = (field[j * cols + i] >= L) << 3 | (field[j * cols + i + 1] >= L) << 2 | (field[(j + 1) * cols + i + 1] >= L) << 1 | (field[(j + 1) * cols + i] >= L);
          const sg = SEG[idx]; if (!sg) continue;
          for (let q = 0; q < sg.length; q += 2) { const p = ex(i, j, sg[q], L), r = ex(i, j, sg[q + 1], L); ctx.moveTo(p[0], p[1]); ctx.lineTo(r[0], r[1]); }
        }
        ctx.stroke();
      }
    }, { fps: 30 });
    fade();
    return { destroy: () => loop.destroy() };
  }

  /* ------------------------------------------------------------ mount + dev switcher */
  const builders = { blueprint, pipeline, depth, contour };
  let current = null;
  function mount(name) {
    current?.destroy?.();
    host.replaceChildren();
    wrap.dataset.bg = name;
    current = builders[name]?.() || null;
    document.querySelectorAll('.hero-bg-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bg === name)));
  }
  const param = new URLSearchParams(location.search).get('bg');
  const stored = localStorage.getItem('metafab-hero-bg');
  const initial = VARIANTS.includes(param) ? param : VARIANTS.includes(stored) ? stored : wrap.dataset.bg;

  const sw = el('div', 'hero-bg-switch', { role: 'group', 'aria-label': 'Hero background variant (dev)' });
  for (const v of VARIANTS) { const b = el('button', '', { type: 'button', 'data-bg': v }); b.textContent = v; b.addEventListener('click', () => { localStorage.setItem('metafab-hero-bg', v); mount(v); }); sw.appendChild(b); }
  document.body.appendChild(sw);
  mount(VARIANTS.includes(initial) ? initial : 'blueprint');
  reduced.addEventListener?.('change', () => mount(wrap.dataset.bg));
})();
