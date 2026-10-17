/* sheets.js: a sheet slides over the panel. Start a job, read a job, read an
   artifact (its agents, scores and history), read a session, settings. */

function openSheet(sheet) {
  state.sheet = sheet;
  state.picker = false;
  renderSheet();
  renderHead();
}
function closeSheet() {
  state.sheet = null;
  $("#pnSheet").classList.remove("open");
  $("#panel").classList.remove("sheeted");
}

function renderSheet() {
  const sh = state.sheet;
  const el = $("#pnSheet");
  if (!sh) { el.classList.remove("open"); $("#panel").classList.remove("sheeted"); return; }
  $("#panel").classList.add("sheeted");
  const back = `<button class="sh-back" data-act="back">${ICONS.chevL}${sh.backLabel || "Back"}</button>`;
  const fn = { start: startSheet, job: jobSheet, art: artSheet, session: sessionSheet, settings: settingsSheet }[sh.kind];
  const { title = "", body, foot = "" } = fn(sh);
  el.innerHTML = `<div class="sh-h ${state.pinned ? "drag" : ""}">${back}<span class="sh-ttl">${esc(title)}</span></div>
    <div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ""}`;
  requestAnimationFrame(() => el.classList.add("open"));
  if (sh.kind === "start") {
    const first = el.querySelector("[data-in]");
    if (first && !sh.focused) { sh.focused = true; setTimeout(() => first.focus(), 230); }
    syncStart();
  }
}
function refreshSheet() { if (state.sheet && state.sheet.kind !== "start") renderSheet(); }

/* ── Start a job: which artifact, its questions, a harness, and Start ── */

const newRunId = () => "r_20261017_" + Math.random().toString(16).slice(2, 8);

/* the default artifact: the oldest one nobody's agent is on */
function pickDefault(fab, j) {
  const arts = artsIn(fab, j.from);
  return (arts.find((a) => !agentsOn(fab, a).length) || arts[0])?.id || null;
}

