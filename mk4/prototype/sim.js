/* sim.js: what `fab status --watch` and the stage filters would stream.
   When a job ends, its artifact moves to the job's `to` stage, the stage's
   scorers run, and a step is added to the artifact's history. */

function bumpIcon() {
  const i = $("#fabIcon");
  i.classList.remove("bump"); void i.offsetWidth; i.classList.add("bump");
}

function toWaits(s, ask) {
  if (!s || !SESSIONS.includes(s) || s.state === "waits") return;
  if (!hzById(s.harness).can.waits) return;
  s.state = "waits"; s.changedAt = now(); s.asks = ask;
  render(); refreshSheet();
  if (s.who === ME) { bumpIcon(); notify(`${s.label} waits for you`, ask, () => focusSession(s)); }
}

const rnd = (lo, hi) => Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
let nextPr = 430;

/* the artifact's new address once it is in a stage of another kind */
function refFor(fab, to, a) {
  const sl = slug(a.title);
  const num = (a.ref.match(/#(\d+)/) || [])[1];
  const branch = /^(feat|fix|spike)\//.test(a.ref) ? a.ref.split(" · ")[0] : `feat/${sl}`;
  /* a claimed slice becomes its draft PR, now ready */
  if (to.kind === "pr" && !to.done && a.claim) return a.claim.ref.replace(" · draft ", " · ");
  switch (to.kind) {
    case "line":  return `docs/roadmap/roadmap.md:${artsIn(fab, to.id).length + 1}`;
    case "spec":  return `docs/specs/${sl}.md`;
    case "plan":  return `docs PR #${nextPr++} · docs/plans/${sl}.md`;
    case "slice": return `docs/plans/${sl}.md § S1`;
    case "pr":
      if (to.done) return `#${num || nextPr++} merged`;
      return `${branch} · #${num || nextPr++}`;
    default: return a.ref;
  }
}

function scoreFor(fab, st) {
  const sc = {};
  (st.scoredBy || []).forEach((k) => { sc[k] = rnd(4.2, 9.6); });
  return sc;
}

function advance(fab, a, j, s) {
  const to = stageOf(fab, j.to);
  const from = stageOf(fab, a.stage);
  if (!a.trail) a.trail = [{ stage: a.stage, ref: a.ref, at: a.since, via: "found" }];
  const claimed = a.stage !== to.id ? a.claim : null;
  if (a.stage !== to.id) {
    if (to.kind !== from.kind) a.ref = refFor(fab, to, a);
    else if (to.id !== from.id && to.kind === "pr") a.ref = refFor(fab, to, a);
    a.stage = to.id;
    a.since = now();
    delete a.claim;
  }
  const sc = scoreFor(fab, to);
  a.scores = { ...(a.scores || {}), ...sc };
  /* a fab run writes a git note; a session started by hand is linked by name.
     The earlier artifact stays in the trail, so history now hides it from
     its old stage (see hiddenIn in core.js). A draft PR made ready is the
     same PR. */
  const via = s.run ? "note" : from.kind === "pr" && to.kind === "pr" ? "same" : "key";
  a.trail.push({ stage: to.id, ref: a.ref, job: j.name, who: s.who, hz: s.harness, at: now(), via,
    scores: Object.keys(sc).length ? sc : undefined,
    note: claimed ? `Claimed with draft ${prNum(claimed.ref)} ${ago(claimed.at)} ago. Ready for review when the build ended.` : undefined });
}

/* A job that `claims` marks its artifact as taken when it starts: a draft PR
   that names it. The artifact does not move. */
function claimFor(fab, j, a, s) {
  if (!j.claims || !a || a.claim) return;
  a.claim = { ref: `${s.branch} · draft #${nextPr++}`, who: s.who, at: now() };
}

function makeArt(fab, j, s) {
  const to = stageOf(fab, j.to);
  const a = {
    id: "a" + Math.random().toString(36).slice(2, 7), stage: to.id, title: s.label, who: s.who, since: now(),
    ref: to.kind === "issue" ? `INV-20${42 + fab.artifacts.length}` : `docs/roadmap/intake/2026-10-17-${slug(s.label)}.md`,
  };
  a.scores = scoreFor(fab, to);
  a.trail = [{ stage: to.id, ref: a.ref, job: j.name, who: s.who, hz: s.harness, at: now(), via: "note", scores: a.scores }];
  fab.artifacts.push(a);
  return a;
}

function finish(s) {
  const i = SESSIONS.indexOf(s);
  if (i < 0) return;
  SESSIONS.splice(i, 1);
  FINISHED.unshift({ ...s, endedAt: now() });
  const fab = fabById(s.fab);
  const j = s.job ? jobOf(fab, s.job) : null;
  let a = null;
  if (j && s.art) { a = artOf(fab, s.art); if (a) advance(fab, a, j, s); }
  else if (j && j.from) {
    /* a job that reads a whole stage (prioritise) moves its oldest artifact on */
    a = artsIn(fab, j.from)[0];
    if (a) advance(fab, a, j, s);
  } else if (j) a = makeArt(fab, j, s);
  if (a) state.bump = a.id;
  render();
  if (state.sheet?.kind === "session" && state.sheet.sid === s.id) { closeSheet(); renderBody(); }
  else refreshSheet();
  const who = s.who === ME ? "" : `${PEOPLE[s.who].name}: `;
  toast(`${esc(who)}${esc(j?.title || s.label)} done${a ? ` · ${esc(a.title)} → ${esc(stageOf(fab, a.stage).title)}` : ""}`, 3200);
}

const S = (id) => SESSIONS.find((x) => x.id === id);
[
  [7000,  () => { const s = S("s1"); if (s) { s.autoFinish = true; toWaits(s, "Two tests fail on main too. Fix them here, or leave them?"); } }],
  [19000, () => { const s = S("s3"); if (s) finish(s); }],
  [30000, () => { const s = S("t1"); if (s) finish(s); }],   /* Kat's build lands in review: the pile grows */
  [40000, () => { const s = S("t2"); if (s) finish(s); }],   /* Mo's review moves billing-fix on */
  [48000, () => toWaits(S("s9"), "Refund to card or to credit balance by default?")],
].forEach(([t, f]) => setTimeout(f, t));
S("s5").autoFinish = true;

setInterval(() => {
  /* working ↔ idle drift for harnesses that only report activity */
  const pool = SESSIONS.filter((s) => (s.state === "working" || s.state === "idle") && !hzById(s.harness).can.waits && now() - s.changedAt > 20000);
  if (!pool.length || Math.random() < .5) return;
  const s = pool[Math.floor(Math.random() * pool.length)];
  s.state = s.state === "working" ? "idle" : "working"; s.changedAt = now();
  render(); refreshSheet();
}, 9000);

function tick() {
  document.querySelectorAll("[data-since]").forEach((el) => { el.textContent = ago(Number(el.dataset.since)); });
  const d = new Date();
  $("#clock").textContent = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + "  " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
setInterval(tick, 5000);

/* ════════════════════════════════════════════════════════════ scenery ══
   The editor behind shows .fab/fab.yaml: stages are filters, scorers are
   questions. That file is what someone shares to share a factory. */

function renderScenery() {
  $("#mbSys").innerHTML = `${ICONS.search}${ICONS.wifi}${ICONS.batt}`;
  const k = (s) => `<span class="ed-k">${s}</span>`, s = (x) => `<span class="ed-s">${x}</span>`, c = (x) => `<span class="ed-c">${x}</span>`;
  const lines = [
    c("# .fab/fab.yaml: the factory layout. Share this folder to share it."),
    "",
    `${k("stages")}:                      ${c("# a stage is a filter, never a status")}`,
    `  - ${k("id")}: intake`,
    `    ${k("find")}: ${s("files docs/roadmap/intake/*.md")}`,
    `    ${k("where")}: ${s("status: open")}`,
    `    ${k("next")}: prioritise`,
    `    ${k("scored-by")}: [clear]`,
    `  ${c("…")}`,
    `  - ${k("id")}: ready`,
    `    ${k("title")}: ${s("Ready to build")}`,
    `    ${k("find")}: ${s("slices in docs/plans/*.md")}`,
    `    ${k("where")}: ${s("status: ready")}`,
    `    ${k("claimed-by")}: ${s("prs draft, naming the slice")}  ${c("# not a stage")}`,
    `    ${k("next")}: build-slice`,
    `  - ${k("id")}: review`,
    `    ${k("title")}: ${s("Needs review")}`,
    `    ${k("find")}: ${s("prs head:feat/*")}`,
    `    ${k("where")}: ${s("ready for review, not approved")}`,
    `    ${k("next")}: review-slice`,
    `    ${k("waits-for")}: code owner`,
    `    ${k("slow-after")}: 1d`,
    `    ${k("scored-by")}: [tech-debt, tests]`,
    "",
    `${k("scorers")}:                     ${c("# .fab/scorers/<id>/SKILL.md")}`,
    `  - ${k("id")}: edge-cases`,
    `    ${k("ask")}: ${s("Does the plan name the edge cases,")}`,
    `         ${s("and say what happens in each?")}`,
    `  - ${k("id")}: tech-debt`,
    `    ${k("ask")}: ${s("Does it add little tech debt?")}`,
  ];
  const tree = [
    ["folder", ".fab", 0], ["folder", "jobs", 1], ["folder", "file-work", 2], ["folder", "prioritise", 2], ["folder", "plan-feature", 2],
    ["folder", "build-slice", 2], ["folder", "review-slice", 2], ["folder", "scorers", 1], ["folder", "edge-cases", 2], ["folder", "tech-debt", 2],
    ["folder", "rules", 1], ["doc", "fab.yaml", 1, true], ["doc", "AGENTS.md", 1],
    ["folder", "docs", 0], ["folder", "src", 0], ["doc", "AGENTS.md", 0],
  ];
  $("#editor").innerHTML = `
    <div class="ed-bar"><div class="lights"><i class="r"></i><i class="y"></i><i class="g"></i></div><span class="ed-title">fab.yaml — dragonfly</span></div>
    <div class="ed-tree">${tree.map(([ic, n, depth, on]) => `<div class="ed-f ${on ? "on" : ""}" style="padding-left:${6 + depth * 12}px">${ICONS[ic]}${n}</div>`).join("")}</div>
    <div class="ed-code">${lines.map((l, i) => `<div class="ed-ln"><i>${i + 1}</i>${l}</div>`).join("")}</div>`;
}

/* ═══════════════════════════════════════════════════════════════ boot ══ */

setTheme();
renderScenery();
tick();
render();
