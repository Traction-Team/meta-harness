/* work.js: the Pipeline tab (stages, as bars of artifacts) and the Jobs tab. */

/* ─────────────────────────────────────────────────────────── agents ──
   A running session is an agent: its harness tile and its name. Click to
   bring it to front; the chevron opens its details. `mode: "job"` names
   the job instead of the session, for lists that already name the work. */

function agentHtml(s, mode) {
  const fab = fabById(s.fab);
  const j = s.job ? jobOf(fab, s.job) : null;
  const main = mode === "job" ? (j ? j.title : "No job") : s.label;
  const sub = mode === "job" ? `${s.who === ME ? "" : PEOPLE[s.who].name + " · "}${hzById(s.harness).label}` : j ? j.title : "";
  return `<div class="ag r-${s.state} ${s.who !== ME ? "team" : ""}" data-act="focus" data-sid="${s.id}">
    ${hzIcon(s.harness, s)}
    <span class="ag-l">${esc(main)}${sub ? `<span class="ag-s">${esc(sub)}</span>` : ""}</span>
    ${s.state === "waits" ? `<span class="ag-w">waits</span>` : ""}
    <span class="ag-age" data-since="${s.startedAt}">${ago(s.startedAt)}</span>
    <button class="ag-i" data-act="session" data-sid="${s.id}" title="Details">${ICONS.chevR}</button>
  </div>`;
}

/* the collapsed form: one tile per agent, at most five, then a count */
function agentStack(ss, max = 5) {
  if (!ss.length) return "";
  const shown = ss.slice(0, max);
  return `<span class="ags">${shown.map((s) => hzIcon(s.harness, s)).join("")}${ss.length > max ? `<span class="ags-more">+${ss.length - max}</span>` : ""}</span>`;
}

/* ──────────────────────────────────────────────────────────────── Work ──
   One row per stage, in flow order. A row is a small horizontal bar: one
   cube per artifact the stage's filter finds, so a pile-up is seen before it
   is read. The ▶ runs the job that moves work out of the stage. */

function cube(fab, a) {
  const st = cubeState(fab, a);
  const ags = agentsOn(fab, a);
  const t = `${a.title} · ${ago(a.since)} here${ags.length ? ` · ${ags.length} agent${ags.length > 1 ? "s" : ""} on it` : ""}`;
  return `<span class="gl ${st}" data-act="art" data-fab="${fab.id}" data-a="${a.id}" title="${esc(t)}">${artGlyph(fab, a)}</span>`;
}
const pendingCube = (s) =>
  `<span class="gl" data-act="session" data-sid="${s.id}" title="${esc(`Being made: ${s.label}`)}">${makingGlyph(s)}</span>`;

/* A stage's artifacts: the ones that wait for a job, then the ones an agent
   is on. Work in progress stays in the stage it came from; it is not a stage. */
function splitArts(fab, arts) {
  return { waiting: arts.filter((a) => !inProgress(fab, a)), on: arts.filter((a) => inProgress(fab, a)) };
}

function stageHtml(fab, st) {
  const arts = artsIn(fab, st.id);
  const { waiting, on } = splitArts(fab, arts);
  const making = makingIn(fab, st.id);
  const open = state.expanded.has(`${fab.id}:${st.id}`);
  /* only waiting counts as slow: time with an agent on it is not time lost */
  const slow = st.slow ? waiting.filter((a) => now() - a.since > st.slow * 60000) : [];
  const cap = 14;
  /* waiting on the left, in progress on the right, a thin line between */
  const left = waiting.map((a) => cube(fab, a));
  const right = [...on.map((a) => cube(fab, a)), ...making.map(pendingCube)];
  const cubes = [...left, ...(left.length && right.length ? [`<span class="gl-gap"></span>`] : []), ...right];
  const bar = cubes.slice(0, cap + 1).join("") + (cubes.length > cap + 1 ? `<span class="gl-more">+${cubes.length - cap - 1}</span>` : "");
  const sub = st.done ? "last 7 days"
    : slow.length ? `${slow.length} over ${dur(st.slow)}`
    : waiting.length ? `oldest ${ago(waiting[0].since)}` : right.length ? "all in progress" : "empty";
  return `<div class="st ${open ? "open" : ""} ${slow.length ? "slow" : ""} ${st.done ? "done" : ""}" data-act="sttoggle" data-fab="${fab.id}" data-s="${st.id}">
    <div class="st-h">
      <span class="st-chev">${ICONS.chevR}</span>
      <div class="st-m"><span class="st-t">${esc(st.title)}</span><span class="st-s">${sub}</span></div>
      <div class="st-bar"><span class="st-n">${arts.length + making.length}</span>${bar}</div>
    </div>
    ${open ? stageDetail(fab, st, arts, making) : ""}
  </div>`;
}

