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
| [`research/orca-evaluation.md`](research/orca-evaluation.md) | **the Orca decision**: why we take from Orca rather than build on it |
| [`research/agent-runtime-architecture.md`](research/agent-runtime-architecture.md) | **the accepted runtime**: PTY-native agents, Factory MCP, capability-negotiated ACP |
| [`MEMORY.md`](MEMORY.md) | working memory: decisions not worth relitigating, quirks, open threads |

`prior/` holds the earlier `meta-harness` round that this continues, mainly
[`prior/product-shape.md`](prior/product-shape.md).

## The prototype

```
cd prototype
python3 -m http.server 4599
open 'http://localhost:4599/index.html?mark=one'
```

To run it as a desktop app instead, with the native macOS window frame:

```
cd electron
npm install    # first time only
npm start
```

`electron/` is a thin shell. It loads `prototype/index.html` unchanged and
injects `electron/shell.css`, which removes the drawn window frame and fake
traffic lights and makes the top bars drag the window. It has no build step,
and you reload after an edit with Cmd+R. Links to preview and live URLs open
in the default browser.

In a browser there is no build step and no dependencies. It does **not** run from `file://`, it needs
the server. Keep the `?mark=one` query in the URL so a page previously served at
the same local path cannot be reused from the browser cache. Bump the `?v=` query
on the three assets in `index.html` after editing or the browser serves stale JS.

It has three modes, switched top-left: **System** (the loop as a definition),
**Factory** (the live board, workers, and dispatches), and **Products** (shipped
outcomes, release notes, and the environments where they can be experienced).
The Factory status dots are a reading of its fleet. The Products view links each
outcome back to its source artifacts and forward to a preview or live URL. The System canvas
carries a **version pill** (live version + open-defect count, switch the canvas
between the live loop and a planned rework) and, on a clean canvas, an **ask
bar** that opens a chat with the system agent. See [`prototype.md`](prototype.md)
for every surface and gesture.

Tokens, window chrome, sidebar, cards and pills are copied from
`~/Dev/email-agent/poc` so the two prototypes read as one family.

## Execution

Factory workers are faked today. The accepted runtime runs each harness's **real
native CLI inside a managed PTY**, so Claude Code, Codex, OpenCode, Gemini CLI,
and future terminal agents can all participate. A separate local factory daemon
owns the processes, PTYs, worktrees, session leases, Factory MCP server, and
recovery; Electron attaches views and can open the exact live terminal without
owning or restarting it. Factory MCP carries structured questions, completion,
reports, and heartbeats. ACP enriches individual adapters only where negotiated
capabilities are reliable.

Repository programs, predicates, contracts, and system versions remain the
authority for what work means. The durable dispatch event log is the authority
for runtime state. Process memory, terminal output, and terminal snapshots are
never either source of truth.

Orca stays a reference we read rather than a dependency we ship. We take its
one-attempt Dispatch invariant, explicit completion outcome, heartbeats, and
recoverable delivery semantics. We do not adopt Orca's Task graph or make it the
execution authority. See
[`research/agent-runtime-architecture.md`](research/agent-runtime-architecture.md)
and [`research/orca-evaluation.md`](research/orca-evaluation.md).

## Branches

- `main` — the current state
- `loop-lanes-experiment` — an attempt at drawing off-rim paths as concentric
  lanes plus inward spokes to a corpus in the middle of the ring. Rejected on
  look. Kept only so the code is not lost.