function startSheet(sh) {
  const fab = fabById(sh.fab);
  const j = jobOf(fab, sh.job);
  const e = sh.entry != null ? j.entries[sh.entry] : null;
  const from = j.from && stageOf(fab, j.from);
  const to = stageOf(fab, j.to);
  const icon = e ? e.icon : j.icon || "start";
  if (!sh.values) {
    sh.values = {};
    (j.inputs || []).forEach((inp) => { sh.values[inp.name] = fill(inp.default); });
    sh.harness = hzById(state.settings.harness).ok ? state.settings.harness : "claude-code";
    sh.run = newRunId();
    sh.branch = null;
    if (j.takes && !sh.art) sh.art = pickDefault(fab, j);
  }
  let pick = "";
  if (j.takes) {
    const arts = artsIn(fab, j.from);
    pick = `<div class="fld"><label class="fld-l">Which ${esc(KINDS[from.kind].one)}?<span class="opt">${arts.length} in ${esc(from.title)}</span></label>
      <select class="inp" data-artsel>${arts.map((a) => {
        const n = agentsOn(fab, a).length;
        return `<option value="${a.id}" ${sh.art === a.id ? "selected" : ""}>${esc(a.title)} · ${ago(a.since)}${n ? ` · ${n} agent${n > 1 ? "s" : ""} on it` : ""}</option>`;
      }).join("")}</select></div>`;
  } else if (from) {
    pick = `<div class="inote">${ICONS.info}<span>Reads all ${artsIn(fab, j.from).length} in ${esc(from.title)}</span></div>`;
  }
  const fields = (j.inputs || []).map((inp, i) => {
    const ask = i === 0 && e?.ask ? e.ask : inp.ask;
    const v = esc(sh.values[inp.name] ?? "");
    const ctl = inp.long
      ? `<textarea class="inp" data-in="${inp.name}" placeholder="${esc(inp.hint || "")}">${v}</textarea>`
      : `<input class="inp" data-in="${inp.name}" value="${v}" placeholder="${esc(inp.hint || "")}" />`;
    return `<div class="fld"><label class="fld-l">${esc(ask)}${inp.optional ? `<span class="opt">optional</span>` : ""}</label>${ctl}</div>`;
  }).join("");

  const hzs = HARNESSES.map((h) => {
    const dis = !h.ok || !h.can.start;
    return `<button class="hzo ${sh.harness === h.id ? "on" : ""}" data-act="harness" data-id="${h.id}" ${dis ? "disabled" : ""}>
      <span class="radio"></span>${hzIcon(h.id)}
      <span class="hzo-m"><span class="hzo-t">${esc(h.label)}${state.settings.harness === h.id ? `<span class="dflt">Default</span>` : ""}</span>
      ${dis ? `<span class="hzo-s">${esc(h.why)}</span>` : ""}</span></button>`;
  }).join("");

  const wt = j.worktree === "new" ? `
    <div class="lbl">Branch</div>
    <div class="wt">${ICONS.branch}<input data-branch value="${esc(sh.branch ?? "")}" placeholder="fab/${esc(j.name)}/…" /></div>` : "";

  const body = `
    <div class="hero">
      <span class="go-ic ${icon}">${ICONS[icon] || ICONS.start}</span>
      <div style="min-width:0">
        <div class="hero-t">${esc(e ? e.title : j.title)}</div>
        <div class="hero-s">${from ? `${esc(from.title)} → ${esc(to.title)}` : `Adds to ${esc(to.title)}`}</div>
      </div>
    </div>
    ${pick}${fields}
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
  return { body, foot };
}

function startInputs(sh) {
  const fab = fabById(sh.fab);
  const j = jobOf(fab, sh.job);
  const e = sh.entry != null ? j.entries[sh.entry] : null;
  const art = j.takes && sh.art ? artOf(fab, sh.art) : null;
  const inputs = { ...(e?.fixed || {}), ...Object.fromEntries(Object.entries(sh.values).filter(([, v]) => v !== "")) };
  return { fab, j, e, art, inputs };
}

function branchFor(sh) {
  const { fab, j, art, inputs } = startInputs(sh);
  if (sh.branch) return sh.branch;
  const s = slug(art?.title || inputs.what || sh.run.slice(-6));
  /* work that becomes a PR gets the branch the stage filters look for */
  return stageOf(fab, j.to).kind === "pr" ? `feat/${s}` : `fab/${j.name}/${s}`;
}

function syncStart() {
  const sh = state.sheet;
  if (!sh || sh.kind !== "start") return;
  const { fab, j, art, inputs } = startInputs(sh);
  const missing = (j.inputs || []).filter((i) => !i.optional && !(sh.values[i.name] || "").trim());
  const go = $("#goBtn");
  if (go) go.disabled = missing.length > 0 || (j.takes && !art);
  const bi = $("[data-branch]");
  if (bi && !sh.branch) bi.value = branchFor(sh);

  const args = Object.entries(inputs).map(([k, v]) => ` \\\n  --input ${k}=${/\s/.test(v) ? `"${v}"` : v}`).join("");
  const on = art ? ` \\\n  --on "${art.ref}"` : "";
  const wtNew = j.worktree === "new";
  const c = $("#cmdPreview");
  if (c) c.innerHTML = `<span class="c1">fab run ${esc(j.name)}</span>${esc(on)}${esc(args)} \\\n  --harness ${esc(sh.harness)}${wtNew ? ` --worktree new --branch ${esc(branchFor(sh))}` : ""}\n\n<span class="c2"># run record → ~/.fab/runs/${esc(sh.run)}.json</span>`;
  const pp = $("#promptPreview");
  if (pp) pp.innerHTML = `<span class="c2"># $PROMPT</span>\nRun the ${esc(j.name)} job (.fab/jobs/${esc(j.name)}/SKILL.md).\n<span class="c3">fab-run: ${esc(sh.run)}</span>${art ? `\n\nOn: ${esc(art.ref)}` : ""}${Object.keys(inputs).length ? `\n\nInputs:\n${Object.entries(inputs).map(([k, v]) => `- ${esc(k)}: ${esc(v)}`).join("\n")}` : ""}\n\n<span class="c2"># when it ends, fab scores the output:</span>\n${(stageOf(fab, j.to).scoredBy || []).map((k) => `fab score ${k}`).join("\n") || "<span class=\"c2\"># no scorers on " + esc(stageOf(fab, j.to).title) + "</span>"}`;
}

