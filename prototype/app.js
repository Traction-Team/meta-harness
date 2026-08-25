/* ─────────────────────────────────────────────── icons (SF-Symbols-ish) ── */

const I = (p, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor"
     stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const ICONS = {
  loop:    I(`<path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8"/><path d="M13.6 2.2v3.1h-3.1"/>`),
  doc:     I(`<path d="M9 2.2H5a1.4 1.4 0 0 0-1.4 1.4v8.8A1.4 1.4 0 0 0 5 13.8h6a1.4 1.4 0 0 0 1.4-1.4V5.6z"/><path d="M9 2.2v3.4h3.4"/>`),
  list:    I(`<rect x="2.3" y="6.5" width="11.4" height="7.2" rx="1.9"/><path d="M3.9 4.5h8.2M5.5 2.5h5"/>`),
  branch:  I(`<circle cx="4.4" cy="3.6" r="1.8"/><circle cx="4.4" cy="12.4" r="1.8"/><circle cx="11.6" cy="6.2" r="1.8"/><path d="M4.4 5.4v5.2M6.2 6.2h2.2a1.4 1.4 0 0 1 1.4 1.4v.6a3.4 3.4 0 0 1-3.4 3.4H5.6"/>`),
  pr:      I(`<circle cx="4.4" cy="3.8" r="1.8"/><circle cx="4.4" cy="12.2" r="1.8"/><circle cx="11.6" cy="12.2" r="1.8"/><path d="M4.4 5.6v4.8M11.6 10.4V6.6a2 2 0 0 0-2-2H7.2"/><path d="M8.8 3.1 7.1 4.6l1.7 1.5"/>`),
  tick:    I(`<path d="M3.2 8.3 6.3 11.4 12.8 4.7"/>`, 12),
  check:   I(`<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2 7.1 10l3.7-4"/>`),
  flag:    I(`<path d="M3.6 14V2.6M3.6 3.4h7.2l-1.4 2.6 1.4 2.6H3.6"/>`),
  book:    I(`<path d="M2.6 3.2a1 1 0 0 1 1-1h3.1a1.4 1.4 0 0 1 1.3 1v9.3a1.2 1.2 0 0 0-1.1-.8H2.6zM13.4 3.2a1 1 0 0 0-1-1H9.3a1.4 1.4 0 0 0-1.3 1v9.3a1.2 1.2 0 0 1 1.1-.8h4.3z"/>`),
  sparkle: I(`<path d="M8 1.8l1.3 3.6L13 6.7l-3.7 1.3L8 11.6 6.7 8 3 6.7l3.7-1.3zM12.6 11l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"/>`),
  clock:   I(`<circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.3 1.5"/>`),
  robot:   I(`<rect x="2.6" y="5.4" width="10.8" height="8.2" rx="2.8"/><path d="M8 5.4V3.4"/><circle cx="8" cy="2.4" r="1"/><circle cx="6" cy="9.3" r=".95" fill="currentColor" stroke="none"/><circle cx="10" cy="9.3" r=".95" fill="currentColor" stroke="none"/>`),
  sidebar: I(`<rect x="2" y="3" width="12" height="10" rx="1.8"/><path d="M6.4 3v10"/>`),
  chevL:   I(`<path d="M10 3.2 5.6 8l4.4 4.8"/>`),
  chevR:   I(`<path d="M6 3.2 10.4 8 6 12.8"/>`),
  chevD:   I(`<path d="M3.6 6.2 8 10.4l4.4-4.2"/>`, 14),
  play:    I(`<path d="M5.4 3.4 12 8l-6.6 4.6z" fill="currentColor" stroke-width="1.1"/>`, 13),
  pencil:  I(`<path d="M11.1 2.5a1.6 1.6 0 0 1 2.3 2.3L5.6 12.6l-3 .8.8-3z"/>`, 14),
  save:    I(`<path d="M2.6 4a1.4 1.4 0 0 1 1.4-1.4h6.2l3.2 3.2V12a1.4 1.4 0 0 1-1.4 1.4H4A1.4 1.4 0 0 1 2.6 12z"/><path d="M5.4 2.6v3.6h4.4V2.6M5.4 13.4V9.6h5.2v3.8"/>`, 14),
  eye:     I(`<path d="M1.6 8S3.9 3.8 8 3.8 14.4 8 14.4 8 12.1 12.2 8 12.2 1.6 8 1.6 8z"/><circle cx="8" cy="8" r="1.9"/>`, 14),
  task:    I(`<rect x="2.4" y="2.4" width="11.2" height="11.2" rx="3"/><path d="M5.4 8.1 7.2 9.9l3.5-3.8"/>`, 14),
  moon:    I(`<path d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.9 5.9 0 1 0 7 7z"/>`),
  sun:     I(`<circle cx="8" cy="8" r="3.1"/><path d="M8 1.4v1.3M8 13.3v1.3M14.6 8h-1.3M2.7 8H1.4M12.7 3.3l-.9.9M4.2 11.8l-.9.9M12.7 12.7l-.9-.9M4.2 4.2l-.9-.9"/>`),
  x:       I(`<path d="M4 4l8 8M12 4l-8 8"/>`, 13),
  plus:    I(`<path d="M8 3.4v9.2M3.4 8h9.2"/>`, 14),
  minus:   I(`<path d="M3.4 8h9.2"/>`, 14),
  fit:     I(`<path d="M2.6 6V3.4a.8.8 0 0 1 .8-.8H6M10 2.6h2.6a.8.8 0 0 1 .8.8V6M13.4 10v2.6a.8.8 0 0 1-.8.8H10M6 13.4H3.4a.8.8 0 0 1-.8-.8V10"/>`, 14),
  heat:    I(`<path d="M8 1.9c2.2 2.5 1 3.9.4 4.6-1 1.2-1.4 2-1.4 2.9a2.6 2.6 0 0 0 5.2 0c0-.7-.2-1.2-.5-1.7 1.6 1 2.5 2.5 2.5 4A5.8 5.8 0 0 1 2.4 12c0-3.4 2-5 3.2-6.6C6.7 4 7.8 2.9 8 1.9z"/>`, 15),
  gate:    I(`<rect x="3" y="7" width="10" height="6.4" rx="1.6"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7"/>`, 14),
  wrench:  I(`<path d="M10.4 2.4a3.6 3.6 0 0 0-3.2 5.3L2.6 12.3a1.3 1.3 0 0 0 1.9 1.8l4.6-4.6a3.6 3.6 0 0 0 4.4-4.9l-2 2-1.9-.4-.4-1.9z"/>`, 15),
};

/* ─────────────────────────────────────────────────────────────── state ── */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  mode: "system",           // system | product
  view: "loop",
  sel: null,                // { t, id }
  heat: true,
  /* show a path only if it carries at least this much of the traffic leaving
     its source. 100 = the idealised circle you drew. 0 = everything that has
     ever actually happened. Honesty is a dial, not a toggle. */
  thresh: 100,
  writes: true,             // the inward spokes and the corpus in the middle
  zoom: 1, px: 0, py: 0,
  ws: "email-agent", wsOpen: false,
  panelOpen: false,
  theme: null,
  /* the prompt sheet that floats over the flowchart */
  docStack: [],             // markdown pages, deepest last
  drafts: {},               // path -> unsaved text
  editing: false,           // false = read, true = write
};
const PANEL_W = 412;

/* one loop. There is no descending into a process any more: a process is a
   prompt, and a prompt opens as a document, not as another diagram. */
function model() {
  return { states: STATES, procs: PROCS, paths: PATHS, corpora: CORPORA };
}
const stateById = (id) => STATES.find((s) => s.id === id);
const procById = (id) => PROCS.find((p) => p.id === id);
const issueById = (id) => ISSUES.find((i) => i.id === id);
const pathById = (id) => PATHS.find((p) => p.id === id);
const corpusById = (id) => CORPORA.find((c) => c.id === id);
const brokenProcs = () => PROCS.filter((p) => p.broken);

/* a path is worth drawing into the definition once it stops being an
   exception. Same number as the hot-edge threshold, on purpose. */
const PROMOTE = .25;
const visiblePaths = () => PATHS.filter((p) => p.share * 100 >= state.thresh);
const undrawn = () => PATHS.filter((p) => !p.drawn);
const shouldDraw = () => PATHS.filter((p) => !p.drawn && p.share >= PROMOTE);

/* Emissions are never authored. Every process declares the paths it writes to,
   every corpus declares its glob, and the spoke is whatever matches. Delete a
   writesTo line and the spoke goes with it. */
function emissions() {
  const out = [];
  PROCS.forEach((p) => (p.writesTo || []).forEach((w) => {
    const c = CORPORA.find((c) => c.glob === w.glob);
    if (c) out.push({ id: `${p.id}~${c.id}`, proc: p, corpus: c, what: w.what, note: w.note });
  }));
  return out;
}
const emissionById = (id) => emissions().find((e) => e.id === id);
const emitsInto = (cid) => emissions().filter((e) => e.corpus.id === cid);

/* ────────────────────────────────────────────────────────────── chrome ── */

