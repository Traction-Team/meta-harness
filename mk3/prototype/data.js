/* Mark III fixtures. Everything here is illustrative. Nothing executes.
   The story: agent-mail runs on blueprint v14. A defect escaped to production
   (D-31). The trace shows what the agent saw at Plan slice. The fix is a
   blueprint change (v15), not a code patch. */

const WORKSPACE = {
  name: "agent-mail",
  sub: "Email client with agent features",
  i: "AM",
  h: 212,
  forkedFrom: "Web product",
};

/* Buffers: where work waits between stations. */
const BUFFERS = [
  { id: "intent",   name: "Intent", icon: "message",   path: "intent/",   does: "Requests and feedback, before anyone agrees what to build.", fields: ["request", "who asked", "thread"] },
  { id: "spec",     name: "Specs", icon: "doc",    path: "specs/",    does: "Agreed behaviour for one feature.", fields: ["behaviour", "criteria", "constraints"] },
  { id: "plan",     name: "Plans", icon: "list",    path: "plans/",    does: "Slices small enough for one agent session.", fields: ["slices", "files", "migration"] },
  { id: "branch",   name: "Branches", icon: "branch", path: "branches/", does: "Built slices that are not verified yet.", fields: ["diff", "checks"] },
  { id: "verified", name: "Verified", icon: "shield", path: "verified/", does: "Slices that pass their acceptance criteria.", fields: ["diff", "test report"] },
  { id: "live",     name: "Live", icon: "globe",     path: "releases/", does: "Releases in production.", fields: ["version", "notes"] },
];

/* Autonomy levels. A gate is scaffolding. A station earns its way down the list. */
const AUTONOMY = {
  gated:   { label: "Gated",      short: "Every output" },
  sampled: { label: "Sampled",    short: "Spot checks" },
  auto:    { label: "Autonomous", short: "No gate" },
};

/* Frame parts. "src" says where a part comes from:
   blueprint = the same for every run of this program
   work      = comes from the item being worked on */
const PROGRAMS = [
  {
    id: "spec", icon: "pen", name: "Write spec", from: "intent", to: "spec",
    does: "Turn a request into agreed behaviour with acceptance criteria.",
    runs: 46, decisions: 46, autonomy: "gated", owner: "Leo", ownerRole: "Product",
    recommend: { to: "sampled", why: "Leo approved 41 of the last 44 specs with no changes." },
    frame: [
      { k: "program", src: "blueprint", t: "Write spec · instructions" },
      { k: "input",   src: "work",      t: "The request and its thread" },
      { k: "context", src: "blueprint", t: "Product brief" },
      { k: "context", src: "work",      t: "Related specs (3 nearest)" },
      { k: "skill",   src: "blueprint", t: "Skill · acceptance criteria" },
    ],
  },
  {
    id: "plan", icon: "scissors", name: "Plan slice", from: "spec", to: "plan",
    does: "Cut a spec into slices an agent can build in one session.",
    runs: 88, decisions: 22, autonomy: "sampled", sample: "1 in 4", owner: "Maya", ownerRole: "Engineering",
    recommend: { to: "sampled", hold: true, why: "3 escaped defects this month trace back to plans. Keep spot checks until v15 has run for a while." },
    frame: [
      { k: "program", src: "blueprint", t: "Plan slice · instructions" },
      { k: "input",   src: "work",      t: "Spec › Behaviour + criteria" },
      { k: "context", src: "work",      t: "Codebase map › affected modules" },
      { k: "context", src: "work",      t: "Recent plans in this area" },
      { k: "skill",   src: "blueprint", t: "Skill · slice sizing" },
    ],
  },
  {
    id: "build", icon: "code", name: "Build + review", from: "plan", to: "branch",
    does: "Implement one slice on a branch, run checks, and review the diff.",
    runs: 132, decisions: 0, autonomy: "auto", owner: "Maya", ownerRole: "Engineering",
    frame: [
      { k: "program", src: "blueprint", t: "Build + review · instructions" },
      { k: "input",   src: "work",      t: "Plan › this slice" },
      { k: "context", src: "work",      t: "Source files in scope" },
      { k: "context", src: "blueprint", t: "Conventions" },
      { k: "skill",   src: "blueprint", t: "Skill · browser check" },
    ],
  },
  {
    id: "test", icon: "flask", name: "Test + validate", from: "branch", to: "verified",
    does: "Check the branch against the slice's acceptance criteria.",
    runs: 129, decisions: 0, autonomy: "auto", owner: "Maya", ownerRole: "Engineering",
    frame: [
      { k: "program", src: "blueprint", t: "Test + validate · instructions" },
      { k: "input",   src: "work",      t: "Branch diff" },
      { k: "input",   src: "work",      t: "Slice › acceptance criteria" },
      { k: "skill",   src: "blueprint", t: "Skill · browser check" },
    ],
  },
  {
    id: "ship", icon: "send", name: "Ship release", from: "verified", to: "live",
    does: "Group verified slices into a release and deploy it.",
    runs: 21, decisions: 21, autonomy: "gated", owner: "Sebastian", ownerRole: "Release lead",
    recommend: { to: "gated", hold: true, why: "Releases reach every user. This gate stays by policy." },
    frame: [
      { k: "program", src: "blueprint", t: "Ship release · instructions" },
      { k: "input",   src: "work",      t: "Verified slices" },
      { k: "context", src: "blueprint", t: "Release notes template" },
    ],
  },
];

