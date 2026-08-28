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
  mic:     I(`<rect x="6.1" y="1.9" width="3.8" height="7.6" rx="1.9"/><path d="M3.9 7.5a4.1 4.1 0 0 0 8.2 0M8 11.6v2.3M5.8 13.9h4.4"/>`),
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
  up:      I(`<path d="M8 13V3.5M4 7.4 8 3.4l4 4"/>`, 15),
  minus:   I(`<path d="M3.4 8h9.2"/>`, 14),
  fit:     I(`<path d="M2.6 6V3.4a.8.8 0 0 1 .8-.8H6M10 2.6h2.6a.8.8 0 0 1 .8.8V6M13.4 10v2.6a.8.8 0 0 1-.8.8H10M6 13.4H3.4a.8.8 0 0 1-.8-.8V10"/>`, 14),
  heat:    I(`<path d="M8 1.9c2.2 2.5 1 3.9.4 4.6-1 1.2-1.4 2-1.4 2.9a2.6 2.6 0 0 0 5.2 0c0-.7-.2-1.2-.5-1.7 1.6 1 2.5 2.5 2.5 4A5.8 5.8 0 0 1 2.4 12c0-3.4 2-5 3.2-6.6C6.7 4 7.8 2.9 8 1.9z"/>`, 15),
  gate:    I(`<path d="M3.2 2.3v11.4M12.8 2.3v11.4M4.7 8h6.6"/><circle cx="3.2" cy="3.1" r="1.2"/><circle cx="12.8" cy="12.9" r="1.2"/>`, 14),
  wrench:  I(`<path d="M10.4 2.4a3.6 3.6 0 0 0-3.2 5.3L2.6 12.3a1.3 1.3 0 0 0 1.9 1.8l4.6-4.6a3.6 3.6 0 0 0 4.4-4.9l-2 2-1.9-.4-.4-1.9z"/>`, 15),
};

/* ─────────────────────────────────────────────────────────────── state ── */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

const state = {
  mode: "system",           // system | product
  view: "loop",
  sel: null,                // { t, id }
  zoom: 1, px: 0, py: 0,
  ws: "email-agent", wsOpen: false,
  panelOpen: false,
  theme: null,
  /* the prompt sheet that floats over the flowchart */
  docStack: [],             // markdown pages, deepest last
  drafts: {},               // path -> unsaved text
  editing: false,           // false = read, true = write
  /* a Factory worker console, and the box you type back with */
  run: null,                // run id, or null for the board
  composer: "",             // the un-sent line in the console
  fleetSize: {},            // ws id -> configured agent capacity
  /* an input program opened as its own primary pane: the operator's intake
     console, where you pour work into the loop */
  inputOpen: null,          // input id, or null
  inputEditing: false,      // false = use the program, true = edit its definition
  intakeText: "",           // the un-sent message in the intake box
  /* the factory versions itself. Defects pile up off the running loop; you fold
     them into a planned version, a system agent reworks the loop in a branch,
     then you promote and switch the running fleet over. Flow is per-workspace,
     because each factory is on its own version. */
  sysFlow: {},              // ws id -> { view, live, planned }
  verMenuOpen: false,       // the version pill's dropdown
  verCardOpen: false,       // the floating version card
  /* the ask bar floats at the bottom of a clean canvas; submitting it opens a
     primary-pane chat with the system agent, which can change the loop or
     answer questions about how it is wired */
  chat: { open: false, log: [], text: "" },
  askText: "",              // the un-sent line in the floating ask bar
};
const PANEL_W = 412;

/* one loop. There is no descending into a process any more: a process is a
   prompt, and a prompt opens as a document, not as another diagram. */
function model() {
  return { states: STATES, procs: PROCS, backs: BACKS, inputs: (typeof INPUTS !== "undefined" && INPUTS) || [] };
}
const stateById = (id) => STATES.find((s) => s.id === id);
const procById = (id) => PROCS.find((p) => p.id === id);
const endpointName = (id) => stateById(id)?.name || procById(id)?.name || id;
const issueById = (id) => ISSUES.find((i) => i.id === id);
const brokenProcs = () => PROCS.filter((p) => p.broken);

function procFace(p) {
  if (p.kind === "gate") return { icon: ICONS.gate, cls: "gt", tint: "gt", dir: "gates" };
  if (p.kind === "runbook") return { icon: ICONS.book, cls: "rb", tint: "rb", dir: "runbooks" };
  return { icon: ICONS.sparkle, cls: "sk", tint: "", dir: "skills" };
}

/* ── agents: runs are the truth behind the status dots ── */
const runById = (id) => AGENTS.find((r) => r.id === id);
const runsForSlice = (id) => AGENTS.filter((r) => r.slice === id && r.status !== "done");
const runProcOf = (r) => procById(RUN_PROC[r.station]);   // the edge this run executes
const runModelOf = (r) => RUN_MODEL[r.station] || "sonnet";
const liveAgents = () => AGENTS.filter((r) => r.status !== "done");
const fleetSize = () => state.fleetSize[state.ws] ?? (state.fleetSize[state.ws] = liveAgents().length);
const agentName = (r) => `Agent ${String(AGENTS.indexOf(r) + 1).padStart(2, "0")}`;
const agentHue = (r) => (AGENTS.indexOf(r) * 47 + 205) % 360;
/* a run's status maps onto the same four dots Product mode already draws, so
   the ring and the fleet never disagree about a slice */
const RUN_DOT = { running: "run", waiting: "wait", failed: "bad", blocked: "ok", done: "ok" };
const dotForItem = (id, fallback) => {
  const rs = runsForSlice(id);
  return rs.length ? RUN_DOT[rs[0].status] : fallback;
};

/* worker views, with counts read live off the fleet */
function agentsNav() {
  const n = (f) => AGENTS.filter(f).length;
  const buildable = ITEMS.plans.filter((i) => i.d === "run").length;
  return [
    { id: "needs",  label: "Needs you", icon: "flag",  n: n((r) => r.status === "waiting"), loud: true },
    { id: "queue",  label: "Queue",     icon: "list",  n: buildable },
    { id: "recent", label: "Recent",    icon: "clock", n: n((r) => r.status === "done") },
  ];
}

function scaleFleet(delta) {
  const busy = liveAgents().length;
  const next = clamp(fleetSize() + delta, 1, 32);
  if (next === fleetSize()) return;
  state.fleetSize[state.ws] = next;
  const draining = Math.max(0, busy - next);
  toast(draining
    ? `${next} agents after ${draining} ${draining === 1 ? "session finishes" : "sessions finish"}`
    : `${next} agents available to the factory`);
  paint();
}
/* Factory mode's rail is just the loop's nodes: the Board, then one list per
   station, each badged with how many things are sitting there right now. Built
   from STATES so every workspace reads its own station names and counts, rather
   than a hand-curated set of cross-cutting views. */
function productNav() {
  return [{ id: "loop", label: "Board", icon: "loop" }, { section: "Workers" }]
    .concat(agentsNav(), [{ section: "Artifacts" }],
      STATES.map((s) => ({ id: s.id, label: s.name, icon: s.icon, n: s.count })));
}
const navFor = () =>
  state.mode === "system" ? NAV.system.map((n) => n.id === "issues" ? { ...n, n: openDefects().length }
    : n.id === "programs" ? { ...n, n: RUNBOOKS.length + INPUTS.length }
    : n.id === "gates" ? { ...n, n: GATES.length } : n)
  : state.mode === "product" ? productNav()
  : NAV[state.mode];

const factoryCanvas = () => state.mode === "product" && (state.view === "loop" || state.view === "needs");

/* ══════════════════════════════════════════════ system version control ══
   The factory keeps a version of itself. As it runs, it logs **defects** — not
   product feedback, but friction in its own wiring: a skill it is missing, an
   edge that keeps letting the same miss through, a contract two decisions both
   claim. Those are the ISSUES, attributed to edges. You let them accumulate,
   then fold them into a **planned version**: a system agent reworks the loop in
   its own branch, you promote it, and a switchover phase pauses the running
   fleet, migrates it, and flips live onto the new version. */

/* the same "programs" count the strip and rail use: runbooks plus intake programs */
const programCount = () => RUNBOOKS.length + (typeof INPUTS !== "undefined" ? INPUTS.length : 0);
const gateCount = () => GATES.length;
/* every logged defect that a version has not yet closed */
const openDefects = () => ISSUES.filter((i) => !i.closedBy);
/* the ones with a proposed fix — the change a planned version folds in */
const foldableDefects = () => openDefects().filter((i) => i.fix);
const bumpV = (v) => "v" + ((parseInt(String(v).replace(/^v/, ""), 10) || 0) + 1);

/* per-workspace flow, seeded lazily off the repo's current version */
function sysFlow() {
  let f = state.sysFlow[state.ws];
  if (!f) f = state.sysFlow[state.ws] = { view: "live", live: null, planned: null };
  return f;
}
const liveVersion = () => sysFlow().live || REPO.sysVersion;
/* which loop the canvas is reading — the live one, or the planned rework */
const sysViewing  = () => (sysFlow().planned && sysFlow().view === "planned" ? "planned" : "live");
/* the proc ids a planned version reworks, so the canvas can mark those edges */
function changedEdges() {
  const p = sysFlow().planned;
  return p ? new Set(p.changes.map((c) => c.edge)) : new Set();
}

/* ── plan a change: fold every foldable defect into a fresh version and hand it
      to a system agent, which reworks the loop in a branch ── */
function planChange() {
  const f = sysFlow();
  if (f.planned) { f.view = "planned"; state.verCardOpen = true; paint(); return; }
  const folded = foldableDefects();
  if (!folded.length) { toast("No defects with a proposed fix to fold in"); return; }
  const v = bumpV(liveVersion());
  f.planned = {
    v, stage: "building", who: "system agent", branch: `${REPO.name} · system/${v}`,
    addresses: folded.map((i) => i.id),
    changes: folded.map((i) => ({ edge: i.edge, cat: i.cat, t: i.t, id: i.id })),
  };
  f.view = "planned";
  state.verCardOpen = true;
  toast(`Planned ${v} · a system agent is reworking ${f.planned.changes.length} edges`);
  /* the agent works the branch, then marks it ready */
  clearTimeout(f._t);
  f._t = setTimeout(() => {
    if (f.planned && f.planned.stage === "building") { f.planned.stage = "ready"; paintVersion(); }
  }, 1700);
  paint();
}

function discardChange() {
  const f = sysFlow();
  clearTimeout(f._t);
  f.planned = null; f.view = "live";
  toast("Discarded the planned version");
  paint();
}

/* ── promote: run the switchover. Pause the running fleet, migrate what is in
      flight to the new contracts, then flip live onto the new version ── */
function promoteChange() {
  const f = sysFlow();
  if (!f.planned || f.planned.stage !== "ready") return;
  f.planned.stage = "switchover";
  f.planned.sw = { step: 0 };
  const running = AGENTS.filter((r) => r.status === "running").length;
  const inflight = AGENTS.filter((r) => r.status === "running" || r.status === "waiting").length;
  const steps = [
    `Pausing ${running} running agents`,
    `Migrating ${inflight} in-flight ${TERMS.units} to ${f.planned.v} contracts`,
    `Flipping live → ${f.planned.v}`,
  ];
  const step = (i) => {
    if (!f.planned || f.planned.stage !== "switchover") return;
    f.planned.sw.step = i;
    if (i < steps.length) { toast(steps[i]); paintVersion(); setTimeout(() => step(i + 1), 900); }
    else finishSwitchover();
  };
  step(0);
  paint();
}

function finishSwitchover() {
  const f = sysFlow();
  const p = f.planned; if (!p) return;
  const from = liveVersion();
  /* the folded defects close against the redraw, not against a patch */
  p.addresses.forEach((id) => { const i = issueById(id); if (i) i.closedBy = p.v; });
  HISTORY.unshift({ v: p.v, t: `switched ${from} → ${p.v}: reworked ${p.changes.length} edges`,
    s: `closed ${p.addresses.length} defects · just now`, who: "system agent" });
  f.live = p.v; f.planned = null; f.view = "live";
  toast(`Now running on ${p.v} · ${p.addresses.length} defects closed`);
  paint();
}

function setSysView(v) { sysFlow().view = v; state.verMenuOpen = false; paint(); }

/* ══════════════════════════════════════════════ the ask bar + agent chat ══
   A clean system canvas invites one thing: tell the agent what to change. The
   bar floats at the bottom, and submitting it opens a primary-pane chat with
   the system agent — the same agent that reworks the loop into a new version.
   Its answers dovetail back into that flow: it offers to plan a change, open
   the defects, or read the version history. */

/* the bar only shows when the canvas is clean — nothing drilled into, no sheet,
   console, chat, inspector, or version card covering it */
function askBarVisible() {
  return state.mode === "system" && state.view === "loop"
    && !state.chat.open && !state.docStack.length && !state.inputOpen
    && !state.run && !state.sel && !state.verCardOpen;
}

function paintAsk() {
  const host = $("#askLayer");
  if (!host) return;
  if (!askBarVisible()) { host.classList.remove("on"); host.innerHTML = ""; return; }
  host.classList.add("on");
  host.innerHTML = `
    <form class="askbar" id="askForm">
      <span class="askbar-i">${ICONS.robot}</span>
      <textarea id="askTa" rows="1" placeholder="Ask your agent to change the system, or ask about it…">${esc(state.askText)}</textarea>
      <button type="submit" class="askbar-send" id="askSend" title="Ask (Enter)" ${state.askText.trim() ? "" : "disabled"}>${ICONS.up}</button>
    </form>`;
  const ta = $("#askTa"), send = $("#askSend");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 132) + "px"; };
  ta.oninput = () => { state.askText = ta.value; send.disabled = !ta.value.trim(); grow(); };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAsk(); } };
  $("#askForm").onsubmit = (e) => { e.preventDefault(); submitAsk(); };
  grow();
}

