/* ═══════════════════════════════════════════════════════════════ data ══
   Numbers are the real email-agent corpus shape: 370 docs, 314 slices, 436
   `needs` edges, 301 decisions. Everything else is plausible fill. */

/* a workspace is a product. You pick the thing you are building before you pick
   whether you are working on it or in it. */
const WORKSPACES = [
  { id: "email-agent", name: "email-agent", i: "EA", h: 212, sub: "AI-native email client" },
  { id: "my-brain",    name: "My Brain Books", i: "MB", h: 286, sub: "Socials Factory" },
  { id: "forma",       name: "Forma",       i: "FO", h: 24,  sub: "broker doc collection" },
  { id: "everest",     name: "Everest",     i: "EV", h: 150, sub: "homebuilder deal packs" },
];

/* ── the whole bet of this thing: every workspace is the SAME six-station loop,
      read three ways. A software factory and a content factory are the same
      machine — only the names on the stations, the things sitting at them, and
      the vocabulary change. Each builder below returns one full dataset; the
      globals the app reads are just whichever dataset is active. Swap the
      dataset and all three modes re-read it, because nothing is hard-coded to
      email — the station and edge *ids* are the skeleton, everything else is
      content. ── */
let REPO, STATES, PROCS, BACKS, INPUTS, ISSUES, ITEMS, AGENTS, RUN_PROC, RUN_MODEL,
    PAGES, NAV, HISTORY, RUNBOOKS, SKILLS, TERMS, COPY, EXTRA_SKILLS;
const DATASETS = {};

function loadWorkspace(id) {
  const d = DATASETS[id] || DATASETS["email-agent"];
  REPO = d.repo; STATES = d.states; PROCS = d.procs; BACKS = d.backs; INPUTS = d.inputs || [];
  ISSUES = d.issues; ITEMS = d.items; AGENTS = d.agents;
  RUN_PROC = d.runProc; RUN_MODEL = d.runModel;
  PAGES = d.pages; NAV = d.nav; HISTORY = d.history;
  TERMS = d.terms; COPY = d.copy; EXTRA_SKILLS = d.extraSkills;
  RUNBOOKS = PROCS.filter((p) => p.kind === "runbook");
  SKILLS = PROCS.filter((p) => p.kind === "skill");
}

/* padded plausible history so a station reads full without hand-writing 273 rows.
   Vocabulary is per-workspace, so email pads with UI nouns and a content factory
   pads with hook lines and carousels. */
function padStations(STATES, ITEMS, PANEL_MAX, NOUN, VERB) {
  const SHA = "0123456789abcdef";
  const sha = (n) => Array.from({ length: 7 }, (_, k) => SHA[(n * 7 + k * 13) % 16]).join("");
  const AGO = ["2d ago", "3d ago", "4d ago", "last week", "last week", "2 weeks ago", "3 weeks ago"];

  STATES.forEach((s) => {
    const list = ITEMS[s.id];
    const want = Math.min(s.count, PANEL_MAX);
    let n = 0;
    while (list.length < want) {
      const k = list.length + n;
      const t = `${VERB[k % VERB.length]} ${NOUN[(k * 5) % NOUN.length]}`;
      if (s.id === "merged") {
        list.push({ id: (1.32 - 0.01 * (n + 1)).toFixed(2), t, s: `${AGO[n % AGO.length]} · ${sha(n)}`, d: "ok" });
      } else if (s.id === "plans") {
        const blocked = n % 3 !== 0;
        list.push({ id: (1.74 + 0.03 * n).toFixed(2), t,
          s: blocked ? `needs ${(1.2 + 0.07 * n).toFixed(2)} · blocked` : "no needs · buildable", d: blocked ? "ok" : "run" });
      } else if (s.id === "spec") {
        list.push({ id: String(7 + n).padStart(2, "0"), t: `${NOUN[(k * 3) % NOUN.length]} section`,
          s: n % 4 === 0 ? `${1 + (n % 3)} sections uncovered` : `${4 + (n % 9)} covering · complete`,
          d: n % 4 === 0 ? "wait" : "ok" });
      } else {
        list.push({ id: (1.72 + 0.03 * n).toFixed(2), t, s: "sonnet · queued", d: "ok" });
      }
      n++;
    }
  });
}

