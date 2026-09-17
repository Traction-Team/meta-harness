# System mode: the loop view

Working note, 2026-08-25. Refines the system side of the historical,
partly superseded `prior/product-shape.md`.

This is the **why**. For what got built and how it behaves see `prototype.md`;
for the file conventions underneath it see `document-model.md`. Where this note
and those two disagree, they are right and this one is history.

## The move

System mode is not a canvas of everything. It is **one loop**.

Nodes are **states**. Edges are **programs** — a program is a set of instructions
for doing something in the factory, and it sits on the line as a small clickable
box. Click it and you get its numbers; open it and you get its instructions, as a
full-page document. A **skill** is a separate thing: a capability a program calls
(browser use, a query), never an edge of its own.

This resolves the earlier "not a canvas" position. Canvases collapse past ~50
nodes, which is why the *product* corpus (314 slices) must not be a canvas. But
the *system* is 6-10 nodes by construction. A loop with eight states and eight
programs is exactly the size a diagram is good at. Canvas is wrong for the
product and right for the system.

## The default loop

```
  product spec
       |  [plan feature]
       v
  build plans / slices
       |  [dispatch slice]
       v
  worker branch
       |  [build + self-review]
       v
  worker PR
       |  [review]
       v
  merged
       |  [log feedback]
       v
  feedback
       |  [triage]           (product feedback → sharpens the spec)
       +---> back to product spec
       .
  defects (off the ring)     (system defects → a new version of the loop)
       |  [plan a change]
       +---> THE LOOP ITSELF, reworked and switched over
```

The second return is the whole product. The loop does not just make things, it
feeds back into itself. Every other tool has the first arrow — feedback that
sharpens the thing being built. Nobody has the second — feedback that rewrites
the machine. The two are kept apart at the point of logging: **product**
feedback folds into the spec (via `triage`) and sharpens the next thing built;
**system** defects leave the ring entirely and fold into the loop itself,
changing how the next thing is built.

The drawing of that second arrow (a dashed self-edge into a hub in the centre)
was built and then removed for being confusing. The idea stands, the picture did
not — and it now has one. The treatment that is not an arrow is a **version
lifecycle**: system defects accumulate, you fold a batch into a planned version,
a system agent reworks the affected edges in a branch, and a switchover flips the
running factory onto it. The loop rewrites itself by shipping a new version of
itself. See `system-versioning.md`.

## Node = state, defined by a predicate

A node is not a document. It is a set: a glob, a folder, or a query.
`specs/*.md`, or `slices where status=planned`. Two consequences:

1. The node is **countable**. Render a badge: 12 slices sitting here right now.
2. The loop is therefore both the **definition** and the **runtime dashboard**.
   State membership comes from repository predicates; live dispatch overlays
   and telemetry come from event-log projections. Same view, two readings. It is
   a Kanban board bent into a ring.

A node also carries a **shape**: the template/schema that artifacts in that state
must satisfy (e.g. slices need `needs` / `owns` / `spec` / `proves`).

## Edge = program, and the wiring is the typed part

Each **program** box holds:

- **body**: the instructions — prose and checkboxes — that open when you open it.
- **inputs**: each one *bound* to a source state (it reads that state's shape —
  the wire in) or *open* (filled by the operator or a calling agent at run time).
- **output**: the shape it must produce in the target state — the wire out.
- **trigger**: when it fires — **manual**, **event** (on-arrival, on-ship),
  **clock** (every 1h, weekly), or **backpressure**: a predicate over the states'
  counts, like `branch < 3 and plans > 0`. See *The trigger paces the loop*.
- **runner policy**: eligible harness adapters, required capabilities,
  permission profile, and human gates.
- **skills it calls**: the capabilities the body reaches for — browser use, a
  query. A skill is a tool, not a step, so it is never an edge of its own.
- **telemetry**: runs, retries, failure rate, and median duration, materialized
  from dispatch events.

The **bound / open** split is the whole trick. A program with a bound input is a
transition, drawn as a box on a line. A program whose input is open is an entry
point — the operator's intake pill, or a skill-like helper an agent calls — drawn
off the ring. Same primitive, wired two ways.