function submitAsk() {
  const text = (state.askText || "").trim();
  if (!text) return;
  state.askText = "";
  openSysChat(text);
}

/* the agent's reply — canned but plausible, and wired to the real version flow
   so a "clean up the defects" ask ends in a promotable change */
function agentReply(text) {
  const t = text.toLowerCase();
  const nd = openDefects().length, fold = foldableDefects().length;
  const planAct = fold ? [{ label: `Plan a change · ${fold} defects`, act: "plan" }] : [];
  if (/defect|friction|wir|broken|miss|drift|gap|clean ?up|tech debt/.test(t)) {
    return { text: `The loop has logged **${nd} open defects** against its own wiring — the cluster is on the \`review\` and \`build\` edges. ${fold ? `${fold} of them carry a proposed fix, so I can fold those into a new version and rework those edges.` : `None have a proposed fix yet, so they need a decision before I can rework the edge.`}`,
      actions: [{ label: "Open defects", act: "defects" }, ...planAct] };
  }
  if (/version|change|promote|rework|redraw|upgrade|switch|bump/.test(t)) {
    return { text: `I can rework the loop in a branch off **${liveVersion()}**${fold ? `, folding in the ${fold} fixable defects` : ""}, then hand it back for you to promote. Promoting runs the switchover — it pauses the fleet, migrates what is in flight, then flips live onto the new version.`,
      actions: fold ? [{ label: "Plan a change", act: "plan" }] : [{ label: "See version history", act: "history" }] };
  }
  if (/skill|add|new (program|runbook)|can't|cannot|unable/.test(t)) {
    return { text: `Adding a capability is a change to the system, so it goes through a version: I draft the skill on its edge, wire its contract, and raise it as a bump that reviews before it is live. Nothing changes on the running loop until you promote.`,
      actions: [{ label: "Plan a change", act: "plan" }] };
  }
  if (/why|how|explain|what|send.?back|slow|bottleneck/.test(t)) {
    return { text: `Reading the loop for **${REPO.name}**: six stations, ${programCount()} programs, ${nd} open defects. The \`review\` edge sends back the most — that is the human gate, not the checks. Ask me to rework any edge and I will draft the change as a version bump.`,
      actions: planAct };
  }
  return { text: `I am looking at the whole loop for **${REPO.name}** — ${programCount()} programs, ${REPO.skillsN} skills, ${nd} open defects. Tell me what to change and I will rework the affected edges in a branch off ${liveVersion()}, or ask me anything about how it is wired.`,
    actions: planAct };
}

function openSysChat(seed) {
  state.chat.open = true; state.chat.text = "";
  state.docStack = []; state.inputOpen = null; state.run = null; state.sel = null;
  state.verCardOpen = false; state.verMenuOpen = false;
  if (seed && seed.trim()) {
    const text = seed.trim();
    state.chat.log.push({ role: "you", text });
    const rep = agentReply(text);
    state.chat.log.push({ role: "agent", text: rep.text, actions: rep.actions });
  } else if (!state.chat.log.length) {
    state.chat.log.push({ role: "agent",
      text: `I am your **system agent** for ${REPO.name}. I can change how the factory is wired — rework an edge, add a skill, fold defects into a new version — or just answer questions about the loop.` });
  }
  paint();
}

function sendSysChat(seed) {
  const text = (seed != null ? seed : state.chat.text || "").trim();
  if (!text) return;
  state.chat.log.push({ role: "you", text });
  const rep = agentReply(text);
  state.chat.text = "";
  state.chat.log.push({ role: "agent", text: rep.text, actions: rep.actions });
  paint();
}

function chatAct(act) {
  state.chat.open = false;
  if (act === "plan") planChange();
  else if (act === "defects") openDefectsList();
  else if (act === "history") { state.mode = "system"; state.view = "history"; state.sel = null; paint(); }
  else paint();
}

const CHAT_SUGGEST = [
  "Clean up the review-miss defects",
  "Add a skill so self-review can run the app",
  "Why does the review edge send so much back?",
  "Plan the next version",
];

function chatLine(e) {
  if (e.role === "you") return `<div class="ln ln-you"><span>${mdi(e.text, null)}</span></div>`;
  return `<div class="ln ln-say"><p>${mdi(e.text, null)}</p>${
    e.actions && e.actions.length
      ? `<div class="chat-acts">${e.actions.map((a) => `<button class="btn opt" data-chatact="${a.act}">${esc(a.label)}</button>`).join("")}</div>`
      : ""}</div>`;
}