function stageDetail(fab, st, arts, making) {
  const nx = st.next && jobOf(fab, st.next);
  const { waiting, on } = splitArts(fab, arts);
  return `<div class="st-d">
    <div class="st-src" title="A stage is a filter. Anything it matches shows here, made by fab or not.">
      ${ICONS.filter}<span class="mono">${esc(st.find)}</span><span class="dim">where</span><span class="mono">${esc(st.where)}</span></div>
    <div class="its">${[...waiting, ...on].map((a) => itemHtml(fab, a)).join("")}${making.map(makingItem).join("")}</div>
    ${!arts.length && !making.length ? `<div class="st-empty">Nothing matches</div>` : ""}
    ${hiddenHtml(fab, st)}
    ${nx ? `<button class="st-next" data-act="stgo" data-fab="${fab.id}" data-s="${st.id}" title="Run ${esc(nx.title)} (⌥-click to choose the harness)">
      <span class="st-go">${ICONS.play}</span><span class="st-next-t">${esc(nx.title)}</span></button>` : ""}
  </div>`;
}

/* on hover, a row with no agent offers its stage's next job, on this artifact */
function runBtn(fab, a) {
  const st = stageOf(fab, a.stage);
  const nx = st.next && jobOf(fab, st.next);
  if (!nx) return "";
  return `<button class="it-run" data-act="start" data-fab="${fab.id}" data-j="${nx.name}" data-e="" data-a="${a.id}" title="Run ${esc(nx.title)} on ${esc(a.title)} (⌥-click to choose the harness)">${ICONS.play}</button>`;
}

function itemHtml(fab, a) {
  const ags = agentsOn(fab, a);
  const sc = stageScores(fab, a);
  return `<div class="it" data-act="art" data-fab="${fab.id}" data-a="${a.id}" title="${esc(a.ref)}">
    <span class="gl">${artGlyph(fab, a)}</span>
    <span class="it-t">${esc(a.title)}</span>
    ${ags.length ? agentStack(ags, 4) : workOn(fab, a) === "held" ? personDot(a.claim.who) : runBtn(fab, a)}
    ${sc.vals.length ? scoreRing(sc.vals, { size: 16, sw: 2.4, title: sc.title }) : ""}
    <span class="it-age" data-since="${a.since}">${ago(a.since)}</span>
  </div>`;
}

/* What the filter also matched, but history hid because the work moved on.
   Folded by default: the stage shows each piece of work once, at its newest
   artifact. A row opens the artifact that hides it. */
function hiddenHtml(fab, st) {
  const hid = hiddenIn(fab, st.id);
  if (!hid.length) return "";
  const k = `${fab.id}:${st.id}`;
  const open = state.hidOpen.has(k);
  const rows = open ? `<div class="its hid">${hid.map((h) => {
    const by = h.by[0];
    const to = h.by.length > 1 ? `${h.by.length} later` : stageOf(fab, by.stage).title;
    const t = `${h.ref}\nHidden by ${h.by.map((b) => `${b.title} (${stageOf(fab, b.stage).title})`).join(", ")}`;
    return `<div class="it hid" data-act="art" data-fab="${fab.id}" data-a="${by.id}" title="${esc(t)}">
      <span class="gl"><i class="ga-cube ghost">${CUBE_SVG}</i></span>
      <span class="it-t">${esc(h.title)}</span>
      <span class="it-by">→ ${esc(to)}</span>
    </div>`;
  }).join("")}</div>` : "";
  return `<button class="st-hid ${open ? "open" : ""}" data-act="hidtoggle" data-fab="${fab.id}" data-s="${st.id}"
      title="The filter also matches these. Each has a later artifact in its history, so it shows there instead.">
      <span class="st-chev">${ICONS.chevR}</span>${hid.length} hidden (linked history)</button>${rows}`;
}

