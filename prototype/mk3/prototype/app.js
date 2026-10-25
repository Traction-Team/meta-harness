'use strict';
/* Metafab · Mark III prototype
   Single-file simulation. No build step. */

// ───────────────────────────────────────────── utils
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(k)); }
  return e;
}
function s(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(k)); }
  return e;
}
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f2 = n => n.toFixed(2);
let _uid = 0; const uid = (p = '') => p + (++_uid).toString(36);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ───────────────────────────────────────────── time
// The simulation runs fast so you can watch it. Everything shown to a person is in
// factory time: one real second is two minutes, and the line opens Monday 9:00.
const TS = 120;
const T0 = new Date(2026, 9, 5, 9, 0, 0).getTime();
const simDate = (t) => new Date(T0 + t * TS * 1000);
const clock = (t) => { const d = simDate(t); return d.toLocaleDateString('en-AU', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }); };
const hhmm = (t) => simDate(t).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
const ago = (secs) => { const x = Math.max(0, secs * TS); if (x < 60) return 'just now'; if (x < 3600) return `${Math.round(x / 60)}m ago`; if (x < 86400) return `${Math.floor(x / 3600)}h ${Math.round((x % 3600) / 60)}m ago`; return `${Math.round(x / 86400)}d ago`; };

// ───────────────────────────────────────────── constants
const W = 152, H = 66;          // station size
const SPEED = 165;              // px / s along wires
const FORM_COLOR = { request: '#aab8cc', spec: '#5ad1ff', slice: '#a78bfa', branch: '#2dd4bf', pr: '#f472b6', merged: '#4ade80', report: '#fb7185' };
const DEFECT_TITLES = [
  'Unhandled promise rejection in sync job',
  'Session not cleared on sign out',
];

// ───────────────────────────────────────────── template design
function makeDesign() {
  const programs = [
    { id: 'write-spec', name: 'Write spec', x: 330, y: 400, dur: 5, runner: 'agent',
      inputs: [{ name: 'request', type: 'request' }], outputs: [{ name: 'spec', type: 'spec' }],
      entry: { kind: 'form', label: 'form' },
      frame: { instructions: 'Turn a request into a short spec: goal, non-goals, constraints, acceptance criteria. Ask when the request leaves a decision open.', skills: ['acceptance-criteria', 'product-voice'] },
      effects: [] },
    { id: 'plan-slices', name: 'Plan slices', x: 630, y: 400, dur: 4, runner: 'agent',
      inputs: [{ name: 'spec', type: 'spec' }], outputs: [{ name: 'slice', type: 'slice', many: true }],
      frame: { instructions: 'Split the spec into 2–4 thin vertical slices. Each slice ships on its own and is testable.', skills: ['slicing'] }, effects: [] },
    { id: 'build-slice', name: 'Build slice', x: 950, y: 400, dur: 7, runner: 'agent', weak: true,
      inputs: [{ name: 'slice', type: 'slice' }], outputs: [{ name: 'branch', type: 'branch' }],
      frame: { instructions: 'Implement the slice on a new branch. Follow repo conventions. Keep the diff small.', skills: ['repo-conventions'] },
      effects: ['Creates a Git branch'] },
    { id: 'open-pr', name: 'Open PR', x: 1250, y: 400, dur: 2.5, runner: 'script',
      inputs: [{ name: 'branch', type: 'branch' }], outputs: [{ name: 'pr', type: 'pr' }],
      frame: { instructions: 'Open a PR with the slice, the spec link, and the test summary.', skills: [] }, effects: ['Opens a PR'] },
    { id: 'merge-pr', name: 'Merge PR', x: 1530, y: 400, dur: 2, runner: 'script', terminal: true,
      inputs: [{ name: 'pr', type: 'pr' }], outputs: [{ name: 'merged', type: 'merged' }],
      frame: { instructions: 'Squash-merge when checks are green.', skills: [] }, effects: ['Merges a PR'] },
    { id: 'log-bug', name: 'Log bug', x: 1530, y: 690, dur: 1.5, runner: 'agent', flip: true,
      inputs: [{ name: 'event', type: 'event' }], outputs: [{ name: 'report', type: 'report' }],
      entry: { kind: 'connection', label: 'Sentry' },
      frame: { instructions: 'Turn a Sentry event into a bug report: repro, impact, suspected area.', skills: [] }, effects: [] },
    { id: 'triage', name: 'Triage feedback', x: 1110, y: 690, dur: 3, runner: 'agent', flip: true,
      inputs: [{ name: 'report', type: 'report' }], outputs: [{ name: 'bug', type: 'request' }, { name: 'feature', type: 'request' }],
      frame: { instructions: 'Decide: bug or feature idea. Bugs become a request at the start of the workflow. Features go to the backlog.', skills: [] }, effects: [] },
  ];
  for (const p of programs) { p.version = 1; p.queue = []; p.running = []; p.runs = 0; }
  const wires = [
    { id: 'w1', from: ['write-spec', 'spec'], to: 'plan-slices', stop: { kind: 'gate', id: 'g-spec' } },
    { id: 'w2', from: ['plan-slices', 'slice'], to: 'build-slice', stop: { kind: 'bin', id: 'b-slices' } },
    { id: 'w3', from: ['build-slice', 'branch'], to: 'open-pr', stop: { kind: 'gate', id: 'g-branch' } },
    { id: 'w4', from: ['open-pr', 'pr'], to: 'merge-pr', stop: { kind: 'gate', id: 'g-merge' } },
    { id: 'w5', from: ['log-bug', 'report'], to: 'triage' },
    { id: 'w6', from: ['triage', 'bug'], to: 'write-spec', via: [[120, 680], [120, 400]] },
    { id: 'w7', from: ['triage', 'feature'], to: 'write-spec', via: [[1000, 700], [1000, 790], [80, 790], [80, 400]], stop: { kind: 'bin', id: 'b-backlog', near: [600, 790] } },
  ];
  const gates = [
    { id: 'g-spec', question: 'Is this spec clear enough to plan from?', autonomy: 'person', owner: 'Product', waiting: [], decisions: [], edits: 0 },
    { id: 'g-branch', question: 'Does the branch do what the slice says?', autonomy: 'agent', owner: 'Code owner', waiting: [], decisions: [], edits: 0 },
    { id: 'g-merge', question: 'Is this PR safe to merge?', autonomy: 'person', owner: 'Release lead', waiting: [], decisions: [], edits: 0 },
  ];
  const bins = [
    { id: 'b-slices', name: 'Slices', rule: 'group', ruleText: 'Release when all slices of one spec are planned', items: [] },
    { id: 'b-backlog', name: 'Backlog', rule: 'manual', ruleText: 'Release when a person clicks', items: [] },
  ];
  const scorers = [
    { id: 'ai-slop', name: 'AI slop', scope: 'generic', on: null, threshold: { max: 0.4 }, policy: 'flag', shown: false, version: 1 },
    { id: 'scope-creep', name: 'Scope creep', scope: 'generic', on: null, threshold: { max: 0.5 }, policy: 'flag', shown: false, version: 1 },
    { id: 'slice-size', name: 'Slice size', scope: 'specific', on: 'slice', threshold: { min: 0.5 }, policy: 'retry', shown: true, version: 1 },
    { id: 'code-reuse', name: 'Code reuse', scope: 'specific', on: 'branch', threshold: { min: 0.5 }, policy: 'flag', shown: true, version: 1 },
    { id: 'test-depth', name: 'Test depth', scope: 'specific', on: 'branch', threshold: { min: 0.6 }, policy: 'flag', check: false, shown: false, version: 1 },
  ];
  return { programs, wires, gates, bins, scorers };
}

// ───────────────────────────────────────────── metafab state
function createMetafab({ name, brief }) {
  return {
    id: uid('mf'), name, brief, version: 1, status: 'designed',
    design: makeDesign(), items: [], runs: [], questions: [], defects: [], feedback: [],
    shipped: 0, agents: [], team: null,
    sim: { now: 0, paused: false, intakeAt: 0, requestsLeft: LATER_REQUESTS.slice() },
    pendingDefects: [], counters: { req: 11, pr: 212, defect: 0, sha: 0 },
    defectsSinceMaint: 0, maintenance: null, changes: [], openedAt: Date.now(),
  };
}

const library = [
  { name: 'Traction website', brief: 'Marketing site with a CMS, a blog, and a careers page. Static where possible.', created: '2 days ago' },
  { name: 'Invoice service', brief: 'A small invoicing API and dashboard for a 3-person agency: clients, invoices, PDF export, Stripe payments.', created: 'last week' },
].map(x => ({ ...x, mf: null }));

let M = null;             // current metafab
let D = null;             // M.design
const P = id => D.programs.find(p => p.id === id);
const G = id => D.gates.find(g => g.id === id);
const B = id => D.bins.find(b => b.id === id);
const WR = id => D.wires.find(w => w.id === id);
const IT = id => M.items.find(i => i.id === id);
const SC = id => D.scorers.find(x => x.id === id);

const ui = { side: null, selection: null, hudDirty: true, sideDirty: true, attnKey: '', zoom: 1, tx: 0, ty: 0, raf: null, lastT: 0, hudT: 0, worldDim: false, editing: false, work: null };

// ───────────────────────────────────────────── agents & content lookups
const AG = id => M.agents.find(a => a.id === id);
const agentName = (id) => { const a = typeof id === 'object' ? id : AG(id); return a ? `${a.name} ${a.n}` : 'agent'; };
const sliceOf = (it) => it && it.content && it.slice != null ? it.content.slices[it.slice] : null;
const rootOf = (it) => { let c = it; while (c && c.parent) c = IT(c.parent); return c; };
const fakeSha = () => (0x9f2c1ab + (++M.counters.sha) * 7919).toString(16).slice(0, 7);

// ───────────────────────────────────────────── geometry
function portIn(p) { return p.flip ? { x: p.x + W / 2, y: p.y } : { x: p.x - W / 2, y: p.y }; }
function portOut(p, name) {
  const i = Math.max(0, p.outputs.findIndex(o => o.name === name)); const n = p.outputs.length;
  const y = p.y + (n > 1 ? (i - (n - 1) / 2) * 20 : 0);
  return p.flip ? { x: p.x - W / 2, y } : { x: p.x + W / 2, y };
}
function routePoints(wire) {
  const a = portOut(P(wire.from[0]), wire.from[1]); const b = portIn(P(wire.to));
  if (wire.via) return [a, ...wire.via.map(([x, y]) => ({ x, y })), b];
  if (Math.abs(a.y - b.y) < 1) return [a, b];
  const mx = (a.x + b.x) / 2; return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
}
function roundedPath(pts, r = 16) {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y }, v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const pa = { x: p1.x - v1.x / l1 * rr, y: p1.y - v1.y / l1 * rr };
    const pb = { x: p1.x + v2.x / l2 * rr, y: p1.y + v2.y / l2 * rr };
    d += ` L${pa.x} ${pa.y} Q${p1.x} ${p1.y} ${pb.x} ${pb.y}`;
  }
  const e = pts[pts.length - 1]; d += ` L${e.x} ${e.y}`; return d;
}
function nearestLen(path, pt) {
  const L = path.getTotalLength(); let best = 0, bd = Infinity;
  for (let i = 0; i <= 240; i++) { const l = L * i / 240; const p = path.getPointAtLength(l); const d = Math.hypot(p.x - pt[0], p.y - pt[1]); if (d < bd) { bd = d; best = l; } }
  return best;
}
function designBounds() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of D.programs) { const m = p.entry ? 130 : 30; add(p.x - W / 2 - (p.flip ? 30 : m), p.y - H / 2 - 30); add(p.x + W / 2 + (p.flip ? m : 30), p.y + H / 2 + 30); }
  for (const w of D.wires) for (const [x, y] of (w.via || [])) add(x, y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ───────────────────────────────────────────── canvas build
const svg = $('#canvas'), world = $('#world');
const L = { wires: $('#l-wires'), plugs: $('#l-plugs'), stops: $('#l-stops'), stations: $('#l-stations'), items: $('#l-items'), fx: $('#l-fx') };
const itemEls = new Map();

function buildCanvas(reveal) {
  for (const k of Object.values(L)) k.innerHTML = '';
  itemEls.clear();
  const pre = reveal ? ' pre' : '';
  // wires
  for (const w of D.wires) {
    const pts = routePoints(w); const d = roundedPath(pts);
    const g = s('g', { class: 'wire' + pre, 'data-id': w.id });
    const path = s('path', { class: 'w', d }); const live = s('path', { class: 'w-live', d });
    g.append(s('path', { class: 'hit', d }), path, live);
    // label near source
    const a = pts[0]; const flip = P(w.from[0]).flip;
    g.append(s('text', { class: 'wlab', x: a.x + (flip ? -8 : 8), y: a.y - 6, 'text-anchor': flip ? 'end' : 'start' }, w.from[1]));
    L.wires.append(g);
    w.el = path; w.len = path.getTotalLength();
    if (w.stop) {
      w.stopLen = w.stop.near ? nearestLen(path, w.stop.near) : w.len * (w.stop.at ?? 0.5);
      const p0 = path.getPointAtLength(Math.max(0, w.stopLen - 2)), p1 = path.getPointAtLength(Math.min(w.len, w.stopLen + 2));
      w.stopPt = path.getPointAtLength(w.stopLen); w.stopDir = { x: Math.sign(p1.x - p0.x) || 1, y: Math.sign(p1.y - p0.y) };
      w.stopHoriz = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y);
    }
  }
  // plugs (entry points)
  for (const p of D.programs) {
    if (!p.entry) continue;
    const pi = portIn(p); const dir = p.flip ? 1 : -1;
    const g = s('g', { class: 'plug' + pre, 'data-id': p.id, onclick: (e) => { e.stopPropagation(); onPlugClick(p); } });
    const bx = pi.x + dir * 86, by = pi.y;
    g.append(s('line', { x1: pi.x + dir * 2, y1: pi.y, x2: bx - dir * 28, y2: by }));
    g.append(s('rect', { x: bx - 28, y: by - 10, width: 56, height: 20, rx: 10 }));
    g.append(s('text', { x: bx, y: by + 3.5, 'text-anchor': 'middle' }, p.entry.kind === 'form' ? '⌨ form' : '⚡ ' + p.entry.label));
    p.plugEl = g; L.plugs.append(g);
  }
  // stops
  for (const w of D.wires) {
    if (!w.stop) continue;
    const { x, y } = w.stopPt;
    if (w.stop.kind === 'gate') {
      const gte = G(w.stop.id); gte.wireId = w.id;
      const g = s('g', { class: 'stop gate' + pre, 'data-id': gte.id, transform: `translate(${x},${y})`, onclick: (e) => { e.stopPropagation(); select('gate', gte.id); } });
      g.append(s('rect', { x: -12, y: -22, width: 24, height: 44, fill: 'transparent' }));
      if (w.stopHoriz) { g.append(s('rect', { class: 'bar', x: -8, y: -15, width: 4, height: 30, rx: 1 }), s('rect', { class: 'bar', x: 4, y: -15, width: 4, height: 30, rx: 1 })); }
      else { g.append(s('rect', { class: 'bar', x: -15, y: -8, width: 30, height: 4, rx: 1 }), s('rect', { class: 'bar', x: -15, y: 4, width: 30, height: 4, rx: 1 })); }
      g.append(s('circle', { class: 'light', r: 2.6 }));
      g.append(s('text', { class: 'glab', y: 30 }, gte.autonomy));
      const qb = s('g', { class: 'qbadge', transform: 'translate(0,-28)', opacity: 0 }, s('circle', { r: 8 }), s('text', { y: 3.5 }, '0'));
      g.append(qb); gte.el = g; L.stops.append(g);
    } else {
      const bin = B(w.stop.id); bin.wireId = w.id;
      const g = s('g', { class: 'stop bin ' + bin.rule + pre, 'data-id': bin.id, transform: `translate(${x},${y})`, onclick: (e) => { e.stopPropagation(); select('bin', bin.id); } });
      g.append(s('path', { class: 'box', d: 'M-22 -13 L-22 13 L22 13 L22 -13' }));
      g.append(s('text', { class: 'count', y: 7 }, '0'));
      g.append(s('text', { class: 'glab', y: 30 }, `${bin.name} · ${bin.rule}`));
      bin.el = g; L.stops.append(g);
    }
  }
  // stations
  for (const p of D.programs) {
    const g = s('g', { class: 'station' + pre, 'data-id': p.id, transform: `translate(${p.x - W / 2},${p.y - H / 2})`, onclick: (e) => { e.stopPropagation(); select('program', p.id); } });
    g.append(s('rect', { class: 'body', width: W, height: H, rx: 9 }));
    g.append(s('text', { class: 'name', x: 12, y: 22 }, p.name));
    g.append(s('text', { class: 'meta', x: 12, y: 40 }, 'idle'));
    g.append(s('text', { class: 'runner', x: W - 12, y: 22, 'text-anchor': 'end' }, p.runner));
    g.append(s('text', { class: 'ver', x: W - 12, y: 40, 'text-anchor': 'end' }, 'v' + p.version));
    g.append(s('rect', { class: 'prog-bg', x: 12, y: H - 12, width: W - 24, height: 3, rx: 1.5 }));
    g.append(s('rect', { class: 'prog', x: 12, y: H - 12, width: 0, height: 3, rx: 1.5 }));
    const pi = portIn(p); const open = !D.wires.some(w => w.to === p.id);
    g.append(s('circle', { class: 'port' + (open || p.entry ? ' open' : ''), cx: pi.x - (p.x - W / 2), cy: pi.y - (p.y - H / 2), r: 4 }));
    for (const o of p.outputs) { const po = portOut(p, o.name); g.append(s('circle', { class: 'port', cx: po.x - (p.x - W / 2), cy: po.y - (p.y - H / 2), r: 4 })); }
    p.el = g; L.stations.append(g);
  }
}