function paintSysChat() {
  const nd = openDefects().length;
  $("#main").innerHTML = `
    <div class="cns syschat">
      <header class="cns-h">
        <button class="ico" id="chatBack" title="Back to the canvas (Esc)">${ICONS.chevL}</button>
        <span class="pr-k">${ICONS.robot}</span>
        <div class="cns-ht">
          <div class="cns-name">System agent<span class="pill running">live</span></div>
          <div class="cns-file mono">${esc(REPO.name)} · ${esc(liveVersion())} · ${programCount()} programs · ${nd} defects</div>
        </div>
      </header>

      <div class="cns-b">
        <div class="cns-feed chat-feed" id="chatFeed">
          ${state.chat.log.map(chatLine).join("")}
        </div>
        <aside class="cns-rail">
          <div class="rail-h">${ICONS.loop}The system</div>
          <div class="rail-c">
            <div class="rail-r"><span>Version</span><b>${esc(liveVersion())}</b></div>
            <div class="rail-r"><span>Programs</span><b>${programCount()}</b></div>
            <div class="rail-r"><span>Gates</span><b>${gateCount()}</b></div>
            <div class="rail-r"><span>Skills</span><b>${REPO.skillsN}</b></div>
            <div class="rail-r"><span>Open defects</span><b>${nd}</b></div>
          </div>
          <div class="rail-h mt">${ICONS.sparkle}Try asking</div>
          <div class="chat-suggest">
            ${CHAT_SUGGEST.map((s) => `<button class="chat-sg" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}
          </div>
        </aside>
      </div>

      <footer class="cns-f">
        <div class="cns-box">
          <textarea id="chatTa" placeholder="Ask your agent to change the system, or ask about it…" rows="1">${esc(state.chat.text)}</textarea>
          <button class="btn pri" id="chatSend">${ICONS.up}Send</button>
        </div>
      </footer>
    </div>`;

  const feed = $("#chatFeed"); if (feed) feed.scrollTop = feed.scrollHeight;
  $("#chatBack").onclick = () => { state.chat.open = false; paint(); };
  $("#main").querySelectorAll("[data-chatact]").forEach((el) => (el.onclick = () => chatAct(el.dataset.chatact)));
  $("#main").querySelectorAll("[data-ask]").forEach((el) => (el.onclick = () => sendSysChat(el.dataset.ask)));
  const ta = $("#chatTa");
  if (ta) {
    ta.oninput = () => { state.chat.text = ta.value; ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSysChat(); } };
    ta.focus();
  }
  const send = $("#chatSend"); if (send) send.onclick = () => sendSysChat();
}

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
      switchWorkspace(b.dataset.ws);
    }));
    $("#wsNew").onclick = () => { state.wsOpen = false; paintSidebar(); toast("New product workspace"); };
  }

  const MODE_ICON = { system: ICONS.wrench, product: ICONS.list };
  const MODE_LBL  = { system: "System", product: "Factory" };
  $("#modeSeg").innerHTML = ["system", "product"]
    .map((m) => `<button data-mode="${m}" class="${state.mode === m ? "on" : ""}">
      ${MODE_ICON[m]}<span>${MODE_LBL[m]}</span></button>`).join("");
  $("#modeSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  const rsec = state.mode === "system" ? "Definition" : "Factory";
  $("#sideNav").innerHTML = `<div class="rsec">${rsec}</div>` +
    navFor().map((n) => n.section ? `<div class="rsec sub">${n.section}</div>` : `
      <button class="snav ${state.view === n.id && !state.run ? "active" : ""}" data-view="${n.id}">
        ${ICONS[n.icon]}<span>${n.label}</span>
        ${n.n != null ? `<span class="snav-n ${n.loud && n.n ? "loud" : ""}">${n.n}</span>` : ""}
      </button>`).join("");
  $("#sideNav").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    state.view = b.dataset.view; state.sel = null; state.run = null; paint();
    if (factoryCanvas()) requestAnimationFrame(() => fit(true));
  }));

  $("#sideNavFoot").innerHTML = `
    <button class="snav" id="navSet">${ICONS.gate}<span>Integrations</span></button>`;
  $("#navSet").onclick = () => toast("Orca · GitHub · Linear");
}

function paintToolbar() {
  $("#tbNav").innerHTML =
    `<button class="ico dim">${ICONS.chevL}</button><button class="ico dim">${ICONS.chevR}</button>`;

  const modeLbl = state.mode === "system" ? "System" : "Factory";
  const viewLbl = (navFor().find((n) => n.id === state.view) || {}).label || state.view;
  const r = state.run ? runById(state.run) : null;
  const doc = state.docStack[state.docStack.length - 1];
  const inp = state.inputOpen ? inputById(state.inputOpen) : null;
  $("#crumb").innerHTML = `<span class="dim">${modeLbl}</span> › ${esc(viewLbl)}` +
    (r ? ` › <span class="dim">${esc(r.slice)} ${esc(r.title)}</span>` : "") +
    (inp ? ` › <span class="dim">${esc(inp.name)}</span>` : "") +
    (doc ? ` › <span class="dim">${esc(docTitle(doc))}</span>` : "");

  $("#tbActs").innerHTML = `
    <button class="ico" id="themeBtn" title="Theme">${ICONS.moon}</button>`;
  $("#themeBtn").onclick = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
  };
}

function paintStrip() {
  const live = AGENTS.filter((r) => r.status === "running").length;
  const waiting = AGENTS.filter((r) => r.status === "waiting").length;
  /* the version has moved up into the pill on the canvas, so the strip no longer
     repeats it — just what the factory is made of */
  $("#stripLeft").textContent = state.mode === "system"
    ? `${REPO.name} · ${programCount()} programs, ${gateCount()} ${gateCount() === 1 ? "gate" : "gates"}, ${REPO.skillsN} skills`
    : `${REPO.name} · ${REPO.branch} · ${live} agents running · ${waiting} waiting on you · ${AGENTS.filter((r) => r.status === "failed").length} failed`;
  /* the old "broken wire" chip is now the defect count: a count badge that opens
     the Defects list and floats the version card in beside it */
  const nd = openDefects().length;
  const chip = $("#lintChip");
  chip.className = "strip-defects" + (nd ? " bad" : "");
  chip.innerHTML = `<span class="def-badge">${nd}</span>${nd === 1 ? "defect" : "defects"}`;
  chip.title = nd ? "Defects logged against the running loop" : "No open defects";
  chip.onclick = () => openDefectsList();
  const MODE_ICON = { system: ICONS.wrench, product: ICONS.list };
  const MODE_LBL  = { system: "System mode", product: "Factory mode" };
  $("#modeChip").innerHTML = `${MODE_ICON[state.mode]}${MODE_LBL[state.mode]}`;
  const NEXT = { system: "product", product: "system" };
  $("#modeChip").onclick = () => setMode(NEXT[state.mode]);
}

/* clicking the defect badge takes you to the Defects list and floats the
   version card in beside it — the two are read together */
function openDefectsList() {
  state.mode = "system"; state.view = "issues"; state.run = null; state.sel = null;
  state.verCardOpen = true; closeEditor(true); paint();
}
function gotoDefects() { openDefectsList(); }
/* a change row jumps to the edge it reworks, on the planned loop */
function selectEdge(id) {
  state.mode = "system"; state.view = "loop"; closeEditor(true);
  if (sysFlow().planned) sysFlow().view = "planned";
  state.sel = { t: "proc", id }; paint();
}

const defectCatClass = (c) =>
  c === "skill-gap" || c === "constraint-violation" ? "gap" : c === "spec-ambiguity" ? "amb" : "drift";
const STAGE_LABEL = { building: "building", ready: "ready to promote", switchover: "switching over" };

/* ══════════════════════════════════════════════ the version pill + card ══
   Pinned top-left of the system canvas: the version the factory is on, the open
   defect count, and a dropdown to switch the canvas between the live loop and a
   planned rework. The card that floats in beside it is where you drive the
   change: fold defects → agent builds → promote → switch over. */
function paintVersion() {
  const host = $("#verLayer");
  const f = sysFlow(), planned = f.planned, viewing = sysViewing();
  const showPill = state.mode === "system" && state.view === "loop" && !state.run && !state.chat.open
    && !state.docStack.length && !state.inputOpen;
  const showCard = state.mode === "system" && state.verCardOpen;
  host.classList.toggle("on", showPill || showCard);
  if (!showPill && !showCard) { host.innerHTML = ""; return; }

  const nd = openDefects().length;
  host.innerHTML = (showPill ? verPill(f, planned, viewing, nd) : "") + (showCard ? verCard(f, planned, viewing, nd) : "");

  if (showPill) {
    $("#verPill").onclick = (e) => { e.stopPropagation(); state.verMenuOpen = !state.verMenuOpen; paintVersion(); };
    const menu = $("#verMenu");
    if (menu) {
      menu.onclick = (e) => e.stopPropagation();
      menu.querySelectorAll("[data-sysview]").forEach((b) => (b.onclick = () => setSysView(b.dataset.sysview)));
      const plan = $("#verPlan"); if (plan) plan.onclick = () => { state.verMenuOpen = false; planChange(); };
      const open = $("#verOpenChange"); if (open) open.onclick = () => { state.verMenuOpen = false; state.verCardOpen = true; paint(); };
      const hist = $("#verHist"); if (hist) hist.onclick = () => { state.verMenuOpen = false; state.view = "history"; state.sel = null; paint(); };
    }
  }
  const cx = $("#verCardX"); if (cx) cx.onclick = () => { state.verCardOpen = false; paintVersion(); };
}

function verPill(f, planned, viewing, nd) {
  const cur = viewing === "planned" ? planned.v : liveVersion();
  const tag = viewing === "planned" ? "Planned" : "Live";
  const menu = state.verMenuOpen ? `
    <div class="ver-menu" id="verMenu">
      <div class="ver-menu-h">System version</div>
      <button class="ver-mopt ${viewing === "live" ? "on" : ""}" data-sysview="live">
        <b>${esc(liveVersion())}</b><span>Live · running now</span>${viewing === "live" ? `<i class="ver-mtick">${ICONS.tick}</i>` : ""}
      </button>
      ${planned ? `<button class="ver-mopt ${viewing === "planned" ? "on" : ""}" data-sysview="planned">
        <b>${esc(planned.v)}</b><span>Planned · ${STAGE_LABEL[planned.stage]}</span>${viewing === "planned" ? `<i class="ver-mtick">${ICONS.tick}</i>` : ""}
      </button>` : ""}
      <div class="side-sep"></div>
      ${planned
        ? `<button class="ver-mact" id="verOpenChange">${ICONS.wrench}<span>Open change ${esc(planned.v)}</span></button>`
        : `<button class="ver-mact ${foldableDefects().length ? "" : "dim"}" id="verPlan">${ICONS.wrench}<span>Plan a change${foldableDefects().length ? ` · ${foldableDefects().length} defects` : ""}</span></button>`}
      <button class="ver-mact" id="verHist">${ICONS.clock}<span>Version history</span></button>
    </div>` : "";
  return `<div class="ver-pill-wrap">
    <button class="ver-pill ${viewing === "planned" ? "planned" : ""} ${state.verMenuOpen ? "open" : ""}" id="verPill">
      ${ICONS.wrench}<span class="ver-pill-l">Factory</span><b class="ver-pill-v">${esc(cur)}</b>
      <span class="ver-tag ${viewing === "planned" ? "plan" : ""}">${tag}</span>
      ${nd ? `<span class="ver-def" title="${nd} defects">${nd}</span>` : ""}
      <span class="ver-chev">${ICONS.chevD}</span>
    </button>${menu}
  </div>`;
}

function verDiff(planned) {
  return `<div class="ver-difflist">${planned.changes.map((c) => {
    const p = procById(c.edge);
    return `<button class="ver-diff" onclick="selectEdge('${c.edge}')">
      <span class="ver-diff-top">
        <span class="ver-diff-e">${ICONS.wrench}<span>${esc(p ? p.name : c.edge)}</span></span>
        <span class="cat ${defectCatClass(c.cat)}">${esc(c.cat)}</span>
      </span>
      <span class="ver-diff-t">${esc(c.t)}</span>
    </button>`;
  }).join("")}</div>`;
}

function verCard(f, planned, viewing, nd) {
  const next = bumpV(liveVersion());
  let flow;
  if (!planned) {
    flow = `
      <div class="sub-h">Plan a change</div>
      <div class="ver-lead">Fold the open defects into a new version. A system agent reworks the loop in a branch off the running one; you promote it once it is ready.</div>
      <button class="btn wide pri ${foldableDefects().length ? "" : "off"}" ${foldableDefects().length ? "" : "disabled"} onclick="planChange()">
        ${ICONS.wrench} Plan ${esc(next)} from ${foldableDefects().length} defects</button>`;
  } else {
    const stagePill = planned.stage === "building" ? `<span class="pill running">building</span>`
      : planned.stage === "ready" ? `<span class="pill ready">ready</span>`
      : `<span class="pill waiting">switching over</span>`;
    const previewBtn = `<button class="btn" onclick="setSysView('${viewing === "planned" ? "live" : "planned"}')">${viewing === "planned" ? "View live loop" : "Preview on canvas"}</button>`;
    let body;
    if (planned.stage === "building") {
      body = `<div class="ver-bar indet"><i></i></div>
        <div class="ver-lead">A system agent is reworking ${planned.changes.length} edges. It closes ${planned.addresses.length} defects.</div>
        <div class="sub-h">The change · ${esc(liveVersion())} → ${esc(planned.v)}</div>${verDiff(planned)}
        <div class="acts-row">${previewBtn}<button class="btn ghost" onclick="discardChange()">Discard</button></div>`;
    } else if (planned.stage === "ready") {
      body = `<div class="ver-lead">The rework is ready. Promoting runs the switchover: it pauses the running fleet, migrates what is in flight, then flips live onto ${esc(planned.v)}.</div>
        <div class="sub-h">The change · ${esc(liveVersion())} → ${esc(planned.v)}</div>${verDiff(planned)}
        <div class="acts-row"><button class="btn pri" onclick="promoteChange()">${ICONS.play} Promote ${esc(planned.v)}</button>${previewBtn}</div>
        <div class="acts-row"><button class="btn ghost wide" onclick="discardChange()">Discard change</button></div>`;
    } else {
      const steps = [
        `Pause the running fleet`,
        `Migrate in-flight ${TERMS.units} to ${esc(planned.v)} contracts`,
        `Flip live → ${esc(planned.v)}`,
      ];
      const at = planned.sw ? planned.sw.step : 0;
      body = `<div class="ver-lead">Switching the fleet over. This is the only moment the loop is paused.</div>
        <div class="ver-sw">${steps.map((s, i) => `
          <div class="ver-sw-row ${at > i ? "done" : at === i ? "active" : ""}">
            <span class="ver-sw-dot">${at > i ? ICONS.tick : ""}</span><span>${s}</span>
          </div>`).join("")}</div>`;
    }
    flow = `<div class="ver-plan">
      <div class="ver-plan-h"><b>${esc(planned.v)}</b><span class="ver-tag plan">Planned</span><span style="margin-left:auto">${stagePill}</span></div>
      <div class="ver-branch mono">${esc(planned.branch)}</div>
      ${body}</div>`;
  }

  return `<div class="ver-card">
    <div class="card-h"><span class="card-t">System version</span>
      <span class="card-a"><button class="pnl-x" id="verCardX" title="Close">${ICONS.x}</button></span></div>
    <div class="card-b">
      <div class="ver-now"><div class="ver-now-v">${esc(liveVersion())}<span class="ver-tag">Live</span></div>
        <div class="ver-now-s">${esc(REPO.name)} · running now</div></div>
      ${kv([["Programs", `${programCount()}`],
            ["Gates", `${gateCount()}`],
            ["Skills", `${REPO.skillsN}`],
            ["Open defects", nd ? `<a class="lnk" onclick="gotoDefects()">${nd} logged against the loop</a>` : `<span style="color:var(--text-3)">none</span>`]])}
      <div class="ver-sep"></div>
      ${flow}
    </div>
  </div>`;
}

function setMode(m) {
  if (state.mode === m) return;
  state.mode = m;
  state.view = "loop";
  state.sel = null; state.run = null; state.chat.open = false; closeEditor(true);
  paint(); requestAnimationFrame(() => fit(true));
}

/* the whole app re-reads one active dataset, so switching workspace is: swap the
   dataset, rebuild the doc corpus off it, and drop anything selected in the old
   world. The mode (which lens) survives; the contents do not. */
function switchWorkspace(id) {
  if (id === state.ws) { state.wsOpen = false; paintSidebar(); return; }
  state.ws = id; state.wsOpen = false;
  state.sel = null; state.run = null; state.composer = "";
  state.chat = { open: false, log: [], text: "" }; state.askText = "";
  state.docStack = []; state.drafts = {}; state.editing = false;
  state.inputOpen = null; state.inputEditing = false; state.intakeText = "";
  state.view = "loop";
  loadWorkspace(id);
  initDocs();
  paint(); requestAnimationFrame(() => fit(true));
}

/* ═════════════════════════════════════════════════════════════ the loop ══
   The six stations sit on a 2×3 rectangle, rotated so Feedback is the top-left
   corner, and the flow runs clockwise around the perimeter. Edges walk the grid
   as orthogonal H/V segments with rounded corners, each one picking whichever
   sides face the target. Input programs stack above Feedback and pour down into
   its top. The process box rides the middle of its edge. */

/* where each station sits on the grid, as [col, row]. Feedback is top-left,
   then clockwise: right across the top row, down the right column, back along
   the bottom, up the left column. */
const GRID = {
  feed:   [0, 0], spec: [1, 0], plans:  [2, 0],
  merged: [0, 1], pr:   [1, 1], branch: [2, 1],
};

function geo(m) {
  const P = state.mode === "product"
    ? { nw: 232, nh: 178, gapX: 280, gapY: 330 }
    : { nw: 198, nh: 80,  gapX: 210, gapY: 155 };
  const pitchX = P.nw + P.gapX, pitchY = P.nh + P.gapY;

  /* A program and its target gate both occupy the gap between states. Add room
     before that destination column instead of spreading the whole loop out. */
  const columnGaps = {};
  m.procs.filter((p) => p.kind === "gate").forEach((gate) => {
    const incoming = m.procs.find((p) => p.kind !== "gate" && p.to === gate.id);
    const fromGrid = incoming && GRID[incoming.from], toGrid = GRID[gate.to];
    if (fromGrid && toGrid && fromGrid[1] === toGrid[1] && fromGrid[0] < toGrid[0]) {
      columnGaps[toGrid[0]] = Math.max(columnGaps[toGrid[0]] || 0, state.mode === "product" ? 150 : 130);
    }
  });
  const xForColumn = (column) => column * pitchX
    + Object.entries(columnGaps).reduce((sum, [before, gap]) => sum + (+before <= column ? gap : 0), 0);

  /* raw node rects, origin at Feedback's top-left */
  const nodes = {};
  for (const id in GRID) {
    const [c, r] = GRID[id];
    nodes[id] = { x: xForColumn(c), y: r * pitchY, w: P.nw, h: P.nh };
  }

  /* Gates are endpoints on the wire. Place each one between its source and
     destination states so programs can route to the gate by id. */
  const gates = {};
  m.procs.filter((p) => p.kind === "gate").forEach((gate) => {
    const incoming = m.procs.find((p) => p.kind !== "gate" && p.to === gate.id);
    const from = nodes[incoming ? incoming.from : gate.from], to = nodes[gate.to];
    if (!from || !to) return;
    const w = 54, h = 54;
    const progress = incoming ? .62 : .5;
    gates[gate.id] = {
      x: (from.x + from.w / 2) + ((to.x + to.w / 2) - (from.x + from.w / 2)) * progress - w / 2,
      y: (from.y + from.h / 2) + ((to.y + to.h / 2) - (from.y + from.h / 2)) * progress - h / 2,
      w, h,
    };
  });

  /* input pills, stacked up-and-left of Feedback and pouring down into its top.
     Their right edge sits just left of Feedback's leftmost top-port so each wire
     leaves the pill, runs right, and drops straight in — no backtracking. */
  const iw = 182, ih = 36, igap = 14, vGap = 54;
  const inputs = (m.inputs || []).map((inp) => ({ ...inp, w: iw, h: ih }));
  const stackH = inputs.length ? inputs.length * ih + (inputs.length - 1) * igap : 0;
  const feed = nodes.feed;
  inputs.forEach((inp, k) => {
    inp.x = feed.x - iw + 28;
    inp.y = feed.y - vGap - stackH + k * (ih + igap);
  });

  /* fit the world around everything, then shift so it starts at (pad, pad) */
  const rects = [...Object.values(nodes), ...Object.values(gates), ...inputs];
  const pad = 62;
  const minX = Math.min(...rects.map((q) => q.x)), minY = Math.min(...rects.map((q) => q.y));
  const maxX = Math.max(...rects.map((q) => q.x + q.w)), maxY = Math.max(...rects.map((q) => q.y + q.h));
  const dx = pad - minX, dy = pad - minY;
  rects.forEach((q) => { q.x += dx; q.y += dy; });

  return { ...P, nodes, gates, inputs, iw, ih,
    W: maxX - minX + pad * 2, H: maxY - minY + pad * 2 };
}

/* a connection point on one of a node's four sides, at fraction f along it,
   with the outward normal (nx,ny) that shapes the stub leaving that side. */
function port(n, side, f) {
  if (side === "right")  return { x: n.x + n.w,     y: n.y + n.h * f, nx:  1, ny:  0 };
  if (side === "left")   return { x: n.x,           y: n.y + n.h * f, nx: -1, ny:  0 };
  if (side === "top")    return { x: n.x + n.w * f, y: n.y,           nx:  0, ny: -1 };
  return                        { x: n.x + n.w * f, y: n.y + n.h,     nx:  0, ny:  1 };  // bottom
}

/* pick which side each edge leaves and enters. Overlap-aware:
   - boxes share a row  → straight left↔right
   - boxes share a column → straight top↕bottom
   - diagonal → leave along the dominant axis (biased toward top/bottom) and
     enter the perpendicular facing side, so it reads as a clean L-elbow. */
function pickSides(a, b) {
  const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
  const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  let horiz;
  if (overlapY && !overlapX)      horiz = true;
  else if (overlapX && !overlapY) horiz = false;
  else                            horiz = Math.abs(dx) > Math.abs(dy) * 1.35;   // prefer vertical
  if (horiz) {
    const from = dx >= 0 ? "right" : "left";
    const to   = overlapY ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
    return [from, to];
  }
  const from = dy >= 0 ? "bottom" : "top";
  const to   = overlapX ? (dy >= 0 ? "top" : "bottom") : (dx >= 0 ? "left" : "right");
  return [from, to];
}

/* resolve every edge to two ports, spreading edges that share a side so several
   wires into one intake fan out instead of stacking on one point. */
function routeEdges(edges, nodes) {
  edges.forEach((e) => {
    const [fs, ts] = pickSides(nodes[e.from], nodes[e.to]);
    e._fs = e.fromSide || fs; e._ts = e.toSide || ts;
  });
  const out = {}, inn = {};
  edges.forEach((e) => { (out[e.from + ":" + e._fs] ??= []).push(e); (inn[e.to + ":" + e._ts] ??= []).push(e); });
  const frac = (list, e) => (list.indexOf(e) + 1) / (list.length + 1);
  edges.forEach((e) => {
    e._a = port(nodes[e.from], e._fs, frac(out[e.from + ":" + e._fs], e));
    e._b = port(nodes[e.to],   e._ts, frac(inn[e.to + ":" + e._ts], e));
  });
}

const R = 16;   // corner radius for the grid routing

/* orthogonal route between the two ports: a stub out of each side, then straight
   H/V segments meeting in the middle — an L when the sides are perpendicular,
   a Z when they face the same axis. */
function orthoPoints(e) {
  const a = e._a, b = e._b, stub = 24;
  const s0 = { x: a.x, y: a.y },                       s1 = { x: a.x + a.nx * stub, y: a.y + a.ny * stub };
  const t1 = { x: b.x + b.nx * stub, y: b.y + b.ny * stub }, t0 = { x: b.x, y: b.y };
  const aH = a.ny === 0, bH = b.ny === 0;              // does each port exit horizontally?
  let mid;
  if (aH && bH)        mid = [{ x: (s1.x + t1.x) / 2, y: s1.y }, { x: (s1.x + t1.x) / 2, y: t1.y }];
  else if (!aH && !bH) mid = [{ x: s1.x, y: (s1.y + t1.y) / 2 }, { x: t1.x, y: (s1.y + t1.y) / 2 }];
  else if (aH && !bH)  mid = [{ x: t1.x, y: s1.y }];
  else                 mid = [{ x: s1.x, y: t1.y }];
  return [s0, s1, ...mid, t1, t0];
}

/* an orthogonal polyline drawn with rounded corners, plus its halfway point so
   the process box can ride the middle of the edge. */
function roundedPath(raw, r) {
  const p = [];
  for (const q of raw) { const l = p[p.length - 1]; if (!l || Math.abs(q.x - l.x) > 0.5 || Math.abs(q.y - l.y) > 0.5) p.push(q); }
  if (p.length < 2) return { d: "", mid: p[0] || { x: 0, y: 0 } };
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], c = p[i], b = p[i + 1];
    const d1 = Math.hypot(c.x - a.x, c.y - a.y) || 1, d2 = Math.hypot(b.x - c.x, b.y - c.y) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const s = { x: c.x + (a.x - c.x) / d1 * rr, y: c.y + (a.y - c.y) / d1 * rr };
    const t = { x: c.x + (b.x - c.x) / d2 * rr, y: c.y + (b.y - c.y) / d2 * rr };
    d += ` L${s.x.toFixed(1)},${s.y.toFixed(1)} Q${c.x},${c.y} ${t.x.toFixed(1)},${t.y.toFixed(1)}`;
  }
  const last = p[p.length - 1];
  d += ` L${last.x},${last.y}`;
  let total = 0; const segs = [];
  for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); segs.push(l); total += l; }
  let want = total / 2, mid = p[0];
  for (let i = 1; i < p.length; i++) { if (want <= segs[i - 1]) { const f = want / (segs[i - 1] || 1); mid = { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f }; break; } want -= segs[i - 1]; }
  return { d, mid };
}

function edgeD(e) {
  const { d, mid } = roundedPath(orthoPoints(e), R);
  return { d, mx: mid.x, my: mid.y };
}

function paintLoop() {
  const m = model(), G = geo(m);
  const N = G.nodes;
  /* one lookup that also knows the input pills, so an input→state edge routes
     the same way a process edge does */
  const look = { ...N, ...G.gates };
  G.inputs.forEach((inp) => (look[inp.id] = inp));

  /* every wire the loop draws, as one list so wires sharing a side fan out
     together: the forward processes, the input feeders, and the back edges */
  const edges = [];
  m.procs.filter((p) => p.kind !== "gate").forEach((p) => edges.push({ from: p.from, to: p.to, proc: p }));
  m.procs.filter((p) => p.kind === "gate").forEach((gate) => {
    if (!G.gates[gate.id]) return;
    if (!m.procs.some((p) => p.kind !== "gate" && p.to === gate.id)) {
      edges.push({ from: gate.from, to: gate.id, gateWire: true });
    }
    edges.push({ from: gate.id, to: gate.to, gateWire: true });
  });
  /* push the feeders bottom-to-top so the fan into Feedback's top splays with
     the topmost pill reaching the rightmost port — the wires never cross */
  [...G.inputs].reverse().forEach((inp) => edges.push({ from: inp.id, to: inp.to, cls: "in", fromSide: "right", toSide: "top" }));
  (m.backs || []).forEach((b) => edges.push({ from: b.from, to: b.to, back: true, label: b.label, fromSide: "bottom", toSide: "bottom" }));
  routeEdges(edges, look);

  /* ── wires ── */
  let paths = "", labels = "";
  edges.forEach((e) => {
    const g = edgeD(e); e._g = g;
    if (e.proc) {
      const p = e.proc;
      const procRuns = factoryCanvas() ? liveAgents().filter((r) => runProcOf(r) && runProcOf(r).id === p.id) : [];
      const runCls = procRuns.some((r) => r.status === "waiting") ? " agent-wire attention"
        : procRuns.some((r) => r.status === "failed") ? " agent-wire failing"
        : procRuns.length ? " agent-wire active" : "";
      const cls = (p.broken ? "wire err" : "wire") + runCls;
      const mk = p.broken ? "arrowE" : "arrow";
      paths += `<path class="${cls}" id="w-${p.id}" d="${g.d}" marker-end="url(#${mk})"/>`;
    } else if (e.gateWire) {
      paths += `<path class="wire" d="${g.d}" marker-end="url(#arrow)"/>`;
    } else if (e.back) {
      paths += `<path class="wire back" d="${g.d}" marker-end="url(#arrowA)"/>`;
      if (e.label) labels += `<div class="elabel" style="left:${g.mx}px;top:${g.my}px"><b>↺</b>${esc(e.label)}</div>`;
    } else {
      paths += `<path class="wire feed" d="${g.d}" marker-end="url(#arrowIn)"/>`;
    }
  });

  /* ── nodes ── */
  let nodes = "";
  m.states.forEach((s) => {
    const r = N[s.id]; if (!r) return;
    const L = r.x, T = r.y;
    const sel = state.sel && state.sel.t === "node" && state.sel.id === s.id ? " sel" : "";
    const feeds = m.procs.filter((p) => p.to === s.id || p.from === s.id);
    const wrong = feeds.filter((p) => p.broken && p.from === s.id);

    if (state.mode === "product") {
      const rows = (ITEMS[s.id] || []).slice(0, 4).map((it) => {
        const isel = state.sel && state.sel.t === "item" && state.sel.id === it.id ? " sel" : "";
        const live = runsForSlice(it.id).length ? " live" : "";
        return `<div class="nd-row${isel}" data-item="${it.id}" data-state="${s.id}">
          <span class="nd-dot ${dotForItem(it.id, it.d)}${live}"></span>
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

  /* ── processes: the box riding the middle of its edge ── */
  /* when the canvas is previewing a planned version, the edges that version
     reworks are marked, so the diff reads on the loop itself */
  const planPreview = state.mode === "system" && sysViewing() === "planned";
  const reworked = planPreview ? changedEdges() : new Set();
  let procs = "";
  edges.forEach((e) => {
    if (!e.proc) return;
    const p = e.proc, g = e._g;
    const chg = reworked.has(p.id) ? " changed" : "";
    const sel = state.sel && state.sel.t === "proc" && state.sel.id === p.id ? " sel" : "";
    const nIssues = (p.issues || []).length;
    const inflight = stateById(p.from) ? stateById(p.from).count : 0;
    const badge = state.mode === "system"
      ? (nIssues ? `<span class="pr-b ${nIssues < 3 ? "amb" : ""}">${nIssues}</span>` : "")
      : (inflight ? `<span class="pr-b amb" style="background:var(--raise);color:var(--text-2)">${inflight}</span>` : "");
    /* System mode is where you design the program, so its action is Edit (opens
       the prompt in write mode); Factory mode is where you run it, so it is Play. */
    const isSys = state.mode === "system";
    const assigned = factoryCanvas()
      ? liveAgents().filter((r) => runProcOf(r) && runProcOf(r).id === p.id && (state.view !== "needs" || r.status === "waiting"))
      : [];
    const attention = assigned.some((r) => r.status === "waiting") ? " attention" : assigned.some((r) => r.status === "failed") ? " failing" : "";
    const face = procFace(p);
    const agentRows = assigned.map((r) => `<button class="agent-run ${r.status}" data-run="${r.id}" title="Open ${esc(agentName(r))}">
      <span class="agent-avatar" style="--agent-h:${agentHue(r)}" aria-hidden="true"></span>
      <span class="agent-work"><b>${esc(agentName(r))}</b><span><span class="mono">${esc(r.slice)}</span> ${esc(r.title)}</span><small>${esc(r.question ? r.question.t : r.head || "Working")}</small></span>
      <span class="nd-dot ${RUN_DOT[r.status]}"></span>
    </button>`).join("");
    procs += `<div class="pr${factoryCanvas() ? ` agent-proc${assigned.length ? " staffed" : ""}` : ""}${attention}${sel}${chg}${p.broken ? " err" : ""}" data-proc="${p.id}" style="left:${g.mx}px;top:${g.my}px;transform:translate(-50%,-50%)">
      <span class="pr-k ${face.tint}">${face.icon}</span>
      <span class="pr-copy"><span class="pr-t">${esc(p.name)}</span></span>
      ${chg ? `<span class="pr-chg">Δ</span>` : ""}
      ${factoryCanvas() ? `<span class="agent-proc-count">${assigned.length}</span>` : badge}
      ${factoryCanvas() ? `<div class="agent-runs">${agentRows || `<span class="agent-empty">${state.view === "needs" ? "No attention needed" : "No agent assigned"}</span>`}</div>` : `<button class="pr-run" data-${isSys ? "edit" : "run"}="${p.id}" title="${isSys ? "Edit program" : `Run over ${inflight} items`}">${isSys ? ICONS.pencil : ICONS.play}</button>`}
    </div>`;
  });

  m.procs.filter((p) => p.kind === "gate").forEach((p) => {
    const r = G.gates[p.id]; if (!r) return;
    const chg = reworked.has(p.id) ? " changed" : "";
    const sel = state.sel && state.sel.t === "proc" && state.sel.id === p.id ? " sel" : "";
    const nIssues = (p.issues || []).length;
    const badge = state.mode === "system" && nIssues
      ? `<span class="pr-b ${nIssues < 3 ? "amb" : ""}">${nIssues}</span>` : "";
    const assigned = factoryCanvas()
      ? liveAgents().filter((run) => runProcOf(run) && runProcOf(run).id === p.id && (state.view !== "needs" || run.status === "waiting"))
      : [];
    const attention = assigned.some((run) => run.status === "waiting") ? " attention" : assigned.some((run) => run.status === "failed") ? " failing" : "";
    procs += `<div class="pr gate${attention}${sel}${chg}${p.broken ? " err" : ""}" data-proc="${p.id}" style="left:${r.x + r.w / 2}px;top:${r.y + r.h / 2}px;transform:translate(-50%,-50%)">
      <span class="gate-label"><b>${esc(p.name)}</b><small>${esc(p.assignee.name)} · ${esc(p.assignee.type)} · ${esc(p.decision)}</small></span>
      <span class="gate-mark" aria-hidden="true">${ICONS.gate}</span>
      ${factoryCanvas() ? `<span class="gate-count">${assigned.length}</span>` : badge}
      ${factoryCanvas() ? "" : `<button class="pr-run gate-action" data-edit="${p.id}" title="Edit gate">${ICONS.pencil}</button>`}
    </div>`;
  });

  /* ── inputs: compact program pills stacked above Feedback ──
     Not part of the ring — these are the raw kinds of work entering the factory.
     Each pours down into Feedback's top, so several inputs visibly fan into one
     intake. Position and routing come from geo(); here we just draw the pills. */
  let inlets = "";
  G.inputs.forEach((inp) => {
    const open = state.inputOpen === inp.id ? " open" : "";
    /* same split as the process boxes: System edits the intake program, Factory runs it. */
    const isSys = state.mode === "system";
    inlets += `<div class="nd-in${open}" data-input="${inp.id}" style="left:${inp.x}px;top:${inp.y}px;width:${inp.w}px;height:${inp.h}px">
      <span class="nd-in-i">${ICONS[inp.icon]}</span>
      <span class="nd-in-t">${esc(inp.name)}</span>
      <button class="pr-run nd-in-run" data-${isSys ? "inedit" : "inrun"}="${inp.id}" title="${isSys ? `Edit ${esc(inp.name)}` : `Open ${esc(inp.name)}`}">${isSys ? ICONS.pencil : ICONS.play}</button>
    </div>`;
  });

  $("#main").innerHTML = `
    <div class="lp" id="lp">
      ${factoryCanvas() ? fleetControl() : ""}
      <div class="lp-world" id="world" style="width:${G.W}px;height:${G.H}px">
        <svg class="lp-svg" width="${G.W}" height="${G.H}">
          <defs>
            ${["arrow:var(--wire)", "arrowA:var(--accent)", "arrowE:var(--red)", "arrowS:var(--wire)", "arrowIn:var(--accent)"]
              .map((d) => { const [id, c] = d.split(":");
                return `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,1 L9,5 L0,9 z" style="fill:${c}${id === "arrowS" ? ";opacity:.62" : ""}"/></marker>`; }).join("")}
          </defs>
          ${paths}
        </svg>
        ${nodes}${procs}${inlets}${labels}
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

  const fleetDown = $("#fleetDown"), fleetUp = $("#fleetUp"), fleetAlert = $("#fleetAlert");
  if (fleetDown) fleetDown.onclick = () => scaleFleet(-1);
  if (fleetUp) fleetUp.onclick = () => scaleFleet(1);
  if (fleetAlert) fleetAlert.onclick = () => { state.view = "needs"; paint(); requestAnimationFrame(() => fit(true)); };

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
      if (e.target.closest("[data-run],[data-edit]")) return;
      /* in System (design) mode a process is a runbook you edit, so one click
         opens its prompt — the same pane as "Edit prompt" on the floating card,
         which still floats beside it. Elsewhere a click just selects. */
      if (state.mode === "system") { openEditor(el.dataset.proc); return; }
      state.sel = { t: "proc", id: el.dataset.proc }; paint();
    };
    /* double-click goes straight to the prompt, since that is what a process is */
    el.ondblclick = () => { state.sel = { t: "proc", id: el.dataset.proc }; openEditor(el.dataset.proc); };
  });
  /* an input program: the play button opens its intake console in any mode; in
     System mode clicking the pill body opens it too (it is a runbook you tune) */
  world.querySelectorAll("[data-inrun]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); openInputConsole(el.dataset.inrun); };
  });
  world.querySelectorAll("[data-inedit]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); openInputConsole(el.dataset.inedit, true); };
  });
  world.querySelectorAll("[data-input]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("[data-inrun],[data-inedit]")) return;
      if (state.mode === "system") openInputConsole(el.dataset.input);
    };
  });
  world.querySelectorAll("[data-run]").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      if (state.mode === "product" && runById(el.dataset.run)) openRun(el.dataset.run);
      else runProc(el.dataset.run);
    };
  });
  world.querySelectorAll("[data-edit]").forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); openEditor(el.dataset.edit, true); };
  });

  $("#zIn").onclick = () => zoomBy(1.18);
  $("#zOut").onclick = () => zoomBy(1 / 1.18);
  $("#zFit").onclick = fit;

  /* pan on the background, zoom under the cursor */
  let down = null;
  lp.addEventListener("mousedown", (e) => {
    if (e.target.closest(".nd, .pr, .lp-tools")) return;
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

/* Selecting something on the canvas moves it into the centre of the space left
   beside the inspector. Keep enough of the loop around it to preserve context. */
function focusSelected(anim) {
  const lp = $("#lp");
  if (!lp || !state.sel || (state.sel.t !== "node" && state.sel.t !== "proc")) return;
  const el = state.sel.t === "node"
    ? lp.querySelector(`[data-node="${state.sel.id}"]`)
    : lp.querySelector(`[data-proc="${state.sel.id}"]`);
  if (!el) return;

  const r = lp.getBoundingClientRect();
  const worldRect = $("#world").getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const roomW = r.width - (state.panelOpen ? PANEL_W - 22 : 0);
  const cx = (elRect.left + elRect.width / 2 - worldRect.left) / state.zoom;
  const cy = (elRect.top + elRect.height / 2 - worldRect.top) / state.zoom;
  const closer = state.mode === "product" ? .98 : 1.08;
  state.zoom = clamp(Math.max(state.zoom, closer), .5, 1.2);
  state.px = roomW / 2 - cx * state.zoom;
  state.py = r.height / 2 - cy * state.zoom;
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

/* list-view titles are the same words the rail uses, so a workspace names its
   own stations once and every surface reads them the same way */
const navLabel = (mode, view) => ((NAV[mode] || []).find((n) => n.id === view) || {}).label || view;

const VIEWS = {
  programs: () => ({ title: "Programs", sub: "the instructions on the lines — runbooks, plus the intake programs that pour work into the loop",
    rows: RUNBOOKS.map((p) => ({ t: p.name, s: `${endpointName(p.from)} → ${endpointName(p.to)} · ${p.trigger}`, r: `${p.runs} runs`, pill: p.issues.length ? `${p.issues.length} issues` : "clean", bad: p.issues.length > 2, sel: { t: "proc", id: p.id } }))
      .concat((typeof INPUTS !== "undefined" ? INPUTS : []).map((inp) => ({ t: inp.name, s: `intake → ${inp.to} · ${inp.sub}`, r: `${inp.count} waiting`, pill: "intake", bad: false, sel: { t: "input", id: inp.id } }))) }),
  gates: () => ({ title: "Gates", sub: "decisions that artifacts must pass before the factory can continue",
    rows: GATES.map((p) => ({ t: p.name, s: `${endpointName(p.from)} → ${endpointName(p.to)} · ${p.decision}`, r: `${p.assignee.name} · ${p.assignee.type}`, pill: `${p.runs} decisions`, bad: false, sel: { t: "proc", id: p.id } })) }),
  skills: () => ({ title: "Skills", sub: "capabilities a program can call",
    rows: SKILLS.concat(EXTRA_SKILLS)
      .map((p) => ({ t: p.name, s: `${p.trigger}`, r: `${p.runs} runs`, pill: p.broken ? "broken wire" : "clean", bad: !!p.broken, sel: p.id ? { t: "proc", id: p.id } : null })) }),
  issues: () => ({ title: navLabel("system", "issues"), sub: "friction the factory logs about its own wiring as it runs — attributed to edges, never to states",
    rows: openDefects().map((i) => ({ t: i.t, s: `on ${i.edge} · ${i.run}`, r: i.fix ? "fix proposed" : "", pill: i.cat, bad: i.cat === "skill-gap" || i.cat === "constraint-violation" || i.cat === "off-brand", sel: { t: "issue", id: i.id } })) }),
  history: () => ({ title: "System version history", sub: "separate from the repo's commit log",
    rows: HISTORY.map((h) => ({ t: h.t, s: h.s, r: h.v, pill: h.who, bad: false, sel: null })) }),
  frontier: () => ({ title: navLabel("product", "frontier"), sub: COPY.frontierSub,
    rows: ITEMS.plans.filter((i) => i.d === "run").concat(ITEMS.plans.filter((i) => i.d !== "run"))
      .map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "run" ? COPY.readyWord : "blocked", bad: false, sel: { t: "item", id: i.id, from: "plans" } })) }),
  slices: () => ({ title: navLabel("product", "slices"), sub: COPY.slicesSub,
    rows: [].concat(ITEMS.branch, ITEMS.pr, ITEMS.plans, ITEMS.merged)
      .map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "run" ? "running" : i.d === "wait" ? "waiting" : i.d === "bad" ? "failing" : TERMS.doneLabel, bad: i.d === "bad", sel: { t: "item", id: i.id } })) }),
  specs: () => ({ title: navLabel("product", "specs"), sub: COPY.specsSub,
    rows: ITEMS.spec.map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "bad" ? "ambiguous" : i.d === "wait" ? "gaps" : "covered", bad: i.d === "bad", sel: { t: "item", id: i.id, from: "spec" } })) }),
  runs: () => ({ title: navLabel("product", "runs"), sub: COPY.runsSub,
    rows: [].concat(ITEMS.branch, ITEMS.pr).map((i) => ({ t: `${i.id}  ${i.t}`, s: i.s, r: "", pill: i.d === "run" ? "running" : i.d === "wait" ? "waiting" : "failing", bad: i.d === "bad", sel: { t: "item", id: i.id } })) }),
};

