# The document model

Working note, 2026-08-25. The part of this project that has to survive even if
the prototype is thrown away.

The harness has no database. Every object it shows is a markdown file in the
repo, and every relationship between objects is either a path or an ordinary
markdown link. If the UI burned down tomorrow you could keep working in a text
editor and lose nothing but the drawing.

## Everything is a file

| Thing | Lives at | Opened as |
|---|---|---|
| runbook | `system/runbooks/<id>.md` | full-page sheet |
| skill | `system/skills/<id>.md` | full-page sheet |
| slice | `slices/<id>.md` | full-page sheet |
| spec section | `docs/<id>-<slug>.md` | full-page sheet |
| system issue | `system/issues/<id>.md` | full-page sheet |
| nested page | `<parent-without-.md>/<name>.md` | full-page sheet |

One sheet renders all of them. It does not branch on type beyond a glyph, a
tag word, and which process the Run button fires. That is the test of whether
the model holds: if a new kind of document needs new UI, the model has leaked.

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
Feedback       system/issues/*.md
```

Two consequences worth keeping:

1. A state is **countable**, so the same diagram is both the definition and the
   live board. A kanban board bent into a ring.
2. A file can move between states without moving on disk. `slices/1.50.md` is
   one file whether it is planned, in flight or merged. Its station is derived,
   not stored.

Each state also carries a **shape**: the fields documents in that state must
have. `slices` need `id`, `needs[]`, `owns[]`, `spec`, `proves`.

## Processes are typed against the shapes

A process (the box on the edge) declares what it reads from the source state and
what it writes into the target state:

```
build + self-review
  reads   slice, branch, agent      from Worker branch
  writes  slice, diff, checks, reviewer   into Worker PR
```

If a process reads a field the source shape does not define, that is a **broken
wire** and it is caught before dispatch, not after a bad run. The prototype ships
one on purpose: `log issue` reads `transcript`, which `Merged` does not define.

This is the compile step for a process. Without it the diagram is a file browser
with lines drawn on it.

## Issues attach to edges

`system/issues/i3.md` names the edge it happened on, never a state. States do not
fail, transitions do. An issue with no edge is an observation, and observations
are noise.

Categories in use: `skill-gap`, `spec-ambiguity`, `review-miss`,
`constraint-violation`, `convention-drift`.

Three issues of one category on one edge is not a patch. It means the edge is
drawn wrong and wants redrawing, which is the one operation that changes the
diagram itself.

## What the files do not hold

Two things the UI needs that do not belong in the documents:

- **Layout.** Node positions, zoom, which loop a state belongs to. This is
  metadata beside the corpus, never inside it. If the diagram owns the truth you
  get the Bubble problem: unversionable, undiffable, unreviewable.
- **Telemetry.** Runs, failure rate, median duration, dwell time per state. This
  comes from run records, not from markdown. The prototype fakes it, but the
  shape of the need is real: an edge with no run stats cannot be trusted and the
  visual stops earning its keep.