function paintSidebar() {
  const w = WORKSPACES.find((x) => x.id === state.ws) || WORKSPACES[0];
  $("#wsWrap").innerHTML = `
    <button class="ws-id ${state.wsOpen ? "open" : ""}" id="wsBtn">
      <div class="av sq" style="--h:${w.h}" data-i="${w.i}"></div>
      <div class="ws-txt">
        <span class="ws-name">${esc(w.name)}</span>
        <span class="ws-sub">${esc(w.sub)}</span>
      </div>
      <span class="ws-chev">${ICONS.chevD}</span>
    </button>` + (state.wsOpen ? `
    <div class="ws-pop" id="wsPop">
      ${WORKSPACES.map((x) => `<button class="ws-opt" data-ws="${x.id}">
        <div class="av sq" style="--h:${x.h}" data-i="${x.i}"></div>
        <div class="ws-txt"><span class="ws-name" style="font-size:12.5px">${esc(x.name)}</span>
        <span class="ws-sub">${esc(x.sub)}</span></div>
        ${x.id === state.ws ? `<span class="tick">${ICONS.check}</span>` : ""}
      </button>`).join("")}
      <div class="side-sep"></div>
      <button class="ws-new" id="wsNew">${ICONS.plus}New product</button>
    </div>` : "");

  $("#wsBtn").onclick = (e) => { e.stopPropagation(); state.wsOpen = !state.wsOpen; paintSidebar(); };
  if (state.wsOpen) {
    $("#wsPop").querySelectorAll("[data-ws]").forEach((b) => (b.onclick = () => {
      state.ws = b.dataset.ws; state.wsOpen = false; state.sel = null; paint(); fit();
    }));
    $("#wsNew").onclick = () => { state.wsOpen = false; paintSidebar(); toast("New product workspace"); };
  }

  $("#modeSeg").innerHTML = ["system", "product"]
    .map((m) => `<button data-mode="${m}" class="${state.mode === m ? "on" : ""}">
      ${m === "system" ? ICONS.wrench : ICONS.list}${m === "system" ? "System" : "Product"}</button>`).join("");
  $("#modeSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  $("#sideNav").innerHTML = `<div class="rsec">${state.mode === "system" ? "Definition" : "Work"}</div>` +
    NAV[state.mode].map((n) => `
      <button class="snav ${state.view === n.id ? "active" : ""}" data-view="${n.id}">
        ${ICONS[n.icon]}<span>${n.label}</span>
        ${n.n != null ? `<span class="snav-n ${n.loud ? "loud" : ""}">${n.n}</span>` : ""}
      </button>`).join("");
  $("#sideNav").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.view = b.dataset.view; state.sel = null; paint(); }));

  $("#sideNavFoot").innerHTML = `
    <button class="snav" id="navGraph">${ICONS.sparkle}<span>Graph queries</span></button>
    <button class="snav" id="navSet">${ICONS.gate}<span>Integrations</span></button>`;
  $("#navGraph").onclick = () => toast("Blast radius, coverage gaps, collisions");
  $("#navSet").onclick = () => toast("Orca · GitHub · Linear");
}

function paintToolbar() {
  $("#tbNav").innerHTML =
    `<button class="ico dim">${ICONS.chevL}</button><button class="ico dim">${ICONS.chevR}</button>`;

  const modeLbl = state.mode === "system" ? "System" : "Product";
  const viewLbl = (NAV[state.mode].find((n) => n.id === state.view) || {}).label || state.view;
  const doc = state.docStack[state.docStack.length - 1];
  $("#crumb").innerHTML = `<span class="dim">${modeLbl}</span> › ${esc(viewLbl)}` +
    (doc ? ` › <span class="dim">${esc(docTitle(doc))}</span>` : "");

  const isLoop = state.view === "loop";
  const nVis = visiblePaths().length;
  /* the honesty dial. 100% is the circle you drew, 0% is everything that has
     ever happened, and dragging between them animates one into the other. */
  $("#tbActs").innerHTML = (isLoop ? `
    <button class="tb-btn ${state.heat ? "on" : ""}" id="heatBtn">${ICONS.heat}Heat</button>
    <button class="tb-btn ${state.writes ? "on" : ""}" id="wrBtn">${ICONS.doc}Writes</button>
    <span class="tb-div"></span>
    <span class="tb-sl" title="Show paths carrying at least this share of the traffic">
      <span class="tb-sl-l">Paths ≥</span>
      <input type="range" id="thSl" min="0" max="100" step="1" value="${state.thresh}">
      <span class="tb-sl-v">${state.thresh}%</span>
      <span class="tb-sl-n ${nVis ? "on" : ""}">${nVis ? `${nVis} off-rim` : "clean circle"}</span>
    </span>
    <span class="tb-div"></span>` : "") + `
    <button class="ico" id="themeBtn" title="Theme">${ICONS.moon}</button>`;
  if (isLoop) {
    $("#heatBtn").onclick = () => { state.heat = !state.heat; paint(); };
    $("#wrBtn").onclick = () => { state.writes = !state.writes; paint(); };
    /* repaint the canvas only while dragging, or the slider loses the pointer */
    $("#thSl").oninput = (e) => {
      state.thresh = +e.target.value;
      $(".tb-sl-v").textContent = `${state.thresh}%`;
      const n = visiblePaths().length;
      const chip = $(".tb-sl-n");
      chip.textContent = n ? `${n} off-rim` : "clean circle";
      chip.classList.toggle("on", !!n);
      paintLoop();
    };
  }
  $("#themeBtn").onclick = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
  };
}

function paintStrip() {
  const bad = brokenProcs();
  $("#stripLeft").textContent = state.mode === "system"
    ? `${REPO.name} · system ${REPO.sysVersion} · 6 runbooks, 12 skills, ${ISSUES.length} open issues`
    : `${REPO.name} · ${REPO.branch} · 314 slices · 436 needs · 301 decisions`;
  const chip = $("#lintChip");
  const due = shouldDraw();
  chip.className = "strip-guard" + (bad.length ? " bad" : "");
  chip.textContent = bad.length ? `${bad.length} broken wire` : "Contracts clean";
  /* the diff between the loop you drew and the loop that runs */
  const dchip = $("#driftChip");
  if (dchip) {
    dchip.className = "strip-guard drift" + (due.length ? " warn" : "");
    dchip.textContent = undrawn().length
      ? `${undrawn().length} undrawn path${undrawn().length > 1 ? "s" : ""}${due.length ? ` · ${due.length} over ${Math.round(PROMOTE * 100)}%` : ""}`
      : "Drawn matches observed";
    dchip.onclick = () => {
      const t = due[0] || undrawn()[0]; if (!t) return;
      state.mode = "system"; state.view = "loop"; closeEditor(true);
      state.thresh = Math.min(state.thresh, Math.round(t.share * 100));
      state.sel = { t: "path", id: t.id }; paint();
    };
  }
  chip.onclick = () => { if (bad.length) { state.mode = "system"; state.view = "loop"; closeEditor(true); state.sel = { t: "proc", id: bad[0].id }; paint(); } };
  $("#modeChip").innerHTML = `${state.mode === "system" ? ICONS.wrench : ICONS.list}${state.mode === "system" ? "System mode" : "Product mode"}`;
  $("#modeChip").onclick = () => setMode(state.mode === "system" ? "product" : "system");
}

function setMode(m) {
  if (state.mode === m) return;
  state.mode = m; state.view = "loop"; state.sel = null; closeEditor(true);
  paint(); fit();
}

/* ═════════════════════════════════════════════════════════════ the loop ══
   Nodes sit on an ellipse. Edges are arcs of that same ellipse, so the whole
   thing reads as one circuit rather than a graph that happens to be round.
   The process box sits at the middle of its arc, on the line. */

function geo(m) {
  const n = m.states.length;
  const P = state.mode === "product"
    ? { rx: 520, ry: 330, nw: 232, nh: 178, d: 22 }
    : { rx: 420, ry: 268, nw: 198, nh: 80, d: 17 };
  /* the extra room is for the skip arcs, which ride outside the rim */
  const padX = P.nw / 2 + 46 + 36, padY = P.nh / 2 + 30 + 36;
  return { ...P, n, W: 2 * P.rx + 2 * padX, H: 2 * P.ry + 2 * padY, cx: P.rx + padX, cy: P.ry + padY };
}

const RAD = Math.PI / 180;

