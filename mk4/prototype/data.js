/* Fixtures for the Mark IV fab monitor prototype, iteration 2.

   The shape changes from iteration 1:
   - Programs are now JOBS. A job is a definition of work an agent can do.
   - STAGES come back from Mark II. A stage is a FILTER over things that
     already exist (files, roadmap lines, branches, PRs, tickets), never a
     status that fab writes. A fab installed into a repo that already has
     plans, branches and PRs shows them in their stages on the first run.
   - A job moves work from one stage to the next (`from` → `to`). A job with
     no `from` starts something new.
   - SCORERS come back from Mark III. A scorer asks one question about the
     artifacts in a stage and answers 0–10. Higher is always better.
   - Sessions carry `who`. Teammates' sessions are a preview of a future
     sync between fab clients; nothing in Mark IV reads another machine.

   Nothing here is read from disk. In the real monitor it comes from
   `fab status --all --watch --json` and `fab work --json`. */

const ME = "seb";
const M = 1, H = 60, D = 1440; /* minutes */

const PEOPLE = {
  seb: { name: "You", short: "S", hue: 211 },
  kat: { name: "Kat", short: "K", hue: 330 },
  mo:  { name: "Mo",  short: "M", hue: 28 },
  jo:  { name: "Jo",  short: "J", hue: 160 },
};

/* One adapter per harness. What the monitor shows is decided by this
   capability table, never by a check on the harness name. */
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
  { id: "cursor",      label: "Cursor",      short: "cursor",   ok: true,
    can: { start: true, focus: true, waits: false, match: "transcript" },
    where: () => "Cursor agent, in the open window" },
  { id: "opencode",    label: "opencode",    short: "opencode", ok: false,
    why: "fab doctor: installed, not signed in",
    can: { start: true, focus: false, waits: false, match: "transcript" } },
  { id: "nodeterm",    label: "nodeterm",    short: "nodeterm", ok: false,
    why: "nodeterm can't be started from outside yet",
    can: { start: false, focus: true, waits: true, match: "folder" } },
];

const TERMINALS = ["Terminal", "iTerm2", "Ghostty", "Warp"];

/* what one artifact of each kind is called, for "Which …?" */
const KINDS = {
  note:  { one: "note",         icon: "doc" },
  line:  { one: "roadmap line", icon: "list" },
  spec:  { one: "spec",         icon: "doc" },
  plan:  { one: "plan",         icon: "map" },
  slice: { one: "slice",        icon: "layers" },
  pr:    { one: "pull request", icon: "pr" },
  issue: { one: "issue",        icon: "dot" },
};

/* ──────────────────────────────────────────────────────────── the fabs ── */