Because bound inputs and the output are typed against node shapes, the system is
**statically checkable**. If a bound input reads a field the source node's shape
does not define, that is a broken wire, surfaced before a single agent runs. That
is a compile step for your program. An open input is the exception on purpose: it
is runtime data, so it cannot be checked — which is exactly what an entry point
should be.

## The trigger paces the loop

A trigger says when a program fires, and the values that earn their keep are the
ones that read the board back. Because a state is countable, a **backpressure**
trigger is just a predicate over those counts: `dispatch` fires while `branch < 3
and plans > 0` — hold three slices in flight, and only when work is waiting. A
program gated that way is **self-clocking**. It fires as fast as the stations
downstream drain and no faster, so there is no interval to pick; the loop paces
itself against real throughput. That is a Kanban WIP limit, written on the edge
instead of pencilled on a column.

The operator is never locked out. Whatever a program's trigger, the play button
requests an explicit dispatch attempt through the factory daemon. The daemon
selects eligible items, validates contracts, commits the attempt to the event
log, and only then launches work. The pace is automatic; sending one more is
manual.

## Defects attach to edges, not nodes

A **defect** is friction the factory logs about its own wiring as it runs —
program quality, not artifact quality. skill-gap, review-miss, convention-drift,
spec-ambiguity, constraint-violation. Each lands on the program box it happened
on. A red count on `review` means that program is leaking.

States do not fail. Transitions fail. So the failure heat map lives on the lines,
and the loop view immediately shows you which transition burns the most retries.
That is the self-improvement queue rendered spatially instead of as a list — and
what a **version** drains when you fold a batch of defects into a rework. See
`system-versioning.md`.

(Artifact-quality problems — a genuinely ambiguous spec section, a missing field
— are a *product* concern. They show on the artifact and fold into the spec via
`triage`, not into the loop. Do not confuse them with the defect queue above.)

## Interactions

- Click node -> floating panel: the predicate, the shape, and throughput. In
  Product mode, also the full list of what is sitting there.
- Click program box -> floating panel: trigger, runner, contracts, defects,
  send-back rate.
- Open a program -> its instructions as a full-page document, laid over the loop,
  with its tasks and contract in a rail beside it.
- Play button **on the line** -> ask the daemon to select eligible source items,
  validate their contracts, and create explicit dispatch attempts. An intake
  pill's play button opens its console instead, where the operator fills the
  program's open input by hand.

The payoff: the diagram is executable. You are not drawing your programs, you are
wiring them, and the run buttons are on the edges.

**Sub-loops were tried and cut.** Double-clicking a program used to descend into
a nested loop, C4's nesting pattern applied to programs. In practice it was
disorienting: you lost the one ring you came for. Depth now lives in the
documents instead, where a runbook nests child pages under it, which gives the
same decomposition without a second diagram to hold in your head.

## Honest problems

1. **Reality is not one clean circle.** Review fails and kicks back to the worker
   branch. Some slices skip stages. Fix: the graph is a DAG with back-edges, but
   the *layout* forces a main line into a ring so the reading stays clean.
   Back-edges render as inner chords. Do not force a literal circle or the
   diagram becomes a lie.
2. **Everything is in flight at once.** 40 slices at different stations. Handled
   by the counting-node model above. Product mode is the same ring with lists as
   nodes, and selecting anything there opens the file itself with the station
   list floating beside it as the navigator.
3. **Source of truth is split by concern.** Repository files are authoritative
   for system definition. The factory event log is authoritative for dispatch
   lifecycle. The canvas, Agents board, and telemetry are projections; layout is
   metadata. If the diagram owns the truth you get the Bubble problem:
   unversionable, undiffable, unreviewable.
4. **The killer risk.** If a program box is just a prompt file with no contract
   and no telemetry, the whole diagram degrades into a pretty file browser. The
   visual only earns its keep if edges carry contracts and run stats. Visual
   without telemetry is decoration.

## Lint rule worth having

States are nouns, programs are verbs. If you cannot name an edge with a verb
phrase, it is not a program, it is a state you forgot to model. If you cannot
name a node with a noun, it is a program you drew in the wrong place.