function paintLoop() {
  const m = model(), G = geo(m);
  const step = 360 / G.n;
  const ang = (i) => (-90 + i * step) * RAD;
  const pt = (a, k = 1) => [G.cx + G.rx * k * Math.cos(a), G.cy + G.ry * k * Math.sin(a)];
  const idx = {}; m.states.forEach((s, i) => (idx[s.id] = i));

  /* ── wires ──
     The faint full ellipse under everything is the track. Without it the arcs
     read as six disconnected fragments instead of one circuit. */
  let paths = `<ellipse class="track" cx="${G.cx}" cy="${G.cy}" rx="${G.rx}" ry="${G.ry}"/>`, labels = "";
  m.procs.forEach((p) => {
    const a0 = ang(idx[p.from]), a1 = ang(idx[p.to]);
    let s = a0 + G.d * RAD, e = a1 - G.d * RAD;
    if (e < s) e += 360 * RAD;                       // the closing arc
    const [x1, y1] = pt(s), [x2, y2] = pt(e);
    const big = e - s > Math.PI ? 1 : 0;
    const hot = state.heat && p.fail >= .25 ? " hot" : "";
    const cls = p.broken ? "wire err" : "wire" + hot;
    const mk = p.broken ? "arrowE" : (hot ? "arrowH" : "arrow");
    paths += `<path class="${cls}" id="w-${p.id}" d="M${x1},${y1} A${G.rx},${G.ry} 0 ${big} 1 ${x2},${y2}" marker-end="url(#${mk})"/>`;
  });

  /* ── nodes ── */
  let nodes = "";
  m.states.forEach((s, i) => {
    const [x, y] = pt(ang(i));
    const L = x - G.nw / 2, T = y - G.nh / 2;
    const sel = state.sel && state.sel.t === "node" && state.sel.id === s.id ? " sel" : "";
    const feeds = m.procs.filter((p) => p.to === s.id || p.from === s.id);
    const wrong = feeds.filter((p) => p.broken && p.from === s.id);

    if (state.mode === "product") {
      const rows = (ITEMS[s.id] || []).slice(0, 4).map((it) => {
        const isel = state.sel && state.sel.t === "item" && state.sel.id === it.id ? " sel" : "";
        return `<div class="nd-row${isel}" data-item="${it.id}" data-state="${s.id}">
          <span class="nd-dot ${it.d}"></span>
          <span class="nd-id">${esc(it.id)}</span>
          <span class="nd-nm">${esc(it.t)}</span></div>`;
      }).join("");
      const more = s.count - Math.min(4, (ITEMS[s.id] || []).length);
      nodes += `<div class="nd list${sel}" data-node="${s.id}" style="left:${L}px;top:${T}px;width:${G.nw}px;height:${G.nh}px">
        <div class="nd-h">${ICONS[s.icon]}<span class="nd-t">${esc(s.name)}</span><span class="nd-n">${s.count}</span></div>
        <div class="nd-rows">${rows}</div>
        ${more > 0 ? `<div class="nd-more">${more} more</div>` : ""}
      </div>`;
    } else {
      nodes += `<div class="nd${sel}" data-node="${s.id}" style="left:${L}px;top:${T}px;width:${G.nw}px;min-height:${G.nh}px">
        <div class="nd-h">${ICONS[s.icon]}<span class="nd-t">${esc(s.name)}</span><span class="nd-n">${s.count}</span></div>
        <div class="nd-g mono">${esc(s.glob)}</div>
        ${wrong.length ? `<div class="nd-warn">shape misses a field ${esc(wrong[0].name)} reads</div>` : ""}
      </div>`;
    }
  });

  /* ── processes: the box on the line ── */
  let procs = "";
  m.procs.forEach((p) => {
    const i0 = idx[p.from], i1 = idx[p.to];
    let a0 = ang(i0) + G.d * RAD, a1 = ang(i1) - G.d * RAD;
    if (a1 < a0) a1 += 360 * RAD;
    const [x, y] = pt((a0 + a1) / 2);
    const sel = state.sel && state.sel.t === "proc" && state.sel.id === p.id ? " sel" : "";
    const nIssues = (p.issues || []).length;
    const inflight = stateById(p.from) ? stateById(p.from).count : 0;
    const badge = state.mode === "system"
      ? (nIssues ? `<span class="pr-b ${nIssues < 3 ? "amb" : ""}">${nIssues}</span>` : "")
      : (inflight ? `<span class="pr-b amb" style="background:var(--raise);color:var(--text-2)">${inflight}</span>` : "");
    const rate = Math.round(p.fail * 100);
    procs += `<div class="pr${sel}${p.broken ? " err" : ""}" data-proc="${p.id}" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%)">
      <span class="pr-k ${p.kind === "runbook" ? "rb" : ""}">${p.kind === "runbook" ? ICONS.book : ICONS.sparkle}</span>
      <span class="pr-t">${esc(p.name)}</span>
      ${badge}
      <button class="pr-run" data-run="${p.id}" title="Run over ${inflight} items">${ICONS.play}</button>
      ${state.heat ? `<span class="pr-bar"><i class="${rate >= 25 ? "hi" : rate >= 10 ? "" : "lo"}" style="width:${Math.max(3, rate)}%"></i></span>` : ""}
    </div>`;
  });

  /* ── chords: transitions that do not lie on the rim ──
     Direction carries the meaning. A skip runs with the flow and rides OUTSIDE
     the ring because it is the faster route; a rework runs against it and rides
     INSIDE because it is the slower one. Stroke weight is traffic share, so the
     rim stays the thick line and the thing still reads as a circle from across
     the room. Dotted (not dashed) means observed but never drawn: long red
     dashes already mean broken wire and that signal is not for sharing. */
  let chords = "", chordLbls = "";
  visiblePaths().forEach((p) => {
    const a0 = ang(idx[p.from]);
    let d = ang(idx[p.to]) - a0;
    while (d <= 0.001) d += 360 * RAD;              // forward sweep
    if (p.kind !== "skip") d -= 360 * RAD;          // rework runs backwards
    const a1 = a0 + d, mid = a0 + d / 2, out = p.kind === "skip";
    /* A lane, not a bow. The path rides a concentric ellipse the whole way, so
       it clears the station boxes instead of cutting through them, and it keeps
       the rim's own visual language. The longer a rework reaches, the tighter
       the lane it takes, which also stops two chords over the same mid-angle
       landing on top of each other. */
    const reach = Math.abs(d) / Math.PI;
    const k = out ? 1.22 : .82 - .14 * reach;
    const [x1, y1] = pt(a0, k), [x2, y2] = pt(a1, k);
    /* long chords slide their chip round the lane so it does not stack */
    const far = reach > .6;
    const lAng = mid + (far ? Math.sign(d) * 28 * RAD : 0);
    const [lx, ly] = pt(lAng, k - (far && !out ? .10 : 0));
    const big = Math.abs(d) > Math.PI ? 1 : 0, sweep = d > 0 ? 1 : 0;
    const due = !p.drawn && p.share >= PROMOTE;
    const sel = state.sel && state.sel.t === "path" && state.sel.id === p.id ? " sel" : "";
    chords += `<path class="chord ${p.drawn ? "drawn" : "obs"}${due ? " due" : ""}${sel}" id="x-${p.id}"
      style="stroke-width:${(1 + p.share * 7).toFixed(2)}px"
      d="M${x1},${y1} A${(G.rx * k).toFixed(1)},${(G.ry * k).toFixed(1)} 0 ${big} ${sweep} ${x2},${y2}"
      marker-end="url(#${due ? "arrowH" : "arrowT"})"/>`;
    chordLbls += `<div class="chl ${p.drawn ? "drawn" : "obs"}${due ? " due" : ""}${sel}" data-path="${p.id}"
      style="left:${lx}px;top:${ly}px"><span class="chl-n">${esc(p.name)}</span><span class="chl-p">${Math.round(p.share * 100)}%</span></div>`;
  });

  /* ── the middle ──
     The interior is not routing space, it is the corpus. A process that writes
     a fact rather than moving an artifact draws a short spoke inward instead of
     a long arc back round the rim. `merged updates the spec` is one of these,
     and so is the one edge that rewrites the loop itself — which finally has a
     picture, because the centre is a place rather than a node in the flow. */
  let spokes = "", corpus = "";
  if (state.writes) {
    const CW = 178, CH = 34, gap = 9, n = m.corpora.length;
    const top = G.cy - (n * CH + (n - 1) * gap) / 2;
    const at = {};
    m.corpora.forEach((c, i) => { at[c.id] = [G.cx, top + i * (CH + gap) + CH / 2]; });

    emissions().forEach((e) => {
      let b0 = ang(idx[e.proc.from]) + G.d * RAD, b1 = ang(idx[e.proc.to]) - G.d * RAD;
      if (b1 < b0) b1 += 360 * RAD;
      const [sx, sy] = pt((b0 + b1) / 2);
      const [ex, ey] = at[e.corpus.id];
      const sel = state.sel && state.sel.t === "emit" && state.sel.id === e.id ? " sel" : "";
      spokes += `<path class="spoke${e.corpus.self ? " self" : ""}${sel}" d="M${sx},${sy} L${ex},${ey}"/>
        <circle class="spoke-d${sel}" cx="${sx}" cy="${sy}" r="2.6"/>`;
    });

    corpus = `<div class="cor-cap" style="left:${G.cx}px;top:${top - 20}px">written into</div>`;
    m.corpora.forEach((c) => {
      const [x, y] = at[c.id];
      const sel = state.sel && state.sel.t === "corpus" && state.sel.id === c.id ? " sel" : "";
      corpus += `<div class="cor${c.self ? " self" : ""}${sel}" data-corpus="${c.id}"
        style="left:${x}px;top:${y}px;width:${CW}px;height:${CH}px">
        ${ICONS[c.icon]}<span class="cor-t">${esc(c.name)}</span><span class="cor-n">${c.count}</span></div>`;
    });
  }

  $("#main").innerHTML = `
    <div class="lp" id="lp">
      <div class="lp-world" id="world" style="width:${G.W}px;height:${G.H}px">
        <svg class="lp-svg" width="${G.W}" height="${G.H}">
          <defs>
            ${["arrow:var(--wire)", "arrowA:var(--accent)", "arrowE:var(--red)", "arrowH:var(--amber)", "arrowS:var(--wire)", "arrowT:var(--wire)"]
              .map((d) => { const [id, c] = d.split(":");
                return `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,1 L9,5 L0,9 z" style="fill:${c}${id === "arrowS" ? ";opacity:.62" : ""}"/></marker>`; }).join("")}
          </defs>
          ${paths}${spokes}${chords}
        </svg>
        ${nodes}${procs}${corpus}${chordLbls}${labels}
      </div>
      <div class="lp-tools">
        <button class="ico" id="zOut">${ICONS.minus}</button>
        <button class="ico" id="zFit">${ICONS.fit}</button>
        <button class="ico" id="zIn">${ICONS.plus}</button>
      </div>
    </div>`;

  wireLoop();
  applyTransform();
}

function wireLoop() {
  const lp = $("#lp"), world = $("#world");

  world.querySelectorAll("[data-node]").forEach((el) => {
    el.onclick = (e) => { if (e.target.closest("[data-item]")) return; state.sel = { t: "node", id: el.dataset.node }; paint(); };
  });
  /* in Product mode an item is a file, so one click opens it. The station list
     stays floating beside it as the way to move between files. */
  world.querySelectorAll("[data-item]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); openItemDoc(el.dataset.item, el.dataset.state); };
  });
  world.querySelectorAll("[data-proc]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("[data-run]")) return;
      state.sel = { t: "proc", id: el.dataset.proc }; paint();
    };
    /* double-click goes straight to the prompt, since that is what a process is */
    el.ondblclick = () => { state.sel = { t: "proc", id: el.dataset.proc }; openEditor(el.dataset.proc); };
  });
  world.querySelectorAll("[data-run]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); runProc(el.dataset.run); };
  });
  world.querySelectorAll("[data-path]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); state.sel = { t: "path", id: el.dataset.path }; paint(); };
  });
  world.querySelectorAll("[data-corpus]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); state.sel = { t: "corpus", id: el.dataset.corpus }; paint(); };
  });

  $("#zIn").onclick = () => zoomBy(1.18);
  $("#zOut").onclick = () => zoomBy(1 / 1.18);
  $("#zFit").onclick = fit;

  /* pan on the background, zoom under the cursor */
  let down = null;
  lp.addEventListener("mousedown", (e) => {
    if (e.target.closest(".nd, .pr, .cor, .chl, .lp-tools")) return;
    down = { x: e.clientX, y: e.clientY, px: state.px, py: state.py };
    lp.classList.add("drag");
  });
  window.addEventListener("mousemove", (e) => {
    if (!down) return;
    state.px = down.px + (e.clientX - down.x); state.py = down.py + (e.clientY - down.y);
    applyTransform();
  });
  window.addEventListener("mouseup", () => { down = null; lp.classList.remove("drag"); });
  lp.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = lp.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * .0016), z = clamp(state.zoom * k, .28, 2.2);
    const f = z / state.zoom;
    state.px = mx - (mx - state.px) * f; state.py = my - (my - state.py) * f;
    state.zoom = z; applyTransform();
  }, { passive: false });
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let animT = null;
function applyTransform(anim) {
  const w = $("#world");
  if (!w) return;
  if (anim) { w.classList.add("anim"); clearTimeout(animT); animT = setTimeout(() => w.classList.remove("anim"), 420); }
  w.style.transform = `translate(${state.px}px, ${state.py}px) scale(${state.zoom})`;
}

function zoomBy(k) {
  const lp = $("#lp"); if (!lp) return;
  const r = lp.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2;
  const z = clamp(state.zoom * k, .28, 2.2), f = z / state.zoom;
  state.px = mx - (mx - state.px) * f; state.py = my - (my - state.py) * f;
  state.zoom = z; applyTransform();
}

/* the loop re-centres into whatever space is left once the panels float in */
function fit(anim) {
  const lp = $("#lp"); if (!lp) return;
  const G = geo(model()), r = lp.getBoundingClientRect();
  const w = r.width - (state.sel ? PANEL_W - 22 : 0);
  const z = clamp(Math.min((w - 34) / G.W, (r.height - 34) / G.H), .5, 1.15);
  state.zoom = z;
  state.px = (w - G.W * z) / 2;
  state.py = (r.height - G.H * z) / 2;
  applyTransform(anim);
}

function runProc(id) {
  const p = procById(id);
  const w = $(`#w-${id}`);
  if (w) { w.classList.add("lit"); setTimeout(() => w.classList.remove("lit"), 1500); }
  const src = stateById(p.from);
  toast(`Running ${p.name} over ${src ? src.count : 0} items in ${src ? src.name : "?"}`);
}