/* The return path. Product feedback goes back to intent. */
const TRIAGE = { id: "triage", icon: "replay", name: "Triage feedback", from: "live", to: "intent" };

/* People, for gates and the pool. */
const PEOPLE = {
  Leo:       { i: "L", h: 28 },
  Maya:      { i: "M", h: 152 },
  Sebastian: { i: "S", h: 212 },
};

/* The worker pool. Each teammate gives agents from their own machine.
   Agent ids are "<pool id>-<n>". */
const POOL = [
  { id: "you",   name: "You",   where: "MacBook Pro · Claude Max", n: 3, h: 212 },
  { id: "maya",  name: "Maya",  where: "MacBook Pro · Codex",      n: 2, h: 152 },
  { id: "leo",   name: "Leo",   where: "MacBook Air · Claude Pro", n: 1, h: 28 },
  { id: "cloud", name: "Cloud", where: "Shared runners",           n: 3, h: 268 },
];

/* Work in flight.
   status: running | asking (the agent asked a question) | gate (waits for a person) */
const TASKS = [
  { id: "AM-158", t: "Reply drafts in the thread view",  at: "spec",  status: "running", agent: "leo-1",   doing: "Drafting acceptance criteria" },
  { id: "AM-161", t: "Unsubscribe in one click",         at: "spec",  status: "gate",    gate: "Leo" },
  { id: "AM-152", t: "Snooze until next week",           at: "plan",  status: "asking",  agent: "you-3",   doing: "Asked 3 questions" },
  { id: "AM-149", t: "Labels from sender rules",         at: "plan",  status: "running", agent: "you-2",   doing: "Second try · first plan scored 5.1 on slice size", retry: true },
  { id: "AM-154", t: "Archive threads older than 30 days", at: "plan", status: "gate",   gate: "Maya", held: true },
  { id: "AM-146", t: "Thread summaries",                 at: "build", status: "running", agent: "you-1",   doing: "Editing summary-worker.ts" },
  { id: "AM-147", t: "Summary cache",                    at: "build", status: "running", agent: "cloud-1", doing: "Running checks" },
  { id: "AM-150", t: "Keyboard shortcut sheet",          at: "build", status: "running", agent: "maya-1",  doing: "Reviewing the diff" },
  { id: "AM-144", t: "Search filters: has attachment",   at: "test",  status: "running", agent: "cloud-2", doing: "Browser check" },
  { id: "AM-143", t: "Search filters: from domain",      at: "test",  status: "running", agent: "maya-2",  doing: "Running tests" },
  { id: "R-43",   t: "Release 43 · 3 slices",            at: "ship",  status: "gate",    gate: "Sebastian" },
];

const QUEUED = { intent: 5, spec: 3, plan: 4, branch: 2, verified: 3, live: 128 };

/* One frame, inspected in full. The agent on AM-152 stopped and asked
   questions, because the frame left too much open. */