function fitView() {
  // keep the line clear of the HUD: left column (inbox + agents), side pane, top bar, command bar
  const b = designBounds(); const sideOpen = ui.side && !$('#side').classList.contains('hidden');
  const L0 = 372, R0 = sideOpen ? $('#side').offsetWidth + 32 : 24, T0 = 84, B0 = 100;
  const vw = innerWidth - L0 - R0, vh = innerHeight - T0 - B0;
  const z = clamp(Math.min(vw / b.w, vh / b.h), .4, 1.4);
  ui.zoom = z; ui.tx = L0 + (vw - b.w * z) / 2 - b.x * z; ui.ty = T0 + (vh - b.h * z) / 2 - b.y * z;
  applyView();
}
function applyView() { world.setAttribute('transform', `translate(${ui.tx},${ui.ty}) scale(${ui.zoom})`); $('#grid-bg').setAttribute('transform', `translate(${ui.tx % (28 * ui.zoom)},${ui.ty % (28 * ui.zoom)}) scale(${ui.zoom})`); }

// pan & zoom
(() => {
  let drag = null;
  // Capture the pointer only once a real drag starts. Capturing on pointerdown retargets the
  // click to <svg>, so clicks on programs, gates, bins and artifacts never fired.
  svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, tx: ui.tx, ty: ui.ty, moved: false, pid: e.pointerId, bg: e.target === svg || e.target.id === 'grid-bg' }; });
  svg.addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) { if (Math.hypot(dx, dy) <= 3) return; drag.moved = true; svg.classList.add('panning'); try { svg.setPointerCapture(drag.pid); } catch {} }
    ui.tx = drag.tx + dx; ui.ty = drag.ty + dy; applyView();
  });
  const endDrag = () => { if (drag && !drag.moved && drag.bg) select(null); drag = null; svg.classList.remove('panning'); };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', () => { drag = null; svg.classList.remove('panning'); });
  svg.addEventListener('wheel', e => { e.preventDefault(); const k = Math.exp(-e.deltaY * 0.0015); const z = clamp(ui.zoom * k, .3, 2.5); const r = z / ui.zoom; ui.tx = e.clientX - (e.clientX - ui.tx) * r; ui.ty = e.clientY - (e.clientY - ui.ty) * r; ui.zoom = z; applyView(); }, { passive: false });
  addEventListener('resize', () => { if (M) fitView(); });
})();

// ───────────────────────────────────────────── items
function newItem({ form, title, parent = null, origin = null, content = null, slice = null }) {
  const id = parent ? `${parent.id}${String.fromCharCode(97 + parent.children.length)}` : (form === 'report' ? `BUG-${++M.counters.defect}` : `IS-${++M.counters.req}`);
  const it = { id, form, title, parent: parent?.id || null, children: [], marks: [], history: [], loc: null, pos: { x: 0, y: 0 }, flags: {}, sendbacks: 0, retries: 0, version: M.version, draining: false, origin, cleared: {}, bornAt: M.sim.now, root: parent ? parent.root : null, expectedChildren: 0,
    content: content || parent?.content || null, slice, reviews: [], answers: {}, specText: null, specEdited: false };
  if (!it.root) it.root = id;
  if (parent) { parent.children.push(id); it.history = parent.history.map(x => ({ ...x, inherited: true })); it.marks = parent.marks.slice(); }
  M.items.push(it);
  makeItemEl(it);
  return it;
}
// Artifacts move, so a normal click often lands on empty canvas. Select on pointerdown and
// give the ball a larger invisible hit area. Clicking an artifact opens its workspace.
function makeItemEl(it) {
  const id = it.id;
  const pick = (e) => { if (e.button !== 0) return; e.stopPropagation(); openWork(id); };
  const g = s('g', { class: 'item', 'data-id': id, onpointerdown: pick, onclick: (e) => e.stopPropagation() });
  g.append(s('circle', { class: 'hit', r: 16 }), s('circle', { class: 'halo', r: 11 }), s('circle', { class: 'ball', r: 6.5, fill: FORM_COLOR[it.form] }), s('text', { class: 'tag', y: 24 }), s('text', { class: 'idlab', y: -15 }, id));
  g.append(s('title', {}, `${id} · ${it.title}`));
  L.items.append(g); itemEls.set(id, g); drawMarks(it);
  return g;
}
// The ball says three things only: what form the work is in, whether it is held, and
// whether it is waiting on a person. Scores live in the workspace, not on the canvas.
function drawMarks(it) {
  const g = itemEls.get(it.id); if (!g) return;
  g.querySelector('.ball').setAttribute('fill', FORM_COLOR[it.form] || '#fff');
  g.classList.toggle('held', !!it.flags.hold);
  g.classList.toggle('draining', !!it.draining);
  g.querySelector('.tag').textContent = it.draining ? 'v' + it.version : '';
  g.querySelector('title').textContent = `${it.id} · ${it.title}`;
}
function removeItemEl(id) { const g = itemEls.get(id); if (g) g.remove(); itemEls.delete(id); }

function spawnRequest(content, origin = null) {
  if (typeof content === 'string') content = REQUESTS.find(r => r.key === content) || genericRequest(content);
  const it = newItem({ form: 'request', title: content.title, origin, content });
  it.history.push({ kind: 'enter', program: 'write-spec', via: origin ? 'Triage feedback' : 'form', at: M.sim.now });
  const p = P('write-spec'); it.pos = { ...portIn(p) }; enqueue(it, p);
  touch(); return it;
}
function spawnBugEvent(defect) {
  const p = P('log-bug'); const it = newItem({ form: 'report', title: defect.title, origin: defect.id }); it.defect = defect;
  it.history.push({ kind: 'enter', program: 'log-bug', via: 'Sentry', at: M.sim.now });
  it.pos = { ...portIn(p) }; enqueue(it, p);
  if (p.plugEl) { p.plugEl.classList.add('flash'); setTimeout(() => p.plugEl.classList.remove('flash'), 900); }
  const pi = portIn(p); L.fx.append(s('circle', { class: 'pulse', cx: pi.x + 86, cy: pi.y, r: 6 }));
  setTimeout(() => L.fx.querySelector('.pulse')?.remove(), 1700);
  touch();
}

// ───────────────────────────────────────────── program runs
function enqueue(it, p) { it.loc = { kind: 'queue', program: p.id }; p.queue.push(it.id); it.history.push({ kind: 'queue', program: p.id, at: M.sim.now }); }
function freeAgent() { return M.agents.find(a => !a.busy); }
function startRun(p) {
  const a = freeAgent(); if (!a) return false;
  const id = p.queue.shift(); const it = IT(id);
  const run = { id: uid('r'), program: p.id, item: id, version: p.version, agent: a.id, startedAt: M.sim.now, dur: p.dur * rand(.8, 1.3), scores: null, verdict: null, cost: 0, extras: [] };
  // When the frame leaves a decision open, the agent stops and asks instead of guessing.
  const c = it.content, sl = sliceOf(it);
  if (p.id === 'write-spec' && c?.ask && !it.answers.spec) run.ask = { ...c.ask, key: 'spec', at: .45 };
  if (p.id === 'build-slice' && sl?.ask && !it.answers.build) run.ask = { ...sl.ask, key: 'build', at: .32 };
  const sb = [...it.history].reverse().find(x => x.kind === 'gate' && x.decision === 'sendback' && !x.inherited && !x.used);
  if (sb) { run.sentBack = sb.reason; sb.used = true; }
  M.runs.push(run); a.busy = run.id; p.running.push(run.id); p.runs++;
  it.loc = { kind: 'run', program: p.id, run: run.id, t: 0 };
  it.history.push({ kind: 'run-start', program: p.id, run: run.id, version: p.version, agent: a.id, at: M.sim.now });
  touch(); return true;
}
function finishRun(run) {
  const p = P(run.program); const it = IT(run.item); const a = M.agents.find(x => x.id === run.agent);
  if (a) a.busy = null; p.running = p.running.filter(x => x !== run.id);
  run.endedAt = M.sim.now; run.cost = +(run.dur * (p.runner === 'script' ? rand(.005, .01) : rand(.3, .5))).toFixed(2);
  // output form. Triage sends every defect back to the start as a Fix request.
  const outName = p.id === 'triage' ? (it.defect ? 'bug' : 'feature') : p.outputs[0].name;
  const outType = p.outputs.find(o => o.name === outName).type;
  // scoring
  const sc = scoreOutput(p, outType, run, it);
  run.scores = sc.scores; run.verdict = sc.verdict; run.output = outName;
  if (p.id === 'build-slice') { run.sha = fakeSha(); run.strong = !p.weak || !sliceOf(it)?.weakTests; }
  it.history.push({ kind: 'run-end', program: p.id, run: run.id, version: run.version, verdict: sc.verdict, scores: sc.scores, at: M.sim.now, cost: run.cost });
  // retry policy
  const retryHit = sc.scores.find(x => !x.ok && x.policy === 'retry');
  if (retryHit && !run.retried) { it.retries++; const r2 = { ...run, id: uid('r'), retried: true, retryOf: run.id, retryReason: `${retryHit.name} ${f2(retryHit.value)}: ${retryHit.reason}`, startedAt: M.sim.now, dur: p.dur * rand(.6, .9), endedAt: undefined, cost: 0, scores: null, verdict: null, output: undefined, ask: null, extras: [] }; M.runs.push(r2); const ag = freeAgent() || a; if (ag) { ag.busy = r2.id; r2.agent = ag.id; } p.running.push(r2.id); it.loc = { kind: 'run', program: p.id, run: r2.id, t: 0 }; it.history.push({ kind: 'retry', program: p.id, reason: `${retryHit.name} ${f2(retryHit.value)}`, at: M.sim.now }); touch(); return; }
  it.marks.push({ kind: 'run', program: p.id, verdict: sc.verdict, run: run.id });
  if (sc.scores.some(x => !x.ok && x.policy === 'hold')) { it.flags.hold = true; it.flags.holdBy = sc.scores.find(x => !x.ok && x.policy === 'hold'); }
  it.version = run.version;
  // terminal
  if (p.terminal) {
    it.form = 'merged'; it.loc = { kind: 'done' }; M.shipped++; it.mergeSha = fakeSha(); it.history.push({ kind: 'shipped', at: M.sim.now, pr: it.pr });
    removeItemEl(it.id); scheduleDefect(it); touch(); return;
  }
  // transition
  if (p.id === 'plan-slices') {
    const slices = it.content.slices; const n = slices.length; it.expectedChildren = n;
    const wire = D.wires.find(w => w.from[0] === p.id);
    for (let i = 0; i < n; i++) { const ch = newItem({ form: 'slice', title: slices[i].title, parent: it, slice: i }); ch.marks = it.marks.slice(); ch.history.push({ kind: 'split', from: it.id, at: M.sim.now }); ch.pos = { ...portOut(p, 'slice') }; ch.loc = { kind: 'wire', wire: wire.id, d: -i * 16 }; ch.version = run.version; drawMarks(ch); }
    it.loc = { kind: 'parent' }; it.form = 'spec'; removeItemEl(it.id); touch(); return;
  }
  if (p.id === 'triage') {
    // loops back as a new request; it keeps the item it came from
    const content = it.defect ? fixRequest(it.defect) : genericRequest('Idea: ' + it.title);
    const nx = newItem({ form: 'request', title: content.title, origin: it.id, content }); nx.history.push({ kind: 'enter', program: 'write-spec', via: `Triage feedback · ${outName}`, from: it.id, at: M.sim.now });
    nx.traced = it.traced; nx.marks = []; drawMarks(nx);
    const wire = D.wires.find(w => w.from[0] === p.id && w.from[1] === outName);
    nx.pos = { ...portOut(p, outName) }; nx.loc = { kind: 'wire', wire: wire.id, d: 0 };
    it.loc = { kind: 'done' }; removeItemEl(it.id); touch(); return;
  }
  it.form = outType; if (p.id === 'open-pr') it.pr = ++M.counters.pr;
  const wire = D.wires.find(w => w.from[0] === p.id && w.from[1] === outName);
  it.pos = { ...portOut(p, outName) }; it.loc = { kind: 'wire', wire: wire.id, d: 0 };
  drawMarks(it); touch();
}
function scoreOutput(p, outType, run, it) {
  const scores = [];
  for (const sc of D.scorers) {
    if (sc.on && sc.on !== outType) continue;
    let v, reason = '';
    if (sc.id === 'test-depth') {
      // Deterministic from the content: a weak Build slice skips the error-path tests.
      const sl = sliceOf(it); const skipped = sl ? sl.tests.filter(t => t.err) : [];
      const weak = p.weak && sl?.weakTests && skipped.length;
      v = weak ? rand(.28, .5) : rand(.72, .93);
      reason = weak ? `no test for: ${skipped.map(t => t.n).join('; ')}` : `one test per criterion, including ${skipped.length || 'the'} error path${skipped.length === 1 ? '' : 's'}`;
    } else if (sc.id === 'ai-slop') { v = rand(.08, .44); reason = v > .4 ? 'restates the request in the goal; two hedging phrases' : 'direct, no filler'; }
    else if (sc.id === 'scope-creep') { v = rand(.05, .5); reason = v > .5 ? 'adds behaviour that is not in the spec' : 'stays inside the spec'; }
    else if (sc.id === 'slice-size') { v = rand(.55, .97); reason = 'one subsystem each, under a day'; }
    else if (sc.id === 'code-reuse') { v = rand(.52, .92); reason = 'uses the existing helpers in src/lib'; }
    else { v = rand(.5, .95); }
    const ok = sc.threshold.min != null ? v >= sc.threshold.min : v <= sc.threshold.max;
    scores.push({ id: sc.id, name: sc.name, value: +v.toFixed(2), ok, reason, policy: sc.policy, check: !!sc.check, version: sc.version });
  }
  const failed = scores.some(x => !x.ok && x.check); const missed = scores.some(x => !x.ok);
  return { scores, verdict: failed ? 'failed' : missed ? 'scored' : 'passed' };
}