const makingItem = (s) => `<div class="it making" data-act="session" data-sid="${s.id}">
    <span class="gl">${makingGlyph(s)}</span>
    <span class="it-t">${esc(s.label)}</span>
    ${agentStack([s])}
    <span class="it-age">being made</span>
  </div>`;

function workHtml() {
  if (state.fab === "all") {
    return `<div class="fab-list">${FABS.map((f) => {
      const inFlight = f.artifacts.filter((a) => !stageOf(f, a.stage).done).length;
      const ss = live(f.id).sort(byRank);
      return `<button class="go" data-act="fab" data-id="${f.id}" data-then="work">
          <span class="fab-av">${ICONS.folder}</span>
          <span class="go-m"><span class="go-t">${esc(f.name)}</span>
            <span class="go-d">${inFlight} in flight · ${ss.length} agent${ss.length === 1 ? "" : "s"}</span>
            ${ss.length ? agentStack(ss, 8) : ""}</span>
          <span class="go-run">${ICONS.chevR}</span></button>`;
    }).join("")}</div>`;
  }
  const fab = fabById(state.fab);
  const inFlight = fab.artifacts.filter((a) => !stageOf(fab, a.stage).done).length;
  const onWork = live(fab.id).filter((s) => s.art || s.makes);
  const team = onWork.filter((s) => s.who !== ME).length;
  let h = `<div class="wk-sum"><span><b>${inFlight}</b> in flight</span><span><b>${onWork.length}</b> agents on it${team ? ` · ${team} teammates'` : ""}</span></div>`;
  h += `<div class="stages">${fab.stages.map((st) => stageHtml(fab, st)).join("")}</div>`;
  return h;
}

/* ──────────────────────────────────────────────────────────────── Jobs ──
   Everything the fab can have an agent do. Jobs that start new work first,
   then the jobs that move work from one stage to the next. */

function goHtml(st) {
  return `<button class="go" data-act="start" data-fab="${st.fab}" data-j="${st.job}" data-e="${st.entry ?? ""}">
    <span class="go-ic ${st.icon}">${ICONS[st.icon] || ICONS.start}</span>
    <span class="go-m"><span class="go-t">${esc(st.title)}</span><span class="go-d">${esc(st.blurb)}</span></span>
    <span class="go-run">${ICONS.play}</span>
  </button>`;
}

function moveHtml(fab, j) {
  const from = stageOf(fab, j.from);
  const to = stageOf(fab, j.to);
  const n = artsIn(fab, j.from).filter((a) => !workOn(fab, a)).length;
  const ss = live(fab.id).filter((s) => s.job === j.name).sort(byRank);
  return `<button class="go" data-act="job" data-fab="${fab.id}" data-j="${j.name}" title="About ${esc(j.title)}">
    <span class="go-ic ${j.icon}">${ICONS[j.icon] || ICONS.start}</span>
    <span class="go-m"><span class="go-t">${esc(j.title)}</span>
      <span class="go-d">${esc(from.title)} <span class="arr">→</span> ${esc(to.title)}</span></span>
    ${ss.length ? agentStack(ss, 3) : ""}
    <span class="go-n" title="${n} waiting in ${esc(from.title)}, with nobody on them">${n}</span>
    <span class="go-run">${ICONS.chevR}</span>
  </button>`;
}

function jobsHtml() {
  const all = state.fab === "all";
  let h = "";
  for (const f of visibleFabs()) {
    if (all) h += `<div class="sec fab"><span class="sec-t">${esc(f.name)}</span></div>`;
    h += `<div class="sec"><span class="sec-t">Start something</span></div>`;
    h += `<div class="starts">${startsOf(f).map(goHtml).join("")}</div>`;
    const moves = f.jobs.filter((j) => j.from)
      .sort((a, b) => f.stages.findIndex((s) => s.id === a.from) - f.stages.findIndex((s) => s.id === b.from));
    h += `<div class="sec"><span class="sec-t">Move work along</span></div>`;
    h += `<div class="starts">${moves.map((j) => moveHtml(f, j)).join("")}</div>`;
  }
  return h;
}
