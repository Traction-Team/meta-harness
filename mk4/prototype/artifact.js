/* artifact.js: the artifact sheet (who is on it, how it scores, where it came
   from), the session sheet and settings. */

const VIA = {
  run:    "linked by its run record",
  branch: "linked by branch name",
  link:   "linked: the plan names it",
};

function trailHtml(fab, a) {
  const steps = [...(a.trail || [{ stage: a.stage, at: a.since, via: "found" }])].reverse();
  return `<div class="tr">${steps.map((t, i) => {
    const st = stageOf(fab, t.stage);
    const j = t.job && jobOf(fab, t.job);
    const ref = t.ref || (i === 0 ? a.ref : "");
    const sc = t.scores ? Object.entries(t.scores).map(([k, v]) => `<span class="sca" title="${esc(fab.scorers[k]?.ask)}">${esc(fab.scorers[k]?.title || k)} ${scoreChip(v)}</span>`).join("") : "";
    return `<div class="tr-s ${i === 0 ? "cur" : ""} ${t.via}">
      <span class="tr-dot"></span>
      <div class="tr-m">
        <div class="tr-h"><b>${esc(st?.title || t.stage)}</b><span class="tr-at">${ago(t.at)} ago</span></div>
        ${t.title && t.title !== a.title ? `<div class="tr-t">${esc(t.title)}</div>` : ""}
        ${ref ? `<div class="tr-ref mono">${esc(ref)}</div>` : ""}
        ${j ? `<div class="tr-run">${hzIcon(t.hz)}<span class="lnk" data-act="job" data-fab="${fab.id}" data-j="${j.name}">${esc(j.title)}</span><span class="dim">by ${esc(whoName(t.who))}</span></div>`
          : t.via === "found" ? `<div class="tr-run dim">Found by the stage filter. No fab run.</div>` : ""}
        ${sc ? `<div class="tr-sc">${sc}</div>` : ""}
        ${t.note ? `<div class="tr-note">${esc(t.note)}</div>` : ""}
        ${VIA[t.via] ? `<div class="tr-via">${VIA[t.via]}</div>` : ""}
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

  /* scores: this stage's scorers first, then older ones, dimmed */
  const keys = [...new Set([...(st.scoredBy || []).filter((k) => a.scores?.[k] != null), ...Object.keys(a.scores || {})])];
  const scoresH = keys.length ? `<div class="kv">${keys.map((k) => {
    const v = a.scores[k];
    const here = (st.scoredBy || []).includes(k);
    return `<div class="sc-r ${here ? "" : "old"}" title="${esc(fab.scorers[k].ask)}">
      <span class="sc-k">${esc(fab.scorers[k].title)}</span>
      <span class="sc-bar"><i class="${scCls(v)}" style="width:${v * 10}%"></i></span>${scoreChip(v)}</div>`;
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
    ${agentsH}
    <div class="lbl">Scores</div>
    ${scoresH}
    <div class="lbl">History <span class="lbl-s">newest first</span></div>
    ${trailHtml(fab, a)}`;
  const foot = `<button class="btn ghost" data-act="openref" data-fab="${fab.id}" data-a="${a.id}">Open</button><span class="sp"></span>
    ${nx ? `<button class="btn pri" data-act="start" data-fab="${fab.id}" data-j="${nx.name}" data-e="" data-a="${a.id}">${ICONS.play}${esc(nx.title)}</button>` : ""}`;
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
