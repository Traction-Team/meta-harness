/* Fixtures for the Mark IV fab monitor prototype.
   Shaped on ../overview.md, ../cli.md, ../monitor.md and the Dragonfly
   .factory/ in ../research/dragonfly-factory.md. Nothing here is read from disk:
   in the real monitor all of it comes from `fab status --all --watch --json`,
   `fab list --json` and `fab map --format json`. */

const ME = "seb";

/* One adapter per harness. What the monitor shows is decided by this
   capability table, never by a check on the harness name
   (research/agent-sessions.md, decision 4). */
const HARNESSES = [
  { id: "claude-code", label: "Claude Code", short: "claude",   ok: true,
    can: { start: true, focus: true, waits: true,  match: "exact" },
    where: (t) => `New ${t} window` },
  { id: "orca",        label: "Orca",        short: "orca",     ok: true,
    can: { start: true, focus: true, waits: true,  match: "exact", worktree: true },
    where: () => "Orca terminal, or a new Orca worktree" },
  { id: "codex",       label: "Codex",       short: "codex",    ok: true,
    can: { start: true, focus: true, waits: false, match: "transcript" },
    where: (t) => `New ${t} window · matched by transcript` },
  { id: "opencode",    label: "opencode",    short: "opencode", ok: false,
    why: "fab doctor: installed, not signed in",
    can: { start: true, focus: false, waits: false, match: "transcript" } },
  { id: "nodeterm",    label: "nodeterm",    short: "nodeterm", ok: false,
    why: "nodeterm can't be started from outside yet",
    can: { start: false, focus: true, waits: true, match: "folder" } },
];

const TERMINALS = ["Terminal", "iTerm2", "Ghostty", "Warp"];

/* ──────────────────────────────────────────────────────────── the fabs ── */