/* ═══════════════════════════════════════════════ workspace · email-agent ══ */
function makeEmailAgent() {
const REPO = { name: "email-agent", branch: "main", sysVersion: "v41", runbooksN: 6, skillsN: 12 };

/* ── the states. A node is a predicate over the repo, not a document. That is
      what makes it countable, and what makes the same ring readable as both a
      definition and a live board. ── */
const STATES = [
  { id: "spec",   name: "Product spec",   glob: "docs/**/*.md",                 icon: "doc",    count: 18,
    shape: ["title", "problem", "constraints[]", "decisions[]"],
    dwell: { median: "9d 4h", p90: "41d", oldest: "63d", inW: 2, outW: 2,
      trend: [7, 8, 6, 9, 11, 9, 10, 9], unit: "d",
      note: "a spec section sits until something forces a cut" } },

  { id: "plans",  name: "Build plans",    glob: "slices/*.md · status=planned", icon: "list",   count: 41,
    shape: ["id", "needs[]", "owns[]", "spec", "proves"],
    dwell: { median: "2d 6h", p90: "9d 1h", oldest: "17d", inW: 21, outW: 18,
      trend: [1.4, 1.6, 1.9, 2.1, 2.0, 2.4, 2.2, 2.3], unit: "d",
      note: "blocked slices are the long tail, not slow planning" } },

  { id: "branch", name: "Worker branch",  glob: "git · worktrees/*",            icon: "branch", count: 6,
    shape: ["slice", "branch", "agent", "started_at"],
    dwell: { median: "22m", p90: "1h 40m", oldest: "3h 06m", inW: 18, outW: 18,
      trend: [26, 24, 25, 21, 23, 20, 22, 22], unit: "m", note: "" } },

  { id: "pr",     name: "Worker PR",      glob: "gh · pr head:slice/*",         icon: "pr",     count: 3,
    shape: ["slice", "diff", "checks", "reviewer"],
    dwell: { median: "4h 10m", p90: "1d 6h", oldest: "2d 3h", inW: 18, outW: 17,
      trend: [3.1, 3.6, 4.4, 3.9, 5.2, 4.6, 4.0, 4.2], unit: "h",
      note: "the wait is the human gate, not the checks" } },

  { id: "merged", name: "Merged",         glob: "slices/*.md · status=merged",  icon: "check",  count: 273,
    shape: ["slice", "sha", "shipped_at"],
    dwell: { median: "40s", p90: "2m 10s", oldest: "12m", inW: 17, outW: 17,
      trend: [.7, .6, .7, .6, .7, .6, .7, .7], unit: "m", note: "" } },

  { id: "feed",   name: "Feedback",       glob: "feedback/*.md",                icon: "flag",   count: 9,
    shape: ["category", "area", "report", "fold"],
    dwell: { median: "6d 2h", p90: "19d", oldest: "24d", inW: 5, outW: 3,
      trend: [3.1, 3.8, 4.2, 5.0, 5.4, 5.1, 5.9, 6.1], unit: "d",
      note: "product feedback waits here for the weekly triage to fold it in" } },
];

/* how long a thing lives in a state, and whether the queue is growing. The
   loop's bottleneck is wherever `in` runs ahead of `out`. */

/* ── the processes. The box that sits on the line. Every one of these is a
      runbook or a skill, and every one carries a contract and a run record. ── */
const PROCS = [
  {
    id: "plan", from: "spec", to: "plans", name: "plan feature", kind: "runbook",
    trigger: "manual", runner: "opus · human gate", runs: 64, fail: .09, median: "4m 20s",
    reads: ["problem", "constraints[]", "decisions[]"], writes: ["id", "needs[]", "owns[]", "spec", "proves"],
    issues: ["i7"],
    prompt: `## Context

You are cutting a **product spec** into build slices. Read the section named in
\`$SPEC\`, plus every decision that section cites. Nothing else is in scope.

> Never invent a constraint the spec does not state. If the spec is ambiguous,
> stop and file a \`spec-ambiguity\` issue instead of guessing.

## Every slice carries

- \`needs\` — slice ids that must merge before this one
- \`owns\` — file globs this slice will create or modify
- \`spec\` — the section it covers, with §
- \`proves\` — the observable behaviour that shows it works

## Tasks

- [ ] Load $SPEC and every decision it cites → context.decisions[]
- [ ] Cut the section into slices, one provable behaviour each, following [how to cut a section](plan/breakdown.md) → slices/*.md
- [ ] Resolve ordering against the merged frontier → needs[]
- [ ] Claim file globs, split anything over six files → owns[]
- [ ] Diff owns against the live frontier, report overlaps → system/issues/*.md

## Rules

1. A slice is too big if \`owns\` lists more than six files. Split it.
2. Two slices may not own the same path.
3. Report collisions. Do not resolve them yourself.`
  },
  {
    id: "dispatch", from: "plans", to: "branch", name: "dispatch slice", kind: "skill",
    trigger: "on arrival · frontier only", runner: "orca", runs: 314, fail: .02, median: "8s",
    reads: ["needs[]", "owns[]"], writes: ["slice", "branch", "agent", "started_at"],
    issues: [],
    prompt: `## Context

Take the next **buildable** slice and open a worktree for it.

Buildable means every id in \`needs\` is merged, and no path in \`owns\` collides
with a slice already sitting in Worker branch or Worker PR.

## Tasks

- [ ] Pick the oldest buildable slice off the frontier → slice
- [ ] Create the worktree at ../wt/$SLICE → started_at
- [ ] Branch slice/$SLICE off main → branch
- [ ] Hand the agent the slice, its spec section, and that section's decisions → agent

## Rules

1. Context is the payload, not the repo. Nothing beyond those three documents.
2. If nothing is buildable, stop. Do not widen the definition.`
  },
  {
    id: "build", from: "branch", to: "pr", name: "build + self-review", kind: "runbook",
    trigger: "on arrival", runner: "sonnet", runs: 308, fail: .21, median: "22m",
    reads: ["slice", "branch", "agent"], writes: ["slice", "diff", "checks", "reviewer"],
    issues: ["i1", "i3", "i9", "i11"],
    prompt: `## Context

Build the slice, then review your own diff **before** you raise it.

Work only inside the paths the slice \`owns\`. If the job needs a file the slice
does not own, stop and file a \`spec-ambiguity\` issue naming the path.

## Tasks

- [ ] Break the slice into ordered steps → worktree/TODO.md
- [ ] Implement one step at a time, inside owns only → diff
- [x] Run the narrowest suite covering the changed files, per [test strategy](build/test-strategy.md) → checks
- [ ] Re-read the diff against [code review](build/code-review.md) → worktree/REVIEW.md
- [ ] Raise the PR, slice id in the title, proves in the body → pr

## Rules

1. Judge the diff against \`proves\`, not the plan you had in your head.
2. Full suite only before the PR. Narrow suite while you work.
3. A finding you cannot fix inside owns is raised as a known limitation.`
  },
  {
    id: "review", from: "pr", to: "merged", name: "review", kind: "runbook",
    trigger: "on arrival", runner: "opus · human gate", runs: 301, fail: .34, median: "6m",
    reads: ["diff", "checks", "reviewer"], writes: ["slice", "sha", "shipped_at"],
    issues: ["i2", "i4", "i5", "i8", "i10", "i12"],
    prompt: `## Context

Review against the slice's \`proves\` line and the conventions in \`AGENTS.md\`.
Nothing else is in scope.

## Tasks

- [ ] Read proves, then the diff, in that order → review.notes
- [ ] Check every changed path sits inside owns → review.scope
- [ ] Check the diff against [the conventions](review/conventions.md) → review.conventions
- [ ] Send it back, or merge and stamp the sha → sha, shipped_at

## Rules

1. Send back to Worker branch if proves is not demonstrated.
2. Send back if a path outside \`owns\` changed.
3. **Do not reject for taste.** File a \`convention-drift\` issue and merge, so
   the rule exists next time.`
  },
  {
    id: "log", from: "merged", to: "feed", name: "log feedback", kind: "skill",
    trigger: "after every ship", runner: "haiku", runs: 308, fail: .04, median: "40s",
    reads: ["signals", "sha"], writes: ["category", "area", "report", "fold"],
    issues: [], broken: "reads `signals`, which the Merged shape does not define",
    prompt: `## Context

Read how the shipped slice behaves in real use and log feedback about the
**product** — bugs, regressions, requests. This is not process feedback: a
runbook that let something through is a **system issue**, and those are logged
off this loop, in System mode.

Categories: \`bug\`, \`regression\`, \`request\`, \`paper-cut\`, \`praise\`.

## Tasks

- [ ] Pull the usage signals for the slice that just shipped → report
- [ ] Name the area of the product it touches → area
- [ ] Classify each report into exactly one category → category
- [ ] Say where it folds back — a spec constraint, or a rework slice → fold

## Rules

1. Feedback about the product stays in the factory. It sharpens the next spec.
2. If the miss is the system's, not the product's, file a system issue instead —
   that does not belong on this ring.`
  },
  {
    id: "triage", from: "feed", to: "spec", name: "triage feedback", kind: "runbook",
    trigger: "manual · weekly", runner: "you", runs: 21, fail: .05, median: "3m",
    reads: ["report", "fold"], writes: ["constraints[]", "decisions[]"],
    issues: ["i6"],
    prompt: `## Context

Fold the week's **product** feedback back into the spec. Every item here is
about the product — what shipped and what it taught you. System issues are a
separate queue, off this loop, and are not in scope for this pass.

## Tasks

- [ ] Group the open feedback by area → buckets
- [ ] Turn each into a spec constraint or a numbered decision → constraints[], decisions[]
- [ ] Drop anything that is one report, not a pattern → buckets
- [ ] Close each item with the constraint id it became → feedback/*.md

## Rules

1. Product feedback edits the **spec**, never the runbooks. Runbooks change in
   System mode, off this ring.
2. One report is a fluke; a pattern is a decision. Wait for the pattern.`
  },
];

/* the back edge everyone's real process has and nobody's diagram admits to */
const BACKS = [
  { from: "pr", to: "branch", label: "rework", note: "34% of reviews" },
];

/* ── inputs: the raw material that flows INTO the loop from outside. A factory
      is not one closed ring — different kinds of work enter at the edge and fan
      into the same intake. Each feeds a state; the loop takes it from there. ── */
const INPUTS = [
  { id: "bugs",     to: "feed", name: "Bug reports",     sub: "from users",  icon: "flag",    count: 12 },
  { id: "requests", to: "feed", name: "Feature requests", sub: "from users",  icon: "sparkle", count: 7  },
  { id: "signals",  to: "feed", name: "Usage signals",    sub: "telemetry",   icon: "heat",    count: 34 },
];

/* ── the system's own issue queue, attributed to edges, never to states ── */
const ISSUES = [
  { id: "i1",  cat: "skill-gap",       edge: "build",  t: "No skill for generating fixture mail with realistic thread depth", run: "run 291", fix: true },
  { id: "i2",  cat: "review-miss",     edge: "review", t: "Passed a diff that added a second source of truth for unread counts", run: "run 288", fix: true },
  { id: "i3",  cat: "spec-ambiguity",  edge: "build",  t: "Spec 02 §3 does not say whether a thread can span two accounts", run: "run 284", fix: false },
  { id: "i4",  cat: "review-miss",     edge: "review", t: "Three PRs in a row shipped inline styles against AGENTS.md", run: "run 281", fix: true },
  { id: "i5",  cat: "convention-drift",edge: "review", t: "Slice titles drifting from `n.nn verb-noun` to freeform prose", run: "run 279", fix: true },
  { id: "i6",  cat: "spec-ambiguity",  edge: "triage", t: "Two decisions (D188, D204) both claim ownership of send retry policy", run: "run 276", fix: false },
  { id: "i7",  cat: "skill-gap",       edge: "plan",   t: "Planner cannot see which specs already have coverage, so it re-cuts them", run: "run 270", fix: true },
  { id: "i8",  cat: "review-miss",     edge: "review", t: "Reviewer accepted `proves` lines that only restate the title", run: "run 268", fix: true },
  { id: "i9",  cat: "constraint-violation", edge: "build", t: "Agent edited a path outside owns to unblock a test", run: "run 265", fix: false },
  { id: "i10", cat: "review-miss",     edge: "review", t: "No check that a merged slice actually closed its spec citation", run: "run 262", fix: true },
  { id: "i11", cat: "skill-gap",       edge: "build",  t: "Self-review has no way to run the app, so it reviews code not behaviour", run: "run 259", fix: false },
  { id: "i12", cat: "convention-drift",edge: "review", t: "Commit messages losing the slice id prefix", run: "run 255", fix: true },
];

/* ── what is actually sitting at each station right now. This is the product
      mode reading of the same ring: lists as nodes, not one node per item. ── */
const ITEMS = {
  spec: [
    { id: "01", t: "Product concept", s: "12 decisions · 3 open questions", d: "ok" },
    { id: "02", t: "Schema", s: "§3 ambiguous · 1 issue open", d: "bad" },
    { id: "03", t: "Sync engine", s: "8 slices covering · complete", d: "ok" },
    { id: "04", t: "Agent runtime", s: "4 sections uncovered", d: "wait" },
    { id: "05", t: "Shell decision", s: "settled · Electron", d: "ok" },
    { id: "06", t: "Contact as memory", s: "2 sections uncovered", d: "wait" },
  ],
  plans: [
    { id: "1.47", t: "thread detail pane", s: "needs 1.3, 1.12 · buildable", d: "run" },
    { id: "1.52", t: "label tree in rail", s: "needs 1.47 · blocked", d: "ok" },
    { id: "1.58", t: "compose from list", s: "needs 1.31 · buildable", d: "run" },
    { id: "1.61", t: "agent chat scope", s: "needs 2.4 · blocked", d: "ok" },
    { id: "1.66", t: "guard chip states", s: "no needs · buildable", d: "run" },
    { id: "1.71", t: "recents in rail", s: "needs 1.52 · blocked", d: "ok" },
  ],
  branch: [
    { id: "1.44", t: "bulk bar over list", s: "sonnet · 14m · 3 files", d: "run" },
    { id: "1.45", t: "settings rail search", s: "sonnet · 6m · 2 files", d: "run" },
    { id: "1.49", t: "toast undo path", s: "sonnet · 22m · stuck on test", d: "wait" },
    { id: "1.50", t: "model switcher pop", s: "sonnet · 3m · 4 files", d: "run" },
    { id: "1.53", t: "calendar day popover", s: "sonnet · 31m · 5 files", d: "run" },
    { id: "1.55", t: "list send button", s: "sonnet · 1m · 1 file", d: "run" },
  ],
  pr: [
    { id: "1.38", t: "company card people strip", s: "checks green · waiting on you", d: "wait" },
    { id: "1.41", t: "draft skeleton stages", s: "checks green · review running", d: "run" },
    { id: "1.42", t: "avatar list variant", s: "1 check failing", d: "bad" },
  ],
  merged: [
    { id: "1.37", t: "reading pane hairlines", s: "2h ago · a91f3c2", d: "ok" },
    { id: "1.36", t: "sidebar label twisty", s: "4h ago · 7d20e18", d: "ok" },
    { id: "1.35", t: "palette @ context", s: "6h ago · 3fe9a04", d: "ok" },
    { id: "1.34", t: "strip guard chip", s: "yesterday · c1b7f56", d: "ok" },
    { id: "1.33", t: "thread summary block", s: "yesterday · 0ab4d91", d: "ok" },
    { id: "1.32", t: "compose overlay card", s: "yesterday · 55c3e77", d: "ok" },
  ],
  /* product feedback — issues with the shipped email client, not the process.
     Each one stays in the factory and folds back into the spec. */
  feed: [
    { id: "#1", t: "reading pane drops frames past 40 messages", cat: "bug", area: "reading pane", d: "bad", fix: true,
      report: "Threads longer than ~40 messages stutter, and the pane drops frames when the newest message collapses.",
      fold: "a performance constraint in the Schema spec" },
    { id: "#2", t: "unread count wrong after a bulk archive", cat: "regression", area: "list", d: "bad", fix: true,
      report: "After a bulk archive the unread badge stays stale until the window is refocused.",
      fold: "a decision on where unread is derived, so it is never stored" },
    { id: "#3", t: "undo restores the thread but not its label", cat: "bug", area: "labels", d: "bad", fix: true,
      report: "Undo after archive puts the thread back, but the label it had is gone.",
      fold: "a decision on exactly what undo covers" },
    { id: "#4", t: "compose loses the draft on a network drop", cat: "paper-cut", area: "compose", d: "bad", fix: true,
      report: "A network drop mid-compose loses the draft with no recovery path.",
      fold: "a constraint on draft persistence" },
    { id: "#5", t: "search misses messages in Sent", cat: "request", area: "search", d: "wait", fix: true,
      report: "People expect search to cover Sent; today it only indexes the inbox.",
      fold: "a new Sync-engine spec section" },
    { id: "#6", t: "day popover clips at the screen edge", cat: "paper-cut", area: "calendar", d: "wait", fix: true,
      report: "On narrow windows the calendar day popover clips off the right edge.",
      fold: "a rework slice, not a spec change" },
    { id: "#7", t: "people want the agent to act across two accounts", cat: "request", area: "agent chat", d: "wait", fix: false,
      report: "Repeated asks for the agent to work across two accounts in one instruction.",
      fold: "a spec section on multi-account scope — needs a decision first" },
    { id: "#8", t: "settings search misses nested rows", cat: "paper-cut", area: "settings", d: "wait", fix: true,
      report: "The settings rail search matches top-level rows but skips nested ones.",
      fold: "a rework slice" },
    { id: "#9", t: "the reading pane is landing — keep it", cat: "praise", area: "reading pane", d: "ok", fix: false,
      report: "Unprompted, people keep calling the reading pane the calmest they have used.",
      fold: "note the pattern in the voice & look doc; change nothing" },
  ],
};

/* A node card only ever shows four rows. The panel has to show the rest, so
   each station is padded out with plausible history up to 40. Past that the
   panel hands you off to the matching list view rather than pretending a
   floating card is the right place to read 273 things. */
const PANEL_MAX = 40;

ITEMS.feed.forEach((f) => (f.s = `${f.cat} · ${f.area}`));

padStations(STATES, ITEMS, PANEL_MAX,
  ["thread list", "reading pane", "compose overlay", "label rail", "search field", "account switcher",
    "contact card", "company card", "agent chat", "automation row", "draft stages", "bulk bar", "toast stack",
    "palette", "settings rail", "calendar popover", "attachment tray", "signature block", "snooze menu",
    "unread badge", "filter chips", "avatar stack", "send queue", "undo path"],
  ["hairlines on", "empty state for", "keyboard path through", "loading skeleton for",
    "error state for", "density toggle on"]);

/* ══════════════════════════════════════════════════════════════ agents ══
   The third reading of the same ring. System mode designs the loop, Product
   mode reads what is sitting at each station, and Agents mode watches the
   harness sessions actually moving things along the edges.

   A run is one Claude Code (or other harness) session, dispatched by the
   orchestrator, sitting on one slice at one station and executing the process
   on the edge out of it. This list is the truth behind the status dots: a slice
   glows green in Product mode because an agent is live on it right now, amber
   because that agent stopped to ask you something, red because it broke. Every
   dot you have been looking at is a reading of one of these. */

const RUN_PROC  = { branch: "build",  pr: "review", merged: "review" };
const RUN_MODEL = { branch: "sonnet", pr: "opus",   merged: "opus" };

/* the transcript vocabulary, kept tiny so a run reads like a real session:
   sys  — orchestrator/system line (dim)
   say  — the agent talking
   tool — a tool call: act + arg + optional sub (diffstat, result)
   bash — a command and its output, ok=false paints it red
   you  — you, typing back into the session
   ask  — the agent is blocked on you; opts are one-tap answers            */

const AGENTS = [
  {
    id: "r-144", slice: "1.44", title: "bulk bar over list", station: "branch",
    started: "14m ago", elapsed: "14m", pct: 62, status: "running",
    head: "Wiring archive + label actions",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.44 · branched slice/1.44 off main" },
      { k: "sys",  t: "Payload: slice 1.44, spec 01 §2, decisions D183 D194. Nothing else in scope." },
      { k: "say",  t: "Building the bulk action bar that appears over the thread list once rows are selected. Reading the `proves` line first, then cutting the work into ordered steps." },
      { k: "tool", act: "Write", arg: "../wt/1.44/TODO.md", sub: "5 steps" },
      { k: "say",  t: "Starting from selection state, since the bar is driven by it — nothing renders until at least one row is checked." },
      { k: "tool", act: "Edit", arg: "src/list/useSelection.ts", sub: "+38 −4" },
      { k: "tool", act: "Edit", arg: "src/list/BulkBar.tsx", sub: "+112 −0" },
      { k: "bash", cmd: "npm test -- bulk", ok: true, out: "PASS  src/list/BulkBar.test.tsx  (6 tests, 0.8s)" },
      { k: "say",  t: "Bar renders and the count is live. Wiring the archive and label actions next, then I self-review the diff against `proves` before I raise the PR." },
      { k: "tool", act: "Edit", arg: "src/list/BulkBar.tsx", sub: "+46 −8" },
    ],
  },
  {
    id: "r-145", slice: "1.45", title: "settings rail search", station: "branch",
    started: "6m ago", elapsed: "6m", pct: 34, status: "running",
    head: "Reading the settings tree before I touch it",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.45 · branched slice/1.45 off main" },
      { k: "say",  t: "Adding a filter field to the settings rail. Mapping the tree first so the match highlights the right nodes." },
      { k: "tool", act: "Read", arg: "src/settings/rail.tsx" },
      { k: "tool", act: "Edit", arg: "src/settings/RailSearch.tsx", sub: "+58 −0" },
    ],
  },
  {
    id: "r-149", slice: "1.49", title: "toast undo path", station: "branch",
    started: "22m ago", elapsed: "22m", pct: 40, status: "waiting",
    head: "Stopped on a spec ambiguity",
    question: {
      t: "When a thread is un-archived by undo, should the list scroll back to it, or stay where it is?",
      opts: ["Scroll back to the restored thread", "Stay put, just re-insert the row", "File a spec-ambiguity issue and pause"],
    },
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.49 · branched slice/1.49 off main" },
      { k: "say",  t: "Building the undo path for the toast that shows after archive. The `proves` line says undo restores the thread to its exact prior position in the list." },
      { k: "tool", act: "Edit", arg: "src/toast/UndoToast.tsx", sub: "+74 −2" },
      { k: "tool", act: "Edit", arg: "src/list/restore.ts", sub: "+51 −0" },
      { k: "bash", cmd: "npm test -- undo", ok: false, out: "FAIL  src/list/restore.test.tsx\n  ● restores scroll anchor after undo\n    expected list index 12, received 0" },
      { k: "say",  t: "The failing test asserts undo restores the scroll anchor, but the spec section for 1.49 never says whether the list scrolls back to the restored thread or stays put. The two readings contradict and I will not guess on a `proves` line." },
      { k: "ask",  t: "When a thread is un-archived by undo, should the list scroll back to it, or stay where it is?" },
    ],
  },
  {
    id: "r-150", slice: "1.50", title: "model switcher pop", station: "branch",
    started: "3m ago", elapsed: "3m", pct: 20, status: "running",
    head: "Sketching the popover shell",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.50 · branched slice/1.50 off main" },
      { k: "say",  t: "Building the model switcher popover off the strip chip. Shell and open/close first, then the list." },
      { k: "tool", act: "Edit", arg: "src/strip/ModelPop.tsx", sub: "+40 −0" },
    ],
  },
  {
    id: "r-153", slice: "1.53", title: "calendar day popover", station: "branch",
    started: "31m ago", elapsed: "31m", pct: 74, status: "running",
    head: "Self-reviewing the diff against proves",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.53 · branched slice/1.53 off main" },
      { k: "say",  t: "Day popover for the calendar strip. Five files, all inside owns." },
      { k: "tool", act: "Edit", arg: "src/cal/DayPopover.tsx", sub: "+96 −4" },
      { k: "tool", act: "Edit", arg: "src/cal/positioning.ts", sub: "+44 −2" },
      { k: "bash", cmd: "npm test -- calendar", ok: true, out: "PASS  src/cal/DayPopover.test.tsx  (9 tests, 1.1s)" },
      { k: "say",  t: "Green. Re-reading the diff file by file against the review checklist before I raise." },
    ],
  },
  {
    id: "r-155", slice: "1.55", title: "list send button", station: "branch",
    started: "1m ago", elapsed: "1m", pct: 90, status: "running",
    head: "One file, raising the PR shortly",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.55 · branched slice/1.55 off main" },
      { k: "tool", act: "Edit", arg: "src/list/SendButton.tsx", sub: "+22 −1" },
      { k: "bash", cmd: "npm test -- send", ok: true, out: "PASS  (2 tests)" },
    ],
  },
  {
    id: "r-141", slice: "1.41", title: "draft skeleton stages", station: "pr",
    started: "8m ago", elapsed: "8m", pct: 55, status: "running",
    head: "Reviewing the diff against proves",
    log: [
      { k: "sys",  t: "Reviewing PR slice/1.41 · checks green" },
      { k: "say",  t: "Read `proves`, now walking the diff. Skeleton stages match the three the spec names. Checking every changed path sits inside owns." },
      { k: "tool", act: "Read", arg: "src/compose/DraftStages.tsx" },
    ],
  },
  {
    id: "r-138", slice: "1.38", title: "company card people strip", station: "pr",
    started: "3h ago", elapsed: "3h", pct: 80, status: "waiting",
    head: "Waiting on a merge call",
    question: {
      t: "The diff caches a derived people-count on the company record. Merge it, or send back to derive on read?",
      opts: ["Send back — derive on read", "Merge — the cache is fine here"],
    },
    log: [
      { k: "sys",  t: "Reviewing PR slice/1.38 · checks green · waiting on you" },
      { k: "say",  t: "Read `proves`, then the diff. Scope is clean — every changed path sits inside owns. One thing gives me pause." },
      { k: "tool", act: "Read", arg: "src/company/PeopleStrip.tsx" },
      { k: "say",  t: "The strip derives the people list from messages on read, which matches D191. But it also caches the count on the company record — exactly the second-source-of-truth the review checklist keeps catching. It may be an intentional perf call, so I am not merging or rejecting on my own." },
      { k: "ask",  t: "The diff caches a derived people-count on the company record. Merge it, or send back to derive on read?" },
    ],
  },
  {
    id: "r-142", slice: "1.42", title: "avatar list variant", station: "pr",
    started: "18m ago", elapsed: "18m", pct: 55, status: "failed",
    head: "Check failing · typecheck red",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.42 · branched slice/1.42 off main" },
      { k: "say",  t: "Building the avatar list variant." },
      { k: "tool", act: "Edit", arg: "src/list/AvatarRow.tsx", sub: "+64 −12" },
      { k: "bash", cmd: "npm run check", ok: false, out: "✗ typecheck  src/list/AvatarRow.tsx:38\n  Property 'initials' does not exist on type 'Contact'" },
      { k: "say",  t: "Typecheck is red — `Contact` has no `initials` field. That is derived elsewhere and I should not be reaching for it here. This needs a decision on where initials come from before I can go further, so I am pausing rather than inventing a field." },
    ],
  },
  /* just finished — these are the "Recent" tab, and the freshest merged rows */
  {
    id: "r-137", slice: "1.37", title: "reading pane hairlines", station: "merged",
    started: "2h ago", elapsed: "19m", pct: 100, status: "done", head: "Merged · a91f3c2",
    log: [
      { k: "sys",  t: "Reviewing PR slice/1.37" },
      { k: "say",  t: "Proves demonstrated, scope clean, conventions hold. Merging and stamping the sha." },
      { k: "bash", cmd: "gh pr merge --squash", ok: true, out: "merged slice/1.37 → main  a91f3c2" },
    ],
  },
  {
    id: "r-136", slice: "1.36", title: "sidebar label twisty", station: "merged",
    started: "4h ago", elapsed: "24m", pct: 100, status: "done", head: "Merged · 7d20e18",
    log: [
      { k: "sys",  t: "Reviewing PR slice/1.36" },
      { k: "say",  t: "Clean. Merged and logged a convention-drift note on the twisty naming so the rule exists next time." },
      { k: "bash", cmd: "gh pr merge --squash", ok: true, out: "merged slice/1.36 → main  7d20e18" },
    ],
  },
];