const FABS = [
  {
    id: "dragonfly",
    name: "dragonfly",
    path: "~/dev/dragonfly",
    commit: "4e1d9a2",
    check: { ok: true },

    /* In flow order. `find` + `where` is the filter. `slow` is how long an
       artifact may sit before the stage counts as slow. */
    stages: [
      { id: "intake",   title: "Intake",         kind: "note",
        find: "files docs/roadmap/intake/*.md", where: "status: open",
        next: "prioritise", slow: 7 * D, scoredBy: ["clear"] },
      { id: "roadmap",  title: "Approved specs", kind: "spec",
        find: "files docs/specs/*.md", where: "status: approved",
        next: "plan-feature", slow: 7 * D },
      { id: "planning", title: "WIP plans", kind: "plan",
        find: "prs label:plan", where: "open",
        next: "review-plan", waitsFor: "tech lead", slow: 2 * D, scoredBy: ["edge", "pdebt"] },
      { id: "ready",    title: "Ready to build", kind: "slice",
        find: "slices in docs/plans/*.md", where: "status: ready",
        next: "pull-work", slow: 5 * D, scoredBy: ["edge", "pdebt"] },
      { id: "building", title: "Building",       kind: "pr",
        find: "prs head:feat/*", where: "draft",
        next: "build-slice", slow: 2 * D },
      { id: "review",   title: "Needs review",   kind: "pr",
        find: "prs head:feat/*", where: "ready for review, not approved",
        next: "review-slice", waitsFor: "code owner", slow: 1 * D, scoredBy: ["tdebt", "tests"] },
      { id: "merge",    title: "Ready to merge", kind: "pr",
        find: "prs head:feat/*", where: "approved",
        next: "finish-slice", slow: 1 * D, scoredBy: ["tdebt", "tests"] },
      { id: "shipped",  title: "Shipped",        kind: "pr",
        find: "prs head:feat/*", where: "merged in the last 7 days", done: true },
    ],

    jobs: [
      {
        name: "file-work", title: "File work", from: null, to: "intake",
        description: "Records a bug, idea or piece of feedback as an intake note, so it is not lost. It does not prioritise or build.",
        /* one job, many buttons */
        entries: [
          { title: "Log bug",      icon: "bug",  fixed: { kind: "bug" },      ask: "What went wrong?",   blurb: "Something is broken" },
          { title: "Log idea",     icon: "bulb", fixed: { kind: "idea" },     ask: "What's the idea?",   blurb: "Something we could build" },
          { title: "Log feedback", icon: "chat", fixed: { kind: "feedback" }, ask: "What did they say?", blurb: "What a customer told you" },
        ],
        inputs: [
          { name: "what", ask: "What went wrong?", long: true },
          { name: "where", ask: "Where did you see it?", hint: "A screen, a ticket, or a link", optional: true },
          { name: "reporter", ask: "Who found it?", default: "$USER" },
        ],
        worktree: "current",
      },
      {
        name: "prioritise", title: "What's next?", from: "intake", to: "roadmap", takes: false,
        icon: "compass", blurb: "Read the intake and pick what the team builds next",
        description: "A conversation with the product lead. Reads every open intake note and writes a spec in docs/specs/ for each one picked, at most six.",
        inputs: [], decides: "whats-next", worktree: "current",
      },
      {
        name: "plan-feature", title: "Plan feature", from: "roadmap", to: "planning", takes: true,
        icon: "map", blurb: "Turn an approved spec into a plan with slices",
        description: "Writes a plan for one approved spec, ending in its slices. Opens the plan as a docs PR for the tech lead.",
        inputs: [], worktree: "new",
      },
      {
        name: "review-plan", title: "Review plan", from: "planning", to: "ready", takes: true,
        icon: "eye", blurb: "Check a plan for gaps before the tech lead approves it",
        description: "A second agent reads the plan against the code and the rules, comments on the gaps, and asks the tech lead to approve.",
        inputs: [], decides: "plan", worktree: "current",
      },
      {
        name: "pull-work", title: "Start next plan", from: "ready", to: "building", takes: true,
        icon: "download", blurb: "Claim a ready slice and start building it",
        description: "Claims one ready slice with a draft PR and opens a worktree session to build it.",
        inputs: [], decides: "pick", worktree: "new",
      },
      {
        name: "build-slice", title: "Build slice", from: "building", to: "review", takes: true,
        icon: "hammer", blurb: "Tests first, then the code, then mark the PR ready",
        description: "Builds one slice in its own worktree: tests first, then the code, then a PR that is ready for review.",
        inputs: [], worktree: "current",
      },
      {
        name: "review-slice", title: "Review slice", from: "review", to: "merge", takes: true,
        icon: "eye", blurb: "A second agent reviews the PR against its plan",
        description: "A second agent reviews the slice's PR against its plan and the rules, then hands it to the code owner.",
        inputs: [], decides: "done", worktree: "current",
      },
      {
        name: "finish-slice", title: "Finish slice", from: "merge", to: "shipped", takes: true,
        icon: "flag", blurb: "Changelog entry, mark the slice done, merge",
        description: "Writes the changelog entry, marks the slice done in its plan, and merges the PR.",
        inputs: [], decides: "merge", worktree: "current",
      },
    ],

    /* each scorer is a small skill in .fab/scorers/<id>/SKILL.md */
    scorers: {
      clear: { title: "Clear to act on", ask: "Could someone act on this note without asking a question first?" },
      edge:  { title: "Edge cases",      ask: "Does the plan name the edge cases, and say what happens in each?" },
      pdebt: { title: "Product debt",    ask: "Does it add little product debt: no half-features, no settings nobody asked for?" },
      tdebt: { title: "Tech debt",       ask: "Does it add little tech debt: no copies, no skipped layers, no TODOs left behind?" },
      tests: { title: "Tests prove it",  ask: "Do the tests fail without the change and pass with it?" },
    },

    decisions: {
      "whats-next": { who: "product lead", says: "Pick what is next, in the prioritise conversation" },
      "plan":       { who: "tech lead",    says: "Approve the plan, as a docs PR" },
      "pick":       { who: "developer",    says: "Pick the slice to pull" },
      "done":       { who: "code owner",   says: "Approve the PR" },
      "merge":      { who: "code owner",   says: "Merge the PR" },
    },

    /* What the stage filters find right now, after history has hidden what
       moved on. `age` is minutes in the stage. `trail` is the history fab
       could link, oldest first: each step is an earlier artifact of the same
       work. Without one the artifact was found by its filter and nothing
       links it further back.

       `via` is how a step links to the step before it:
         note     a git note in refs/notes/fab, written by a fab run
         trailer  a Fab-From: trailer in a commit
         link     the artifact names the earlier one (PR body, frontmatter)
         diff     the PR's diff edits the earlier artifact
         key      only the names match (the work key): a guess
         same     the same artifact, in a new state (a draft PR made ready)
         back     its later artifact was abandoned, so it shows again
         found    nothing links it further back
       `also` is fan-in: more parents of the same step. `alsoMade` is
       fan-out: the other artifacts the same step made. `abandoned` marks a
       later artifact that was closed without a merge, so it hides nothing.

       Earlier steps whose source still matches their stage's filter (an
       open intake note, an approved spec, a ready slice on main) are what
       history hides. See hiddenIn() in core.js. */
    artifacts: [
      /* intake */
      { id: "i2", stage: "intake", title: "Export button greyed out",       ref: "docs/roadmap/intake/2026-10-16-export-greyed.md", age: 48 * M, who: "seb", scores: { clear: 8.4 },
        trail: [{ stage: "intake", job: "file-work", who: "seb", hz: "claude-code", ago: 48, via: "note", scores: { clear: 8.4 } }] },
      { id: "i3", stage: "intake", title: "Idea: dark mode for docs",       ref: "docs/roadmap/intake/2026-10-16-dark-docs.md", age: 3 * H, who: "seb", scores: { clear: 6.1 },
        trail: [{ stage: "intake", job: "file-work", who: "seb", hz: "codex", ago: 3 * H, via: "note", scores: { clear: 6.1 } }] },
      { id: "i4", stage: "intake", title: "Search is slow on big workspaces", ref: "docs/roadmap/intake/2026-10-15-slow-search.md", age: 1 * D, who: "kat", scores: { clear: 7.2 } },
      { id: "i9", stage: "intake", title: "Billing page 500s on Firefox",   ref: "docs/roadmap/intake/2026-10-15-billing-500.md", age: 1 * D + 4 * H, who: "mo", scores: { clear: 8.8 } },
      { id: "i5", stage: "intake", title: "Customer wants SSO",             ref: "docs/roadmap/intake/2026-10-14-sso.md", age: 2 * D, who: "jo", scores: { clear: 4.6 } },
      { id: "i6", stage: "intake", title: "Typo in onboarding email",       ref: "docs/roadmap/intake/2026-10-13-typo.md", age: 3 * D, who: "kat", scores: { clear: 9.3 } },
      { id: "i7", stage: "intake", title: "Flaky e2e on checkout",          ref: "docs/roadmap/intake/2026-10-12-flaky-checkout.md", age: 4 * D, who: "seb", scores: { clear: 3.9 } },
      { id: "i8", stage: "intake", title: "Idea: weekly digest email",      ref: "docs/roadmap/intake/2026-10-10-digest.md", age: 6 * D, who: "jo" },

      /* approved specs */
      { id: "r1", stage: "roadmap", title: "Safari session handling", ref: "docs/specs/safari-sessions.md", age: 2 * D, who: "seb" },
      { id: "r2", stage: "roadmap", title: "Team billing",            ref: "docs/specs/team-billing.md", age: 5 * D, who: "seb" },
      { id: "r3", stage: "roadmap", title: "Faster search",           ref: "docs/specs/faster-search.md", age: 1 * D, who: "seb",
        trail: [
          { stage: "intake", title: "Search is slow on big workspaces (2)", ref: "docs/roadmap/intake/2026-10-09-search.md", job: "file-work", who: "kat", hz: "claude-code", ago: 8 * D, via: "note", scores: { clear: 7.0 } },
          { stage: "roadmap", job: "prioritise", who: "seb", hz: "claude-code", ago: 1 * D, via: "note" },
        ] },

      /* planning */
      { id: "p1", stage: "planning", title: "Audit log", ref: "docs PR #418 · docs/plans/audit-log.md", age: 1 * D + 6 * H, who: "seb", scores: { edge: 5.2, pdebt: 7.4 },
        trail: [
          { stage: "roadmap", title: "Audit log", ref: "docs/specs/audit-log.md", ago: 6 * D, via: "found" },
          { stage: "planning", job: "plan-feature", who: "seb", hz: "orca", ago: 1 * D + 6 * H, via: "note", scores: { edge: 5.2, pdebt: 7.4 } },
        ] },

      /* ready to build */
      { id: "sl1", stage: "ready", title: "export-csv S2",     ref: "docs/plans/export-csv.md § S2", age: 2 * D, who: "seb", scores: { edge: 8.1, pdebt: 8.0 } },
      { id: "sl2", stage: "ready", title: "export-csv S3",     ref: "docs/plans/export-csv.md § S3", age: 2 * D, who: "seb", scores: { edge: 7.6, pdebt: 8.0 } },
      /* abandoned: its PR was closed without a merge, so it is back here */
      { id: "sl3", stage: "ready", title: "context-packs S4",  ref: "docs/plans/context-packs.md § S4", age: 3 * D, who: "seb", scores: { edge: 8.4, pdebt: 6.2 },
        trail: [
          { stage: "roadmap", title: "Context packs for agents", ref: "docs/specs/context-packs.md", ago: 10 * D, via: "found" },
          { stage: "planning", title: "Context packs for agents", ref: "docs PR #405 · docs/plans/context-packs.md", job: "plan-feature", who: "seb", hz: "orca", ago: 9 * D, via: "note", scores: { edge: 6.0, pdebt: 8.2 } },
          { stage: "ready", ref: "docs/plans/context-packs.md § S4", job: "review-plan", who: "seb", hz: "codex", ago: 8 * D, via: "note", scores: { edge: 8.4, pdebt: 6.2 } },
          { stage: "building", ref: "feat/context-packs-s4 · draft #403", job: "pull-work", who: "mo", hz: "claude-code", ago: 6 * D, via: "note", abandoned: true, note: "Closed without a merge 3 days ago." },
          { stage: "ready", ref: "docs/plans/context-packs.md § S4", ago: 3 * D, via: "back", note: "Its only PR was closed, so nothing later hides it. It shows in Ready to build again." },
        ] },
      { id: "sl4", stage: "ready", title: "context-packs S5",  ref: "docs/plans/context-packs.md § S5", age: 8 * D, who: "seb", scores: { edge: 6.9, pdebt: 5.8 } },

      /* building */
      { id: "b1", stage: "building", title: "context-packs S3", ref: "feat/context-packs-s3 · draft #419", age: 14 * M, who: "seb" },
      { id: "b2", stage: "building", title: "export-csv S1",    ref: "feat/export-csv-s1 · draft #420",   age: 3 * H, who: "seb" },
      { id: "b3", stage: "building", title: "search-index S1",  ref: "feat/search-index-s1 · draft #421", age: 5 * H, who: "kat" },

      /* review: this is where it piles up */
      { id: "v1", stage: "review", title: "context-packs S2", ref: "feat/context-packs-s2 · #412", age: 1 * D + 2 * H, who: "seb", scores: { tdebt: 7.1, tests: 8.3 },
        trail: [
          { stage: "intake", title: "Agents forget context between sessions", ref: "docs/roadmap/intake/2026-10-04-agent-context.md", job: "file-work", who: "kat", hz: "claude-code", ago: 12 * D, via: "note", scores: { clear: 8.0 } },
          { stage: "roadmap", title: "Context packs for agents", ref: "docs/specs/context-packs.md", job: "prioritise", who: "seb", hz: "claude-code", ago: 10 * D, via: "note" },
          { stage: "planning", title: "Context packs for agents", ref: "docs PR #405 · docs/plans/context-packs.md", job: "plan-feature", who: "seb", hz: "orca", ago: 9 * D, via: "note", scores: { edge: 6.0, pdebt: 8.2 },
            alsoMade: ["m1", "b1", "sl3", "sl4"] },
          { stage: "ready", title: "context-packs S2", ref: "docs/plans/context-packs.md § S2", job: "review-plan", who: "seb", hz: "codex", ago: 8 * D, via: "note", scores: { edge: 8.4, pdebt: 8.2 }, note: "Approved by Jo (tech lead) after two edge cases were added" },
          { stage: "building", ref: "feat/context-packs-s2 · draft #412", job: "pull-work", who: "seb", hz: "claude-code", ago: 2 * D, via: "note" },
          { stage: "review", ref: "feat/context-packs-s2 · #412", job: "build-slice", who: "seb", hz: "claude-code", ago: 1 * D + 2 * H, via: "same", scores: { tdebt: 7.1, tests: 8.3 } },
        ] },
      /* cold start: made before the fab, linked only by the work key */
      { id: "v2", stage: "review", title: "onboarding-copy S1", ref: "feat/onboarding-copy-s1 · #414", age: 1 * D + 9 * H, who: "kat", scores: { tdebt: 9.0, tests: 6.2 },
        trail: [
          { stage: "ready", ref: "docs/plans/onboarding-copy.md § S1", ago: 4 * D, via: "found" },
          { stage: "review", ref: "feat/onboarding-copy-s1 · #414", who: "kat", ago: 1 * D + 9 * H, via: "key", how: "The branch name matches the plan's name and slice", scores: { tdebt: 9.0, tests: 6.2 } },
        ] },
      /* built by hand; the PR names the intake note it fixes */
      { id: "v3", stage: "review", title: "billing-fix S1",     ref: "fix/billing-500 · #415",          age: 2 * D, who: "mo", scores: { tdebt: 4.4, tests: 3.8 },
        trail: [
          { stage: "intake", title: "Billing page 500s on Firefox (first report)", ref: "docs/roadmap/intake/2026-10-14-billing-500.md", ago: 3 * D, via: "found" },
          { stage: "review", ref: "fix/billing-500 · #415", who: "mo", ago: 2 * D, via: "link", how: "The PR body names the intake note", note: "Built by hand, outside fab.", scores: { tdebt: 4.4, tests: 3.8 } },
        ] },
      /* fan-in: one PR builds slices of two plans, so both are hidden */
      { id: "v4", stage: "review", title: "search-ui S1",        ref: "feat/search-ui-s1 · #416", age: 3 * D, who: "kat", scores: { tdebt: 6.6, tests: 7.0 },
        trail: [
          { stage: "ready", title: "search-ui S1", ref: "docs/plans/search-ui.md § S1", ago: 6 * D, via: "found", scores: { edge: 7.2, pdebt: 6.8 } },
          { stage: "review", ref: "feat/search-ui-s1 · #416", who: "kat", ago: 3 * D, via: "link", how: "The PR body names both slices",
            also: [{ stage: "ready", title: "search-index S2", ref: "docs/plans/search-index.md § S2", via: "link", scores: { edge: 4.6, pdebt: 7.9 } }],
            scores: { tdebt: 6.6, tests: 7.0 } },
        ] },
      /* the PR edits the plan to set the slice to building */
      { id: "v5", stage: "review", title: "export-csv S0",       ref: "feat/export-csv-s0 · #417", age: 3 * D + 5 * H, who: "seb", scores: { tdebt: 8.2, tests: 8.8 },
        trail: [
          { stage: "ready", ref: "docs/plans/export-csv.md § S0", ago: 5 * D, via: "found", scores: { edge: 7.9, pdebt: 8.3 } },
          { stage: "review", ref: "feat/export-csv-s0 · #417", who: "seb", ago: 3 * D + 5 * H, via: "diff", how: "The PR sets § S0 to status: building in docs/plans/export-csv.md", scores: { tdebt: 8.2, tests: 8.8 } },
        ] },
      { id: "v6", stage: "review", title: "audit-log spike",     ref: "spike/audit-log · #411", age: 5 * D, who: "jo" },

      /* ready to merge */
      /* a person added the Fab-From trailer by hand */
      { id: "m1", stage: "merge", title: "context-packs S1", ref: "feat/context-packs-s1 · #409", age: 2 * H, who: "seb", scores: { tdebt: 8.0, tests: 9.1 },
        trail: [
          { stage: "ready", ref: "docs/plans/context-packs.md § S1", ago: 8 * D, via: "found", scores: { edge: 7.7, pdebt: 8.2 } },
          { stage: "building", ref: "feat/context-packs-s1 · draft #409", who: "seb", ago: 7 * D, via: "trailer", how: "Fab-From: docs/plans/context-packs.md § S1, in the first commit" },
          { stage: "review", ref: "feat/context-packs-s1 · #409", job: "build-slice", who: "seb", hz: "claude-code", ago: 4 * D, via: "same", scores: { tdebt: 6.9, tests: 8.4 } },
          { stage: "merge", ref: "feat/context-packs-s1 · #409", job: "review-slice", who: "kat", hz: "codex", ago: 2 * H, via: "note", scores: { tdebt: 8.0, tests: 9.1 } },
        ] },

      /* shipped */
      { id: "x1", stage: "shipped", title: "plan template v2",   ref: "#401 merged", age: 6 * D, who: "seb" },
      { id: "x2", stage: "shipped", title: "fix: login redirect", ref: "#404 merged", age: 4 * D, who: "mo" },
      { id: "x3", stage: "shipped", title: "intake form copy",   ref: "#406 merged", age: 3 * D, who: "kat" },
      { id: "x4", stage: "shipped", title: "export-csv spike",   ref: "#408 merged", age: 1 * D, who: "seb" },
    ],
  },

  {
    id: "invoice",
    name: "invoice-service",
    path: "~/dev/invoice-service",
    commit: "a1b2c3d",
    check: { ok: false, problem: "AGENTS.md fab block is out of date with .fab/. Run fab install." },
    stages: [
      { id: "intake",  title: "Intake",         kind: "issue", find: "linear team:INV", where: "state: triage", next: "prioritise", slow: 3 * D, scoredBy: ["clear"] },
      { id: "roadmap", title: "Approved specs", kind: "spec",  find: "files docs/specs/*.md", where: "status: approved", next: "plan-feature", slow: 7 * D },
      { id: "ready",   title: "Ready to build", kind: "slice", find: "slices in docs/plans/*.md", where: "status: ready", next: "build-slice", slow: 5 * D },
      { id: "review",  title: "Needs review",   kind: "pr",    find: "prs", where: "open, not approved", waitsFor: "code owner", slow: 1 * D, scoredBy: ["tdebt"] },
      { id: "shipped", title: "Shipped",        kind: "pr",    find: "prs", where: "merged in the last 7 days", done: true },
    ],
    jobs: [
      { name: "log-bug", title: "Log bug", from: null, to: "intake", icon: "bug", blurb: "Something is broken",
        description: "Records a bug as a Linear issue in triage. It does not prioritise or build.",
        inputs: [
          { name: "what", ask: "What went wrong?", long: true },
          { name: "where", ask: "Where did you see it?", hint: "A screen, a ticket, or a link", optional: true },
          { name: "reporter", ask: "Who found it?", default: "$USER" },
        ], worktree: "current" },
      { name: "log-idea", title: "Log idea", from: null, to: "intake", icon: "bulb", blurb: "Something we could build",
        description: "Records an idea as a Linear issue with the problem it solves.",
        inputs: [{ name: "what", ask: "What's the idea?", long: true }, { name: "why", ask: "What problem does it solve?", optional: true }], worktree: "current" },
      { name: "prioritise", title: "What's next?", from: "intake", to: "roadmap", takes: false, icon: "compass", blurb: "Pick what the team builds next",
        description: "Talks the triage queue through with the product lead and writes a spec for each one picked.", inputs: [], decides: "whats-next", worktree: "current" },
      { name: "plan-feature", title: "Plan feature", from: "roadmap", to: "ready", takes: true, icon: "map", blurb: "Turn an approved spec into slices",
        description: "Writes a plan for one approved spec, ending in its slices.", inputs: [], decides: "plan", worktree: "new" },
      { name: "build-slice", title: "Build slice", from: "ready", to: "review", takes: true, icon: "hammer", blurb: "Build one slice and open its PR",
        description: "Builds one slice in a new worktree and opens its PR.", inputs: [], worktree: "new" },
    ],
    scorers: {
      clear: { title: "Clear to act on", ask: "Could someone act on this issue without asking a question first?" },
      tdebt: { title: "Tech debt",       ask: "Does it add little tech debt?" },
    },
    decisions: {
      "whats-next": { who: "product lead", says: "Pick what is next" },
      "plan":       { who: "tech lead",    says: "Approve the plan" },
    },
    artifacts: [
      { id: "n1", stage: "intake", title: "CHF rounding off by 1c", ref: "INV-2038", age: 70 * M, who: "seb", scores: { clear: 7.7 } },
      { id: "n2", stage: "intake", title: "Dunning email bounces",  ref: "INV-2036", age: 2 * D, who: "seb", scores: { clear: 5.0 } },
      { id: "n3", stage: "intake", title: "PDF export cuts totals", ref: "INV-2031", age: 4 * D, who: "seb", scores: { clear: 4.1 } },
      { id: "q1", stage: "roadmap", title: "Partial refunds", ref: "docs/specs/partial-refunds.md", age: 3 * D, who: "seb" },
      { id: "q2", stage: "roadmap", title: "Dunning emails",  ref: "docs/specs/dunning-emails.md", age: 3 * D, who: "seb" },
      { id: "q3", stage: "roadmap", title: "Tax by region",   ref: "docs/specs/tax-by-region.md", age: 9 * D, who: "seb" },
      { id: "k1", stage: "ready", title: "refund-total S1", ref: "docs/plans/refund-total.md § S1", age: 1 * D, who: "seb" },
      { id: "w1", stage: "review", title: "fix-currency-format", ref: "#88", age: 6 * H, who: "seb", scores: { tdebt: 8.5 } },
      { id: "z1", stage: "shipped", title: "fix-vat-label", ref: "#85 merged", age: 2 * D, who: "seb" },
    ],
  },
];