/* each Factory node is now its own nav item, so selecting one lists what is
   sitting at that station. The pill reads the item's status dot the way that
   station means it: a plan is buildable or blocked, a PR running or failing, a
   spec covered or ambiguous, everything in Merged simply done. */
const STATION_PILL = {
  spec:   (it) => ({ pill: it.d === "bad" ? "ambiguous" : it.d === "wait" ? "gaps" : "covered", bad: it.d === "bad" }),
  plans:  (it) => ({ pill: it.d === "run" ? COPY.readyWord : "blocked", bad: false }),
  branch: (it) => ({ pill: it.d === "run" ? "running" : it.d === "wait" ? "waiting" : "failing", bad: it.d === "bad" }),
  pr:     (it) => ({ pill: it.d === "run" ? "running" : it.d === "wait" ? "waiting" : "failing", bad: it.d === "bad" }),
  merged: (it) => ({ pill: TERMS.doneLabel, bad: false }),
  feed:   (it) => ({ pill: it.cat || "feedback", bad: it.d === "bad" }),
};

function stationView(id) {
  const s = stateById(id);
  if (!s) return { title: id, sub: "", rows: [] };
  const list = ITEMS[id] || [];
  const pillOf = STATION_PILL[id] || ((it) => ({ pill: it.d === "bad" ? "failing" : "ok", bad: it.d === "bad" }));
  return {
    title: s.name,
    sub: list.length < s.count ? `showing ${list.length} of ${s.count} · ${s.glob}` : `${s.count} · ${s.glob}`,
    rows: list.map((it) => {
      const p = pillOf(it);
      return { t: `${it.id}  ${it.t}`, s: it.s, r: "", pill: p.pill, bad: p.bad, sel: { t: "item", id: it.id, from: id } };
    }),
  };
}

