/* Metafab Mark IV — the fab monitor, as a click-through. Iteration 2.
   core.js: icons, state, helpers and the panel shell.
   Then work.js (the Work and Jobs tabs), sheets.js, events.js. */

/* ─────────────────────────────────────────────── icons (SF-Symbols-ish) ── */

const I = (p, size = 16, sw = 1.3) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor"
     stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const ICONS = {
  fab:     (s = 16) => I(`<path d="M2.5 13.5V7l3.2 2.2V7l3.2 2.2V4.2h4.6v9.3z"/><path d="M10.9 6.6h.9M10.9 9h.9"/>`, s, 1.35),
  start:   I(`<path d="M5.4 3.4 12 8l-6.6 4.6z"/>`, 13),
  play:    `<svg width="9" height="9" viewBox="0 0 16 16"><path d="M4 2.2v11.6L13.6 8z" fill="currentColor"/></svg>`,
  pin:     I(`<path d="M9.6 2.2 13.8 6.4l-1.4.5-2.3 2.3.1 2.8-1.2 1.2L6.6 10.8 3 14.4M5.6 6.6l2.3-2.3.5-1.4"/><path d="M5.6 6.6 4.4 7.8l3.8 3.8"/>`, 14),
  gear:    I(`<circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"/>`, 14),
  chevD:   I(`<path d="M4 6.2 8 10l4-3.8"/>`, 12),
  chevR:   I(`<path d="M6 3.6 10.2 8 6 12.4"/>`, 12),
  chevL:   I(`<path d="M10.2 3.4 5.6 8l4.6 4.6"/>`, 15),
  tick:    I(`<path d="M3.2 8.3 6.3 11.4 12.8 4.7"/>`, 13),
  warn:    I(`<path d="M8 2.4 14.2 13H1.8z"/><path d="M8 6.6v3M8 11.3v.1"/>`, 12),
  info:    I(`<circle cx="8" cy="8" r="6"/><path d="M8 7.3v4M8 4.9v.1"/>`, 13),
  bug:     I(`<rect x="4.6" y="5" width="6.8" height="8.6" rx="3.4"/><path d="M8 7.4v6.2M6 5.2 5 3M10 5.2l1-2.2M4.6 8.6H2.4M13.6 8.6h-2.2M4.8 11.6l-2 1.2M11.2 11.6l2 1.2"/>`, 15),
  bulb:    I(`<path d="M5.8 11.2c0-1.4-2.2-2.4-2.2-5a4.4 4.4 0 0 1 8.8 0c0 2.6-2.2 3.6-2.2 5z"/><path d="M6.2 13.4h3.6"/>`, 15),
  chat:    I(`<path d="M2.6 3.8a1.4 1.4 0 0 1 1.4-1.4h8a1.4 1.4 0 0 1 1.4 1.4v5.6a1.4 1.4 0 0 1-1.4 1.4H7.2L4.2 13.4v-2.6H4a1.4 1.4 0 0 1-1.4-1.4z"/>`, 15),
  compass: I(`<circle cx="8" cy="8" r="6"/><path d="M10.6 5.4 9.2 9.2 5.4 10.6 6.8 6.8z"/>`, 15),
  download:I(`<path d="M8 2.6v7.6M4.8 7.2 8 10.4l3.2-3.2M3 13.2h10"/>`, 15),
  map:     I(`<path d="M2.4 4.2 6 2.6l4 1.6 3.6-1.6v9.2L10 13.4l-4-1.6-3.6 1.6z"/><path d="M6 2.6v9.2M10 4.2v9.2"/>`, 15),
  eye:     I(`<path d="M1.8 8s2.3-4.3 6.2-4.3S14.2 8 14.2 8s-2.3 4.3-6.2 4.3S1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>`, 15),
  flag:    I(`<path d="M3.8 14V2.6M3.8 3h8l-1.7 2.9 1.7 2.9h-8"/>`, 15),
  hammer:  I(`<path d="M9.2 6.8 3.1 12.9a1.1 1.1 0 0 1-1.6-1.6l6.1-6.1"/><path d="M6.4 4.4 8.8 2l4.6 4.6-1.6 1.6-1.4-1.4-1 .6-1.8-1.8.6-1z"/>`, 15),
  doc:     I(`<path d="M9 2.2H5a1.4 1.4 0 0 0-1.4 1.4v8.8A1.4 1.4 0 0 0 5 13.8h6a1.4 1.4 0 0 0 1.4-1.4V5.6z"/><path d="M9 2.2v3.4h3.4"/>`, 13),
  list:    I(`<path d="M5.8 4.4h7.4M5.8 8h7.4M5.8 11.6h7.4"/><path d="M2.8 4.4h.1M2.8 8h.1M2.8 11.6h.1" stroke-width="1.8"/>`, 13),
  layers:  I(`<path d="M8 2.4 14 5.6 8 8.8 2 5.6z"/><path d="M2 8.6l6 3.2 6-3.2"/>`, 13),
  pr:      I(`<circle cx="4.4" cy="3.8" r="1.6"/><circle cx="4.4" cy="12.2" r="1.6"/><circle cx="11.6" cy="12.2" r="1.6"/><path d="M4.4 5.4v5.2M11.6 10.6V6.6a2 2 0 0 0-2-2H7.6"/><path d="M9 3.2 7.6 4.6 9 6"/>`, 13),
  dot:     I(`<circle cx="8" cy="8" r="5.4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>`, 13),
  filter:  I(`<path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.2V8.4z"/>`, 11),
  folder:  I(`<path d="M2.2 4.4a1.2 1.2 0 0 1 1.2-1.2h2.8l1.4 1.4h5a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z"/>`, 13),
  diamond: I(`<path d="M8 2.2 13.8 8 8 13.8 2.2 8z"/>`, 11, 1.6),
  branch:  I(`<circle cx="4.4" cy="3.6" r="1.6"/><circle cx="4.4" cy="12.4" r="1.6"/><circle cx="11.6" cy="5.6" r="1.6"/><path d="M4.4 5.2v5.6M11.6 7.2c0 2.4-2.4 3-5.6 3.6"/>`, 13),
  job:     I(`<path d="M5.4 4.6 2.6 8l2.8 3.4M10.6 4.6 13.4 8l-2.8 3.4"/>`, 10, 1.6),
  term:    I(`<rect x="2" y="2.8" width="12" height="10.4" rx="1.9"/><path d="M4.7 6.3 6.3 7.9 4.7 9.5M8.2 9.7h3.2"/>`, 13),
  hand:    I(`<path d="M5.4 8.4V3.8a1 1 0 0 1 2 0v3.6V2.8a1 1 0 0 1 2 0v4.6V3.6a1 1 0 0 1 2 0v5.6c0 2.6-1.6 4.6-4.2 4.6-1.6 0-2.6-.8-3.4-2L2.6 9.2a1 1 0 0 1 1.6-1.2z"/>`, 13),
  wifi:    I(`<path d="M1.8 6.2a9 9 0 0 1 12.4 0M4 8.6a5.8 5.8 0 0 1 8 0M6.2 11a2.6 2.6 0 0 1 3.6 0"/><circle cx="8" cy="13" r=".4" fill="currentColor"/>`, 15),
  batt:    `<svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke="currentColor"><rect x=".7" y=".7" width="20" height="10.6" rx="3" opacity=".5"/><rect x="2.4" y="2.4" width="13" height="7.2" rx="1.6" fill="currentColor" stroke="none"/><path d="M22.6 4.4v3.2" opacity=".5" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  search:  I(`<circle cx="7" cy="7" r="4.3"/><path d="m10.2 10.2 3.4 3.4"/>`, 14),
};

/* Harness marks: a small app-icon tile per agent. Drawn in a 16-unit box;
   the tile colour comes from CSS. */
const HZ_GLYPH = {
  "claude-code": `<g stroke="#fff" stroke-width="1.05" stroke-linecap="round">${[0, 36, 72, 108, 144, 180, 216, 252, 288, 324]
    .map((a, i) => `<path d="M8 6.6V${i % 2 ? 3.4 : 2.5}" transform="rotate(${a + (i % 3) * 4} 8 8)"/>`).join("")}</g>`,
  codex: `<g fill="none" stroke="currentColor" stroke-width="1.15">${[0, 60, 120]
    .map((a) => `<ellipse cx="8" cy="8" rx="4.6" ry="2.3" transform="rotate(${a} 8 8)"/>`).join("")}</g>`,
  cursor: `<g fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"><path d="M8 2.8 12.6 5.4v5.2L8 13.2 3.4 10.6V5.4z"/><path d="M3.4 5.4 8 8l4.6-2.6M8 8v5.2"/></g>`,
  opencode: `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.2" y="3.6" width="7.6" height="8.8" rx=".6"/><path d="M6.4 6.2h3.2v5" /></g>`,
  orca: `<g fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6c1.3-.9 2.7-.9 4 0s2.7.9 4 0"/><path d="M6.6 9.2 8.6 4.2l1 4.6"/></g>`,
  nodeterm: `<g stroke="#fff" stroke-width="1.2" fill="#fff"><path d="M5 5.4 11 8 5 10.6" fill="none"/><circle cx="5" cy="5.4" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="10.6" r="1.4"/></g>`,
};

