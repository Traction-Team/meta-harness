/* ═══════════════════════════════════════════════════════════════ data ══
   Meta Harness Mark II · workspace: agent-mail.

   This factory builds agent-mail — an AI-native email client — the way it is
   actually built: spec-driven, agent-orchestrated. Prose docs say what the
   product is, specs say what gets built one level above code, plan-phase cuts a
   phase into a build queue, the orchestrator fans buildable slices out to
   build-slice workers in isolated Orca worktrees, a person reviews and merges,
   and the orchestrator lands each merge back on main and records the decision.

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
   - SKILLS           capabilities a program loads (writing-tests, code-review,
                      run-dev-server, orca …). They live on the shelf, never on
                      the canvas, and attach through a program's definition.

   Mark II separates the DEFINITION of the factory from its LIVE STATE. The
   definition (groups, programs, subsystems, connections, contracts) is what
   System mode draws. Counts, items, dwell and agent activity are live state and
   belong to Factory mode only — so `count`, `dwell`, `ITEMS` and `AGENTS` below
   are never read by the System canvas. */

const WORKSPACES = [
  { id: "email-agent", name: "agent-mail", i: "AM", h: 212, sub: "AI-native email client" },
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
        list.push({ id: (3.31 - 0.01 * (n + 1)).toFixed(2), t, s: `${AGO[n % AGO.length]} · ${sha(n)} · §D${312 - n}`, d: "ok" });
      } else if (s.id === "plans") {
        const blocked = n % 3 !== 0;
        list.push({ id: (3.80 + 0.02 * n).toFixed(2), t,
          s: blocked ? `needs ${(3.6 + 0.05 * n).toFixed(2)} · blocked` : "no needs · buildable", d: blocked ? "ok" : "run" });
      } else if (s.id === "spec") {
        list.push({ id: String(7 + n).padStart(2, "0"), t: `${NOUN[(k * 3) % NOUN.length]} section`,
          s: n % 4 === 0 ? `${1 + (n % 3)} sections uncovered` : `${4 + (n % 9)} covering · complete`,
          d: n % 4 === 0 ? "wait" : "ok" });
      } else {
        list.push({ id: (3.58 + 0.02 * n).toFixed(2), t, s: "agent-coding · queued", d: "ok" });
      }
      n++;
    }
  });
}

