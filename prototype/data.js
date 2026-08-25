/* ═══════════════════════════════════════════════════════════════ data ══
   Numbers are the real email-agent corpus shape: 370 docs, 314 slices, 436
   `needs` edges, 301 decisions. Everything else is plausible fill. */

const REPO = { name: "email-agent", branch: "main", sysVersion: "v41" };

/* a workspace is a product. You pick the thing you are building before you pick
   whether you are working on it or in it. */
const WORKSPACES = [
  { id: "email-agent", name: "email-agent", i: "EA", h: 212, sub: "AI-native email client" },
  { id: "forma",       name: "Forma",       i: "FO", h: 24,  sub: "broker doc collection" },
  { id: "everest",     name: "Everest",     i: "EV", h: 150, sub: "homebuilder deal packs" },
];

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

  { id: "feed",   name: "Feedback",       glob: "system/issues/*.md",           icon: "flag",   count: 12,
    shape: ["category", "edge", "run", "proposed_fix"],
    dwell: { median: "6d 2h", p90: "19d", oldest: "24d", inW: 5, outW: 3,
      trend: [3.1, 3.8, 4.2, 5.0, 5.4, 5.1, 5.9, 6.1], unit: "d",
      note: "time to close an issue is climbing week on week" } },
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
    id: "log", from: "merged", to: "feed", name: "log issue", kind: "skill",
    trigger: "after every run", runner: "haiku", runs: 308, fail: .04, median: "40s",
    reads: ["transcript", "sha"], writes: ["category", "edge", "run", "proposed_fix"],
    issues: [], broken: "reads `transcript`, which the Merged shape does not define",
    prompt: `## Context

Read the run transcript and log what the system got wrong **about itself**.
Not product bugs. Process bugs.

Categories: \`skill-gap\`, \`spec-ambiguity\`, \`review-miss\`,
\`constraint-violation\`, \`convention-drift\`.

## Tasks

- [ ] Read the transcript for the run that just merged → transcript
- [ ] Name the edge each failure happened on → edge
- [ ] Classify each failure into exactly one category → category
- [ ] Propose a fix only when it is one concrete change → proposed_fix

## Rules

1. An issue with no edge is an observation, and observations are noise.
2. One issue per failure. Do not bundle.`
  },
  {
    id: "triage", from: "feed", to: "spec", name: "triage", kind: "runbook",
    trigger: "manual · weekly", runner: "you", runs: 21, fail: .05, median: "3m",
    reads: ["category", "proposed_fix"], writes: ["constraints[]", "decisions[]"],
    issues: ["i6"], self: true,
    prompt: `## Context

Sort the week's issues into two piles.

**Product defects** go back to the spec as a new constraint or a numbered
decision. Normal work.

**System defects** go back to the loop itself. This is the only edge in the
diagram allowed to write to the diagram.

## Tasks

- [ ] Group the open issues by edge and category → buckets
- [ ] Turn product defects into constraints or decisions → constraints[], decisions[]
- [ ] Patch the runbook or skill on the edge a system defect names → system/runbooks/*.md
- [ ] Bump the system version and close each issue with its sha → system.version

## Rules

1. Three issues of one category on one edge is not a patch.
   [Redraw the edge](triage/redraw-an-edge.md) instead.
2. Nothing closes without either a constraint id or a commit sha.`
  },
];

/* the back edge everyone's real process has and nobody's diagram admits to */
const BACKS = [
  { from: "pr", to: "branch", label: "rework", note: "34% of reviews" },
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
  feed: ISSUES.map((i) => ({ id: i.id.replace("i", "#"), t: i.t, s: `${i.cat} · on ${i.edge}`, d: "bad" })),
};

/* A node card only ever shows four rows. The panel has to show the rest, so
   each station is padded out with plausible history up to 40. Past that the
   panel hands you off to the matching list view rather than pretending a
   floating card is the right place to read 273 things. */
const PANEL_MAX = 40;

(function padStations() {
  const NOUN = ["thread list", "reading pane", "compose overlay", "label rail", "search field", "account switcher",
    "contact card", "company card", "agent chat", "automation row", "draft stages", "bulk bar", "toast stack",
    "palette", "settings rail", "calendar popover", "attachment tray", "signature block", "snooze menu",
    "unread badge", "filter chips", "avatar stack", "send queue", "undo path"];
  const VERB = ["hairlines on", "empty state for", "keyboard path through", "loading skeleton for",
    "error state for", "density toggle on"];
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
          s: n % 4 === 0 ? `${1 + (n % 3)} sections uncovered` : `${4 + (n % 9)} slices covering · complete`,
          d: n % 4 === 0 ? "wait" : "ok" });
      } else {
        list.push({ id: (1.72 + 0.03 * n).toFixed(2), t, s: "sonnet · queued", d: "ok" });
      }
      n++;
    }
  });
})();

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
    { id: "runbooks",label: "Runbooks",    icon: "book",  n: 6 },
    { id: "skills",  label: "Skills",      icon: "sparkle", n: 12 },
    { id: "issues",  label: "System issues", icon: "flag", n: 12, loud: true },
    { id: "history", label: "Version history", icon: "clock", n: 41 },
  ],
  product: [
    { id: "loop",    label: "Board",       icon: "loop" },
    { id: "frontier",label: "Frontier",    icon: "sparkle", n: 9 },
    { id: "slices",  label: "Slices",      icon: "list",  n: 314 },
    { id: "specs",   label: "Specs",       icon: "doc",   n: 18 },
    { id: "runs",    label: "Runs",        icon: "robot", n: 6 },
  ],
};

const RUNBOOKS = PROCS.filter((p) => p.kind === "runbook");
const SKILLS = PROCS.filter((p) => p.kind === "skill");

const HISTORY = [
  { v: "v41", t: "review: reject on any path outside owns", s: "closed #i9 · 2h ago", who: "you" },
  { v: "v40", t: "log issue: require an edge on every issue", s: "closed #i13 · yesterday", who: "you" },
  { v: "v39", t: "build: added run-the-app step to self-review", s: "proposed by triage · 2d ago", who: "triage" },
  { v: "v38", t: "plan feature: read coverage before cutting", s: "closed #i7 · 3d ago", who: "you" },
  { v: "v37", t: "review: stop rejecting for taste, file drift instead", s: "closed #i5 · 4d ago", who: "you" },
  { v: "v36", t: "dispatch: frontier check before opening a worktree", s: "5d ago", who: "you" },
];
