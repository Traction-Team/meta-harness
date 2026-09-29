'use strict';
/* Section backgrounds. See assets/backgrounds.css.
   Each .bg-wrap[data-bg] gets its .bg-layer populated by the matching builder. */
(() => {
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
  function rng(seed) { // deterministic so layouts don't change on resize
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  // Canvas with DPR cap, resize, and a loop that pauses offscreen / in background tabs.
  function canvasLoop(host, wrap, draw, { fps = 30 } = {}) {
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
    return { onResize(fn) { onResize = fn; fn(state); } };
  }
  // Cursor parallax: calls fn(dx, dy) with values in [-1, 1].
  function parallax(wrap, fn) {
    if (reduced.matches || !matchMedia('(hover: hover)').matches) return;
    wrap.addEventListener('pointermove', e => {
      const r = wrap.getBoundingClientRect();
      fn(((e.clientX - r.left) / r.width - .5) * 2, ((e.clientY - r.top) / r.height - .5) * 2);
    });
    wrap.addEventListener('pointerleave', () => fn(0, 0));
  }

  /* ------------------------------------------------------------ Blueprint (hero) */
  function blueprint(host, wrap) {
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
      return svgEl('circle', { cx: x, cy: y, r, style: `--i:${i}` }, `bp-node bp-in ${cls}`);
    };

    // Explode guides (behind everything).
    i = 0;
    for (const [a, b] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) path(line(P(CY[0], a, b), P(CY[2], a, b)), 'faint dash');
    // Height dimension, tucked against the stack.
    i = 1;
    const [dx0] = P(CY[0], -1, -1);
    path(`M${dx0 - 22},${CY[0]}V${CY[2]}M${dx0 - 27},${CY[0]}H${dx0 - 17}M${dx0 - 27},${CY[2]}H${dx0 - 17}`, 'dim');

    const labels = ['01 — LAYOUT', '02 — LIVE', '03 — ARTIFACTS'];
    CY.forEach((cy, li) => {
      i = 2 + li;
      const g = svgEl('g', { style: `--i:${li}` }, 'bp-layer');
      svg.appendChild(g);
      g.appendChild(svgEl('path', { d: rhombus(cy), style: `--i:${i}` }, `bp-fill bp-in${li === 0 ? ' top' : ''}`));
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
    text(176, 523.5, 'FIG. 01 — LAYOUT STACK', 'faint');
    text(616, 523.5, 'SCALE 1:1 · REV v57', 'faint', 'end');
    host.appendChild(svg);
    host.appendChild(el('div', 'bg-fade'));
    parallax(wrap, (dx, dy) => { svg.style.transform = `translate(${(dx * 10).toFixed(1)}px,${(dy * 7).toFixed(1)}px)`; });
  }

  /* ------------------------------------------------------------ Pipeline (define your system) */
  // Orthogonal wires run left to right across the section on the same 32px grid as the
  // product canvas, carrying pulses of work between stations. Wires end in a terminal
  // that flashes when a pulse arrives.
  function pipeline(host, wrap) {
    host.append(el('div', 'pl-dots'), el('div', 'pl-glow'));
    const G = 32; let routes = [], pulses = [];
    const build = ({ w, h }) => {
      routes = []; pulses = [];
      const r = rng(11);
      const cols = Math.ceil(w / G), rows = Math.ceil(h / G);
      const ox = Math.max(48, w / 2 - 600) % G + 16; // align to the content column like the dots
      const n = Math.max(6, Math.min(16, Math.round(rows * 1.1)));
      for (let k = 0; k < n; k++) {
        let x = -1 - Math.floor(r() * 6), y = 1 + Math.floor(((k + r() * .8) / n) * (rows - 2));
        const pts = [[x, y]];
        const end = cols + 1 - Math.floor(r() * 4) * (r() < .35 ? 1 : 0); // a few end on-screen
        for (;;) {
          const nx = x + 3 + Math.floor(r() * 9);
          if (nx >= end) { pts.push([end, y]); break; }
          x = nx; pts.push([x, y]);
          const dy = (r() < .5 ? -1 : 1) * (1 + Math.floor(r() * 4));
          y = Math.max(1, Math.min(rows - 2, y + dy)); pts.push([x, y]);
        }
        const px = pts.map(([a, b]) => [a * G + ox, b * G + 16]);
        const segs = []; let len = 0;
        for (let s = 0; s < px.length - 1; s++) { const d = Math.hypot(px[s + 1][0] - px[s][0], px[s + 1][1] - px[s][1]); segs.push(d); len += d; }
        const color = r() < .16 ? OK : r() < .42 ? ACCENT : WHITE;
        routes.push({ px, segs, len, stations: pts.slice(1, -1).filter(() => r() < .2).map(p => [p[0] * G + ox, p[1] * G + 16]), hit: 0, onscreen: end < cols + 1 });
        const count = 1 + (r() < .35 ? 1 : 0);
        for (let c = 0; c < count; c++) pulses.push({ route: routes.length - 1, pos: r() * len, speed: 55 + r() * 70, color, wait: 0 });
      }
    };
    const at = (rt, d) => {
      let s = 0;
      while (s < rt.segs.length - 1 && d > rt.segs[s]) { d -= rt.segs[s]; s++; }
      const [x0, y0] = rt.px[s], [x1, y1] = rt.px[s + 1], t = Math.max(0, Math.min(1, d / rt.segs[s]));
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    };
    const loop = canvasLoop(host, wrap, (ctx, st, dt) => {
      const { w, h } = st;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      // Wires.
      ctx.strokeStyle = `rgba(${WHITE},.10)`;
      ctx.beginPath();
      for (const rt of routes) { ctx.moveTo(rt.px[0][0], rt.px[0][1]); for (let k = 1; k < rt.px.length; k++) ctx.lineTo(rt.px[k][0], rt.px[k][1]); }
      ctx.stroke();
      // Bends.
      ctx.fillStyle = `rgba(${WHITE},.16)`;
      for (const rt of routes) for (let k = 1; k < rt.px.length - 1; k++) { ctx.beginPath(); ctx.arc(rt.px[k][0], rt.px[k][1], 1.4, 0, 7); ctx.fill(); }
      // Stations + terminals (terminals flash briefly when a pulse arrives).
      ctx.fillStyle = '#0b0c0d';
      for (const rt of routes) {
        ctx.strokeStyle = `rgba(${WHITE},.22)`;
        for (const [x, y] of rt.stations) { ctx.beginPath(); ctx.rect(x - 3.5, y - 3.5, 7, 7); ctx.fill(); ctx.stroke(); }
        rt.hit = Math.max(0, rt.hit - dt * 1.6);
        if (!rt.onscreen) continue;
        const [tx, ty] = rt.px[rt.px.length - 1];
        ctx.strokeStyle = `rgba(${WHITE},${(.3 + rt.hit * .6).toFixed(3)})`;
        ctx.beginPath(); ctx.rect(tx - 4, ty - 4, 8, 8); ctx.fill(); ctx.stroke();
        if (rt.hit > 0) { ctx.fillStyle = `rgba(${WHITE},${(rt.hit * .7).toFixed(3)})`; ctx.beginPath(); ctx.rect(tx - 2, ty - 2, 4, 4); ctx.fill(); ctx.fillStyle = '#0b0c0d'; }
      }
      // Pulses with tails.
      for (const p of pulses) {
        const rt = routes[p.route];
        if (p.wait > 0) { p.wait -= dt; continue; }
        p.pos += p.speed * dt;
        if (p.pos >= rt.len) { rt.hit = 1; p.pos = 0; p.wait = rt.onscreen ? 1 + Math.random() * 3 : Math.random(); continue; }
        const TAIL = 70, steps = 14;
        ctx.lineWidth = 1.5;
        for (let s = 0; s < steps; s++) {
          const d0 = p.pos - (TAIL / steps) * (s + 1), d1 = p.pos - (TAIL / steps) * s;
          if (d1 <= 0) break;
          const a = at(rt, Math.max(0, d0)), b = at(rt, d1);
          ctx.strokeStyle = `rgba(${p.color},${(.75 * (1 - s / steps) ** 1.6).toFixed(3)})`;
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
    host.appendChild(el('div', 'bg-fade'));
  }

  /* ------------------------------------------------------------ mount */
  const builders = { blueprint, pipeline };
  for (const wrap of document.querySelectorAll('.bg-wrap[data-bg]')) {
    const host = wrap.querySelector(':scope > .bg-layer');
    const build = builders[wrap.dataset.bg];
    if (host && build) build(host, wrap);
  }
})();