// ───────────────────────────────────────────── gates & bins
function enterStop(it, w) {
  if (w.stop.kind === 'gate') {
    const g = G(w.stop.id); it.loc = { kind: 'gate', gate: g.id, wire: w.id }; g.waiting.push(it.id);
    it.history.push({ kind: 'gate-wait', gate: g.id, at: M.sim.now });
    let mode = g.autonomy; const held = !!it.flags.hold;
    if (held) mode = 'person';
    if (mode === 'off') return clearGate(it, g, { decision: 'approve', by: 'off' });
    if (mode === 'sampled') { if (Math.random() < .35) mode = 'person'; else return clearGate(it, g, { decision: 'approve', by: 'sampled' }); }
    if (mode === 'agent') { it.decideStart = M.sim.now; it.decideAt = M.sim.now + rand(2.6, 4); touch(); return; }
    askQuestion(g, it, held ? 'held' : null);
  } else {
    const b = B(w.stop.id); it.loc = { kind: 'bin', bin: b.id, wire: w.id }; b.items.push(it.id);
    it.history.push({ kind: 'bin', bin: b.id, at: M.sim.now });
    if (b.rule === 'group') tryReleaseGroup(b);
    touch();
  }
}
function tryReleaseGroup(b) {
  // release when all children of a parent are in the bin
  const byParent = {};
  for (const id of b.items) { const it = IT(id); (byParent[it.parent] ||= []).push(id); }
  for (const [pid, ids] of Object.entries(byParent)) {
    const parent = IT(pid); if (!parent) continue;
    const done = ids.length >= parent.expectedChildren;
    if (done) ids.forEach((id, i) => releaseFromBin(b, id, i));
  }
}
function releaseFromBin(b, id, stagger = 0) {
  const it = IT(id); b.items = b.items.filter(x => x !== id); const w = WR(b.wireId);
  it.cleared[w.id] = true; it.loc = { kind: 'wire', wire: w.id, d: w.stopLen - stagger * 16 };
  it.history.push({ kind: 'release', bin: b.id, at: M.sim.now }); touch();
}
const ESCALATIONS = [
  'The branch changes `parseListFilters()`, which two other routes call. I cannot tell from the slice whether that is intended.',
  'The tests pass, but the slice says "dated filename" and I cannot find a test for the date format.',
  'Behaviour matches the slice, but the error message differs from the wording in the spec.',
];
function askQuestion(g, it, reason, note) {
  const q = { id: uid('q'), kind: 'gate', gate: g.id, item: it.id, reason, at: M.sim.now, agentNote: reason === 'escalated' ? (note || pick(ESCALATIONS)) : null };
  M.questions.push(q); it.questionId = q.id; touch();
}
function answerQuestion(q, decision, edit) {
  const g = G(q.gate); const it = IT(q.item); M.questions = M.questions.filter(x => x !== q); it.questionId = null;
  if (it && it.loc.kind === 'gate') {
    if (decision === 'sendback') sendBack(it, g, edit || 'Sent back by ' + g.owner);
    else { if (decision === 'edited') { M.feedback.push({ gate: g.id, item: it.id, at: M.sim.now, edit }); g.edits++; } it.flags.hold = false; clearGate(it, g, { decision, by: 'person' }); }
  }
  touch();
}
// An agent asked a question in the middle of a run. The run waits; the agent stays on it.
function answerAsk(q, answer) {
  const run = M.runs.find(r => r.id === q.run); const it = IT(q.item);
  M.questions = M.questions.filter(x => x !== q);
  if (run && run.ask) { run.ask.answer = answer; run.ask.answeredAt = M.sim.now; it.answers[run.ask.key] = answer; }
  touch();
}
function clearGate(it, g, { decision, by }) {
  g.waiting = g.waiting.filter(x => x !== it.id); g.decisions.push({ decision, by, item: it.id, at: M.sim.now });
  it.marks.push({ kind: 'gate', gate: g.id, decision, by }); it.history.push({ kind: 'gate', gate: g.id, decision, by, at: M.sim.now });
  const w = WR(g.wireId); it.cleared[w.id] = true; it.loc = { kind: 'wire', wire: w.id, d: w.stopLen }; it.decideAt = null;
  drawMarks(it); touch();
}
function sendBack(it, g, reason) {
  g.waiting = g.waiting.filter(x => x !== it.id); g.decisions.push({ decision: 'sendback', by: 'person', item: it.id, at: M.sim.now });
  const w = WR(g.wireId); const p = P(w.from[0]); it.sendbacks++;
  it.marks.push({ kind: 'gate', gate: g.id, decision: 'sendback' }); it.history.push({ kind: 'gate', gate: g.id, decision: 'sendback', reason, at: M.sim.now });
  it.flags.hold = false; it.form = p.inputs[0].type; it.pos = { ...portIn(p) }; enqueue(it, p); drawMarks(it); touch();
}
function agentDecide(it) {
  const g = G(it.loc.gate); const r = Math.random(); const start = it.decideStart; it.decideAt = null;
  const rv = { id: uid('rv'), gate: g.id, start, end: M.sim.now, version: M.version };
  it.reviews.push(rv);
  if (r < .74) { rv.decision = 'approve'; return clearGate(it, g, { decision: 'approve', by: 'agent' }); }
  if (r < .84) { const sl = sliceOf(it); rv.decision = 'sendback'; rv.note = sl ? `Criterion ${sl.criteria[sl.criteria.length - 1]} in the spec has no test on this branch.` : 'The branch does not cover every acceptance criterion.'; return sendBack(it, g, 'Reviewer agent: ' + rv.note); }
  rv.decision = 'escalated'; rv.note = pick(ESCALATIONS);
  askQuestion(g, it, 'escalated', rv.note);
}

// ───────────────────────────────────────────── defects (lagging)
function scheduleDefect(it) {
  const bs = [...it.history].reverse().find(x => x.kind === 'run-end' && x.program === 'build-slice');
  const td = bs?.scores?.find(x => x.id === 'test-depth');
  const low = td && td.value < .6; const sl = sliceOf(it);
  const pr = low ? (sl?.defect ? .85 : .25) : .04;
  if (Math.random() < pr) M.pendingDefects.push({ at: M.sim.now + rand(8, 16), item: it.id, run: bs?.run, td: td?.value });
}
function raiseDefect(pd) {
  const it = IT(pd.item); const run = M.runs.find(r => r.id === pd.run); const sl = sliceOf(it);
  const usedAlready = M.defects.some(x => x.content && x.content === sl?.defect);
  const content = pd.td != null && pd.td < .6 && sl?.defect && !usedAlready ? sl.defect : null;
  const d = { id: 'DEF-' + (M.defects.length + 1), title: content ? content.title : pick(DEFECT_TITLES), content, item: it.id, run: run?.id, program: 'build-slice', version: run?.version || 1, td: pd.td, at: M.sim.now, sha: it.mergeSha, prTitle: `${it.title} (#${it.pr})` };
  M.defects.push(d); M.defectsSinceMaint++;
  spawnBugEvent(d);
  const nx = M.items[M.items.length - 1]; nx.traced = d.id;
  touch();
}

// ───────────────────────────────────────────── sim tick
function tick(dt) {
  if (!M || M.status !== 'running' || M.sim.paused) return;
  const sim = M.sim; sim.now += dt;
  // intake
  if (sim.requestsLeft.length && sim.now >= sim.intakeAt) { spawnRequest(sim.requestsLeft.shift()); sim.intakeAt = sim.now + rand(40, 60); }
  // defects
  for (const pd of M.pendingDefects.slice()) if (sim.now >= pd.at) { M.pendingDefects.splice(M.pendingDefects.indexOf(pd), 1); raiseDefect(pd); }
  // items
  for (const it of M.items) {
    const l = it.loc; if (!l) continue;
    if (l.kind === 'wire') {
      const w = WR(l.wire); l.d += SPEED * dt;
      if (w.stop && !it.cleared[w.id] && l.d >= w.stopLen) { l.d = w.stopLen; enterStop(it, w); continue; }
      if (l.d >= w.len) { const p = P(w.to); it.pos = { ...portIn(p) }; enqueue(it, p); touch(); }
    } else if (l.kind === 'run') {
      const run = M.runs.find(r => r.id === l.run);
      if (run.ask && !run.ask.answer && l.t >= run.ask.at) {
        // the agent has asked; the run holds here until a person answers
        l.t = run.ask.at;
        if (!run.ask.qid) { const q = { id: uid('q'), kind: 'ask', item: it.id, run: run.id, program: run.program, agent: run.agent, at: sim.now }; run.ask.qid = q.id; run.ask.askedAt = sim.now; M.questions.push(q); touch(); }
        continue;
      }
      l.t += dt / run.dur; if (l.t >= 1) finishRun(run);
    } else if (l.kind === 'gate') {
      if (it.decideAt && sim.now >= it.decideAt) agentDecide(it);
    } else if (l.kind === 'rewind') {
      l.t += dt / l.dur; if (l.t >= 1) { const p = P(l.program); it.pos = { ...portIn(p) }; enqueue(it, p); it.rewindTrail?.remove(); touch(); }
    }
  }
  // start runs
  for (const p of D.programs) { if (p.paused) continue; while (p.queue.length && freeAgent()) { if (!startRun(p)) break; } }
}

// ───────────────────────────────────────────── render (per frame)
function renderFrame() {
  if (!M) return;
  const now = M.sim.now;
  // station state
  for (const p of D.programs) {
    const g = p.el; if (!g) continue;
    const running = p.running.length > 0; g.classList.toggle('running', running);
    const run = running ? M.runs.find(r => r.id === p.running[0]) : null; const it = run ? IT(run.item) : null;
    const asking = running && run.ask && run.ask.qid && !run.ask.answer;
    const meta = running ? (asking ? `${AG(run.agent)?.short} · asking you` : `${AG(run.agent)?.short} · ${it?.id || ''}`) + (p.running.length > 1 ? ` +${p.running.length - 1}` : '') : p.queue.length ? `${p.queue.length} queued · no free agent` : 'idle';
    g.classList.toggle('asking', p.running.some(id => { const r = M.runs.find(x => x.id === id); return r?.ask?.qid && !r.ask.answer; }));
    const mt = g.querySelector('.meta'); if (mt.textContent !== meta) mt.textContent = meta;
    const prog = running ? Math.max(...p.running.map(id => IT(M.runs.find(r => r.id === id).item)?.loc?.t || 0)) : 0;
    g.querySelector('.prog').setAttribute('width', (W - 24) * clamp(prog, 0, 1));
    const vt = g.querySelector('.ver'); if (vt.textContent !== 'v' + p.version) { vt.textContent = 'v' + p.version; vt.classList.toggle('new', p.version > 1); }
  }
  for (const gt of D.gates) {
    const g = gt.el; if (!g) continue;
    const qs = M.questions.filter(q => q.gate === gt.id).length; const thinking = gt.waiting.some(id => IT(id)?.decideAt);
    g.classList.toggle('waiting', qs > 0); g.classList.toggle('thinking', thinking);
    const qb = g.querySelector('.qbadge'); qb.setAttribute('opacity', qs ? 1 : 0); qb.querySelector('text').textContent = qs;
    g.querySelector('.glab').textContent = gt.autonomy;
    g.classList.remove('person', 'sampled', 'agent', 'off'); g.classList.add(gt.autonomy);
  }
  for (const b of D.bins) { b.el?.querySelector('.count') && (b.el.querySelector('.count').textContent = b.items.length); }
  // wires live
  for (const w of D.wires) { const live = M.items.some(i => i.loc?.kind === 'wire' && i.loc.wire === w.id); w.el.parentNode.classList.toggle('live', live); }
  // items
  const queueIdx = {}, gateIdx = {}, binIdx = {}, runIdx = {};
  for (const it of M.items) {
    const l = it.loc; const g = itemEls.get(it.id); if (!l || !g) continue;
    let x = it.pos.x, y = it.pos.y;
    if (l.kind === 'wire') { const w = WR(l.wire); const pt = w.el.getPointAtLength(clamp(l.d, 0, w.len)); x = pt.x; y = pt.y; it.pos = { x, y }; }
    else if (l.kind === 'queue') { const p = P(l.program); const i = (queueIdx[p.id] = (queueIdx[p.id] ?? -1) + 1); const pi = portIn(p); const dir = p.flip ? 1 : -1; x = pi.x + dir * (16 + i * 15); y = pi.y; it.pos = { x, y }; }
    else if (l.kind === 'run') { const p = P(l.program); const i = (runIdx[p.id] = (runIdx[p.id] ?? -1) + 1); x = p.x + (i - (p.running.length - 1) / 2) * 20; y = p.y + 8 + Math.sin(now * 5 + i) * 2; it.pos = { x, y }; }
    else if (l.kind === 'gate') { const w = WR(l.wire); const i = (gateIdx[l.gate] = (gateIdx[l.gate] ?? -1) + 1); const pt = w.el.getPointAtLength(Math.max(0, w.stopLen - 16 - i * 15)); x = pt.x; y = pt.y; it.pos = { x, y }; }
    else if (l.kind === 'bin') { const w = WR(l.wire); const i = (binIdx[l.bin] = (binIdx[l.bin] ?? -1) + 1); x = w.stopPt.x - 12 + (i % 3) * 12; y = w.stopPt.y + 2 - Math.floor(i / 3) * 10; it.pos = { x, y }; }
    else if (l.kind === 'rewind') { const t = l.t < .5 ? 2 * l.t * l.t : -1 + (4 - 2 * l.t) * l.t; x = l.from.x + (l.to.x - l.from.x) * t; y = l.from.y + (l.to.y - l.from.y) * t - Math.sin(t * Math.PI) * 60; it.pos = { x, y }; }
    g.setAttribute('transform', `translate(${x},${y})`);
    g.classList.toggle('needs', M.questions.some(q => q.item === it.id));
  }
}

