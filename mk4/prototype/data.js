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
  release: { one: "release note", icon: "doc" },
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
      { id: "intake",   title: "Logged ideas",    kind: "note",
        find: "files docs/roadmap/intake/*.md", where: "status: open",
        next: "prioritise", slow: 7 * D, scoredBy: ["clear"] },
      { id: "roadmap",  title: "Approved specs", kind: "spec",
        find: "files docs/specs/*.md", where: "status: approved",
        next: "plan-feature", slow: 7 * D },
      { id: "planning", title: "WIP plans", kind: "plan",
        find: "prs label:plan", where: "open",
        next: "review-plan", waitsFor: "tech lead", slow: 2 * D, scoredBy: ["edge", "pdebt"] },
      /* No Building stage. A slice being built stays here, with its agent on
         it, until its PR is ready for review. `claim` is how fab sees that
         someone has it: a draft PR that names the slice. A claim with no
         agent on it is stalled. */
      { id: "ready",    title: "Approved plans",  kind: "slice",
        find: "slices in docs/plans/*.md", where: "status: ready",
        claim: "a draft PR that names the slice",
        next: "build-slice", slow: 5 * D, scoredBy: ["edge", "pdebt"] },
      { id: "review",   title: "Built branches",  kind: "pr",
        find: "prs head:feat/*", where: "ready for review, not merged",
        next: "review-slice", waitsFor: "code owner", slow: 1 * D, scoredBy: ["tdebt", "tests"] },
      /* Merged is not the end: the landing job still has to update the rest
         of the system. Its release note is the later
         artifact, so the PR leaves here once the note exists. */
      { id: "merge",    title: "Merged branches", kind: "pr",
        find: "prs head:feat/*", where: "merged, no release note yet",
        next: "finish-slice", slow: 1 * D, scoredBy: ["tdebt", "tests"] },
      { id: "shipped",  title: "Release notes",   kind: "release",
        find: "files docs/changelog/*.md", where: "added in the last 7 days", done: true },
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
        /* was two jobs: pull-work (claim it) and build-slice (build it). The
           claim is now the first step of the build, not a stage. */
        name: "build-slice", title: "Build slice", from: "ready", to: "review", takes: true,
        icon: "hammer", blurb: "Claim a slice, build it tests first, mark the PR ready",
        description: "Claims one ready slice with a draft PR, then builds it in its own worktree: tests first, then the code. Marks the PR ready for review when it is done.",
        claims: "Opens a draft PR that names the slice",
        inputs: [], decides: "pick", worktree: "new",
      },
      {
        name: "review-slice", title: "Review slice", from: "review", to: "merge", takes: true,
        icon: "eye", blurb: "A second agent reviews the PR against its plan",
        description: "A second agent reviews the slice's PR against its plan and the rules, then hands it to the code owner to approve and merge.",
        inputs: [], decides: "merge", worktree: "current",
      },
      {
        name: "finish-slice", title: "Land branch", from: "merge", to: "shipped", takes: true,
        icon: "flag", blurb: "Bring a merged branch's changes back into the rest of the system",
        description: "Runs after the merge. Writes a release note in docs/changelog/, marks the slice done in its plan, and updates the specs, roadmap and docs that the change touched.",
        inputs: [], worktree: "current",
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
      "pick":       { who: "developer",    says: "Pick the slice to build" },
      "done":       { who: "code owner",   says: "Approve the PR" },
      "merge":      { who: "code owner",   says: "Approve and merge the PR" },
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
      /* logged ideas */
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

      /* approved plans */
      /* `claim` is the draft PR that claims the slice. `ago` is when it was
         opened. A slice with a claim and an agent on it is being built. */
      { id: "b1", stage: "ready", title: "context-packs S3", ref: "docs/plans/context-packs.md § S3", age: 8 * D, who: "seb", scores: { edge: 8.0, pdebt: 7.7 },
        claim: { ref: "feat/context-packs-s3 · draft #419", who: "seb", ago: 14 * M } },
      { id: "b2", stage: "ready", title: "export-csv S1",    ref: "docs/plans/export-csv.md § S1", age: 2 * D, who: "seb", scores: { edge: 7.4, pdebt: 8.3 },
        claim: { ref: "feat/export-csv-s1 · draft #420", who: "seb", ago: 3 * H } },
      { id: "b3", stage: "ready", title: "search-index S1",  ref: "docs/plans/search-index.md § S1", age: 4 * D, who: "kat", scores: { edge: 6.8, pdebt: 7.1 },
        claim: { ref: "feat/search-index-s1 · draft #421", who: "kat", ago: 5 * H } },
      { id: "sl1", stage: "ready", title: "export-csv S2",     ref: "docs/plans/export-csv.md § S2", age: 2 * D, who: "seb", scores: { edge: 8.1, pdebt: 8.0 } },
      /* stalled: claimed by a draft PR, but no agent is on it. The session
         that opened it ended (a closed laptop, a crash) before the PR was ready */
      { id: "sl2", stage: "ready", title: "export-csv S3",     ref: "docs/plans/export-csv.md § S3", age: 2 * D, who: "seb", scores: { edge: 7.6, pdebt: 8.0 },
        claim: { ref: "feat/export-csv-s3 · draft #422", who: "seb", ago: 1 * D + 4 * H } },
      /* abandoned: its PR was closed without a merge, so it is back here */
      { id: "sl3", stage: "ready", title: "context-packs S4",  ref: "docs/plans/context-packs.md § S4", age: 3 * D, who: "seb", scores: { edge: 8.4, pdebt: 6.2 },
        trail: [
          { stage: "roadmap", title: "Context packs for agents", ref: "docs/specs/context-packs.md", ago: 10 * D, via: "found" },
          { stage: "planning", title: "Context packs for agents", ref: "docs PR #405 · docs/plans/context-packs.md", job: "plan-feature", who: "seb", hz: "orca", ago: 9 * D, via: "note", scores: { edge: 6.0, pdebt: 8.2 } },
          { stage: "ready", ref: "docs/plans/context-packs.md § S4", job: "review-plan", who: "seb", hz: "codex", ago: 8 * D, via: "note", scores: { edge: 8.4, pdebt: 6.2 } },
          { stage: "ready", title: "Claimed by Mo", ref: "feat/context-packs-s4 · draft #403", job: "build-slice", who: "mo", hz: "claude-code", ago: 6 * D, via: "note", abandoned: true },
          { stage: "ready", ref: "docs/plans/context-packs.md § S4", ago: 3 * D, via: "back" },
        ] },
      { id: "sl4", stage: "ready", title: "context-packs S5",  ref: "docs/plans/context-packs.md § S5", age: 8 * D, who: "seb", scores: { edge: 6.9, pdebt: 5.8 } },

      /* built branches: this is where it piles up */
      { id: "v1", stage: "review", title: "context-packs S2", ref: "feat/context-packs-s2 · #412", age: 1 * D + 2 * H, who: "seb", scores: { tdebt: 7.1, tests: 8.3 },
        trail: [
          { stage: "intake", title: "Agents forget context between sessions", ref: "docs/roadmap/intake/2026-10-04-agent-context.md", job: "file-work", who: "kat", hz: "claude-code", ago: 12 * D, via: "note", scores: { clear: 8.0 } },
          { stage: "roadmap", title: "Context packs for agents", ref: "docs/specs/context-packs.md", job: "prioritise", who: "seb", hz: "claude-code", ago: 10 * D, via: "note" },
          { stage: "planning", title: "Context packs for agents", ref: "docs PR #405 · docs/plans/context-packs.md", job: "plan-feature", who: "seb", hz: "orca", ago: 9 * D, via: "note", scores: { edge: 6.0, pdebt: 8.2 },
            alsoMade: ["m1", "b1", "sl3", "sl4"] },
          { stage: "ready", title: "context-packs S2", ref: "docs/plans/context-packs.md § S2", job: "review-plan", who: "seb", hz: "codex", ago: 8 * D, via: "note", scores: { edge: 8.4, pdebt: 8.2 }, note: "Approved by Jo (tech lead) after two edge cases were added" },
          { stage: "review", ref: "feat/context-packs-s2 · #412", job: "build-slice", who: "seb", hz: "claude-code", ago: 1 * D + 2 * H, via: "note", scores: { tdebt: 7.1, tests: 8.3 } },
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
          { stage: "review", ref: "fix/billing-500 · #415", who: "mo", ago: 2 * D, via: "link", how: "The PR body names the intake note", scores: { tdebt: 4.4, tests: 3.8 } },
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

      /* merged branches, waiting to land */
      /* a person added the Fab-From trailer by hand */
      { id: "m1", stage: "merge", title: "context-packs S1", ref: "feat/context-packs-s1 · #409 merged", age: 2 * H, who: "seb", scores: { tdebt: 8.0, tests: 9.1 },
        trail: [
          { stage: "ready", ref: "docs/plans/context-packs.md § S1", ago: 8 * D, via: "found", scores: { edge: 7.7, pdebt: 8.2 } },
          { stage: "review", ref: "feat/context-packs-s1 · #409", job: "build-slice", who: "seb", hz: "claude-code", ago: 4 * D, via: "trailer", how: "Fab-From: docs/plans/context-packs.md § S1, in the first commit", scores: { tdebt: 6.9, tests: 8.4 } },
          { stage: "merge", ref: "feat/context-packs-s1 · #409", job: "review-slice", who: "kat", hz: "codex", ago: 2 * H, via: "note", scores: { tdebt: 8.0, tests: 9.1 } },
        ] },

      /* release notes */
      /* each has the full history of its work. Land branch marked the slice
         done and closed the note, so these earlier steps no longer match
         their filters and hide nothing. */
      { id: "x1", stage: "shipped", title: "plan template v2", ref: "docs/changelog/2026-10-11-plan-template-v2.md", age: 6 * D, who: "seb",
        trail: [
          { stage: "roadmap", ref: "docs/specs/plan-template-v2.md", ago: 16 * D, via: "found" },
          { stage: "planning", ref: "docs PR #392 · docs/plans/plan-template-v2.md", job: "plan-feature", who: "seb", hz: "claude-code", ago: 14 * D, via: "note", scores: { edge: 7.4, pdebt: 8.0 } },
          { stage: "ready", ref: "docs/plans/plan-template-v2.md § S1", job: "review-plan", who: "jo", hz: "codex", ago: 12 * D, via: "note", scores: { edge: 8.6, pdebt: 8.3 }, note: "Approved by Jo (tech lead)" },
          { stage: "review", ref: "feat/plan-template-v2-s1 · #401", job: "build-slice", who: "seb", hz: "claude-code", ago: 9 * D, via: "note", scores: { tdebt: 7.8, tests: 8.1 } },
          { stage: "merge", ref: "feat/plan-template-v2-s1 · #401 merged", job: "review-slice", who: "kat", hz: "codex", ago: 7 * D, via: "note", scores: { tdebt: 8.4, tests: 8.7 } },
          { stage: "shipped", job: "finish-slice", who: "seb", hz: "claude-code", ago: 6 * D, via: "note" },
        ] },
      /* a bug fixed by hand: the PR names the note, the release note names the PR */
      { id: "x2", stage: "shipped", title: "fix: login redirect", ref: "docs/changelog/2026-10-13-fix-login-redirect.md", age: 4 * D, who: "mo",
        trail: [
          { stage: "intake", title: "Login redirects to a blank page", ref: "docs/roadmap/intake/2026-10-09-login-redirect.md", job: "file-work", who: "kat", hz: "claude-code", ago: 8 * D, via: "note", scores: { clear: 8.9 } },
          { stage: "review", ref: "fix/login-redirect · #404", who: "mo", ago: 6 * D, via: "link", how: "The PR body names the intake note", scores: { tdebt: 8.8, tests: 7.6 } },
          { stage: "merge", ref: "fix/login-redirect · #404 merged", who: "kat", ago: 5 * D, via: "same", scores: { tdebt: 8.8, tests: 7.6 } },
          { stage: "shipped", job: "finish-slice", who: "mo", hz: "claude-code", ago: 4 * D, via: "link", how: "The release note names #404" },
        ] },
      { id: "x3", stage: "shipped", title: "intake form copy", ref: "docs/changelog/2026-10-14-intake-form-copy.md", age: 3 * D, who: "kat",
        trail: [
          { stage: "ready", ref: "docs/plans/onboarding-copy.md § S0", ago: 9 * D, via: "found", scores: { edge: 7.0, pdebt: 9.1 } },
          { stage: "review", ref: "feat/onboarding-copy-s0 · #406", job: "build-slice", who: "kat", hz: "codex", ago: 6 * D, via: "note", scores: { tdebt: 9.2, tests: 6.8 } },
          { stage: "merge", ref: "feat/onboarding-copy-s0 · #406 merged", job: "review-slice", who: "seb", hz: "claude-code", ago: 4 * D, via: "note", scores: { tdebt: 9.2, tests: 7.4 } },
          { stage: "shipped", job: "finish-slice", who: "kat", hz: "codex", ago: 3 * D, via: "note" },
        ] },
      /* a spike: no plan, so its history starts at the PR */
      { id: "x4", stage: "shipped", title: "export-csv spike", ref: "docs/changelog/2026-10-16-export-csv-spike.md", age: 1 * D, who: "seb",
        trail: [
          { stage: "review", ref: "spike/export-csv · #408", who: "seb", ago: 4 * D, via: "found", scores: { tdebt: 5.9, tests: 6.4 } },
          { stage: "merge", ref: "spike/export-csv · #408 merged", job: "review-slice", who: "mo", hz: "claude-code", ago: 2 * D, via: "note", scores: { tdebt: 6.8, tests: 7.0 } },
          { stage: "shipped", job: "finish-slice", who: "seb", hz: "claude-code", ago: 1 * D, via: "note" },
        ] },
    ],
  },

  {
    id: "invoice",
    name: "invoice-service",
    path: "~/dev/invoice-service",
    commit: "a1b2c3d",
    check: { ok: false, problem: "AGENTS.md fab block is out of date with .fab/. Run fab install." },
    stages: [
      { id: "intake",  title: "Untriaged issues", kind: "issue", find: "linear team:INV", where: "state: triage", next: "prioritise", slow: 3 * D, scoredBy: ["clear"] },
      { id: "roadmap", title: "Approved specs", kind: "spec",  find: "files docs/specs/*.md", where: "status: approved", next: "plan-feature", slow: 7 * D },
      { id: "ready",   title: "Approved plans",  kind: "slice", find: "slices in docs/plans/*.md", where: "status: ready", next: "build-slice", slow: 5 * D },
      { id: "review",  title: "Built branches",  kind: "pr",    find: "prs", where: "open", waitsFor: "code owner", slow: 1 * D, scoredBy: ["tdebt"] },
      { id: "shipped", title: "Merged branches", kind: "pr",    find: "prs", where: "merged in the last 7 days", done: true },
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

/* The text of some markdown artifacts, by reference, for the preview on the
   artifact sheet. A slice's reference names its section. Others get a short
   stand-in made from the artifact (see mdText in artifact.js). */
const DOCS = {
  "docs/roadmap/intake/2026-10-10-digest.md": `---
status: open
from: jo
---
# Idea: weekly digest email

Customers ask for a summary of what changed in their workspace each week. Today they have to open the app to see it.

## What they want
- One email on Monday morning, per workspace
- New docs, edited docs and new members
- A link to each change
- A way to turn it off per person

## Open questions
- Should admins get a different digest?
- Do we send it when nothing changed?`,
  "docs/roadmap/intake/2026-10-15-billing-500.md": `---
status: open
from: mo
---
# Billing page 500s on Firefox

The billing page returns a 500 on Firefox 131. Chrome and Safari are fine.

## Steps
1. Sign in as a workspace admin
2. Open Settings → Billing in Firefox
3. The page shows "Something went wrong"

The server log shows \`TypeError: cannot read 'currency' of undefined\` in \`invoiceSummary\`.`,
  "docs/plans/context-packs.md § S3": `## S3: Load packs at session start
status: ready

When a session starts, the harness loads the context packs the job names, before the first prompt.

- Read \`packs:\` from the job's SKILL.md front matter
- Resolve each pack to its files in \`.fab/packs/\`
- Put them in the opening prompt, largest last
- Log the pack names and their size in the run record

## Edge cases
- A pack that is missing: start anyway and say so in the run record
- Packs over the token budget: drop the largest first`,
  "docs/specs/context-packs.md": `---
status: approved
---
# Context packs for agents

Agents forget what they learnt between sessions. A context pack is a small set of files that a job loads at the start of every session, so that each run starts from the same base.

## Goals
- A job names its packs, and every harness loads them
- Packs live in the repository and are reviewed like code
- A run records which packs it loaded`,
};

Object.assign(DOCS, {
  /* ── dragonfly: intake notes ── */
  "docs/roadmap/intake/2026-10-16-export-greyed.md": `---
status: open
from: seb
---
# Export button greyed out

On a workspace with more than 500 docs, the Export button in the toolbar stays greyed out. There is no tooltip and no error.

## Steps
1. Open a workspace with 500+ docs
2. Select all docs in the list
3. The Export button does not turn on

Smaller workspaces export fine. It looks like the 500-row page limit in \`useSelection\` also caps what Export can see.`,
  "docs/roadmap/intake/2026-10-16-dark-docs.md": `---
status: open
from: seb
---
# Idea: dark mode for docs

The app has a dark theme, but the docs reader is always white. At night it is the brightest thing on the screen.

## What it would take
- Follow the app theme in the docs reader
- Code blocks and tables need dark colours too
- Images with white backgrounds stay as they are

Three customers asked for this in the last month.`,
  "docs/roadmap/intake/2026-10-15-slow-search.md": `---
status: open
from: kat
---
# Search is slow on big workspaces

Search takes 4 to 6 seconds on workspaces with more than 20,000 docs. Small workspaces answer in under 300 ms.

## What we know
- The slow part is the ranking query, not the index lookup
- It got worse after the October tags change
- Typing fast queues several searches, and the last one wins

Acme and Northwind both raised it in support this week.`,
  "docs/roadmap/intake/2026-10-14-sso.md": `---
status: open
from: jo
---
# Customer wants SSO

Northwind will not renew without single sign-on. They use Okta.

They asked for SAML. It is not clear if OIDC would do, or if they need SCIM to add and remove users too.`,
  "docs/roadmap/intake/2026-10-13-typo.md": `---
status: open
from: kat
---
# Typo in onboarding email

The second onboarding email says "your workpsace is ready". It is in \`emails/onboarding/day-2.mjml\`, in the heading and in the plain-text part.`,
  "docs/roadmap/intake/2026-10-12-flaky-checkout.md": `---
status: open
from: seb
---
# Flaky e2e on checkout

\`checkout.spec.ts\` fails about one run in eight on CI. It passes on every retry.

## Seen so far
- It fails at "pays with saved card"
- The Stripe test iframe is sometimes not loaded when the test clicks Pay
- Only on CI, never locally

The test waits a fixed 2 s. It should wait for the iframe to be ready.`,

  /* ── dragonfly: specs ── */
  "docs/specs/safari-sessions.md": `---
status: approved
---
# Safari session handling

Safari blocks the third-party cookie that keeps a session alive in the embedded editor. Users on Safari are signed out every few minutes, and the login page loops.

## Goals
- A session lasts as long on Safari as on Chrome
- The embedded editor works without third-party cookies
- No login loop: a failed refresh shows one clear sign-in prompt

## Out of scope
- Private browsing mode
- Safari versions older than 16`,
  "docs/specs/team-billing.md": `---
status: approved
---
# Team billing

Today each member pays on their own card. Teams want one invoice for the whole workspace.

## Goals
- One owner pays for the workspace, per seat
- Seats are added and removed as members join and leave, prorated
- Admins see the invoices in Settings → Billing

## Out of scope
- Paying by invoice or bank transfer
- More than one billing owner per workspace`,
  "docs/specs/faster-search.md": `---
status: approved
---
# Faster search

Search must answer in under 500 ms at the 95th percentile, on workspaces up to 100,000 docs.

## Goals
- Move ranking into the search index, out of the database query
- Cancel a search when the user types again
- Show the first results while the rest load

## Measure
- p95 search time per workspace size, before and after
- Searches that time out`,

  /* ── dragonfly: plans ── */
  "docs/plans/audit-log.md": `---
status: draft
spec: docs/specs/audit-log.md
---
# Audit log

Admins can see who did what in their workspace, and export it.

## Slices
- **S1** Record events: sign-ins, permission changes, deletes
- **S2** The audit log page in Settings, with filters
- **S3** Export as CSV
- **S4** Keep 90 days, then delete

## Open questions
- Do reads count as events? Jo asked in review.
- Where do we store events: the main database or a separate table?`,
  "docs/plans/export-csv.md § S1": `## S1: Export the selected docs
status: ready

The Export button writes the selected docs to one CSV file: title, author, tags, created and updated dates.

- Add \`exportDocs(ids)\` to the docs service
- Stream the rows, so a large export does not hold all of them in memory
- The button shows progress for more than 1,000 docs

## Edge cases
- Commas, quotes and new lines in titles
- A doc deleted while the export runs: skip it`,
  "docs/plans/export-csv.md § S2": `## S2: Choose the columns
status: ready

Before the export, a small sheet lets the user pick which columns to include. The choice is kept for next time.

- A list of columns with checkboxes, in the order they will appear
- Custom fields of the workspace show as extra columns
- Remember the choice per user, per workspace

## Edge cases
- A custom field that was deleted since the last export`,
  "docs/plans/export-csv.md § S3": `## S3: Export in the background
status: ready

Exports of more than 10,000 docs run as a job. The user gets an email with a link when the file is ready.

- Queue the export in the jobs worker
- Store the file for 7 days, then delete it
- Show running exports in Settings → Exports

## Edge cases
- The user leaves the workspace before the export ends
- Two large exports at the same time from one user`,
  "docs/plans/search-index.md § S1": `## S1: Rank in the index
status: ready

Move ranking from the SQL query into the search index, so that one call returns ranked results.

- Add title, tags and updated date as ranked fields
- Build the index for one workspace behind a flag
- Compare results with the old query on 200 saved searches

## Edge cases
- Docs that are edited while the index builds
- Workspaces with no tags at all`,
  "docs/plans/search-index.md § S2": `## S2: Keep the index up to date
status: ready

Docs that change are re-indexed within 5 seconds.

- Send doc changes to the index from the write path
- Re-index a whole workspace from an admin command
- Alert when the index lags more than one minute`,
  "docs/plans/context-packs.md § S4": `## S4: Packs in the run record
status: ready

A run records which packs it loaded, their version and their size, so that a low score can be traced to a pack.

- Add \`packs\` to the run record: name, git sha, tokens
- Show the packs on the run's sheet in the monitor
- \`fab runs --pack <name>\` lists the runs that used a pack

## Edge cases
- A pack edited during a run: record the version it loaded`,
  "docs/plans/context-packs.md § S5": `## S5: Packs per harness
status: ready

Some harnesses take files, some only take text. Each harness adapter decides how to load a pack.

- Claude Code and Codex: add the files to the session
- Cursor: write the pack into the rules file for the run
- Orca: copy the pack into the worktree

## Edge cases
- A harness that cannot load packs: warn at \`fab install\`, not at run time`,

  /* ── dragonfly: release notes ── */
  "docs/changelog/2026-10-11-plan-template-v2.md": `# Plan template v2

Plans now start from a new template. Each slice has a status line, its edge cases and the files it will touch. \`plan-feature\` uses it from today. Old plans still work.`,
  "docs/changelog/2026-10-13-fix-login-redirect.md": `# Fix: login redirect

After signing in, you now go back to the page you were on, not to the dashboard. This also fixes the loop some Safari users saw when their session ended.`,
  "docs/changelog/2026-10-14-intake-form-copy.md": `# Intake form copy

The "Report a problem" form now asks what you did, what you expected and what happened, in three short fields. Reports are easier to act on.`,
  "docs/changelog/2026-10-16-export-csv-spike.md": `# Export CSV spike

A first, hidden version of CSV export is in the app behind the \`export-csv\` flag. It exports up to 500 docs. It is for testing only.`,

  /* ── invoice ── */
  "docs/specs/partial-refunds.md": `---
status: approved
---
# Partial refunds

Support can refund part of an invoice: one line, or an amount. Today only a full refund is possible.

## Goals
- Refund one or more lines, or a set amount
- The invoice shows what was refunded and what is still paid
- The credit note lists only the refunded part

## Out of scope
- Refunds to a different payment method`,
  "docs/specs/dunning-emails.md": `---
status: approved
---
# Dunning emails

When a payment fails, customers get a series of reminder emails before the account is paused.

## Goals
- Emails on day 1, 4 and 10 after a failed payment
- Each email has a link to update the card
- Pause the account on day 14, and say so in the last email
- Stop the series as soon as a payment succeeds`,
  "docs/specs/tax-by-region.md": `---
status: approved
---
# Tax by region

Invoices must show the correct tax for the customer's country and, in the US, the state.

## Goals
- Pick the tax rate from the billing address
- Show the rate and the tax amount on each invoice line
- EU businesses with a VAT number pay no VAT (reverse charge)

## Out of scope
- Tax for countries outside the EU, UK, US and Australia`,
  "docs/plans/refund-total.md § S1": `## S1: Correct the total after a refund
status: ready

After a refund, the invoice total shows 0. It must show the original total, the refunded amount and the amount paid.

- Compute the paid amount from payments minus refunds
- Show the three amounts on the invoice page and in the PDF
- Add tests for a full, a partial and two partial refunds

## Edge cases
- A refund in a different currency from the invoice`,
});