/* ══════════════════════════════════════════════════════════ list views ══ */

const VIEWS = {
  runbooks: () => ({ title: "Runbooks", sub: "the processes on the lines, as files",
    rows: RUNBOOKS.map((p) => ({ t: p.name, s: `${p.from} → ${p.to} · ${p.trigger}`, r: `${p.runs} runs`, pill: p.issues.length ? `${p.issues.length} issues` : "clean", bad: p.issues.length > 2, sel: { t: "proc", id: p.id } })) }),
  skills: () => ({ title: "Skills", sub: "capabilities a process can call",
    rows: SKILLS.concat([{ name: "read spec section", from: "-", to: "-", trigger: "called", runs: 1902, issues: [] }, { name: "frontier query", from: "-", to: "-", trigger: "called", runs: 844, issues: [] }, { name: "blast radius", from: "-", to: "-", trigger: "called", runs: 96, issues: [] }])
      .map((p) => ({ t: p.name, s: `${p.trigger}`, r: `${p.runs} runs`, pill: p.broken ? "broken wire" : "clean", bad: !!p.broken, sel: p.id ? { t: "proc", id: p.id } : null })) }),
  issues: () => ({ title: "System issues", sub: "attributed to edges, never to states",
    rows: ISSUES.map((i) => ({ t: i.t, s: `on ${i.edge} · ${i.run}`, r: i.fix ? "fix proposed" : "", pill: i.cat, bad: i.cat === "skill-gap" || i.cat === "constraint-violation", sel: { t: "issue", id: i.id } })) }),
  history: () => ({ title: "System version history", sub: "separate from the repo's commit log",
    rows: HISTORY.map((h) => ({ t: h.t, s: h.s, r: h.v, pill: h.who, bad: false, sel: null })) }),
  frontier: () => ({ title: "Frontier", sub: "every need merged, no owns collision",
    rows: ITEMS.plans.filter((i) => i.d === "run").concat(ITEMS.plans.filter((i) => i.d !== "run"))
      .map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "run" ? "buildable" : "blocked", bad: false, sel: { t: "item", id: i.id, from: "plans" } })) }),
  slices: () => ({ title: "Slices", sub: "314 total · 273 merged · 41 planned",
    rows: [].concat(ITEMS.branch, ITEMS.pr, ITEMS.plans, ITEMS.merged)
      .map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "run" ? "running" : i.d === "wait" ? "waiting" : i.d === "bad" ? "failing" : "merged", bad: i.d === "bad", sel: { t: "item", id: i.id } })) }),
  specs: () => ({ title: "Specs", sub: "18 docs · 301 decisions · 434 citations",
    rows: ITEMS.spec.map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "bad" ? "ambiguous" : i.d === "wait" ? "gaps" : "covered", bad: i.d === "bad", sel: { t: "item", id: i.id, from: "spec" } })) }),
  runs: () => ({ title: "Runs", sub: "what the orchestrator is holding",
    rows: [].concat(ITEMS.branch, ITEMS.pr).map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "run" ? "running" : i.d === "wait" ? "waiting" : "failing", bad: i.d === "bad", sel: { t: "item", id: i.id } })) }),
};

function paintList() {
  const v = VIEWS[state.view]();
  $("#main").innerHTML = `
    <div class="lv">
      <div class="lv-head"><span class="lv-title">${esc(v.title)}</span><span class="lv-sub">${esc(v.sub)}</span></div>
      <div class="lv-rows">${v.rows.map((r, k) => `
        <button class="lrow ${state.sel && r.sel && state.sel.id === r.sel.id ? "sel" : ""}" data-k="${k}">
          <div class="lrow-b">
            <div class="lrow-t">${esc(r.t)}</div>
            <div class="lrow-s">${esc(r.s)}</div>
          </div>
          <div class="lrow-r">
            ${r.r ? `<span>${esc(r.r)}</span>` : ""}
            <span class="pill plain ${r.bad ? "bad" : ""}" ${r.bad ? "" : 'style="color:var(--text-2)"'}>${esc(r.pill)}</span>
          </div>
        </button>`).join("")}</div>
    </div>`;
  $("#main").querySelectorAll(".lrow").forEach((b, k) => {
    b.onclick = () => {
      const s = v.rows[k].sel;
      if (s && s.t === "item") { openItemDoc(s.id, s.from); return; }   /* a file opens as a file */
      state.sel = s; paint();
    };
    b.ondblclick = () => { const s = v.rows[k].sel; if (s && s.t === "proc") openEditor(s.id); };
  });
}

/* ══════════════════════════════════════════════════════════ inspector ══ */

function card(title, acts, body) {
  return `<div class="card"><div class="card-h"><span class="card-t">${title}</span><span class="card-a">${acts || ""}</span></div><div class="card-b">${body}</div></div>`;
}
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<div class="kv-r"><span class="kv-k">${esc(k)}</span><span class="kv-v">${v}</span></div>`).join("")}</div>`;


/* Product mode's node card shows four rows and a "N more" that used to lead
   nowhere. This is where the rest live. System mode keeps its node panel clean:
   there a state is a predicate, not a pile of things. */
const STATE_VIEW = {
  spec:   { mode: "product", view: "specs",    label: "Specs" },
  plans:  { mode: "product", view: "frontier", label: "Frontier" },
  branch: { mode: "product", view: "runs",     label: "Runs" },
  pr:     { mode: "product", view: "runs",     label: "Runs" },
  merged: { mode: "product", view: "slices",   label: "Slices" },
  feed:   { mode: "system",  view: "issues",   label: "System issues" },
};

function itemsCard(s, selId) {
  const list = ITEMS[s.id] || [];
  const out = PROCS.find((p) => p.from === s.id);
  const dest = STATE_VIEW[s.id];
  const rows = list.map((it) => `
    <button class="it-row ${selId === it.id ? "sel" : ""}" data-q="${esc((it.id + " " + it.t + " " + it.s).toLowerCase())}"
      onclick="selectItem('${it.id}','${s.id}')" ondblclick="openItemDoc('${it.id}','${s.id}')">
      <span class="nd-dot ${it.d}"></span>
      <span class="it-id mono">${esc(it.id)}</span>
      <span class="it-b"><span class="it-t">${esc(it.t)}</span><span class="it-s">${esc(it.s)}</span></span>
    </button>`).join("");

  return card(`In ${esc(s.name)}`, `<span class="pill plain" style="color:var(--text-2)">${s.count}</span>`, `
    <input class="it-filter" placeholder="Filter ${list.length} items" oninput="filterItems(this)" />
    <div class="it-list">${rows}</div>
    <div class="it-foot">
      <span>${list.length < s.count ? `Showing ${list.length} of ${s.count}` : `All ${s.count}`}</span>
      ${dest ? `<a class="lnk" onclick="gotoList('${dest.mode}','${dest.view}')">Open in ${esc(dest.label)}</a>` : ""}
    </div>
    ${out ? `<div class="acts-row"><button class="btn wide" onclick="runProc('${out.id}')">${ICONS.play} ${esc(out.name)} over all ${s.count}</button></div>` : ""}`);
}

/* clicking a row in the station list is the same gesture as clicking one in the
   node or the list view: open that file */
function selectItem(id, from) { openItemDoc(id, from); }

function openItemDoc(id, from) {
  const home = from || itemHome({ id });
  const it = (ITEMS[home] || []).find((x) => x.id === id);
  if (!it) return;
  const path = itemDocPath(it, home);
  if (!DOCS[path]) DOCS[path] = { title: it.t, body: itemBody(it, home), item: { id, from: home } };
  state.sel = { t: "item", id, from: home };
  state.docStack = [path]; state.editing = false;
  paint();
}

