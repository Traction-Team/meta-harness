/* artifact.js: the artifact sheet (who is on it, how it scores, where it came
   from), the session sheet and settings. */

/* How a step links to the step before it, strongest first. See the History
   section of overview.md. A link by name only is a guess, and says so. */
const VIA = {
  note:    "Git note, from its fab run",
  trailer: "Commit trailer",
  link:    "Link in the artifact",
  diff:    "The PR changes the earlier artifact",
  key:     "Name match only, a guess",
  same:    "The same pull request, made ready",
  back:    "Back, because its later artifact was abandoned",
};

const scoresHtml = (fab, scores) => scores ? Object.entries(scores).map(([k, v]) =>
  `<span class="sca" title="${esc(fab.scorers[k]?.ask)}">${scoreRing([v], { size: 12, sw: 2.2 })}${esc(fab.scorers[k]?.title || k)} <b class="sca-v">${v.toFixed(1)}</b></span>`).join("") : "";

function trailHtml(fab, a) {
  const steps = [...(a.trail || [{ stage: a.stage, at: a.since, via: "found" }])].reverse();
  return `<div class="tr">${steps.map((t, i) => {
    const st = stageOf(fab, t.stage);
    const j = t.job && jobOf(fab, t.job);
    const ref = t.ref || (i === 0 ? a.ref : "");
    const sc = scoresHtml(fab, t.scores);
    const run = j ? `<div class="tr-run">${hzIcon(t.hz)}<span class="lnk" data-act="job" data-fab="${fab.id}" data-j="${j.name}">${esc(j.title)}</span><span class="dim">by ${esc(whoName(t.who))}</span></div>`
      : t.via === "found" ? `<div class="tr-run dim">Found by the stage filter. No fab run.</div>`
      : t.who ? `<div class="tr-run dim">By ${esc(whoName(t.who))}, outside fab. No fab run.</div>` : "";
    /* fan-in: the other parents of this step, each with its own scores */
    const also = (t.also || []).map((p) => `<div class="tr-also">
        <div class="tr-h"><span class="tr-fan">also from</span><b>${esc(p.title || refTitle(p.ref))}</b><span class="tr-at">${esc(stageOf(fab, p.stage)?.title || p.stage)}</span></div>
        <div class="tr-ref mono">${esc(p.ref)}</div>
        ${p.scores ? `<div class="tr-sc">${scoresHtml(fab, p.scores)}</div>` : ""}
      </div>`).join("");
    /* fan-out: what else the same step made, where each is now */
    const kids = (t.alsoMade || []).map((id) => artOf(fab, id)).filter(Boolean);
    const made = kids.length ? `<div class="tr-kids"><span class="tr-fan">also made</span>${kids.map((k) =>
        `<span class="tr-kid lnk" data-act="art" data-fab="${fab.id}" data-a="${k.id}" title="${esc(k.ref)}">${esc(k.title)} <span class="dim">· ${esc(stageOf(fab, k.stage).title)}</span></span>`).join("")}</div>` : "";
    const via = VIA[t.via] ? `<b>${VIA[t.via]}</b>${t.how ? ` · ${esc(t.how)}` : ""}` : "";
    return `<div class="tr-s ${i === 0 ? "cur" : ""} v-${t.via} ${t.abandoned ? "gone" : ""}">
      <span class="tr-dot"></span>
      <div class="tr-m">
        <div class="tr-h"><b>${esc(st?.title || t.stage)}</b>${t.abandoned ? `<span class="tr-tag">abandoned</span>` : ""}<span class="tr-at">${ago(t.at)} ago</span></div>
        ${t.title && t.title !== a.title ? `<div class="tr-t">${esc(t.title)}</div>` : ""}
        ${ref ? `<div class="tr-ref mono">${esc(ref)}</div>` : ""}
        ${run}
        ${sc ? `<div class="tr-sc">${sc}</div>` : ""}
        ${t.note ? `<div class="tr-note">${esc(t.note)}</div>` : ""}
        ${made}
        ${also}
        ${via ? `<div class="tr-via">${via}</div>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;
}

function artSheet(sh) {
  const fab = fabById(sh.fab);
  const a = artOf(fab, sh.a);
  const st = stageOf(fab, a.stage);
  const kind = KINDS[st.kind];
  const ags = agentsOn(fab, a);

  /* agents, by whose machine they run on */
  const groups = {};
  ags.forEach((s) => (groups[s.who] ||= []).push(s));
  const agentsH = ags.length
    ? Object.entries(groups).map(([w, ss]) => `
        <div class="who-h">${personDot(w)}<b>${w === ME ? "You" : esc(PEOPLE[w].name)}</b>
          <span class="dim">${ss.length} agent${ss.length > 1 ? "s" : ""}${w !== ME ? " · synced" : ""}</span></div>
        <div class="mini">${ss.map((s) => agentHtml(s, "job")).join("")}</div>`).join("")
    : `<div class="none">No agents on it.</div>`;
  const w = workOn(fab, a);
  const claimH = !a.claim ? ""
    : w === "stalled" ? `<div class="claim stall">${ICONS.warn}<span><b>Stalled.</b> ${esc(whoName(a.claim.who) === "you" ? "You" : whoName(a.claim.who))} claimed it ${ago(a.claim.at)} ago with <span class="mono">${esc(a.claim.ref)}</span>, and no agent is on it now. Resume the build on that branch, or release the claim so someone else can take it.</span></div>`
    : `<div class="claim">${ICONS.hand}<span>Claimed by <span class="mono">${esc(a.claim.ref)}</span> · ${esc(whoName(a.claim.who))} · ${ago(a.claim.at)} ago. It stays in ${esc(st.title)} until the PR is ready.</span></div>`;

  /* scores: this stage's scorers first, then older ones, dimmed */
  const keys = [...new Set([...(st.scoredBy || []).filter((k) => a.scores?.[k] != null), ...Object.keys(a.scores || {})])];
  const hereVals = (st.scoredBy || []).map((k) => a.scores?.[k]).filter((v) => v != null);
  const scoresH = keys.length ? `<div class="sc-sum">${scoreRing(hereVals, { size: 44, sw: 4.5, label: true, title: "Total for this stage" })}
    <span class="sc-sum-t">${hereVals.length ? `${hereVals.length > 1 ? `${hereVals.length} scorers, added up` : "One scorer"}` : "No score for this stage yet"}</span></div>
    <div class="kv">${keys.map((k) => {
    const v = a.scores[k];
    const here = (st.scoredBy || []).includes(k);
    return `<div class="sc-r ${here ? "" : "old"}" title="${esc(fab.scorers[k].ask)}">
      <span class="sc-k">${esc(fab.scorers[k].title)}</span>
      ${scoreRing([v], { size: 16, sw: 2.6 })}<span class="sc-v ${scCls(v)}">${v.toFixed(1)}</span></div>`;
  }).join("")}</div>` : `<div class="none">${(st.scoredBy || []).length ? "Not scored yet." : `No scorers on ${esc(st.title)}.`}</div>`;

  const nx = st.next && jobOf(fab, st.next);
  const body = `
    <div class="hero">
      <span class="go-ic art">${ICONS[kind.icon]}</span>
      <div style="min-width:0"><div class="hero-t">${esc(a.title)}</div>
        <div class="hero-s">${esc(st.title)} · ${ago(a.since)} here${a.who ? ` · from ${esc(whoName(a.who))}` : ""}</div></div>
    </div>
    <div class="refbox mono" data-act="openref" data-fab="${fab.id}" data-a="${a.id}">${esc(a.ref)}</div>
    <div class="lbl">On it now</div>
    ${w === "stalled" ? "" : agentsH}
    ${claimH}
    <div class="lbl">Scores</div>
    ${scoresH}
    <div class="lbl">History <span class="lbl-s">newest first · each step keeps its own scores</span></div>
    ${trailHtml(fab, a)}`;
  const stalled = w === "stalled";
  const foot = `<button class="btn ghost" data-act="openref" data-fab="${fab.id}" data-a="${a.id}">Open</button><span class="sp"></span>
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