/* an agent tile: harness glyph, state on the tile, and a person badge when
   the agent runs on a teammate's machine */
const hzIcon = (id, s) => {
  const p = s && s.who && s.who !== ME ? PEOPLE[s.who] : null;
  const ttl = `${hzById(id).label}${p ? ` · ${p.name}` : ""}`;
  return `<span class="hzi hz-${id}${s ? ` st-${s.state}` : ""}" title="${esc(ttl)}"><svg viewBox="0 0 16 16" width="100%" height="100%">${HZ_GLYPH[id] || ""}</svg>${p ? `<b class="who" style="--hue:${p.hue}">${p.short}</b>` : ""}</span>`;
};
const personDot = (w) => `<b class="pdot" style="--hue:${PEOPLE[w].hue}">${PEOPLE[w].short}</b>`;

/* ─────────────────────────────────────────────────────────────── state ── */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = () => Date.now();
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);

const SESSIONS = SEED_SESSIONS.map((s) => ({ ...s, startedAt: now() - s.min * 60000, changedAt: now() }));
const FINISHED = [];
/* artifacts and their trails get timestamps from their ages */
FABS.forEach((f) => f.artifacts.forEach((a) => {
  a.since = now() - a.age * 60000;
  (a.trail || []).forEach((t) => { t.at = now() - (t.ago ?? a.age) * 60000; });
}));