/* ── nested pages. `system/runbooks/build.md` owns everything under
      `system/runbooks/build/`, and the parent reaches a child with an ordinary
      relative markdown link. The path is the hierarchy: nothing else stores it. ── */
const PAGES = {
  "system/runbooks/plan/breakdown.md": {
    title: "how to cut a section",
    body: `Part of [plan feature](../plan.md), task 2.

## Context

One slice proves **one** behaviour. If you cannot write the \`proves\` line as a
single sentence somebody could check by using the app, the cut is wrong.

## Tasks

- [ ] List every behaviour the section describes → scratch/cuts.md
- [ ] Drop anything already covered by a merged slice → scratch/cuts.md
- [ ] Write the proves line first, then the title → proves
- [ ] Split any cut whose proves line needs the word "and" → slices/*.md

## Smells

- A title that is a noun with no verb. That is a file, not a behaviour.
- A cut that only makes sense once another unmerged cut lands. Fold them.
- More than six files in \`owns\`. Two slices wearing a trench coat.`
  },

  "system/runbooks/build/test-strategy.md": {
    title: "test strategy",
    body: `Part of [build + self-review](../build.md), task 3.

## Context

Run the narrowest suite that could fail because of this diff. The full suite is
a pre-flight check, not a feedback loop.

## Tasks

- [x] Map the changed files to their nearest test files → suite
- [ ] Run that suite on every save → checks
- [ ] Run the full suite once, immediately before raising → checks
- [ ] Attach the failing output verbatim, never a summary of it → output

> A test that needed changing to make the diff pass is a finding, not a chore.
> Say so in the PR body.`
  },

  "system/runbooks/build/code-review.md": {
    title: "code review",
    body: `Part of [build + self-review](../build.md), task 4. The same runbook
[review](../review.md) uses on the edge into Merged, so the agent reviewing
itself and the reviewer at the gate are reading one file.

## Context

Read the diff as somebody who did not write it and does not care what it cost.
The only questions are whether \`proves\` is demonstrated and whether the diff
stayed inside \`owns\`.

## Tasks

- [ ] Read the proves line before the diff → review.notes
- [ ] Walk the diff file by file against [the checklist](code-review/checklist.md) → review.findings
- [ ] Grade each finding: blocker, or known limitation → severity
- [ ] Blockers go back on the task list, the rest go in the PR body → worktree/TODO.md

## Rules

1. A finding with no line reference is an opinion.
2. Taste is not a blocker. File \`convention-drift\` so the rule exists next time.`
  },

  "system/runbooks/build/code-review/checklist.md": {
    title: "review checklist",
    body: `Part of [code review](../code-review.md). Nested one deeper because it
changes every week and the runbook above it does not.

## Tasks

- [ ] Does anything here become a second source of truth? → findings
- [ ] Is state written in two places for one fact? → findings
- [ ] Does an error path leave the UI in a half state? → findings
- [ ] Any inline styles, against AGENTS.md? → findings
- [ ] Does the commit message keep the slice id prefix? → findings

## Where these came from

Every line is an issue this loop logged and closed. Nothing goes on this list
because it sounded sensible.`
  },

  "system/runbooks/review/conventions.md": {
    title: "conventions",
    body: `Part of [review](../review.md), task 3. This page is the readable half
of \`AGENTS.md\`.

## Tasks

- [ ] Slice titles read \`n.nn verb-noun\` → review.conventions
- [ ] Commit messages open with the slice id → review.conventions
- [ ] No inline styles, tokens only → review.conventions
- [ ] Every new file is claimed by exactly one slice → review.conventions

> Drift shows up here first. When a convention gets broken three times, it is
> the convention that is wrong.`
  },

  /* product documents nest exactly the same way: the file name minus .md is
     the folder, and an ordinary relative link is the only join. */
  "slices/1.47/proves.md": {
    title: "how 1.47 gets proved",
    body: `Part of [thread detail pane](../1.47.md). The \`proves\` line is one
sentence; this is the walkthrough a reviewer follows to believe it.

## Walkthrough

- [x] Open an account with at least one 12-message thread
- [ ] Select the thread from the list, pane opens with the newest message expanded
- [ ] Collapse the newest message, the pane keeps scroll position
- [ ] Arrow down to the next thread, the pane swaps without a flash of empty
- [ ] Resize below 900px, the pane takes the full width and the list hides

## What would falsify it

A thread that renders but loses its scroll anchor on collapse. That is the bug
this slice exists to prevent, so it goes in the PR body either way.`
  },

  "docs/02-schema/thread-model.md": {
    title: "thread model",
    body: `Part of [Schema](../02-schema.md). Split out because §3 kept being
quoted on its own and the ambiguity lives here.

## The unit

A **thread** is the unit the UI addresses. A message is addressable only through
its thread. Nothing in the client may hold a message id as a primary key.

## Open ambiguity

> Can a thread span two accounts? The spec does not say, and
> [issue #i3](../../system/issues/i3.md) is open against it.

- [ ] Decide, then write it as a numbered decision, not as prose
- [ ] Re-cut any slice that guessed while this was open

## Derived, never stored

Unread count, participant list and last-activity are derived from messages on
read. Storing any of them creates the second source of truth that
[review](../../system/runbooks/review.md) keeps catching.`
  },

  "system/runbooks/triage/redraw-an-edge.md": {
    title: "redrawing an edge",
    body: `Part of [triage](../triage.md), rule 1.

## Context

Three issues of one category on one edge means the edge is drawn wrong. Patching
the prompt again just spreads the same failure thinner.

## Tasks

- [ ] Name the state the edge is really trying to produce → states
- [ ] Split the edge in two, or move the boundary → system/loop.md
- [ ] Re-type the contracts either side of the new line → reads[], writes[]
- [ ] Close the three issues against the redraw, not against a patch → system/issues/*.md

## Rules

1. A redraw bumps the **minor** version. A patch bumps the point.
2. If the redraw needs a new state, it needs a new glob. No state without a
   predicate you can count.`
  },
};