const FABS = [
  {
    id: "dragonfly",
    name: "dragonfly",
    path: "~/dev/dragonfly",
    commit: "4e1d9a2",
    check: { ok: true },
    hue: 152,
    programs: [
      {
        name: "file-work", title: "File work",
        description: "Records a bug, idea or piece of feedback as an intake note, so it is not lost. It does not prioritise or build.",
        when: "Someone reports a bug, has an idea, or passes on feedback.",
        entry: true,
        /* one program, many buttons: the open question in overview.md. The
           prototype tries "a program lists more than one entry, each with its
           own title and fixed inputs". */
        entries: [
          { title: "Log bug",      icon: "bug",  fixed: { kind: "bug" },      ask: "What went wrong?",        blurb: "Something is broken" },
          { title: "Log idea",     icon: "bulb", fixed: { kind: "idea" },     ask: "What's the idea?",        blurb: "Something we could build" },
          { title: "Log feedback", icon: "chat", fixed: { kind: "feedback" }, ask: "What did they say?",      blurb: "What a customer told you" },
        ],
        inputs: [
          { name: "what", ask: "What went wrong?", long: true },
          { name: "where", ask: "Where did you see it?", hint: "A screen, a ticket, or a link", optional: true },
          { name: "reporter", ask: "Who found it?", default: "$USER" },
        ],
        writes: ["intake-note"], next: ["prioritise-roadmap"], decides: null, worktree: "current",
      },
      {
        name: "prioritise-roadmap", title: "What's next?",
        description: "A conversation with the product lead. Reads the waiting intake notes and rewrites the roadmap, at most six lines.",
        when: "Someone asks what is next, or intake notes pile up.",
        entry: true, icon: "compass", blurb: "Pick what the team builds next",
        inputs: [],
        reads: ["intake-note"], writes: ["roadmap"], next: ["plan-feature"], decides: "whats-next", worktree: "current",
      },
      {
        name: "plan-feature", title: "Plan feature",
        description: "Writes a plan for one roadmap line, ending in its slices. Opens the plan as a docs PR for the tech lead.",
        when: "A roadmap line has no plan yet.",
        entry: true, icon: "map", blurb: "Turn a roadmap line into slices",
        inputs: [
          { name: "line", ask: "Which roadmap line?", from: "roadmap",
            choices: ["Context packs for agents", "Export to CSV", "Safari session handling", "Team billing"] },
        ],
        reads: ["roadmap"], writes: ["plan"], next: ["pull-work"], decides: "plan", worktree: "new",
      },
      {
        name: "pull-work", title: "Pull next work",
        description: "Lists ready slices with next.mjs, claims one with a draft PR, and opens a worktree session to build it.",
        when: "A developer is free, or says \"pull the next chunk\".",
        entry: true, icon: "download", blurb: "Claim the next ready slice and build it",
        inputs: [
          { name: "slice", ask: "Which slice?", hint: "Leave empty for the next ready one", optional: true },
        ],
        reads: ["plan"], writes: [], next: ["build-slice"], decides: "pick", worktree: "new",
      },
      {
        name: "build-slice", title: "Build slice",
        description: "Builds one slice in its own worktree: tests first, then the code, then a PR that is ready for review.",
        when: "A slice is claimed and its worktree is open.",
        entry: false,
        reads: ["plan"], writes: ["pr"], next: ["review-slice"], decides: null, worktree: "current",
      },
      {
        name: "review-slice", title: "Review slice",
        description: "A second agent reviews the slice's PR against its plan and the rules, then hands it to the developer to test.",
        when: "A slice PR is ready for review.",
        entry: false,
        reads: ["pr", "plan"], writes: [], next: ["finish-slice"], decides: "done", worktree: "current",
      },
      {
        name: "finish-slice", title: "Finish slice",
        description: "Writes the changelog entry, marks the slice done in its plan, and readies the PR for merge.",
        when: "The developer says the slice is done.",
        entry: false,
        reads: ["pr"], writes: ["changelog"], next: [], decides: "merge", worktree: "current",
      },
    ],
    artifacts: {
      "intake-note": { path: "docs/roadmap/intake/*.md", says: "A bug, idea, feedback or follow-up that waits for a decision", waiting: 7, unit: "wait" },
      "roadmap":     { path: "docs/roadmap/roadmap.md",  says: "What is next. At most six lines", waiting: 4, unit: "lines" },
      "plan":        { path: "docs/plans/*.md",          says: "How we build something, ending in its slices", waiting: 3, unit: "ready slices" },
      "pr":          { path: "GitHub pull requests",     says: "A slice, built and ready to review", waiting: 2, unit: "open" },
      "changelog":   { path: "CHANGELOG.md",             says: "What landed, for people who use the product", waiting: 0 },
    },
    decisions: {
      "whats-next": { who: "product lead", says: "Pick what is next, in the prioritise conversation" },
      "plan":       { who: "tech lead",    says: "Approve the plan, as a docs PR" },
      "pick":       { who: "developer",    says: "Pick the slice to pull" },
      "done":       { who: "developer",    says: "The developer tested the slice and says it is done" },
      "merge":      { who: "code owner",   says: "Review and merge the PR" },
    },
  },
  {
    id: "invoice",
    name: "invoice-service",
    path: "~/dev/invoice-service",
    commit: "a1b2c3d",
    check: { ok: false, problem: "AGENTS.md fab block is out of date with .fab/. Run fab install." },
    hue: 212,
    programs: [
      {
        name: "log-bug", title: "Log bug",
        description: "Records a bug so it is not lost. Writes an intake note, and a short bug plan when the fix is clear. It does not prioritise or build.",
        when: "Someone reports a bug, a defect from live use, or \"this is broken\".",
        entry: true, icon: "bug", blurb: "Something is broken",
        inputs: [
          { name: "what", ask: "What went wrong?", long: true },
          { name: "where", ask: "Where did you see it?", hint: "A screen, a ticket, or a link", optional: true },
          { name: "reporter", ask: "Who found it?", default: "$USER" },
        ],
        writes: ["intake-note"], next: ["prioritise"], decides: null, worktree: "current",
      },
      {
        name: "log-idea", title: "Log idea",
        description: "Records an idea as an intake note with the problem it solves. It does not plan or build.",
        when: "Someone has an idea or a request.",
        entry: true, icon: "bulb", blurb: "Something we could build",
        inputs: [
          { name: "what", ask: "What's the idea?", long: true },
          { name: "why", ask: "What problem does it solve?", optional: true },
        ],
        writes: ["intake-note"], next: ["prioritise"], decides: null, worktree: "current",
      },
      {
        name: "prioritise", title: "What's next?",
        description: "Talks the waiting intake through with the product lead and rewrites the roadmap.",
        when: "Someone asks what is next.",
        entry: true, icon: "compass", blurb: "Pick what the team builds next",
        inputs: [],
        reads: ["intake-note"], writes: ["roadmap"], next: ["plan-feature"], decides: "whats-next", worktree: "current",
      },
      {
        name: "plan-feature", title: "Plan feature",
        description: "Writes a plan for one roadmap line, ending in its slices.",
        when: "A roadmap line has no plan yet.",
        entry: true, icon: "map", blurb: "Turn a roadmap line into slices",
        inputs: [{ name: "line", ask: "Which roadmap line?", from: "roadmap", choices: ["Partial refunds", "Dunning emails", "Tax by region"] }],
        reads: ["roadmap"], writes: ["plan"], next: ["build-slice"], decides: "plan", worktree: "new",
      },
      {
        name: "build-slice", title: "Build slice",
        description: "Builds one slice in a new worktree and opens its PR.",
        when: "A planned slice is ready.",
        entry: false,
        reads: ["plan"], writes: ["pr"], next: [], decides: "merge", worktree: "new",
      },
    ],
    artifacts: {
      "intake-note": { path: "docs/intake/*.md",   says: "A bug or idea that waits for a decision", waiting: 3, unit: "wait" },
      "roadmap":     { path: "docs/roadmap.md",    says: "What is next", waiting: 3, unit: "lines" },
      "plan":        { path: "docs/plans/*.md",    says: "How we build something", waiting: 1, unit: "ready slices" },
      "pr":          { path: "GitHub pull requests", says: "A slice, ready to merge", waiting: 1, unit: "open" },
    },
    decisions: {
      "whats-next": { who: "product lead", says: "Pick what is next" },
      "plan":       { who: "tech lead",    says: "Approve the plan" },
      "merge":      { who: "code owner",   says: "Review and merge the PR" },
    },
  },
];