const state = {
  open: true,
  pinned: false,
  pos: null,
  tab: "work",             // work | jobs
  fab: "dragonfly",        // a fab id, or "all"
  picker: false,
  sheet: null,             // { kind: "start" | "job" | "art" | "session" | "settings", ... }
  expanded: new Set(["dragonfly:review"]), // "fabId:stage" rows opened to list their artifacts
  hidOpen: new Set(),      // "fabId:stage" rows whose hidden (moved on) artifacts are listed
  flash: null,             // session id to flash once
  bump: null,              // artifact id to bump once
  settings: { harness: "claude-code", terminal: "Ghostty", notify: true, login: true, theme: "system", team: true },
};

const fabById = (id) => FABS.find((f) => f.id === id);
const jobOf = (fab, name) => fab.jobs.find((j) => j.name === name);
const stageOf = (fab, id) => fab.stages.find((s) => s.id === id);
const artOf = (fab, id) => fab.artifacts.find((a) => a.id === id);
const hzById = (id) => HARNESSES.find((h) => h.id === id);
const visibleFabs = () => (state.fab === "all" ? FABS : [fabById(state.fab)]);

/* which sessions are shown: mine always, teammates' when the preview is on */
const vis = () => SESSIONS.filter((s) => s.who === ME || state.settings.team);
const mine = (l = SESSIONS) => l.filter((s) => s.who === ME);
const live = (fabId) => vis().filter((s) => s.fab === fabId);
const waiting = (l) => l.filter((s) => s.state === "waits");
const running = (l) => l.filter((s) => s.state === "working" || s.state === "starting" || s.state === "waits");

