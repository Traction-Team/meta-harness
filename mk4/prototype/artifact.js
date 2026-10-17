/* artifact.js: the artifact sheet (who is on it, how it scores, where it came
   from), the session sheet and settings. */

const scoresHtml = (fab, scores) => scores ? Object.entries(scores).map(([k, v]) =>
  `<span class="sca" title="${esc(fab.scorers[k]?.ask)}">${scoreRing([v], { size: 12, sw: 2.2 })}${esc(fab.scorers[k]?.title || k)} <b class="sca-v">${v.toFixed(1)}</b></span>`).join("") : "";

/* What a run cost: tokens, an estimated price and how long it ran. A step can
   carry its own `tokens` and `min`; otherwise they are made up from the job
   and the step, so the same step always shows the same numbers. Price is a
   blended rate per million tokens, by harness. */
const RATE = { "claude-code": 6, codex: 4, orca: 5, cursor: 5 };
function runStats(t) {
  let h = 2166136261;
  for (const c of `${t.job}|${t.stage}|${t.ref}|${t.ago ?? t.at}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const r = (h % 1000) / 1000;
  const min = t.min ?? Math.round(6 + r * 48);
  const tokens = t.tokens ?? Math.round(min * (14 + r * 10)) * 1000;
  const cost = (tokens / 1e6) * (RATE[t.hz] ?? 5);
  const tk = tokens >= 1e6 ? `${(tokens / 1e6).toFixed(1)}M` : `${Math.round(tokens / 1000)}k`;
  const dur = min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
  return `<div class="tr-cost">${tk} tokens · ~$${cost.toFixed(2)} · ${dur}</div>`;
}

/* History, newest at the top, on one wire: each artifact state is a cube, and
   between two cubes sits the agent (or person) that turned the lower one into
   the upper. */
function trailHtml(fab, a) {
  const steps = [...(a.trail || [{ stage: a.stage, at: a.since, via: "found" }])].reverse();
  return `<div class="tr">${steps.map((t, i) => {
    const st = stageOf(fab, t.stage);
    const j = t.job && jobOf(fab, t.job);
    const ref = t.ref || (i === 0 ? a.ref : "");
    const sc = scoresHtml(fab, t.scores);
    const last = i === steps.length - 1;
    /* fan-out: what else the same run made, where each is now */
    const kids = (t.alsoMade || []).map((id) => artOf(fab, id)).filter(Boolean);
    const made = kids.length ? `<div class="tr-kids"><span class="tr-fan">also made</span>${kids.map((k) =>
        `<span class="tr-kid lnk" data-act="art" data-fab="${fab.id}" data-a="${k.id}" title="${esc(k.ref)}">${esc(k.title)} <span class="dim">· ${esc(stageOf(fab, k.stage).title)}</span></span>`).join("")}</div>` : "";
    const runIc = j ? hzIcon(t.hz) : t.who && t.via !== "found" ? personDot(t.who) : "";
    const runTx = j ? `<span class="lnk" data-act="job" data-fab="${fab.id}" data-j="${j.name}">${esc(j.title)}</span><span class="dim">by ${esc(whoName(t.who))}</span>`
      : runIc ? `<span class="dim">By ${esc(whoName(t.who))}</span>` : "";
    const run = last ? "" : `<div class="tr-run ${runIc ? "" : "bare"}">
        <span class="tr-node">${runIc}</span><div class="tr-run-m">${runTx ? `<div class="tr-run-t">${runTx}</div>` : ""}${j ? runStats(t) : ""}${made}</div></div>`;
    /* fan-in: the other parents of this step, each with its own scores */
    const also = (t.also || []).map((p) => `<div class="tr-also">
        <div class="tr-h"><span class="tr-fan">also from</span><b>${esc(p.title || refTitle(p.ref))}</b><span class="tr-at">${esc(stageOf(fab, p.stage)?.title || p.stage)}</span></div>
        <div class="tr-ref mono">${esc(p.ref)}</div>
        ${p.scores ? `<div class="tr-sc">${scoresHtml(fab, p.scores)}</div>` : ""}
      </div>`).join("");
    const cube = i === 0 ? artGlyph(fab, a) : `<i class="ga-cube">${CUBE_SVG}</i>`;
    return `<div class="tr-a ${i === 0 ? "cur" : ""} v-${t.via} ${t.abandoned ? "gone" : ""}">
      <span class="tr-node">${cube}</span><div class="tr-m">
        <div class="tr-h"><b>${esc(st?.title || t.stage)}</b>${t.abandoned ? `<span class="tr-tag">abandoned</span>` : ""}<span class="tr-at">${ago(t.at)} ago</span></div>
        ${t.title && t.title !== a.title ? `<div class="tr-t">${esc(t.title)}</div>` : ""}
        ${ref ? `<div class="tr-ref mono">${esc(ref)}</div>` : ""}
        ${sc ? `<div class="tr-sc">${sc}</div>` : ""}
        ${t.note ? `<div class="tr-note">${esc(t.note)}</div>` : ""}
        ${also}
      </div></div>${run}`;
  }).join("")}</div>`;
}

function artSheet(sh) {
  const fab = fabById(sh.fab);
  const a = artOf(fab, sh.a);
  const st = stageOf(fab, a.stage);
  const kind = KINDS[st.kind];
  const ags = agentsOn(fab, a);

  /* agents: one flat list; a teammate's name rides on the agent's own line */
  const w = workOn(fab, a);
  const agentsH = ags.length
    ? `<div class="mini">${ags.map((s) => agentHtml(s, "job")).join("")}</div>`
    : w === "stalled"
      ? `<div class="claim stall">${ICONS.warn}<span><b>Stalled</b> · <span class="mono">${esc(a.claim.ref)}</span></span></div>`
      : `<div class="none">No agents.</div>`;

  /* scores: this stage's scorers first, then older ones, dimmed */
  const keys = [...new Set([...(st.scoredBy || []).filter((k) => a.scores?.[k] != null), ...Object.keys(a.scores || {})])];
  const hereVals = (st.scoredBy || []).map((k) => a.scores?.[k]).filter((v) => v != null);
  const scoresH = keys.length ? `<div class="kv">${keys.map((k) => {
    const v = a.scores[k];
    const here = (st.scoredBy || []).includes(k);
    return `<div class="sc-r ${here ? "" : "old"}" title="${esc(fab.scorers[k].ask)}">
      <span class="sc-k">${esc(fab.scorers[k].title)}</span>
      ${scoreRing([v], { size: 16, sw: 2.6 })}<span class="sc-v ${scCls(v)}">${v.toFixed(1)}</span></div>`;
  }).join("")}</div>` : `<div class="none">${(st.scoredBy || []).length ? "Not scored yet." : `No scorers on ${esc(st.title)}.`}</div>`;

  const nx = st.next && jobOf(fab, st.next);
  const body = `
    <div class="hero art-hero">
      <span class="art-tile">${artGlyph(fab, a)}</span>
      <div class="art-hd">
        <div class="hero-t">${esc(a.title)}</div>
        <button class="art-ref" data-act="openref" data-fab="${fab.id}" data-a="${a.id}" title="Open ${esc(kind.one)}">
          ${ICONS[kind.icon]}<span class="mono">${esc(a.ref)}<span class="art-ext">${ICONS.ext}</span></span></button>
      </div>
      ${hereVals.length ? scoreRing(hereVals, { size: 44, sw: 4.5, label: true, title: "Average for this stage" }) : ""}
    </div>
    <div class="lbl">Agents</div>
    ${agentsH}
    <div class="lbl">Scores</div>
    ${scoresH}
    <div class="lbl">History</div>
    ${trailHtml(fab, a)}`;
  const stalled = w === "stalled";
  const foot = `<span class="sp"></span>
    ${stalled ? `<button class="btn ghost" data-act="release" data-fab="${fab.id}" data-a="${a.id}">Release</button>` : ""}
    ${nx ? `<button class="btn pri" data-act="start" data-fab="${fab.id}" data-j="${nx.name}" data-e="" data-a="${a.id}">${ICONS.play}${stalled ? "Resume" : esc(nx.title)}</button>` : ""}`;
  return { body, foot };
}

/* ── a session: where it is, what it is on, and how the monitor knows ── */

function sessionSheet(sh) {
  const s = SESSIONS.find((x) => x.id === sh.sid) || sh.snapshot;
  const fab = fabById(s.fab);
  const j = s.job ? jobOf(fab, s.job) : null;
  const a = s.art ? artOf(fab, s.art) : null;
  const hz = hzById(s.harness);
  const stTxt = { waits: "Waits for a person", working: "Working", idle: "Idle", unknown: "Unknown", starting: "Starting" }[s.state];
  const kv = [
    ["Job", j ? `<span class="lnk" data-act="job" data-fab="${fab.id}" data-j="${j.name}">${esc(j.title)}</span>` : `<span class="dim">Unknown</span>`],
    ["On", a ? `<span class="lnk" data-act="art" data-fab="${fab.id}" data-a="${a.id}">${esc(a.title)}</span>` : s.makes ? `New in ${esc(stageOf(fab, s.makes).title)}` : `<span class="dim">Nothing fab can see</span>`],
    ["Whose", s.who === ME ? "Yours, this Mac" : `${esc(PEOPLE[s.who].name)} <span class="dim">· synced</span>`],
    ["Harness", esc(hz.label)],
    ["Running", `<span data-since="${s.startedAt}">${ago(s.startedAt)}</span>`],
    ["Branch", `<span class="mono">${esc(s.branch)}</span>`],
    ["Worktree", `<span class="mono">${esc(s.worktree)}</span>`],
    ["Match", esc(s.match[0].toUpperCase() + s.match.slice(1))],
  ];
  if (s.run) kv.push(["Run", `<span class="lnk mono" data-act="openfile" data-path="~/.fab/runs/${esc(s.run)}.json">${esc(s.run)}</span>`]);
  const body = `
    <div class="hero" style="margin-bottom:12px">${hzIcon(s.harness, s)}<div style="min-width:0">
      <div class="hero-t">${esc(s.label)}</div>
      <div class="hero-s"><span class="dot ${s.state}"></span>${stTxt}</div>
    </div></div>
    ${s.state === "waits" && s.asks ? `<div class="quote">${esc(s.asks)}</div>` : s.first ? `<div class="quote">“${esc(s.first)}”</div>` : ""}
    <div class="kv">${kv.map(([k, v]) => `<div class="kv-r"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`).join("")}</div>`;
  const can = s.who === ME && hz.can.focus;
  const foot = `<span class="sp"></span><button class="btn pri" data-act="focus" data-sid="${s.id}" ${can ? "" : "disabled"}>${s.who === ME ? "Go to Session" : `On ${esc(PEOPLE[s.who].name)}'s Mac`}</button>`;
  return { body, foot };
}

/* ── settings ── */

function settingsSheet() {
  const st = state.settings;
  const tgl = (k) => `<button class="tgl ${st[k] ? "on" : ""}" data-act="toggle" data-k="${k}"></button>`;
  const body = `
    <div class="kv">
      <div class="set-r"><span>Default harness</span><span class="sp"></span>
        <select class="inp" data-set="harness" style="width:auto">${HARNESSES.map((h) => `<option value="${h.id}" ${st.harness === h.id ? "selected" : ""} ${h.ok ? "" : "disabled"}>${esc(h.label)}</option>`).join("")}</select></div>
      <div class="set-r"><span>Terminal</span><span class="sp"></span>
        <select class="inp" data-set="terminal" style="width:auto">${TERMINALS.map((t) => `<option ${st.terminal === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="set-r"><span>Appearance</span><span class="sp"></span>
        <div class="seg sm" style="width:156px">${["system", "light", "dark"].map((t) => `<button class="${st.theme === t ? "on" : ""}" data-act="theme" data-id="${t}">${t === "system" ? "Auto" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
    </div>
    <div class="lbl">Notifications</div>
    <div class="kv">
      <div class="set-r"><span>When an agent waits</span><span class="sp"></span>${tgl("notify")}</div>
      <div class="set-r"><span>Launch at login</span><span class="sp"></span>${tgl("login")}</div>
    </div>
    <div class="lbl">Team <span class="lbl-s">preview</span></div>
    <div class="kv">
      <div class="set-r"><span>Show teammates' agents</span><span class="sp"></span>${tgl("team")}</div>
    </div>
    <div class="lbl">Fabs</div>
    <div class="kv">${FABS.map((f) => `<div class="fabrow">${ICONS.folder}${esc(f.name)}<span class="mono">${esc(f.path)}</span></div>`).join("")}
      <div class="fabrow"><button class="lnk" data-act="addfab">Add Folder…</button></div></div>`;
  return { title: "Settings", body };
}