// ───────────────────────────────────────────── loop
function loop(t) {
  const dt = Math.min(.05, (t - ui.lastT) / 1000 || 0); ui.lastT = t;
  if (M) {
    tick(dt); renderFrame(); if (t - ui.hudT > 250 || ui.hudDirty) { renderHUD(); ui.hudT = t; ui.hudDirty = false; }
    // live traces grow with time, so refresh artifact/program panes about once a second while the line runs
    if (!ui.editing && (ui.side?.type === 'item' || ui.side?.type === 'program') && M.status === 'running' && !M.sim.paused && t - (ui.sideT || 0) > 1000) ui.sideDirty = true;
    if (ui.sideDirty) { renderSide(); ui.sideDirty = false; ui.sideT = t; }
    if (ui.work && (ui.workDirty || t - (ui.workT || 0) > 200)) { renderWork(); ui.workDirty = false; ui.workT = t; }
  }
  ui.raf = requestAnimationFrame(loop);
}
function touch() { ui.hudDirty = true; ui.workDirty = true; if (!ui.editing) ui.sideDirty = true; }

// ───────────────────────────────────────────── selection
function select(type, id) {
  if (type === 'item') return openWork(id);
  if (ui.work) closeWork();
  if (ui.worldDim && type) return;
  ui.selection = type ? { type, id } : null; ui.side = type ? { type, id } : null; ui.editing = false;
  $$('.station.selected,.stop.selected').forEach(e => e.classList.remove('selected'));
  if (type === 'program') P(id).el.classList.add('selected');
  if (type === 'gate') G(id).el.classList.add('selected');
  if (type === 'bin') B(id).el.classList.add('selected');
  touch(); renderSide(); ui.sideDirty = false;
}
function openSide(type, id) { ui.side = { type, id }; ui.editing = false; renderSide(); ui.sideDirty = false; }
function closeSide() { if (M && M.status === 'maintaining' && !ui.worldDim) { M.status = 'running'; M.sim.paused = false; M.maintenance = null; } ui.side = null; ui.selection = null; $$('.station.selected,.stop.selected').forEach(e => e.classList.remove('selected')); renderSide(); touch(); }