function paintList() {
  const v = (VIEWS[state.view] || (() => stationView(state.view)))();
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
      if (s && s.t === "input") { openInputConsole(s.id); return; }     /* an intake program opens its console */
      state.sel = s; paint();
    };
    b.ondblclick = () => { const s = v.rows[k].sel; if (s && s.t === "proc") openEditor(s.id); };
  });
}

/* ═══════════════════════════════════════════════════════════ workers ══
   Factory shows both the artifacts at each station and the harness sessions
   walking them along the programs between those stations. A run is one session
   on one slice; its console stays scoped to that slice and its place in the loop. */

const STATUS_BASE = {
  running: { label: "running",  pill: "running" },
  waiting: { label: "needs you", pill: "waiting" },
  failed:  { label: "failed",    pill: "bad" },
  blocked: { label: "blocked",   pill: "waiting" },
  done:    { label: "merged",    pill: "done" },
};
/* the "done" label is the workspace's own word — "merged" for a code factory,
   "published" for a content one — read live so a switch re-labels the fleet */
const STATUS = new Proxy(STATUS_BASE, { get: (o, k) =>
  k === "done" ? { label: TERMS.doneLabel, pill: "done" } : o[k] });
/* a station's display name is just its state name, so agents and the board can
   never disagree about what "branch" is called in this workspace */
const stationName = (id) => (stateById(id) || {}).name || id;
const worktreeOf = (r) => `${TERMS.worktree}${r.slice}`;
const branchOf   = (r) => `${TERMS.branchPre}${r.slice}`;
const filesTouched = (r) => [...new Set(r.log.filter((e) => e.k === "tool" && (e.act === "Edit" || e.act === "Write")).map((e) => e.arg))];

/* which runs the current agents tab is showing */
function agentsForView() {
  const order = { waiting: 0, failed: 1, running: 2, blocked: 3, done: 4 };
  const live = AGENTS.filter((r) => r.status !== "done");
  if (state.view === "needs")  return AGENTS.filter((r) => r.status === "waiting");
  if (state.view === "recent") return AGENTS.filter((r) => r.status === "done");
  if (state.view === "queue")  return [];    // queue is buildable slices, not runs
  return live.sort((a, b) => order[a.status] - order[b.status]);   // "live"
}

function paintAgents() {
  if (state.run && runById(state.run)) { paintConsole(runById(state.run)); return; }

  if (state.view === "needs") { paintLoop(); return; }

  const nav = agentsNav().find((n) => n.id === state.view) || { label: "Workers" };
  const SUB = {
    live:   "every harness session in flight — the status dots on the board, as the sessions behind them",
    needs:  "agents that stopped and asked you something before guessing",
    queue:  COPY.queueSub,
    recent: "sessions that finished, newest first",
  };

  let body;
  if (state.view === "queue") {
    const ready = ITEMS.plans.filter((i) => i.d === "run");
    body = `<div class="rgrid">${ready.map((i) => `
      <div class="rcard queue">
        <div class="rc-top"><span class="pill plain" style="color:var(--text-2)">${esc(COPY.readyWord)}</span></div>
        <div class="rc-h"><span class="rc-id mono">${esc(i.id)}</span><span class="rc-t">${esc(i.t)}</span></div>
        <div class="rc-sub">${ICONS.branch} ${esc(COPY.queueChain)} · ${esc(RUN_MODEL.branch)}</div>
        <div class="rc-head">${esc(i.s)}</div>
        <button class="btn wide" data-dispatch="${esc(i.id)}" data-title="${esc(i.t)}">${ICONS.play} Dispatch to an agent</button>
      </div>`).join("")}</div>`;
  } else {
    const list = agentsForView();
    body = list.length
      ? workersList(list)
      : `<div class="blank">${ICONS.robot}<h2>Nothing here</h2><p>${state.view === "needs"
          ? "No agent is waiting on you. When one stops to ask something, it shows up here first."
          : "No sessions in this state right now."}</p></div>`;
  }

  $("#main").innerHTML = `
    <div class="lv agents-lv">
      <div class="lv-head">
        <span class="lv-title">${esc(nav.label)}</span>
        <span class="lv-sub">${esc(SUB[state.view] || "")}</span>
      </div>
      ${body}
    </div>`;

  $("#main").querySelectorAll("[data-run]").forEach((el) =>
    (el.onclick = () => openRun(el.dataset.run)));
  $("#main").querySelectorAll("[data-dispatch]").forEach((el) =>
    (el.onclick = (e) => { e.stopPropagation(); spawnRun("branch", el.dataset.dispatch, el.dataset.title); }));
}