/* ──────────────────────────────────────────── sessions on this machine ──
   `min` is how long ago the session started. `match` is how the monitor knows
   the program: exact (run record + session id), transcript (the fab-run: line),
   inferred (branch or first prompt names a program), folder (fab only). */

const SEED_SESSIONS = [
  { id: "s1", fab: "dragonfly", program: "build-slice", label: "context-packs S3", harness: "claude-code",
    state: "working", min: 14, branch: "feat/context-packs-s3", worktree: "~/orca/workspaces/dragonfly/context-packs-s3",
    match: "exact", run: "r_20261016_c41e0b", startedBy: "fab run", inputs: { slice: "context-packs S3" } },
  { id: "s2", fab: "dragonfly", program: "build-slice", label: "export-csv S1", harness: "orca",
    state: "waits", min: 2, branch: "feat/export-csv-s1", worktree: "~/orca/workspaces/dragonfly/export-csv-s1",
    match: "exact", run: "r_20261016_9ab210", startedBy: "monitor", inputs: { slice: "export-csv S1" },
    asks: "Permission to run pnpm db:migrate" },
  { id: "s3", fab: "dragonfly", program: "file-work", label: "Safari login loop", harness: "claude-code",
    state: "working", min: 1, branch: "main", worktree: "~/dev/dragonfly",
    match: "exact", run: "r_20261016_7f3a9c", startedBy: "monitor",
    inputs: { kind: "bug", what: "Login on Safari loops back to the sign-in page", where: "app.dragonfly.dev/login", reporter: "kat" } },
  { id: "s4", fab: "dragonfly", program: "review-slice", label: "context-packs S2", harness: "codex",
    state: "idle", min: 31, branch: "feat/context-packs-s2", worktree: "~/orca/workspaces/dragonfly/context-packs-s2",
    match: "transcript", run: "r_20261016_02d7e4", startedBy: "fab run", inputs: { pr: "#412" } },
  { id: "s5", fab: "dragonfly", program: "prioritise-roadmap", label: "What's next?", harness: "claude-code",
    state: "waits", min: 9, branch: "main", worktree: "~/dev/dragonfly",
    match: "inferred", startedBy: "by hand", first: "what should we pick up next? use the prioritise program",
    asks: "Which of these three goes first?" },
  { id: "s6", fab: "dragonfly", program: null, label: "can you look at the flaky e2e on…", harness: "opencode",
    state: "unknown", min: 40, branch: "main", worktree: "~/dev/dragonfly",
    match: "folder", startedBy: "by hand", first: "can you look at the flaky e2e on checkout, it fails 1 in 5" },

  { id: "s7", fab: "invoice", program: "build-slice", label: "fix-refund-total", harness: "codex",
    state: "working", min: 22, branch: "fix/refund-total", worktree: "~/dev/invoice-service-fix-refund-total",
    match: "transcript", run: "r_20261016_51f0aa", startedBy: "monitor", inputs: { slice: "refund-total S1" } },
  { id: "s8", fab: "invoice", program: "log-bug", label: "INV-2041 refund total shows 0", harness: "claude-code",
    state: "working", min: 1, branch: "main", worktree: "~/dev/invoice-service",
    match: "exact", run: "r_20261016_e1290c", startedBy: "monitor",
    inputs: { what: "The invoice total shows 0 after a refund", where: "https://app.example.com/invoices/INV-2041", reporter: "kat" } },
  { id: "s9", fab: "invoice", program: "plan-feature", label: "Partial refunds", harness: "orca",
    state: "working", min: 5, branch: "fab/plan-feature/partial-refunds", worktree: "~/orca/workspaces/invoice-service/partial-refunds",
    match: "exact", run: "r_20261016_aa83f1", startedBy: "monitor", inputs: { line: "Partial refunds" } },
];

const SEED_FINISHED = [
  { fab: "dragonfly", program: "file-work",    label: "Export button greyed out", harness: "claude-code", ago: 48,  wrote: "docs/roadmap/intake/2026-10-16-export-greyed.md" },
  { fab: "dragonfly", program: "finish-slice", label: "context-packs S1",         harness: "claude-code", ago: 95,  wrote: "PR #409 ready to merge" },
  { fab: "dragonfly", program: "plan-feature", label: "Export to CSV",            harness: "orca",        ago: 160, wrote: "docs/plans/export-csv.md (docs PR #410)" },
  { fab: "dragonfly", program: "file-work",    label: "Idea: dark mode for docs", harness: "codex",       ago: 210, wrote: "docs/roadmap/intake/2026-10-16-dark-docs.md" },
  { fab: "invoice",   program: "log-bug",      label: "Tax rounding on CHF",      harness: "claude-code", ago: 70,  wrote: "docs/intake/2026-10-16-chf-rounding.md" },
];
