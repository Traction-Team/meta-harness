/* Metafab Mark IV — the fab monitor, as a click-through.
   The monitor is a view over the `fab` CLI. Here the CLI is faked by data.js
   and a small simulation at the bottom of this file. */

/* ─────────────────────────────────────────────── icons (SF-Symbols-ish) ── */

const I = (p, size = 16, sw = 1.3) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor"
     stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const ICONS = {
  fab:     (s = 16) => I(`<path d="M2.5 13.5V7l3.2 2.2V7l3.2 2.2V4.2h4.6v9.3z"/><path d="M10.9 6.6h.9M10.9 9h.9"/>`, s, 1.35),
  now:     I(`<circle cx="8" cy="8" r="6.1"/><path d="M8 4.7V8l2.3 1.5"/>`, 14),
  start:   I(`<path d="M5.4 3.4 12 8l-6.6 4.6z"/>`, 13),
  map:     I(`<path d="M2.4 4.2 6 2.6l4 1.6 3.6-1.6v9.2L10 13.4l-4-1.6-3.6 1.6z"/><path d="M6 2.6v9.2M10 4.2v9.2"/>`, 14),
  pin:     I(`<path d="M9.6 2.2 13.8 6.4l-1.4.5-2.3 2.3.1 2.8-1.2 1.2L6.6 10.8 3 14.4M5.6 6.6l2.3-2.3.5-1.4"/><path d="M5.6 6.6 4.4 7.8l3.8 3.8"/>`, 14),
  gear:    I(`<circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"/>`, 14),
  chevD:   I(`<path d="M4 6.2 8 10l4-3.8"/>`, 12),
  chevR:   I(`<path d="M6 3.6 10.2 8 6 12.4"/>`, 12),
  chevL:   I(`<path d="M10.2 3.4 5.6 8l4.6 4.6"/>`, 15),
  tick:    I(`<path d="M3.2 8.3 6.3 11.4 12.8 4.7"/>`, 13),
  check:   I(`<circle cx="8" cy="8" r="6"/><path d="M5.3 8.2 7.1 10l3.6-3.9"/>`, 12),
  warn:    I(`<path d="M8 2.4 14.2 13H1.8z"/><path d="M8 6.6v3M8 11.3v.1"/>`, 12),
  info:    I(`<circle cx="8" cy="8" r="6"/><path d="M8 7.3v4M8 4.9v.1"/>`, 13),
  plus:    I(`<path d="M8 3.4v9.2M3.4 8h9.2"/>`, 13),
  bug:     I(`<rect x="4.6" y="5" width="6.8" height="8.6" rx="3.4"/><path d="M8 7.4v6.2M6 5.2 5 3M10 5.2l1-2.2M4.6 8.6H2.4M13.6 8.6h-2.2M4.8 11.6l-2 1.2M11.2 11.6l2 1.2"/>`, 15),
  bulb:    I(`<path d="M5.8 11.2c0-1.4-2.2-2.4-2.2-5a4.4 4.4 0 0 1 8.8 0c0 2.6-2.2 3.6-2.2 5z"/><path d="M6.2 13.4h3.6"/>`, 15),
  chat:    I(`<path d="M2.6 3.8a1.4 1.4 0 0 1 1.4-1.4h8a1.4 1.4 0 0 1 1.4 1.4v5.6a1.4 1.4 0 0 1-1.4 1.4H7.2L4.2 13.4v-2.6H4a1.4 1.4 0 0 1-1.4-1.4z"/>`, 15),
  compass: I(`<circle cx="8" cy="8" r="6"/><path d="M10.6 5.4 9.2 9.2 5.4 10.6 6.8 6.8z"/>`, 15),
  download:I(`<path d="M8 2.6v7.6M4.8 7.2 8 10.4l3.2-3.2M3 13.2h10"/>`, 15),
  doc:     I(`<path d="M9 2.2H5a1.4 1.4 0 0 0-1.4 1.4v8.8A1.4 1.4 0 0 0 5 13.8h6a1.4 1.4 0 0 0 1.4-1.4V5.6z"/><path d="M9 2.2v3.4h3.4"/>`, 12),
  folder:  I(`<path d="M2.2 4.4a1.2 1.2 0 0 1 1.2-1.2h2.8l1.4 1.4h5a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z"/>`, 13),
  diamond: I(`<path d="M8 2.2 13.8 8 8 13.8 2.2 8z"/>`, 11, 1.6),
  branch:  I(`<circle cx="4.4" cy="3.6" r="1.6"/><circle cx="4.4" cy="12.4" r="1.6"/><circle cx="11.6" cy="5.6" r="1.6"/><path d="M4.4 5.2v5.6M11.6 7.2c0 2.4-2.4 3-5.6 3.6"/>`, 13),
  program: I(`<path d="M5.4 4.6 2.6 8l2.8 3.4M10.6 4.6 13.4 8l-2.8 3.4"/>`, 10, 1.6),
  term:    I(`<rect x="2" y="2.8" width="12" height="10.4" rx="1.9"/><path d="M4.7 6.3 6.3 7.9 4.7 9.5M8.2 9.7h3.2"/>`, 13),
  hand:    I(`<path d="M5.4 8.4V3.8a1 1 0 0 1 2 0v3.6V2.8a1 1 0 0 1 2 0v4.6V3.6a1 1 0 0 1 2 0v5.6c0 2.6-1.6 4.6-4.2 4.6-1.6 0-2.6-.8-3.4-2L2.6 9.2a1 1 0 0 1 1.6-1.2z"/>`, 14),
  wifi:    I(`<path d="M1.8 6.2a9 9 0 0 1 12.4 0M4 8.6a5.8 5.8 0 0 1 8 0M6.2 11a2.6 2.6 0 0 1 3.6 0"/><circle cx="8" cy="13" r=".4" fill="currentColor"/>`, 15),
  batt:    `<svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke="currentColor"><rect x=".7" y=".7" width="20" height="10.6" rx="3" opacity=".5"/><rect x="2.4" y="2.4" width="13" height="7.2" rx="1.6" fill="currentColor" stroke="none"/><path d="M22.6 4.4v3.2" opacity=".5" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  search:  I(`<circle cx="7" cy="7" r="4.3"/><path d="m10.2 10.2 3.4 3.4"/>`, 14),
};

const HZ_COLOR = { "claude-code": "#d97757", codex: "#10a37f", orca: "#6a7cff", opencode: "#888", nodeterm: "#a78bfa" };

/* Harness marks: a small app-icon tile per agent, so a glance says which
   agents run where. Drawn in a 16-unit box; the tile colour comes from CSS. */
const HZ_GLYPH = {
  /* Claude: the starburst */
  "claude-code": `<g stroke="#fff" stroke-width="1.05" stroke-linecap="round">${[0, 36, 72, 108, 144, 180, 216, 252, 288, 324]
    .map((a, i) => `<path d="M8 6.6V${i % 2 ? 3.4 : 2.5}" transform="rotate(${a + (i % 3) * 4} 8 8)"/>`).join("")}</g>`,
  /* Codex / ChatGPT: the knot, as three crossed loops */
  codex: `<g fill="none" stroke="currentColor" stroke-width="1.15">${[0, 60, 120]
    .map((a) => `<ellipse cx="8" cy="8" rx="4.6" ry="2.3" transform="rotate(${a} 8 8)"/>`).join("")}</g>`,
  /* opencode: the nested square */
  opencode: `<g fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.2" y="3.6" width="7.6" height="8.8" rx=".6"/><path d="M6.4 6.2h3.2v5" /></g>`,
  /* Orca: a fin over a wave */
  orca: `<g fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.6c1.3-.9 2.7-.9 4 0s2.7.9 4 0"/><path d="M6.6 9.2 8.6 4.2l1 4.6"/></g>`,
  /* nodeterm: three linked nodes */
  nodeterm: `<g stroke="#fff" stroke-width="1.2" fill="#fff"><path d="M5 5.4 11 8 5 10.6" fill="none"/><circle cx="5" cy="5.4" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="10.6" r="1.4"/></g>`,
};
const hzIcon = (id, s) => `<span class="hzi hz-${id}${s ? ` st-${s.state}` : ""}" title="${esc(hzById(id).label)}"><svg viewBox="0 0 16 16" width="100%" height="100%">${HZ_GLYPH[id] || ""}</svg></span>`;