function fleetControl() {
  const busy = liveAgents().length, size = fleetSize();
  const waiting = AGENTS.filter((r) => r.status === "waiting").length;
  const failed = AGENTS.filter((r) => r.status === "failed").length;
  const available = Math.max(0, size - busy), draining = Math.max(0, busy - size);
  const status = draining ? `${draining} draining after current work` : `${busy} busy · ${available} available`;
  return `<div class="fleet-control">
    <div class="fleet-copy">
      <span class="fleet-k">Factory agents</span>
      <strong>${size}</strong>
      <span class="fleet-status">${status}</span>
    </div>
    <div class="fleet-stepper" aria-label="Factory agent capacity">
      <button id="fleetDown" title="Scale down">${ICONS.minus}</button>
      <span>${size}</span>
      <button id="fleetUp" title="Scale up">${ICONS.plus}</button>
    </div>
    ${waiting || failed ? `<button class="fleet-alert" id="fleetAlert">${ICONS.flag}<span>${waiting ? `${waiting} ${waiting === 1 ? "question" : "questions"}` : ""}${waiting && failed ? " · " : ""}${failed ? `${failed} failed` : ""}</span></button>` : `<span class="fleet-clear">${ICONS.check}No questions</span>`}
  </div>`;
}

/* the fleet as a list, grouped by status: the ones that need you first, then
   what broke, then what is quietly running */
const WGROUPS = [
  ["waiting", "Needs you"], ["failed", "Failed"], ["blocked", "Blocked"],
  ["running", "Running"],  ["done", null],
];
function workersList(list) {
  return WGROUPS.map(([k, label]) => {
    const rs = list.filter((r) => r.status === k);
    if (!rs.length) return "";
    const head = label || cap(TERMS.doneLabel);
    return `<div class="wgroup">
      <div class="wgroup-h">${head}<span class="wgroup-n">${rs.length}</span></div>
      <div class="wrows">${rs.map(workerRow).join("")}</div>
    </div>`;
  }).join("");
}

function workerRow(r) {
  const proc = runProcOf(r), st = STATUS[r.status], q = r.question;
  const time = r.status === "done" ? r.started : r.elapsed;
  return `<button class="wrow ${r.status}" data-run="${r.id}">
    <div class="wrow-b">
      <div class="wrow-t">
        <span class="nd-dot ${RUN_DOT[r.status]}"></span>
        <span class="wrow-id mono">${esc(r.slice)}</span>
        <span class="wrow-nm">${esc(r.title)}</span>
        <span class="wrow-meta">${esc(proc ? proc.name : "")} · ${esc(runModelOf(r))} · ${esc(stationName(r.station))}</span>
      </div>
      <div class="wrow-head ${q ? "ask" : ""}">${q ? esc(q.t) : esc(r.head || "")}</div>
    </div>
    <div class="wrow-r">
      <span class="wrow-time mono">${ICONS.clock}${esc(time)}</span>
      <span class="pill ${st.pill} plain">${st.label}</span>
    </div>
  </button>`;
}

/* ── the console: one run, as a live session you can talk to ── */

function logLine(e, r) {
  if (e.k === "sys")  return `<div class="ln ln-sys">${esc(e.t)}</div>`;
  if (e.k === "say")  return `<div class="ln ln-say">${e.t.split("\n\n").map((p) => `<p>${mdi(p, null)}</p>`).join("")}</div>`;
  if (e.k === "you")  return `<div class="ln ln-you"><span>${mdi(e.t, null)}</span></div>`;
  if (e.k === "ask")  return `<div class="ln ln-say ask"><p>${mdi(e.t, null)}</p></div>`;
  if (e.k === "tool") return `<div class="ln ln-tool"><span class="tl-act">${esc(e.act)}</span>
      <span class="tl-arg mono">${esc(e.arg)}</span>${e.sub ? `<span class="tl-sub mono">${esc(e.sub)}</span>` : ""}</div>`;
  if (e.k === "bash") return `<div class="ln ln-bash ${e.ok ? "" : "bad"}">
      <div class="bsh-cmd mono">$ ${esc(e.cmd)}</div>
      ${e.out ? `<pre class="bsh-out mono">${esc(e.out)}</pre>` : ""}</div>`;
  return "";
}