function gotoList(mode, view) {
  state.mode = mode; state.view = view; state.sel = null; closeEditor(true); paint();
}

/* filtering is a DOM pass, not a repaint, so the field keeps focus */
function filterItems(inp) {
  const q = inp.value.trim().toLowerCase();
  inp.parentElement.querySelectorAll(".it-row").forEach((r) => {
    r.style.display = !q || r.dataset.q.includes(q) ? "" : "none";
  });
}

function paintPanels() {
  const P = $("#panels"), s = state.sel;
  P.classList.toggle("open", !!s);
  if (!s) return;                                   /* nothing selected, nothing floats */

  const inProduct = state.mode === "product";
  const home = s.t === "item" ? stateById(itemHome(s)) : null;
  P.innerHTML =
      s.t === "node"  ? nodePanel(stateById(s.id)) + (inProduct && stateById(s.id) ? itemsCard(stateById(s.id)) : "")
    : s.t === "proc"  ? procPanel(procById(s.id))
    : s.t === "issue" ? issuePanel(issueById(s.id))
    /* the item's own details live in the file that is already open in the main
       pane, so the panel is only the list you navigate with */
    : s.t === "path"   ? pathPanel(pathById(s.id))
    : s.t === "corpus" ? corpusPanel(corpusById(s.id))
    : s.t === "item"  ? (inProduct && home ? itemsCard(home, s.id) : itemPanel(s))
    : "";

  /* one dismiss, on the first card, so the panels read as transient */
  /* keep the row you are reading visible in the list you are steering with */
  const cur = P.querySelector(".it-row.sel");
  if (cur) cur.scrollIntoView({ block: "nearest" });

  const first = P.querySelector(".card-a");
  if (first) {
    const x = document.createElement("button");
    x.className = "pnl-x"; x.title = "Close (Esc)"; x.innerHTML = ICONS.x;
    x.onclick = () => { state.sel = null; closeEditor(true); paint(); };
    first.appendChild(x);
  }
}

/* a sparkline of median dwell over the last eight weeks. Small, unlabelled,
   and only there to say which direction the number is heading. */