const FRAME_152 = {
  task: "AM-152", title: "Snooze until next week", program: "plan", agent: "you-3",
  layers: [
    { k: "program", src: "blueprint", t: "Plan slice · instructions" },
    { k: "input",   src: "work",      t: "Spec › Behaviour + criteria" },
    { k: "input",   src: "work",      t: "Spec › Constraints", missing: true, why: "The blueprint does not put this in the Plan slice frame" },
    { k: "context", src: "work",      t: "Codebase map › affected modules" },
    { k: "context", src: "work",      t: "Recent plans in this area", missing: true, why: "None found for snooze" },
    { k: "skill",   src: "blueprint", t: "Skill · slice sizing" },
  ],
  questions: [
    { q: "Is \"next week\" Monday 9am in the user's time zone, or 7 days from now?", to: "Leo", role: "Product",
      opts: ["Monday 9am, user's time zone", "7 days from now"] },
    { q: "Where does the user's time zone come from: the browser, or account settings?", to: "Maya", role: "Engineering",
      opts: ["Account settings, browser as fallback", "Browser only"] },
    { q: "Should snoozed threads return if a new reply arrives first?", to: "Leo", role: "Product",
      opts: ["Yes, a reply ends the snooze", "No, keep it snoozed"] },
  ],
};

/* The escaped defect, traced back to the blueprint. */
const DEFECT = {
  id: "D-31",
  title: "Snoozed threads come back at the wrong time outside UTC",
  slice: "AM-139", sliceTitle: "Snooze a thread",
  found: "User feedback · 2 reports · Release 41",
  /* score: what the scorer on this step's output said at the time.
     The plan scored low, but the policy was "continue, flagged", so nobody looked. */
  path: [
    { p: "spec",  result: "Approved by Leo",       saw: "Spec included the time zone rule", ok: true,  score: { by: "Spec clarity", s: 8.4 } },
    { p: "plan",  result: "Not sampled",           saw: "Frame did not include Spec › Constraints", ok: false, score: { by: "Plan quality", s: 4.1, low: true, note: "Flagged · constraints covered 2/10 · continued" } },
    { p: "build", result: "Checks passed",         saw: "Built what the plan said", ok: true,  score: { by: "Diff risk", s: 7.9 } },
    { p: "test",  result: "Tests passed",          saw: "Tests ran in UTC only", ok: false, score: { by: "Test depth", s: 6.2, note: "environments 3/10" } },
    { p: "ship",  result: "Approved by Sebastian", saw: "Release notes looked right", ok: true },
  ],
  cause: [
    "The spec says \"wake at 9am in the user's time zone\". That line is in Spec › Constraints.",
    "The blueprint does not put Spec › Constraints in the Plan slice frame. So the agent that wrote the plan never saw the rule.",
    "Test + validate ran every test in UTC. A time zone bug cannot fail in UTC.",
  ],
  similar: [
    { id: "D-27", t: "Daily digest sends at 9am UTC, not local time" },
    { id: "D-24", t: "\"Today\" filter uses the server date" },
  ],
  change: [
    { p: "plan", what: "Frame", add: "Spec › Constraints", rm: null },
    { p: "test", what: "Instructions", add: "Run time-based tests in UTC, Los Angeles and Sydney", rm: "Run tests in the default time zone" },
  ],
  replay: { n: 6, text: "Replayed the last 6 Plan slice runs that involve time, with the v15 blueprint.", result: "6 of 6 plans now name a time zone rule" },
  rerun: { spec: "Same spec", plan: "Plan names the time zone rule", build: "Checks passed", test: "Passed in UTC, Los Angeles, Sydney", ship: "Approved by Sebastian" },
};

/* ── Scorers ──
   A scorer reads one artifact and returns a score per dimension, with reasons.
   It is attached to a type of artifact (a buffer), not to a program.
   kind:    deterministic | rubric | human
   shown:   true = the program that makes the artifact sees the scorer; false = held out
   low:     the item loop policy for a low score: flag | retry | hold
   cal:     calibration. Escaped defect rate for items in each score band (0–4, 5–7, 8–10). */
const SCORE_KIND = {
  deterministic: "Deterministic",
  rubric:        "Rubric",
  human:         "From a gate",
};
const LOW_POLICY = {
  flag:  { label: "Continue, flagged", short: "Flag" },
  retry: { label: "Retry once",        short: "Retry" },
  hold:  { label: "Hold for a person", short: "Hold" },
};
const BANDS = ["0–4", "5–7", "8–10"];

