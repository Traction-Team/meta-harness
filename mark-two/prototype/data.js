/* ═══════════════════════════════════════════════════════════════ data ══
   Meta Harness Mark II.

   A factory is made of three canvas primitives and one off-canvas resource:

   - ARTIFACT GROUPS  a filtered list of things the factory can act on. Not one
                      document — a collection, defined by a source + a filter.
   - PROGRAMS         transform artifacts from one group into another. A prose
                      job definition: what it accepts, what it produces, whether
                      an agent or a person runs it, the skills it may load, and
                      the instructions to follow.
   - SUBSYSTEMS       group part of the factory behind one boundary, with
                      declared inputs and outputs. Opening one replaces the
                      parent canvas with its internal canvas.
   - SKILLS           capabilities a program loads (GitHub, browser, testing …).
                      They live on the shelf, never on the canvas, and attach
                      through a program's definition.

   Mark II separates the DEFINITION of the factory from its LIVE STATE. The
   definition (groups, programs, subsystems, connections, contracts) is what
   System mode draws. Counts, items, dwell and agent activity are live state and
   belong to Factory mode only — so `count`, `dwell`, `ITEMS` and `AGENTS` below
   are never read by the System canvas. */

const WORKSPACES = [
  { id: "email-agent", name: "email-agent", i: "EA", h: 212, sub: "AI-native email client" },
];

let REPO, STATES, PROCS, BACKS, INPUTS, ISSUES, ITEMS, AGENTS, RUN_PROC, RUN_MODEL,
    PAGES, NAV, HISTORY, PRODUCT, PROGRAMS, SKILLS, SOURCES, SUBSYSTEMS,
    CANVASES, TERMS, COPY, PROGRAM_DEFS;
const DATASETS = {};

function loadWorkspace(id) {
  const d = DATASETS[id] || DATASETS["email-agent"];
  REPO = d.repo; STATES = d.states; PROCS = d.procs; BACKS = d.backs; INPUTS = d.inputs || [];
  ISSUES = d.issues; ITEMS = d.items; AGENTS = d.agents;
  RUN_PROC = d.runProc; RUN_MODEL = d.runModel;
  PAGES = d.pages; NAV = d.nav; HISTORY = d.history; PRODUCT = d.product;
  TERMS = d.terms; COPY = d.copy;
  SOURCES = d.sources; SKILLS = d.skills; SUBSYSTEMS = d.subsystems; CANVASES = d.canvases;
  PROGRAM_DEFS = d.programDefs;
  /* every program is just a program — no agent/person split anymore */
  PROGRAMS = PROCS;
}

/* padded plausible history so a group reads full in Factory mode without
   hand-writing hundreds of rows. Live state only — never shown in System. */