function spark(vals) {
  const w = 74, h = 20, lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 2 - ((v - lo) / r) * (h - 4)}`).join(" ");
  const rising = vals[vals.length - 1] > vals[0];
  const last = pts.split(" ").pop().split(",");
  return `<svg class="spark ${rising ? "up" : "down"}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2" fill="currentColor"/></svg>`;
}

function nodePanel(s) {
  const m = model();
  const into = m.procs.filter((p) => p.to === s.id), out = m.procs.filter((p) => p.from === s.id);
  const missing = out.filter((p) => p.broken);
  const d = s.dwell;
  const net = d ? d.inW - d.outW : 0;
  const flow = net > 0 ? `queue growing +${net}/wk` : net < 0 ? `draining ${net}/wk` : "steady";
  const flowCls = net > 0 ? "waiting" : net < 0 ? "running" : "done";

  return card("State", "", `
    <div class="c-n">${esc(s.name)}</div>
    <div class="c-r mono">${esc(s.glob)}</div>
    ${kv([["Holds", `${s.count} items`],
          ["Arrives by", into.map((p) => esc(p.name)).join(", ") || "—"],
          ["Leaves by", out.map((p) => esc(p.name)).join(", ") || "—"]])}
    <div class="kv"><div class="kv-r"><span class="kv-k">Shape</span><span class="kv-v"><span class="fields">
      ${s.shape.map((f) => `<span class="f">${esc(f)}</span>`).join("")}</span></span></div></div>

    ${d ? `
    <div class="kv">
      <div class="sub-h">Throughput</div>
      <div class="dwell">
        <div class="dwell-n">${esc(d.median)}</div>
        <div class="dwell-l">median time here</div>
        <div class="dwell-s">${spark(d.trend)}</div>
      </div>
      <div class="kv-r"><span class="kv-k">Slowest 10%</span><span class="kv-v">${esc(d.p90)}</span></div>
      <div class="kv-r"><span class="kv-k">Oldest here</span><span class="kv-v">${esc(d.oldest)}</span></div>
      <div class="kv-r"><span class="kv-k">Flow</span><span class="kv-v">
        ${d.inW}/wk in · ${d.outW}/wk out <span class="pill ${flowCls}" style="margin-left:6px">${esc(flow)}</span>
      </span></div>
      ${d.note ? `<div class="dwell-note">${esc(d.note)}</div>` : ""}
    </div>` : ""}

    ${missing.length ? `<div class="kv"><div class="irow"><div class="irow-b">
        <div class="irow-t"><b>${esc(missing[0].name)}</b> ${esc(missing[0].broken)}</div>
        <div class="irow-m"><span class="cat gap">broken wire</span></div>
      </div></div></div>` : ""}
    <div class="acts-row">
      <button class="btn" onclick="state.mode='${state.mode === "system" ? "product" : "system"}';state.view='loop';paint();fit(true)">
        ${state.mode === "system" ? "See what's here" : "See the definition"}</button>
      <button class="btn ghost" onclick="toast('Blast radius from ${esc(s.name)}')">Blast radius</button>
    </div>`);
}

function procPanel(p) {
  const src = stateById(p.from), dst = stateById(p.to);
  const rate = Math.round(p.fail * 100);
  const issues = (p.issues || []).map(issueById).filter(Boolean);
  const file = promptFile(p), nTasks = parseTasks(docBody(file)).length, nPages = childPages(file).length;
  return card("Process", `<span class="tagm ${p.kind === "runbook" ? "rb" : "sk"}">${p.kind}</span>`, `
    <div class="c-n">${esc(p.name)}</div>
    <div class="c-r">${esc(src ? src.name : p.from)} → ${esc(dst ? dst.name : p.to)}</div>
    ${kv([["Trigger", esc(p.trigger)], ["Runner", esc(p.runner)], ["Median", esc(p.median)], ["Runs", `${p.runs}`],
          ["Prompt", `<a class="lnk" onclick="openEditor('${p.id}')">${esc(file)}</a>
            <span style="color:var(--text-3)"> · ${nTasks} tasks${nPages ? ` · ${nPages} pages` : ""}</span>`],
          ["Issues", issues.length
            ? `<a class="lnk" onclick="state.view='issues';state.sel=null;paint()">${issues.length} on this edge</a>`
            : `<span style="color:var(--text-3)">none</span>`]])}

    <div class="kv">
      <div class="kv-r"><span class="kv-k">Reads</span><span class="kv-v"><span class="fields">
        ${p.reads.map((f) => `<span class="f ${src && src.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}
      </span></span></div>
      <div class="kv-r"><span class="kv-k">Writes</span><span class="kv-v"><span class="fields">
        ${p.writes.map((f) => `<span class="f ${dst && dst.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}
      </span></span></div>
      ${p.broken ? `<div class="kv-r"><span class="kv-k"></span><span class="kv-v" style="color:var(--red);font-size:11.5px">
        Broken wire: ${esc(p.broken)}. Caught before dispatch, not after a bad run.</span></div>` : ""}
    </div>

    <div class="kv"><div class="kv-r"><span class="kv-k">Send-backs</span><span class="kv-v">
      <div class="meter"><div class="meter-bar"><i class="${rate >= 25 ? "hi" : rate >= 10 ? "" : "lo"}" style="width:${Math.max(3, rate)}%"></i></div>
      <span class="meter-n">${rate}%</span></div></span></div></div>

    <div class="acts-row">
      <button class="btn pri" onclick="runProc('${p.id}')">${ICONS.play} Run now</button>
      <button class="btn" onclick="openEditor('${p.id}')">${ICONS.pencil} Edit prompt</button>
    </div>`);
}

/* ═════════════════════════════════════════════════════════ off-rim paths ══ */

function drawPath(id) {
  const p = pathById(id); if (!p) return;
  p.drawn = true;
  state.thresh = Math.min(state.thresh, Math.round(p.share * 100));
  paint();
  toast(`${p.name} is part of the definition now. system/loop.md bumped to v42.`);
}
function undrawPath(id) {
  const p = pathById(id); if (!p) return;
  p.drawn = false; paint();
  toast(`${p.name} dropped back to observed-only.`);
}

function pathPanel(p) {
  if (!p) return "";
  const src = stateById(p.from), dst = stateById(p.to);
  const pct = Math.round(p.share * 100);
  const due = !p.drawn && p.share >= PROMOTE;
  const geoNote = p.kind === "skip"
    ? "Runs with the flow, so it is drawn outside the rim: this is the faster route."
    : "Runs against the flow, so it is drawn inside the rim: this is the slower route.";
  return card("Path", `<span class="tagm ${p.kind === "skip" ? "sk" : "rb"}">${esc(p.kind)}</span>`, `
    <div class="c-n">${esc(p.name)}</div>
    <div class="c-r">${esc(src ? src.name : p.from)} → ${esc(dst ? dst.name : p.to)}</div>
    ${kv([["Share", `<b>${pct}%</b> of what leaves ${esc(src ? src.name : p.from)}`],
          ["Observed", `${p.runs} times over ${esc(p.since)}`],
          ["In the definition", p.drawn
            ? `<span style="color:var(--green)">drawn</span>`
            : `<span style="color:var(--amber)">observed only</span>`],
          ["Attributed to", p.proc ? esc((procById(p.proc) || {}).name || p.proc) : `<span style="color:var(--text-3)">no process</span>`]])}
    <div class="c-r" style="margin-top:2px">${esc(p.note)}</div>
    <div class="c-r dimr">${esc(geoNote)}</div>
    ${due ? `<div class="due-note">Over ${Math.round(PROMOTE * 100)}%. At this weight it is not an exception, it is a main line that nobody drew.
      Either draw it, or make it impossible.</div>` : ""}
    <div class="acts-row">
      ${p.drawn
        ? `<button class="btn" onclick="undrawPath('${p.id}')">Undraw</button>`
        : `<button class="btn pri" onclick="drawPath('${p.id}')">Draw into the loop</button>`}
      <button class="btn ghost" onclick="toast('Filed against triage. It is the edge that redraws the loop.')">File to triage</button>
    </div>`) +
  card("How this was found", "", `<div class="c-r">Nobody drew this line. A state is a predicate, so the harness can watch a file
    stop matching <span class="mono">${esc(src ? src.glob : "")}</span> and start matching
    <span class="mono">${esc(dst ? dst.glob : "")}</span>. ${p.drawn
      ? "This one is in the definition, so the observed traffic just keeps its weight honest."
      : "No edge in the definition connects those two, so the loop found a path through itself that you did not put there."}</div>`);
}

function corpusPanel(c) {
  if (!c) return "";
  const ems = emitsInto(c.id);
  const readers = (c.readBy || []).map(stateById).filter(Boolean);
  return card("Corpus", `<span class="tagm sk">write target</span>`, `
    <div class="c-n">${esc(c.name)}</div>
    <div class="c-r mono">${esc(c.glob)}</div>
    ${kv([["Files", `${c.count}`],
          ["Written by", ems.length ? ems.map((e) => `<a class="lnk" onclick="state.sel={t:'proc',id:'${e.proc.id}'};paint()">${esc(e.proc.name)}</a>`).join(", ") : `<span style="color:var(--text-3)">nothing</span>`],
          ["Read by", readers.length ? readers.map((s) => `<a class="lnk" onclick="state.sel={t:'node',id:'${s.id}'};paint()">${esc(s.name)}</a>`).join(", ") : `<span style="color:var(--text-3)">no state</span>`]])}
    <div class="c-r">${esc(c.note)}</div>`) +
  card("Why it is a spoke", "", `<div class="c-r">Nothing moves along these lines. ${ems.length ? esc(ems[0].proc.name) : "A process"} writes a fact
    here and the artifact stays where it was, so an arrow round the rim would be a lie about flow. The spokes are not drawn by hand either:
    each one is a <span class="mono">writesTo</span> on a process matched against this glob. Delete the contract line and the spoke goes with it.</div>`);
}

function issuePanel(i) {
  const p = PROCS.find((x) => x.id === i.edge);
  return card("System issue", `<span class="cat ${i.cat === "skill-gap" ? "gap" : i.cat === "spec-ambiguity" ? "amb" : "drift"}">${esc(i.cat)}</span>`, `
    <div class="c-n" style="font-size:14px;line-height:1.45">${esc(i.t)}</div>
    ${kv([["On edge", p ? esc(p.name) : esc(i.edge)], ["From", esc(i.run)], ["Fix", i.fix ? "proposed" : "none yet"], ["Category", esc(i.cat)]])}
    <div class="acts-row">
      <button class="btn" onclick="state.mode='system';state.view='loop';state.sel={t:'proc',id:'${i.edge}'};paint()">Go to the edge</button>
      <button class="btn ghost" onclick="toast('Patched. System bumped to v42.')">Patch</button>
    </div>`) +
  card("Why it lands here", "", `<div class="c-r">States do not fail. Transitions do. This issue is attributed
    to <b>${p ? esc(p.name) : esc(i.edge)}</b>, so the failure shows up on the line in the loop view rather than
    in a flat backlog nobody reads.</div>`);
}

function itemHome(sel) {
  if (sel.from) return sel.from;
  for (const k of Object.keys(ITEMS)) if (ITEMS[k].some((x) => x.id === sel.id)) return k;
  return null;
}

function itemPanel(sel) {
  let it = null, from = sel.from;
  for (const k of Object.keys(ITEMS)) { const f = ITEMS[k].find((x) => x.id === sel.id); if (f) { it = f; from = from || k; break; } }
  if (!it) return "";
  const st = STATES.find((s) => s.id === from);
  const out = PROCS.find((p) => p.from === from);
  return card(st ? st.name : "Item", `<span class="pill plain" style="color:var(--text-2)">${esc(from)}</span>`, `
    <div class="c-n"><span class="mono" style="color:var(--text-3)">${esc(it.id)}</span> ${esc(it.t)}</div>
    <div class="c-r">${esc(it.s)}</div>
    ${kv([["Station", st ? esc(st.name) : "—"], ["Next process", out ? esc(out.name) : "—"],
          ["Shape", st ? st.shape.join(", ") : "—"]])}
    <div class="acts-row">
      <button class="btn pri" onclick="openItemDoc('${it.id}','${from}')">${ICONS.doc} Open file</button>
      ${out ? `<button class="btn" onclick="runProc('${out.id}')">${ICONS.play} ${esc(out.name)}</button>` : ""}
    </div>`);
}

/* ─────────────────────────────────────────────────────────────── paint ── */

function paint() {
  const was = state.panelOpen;
  state.panelOpen = !!state.sel;
  paintSidebar(); paintToolbar(); paintStrip();
  if (state.view === "loop") paintLoop(); else paintList();
  /* the list gives up the room the panel needs; the loop keeps it and re-fits */
  $("#main").classList.toggle("inset", state.view !== "loop" && !!state.sel);
  paintPanels(); paintEditor();
  /* the panels changed the room the loop has to live in, so give it back */
  if (state.view === "loop" && was !== state.panelOpen) requestAnimationFrame(() => fit(true));
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${ICONS.check}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 2400);
}

$("#sideToggle").onclick = () => { $(".win").classList.toggle("narrow"); setTimeout(() => fit(true), 60); };
document.addEventListener("click", () => { if (state.wsOpen) { state.wsOpen = false; paintSidebar(); } });
window.addEventListener("resize", () => { if (state.view === "loop") fit(); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.docStack.length) closeEditor();      /* the sheet first, then the panel */
    else { state.sel = null; paint(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "s" && state.docStack.length) { e.preventDefault(); saveEditor(); }
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;

  /* with a file open, up and down walk the station list beside it */
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && state.docStack.length && state.sel && state.sel.t === "item") {
    const home = itemHome(state.sel), list = ITEMS[home] || [];
    const i = list.findIndex((x) => x.id === state.sel.id);
    const j = clamp(i + (e.key === "ArrowDown" ? 1 : -1), 0, list.length - 1);
    if (i >= 0 && j !== i) { e.preventDefault(); openItemDoc(list[j].id, home); }
    return;
  }
  if (e.key === "1") setMode("system");
  if (e.key === "2") setMode("product");
});

/* ══════════════════════════════════════════════════ the prompt sheet ══
   A process is a prompt, and a prompt is a markdown file that can have child
   files under it. `system/runbooks/build.md` owns everything in
   `system/runbooks/build/`, and the only thing joining a parent to a child is
   an ordinary markdown link. Notion-ish nesting with nothing stored to make it
   work: the file path is the hierarchy.

   Tasks are not a syntax either. They are markdown checkboxes. Anything
   `- [ ] like this` in the body is a task, and the rail is just a reading of
   the file. Tick it in the rendered page and the line in the file changes. */

const DOCS = {};

function promptFile(p) {
  return (p.kind === "runbook" ? "system/runbooks/" : "system/skills/") + p.id + ".md";
}
function initDocs() {
  PROCS.forEach((p) => (DOCS[promptFile(p)] = { title: p.name, body: p.prompt }));
  Object.keys(PAGES).forEach((k) => (DOCS[k] = { title: PAGES[k].title, body: PAGES[k].body }));
  /* spec sections first, so the slices that cite them link to something real */
  ["spec", "plans", "branch", "pr", "merged", "feed"].forEach((home) =>
    (ITEMS[home] || []).forEach((it) => {
      const path = itemDocPath(it, home);
      if (!DOCS[path]) DOCS[path] = { title: it.t, body: itemBody(it, home), item: { id: it.id, from: home } };
    }));
}

/* ── the product corpus is markdown too ──
   A slice, a spec section and an issue are all files, so they open in the same
   sheet as a runbook. Nothing about the sheet knows which is which: it renders
   whatever is at the path and reads the rail off the file. */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hsh  = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0);

function itemDocPath(it, home) {
  if (home === "spec") return `docs/${it.id}-${slug(it.t)}.md`;
  if (home === "feed") return `system/issues/${it.id.replace("#", "i")}.md`;
  return `slices/${it.id}.md`;          /* one slice, one file, whatever station it is at */
}

/* a runbook path seen from somewhere else in the tree */
const upTo = (from, path) => "../".repeat(from.split("/").length - 1) + path;

function specRef(n) {
  const s = ITEMS.spec[n % ITEMS.spec.length];
  return { id: s.id, t: s.t, path: itemDocPath(s, "spec") };
}

function itemBody(it, home) {
  const st = STATES.find((x) => x.id === home);
  const n = hsh(it.id + it.t);

  if (home === "spec") {
    const cite = [ITEMS.plans[n % 6], ITEMS.merged[(n + 2) % 6]];
    return `## Problem

**${it.t}** is the part of the product that gets described a different way every
time somebody says it out loud. This section fixes the language, and every
decision below is numbered so a slice can cite one rather than paraphrase it.

## Decisions

1. **D${180 + (n % 9)}** — the thread is the unit the UI addresses, never the message.
2. **D${190 + (n % 7)}** — anything derivable on read is derived, never stored.
3. **D${200 + (n % 5)}** — one owner per fact, named in this section.

## Open questions

- [ ] Does the rule above survive an account with two identities?
- [x] Is there a case where a client-side write beats the server? No, decided in D${190 + (n % 7)}.

## Coverage

${it.s}. Cited by [${cite[0].id}](../slices/${cite[0].id}.md) and
[${cite[1].id}](../slices/${cite[1].id}.md).

> A section with no slice citing it is either not built or not needed. Both are
> worth knowing, and [plan feature](../system/runbooks/plan.md) reads this line
> before it cuts.`;
  }

  if (home === "feed") {
    const iss = ISSUES.find((x) => x.id === it.id.replace("#", "i")) || ISSUES[0];
    const edge = procById(iss.edge);
    const edgeLink = edge ? `[${edge.name}](../${promptFile(edge).replace("system/", "")})` : iss.edge;
    return `Category \`${iss.cat}\`, logged by [log issue](../skills/log.md) on ${iss.run}.

## What happened

${iss.t}

## Where it lands

On the ${edgeLink} edge. States do not fail, transitions do, so this file names
an edge and never a state.

## Proposed fix

${iss.fix
  ? `- [ ] Patch the runbook on that edge
- [ ] Bump the system version
- [ ] Close this file with the commit sha`
  : `- [ ] No fix yet. It needs a decision on the spec first, not a prompt change.`}

> Three issues of one category on one edge is not a patch. See
> [redrawing an edge](../runbooks/triage/redraw-an-edge.md).`;
  }

  /* everything else is a slice, at one of four stations */
  const sp = specRef(n);
  const merged = home === "merged", live = home === "branch" || home === "pr";
  const tick = (done) => (done ? "x" : " ");
  return `Slice **${it.id}** · ${st ? st.name : home} · cites
[${sp.id} ${sp.t}](../${sp.path}) §${1 + (n % 4)}

## Proves

Opening the app and using **${it.t}** does the thing the spec says it should,
observably, without reading the diff to know it worked.

## Fields

- \`needs\` — ${it.s.startsWith("needs") ? it.s.split("·")[0].replace("needs", "").trim() : "nothing outstanding"}
- \`owns\` — \`src/${slug(it.t)}/*\`
- \`spec\` — [${sp.id} ${sp.t}](../${sp.path}) §${1 + (n % 4)}
- \`proves\` — the sentence above

## Tasks

- [${tick(true)}] Read the spec section and every decision it cites
- [${tick(merged || live)}] Open the worktree and branch off main
- [${tick(merged || home === "pr")}] Implement inside \`owns\` only
- [${tick(merged || home === "pr")}] Self-review against proves, per [code review](../system/runbooks/build/code-review.md)
- [${tick(merged)}] Raise the PR with the slice id in the title

## Notes

${it.s}.${merged ? " Merged, so this file is history now: it stays for the citation, not for the work." : ""}`;
}


