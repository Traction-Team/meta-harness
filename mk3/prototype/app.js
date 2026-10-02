/* Metafab Mark III prototype.
   One idea per surface:
   - Blueprint › Line    the blueprint is the thing you build and maintain
   - Run › Live / Frame  agents at work, and the frame each one sees
   - Output › Defect     a defect is fixed in the blueprint, then the slice reruns
   - Blueprint › Scorers   scores lead, defects lag: a low score routes one item,
                           a pattern of scores changes the blueprint
   - Blueprint › Autonomy  gates come off as people stop changing the output */

/* ─────────────────────────────────────────────────────────── icons ── */

const I = (p, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor"
     stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const ICONS = {
  factory: I(`<path d="M2 13.6V7l3.4 2.2V7l3.4 2.2V4.4h2.4l.8 9.2z"/><path d="M2 13.6h12"/>`),
  run:     I(`<path d="M5.4 3.4 12 8l-6.6 4.6z"/>`),
  box:     I(`<path d="M2.3 5.2 8 2.2l5.7 3v6.1L8 14.2l-5.7-2.9z"/><path d="M2.3 5.2 8 8.1l5.7-2.9M8 8.1v6.1"/>`),
  layout:  I(`<rect x="2.2" y="2.2" width="4" height="3.5" rx="1"/><rect x="9.8" y="10.3" width="4" height="3.5" rx="1"/><path d="M6.2 4h2a2 2 0 0 1 2 2v4.3"/>`),
  chart:   I(`<path d="M2.4 13.4h11.2"/><path d="M3.6 10.6 6.4 7.4l2.4 2 4-5"/>`),
  history: I(`<path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8"/><path d="M2.4 2.4v2.8h2.8"/><path d="M8 5.2V8l2 1.4"/>`),
  live:    I(`<circle cx="8" cy="8" r="2"/><path d="M4.6 4.6a4.8 4.8 0 0 0 0 6.8M11.4 4.6a4.8 4.8 0 0 1 0 6.8M2.6 2.6a7.6 7.6 0 0 0 0 10.8M13.4 2.6a7.6 7.6 0 0 1 0 10.8"/>`),
  inbox:   I(`<path d="M2.2 9.2 4 3.4h8l1.8 5.8v3.4a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1z"/><path d="M2.2 9.2h3.4l.8 1.6h3.2l.8-1.6h3.4"/>`),
  doc:     I(`<path d="M9 2.2H5a1.4 1.4 0 0 0-1.4 1.4v8.8A1.4 1.4 0 0 0 5 13.8h6a1.4 1.4 0 0 0 1.4-1.4V5.6z"/><path d="M9 2.2v3.4h3.4"/>`),
  film:    I(`<rect x="2.4" y="2.2" width="11.2" height="11.6" rx="1.6"/><path d="M5 2.2v11.6M11 2.2v11.6M2.4 5.1H5M2.4 8H5M2.4 10.9H5M11 5.1h2.6M11 8h2.6M11 10.9h2.6"/>`),
  bug:     I(`<rect x="4.6" y="4.8" width="6.8" height="8.6" rx="3.4"/><path d="M6 4.8a2 2 0 0 1 4 0M2.6 7.4h2M11.4 7.4h2M2.6 11h2M11.4 11h2M8 7v6.4"/>`),
  ship:    I(`<path d="M8 2.2v8.4M4.6 7.2 8 10.6l3.4-3.4"/><path d="M2.6 13.6h10.8"/>`),
  gate:    I(`<path d="M3.2 2.3v11.4M12.8 2.3v11.4M4.7 8h6.6"/><circle cx="3.2" cy="3.1" r="1.2"/><circle cx="12.8" cy="12.9" r="1.2"/>`, 14),
  check:   I(`<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2 7.1 10l3.7-4"/>`),
  tick:    I(`<path d="M3.2 8.3 6.3 11.4 12.8 4.7"/>`, 12),
  x:       I(`<path d="M4 4l8 8M12 4l-8 8"/>`, 13),
  xs:      I(`<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>`, 12),
  chevL:   I(`<path d="M10 3.2 5.6 8l4.4 4.8"/>`),
  chevR:   I(`<path d="M6 3.2 10.4 8 6 12.8"/>`),
  chevD:   I(`<path d="M3.6 6.2 8 10.4l4.4-4.2"/>`, 14),
  sidebar: I(`<rect x="2" y="3" width="12" height="10" rx="1.8"/><path d="M6.4 3v10"/>`),
  moon:    I(`<path d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.9 5.9 0 1 0 7 7z"/>`),
  play:    I(`<path d="M5.4 3.4 12 8l-6.6 4.6z" fill="currentColor" stroke-width="1.1"/>`, 12),
  pause:   I(`<path d="M5.4 3.6v8.8M10.6 3.6v8.8" stroke-width="2"/>`, 12),
  plus:    I(`<path d="M8 3.4v9.2M3.4 8h9.2"/>`, 12),
  minus:   I(`<path d="M3.4 8h9.2"/>`, 12),
  wrench:  I(`<path d="M10.4 2.4a3.6 3.6 0 0 0-3.2 5.3L2.6 12.3a1.3 1.3 0 0 0 1.9 1.8l4.6-4.6a3.6 3.6 0 0 0 4.4-4.9l-2 2-1.9-.4-.4-1.9z"/>`, 15),
  sparkle: I(`<path d="M8 1.8l1.3 3.6L13 6.7l-3.7 1.3L8 11.6 6.7 8 3 6.7l3.7-1.3z"/>`),
  bulb:    I(`<path d="M5.6 10.4a4.4 4.4 0 1 1 4.8 0v1.4H5.6z"/><path d="M6.2 13.8h3.6"/>`),
  replay:  I(`<path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8"/><path d="M13.6 2.2v3.1h-3.1"/>`),
  user:    I(`<circle cx="8" cy="5.6" r="2.6"/><path d="M3 13.6a5 5 0 0 1 10 0"/>`, 13),
  arrowR:  I(`<path d="M3 8h10M9.4 4.4 13 8l-3.6 3.6"/>`, 13),
  gauge:   I(`<path d="M2.6 11.4a5.6 5.6 0 1 1 10.8 0"/><path d="M8 9.6 10.6 6"/><circle cx="8" cy="9.8" r="1" fill="currentColor" stroke="none"/>`),
  stale:   I(`<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/>`, 12),
  hand:    I(`<path d="M5.6 8V3.8a1 1 0 0 1 2 0V7.4M7.6 7V2.8a1 1 0 0 1 2 0V7.4M9.6 7.2V3.8a1 1 0 0 1 2 0v5.6a4.4 4.4 0 0 1-4.4 4.4h-.4a4 4 0 0 1-3.2-1.6L2 9.8a1 1 0 0 1 1.5-1.3l2.1 1.7"/>`, 14),

  /* collections: where work waits */
  message: I(`<path d="M13.4 9.6a1.6 1.6 0 0 1-1.6 1.6H6.4l-3.2 2.6V4.2a1.6 1.6 0 0 1 1.6-1.6h7a1.6 1.6 0 0 1 1.6 1.6z"/>`),
  list:    I(`<path d="M6.2 4.4h7.2M6.2 8h7.2M6.2 11.6h7.2"/><circle cx="3.2" cy="4.4" r=".9" fill="currentColor" stroke="none"/><circle cx="3.2" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="3.2" cy="11.6" r=".9" fill="currentColor" stroke="none"/>`),
  branch:  I(`<circle cx="4.6" cy="3.6" r="1.5"/><circle cx="4.6" cy="12.4" r="1.5"/><circle cx="11.4" cy="4.6" r="1.5"/><path d="M4.6 5.1v5.8M11.4 6.1v.7a2.6 2.6 0 0 1-2.6 2.6H7.2a2.6 2.6 0 0 0-2.6 2.6"/>`),
  shield:  I(`<path d="M8 1.9 13 3.8v3.9c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.8z"/><path d="M5.7 8.1 7.3 9.7l3-3.2"/>`),
  globe:   I(`<circle cx="8" cy="8" r="5.9"/><path d="M2.1 8h11.8M8 2.1c1.6 1.7 2.4 3.6 2.4 5.9S9.6 12.2 8 13.9C6.4 12.2 5.6 10.3 5.6 8S6.4 3.8 8 2.1z"/>`),

  /* programs: what moves work on */
  pen:      I(`<path d="M10.6 2.8a1.6 1.6 0 0 1 2.3 2.3l-7.3 7.3-3 .8.8-3z"/><path d="M9.4 4l2.4 2.4"/>`),
  scissors: I(`<circle cx="4.2" cy="4.4" r="1.8"/><circle cx="4.2" cy="11.6" r="1.8"/><path d="M5.8 5.4 13.4 12M5.8 10.6 13.4 4"/>`),
  code:     I(`<path d="M5.2 4.6 1.9 8l3.3 3.4M10.8 4.6 14.1 8l-3.3 3.4M9.2 2.8 6.8 13.2"/>`),
  flask:    I(`<path d="M6.2 2.2h3.6M6.8 2.2v4L3 12.4a1 1 0 0 0 .9 1.4h8.2a1 1 0 0 0 .9-1.4L9.2 6.2v-4"/><path d="M4.5 10h7"/>`),
  send:     I(`<path d="M13.8 2.2 7.2 8.8M13.8 2.2 9.6 13.8 7.2 8.8 2.2 6.4z"/>`),

  /* autonomy: who checks the output */
  person:  I(`<circle cx="8" cy="5.4" r="2.6"/><path d="M3 13.8a5 5 0 0 1 10 0"/>`, 12),
  pie:     I(`<circle cx="8" cy="8" r="5.8"/><path d="M8 8V2.2A5.8 5.8 0 0 1 13.8 8z" fill="currentColor"/>`, 12),
  bolt:    I(`<path d="M9 1.8 3.6 9.2h4.2l-.8 5 5.4-7.4H8.2z"/>`, 12),
};

/* the icon for a collection, program or autonomy level */
const ic = (x) => ICONS[x && x.icon] || ICONS.doc;
const AUTO_ICON = { gated: "person", sampled: "pie", auto: "bolt" };

/* ─────────────────────────────────────────────────────────── state ── */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const prog = (id) => PROGRAMS.find((p) => p.id === id);
const buf = (id) => BUFFERS.find((b) => b.id === id);

const MODES = {
  blueprint: { label: "Blueprint", icon: ICONS.layout, views: [
    { id: "line",     label: "Line",     icon: "layout" },
    { id: "scorers",  label: "Scorers",  icon: "gauge" },
    { id: "autonomy", label: "Autonomy", icon: "chart" },
    { id: "versions", label: "Versions", icon: "history" },
  ] },
  run: { label: "Run", icon: ICONS.run, views: [
    { id: "live",  label: "Live",      icon: "live" },
    { id: "needs", label: "Needs you", icon: "inbox" },
    { id: "frame", label: "Frame",     icon: "film", hidden: true },
  ] },
  output: { label: "Output", icon: ICONS.box, views: [
    { id: "shipped", label: "Shipped", icon: "ship" },
    { id: "defect",  label: "Defects", icon: "bug" },
  ] },
};

const state = {
  mode: "blueprint",
  view: "line",
  sel: null,                 // a selected program id on the line
  frameTask: "AM-152",       // the task whose frame is open
  running: true,
  version: 14,               // blueprint version
  answers: {},               // AM-152 question index -> option index
  sent: false,               // AM-152 answers sent; the agent continues
  approved: false,           // Release 43 approved by you
  rerun: -1,                 // AM-139 rerun station index; -1 = not started, 5 = done
  promoted: {},              // program id -> autonomy level set by the operator
  policy: {},                // scorer id -> low-score policy set by the operator
  held: null,                // AM-154, held by Plan quality: null | "approved" | "back"
  draft: 0,                  // pattern P-8: 0 = found, 1 = drafted and replayed, 2 = sent to Leo
  rebuild: false,            // v15 rebuild plan applied to stale outputs
  tour: 0,
  tourOpen: true,
  pool: Object.fromEntries(POOL.map((p) => [p.id, p.n])),
};

const autonomyOf = (p) => state.promoted[p.id] || p.autonomy;
const fixed = () => state.version >= 15;
const scorer = (id) => SCORERS.find((s) => s.id === id);
const scorersOn = (bufId) => SCORERS.filter((s) => s.on === bufId);
const policyOf = (s) => state.policy[s.id] || s.low;
const staleOf = (id) => fixed() ? STALE.find((x) => x.id === id) : null;
const openPatterns = () => PATTERNS.filter((p) => p.id === "P-7" ? !fixed() : state.draft < 2).length;
const scoreCls = (s) => s < 5 ? "lo" : s < 8 ? "mid" : "hi";
const poolTotal = () => Object.values(state.pool).reduce((a, b) => a + b, 0);

/* ───────────────────────────────────────────────────────── agents ── */

function agentById(id) {
  const [pid, n] = id.split("-");
  const owner = POOL.find((p) => p.id === pid);
  return { id, owner, n: +n, h: (owner.h + (n - 1) * 18) % 360 };
}
const agentName = (a) => a.owner.id === "you" ? `Your agent ${a.n}` : a.owner.id === "cloud" ? `Cloud runner ${a.n}` : `${a.owner.name}'s agent ${a.n}`;
const allAgents = () => POOL.flatMap((p) => Array.from({ length: state.pool[p.id] }, (_, i) => agentById(`${p.id}-${i + 1}`)));

/* the agent face from Mark I: a rounded square with two eyes */
const face = (a, cls = "") => `<span class="agent-avatar ${cls}" style="--agent-h:${a.h}" aria-hidden="true"></span>`;
const person = (name, cls = "") => {
  const p = PEOPLE[name] || { i: name[0], h: 200 };
  return `<span class="av ${cls}" style="--h:${p.h}" data-i="${p.i}" title="${esc(name)}"></span>`;
};

function allTasks() {
  const list = [];
  TASKS.forEach((t) => {
    if (t.id === "R-43" && state.approved) return;           // shipped
    if (t.id === "AM-152" && state.sent) return list.push({ ...t, status: "running", doing: "Writing the plan" });
    if (t.id === "AM-154" && state.held === "approved") return;    // moved on to Build
    if (t.id === "AM-154" && state.held === "back") return list.push({ ...t, status: "running", held: false, retry: true,
      agent: state.rerun >= 0 && state.rerun < 5 ? null : "cloud-3", doing: "Second try with the scorer's reasons" });
    list.push(t);
  });
  if (state.rerun >= 0 && state.rerun < 5) {
    list.push({ id: "AM-139", t: "Snooze a thread · again on v15", at: PROGRAMS[state.rerun].id, status: "running",
      agent: "cloud-3", doing: "Remaking on blueprint v15", rerun: true });
  }
  return list;
}
const tasksAt = (pid) => allTasks().filter((t) => t.at === pid);
const taskById = (id) => allTasks().find((t) => t.id === id) || TASKS.find((t) => t.id === id);

function idleAgents() {
  const busy = new Set(allTasks().map((t) => t.agent).filter(Boolean));
  return allAgents().filter((a) => !busy.has(a.id));
}

const counts = () => {
  const all = allTasks();
  return {
    working: all.filter((t) => t.agent).length,
    asking: all.filter((t) => t.status === "asking").length,
    gate: all.filter((t) => t.status === "gate").length,
  };
};
const openQuestions = () => (state.sent ? 0 : FRAME_152.questions.filter((_, i) => state.answers[i] == null).length);
const needsYou = () => (state.sent ? 0 : 1) + (state.approved ? 0 : 1) + (state.held ? 0 : 1);

/* ─────────────────────────────────────────────────────────── paint ── */

function paint() {
  paintSidebar();
  paintToolbar();
  paintMain();
  paintPanel();
  paintStrip();
}

function go(mode, view, extra = {}) {
  state.mode = mode;
  state.view = view || MODES[mode].views[0].id;
  state.sel = null;
  Object.assign(state, extra);
  paint();
}

function paintSidebar() {
  $("#sideToggle").innerHTML = ICONS.sidebar;
  $("#wsWrap").innerHTML = `
    <button class="ws-id">
      <div class="av sq" style="--h:${WORKSPACE.h}" data-i="${WORKSPACE.i}"></div>
      <div class="ws-txt"><span class="ws-name">${esc(WORKSPACE.name)}</span>
      <span class="ws-sub">${esc(WORKSPACE.sub)}</span></div>
      <span class="ws-chev">${ICONS.chevD}</span>
    </button>`;

  $("#modeSeg").innerHTML = Object.entries(MODES).map(([id, m]) =>
    `<button class="${state.mode === id ? "on" : ""}" data-act="mode" data-id="${id}">${m.icon}<span>${m.label}</span></button>`).join("");

  const badge = (v) => {
    if (v === "needs") return { n: needsYou(), loud: true };
    if (v === "defect") { const open = state.rerun < 5; return { n: open ? 1 : 0, loud: open }; }
    if (v === "live") return { n: counts().working };
    if (v === "versions") return { n: "v" + state.version };
    if (v === "scorers") return { n: openPatterns() };
    return null;
  };
  const views = MODES[state.mode].views.filter((v) => !v.hidden || state.view === v.id);
  $("#sideNav").innerHTML = views.map((v) => {
    const b = badge(v.id);
    const label = v.id === "frame" ? `Frame · ${state.frameTask}` : v.label;
    return `<button class="snav ${state.view === v.id ? "active" : ""}" data-act="view" data-id="${v.id}">
      ${ICONS[v.icon]}<span>${label}</span>
      ${b ? `<span class="snav-n ${b.loud && b.n ? "loud" : ""}">${b.n}</span>` : ""}</button>`;
  }).join("");

  // the worker pool is a run concern: only show it while watching the line run
  const showPool = state.mode === "run";
  $("#sidePool").hidden = !showPool;
  const busy = new Set(allTasks().map((t) => t.agent).filter(Boolean));
  $("#sidePool").innerHTML = !showPool ? "" : `
    <div class="rsec">Worker pool <span class="rsec-n">${poolTotal()} agents</span></div>
    ${POOL.map((p) => {
      const mine = allAgents().filter((a) => a.owner.id === p.id);
      return `
      <div class="pool-row">
        <div class="pool-b"><b>${p.name}</b><span>${esc(p.where)}</span></div>
        <div class="pool-faces">${mine.map((a) => face(a, busy.has(a.id) ? "" : "idle")).join("") || `<em>none</em>`}</div>
        <div class="pool-n">
          <button class="pool-btn" data-act="pool" data-id="${p.id}" data-d="-1">${ICONS.minus}</button>
          <button class="pool-btn" data-act="pool" data-id="${p.id}" data-d="1">${ICONS.plus}</button>
        </div>
      </div>`;
    }).join("")}`;

  const t = TOUR[state.tour];
  $("#sideTour").innerHTML = state.tourOpen ? `
    <div class="tour">
      <div class="tour-h"><span class="tour-k">How Metafab works</span><span class="tour-n">${state.tour + 1} of ${TOUR.length}</span>
        <button class="pnl-x" data-act="tourClose" title="Close">${ICONS.xs}</button></div>
      <div class="tour-dots">${TOUR.map((_, i) => `<i class="${i === state.tour ? "on" : i < state.tour ? "done" : ""}" data-act="tourGo" data-i="${i}"></i>`).join("")}</div>
      <div class="tour-t">${esc(t.t)}</div>
      <div class="tour-b">${esc(t.b)}</div>
      <div class="tour-a">
        <button class="btn ghost" data-act="tourGo" data-i="${state.tour - 1}" ${state.tour === 0 ? "disabled" : ""}>Back</button>
        <button class="btn pri" data-act="tourGo" data-i="${(state.tour + 1) % TOUR.length}">${state.tour === TOUR.length - 1 ? "Start again" : "Next"}</button>
      </div>
    </div>` : `<button class="snav" data-act="tourOpen">${ICONS.bulb}<span>How Metafab works</span></button>`;
}

function paintToolbar() {
  const mv = MODES[state.mode].views.find((v) => v.id === state.view);
  const label = state.view === "frame" ? `Frame · ${state.frameTask}` : mv ? mv.label : "";
  $("#tbNav").innerHTML = `<button class="ico dim">${ICONS.chevL}</button><button class="ico dim">${ICONS.chevR}</button>`;
  $("#crumb").innerHTML = `${esc(WORKSPACE.name)} <span class="dim">›</span> ${MODES[state.mode].label} <span class="dim">›</span> ${esc(label)}`;
  $("#tbActs").innerHTML = `
    <button class="run-btn ${state.running ? "on" : ""}" data-act="toggleRun">
      ${state.running ? ICONS.pause : ICONS.play}<span>${state.running ? "Running" : "Paused"}</span></button>
    <button class="ico" data-act="theme" title="Theme">${ICONS.moon}</button>`;
}

function paintStrip() {
  const c = counts();
  $("#stripLeft").innerHTML = state.running
    ? `<span class="strip-dot on"></span>${c.working} of ${poolTotal()} agents working · ${c.asking} asking a question · ${c.gate} waiting at gates`
    : `<span class="strip-dot"></span>Paused · agents finish their current step, then stop`;
  $("#stripRight").innerHTML = `<span class="strip-model" data-act="view" data-to="blueprint:versions">Blueprint v${state.version}</span>`;
}

let lastView = null;
function paintMain() {
  const main = $("#main");
  const v = state.view;
  main.className = "col-main";
  // keep the scroll position when a view repaints itself
  const top = lastView === v && main.firstElementChild ? main.firstElementChild.scrollTop : 0;
  lastView = v;
  renderView(main, v);
  if (main.firstElementChild) main.firstElementChild.scrollTop = top;
}

function renderView(main, v) {
  if (v === "line" || v === "live") return paintLine(main, v === "live");
  if (v === "frame") return paintFrame(main);
  if (v === "defect") return paintDefect(main);
  if (v === "autonomy") return paintAutonomy(main);
  if (v === "scorers") return paintScorers(main);
  if (v === "versions") return paintVersions(main);
  if (v === "needs") return paintNeeds(main);
  if (v === "shipped") return paintShipped(main);
}

/* ──────────────────────────────────────────────────── the line ── */

const G = { BW: 112, BH: 64, SW: 240, SH: 166, GAP: 76, ROW: 300 };

/* an arrowhead drawn as its own path, pointing in direction dir (r, l, d, u) */
function arrow(x, y, dir, cls = "") {
  const s = 6.5, w = 4;   // length and half-width of a small filled head
  const pts = { r: [[x - s, y - w], [x, y], [x - s, y + w]], l: [[x + s, y - w], [x, y], [x + s, y + w]],
    d: [[x - w, y - s], [x, y], [x + w, y - s]], u: [[x - w, y + s], [x, y], [x + w, y + s]] }[dir];
  return `<path class="ah ${cls}" d="M${pts.map((p) => p.join(" ")).join(" L")} Z"/>`;
}

function lineGeo() {
  const { BW, BH, SW, SH, GAP, ROW } = G;
  const pos = {};
  // Row 1, left to right: intent, spec, specs, plan, plans, build.
  let x = 0;
  [["b", "intent"], ["p", "spec"], ["b", "spec"], ["p", "plan"], ["b", "plan"], ["p", "build"]].forEach(([k, id]) => {
    const w = k === "b" ? BW : SW, h = k === "b" ? BH : SH;
    pos[k + id] = { x, y: -h / 2, w, h, cx: x + w / 2, cy: 0 };
    x += w + GAP;
  });
  const width = x - GAP;
  // Row 2, right to left: branches under build, test, verified, ship, live under intent.
  const build = pos.pbuild;
  const row2 = [["b", "branch"], ["p", "test"], ["b", "verified"], ["p", "ship"], ["b", "live"]];
  const right = build.cx + BW / 2;
  const total = row2.reduce((a, [k]) => a + (k === "b" ? BW : SW), 0);
  const gap2 = (right - total) / (row2.length - 1);
  x = right;
  row2.forEach(([k, id]) => {
    const w = k === "b" ? BW : SW, h = k === "b" ? BH : SH;
    x -= w;
    pos[k + id] = { x, y: ROW - h / 2, w, h, cx: x + w / 2, cy: ROW };
    x -= gap2;
  });
  return { pos, width, top: -SH / 2 - 30 };
}

const SRC_LABEL = { blueprint: "Blueprint", work: "Work" };

function frameFor(p) {
  const f = p.frame.slice();
  if (fixed() && p.id === "plan") f.splice(2, 0, { k: "input", src: "work", t: "Spec › Constraints", added: true });
  return f;
}

/* the tag on a work row: asking, held by a scorer, at a gate, retry, or stale after v15 */
function rowTag(t) {
  if (t.status === "asking") return `<span class="st-tag ask">Asking</span>`;
  if (t.held) return `<span class="st-tag held" title="Held by Plan quality">${ICONS.gauge}Held · ${HELD.score}</span>`;
  if (t.status === "gate") return `<span class="st-tag gate">At gate</span>`;
  const st = staleOf(t.id);
  if (st && st.act !== "keep") return state.rebuild
    ? `<span class="st-tag v15" title="${esc(REBUILD_ACT[st.act])} on v15">${st.act === "step" ? "Rerun" : "Rebuild"} · v15</span>`
    : `<span class="st-tag stale" title="${esc(st.why)}">${ICONS.stale}Stale</span>`;
  if (t.retry) return `<span class="st-tag retry" title="The item loop: one retry with the scorer's reasons">Retry</span>`;
  return "";
}

function stationCard(p, live, g) {
  const a = autonomyOf(p);
  const tasks = tasksAt(p.id);
  const sel = state.sel === p.id ? "sel" : "";
  const changed = fixed() && (p.id === "plan" || p.id === "test");
  const head = `
    <div class="st-h">
      <span class="st-k">${ic(p)}</span>
      <span class="st-t">${esc(p.name)}</span>
      ${changed ? `<span class="tagm rt" title="Changed in v15">v15</span>` : ""}
      <span class="auto-pill ${a}">${AUTONOMY[a].label}</span>
    </div>`;
  let body, dock = "";
  {
    body = `
      <div class="st-rows">
        ${tasks.slice(0, 3).map((t) => `
          <button class="st-row ${t.status} ${t.rerun ? "rerun" : ""}" data-act="task" data-id="${t.id}">
            <span class="nd-dot ${t.status === "running" && state.running ? "run" : t.status === "asking" || t.status === "gate" ? "wait" : "ok"}"></span>
            <span class="nd-id">${t.id}</span>
            <span class="nd-nm">${esc(t.t)}</span>
            ${rowTag(t)}
          </button>`).join("") || `<div class="st-empty">No work here right now</div>`}
      </div>`;
    // the footer: agents at this station, and a one-line summary of what they do
    const workers = tasks.filter((t) => t.agent);
    const asking = workers.filter((t) => t.status === "asking").length;
    const working = workers.filter((t) => t.status === "running").length;
    const atGate = tasks.filter((t) => t.status === "gate").length;
    const sum = [
      asking && `<b class="ask">${asking} asking</b>`,
      working && (state.running ? `${working} working` : `${working} paused`),
      atGate && `<b class="gate">${atGate} waiting on ${esc(p.owner)}</b>`,
    ].filter(Boolean).join(`<i>·</i>`) || "No agents here";
    dock = `<div class="dock">
      ${workers.length ? `<span class="dock-fs">${workers.map((t) => {
        const ag = agentById(t.agent);
        return `<button class="dock-a ${t.status} ${state.running ? "" : "paused"}" data-act="task" data-id="${t.id}" title="${esc(agentName(ag))} · ${t.id} · ${esc(t.doing || "")}">
          ${face(ag)}<span class="nd-dot ${t.status === "asking" ? "wait" : state.running ? "run" : "ok"}"></span>
          ${t.status === "asking" ? `<span class="bubble">?</span>` : ""}</button>`;
      }).join("")}</span>` : ""}
      <span class="dock-s">${sum}</span>
    </div>`;
  }
  return `<div class="st ${sel} ${live ? "live" : ""}" data-act="selProgram" data-id="${p.id}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">${head}${body}${dock}</div>`;
}

function bufferCard(b, g) {
  const n = b.id === "live" ? QUEUED.live + (state.approved ? 3 : 0) + (state.rerun >= 5 ? 1 : 0) : QUEUED[b.id];
  return `<div class="bf" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">
    <div class="bf-t">${ic(b)}<span>${esc(b.name)}</span></div>
    <div class="bf-n">${n}<span>${b.id === "live" ? "shipped" : "waiting"}</span></div>
  </div>`;
}

/* a gate on the wire: the person who checks, or a sample dial */
function gateMark(p, x, y, live) {
  const a = autonomyOf(p);
  if (a === "auto") return "";
  const waiting = live ? tasksAt(p.id).filter((t) => t.status === "gate").length : 0;
  const label = a === "gated" ? p.owner : p.sample || "1 in 4";
  const title = a === "gated" ? `Gated · ${p.owner} checks every output` : `Sampled · ${p.owner} checks ${label}`;
  return `<div class="gm ${a} ${waiting ? "waiting" : ""}" style="left:${x}px;top:${y}px" data-act="${waiting ? "view" : "selProgram"}" data-id="${p.id}" ${waiting ? `data-to="run:needs"` : ""} title="${esc(title)}${waiting ? ` · ${waiting} waiting` : ""}">
    <span class="gm-d">${a === "gated" ? person(p.owner, "gm-p") : ICONS.pie}${waiting ? `<i class="gm-n">${waiting}</i>` : ""}</span>
    <b class="gm-l">${esc(label)}</b></div>`;
}

/* the shared frame for both readings of the line */
let GEO = null;   // { width, height, top, rect(id) } for the line on screen

function linePage(main, inner, top) {
  main.innerHTML = `
    <div class="lp" id="lp">
      <div class="lp-world" id="world">${inner}</div>
      <div class="lp-top">
        <div class="ver3" data-act="view" data-to="blueprint:versions">
          <span class="ver3-v">v${state.version}</span>
          <span class="ver3-t">Blueprint v${state.version}</span>
          <span class="ver3-s">forked from ${esc(WORKSPACE.forkedFrom)}</span>
        </div>
        ${top}
      </div>
    </div>`;
  requestAnimationFrame(fitLine);
}

function paintLine(main, live) {
  return live ? paintRunLine(main) : paintBlueprintLine(main);
}

/* ── Blueprint reading: the collections of work are the nodes. Programs are
   the arrows between them, and sit on the wire. This is how you think about
   the design: "a spec becomes a plan, through Plan slice". ── */

const BG = { NW: 244, NH: 124, HGAP: 228, ROW: 310, PW: 192 };

function blueprintGeo() {
  const { NW, NH, HGAP, ROW } = BG;
  const col = (i) => i * (NW + HGAP);
  const node = (x, y) => ({ x, y: y - NH / 2, w: NW, h: NH, cx: x + NW / 2, cy: y });
  const pos = {
    intent: node(col(0), 0), spec: node(col(1), 0), plan: node(col(2), 0),
    live: node(col(0), ROW), verified: node(col(1), ROW), branch: node(col(2), ROW),
  };
  const width = col(2) + NW;
  return { pos, width, height: ROW + NH, top: -NH / 2 - 10 };
}

/* a program sits on the wire between two collections, as a fixed-width card */
function programBox(p, x, y) {
  const triage = p.id === "triage";
  const a = triage ? "auto" : autonomyOf(p);
  const sel = state.sel === p.id ? "sel" : "";
  const changed = fixed() && (p.id === "plan" || p.id === "test");
  const gate = a === "gated" ? `Gated · ${p.owner}` : a === "sampled" ? `Sampled · ${p.sample}` : "Autonomous";
  return `<div class="bp-pr ${a} ${sel} ${triage ? "loop" : ""}" style="left:${x}px;top:${y}px;width:${BG.PW}px" ${triage ? "" : `data-act="selProgram" data-id="${p.id}"`}>
    <span class="bp-k">${ic(p)}</span>
    <span class="bp-copy">
      <span class="bp-t"><span>${esc(p.name)}</span>${changed ? `<i class="v15">v15</i>` : ""}</span>
      <small class="gate-s ${a}">${ICONS[AUTO_ICON[a]]}${esc(gate)}</small>
    </span>
  </div>`;
}

function collectionCard(b, g) {
  const sel = state.sel === "c:" + b.id ? "sel" : "";
  return `<div class="cn ${sel}" data-act="selCollection" data-id="${b.id}" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">
    <div class="cn-h">
      <span class="cn-k">${ic(b)}</span>
      <span class="cn-ht"><span class="cn-t">${esc(b.name)}</span><span class="cn-p">${esc(b.path)}</span></span>
    </div>
    <div class="cn-sc">${scorersOn(b.id).map((s) => `<span class="sc-chip ${s.cal.verdict}" title="${esc(s.name)} · ${esc(SCORE_KIND[s.kind])} · ${s.shown ? "shown to the program" : "held out"}">${ICONS.gauge}${esc(s.name)}</span>`).join("")
      || `<span class="sc-none">No scorer</span>`}</div>
    <div class="fields">${b.fields.map((f) => `<span class="f ${f === "constraints" ? "key" : ""}">${esc(f)}</span>`).join("")}</div>
  </div>`;
}

function paintBlueprintLine(main) {
  const geo = blueprintGeo(), { pos } = geo;
  const wires = [], boxes = [];
  const H = (a, b, p) => {           // horizontal: a and b on the same row
    const ltr = a.cx < b.cx;
    const x1 = ltr ? a.x + a.w : a.x, x2 = ltr ? b.x : b.x + b.w;
    wires.push(`<path class="w" d="M${x1} ${a.cy} H${x2}"/>`, arrow(x2 + (ltr ? -2 : 2), a.cy, ltr ? "r" : "l"));
    boxes.push({ p, x: (x1 + x2) / 2, y: a.cy, dir: ltr ? "right" : "left" });
  };
  // vertical: a above or below b, same column
  const vert = (a, b, p, cls = "") => {
    const down = a.cy < b.cy;
    const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
    wires.push(`<path class="w ${cls}" d="M${a.cx} ${y1} V${y2}"/>`, arrow(a.cx, y2 + (down ? -2 : 2), down ? "d" : "u", cls));
    boxes.push({ p, x: a.cx, y: (y1 + y2) / 2, dir: down ? "down" : "up" });
  };
  H(pos.intent, pos.spec, prog("spec"));
  H(pos.spec, pos.plan, prog("plan"));
  vert(pos.plan, pos.branch, prog("build"));
  H(pos.branch, pos.verified, prog("test"));
  H(pos.verified, pos.live, prog("ship"));
  vert(pos.live, pos.intent, { ...TRIAGE }, "back");

  GEO = { ...geo, rect: (id) => {
    if (id.startsWith("c:")) return pos[id.slice(2)];
    const bx = boxes.find((x) => x.p.id === id); return bx ? { x: bx.x - BG.PW / 2, y: bx.y, w: BG.PW, h: 0 } : null;
  } };

  linePage(main, `
    <svg class="lp-svg" width="${geo.width}" height="1" style="overflow:visible">${wires.join("")}</svg>
    ${BUFFERS.map((b) => collectionCard(b, pos[b.id])).join("")}
    ${boxes.map((x) => programBox(x.p, x.x, x.y)).join("")}`,
    `<div class="legend">
      <span><i class="lg-k node">${ICONS.doc}</i>where work waits</span>
      <span><i class="lg-k prog">${ICONS.code}</i>a program moves work on</span>
      <span class="sc-chip predicts">${ICONS.gauge}a scorer reads the artifact</span>
      <span class="gate-s gated">${ICONS.person}a person checks</span>
    </div>`);
}

/* ── Run reading: programs are the stations where agents work. Buffers are
   the small queues between them. ── */

function paintRunLine(main) {
  const geo = lineGeo(), { pos, width } = geo;
  const wires = [], marks = [];
  const flow = state.running ? "flow" : "";
  PROGRAMS.forEach((p) => {
    const a = pos["b" + p.from], s = pos["p" + p.id], b = pos["b" + p.to];
    if (s.cy === 0) {
      wires.push(`<path class="w ${flow}" d="M${a.x + a.w} ${a.cy} H${s.x}"/>`, arrow(s.x - 2, a.cy, "r"));
      if (p.to === "branch") {
        wires.push(`<path class="w ${flow}" d="M${s.cx} ${s.y + s.h} V${b.y}"/>`, arrow(s.cx, b.y - 2, "d"));
        marks.push(gateMark(p, s.cx, (s.y + s.h + b.y) / 2, true));
      } else {
        wires.push(`<path class="w ${flow}" d="M${s.x + s.w} ${s.cy} H${b.x}"/>`, arrow(b.x - 2, s.cy, "r"));
        marks.push(gateMark(p, (s.x + s.w + b.x) / 2, s.cy, true));
      }
    } else {
      wires.push(`<path class="w ${flow}" d="M${a.x} ${a.cy} H${s.x + s.w}"/>`, arrow(s.x + s.w + 2, s.cy, "l"));
      wires.push(`<path class="w ${flow}" d="M${s.x} ${s.cy} H${b.x + b.w}"/>`, arrow(b.x + b.w + 2, s.cy, "l"));
      marks.push(gateMark(p, (s.x + b.x + b.w) / 2, s.cy, true));
    }
  });
  const L = pos.blive, N = pos.bintent;
  wires.push(`<path class="w back ${flow}" d="M${L.cx} ${L.y} V${N.y + N.h}"/>`, arrow(L.cx, N.y + N.h + 2, "u", "back"));
  const tri = `<div class="tri" style="left:${L.cx}px;top:${(L.y + N.y + N.h) / 2}px">${ICONS.replay}${esc(TRIAGE.name)}</div>`;

  GEO = { width, height: G.ROW + G.SH + 30, top: geo.top, rect: (id) => pos["p" + id] };

  const idle = idleAgents();
  linePage(main, `
    <svg class="lp-svg" width="${width}" height="1" style="overflow:visible">${wires.join("")}</svg>
    ${BUFFERS.map((b) => bufferCard(b, pos["b" + b.id])).join("")}
    ${PROGRAMS.map((p) => stationCard(p, true, pos["p" + p.id])).join("")}
    ${marks.join("")}${tri}`,
    `<div class="idle-chip" title="Agents with no work">
       <span>Idle</span>${idle.map((ag) => `<span title="${esc(agentName(ag))} · waiting for work">${face(ag, "idle")}</span>`).join("") || `<em>none</em>`}
     </div>
     <div class="legend">
      <span>${face(agentById("you-1"))} an agent at work</span>
      <span><i class="bubble static">?</i> asking a question</span>
     </div>`);
}

function fitLine() {
  const lp = $("#lp"), world = $("#world");
  if (!lp || !world || !GEO) return;
  const { width, height, top } = GEO;
  const availW = lp.clientWidth - 80, availH = lp.clientHeight - 130;
  const k = Math.min(1.05, availW / width, availH / height);
  let ox = 40 + (availW - width * k) / 2;
  const oy = 84 + (availH - height * k) / 2 - top * k;
  // the panel floats over the right side. Slide the line left so the
  // selected item stays in view, instead of shrinking the whole line.
  const g = state.sel && GEO.rect(state.sel);
  if (g) {
    const right = ox + (g.x + g.w) * k, limit = lp.clientWidth - 412 - 16;
    if (right > limit) ox -= right - limit;
  }
  world.style.transform = `translate(${ox}px, ${oy}px) scale(${k})`;
}
window.addEventListener("resize", fitLine);

/* ─────────────────────────────────────────────── program panel ── */

function paintPanel() {
  const el = $("#panels");
  const onLine = state.view === "line" || state.view === "live";
  const c = onLine && state.sel && state.sel.startsWith("c:") ? buf(state.sel.slice(2)) : null;
  const p = onLine && state.sel && !c ? prog(state.sel) : null;
  el.classList.toggle("open", !!(p || c));
  if (c) return paintCollectionPanel(el, c);
  if (!p) { el.innerHTML = ""; return; }
  const a = autonomyOf(p);
  const rec = p.recommend;
  const here = tasksAt(p.id).filter((t) => t.agent);
  el.innerHTML = `
    <div class="card">
      <div class="card-h"><span class="card-t">Program</span>
        <div class="card-a"><button class="pnl-x" data-act="selProgram" data-id="${p.id}">${ICONS.x}</button></div></div>
      <div class="card-b">
        <div class="c-n">${esc(p.name)}</div>
        <div class="c-r">${esc(p.does)}</div>
        <div class="kv">
          <div class="kv-r"><span class="kv-k">Reads</span><span class="kv-v">${buf(p.from).name}</span></div>
          <div class="kv-r"><span class="kv-k">Writes</span><span class="kv-v">${buf(p.to).name}</span></div>
          <div class="kv-r"><span class="kv-k">Owner</span><span class="kv-v">${p.owner} · ${p.ownerRole}</span></div>
          <div class="kv-r"><span class="kv-k">Runs</span><span class="kv-v">${p.runs} this month</span></div>
          ${scorersOn(p.to).filter((s) => s.kind !== "human").map((s) => `
          <div class="kv-r"><span class="kv-k">Output score</span><span class="kv-v"><span class="lnk" data-act="view" data-to="blueprint:scorers">${esc(s.name)}</span> · avg ${s.avg} · ${s.lowN} low</span></div>`).join("")}
        </div>
        ${here.length ? `<div class="here">${here.map((t) => {
          const ag = agentById(t.agent);
          return `<button class="here-r" data-act="task" data-id="${t.id}">${face(ag)}<div><b>${esc(agentName(ag))}</b><span>${t.id} · ${esc(t.doing || "")}</span></div></button>`;
        }).join("")}</div>` : ""}
      </div>
    </div>

    <div class="card">
      <div class="card-h"><span class="card-t">Frame</span><span class="card-hint">What the agent sees</span></div>
      <div class="card-b">
        <div class="recipe">${frameFor(p).map((l) => `
          <div class="rc ${l.src} ${l.added ? "added" : ""}"><i></i><span>${esc(l.t)}</span><em>${l.added ? "v15" : SRC_LABEL[l.src]}</em></div>`).join("")}</div>
        <div class="rc-note">Blueprint parts are the same on every run. Work parts come from the item. A defect can come from either.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><span class="card-t">Autonomy</span><span class="card-hint">${p.decisions ? `${p.decisions} decisions this month` : "No decisions this month"}</span></div>
      <div class="card-b">
        <div class="dial">${Object.entries(AUTONOMY).map(([id, x]) => `
          <button class="${a === id ? "on " + id : ""}" data-act="autonomy" data-id="${p.id}" data-lvl="${id}"><b>${x.label}</b><span>${x.short}</span></button>`).join("")}</div>
        ${rec ? `<div class="rec ${rec.hold ? "hold" : ""}">${rec.hold ? ICONS.hand : ICONS.sparkle}
          <div><b>${rec.hold ? "Keep this gate" : `Ready for ${AUTONOMY[rec.to].label.toLowerCase()}`}</b><span>${esc(rec.why)}</span>
          ${!rec.hold && a !== rec.to ? `<button class="btn pri" data-act="autonomy" data-id="${p.id}" data-lvl="${rec.to}">Move to ${AUTONOMY[rec.to].label.toLowerCase()}</button>` : ""}</div></div>`
          : `<div class="rec">${ICONS.check}<div><b>Earned</b><span>No gate. The next station checks this output.</span></div></div>`}
      </div>
    </div>`;
}

function paintCollectionPanel(el, b) {
  const writer = PROGRAMS.find((p) => p.to === b.id) || (b.id === "intent" ? TRIAGE : null);
  const reader = PROGRAMS.find((p) => p.from === b.id) || (b.id === "live" ? TRIAGE : null);
  const link = (p) => p ? (p.id === "triage" ? esc(p.name) : `<span class="lnk" data-act="selProgram" data-id="${p.id}">${esc(p.name)}</span>`) : "—";
  const n = b.id === "live" ? QUEUED.live : QUEUED[b.id];
  el.innerHTML = `
    <div class="card">
      <div class="card-h"><span class="card-t">${esc(b.path)}</span>
        <div class="card-a"><button class="pnl-x" data-act="selCollection" data-id="${b.id}">${ICONS.x}</button></div></div>
      <div class="card-b">
        <div class="c-n">${esc(b.name)}</div>
        <div class="c-r">${esc(b.does)}</div>
        <div class="sub-h" style="margin-top:14px">Each item has</div>
        <div class="fields">${b.fields.map((f) => `<span class="f">${esc(f)}</span>`).join("")}</div>
        <div class="kv">
          <div class="kv-r"><span class="kv-k">Made by</span><span class="kv-v">${link(writer)}</span></div>
          <div class="kv-r"><span class="kv-k">Used by</span><span class="kv-v">${link(reader)}</span></div>
          <div class="kv-r"><span class="kv-k">Now</span><span class="kv-v">${n} ${b.id === "live" ? "shipped" : "waiting"}</span></div>
        </div>
      </div>
    </div>
    ${scorersOn(b.id).map((s) => scorerCard(s, writer, reader)).join("")}
    ${scorersOn(b.id).length ? "" : `
    <div class="card"><div class="card-h"><span class="card-t">Scorers</span></div>
      <div class="card-b"><div class="rc-note" style="margin-top:0">No scorer reads ${esc(b.name.toLowerCase())} yet. Defects from here are found late.</div></div></div>`}`;
}

/* one scorer, in the collection panel: what it reads, where its score goes, and if it is trusted */
function scorerCard(s, writer, reader) {
  const pol = policyOf(s);
  return `
    <div class="card">
      <div class="card-h"><span class="card-t">Scorer</span><span class="card-hint">v${s.v} · ${esc(SCORE_KIND[s.kind])}</span></div>
      <div class="card-b">
        <div class="c-n sc-n">${ICONS.gauge}${esc(s.name)}</div>
        <div class="fields" style="margin-top:8px">${s.dims.map((d) => `<span class="f">${esc(d)}</span>`).join("")}</div>
        <div class="kv">
          <div class="kv-r"><span class="kv-k">Scores</span><span class="kv-v">How well ${writer ? esc(writer.name) : "the writer"} did</span></div>
          <div class="kv-r"><span class="kv-k">Also means</span><span class="kv-v">How ready it is for ${reader ? esc(reader.name) : "the next step"}</span></div>
          <div class="kv-r"><span class="kv-k">Visibility</span><span class="kv-v">${s.shown ? "Shown to the program" : "Held out"}</span></div>
          <div class="kv-r"><span class="kv-k">Below ${s.below}</span><span class="kv-v">${esc(LOW_POLICY[pol].label)}</span></div>
        </div>
        ${calBars(s)}
      </div>
    </div>`;
}

/* calibration: escaped defect rate per score band. A trusted scorer slopes down. */
function calBars(s, big = false) {
  const max = Math.max(0.25, ...s.cal.bands);
  const verdict = { predicts: "Predicts defects", weak: "Does not predict", source: "Calibration source" }[s.cal.verdict];
  return `
    <div class="cal ${big ? "big" : ""}">
      <div class="cal-h"><span>Defect rate by score</span><b class="cal-v ${s.cal.verdict}">${verdict}</b></div>
      <div class="cal-bars">${s.cal.bands.map((r, i) => `
        <div class="cal-b"><i style="height:${Math.max(4, (r / max) * 100)}%" class="${i === 0 ? "lo" : i === 1 ? "mid" : "hi"}"></i><em>${Math.round(r * 100)}%</em><span>${BANDS[i]}</span></div>`).join("")}</div>
      ${big ? "" : `<div class="rc-note">${esc(s.cal.note)}</div>`}
    </div>`;
}

/* ─────────────────────────────────────────────── frame view ── */

function paintFrame(main) {
  const t = taskById(state.frameTask);
  const p = prog(t.at);
  const special = t.id === "AM-152";
  const ag = t.agent ? agentById(t.agent) : null;
  let layers = special ? FRAME_152.layers.map((l) => {
    if (l.t === "Spec › Constraints" && fixed()) return { ...l, missing: false, why: "Added to the blueprint in v15" };
    return l;
  }) : frameFor(p);
  if (special && state.sent) layers = [...layers.slice(0, 3), { k: "input", src: "work", t: "Answers · 3 decisions from Leo and Maya", fresh: true }, ...layers.slice(3)];
  const asking = special && !state.sent;
  const answered = Object.keys(state.answers).length;
  const blueprintGap = special && !fixed();

  main.innerHTML = `
    <div class="fr">
      <div class="fr-head">
        <button class="back" data-act="view" data-to="run:live">${ICONS.chevL}Live</button>
        <div class="fr-ht">
          <div class="fr-k">What the agent sees</div>
          <div class="fr-t"><span class="mono">${t.id}</span> ${esc(t.t)} <span class="dim">→</span> ${esc(p.name)}</div>
        </div>
        ${ag ? `<div class="who">${face(ag)}<div><b>${esc(agentName(ag))}</b><span>${esc(ag.owner.where)}</span></div></div>` : ""}
        <span class="pill ${asking ? "waiting" : "running"}">${asking ? "Asking · waits for answers" : esc(t.doing || "Working")}</span>
      </div>

      <div class="fr-lede">
        The model projects the next step from this frame. Some parts come from the <b class="c-bp">blueprint</b> and are the same on every run.
        Some parts come from the <b class="c-wk">work</b>: this item and its history. A gap in either one shows up in the output.
      </div>

      <div class="fr-grid">
        <section class="fr-col">
          <div class="sec-h">${ICONS.film}<span>The frame</span><em>${layers.filter((l) => !l.missing).length} parts</em></div>
          <div class="strip3">
            ${layers.map((l) => `
              <div class="cell ${l.k} ${l.missing ? "missing" : ""} ${l.fresh || l.added ? "fresh" : ""}">
                <div class="cell-src ${l.src}">${SRC_LABEL[l.src]}</div>
                <div class="cell-t">${esc(l.t)}${l.why ? `<small>${esc(l.why)}</small>` : ""}</div>
                <div class="cell-k">${l.k}</div>
              </div>`).join("")}
          </div>
          <div class="proj-arrow"><span>${ICONS.sparkle} Model</span><i></i><span>Projects: ${p.id === "plan" ? "a plan" : p.id === "spec" ? "a spec" : p.id === "build" ? "a branch" : p.id === "test" ? "a test report" : "a release"}</span></div>
        </section>

        <section class="fr-col side">
          ${special ? `
            <div class="sec-h">${ICONS.user}<span>Questions from the agent</span><em>${state.sent ? "Answered" : `${answered} of 3 answered`}</em></div>
            <div class="ask-lede">${state.sent
              ? "The answers are now part of the frame. The agent is writing the plan."
              : "The frame left these open. The blueprint tells the agent to ask instead of guess. Each question goes to its owner."}</div>
            <div class="qs">
              ${FRAME_152.questions.map((q, i) => `
                <div class="q ${state.answers[i] != null ? "done" : ""}">
                  <div class="q-t">${esc(q.q)}</div>
                  <div class="q-to">${person(q.to, "xs")} ${q.to} · ${q.role}</div>
                  <div class="q-o">${q.opts.map((o, j) => `<button class="${state.answers[i] === j ? "on" : ""}" data-act="answer" data-q="${i}" data-o="${j}" ${state.sent ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
                </div>`).join("")}
            </div>
            <div class="fr-acts">
              ${state.sent ? `<div class="fr-done">${ICONS.check} Sent. ${esc(agentName(ag))} continued.</div>`
                : `<button class="btn pri wide" data-act="sendAnswers" ${answered < 3 ? "disabled" : ""}>Send answers to the agent</button>`}
            </div>
            ${blueprintGap ? `
              <div class="gap-card">
                <div class="gap-h">${ICONS.wrench} This gap is in the blueprint</div>
                <div class="gap-t">The spec has a Constraints section, but the Plan slice frame does not include it. Answers fix this item. A blueprint change fixes every item after it.</div>
                <button class="btn" data-act="openProgram" data-id="plan">Open Plan slice in the blueprint</button>
              </div>` : ""}`
          : `
            <div class="sec-h">${ICONS.user}<span>Agent</span></div>
            <div class="ask-lede">${ag ? `${esc(agentName(ag))} is on this step. No open questions.` : "This item waits for a person at a gate."}</div>
            <div class="gap-card plain">
              <div class="gap-h">${ICONS.layout} Frame from blueprint v${state.version}</div>
              <div class="gap-t">To change what agents see at ${esc(p.name)}, change the blueprint. The next run uses the new frame.</div>
              <button class="btn" data-act="openProgram" data-id="${p.id}">Open ${esc(p.name)} in the blueprint</button>
            </div>`}
        </section>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────── defect trace ── */

function paintDefect(main) {
  const D = DEFECT;
  const done = state.rerun >= 5;
  const step = state.rerun;
  const runner = agentById("cloud-3");
  main.innerHTML = `
    <div class="dv">
      <div class="dv-head">
        <span class="pill ${done ? "done" : "bad"}">${done ? "Fixed in blueprint v15" : "Escaped defect"}</span>
        <span class="mono dim">${D.id}</span>
        <h1>${esc(D.title)}</h1>
        <div class="dv-sub">From <span class="mono">${D.slice}</span> ${esc(D.sliceTitle)} · ${esc(D.found)}</div>
      </div>

      <div class="dv-lede">Do not patch the code first. Ask which part of the blueprint let this through. Fix that part, then make the slice again.</div>

      <div class="sec-h">${ICONS.replay}<span>Trace</span><em>What each agent saw on the way to production, on blueprint v13</em></div>
      <div class="trace">
        ${D.path.map((s, i) => `
          <div class="tr ${s.ok ? "" : "flag"}">
            <div class="tr-n">${i + 1}</div>
            <div class="tr-t">${esc(prog(s.p).name)}</div>
            <div class="tr-r">${esc(s.result)}</div>
            <div class="tr-f">${esc(s.saw)}</div>
            ${s.score ? `<div class="tr-sc ${scoreCls(s.score.s)}" title="${esc(s.score.note || "")}">${ICONS.gauge}<span>${esc(s.score.by)}</span><b>${s.score.s}</b></div>
              ${s.score.note ? `<div class="tr-scn">${esc(s.score.note)}</div>` : ""}` : `<div class="tr-sc none">No scorer</div>`}
          </div>${i < D.path.length - 1 ? `<div class="tr-a">${ICONS.arrowR}</div>` : ""}`).join("")}
      </div>
      <div class="lead-lag">${ICONS.gauge}<span><b>The leading indicator saw it.</b> Plan quality scored this plan 4.1, but its policy was <i>continue, flagged</i>, so nobody looked.
        The defect, the lagging indicator, arrived 4 days later. <span class="lnk" data-act="view" data-to="blueprint:scorers">See the scorers</span></span></div>

      <div class="dv-grid">
        <div class="dv-card">
          <div class="sec-h">${ICONS.bulb}<span>Cause in the blueprint</span></div>
          <ol class="cause">${D.cause.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
          <div class="sim">
            <div class="sim-h">Same cause, earlier defects</div>
            ${D.similar.map((s) => `<div class="sim-r"><span class="mono">${s.id}</span>${esc(s.t)}</div>`).join("")}
            <div class="sim-note">A code patch fixes ${D.id} only. A blueprint change fixes the cause for all future slices.</div>
          </div>
        </div>

        <div class="dv-card">
          <div class="sec-h">${ICONS.wrench}<span>Blueprint change</span><em>v14 → v15</em></div>
          <div class="diff">
            ${D.change.map((c) => `
              <div class="df">
                <div class="df-h"><b>${esc(prog(c.p).name)}</b> · ${esc(c.what)}</div>
                ${c.rm ? `<div class="df-l rm">− ${esc(c.rm)}</div>` : ""}
                <div class="df-l add">+ ${esc(c.add)}</div>
              </div>`).join("")}
          </div>
          <div class="bt">
            <div class="bt-h">${ICONS.replay} Replay</div>
            <div class="bt-t">${esc(D.replay.text)}</div>
            <div class="bt-r">${ICONS.check} ${esc(D.replay.result)}</div>
          </div>
          <div class="dv-acts">
            ${!fixed() ? `<button class="btn pri" data-act="applyFix">Apply as blueprint v15</button>
                          <button class="btn ghost" data-act="patch">Patch the code by hand</button>`
              : step < 0 ? `<div class="ok-line">${ICONS.check} Blueprint v15 is live. New work uses the new frame and tests.</div>
                            <button class="btn pri" data-act="rerun">Discard ${D.slice} and make it again</button>`
              : ""}
          </div>
        </div>
      </div>

      ${fixed() ? staleSection() : ""}

      ${step >= 0 ? `
        <div class="sec-h">${ICONS.layout}<span>Made again on blueprint v15</span><em>${done ? "Shipped in Release 44" : `${esc(agentName(runner))} is working`}</em></div>
        <div class="trace rerun">
          ${PROGRAMS.map((p, i) => {
            const st = done || i < step ? "pass" : i === step ? "now" : "wait";
            return `
            <div class="tr ${st}">
              <div class="tr-top"><div class="tr-n">${st === "pass" ? ICONS.tick : i + 1}</div>${st === "now" ? face(runner, "walk") : ""}</div>
              <div class="tr-t">${esc(p.name)}</div>
              <div class="tr-r">${st === "pass" ? esc(D.rerun[p.id]) : st === "now" ? "Working…" : "Waiting"}</div>
            </div>${i < PROGRAMS.length - 1 ? `<div class="tr-a">${ICONS.arrowR}</div>` : ""}`;
          }).join("")}
        </div>
        ${done ? `<div class="ok-line big">${ICONS.check} ${D.slice} shipped again with no human edits to the code. D-27 and D-24 now have tests that would catch them.</div>` : ""}` : ""}
    </div>`;
}

/* After a blueprint change: outputs from changed programs are stale, and so is
   anything built from them. Nothing is undone in place. A rebuild policy decides
   what runs again, by how much human time the item has used. */
function staleSection() {
  return `
    <div class="sec-h">${ICONS.stale}<span>What v15 makes stale</span><em>Outputs of Plan slice and Test + validate, and everything built from them. Runs already started finish on v14.</em></div>
    <div class="stale">
      <div class="stale-r th"><span>Item</span><span>Stale output</span><span>Why</span><span>Human time used</span><span>Policy</span></div>
      ${STALE.map((x) => `
        <div class="stale-r ${x.act}">
          <span><span class="mono">${x.id}</span> ${esc(x.t)}</span>
          <span>${esc(x.made)}</span>
          <span class="dim">${esc(x.why)}</span>
          <span>${x.gate ? `${ICONS.person} ${esc(x.gate)}` : `<span class="dim">None</span>`}${x.score != null ? ` <i class="sc-n2 ${scoreCls(x.score)}">${x.score}</i>` : ""}</span>
          <span class="stale-act"><b class="act ${x.act}">${esc(REBUILD_ACT[x.act])}</b><small>${esc(x.note)}</small></span>
        </div>`).join("")}
    </div>
    <div class="dv-acts">
      ${state.rebuild
        ? `<div class="ok-line">${ICONS.check} 3 items queued on v15. AM-146 keeps its plan. Release 42 stays live.</div>`
        : `<button class="btn" data-act="rebuild">Apply the rebuild policy</button><span class="dim" style="font-size:12px">The line keeps running while this happens.</span>`}
    </div>`;
}

function startRerun() {
  state.rerun = 0;
  paint();
  const dv = $(".dv"); if (dv) dv.scrollTo({ top: dv.scrollHeight, behavior: "smooth" });
  const t = setInterval(() => {
    state.rerun++;
    if (state.rerun >= 5) { clearInterval(t); toast("AM-139 shipped on blueprint v15"); }
    paint();
  }, 1600);
}

/* ─────────────────────────────────────────────────── autonomy ── */

function chart(vals, { color, extra = null, step = false, min: lo, max: hi }) {
  const data = extra != null ? [...vals, extra] : vals;
  const w = 320, h = 120, pad = 6;
  const min = lo ?? Math.min(...data) * 0.9, max = hi ?? Math.max(...data) * 1.04;
  const X = (i) => pad + i / (DECISIONS.versions.length) * (w - pad * 2);
  const Y = (v) => h - 16 - ((v - min) / (max - min)) * (h - 30);
  const pts = data.map((v, i) => [X(i), Y(v)]);
  const line = step
    ? "M" + pts.map((p, i) => (i ? `H${p[0].toFixed(1)} V${p[1].toFixed(1)}` : `${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(" ")
    : `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L")}`;
  const area = `${line} L${pts.at(-1)[0]} ${h - 16} L${pts[0][0]} ${h - 16}Z`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${area}" fill="${color}" opacity=".08"/>
    <path d="${line}" stroke="${color}" stroke-width="1.8" fill="none" vector-effect="non-scaling-stroke"/>
    ${extra != null ? `<circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="3.5" fill="${color}"/>` : ""}
    <text x="${pad}" y="${h - 3}" class="ax">v1</text><text x="${X(data.length - 1)}" y="${h - 3}" class="ax" text-anchor="end">v${data.length}</text>
  </svg>`;
}

function paintAutonomy(main) {
  const f = fixed();
  const gatedNow = PROGRAMS.filter((p) => autonomyOf(p) !== "auto").length;
  const gatedSeries = [...DECISIONS.gated.slice(0, -1), gatedNow];
  main.innerHTML = `
    <div class="lv hv">
      <div class="lv-head"><div><div class="lv-title">Autonomy</div>
        <div class="lv-sub">Gates are scaffolding. A gate comes off a station when people stop changing what it makes.</div></div></div>

      <div class="auto-band">
        <div class="ab-l"><b>${PROGRAMS.length - gatedNow} of ${PROGRAMS.length}</b> stations run with no gate</div>
        <div class="ab-track">${PROGRAMS.map((p) => `<div class="ab-s ${autonomyOf(p)}" data-act="openProgram" data-id="${p.id}"><span>${esc(p.name)}</span><em>${AUTONOMY[autonomyOf(p)].label}</em></div>`).join("")}</div>
      </div>

      <div class="tiles two">
        <div class="tile"><div class="tile-k">Human decisions per shipped slice</div>
          <div class="tile-v">${f ? DECISIONS.v15 : DECISIONS.perSlice.at(-1)}</div><div class="tile-d">from ${DECISIONS.perSlice[0]} at v1</div>
          ${chart(DECISIONS.perSlice, { color: "var(--accent)", extra: f ? DECISIONS.v15 : null })}</div>
        <div class="tile"><div class="tile-k">Stations with a gate</div>
          <div class="tile-v">${gatedNow} of ${PROGRAMS.length}</div><div class="tile-d">from ${DECISIONS.gated[0]} of 5 at v1</div>
          ${chart(gatedSeries, { color: "var(--amber)", step: true, min: 0, max: 5.5, extra: f ? gatedNow : null })}</div>
      </div>

      <div class="sec-h pad">${ICONS.layout}<span>Stations</span><em>This month</em></div>
      <div class="tbl">
        <div class="tbl-r th"><span>Station</span><span>Owner</span><span>Runs</span><span>Decisions</span><span>Autonomy</span><span>Next step</span></div>
        ${PROGRAMS.map((p) => {
          const a = autonomyOf(p), rec = p.recommend;
          const next = rec && !rec.hold && a !== rec.to
            ? `<button class="btn" data-act="autonomy" data-id="${p.id}" data-lvl="${rec.to}">Move to ${AUTONOMY[rec.to].label.toLowerCase()}</button><small>${esc(rec.why)}</small>`
            : rec && rec.hold ? `<span class="dim">${p.id === "ship" ? "Gate by policy" : "Keep gate"}</span>` : `<span class="dim">—</span>`;
          return `<div class="tbl-r">
            <span class="lnk" data-act="openProgram" data-id="${p.id}">${esc(p.name)}</span>
            <span class="who-s">${person(p.owner, "xs")}${esc(p.owner)}</span>
            <span>${p.runs}</span>
            <span>${p.decisions || "—"}</span>
            <span><i class="auto-pill ${a}">${AUTONOMY[a].label}</i></span>
            <span class="next">${next}</span></div>`;
        }).join("")}
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────────── scorers ── */

function patternCard(pt) {
  const s = scorer(pt.scorer), p = prog(pt.p);
  const v15 = pt.id === "P-7";
  const done = v15 ? fixed() : state.draft >= 2;
  let foot;
  if (v15) {
    foot = fixed()
      ? `<div class="ok-line">${ICONS.check} Fixed in blueprint v15. ${esc(pt.after)}.</div>`
      : `<div class="pt-note">${ICONS.bug} D-31 escaped from this pattern. The same change fixes both.</div>
         <button class="btn" data-act="view" data-to="output:defect">Open D-31</button>`;
  } else if (state.draft === 0) {
    foot = `<button class="btn pri" data-act="draft">Draft a blueprint change</button>`;
  } else {
    foot = `
      <div class="bt">
        <div class="bt-h">${ICONS.replay} Replay on the draft</div>
        <div class="bt-t">${esc(pt.replay.text)} Scores arrive now. Defects would take weeks.</div>
        <div class="bt-m"><div><span>v${state.version}</span><b>${pt.replay.from}</b></div><div><span>Draft</span><b class="up">${pt.replay.to}</b></div><div><span>Dimension</span><b class="sm">${esc(pt.dim)}</b></div></div>
      </div>
      ${state.draft === 1
        ? `<button class="btn pri" data-act="sendDraft">Send to ${esc(pt.owner)} as a blueprint change</button>`
        : `<div class="ok-line">${ICONS.check} Sent to ${esc(pt.owner)}. It goes through a gate, like a fix for a defect.</div>`}`;
  }
  return `
    <div class="pt ${done ? "done" : ""}">
      <div class="pt-h"><span class="mono dim">${pt.id}</span><span class="sc-chip predicts">${ICONS.gauge}${esc(s.name)} › ${esc(pt.dim)}</span><span class="dim pt-first">First seen ${esc(pt.first)}</span></div>
      <div class="pt-t">Low on <b>${esc(pt.dim)}</b> in ${esc(pt.n)}</div>
      <div class="pt-r">Repeated reason: “${esc(pt.reason)}”</div>
      <div class="diff" style="margin-top:10px">
        <div class="df"><div class="df-h"><b>${esc(p.name)}</b> · ${esc(pt.change.what)}</div><div class="df-l add">+ ${esc(pt.change.add)}</div></div>
      </div>
      <div class="pt-f">${foot}</div>
    </div>`;
}

function paintScorers(main) {
  const flagged = SCORERS.reduce((a, s) => a + (policyOf(s) === "flag" ? s.lowN : 0), 0);
  const retries = SCORERS.reduce((a, s) => a + (policyOf(s) === "retry" ? s.lowN : 0), 0);
  const holds = SCORERS.reduce((a, s) => a + (policyOf(s) === "hold" ? s.lowN : 0), 0) + 1;
  main.innerHTML = `
    <div class="lv sv">
      <div class="lv-head"><div><div class="lv-title">Scorers</div>
        <div class="lv-sub">A scorer reads one artifact and returns a score with reasons. Scores are leading indicators: they arrive now. Defects are lagging indicators: they arrive weeks later, and they show which scorers to trust.</div></div></div>

      <div class="loops">
        <div class="loop item">
          <div class="loop-k">The item loop</div>
          <div class="loop-t">A low score routes one item</div>
          <div class="loop-b">It fixes one output. It does not change the factory. A retry is a lower limit, not a fix.</div>
          <div class="loop-n">
            <div><b>${flagged}</b><span>Flagged, continued</span></div>
            <div><b>${retries}</b><span>Retried once</span></div>
            <div><b>${holds}</b><span>Held for a person</span></div>
          </div>
          ${state.held ? "" : `<button class="loop-l" data-act="view" data-to="run:needs">${ICONS.gauge} AM-154 is held for Maya · Plan quality ${HELD.score}${ICONS.chevR}</button>`}
        </div>
        <div class="loop factory">
          <div class="loop-k">The factory loop</div>
          <div class="loop-t">A pattern of scores changes the blueprint</div>
          <div class="loop-b">All scores go to the revision pass, not only the low ones. Scores do not go back into the frame. They change the blueprint, and the blueprint changes the frame.</div>
          <div class="loop-n">
            <div><b>${SCORERS.reduce((a, s) => a + s.runs, 0)}</b><span>Scores this month</span></div>
            <div><b>${PATTERNS.length}</b><span>Patterns found</span></div>
            <div><b>${openPatterns()}</b><span>Open</span></div>
          </div>
        </div>
      </div>

      <div class="sec-h pad">${ICONS.sparkle}<span>Patterns</span><em>The factory loop. Repeated reasons across many items point at one part of the blueprint.</em></div>
      <div class="pts">${PATTERNS.map(patternCard).join("")}</div>

      <div class="sec-h pad">${ICONS.gauge}<span>Scorers on this blueprint</span><em>Each scorer earns trust when its scores predict later defects</em></div>
      <div class="scs">
        ${SCORERS.map((s) => {
          const pol = policyOf(s), rec = s.recommend;
          const b = buf(s.on);
          return `
          <div class="scr ${s.cal.verdict}">
            <div class="scr-a">
              <div class="scr-t">${ICONS.gauge}<b>${esc(s.name)}</b><span class="dim">v${s.v}</span></div>
              <div class="scr-m">Reads <span class="lnk" data-act="openCollection" data-id="${b.id}">${esc(b.name)}</span> · ${esc(SCORE_KIND[s.kind])} · ${s.shown ? "Shown to the program" : "Held out"}</div>
              <div class="fields" style="margin-top:7px">${s.dims.map((d) => `<span class="f">${esc(d)}</span>`).join("")}</div>
              <div class="scr-s"><span>avg <b>${s.avg}</b></span><span>${s.runs} scored</span><span>${s.lowN} below ${s.below}</span></div>
            </div>
            <div class="scr-p">
              <div class="scr-pl">Below ${s.below}</div>
              <div class="dial pol">${Object.entries(LOW_POLICY).map(([id, x]) => `
                <button class="${pol === id ? "on " + id : ""}" data-act="policy" data-id="${s.id}" data-lvl="${id}"><b>${x.short}</b></button>`).join("")}</div>
              ${rec && pol !== rec.low ? `<div class="rec">${ICONS.sparkle}<div><b>Trusted. Ready to hold.</b><span>${esc(rec.why)}</span>
                <button class="btn pri" data-act="policy" data-id="${s.id}" data-lvl="${rec.low}">Hold low plans</button></div></div>` : ""}
              ${s.cal.verdict === "weak" ? `<div class="rec hold">${ICONS.hand}<div><b>Not trusted</b><span>Keep it off any gate. Fix the scorer or remove it.</span></div></div>` : ""}
            </div>
            <div class="scr-c">${calBars(s, true)}<div class="rc-note">${esc(s.cal.note)}</div></div>
          </div>`;
        }).join("")}
      </div>
      <div class="sv-foot">Each score is stored with the artifact hash, the scorer version, the program revision and the blueprint version. Each artifact records the artifacts it came from, so a defect in shipped code reaches the score on the plan that came before it.</div>
    </div>`;
}

function paintVersions(main) {
  const list = fixed() ? [{ v: "v15", when: "Just now", what: "Plan slice: add Spec › Constraints to the frame. Test + validate: run in 3 time zones.", why: "D-31 · snooze wrong outside UTC", now: true }, ...VERSIONS] : VERSIONS;
  main.innerHTML = `
    <div class="lv">
      <div class="lv-head"><div><div class="lv-title">Blueprint versions</div>
        <div class="lv-sub">The blueprint keeps a history of itself. Most versions come from a defect that was traced back to a station.</div></div></div>
      <div class="vers">${list.map((v, i) => `
        <div class="vr ${v.now ? "now" : ""}">
          <div class="vr-v">${v.v}</div>
          <div class="vr-b"><div class="vr-t">${esc(v.what)}</div>
            <div class="vr-m"><span class="cat ${v.why.startsWith("D-") ? "gap" : "drift"}">${esc(v.why)}</span><span>${v.when}</span></div></div>
          ${i === 0 ? `<span class="pill running">Live</span>` : "<span></span>"}
        </div>`).join("")}
        <div class="vr base"><div class="vr-v">v1</div><div class="vr-b"><div class="vr-t">Forked from the ${esc(WORKSPACE.forkedFrom)} blueprint</div></div><span></span></div>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────── needs you ── */

function paintNeeds(main) {
  const ag = agentById(FRAME_152.agent);
  main.innerHTML = `
    <div class="lv">
      <div class="lv-head"><div><div class="lv-title">Needs you</div>
        <div class="lv-sub">The line keeps running. Only the work below waits for a person.</div></div></div>
      <div class="needs">
        <div class="sec-h pad">${ICONS.user}<span>Agents asking</span><em>The agent stopped instead of guessing</em></div>
        ${!state.sent ? `
          <button class="nd3" data-act="task" data-id="AM-152">
            ${face(ag)}
            <div class="nd3-b"><div class="nd3-t">${esc(agentName(ag))} has 3 questions about snooze</div><div class="nd3-s"><span class="mono">AM-152</span> at Plan slice · for Leo and Maya</div></div>
            ${ICONS.chevR}</button>` : `<div class="empty">${ICONS.check} No agents are waiting on a question.</div>`}

        <div class="sec-h pad">${ICONS.gauge}<span>Held by a scorer</span><em>The item loop. A low score sent this item to a person. The rest of the line keeps running.</em></div>
        ${state.held ? `<div class="empty">${ICONS.check} ${state.held === "approved"
            ? "AM-154 approved as it is. Maya's decision is recorded as a score, for calibration."
            : "AM-154 went back to Plan slice once, with the scorer's reasons. The next score decides again."}</div>` : `
          <div class="nd3 static held">
            ${person("Maya")}
            <div class="nd3-b">
              <div class="nd3-t">Plan for <span class="mono">${HELD.task}</span> ${esc(HELD.t)} scored <b class="sc-n2 lo">${HELD.score}</b></div>
              <div class="nd3-s">${esc(scorer(HELD.scorer).name)} · Plan slice gate · for Maya</div>
              <div class="hd-dims">${HELD.dims.map((d) => `
                <div class="hd-d ${scoreCls(d.s)}"><span>${esc(d.d)}</span><i><u style="width:${d.s * 10}%"></u></i><b>${d.s}</b>${d.why ? `<small>${esc(d.why)}</small>` : ""}</div>`).join("")}</div>
              <div class="hd-acts">
                <button class="btn pri" data-act="held" data-id="back">Send back with the reasons</button>
                <button class="btn" data-act="held" data-id="approved">Approve as it is</button>
              </div>
            </div>
          </div>`}

        <div class="sec-h pad">${ICONS.gate}<span>Gates</span><em>A person checks the output</em></div>
        <div class="nd3 static">
          ${person("Sebastian")}
          <div class="nd3-b"><div class="nd3-t">Approve Release 43 · 3 slices</div><div class="nd3-s">Ship release · for you</div></div>
          ${state.approved ? `<span class="pill running">Approved · deployed</span>` : `<button class="btn pri" data-act="approve">Approve</button>`}</div>
        <div class="nd3 static other">
          ${person("Leo")}
          <div class="nd3-b"><div class="nd3-t">Approve spec: Unsubscribe in one click</div><div class="nd3-s"><span class="mono">AM-161</span> · Write spec · for Leo</div></div>
          <span class="dim">Leo</span></div>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────── shipped ── */

function paintShipped(main) {
  const extra = [];
  if (state.rerun >= 5) extra.push({ id: "R-44", when: "Just now", v: "v15", slices: ["AM-139 Snooze a thread · made again"], decisions: 1, fresh: true });
  if (state.approved) extra.push({ id: "R-43", when: "Just now", v: "v14", slices: ["AM-142 Mute a thread", "AM-145 Signature editor", "AM-148 Reply-all warning"], decisions: 2 });
  const rel = [...extra, ...RELEASES];
  main.innerHTML = `
    <div class="lv">
      <div class="lv-head"><div><div class="lv-title">Shipped</div>
        <div class="lv-sub">The output of the line. Each release records the blueprint version that made it.</div></div></div>
      <div class="rels">${rel.map((r) => `
        <div class="rel ${r.fresh ? "fresh" : ""}">
          <div class="rel-h"><b>${r.id}</b><span class="tagm rt">blueprint ${r.v}</span><span class="dim">${r.when}</span>
            <span class="rel-d">${r.decisions} human decisions</span></div>
          ${r.slices.map((s) => {
            const bad = r.defect && s.startsWith(DEFECT.slice) && state.rerun < 5;
            return `<div class="rel-s ${bad ? "bad" : ""}">${bad ? ICONS.bug : ICONS.tick}<span>${esc(s)}</span>
              ${bad ? `<button class="lnk" data-act="view" data-to="output:defect">${DEFECT.id} · trace to the blueprint</button>` : ""}</div>`;
          }).join("")}
        </div>`).join("")}</div>
    </div>`;
}

/* ─────────────────────────────────────────────── actions ── */

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${ICONS.check}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 2400);
}

function markSel() {
  document.querySelectorAll(".st, .bp-pr").forEach((el) => el.classList.toggle("sel", el.dataset.id === state.sel));
  document.querySelectorAll(".cn").forEach((el) => el.classList.toggle("sel", "c:" + el.dataset.id === state.sel));
}

const ACTIONS = {
  mode: (d) => go(d.id),
  view: (d) => {
    if (d.to) { const [m, v] = d.to.split(":"); return go(m, v); }
    go(state.mode, d.id);
  },
  selProgram: (d) => {
    state.sel = state.sel === d.id ? null : d.id;
    markSel();
    paintPanel();
    const w = $("#world"); if (w) { w.classList.add("anim"); fitLine(); }
  },
  selCollection: (d) => {
    const id = "c:" + d.id;
    state.sel = state.sel === id ? null : id;
    markSel(); paintPanel();
    const w = $("#world"); if (w) { w.classList.add("anim"); fitLine(); }
  },
  openProgram: (d) => { go("blueprint", "line"); state.sel = d.id; paint(); },
  task: (d, e) => {
    e.stopPropagation();
    const t = taskById(d.id);
    if (t && t.status === "gate") return go("run", "needs");
    if (d.id === "AM-139") return go("output", "defect");
    go("run", "frame", { frameTask: d.id });
  },
  autonomy: (d) => {
    state.promoted[d.id] = d.lvl;
    toast(`${prog(d.id).name} is now ${AUTONOMY[d.lvl].label.toLowerCase()}`);
    paint();
  },
  answer: (d) => { state.answers[d.q] = +d.o; paint(); },
  sendAnswers: () => { state.sent = true; paint(); toast("Answers sent · the agent continued"); },
  applyFix: () => { state.version = 15; paint(); toast("Blueprint v15 is live"); },
  patch: () => toast("You can. But the cause stays in the blueprint, and the next time-based slice will hit it"),
  rerun: () => startRerun(),
  approve: () => { state.approved = true; paint(); toast("Release 43 approved · deployed"); },
  openCollection: (d) => { go("blueprint", "line"); state.sel = "c:" + d.id; paint(); },
  policy: (d) => {
    state.policy[d.id] = d.lvl;
    toast(`${scorer(d.id).name}: below ${scorer(d.id).below} now means ${LOW_POLICY[d.lvl].label.toLowerCase()}`);
    paint();
  },
  held: (d) => {
    state.held = d.id;
    toast(d.id === "back" ? "AM-154 back at Plan slice · one retry" : "AM-154 approved · moves on to Build");
    paint();
  },
  draft: () => { state.draft = 1; paint(); },
  sendDraft: () => { state.draft = 2; paint(); toast("Sent to Leo · Write spec: add Skill · measurable criteria"); },
  rebuild: () => { state.rebuild = true; paint(); toast("Rebuild policy applied · 3 items queued on v15"); },
  toggleRun: () => { state.running = !state.running; paint(); },
  theme: () => {
    const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    r.dataset.theme = dark ? "light" : "dark";
  },
  pool: (d) => {
    state.pool[d.id] = Math.max(0, Math.min(6, state.pool[d.id] + +d.d));
    paintSidebar(); paintStrip();
    if (state.view === "live") paintMain();
  },
  tourGo: (d) => {
    const i = +d.i; if (i < 0) return;
    state.tour = i;
    const g = TOUR[i].go;
    go(g.mode, g.view, g.view === "frame" ? { frameTask: "AM-152" } : {});
  },
  tourClose: () => { state.tourOpen = false; paintSidebar(); },
  tourOpen: () => { state.tourOpen = true; paintSidebar(); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset, e);
});

$("#sideToggle").onclick = () => { $(".win").classList.toggle("narrow"); setTimeout(fitLine, 60); };

/* deep links, for screenshots and reviews */
const q = new URLSearchParams(location.search);
if (q.get("view")) { const [m, v] = q.get("view").split(":"); state.mode = m; state.view = v; }
if (q.get("task")) state.frameTask = q.get("task");
if (q.get("v15")) state.version = 15;
if (q.get("sel")) state.sel = q.get("sel");
if (q.get("sent")) { state.sent = true; state.answers = { 0: 0, 1: 0, 2: 0 }; }
if (q.get("rerun")) state.rerun = +q.get("rerun");
if (q.get("rebuild")) state.rebuild = true;
if (q.get("held")) state.held = q.get("held");
if (q.get("draft")) state.draft = +q.get("draft");
if (q.get("dark")) document.documentElement.dataset.theme = "dark";
paint();