/* ── the rails ── */
const NAV = {
  system: [
    { id: "loop",    label: "The loop",    icon: "loop" },
    { id: "programs",label: "Programs",    icon: "book",  n: 9 },
    { id: "skills",  label: "Skills",      icon: "sparkle", n: 12 },
    { id: "issues",  label: "Defects",      icon: "flag", n: 12, loud: true },
    { id: "history", label: "Version history", icon: "clock", n: 41 },
  ],
  product: [
    { id: "loop",    label: "Board",       icon: "loop" },
    { id: "frontier",label: "Frontier",    icon: "sparkle", n: 9 },
    { id: "slices",  label: "Slices",      icon: "list",  n: 314 },
    { id: "specs",   label: "Specs",       icon: "doc",   n: 18 },
    { id: "runs",    label: "Runs",        icon: "robot", n: 6 },
  ],
  /* agents mode: counts are computed live off AGENTS in agentsNav(), so the
     `n` here is only a fallback if the list is empty. */
  agents: [
    { id: "live",   label: "Live",       icon: "robot" },
    { id: "needs",  label: "Needs you",  icon: "flag",   loud: true },
    { id: "queue",  label: "Queue",      icon: "list" },
    { id: "recent", label: "Recent",     icon: "clock" },
  ],
};

const HISTORY = [
  { v: "v41", t: "review: reject on any path outside owns", s: "closed #i9 · 2h ago", who: "you" },
  { v: "v40", t: "log issue: require an edge on every issue", s: "closed #i13 · yesterday", who: "you" },
  { v: "v39", t: "build: added run-the-app step to self-review", s: "proposed by triage · 2d ago", who: "triage" },
  { v: "v38", t: "plan feature: read coverage before cutting", s: "closed #i7 · 3d ago", who: "you" },
  { v: "v37", t: "review: stop rejecting for taste, file drift instead", s: "closed #i5 · 4d ago", who: "you" },
  { v: "v36", t: "dispatch: frontier check before opening a worktree", s: "5d ago", who: "you" },
];