const dirOf    = (path) => path.slice(0, path.lastIndexOf("/"));
const fileOf   = (path) => path.slice(path.lastIndexOf("/") + 1);
const docTitle = (path) => (DOCS[path] ? DOCS[path].title : fileOf(path));
const docBody  = (path) => (state.drafts[path] != null ? state.drafts[path] : (DOCS[path] ? DOCS[path].body : ""));
const isDirty  = (path) => !!DOCS[path] && state.drafts[path] != null && state.drafts[path] !== DOCS[path].body;

/* a normal relative link, resolved against the folder the file sits in */
function resolveDoc(from, href) {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return null;
  const parts = dirOf(from).split("/");
  for (const seg of href.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop(); else parts.push(seg);
  }
  return parts.join("/");
}
/* children live in the folder named after the parent, minus the .md */
function childPages(path) {
  const base = path.replace(/\.md$/, "") + "/";
  return Object.keys(DOCS).filter((k) => k.startsWith(base) && !k.slice(base.length).includes("/"));
}
function procOfDoc(path) {
  const m = path.match(/^system\/(?:runbooks|skills)\/([^/.]+)/);
  return m ? procById(m[1]) : null;
}

/* ── tasks are checkboxes, nothing more ── */

function splitEmit(s) {
  const i = s.indexOf("→");
  return i < 0 ? [s.trim(), ""] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

function parseTasks(src) {
  const out = [];
  String(src).split("\n").forEach((l, ln) => {
    const m = l.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (!m) return;
    const [t, emits] = splitEmit(m[2]);
    out.push({ i: out.length, ln, done: m[1] !== " ", t, emits });
  });
  return out;
}

function toggleTask(path, ln) {
  const lines = docBody(path).split("\n");
  lines[ln] = lines[ln].replace(/\[([ xX])\]/, (s, c) => (c === " " ? "[x]" : "[ ]"));
  state.drafts[path] = lines.join("\n");
  const doc = $("#ovDoc"), top = doc ? doc.scrollTop : 0;
  paintEditor();
  if (doc && $("#ovDoc")) $("#ovDoc").scrollTop = top;
}

/* ── a small markdown renderer. Enough of it that a runbook reads like a
      document instead of a config value. ── */

function mdi(s, from) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m0, label, href) => {
      const to = from ? resolveDoc(from, href) : null;
      return to && DOCS[to]
        ? `<a class="dlink" data-href="${esc(to)}">${ICONS.doc}${label}</a>`
        : `<a class="dlink dead" title="${esc(href)}">${ICONS.doc}${label}</a>`;
    })
    .replace(/(^|[\s(])\$([A-Z][A-Z0-9_]*)/g, '$1<span class="mvar">$$$2</span>');
}