/* ─────────────────────────────────────────────────────────────── state ── */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = () => Date.now();

const SESSIONS = SEED_SESSIONS.map((s) => ({ ...s, startedAt: now() - s.min * 60000, changedAt: now() }));
const FINISHED = SEED_FINISHED.map((s) => ({ ...s, endedAt: now() - s.ago * 60000 }));

const state = {
  open: true,
  pinned: false,
  pos: null,               // pinned position {x, y}
  tab: "map",              // map | start
  fab: "dragonfly",        // a fab id, or "all"
  picker: false,
  sheet: null,             // { kind: "start" | "program" | "session" | "settings", ... }
  expanded: new Set(),     // "fabId:program" cards opened to list their agents
  flash: null,             // session id to flash once
  bumpArt: null,           // "fabId:artifact" to bump once
  settings: { harness: "claude-code", terminal: "Ghostty", notify: true, login: true, theme: "system" },
};

const fabById = (id) => FABS.find((f) => f.id === id);
const progOf = (fab, name) => fab.programs.find((p) => p.name === name);
const hzById = (id) => HARNESSES.find((h) => h.id === id);
const visibleFabs = () => (state.fab === "all" ? FABS : [fabById(state.fab)]);
const live = (fabId) => SESSIONS.filter((s) => s.fab === fabId);
const waiting = (list = SESSIONS) => list.filter((s) => s.state === "waits");
const running = (list = SESSIONS) => list.filter((s) => s.state === "working" || s.state === "starting" || s.state === "waits");