const RANK = { waits: 0, starting: 1, working: 2, idle: 3, unknown: 4 };
const byRank = (a, b) => (a.who === ME ? 0 : 1) - (b.who === ME ? 0 : 1) || RANK[a.state] - RANK[b.state] || b.startedAt - a.startedAt;

const artsIn = (fab, st) => fab.artifacts.filter((a) => a.stage === st).sort((a, b) => a.since - b.since);

/* What a stage's filter also finds, but history hides: earlier artifacts of
   work that has moved on. Only sources where an old artifact keeps matching
   need it (an open note, an approved spec, a ready slice on main). A PR that
   moves from draft to ready no longer matches its old stage by itself.
   Done work still hides (a shipped PR's plan does not come back); an
   abandoned PR hides nothing, so its slice shows again. Each entry lists
   every later artifact that hides it: fan-out and fan-in. */
const HIDES = new Set(["note", "line", "spec", "slice", "issue"]);
function hiddenIn(fab, stId) {
  if (!HIDES.has(stageOf(fab, stId).kind)) return [];
  const out = new Map();
  for (const a of fab.artifacts) {
    const steps = (a.trail || []).flatMap((t) => [t, ...(t.also || [])]);
    for (const t of steps) {
      if (t.stage !== stId || t.abandoned || !t.ref || t.ref === a.ref) continue;
      const h = out.get(t.ref) || { ref: t.ref, title: t.title || refTitle(t.ref) || a.title, by: [] };
      if (!h.by.includes(a)) h.by.push(a);
      out.set(t.ref, h);
    }
  }
  return [...out.values()];
}
/* "docs/plans/export-csv.md § S0" → "export-csv S0" */
function refTitle(ref) {
  const m = ref.match(/([\w-]+)\.md(?: § (\S+))?$/);
  return m ? `${m[1]}${m[2] ? " " + m[2] : ""}` : null;
}
const agentsOn = (fab, a) => live(fab.id).filter((s) => s.art === a.id).sort(byRank);
const makingIn = (fab, st) => live(fab.id).filter((s) => s.makes === st && !s.art);
const looseIn = (fab) => live(fab.id).filter((s) => !s.art && !s.makes);