function md(src, from) {
  const lines = String(src).split("\n");
  let out = "", para = [], quote = [], code = null, list = null, tn = 0;
  const flushP = () => { if (para.length) { out += `<p>${mdi(para.join(" "), from)}</p>`; para = []; } };
  const flushQ = () => { if (quote.length) { out += `<blockquote>${mdi(quote.join(" "), from)}</blockquote>`; quote = []; } };
  const flushL = () => { if (list) { out += list.tag === "ol" ? "</ol>" : "</ul>"; list = null; } };
  const openL = (kind, tag, cls) => {
    flushP(); flushQ();
    if (!list || list.kind !== kind) { flushL(); out += `<${tag}${cls ? ` class="${cls}"` : ""}>`; list = { kind, tag }; }
  };

  lines.forEach((raw, ln) => {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*```/.test(line)) {
      if (code === null) { flushP(); flushQ(); flushL(); code = []; }
      else { out += `<pre><code>${esc(code.join("\n"))}</code></pre>`; code = null; }
      return;
    }
    if (code !== null) { code.push(raw); return; }
    if (!line.trim()) { flushP(); flushQ(); flushL(); return; }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushP(); flushQ(); flushL();
      const h = Math.min(m[1].length + 1, 5);
      out += `<h${h}>${mdi(m[2], from)}</h${h}>`; return;
    }
    if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))) {
      openL("task", "ul", "md-tasks");
      const done = m[1] !== " ";
      const [t, e] = splitEmit(m[2]);
      out += `<li class="md-tk${done ? " done" : ""}" data-tk="${tn}">
        <button class="ck${done ? " on" : ""}" data-ck="${ln}" title="Toggle">${done ? ICONS.tick : ""}</button>
        <span class="tk-t">${mdi(t, from)}${e ? `<span class="tk-e mono">→ ${esc(e)}</span>` : ""}</span></li>`;
      tn++; return;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/)))   { openL("ul", "ul", ""); out += `<li>${mdi(m[1], from)}</li>`; return; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/)))  { openL("ol", "ol", ""); out += `<li>${mdi(m[1], from)}</li>`; return; }
    if ((m = line.match(/^>\s?(.*)$/)))         { flushP(); flushL(); quote.push(m[1]); return; }
    if (list && /^\s{2,}\S/.test(raw))          { out = out.replace(/<\/li>$/, ` ${mdi(line.trim(), from)}</li>`); return; }
    flushQ(); flushL(); para.push(line.trim());
  });
  flushP(); flushQ(); flushL();
  return out;
}

/* ── the rail: the checkboxes pulled out, the pages underneath, the contract ── */

function railHTML(path) {
  const src = docBody(path), p = procOfDoc(path), root = p && promptFile(p) === path;
  const item = DOCS[path] && DOCS[path].item;
  const home = item ? stateById(item.from) : null;
  const next = item ? PROCS.find((x) => x.from === item.from) : null;
  const rec = item ? (ITEMS[item.from] || []).find((x) => x.id === item.id) : null;
  const tasks = parseTasks(src), done = tasks.filter((t) => t.done).length;
  const kids = childPages(path);
  const from = p ? stateById(p.from) : null, to = p ? stateById(p.to) : null;
  const waiting = from ? from.count : 0;
  const open = tasks.length - done;

  const tasksHTML = tasks.length ? `<ul class="rail-tasks">${tasks.map((t) => `
    <li data-rt="${t.i}" class="${t.done ? "done" : ""}">
      <button class="ck sm${t.done ? " on" : ""}" data-ck="${t.ln}">${t.done ? ICONS.tick : ""}</button>
      <span class="tk-t">${mdi(t.t, path)}${t.emits ? `<span class="tk-e mono">→ ${esc(t.emits)}</span>` : ""}</span></li>`).join("")}</ul>
    ${root ? `<div class="rail-note">${open} open × ${waiting} waiting in ${esc(from ? from.name : "")}
      = <b>${open * waiting}</b> on the next run</div>` : ""}`
    : `<div class="rail-empty">No checkboxes in this page yet. Any
        <code>- [ ] line</code> in the body becomes a task.</div>`;

  return `
    <div class="rail-h">${ICONS.task}Tasks<span class="rail-n">${done}/${tasks.length}</span></div>
    ${tasksHTML}

    <div class="rail-h mt">${ICONS.doc}Pages<span class="rail-n">${kids.length}</span></div>
    ${kids.length ? `<div class="rail-pages">${kids.map((k) => {
      const kt = parseTasks(docBody(k));
      return `<button class="pg" data-href="${esc(k)}">
        <span class="pg-t">${esc(docTitle(k))}</span>
        <span class="pg-s mono">${esc(fileOf(k))}${kt.length ? ` · ${kt.length} tasks` : ""}</span>
        <span class="pg-c">${ICONS.chevR}</span></button>`; }).join("")}</div>`
      : `<div class="rail-empty">Nothing nested under this file yet.</div>`}
    <button class="pg new" id="pgNew">${ICONS.plus}New page under ${esc(fileOf(path))}</button>

    ${item ? `
      <div class="rail-h mt">${ICONS.loop}Where it sits</div>
      <div class="rail-c">
        <div class="rail-r"><span>Station</span><b>${esc(home ? home.name : item.from)}</b></div>
        <div class="rail-r"><span>Next</span><b>${next ? esc(next.name) : "nothing after this"}</b></div>
        ${rec ? `<div class="rail-r"><span>Status</span><b>${esc(rec.s)}</b></div>` : ""}
        <div class="rail-k">shape of ${esc(home ? home.name : item.from)}</div>
        <div class="fields">${(home ? home.shape : []).map((f) => `<span class="f">${esc(f)}</span>`).join("")}</div>
        <div class="rail-k">the file</div>
        <div class="fields"><span class="f">${esc(path)}</span></div>
      </div>` : ""}

    ${root && p ? `
      <div class="rail-h mt">${ICONS.gate}Contract</div>
      <div class="rail-c">
        <div class="rail-k">reads from ${esc(from ? from.name : p.from)}</div>
        <div class="fields">${p.reads.map((f) => `<span class="f ${from && from.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}</div>
        <div class="rail-k">writes into ${esc(to ? to.name : p.to)}</div>
        <div class="fields">${p.writes.map((f) => `<span class="f ${to && to.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}</div>
        ${p.broken ? `<div class="rail-bad">Broken wire: ${esc(p.broken)}</div>` : ""}
      </div>` : ""}`;
}

/* The sheet does not care what kind of file it is holding. It needs a glyph, a
   word, and — if the file is a thing that moves — the process that moves it
   next. A runbook, a slice and a spec section all answer those three. */
function docFace(path) {
  const pr = procOfDoc(path), isRoot = !!pr && promptFile(pr) === path;
  const item = DOCS[path] && DOCS[path].item;
  if (isRoot) return { icon: pr.kind === "runbook" ? ICONS.book : ICONS.sparkle, kind: pr.kind,
    cls: pr.kind === "runbook" ? "rb" : "sk", tint: pr.kind === "runbook" ? "rb" : "", proc: pr, root: true };
  if (item) {
    const kind = item.from === "spec" ? "spec" : item.from === "feed" ? "issue" : "slice";
    return { icon: kind === "spec" ? ICONS.doc : kind === "issue" ? ICONS.flag : ICONS.list,
      kind, cls: "pgtag", tint: "", item, next: PROCS.find((x) => x.from === item.from), root: false };
  }
  return { icon: ICONS.doc, kind: "page", cls: "pgtag", tint: "", proc: pr, root: false };
}

function paintEditor() {
  const host = $("#overlay");
  if (!host) return;
  const path = state.docStack[state.docStack.length - 1];
  if (!path || !DOCS[path]) { host.className = "ov-wrap"; host.innerHTML = ""; return; }

  const face = docFace(path), root = face.root;
  const p = face.item ? null : procOfDoc(path);
  const src = docBody(path), dirty = isDirty(path);
  const from = p ? stateById(p.from) : null, to = p ? stateById(p.to) : null;
  const rate = p ? Math.round(p.fail * 100) : 0;

  /* the sheet stops where the side card starts, so both are readable at once */
  host.className = "ov-wrap open";
  host.style.right = state.sel ? (PANEL_W - 6) + "px" : "0px";
  host.innerHTML = `
    <div class="ov-card">
      <header class="ov-h">
        ${state.docStack.length > 1 ? `<button class="ico" id="ovBack" title="Back">${ICONS.chevL}</button>` : ""}
        <span class="pr-k ${face.tint}">${face.icon}</span>
        <div class="ov-ht">
          <div class="ov-name">${esc(docTitle(path))}
            <span class="tagm ${face.cls}">${esc(face.kind)}</span>
            ${dirty ? `<span class="ov-dirty">unsaved</span>` : ""}</div>
          <div class="ov-file mono">${crumbHTML()}</div>
        </div>
        <div class="seg ov-seg" id="ovSeg">
          <button data-m="read" class="${state.editing ? "" : "on"}">${ICONS.eye}Read</button>
          <button data-m="write" class="${state.editing ? "on" : ""}">${ICONS.pencil}Edit</button>
        </div>
        <button class="ico" id="ovX" title="Close (Esc)">${ICONS.x}</button>
      </header>

      <div class="ov-b">
        <div class="ov-doc ${state.editing ? "writing" : ""}" id="ovDoc">
          ${state.editing
            ? `<textarea class="ov-edit mono" id="ovTa" spellcheck="false">${esc(src)}</textarea>`
            : `<article class="md">${md(src, path)}</article>`}
        </div>
        <aside class="ov-rail" id="ovRail">${railHTML(path)}</aside>
      </div>

      <footer class="ov-f">
        <span class="ov-meta">${face.item
          ? `${esc(stateById(face.item.from) ? stateById(face.item.from).name : face.item.from)} · ${esc(face.item.id)}`
          : p ? `${REPO.sysVersion} · ${p.runs} runs · ${rate}% send-back · ${esc(p.runner)}` : REPO.sysVersion}</span>
        <span class="ov-sp"></span>
        ${dirty ? `<button class="btn ghost" id="ovRevert">Revert</button>` : ""}
        ${face.item && face.next
          ? `<button class="btn" id="ovRun">${ICONS.play} ${esc(face.next.name)} on ${esc(face.item.id)}</button>`
          : p ? `<button class="btn" id="ovRun">${ICONS.play} Run ${esc(p.name)}</button>` : ""}
        <button class="btn pri" id="ovSave" ${dirty ? "" : "disabled"}>${ICONS.save} Save</button>
      </footer>
    </div>`;

  const card = host.querySelector(".ov-card");
  $("#ovX").onclick = (e) => { e.stopPropagation(); closeEditor(); };
  if (state.docStack.length > 1) $("#ovBack").onclick = () => { state.docStack.pop(); state.editing = false; paintEditor(); paintToolbar(); };
  const runId = face.item && face.next ? face.next.id : p ? p.id : null;
  if (runId) $("#ovRun").onclick = () => runProc(runId);
  $("#ovSave").onclick = () => saveEditor();
  if (dirty) $("#ovRevert").onclick = () => { delete state.drafts[path]; paintEditor(); };
  $("#pgNew").onclick = () => toast(`New page under ${fileOf(path)}`);
  $("#ovSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    state.editing = b.dataset.m === "write"; paintEditor();
    const ta = $("#ovTa"); if (ta) ta.focus();
  }));

  /* wired in one pass: every markdown link to a file we hold, every page row
     in the rail, and every checkbox, wherever it happens to be drawn */
  wireCard();
  function wireCard() {
  card.querySelectorAll("[data-href]").forEach((el) => (el.onclick = (e) => { e.preventDefault(); openDoc(el.dataset.href); }));
  card.querySelectorAll("[data-ck]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); toggleTask(path, +el.dataset.ck); }));
  card.querySelectorAll("[data-crumb]").forEach((el) => (el.onclick = () => {
    state.docStack = state.docStack.slice(0, +el.dataset.crumb + 1); state.editing = false; paintEditor(); paintToolbar();
  }));
  card.querySelectorAll("[data-rt]").forEach((el) => {
    const tgt = $(`#ovDoc [data-tk="${el.dataset.rt}"]`);
    el.onmouseenter = () => { el.classList.add("hi"); if (tgt) tgt.classList.add("hi"); };
    el.onmouseleave = () => { el.classList.remove("hi"); if (tgt) tgt.classList.remove("hi"); };
    el.onclick = (e) => { if (!e.target.closest("[data-ck]") && tgt) tgt.scrollIntoView({ block: "center", behavior: "smooth" }); };
  });
  }

  const ta = $("#ovTa");
  if (ta) ta.oninput = () => {
    state.drafts[path] = ta.value;
    $("#ovRail").innerHTML = railHTML(path);
    wireCard();
    if (isDirty(path) !== dirty) {
      const c = ta.selectionStart, top = ta.scrollTop;
      paintEditor();
      const t2 = $("#ovTa");
      if (t2) { t2.focus(); t2.setSelectionRange(c, c); t2.scrollTop = top; }
    }
  };
}

/* `slices/1.44.md › system/runbooks/build/code-review.md`
   A child of the file before it shows just its name; a jump somewhere else in
   the tree shows its whole path, because that is the honest thing to show. */
function crumbHTML() {
  return state.docStack.map((d, i) => {
    const prev = state.docStack[i - 1];
    const child = prev && d.startsWith(prev.replace(/\.md$/, "") + "/");
    return `${i ? `<span class="cr-sep">›</span>` : ""}<span class="cr-seg" data-crumb="${i}">${esc(child ? fileOf(d) : d)}</span>`;
  }).join("");
}

function openEditor(id) {
  const p = procById(id); if (!p) return;
  state.docStack = [promptFile(p)]; state.editing = false;
  if (!state.sel || state.sel.t !== "proc" || state.sel.id !== id) state.sel = { t: "proc", id };
  paint();
}

function openDoc(path) {
  if (!DOCS[path]) return;
  const at = state.docStack.indexOf(path);
  if (at >= 0) state.docStack = state.docStack.slice(0, at + 1);   /* going back up the chain */
  else state.docStack.push(path);
  state.editing = false;
  paintEditor(); paintToolbar();
}

function closeEditor(quiet) {
  if (!state.docStack.length) return;
  state.docStack = []; state.editing = false;
  if (!quiet) paint();
}

function saveEditor() {
  const path = state.docStack[state.docStack.length - 1];
  if (!path || !isDirty(path)) return;
  DOCS[path].body = state.drafts[path];
  delete state.drafts[path];
  const p = procOfDoc(path);
  if (p && promptFile(p) === path) p.prompt = DOCS[path].body;   /* the root file is the process prompt */
  paint();
  toast(`Saved ${path} · system bumped to v42`);
}

initDocs();
paint();
fit();