/* ═══════════════════════════════════════════════ workspace · agent-mail ══ */
function makeEmailAgent() {
const REPO = { name: "agent-mail", branch: "main", sysVersion: "v57" };

/* ── artifact SOURCE TYPES. Where a stage's artifacts come from. A stage binds
      one of these plus a filter — the source is an attribute of the stage, not
      its own shelf class. ── */
const SOURCES = [
  { id: "spec-docs",     name: "Spec documents",      icon: "doc",    sub: "one spec per subsystem under docs/specs" },
  { id: "plan-docs",     name: "Plan queue",          icon: "list",   sub: "slice briefs under docs/plan, by status" },
  { id: "orca-worktrees",name: "Orca worktrees",      icon: "branch", sub: "build/* branches in isolated worktrees" },
  { id: "github-prs",    name: "GitHub pull requests",icon: "pr",     sub: "PRs selected by state, head, or label" },
  { id: "decision-blocks",name:"Decision record",     icon: "doc",    sub: "landed slices and their §D entries" },
  { id: "research-docs", name: "Research & feedback",  icon: "flag",   sub: "market pass, teardowns, beta notes" },
];

/* ── the shelf, part 2: SKILLS. Capabilities a program loads. Never a node or an
      edge — they attach through a program's definition and stay on the shelf.
      These are the harness skills in .agents/skills that a program pulls in. ── */
const SKILLS = [
  { id: "system-writing",     name: "System writing",  icon: "doc",     desc: "put internal prose in ASD-STE100 controlled English", runs: 1902 },
  { id: "writing-tests",      name: "Writing tests",   icon: "task",    desc: "write tests that fail on a real bug, not the implementation", runs: 844 },
  { id: "code-review",        name: "Code review",     icon: "eye",     desc: "read a diff cold against proves and AGENTS.md", runs: 512 },
  { id: "consolidate-ui",     name: "Consolidate UI",  icon: "sparkle", desc: "catch missed shared-kit reuse before a UI branch merges", runs: 208 },
  { id: "run-dev-server",     name: "Run dev server",  icon: "globe",   desc: "run or screenshot the app to review behaviour, not code", runs: 96 },
  { id: "product-copywriting",name: "Product copy",    icon: "book",    desc: "write user-facing labels, empty states, and agent turns", runs: 331 },
  { id: "orca",               name: "Orca worktrees",  icon: "branch",  desc: "open an isolated worktree and take the branch lock", runs: 623 },
  { id: "github",             name: "GitHub",          icon: "pr",      desc: "open, check, and merge pull requests", runs: 731 },
];

/* ── STAGES. A stage is a filtered list of artifacts, defined by a `source` and
      a `filter`. `shape` is what each artifact looks like. `count`/`dwell` are
      LIVE state (Factory mode only); the System canvas shows name + filter +
      source. Artifacts flow between stages along the programs. ── */
const STATES = [
  { id: "spec",   name: "Specs",         source: "spec-docs",     filter: "docs/specs/*.md",                icon: "doc",    count: 18,
    shape: ["title", "sections[]", "decisions[]", "open_questions[]"],
    dwell: { median: "11d 4h", p90: "48d", oldest: "71d", inW: 2, outW: 2,
      trend: [7, 8, 6, 9, 11, 9, 10, 9], unit: "d",
      note: "a spec section sits until a phase forces a cut" } },

  { id: "plans",  name: "Build queue",   source: "plan-docs",     filter: "docs/plan/phase-*/*.md · planned", icon: "list", count: 57,
    shape: ["id", "needs[]", "owns[]", "spec", "screen", "proves"],
    dwell: { median: "2d 6h", p90: "9d 1h", oldest: "17d", inW: 21, outW: 18,
      trend: [1.4, 1.6, 1.9, 2.1, 2.0, 2.4, 2.2, 2.3], unit: "d",
      note: "blocked slices are the long tail, not slow planning" } },

  { id: "branch", name: "Worker worktree", source: "orca-worktrees", filter: "orca · build/* worktrees",     icon: "branch", count: 6,
    shape: ["bundle", "branch", "worktree", "lock"],
    dwell: { median: "24m", p90: "1h 40m", oldest: "3h 06m", inW: 18, outW: 18,
      trend: [26, 24, 25, 21, 23, 20, 22, 22], unit: "m", note: "" } },

  { id: "pr",     name: "Worker PR",      source: "github-prs",    filter: "gh · pr head:build/*",           icon: "pr",     count: 3,
    shape: ["bundle", "diff", "checks", "to_record"],
    dwell: { median: "4h 10m", p90: "1d 6h", oldest: "2d 3h", inW: 18, outW: 17,
      trend: [3.1, 3.6, 4.4, 3.9, 5.2, 4.6, 4.0, 4.2], unit: "h",
      note: "the wait is the human gate, not the checks" } },

  { id: "merged", name: "Merged work",    source: "decision-blocks", filter: "gh · pr is:merged → main",     icon: "pr",     count: 294,
    shape: ["bundle", "pr", "sha", "decisions[]"],
    dwell: { median: "45s", p90: "2m 10s", oldest: "12m", inW: 17, outW: 17,
      trend: [.7, .6, .7, .6, .7, .6, .7, .7], unit: "m", note: "landing is the only writer on main" } },

  { id: "feed",   name: "Research & feedback", source: "research-docs", filter: "docs/research/*.md · open",  icon: "flag",  count: 9,
    shape: ["category", "area", "report", "fold"],
    dwell: { median: "6d 2h", p90: "19d", oldest: "24d", inW: 5, outW: 3,
      trend: [3.1, 3.8, 4.2, 5.0, 5.4, 5.1, 5.9, 6.1], unit: "d",
      note: "beta notes and research wait here for the pass that folds them in" } },
];

/* ── PROGRAMS. Each transforms the artifacts of one stage into another. `accepts` and
      `produces` are the artifact shapes it reads and writes — the contract.
      `skills` are ids into SKILLS, loaded from the shelf. `prompt` is the prose
      job definition. `def` names the account-level program it instances.
      `runs`/`fail`/`median`/`issues` are LIVE state (Factory only). ── */
const PROCS = [
  {
    id: "plan", def: "plan-phase", from: "spec", to: "plans", name: "plan phase",
    pos: [584, 630],
    skills: ["system-writing"],
    trigger: "manual · per phase", runner: "opus", runs: 64, fail: .09, median: "6m 40s",
    accepts: ["sections[]", "decisions[]"], produces: ["id", "needs[]", "owns[]", "spec", "screen", "proves"],
    issues: ["i7"],
    prompt: PROMPTS["plan-phase"]
  },
  {
    id: "dispatch", def: "build-orchestrator", from: "plans", to: "branch", name: "dispatch bundle",
    skills: ["orca", "github"],
    trigger: "manual · continue the queue", runner: "opus", runs: 314, fail: .02, median: "12s",
    accepts: ["needs[]", "owns[]"], produces: ["bundle", "branch", "worktree", "lock"],
    issues: [],
    prompt: PROMPTS["build-orchestrator"]
  },
  {
    id: "build", def: "build-slice", from: "branch", to: "pr", name: "build slice",
    skills: ["writing-tests", "code-review", "consolidate-ui", "run-dev-server", "product-copywriting"],
    trigger: "on arrival", runner: "opus", runs: 308, fail: .21, median: "24m",
    accepts: ["bundle", "branch"], produces: ["bundle", "diff", "checks", "to_record"],
    issues: ["i1", "i3", "i9", "i11"],
    prompt: PROMPTS["build-slice"]
  },
  {
    id: "review", def: "review-merge", from: "pr", to: "merged", name: "review + merge",
    skills: ["code-review", "github"],
    trigger: "on arrival", runner: "you", runs: 301, fail: .34, median: "8m",
    accepts: ["diff", "checks", "to_record"], produces: ["bundle", "pr", "sha", "decisions[]"],
    issues: ["i2", "i4", "i5", "i8", "i10", "i12"],
    prompt: PROMPTS["code-review"]
  },
  {
    id: "log", def: "land-record", from: "merged", to: ["spec", "plans"], name: "land on main",
    fromSide: "bottom", toSide: "bottom",
    pos: [314, 749],
    skills: ["system-writing", "github"],
    trigger: "after every merge", runner: "opus", runs: 294, fail: .04, median: "1m 30s",
    accepts: ["pr", "sha", "to_record"], produces: ["decisions[]", "open_questions[]", "id", "needs[]", "owns[]", "spec", "proves"],
    issues: [],
    prompt: PROMPTS["build-orchestrator"]
  },
  {
    id: "triage", def: "triage-feedback", from: "feed", to: "spec", name: "triage feedback",
    skills: ["system-writing"],
    trigger: "manual · per pass", runner: "you", runs: 21, fail: .05, median: "4m",
    accepts: ["report", "fold"], produces: ["decisions[]", "open_questions[]"],
    issues: ["i6"],
    prompt: `## Context

Fold the pass's **product** feedback back into the specs — beta notes, research,
and the open questions the state of play still carries. Every item here is about
the product: what shipped and what it taught you. System defects are a separate
queue, off this loop, and are not in scope for this pass.

## Tasks

- [ ] Group the open feedback by area → buckets
- [ ] Turn each pattern into a spec constraint or a numbered decision → decisions[]
- [ ] Keep the ones that still need a call as open questions → open_questions[]
- [ ] Drop anything that is one report, not a pattern → buckets
- [ ] Close each item with the decision id it became → docs/research/*.md

## Rules

1. Product feedback edits the **specs**, never the programs. Programs change in
   System mode, off this ring.
2. One report is a fluke; a pattern is a decision. Wait for the pattern.`
  },
];

/* the back edge everyone's real process has and nobody's diagram admits to.
   Lives inside the Delivery subsystem, where review sends work back to the worktree. */
const BACKS = [
  { from: "pr", to: "branch", label: "rework", note: "34% of reviews" },
];

/* ── SUBSYSTEMS. A subsystem groups part of the factory behind one boundary. It
      declares its inputs and outputs; the parent canvas draws it as a frame and
      does not render its children. Opening it swaps in its internal canvas. ── */
const SUBSYSTEMS = [
  { id: "delivery", name: "Delivery", icon: "box", canvas: "delivery",
    inputs: ["plans"], outputs: ["merged"],
    sub: "build queue → worktrees → PRs → merged",
    contains: { groups: ["branch", "pr"], programs: ["dispatch", "build", "review"] } },
];

/* ── CANVASES. The definition is a set of canvases: the top-level `root`, and one
      internal canvas per subsystem. Each canvas lists the nodes on it (artifact
      groups and subsystem frames, with grid positions), the programs whose
      endpoints sit on it, plain connections into/out of subsystems, the input
      programs feeding it, and any back edges. This is what geo() lays out. ── */
const CANVASES = {
  root: {
    id: "root", name: "agent-mail",
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
    inputs: ["research", "beta", "openq"],
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
  { id: "research", to: "feed", name: "Market & prior-art", sub: "research pass", icon: "sparkle", count: 8,  source: "research-docs", pos: [57, 62] },
  { id: "beta",     to: "feed", name: "Beta feedback",      sub: "from testers",  icon: "flag",    count: 12, source: "research-docs", pos: [56, 113] },
  { id: "openq",    to: "feed", name: "Open questions",     sub: "§O state of play", icon: "heat", count: 6,  source: "research-docs", pos: [54, 162] },
];

/* ── DEFECTS. Friction the factory logs about its own wiring, attributed to a
      program, never to a stage. Operational — never on the System
      canvas; reached through the Defects list. ── */
const ISSUES = [
  { id: "i1",  cat: "skill-gap",       edge: "build",  t: "No skill to seed fixture mail with realistic thread depth for run-dev-server scenes", run: "run 291", fix: true },
  { id: "i2",  cat: "review-miss",     edge: "review", t: "Merged a diff that added a second source of truth for unread counts", run: "run 288", fix: true },
  { id: "i3",  cat: "spec-ambiguity",  edge: "build",  t: "Spec 02 §3 does not say whether a thread can span two accounts", run: "run 284", fix: false },
  { id: "i4",  cat: "review-miss",     edge: "review", t: "Three PRs in a row shipped hand-rolled controls the kit already covers", run: "run 281", fix: true },
  { id: "i5",  cat: "convention-drift",edge: "review", t: "Slice titles drifting from `n.nn verb-noun` to freeform prose", run: "run 279", fix: true },
  { id: "i6",  cat: "spec-ambiguity",  edge: "triage", t: "Two decisions (§D188, §D204) both claim the send-retry policy", run: "run 276", fix: false },
  { id: "i7",  cat: "skill-gap",       edge: "plan",   t: "plan-phase cannot see which specs already have coverage, so it re-cuts them", run: "run 270", fix: true },
  { id: "i8",  cat: "review-miss",     edge: "review", t: "Reviewer accepted `proves` lines that only restate the title", run: "run 268", fix: true },
  { id: "i9",  cat: "constraint-violation", edge: "build", t: "agent-coding edited a path outside `owns` to unblock a test", run: "run 265", fix: false },
  { id: "i10", cat: "review-miss",     edge: "review", t: "No check that a landed slice actually closed its spec citation", run: "run 262", fix: true },
  { id: "i11", cat: "skill-gap",       edge: "build",  t: "Self-review reads code, not behaviour — no run-dev-server screenshot on the diff", run: "run 259", fix: false },
  { id: "i12", cat: "convention-drift",edge: "review", t: "Commit messages losing the slice id prefix", run: "run 255", fix: true },
];

/* ── LIVE STATE: the artifacts sitting in each stage right now (Factory / the
      Artifacts browser). `final: true` marks an artifact as a finished output —
      independent of which stage it is at — so the Artifacts mode can default to
      showing just the finals. ── */
const ITEMS = {
  spec: [
    { id: "00", t: "Foundations", s: "§1–6 · 40 decisions · complete", d: "ok", final: true },
    { id: "02", t: "Schema", s: "§3 ambiguous · 1 defect open", d: "bad" },
    { id: "03", t: "Sync engine", s: "8 slices covering · complete", d: "ok" },
    { id: "04", t: "Agent runtime", s: "4 sections uncovered", d: "wait" },
    { id: "05", t: "Tools", s: "settled · §D207", d: "ok", final: true },
    { id: "06", t: "Memory", s: "3 sections uncovered", d: "wait" },
  ],
  plans: [
    { id: "3.64", t: "classifier confidence chip", s: "needs 3.57 · blocked", d: "ok" },
    { id: "3.65", t: "pro upsell card", s: "needs 3.57 · blocked", d: "ok" },
    { id: "3.70", t: "digest cadence control", s: "no needs · buildable", d: "run" },
    { id: "3.72", t: "memory recall panel", s: "needs 3.40 · blocked", d: "ok" },
    { id: "3.74", t: "workspace switcher", s: "needs 3.12 · buildable", d: "run" },
    { id: "3.78", t: "classification settings", s: "needs 3.64 · blocked", d: "ok" },
  ],
  branch: [
    { id: "3.57", t: "the length rail", s: "agent-coding · 14m · 3 files", d: "run" },
    { id: "3.55", t: "settings rail search", s: "agent-coding · 6m · 2 files", d: "run" },
    { id: "3.49", t: "digest test harness", s: "agent-coding · 22m · stuck on test", d: "wait" },
    { id: "3.50", t: "model switcher popover", s: "agent-coding · 3m · 4 files", d: "run" },
    { id: "3.53", t: "classifier day popover", s: "agent-coding · 31m · 5 files", d: "run" },
    { id: "3.56", t: "list send button", s: "agent-coding · 1m · 1 file", d: "run" },
  ],
  pr: [
    { id: "3.38", t: "company card people strip", s: "checks green · waiting on you", d: "wait" },
    { id: "3.41", t: "draft skeleton stages", s: "checks green · review running", d: "run" },
    { id: "3.42", t: "avatar list variant", s: "test:affected red", d: "bad" },
  ],
  merged: [
    { id: "3.37", t: "reading pane hairlines", s: "2h ago · a91f3c2 · §D318", d: "ok", final: true },
    { id: "3.36", t: "sidebar label twisty", s: "4h ago · 7d20e18 · §D317", d: "ok", final: true },
    { id: "3.35", t: "palette @ context", s: "6h ago · 3fe9a04 · §D316", d: "ok", final: true },
    { id: "3.34", t: "guard chip states", s: "yesterday · c1b7f56 · §D315", d: "ok", final: true },
    { id: "3.33", t: "thread summary block", s: "yesterday · 0ab4d91 · §D314", d: "ok", final: true },
    { id: "3.32", t: "compose overlay card", s: "yesterday · 55c3e77 · §D313", d: "ok", final: true },
  ],
  feed: [
    { id: "#1", t: "reading pane drops frames past 40 messages", cat: "bug", area: "reading pane", d: "bad", fix: true,
      report: "Threads longer than ~40 messages stutter, and the pane drops frames when the newest message collapses.",
      fold: "a performance constraint in the Schema spec" },
    { id: "#2", t: "unread count wrong after a bulk archive", cat: "regression", area: "list", d: "bad", fix: true,
      report: "After a bulk archive the unread badge stays stale until the window is refocused.",
      fold: "a decision on where unread is derived, so it is never stored" },
    { id: "#3", t: "classifier over-labels newsletters as Pro", cat: "bug", area: "classification", d: "bad", fix: true,
      report: "Beta testers report the Pro classifier labelling ordinary newsletters as Pro-worthy.",
      fold: "a threshold decision in the Classification & Pro spec" },
    { id: "#4", t: "compose loses the draft on a network drop", cat: "paper-cut", area: "compose", d: "bad", fix: true,
      report: "A network drop mid-compose loses the draft with no recovery path.",
      fold: "a constraint on draft persistence in the Tools spec" },
    { id: "#5", t: "search misses messages in Sent", cat: "request", area: "search", d: "wait", fix: true,
      report: "People expect search to cover Sent; today it only indexes the inbox.",
      fold: "a new Sync-engine spec section" },
    { id: "#6", t: "day popover clips at the screen edge", cat: "paper-cut", area: "calendar", d: "wait", fix: true,
      report: "On narrow windows the calendar day popover clips off the right edge.",
      fold: "a rework slice, not a spec change" },
    { id: "#7", t: "people want the agent to act across two accounts", cat: "request", area: "agent runtime", d: "wait", fix: false,
      report: "Repeated asks for the agent to work across two accounts in one instruction.",
      fold: "a spec section on multi-account scope — needs a decision first" },
    { id: "#8", t: "memory recall surfaces stale contacts", cat: "paper-cut", area: "memory", d: "wait", fix: true,
      report: "The memory recall panel keeps surfacing contacts the user has not mailed in a year.",
      fold: "a staleness rule in the Memory spec" },
    { id: "#9", t: "the reading pane is landing — keep it", cat: "praise", area: "reading pane", d: "ok", fix: false,
      report: "Unprompted, testers keep calling the reading pane the calmest they have used.",
      fold: "note the pattern in the product-copywriting voice doc; change nothing" },
  ],
};

const PANEL_MAX = 40;

ITEMS.feed.forEach((f) => (f.s = `${f.cat} · ${f.area}`));

padStations(STATES, ITEMS, PANEL_MAX,
  ["thread list", "reading pane", "compose overlay", "label rail", "search field", "account switcher",
    "contact card", "company card", "agent chat", "classifier row", "draft stages", "digest card", "toast stack",
    "palette", "settings rail", "calendar popover", "attachment tray", "signature block", "snooze menu",
    "unread badge", "filter chips", "avatar stack", "send queue", "undo path"],
  ["hairlines on", "empty state for", "keyboard path through", "loading skeleton for",
    "error state for", "density toggle on"]);

/* ══════════════════════════════════════════════════════════════ agents ══
   LIVE STATE. A run is one harness session dispatched by a program, sitting on
   one slice in one stage and executing the program out of it. Factory
   mode only — never read by the System canvas. */

const RUN_PROC  = { branch: "build",       pr: "review", merged: "log" };
const RUN_MODEL = { branch: "agent-coding", pr: "you",    merged: "opus" };

const AGENTS = [
  {
    id: "r-357", slice: "3.57", title: "the length rail", station: "branch",
    started: "14m ago", elapsed: "14m", pct: 62, status: "running",
    head: "agent-coding wiring the length rail",
    log: [
      { k: "sys",  t: "orca worktree create --agent opencode ../wt/3.57 · branched build/3-57 off main" },
      { k: "bash", cmd: 'git commit --allow-empty -m "claim 3.57 $(uuidgen)" && git push', ok: true, out: "claim pushed · build/3-57 locked" },
      { k: "sys",  t: "Bundle A1: slice 3.57, spec 17 §2, decisions §D291 §D304. Nothing else in scope." },
      { k: "say",  t: "Building the length rail that trims a digest to a set reading time. Handing the build to an **agent-coding** sub-agent so this session keeps a thin context — I hold the review, the merge and the PR." },
      { k: "tool", act: "Write", arg: "../wt/3.57/TODO.md", sub: "5 steps" },
      { k: "tool", act: "Edit", arg: "packages/ui/src/digest/LengthRail.tsx", sub: "+112 −0" },
      { k: "tool", act: "Edit", arg: "packages/core/src/digest/trim.ts", sub: "+38 −4" },
      { k: "bash", cmd: "npm run test:affected", ok: true, out: "PASS  packages/core/digest/trim.test.ts  (6 tests, 0.8s)" },
      { k: "say",  t: "Rail renders and the trim is live. Wiring the presets next, then a fresh sub-agent reviews the diff against `proves` before I open the PR." },
      { k: "tool", act: "Edit", arg: "packages/ui/src/digest/LengthRail.tsx", sub: "+46 −8" },
    ],
  },
  {
    id: "r-355", slice: "3.55", title: "settings rail search", station: "branch",
    started: "6m ago", elapsed: "6m", pct: 34, status: "running",
    head: "Reading the settings tree before I touch it",
    log: [
      { k: "sys",  t: "orca worktree create --agent opencode ../wt/3.55 · branched build/3-55 off main" },
      { k: "bash", cmd: 'git commit --allow-empty -m "claim 3.55 $(uuidgen)" && git push', ok: true, out: "claim pushed · build/3-55 locked" },
      { k: "say",  t: "Adding a filter field to the settings rail. Mapping the tree first so the match highlights the right nodes." },
      { k: "tool", act: "Read", arg: "packages/ui/src/settings/rail.tsx" },
      { k: "tool", act: "Edit", arg: "packages/ui/src/settings/RailSearch.tsx", sub: "+58 −0" },
    ],
  },
  {
    id: "r-349", slice: "3.49", title: "digest test harness", station: "branch",
    started: "22m ago", elapsed: "22m", pct: 40, status: "waiting",
    head: "Stopped on a spec ambiguity",
    question: {
      t: "Spec 02 §3 does not say whether a digest can span two accounts. Which reading holds?",
      opts: ["One account per digest", "Merge both accounts into one digest", "File a spec-ambiguity defect and pause"],
    },
    log: [
      { k: "sys",  t: "orca worktree create --agent opencode ../wt/3.49 · branched build/3-49 off main" },
      { k: "say",  t: "Building the digest test harness. The `proves` line says a digest covers one account's unread threads for the window." },
      { k: "tool", act: "Edit", arg: "packages/core/src/digest/harness.ts", sub: "+74 −2" },
      { k: "bash", cmd: "npm run test:affected", ok: false, out: "FAIL  packages/core/digest/harness.test.ts\n  ● groups unread across accounts\n    expected 1 account, received 2" },
      { k: "say",  t: "The failing test assumes a digest spans two accounts, but spec 02 §3 never says whether a thread — or a digest — can. The two readings contradict and I will not guess on a `proves` line." },
      { k: "ask",  t: "Spec 02 §3 does not say whether a digest can span two accounts. Which reading holds?" },
    ],
  },
  {
    id: "r-370", slice: "3.70", title: "wave B — digest bundle", station: "plans", proc: "dispatch", model: "opus",
    started: "3m ago", elapsed: "3m", pct: 25, status: "waiting",
    head: "Confirming wave B with you",
    question: {
      t: "main is green. Run wave B as three bundles, four workers at most?",
      opts: ["Run wave B as planned", "Drop B2, run B1 only", "Re-bundle — 3.64 and 3.65 collide on owns"],
    },
    log: [
      { k: "sys",  t: "Guards passed · on clean main · in sync with origin · phase-3 queue exists" },
      { k: "bash", cmd: "npm run check && npm run test", ok: true, out: "check ✓  ·  test ✓  (main is green)" },
      { k: "say",  t: "Bundled the buildable slices into wave B:\n\nB1 — 3.70 digest cadence control\nB2 — 3.74 workspace switcher\nB3 — 3.64 + 3.65 classifier chip + pro card" },
      { k: "say",  t: "3.64 and 3.65 share `packages/ui/src/classify/**`, so they go in one bundle, not two. Confirm the wave and I open a worktree per bundle." },
      { k: "ask",  t: "main is green. Run wave B as three bundles, four workers at most?" },
    ],
  },
  {
    id: "r-353", slice: "3.53", title: "classifier day popover", station: "branch",
    started: "31m ago", elapsed: "31m", pct: 74, status: "running",
    head: "Fresh sub-agent reviewing the diff",
    log: [
      { k: "sys",  t: "orca worktree create --agent opencode ../wt/3.53 · branched build/3-53 off main" },
      { k: "say",  t: "Day popover for the classifier strip. Five files, all inside owns." },
      { k: "tool", act: "Edit", arg: "packages/ui/src/classify/DayPopover.tsx", sub: "+96 −4" },
      { k: "tool", act: "Edit", arg: "packages/ui/src/classify/positioning.ts", sub: "+44 −2" },
      { k: "bash", cmd: "npm run test:affected", ok: true, out: "PASS  packages/ui/classify/DayPopover.test.tsx  (9 tests, 1.1s)" },
      { k: "say",  t: "Green. consolidate-ui flagged one REUSE — the popover rolls its own chip and the kit already has `<Chip>`. Swapping it before I open the PR." },
      { k: "tool", act: "Edit", arg: "packages/ui/src/classify/DayPopover.tsx", sub: "+6 −18" },
    ],
  },
  {
    id: "r-356", slice: "3.56", title: "list send button", station: "branch",
    started: "1m ago", elapsed: "1m", pct: 90, status: "running",
    head: "One file, opening the PR shortly",
    log: [
      { k: "sys",  t: "orca worktree create --agent opencode ../wt/3.56 · branched build/3-56 off main" },
      { k: "tool", act: "Edit", arg: "packages/ui/src/list/SendButton.tsx", sub: "+22 −1" },
      { k: "bash", cmd: "npm run test:affected", ok: true, out: "PASS  (2 tests)" },
    ],
  },
  {
    id: "r-341", slice: "3.41", title: "draft skeleton stages", station: "pr", model: "agent-coding",
    started: "8m ago", elapsed: "8m", pct: 55, status: "running",
    head: "Reviewing the diff cold against proves",
    log: [
      { k: "sys",  t: "Fresh sub-agent · reviewing build/3-41 · checks green" },
      { k: "say",  t: "Read `proves`, now walking the diff cold. Skeleton stages match the three the spec names. Checking every changed path sits inside owns." },
      { k: "tool", act: "Read", arg: "packages/ui/src/compose/DraftStages.tsx" },
    ],
  },
  {
    id: "r-338", slice: "3.38", title: "company card people strip", station: "pr",
    started: "3h ago", elapsed: "3h", pct: 80, status: "waiting",
    head: "PR #412 up · preview ready for review",
    question: {
      kind: "review",
      t: "Review the company card people strip against its proves line.",
      summary: "The worker opened PR #412 and deployed the branch to a preview. Open it, use the strip the way a reader would, then merge it or send it back with a note.",
      opts: ["Approve and merge", "Send back with changes", "Hold — leave a note"],
      preview: { title: "Company card", url: "preview.agent-mail.dev/3-38", screen: "company" },
    },
    log: [
      { k: "sys",  t: "Reviewing build/3-38 · checks green · waiting on you" },
      { k: "say",  t: "Read `proves`, then the diff. Scope is clean — every changed path sits inside owns. The strip reads the people from messages on read, which matches §D191. It also caches the count on the company record, which the checklist usually flags, so I am not merging it on my own." },
      { k: "tool", act: "Read", arg: "packages/ui/src/company/PeopleStrip.tsx" },
      { k: "bash", cmd: "npm run shot -- company", ok: true, out: "preview ready  https://preview.agent-mail.dev/3-38" },
      { k: "ask",  t: "Review the company card people strip against its proves line." },
    ],
  },
  {
    id: "r-342", slice: "3.42", title: "avatar list variant", station: "pr", model: "agent-coding",
    started: "18m ago", elapsed: "18m", pct: 55, status: "failed",
    head: "test:affected red · typecheck failing",
    log: [
      { k: "sys",  t: "Re-running gates on build/3-42 after the merge of origin/main" },
      { k: "bash", cmd: "npm run check", ok: false, out: "✗ typecheck  packages/ui/src/list/AvatarRow.tsx:38\n  Property 'initials' does not exist on type 'Contact'" },
      { k: "say",  t: "Typecheck is red — `Contact` has no `initials` field. That is derived elsewhere and I should not be reaching for it here. This needs a decision on where initials come from before I can go further, so I am pausing rather than inventing a field." },
    ],
  },
  {
    id: "r-337", slice: "3.37", title: "reading pane hairlines", station: "merged",
    started: "2h ago", elapsed: "19m", pct: 100, status: "done", head: "Landed · a91f3c2 · §D318",
    log: [
      { k: "sys",  t: "PR #418 merged by you · landing build/3-37 on main" },
      { k: "say",  t: "Read the `## To record` block. One settled decision on hairline density during collapse. Allocating the next §D number and ticking the queue box." },
      { k: "tool", act: "Edit", arg: "docs/decisions/D301-D320.md", sub: "+§D318" },
      { k: "bash", cmd: "gh pr merge --squash", ok: true, out: "landed build/3-37 → main  a91f3c2 · §D318" },
    ],
  },
  {
    id: "r-336", slice: "3.36", title: "sidebar label twisty", station: "merged",
    started: "4h ago", elapsed: "24m", pct: 100, status: "done", head: "Landed · 7d20e18 · §D317",
    log: [
      { k: "sys",  t: "PR #411 merged by you · landing build/3-36 on main" },
      { k: "say",  t: "Clean. Landed and cut one convention-drift follow-up on the twisty naming into the phase-3 queue, so the rule exists next time." },
      { k: "bash", cmd: "gh pr merge --squash", ok: true, out: "landed build/3-36 → main  7d20e18 · §D317" },
    ],
  },
];

/* ── nested pages under a program's instructions. `system/programs/build.md`
      owns everything under `system/programs/build/`; the parent reaches a child
      with an ordinary relative markdown link. The path is the hierarchy. ── */
const PAGES = {
  "system/programs/plan/breakdown.md": {
    title: "how to cut a slice",
    body: `Part of [plan phase](../plan.md), task 2.

## Context

One slice proves **one** behaviour. If you cannot write the \`proves\` line as a
single sentence somebody could check by using the app, the cut is wrong.

## Tasks

- [ ] List every behaviour the section describes → scratch/cuts.md
- [ ] Drop anything already covered by a landed slice → scratch/cuts.md
- [ ] Write the proves line first, then the title → proves
- [ ] Name the screen the slice draws, or none → screen
- [ ] Split any cut whose proves line needs the word "and" → docs/plan/phase-*/*.md

## Smells

- A title that is a noun with no verb. That is a file, not a behaviour.
- A cut that only makes sense once another unlanded cut lands. Fold them.
- More than six files in \`owns\`. Two slices wearing a trench coat.`
  },

  "system/programs/build/test-strategy.md": {
    title: "test strategy",
    body: `Part of [build slice](../build.md), task 3.

## Context

Run \`npm run test:affected\` — the narrowest suite that could fail because of
this diff. The full \`npm run test\` is a pre-flight the orchestrator runs once on
main, not a feedback loop. This page is loaded through the **Writing tests** skill.

## Tasks

- [x] Map the changed files to their nearest test files → suite
- [ ] Run test:affected on every save → checks
- [ ] Run npm run check once, immediately before opening the PR → checks
- [ ] Attach the failing output verbatim, never a summary of it → output

> A test that needed changing to make the diff pass is a finding, not a chore.
> Say so under \`## To record\` in the PR body.`
  },

  "system/programs/build/code-review.md": {
    title: "code review",
    body: `Part of [build slice](../build.md), task 4. Run it in a **fresh**
sub-agent that did not write the diff — the same page [review + merge](../review.md)
uses at the human gate, so the self-review and the person are reading one file.
Loaded through the **Code review** skill.

## Context

Read the diff as somebody who did not write it and does not care what it cost.
The only questions are whether \`proves\` is demonstrated and whether the diff
stayed inside \`owns\`.

## Tasks

- [ ] Read the proves line before the diff → review.notes
- [ ] Walk the diff file by file against [the checklist](code-review/checklist.md) → review.findings
- [ ] Grade each finding: blocker, or known limitation → severity
- [ ] Blockers go back on the task list, the rest go under \`## To record\` → worktree/TODO.md

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
- [ ] Is there a hand-rolled control the shared kit already covers? → findings
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
- [ ] No hand-rolled controls the kit already covers → review.conventions
- [ ] Every new file is claimed by exactly one slice → review.conventions

> Drift shows up here first. When a convention gets broken three times, it is
> the convention that is wrong.`
  },

  "slices/3.57/proves.md": {
    title: "how 3.57 gets proved",
    body: `Part of [the length rail](../3.57.md). The \`proves\` line is one
sentence; this is the walkthrough a reviewer follows to believe it.

## Walkthrough

- [x] Open an account with at least one 20-thread unread backlog
- [ ] Open the digest, the rail shows the default reading time
- [ ] Drag the rail down, the digest trims to the shorter set of threads
- [ ] Drag it back up, the trimmed threads return in the same order
- [ ] Resize below 900px, the rail collapses to a preset menu

## What would falsify it

A rail that trims the list but loses the thread order on the way back. That is
the bug this slice exists to prevent, so it goes under \`## To record\` either way.`
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
- [ ] Close the three defects against the redraw, not against a patch → docs/defects/*.md

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
  summary: "The email client testers can use, not the work moving through the factory.",
  promotable: true,
  lanes: [{ id: "development", name: "Development" }, { id: "staging", name: "Staging" }, { id: "beta", name: "Beta" }],
  nav: [
    { id: "overview", label: "Browse", icon: "box" },
    { id: "environments", label: "Environments", icon: "globe", n: 3 },
  ],
  releases: [
    { id: "0.18.0", title: "A calmer reading pane", status: "ready", stage: "development", time: "2h ago", date: "28 Aug 2026",
      sha: "a91f3c2", pr: "#418", url: "https://agent-mail.dev/releases/0.18.0", preview: "https://preview.agent-mail.dev/0-18-0",
      note: "Long threads now stay anchored while messages collapse, with quieter dividers and a persistent thread summary.",
      slices: ["3.37", "3.33"], changes: ["Reading pane hairlines no longer jump during collapse (§D318)", "Thread summaries remain visible through long conversations (§D314)", "Improved keyboard focus across message boundaries"],
      envs: [{ name: "Development", state: "live" }, { name: "Staging", state: "pending" }, { name: "Beta", state: "pending" }] },
    { id: "0.17.0", title: "Labels where you need them", status: "ready", stage: "staging", time: "yesterday", date: "27 Aug 2026",
      sha: "7d20e18", pr: "#411", url: "https://agent-mail.dev/releases/0.17.0", preview: "https://preview.agent-mail.dev/0-17-0",
      note: "The sidebar label tree is easier to scan, search, and use without leaving the current thread.",
      slices: ["3.36"], changes: ["Expandable label groups in the sidebar (§D317)", "Nested labels included in rail search", "Current label remains visible while reading"],
      envs: [{ name: "Beta", state: "pending" }, { name: "Staging", state: "live" }] },
    { id: "0.16.2", title: "Safer bulk actions", status: "live", stage: "beta", time: "2d ago", date: "26 Aug 2026",
      sha: "c1b7f56", pr: "#406", url: "https://agent-mail.dev/releases/0.16.2", preview: "https://preview.agent-mail.dev/0-16-2",
      note: "Archive, label, and undo actions now show their scope before changing a whole selection.",
      slices: ["3.34", "3.32"], changes: ["Guard chip shows the selected action and count (§D315)", "Undo restores the full previous thread state", "Bulk bar remains reachable from the keyboard"],
      envs: [{ name: "Beta", state: "live" }, { name: "Staging", state: "live" }] },
  ],
  environments: [
    { id: "development", name: "Development", branch: "build/*", state: "active", version: "0.18.0", updated: "now", url: "https://preview.agent-mail.dev", note: "One isolated deployment per open PR" },
    { id: "staging", name: "Staging", branch: "main", state: "healthy", version: "0.17.0", updated: "18m ago", url: "https://staging.agent-mail.dev", note: "Seeded accounts · production schema" },
    { id: "beta", name: "Beta", branch: "main", state: "healthy", version: "0.16.2", updated: "2d ago", url: "https://agent-mail.dev", note: "GitHub beta channel · signed + notarised" },
  ],
};

/* ── the rails ── */
const NAV = {
  system: [
    { id: "loop",       label: "Layout",  icon: "layout" },
    { id: "artifacts",  label: "Stages",       icon: "list",  n: 6 },
    { id: "programs",   label: "Programs",     icon: "book",  n: 6 },
    { id: "subsystems", label: "Subsystems",   icon: "box",   n: 1 },
    { id: "skills",     label: "Skills",       icon: "sparkle", n: 8 },
    { id: "issues",     label: "Defects",      icon: "flag",  n: 12, loud: true },
    { id: "history",    label: "Version history", icon: "clock", n: 57 },
  ],
  factory: [
    { id: "loop", label: "Board", icon: "board" },
  ],
  product: PRODUCT.nav,
};

const HISTORY = [
  { v: "v57", t: "build slice: dispatch the build to an agent-coding sub-agent, keep the worker thin", s: "39% context saved · 2h ago", who: "you" },
  { v: "v56", t: "review + merge: reject on any path outside owns", s: "closed #i9 · yesterday", who: "you" },
  { v: "v55", t: "build slice: consolidate-ui as a backstop before the PR", s: "closed #i4 · §D320 · 2d ago", who: "you" },
  { v: "v54", t: "land on main: §D in blocks of 20, numbers never reused", s: "3d ago", who: "you" },
  { v: "v53", t: "dispatch bundle: cap a wave at four workers", s: "proposed by triage · 4d ago", who: "triage" },
  { v: "v52", t: "plan phase: read spec coverage before cutting", s: "closed #i7 · 5d ago", who: "you" },
];

/* ── account-level PROGRAM DEFINITIONS. A program placed on a canvas is an
      instance of one of these; several systems can reuse the same definition. ── */
const PROGRAM_DEFS = [
  { id: "plan-phase",         name: "Plan phase",         sub: "spec sections → build queue" },
  { id: "build-orchestrator", name: "Build orchestrator", sub: "build queue → worker worktrees" },
  { id: "build-slice",        name: "Build slice",        sub: "worker worktree → worker PR" },
  { id: "review-merge",       name: "Review + merge",     sub: "worker PR → merged work" },
  { id: "land-record",        name: "Land on main",       sub: "merged work → specs + build queue" },
  { id: "triage-feedback",    name: "Triage feedback",    sub: "research & feedback → specs" },
];

const TERMS = {
  unit: "slice", Unit: "Slice", units: "slices",
  worktree: "../wt/", branchPre: "build/", doneLabel: "landed", off: "main",
  issueDir: "docs/defects/i-", issueBase: "docs/defects/",
  publishCmd: "gh pr merge --squash", publishOut: (s) => `landed build/${s.replace(".", "-")} → main  ${s.replace(".", "")}f0`,
};
const COPY = {
  productStat: "351 slices · 512 needs · 411 decisions",
  issuesWord: "defects",
  readyWord: "buildable",
  sourceWord: "spec section",
  blockCat: "spec-ambiguity",
  productWord: "product",
  frontierSub: "every need landed, no owns collision",
  slicesSub: "351 total · 294 landed · 57 planned",
  specsSub: "18 specs · 411 decisions · 512 citations",
  runsSub: "what the orchestrator is holding",
  queueSub: "buildable slices the orchestrator can bundle — every need landed, no owns collision",
  queueChain: "dispatch bundle → build slice",
  body: {
    readSpec: "Read the spec section and every decision it cites",
    openWork: "Open the Orca worktree and take the branch lock",
    implement: "Build inside `owns` only, in an agent-coding sub-agent",
    selfReview: "Self-review cold against proves, per [code review](../system/programs/build/code-review.md)",
    raise: "Open one PR with the slice id in the title and a `## To record` block",
    proves: (t) => `Opening the app and using **${t}** does the thing the spec says it should,\nobservably, without reading the diff to know it worked.`,
    owns: (s) => `\`packages/*/src/${s}/*\``,
    specDecisions: [
      "the thread is the unit the UI addresses, never the message.",
      "anything derivable on read is derived, never stored.",
      "one owner per fact, named in this section.",
    ],
    specQs: { open: "Can a thread span two accounts, or is scope always one identity?",
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