// ───────────────────────────────────────────── HUD
// Lucide-style stroke icons (24px grid, 2px stroke). `solid` icons are also filled.
const ICONS = {
  play: { d: 'M6 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L7.5 3.64A1 1 0 0 0 6 4.5z', solid: true },
  pause: { d: 'M7 4h3v16H7zM14 4h3v16h-3z', solid: true },
  wrench: { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  fit: { d: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 12h8M12 8v8' },
  loader: { d: 'M21 12a9 9 0 1 1-6.22-8.56' },
  back: { d: 'M15 18l-6-6 6-6' },
  chev: { d: 'M9 18l6-6-6-6' },
  up: { d: 'M18 15l-6-6-6 6' },
  down: { d: 'M6 9l6 6 6-6' },
  check: { d: 'M20 6 9 17l-5-5' },
  pencil: { d: 'M12 20h9M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z' },
  undo: { d: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11' },
  x: { d: 'M18 6 6 18M6 6l12 12' },
};
function icon(name) {
  const ic = ICONS[name];
  return s('svg', { viewBox: '0 0 24 24', fill: ic.solid ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': ic.solid ? 1.5 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: ic.d }));
}
function renderCommand() {
  const st = M.status, paused = M.sim.paused, due = M.defectsSinceMaint;
  const key = [st, paused, due, M.agents.length, M.name, M.version].join('|');
  if (key === ui.cmdKey) return; // rebuild only on change so hover + ping animations don't reset
  ui.cmdKey = key;

  const running = st === 'running' && !paused;
  const dot = st === 'maintaining' ? 'maint' : running ? 'live' : paused ? 'paused' : '';
  const state = st === 'designed' ? [h('b', {}, 'Ready'), ' · not run yet']
    : st === 'maintaining' ? [h('b', {}, 'Maintaining'), ' · line paused']
    : paused ? [h('b', {}, 'Paused'), ` · ${M.agents.length} agents idle`]
    : [h('b', {}, 'Running'), ` · ${M.agents.length} agents`];

  const kbd = h('kbd', {}, 'Space');
  let transport;
  if (st === 'designed') transport = h('button', { class: 'tbtn primary', title: 'Play', onclick: play }, icon('play'), 'Play');
  else if (st === 'maintaining') transport = h('button', { class: 'tbtn', disabled: true }, icon('pause'), 'Pause');
  else if (paused) transport = h('button', { class: 'tbtn primary', title: 'Resume (Space)', onclick: () => { M.sim.paused = false; touch(); } }, icon('play'), 'Resume', kbd);
  else transport = h('button', { class: 'tbtn', title: 'Pause (Space)', onclick: () => { M.sim.paused = true; touch(); } }, icon('pause'), 'Pause', kbd);

  const maint = st === 'maintaining'
    ? h('button', { class: 'tbtn busy', disabled: true }, icon('loader'), 'Maintaining…')
    : h('button', { class: 'tbtn' + (due >= 2 ? ' warn' : ''), title: 'Pause the line and let the maintenance agent improve it', disabled: st === 'designed', onclick: maintain }, icon('wrench'), 'Maintain', due ? h('span', { class: 'count', title: `${due} defects since last maintenance` }, due) : null);

  $('#command').replaceChildren(
    h('div', { class: 'cmd-status' },
      h('div', { class: 'cmd-name' }, M.name, h('span', { class: 'cmd-ver' }, 'v' + M.version), h('span', { class: 'cmd-clock', id: 'cmd-clock' }, clock(M.sim.now))),
      h('div', { class: 'cmd-state' }, h('span', { class: 'sdot ' + dot }), h('span', {}, state))),
    h('div', { class: 'cmd-sep' }),
    h('div', { class: 'cmd-group' }, transport, maint),
    h('div', { class: 'cmd-sep' }),
    h('button', { class: 'tbtn icon', title: 'Fit to screen', onclick: fitView }, icon('fit')));
}
function renderHUD() {
  // crumb
  const crumbKey = M.name + '|' + M.version;
  if (crumbKey !== ui.crumbKey) {
    ui.crumbKey = crumbKey;
    $('#crumb').replaceChildren(
      h('button', { class: 'crumb-back', onclick: goHome }, icon('back'), 'Metafabs'),
      h('span', { class: 'crumb-sep' }, '/'),
      h('span', { class: 'crumb-name' }, M.name),
      h('span', { class: 'crumb-path' }, '.metafab/'),
      h('span', { class: 'cmd-ver' }, 'v' + M.version));
  }
  // agents: real harness sessions. Each row says what the agent is doing right now.
  const agentRows = M.agents.map(a => {
    const run = a.busy && M.runs.find(r => r.id === a.busy); const it = run && IT(run.item);
    const asking = run?.ask?.qid && !run.ask.answer;
    return { a, run, it, asking, act: run ? (asking ? 'Waiting for your answer' : currentActivity(run)) : null };
  });
  const agentsKey = M.status + '|' + agentRows.map(r => r.a.id + ':' + (r.run?.id || '') + ':' + r.act + ':' + r.asking).join(',');
  if (agentsKey !== ui.agentsKey) {
    ui.agentsKey = agentsKey;
    const busy = agentRows.filter(r => r.run).length;
    $('#agents-pane').replaceChildren(
      h('div', { class: 'pane-title' }, 'Agents', h('span', { class: 'n' }, M.agents.length ? `${busy} of ${M.agents.length} working` : '')),
      M.agents.length ? h('div', { class: 'agents' }, agentRows.map(r => h('div', { class: 'agent' + (r.run ? ' busy' : '') + (r.asking ? ' asking' : ''), title: r.it ? `Open ${r.it.id} · ${r.it.title}` : `${r.a.model} · ${r.a.machine}`, onclick: r.it ? () => openWork(r.it.id, { session: r.run.id }) : null },
          harnessMark(r.a.harness),
          h('div', { class: 'a-main' },
            h('div', { class: 'a-top' }, h('span', { class: 'a-name' }, agentName(r.a)), r.run ? h('span', { class: 'a-prog' }, P(r.run.program).name) : h('span', { class: 'a-idle' }, 'idle')),
            r.run ? h('div', { class: 'a-act' }, h('span', { class: 'a-item' }, r.it.title), h('span', { class: 'a-sep' }, '·'), h('span', {}, r.act)) : null))))
        : h('div', { class: 'agents-empty' }, 'No agents yet. Press Play to assign some.'),
      h('div', { class: 'agents-foot' }, h('span', {}, "Seb's MacBook Pro · team not connected"), h('button', { class: 'btn sm ghost', onclick: () => M.status === 'designed' ? play() : openAssign(true) }, M.agents.length ? 'Change' : 'Assign')));
  }
  // command
  renderCommand();
  const ck = $('#cmd-clock'); if (ck) ck.textContent = clock(M.sim.now);
  // stats
  const inflight = M.items.filter(i => i.loc && !['done', 'parent'].includes(i.loc.kind)).length;
  const stat = (cls, v, l, extra = {}) => h('div', { class: `stat ${cls}${v ? '' : ' zero'}`, ...extra }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
  $('#stats-pane').replaceChildren(
    stat('cyan', inflight, 'In flight'),
    stat('amber', M.questions.length, 'Waiting on you'),
    stat('green', M.shipped, 'Shipped'),
    stat('red clickable', M.defects.length, 'Defects', { onclick: () => openSide('defects'), title: 'Show defects' }));
  renderAttention();
}
function harnessMark(harness) {
  return h('span', { class: 'hmark ' + harness, title: harness === 'claude' ? 'Claude Code' : 'Codex' }, harness === 'claude' ? '✳' : '◎');
}

// ───────────────────────────────────────────── needs you
// Like Orca: the canvas tells you which agents need you. Opening one takes you into its
// workspace, where the question sits at the end of the conversation that led to it.
const qTone = q => q.kind === 'ask' ? 'ask' : q.reason === 'escalated' ? 'esc' : q.reason === 'held' ? 'held' : 'gate';
function qSummary(q) {
  const it = IT(q.item);
  if (q.kind === 'ask') { const run = M.runs.find(r => r.id === q.run); return { who: `${agentName(q.agent)} asks`, text: run?.ask?.q || '', where: P(q.program).name }; }
  const g = G(q.gate);
  if (q.reason === 'escalated') return { who: 'Reviewer agent escalated', text: g.question, where: g.owner + ' gate' };
  if (q.reason === 'held') return { who: `Held · ${it.flags.holdBy?.name} ${f2(it.flags.holdBy?.value || 0)}`, text: g.question, where: g.owner + ' gate' };
  return { who: `Review · ${g.owner}`, text: g.question, where: g.owner + ' gate' };
}
function renderAttention() {
  const box = $('#attn');
  const key = M.questions.map(q => q.id).join(',') + '|' + Math.floor(M.sim.now / 2);
  if (key === ui.attnKey) return; ui.attnKey = key;
  if (!M.questions.length) {
    box.classList.toggle('hidden', M.status === 'designed');
    box.replaceChildren(h('div', { class: 'pane-title' }, 'Needs you', h('span', { class: 'n' }, '0')), h('div', { class: 'attn-empty' }, 'Nothing is waiting on you.'));
    return;
  }
  box.classList.remove('hidden');
  const qs = M.questions.slice().sort((a, b) => a.at - b.at);
  box.replaceChildren(
    h('div', { class: 'pane-title' }, 'Needs you', h('span', { class: 'n warn' }, qs.length)),
    h('div', { class: 'attn-list' }, qs.map(q => {
      const it = IT(q.item); const sm = qSummary(q);
      return h('button', { class: 'attn-row ' + qTone(q), onclick: () => openWork(it.id, { question: q.id }) },
        h('span', { class: 'ib-dot' }),
        h('span', { class: 'attn-main' },
          h('span', { class: 'attn-who' }, h('b', {}, sm.who), h('span', { class: 'attn-ago' }, ago(M.sim.now - q.at))),
          h('span', { class: 'attn-q' }, sm.text),
          h('span', { class: 'attn-meta' }, h('span', { class: 'id' }, it.id), h('span', { class: 't' }, it.title))),
        icon('chev'));
    })));
}

// ───────────────────────────────────────────── panel building blocks
const sec = (t, ...kids) => h('div', { class: 'sec' }, t && h('h4', {}, t), ...kids);
const scoreRow = (sc) => h('div', { class: 'score ' + (sc.ok ? 'ok' : sc.check ? 'bad' : 'warn') }, h('span', { class: 'nm' }, sc.name), h('span', { class: 'bar' }, h('i', { style: `width:${sc.value * 100}%` })), h('span', { class: 'val' }, f2(sc.value)));
const itemLink = (it) => h('span', { class: 'link', onclick: () => select('item', it.id) }, it.id);

// ───────────────────────────────────────────── side pane
function renderSide() {
  const side = $('#side'); if (!ui.side) { side.classList.add('hidden'); side.classList.remove('wide'); return; }
  side.classList.remove('hidden');
  side.classList.toggle('wide', ui.side.type === 'item');
  const sideKey = ui.side.type + ':' + ui.side.id; const keepScroll = side.dataset.key === sideKey ? side.querySelector('.side-body')?.scrollTop || 0 : 0; side.dataset.key = sideKey;
  const { type, id } = ui.side; let kind = '', title = '', body = [];
  const head = (k, t) => { kind = k; title = t; };

  if (type === 'program') {
    const p = P(id); head('Program · ' + p.runner, p.name);
    const runs = M.runs.filter(r => r.program === p.id && r.scores);
    const avg = {}; for (const r of runs) for (const sc of r.scores) (avg[sc.name] ||= []).push(sc.value);
    const done = M.runs.filter(r => r.program === p.id && r.endedAt != null && !r.cancelled);
    const totCost = done.reduce((a, r) => a + (r.cost || 0), 0), totDur = done.reduce((a, r) => a + (r.endedAt - r.startedAt), 0);
    const live = M.runs.filter(r => p.running.includes(r.id));
    const recent = [...live, ...done.slice().reverse()].slice(0, 8);
    body = [
      sec('Time & cost', h('div', { class: 'wf-sum' },
          sumTile('Runs', done.length, live.length ? `${live.length} running` : `${p.queue.length} queued`),
          sumTile('Avg time', done.length ? fmtDur(totDur / done.length) : '—', 'per run'),
          sumTile('Avg cost', done.length ? fmt$(totCost / done.length) : '—', 'per run'),
          sumTile('Total cost', fmt$(totCost), fmtDur(totDur) + ' agent time')),
        recent.length ? h('div', { class: 'rows', style: 'margin-top:10px' }, recent.map(r => { const ri = IT(r.item); const running = r.endedAt == null; return h('div', { class: 'row click', title: 'Open artifact trace', onclick: () => select('item', r.item) },
          h('span', { class: 'dot ' + (running ? 'blue' : r.verdict === 'passed' ? 'green' : r.verdict === 'scored' ? 'amber' : 'red') }), h('span', {}, r.item), h('span', { class: 'mono' }, ri?.title || ''), h('span', { class: 'sp' }),
          h('span', { class: 'mono', style: 'flex:none' }, running ? `${agentName(r.agent)} · running ${fmtDur(M.sim.now - r.startedAt)}` : `${fmtDur(r.endedAt - r.startedAt)} · ${fmt$(r.cost)}`)); })) : h('div', { class: 'dim', style: 'margin-top:8px' }, 'No runs yet.')),
      sec('Contract', h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Inputs'), h('span', { class: 'v' }, p.inputs.map(i => `${i.name}: ${i.type}`).join(', ')), h('span', { class: 'k' }, 'Outputs'), h('span', { class: 'v' }, p.outputs.map(o => `${o.name}: ${o.type}${o.many ? '[]' : ''}`).join(', ')), h('span', { class: 'k' }, 'Effects'), h('span', { class: 'v' }, p.effects.length ? p.effects.join('; ') : '—'), h('span', { class: 'k' }, 'Version'), h('span', { class: 'v' }, `v${p.version} · ${runs.length} runs`), p.entry && h('span', { class: 'k' }, 'Entry point'), p.entry && h('span', { class: 'v' }, p.entry.kind === 'form' ? 'form (click Run)' : 'connection · ' + p.entry.label))),
      sec('Frame', h('div', { class: 'box' }, `# ${p.id}.md\n\n${p.frame.instructions}\n\nskills: ${p.frame.skills.length ? p.frame.skills.join(', ') : '—'}`)),
      sec('Scorers on its output', h('div', { class: 'rows' }, D.scorers.filter(sc => !sc.on || sc.on === p.outputs[0].type).map(sc => h('div', { class: 'row' }, h('span', { class: 'dot ' + (sc.check ? 'red' : sc.policy === 'retry' ? 'amber' : 'grey') }), sc.name, h('span', { class: 'sp' }), h('span', { class: 'mono' }, `${sc.threshold.min != null ? '≥' + sc.threshold.min : '≤' + sc.threshold.max} · ${sc.check ? 'check · hold' : sc.policy} · ${sc.shown ? 'shown' : 'held out'}`))))),
      runs.length ? sec('Average scores', ...Object.entries(avg).map(([n, vs]) => { const v = vs.reduce((a, b) => a + b, 0) / vs.length; const sc = D.scorers.find(x => x.name === n); const ok = sc.threshold.min != null ? v >= sc.threshold.min : v <= sc.threshold.max; return scoreRow({ name: n, value: v, ok, check: sc.check }); })) : null,
      sec('', h('div', { class: 'actions' }, p.entry?.kind === 'form' && h('button', { class: 'btn sm primary', onclick: () => onPlugClick(p) }, 'Run · open form'), h('button', { class: 'btn sm', onclick: () => { p.paused = !p.paused; p.el.classList.toggle('paused', p.paused); touch(); } }, p.paused ? 'Resume program' : 'Pause this program only'), h('button', { class: 'btn sm', disabled: true }, 'Edit frame'))),
    ];
  }
  if (type === 'gate') {
    const g = G(id); head('Gate · ' + g.owner, g.question);
    const dial = ['person', 'sampled', 'agent', 'off'];
    body = [
      sec('Autonomy dial', h('div', { class: 'seg' }, dial.map(d => h('button', { class: d === g.autonomy ? 'on' : '', onclick: () => { g.autonomy = d; M.changes.push({ at: M.sim.now, what: `Gate "${g.question}" → ${d}` }); touch(); } }, d))), h('div', { class: 'hint' }, { person: 'Every artifact waits for ' + g.owner + '.', sampled: g.owner + ' sees about a third of the artifacts. The rest pass.', agent: 'A fresh agent decides. It escalates when it is not sure.', off: 'Artifacts pass. The gate has earned trust.' }[g.autonomy])),
      sec('Waiting', g.waiting.length ? h('div', { class: 'rows' }, g.waiting.map(iid => { const it = IT(iid); return h('div', { class: 'row click', title: 'Open workspace', onclick: () => openWork(iid) }, h('span', { class: 'dot', style: `background:${FORM_COLOR[it.form]}` }), it.id, h('span', { class: 'mono' }, it.title), h('span', { class: 'sp' }), it.decideAt ? h('span', { class: 'tagx esc' }, 'Agent deciding') : it.questionId ? h('span', { class: 'tagx' }, 'Needs you') : null); })) : h('div', { class: 'dim' }, 'Nothing waiting.')),
      sec('Decisions', h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Approved'), h('span', { class: 'v' }, g.decisions.filter(d => d.decision === 'approve').length), h('span', { class: 'k' }, 'Edited'), h('span', { class: 'v' }, g.decisions.filter(d => d.decision === 'edited').length), h('span', { class: 'k' }, 'Sent back'), h('span', { class: 'v' }, g.decisions.filter(d => d.decision === 'sendback').length), h('span', { class: 'k' }, 'By agent'), h('span', { class: 'v' }, g.decisions.filter(d => d.by === 'agent').length)), h('div', { class: 'hint' }, 'Edits are the most useful signal for calibration. When people stop editing, the gate can move to sampled.')),
    ];
  }
  if (type === 'bin') {
    const b = B(id); head('Bin · ' + b.rule, b.name);
    body = [
      sec('Rule', h('div', { class: 'box' }, b.ruleText)),
      sec('Contents', b.items.length ? h('div', { class: 'rows' }, b.items.map(iid => { const it = IT(iid); return h('div', { class: 'row click', onclick: () => select('item', iid) }, h('span', { class: 'dot', style: `background:${FORM_COLOR[it.form]}` }), it.id, h('span', { class: 'mono' }, it.title)); })) : h('div', { class: 'dim' }, 'Empty.')),
      b.rule === 'manual' ? sec('', h('button', { class: 'btn sm primary', disabled: !b.items.length, onclick: () => { b.items.slice().forEach((iid, i) => releaseFromBin(b, iid, i)); toast('Backlog released', 'green'); } }, `Release ${b.items.length} now`)) : null,
    ];
  }
  if (type === 'item') {
    const it = IT(id); if (!it) { closeSide(); return; }
    head('Artifact · ' + it.form, `${it.id} · ${it.title}`);
    const where = it.loc?.kind === 'run' ? `running at ${P(it.loc.program).name}` : it.loc?.kind === 'queue' ? `queued at ${P(it.loc.program).name}` : it.loc?.kind === 'gate' ? `waiting at gate: ${G(it.loc.gate).question}` : it.loc?.kind === 'bin' ? `in bin ${B(it.loc.bin).name}` : it.loc?.kind === 'wire' ? 'on a wire' : it.loc?.kind || '—';
    body = [
      sec('Now', h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Where'), h('span', { class: 'v' }, where), h('span', { class: 'k' }, 'Metafab version'), h('span', { class: 'v' }, 'v' + it.version + (it.draining ? ' · draining' : '')), it.parent && h('span', { class: 'k' }, 'Parent'), it.parent && h('span', { class: 'v' }, itemLink(IT(it.parent))), it.children.length ? h('span', { class: 'k' }, 'Children') : null, it.children.length ? h('span', { class: 'v' }, it.children.map(c => [itemLink(IT(c)), ' '])) : null, it.origin && h('span', { class: 'k' }, 'Came from'), it.origin && h('span', { class: 'v' }, IT(it.origin) ? itemLink(IT(it.origin)) : it.origin), it.flags.hold && h('span', { class: 'k' }, 'Held'), it.flags.hold && h('span', { class: 'v', style: 'color:var(--red)' }, `${it.flags.holdBy.name} ${f2(it.flags.holdBy.value)}`))),
      ...traceView(it),
      sec('', h('div', { class: 'actions' }, h('button', { class: 'btn sm', disabled: !it.history.some(x => x.kind === 'run-end') || ['done', 'parent'].includes(it.loc?.kind), onclick: () => rewindItem(it, 'build-slice', 'manual') }, '⟲ Rewind to Build slice'))),
    ];
  }
  if (type === 'defects') {
    head('Defects', `${M.defects.length} traced`);
    body = [
      M.defects.length ? sec('', h('div', { class: 'rows' }, M.defects.slice().reverse().map(d => h('div', { class: 'row click', onclick: () => openSide('defect', d.id) }, h('span', { class: 'dot red' }), h('span', {}, d.id), h('span', { class: 'mono' }, d.title), h('span', { class: 'sp' }), h('span', { class: 'tagx' }, 'v' + d.version))))) : h('div', { class: 'dim' }, 'No defects yet. They arrive after code ships, through the Sentry connection.'),
      M.defects.length ? h('div', { class: 'callout' }, `${M.defects.filter(d => d.td != null && d.td < .6).length} of ${M.defects.length} trace to a Build slice run with a low Test depth score. Maintain to fix the cause.`) : null,
      M.defects.length ? sec('', h('button', { class: 'btn sm amber', onclick: maintain, disabled: M.status !== 'running' }, 'Maintain')) : null,
    ];
  }
  if (type === 'defect') {
    const d = M.defects.find(x => x.id === id); const it = IT(d.item); const run = M.runs.find(r => r.id === d.run);
    head('Defect · from Sentry', d.title);
    body = [
      sec('Trace', h('div', { class: 'timeline' },
        tl('red', `Defect ${d.id} reported`, ago(M.sim.now - d.at)),
        tl('green', ['Shipped as ', itemLink(it), ` · PR #${it.pr}`], `merged ${ago(M.sim.now - (it.history.find(x => x.kind === 'shipped')?.at || d.at))}`),
        tl('amber', `Built by Build slice v${d.version}`, run ? `${agentName(run.agent)} · ${fmt$(run.cost)}` : ''),
        tl('grey', ['Planned from ', it.parent ? itemLink(IT(it.parent)) : '—'], 'spec'))),
      run && sec('Scores at build', ...run.scores.map(scoreRow), ...run.scores.filter(sc => !sc.ok).map(sc => h('div', { class: 'hint' }, `${sc.name}: ${sc.reason}`))),
      h('div', { class: 'callout' }, d.td != null && d.td < .6 ? `What let this through? Test depth scored ${f2(d.td)}. The scorer flagged it, but its policy was "continue, flagged", so the PR merged. The frame for Build slice has no testing standard.` : 'What let this through? The scores were fine. The scorers missed it. The fix may be in a scorer, not in the program.'),
      sec('', h('div', { class: 'actions' }, h('button', { class: 'btn sm amber', onclick: maintain, disabled: M.status !== 'running' }, 'Maintain the metafab'), h('button', { class: 'btn sm', onclick: () => openSide('defects') }, 'All defects'))),
    ];
  }
  if (type === 'designer') {
    head('Designer agent', 'Designing ' + M.name);
    body = [h('div', { class: 'log', id: 'designer-log' })];
  }
  if (type === 'maintenance') {
    head('Maintenance agent', M.maintenance?.title || 'Reading the metafab');
    body = [h('div', { class: 'log', id: 'maint-log' }), h('div', { id: 'maint-proposal' })];
  }
  side.replaceChildren(
    h('div', { class: 'side-head' }, h('div', {}, h('div', { class: 'kind' }, kind), h('div', { class: 'title' }, title)), h('button', { class: 'tbtn icon sm x', title: 'Close (Esc)', onclick: closeSide, disabled: ui.worldDim }, icon('x'))),
    h('div', { class: 'side-body' }, ...body.filter(Boolean)));
  if (keepScroll) side.querySelector('.side-body').scrollTop = keepScroll;
  if (type === 'designer' && M._designerLines) M._designerLines.forEach(l => appendLog('#designer-log', l));
  if (type === 'maintenance' && M.maintenance) { M.maintenance.lines.forEach(l => appendLog('#maint-log', l)); if (M.maintenance.proposalEl) $('#maint-proposal').append(M.maintenance.proposalEl); }
}
function scrollSideTo(sel) { const e = $(sel); if (e) setTimeout(() => e.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }
const tl = (c, t, d) => h('div', { class: 'tl' }, h('div', { class: 'rail' }, h('span', { class: 'dot ' + c }), h('span', { class: 'ln' })), h('div', { class: 'c' }, h('div', { class: 't' }, t), h('div', { class: 'd' }, d)));
// ───────────────────────────────────────────── trace (waterfall)
// An artifact's history becomes spans: queue waits, program runs, gate waits, bin waits, plus
// instant events. Each artifact contributes only its own (non-inherited) history, so a trace that
// covers a spec and its slices never counts a run twice.
const fmtDur = (x) => { x = Math.max(0, x) * TS; if (x < 60) return Math.round(x) + 's'; if (x < 3600) return Math.round(x / 60) + 'm'; const hh = Math.floor(x / 3600), m = Math.round((x % 3600) / 60); return `${hh}h ${String(m).padStart(2, '0')}m`; };
const fmt$ = (n) => '$' + (n || 0).toFixed(2);
const sumTile = (l, v, sub) => h('div', { class: 'wf-tile' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), sub && h('div', { class: 's' }, sub));

function ownSpans(it) {
  const out = [], open = {};
  const start = (key, sp) => { if (open[key]) close(key, sp.start); sp.owner = it.id; open[key] = sp; out.push(sp); return sp; };
  const close = (key, at, extra) => { const sp = open[key]; if (!sp) return null; sp.end = at; Object.assign(sp, extra); delete open[key]; return sp; };
  const instant = (sp) => { sp.owner = it.id; sp.end = sp.start; sp.instant = true; out.push(sp); };
  for (const x of it.history) {
    if (x.inherited) continue;
    switch (x.kind) {
      case 'enter': instant({ kind: 'enter', program: x.program, via: x.via, start: x.at }); break;
      case 'split': instant({ kind: 'split', from: x.from, start: x.at }); break;
      case 'queue': start('q', { kind: 'queue', program: x.program, start: x.at }); break;
      case 'run-start': close('q', x.at); start('run', { kind: 'run', program: x.program, start: x.at, version: x.version, agent: x.agent, run: x.run }); break;
      case 'retry': close('q', x.at); start('run', { kind: 'run', program: x.program, start: x.at, retry: x.reason }); break;
      case 'run-end': { const sp = close('run', x.at, { verdict: x.verdict, scores: x.scores, cost: x.cost, version: x.version, run: x.run }); if (sp) { const r = M.runs.find(r => r.id === x.run); if (r) sp.agent = r.agent; } break; }
      case 'gate-wait': start('gate', { kind: 'gate', gate: x.gate, start: x.at }); break;
      case 'gate': if (!close('gate', x.at, { decision: x.decision, by: x.by, reason: x.reason })) instant({ kind: 'gate', gate: x.gate, start: x.at, decision: x.decision, by: x.by }); break;
      case 'bin': start('bin', { kind: 'bin', bin: x.bin, start: x.at }); break;
      case 'release': close('bin', x.at); break;
      case 'rewind': for (const k of Object.keys(open)) close(k, x.at, { cancelled: true }); instant({ kind: 'rewind', program: x.program, why: x.why, start: x.at }); break;
      case 'shipped': instant({ kind: 'shipped', pr: x.pr, start: x.at }); break;
    }
  }
  // drop zero-length queue waits (an agent was free) so the trace stays readable
  return out.filter(sp => !(sp.kind === 'queue' && sp.end != null && sp.end - sp.start < 0.05));
}
function lineage(it) {
  // the artifact, its parents, and what it came from (e.g. the bug report that became this request)
  const path = [], seen = new Set(); let cur = it;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); path.unshift(cur); cur = (cur.parent && IT(cur.parent)) || (cur.origin && IT(cur.origin)) || null; }
  return path;
}
function descendants(it, out = [], seen = new Set([it.id])) {
  for (const x of M.items) if (!seen.has(x.id) && (x.parent === it.id || (!x.parent && x.origin === it.id))) { seen.add(x.id); out.push(x); descendants(x, out, seen); }
  return out;
}
function traceStats(spans) {
  const now = M.sim.now; const st = { t0: Infinity, t1: -Infinity, cost: 0, work: 0, wait: 0, runs: 0, progs: new Map(), stops: new Map() };
  for (const sp of spans) {
    const e = sp.end ?? now, d = e - sp.start; st.t0 = Math.min(st.t0, sp.start); st.t1 = Math.max(st.t1, e);
    if (sp.instant) continue;
    if (sp.kind === 'run' || sp.kind === 'queue') {
      const bp = st.progs.get(sp.program) || { run: 0, queue: 0, cost: 0, n: 0 }; st.progs.set(sp.program, bp);
      if (sp.kind === 'run') { st.work += d; st.cost += sp.cost || 0; st.runs++; bp.run += d; bp.cost += sp.cost || 0; bp.n++; }
      else { st.wait += d; bp.queue += d; }
    } else if (sp.kind === 'gate' || sp.kind === 'bin') {
      st.wait += d; const k = sp.kind + ':' + (sp.gate || sp.bin); const bs = st.stops.get(k) || { kind: sp.kind, id: sp.gate || sp.bin, wait: 0, n: 0 }; bs.wait += d; bs.n++; st.stops.set(k, bs);
    }
  }
  if (!isFinite(st.t0)) { st.t0 = now; st.t1 = now; }
  return st;
}
function spanTone(sp) {
  if (sp.kind === 'run') return sp.end == null ? 'live' : sp.cancelled ? 'cancel' : sp.verdict === 'passed' ? 'ok' : sp.verdict === 'scored' ? 'warn' : 'bad';
  if (sp.kind === 'gate') return sp.end == null ? 'gate live' : sp.decision === 'sendback' ? 'warn' : sp.by === 'agent' ? 'agent' : sp.by === 'person' ? 'gate' : 'gate auto';
  if (sp.kind === 'bin') return 'bin' + (sp.end == null ? ' live' : '');
  if (sp.kind === 'queue') return 'queue' + (sp.end == null ? ' live' : '');
  if (sp.kind === 'shipped') return 'ok'; if (sp.kind === 'rewind') return 'rewind';
  return 'mute';
}
function spanLabel(sp) {
  switch (sp.kind) {
    case 'run': return P(sp.program).name + (sp.retry ? ' · retry' : '');
    case 'queue': return 'queued';
    case 'gate': return G(sp.gate).owner + ' gate';
    case 'bin': return 'bin · ' + B(sp.bin).name;
    case 'enter': return 'entered · ' + sp.via;
    case 'split': return 'split from ' + sp.from;
    case 'shipped': return 'shipped' + (sp.pr ? ' · PR #' + sp.pr : '');
    case 'rewind': return '⟲ rewound';
  }
  return sp.kind;
}
function spanTarget(sp) {
  if (sp.kind === 'run' || sp.kind === 'queue' || sp.kind === 'enter' || sp.kind === 'rewind') return sp.program && (() => select('program', sp.program));
  if (sp.kind === 'gate') return () => select('gate', sp.gate);
  if (sp.kind === 'bin') return () => select('bin', sp.bin);
  if (sp.kind === 'split') return () => select('item', sp.from);
  return null;
}
function spanTitle(sp) {
  const d = (sp.end ?? M.sim.now) - sp.start;
  const bits = [spanLabel(sp)];
  if (!sp.instant) bits.push(fmtDur(d) + (sp.end == null ? ' so far' : ''));
  if (sp.kind === 'run') { if (sp.cost) bits.push(fmt$(sp.cost)); if (sp.agent) bits.push(agentName(sp.agent)); if (sp.version) bits.push('v' + sp.version); bits.push(sp.end == null ? 'running' : sp.cancelled ? 'cancelled' : sp.verdict); }
  if (sp.kind === 'gate' && sp.decision) bits.push(sp.decision + (sp.by ? ' by ' + sp.by : ''));
  if (sp.kind === 'gate') bits.push('"' + G(sp.gate).question + '"');
  if (sp.retry) bits.push('retry: ' + sp.retry);
  if (sp.why) bits.push(sp.why);
  return bits.join(' · ');
}
function niceStep(range) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]) if (range / s <= 5) return s;
  return 7200;
}

function traceView(it) {
  const path = lineage(it); const root = path[0];
  const seen = new Set(); const uniq = (xs) => xs.filter(x => !seen.has(x.id) && seen.add(x.id));
  const pathArts = uniq([...path, ...descendants(it)]);
  const feature = [root, ...descendants(root)];
  const hasFeature = feature.length > pathArts.length;
  const scope = hasFeature && ui.traceScope === 'feature' ? 'feature' : 'path';
  const arts = (scope === 'feature' ? feature : pathArts).slice().sort((a, b) => a.bornAt - b.bornAt);
  const groups = arts.map(a => ({ a, spans: ownSpans(a) }));
  const all = groups.flatMap(g => g.spans);
  const st = traceStats(all); const featSt = hasFeature && scope === 'path' ? traceStats(feature.flatMap(ownSpans)) : null;
  const now = M.sim.now; const t0 = st.t0, range = Math.max(1, st.t1 - t0);
  const pct = (t) => clamp((t - t0) / range * 100, 0, 100);
  const live = it.loc && !['done', 'parent'].includes(it.loc.kind);

  // summary
  const elapsed = st.t1 - st.t0;
  const summary = h('div', { class: 'wf-sum' },
    sumTile('Elapsed', fmtDur(elapsed), live ? 'still in flight' : it.loc?.kind === 'done' ? 'finished' : ''),
    sumTile('Cost', fmt$(st.cost), `${st.runs} run${st.runs === 1 ? '' : 's'}`),
    sumTile('Agent time', fmtDur(st.work), elapsed ? Math.round(st.work / elapsed * 100) + '% of elapsed' : ''),
    sumTile('Waiting', fmtDur(st.wait), elapsed ? Math.round(st.wait / elapsed * 100) + '% of elapsed' : ''));

  const scopeBar = hasFeature ? h('div', { class: 'wf-scope' },
    h('div', { class: 'seg' },
      h('button', { class: scope === 'path' ? 'on' : '', onclick: () => { ui.traceScope = 'path'; refreshTrace(); } }, 'This artifact'),
      h('button', { class: scope === 'feature' ? 'on' : '', onclick: () => { ui.traceScope = 'feature'; refreshTrace(); } }, `Whole feature · ${root.id}`)),
    featSt ? h('span', { class: 'wf-feat' }, `${feature.length} artifacts · ${fmt$(featSt.cost)} · ${fmtDur(featSt.t1 - featSt.t0)}`) : h('span', { class: 'wf-feat' }, `${feature.length} artifacts`)) : null;

  // breakdown: where the time and money went, per program and per stop
  const progRows = [...st.progs.entries()];
  const stopRows = [...st.stops.values()];
  const maxT = Math.max(0.001, ...progRows.map(([, b]) => b.run + b.queue), ...stopRows.map(b => b.wait));
  const breakdown = h('div', { class: 'bk' },
    progRows.map(([pid, b]) => h('div', { class: 'bk-row click', title: `Open ${P(pid).name}`, onclick: () => select('program', pid) },
      h('span', { class: 'bk-name' }, P(pid).name),
      h('span', { class: 'bk-bar' }, h('i', { class: 'run', style: `width:${b.run / maxT * 100}%` }), h('i', { class: 'queue', style: `width:${b.queue / maxT * 100}%` })),
      h('span', { class: 'bk-t' }, fmtDur(b.run + b.queue)),
      h('span', { class: 'bk-c' }, b.cost ? fmt$(b.cost) : '—'))),
    stopRows.map(b => { const nm = b.kind === 'gate' ? G(b.id).owner + ' gate' : 'Bin · ' + B(b.id).name; return h('div', { class: 'bk-row click', title: `Open ${nm}`, onclick: () => select(b.kind, b.id) },
      h('span', { class: 'bk-name dim' }, nm),
      h('span', { class: 'bk-bar' }, h('i', { class: b.kind, style: `width:${b.wait / maxT * 100}%` })),
      h('span', { class: 'bk-t' }, fmtDur(b.wait)),
      h('span', { class: 'bk-c' }, '—')); }),
    h('div', { class: 'bk-legend' }, h('span', {}, h('i', { class: 'run' }), 'running'), h('span', {}, h('i', { class: 'queue' }), 'queued'), h('span', {}, h('i', { class: 'gate' }), 'gate'), h('span', {}, h('i', { class: 'bin' }), 'bin')));

  // waterfall
  const step = niceStep(range); const ticks = [];
  for (let v = 0; v <= range + 1e-6; v += step) ticks.push(v);
  ui.traceOpen ||= new Set();
  const rows = [];
  for (const g of groups) {
    const gs = traceStats(g.spans); const a = g.a;
    rows.push(h('div', { class: 'wf-group' + (a.id === it.id ? ' self' : ''), title: a.id === it.id ? '' : 'Open this artifact', onclick: () => a.id !== it.id && openWork(a.id) },
      h('span', { class: 'dot', style: `background:${FORM_COLOR[a.form] || '#fff'}` }), h('span', { class: 'gid' }, a.id), h('span', { class: 'gt' }, a.title),
      h('span', { class: 'gm' }, `${gs.cost ? fmt$(gs.cost) + ' · ' : ''}${fmtDur(gs.t1 - gs.t0)}`)));
    for (const sp of g.spans) {
      const key = sp.owner + ':' + sp.kind + ':' + sp.start.toFixed(3);
      const end = sp.end ?? now; const l = pct(sp.start), w = Math.max(0, pct(end) - l);
      const tone = spanTone(sp); const go = spanTarget(sp); const isOpen = ui.traceOpen.has(key);
      const canOpen = sp.kind === 'run' && sp.scores;
      const toggle = () => { if (!canOpen) return go && go(); isOpen ? ui.traceOpen.delete(key) : ui.traceOpen.add(key); refreshTrace(); };
      rows.push(h('div', { class: 'wf-row k-' + sp.kind + (sp.instant ? ' inst' : ''), title: spanTitle(sp) },
        h('span', { class: 'wf-lab' + (go ? ' click' : ''), onclick: go || null }, spanLabel(sp)),
        h('span', { class: 'wf-track' + (canOpen ? ' click' : ''), onclick: toggle },
          sp.instant ? h('i', { class: 'wf-pin ' + tone, style: `left:${l}%` })
            : h('i', { class: 'wf-bar ' + tone, style: `left:${l}%;width:max(2px,${w}%)` })),
        h('span', { class: 'wf-meta' }, sp.instant ? '' : [fmtDur(end - sp.start), sp.cost ? h('b', {}, fmt$(sp.cost)) : null])));
      if (isOpen && canOpen) rows.push(h('div', { class: 'wf-detail' },
        h('div', { class: 'wf-dmeta' }, [sp.agent && agentName(sp.agent), sp.version && 'v' + sp.version, sp.verdict, fmt$(sp.cost)].filter(Boolean).join(' · ')),
        h('div', { class: 'scores' }, sp.scores.map(scoreRow)),
        sp.scores.filter(sc => !sc.ok).map(sc => h('div', { class: 'hint' }, `${sc.name}: ${sc.reason}`))));
    }
  }
  const waterfall = h('div', { class: 'wf' },
    h('div', { class: 'wf-axis' }, h('span', {}), h('span', { class: 'wf-ticks' }, ticks.map(v => h('span', { style: `left:${v / range * 100}%` }, fmtDur(v)))), h('span', {})),
    h('div', { class: 'wf-rows' }, h('div', { class: 'wf-grid' }, ticks.map(v => h('i', { style: `left:${v / range * 100}%` })), live ? h('i', { class: 'now', style: 'left:100%' }) : null), rows));

  return [
    sec('Trace', scopeBar, summary),
    progRows.length || stopRows.length ? sec('Where the time and money went', breakdown) : null,
    sec('', waterfall, h('div', { class: 'hint' }, 'Click a program, gate or bin name to open it. Click a run bar to see its scores.')),
  ];
}
function appendLog(sel, l) { const box = $(sel); if (!box) return; box.append(h('div', { class: 'ln ' + (l.cls || '') }, h('span', { class: 'pfx' }, l.pfx || '›'), h('span', {}, l.text))); box.parentNode.scrollTop = 1e6; }

// ───────────────────────────────────────────── plugs / forms
function onPlugClick(p) {
  if (p.entry.kind === 'connection') { toast(`${p.entry.label} connection · ${M.defects.length} events so far`, ''); return; }
  const inp = h('input', { placeholder: 'e.g. Export invoices as CSV', autofocus: true });
  showModal({ title: `Run ${p.name}`, sub: `Fill its open input: ${p.inputs[0].name}. Each run makes a new artifact.`, body: [h('div', { class: 'field' }, h('label', {}, 'Request'), inp, h('div', { class: 'hint' }, 'This form can also be a chat with an agent that asks until the input is complete.'))], ok: 'Run', onOk: () => { const t = inp.value.trim() || 'Untitled request'; spawnRequest(genericRequest(t)); toast(`${t} queued at Write spec`, 'green'); closeModal(); } });
  setTimeout(() => inp.focus(), 50);
}

// ───────────────────────────────────────────── modals
function showModal({ title, sub, body, ok, onOk, cancel = 'Cancel', okClass = 'primary', footLeft }) {
  const root = $('#modal-root');
  const okb = h('button', { class: 'btn ' + okClass, onclick: onOk }, ok);
  const m = h('div', { class: 'overlay', onclick: (e) => { if (e.target === m) closeModal(); } },
    h('div', { class: 'modal' }, h('div', { class: 'mh' }, h('h2', {}, title), sub && h('div', { class: 'sub' }, sub)), h('div', { class: 'mb' }, ...body),
      h('div', { class: 'mf' }, footLeft || h('span'), h('div', { style: 'display:flex;gap:8px' }, cancel && h('button', { class: 'btn ghost', onclick: closeModal }, cancel), okb))));
  root.replaceChildren(m); m._ok = okb; return m;
}
function closeModal() { $('#modal-root').replaceChildren(); }

function openNew() {
  const name = h('input', { placeholder: 'e.g. Invoice service' });
  const brief = h('textarea', { placeholder: 'Describe the product. The designer agent proposes the programs, the wires, the gates, the scorers and the bins. You can edit them before you play.' });
  showModal({ title: 'New metafab', sub: 'One factory for one project. It lives in the repo as .metafab/.', body: [
    h('div', { class: 'field' }, h('label', {}, 'Name'), name),
    h('div', { class: 'field' }, h('label', {}, 'What should it build?'), brief),
  ], ok: 'Design metafab', footLeft: h('span', { class: 'dim', style: 'font-size:11.5px' }, 'or start from a ', h('span', { class: 'link', onclick: () => toast('Community templates come later', '') }, 'template')), onOk: () => {
    const n = name.value.trim() || 'Untitled metafab'; const b = brief.value.trim() || 'A small web product with sign in, a core flow and billing.';
    closeModal(); const entry = { name: n, brief: b, created: 'just now', mf: createMetafab({ name: n, brief: b }) }; library.unshift(entry); openMetafab(entry.mf, true);
  } });
  setTimeout(() => name.focus(), 50);
}

function play() { openAssign(false); }
function openAssign(change) {
  let n = M.agents.length || 3; const num = h('span', { class: 'n' }, n);
  const okLabel = () => (change ? 'Save' : 'Start') + ` with ${n} agent${n === 1 ? '' : 's'}`;
  const note = h('div', { class: 'note hidden' }, 'Team connections come later in this prototype. For now the metafab runs with your agents only.');
  const body = [h('div', { class: 'assign' },
    h('div', { class: 'arow' }, h('div', { class: 'who' }, h('div', { class: 'n' }, 'Your machine'), h('div', { class: 's' }, 'Claude Code and Codex on this Mac, with your subscriptions.')), h('div', { class: 'stepper' }, h('button', { onclick: () => { n = Math.max(1, n - 1); num.textContent = n; m._ok.textContent = okLabel(); } }, '−'), num, h('button', { onclick: () => { n = Math.min(8, n + 1); num.textContent = n; m._ok.textContent = okLabel(); } }, '+'))),
    h('div', { class: 'arow off' }, h('div', { class: 'who' }, h('div', { class: 'n' }, 'Team'), h('div', { class: 's' }, 'Each person adds agents from their own machine.')), h('div', { class: 'avatars' }, ['AL', 'JM', 'RK'].map(x => h('span', {}, x))), h('button', { class: 'btn sm', onclick: () => note.classList.remove('hidden') }, 'Connect a team')),
    note,
    h('div', { class: 'arow off' }, h('div', { class: 'who' }, h('div', { class: 'n' }, 'Cloud runners'), h('div', { class: 's' }, 'Metafab Cloud · coming soon')), h('span', { class: 'switch' }))),
  h('div', { class: 'hint' }, 'Each free agent takes the next run that is ready, follows the program, writes the output, and takes the next run.')];
  const m = showModal({ title: change ? 'Agents' : `Play ${M.name}`, sub: 'How many agents should this metafab get?', body, ok: okLabel(), onOk: () => { setAgents(n); closeModal(); if (!change) startRunning(); } });
}
function setAgents(n) {
  const cur = M.agents.length;
  if (n > cur) for (let i = cur; i < n; i++) {
    const def = AGENT_POOL[i % AGENT_POOL.length];
    const k = M.agents.filter(a => a.harness === def.harness).length + 1;
    M.agents.push({ id: 'ag' + (i + 1), ...def, n: k, short: (def.harness === 'claude' ? 'Claude ' : 'Codex ') + k, busy: null });
  }
  else if (n < cur) { const idle = M.agents.filter(a => !a.busy); let rm = cur - n; M.agents = M.agents.filter(a => { if (rm > 0 && !a.busy && idle.includes(a)) { rm--; return false; } return true; }); }
  touch();
}
function startRunning() {
  M.status = 'running'; M.sim.paused = false;
  // starter requests from the brief
  FIRST_REQUESTS.forEach((k, i) => setTimeout(() => spawnRequest(k), 300 + i * 900));
  M.sim.intakeAt = M.sim.now + 26;
  toast(`${M.name} is running with ${M.agents.length} agents`, 'green'); closeSide(); touch();
}

// ───────────────────────────────────────────── maintenance
async function maintain() {
  if (M.status !== 'running') return;
  const bsRuns = M.runs.filter(r => r.program === 'build-slice' && r.scores && !r.retried);
  M.status = 'maintaining'; M.sim.paused = true; M.maintenance = { lines: [], title: 'Reading the metafab', proposalEl: null };
  openSide('maintenance'); touch();
  const say = async (text, cls, ms = 650) => { const l = { text, cls }; M.maintenance.lines.push(l); appendLog('#maint-log', l); await sleep(ms); };
  const allScores = M.runs.filter(r => r.scores).reduce((n, r) => n + r.scores.length, 0);
  await say(`Reading ${allScores} scores across ${M.runs.filter(r => r.scores).length} runs, ${M.defects.length} defects, ${M.feedback.length} gate edits.`, 'dimm', 900);
  if (bsRuns.length < 2) {
    await say(`Not enough runs to see a pattern. ${bsRuns.length} run${bsRuns.length === 1 ? '' : 's'} of Build slice so far.`, 'hl');
    await say('Come back after a few artifacts have shipped.', 'dimm');
    M.maintenance.proposalEl = h('div', { class: 'actions', style: 'margin-top:8px' }, h('button', { class: 'btn sm', onclick: endMaintenance }, 'Close')); $('#maint-proposal')?.append(M.maintenance.proposalEl); return;
  }
  const weak = P('build-slice').weak;
  const tds = bsRuns.map(r => r.scores.find(x => x.id === 'test-depth')).filter(Boolean);
  const avg = tds.reduce((a, b) => a + b.value, 0) / tds.length; const low = tds.filter(x => x.value < .6).length;
  const traced = M.defects.filter(d => d.td != null && d.td < .6).length;
  await say(`Scores by program and dimension…`, 'dimm', 700);
  if (weak) {
    // highlight the weak program on the canvas
    world.classList.add('world-dim'); ui.worldDim = true; P('build-slice').el.classList.add('weak');
    await say(`Build slice · Test depth: avg ${f2(avg)} across ${tds.length} branches. ${low} of ${tds.length} below 0.60.`, 'hl', 900);
    if (traced) await say(`${traced} of ${M.defects.length} defects trace back to a Build slice run with Test depth < 0.60.`, 'hl', 900);
    const reasons = {}; for (const t of tds) if (t.value < .6) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    if (top) await say(`Repeated reason: "${top[0]}" ×${top[1]}.`, '', 800);
    await say('Cause: the Build slice frame has no testing standard. Test depth flags, but its policy does not hold the artifact.', '', 900);
    if (M.feedback.length) await say(`${M.feedback.length} gate edit${M.feedback.length > 1 ? 's' : ''} at Release lead also mention tests.`, 'dimm', 700);
    await say('Writing a change to .metafab/ …', 'dimm', 900);
    await say(`Replaying ${Math.min(6, bsRuns.length)} artifacts on v${M.version} and v${M.version + 1}. Effects mocked.`, 'dimm', 1400);
    await say('Proposal ready. A PR on .metafab/, through the gate as any other change.', 'ok', 300);
    M.maintenance.title = 'Proposal: Build slice v' + (M.version + 1);
    const inflight = staleItems().length;
    const el = h('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:6px' },
      h('div', { class: 'diff' }, h('div', { class: 'f' }, 'programs/build-slice.md'), h('div', { class: 'l ctx' }, ' Implement the slice on a new branch.'), h('div', { class: 'l ctx' }, ' Follow repo conventions. Keep the diff small.'), h('div', { class: 'l add' }, '+Write tests for each acceptance criterion'), h('div', { class: 'l add' }, '+before the implementation. Cover the empty'), h('div', { class: 'l add' }, '+state and every error path.'), h('div', { class: 'l ctx' }, ' '), h('div', { class: 'l ctx' }, ' skills: repo-conventions'), h('div', { class: 'l add' }, '+skills: repo-conventions, testing-standard')),
      h('div', { class: 'diff' }, h('div', { class: 'f' }, 'skills/testing-standard.md · new'), h('div', { class: 'l add' }, '+# Testing standard'), h('div', { class: 'l add' }, '+One test per acceptance criterion. Assert on'), h('div', { class: 'l add' }, '+behaviour, not implementation. Empty state and'), h('div', { class: 'l add' }, '+error paths are not optional.')),
      h('div', { class: 'diff' }, h('div', { class: 'f' }, 'scorers/test-depth.md'), h('div', { class: 'l del' }, '-policy: continue, flagged'), h('div', { class: 'l add' }, '+policy: hold          # now a check'), h('div', { class: 'l add' }, '+pass: 0.60')),
      h('div', { class: 'sec' }, h('h4', {}, 'Replay set · ' + Math.min(6, bsRuns.length) + ' artifacts'), h('div', { class: 'replay' }, h('span', { class: 'h' }), h('span', { class: 'h' }, 'v' + M.version), h('span', { class: 'h' }, 'v' + (M.version + 1)), h('span', { class: 'h' }, 'Δ'),
        h('span', {}, 'Test depth'), h('span', {}, f2(avg)), h('span', {}, '0.83'), h('span', { class: 'up' }, '+' + f2(.83 - avg)),
        h('span', {}, 'AI slop'), h('span', {}, '0.24'), h('span', {}, '0.23'), h('span', { class: 'same' }, '—'),
        h('span', {}, 'Code reuse'), h('span', {}, '0.68'), h('span', {}, '0.70'), h('span', { class: 'same' }, '—'),
        h('span', {}, 'Cost / run'), h('span', {}, '$2.84'), h('span', {}, '$3.21'), h('span', { class: 'dn' }, '+13%'),
        h('span', {}, 'Time / run'), h('span', {}, '14m'), h('span', {}, '16m'), h('span', { class: 'dn' }, '+16%'))),
      h('div', { class: 'sec' }, h('h4', {}, 'Roll over'), h('div', { class: 'hint', style: 'margin:0 0 8px' }, `${inflight} artifact${inflight === 1 ? ' is' : 's are'} past Build slice on v${M.version} and not yet past a person gate.`),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
          h('div', { class: 'opt', onclick: () => applyProposal('hard') }, h('div', { class: 't' }, 'Roll over now', h('span', { class: 'tagx' }, 'rewind stale')), h('div', { class: 'd' }, `Stale artifacts rewind to Build slice and rebuild on v${M.version + 1}. Artifacts past a person gate are kept. Shipped code is fixed forward.`)),
          h('div', { class: 'opt', onclick: () => applyProposal('drain') }, h('div', { class: 't' }, 'Drain, then roll over', h('span', { class: 'tagx' }, 'no rewind')), h('div', { class: 'd' }, `Artifacts in flight finish on v${M.version}. New runs of Build slice use v${M.version + 1}.`)),
          h('div', { class: 'opt', onclick: () => { toast('Proposal discarded', ''); endMaintenance(); } }, h('div', { class: 't' }, 'Discard'), h('div', { class: 'd' }, 'Keep v' + M.version + '. The maintenance agent will see the same pattern next time.')))));
    M.maintenance.proposalEl = el; $('#maint-proposal')?.append(el); renderSide(); scrollSideTo('#maint-proposal');
    return;
  }
  // second pass: look at gates
  const gm = G('g-merge'); const approvals = gm.decisions.filter(d => d.by === 'person' && d.decision === 'approve').length;
  const nowRuns = tds.length ? bsRuns.filter(r => r.version === P('build-slice').version).map(r => r.scores.find(x => x.id === 'test-depth')).filter(Boolean) : []; const avgNow = nowRuns.length ? nowRuns.reduce((s, x) => s + x.value, 0) / nowRuns.length : avg;
  await say(`Build slice · Test depth: avg ${f2(avgNow)} on v${P('build-slice').version} (${nowRuns.length} runs). Stable.`, 'ok', 800);
  if (M.defectsSinceMaint) { const recent = M.defects.slice(-M.defectsSinceMaint); const old = recent.filter(d => d.version < P('build-slice').version).length; await say(`${recent.length} new defect${recent.length > 1 ? 's' : ''} since the last change. ${old} trace to Build slice v${P('build-slice').version - 1} code that shipped before the fix: fix forward.${recent.length - old ? ` ${recent.length - old} trace to v${P('build-slice').version}.` : ''}`, old === recent.length ? 'dimm' : 'hl', 1000); }
  if (gm.autonomy === 'person' && approvals >= 3 && gm.edits === 0) {
    await say(`Gate "Is this PR safe to merge?": ${approvals} approvals, 0 edits. People are not changing the output.`, 'hl', 900);
    await say('Proposal: move the gate from person to sampled. Release lead sees a third of the PRs.', 'ok', 300);
    M.maintenance.title = 'Proposal: gate → sampled';
    const el = h('div', { style: 'display:flex;flex-direction:column;gap:12px;margin-top:6px' },
      h('div', { class: 'diff' }, h('div', { class: 'f' }, 'metafab.yaml'), h('div', { class: 'l ctx' }, ' gate: g-merge'), h('div', { class: 'l del' }, '-  autonomy: person'), h('div', { class: 'l add' }, '+  autonomy: sampled')),
      h('div', { class: 'actions' }, h('button', { class: 'btn sm primary', onclick: () => { gm.autonomy = 'sampled'; M.version++; M.changes.push({ at: M.sim.now, what: 'g-merge → sampled' }); toast(`v${M.version} live · merge gate is now sampled`, 'green'); endMaintenance(); } }, 'Apply'), h('button', { class: 'btn sm', onclick: endMaintenance }, 'Discard')));
    M.maintenance.proposalEl = el; $('#maint-proposal')?.append(el); return;
  }
  await say('No change proposed. Scores are stable and gates are still collecting data.', 'dimm');
  M.maintenance.proposalEl = h('div', { class: 'actions', style: 'margin-top:8px' }, h('button', { class: 'btn sm', onclick: endMaintenance }, 'Close')); $('#maint-proposal')?.append(M.maintenance.proposalEl);
}
function staleItems() {
  // items whose Build slice ran on the current version, not past a person gate after it, not shipped
  const out = [];
  for (const it of M.items) {
    const l = it.loc; if (!l) continue;
    const ran = it.history.some(x => x.kind === 'run-end' && x.program === 'build-slice' && !x.inherited);
    if (!ran && !(l.kind === 'run' && l.program === 'build-slice')) continue;
    if (l.kind === 'done' || l.kind === 'parent') continue;
    const past = ['open-pr', 'merge-pr'];
    const passedPerson = it.history.some(x => x.kind === 'gate' && x.gate === 'g-merge' && x.decision !== 'sendback');
    if (passedPerson) continue;
    if (l.kind === 'run' && l.program === 'build-slice') { out.push(it); continue; }
    if (l.kind === 'wire' && ['w3', 'w4'].includes(l.wire)) { out.push(it); continue; }
    if (l.kind === 'gate' && ['g-branch', 'g-merge'].includes(l.gate)) { out.push(it); continue; }
    if ((l.kind === 'queue' || l.kind === 'run') && past.includes(l.program)) { out.push(it); continue; }
  }
  return out;
}
function applyProposal(mode) {
  const p = P('build-slice'); const stale = staleItems();
  M.version++; p.weak = false; p.version = M.version; p.frame.instructions += ' Write tests for each acceptance criterion before the implementation. Cover the empty state and every error path.'; p.frame.skills.push('testing-standard');
  const td = SC('test-depth'); td.check = true; td.policy = 'hold'; td.version++;
  M.changes.push({ at: M.sim.now, what: `Build slice v${M.version}: testing standard; Test depth is now a check` });
  p.el.classList.remove('weak'); p.el.classList.add('changed'); setTimeout(() => p.el.classList.remove('changed'), 4000);
  if (mode === 'hard') { for (const it of stale) rewindItem(it, 'build-slice', `v${M.version} rollover`); toast(`v${M.version} live · ${stale.length} stale artifact${stale.length === 1 ? '' : 's'} rewound to Build slice`, 'green'); }
  else { for (const it of stale) { it.draining = true; drawMarks(it); } toast(`v${M.version} live · ${stale.length} artifact${stale.length === 1 ? '' : 's'} draining on v${M.version - 1}`, 'green'); }
  M.defectsSinceMaint = 0; endMaintenance();
}
function endMaintenance() {
  world.classList.remove('world-dim'); ui.worldDim = false; P('build-slice').el.classList.remove('weak');
  M.status = 'running'; M.sim.paused = false; M.maintenance = null; closeSide(); touch();
}
function rewindItem(it, programId, why) {
  const l = it.loc; if (!l) return;
  // leave wherever it is
  if (l.kind === 'run') { const run = M.runs.find(r => r.id === l.run); const a = M.agents.find(x => x.id === run.agent); if (a) a.busy = null; const p = P(l.program); p.running = p.running.filter(x => x !== run.id); run.endedAt = M.sim.now; run.cancelled = true; run.cancelT = l.t; run.cancelWhy = why; }
  if (l.kind === 'queue') { const p = P(l.program); p.queue = p.queue.filter(x => x !== it.id); }
  if (l.kind === 'gate') { const g = G(l.gate); g.waiting = g.waiting.filter(x => x !== it.id); it.decideAt = null; it.questionId = null; }
  M.questions = M.questions.filter(q => q.item !== it.id);
  if (l.kind === 'bin') { const b = B(l.bin); b.items = b.items.filter(x => x !== it.id); }
  const p = P(programId); const to = portIn(p);
  for (const w of D.wires) if (w.from[0] === programId || w.to === programId) delete it.cleared[w.id];
  it.flags.hold = false; it.form = p.inputs[0].type; it.pr = null; it.draining = false;
  it.marks.push({ kind: 'rewind' }); it.history.push({ kind: 'rewind', program: programId, why, at: M.sim.now });
  const trail = s('path', { class: 'rewind-trail', d: `M${it.pos.x} ${it.pos.y} Q${(it.pos.x + to.x) / 2} ${Math.min(it.pos.y, to.y) - 80} ${to.x} ${to.y}` }); L.fx.append(trail); it.rewindTrail = trail; setTimeout(() => trail.remove(), 1600);
  it.loc = { kind: 'rewind', from: { ...it.pos }, to, program: programId, t: 0, dur: 1.2 };
  if (!itemEls.get(it.id)) { /* item el removed (e.g. shipped) – not rewindable here */ }
  drawMarks(it); touch();
}

// ───────────────────────────────────────────── designer reveal
async function revealDesign() {
  openSide('designer'); M._designerLines = [];
  const say = async (text, cls, ms = 500, pfx) => { const l = { text, cls, pfx }; M._designerLines.push(l); appendLog('#designer-log', l); await sleep(ms); };
  const show = (el) => { el.classList.remove('pre'); };
  await say('Reading your brief…', 'dimm', 700);
  await say(`"${M.brief.length > 110 ? M.brief.slice(0, 110) + '…' : M.brief}"`, '', 900, '');
  await say('A product with a UI and an API. One workflow. Slices built in parallel. Feedback loops back to the start.', '', 900);
  await say('Placing programs…', 'dimm', 300);
  for (const p of D.programs) { show(p.el); await say(`${p.name} — ${p.inputs[0].type} → ${p.outputs.map(o => o.type).join(' | ')}${p.outputs[0].many ? '[]' : ''}`, '', 330, '+'); }
  await say('Wiring outputs to inputs…', 'dimm', 300);
  for (const w of D.wires) { show(w.el.parentNode); await sleep(140); }
  await say('Entry points: a form on Write spec, a Sentry connection on Log bug.', '', 400);
  $$('.plug').forEach(show);
  await say('Adding gates. A new metafab has not earned trust yet, so people decide at most steps.', 'dimm', 500);
  for (const g of D.gates) { show(g.el); await say(`"${g.question}" · ${g.autonomy} · ${g.owner}`, '', 420, '+'); }
  await say('Adding bins…', 'dimm', 250);
  for (const b of D.bins) { show(b.el); await say(`${b.name} · ${b.ruleText.toLowerCase()}`, '', 350, '+'); }
  await say('Adding scorers…', 'dimm', 250);
  for (const sc of D.scorers) await say(`${sc.name} · ${sc.scope}${sc.on ? ' on ' + sc.on : ''} · ${sc.threshold.min != null ? '≥' + sc.threshold.min : '≤' + sc.threshold.max} · ${sc.policy}`, '', 220, '+');
  await say('Three starter requests from the brief will enter when you press Play.', '', 500);
  await say(`Done. v1 · ${D.programs.length} programs, ${D.gates.length} gates, ${D.bins.length} bins, ${D.scorers.length} scorers.`, 'ok', 200);
  await say('Press Play when you are ready. Click any program, gate or scorer to edit it first.', 'dimm', 0);
  const box = $('#designer-log'); box && box.parentNode.append(h('div', { class: 'actions', style: 'margin-top:4px' }, h('button', { class: 'btn sm primary', onclick: play }, 'Play'), h('button', { class: 'btn sm', onclick: closeSide }, 'Look around first')));
}

// ───────────────────────────────────────────── screens
function openMetafab(mf, reveal = false) {
  M = mf; D = mf.design; ui.selection = null; ui.side = null; ui.attnKey = ''; ui.work = null;
  $('#home').classList.add('hidden'); $('#studio').classList.remove('hidden');
  buildCanvas(reveal);
  // re-attach item elements for items still in play
  for (const it of M.items) if (it.loc && !['done', 'parent'].includes(it.loc.kind)) makeItemEl(it);
  ui.cmdKey = ui.crumbKey = ui.agentsKey = ''; fitView(); renderSide(); touch(); renderHUD();
  if (!ui.raf) ui.raf = requestAnimationFrame(loop);
  if (reveal) revealDesign();
}
function goHome() { $('#studio').classList.add('hidden'); $('#home').classList.remove('hidden'); renderHome(); }

function thumb(mf) {
  const d = mf ? mf.design : makeDesign(); const saveD = D; D = d;
  const sv = s('svg', { viewBox: '60 300 1620 540', preserveAspectRatio: 'xMidYMid meet' });
  for (const w of d.wires) sv.append(s('path', { d: roundedPath(routePoints(w)), fill: 'none', stroke: '#2b3647', 'stroke-width': 3 }));
  for (const p of d.programs) sv.append(s('rect', { x: p.x - W / 2, y: p.y - H / 2, width: W, height: H, rx: 12, fill: '#0f141c', stroke: p.weak === false ? '#4ade80' : '#4a5a70', 'stroke-width': 3 }));
  for (const w of d.wires) if (w.stop) { const pts = routePoints(w); const mid = w.stop.near ? { x: w.stop.near[0], y: w.stop.near[1] } : { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: pts[0].y }; sv.append(s('rect', { x: mid.x - 6, y: mid.y - 18, width: 12, height: 36, rx: 3, fill: w.stop.kind === 'gate' ? '#60a5fa' : '#2dd4bf' })); }
  if (mf) for (const it of mf.items) if (it.loc && !['done', 'parent'].includes(it.loc.kind) && it.pos.x) sv.append(s('circle', { cx: it.pos.x, cy: it.pos.y, r: 9, fill: FORM_COLOR[it.form] || '#fff' }));
  D = saveD; return sv;
}
function renderHome() {
  const cards = $('#cards');
  cards.replaceChildren(
    h('div', { class: 'card new', onclick: openNew }, h('div', { class: 'inner' }, h('div', { class: 'plus' }, '+'), h('div', { class: 'lab' }, 'New metafab'))),
    ...library.map(e => {
      const mf = e.mf; const st = mf?.status || 'designed';
      const pill = st === 'running' && !mf.sim.paused ? h('span', { class: 'pill live' }, h('span', { class: 'dot' }), `running · ${mf.agents.length} agents`) : st === 'maintaining' ? h('span', { class: 'pill maint' }, h('span', { class: 'dot' }), 'maintaining') : st === 'running' ? h('span', { class: 'pill paused' }, h('span', { class: 'dot' }), 'paused') : h('span', { class: 'pill' }, h('span', { class: 'dot' }), 'designed');
      return h('div', { class: 'card', onclick: () => { if (!e.mf) e.mf = createMetafab({ name: e.name, brief: e.brief }); openMetafab(e.mf); } },
        h('div', { class: 'thumb' }, thumb(mf)),
        h('div', { class: 'body' }, h('div', { class: 'name' }, e.name, h('span', { class: 'mono dim' }, 'v' + (mf?.version || 1))), h('div', { class: 'meta' }, pill, h('span', {}, mf?.shipped ? `${mf.shipped} shipped · ${mf.defects.length} defects` : e.created))));
    }));
}

// ───────────────────────────────────────────── toasts
function toast(text, cls = '') {
  const t = h('div', { class: 'toast ' + cls }, h('span', { class: 'tdot' }), h('span', {}, text)); $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 2800);
}

// ───────────────────────────────────────────── boot
$('#btn-new').addEventListener('click', openNew);
$('#btn-templates').addEventListener('click', () => toast('Community templates come later', ''));
addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal-root').children.length) closeModal(); else if (ui.work) { if (!e.target.matches('input,textarea')) closeWork(); else e.target.blur(); } else if (ui.side && !ui.worldDim) closeSide(); } if (e.key === ' ' && M && !e.target.matches('input,textarea') && !ui.work && !$('#studio').classList.contains('hidden')) { e.preventDefault(); if (M.status === 'running') { M.sim.paused = !M.sim.paused; touch(); } } });
renderHome();
// keep the home cards fresh while a metafab runs in the background
setInterval(() => { if (!$('#home').classList.contains('hidden') && library.some(e => e.mf)) renderHome(); }, 1500);