function doStart(sh) {
  const { fab, j, e, art, inputs } = startInputs(sh);
  const hz = hzById(sh.harness);
  const label = art ? art.title : inputs.what ? inputs.what.split(/[.\n]/)[0].slice(0, 60) : e ? e.title : j.title;
  const s = {
    id: "n" + Math.random().toString(36).slice(2, 7),
    fab: fab.id, who: ME, job: j.name, label, harness: hz.id, state: "starting",
    art: art?.id, makes: art ? undefined : j.to,
    startedAt: now(), changedAt: now(),
    branch: j.worktree === "new" ? branchFor(sh) : "main",
    worktree: j.worktree === "new" ? `~/orca/workspaces/${fab.name}/${slug(branchFor(sh).split("/").pop())}` : fab.path,
    match: "pending", run: sh.run, startedBy: "monitor", inputs, autoFinish: true,
  };
  SESSIONS.unshift(s);
  closeSheet();
  state.tab = "work";
  state.fab = fab.id;
  state.expanded.add(`${fab.id}:${art ? art.stage : j.to}`);
  state.flash = s.id;
  render();
  toast(`Starting ${esc(j.title)} in ${esc(hz.label)}`);
  const t = hz.can.match === "exact" ? 1500 : 3600;
  setTimeout(() => {
    s.state = "working"; s.changedAt = now(); s.match = hz.can.match;
    render(); refreshSheet();
  }, t);
  /* a scripted ending, so the loop closes: a conversation job asks first */
  if (!j.takes && j.from && hz.can.waits) setTimeout(() => toWaits(s, "Which of these goes first?"), 7000);
  else setTimeout(() => finish(s), 12000 + Math.random() * 5000);
}

/* ── a job: what it reads and writes, what scores it ── */

function jobSheet(sh) {
  const fab = fabById(sh.fab);
  const j = jobOf(fab, sh.job);
  const from = j.from && stageOf(fab, j.from);
  const to = stageOf(fab, j.to);
  const ss = live(fab.id).filter((s) => s.job === j.name).sort(byRank);
  const stLink = (st) => `<span class="lnk" data-act="gostage" data-fab="${fab.id}" data-s="${st.id}">${esc(st.title)}</span>`;
  const kv = [
    ["From", from ? stLink(from) : `<span class="dim">Nothing. Starts new work</span>`],
    ["To", stLink(to)],
    ["Takes", j.takes ? `One ${esc(KINDS[from.kind].one)}` : from ? `All of ${esc(from.title)}` : `<span class="dim">Your answers</span>`],
    ["Decides", j.decides ? esc(fab.decisions[j.decides].who) : `<span class="dim">—</span>`],
    ["Worktree", j.worktree === "new" ? "New" : "Current"],
  ].map(([k, v]) => `<div class="kv-r"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`).join("");
  const toArts = artsIn(fab, j.to);
  const scorers = (to.scoredBy || []).map((k) => {
    const v = avgScore(toArts, k);
    return `<div class="kv-r" title="${esc(fab.scorers[k].ask)}"><span class="kv-k wide">${esc(fab.scorers[k].title)}</span><span class="kv-v">${v != null ? `<span class="dim">avg of ${toArts.filter((a) => a.scores?.[k] != null).length}</span> ${scoreChip(v)}` : `<span class="dim">no scores yet</span>`}</span></div>`;
  }).join("");
  const inputs = j.inputs?.length
    ? `<div class="lbl">Asks</div><div class="kv">${j.inputs.map((i) => `<div class="kv-r"><span class="kv-k mono">${esc(i.name)}</span><span class="kv-v">${esc(i.ask)}${i.optional ? ` <span class="dim">optional</span>` : ""}</span></div>`).join("")}</div>` : "";
  const icon = j.icon || j.entries?.[0].icon || "job";
  const body = `
    <div class="hero">
      <span class="go-ic ${icon}">${ICONS[icon]}</span>
      <div><div class="hero-t">${esc(j.title)}</div><div class="hero-s"><span class="mono">${esc(j.name)}</span></div></div>
    </div>
    <div class="hero-d">${esc(j.description)}</div>
    <div class="kv">${kv}</div>
    ${scorers ? `<div class="lbl">Scored on</div><div class="kv">${scorers}</div>` : ""}
    ${inputs}
    ${ss.length ? `<div class="lbl">Running</div><div class="mini">${ss.map((s) => agentHtml(s)).join("")}</div>` : ""}`;
  let foot = `<button class="btn ghost" data-act="openfile" data-path=".fab/jobs/${esc(j.name)}/SKILL.md">Open SKILL.md</button><span class="sp"></span>`;
  foot += j.entries
    ? j.entries.map((e, i) => `<button class="btn ${i === 0 ? "pri" : ""}" data-act="start" data-fab="${fab.id}" data-j="${j.name}" data-e="${i}">${esc(e.title.replace(/^Log /, ""))}</button>`).join("")
    : `<button class="btn pri" data-act="start" data-fab="${fab.id}" data-j="${j.name}" data-e="">Start</button>`;
  return { body, foot };
}