/* ── vocabulary + copy. Everything the app would otherwise hard-code to the
      email domain lives here, so a different workspace reads in its own words. ── */
const TERMS = {
  unit: "slice", Unit: "Slice", units: "slices",
  worktree: "../wt/", branchPre: "slice/", doneLabel: "merged", off: "main",
  issueDir: "system/issues/i-", issueBase: "system/issues/",
  publishCmd: "gh pr merge --squash", publishOut: (s) => `merged slice/${s} → main  ${s.replace(".", "")}f0`,
};
const COPY = {
  productStat: "314 slices · 436 needs · 301 decisions",
  issuesWord: "issues",
  readyWord: "buildable",
  sourceWord: "spec section",
  blockCat: "spec-ambiguity",
  productWord: "product",
  frontierSub: "every need merged, no owns collision",
  slicesSub: "314 total · 273 merged · 41 planned",
  specsSub: "18 docs · 301 decisions · 434 citations",
  runsSub: "what the orchestrator is holding",
  queueSub: "buildable slices the orchestrator can dispatch — every need merged, no owns collision",
  queueChain: "dispatch → build + self-review",
  body: {
    readSpec: "Read the spec section and every decision it cites",
    openWork: "Open the worktree and branch off main",
    implement: "Implement inside `owns` only",
    selfReview: "Self-review against proves, per [code review](../system/runbooks/build/code-review.md)",
    raise: "Raise the PR with the slice id in the title",
    proves: (t) => `Opening the app and using **${t}** does the thing the spec says it should,\nobservably, without reading the diff to know it worked.`,
    owns: (s) => `\`src/${s}/*\``,
    specDecisions: [
      "the thread is the unit the UI addresses, never the message.",
      "anything derivable on read is derived, never stored.",
      "one owner per fact, named in this section.",
    ],
    specQs: { open: "Does the rule above survive an account with two identities?",
      done: "Is there a case where a client-side write beats the server?" },
  },
};
const EXTRA_SKILLS = [
  { name: "read spec section", from: "-", to: "-", trigger: "called", runs: 1902, issues: [] },
  { name: "frontier query",    from: "-", to: "-", trigger: "called", runs: 844,  issues: [] },
  { name: "blast radius",      from: "-", to: "-", trigger: "called", runs: 96,   issues: [] },
];

return { repo: REPO, states: STATES, procs: PROCS, backs: BACKS, inputs: INPUTS, issues: ISSUES,
  items: ITEMS, agents: AGENTS, runProc: RUN_PROC, runModel: RUN_MODEL,
  pages: PAGES, nav: NAV, history: HISTORY, terms: TERMS, copy: COPY, extraSkills: EXTRA_SKILLS };
}

/* ═══════════════════════════════════════════ workspace · My Brain Books ══
   A content factory, not a software one — the same loop run as the socials
   studio for **My Brain Books**, a dot-grid notebook & journal brand. Strategy
   holds the brand's pillars. The calendar is the queue of posts. Drafting,
   review and publishing are the line. Learnings feed back into strategy. Same
   six stations, same six edges, a brand's marketing instead of a codebase. */