function ago(ms) {
  const m = Math.max(0, Math.floor((now() - ms) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
const dur = (min) => (min >= D ? `${Math.round(min / D)}d` : min >= H ? `${Math.round(min / H)}h` : `${min}m`);
const fill = (v) => (v === "$USER" ? ME : v ?? "");
const whoName = (w) => (w === ME ? "you" : PEOPLE[w]?.name || w);

/* scores: 0–10, higher is better */
const scCls = (v) => (v >= 7 ? "hi" : v >= 5 ? "mid" : "lo");
const scoreChip = (v, t = "") => `<span class="sc ${scCls(v)}" ${t ? `title="${esc(t)}"` : ""}>${v.toFixed(1)}</span>`;
/* the worst score among the scorers of the artifact's own stage */
function worst(fab, a) {
  const st = stageOf(fab, a.stage);
  const vs = (st.scoredBy || []).map((k) => a.scores?.[k]).filter((v) => v != null);
  return vs.length ? Math.min(...vs) : null;
}
function avgScore(arts, k) {
  const vs = arts.map((a) => a.scores?.[k]).filter((v) => v != null);
  return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : null;
}

/* the score ring: a round bar chart. Each scorer owns an equal share of the
   circle and fills it by its score; the fills are laid end to end, so the arc
   reads as the total. One colour for the whole ring, from the total. */
function scoreRing(vals, o = {}) {
  vals = vals.filter((v) => v != null);
  const size = o.size || 16, sw = o.sw || Math.max(2, size * 0.16);
  const r = (size - sw) / 2, c = size / 2;
  const n = vals.length;
  const total = n ? vals.reduce((x, y) => x + y, 0) / n : null;
  const gap = n > 1 ? 2.2 : 0;
  let at = 0;
  const segs = vals.map((v) => {
    const len = Math.max(0, (v / 10) * (100 / n) - gap);
    const s = `<circle class="sr-f" cx="${c}" cy="${c}" r="${r}" pathLength="100" stroke-width="${sw}"
      stroke-dasharray="${len} 100" stroke-dashoffset="${-at}"/>`;
    at += len + gap;
    return s;
  }).join("");
  const label = o.label && total != null ? `<b class="sr-n">${total.toFixed(1)}</b>` : "";
  const t = o.title ?? (total != null ? `Score ${total.toFixed(1)}` : "Not scored");
  return `<span class="sr ${total == null ? "none" : scCls(total)} ${o.cls || ""}" style="--sz:${size}px" title="${esc(t)}">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle class="sr-t" cx="${c}" cy="${c}" r="${r}" stroke-width="${sw}"/><g transform="rotate(-90 ${c} ${c})">${segs}</g></svg>${o.inner || ""}${label}</span>`;
}
/* the scores the artifact's own stage asks for, with a tooltip naming each */
function stageScores(fab, a) {
  const ks = (stageOf(fab, a.stage).scoredBy || []).filter((k) => a.scores?.[k] != null);
  return { vals: ks.map((k) => a.scores[k]), title: ks.map((k) => `${fab.scorers[k].title} ${a.scores[k].toFixed(1)}`).join(" · ") };
}

/* the isometric cube drawn for each artifact */
const CUBE_SVG = `<svg class="cu" viewBox="0 0 14 16"><path class="cu-t" d="M7 1.2 12.8 4.5 7 7.8 1.2 4.5z"/><path class="cu-l" d="M1.2 4.5 7 7.8v6.9l-5.8-3.3z"/><path class="cu-r" d="M12.8 4.5 7 7.8v6.9l5.8-3.3z"/></svg>`;

/* one artifact, as a cube. Its colour is the state of the agents on it;
   a red mark under it is a low score. */
function artGlyph(fab, a) {
  const w = worst(fab, a);
  return `<i class="ga-cube ${cubeState(fab, a)} ${w != null && w < 5 ? "lo" : ""}">${CUBE_SVG}</i>`;
}
/* an artifact still being made: a dashed wireframe cube */
const makingGlyph = (s) => `<i class="ga-cube make ${s.state === "waits" ? "wait" : ""}">${CUBE_SVG}</i>`;

/* a cube's state is the state of the agents on its artifact */
function cubeState(fab, a) {
  const ags = agentsOn(fab, a);
  if (ags.some((s) => s.state === "waits")) return "wait";
  if (ags.some((s) => s.state === "working" || s.state === "starting")) return "run";
  if (ags.length) return "idle";
  return "";
}

/* the start buttons: one per entry, or one per job that starts new work */
function startsOf(fab) {
  return fab.jobs.filter((j) => !j.from).flatMap((j) =>
    j.entries
      ? j.entries.map((e, i) => ({ fab: fab.id, job: j.name, entry: i, title: e.title, blurb: e.blurb, icon: e.icon }))
      : [{ fab: fab.id, job: j.name, entry: null, title: j.title, blurb: j.blurb || j.description, icon: j.icon || "start" }]);
}

/* ═══════════════════════════════════════════════════════════════ render ══ */

function render() {
  renderMenubar();
  renderHead();
  renderTabs();
  renderBody();
  renderFoot();
  place();
}

function renderMenubar() {
  const w = waiting(mine()).length;
  const r = running(mine()).length;
  const icon = $("#fabIcon");
  icon.innerHTML = `${ICONS.fab(16)}${w ? `<i class="mb-w"></i>` : ""}${r ? `<span class="mb-n">${r}</span>` : ""}`;
  icon.title = w ? `${w} of your agents wait for you` : `${r} of your agents running`;
  icon.classList.toggle("on", state.open);
}

function renderHead() {
  const all = state.fab === "all";
  const fab = all ? null : fabById(state.fab);
  $("#pnHead").innerHTML = `
    <button class="fab-pick ${state.picker ? "open" : ""}" data-act="picker" title="${all ? "" : esc(fab.path)}">
      <span class="fab-nm">${all ? "All fabs" : esc(fab.name)}</span>
      <span class="fab-chev">${ICONS.chevD}</span>
    </button>
    <span class="sp"></span>
    <button class="ico ${state.pinned ? "on" : ""}" data-act="pin" title="${state.pinned ? "Unpin" : "Pin"}">${ICONS.pin}</button>
    <button class="ico" data-act="settings" title="Settings">${ICONS.gear}</button>
    ${state.picker ? pickerHtml() : ""}`;
}

function pickerHtml() {
  const opt = (id, name, cnt) => `
    <button class="pop-o" data-act="fab" data-id="${id}">
      <span class="tick">${state.fab === id ? ICONS.tick : ""}</span>
      <span>${esc(name)}</span><span class="cnt">${cnt}</span></button>`;
  return `<div class="pop">
    ${opt("all", "All Fabs", running(mine()).length || "")}
    <div class="pop-sep"></div>
    ${FABS.map((f) => opt(f.id, f.name, running(mine(live(f.id))).length || "")).join("")}
    <div class="pop-sep"></div>
    <button class="pop-new" data-act="addfab"><span>Add Folder…</span></button>
  </div>`;
}

function renderTabs() {
  const tab = (id, label) =>
    `<button class="${state.tab === id ? "on" : ""}" data-act="tab" data-id="${id}">${label}</button>`;
  $("#pnTabs").innerHTML = `<div class="seg">${tab("work", "Pipeline")}${tab("jobs", "Jobs")}</div>`;
}

function renderBody() {
  const body = $("#pnBody");
  const keep = body.dataset.tab === state.tab + state.fab ? body.scrollTop : 0;
  body.innerHTML = state.tab === "jobs" ? jobsHtml() : workHtml();
  body.dataset.tab = state.tab + state.fab;
  body.scrollTop = keep;
  if (state.flash) {
    const el = body.querySelector(`.it[data-sid="${state.flash}"], .ag[data-sid="${state.flash}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
    state.flash = null;
  }
  if (state.bump) {
    body.querySelectorAll(`[data-a="${state.bump}"]`).forEach((el) => el.classList.add("bump"));
    state.bump = null;
  }
}

function renderFoot() {
  const all = state.fab === "all";
  const fab = all ? null : fabById(state.fab);
  const bad = all ? FABS.filter((f) => !f.check.ok) : fab.check.ok ? [] : [fab];
  const team = state.settings.team ? SESSIONS.filter((s) => s.who !== ME && (all || s.fab === fab.id)).length : 0;
  $("#pnFoot").innerHTML = `
    <span class="live" title="fab status --all --watch --json">${mine().length} yours${team ? ` · ${team} team <span class="pv">preview</span>` : ""}</span>
    <button class="chk ${bad.length ? "bad" : ""}" data-act="check">
      ${bad.length ? `${ICONS.warn} ${bad.length === 1 && !all ? "Out of date" : `${bad.length} out of date`}`
        : all ? "Up to date" : `<span class="mono">${fab.commit}</span>`}
    </button>`;
}
