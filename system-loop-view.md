# System mode: the loop view

Working note, 2026-08-25. Refines the system side of `meta-harness/product-shape.md`.

This is the **why**. For what got built and how it behaves see `prototype.md`;
for the file conventions underneath it see `document-model.md`. Where this note
and those two disagree, they are right and this one is history.

## The move

System mode is not a canvas of everything. It is **one loop**.

Nodes are **states**. Edges are **processes**. The process sits on the line as a
small clickable box. Click it and you get its numbers; open it and you get the
runbook or skill prompt that drives the transition, as a full-page document.

This resolves the earlier "not a canvas" position. Canvases collapse past ~50
nodes, which is why the *product* corpus (314 slices) must not be a canvas. But
the *system* is 6-10 nodes by construction. A loop with eight states and eight
processes is exactly the size a diagram is good at. Canvas is wrong for the
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
       |  [log issue]
       v
  feedback / issues
       |  [triage]
       +---> back to product spec        (product defects)
       +---> back to THE LOOP ITSELF     (system defects)
```

The second return edge is the whole product. `triage` writes into the diagram
you are looking at. One edge in the loop mutates the loop. Every other tool has
the first arrow. Nobody has the second.

The drawing of that second arrow (a dashed self-edge into a hub in the centre)
was built and then removed for being confusing. The idea stands, the picture
does not. It needs a treatment that is not an arrow.

## Node = state, defined by a predicate

A node is not a document. It is a set: a glob, a folder, or a query.
`specs/*.md`, or `slices where status=planned`. Two consequences:

1. The node is **countable**. Render a badge: 12 slices sitting here right now.
2. The loop is therefore both the **definition** and the **runtime dashboard**.
   Same view, two readings. It is a Kanban board bent into a ring.

A node also carries a **shape**: the template/schema that artifacts in that state
must satisfy (e.g. slices need `needs` / `owns` / `spec` / `proves`).

## Edge = process, and the edge is the typed part

Each process box holds:

- **prompt**: the runbook or skill markdown. This is what opens when you open
  the process.
- **input contract**: which fields it reads from the source node's shape.
- **output contract**: what shape it must produce in the target node.
- **trigger**: manual, on-arrival, batch or scheduled.
- **runner**: which agent, and whether there is a human gate.
- **telemetry**: runs, retries, failure rate, median duration.

Because inputs and outputs are typed against node shapes, the system is
**statically checkable**. If an edge reads a field the source node's shape does
not define, that is a broken wire, surfaced before a single agent runs. That is
a compile step for your process. Nobody has that either.

## Issues attach to edges, not nodes

Clean taxonomy split:

- **Edge defects** = process quality. skill-gap, review-miss, convention-drift.
  These land on the process box. A red count on `review` means that runbook is
  leaking.
- **Node defects** = artifact quality. spec-ambiguity, missing field, stale doc.
  These land on the state.

States do not fail. Transitions fail. So the failure heat map lives on the lines,
and the loop view immediately shows you which transition burns the most retries.
That is the self-improvement queue rendered spatially instead of as a list.

## Interactions

- Click node -> floating panel: the predicate, the shape, and throughput. In
  Product mode, also the full list of what is sitting there.
- Click process box -> floating panel: trigger, runner, contracts, issues,
  send-back rate.
- Open a process -> the prompt as a full-page document, laid over the loop, with
  its tasks and contract in a rail beside it.
- Play button **on the line** -> run this process now over whatever is sitting in
  the source node.

The payoff: the diagram is executable. You are not drawing your process, you are
wiring it, and the run buttons are on the edges.

**Sub-loops were tried and cut.** Double-clicking a process used to descend into
a nested loop, C4's nesting pattern applied to processes. In practice it was
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
3. **Source of truth must be the files.** Runbooks are markdown in `system/`.
   The canvas is a projection; layout is metadata. If the diagram owns the truth
   you get the Bubble problem: unversionable, undiffable, unreviewable.
4. **The killer risk.** If a process box is just a prompt file with no contract
   and no telemetry, the whole diagram degrades into a pretty file browser. The
   visual only earns its keep if edges carry contracts and run stats. Visual
   without telemetry is decoration.

## Lint rule worth having

States are nouns, processes are verbs. If you cannot name an edge with a verb
phrase, it is not a process, it is a state you forgot to model. If you cannot
name a node with a noun, it is a process you drew in the wrong place.