/* ──────────────────────────────────────────── sessions ──
   `art` is the artifact the session works on. `makes` is the stage a session
   writes a NEW artifact into (file-work, prioritise). `who` is whose machine
   it runs on: anyone but ME is a preview of team sync. */

const SEED_SESSIONS = [
  { id: "s1", fab: "dragonfly", who: "seb", job: "build-slice", art: "b1", label: "context-packs S3", harness: "claude-code",
    state: "working", min: 14, branch: "feat/context-packs-s3", worktree: "~/orca/workspaces/dragonfly/context-packs-s3",
    match: "exact", run: "r_20261017_c41e0b", startedBy: "fab run" },
  { id: "s2", fab: "dragonfly", who: "seb", job: "build-slice", art: "b2", label: "export-csv S1", harness: "orca",
    state: "waits", min: 2, branch: "feat/export-csv-s1", worktree: "~/orca/workspaces/dragonfly/export-csv-s1",
    match: "exact", run: "r_20261017_9ab210", startedBy: "monitor", asks: "Permission to run pnpm db:migrate" },
  { id: "s3", fab: "dragonfly", who: "seb", job: "file-work", makes: "intake", label: "Safari login loops", harness: "claude-code",
    state: "working", min: 1, branch: "main", worktree: "~/dev/dragonfly",
    match: "exact", run: "r_20261017_7f3a9c", startedBy: "monitor",
    inputs: { kind: "bug", what: "Login on Safari loops back to the sign-in page", where: "app.dragonfly.dev/login", reporter: "kat" } },
  { id: "s4", fab: "dragonfly", who: "seb", job: "review-slice", art: "v1", label: "Review context-packs S2", harness: "codex",
    state: "idle", min: 31, branch: "feat/context-packs-s2", worktree: "~/orca/workspaces/dragonfly/context-packs-s2",
    match: "transcript", run: "r_20261017_02d7e4", startedBy: "fab run" },
  { id: "s12", fab: "dragonfly", who: "seb", job: "build-slice", art: "v1", label: "Fix review notes on #412", harness: "claude-code",
    state: "working", min: 6, branch: "feat/context-packs-s2", worktree: "~/orca/workspaces/dragonfly/context-packs-s2",
    match: "inferred", startedBy: "by hand", first: "address the review comments on #412" },
  { id: "s5", fab: "dragonfly", who: "seb", job: "prioritise", makes: "roadmap", label: "What's next?", harness: "claude-code",
    state: "waits", min: 9, branch: "main", worktree: "~/dev/dragonfly",
    match: "inferred", startedBy: "by hand", first: "what should we pick up next? use the prioritise job",
    asks: "Which of these three goes first?" },
  { id: "s6", fab: "dragonfly", who: "seb", job: null, label: "can you look at the flaky e2e on…", harness: "opencode",
    state: "unknown", min: 40, branch: "main", worktree: "~/dev/dragonfly",
    match: "folder", startedBy: "by hand", first: "can you look at the flaky e2e on checkout, it fails 1 in 5" },

  /* teammates (sync preview) */
  { id: "t1", fab: "dragonfly", who: "kat", job: "build-slice", art: "b3", label: "search-index S1", harness: "cursor",
    state: "working", min: 42, branch: "feat/search-index-s1", worktree: "kat-mbp:~/dev/dragonfly-search-index", match: "exact", startedBy: "monitor" },
  { id: "t2", fab: "dragonfly", who: "mo", job: "review-slice", art: "v3", label: "Review billing-fix S1", harness: "claude-code",
    state: "working", min: 18, branch: "fix/billing-500", worktree: "mo-studio:~/code/dragonfly", match: "exact", startedBy: "monitor" },
  { id: "t3", fab: "dragonfly", who: "kat", job: "review-slice", art: "v1", label: "Second review on #412", harness: "codex",
    state: "idle", min: 55, branch: "feat/context-packs-s2", worktree: "kat-mbp:~/dev/dragonfly", match: "transcript", startedBy: "monitor" },
  { id: "t4", fab: "dragonfly", who: "jo", job: "review-plan", art: "p1", label: "Review audit-log plan", harness: "claude-code",
    state: "waits", min: 25, branch: "fab/plan-feature/audit-log", worktree: "jo-air:~/dragonfly", match: "exact", startedBy: "monitor",
    asks: "Should the audit log cover read access too?" },

  { id: "s7", fab: "invoice", who: "seb", job: "build-slice", art: "k1", label: "refund-total S1", harness: "codex",
    state: "working", min: 22, branch: "fix/refund-total", worktree: "~/dev/invoice-service-fix-refund-total",
    match: "transcript", run: "r_20261017_51f0aa", startedBy: "monitor" },
  { id: "s8", fab: "invoice", who: "seb", job: "log-bug", makes: "intake", label: "Refund total shows 0", harness: "claude-code",
    state: "working", min: 1, branch: "main", worktree: "~/dev/invoice-service",
    match: "exact", run: "r_20261017_e1290c", startedBy: "monitor",
    inputs: { what: "The invoice total shows 0 after a refund", where: "https://app.example.com/invoices/INV-2041", reporter: "kat" } },
  { id: "s9", fab: "invoice", who: "seb", job: "plan-feature", art: "q1", label: "Plan partial refunds", harness: "orca",
    state: "working", min: 5, branch: "fab/plan-feature/partial-refunds", worktree: "~/orca/workspaces/invoice-service/partial-refunds",
    match: "exact", run: "r_20261017_aa83f1", startedBy: "monitor" },
];
