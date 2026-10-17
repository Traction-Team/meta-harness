/* work.js: the Work tab (stages, as bars of artifacts) and the Jobs tab. */

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
  const w = worst(fab, a);
  const ags = agentsOn(fab, a);
  const t = `${a.title} · ${ago(a.since)} here${ags.length ? ` · ${ags.length} agent${ags.length > 1 ? "s" : ""}` : ""}${w != null ? ` · worst score ${w.toFixed(1)}` : ""}`;
  return `<i class="cb ${st} ${w != null && w < 5 ? "lo" : ""}" data-act="art" data-fab="${fab.id}" data-a="${a.id}" title="${esc(t)}"></i>`;
}
const pendingCube = (s) =>
  `<i class="cb make ${s.state === "waits" ? "wait" : ""}" data-act="session" data-sid="${s.id}" title="${esc(`Being made: ${s.label}`)}"></i>`;

function stageHtml(fab, st) {
  const arts = artsIn(fab, st.id);
  const making = makingIn(fab, st.id);
  const open = state.expanded.has(`${fab.id}:${st.id}`);
  const slow = st.slow ? arts.filter((a) => now() - a.since > st.slow * 60000) : [];
  const cap = 14;
  const cubes = [...making.map(pendingCube), ...arts.map((a) => cube(fab, a))];
  const bar = cubes.slice(0, cap).join("") + (cubes.length > cap ? `<span class="cb-more">+${cubes.length - cap}</span>` : "");
  const sub = st.done ? "last 7 days"
    : slow.length ? `${slow.length} over ${dur(st.slow)}`
    : arts.length ? `oldest ${ago(arts[0].since)}` : making.length ? "being made" : "empty";
  const nx = st.next && jobOf(fab, st.next);
  const go = nx
    ? `<button class="st-go" data-act="stgo" data-fab="${fab.id}" data-s="${st.id}" title="Run ${esc(nx.title)}${st.waitsFor ? `, then the ${esc(st.waitsFor)} approves` : ""}">${ICONS.play}</button>`
    : `<span class="st-go none"></span>`;
  return `<div class="st ${open ? "open" : ""} ${slow.length ? "slow" : ""} ${st.done ? "done" : ""}" data-act="sttoggle" data-fab="${fab.id}" data-s="${st.id}">
    <div class="st-h">
      <span class="st-chev">${ICONS.chevR}</span>
      <div class="st-m"><span class="st-t">${esc(st.title)}</span><span class="st-s">${sub}</span></div>
      <div class="st-bar"><span class="st-n">${arts.length}</span>${bar}</div>
      ${go}
    </div>
    ${open ? stageDetail(fab, st, arts, making) : ""}
  </div>`;
}

function stageDetail(fab, st, arts, making) {
  const avgs = (st.scoredBy || []).map((k) => {
    const v = avgScore(arts, k);
    return v == null ? "" : `<span class="sca" title="${esc(fab.scorers[k].ask)}">${esc(fab.scorers[k].title)} ${scoreChip(v)}</span>`;
  }).join("");
  const nx = st.next && jobOf(fab, st.next);
  return `<div class="st-d">
    <div class="st-src" title="A stage is a filter. Anything it matches shows here, made by fab or not.">
      ${ICONS.filter}<span class="mono">${esc(st.find)}</span><span class="dim">where</span><span class="mono">${esc(st.where)}</span></div>
    ${avgs ? `<div class="st-q"><span class="dim">avg</span>${avgs}</div>` : ""}
    ${nx || st.waitsFor ? `<div class="st-w">${nx ? `<span>Next: <span class="lnk" data-act="job" data-fab="${fab.id}" data-j="${nx.name}">${esc(nx.title)}</span></span>` : ""}${st.waitsFor ? `<span>${ICONS.hand}${esc(st.waitsFor)} approves</span>` : ""}</div>` : ""}
    <div class="its">${making.map(makingItem).join("")}${arts.map((a) => itemHtml(fab, a)).join("")}</div>
    ${!arts.length && !making.length ? `<div class="st-empty">Nothing matches</div>` : ""}
  </div>`;
}

function itemHtml(fab, a) {
  const ags = agentsOn(fab, a);
  const w = worst(fab, a);
  return `<div class="it" data-act="art" data-fab="${fab.id}" data-a="${a.id}" title="${esc(a.ref)}">
    <i class="cb ${cubeState(fab, a)} ${w != null && w < 5 ? "lo" : ""}"></i>
    <span class="it-t">${esc(a.title)}</span>
    ${ags.length ? agentStack(ags, 4) : ""}
    ${w != null ? scoreChip(w, "Worst score in this stage") : ""}
    <span class="it-age" data-since="${a.since}">${ago(a.since)}</span>
  </div>`;
}

const makingItem = (s) => `<div class="it making" data-act="session" data-sid="${s.id}">
    <i class="cb make ${s.state === "waits" ? "wait" : ""}"></i>
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
  const loose = looseIn(fab).sort(byRank);
  if (loose.length) {
    h += `<div class="sec"><span class="sec-t">Not on any work</span><span class="sec-n">${loose.length}</span></div>`;
    h += `<div class="mini">${loose.map((s) => agentHtml(s)).join("")}</div>`;
  }
  h += `<div class="legend">
    <span><i class="cb"></i>waiting</span><span><i class="cb run"></i>agent on it</span>
    <span><i class="cb wait"></i>needs a person</span><span><i class="cb lo"></i>low score</span><span><i class="cb make"></i>being made</span></div>`;
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
  const n = artsIn(fab, j.from).length;
  const ss = live(fab.id).filter((s) => s.job === j.name).sort(byRank);
  return `<button class="go" data-act="start" data-fab="${fab.id}" data-j="${j.name}" data-e="">
    <span class="go-ic ${j.icon}">${ICONS[j.icon] || ICONS.start}</span>
    <span class="go-m"><span class="go-t">${esc(j.title)}</span>
      <span class="go-d">${esc(from.title)} <span class="arr">→</span> ${esc(to.title)}</span></span>
    ${ss.length ? agentStack(ss, 3) : ""}
    <span class="go-n" title="${n} in ${esc(from.title)}">${n}</span>
    <span class="go-i" data-act="job" data-fab="${fab.id}" data-j="${j.name}" title="About ${esc(j.title)}">${ICONS.info}</span>
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