function ago(ms) {
  const m = Math.max(0, Math.floor((now() - ms) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60 ? (m % 60) + "m" : ""}`.trim();
}
const user = () => ME;
const fill = (v) => (v === "$USER" ? user() : v ?? "");

/* Program order for the map and for grouping in Now: walk `next` from the
   programs nothing points at. This is the shape `fab map --format json`
   returns: levels, each a row of programs. */
function levels(fab) {
  const named = new Set(fab.programs.flatMap((p) => p.next || []));
  let row = fab.programs.filter((p) => !named.has(p.name)).map((p) => p.name);
  const seen = new Set();
  const out = [];
  while (row.length) {
    row = row.filter((n) => !seen.has(n));
    if (!row.length) break;
    row.forEach((n) => seen.add(n));
    out.push(row);
    row = [...new Set(row.flatMap((n) => progOf(fab, n)?.next || []))];
  }
  fab.programs.forEach((p) => { if (!seen.has(p.name)) out.push([p.name]); });
  return out;
}
const order = (fab) => levels(fab).flat();

/* the start buttons: one per entry, or one per entry program */
function startsOf(fab) {
  return fab.programs.filter((p) => p.entry).flatMap((p) =>
    p.entries
      ? p.entries.map((e, i) => ({ fab: fab.id, program: p.name, entry: i, title: e.title, blurb: e.blurb, icon: e.icon }))
      : [{ fab: fab.id, program: p.name, entry: null, title: p.title, blurb: p.blurb || p.description, icon: p.icon || "start" }]);
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
  const w = waiting().length;
  const r = running().length;
  const icon = $("#fabIcon");
  icon.innerHTML = `${ICONS.fab(16)}${w ? `<i class="mb-w"></i>` : ""}${r ? `<span class="mb-n">${r}</span>` : ""}`;
  icon.title = w ? `${w} session${w > 1 ? "s" : ""} wait for you` : `${r} session${r === 1 ? "" : "s"} running`;
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
      <span class="tick">${state.fab === id ? ICONS.tick.replace('width="13" height="13"', 'width="11" height="11"').replace('stroke-width="1.3"', 'stroke-width="1.8"') : ""}</span>
      <span>${esc(name)}</span><span class="cnt">${cnt}</span></button>`;
  return `<div class="pop">
    ${opt("all", "All Fabs", running().length || "")}
    <div class="pop-sep"></div>
    ${FABS.map((f) => opt(f.id, f.name, running(live(f.id)).length || "")).join("")}
    <div class="pop-sep"></div>
    <button class="pop-new" data-act="addfab"><span>Add Folder…</span></button>
  </div>`;
}

function renderTabs() {
  const tab = (id, label) =>
    `<button class="${state.tab === id ? "on" : ""}" data-act="tab" data-id="${id}">${label}</button>`;
  $("#pnTabs").innerHTML = `<div class="seg">${tab("map", "Map")}${tab("start", "Start")}</div>`;
}

function renderBody() {
  const body = $("#pnBody");
  const keep = body.scrollTop;
  body.innerHTML = state.tab === "start" ? startHtml() : mapHtml();
  body.scrollTop = keep;
  if (state.flash) {
    const el = body.querySelector(`.ag[data-sid="${state.flash}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
    state.flash = null;
  }
  if (state.bumpArt) {
    body.querySelectorAll(`[data-art="${state.bumpArt}"]`).forEach((el) => el.classList.add("bump"));
    state.bumpArt = null;
  }
}

function renderFoot() {
  const all = state.fab === "all";
  const fab = all ? null : fabById(state.fab);
  const bad = all ? FABS.filter((f) => !f.check.ok) : fab.check.ok ? [] : [fab];
  $("#pnFoot").innerHTML = `
    <span class="live" title="fab status --all --watch --json">watching ${SESSIONS.length} sessions</span>
    <button class="chk ${bad.length ? "bad" : ""}" data-act="check">
      ${bad.length ? `${ICONS.warn} ${bad.length === 1 && !all ? "Out of date" : `${bad.length} out of date`}`
        : all ? "Up to date" : `<span class="mono">${fab.commit}</span>`}
    </button>`;
}

/* ─────────────────────────────────────────────────────────── agents ──
   A running session is an agent: its harness icon and its name. Click to
   bring it to front; the chevron opens its details. */

const RANK = { waits: 0, starting: 1, working: 2, idle: 3, unknown: 4 };
const byRank = (a, b) => RANK[a.state] - RANK[b.state] || b.startedAt - a.startedAt;
const stTitle = (s) => ({ waits: "waits for you", working: "working", idle: "idle", unknown: "unknown", starting: "starting" }[s.state]);

function agentHtml(s) {
  return `<div class="ag r-${s.state}" data-act="focus" data-sid="${s.id}" title="${esc(hzById(s.harness).label)} · ${stTitle(s)}">
    ${hzIcon(s.harness, s)}
    <span class="ag-l">${esc(s.label)}</span>
    <span class="ag-age" data-since="${s.startedAt}">${ago(s.startedAt)}</span>
    <button class="ag-i" data-act="session" data-sid="${s.id}" title="Details">${ICONS.chevR}</button>
  </div>`;
}

/* the collapsed form: one tile per agent, at most six, then a count */
function agentStack(ss) {
  if (!ss.length) return "";
  const shown = ss.slice(0, 6);
  return `<span class="ags">${shown.map((s) => hzIcon(s.harness, s)).join("")}${ss.length > shown.length ? `<span class="ags-more">+${ss.length - shown.length}</span>` : ""}</span>`;
}

/* ────────────────────────────────────────────────────────────── Start ── */

function goHtml(st) {
  return `<button class="go" data-act="start" data-fab="${st.fab}" data-p="${st.program}" data-e="${st.entry ?? ""}">
    <span class="go-ic ${st.icon}">${ICONS[st.icon] || ICONS.start}</span>
    <span class="go-m"><span class="go-t">${esc(st.title)}</span><span class="go-d">${esc(st.blurb)}</span></span>
    <span class="go-run">${ICONS.start}</span>
  </button>`;
}

function startHtml() {
  const fabs = visibleFabs();
  const all = state.fab === "all";
  let h = "";
  for (const f of fabs) {
    if (all) h += `<div class="sec fab"><span class="sec-t">${esc(f.name)}</span></div>`;
    h += `<div class="starts">${startsOf(f).map(goHtml).join("")}</div>`;
  }
  return h;
}

/* ──────────────────────────────────────────────────────────────── Map ── */

function mapHtml() {
  if (state.fab === "all") {
    return `<div class="fab-list">${FABS.map((f) => {
      const ss = live(f.id).sort(byRank);
      return `<button class="go" data-act="fab" data-id="${f.id}" data-then="map">
          <span class="fab-av">${ICONS.folder}</span>
          <span class="go-m"><span class="go-t">${esc(f.name)}</span>${ss.length ? agentStack(ss) : `<span class="go-d">Nothing running</span>`}</span>
          <span class="go-run">${ICONS.chevR}</span></button>`;
    }).join("")}</div>`;
  }
  const fab = fabById(state.fab);
  const lv = levels(fab);
  const list = live(fab.id);
  const selP = state.sheet?.kind === "program" ? state.sheet.program : null;

  /* a program card: its title, its entry buttons, and the agents running in
     it, as icons. Opened, the icons become a list. */
  const card = (key, title, ss, opts = {}) => {
    const open = state.expanded.has(`${fab.id}:${key}`) && ss.length;
    return `<div class="pg ${opts.sel ? "sel" : ""} ${open ? "open" : ""} ${ss.length ? "has" : ""}" data-act="pgtoggle" data-fab="${fab.id}" data-p="${key}">
      <div class="pg-h">${opts.k || ""}<span class="pg-t">${esc(title)}</span>
        ${opts.info ? `<button class="pg-i" data-act="program" data-fab="${fab.id}" data-p="${key}" title="About ${esc(title)}">${ICONS.info}</button>` : ""}
        ${ss.length ? `<span class="pg-chev">${ICONS.chevR}</span>` : ""}</div>
      ${opts.ents || ""}
      ${open ? `<div class="pg-list">${ss.map(agentHtml).join("")}</div>` : agentStack(ss) ? `<div class="pg-ags">${agentStack(ss)}</div>` : ""}
    </div>`;
  };
  const node = (name) => {
    const p = progOf(fab, name);
    const ss = list.filter((s) => s.program === name).sort(byRank);
    const ents = p.entries ? `<div class="pg-ents">${p.entries.map((e, i) =>
      `<span class="chip-go" data-act="start" data-fab="${fab.id}" data-p="${p.name}" data-e="${i}">${ICONS.start}${esc(e.title)}</span>`).join("")}</div>` : "";
    const k = `<span class="pg-k ${p.entry ? "entry" : ""}">${p.entry ? ICONS.start.replace('width="13" height="13"', 'width="9" height="9"') : ICONS.program}</span>`;
    return card(name, p.title, ss, { sel: selP === name, ents, k, info: true });
  };
  const decChip = (id) => {
    const d = fab.decisions[id];
    return `<span class="dec" title="${esc(d.says)}">${ICONS.diamond}<b>${esc(id)}</b><span>${esc(d.who)}</span></span>`;
  };
  const artChip = (id) => {
    const a = fab.artifacts[id];
    if (!a) return "";
    return `<span class="art" data-act="artifact" data-fab="${fab.id}" data-a="${id}" data-art="${fab.id}:${id}" title="${esc(a.says)} — ${esc(a.path)}">
      ${ICONS.doc}<b>${esc(id)}</b>${a.unit && a.waiting ? `<span class="cnt">${a.waiting}</span>` : ""}</span>`;
  };

  let h = `<div class="map">`;
  lv.forEach((row, i) => {
    h += `<div class="lvl">${row.map(node).join("")}</div>`;
    const ps = row.map((n) => progOf(fab, n));
    const decs = [...new Set(ps.map((p) => p.decides).filter(Boolean))];
    const arts = [...new Set(ps.flatMap((p) => p.writes || []))];
    const last = i === lv.length - 1;
    if (!last || decs.length || arts.length) {
      h += `<div class="link"><div class="chips">${decs.map(decChip).join("")}${arts.map(artChip).join("")}</div></div>`;
    }
    if (last && (decs.length || arts.length)) h += `<div class="map-end">Shipped</div>`;
  });
  const other = list.filter((s) => !s.program).sort(byRank);
  if (other.length) h += `<div class="lvl other">${card("_other", "Other sessions", other)}</div>`;
  return h + `</div>`;
}

/* ═════════════════════════════════════════════════════════════ sheets ══ */

function openSheet(sheet) {
  state.sheet = sheet;
  state.picker = false;
  renderSheet();
  renderHead();
  if (state.tab === "map") renderBody();
}
function closeSheet() {
  state.sheet = null;
  $("#pnSheet").classList.remove("open");
  $("#panel").classList.remove("sheeted");
  if (state.tab === "map") renderBody();
}

function renderSheet() {
  const sh = state.sheet;
  const el = $("#pnSheet");
  if (!sh) { el.classList.remove("open"); $("#panel").classList.remove("sheeted"); return; }
  $("#panel").classList.add("sheeted");
  const back = `<button class="sh-back" data-act="back">${ICONS.chevL}${sh.backLabel || "Back"}</button>`;
  let title = "", body = "", foot = "";
  if (sh.kind === "start") ({ title, body, foot } = startSheet(sh));
  if (sh.kind === "program") ({ title, body, foot } = programSheet(sh));
  if (sh.kind === "session") ({ title, body, foot } = sessionSheet(sh));
  if (sh.kind === "settings") ({ title, body, foot } = settingsSheet());
  el.innerHTML = `<div class="sh-h ${state.pinned ? "drag" : ""}">${back}<span class="sh-ttl">${esc(title)}</span></div>
    <div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ""}`;
  requestAnimationFrame(() => el.classList.add("open"));
  if (sh.kind === "start") {
    const first = el.querySelector("[data-in]");
    if (first && !sh.focused) { sh.focused = true; setTimeout(() => first.focus(), 230); }
    syncStart();
  }
}

/* ── Start a program: its questions, a harness, and Start ── */

function newRunId() {
  return "r_20261016_" + Math.random().toString(16).slice(2, 8);
}
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);

function startSheet(sh) {
  const fab = fabById(sh.fab);
  const p = progOf(fab, sh.program);
  const e = sh.entry != null ? p.entries[sh.entry] : null;
  const icon = e ? e.icon : p.icon || "start";
  const title = e ? e.title : p.title;
  if (!sh.values) {
    sh.values = {};
    (p.inputs || []).forEach((inp) => { sh.values[inp.name] = fill(inp.default); });
    sh.harness = hzById(state.settings.harness).ok ? state.settings.harness : "claude-code";
    sh.run = newRunId();
    sh.branch = null;
  }
  const fields = (p.inputs || []).map((inp, i) => {
    const ask = i === 0 && e?.ask ? e.ask : inp.ask;
    const v = esc(sh.values[inp.name] ?? "");
    let ctl;
    if (inp.choices) {
      ctl = `<select class="inp" data-in="${inp.name}"><option value="">Choose…</option>${inp.choices.map((c) => `<option ${sh.values[inp.name] === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
    } else if (inp.long) {
      ctl = `<textarea class="inp" data-in="${inp.name}" placeholder="${esc(inp.hint || "")}">${v}</textarea>`;
    } else {
      ctl = `<input class="inp" data-in="${inp.name}" value="${v}" placeholder="${esc(inp.hint || "")}" />`;
    }
    return `<div class="fld"><label class="fld-l">${esc(ask)}${inp.optional ? `<span class="opt">optional</span>` : ""}<span class="nm">${esc(inp.name)}</span></label>${ctl}</div>`;
  }).join("");

  const hzs = HARNESSES.map((h) => {
    const dis = !h.ok || !h.can.start;
    const sub = dis ? h.why : h.where(state.settings.terminal);
    return `<button class="hzo ${sh.harness === h.id ? "on" : ""}" data-act="harness" data-id="${h.id}" ${dis ? "disabled" : ""}>
      <span class="radio"></span>
      <span class="hzo-m"><span class="hzo-t">${esc(h.label)}${state.settings.harness === h.id ? `<span class="dflt">Default</span>` : ""}</span>
      ${dis ? "" : `<span class="hzo-s">${esc(sub)}</span>`}</span></button>`;
  }).join("");

  const wt = p.worktree === "new" ? `
    <div class="lbl">Branch</div>
    <div class="wt">${ICONS.branch}<input data-branch value="${esc(sh.branch ?? "")}" placeholder="fab/${esc(p.name)}/…" /></div>` : "";

  const body = `
    <div class="hero">
      <span class="go-ic ${icon}">${ICONS[icon] || ICONS.start}</span>
      <div style="min-width:0">
        <div class="hero-t">${esc(title)}</div>
        <div class="hero-s">${esc(fab.name)}</div>
      </div>
    </div>
    ${fields}
    <div class="lbl">Start in</div>
    <div class="hzs">${hzs}</div>
    ${wt}
    <div class="disc ${sh.showCmd ? "open" : ""}">
      <button class="disc-h" data-act="showcmd">${ICONS.chevR}Command</button>
      <div class="disc-b"><div class="code" id="cmdPreview"></div><div class="code" id="promptPreview"></div></div>
    </div>`;
  const foot = `<span class="kbd">⌘↩</span><span class="sp"></span>
    <button class="btn ghost" data-act="back">Cancel</button>
    <button class="btn pri" data-act="go" id="goBtn">Start</button>`;
  return { title: "", body, foot };
}

function startInputs(sh) {
  const fab = fabById(sh.fab);
  const p = progOf(fab, sh.program);
  const e = sh.entry != null ? p.entries[sh.entry] : null;
  return { fab, p, e, inputs: { ...(e?.fixed || {}), ...Object.fromEntries(Object.entries(sh.values).filter(([, v]) => v !== "")) } };
}

function branchFor(sh) {
  const { p, inputs } = startInputs(sh);
  if (sh.branch) return sh.branch;
  const seed = inputs.line || inputs.slice || inputs.what || sh.run.slice(-6);
  return `fab/${p.name}/${slug(seed)}`;
}

function syncStart() {
  const sh = state.sheet;
  if (!sh || sh.kind !== "start") return;
  const { fab, p, inputs } = startInputs(sh);
  const missing = (p.inputs || []).filter((i) => !i.optional && !(sh.values[i.name] || "").trim());
  const go = $("#goBtn");
  if (go) { go.disabled = missing.length > 0; go.title = missing.length ? `Answer: ${missing.map((m) => m.name).join(", ")}` : ""; }
  const bi = $("[data-branch]");
  if (bi && !sh.branch) bi.value = branchFor(sh);

  const args = Object.entries(inputs).map(([k, v]) => ` \\\n  --input ${k}=${/\s/.test(v) ? `"${v}"` : v}`).join("");
  const wtNew = p.worktree === "new";
  const br = wtNew ? branchFor(sh) : "main";
  const hz = sh.harness;
  const name = `${fab.name} · ${p.name}`;
  let adapter;
  if (hz === "claude-code") adapter = (wtNew ? `git worktree add ../${fab.name}-${slug(br.split("/").pop())} -b ${br}\nfab install --runtime claude-code\n` : "") + `claude --session-id 5e0c… -n "${name}" "$PROMPT"`;
  else if (hz === "codex") adapter = (wtNew ? `git worktree add ../${fab.name}-${slug(br.split("/").pop())} -b ${br}\nfab install --runtime codex\n` : "") + `codex "$PROMPT"`;
  else if (hz === "orca") adapter = wtNew
    ? `orca worktree create --name ${br} --repo path:${fab.path} \\\n  --agent claude --prompt "$PROMPT" --json`
    : `orca terminal create --worktree path:${fab.path} \\\n  --title "${p.title}" --command "claude …" --json`;
  else adapter = "";
  const term = hz === "orca" ? "" : `<span class="c2"># in a new ${esc(state.settings.terminal)} window</span>\n`;
  const c = $("#cmdPreview");
  if (c) c.innerHTML = `<span class="c1">fab run ${esc(p.name)}</span>${esc(args)} \\\n  --harness ${esc(hz)}${wtNew ? ` --worktree new --branch ${esc(br)}` : ""}\n\n<span class="c2"># run record → ~/.fab/runs/${esc(sh.run)}.json, then:</span>\n${term}${esc(adapter)}`;
  const pp = $("#promptPreview");
  if (pp) pp.innerHTML = `<span class="c2"># $PROMPT</span>\nRun the ${esc(p.name)} program (.fab/programs/${esc(p.name)}/SKILL.md).\n<span class="c3">fab-run: ${esc(sh.run)}</span>\n${Object.keys(inputs).length ? `\nInputs:\n${Object.entries(inputs).map(([k, v]) => `- ${esc(k)}: ${esc(v)}`).join("\n")}` : ""}`;
}

function doStart(sh) {
  const { fab, p, e, inputs } = startInputs(sh);
  const hz = hzById(sh.harness);
  const label = inputs.what ? inputs.what.split(/[.\n]/)[0].slice(0, 60) : inputs.line || inputs.slice || (e ? e.title : p.title);
  const s = {
    id: "n" + Math.random().toString(36).slice(2, 7),
    fab: fab.id, program: p.name, label, harness: hz.id, state: "starting",
    startedAt: now(), changedAt: now(),
    branch: p.worktree === "new" ? branchFor(sh) : "main",
    worktree: p.worktree === "new" ? `~/orca/workspaces/${fab.name}/${slug(branchFor(sh).split("/").pop())}` : fab.path,
    match: "pending", run: sh.run, startedBy: "monitor", inputs,
  };
  SESSIONS.unshift(s);
  closeSheet();
  state.tab = "map";
  if (state.fab !== fab.id) state.fab = fab.id;
  state.expanded.add(`${fab.id}:${p.name}`);
  state.flash = s.id;
  render();
  toast(`Starting in ${esc(hz.label)}`);
  /* the adapter confirms the session: exact for Claude Code and Orca (session
     id at launch), by transcript for Codex (the fab-run: line). */
  const t = hz.can.match === "exact" ? 1500 : 3600;
  setTimeout(() => {
    s.state = "working"; s.changedAt = now();
    s.match = hz.can.match;
    render(); refreshSheetFor(s.id);
  }, t);
  /* a scripted ending for the short programs, so the loop closes */
  if (p.name === "file-work" || p.name === "log-bug" || p.name === "log-idea") {
    setTimeout(() => finish(s, `${fab.artifacts["intake-note"].path.replace("*", "2026-10-16-" + slug(label))}`), 16000);
  } else if (p.inputs?.length === 0 && hz.can.waits) {
    setTimeout(() => toWaits(s, "Which of these goes first?"), 7000);
  }
}

/* ── a program, as the map and Now link to it ── */

function programSheet(sh) {
  const fab = fabById(sh.fab);
  const p = progOf(fab, sh.program);
  const ss = live(fab.id).filter((s) => s.program === p.name);
  const dash = `<span class="dim">—</span>`;
  const tags = (arr, cls, act) => arr?.length ? `<span class="tags">${arr.map((n) => `<span class="tg ${cls}" ${act ? `data-act="${act}" data-fab="${fab.id}" data-p="${n}"` : ""}>${esc(n)}</span>`).join("")}</span>` : dash;
  const before = fab.programs.filter((x) => (x.next || []).includes(p.name)).map((x) => x.name);
  const kv = [
    ["Reads", tags(p.reads, "")],
    ["Writes", tags(p.writes, "")],
    ["Decides", p.decides ? esc(fab.decisions[p.decides].who) : dash],
    ["After", tags(before, "a", "program")],
    ["Next", tags(p.next, "a", "program")],
    ["Worktree", p.worktree === "new" ? "New" : "Current"],
  ].map(([k, v]) => `<div class="kv-r"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`).join("");
  const inputs = p.inputs?.length
    ? `<div class="lbl">Inputs</div><div class="kv">${p.inputs.map((i) => `<div class="kv-r"><span class="kv-k mono">${esc(i.name)}</span><span class="kv-v">${esc(i.ask)}${i.optional ? ` <span class="dim">optional</span>` : ""}</span></div>`).join("")}</div>`
    : "";
  const body = `
    <div class="hero">
      <span class="go-ic ${p.icon || (p.entries ? p.entries[0].icon : "")}">${ICONS[p.icon] || (p.entries ? ICONS[p.entries[0].icon] : ICONS.program)}</span>
      <div><div class="hero-t">${esc(p.title)}</div>
        <div class="hero-s"><span class="mono">${esc(p.name)}</span></div></div>
    </div>
    <div class="hero-d">${esc(p.description)}</div>
    <div class="kv">${kv}</div>
    ${inputs}
    ${ss.length ? `<div class="lbl">Running</div><div class="mini">${ss.sort(byRank).map(agentHtml).join("")}</div>` : ""}
  `;
  let foot = `<button class="btn ghost" data-act="openfile" data-path=".fab/programs/${esc(p.name)}/SKILL.md">Open SKILL.md</button><span class="sp"></span>`;
  if (p.entry) {
    foot += p.entries
      ? p.entries.map((e, i) => `<button class="btn ${i === 0 ? "pri" : ""}" data-act="start" data-fab="${fab.id}" data-p="${p.name}" data-e="${i}">${esc(e.title.replace(/^Log /, ""))}</button>`).join("")
      : `<button class="btn pri" data-act="start" data-fab="${fab.id}" data-p="${p.name}" data-e="">Start</button>`;
  }
  return { title: "", body, foot };
}

/* ── a session: where it is, and how the monitor knows ── */

function sessionSheet(sh) {
  const s = SESSIONS.find((x) => x.id === sh.sid) || sh.snapshot;
  const fab = fabById(s.fab);
  const p = s.program ? progOf(fab, s.program) : null;
  const hz = hzById(s.harness);
  const stTxt = { waits: "Waiting for you", working: "Working", idle: "Idle", unknown: "Unknown", starting: "Starting" }[s.state];
  const kv = [
    ["Program", p ? `<span class="lnk" data-act="program" data-fab="${fab.id}" data-p="${p.name}">${esc(p.title)}</span>` : `<span class="dim">Unknown</span>`],
    ["Harness", esc(hz.label)],
    ["Running", `<span data-since="${s.startedAt}">${ago(s.startedAt)}</span>`],
    ["Branch", `<span class="mono">${esc(s.branch)}</span>`],
    ["Worktree", `<span class="mono">${esc(s.worktree)}</span>`],
    ["Started by", esc(s.startedBy)],
    ["Match", esc(s.match[0].toUpperCase() + s.match.slice(1))],
  ];
  if (s.run) kv.push(["Run", `<span class="lnk mono" data-act="openfile" data-path="~/.fab/runs/${esc(s.run)}.json">${esc(s.run)}</span>`]);
  const inputs = s.inputs && Object.keys(s.inputs).length
    ? `<div class="lbl">Inputs</div><div class="kv">${Object.entries(s.inputs).map(([k, v]) => `<div class="kv-r"><span class="kv-k mono">${esc(k)}</span><span class="kv-v">${esc(v)}</span></div>`).join("")}</div>` : "";
  const body = `
    <div class="hero" style="margin-bottom:12px"><div style="min-width:0">
      <div class="hero-t">${esc(s.label)}</div>
      <div class="hero-s"><span class="dot ${s.state}"></span>${stTxt}</div>
    </div></div>
    ${s.state === "waits" && s.asks ? `<div class="quote">${esc(s.asks)}</div>` : s.first ? `<div class="quote">“${esc(s.first)}”</div>` : ""}
    <div class="kv">${kv.map(([k, v]) => `<div class="kv-r"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`).join("")}</div>
    ${inputs}`;
  const can = hz.can.focus && !(s.harness === "opencode" && s.startedBy === "by hand");
  const foot = `<span class="sp"></span><button class="btn pri" data-act="focus" data-sid="${s.id}" ${can ? "" : "disabled"}>Go to Session</button>`;
  return { title: "", body, foot };
}

function refreshSheetFor(sid) {
  if (state.sheet?.kind === "session" && state.sheet.sid === sid) renderSheet();
}

/* ── settings ── */

function settingsSheet() {
  const st = state.settings;
  const tgl = (k) => `<button class="tgl ${st[k] ? "on" : ""}" data-act="toggle" data-k="${k}"></button>`;
  const body = `
    <div class="kv">
      <div class="set-r"><span>Default harness</span><span class="sp"></span>
        <select class="inp" data-set="harness" style="width:auto">${HARNESSES.map((h) => `<option value="${h.id}" ${st.harness === h.id ? "selected" : ""} ${h.ok ? "" : "disabled"}>${esc(h.label)}</option>`).join("")}<option value="ask">Ask each time</option></select></div>
      <div class="set-r"><span>Terminal</span><span class="sp"></span>
        <select class="inp" data-set="terminal" style="width:auto">${TERMINALS.map((t) => `<option ${st.terminal === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="set-r"><span>Appearance</span><span class="sp"></span>
        <div class="seg sm" style="width:156px">${["system", "light", "dark"].map((t) => `<button class="${st.theme === t ? "on" : ""}" data-act="theme" data-id="${t}">${t === "system" ? "Auto" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
    </div>
    <div class="lbl">Notifications</div>
    <div class="kv">
      <div class="set-r"><span>When a session waits</span><span class="sp"></span>${tgl("notify")}</div>
      <div class="set-r"><span>Launch at login</span><span class="sp"></span>${tgl("login")}</div>
    </div>
    <div class="lbl">Fabs</div>
    <div class="kv">${FABS.map((f) => `<div class="fabrow">${ICONS.folder}${esc(f.name)}<span class="mono">${esc(f.path)}</span></div>`).join("")}
      <div class="fabrow"><button class="lnk" data-act="addfab">Add Folder…</button></div></div>`;
  return { title: "Settings", body, foot: "" };
}

/* ═══════════════════════════════════════════════════ panel and position ══ */

function place() {
  const panel = $("#panel");
  panel.classList.toggle("closed", !state.open);
  panel.classList.toggle("pinned", state.pinned);
  if (state.pinned && state.pos) {
    panel.style.left = state.pos.x + "px";
    panel.style.top = state.pos.y + "px";
  } else {
    const r = $("#fabIcon").getBoundingClientRect();
    const left = Math.round(r.left + r.width / 2 - (340 - 32));
    panel.style.left = Math.max(8, left) + "px";
    panel.style.top = "34px";
  }
}

function setTheme() {
  const t = state.settings.theme;
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", setTheme);

/* drag the pinned panel by its head */
(function drag() {
  let d = null;
  document.addEventListener("mousedown", (ev) => {
    if (!state.pinned) return;
    const h = ev.target.closest(".pn-h, .sh-h");
    if (!h || ev.target.closest("button, input, select")) return;
    const p = $("#panel").getBoundingClientRect();
    d = { dx: ev.clientX - p.left, dy: ev.clientY - p.top };
    $("#panel").classList.add("dragging");
    ev.preventDefault();
  });
  document.addEventListener("mousemove", (ev) => {
    if (!d) return;
    state.pos = {
      x: Math.min(innerWidth - 120, Math.max(-200, ev.clientX - d.dx)),
      y: Math.min(innerHeight - 60, Math.max(28, ev.clientY - d.dy)),
    };
    place();
  });
  document.addEventListener("mouseup", () => { if (d) { d = null; $("#panel").classList.remove("dragging"); } });
})();

/* ═════════════════════════════════════════════════════════════ events ══ */

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act]");
  const inPanel = ev.target.closest("#panel");
  const onIcon = ev.target.closest("#fabIcon");

  if (onIcon) { state.open = !state.open; state.picker = false; render(); return; }
  if (!inPanel && !ev.target.closest(".note, .toast, .focusfx")) {
    if (state.open && !state.pinned) { state.open = false; state.picker = false; render(); }
    return;
  }
  if (state.picker && !ev.target.closest(".pop, .fab-pick")) { state.picker = false; renderHead(); }
  if (!t) return;
  const a = t.dataset.act;
  const d = t.dataset;

  switch (a) {
    case "picker": state.picker = !state.picker; renderHead(); break;
    case "fab":
      state.fab = d.id; state.picker = false;
      if (d.then) state.tab = d.then;
      if (state.sheet && state.sheet.kind !== "settings") closeSheet();
      render(); break;
    case "addfab": state.picker = false; renderHead(); toast(`Opens a folder picker`); break;
    case "pin": {
      if (!state.pinned) {
        const r = $("#panel").getBoundingClientRect();
        state.pos = state.pos || { x: r.left, y: r.top + 8 };
        state.pinned = true;
      } else {
        state.pinned = false;
      }
      render(); if (state.sheet) renderSheet(); break;
    }
    case "settings": openSheet({ kind: "settings" }); break;
    case "tab": state.tab = d.id; closeSheet(); renderTabs(); renderBody(); break;
    case "pgtoggle": {
      /* a card with agents opens to list them; one without shows the program */
      if (!t.classList.contains("has")) { if (d.p !== "_other") openSheet({ kind: "program", fab: d.fab, program: d.p }); break; }
      const k = `${d.fab}:${d.p}`;
      state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k);
      renderBody(); break;
    }

    case "focus": {
      const s = SESSIONS.find((x) => x.id === d.sid);
      if (s) focusSession(s);
      break;
    }
    case "session": ev.stopPropagation(); openSheet({ kind: "session", sid: d.sid, snapshot: SESSIONS.find((x) => x.id === d.sid) }); break;
    case "program": ev.stopPropagation(); openSheet({ kind: "program", fab: d.fab, program: d.p }); break;
    case "start": {
      ev.stopPropagation();
      const fab = fabById(d.fab); const p = progOf(fab, d.p);
      const entry = d.e === "" || d.e == null ? null : Number(d.e);
      const sh = { kind: "start", fab: d.fab, program: d.p, entry, backLabel: state.sheet ? "Back" : "Start" };
      /* a program with no inputs starts at once, in the default harness.
         Option-click opens the sheet anyway, to choose another harness. */
      if (!(p.inputs || []).length && !ev.altKey && hzById(state.settings.harness)?.ok) {
        sh.values = {}; sh.harness = state.settings.harness; sh.run = newRunId();
        state.sheet = sh; doStart(sh);
      } else {
        openSheet(sh);
      }
      break;
    }
    case "harness": state.sheet.harness = d.id; renderSheet(); break;
    case "showcmd": state.sheet.showCmd = !state.sheet.showCmd; t.closest(".disc").classList.toggle("open"); break;
    case "go": if (!t.disabled) doStart(state.sheet); break;
    case "back": closeSheet(); break;
    case "artifact": {
      ev.stopPropagation();
      const fab = fabById(d.fab); const ar = fab.artifacts[d.a];
      toast(`Opened <span class="mono">${esc(ar.path.startsWith("GitHub") ? "github.com/…/pulls" : fab.path + "/" + ar.path.replace(/\/\*.*$/, "/"))}</span>${ar.waiting ? ` · ${ar.waiting} ${esc(ar.unit)}` : ""}`);
      break;
    }
    case "openfile": toast(`Opened <span class="mono">${esc(d.path)}</span> in your editor`); break;
    case "check": {
      const bad = visibleFabs().filter((f) => !f.check.ok);
      if (bad.length) toast(`${esc(bad[0].name)}: ${esc(bad[0].check.problem)}`, 4200);
      else toast(`Up to date`);
      break;
    }
    case "toggle": state.settings[d.k] = !state.settings[d.k]; t.classList.toggle("on"); break;
    case "term": state.settings.terminal = d.id; renderSheet(); break;
    case "theme": state.settings.theme = d.id; setTheme(); renderSheet(); break;
  }
});

document.addEventListener("input", (ev) => {
  const sh = state.sheet;
  if (sh?.kind === "start") {
    if (ev.target.dataset.in) { sh.values[ev.target.dataset.in] = ev.target.value; syncStart(); }
    if (ev.target.hasAttribute("data-branch")) { sh.branch = ev.target.value || null; syncStart(); }
  }
});
document.addEventListener("change", (ev) => {
  const sh = state.sheet;
  if (sh?.kind === "start" && ev.target.dataset.in) { sh.values[ev.target.dataset.in] = ev.target.value; syncStart(); }
  if (ev.target.dataset.set === "harness") { state.settings.harness = ev.target.value === "ask" ? state.settings.harness : ev.target.value; renderBody(); }
  if (ev.target.dataset.set === "terminal") { state.settings.terminal = ev.target.value; }
});

document.addEventListener("keydown", (ev) => {
  const typing = ev.target.closest("input, textarea, select");
  if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && state.sheet?.kind === "start") {
    const go = $("#goBtn"); if (go && !go.disabled) doStart(state.sheet); ev.preventDefault(); return;
  }
  if (ev.key === "Escape") {
    if (state.picker) { state.picker = false; renderHead(); }
    else if (state.sheet) closeSheet();
    else if (state.open && !state.pinned) { state.open = false; render(); }
    return;
  }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tabs = { 1: "map", 2: "start" };
  if (tabs[ev.key] && state.open) { state.tab = tabs[ev.key]; closeSheet(); renderTabs(); renderBody(); }
});

window.addEventListener("resize", place);

/* ═══════════════════════════════════════════════ focus, notify, toasts ══ */

function focusSession(s) {
  const hz = hzById(s.harness);
  if (!hz.can.focus || (s.harness === "opencode" && s.startedBy === "by hand")) {
    toast(`Can't open this ${esc(hz.label)} session`);
    return;
  }
  const where = s.harness === "orca" ? `Orca · ${s.branch}` : s.harness === "nodeterm" ? "nodeterm node" : `${state.settings.terminal} · ${hz.short}`;
  const fab = fabById(s.fab);
  const p = s.program ? progOf(fab, s.program) : null;
  document.querySelectorAll(".focusfx").forEach((x) => x.remove());
  const fx = document.createElement("div");
  fx.className = "focusfx";
  const tail = s.state === "waits"
    ? `<span class="a">? ${esc(s.asks || "Waiting for your answer")}</span>\n<span class="d">  1. Yes   2. Yes, and don't ask again   3. No</span>`
    : s.state === "starting" ? `<span class="d">Starting…</span>`
    : `<span class="g">●</span> Working <span class="d">(${ago(s.startedAt)} · esc to interrupt)</span>`;
  fx.innerHTML = `<div class="ff-h">${ICONS.term}<b>${esc(where)}</b><span>${esc(fab.name)}</span><span class="x">brought to front by fab focus</span></div>
    <div class="ff-b"><span class="d">&gt;</span> ${s.run ? `Run the ${esc(s.program)} program (.fab/programs/${esc(s.program)}/SKILL.md).\n  <span class="d">fab-run: ${esc(s.run)}</span>` : esc(s.first || s.label)}

<span class="b">⏺</span> ${p ? `Loading skill <b>${esc(p.name)}</b>. ${esc(p.description.split(".")[0])}.` : "Reading the e2e logs."}

${tail}</div>`;
  $("#desk").appendChild(fx);
  setTimeout(() => { fx.classList.add("out"); setTimeout(() => fx.remove(), 260); }, 2400);
  if (!state.pinned) { state.open = false; render(); }
  /* answering it in the harness puts it back to work */
  if (s.state === "waits") setTimeout(() => { if (s.state === "waits") { s.state = "working"; s.changedAt = now(); delete s.asks; render(); refreshSheetFor(s.id); } }, 5200);
}

function notify(title, text, onClick) {
  if (!state.settings.notify) return;
  if (state.open && !state.pinned) return; /* the row already says it */
  const n = document.createElement("div");
  n.className = "note";
  n.innerHTML = `<span class="note-ic">${ICONS.fab(17)}</span><div class="note-m"><div class="note-a">fab monitor<span>now</span></div>
    <div class="note-t">${esc(title)}</div><div class="note-d">${esc(text)}</div></div>`;
  n.addEventListener("click", () => { n.remove(); onClick && onClick(); });
  $("#notes").appendChild(n);
  setTimeout(() => { n.classList.add("out"); setTimeout(() => n.remove(), 320); }, 6000);
}

function toast(html, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = html;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, ms);
}

/* ═════════════════════════════════════════════════════════ simulation ══
   What `fab status --watch` would stream. A few scripted beats, so the first
   minute shows each thing the monitor does, then gentle random changes. */

function bumpIcon() {
  const i = $("#fabIcon");
  i.classList.remove("bump"); void i.offsetWidth; i.classList.add("bump");
}

function toWaits(s, ask) {
  if (!SESSIONS.includes(s) || s.state === "waits") return;
  if (!hzById(s.harness).can.waits) return;
  s.state = "waits"; s.changedAt = now(); s.asks = ask;
  render(); bumpIcon(); refreshSheetFor(s.id);
  notify(`${s.label} waits for you`, ask, () => focusSession(s));
}

function finish(s, wrote) {
  const i = SESSIONS.indexOf(s);
  if (i < 0) return;
  SESSIONS.splice(i, 1);
  FINISHED.unshift({ fab: s.fab, program: s.program, label: s.label, harness: s.harness, endedAt: now(), wrote });
  const fab = fabById(s.fab);
  const p = progOf(fab, s.program);
  /* what it wrote now waits for the next program: the map's counts move */
  (p?.writes || []).forEach((w) => {
    if (fab.artifacts[w] && fab.artifacts[w].unit) { fab.artifacts[w].waiting += 1; state.bumpArt = `${fab.id}:${w}`; }
  });
  render();
  if (state.sheet?.kind === "session" && state.sheet.sid === s.id) closeSheet();
  toast(`${esc(s.label)} finished`);
}

const BEATS = [
  [7000,  () => toWaits(SESSIONS.find((s) => s.id === "s1"), "Two tests fail on main too. Fix them here, or leave them?")],
  [19000, () => { const s = SESSIONS.find((x) => x.id === "s3"); if (s) finish(s, "docs/roadmap/intake/2026-10-16-safari-login-loop.md"); }],
  [30000, () => { const s = SESSIONS.find((x) => x.id === "s4"); if (s) { s.state = "working"; s.changedAt = now(); render(); } }],
  [44000, () => toWaits(SESSIONS.find((s) => s.id === "s9"), "Refund to card or to credit balance by default?")],
];
BEATS.forEach(([t, f]) => setTimeout(f, t));

setInterval(() => {
  /* working ↔ idle drift for harnesses that only report activity */
  const pool = SESSIONS.filter((s) => (s.state === "working" || s.state === "idle") && !hzById(s.harness).can.waits && now() - s.changedAt > 20000);
  if (!pool.length || Math.random() < .5) return;
  const s = pool[Math.floor(Math.random() * pool.length)];
  s.state = s.state === "working" ? "idle" : "working"; s.changedAt = now();
  render(); refreshSheetFor(s.id);
}, 9000);

/* ages and the clock */
function tick() {
  document.querySelectorAll("[data-since]").forEach((el) => { el.textContent = ago(Number(el.dataset.since)); });
  const d = new Date();
  $("#clock").textContent = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + "  " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
setInterval(tick, 5000);

/* ════════════════════════════════════════════════════════════ scenery ══ */

function renderScenery() {
  $("#mbSys").innerHTML = `${ICONS.search}${ICONS.wifi}${ICONS.batt}`;
  const lines = [
    [`<span class="ed-c">---</span>`],
    [`<span class="ed-k">name</span>: log-bug`],
    [`<span class="ed-k">title</span>: <span class="ed-s">Log bug</span>`],
    [`<span class="ed-k">description</span>: <span class="ed-s">Records a bug so it is not lost. Writes an intake</span>`],
    [`  <span class="ed-s">note, and a short bug plan when the fix is clear.</span>`],
    [`<span class="ed-k">when</span>: <span class="ed-s">Someone reports a bug, or "this is broken".</span>`],
    [`<span class="ed-k">entry</span>: true                 <span class="ed-c"># show a button in the monitor</span>`],
    [`<span class="ed-k">inputs</span>:`],
    [`  - <span class="ed-k">name</span>: what`],
    [`    <span class="ed-k">ask</span>: <span class="ed-s">What went wrong?</span>`],
    [`  - <span class="ed-k">name</span>: where`],
    [`    <span class="ed-k">ask</span>: <span class="ed-s">Where did you see it?</span>`],
    [`    <span class="ed-k">optional</span>: true`],
    [`  - <span class="ed-k">name</span>: reporter`],
    [`    <span class="ed-k">default</span>: $USER`],
    [`<span class="ed-k">writes</span>: [intake-note, bug-plan]`],
    [`<span class="ed-k">next</span>: [prioritise]`],
    [`<span class="ed-k">decides</span>: nobody`],
    [`<span class="ed-k">worktree</span>: current`],
    [`<span class="ed-c">---</span>`],
    [``],
    [`<span class="ed-h"># log-bug</span>`],
    [``],
    [`1. Understand the report. Ask one question if the`],
    [`   steps to reproduce are missing.`],
    [`2. Write the intake note from templates/intake.md.`],
    [`3. If the fix is clear, add a short bug plan.`],
    [`4. Say what comes next: <span class="ed-k">prioritise</span>.`],
  ];
  const tree = [
    ["folder", ".fab", 0, false], ["folder", "programs", 1, false], ["folder", "log-bug", 2, false], ["doc", "SKILL.md", 3, true],
    ["folder", "log-idea", 2], ["folder", "prioritise", 2], ["folder", "plan-feature", 2], ["folder", "build-slice", 2],
    ["folder", "skills", 1], ["folder", "rules", 1], ["folder", "templates", 1], ["folder", "runtimes", 1], ["doc", "fab.yaml", 1], ["doc", "AGENTS.md", 1],
    ["folder", ".claude", 0], ["folder", "docs", 0], ["folder", "src", 0], ["doc", "AGENTS.md", 0], ["doc", "CLAUDE.md", 0],
  ];
  $("#editor").innerHTML = `
    <div class="ed-bar"><div class="lights"><i class="r"></i><i class="y"></i><i class="g"></i></div><span class="ed-title">SKILL.md — invoice-service</span></div>
    <div class="ed-tree">${tree.map(([ic, n, depth, on]) => `<div class="ed-f ${on ? "on" : ""}" style="padding-left:${6 + depth * 12}px">${ICONS[ic]}${n}</div>`).join("")}</div>
    <div class="ed-code">${lines.map((l, i) => `<div class="ed-ln"><i>${i + 1}</i>${l[0]}</div>`).join("")}</div>`;
}

/* ═══════════════════════════════════════════════════════════════ boot ══ */

setTheme();
renderScenery();
tick();
render();
