# MetaHarness

System definition as **one loop**, not a canvas of everything.

Nodes are **states**, defined by a predicate over the repo
(`slices/*.md where status=planned`). That makes them countable, which makes the
same ring both the definition and a live board. Edges are **processes**, and the
process sits on the line as a box holding a runbook or skill.

Because a process declares what it reads and writes against the node shapes, the
whole system is statically checkable: a broken wire is caught before dispatch.
Issues attach to edges, never to states, because states do not fail and
transitions do. One edge, `triage`, writes back into the loop itself.

## Read these first

| Doc | Holds |
|---|---|
| [`system-loop-view.md`](system-loop-view.md) | **why**: system mode is one loop, nodes are states, edges are processes |
| [`document-model.md`](document-model.md) | **the model**: paths, nesting, checkboxes, predicates, contracts. Survives the prototype |
| [`prototype.md`](prototype.md) | **what is built**: how to run it, every surface, every gesture, what is faked |
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

Tokens, window chrome, sidebar, cards and pills are copied from
`~/Dev/email-agent/poc` so the two prototypes read as one family.

## Branches

- `main` — the current state
- `loop-lanes-experiment` — an attempt at drawing off-rim paths as concentric
  lanes plus inward spokes to a corpus in the middle of the ring. Rejected on
  look. Kept only so the code is not lost.