function paintConsole(r) {
  const proc = runProcOf(r), st = STATUS[r.status], q = r.question;
  const kIcon = proc && proc.kind === "runbook" ? ICONS.book : ICONS.sparkle;
  const files = filesTouched(r);
  const from = proc ? stateById(proc.from) : null, to = proc ? stateById(proc.to) : null;

  const composer = q
    ? `<div class="cns-ask">
        <div class="cns-ask-t">${ICONS.flag}<span>${esc(q.t)}</span></div>
        ${q.opts ? `<div class="cns-opts">${q.opts.map((o, i) =>
          `<button class="btn opt" data-answer="${i}">${esc(o)}</button>`).join("")}</div>` : ""}
      </div>
      <div class="cns-box">
        <textarea id="cnsTa" placeholder="…or reply in your own words" rows="1">${esc(state.composer)}</textarea>
        <button class="btn pri" id="cnsSend">${ICONS.play}Send</button>
      </div>`
    : r.status === "done"
    ? `<div class="cns-done">${ICONS.check}<span>Session finished · ${esc(r.head)}</span></div>`
    : `<div class="cns-box">
        <textarea id="cnsTa" placeholder="Steer ${esc(r.slice)} — ask, correct, or add a constraint" rows="1">${esc(state.composer)}</textarea>
        <button class="btn pri" id="cnsSend">${ICONS.play}Send</button>
      </div>`;

  $("#main").innerHTML = `
    <div class="cns">
      <header class="cns-h">
        <button class="ico" id="cnsBack" title="Back to Factory (Esc)">${ICONS.chevL}</button>
        <span class="pr-k">${ICONS.robot}</span>
        <div class="cns-ht">
          <div class="cns-name"><span class="mono cns-slice">${esc(r.slice)}</span> ${esc(r.title)}
            <span class="pill ${st.pill}">${st.label}</span></div>
          <div class="cns-file mono">${esc(branchOf(r))} · ${esc(runModelOf(r))} · ${esc(proc ? proc.name : "")}</div>
        </div>
        <span class="cns-time mono">${ICONS.clock}${esc(r.elapsed)}</span>
      </header>

      <div class="cns-b">
        <div class="cns-feed" id="cnsFeed">
          ${r.log.map((e) => logLine(e, r)).join("")}
          ${r.status === "running" ? `<div class="ln ln-live">${ICONS.robot}<span>${esc(r.head)}<i class="caret"></i></span></div>` : ""}
        </div>
        <aside class="cns-rail">
          ${r.status !== "done" ? `<div class="cns-prog"><div class="cns-prog-bar"><i style="width:${Math.max(4, r.pct)}%"></i></div><span>${r.pct}%</span></div>` : ""}
          <div class="rail-h">${ICONS.loop}Scope</div>
          <div class="rail-c">
            <div class="rail-r"><span>${esc(TERMS.Unit)}</span><b><a class="lnk" data-slice="${esc(r.slice)}" data-station="${esc(r.station)}">${esc(r.slice)} ${esc(r.title)}</a></b></div>
            <div class="rail-r"><span>Station</span><b>${esc(stationName(r.station))}</b></div>
            <div class="rail-r"><span>Process</span><b>${proc ? `<a class="lnk" data-proc="${esc(proc.id)}">${esc(proc.name)}</a>` : "—"}</b></div>
            <div class="rail-k">worktree</div>
            <div class="fields"><span class="f">${esc(worktreeOf(r))}</span></div>
          </div>

          ${proc ? `
          <div class="rail-h mt">${ICONS.gate}Contract</div>
          <div class="rail-c">
            <div class="rail-k">reads from ${esc(from ? from.name : proc.from)}</div>
            <div class="fields">${proc.reads.map((f) => `<span class="f ${from && from.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}</div>
            <div class="rail-k">writes into ${esc(to ? to.name : endpointName(proc.to))}</div>
            <div class="fields">${proc.writes.map((f) => `<span class="f ${to && to.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}</div>
          </div>` : ""}

          <div class="rail-h mt">${ICONS.doc}Files touched<span class="rail-n">${files.length}</span></div>
          ${files.length ? `<div class="fields col">${files.map((f) => `<span class="f">${esc(f)}</span>`).join("")}</div>`
            : `<div class="rail-empty">Nothing written yet.</div>`}
        </aside>
      </div>

      <footer class="cns-f">${composer}</footer>
    </div>`;

  const feed = $("#cnsFeed"); if (feed) feed.scrollTop = feed.scrollHeight;
  $("#cnsBack").onclick = () => { state.run = null; state.composer = ""; paint(); };
  $("#main").querySelectorAll("[data-slice]").forEach((el) =>
    (el.onclick = () => openItemDoc(el.dataset.slice)));
  $("#main").querySelectorAll("[data-proc]").forEach((el) =>
    (el.onclick = () => openEditor(el.dataset.proc)));
  $("#main").querySelectorAll("[data-answer]").forEach((el) =>
    (el.onclick = () => answerRun(r.id, +el.dataset.answer)));
  const ta = $("#cnsTa");
  if (ta) {
    ta.oninput = () => { state.composer = ta.value; ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToRun(r.id); } };
    ta.focus();
  }
  const send = $("#cnsSend"); if (send) send.onclick = () => sendToRun(r.id);
}

function openRun(id) {
  state.mode = "product"; state.run = id; state.sel = null; state.composer = ""; state.docStack = []; state.inputOpen = null;
  if (state.view === "queue") state.view = "loop";
  paint();
}

/* dispatch a fresh session onto a buildable slice — the orchestrator opening a
   worktree and handing an agent the payload, live */
function spawnRun(station, slice, title) {
  const id = "r-" + slice.replace(/\W/g, "") + "-" + (AGENTS.length);
  const r = {
    id, slice, title, station, started: "just now", elapsed: "0m", pct: 6, status: "running",
    head: `Reading the ${TERMS.unit} and its ${COPY.sourceWord}`,
    log: [
      { k: "sys", t: `Opened ${TERMS.worktree}${slice} · branched ${TERMS.branchPre}${slice} off ${TERMS.off}` },
      { k: "sys", t: `Payload: ${TERMS.unit} ${slice}, its ${COPY.sourceWord} and the decisions it cites. Nothing else in scope.` },
      { k: "say", t: `Picked up **${title}**. Reading the ${TERMS.unit} and its \`proves\` line, then cutting the work into ordered steps before I start.` },
    ],
  };
  AGENTS.unshift(r);
  toast(`Dispatched ${slice} to a ${runModelOf(r)} agent`);
  openRun(id);
}

/* you, typing back into a live session */
function sendToRun(id) {
  const r = runById(id), text = (state.composer || "").trim();
  if (!r || !text) return;
  r.log.push({ k: "you", t: text });
  r.log.push({ k: "say", t: `Got it — taking that on. ${r.status === "waiting" ? "Resuming from where I stopped." : "Folding it into the current step."}` });
  if (r.status === "waiting") { r.status = "running"; r.question = null; r.head = "Resuming the build"; r.pct = Math.min(96, r.pct + 6); }
  state.composer = "";
  paint();
}

/* answering the pending question with one of its one-tap options */
function answerRun(id, i) {
  const r = runById(id); if (!r || !r.question) return;
  const choice = r.question.opts[i];
  r.log.push({ k: "you", t: choice });
  /* a tailored continuation, so the session reads like it actually acted. The
     branches key off the shape of the answer, not the domain, so both a code
     factory and a content one route the same way. */
  if (/file|pause|flag|ambiguity|brief-gap/i.test(choice)) {
    r.log.push({ k: "say", t: "Filing it and pausing, rather than guessing on a `proves` line." });
    r.log.push({ k: "tool", act: "Write", arg: `${TERMS.issueDir}${r.slice}.md`, sub: COPY.blockCat });
    r.status = "blocked"; r.head = `Paused · ${COPY.blockCat} filed`;
  } else if (/send back|revise|soften/i.test(choice)) {
    r.log.push({ k: "say", t: `Sending it back to ${stationName("branch")} with the note.` });
    r.status = "done"; r.head = `Sent back to ${stationName("branch")}`; r.pct = 100; r.station = "branch";
  } else if (/merge|approve|publish|ship/i.test(choice)) {
    r.log.push({ k: "say", t: `Approving and stamping it. Logging a note so this is a deliberate call next time, not a drift.` });
    r.log.push({ k: "bash", cmd: TERMS.publishCmd, ok: true, out: TERMS.publishOut(r.slice) });
    r.status = "done"; r.head = cap(TERMS.doneLabel); r.pct = 100; r.station = "merged";
  } else {
    r.log.push({ k: "say", t: `Going with "${choice}". Folding it in and re-running the checks.` });
    r.status = "running"; r.head = "Back on it — finishing up"; r.pct = Math.min(92, r.pct + 30);
  }
  if (r.status !== "blocked") r.question = null;
  else r.question = null;
  paint();
}

/* ══════════════════════════════════════════════════════════ inspector ══ */

function card(title, acts, body) {
  return `<div class="card"><div class="card-h"><span class="card-t">${title}</span><span class="card-a">${acts || ""}</span></div><div class="card-b">${body}</div></div>`;
}
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<div class="kv-r"><span class="kv-k">${esc(k)}</span><span class="kv-v">${v}</span></div>`).join("")}</div>`;


/* Product mode's node card shows four rows and a "N more" that used to lead
   nowhere. The rest live in the station's own Factory list view (see the `dest`
   link in itemsCard). System mode keeps its node panel clean: there a state is a
   predicate, not a pile of things. */

function itemsCard(s, selId) {
  const list = ITEMS[s.id] || [];
  const out = PROCS.find((p) => p.from === s.id);
  /* every station is now its own Factory list, so "open in" always resolves */
  const dest = { mode: "product", view: s.id, label: s.name };
  const rows = list.map((it) => `
    <button class="it-row ${selId === it.id ? "sel" : ""}" data-q="${esc((it.id + " " + it.t + " " + it.s).toLowerCase())}"
      onclick="selectItem('${it.id}','${s.id}')" ondblclick="openItemDoc('${it.id}','${s.id}')">
      <span class="nd-dot ${dotForItem(it.id, it.d)}${runsForSlice(it.id).length ? " live" : ""}"></span>
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
  state.docStack = [path]; state.editing = false; state.inputOpen = null;
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
  const path = state.docStack[state.docStack.length - 1];
  P.classList.toggle("document-open", !!path);
  P.classList.toggle("open", !!s || !!path);
  if (!s && !path) { P.innerHTML = ""; return; }

  const inProduct = state.mode === "product";
  const home = s && s.t === "item" ? stateById(itemHome(s)) : null;
  P.innerHTML = (s ? (
      s.t === "node"  ? nodePanel(stateById(s.id)) + (inProduct && stateById(s.id) ? itemsCard(stateById(s.id)) : "")
    : s.t === "proc"  ? procPanel(procById(s.id))
    : s.t === "issue" ? issuePanel(issueById(s.id))
    /* the item's own details live in the file that is already open in the main
       pane, so the panel is only the list you navigate with */
    : s.t === "item"  ? (inProduct && home ? itemsCard(home, s.id) : itemPanel(s))
    : "") : "") + (path ? docSupportCard(path) : "");

  P.querySelectorAll("[data-href]").forEach((el) => (el.onclick = (e) => {
    e.preventDefault(); openDoc(el.dataset.href);
  }));
  const pgNew = P.querySelector("#pgNew");
  if (pgNew) pgNew.onclick = () => toast(`New page under ${fileOf(path)}`);

  /* one dismiss, on the first card, so the panels read as transient */
  /* keep the row you are reading visible in the list you are steering with */
  const cur = P.querySelector(".it-row.sel");
  if (cur) cur.scrollIntoView({ block: "nearest" });

  const first = P.querySelector(".card-a");
  if (first && (!s || s.t !== "proc" || inProduct)) {
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
  const face = procFace(p), owner = p.assignee;
  return card(p.kind === "gate" ? "Gate" : "Process", `<span class="tagm ${face.cls}">${p.kind}</span>`, `
    <div class="c-n">${esc(p.name)}</div>
    <div class="c-r">${esc(src ? src.name : endpointName(p.from))} → ${esc(dst ? dst.name : endpointName(p.to))}</div>
    ${kv([["Trigger", esc(p.trigger)], [owner ? "Assigned to" : "Runner", owner ? `${esc(owner.name)} <span class="pill plain">${esc(owner.type)}</span>` : esc(p.runner)], ...(p.decision ? [["Decision", esc(p.decision)]] : []), ["Median", esc(p.median)], ["Runs", `${p.runs}`],
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

function issuePanel(i) {
  const p = PROCS.find((x) => x.id === i.edge);
  const f = sysFlow(), inPlan = f.planned && f.planned.addresses.includes(i.id);
  const foldBtn = i.closedBy
    ? `<button class="btn ghost" disabled>Closed by ${esc(i.closedBy)}</button>`
    : inPlan
    ? `<button class="btn" onclick="state.verCardOpen=true;paint()">In planned ${esc(f.planned.v)}</button>`
    : `<button class="btn ghost" onclick="planChange()">${i.fix ? "Fold into next version" : "No fix yet"}</button>`;
  return card("Defect", `<span class="cat ${defectCatClass(i.cat)}">${esc(i.cat)}</span>`, `
    <div class="c-n" style="font-size:14px;line-height:1.45">${esc(i.t)}</div>
    ${kv([["On edge", p ? esc(p.name) : esc(i.edge)], ["From", esc(i.run)],
          ["Fix", i.fix ? "proposed" : "none yet"], ["Status", i.closedBy ? `closed by ${esc(i.closedBy)}` : inPlan ? `folded into ${esc(f.planned.v)}` : "open"]])}
    <div class="acts-row">
      <button class="btn" onclick="state.mode='system';state.view='loop';state.sel={t:'proc',id:'${i.edge}'};paint()">Go to the edge</button>
      ${foldBtn}
    </div>`) +
  card("Why it lands here", "", `<div class="c-r">States do not fail. Transitions do. This defect is attributed
    to <b>${p ? esc(p.name) : esc(i.edge)}</b>, so the friction shows up on the line in the loop view rather than
    in a flat backlog nobody reads. A version folds it in by reworking that edge, not by patching a prompt.</div>`);
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
      ${runsForSlice(it.id).length
        ? `<button class="btn" onclick="openRun('${runsForSlice(it.id)[0].id}')">${ICONS.robot} Open worker</button>`
        : out ? `<button class="btn" onclick="runProc('${out.id}')">${ICONS.play} ${esc(out.name)}</button>` : ""}
    </div>`);
}

/* ─────────────────────────────────────────────────────────────── paint ── */

function paint() {
  const was = state.panelOpen;
  state.panelOpen = !!state.sel;
  paintSidebar(); paintToolbar(); paintStrip();
  const chat = state.chat.open && state.mode === "system";
  if (chat) paintSysChat();
  else if (state.run || (state.mode === "product" && (state.view === "queue" || state.view === "recent"))) paintAgents();
  else if (state.view === "loop" || factoryCanvas()) paintLoop(); else paintList();
  /* the list gives up the room the panel needs; the loop keeps it and re-fits */
  $("#main").classList.toggle("inset", !chat && state.view !== "loop" && !factoryCanvas() && !!state.sel);
  /* over a list, the version card gets its own room on the left so it never
     lands on top of the rows; over the loop it just floats on the dot grid */
  $("#main").classList.toggle("card-left", state.verCardOpen && state.mode === "system" && state.view !== "loop");
  paintPanels(); paintVersion(); paintAsk(); paintEditor();
  /* Selection gets a closer contextual frame; closing the inspector restores
     the whole-loop overview. */
  if (!chat && (state.view === "loop" || factoryCanvas())) {
    if (state.panelOpen && state.sel) requestAnimationFrame(() => focusSelected(true));
    else if (was !== state.panelOpen) requestAnimationFrame(() => fit(true));
  }
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${ICONS.check}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 2400);
}

$("#sideToggle").onclick = () => { $(".win").classList.toggle("narrow"); setTimeout(() => fit(true), 60); };
document.addEventListener("click", () => {
  if (state.wsOpen) { state.wsOpen = false; paintSidebar(); }
  if (state.verMenuOpen) { state.verMenuOpen = false; paintVersion(); }
});
window.addEventListener("resize", () => { if (state.view === "loop" || factoryCanvas()) fit(); });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.verMenuOpen) { state.verMenuOpen = false; paintVersion(); }   /* the version dropdown */
    else if (state.docStack.length || state.inputOpen) closeEditor();      /* the sheet */
    else if (state.chat.open) { state.chat.open = false; paint(); }        /* the agent chat */
    else if (state.verCardOpen) { state.verCardOpen = false; paintVersion(); }   /* the version card */
    else if (state.run) { state.run = null; state.composer = ""; paint(); }   /* then the console */
    else { state.sel = null; paint(); }            /* then the panel */
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

  /* in a run console, up/down walk the fleet just like the file sheet walks a
     station list */
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && state.mode === "product" && state.run && !state.docStack.length) {
    const list = agentsForView(), i = list.findIndex((r) => r.id === state.run);
    const j = clamp(i + (e.key === "ArrowDown" ? 1 : -1), 0, list.length - 1);
    if (i >= 0 && j !== i) { e.preventDefault(); openRun(list[j].id); }
  }
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
  return `system/${procFace(p).dir}/${p.id}.md`;
}
function initDocs() {
  Object.keys(DOCS).forEach((k) => delete DOCS[k]);   /* a fresh corpus per workspace */
  PROCS.forEach((p) => (DOCS[promptFile(p)] = { title: p.name, body: p.prompt }));
  Object.keys(PAGES).forEach((k) => (DOCS[k] = { title: PAGES[k].title, body: PAGES[k].body }));
  /* spec sections first, so the slices that cite them link to something real */
  ["spec", "plans", "branch", "pr", "merged", "feed"].forEach((home) =>
    (ITEMS[home] || []).forEach((it) => {
      const path = itemDocPath(it, home);
      if (!DOCS[path]) DOCS[path] = { title: it.t, body: itemBody(it, home), item: { id: it.id, from: home } };
    }));
  /* system issues are files too, but they live off the production loop — in
     system/issues, reached from System mode, never a station on the ring */
  ISSUES.forEach((iss) => (DOCS[TERMS.issueBase + iss.id + ".md"] = { title: iss.t, body: issueBody(iss) }));
}

/* a system issue: a miss in the loop's own process, attributed to the edge it
   happened on. Off the ring by design — the factory produces the product; this
   is the factory finding a bug in itself. */
function issueBody(iss) {
  const edge = procById(iss.edge);
  const edgeLink = edge ? `[${edge.name}](../${promptFile(edge).replace("system/", "")})` : iss.edge;
  const specName = (stateById("spec") || {}).name || "spec";
  const kindWord = edge ? edge.kind : "runbook";
  return `Category \`${iss.cat}\`, on the ${edgeLink} edge · ${iss.run}.

This is a **system issue** — the loop got something wrong about *itself*, not the
${COPY.productWord}. It lives here, off the production ring, and it is fixed by
editing the ${kindWord} on its edge, not by shipping a ${TERMS.unit}.

## What happened

${iss.t}

## How it gets fixed

${iss.fix
  ? `- [ ] Patch the ${kindWord} on the ${edge ? edge.name : iss.edge} edge
- [ ] Bump the system version
- [ ] Close this with the commit that changed the ${kindWord}`
  : `- [ ] No fix yet — it needs a call in ${specName} first, not a prompt change`}

> Three of one category on one edge is not a patch.
> [Redraw the edge](../runbooks/triage/redraw-an-edge.md) instead.`;
}

/* ── the product corpus is markdown too ──
   A slice, a spec section and an issue are all files, so they open in the same
   sheet as a runbook. Nothing about the sheet knows which is which: it renders
   whatever is at the path and reads the rail off the file. */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hsh  = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0);

function itemDocPath(it, home) {
  if (home === "spec") return `docs/${it.id}-${slug(it.t)}.md`;
  if (home === "feed") return `feedback/${it.id.replace("#", "")}.md`;
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

  const B = COPY.body;
  if (home === "spec") {
    const cite = [ITEMS.plans[n % 6], ITEMS.merged[(n + 2) % 6]];
    return `## Problem

**${it.t}** is the part of the product that gets described a different way every
time somebody says it out loud. This section fixes the language, and every
decision below is numbered so a ${TERMS.unit} can cite one rather than paraphrase it.

## Decisions

1. **D${180 + (n % 9)}** — ${B.specDecisions[0]}
2. **D${190 + (n % 7)}** — ${B.specDecisions[1]}
3. **D${200 + (n % 5)}** — ${B.specDecisions[2]}

## Open questions

- [ ] ${B.specQs.open}
- [x] ${B.specQs.done} No, decided in D${190 + (n % 7)}.

## Coverage

${it.s}. Cited by [${cite[0].id}](../slices/${cite[0].id}.md) and
[${cite[1].id}](../slices/${cite[1].id}.md).

> A ${COPY.sourceWord} with no ${TERMS.unit} citing it is either not built or not needed.
> Both are worth knowing, and [${procById("plan").name}](../system/runbooks/plan.md)
> reads this line before it cuts.`;
  }

  if (home === "feed") {
    /* product feedback — about the thing the factory makes, so it stays in the
       factory and folds back into the spec. System/process misses are a
       different animal and live off the loop in System mode. */
    const specName = (stateById("spec") || {}).name || "spec";
    const logProc = procById("log");
    return `\`${it.cat}\` · ${it.area || it.channel || ""} · logged by [${logProc.name}](../system/skills/log.md)

## What we saw

${it.report}

## Where it goes

Folds into **${specName}** as ${it.fold}. This is feedback about the
${COPY.productWord}, so it stays in the factory — it sharpens the next
${specName}, it does not touch the runbooks.

> Process misses — where the *system* got something wrong about itself — are a
> separate queue, off this loop, in System mode under **System issues**. This
> file is about the ${COPY.productWord}, not the machine.

## Next

- [${it.fix ? "x" : " "}] ${it.fix
  ? `Carried into ${it.fold}`
  : "Hold — one data point is a fluke; wait for the pattern before it becomes a decision"}`;
  }

  /* everything else is one unit, at one of four stations */
  const sp = specRef(n);
  const merged = home === "merged", live = home === "branch" || home === "pr";
  const tick = (done) => (done ? "x" : " ");
  return `${TERMS.Unit} **${it.id}** · ${st ? st.name : home} · cites
[${sp.id} ${sp.t}](../${sp.path}) §${1 + (n % 4)}

## Proves

${B.proves(it.t)}

## Fields

- \`needs\` — ${it.s.startsWith("needs") ? it.s.split("·")[0].replace("needs", "").trim() : "nothing outstanding"}
- \`owns\` — ${B.owns(slug(it.t))}
- \`spec\` — [${sp.id} ${sp.t}](../${sp.path}) §${1 + (n % 4)}
- \`proves\` — the sentence above

## Tasks

- [${tick(true)}] ${B.readSpec}
- [${tick(merged || live)}] ${B.openWork}
- [${tick(merged || home === "pr")}] ${B.implement}
- [${tick(merged || home === "pr")}] ${B.selfReview}
- [${tick(merged)}] ${B.raise}

## Notes

${it.s}.${merged ? ` ${cap(TERMS.doneLabel)}, so this file is history now: it stays for the citation, not for the work.` : ""}`;
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
  const m = path.match(/^system\/(?:runbooks|gates|skills)\/([^/.]+)/);
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

/* Pages and the root contract stay nearby as a floating card. Tasks only appear
   once, in the markdown document itself. */
function docSupportCard(path) {
  const p = procOfDoc(path), root = p && promptFile(p) === path;
  const kids = childPages(path);
  const from = p ? stateById(p.from) : null, to = p ? stateById(p.to) : null;

  return card("Pages & contract", "", `
    <div class="rail-h">${ICONS.doc}Pages<span class="rail-n">${kids.length}</span></div>
    ${kids.length ? `<div class="rail-pages">${kids.map((k) => {
      const kt = parseTasks(docBody(k));
      return `<button class="pg" data-href="${esc(k)}">
        <span class="pg-t">${esc(docTitle(k))}</span>
        <span class="pg-s mono">${esc(fileOf(k))}${kt.length ? ` · ${kt.length} tasks` : ""}</span>
        <span class="pg-c">${ICONS.chevR}</span></button>`; }).join("")}</div>`
      : `<div class="rail-empty">Nothing nested under this file yet.</div>`}
    <button class="pg new" id="pgNew">${ICONS.plus}New page under ${esc(fileOf(path))}</button>

    ${root && p ? `
      <div class="rail-h mt">${ICONS.gate}Contract</div>
      <div class="rail-c">
        <div class="rail-k">reads from ${esc(from ? from.name : p.from)}</div>
        <div class="fields">${p.reads.map((f) => `<span class="f ${from && from.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}</div>
        <div class="rail-k">writes into ${esc(to ? to.name : endpointName(p.to))}</div>
        <div class="fields">${p.writes.map((f) => `<span class="f ${to && to.shape.includes(f) ? "ok" : "no"}">${esc(f)}</span>`).join("")}</div>
        ${p.broken ? `<div class="rail-bad">Broken wire: ${esc(p.broken)}</div>` : ""}
      </div>` : `<div class="rail-h mt">${ICONS.gate}Contract</div>
        <div class="rail-empty">The contract is defined on the parent program.</div>`}`);
}

/* The sheet does not care what kind of file it is holding. It needs a glyph, a
   word, and — if the file is a thing that moves — the process that moves it
   next. A runbook, a slice and a spec section all answer those three. */
function docFace(path) {
  const pr = procOfDoc(path), isRoot = !!pr && promptFile(pr) === path;
  const item = DOCS[path] && DOCS[path].item;
  if (isRoot) return { ...procFace(pr), kind: pr.kind, proc: pr, root: true };
  if (item) {
    const kind = item.from === "spec" ? "spec" : item.from === "feed" ? "feedback" : "slice";
    return { icon: kind === "spec" ? ICONS.doc : kind === "feedback" ? ICONS.flag : ICONS.list,
      kind, cls: "pgtag", tint: "", item, next: PROCS.find((x) => x.from === item.from), root: false };
  }
  return { icon: ICONS.doc, kind: "page", cls: "pgtag", tint: "", proc: pr, root: false };
}

function paintEditor() {
  const host = $("#overlay");
  if (!host) return;
  if (state.inputOpen) { paintInputConsole(host); return; }
  const path = state.docStack[state.docStack.length - 1];
  if (!path || !DOCS[path]) { host.className = "ov-wrap"; host.innerHTML = ""; return; }

  const face = docFace(path), root = face.root;
  const p = face.item ? null : procOfDoc(path);
  const src = docBody(path), dirty = isDirty(path);
  const from = p ? stateById(p.from) : null, to = p ? stateById(p.to) : null;
  const rate = p ? Math.round(p.fail * 100) : 0;

  /* The document becomes the canvas; inspectors continue to float above it. */
  host.className = "ov-wrap open";
  host.style.right = "0px";
  host.innerHTML = `
    <div class="ov-card">
      <header class="ov-h">
        <button class="ico" id="ovBack" title="${state.docStack.length > 1 ? "Back" : "Back to Factory (Esc)"}">${ICONS.chevL}</button>
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
      </header>

      <div class="ov-b">
        <div class="ov-doc ${state.editing ? "writing" : ""}" id="ovDoc">
          ${state.editing
            ? `<textarea class="ov-edit mono" id="ovTa" spellcheck="false">${esc(src)}</textarea>`
            : `<article class="md">${md(src, path)}</article>`}
        </div>
      </div>

      <footer class="ov-f">
        <span class="ov-meta">${face.item
          ? `${esc(stateById(face.item.from) ? stateById(face.item.from).name : face.item.from)} · ${esc(face.item.id)}`
          : p ? `${liveVersion()} · ${p.runs} runs · ${rate}% send-back · ${esc(p.runner)}` : liveVersion()}</span>
        <span class="ov-sp"></span>
        ${dirty ? `<button class="btn ghost" id="ovRevert">Revert</button>` : ""}
        ${face.item && face.next
          ? `<button class="btn" id="ovRun">${ICONS.play} ${esc(face.next.name)} on ${esc(face.item.id)}</button>`
          : p ? `<button class="btn" id="ovRun">${ICONS.play} Run ${esc(p.name)}</button>` : ""}
        <button class="btn pri" id="ovSave" ${dirty ? "" : "disabled"}>${ICONS.save} Save</button>
      </footer>
    </div>`;

  const card = host.querySelector(".ov-card");
  $("#ovBack").onclick = state.docStack.length > 1
    ? () => { state.docStack.pop(); state.editing = false; paintPanels(); paintEditor(); paintToolbar(); }
    : () => closeEditor();
  const runId = face.item && face.next ? face.next.id : p ? p.id : null;
  if (runId) $("#ovRun").onclick = () => runProc(runId);
  $("#ovSave").onclick = () => saveEditor();
  if (dirty) $("#ovRevert").onclick = () => { delete state.drafts[path]; paintEditor(); };
  $("#ovSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    state.editing = b.dataset.m === "write"; paintEditor();
    const ta = $("#ovTa"); if (ta) ta.focus();
  }));

  /* Wire markdown links and checkboxes in the page. */
  wireCard();
  function wireCard() {
  card.querySelectorAll("[data-href]").forEach((el) => (el.onclick = (e) => { e.preventDefault(); openDoc(el.dataset.href); }));
  card.querySelectorAll("[data-ck]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); toggleTask(path, +el.dataset.ck); }));
  card.querySelectorAll("[data-crumb]").forEach((el) => (el.onclick = () => {
    state.docStack = state.docStack.slice(0, +el.dataset.crumb + 1); state.editing = false; paintPanels(); paintEditor(); paintToolbar();
  }));
  }

  const ta = $("#ovTa");
  if (ta) ta.oninput = () => {
    state.drafts[path] = ta.value;
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

function openEditor(id, edit = false) {
  const p = procById(id); if (!p) return;
  state.inputOpen = null;
  state.docStack = [promptFile(p)]; state.editing = !!edit;
  if (!state.sel || state.sel.t !== "proc" || state.sel.id !== id) state.sel = { t: "proc", id };
  paint();
}

/* ══════════════════════════════════════════════════ the intake console ══
   An input is not a station but a little program the operator runs to pour work
   into the loop. Opened, it takes over the primary pane as a console: a big
   message box with an AI chat bar, plus the program's own definition to tune. */

const inputById = (id) => (INPUTS || []).find((x) => x.id === id);

/* a default definition so the program reads like the runbooks do. Cached on the
   input so an edit sticks for the session. */
function inputProgram(inp) {
  if (inp.prompt) return inp.prompt;
  const to = stateById(inp.to);
  inp.prompt = `## What this is

**${inp.name}** is an intake program. It takes ${inp.sub}, structures each item,
and drops it into **${to ? to.name : inp.to}** as a feedback item the loop triages.

## How it runs

- [ ] Take the operator's message, a pasted report, or a polled source
- [ ] Classify it — bug, regression, request, paper-cut, praise → category
- [ ] Name the area of the product it touches → area
- [ ] File it into ${to ? to.name : inp.to} with a \`fold\` line → ${to ? to.glob : inp.to}

## Rules

1. One item per report. Split anything that names two separate problems.
2. Never invent a severity the reporter did not state.`;
  return inp.prompt;
}

function openInputConsole(id, edit = false) {
  const inp = inputById(id); if (!inp) return;
  if (state.inputOpen !== id) state.intakeText = "";
  state.inputEditing = !!edit;
  state.inputOpen = id;
  state.docStack = []; state.editing = false; state.sel = null;
  paint();
}

/* pour the operator's message into the loop. In the prototype this just moves
   the counters — the item lands in the target station and the intake clears. */
function sendInput(id) {
  const inp = inputById(id); if (!inp) return;
  const text = (state.intakeText || "").trim(); if (!text) return;
  inp.count = (inp.count || 0) + 1;
  const st = stateById(inp.to); if (st) st.count += 1;
  state.intakeText = "";
  toast(`Filed into ${st ? st.name : inp.to} · ${inp.name}`);
  paint();
}

function paintInputConsole(host) {
  const inp = inputById(state.inputOpen);
  if (!inp) { host.className = "ov-wrap"; host.innerHTML = ""; state.inputOpen = null; return; }
  const to = stateById(inp.to);
  const dest = esc(to ? to.name : inp.to);

  host.className = "ov-wrap open";
  host.style.right = "0px";
  host.innerHTML = `
    <div class="ov-card intake">
      <header class="ov-h">
        <span class="pr-k">${ICONS[inp.icon]}</span>
        <div class="ov-ht">
          <div class="ov-name">${esc(inp.name)}<span class="tagm sk">input</span></div>
          <div class="ov-file mono">feeds → ${dest} · ${esc(inp.sub)}</div>
        </div>
        <div class="seg ov-seg" id="inSeg">
          <button data-m="use" class="${state.inputEditing ? "" : "on"}">${ICONS.play}Use</button>
          <button data-m="edit" class="${state.inputEditing ? "on" : ""}">${ICONS.pencil}Program</button>
        </div>
        <button class="ico" id="inX" title="Close (Esc)">${ICONS.x}</button>
      </header>

      <div class="ov-b intake-b">
        ${state.inputEditing
          ? `<textarea class="ov-edit mono" id="inTa" spellcheck="false">${esc(inputProgram(inp))}</textarea>`
          : `<div class="intake-scroll">
              <div class="intake-lead">A little program you run to pour work into <b>${dest}</b>.
                Paste a report, describe it, or dictate — it lands as an item the loop will triage.</div>
              <div class="intake-field">
                <textarea id="intakeTa" placeholder="Describe what happened, paste a report, or dictate it…">${esc(state.intakeText)}</textarea>
                <div class="intake-bar">
                  <button class="intake-mic" id="intakeMic" title="Dictate">${ICONS.mic}</button>
                  <span class="intake-hint">${ICONS.sparkle}<span>AI structures it into ${dest}</span></span>
                  <button class="btn pri intake-send" id="intakeSend">${ICONS.play}Send in</button>
                </div>
              </div>
              <div class="intake-foot">Enter to send · Shift+Enter for a new line</div>
            </div>`}
      </div>
    </div>`;

  $("#inX").onclick = (e) => { e.stopPropagation(); closeEditor(); };
  $("#inSeg").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    state.inputEditing = b.dataset.m === "edit"; paintEditor();
    const t = $("#inTa") || $("#intakeTa"); if (t) t.focus();
  }));

  const eta = $("#inTa");
  if (eta) eta.oninput = () => { inp.prompt = eta.value; };

  const mta = $("#intakeTa");
  if (mta) {
    const grow = () => { mta.style.height = "auto"; mta.style.height = Math.min(240, mta.scrollHeight) + "px"; };
    mta.oninput = () => { state.intakeText = mta.value; grow(); };
    mta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInput(inp.id); } };
    grow(); mta.focus();
  }
  const mic = $("#intakeMic"); if (mic) mic.onclick = () => toast("Dictation is a stub in the prototype");
  const send = $("#intakeSend"); if (send) send.onclick = () => sendInput(inp.id);
}

function openDoc(path) {
  if (!DOCS[path]) return;
  const at = state.docStack.indexOf(path);
  if (at >= 0) state.docStack = state.docStack.slice(0, at + 1);   /* going back up the chain */
  else state.docStack.push(path);
  state.editing = false;
  paintPanels(); paintEditor(); paintToolbar();
}

function closeEditor(quiet) {
  if (!state.docStack.length && !state.inputOpen) return;
  state.docStack = []; state.editing = false;
  state.inputOpen = null; state.inputEditing = false;
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