function padStations(STATES, ITEMS, PANEL_MAX, NOUN, VERB) {
  const SHA = "0123456789abcdef";
  const sha = (n) => Array.from({ length: 7 }, (_, k) => SHA[(n * 7 + k * 13) % 16]).join("");
  const AGO = ["2d ago", "3d ago", "4d ago", "last week", "last week", "2 weeks ago", "3 weeks ago"];

  STATES.forEach((s) => {
    const list = ITEMS[s.id]; if (!list) return;
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
const REPO = { name: "email-agent", branch: "main", sysVersion: "v41" };

/* ── artifact SOURCE TYPES. Where a stage's artifacts come from. A stage binds
      one of these plus a filter — the source is an attribute of the stage, not
      its own shelf class. ── */
const SOURCES = [
  { id: "repo-files",    name: "Repository files",     icon: "doc",    sub: "paths in the repo matching a glob" },
  { id: "git-branches",  name: "Git branches",         icon: "branch", sub: "refs matching a pattern" },
  { id: "github-prs",    name: "GitHub pull requests", icon: "pr",     sub: "PRs selected by state, branch, or label" },
  { id: "plan-docs",     name: "Plan documents",       icon: "list",   sub: "plans selected by status" },
  { id: "feedback-docs", name: "Feedback documents",   icon: "flag",   sub: "reports awaiting triage" },
];

/* ── the shelf, part 2: SKILLS. Capabilities a program loads. Never a node or an
      edge — they attach through a program's definition and stay on the shelf. ── */
const SKILLS = [
  { id: "github",      name: "GitHub",            icon: "pr",      desc: "open, review, and merge pull requests", runs: 623 },
  { id: "browser",     name: "Browser use",       icon: "globe",   desc: "drive the running app in a real browser", runs: 96 },
  { id: "testing",     name: "Testing",           icon: "task",    desc: "run the narrowest suite that could fail", runs: 844 },
  { id: "code-review", name: "Code review",       icon: "eye",     desc: "read a diff against proves and the conventions", runs: 512 },
  { id: "read-spec",   name: "Read spec section", icon: "doc",     desc: "load a section and every decision it cites", runs: 1902 },
  { id: "frontier",    name: "Frontier query",    icon: "sparkle", desc: "find buildable plans with no owns collision", runs: 731 },
];

/* ── STAGES. A stage is a filtered list of artifacts, defined by a `source` and
      a `filter`. `shape` is what each artifact looks like. `count`/`dwell` are
      LIVE state (Factory mode only); the System canvas shows name + filter +
      source. Artifacts flow between stages along the programs. ── */
const STATES = [
  { id: "spec",   name: "Product spec",   source: "repo-files",    filter: "docs/**/*.md",                icon: "doc",    count: 18,
    shape: ["title", "problem", "constraints[]", "decisions[]"],
    dwell: { median: "9d 4h", p90: "41d", oldest: "63d", inW: 2, outW: 2,
      trend: [7, 8, 6, 9, 11, 9, 10, 9], unit: "d",
      note: "a spec section sits until something forces a cut" } },

  { id: "plans",  name: "Build plans",    source: "plan-docs",     filter: "slices/*.md · status=planned", icon: "list",   count: 41,
    shape: ["id", "needs[]", "owns[]", "spec", "proves"],
    dwell: { median: "2d 6h", p90: "9d 1h", oldest: "17d", inW: 21, outW: 18,
      trend: [1.4, 1.6, 1.9, 2.1, 2.0, 2.4, 2.2, 2.3], unit: "d",
      note: "blocked slices are the long tail, not slow planning" } },

  { id: "branch", name: "Worker branch",  source: "git-branches",  filter: "git · worktrees/slice-*",      icon: "branch", count: 6,
    shape: ["slice", "branch", "agent", "started_at"],
    dwell: { median: "22m", p90: "1h 40m", oldest: "3h 06m", inW: 18, outW: 18,
      trend: [26, 24, 25, 21, 23, 20, 22, 22], unit: "m", note: "" } },

  { id: "pr",     name: "Worker PR",      source: "github-prs",    filter: "gh · pr head:slice/*",         icon: "pr",     count: 3,
    shape: ["slice", "diff", "checks", "reviewer"],
    dwell: { median: "4h 10m", p90: "1d 6h", oldest: "2d 3h", inW: 18, outW: 17,
      trend: [3.1, 3.6, 4.4, 3.9, 5.2, 4.6, 4.0, 4.2], unit: "h",
      note: "the wait is the human gate, not the checks" } },

  { id: "merged", name: "Closed PR",      source: "github-prs",    filter: "gh · pr is:closed is:merged",  icon: "pr",     count: 273,
    shape: ["slice", "pr", "sha", "merged_at"],
    dwell: { median: "40s", p90: "2m 10s", oldest: "12m", inW: 17, outW: 17,
      trend: [.7, .6, .7, .6, .7, .6, .7, .7], unit: "m", note: "" } },

  { id: "feed",   name: "Feedback",       source: "feedback-docs", filter: "feedback/*.md · triaged=false", icon: "flag",  count: 9,
    shape: ["category", "area", "report", "fold"],
    dwell: { median: "6d 2h", p90: "19d", oldest: "24d", inW: 5, outW: 3,
      trend: [3.1, 3.8, 4.2, 5.0, 5.4, 5.1, 5.9, 6.1], unit: "d",
      note: "product feedback waits here for the weekly triage to fold it in" } },
];

/* ── PROGRAMS. Each transforms the artifacts of one stage into another. `accepts` and
      `produces` are the artifact shapes it reads and writes — the contract.
      `skills` are ids into SKILLS, loaded from the shelf. `instructions` is the
      prose job definition. `def` names the account-level program it instances.
      `runs`/`fail`/`median`/`issues` are LIVE state (Factory only). ── */
const PROCS = [
  {
    id: "plan", def: "plan-feature", from: "spec", to: "plans", name: "plan feature",
    pos: [584, 630],
    skills: ["read-spec", "frontier"],
    trigger: "manual", runner: "opus", runs: 64, fail: .09, median: "4m 20s",
    accepts: ["problem", "constraints[]", "decisions[]"], produces: ["id", "needs[]", "owns[]", "spec", "proves"],
    issues: ["i7"],
    instructions: `## Context

You are cutting a **product spec** into build slices. Read the section named in
\`$SPEC\`, plus every decision that section cites. Nothing else is in scope.

> Never invent a constraint the spec does not state. If the spec is ambiguous,
> stop and file a \`spec-ambiguity\` defect instead of guessing.

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
- [ ] Diff owns against the live frontier, report overlaps → system/defects/*.md

## Rules

1. A slice is too big if \`owns\` lists more than six files. Split it.
2. Two slices may not own the same path.
3. Report collisions. Do not resolve them yourself.`
  },
  {
    id: "dispatch", def: "dispatch-slice", from: "plans", to: "branch", name: "dispatch slice",
    skills: ["frontier", "github"],
    trigger: "on arrival · frontier only", runner: "orca", runs: 314, fail: .02, median: "8s",
    accepts: ["needs[]", "owns[]"], produces: ["slice", "branch", "agent", "started_at"],
    issues: [],
    instructions: `## Context

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
    id: "build", def: "build-self-review", from: "branch", to: "pr", name: "build + self-review",
    skills: ["testing", "code-review", "browser"],
    trigger: "on arrival", runner: "sonnet", runs: 308, fail: .21, median: "22m",
    accepts: ["slice", "branch", "agent"], produces: ["slice", "diff", "checks", "reviewer"],
    issues: ["i1", "i3", "i9", "i11"],
    instructions: `## Context

Build the slice, then review your own diff **before** you raise it.

Work only inside the paths the slice \`owns\`. If the job needs a file the slice
does not own, stop and file a \`spec-ambiguity\` defect naming the path.

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
    id: "review", def: "review-merge", from: "pr", to: "merged", name: "review + merge",
    skills: ["code-review", "github"],
    trigger: "on arrival", runner: "you", runs: 301, fail: .34, median: "6m",
    accepts: ["diff", "checks", "reviewer"], produces: ["slice", "sha", "shipped_at"],
    issues: ["i2", "i4", "i5", "i8", "i10", "i12"],
    instructions: `## Context

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
3. **Do not reject for taste.** File a \`convention-drift\` defect and merge, so
   the rule exists next time.`
  },
  {
    id: "log", def: "capture-notes", from: "merged", to: ["spec", "plans"], name: "capture landing notes",
    fromSide: "bottom", toSide: "bottom",
    pos: [314, 749],
    skills: ["frontier", "github"],
    trigger: "after every PR closes", runner: "haiku", runs: 308, fail: .04, median: "1m 30s",
    accepts: ["slice", "pr", "sha"], produces: ["constraints[]", "decisions[]", "id", "needs[]", "owns[]", "spec", "proves"],
    issues: [],
    instructions: `## Context

The landing orchestrator runs after every PR closes. Read the worker and reviewer
notes left on the PR. Fold product decisions back into the **product spec**, and
cut unresolved implementation findings into **build plans**.

## Tasks

- [ ] Read the merged PR thread and worker handoff for the slice → notes
- [ ] Separate product decisions from unresolved implementation findings → notes, findings
- [ ] Turn product decisions into spec constraints or numbered decisions → constraints[], decisions[]
- [ ] Cut each implementation finding into one provable build plan → slices/*.md
- [ ] Order new plans against the merged frontier and claim their paths → needs[], owns[]
- [ ] Cite the PR and sha that surfaced each output → decisions[], spec

## Rules

1. A deliberate product trade-off becomes a decision, in the worker's words.
2. Only cut follow-up work that the closed PR actually surfaced. Do not widen scope.
3. Resolved review comments are done. A harness failure is a system defect.`
  },
  {
    id: "triage", def: "triage-feedback", from: "feed", to: "spec", name: "triage feedback",
    skills: ["read-spec"],
    trigger: "manual · weekly", runner: "you", runs: 21, fail: .05, median: "3m",
    accepts: ["report", "fold"], produces: ["constraints[]", "decisions[]"],
    issues: ["i6"],
    instructions: `## Context

Fold the week's **product** feedback back into the spec. Every item here is
about the product — what shipped and what it taught you. System defects are a
separate queue, off this loop, and are not in scope for this pass.

## Tasks

- [ ] Group the open feedback by area → buckets
- [ ] Turn each into a spec constraint or a numbered decision → constraints[], decisions[]
- [ ] Drop anything that is one report, not a pattern → buckets
- [ ] Close each item with the constraint id it became → feedback/*.md

## Rules

1. Product feedback edits the **spec**, never the programs. Programs change in
   System mode, off this ring.
2. One report is a fluke; a pattern is a decision. Wait for the pattern.`
  },
];

/* the back edge everyone's real process has and nobody's diagram admits to.
   Lives inside the Delivery subsystem, where review sends work back to branch. */
const BACKS = [
  { from: "pr", to: "branch", label: "rework", note: "34% of reviews" },
];

/* ── SUBSYSTEMS. A subsystem groups part of the factory behind one boundary. It
      declares its inputs and outputs; the parent canvas draws it as a frame and
      does not render its children. Opening it swaps in its internal canvas. ── */
const SUBSYSTEMS = [
  { id: "delivery", name: "Delivery", icon: "box", canvas: "delivery",
    inputs: ["plans"], outputs: ["merged"],
    sub: "build plans → worker branches → PRs → closed PRs",
    contains: { groups: ["branch", "pr"], programs: ["dispatch", "build", "review"] } },
];

/* ── CANVASES. The definition is a set of canvases: the top-level `root`, and one
      internal canvas per subsystem. Each canvas lists the nodes on it (artifact
      groups and subsystem frames, with grid positions), the programs whose
      endpoints sit on it, plain connections into/out of subsystems, the input
      programs feeding it, and any back edges. This is what geo() lays out. ── */
const CANVASES = {
  root: {
    id: "root", name: "email-agent",
    nodes: [
      { id: "feed",     grid: [0, 0], pos: [216, 252] },
      { id: "spec",     grid: [0, 1], pos: [220, 564] },
      { id: "plans",    grid: [1, 1], pos: [777, 649] },
      { id: "delivery", grid: [2, 1], subsystem: true, pos: [773, 912] },
      { id: "merged",   grid: [3, 1], pos: [215, 935] },
    ],
    programs: ["triage", "plan", "log"],
    connections: [
      { from: "plans", to: "delivery", label: "in" },
      { from: "delivery", to: "merged", label: "out" },
    ],
    inputs: ["bugs", "requests", "signals"],
    backs: [],
  },
  delivery: {
    id: "delivery", name: "Delivery", parent: "root",
    nodes: [
      { id: "plans",  grid: [0, 0], boundary: "in" },
      { id: "branch", grid: [1, 0] },
      { id: "pr",     grid: [2, 0] },
      { id: "merged", grid: [2, 1], boundary: "out" },
    ],
    programs: ["dispatch", "build", "review"],
    connections: [],
    inputs: [],
    backs: [{ from: "pr", to: "branch", label: "rework" }],
  },
};

/* ── input programs: the raw work that flows INTO the factory from outside. Each
      is a program with an OPEN input (nothing upstream feeds it — the operator
      does), so it draws as a pill rather than a box. It produces feedback items. ── */
const INPUTS = [
  { id: "bugs",     to: "feed", name: "Bug reports",      sub: "from users", icon: "flag",    count: 12, source: "feedback-docs", pos: [57, 62] },
  { id: "requests", to: "feed", name: "Feature requests", sub: "from users", icon: "sparkle", count: 7,  source: "feedback-docs", pos: [56, 113] },
  { id: "signals",  to: "feed", name: "Usage signals",    sub: "telemetry",  icon: "heat",    count: 34, source: "feedback-docs", pos: [54, 162] },
];

/* ── DEFECTS. Friction the factory logs about its own wiring, attributed to a
      program, never to a stage. Operational — never on the System
      canvas; reached through the Defects list. ── */
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

/* ── LIVE STATE: the artifacts sitting in each stage right now (Factory / the
      Artifacts browser). `final: true` marks an artifact as a finished output —
      independent of which stage it is at — so the Artifacts mode can default to
      showing just the finals. ── */
const ITEMS = {
  spec: [
    { id: "01", t: "Product concept", s: "12 decisions · 3 open questions", d: "ok" },
    { id: "02", t: "Schema", s: "§3 ambiguous · 1 defect open", d: "bad" },
    { id: "03", t: "Sync engine", s: "8 slices covering · complete", d: "ok" },
    { id: "04", t: "Agent runtime", s: "4 sections uncovered", d: "wait" },
    { id: "05", t: "Shell decision", s: "settled · Electron", d: "ok", final: true },
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
    { id: "1.37", t: "reading pane hairlines", s: "2h ago · a91f3c2", d: "ok", final: true },
    { id: "1.36", t: "sidebar label twisty", s: "4h ago · 7d20e18", d: "ok", final: true },
    { id: "1.35", t: "palette @ context", s: "6h ago · 3fe9a04", d: "ok", final: true },
    { id: "1.34", t: "strip guard chip", s: "yesterday · c1b7f56", d: "ok", final: true },
    { id: "1.33", t: "thread summary block", s: "yesterday · 0ab4d91", d: "ok", final: true },
    { id: "1.32", t: "compose overlay card", s: "yesterday · 55c3e77", d: "ok", final: true },
  ],
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
   LIVE STATE. A run is one harness session dispatched by a program, sitting on
   one slice in one stage and executing the program out of it. Factory
   mode only — never read by the System canvas. */

const RUN_PROC  = { branch: "build",  pr: "review", merged: "review" };
const RUN_MODEL = { branch: "sonnet", pr: "opus",   merged: "opus" };

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
      opts: ["Scroll back to the restored thread", "Stay put, just re-insert the row", "File a spec-ambiguity defect and pause"],
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
    id: "r-150", slice: "1.50", title: "model switcher pop", station: "spec", proc: "plan", model: "opus",
    started: "3m ago", elapsed: "3m", pct: 20, status: "running",
    head: "Sketching the popover shell",
    log: [
      { k: "sys",  t: "Opened worktree ../wt/1.50 · branched slice/1.50 off main" },
      { k: "say",  t: "Building the model switcher popover off the strip chip. Shell and open/close first, then the list." },
      { k: "tool", act: "Edit", arg: "src/strip/ModelPop.tsx", sub: "+40 −0" },
    ],
  },
  {
    id: "r-153", slice: "1.53", title: "calendar day popover", station: "merged", proc: "log", model: "haiku",
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
    id: "r-155", slice: "1.55", title: "list send button", station: "feed", proc: "triage", model: "opus",
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

/* ── nested pages under a program's instructions. `system/programs/build.md`
      owns everything under `system/programs/build/`; the parent reaches a child
      with an ordinary relative markdown link. The path is the hierarchy. ── */
const PAGES = {
  "system/programs/plan/breakdown.md": {
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

  "system/programs/build/test-strategy.md": {
    title: "test strategy",
    body: `Part of [build + self-review](../build.md), task 3.

## Context

Run the narrowest suite that could fail because of this diff. The full suite is
a pre-flight check, not a feedback loop. This page is loaded through the
**Testing** skill.

## Tasks

- [x] Map the changed files to their nearest test files → suite
- [ ] Run that suite on every save → checks
- [ ] Run the full suite once, immediately before raising → checks
- [ ] Attach the failing output verbatim, never a summary of it → output

> A test that needed changing to make the diff pass is a finding, not a chore.
> Say so in the PR body.`
  },

  "system/programs/build/code-review.md": {
    title: "code review",
    body: `Part of [build + self-review](../build.md), task 4. The same page
[review + merge](../review.md) uses on the edge into Closed PR, so the agent
reviewing itself and the person at the human task are reading one file. Loaded
through the **Code review** skill.

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

  "system/programs/build/code-review/checklist.md": {
    title: "review checklist",
    body: `Part of [code review](../code-review.md). Nested one deeper because it
changes every week and the program above it does not.

## Tasks

- [ ] Does anything here become a second source of truth? → findings
- [ ] Is state written in two places for one fact? → findings
- [ ] Does an error path leave the UI in a half state? → findings
- [ ] Any inline styles, against AGENTS.md? → findings
- [ ] Does the commit message keep the slice id prefix? → findings

## Where these came from

Every line is a defect this factory logged and closed. Nothing goes on this list
because it sounded sensible.`
  },

  "system/programs/review/conventions.md": {
    title: "conventions",
    body: `Part of [review + merge](../review.md), task 3. This page is the
readable half of \`AGENTS.md\`.

## Tasks

- [ ] Slice titles read \`n.nn verb-noun\` → review.conventions
- [ ] Commit messages open with the slice id → review.conventions
- [ ] No inline styles, tokens only → review.conventions
- [ ] Every new file is claimed by exactly one slice → review.conventions

> Drift shows up here first. When a convention gets broken three times, it is
> the convention that is wrong.`
  },

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
> [defect #i3](../../system/defects/i3.md) is open against it.

- [ ] Decide, then write it as a numbered decision, not as prose
- [ ] Re-cut any slice that guessed while this was open

## Derived, never stored

Unread count, participant list and last-activity are derived from messages on
read. Storing any of them creates the second source of truth that
[review + merge](../../system/programs/review.md) keeps catching.`
  },

  "system/programs/triage/redraw-a-program.md": {
    title: "redrawing a program",
    body: `Part of [triage feedback](../triage.md), rule 1.

## Context

Three defects of one category on one program means the program is drawn wrong.
Patching the instructions again just spreads the same failure thinner.

## Tasks

- [ ] Name the stage the program is really trying to produce → stages
- [ ] Split the program in two, or move the boundary → system/canvas.md
- [ ] Re-type the contracts either side of the new line → accepts[], produces[]
- [ ] Close the three defects against the redraw, not against a patch → system/defects/*.md

## Rules

1. A redraw bumps the **minor** version. A patch bumps the point.
2. If the redraw needs a new stage, it needs a new filter. No stage
   without a predicate you can count.`
  },
};

/* The Artifacts browser is where you read the things the factory produces. It
   defaults to the finals (see `final` on ITEMS) — coherent releases and where
   they can be experienced — and widens to every artifact at any stage. */
const PRODUCT = {
  noun: "release",
  itemWord: "features",
  summary: "The email client people can use, not the work moving through the factory.",
  promotable: true,
  lanes: [{ id: "development", name: "Development" }, { id: "staging", name: "Staging" }, { id: "production", name: "Production" }],
  nav: [
    { id: "overview", label: "Browse", icon: "box" },
    { id: "environments", label: "Environments", icon: "globe", n: 3 },
  ],
  releases: [
    { id: "0.18.0", title: "A calmer reading pane", status: "ready", stage: "development", time: "2h ago", date: "28 Aug 2026",
      sha: "a91f3c2", pr: "#418", url: "https://email-agent.dev/releases/0.18.0", preview: "https://preview.email-agent.dev/0-18-0",
      note: "Long threads now stay anchored while messages collapse, with quieter dividers and a persistent thread summary.",
      slices: ["1.37", "1.33"], changes: ["Reading pane hairlines no longer jump during collapse", "Thread summaries remain visible through long conversations", "Improved keyboard focus across message boundaries"],
      envs: [{ name: "Development", state: "live" }, { name: "Staging", state: "pending" }, { name: "Production", state: "pending" }] },
    { id: "0.17.0", title: "Labels where you need them", status: "ready", stage: "staging", time: "yesterday", date: "27 Aug 2026",
      sha: "7d20e18", pr: "#411", url: "https://email-agent.dev/releases/0.17.0", preview: "https://preview.email-agent.dev/0-17-0",
      note: "The sidebar label tree is easier to scan, search, and use without leaving the current thread.",
      slices: ["1.36"], changes: ["Expandable label groups in the sidebar", "Nested labels included in rail search", "Current label remains visible while reading"],
      envs: [{ name: "Production", state: "pending" }, { name: "Staging", state: "live" }] },
    { id: "0.16.2", title: "Safer bulk actions", status: "live", stage: "production", time: "2d ago", date: "26 Aug 2026",
      sha: "c1b7f56", pr: "#406", url: "https://email-agent.dev/releases/0.16.2", preview: "https://preview.email-agent.dev/0-16-2",
      note: "Archive, label, and undo actions now show their scope before changing a whole selection.",
      slices: ["1.34", "1.32"], changes: ["Guard chip shows the selected action and count", "Undo restores the full previous thread state", "Bulk bar remains reachable from the keyboard"],
      envs: [{ name: "Production", state: "live" }, { name: "Staging", state: "live" }] },
  ],
  environments: [
    { id: "development", name: "Development", branch: "slice/*", state: "active", version: "0.18.0", updated: "now", url: "https://preview.email-agent.dev", note: "One isolated deployment per open PR" },
    { id: "staging", name: "Staging", branch: "main", state: "healthy", version: "0.17.0", updated: "18m ago", url: "https://staging.email-agent.dev", note: "Seeded accounts · production schema" },
    { id: "production", name: "Production", branch: "main", state: "healthy", version: "0.16.2", updated: "2d ago", url: "https://email-agent.dev", note: "Public app · 100% traffic" },
  ],
};

/* ── the rails ── */
const NAV = {
  system: [
    { id: "loop",       label: "Layout",  icon: "layout" },
    { id: "artifacts",  label: "Stages",       icon: "list",  n: 6 },
    { id: "programs",   label: "Programs",     icon: "book",  n: 6 },
    { id: "subsystems", label: "Subsystems",   icon: "box",   n: 1 },
    { id: "skills",     label: "Skills",       icon: "sparkle", n: 6 },
    { id: "issues",     label: "Defects",      icon: "flag",  n: 12, loud: true },
    { id: "history",    label: "Version history", icon: "clock", n: 41 },
  ],
  factory: [
    { id: "loop", label: "Board", icon: "board" },
  ],
  product: PRODUCT.nav,
};

const HISTORY = [
  { v: "v41", t: "review + merge: reject on any path outside owns", s: "closed #i9 · 2h ago", who: "you" },
  { v: "v40", t: "capture landing notes: require a program on every defect", s: "closed #i13 · yesterday", who: "you" },
  { v: "v39", t: "build + self-review: added run-the-app step via Browser skill", s: "proposed by triage · 2d ago", who: "triage" },
  { v: "v38", t: "plan feature: read coverage before cutting", s: "closed #i7 · 3d ago", who: "you" },
  { v: "v37", t: "review + merge: stop rejecting for taste, file drift instead", s: "closed #i5 · 4d ago", who: "you" },
  { v: "v36", t: "dispatch slice: frontier check before opening a worktree", s: "5d ago", who: "you" },
];

/* ── account-level PROGRAM DEFINITIONS. A program placed on a canvas is an
      instance of one of these; several systems can reuse the same definition. ── */
const PROGRAM_DEFS = [
  { id: "plan-feature",      name: "Plan feature",        sub: "product brief → build plans" },
  { id: "dispatch-slice",    name: "Dispatch slice",      sub: "build plan → worker branch" },
  { id: "build-self-review", name: "Build + self-review", sub: "build plan → worker branch" },
  { id: "review-merge",      name: "Review + merge",     sub: "worker PR → closed PR" },
  { id: "capture-notes",     name: "Capture landing notes", sub: "closed PR → product spec + build plans" },
  { id: "triage-feedback",   name: "Triage feedback",    sub: "feedback → product spec" },
];

const TERMS = {
  unit: "slice", Unit: "Slice", units: "slices",
  worktree: "../wt/", branchPre: "slice/", doneLabel: "merged", off: "main",
  issueDir: "system/defects/i-", issueBase: "system/defects/",
  publishCmd: "gh pr merge --squash", publishOut: (s) => `merged slice/${s} → main  ${s.replace(".", "")}f0`,
};
const COPY = {
  productStat: "314 slices · 436 needs · 301 decisions",
  issuesWord: "defects",
  readyWord: "buildable",
  sourceWord: "spec section",
  blockCat: "spec-ambiguity",
  productWord: "product",
  frontierSub: "every need merged, no owns collision",
  slicesSub: "314 total · 273 merged · 41 planned",
  specsSub: "18 docs · 301 decisions · 434 citations",
  runsSub: "what the orchestrator is holding",
  queueSub: "buildable slices the orchestrator can dispatch — every need merged, no owns collision",
  queueChain: "dispatch slice → build + self-review",
  body: {
    readSpec: "Read the spec section and every decision it cites",
    openWork: "Open the worktree and branch off main",
    implement: "Implement inside `owns` only",
    selfReview: "Self-review against proves, per [code review](../system/programs/build/code-review.md)",
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

return { repo: REPO, states: STATES, procs: PROCS, backs: BACKS, inputs: INPUTS, issues: ISSUES,
  items: ITEMS, agents: AGENTS, runProc: RUN_PROC, runModel: RUN_MODEL,
  pages: PAGES, nav: NAV, history: HISTORY, product: PRODUCT, terms: TERMS, copy: COPY,
  sources: SOURCES, skills: SKILLS, subsystems: SUBSYSTEMS, canvases: CANVASES, programDefs: PROGRAM_DEFS };
}

DATASETS["email-agent"] = makeEmailAgent();
loadWorkspace("email-agent");