const SCORERS = [
  {
    id: "spec-clarity", name: "Spec clarity", on: "spec", kind: "rubric", v: 3, shown: true, low: "retry", below: 6,
    dims: ["criteria testable", "open questions", "constraints stated"],
    runs: 46, avg: 7.6, lowN: 5,
    cal: { bands: [0.17, 0.06, 0.02], verdict: "predicts", note: "Specs under 6 led to defects at 3 times the rate of specs over 8." },
  },
  {
    id: "gate-edits", name: "Gate edits", on: "spec", kind: "human", v: 1, shown: false, low: "flag", below: 6,
    dims: ["lines Leo changed"],
    runs: 46, avg: 8.9, lowN: 3,
    cal: { bands: [0.21, 0.07, 0.03], verdict: "source", note: "What a person changed at the gate. Free, and used to check the other scorers." },
  },
  {
    id: "plan-quality", name: "Plan quality", on: "plan", kind: "rubric", v: 2, shown: false, low: "flag", below: 5,
    dims: ["constraints covered", "slice size", "rollback step"],
    runs: 88, avg: 6.9, lowN: 11,
    cal: { bands: [0.24, 0.06, 0.01], verdict: "predicts", note: "4 of the last 5 escaped defects came from plans that scored under 5." },
    recommend: { low: "hold", why: "This scorer predicts defects. Hold low plans for Maya instead of only flagging them." },
  },
  {
    id: "diff-risk", name: "Diff risk", on: "branch", kind: "deterministic", v: 1, shown: true, low: "flag", below: 5,
    dims: ["diff size", "files outside scope", "coverage"],
    runs: 132, avg: 7.4, lowN: 14,
    cal: { bands: [0.05, 0.06, 0.05], verdict: "weak", note: "The defect rate is the same in every band. This scorer does not predict defects. Fix it or remove it." },
  },
  {
    id: "test-depth", name: "Test depth", on: "verified", kind: "deterministic", v: 2, shown: true, low: "retry", below: 6,
    dims: ["criteria covered", "environments"],
    runs: 129, avg: 7.1, lowN: 9,
    cal: { bands: [0.15, 0.05, 0.02], verdict: "predicts", note: "Low on environments for 2 of the last 3 time-based defects." },
  },
];

/* The item loop: one plan held by its scorer. It waits at the Plan slice gate for Maya. */
const HELD = {
  task: "AM-154", t: "Archive threads older than 30 days", scorer: "plan-quality", score: 4.6,
  dims: [
    { d: "constraints covered", s: 7 },
    { d: "slice size",          s: 6 },
    { d: "rollback step",       s: 1, why: "Slice 2 deletes archived threads, but the plan has no way to undo it." },
  ],
};

/* The factory loop: patterns across many scores, not one low score.
   Each pattern points at a part of the blueprint. */
const PATTERNS = [
  {
    id: "P-7", scorer: "plan-quality", dim: "constraints covered", p: "plan",
    n: "9 of 31 plans that involve time", first: "3 weeks ago, before D-31 escaped",
    reason: "The plan does not name the time zone rule that is in the spec.",
    change: { what: "Frame", add: "Spec › Constraints" },
    after: "Since v15: constraints covered averages 8.3 on time-based plans",
  },
  {
    id: "P-8", scorer: "spec-clarity", dim: "criteria testable", p: "spec",
    n: "6 of the last 20 specs", first: "this week",
    reason: "Criteria say \"loads fast\" or \"feels quick\" with no number to test against.",
    change: { what: "Skill", add: "Skill · measurable criteria" },
    replay: { n: 12, from: 6.4, to: 7.9, text: "Replayed the last 12 Write spec runs on the draft." },
    owner: "Leo",
  },
];

/* What blueprint v15 makes stale. Plan slice and Test + validate changed, so their
   outputs are stale, and so is anything built from a stale plan.
   act: rebuild | keep | step (rerun one step) | forward (fix forward) */
