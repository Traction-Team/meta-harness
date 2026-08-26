# meta-harness

System definition as **one loop**, not a canvas of everything.

Nodes are **states**, defined by a predicate over the repo
(`slices/*.md where status=planned`). That makes them countable, which makes the
same ring both the definition and a live board. Edges are **programs** — a
program is a set of instructions for doing something in the factory, and it sits
on the line as a box.

A program declares typed **inputs** and an **output**. An input is *bound* to a
state (it reads that state — the wire in) or *open* (the caller fills it at run
time). A program whose input is open is an intake the operator or an agent
fills, drawn as a pill rather than a box. A **skill** is a different thing again:
a capability a program calls from its body — browser use, a query — never a node
or an edge.

Because a program's inputs and output are typed against the node shapes, the
whole system is statically checkable: a broken wire is caught before dispatch.
**Defects** attach to edges, never to states, because states do not fail and
transitions do. One program, `triage`, folds *product* feedback back into the
spec; **system versioning** folds *system* defects back into the loop itself —
the factory keeps a version of itself, and a promoted change reworks the edges
those defects sit on.

## Read these first

| Doc | Holds |
|---|---|
| [`system-loop-view.md`](system-loop-view.md) | **why**: system mode is one loop, nodes are states, edges are programs |
| [`system-versioning.md`](system-versioning.md) | **why, part two**: defects, and the loop that rewrites itself into a new version |
| [`document-model.md`](document-model.md) | **the model**: paths, nesting, checkboxes, predicates, programs vs skills, contracts. Survives the prototype |
| [`prototype.md`](prototype.md) | **what is built**: how to run it, every surface, every gesture, what is faked |
| [`research/orca-evaluation.md`](research/orca-evaluation.md) | **the execution decision**: why we wrap Claude Code ourselves rather than build on Orca |
| [`MEMORY.md`](MEMORY.md) | working memory: decisions not worth relitigating, quirks, open threads |

`prior/` holds the earlier `meta-harness` round that this continues, mainly
[`prior/product-shape.md`](prior/product-shape.md).

## The prototype

```
cd prototype
python3 -m http.server 4599
open http://localhost:4599/index.html
```

No build step and no dependencies. It does **not** run from `file://`, it needs
the server. Bump the `?v=` query on the three assets in `index.html` after
editing or the browser serves stale JS.

It has three modes, switched top-left: **System** (the loop as a definition),
**Factory** (the same ring as a live board of lists), and **Agents** (the fleet
of harness sessions running against the slices — a console per run). The Factory
status dots are a reading of that fleet. The System canvas
carries a **version pill** (live version + open-defect count, switch the canvas
between the live loop and a planned rework) and, on a clean canvas, an **ask
bar** that opens a chat with the system agent. See [`prototype.md`](prototype.md)
for every surface and gesture.

Tokens, window chrome, sidebar, cards and pills are copied from
`~/Dev/email-agent/poc` so the two prototypes read as one family.

## Execution

Agents mode is faked today. When it becomes real it will run on **our own thin
wrapper around Claude Code**, not on Orca. One long-lived Agent SDK session per
dispatch in streaming input mode: an async generator is the composer, the typed
message stream is what the console renders, and `canUseTool` is the decision
gate that produces the needs-you state. The event log is the source of truth for
a dispatch, never process memory.

Orca stays a reference we read rather than a dependency we ship — we take its
Run / Task / Dispatch model, its `worker_done` outcome contract, and its
ack-until-processed delivery. The workings are in
[`research/orca-evaluation.md`](research/orca-evaluation.md).

## Branches

- `main` — the current state
- `loop-lanes-experiment` — an attempt at drawing off-rim paths as concentric
  lanes plus inward spokes to a corpus in the middle of the ring. Rejected on
  look. Kept only so the code is not lost.