function makeMyBrain() {
const REPO = { name: "my-brain-books", branch: "main", sysVersion: "v27", runbooksN: 6, skillsN: 9 };

const STATES = [
  { id: "spec",   name: "Strategy",    glob: "strategy/**/*.md",             icon: "doc",    count: 12,
    shape: ["title", "audience", "pillars[]", "decisions[]"],
    dwell: { median: "14d", p90: "60d", oldest: "90d", inW: 1, outW: 1,
      trend: [9, 10, 11, 12, 12, 13, 14, 14], unit: "d",
      note: "a pillar sits until the audience shifts under it" } },

  { id: "plans",  name: "Calendar",    glob: "pieces/*.md · status=idea",    icon: "list",   count: 28,
    shape: ["id", "needs[]", "channel", "angle", "proves"],
    dwell: { median: "3d", p90: "11d", oldest: "22d", inW: 14, outW: 12,
      trend: [2.1, 2.4, 2.8, 3.0, 2.9, 3.2, 3.1, 3.3], unit: "d",
      note: "ideas pile up faster than the studio drafts them" } },

  { id: "branch", name: "Drafting",    glob: "drafts/piece-*",               icon: "pencil", count: 5,
    shape: ["piece", "draft", "agent", "started_at"],
    dwell: { median: "34m", p90: "2h 10m", oldest: "4h", inW: 12, outW: 12,
      trend: [30, 32, 29, 35, 33, 31, 34, 34], unit: "m", note: "" } },

  { id: "pr",     name: "In review",   glob: "review · piece/*",             icon: "eye",    count: 4,
    shape: ["piece", "draft", "checks", "reviewer"],
    dwell: { median: "5h", p90: "1d 8h", oldest: "2d", inW: 12, outW: 11,
      trend: [3.4, 3.9, 4.6, 4.2, 5.4, 4.9, 5.1, 5.0], unit: "h",
      note: "the wait is you reading it, not the checks" } },

  { id: "merged", name: "Published",   glob: "published/*.md",               icon: "check",  count: 214,
    shape: ["piece", "url", "shipped_at"],
    dwell: { median: "30s", p90: "1m 40s", oldest: "8m", inW: 11, outW: 11,
      trend: [.6, .5, .6, .5, .6, .5, .6, .6], unit: "m", note: "" } },

  { id: "feed",   name: "Results",     glob: "results/*.md",                 icon: "flag",   count: 9,
    shape: ["category", "channel", "post", "fold"],
    dwell: { median: "8d", p90: "21d", oldest: "26d", inW: 4, outW: 2,
      trend: [4, 5, 5, 6, 7, 7, 8, 8], unit: "d",
      note: "what landed waits here for the weekly retro to fold into strategy" } },
];

const PROCS = [
  {
    id: "plan", from: "spec", to: "plans", name: "plan the calendar", kind: "runbook",
    trigger: "manual · weekly", runner: "opus · human gate", runs: 40, fail: .08, median: "6m",
    reads: ["audience", "pillars[]", "decisions[]"], writes: ["id", "needs[]", "channel", "angle", "proves"],
    issues: ["c7"],
    prompt: `## Context

You are turning a **pillar** from the brand strategy into a run of concrete
posts. Read the pillar named in \`$PILLAR\` and every decision it cites. Nothing
else is in scope.

> Never invent an audience the strategy does not name. If a pillar is vague,
> stop and file a \`brief-gap\` learning instead of guessing at an angle.

## Every piece carries

- \`needs\` — piece ids that must publish before this one (a series in order)
- \`channel\` — Instagram, TikTok, Pinterest, newsletter, or LinkedIn — one only
- \`angle\` — the one claim this piece makes, in a sentence
- \`proves\` — the hook, and what a reader takes away if it lands

## Tasks

- [ ] Load $PILLAR and every decision it cites → context.decisions[]
- [ ] Cut the pillar into pieces, one claim each, per [how to cut a pillar](plan/breakdown.md) → pieces/*.md
- [ ] Order any series against what is already published → needs[]
- [ ] Assign exactly one channel per piece, no repeats on the same day → channel
- [ ] Flag any angle already overused on that channel → system/learnings/*.md

## Rules

1. One claim per piece. If the angle needs an "and", it is two pieces.
2. Two pieces may not run the same channel on the same day.
3. Report overuse. Do not quietly reshuffle the calendar yourself.`
  },
  {
    id: "dispatch", from: "plans", to: "branch", name: "assign a piece", kind: "skill",
    trigger: "on arrival · frontier only", runner: "orca", runs: 214, fail: .02, median: "6s",
    reads: ["needs[]", "channel"], writes: ["piece", "draft", "agent", "started_at"],
    issues: [],
    prompt: `## Context

Take the next **ready** piece and open a draft for it.

Ready means every id in \`needs\` is published, and the piece's channel is not
already taken by another piece drafting or in review for the same slot.

## Tasks

- [ ] Pick the oldest ready piece off the calendar → piece
- [ ] Open the draft at ../drafts/piece-$PIECE → started_at
- [ ] Branch piece/$PIECE off the calendar → draft
- [ ] Hand the writer the piece, its pillar, and that pillar's decisions → agent

## Rules

1. Context is the payload, not the whole strategy. Those three documents only.
2. If nothing is ready, stop. Do not widen the definition to fill a slot.`
  },
  {
    id: "build", from: "branch", to: "pr", name: "draft + self-edit", kind: "runbook",
    trigger: "on arrival", runner: "sonnet", runs: 208, fail: .18, median: "34m",
    reads: ["piece", "draft", "agent"], writes: ["piece", "draft", "checks", "reviewer"],
    issues: ["c1", "c3", "c9"],
    prompt: `## Context

Draft the piece, then edit your own draft **before** you send it for review.

Write only for the channel the piece \`owns\`. If the angle needs a second
channel to work, stop and file a \`brief-gap\` learning naming the channel.

## Tasks

- [ ] Break the piece into a hook, a body, and a takeaway → draft
- [ ] Draft in the brand voice, per [voice](build/draft-guide.md) → draft
- [x] Run the voice + claims check on the draft → checks
- [ ] Re-read against [self-edit](build/self-edit.md), cut 20% → draft
- [ ] Send for review, the hook in the title → review

## Rules

1. Judge the draft against \`proves\`, not the outline you had in your head.
2. Full read-aloud pass before review; line edits while you write.
3. A claim you cannot source stays out, or goes in as an open question.`
  },
  {
    id: "review", from: "pr", to: "merged", name: "review + approve", kind: "runbook",
    trigger: "on arrival", runner: "opus · human gate", runs: 201, fail: .30, median: "8m",
    reads: ["draft", "checks", "reviewer"], writes: ["piece", "url", "shipped_at"],
    issues: ["c2", "c4", "c5", "c8", "c10"],
    prompt: `## Context

Review against the piece's \`proves\` line and the voice in \`VOICE.md\`. Nothing
else is in scope.

## Tasks

- [ ] Read proves, then the draft, in that order → review.notes
- [ ] Check the piece stays on its one claim and one channel → review.scope
- [ ] Check every claim against [the brand checklist](review/brand-checklist.md) → review.checks
- [ ] Send it back, or approve and stamp the url → url, shipped_at

## Rules

1. Send back to Drafting if the hook does not land in the first line.
2. Send back if the piece drifted onto a second claim.
3. **Do not send back for taste.** File a \`voice-drift\` learning and approve, so
   the rule exists next time.`
  },
  {
    id: "log", from: "merged", to: "feed", name: "measure performance", kind: "skill",
    trigger: "after every post", runner: "haiku", runs: 208, fail: .04, median: "30s",
    reads: ["metrics", "url"], writes: ["category", "channel", "post", "fold"],
    issues: [], broken: "reads `metrics`, which the Published shape does not define",
    prompt: `## Context

Read how the post did and log what it says about the **content** — what the
audience responded to. This is not process feedback: a claim that shipped
unsourced is a **system issue**, and those are logged off this loop, in System
mode.

Categories: \`overperformed\`, \`underperformed\`, \`audience-ask\`, \`channel-fit\`.

## Tasks

- [ ] Pull the post's first-week numbers → post
- [ ] Name the channel it ran on → channel
- [ ] Classify the signal into exactly one category → category
- [ ] Say where it folds back — a sharper pillar, or a decision → fold

## Rules

1. What landed stays in the factory. It sharpens the next strategy.
2. If the miss is the system's, not the content's, file a system issue instead —
   that does not belong on this ring.`
  },
  {
    id: "triage", from: "feed", to: "spec", name: "weekly retro", kind: "runbook",
    trigger: "manual · weekly", runner: "you", runs: 18, fail: .05, median: "20m",
    reads: ["post", "fold"], writes: ["pillars[]", "decisions[]"],
    issues: ["c6"],
    prompt: `## Context

Fold the week's **audience** feedback back into strategy. Every item here is
about the content and how it landed — what resonated and what fell flat. System
issues are a separate queue, off this loop, and are not in scope for this pass.

## Tasks

- [ ] Group the open results by pillar → buckets
- [ ] Turn each into a sharpened pillar or a numbered decision → pillars[], decisions[]
- [ ] Drop anything that is one post, not a pattern → buckets
- [ ] Close each item with the decision it became → results/*.md

## Rules

1. Audience feedback edits **strategy**, never the runbooks. Runbooks change in
   System mode, off this ring.
2. One post is a fluke; a pattern is a decision. Wait for the pattern.`
  },
];

const BACKS = [
  { from: "pr", to: "branch", label: "send back", note: "30% of reviews" },
];

const ISSUES = [
  { id: "c1",  cat: "skill-gap",  edge: "build",  t: "No skill for turning a product-photo set into a captioned carousel", run: "post 214", fix: true },
  { id: "c2",  cat: "review-miss",edge: "review", t: "Approved a reel claiming \"the #1 dot-grid on Amazon\" with no source", run: "post 209", fix: true },
  { id: "c3",  cat: "brief-gap",  edge: "build",  t: "Desk-shots pillar never says whether to feature the notebook or the workflow", run: "post 205", fix: false },
  { id: "c4",  cat: "off-brand",  edge: "review", t: "Three reels in a row opened on a loud trending sound, against the calm look", run: "post 201", fix: true },
  { id: "c5",  cat: "voice-drift",edge: "review", t: "Captions drifting from warm and plain to hypey — \"game-changer\", \"must-have\"", run: "post 198", fix: true },
  { id: "c6",  cat: "brief-gap",  edge: "triage", t: "Two decisions (D41, D48) both claim the brand's core promise", run: "post 194", fix: false },
  { id: "c7",  cat: "skill-gap",  edge: "plan",   t: "Planner cannot see what already ran on each channel, so it repeats angles", run: "post 190", fix: true },
  { id: "c8",  cat: "review-miss",edge: "review", t: "Reviewer accepted a caption CTA that was just \"link in bio\", no hook", run: "post 186", fix: true },
  { id: "c9",  cat: "off-brand",  edge: "build",  t: "Draft leaned on a discount code the brand had decided to stop running", run: "post 183", fix: false },
  { id: "c10", cat: "voice-drift",edge: "review", t: "Emoji creeping into the newsletter after a strong week on TikTok", run: "post 179", fix: true },
];

const ITEMS = {
  spec: [
    { id: "01", t: "Who this is for", s: "8 decisions · 1 open question", d: "ok" },
    { id: "02", t: "The core promise", s: "D41/D48 conflict · 1 open", d: "bad" },
    { id: "03", t: "Brand voice & look", s: "settled · warm, tactile, calm", d: "ok" },
    { id: "04", t: "Pillar · the second-brain method", s: "9 posts covering · complete", d: "ok" },
    { id: "05", t: "Pillar · desk & setup shots", s: "3 angles uncovered", d: "wait" },
    { id: "06", t: "Pillar · drops & restocks", s: "2 angles uncovered", d: "wait" },
  ],
  plans: [
    { id: "2.14", t: "the desk reset reel", s: "needs 2.1 · Instagram · buildable", d: "run" },
    { id: "2.19", t: "founder's why, 60-sec TikTok", s: "needs 2.14 · TikTok · blocked", d: "ok" },
    { id: "2.23", t: "5 journaling prompts carousel", s: "needs 1.6 · Instagram · buildable", d: "run" },
    { id: "2.27", t: "the A5 linen restock", s: "needs 2.4 · newsletter · blocked", d: "ok" },
    { id: "2.31", t: "one page, one idea (the method)", s: "no needs · LinkedIn · buildable", d: "run" },
    { id: "2.36", t: "unboxing the new cover", s: "needs 2.19 · Pinterest · blocked", d: "ok" },
  ],
  branch: [
    { id: "2.09", t: "the desk reset reel", s: "sonnet · 18m · Instagram", d: "run" },
    { id: "2.10", t: "newsletter · the restock issue", s: "sonnet · 8m · newsletter", d: "run" },
    { id: "2.11", t: "second-brain in 5 steps, carousel", s: "sonnet · 34m · stuck on a claim", d: "wait" },
    { id: "2.12", t: "TikTok · pen test, 12 inks", s: "sonnet · 4m · TikTok", d: "run" },
    { id: "2.13", t: "IG carousel · sunday reset prompts", s: "sonnet · 22m · Instagram", d: "run" },
  ],
  pr: [
    { id: "2.04", t: "founder's why, 60-sec TikTok", s: "checks green · waiting on you", d: "wait" },
    { id: "2.05", t: "the journaling-prompts carousel", s: "checks green · review running", d: "run" },
    { id: "2.06", t: "a stat with no source", s: "1 claim check failing", d: "bad" },
    { id: "2.07", t: "restock announcement, second pass", s: "checks green · review running", d: "run" },
  ],
  merged: [
    { id: "2.03", t: "the desk reset reel", s: "2h ago · instagr.am/a91", d: "ok" },
    { id: "2.02", t: "one page, one idea", s: "5h ago · tiktok/@mbb/7d2", d: "ok" },
    { id: "2.01", t: "the linen cover drop", s: "yesterday · instagr.am/3fe", d: "ok" },
    { id: "1.99", t: "sunday reset prompts", s: "yesterday · pin.it/c1b", d: "ok" },
    { id: "1.98", t: "how I use the index page", s: "yesterday · buttondown/0ab", d: "ok" },
    { id: "1.97", t: "the dot-grid explainer", s: "2d ago · lnkd.in/55c", d: "ok" },
  ],
  /* what landed — audience feedback on the published posts, not process misses.
     Each one stays in the factory and folds back into strategy. */
  feed: [
    { id: "#1", t: "desk-reset reel saved 3× the average", cat: "overperformed", channel: "Instagram", d: "ok", fix: true,
      report: "The desk-reset reel pulled 3× the account's average saves — reset content clearly resonates.",
      fold: "a sharper desk & setup shots pillar" },
    { id: "#2", t: "founder story overperforms on TikTok, not LinkedIn", cat: "channel-fit", channel: "TikTok", d: "wait", fix: true,
      report: "Founder-story clips underperform on LinkedIn but overperform on TikTok.",
      fold: "a decision on which channel founder content runs on" },
    { id: "#3", t: "every pen clip gets \"which pen?\"", cat: "audience-ask", channel: "comments", d: "ok", fix: true,
      report: "Every pen-on-paper clip fills with \"which pen?\" — the audience wants a guide.",
      fold: "a new angle under the second-brain method pillar" },
    { id: "#4", t: "restock newsletter drove the most clicks", cat: "overperformed", channel: "newsletter", d: "ok", fix: true,
      report: "The restock issue drove the most link clicks of any send this quarter.",
      fold: "a decision to lead restocks with the newsletter" },
    { id: "#5", t: "single photos flop next to carousels", cat: "underperformed", channel: "Instagram", d: "wait", fix: true,
      report: "Single product photos underperform carousels on the method pillar.",
      fold: "a format note on the method pillar" },
    { id: "#6", t: "reset prompts get the most saves — make a printable", cat: "audience-ask", channel: "Instagram", d: "ok", fix: false,
      report: "Sunday-reset prompts get the most saves; people keep asking for a printable.",
      fold: "a product idea for strategy, not just another post" },
    { id: "#7", t: "flat-lays quietly drive Pinterest visits", cat: "channel-fit", channel: "Pinterest", d: "ok", fix: true,
      report: "Flat-lay setups quietly drive the most profile visits on Pinterest.",
      fold: "more flat-lay in the desk & setup shots pillar" },
    { id: "#8", t: "trend-chasing audio tanked reach", cat: "underperformed", channel: "TikTok", d: "bad", fix: false,
      report: "A trending audio tanked reach and read off-brand in the comments.",
      fold: "reinforce the decision to sit loud trends out" },
    { id: "#9", t: "dot-grid explainer overperformed with the PKM crowd", cat: "overperformed", channel: "LinkedIn", d: "ok", fix: true,
      report: "The dot-grid explainer overperformed with the second-brain / PKM crowd.",
      fold: "a pillar angle aimed squarely at second-brain users" },
  ],
};
ITEMS.feed.forEach((f) => (f.s = `${f.cat} · ${f.channel}`));

padStations(STATES, ITEMS, 40,
  ["hook line", "desk shot", "reel", "carousel", "unboxing", "newsletter section", "flat-lay",
    "pen test", "quote card", "prompt list", "how-to", "restock post", "behind-the-scenes", "myth-buster",
    "setup tour", "checklist", "close-up", "founder story", "reader question", "prediction",
    "before / after", "review clip", "analogy", "call to action"],
  ["tighten the hook on", "cut the intro of", "add a CTA to", "reframe", "find the story for",
    "trim", "punch up the open of", "add a source to"]);

const RUN_PROC  = { branch: "build",  pr: "review", merged: "review" };
const RUN_MODEL = { branch: "sonnet", pr: "opus",   merged: "opus" };

const AGENTS = [
  {
    id: "r-209", slice: "2.09", title: "the desk reset reel", station: "branch",
    started: "18m ago", elapsed: "18m", pct: 60, status: "running",
    head: "Cutting the b-roll to the hook",
    log: [
      { k: "sys",  t: "Opened draft ../drafts/piece-2.09 · branched piece/2.09 off the calendar" },
      { k: "sys",  t: "Payload: piece 2.09, pillar 05 desk & setup shots, decisions D22 D31. Nothing else in scope." },
      { k: "say",  t: "A 15-second desk-reset reel for Instagram, the notebook at the centre of the tidy-up. Reading the `proves` line first — the hook has to promise the payoff in the first second, before anyone scrolls on." },
      { k: "tool", act: "Write", arg: "../drafts/piece-2.09/outline.md", sub: "hook · b-roll · caption" },
      { k: "say",  t: "Opening on the messy desk, not the product — the reset is the story, the notebook is the turn." },
      { k: "tool", act: "Edit", arg: "../drafts/piece-2.09/caption.md", sub: "+42 −0" },
      { k: "bash", cmd: "orca check --voice --claims", ok: true, out: "voice OK · 0 unsourced claims · caption grade 5" },
      { k: "say",  t: "Voice check is clean and the hook holds. Writing the caption CTA, then I self-edit and cut 20% before it goes to review." },
      { k: "tool", act: "Edit", arg: "../drafts/piece-2.09/caption.md", sub: "+18 −6" },
    ],
  },
  {
    id: "r-210", slice: "2.10", title: "newsletter · the restock issue", station: "branch",
    started: "8m ago", elapsed: "8m", pct: 32, status: "running",
    head: "Pulling the pillar before I draft",
    log: [
      { k: "sys",  t: "Opened draft ../drafts/piece-2.10 · branched piece/2.10 off the calendar" },
      { k: "say",  t: "Newsletter announcing the A5 linen restock. Reading pillar 06 and the restock decision it cites so each section lands on one decision." },
      { k: "tool", act: "Read", arg: "strategy/06-drops.md" },
      { k: "tool", act: "Edit", arg: "../drafts/piece-2.10/draft.md", sub: "+61 −0" },
    ],
  },
  {
    id: "r-211", slice: "2.11", title: "second-brain in 5 steps, carousel", station: "branch",
    started: "34m ago", elapsed: "34m", pct: 44, status: "waiting",
    head: "Stopped on an unsourced claim",
    question: {
      t: "Slide 2 says handwriting helps you remember 3× better. We have a source, but it's a blog on a small study — keep the number on the slide, or soften it?",
      opts: ["Keep 3×, cite the study in the caption", "Soften to \"helps it stick\"", "File a brief-gap and pause"],
    },
    log: [
      { k: "sys",  t: "Opened draft ../drafts/piece-2.11 · branched piece/2.11 off the calendar" },
      { k: "say",  t: "Turning the second-brain method into a 5-slide carousel. The `proves` line wants one idea per slide, so I'm splitting on the five steps." },
      { k: "tool", act: "Edit", arg: "../drafts/piece-2.11/slides.md", sub: "+88 −2" },
      { k: "bash", cmd: "orca check --voice --claims", ok: false, out: "claims: 1 unsourced\n  ● slide 2 \"remember 3× better\" — source is a blog, not the study" },
      { k: "say",  t: "The claims check flags slide 2. There is a source, but it is a blog summarising a small study, and I won't put a hard multiple on a slide without something solid behind it." },
      { k: "ask",  t: "Slide 2 says handwriting helps you remember 3× better. We have a source, but it's a blog on a small study — keep the number on the slide, or soften it?" },
    ],
  },
  {
    id: "r-212", slice: "2.12", title: "TikTok · pen test, 12 inks", station: "branch",
    started: "4m ago", elapsed: "4m", pct: 22, status: "running",
    head: "Sketching the hook options",
    log: [
      { k: "sys",  t: "Opened draft ../drafts/piece-2.12 · branched piece/2.12 off the calendar" },
      { k: "say",  t: "A TikTok testing 12 inks on the dot-grid paper — does it ghost, does it bleed. Trying three hooks before I commit to one." },
      { k: "tool", act: "Edit", arg: "../drafts/piece-2.12/hooks.md", sub: "+12 −0" },
    ],
  },
  {
    id: "r-213", slice: "2.13", title: "IG carousel · sunday reset prompts", station: "branch",
    started: "22m ago", elapsed: "22m", pct: 76, status: "running",
    head: "Self-editing the slides against the hook",
    log: [
      { k: "sys",  t: "Opened draft ../drafts/piece-2.13 · branched piece/2.13 off the calendar" },
      { k: "say",  t: "Ten-slide carousel of Sunday-reset journaling prompts. One prompt per slide, all pointing back at the method pillar." },
      { k: "tool", act: "Edit", arg: "../drafts/piece-2.13/slides.md", sub: "+96 −4" },
      { k: "bash", cmd: "orca check --voice --claims", ok: true, out: "voice OK · 0 unsourced claims · 10 slides" },
      { k: "say",  t: "Clean. Re-reading slide by slide against the hook, cutting the two that repeat the intro before I send it." },
    ],
  },
  {
    id: "r-205", slice: "2.05", title: "the journaling-prompts carousel", station: "pr",
    started: "9m ago", elapsed: "9m", pct: 55, status: "running",
    head: "Reviewing the draft against proves",
    log: [
      { k: "sys",  t: "Reviewing piece/2.05 · checks green" },
      { k: "say",  t: "Read `proves`, now walking the carousel. One prompt per slide, on the method pillar. Checking each caption against the brand checklist." },
      { k: "tool", act: "Read", arg: "../drafts/piece-2.05/slides.md" },
    ],
  },
  {
    id: "r-204", slice: "2.04", title: "founder's why, 60-sec TikTok", station: "pr",
    started: "3h ago", elapsed: "3h", pct: 82, status: "waiting",
    head: "Waiting on an approve call",
    question: {
      t: "The reel calls out a named competitor notebook to make the point. Approve it, or send back to make the point without naming them?",
      opts: ["Send back — make the point without naming", "Approve & publish — the comparison is fair"],
    },
    log: [
      { k: "sys",  t: "Reviewing piece/2.04 · checks green · waiting on you" },
      { k: "say",  t: "Read `proves`, then the reel. One claim, on brand, hook lands in the first second. One thing gives me pause." },
      { k: "tool", act: "Read", arg: "../drafts/piece-2.04/script.md" },
      { k: "say",  t: "The strongest beat names a competitor notebook to sharpen the contrast. It is fair, but the brand book leans away from naming rivals, and that's a call about the brand, not the edit — so I'm not approving or rejecting it on my own." },
      { k: "ask",  t: "The reel calls out a named competitor notebook to make the point. Approve it, or send back to make the point without naming them?" },
    ],
  },
  {
    id: "r-206", slice: "2.06", title: "a stat with no source", station: "pr",
    started: "16m ago", elapsed: "16m", pct: 55, status: "failed",
    head: "Claim check failing · unsourced stat",
    log: [
      { k: "sys",  t: "Reviewing piece/2.06 · checks red" },
      { k: "say",  t: "Reviewing the reel on why paper beats note apps." },
      { k: "bash", cmd: "orca check --claims", ok: false, out: "claims: 1 unsourced\n  ● \"you forget 90% of the notes you type\" — no source" },
      { k: "say",  t: "The claims check is red — a hard 90% with no source in the draft. That number needs a citation or it comes out, and neither is my call to make silently. Pausing rather than approving around a red check." },
    ],
  },
  {
    id: "r-203", slice: "2.03", title: "the desk reset reel", station: "merged",
    started: "2h ago", elapsed: "21m", pct: 100, status: "done", head: "Published · instagr.am/a91",
    log: [
      { k: "sys",  t: "Reviewing piece/2.03" },
      { k: "say",  t: "Proves lands, on brand, one claim. Approving and stamping the url." },
      { k: "bash", cmd: "orca publish", ok: true, out: "published piece/2.03 → live queue  instagr.am/a91" },
    ],
  },
  {
    id: "r-202", slice: "2.02", title: "one page, one idea", station: "merged",
    started: "5h ago", elapsed: "26m", pct: 100, status: "done", head: "Published · tiktok/@mbb/7d2",
    log: [
      { k: "sys",  t: "Reviewing piece/2.02" },
      { k: "say",  t: "Clean. Published and logged a voice-drift note on the hypey line in the caption so the rule exists next time." },
      { k: "bash", cmd: "orca publish", ok: true, out: "published piece/2.02 → live queue  tiktok/@mbb/7d2" },
    ],
  },
];

const PAGES = {
  "system/runbooks/plan/breakdown.md": {
    title: "how to cut a pillar",
    body: `Part of [plan the calendar](../plan.md), task 2.

## Context

One piece makes **one** claim. If you cannot write the \`proves\` line as a single
sentence a reader could repeat back, the cut is wrong.

## Tasks

- [ ] List every claim the pillar could support → scratch/claims.md
- [ ] Drop anything a published piece already made → scratch/claims.md
- [ ] Write the hook first, then the title → proves
- [ ] Split any cut whose hook needs the word "and" → pieces/*.md

## Smells

- A title that is a topic, not a claim. That is a category, not a piece.
- A piece that only makes sense once another unpublished one runs. Fold them.
- One angle stretched across three channels the same week. Space them.`
  },

  "system/runbooks/build/draft-guide.md": {
    title: "the brand voice",
    body: `Part of [draft + self-edit](../build.md), task 2. The readable half of
\`VOICE.md\`.

## Tasks

- [ ] Open on a scene or a claim, never a rhetorical question → draft
- [ ] One idea per paragraph, short sentences carry the weight → draft
- [ ] Say the number, or cut the number — no hedged stats → draft
- [ ] Cut the throat-clearing intro; start at the second paragraph → draft

> Plain and claim-first. If a line could open anyone's post, it is not ours yet.`
  },

  "system/runbooks/build/self-edit.md": {
    title: "self-edit",
    body: `Part of [draft + self-edit](../build.md), task 4. The same pass
[review + approve](../review.md) runs at the gate, so the writer editing itself
and the reviewer are reading one file.

## Context

Read the draft as a reader who did not write it and owes it nothing. The only
questions are whether the hook lands and whether it stayed on one claim.

## Tasks

- [ ] Read the hook alone. Does it carry the claim? → notes
- [ ] Cut the first paragraph and see if anything is lost → draft
- [ ] Remove every hedge — "maybe", "might", "sort of" → draft
- [ ] Cut 20% of the words without losing a claim → draft

## Rules

1. A takeaway that restates the hook is not a takeaway. Cut it.
2. Taste is not a blocker. File \`voice-drift\` so the rule exists next time.`
  },

  "system/runbooks/review/brand-checklist.md": {
    title: "brand checklist",
    body: `Part of [review + approve](../review.md), task 3. Every line is a
learning this loop logged and closed, not a rule that sounded sensible.

## Tasks

- [ ] Every hard number has a source in the draft? → checks
- [ ] Does the hook land the claim in the first line? → checks
- [ ] One claim, one channel, no drift onto a second? → checks
- [ ] Any hedge words the self-edit missed? → checks
- [ ] Does it name a competitor, and is that a call we want? → checks

## Where these came from

Each line traces to a post that missed. Nothing is here on taste.`
  },

  "system/runbooks/triage/redraw-an-edge.md": {
    title: "redrawing an edge",
    body: `Part of [weekly retro](../triage.md), rule 1.

## Context

Three learnings of one category on one edge means the edge is drawn wrong.
Patching the prompt again just spreads the same miss thinner.

## Tasks

- [ ] Name the state the edge is really trying to produce → states
- [ ] Split the edge in two, or move the boundary → system/loop.md
- [ ] Re-type the contracts either side of the new line → reads[], writes[]
- [ ] Close the three learnings against the redraw, not a patch → system/learnings/*.md

## Rules

1. A redraw bumps the **minor** version. A patch bumps the point.
2. If the redraw needs a new state, it needs a new glob. No state without a
   predicate you can count.`
  },

  "strategy/02-core-promise.md": {
    title: "the core promise",
    body: `Part of [The core promise](../02-the-core-promise.md). Split out because
the promise kept getting quoted on its own, and the conflict lives here.

## The promise

My Brain Books stands for one thing: **paper made for thinking, not just
writing.** Every pillar is a face of that promise, and every post cites a
pillar, never a mood.

## Open conflict

> Two decisions both claim the promise. D41 says it is "a calmer way to think on
> paper"; D48 says it is "the notebook for your second brain".
> [Learning #c6](../../system/learnings/c6.md) is open on it.

- [ ] Decide which is the spine and which is a pillar under it
- [ ] Re-cut any post that leaned on the loser while this was open

## Derived, never restated

A post's caption is derived from its one claim, never a second promise bolted on
at the end. Two promises in one post is the drift
[review + approve](../../system/runbooks/review.md) keeps catching.`
  },
};

const NAV = {
  system: [
    { id: "loop",    label: "The loop",    icon: "loop" },
    { id: "programs",label: "Programs",    icon: "book",  n: 6 },
    { id: "skills",  label: "Skills",      icon: "sparkle", n: 9 },
    { id: "issues",  label: "Defects",      icon: "flag", n: 10, loud: true },
    { id: "history", label: "Version history", icon: "clock", n: 27 },
  ],
  product: [
    { id: "loop",    label: "Board",       icon: "loop" },
    { id: "frontier",label: "Ready",       icon: "sparkle", n: 9 },
    { id: "slices",  label: "Pieces",      icon: "list",  n: 242 },
    { id: "specs",   label: "Strategy",    icon: "doc",   n: 12 },
    { id: "runs",    label: "In production", icon: "robot", n: 5 },
  ],
  agents: [
    { id: "live",   label: "Live",       icon: "robot" },
    { id: "needs",  label: "Needs you",  icon: "flag",   loud: true },
    { id: "queue",  label: "Queue",      icon: "list" },
    { id: "recent", label: "Recent",     icon: "clock" },
  ],
};

const HISTORY = [
  { v: "v27", t: "review: reject on any hard number with no source", s: "closed #c2 · 3h ago", who: "you" },
  { v: "v26", t: "log: require an edge on every learning", s: "closed #c11 · yesterday", who: "you" },
  { v: "v25", t: "draft: cut 20% self-edit pass added", s: "proposed by retro · 2d ago", who: "retro" },
  { v: "v24", t: "plan: read channel history before cutting", s: "closed #c7 · 3d ago", who: "you" },
  { v: "v23", t: "review: stop rejecting for taste, file drift instead", s: "closed #c5 · 5d ago", who: "you" },
  { v: "v22", t: "dispatch: channel-clash check before opening a draft", s: "6d ago", who: "you" },
];

const TERMS = {
  unit: "piece", Unit: "Piece", units: "pieces",
  worktree: "../drafts/piece-", branchPre: "piece/", doneLabel: "published", off: "the calendar",
  issueDir: "system/learnings/c-", issueBase: "system/learnings/",
  publishCmd: "orca publish", publishOut: (s) => `published piece/${s} → live queue  ${s.replace(".", "")}url`,
};
const COPY = {
  productStat: "242 pieces · 28 in calendar · 47 decisions",
  issuesWord: "issues",
  readyWord: "ready",
  sourceWord: "pillar",
  blockCat: "brief-gap",
  productWord: "content",
  frontierSub: "every dependency published, no channel clash the same day",
  slicesSub: "242 total · 214 published · 28 in calendar",
  specsSub: "12 strategy docs · 47 decisions · 6 pillars",
  runsSub: "what the studio is drafting right now",
  queueSub: "ready pieces the studio can assign — every dependency published, no channel clash",
  queueChain: "assign → draft + self-edit",
  body: {
    readSpec: "Read the pillar and every decision it cites",
    openWork: "Open the draft and branch off the calendar",
    implement: "Draft inside the piece's channel only — one claim, one channel",
    selfReview: "Self-edit against the hook, per [self-edit](../system/runbooks/build/self-edit.md)",
    raise: "Send for review with the hook and channel in the title",
    proves: (t) => `A reader hitting **${t}** takes away the one thing it promises —\nthe hook lands and the claim is theirs to repeat, without seeing the brief.`,
    owns: (s) => `\`posts/${s}.md\``,
    specDecisions: [
      "the pillar is the unit a post cites, never a mood.",
      "one claim per post — if it needs an \"and\", it is two posts.",
      "every post points back to one numbered decision in the strategy.",
    ],
    specQs: { open: "Does this pillar still hold across a whole campaign, not just one post?",
      done: "Is there a channel where this angle is already worn out?" },
  },
};
const EXTRA_SKILLS = [
  { name: "pull brand voice", from: "-", to: "-", trigger: "called", runs: 1210, issues: [] },
  { name: "channel history",  from: "-", to: "-", trigger: "called", runs: 602,  issues: [] },
  { name: "claim check",      from: "-", to: "-", trigger: "called", runs: 208,  issues: [] },
];

return { repo: REPO, states: STATES, procs: PROCS, backs: BACKS, issues: ISSUES,
  items: ITEMS, agents: AGENTS, runProc: RUN_PROC, runModel: RUN_MODEL,
  pages: PAGES, nav: NAV, history: HISTORY, terms: TERMS, copy: COPY, extraSkills: EXTRA_SKILLS };
}

DATASETS["email-agent"] = makeEmailAgent();
DATASETS["my-brain"]    = makeMyBrain();
loadWorkspace("email-agent");