const STALE = [
  { id: "AM-149", t: "Labels from sender rules", made: "Plan", why: "Running on v14 now. It finishes on v14.", gate: null, score: null, act: "rebuild",
    note: "No gate passed. Rebuild from the spec." },
  { id: "AM-147", t: "Summary cache", made: "Plan → branch", why: "Plan made on v14. The branch was built from it.", gate: null, score: 4.8, act: "rebuild",
    note: "No gate passed, and the plan scored 4.8." },
  { id: "AM-146", t: "Thread summaries", made: "Plan → branch", why: "Plan made on v14. The branch was built from it.", gate: "Maya sampled the plan", score: 8.2, act: "keep",
    note: "Past a human gate, and the plan scored 8.2." },
  { id: "AM-143", t: "Search filters: from domain", made: "Test report", why: "Test + validate changed. The plan and branch did not.", gate: null, score: null, act: "step",
    note: "Run Test + validate again. Nothing else." },
  { id: "R-42", t: "Release 42 · 3 slices", made: "Release", why: "Shipped on v14.", gate: "Sebastian approved", score: null, act: "forward",
    note: "Shipped. Fix forward if a defect comes back." },
];
const REBUILD_ACT = {
  rebuild: "Rebuild",
  keep:    "Keep",
  step:    "Rerun one step",
  forward: "Fix forward",
};

/* The blueprint's own history. Most versions are a fix for a defect. */
const VERSIONS = [
  { v: "v14", when: "3 days ago",  what: "Plan slice: add codebase map to the frame",   why: "D-29 · plan missed an existing module" },
  { v: "v13", when: "9 days ago",  what: "Build + review: browser check skill on UI slices", why: "D-26 · broken layout shipped" },
  { v: "v12", when: "2 weeks ago", what: "Plan slice: agent asks before it guesses",      why: "Plans built on wrong assumptions" },
  { v: "v11", when: "3 weeks ago", what: "Test + validate: gate removed",                 why: "Maya approved 80 runs in a row with no changes" },
  { v: "v10", when: "4 weeks ago", what: "Write spec: add related specs to the frame",    why: "D-19 · conflicting specs" },
  { v: "v9",  when: "5 weeks ago", what: "Build + review: gate moved to spot checks",     why: "Few changes at review" },
];

/* Human decisions per shipped slice, by blueprint version v1..v14. */
const DECISIONS = {
  versions: ["v1","v2","v3","v4","v5","v6","v7","v8","v9","v10","v11","v12","v13","v14"],
  perSlice: [6.2, 5.8, 5.1, 4.9, 4.2, 3.9, 3.4, 3.1, 2.6, 2.4, 1.8, 1.7, 1.6, 1.4],
  gated:    [5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 3, 3, 3, 3],
  v15:      1.3,
};

/* Shipped output. */
const RELEASES = [
  { id: "R-42", when: "Yesterday",  v: "v14", slices: ["AM-140 Archive from notification", "AM-141 Undo send", "AM-138 Attachment preview"], decisions: 3 },
  { id: "R-41", when: "4 days ago", v: "v13", slices: ["AM-139 Snooze a thread", "AM-137 Bulk select", "AM-136 Read receipts off"], decisions: 5, defect: "D-31" },
  { id: "R-40", when: "1 week ago", v: "v13", slices: ["AM-135 Search by sender", "AM-134 Compact density"], decisions: 3 },
];

const TOUR = [
  { t: "The blueprint is what you build", b: "This is the line that makes agent-mail. Each box is where work waits. Each arrow is a program that moves work on. The code is the output.", go: { mode: "blueprint", view: "line" } },
  { t: "Agents work the line", b: "Each teammate adds agents from their own machine. You can see every agent at the station where it works.", go: { mode: "run", view: "live" } },
  { t: "Agents project frames", b: "An agent sees a frame: parts from the blueprint, and parts from the work. When the frame leaves too much open, the agent asks instead of guessing.", go: { mode: "run", view: "frame" } },
  { t: "Fix the blueprint, not the output", b: "A defect escaped. The trace shows what each agent saw, and what the scorers said. You change the blueprint. Outputs from the changed programs become stale, and a rebuild policy decides what runs again.", go: { mode: "output", view: "defect" } },
  { t: "Score early, calibrate late", b: "Scorers on each artifact are leading indicators. A low score routes one item. A pattern of scores changes the blueprint. Later defects show which scorers to trust.", go: { mode: "blueprint", view: "scorers" } },
  { t: "Earn autonomy", b: "Each version needs people less. Gates come off a station when people stop changing its output.", go: { mode: "blueprint", view: "autonomy" } },
];
