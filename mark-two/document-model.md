# The document model

Working note, 2026-08-25. The part of this project that has to survive even if
the prototype is thrown away.

The **declarative system model** has no database. Programs, skills, slices,
specs, defects, predicates, contracts, and versions are repository files, and
their relationships are paths or ordinary markdown links. If the UI burned down
tomorrow, the definition would remain usable in a text editor.

Runtime objects are different. Dispatch attempts, questions, answers, reports,
heartbeats, terminal/session references, and status transitions live in the
factory event log and appear in the UI as projections. See
[`research/agent-runtime-architecture.md`](research/agent-runtime-architecture.md).

## Everything is a file

| Thing | Lives at | Opened as |
|---|---|---|
| program | `system/programs/<id>.md` | full-page sheet |
| skill | `system/skills/<id>.md` | full-page sheet |
| slice | `slices/<id>.md` | full-page sheet |
| spec section | `docs/<id>-<slug>.md` | full-page sheet |
| defect | `system/defects/<id>.md` | full-page sheet |
| nested page | `<parent-without-.md>/<name>.md` | full-page sheet |

One sheet renders all of them. It does not branch on type beyond a glyph, a
tag word, and which program the Run button fires. That is the test of whether
the model holds: if a new kind of document needs new UI, the model has leaked.

(The prototype still stores programs under `system/runbooks/` and tags some of
them `skill`; that is legacy naming, cleaned up under *Programs and skills*
below and tracked in `MEMORY.md`.)

## Nesting: the file name minus `.md` is the folder

`system/runbooks/build.md` owns everything in `system/runbooks/build/`.

```
system/runbooks/build.md
system/runbooks/build/test-strategy.md
system/runbooks/build/code-review.md
system/runbooks/build/code-review/checklist.md
```

Depth is unbounded and the same rule applies at every level. Notion-style
sub-pages, except nothing stores the hierarchy: the path *is* the hierarchy.
Move the file, the tree moves with it. `git mv` is a refactor.

A parent reaches a child with a relative link, `[code review](build/code-review.md)`.
A child links back with `../build.md`. There is no other join.

**Known limit.** One file has one parent, but `code-review.md` is wanted by both
the `build` edge and the `review` edge. Today it lives under `build/` and
`review` links across to it. If shared pages turn out to be common, nesting is
the wrong primitive for them and they should be flat with links.

## Tasks are checkboxes, not a syntax

Any line matching `- [ ]` or `- [x]` in any document is a task. There is no
front matter, no task block, no second place to look.

```md
- [x] Run the narrowest suite covering the changed files → checks
- [ ] Re-read the diff against [code review](build/code-review.md) → worktree/REVIEW.md
```

- The optional ` → target` after the text names what the task writes. It is a
  convention, not a requirement, and it renders as dim inline text.
- The UI pulls the checkboxes into a rail beside the document. The rail is a
  **reading** of the file, never a copy of it, so it cannot drift.
- Ticking a box in either place rewrites `[ ]` to `[x]` on that line and marks
  the file dirty. Saving writes the file.

Because tasks are ordinary markdown, a prompt that says "do these five things"
and a checklist a human works through are the same artefact. That is the point.

## States are predicates, not folders

A state in the loop is a query over the repo:

```
Product spec   docs/**/*.md
Build plans    slices/*.md · status=planned
Worker branch  git · worktrees/*
Worker PR      gh · pr head:slice/*
Merged         slices/*.md · status=merged
Feedback       feedback/*.md
```

(Feedback is *product* feedback, on the ring. System **defects** are a separate
off-loop queue, `system/defects/*.md` — see *Defects attach to edges* below.)

Two consequences worth keeping:

1. A state is **countable**, so the same diagram is both the definition and the
   live board. A kanban board bent into a ring.
2. A file can move between states without moving on disk. `slices/1.50.md` is
   one file whether it is planned, in flight or merged. Its station is derived,
   not stored.

Each state also carries a **shape**: the fields documents in that state must
have. `slices` need `id`, `needs[]`, `owns[]`, `spec`, `proves`.

## Programs and skills

A **program** is a set of instructions for doing something in the factory — the
box on an edge. It is a markdown document: a body of prose and checkboxes over a
head of metadata. Today's *runbooks* and the *intake* pills are the same thing;
both are programs.

A **skill** is not. A skill is a capability a program calls from its body —
browser use, a frontier query, a blast-radius lookup. It enhances what a program
can do; it is never a state, an edge, or a program. This is the same sense as a
Claude Code skill, and skills live at `system/skills/<id>.md` so a program can
link to one like any other page.

Rule of thumb: a program *does a step of the work*; a skill *is a tool the step
reaches for*.

## Inputs and output are the typed part

A program declares its **inputs** and its **output**. This is the metadata that
sits at the head of the file, the way a skill declares its own:

```
build + self-review
  input   work   from Worker branch   fields slice, branch, agent
  output         into Worker PR        fields slice, diff, checks, reviewer
```

An input is one of two kinds:

- **bound** — it reads a state. That binding *is* the wire into the program, so
  the graph is drawn from the inputs rather than stored beside them. `build`
  binds to Worker branch, so an edge runs from Worker branch into it.
- **open** — nothing is bound, so whoever runs the program supplies it. An
  operator fills it by hand (the intake pill above Feedback), or a calling agent
  passes it in. An open input is what lets a program be an entry point instead of
  a transition.

The output names the state the program writes into — the wire out.

Because a bound input and the output are typed against the node shapes, the
system is **statically checkable**. If a bound input reads a field the source
shape does not define, that is a **broken wire**, caught before dispatch, not
after a bad run. The prototype ships one on purpose: `log issue` reads
`transcript`, which `Merged` does not define. An **open** input is runtime data
and cannot be checked — which is exactly what an entry point should be.

This is the compile step for a program. Without it the diagram is a file browser
with lines drawn on it.

> **Where the wiring lives.** Today the edges are an explicit list the app reads.
> Putting each program's inputs and output in its own front matter — so the graph
> is *derived* from the documents the way nesting is derived from paths — is the
> direction, not yet the build. Layout (positions, zoom) stays metadata beside
> the corpus regardless; it is the *topology* that would move into the files.

## The trigger is when the program fires

Inputs and output say what a program reads and writes. The **trigger** says *when
it runs*. It is the third field at the head of the file, and today the prototype
shows it as a label (`on arrival`, `after every ship`, `weekly`) wired to nothing.

A trigger is one of:

- **manual** — a person fires it. `plan` and `triage` are manual.
- **event** — it fires when something lands: `on arrival` (a document reached the
  source state), `on ship` (a slice merged).
- **clock** — a cadence: `every 1h`, `weekly`.
- **backpressure** — a predicate over the counts the states already expose.
  `dispatch` fires while `branch < 3 and plans > 0`: keep three slices in flight,
  and only while work is waiting.

Backpressure is the one that earns its keep. Because states are countable, a WIP
limit is just a predicate over them, and a program gated that way is
**self-clocking**: it fires exactly as fast as the stations downstream drain and
no faster. There is no interval to tune — the loop finds its own tick rate against
real throughput. The Kanban ring already had WIP limits latent in it; the trigger
is where they get written down.

Whatever the trigger, the play button on the edge still fires the program by hand.
Automation sets the pace; the operator can always send one more.

> **Not yet built in the prototype.** In the accepted runtime, the factory daemon
> evaluates triggers against live counts and appends a dispatch-created event
> before launching work. One difference remains: a trigger is checked at run
> time against live counts, not statically against shapes.

## Defects attach to edges

`system/defects/i3.md` names the edge it happened on, never a state. States do
not fail, transitions do. A defect with no edge is an observation, and
observations are noise. A defect is about the **factory** — the friction an agent
hit in how the loop is wired — not about the product, which is separate feedback
that folds into the spec.

Categories in use: `skill-gap`, `spec-ambiguity`, `review-miss`,
`constraint-violation`, `convention-drift`.

Three defects of one category on one edge is not a patch. It means the edge is
drawn wrong and wants redrawing, which is the one operation that changes the
diagram itself.

(The prototype still stores these under `system/issues/` and the code array is
`ISSUES`; "defect" is the settled word, the path lags like the runbook one.)

## Versions: how defects fold back into the loop

A defect is not patched where it lands. It is folded, with a batch of others,
into a new **version** of the system. A version is the set of programs,
contracts and edges that define the loop, and the factory carries a version of
itself (`v41`) the way the product carries a git sha.

The lifecycle is a branch of the whole system: plan a change (fold the fixable
defects), a system agent reworks the affected edges in a branch off the running
loop, promote, then a switchover pauses the fleet, migrates what is in flight,
and flips live onto the new version. The defects the version addressed close
against the redraw, not against a patch, and **version history**
(`system/versions/*` — a log separate from the repo's commit log) records the
switch. The full model is `system-versioning.md`.

Two things follow for the document model:

- **A version is a branch, not a file edit.** The rework happens off the running
  loop, so the live programs are never half-changed. This is the same reason
  layout and telemetry stay out of the documents: the loop has to stay
  diffable and reviewable, and a version is exactly a diff of it.
- **A redraw bumps the minor, a patch bumps the point.** The granularity of a
  change is carried in the version number, and a redraw — splitting an edge,
  moving a boundary, re-typing a contract — is the change that needs the full
  switchover, because it changes the contracts work is dispatched under.

## What the files do not hold

Two things the UI needs that do not belong in the documents:

- **Layout.** Node positions, zoom, which loop a state belongs to. This is
  metadata beside the corpus, never inside it. If the diagram owns the truth you
  get the Bubble problem: unversionable, undiffable, unreviewable.
- **Telemetry.** Runs, failure rate, median duration, dwell time per state. This
  is materialized from the factory dispatch event log, not from markdown,
  terminal bytes, or mutable process state. The prototype fakes it, but the
  shape of the need is real: an edge with no run stats cannot be trusted and the
  visual stops earning its keep.
