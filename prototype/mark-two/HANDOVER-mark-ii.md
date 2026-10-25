# Mark II — handover

Working note for whoever picks this up next. Mark II was copied from `mark-one`
and the **prototype** was restructured to match the new "factory made of
artifact groups, programs, subsystems, and a shelf" design. This note says what
changed, what is verified, and what is left.

## What Mark II is

The restructure brief (from the user):

- The same factory has three modes: **System** defines how it works, **Factory**
  shows work moving through it, **Outputs** shows what it produces.
- Mark II **separates the definition from the live state.** System mode shows
  structure, contracts, connections — **not** queue sizes, item counts, agent
  activity. Those belong to Factory mode.
- **Artifact groups** — a filtered list (source + filter/predicate), not one
  document. System shows name + filter + source; the count only shows when
  running (Factory).
- **Programs** — transform artifacts from one group to another. A prose job
  definition declaring: accepted shape, produced shape, whether an **agent or a
  person** runs it, the **skills** it can load, and the instructions. A program
  on a canvas is an *instance* of an account-level program.
- **Subsystems** — group part of the factory behind one boundary with declared
  inputs/outputs. The parent canvas shows a frame, not the children; **opening
  one replaces the canvas with its internal canvas.**
- **The shelf** — reusable resources: artifact **source types**, defined
  **programs**, and **skills**. Skills are *not* canvas primitives; they attach
  through a program's definition.

Decisions locked with the user before building:
1. **Keep the loop aesthetic** ("these systems are always loops") — so nodes were
   recast as artifact groups, edges as programs, and subsystems + shelf added on
   top, rather than a free-form node editor.
2. **Implement everything** (all of the above).
3. **One clean `email-agent` dataset** — the other three demo workspaces were
   dropped to get the model right first.

## Run it

```
cd mark-two/prototype
python3 -m http.server 4599
open 'http://localhost:4599/index.html'
```

No build, no deps. Assets are cache-busted at `?v=2000000001`; **bump that in
`index.html` after editing** or the browser serves stale JS/CSS.

## The model demonstrated

Top-level canvas (`CANVASES.root`) is a loop:

```
Feedback →(triage feedback, person)→ Product spec →(plan feature, agent)→ Build plans
   ↑                                                                          │
 (capture landing notes, agent)                                     [ Delivery subsystem ]
   │                                                                          │
Merged work ←──────────────────── (connection out) ← Delivery ← (connection in)
```
Plus three input programs (Bug reports / Feature requests / Usage signals)
pouring into Feedback.

**Delivery subsystem** (`CANVASES.delivery`) — open it from the frame on the root
canvas:
```
Build plans(in) →(dispatch slice, agent)→ Worker branch →(build + self-review, agent)→ Worker PR →(review + merge, person)→ Merged work(out)
                                              ↖──────────────── rework (back edge) ───────────────╯
```

## Where things live (all in `mark-two/prototype/`)

### `data.js` — rewritten from scratch, single `email-agent` dataset
- `SOURCES` — artifact source types (shelf).
- `SKILLS` — capabilities (shelf), each with `id/name/icon/desc/runs`.
- `STATES` — **artifact groups**. New field `source` (id into SOURCES); `glob`
  was renamed to **`filter`**. `count`/`dwell` are live-only.
- `PROCS` — **programs**. `kind` was removed; now `runBy: "agent"|"person"`.
  `reads`/`writes` renamed to **`accepts`/`produces`**. New `skills: [ids]`,
  `def` (account-level program id), `task` (for person programs). `prompt`
  renamed **`instructions`**.
- `SUBSYSTEMS` — `{id,name,canvas,inputs[],outputs[],contains{groups,programs}}`.
- `CANVASES` — `root` + `delivery`. Each: `nodes[{id,grid:[c,r],subsystem?,boundary?}]`,
  `programs[]`, `connections[]`, `inputs[]`, `backs[]`. **This is the layout source.**
- `PROGRAM_DEFS` — account-level program definitions (shelf · Programs tab).
- `INPUTS`, `ITEMS`, `AGENTS`, `ISSUES`, `PRODUCT`, `PAGES`, `HISTORY`, `TERMS`,
  `COPY` — kept, lightly adapted. Program doc paths are now `system/programs/…`.

### `app.js` — key new/changed pieces
- `activeCanvas()` / `model()` — resolve the on-screen canvas to `{canvas, nodes,
  procs, inputs, connections, backs}`. `state.canvas` + `state.canvasStack` track
  drill-in.
- `openSubsystem(id)` / `exitToCanvas(depth)` / `canvasCrumb()` — drill-in + the
  toolbar breadcrumb (segments are clickable; Esc backs out).
- `procFace(p)` — now keyed on `runBy` (agent = book/purple, person =
  gate/amber). Program docs live under `system/programs/<id>.md`.
- `geo(m)` — **rewritten, data-driven off the canvas grid**, no more gate-in-gap
  geometry. Subsystem frames are a little taller.
- `paintLoop()` — renders artifact-group nodes (System: name+filter+source, **no
  count**; Factory: item list + count), program boxes (System: `runBy` chip +
  skill chips, no defect/item badge; Factory: avatars/run), **subsystem frames**
  (in/out ports + open button), plain **connections**, input pills, back edges.
- Panels: `nodePanel` (artifact group — structure in System, adds live block in
  Factory), `procPanel` (program — contract/skills/instructions in System, adds
  live run record in Factory), **`subPanel`**, **`skillPanel`** (both new).
- `paintShelf()` / `openShelf(tab)` — the shelf (renders into `#shelfLayer`).
  Sources & Programs have a "+ place" (toast stub); Skills are browse-only.
  Toolbar has a Shelf toggle (System mode only).
- `NAV.system` — The factory / Artifact groups / Programs / Subsystems / Skills /
  Defects / Version history. `VIEWS` has new `artifacts`, `subsystems`, `skills`;
  `gates` view removed; `programs`/`issues`/`skills` reworded.
- `MODES.product.label` is "Outputs" (id stayed `product` to limit churn; keydown
  `3`, `NAV.product`, `paintProduct` all still keyed on `product`).

### `index.html`
- Title → "Meta Harness Mark II"; added `<div id="shelfLayer">`; cache-bust bumped.

### `styles.css`
- Appended a **"Mark II" block** at the end: `.nd.group`, `.nd.frame` + `.frame-*`,
  `.nd-src`, `.nd-bd`, `.pr.sys-proc`, `.pr-run-by`, `.pr-skills/.pr-skill`,
  `.wire.conn`, `.crumb-canvas`, and the full `.shelf*` palette. Everything above
  that block is untouched Mark-I CSS.

## Verified

- `node -c` passes on both JS files.
- A DOM-shim load-path smoke test ran `initDocs()` + `paint()` + `fit()` and then
  every panel, every list view, both canvases (root + delivery), all three modes,
  the shelf (all tabs), `openSubsystem`/`exitToCanvas`, `openEditor`, and the doc
  generators (`issueBody`, `itemBody`) — **all green, nothing throws.**
- Server serves `index.html` + all three assets (200) with the new versions.
- No lingering references to removed globals (`RUNBOOKS`, `GATES`,
  `EXTRA_SKILLS`, `REPO.skillsN`, `.glob`, `.reads/.writes`, `.kind`,
  `.assignee`, `gateCount`, `BACKS`).

## NOT done / next steps (priority order)

1. **Real-browser visual QA.** The smoke test proves it doesn't throw, but has
   **not been seen rendered.** Load it and check: the root loop reads well with 5
   nodes; the Delivery frame + drill-in look right; program boxes in System show
   the runner chip + skill chips without overflow; the shelf panel doesn't
   collide with the version card / ask bar; Factory still lists items with
   counts; Outputs mode unchanged. `fit()` clamps zoom to ≤1.15 — a 5-node loop
   may sit small; tune `geo()` pitch or the `fit` clamp if it feels sparse.
2. **CSS polish** for the new classes (the appended block is functional but
   un-eyeballed) — especially `.pr.sys-proc` height with wrapped skill chips, and
   `.nd.frame` on the Factory canvas.
3. **Versioning + ask-bar copy** still say "loop"/"edge"/"station" in places
   (`planChange`, `agentReply`, the version card comment block). Functionally
   fine and defects still attach to programs, but the prose could be updated to
   "program"/"artifact group". The version pill/defects are arguably operational
   — the brief says System shows no operational data, so consider whether the
   defect surfaces belong in System at all (currently kept, but badges were
   removed from the System canvas nodes/programs).
4. **Markdown docs untouched** — `mark-two/README.md`, `prototype.md`,
   `document-model.md`, `system-loop-view.md`, `system-versioning.md`, `MEMORY.md`
   still describe Mark I ("six stations", "edges are programs", "nodes are
   states"). Update them to the Mark II vocabulary if the docs are meant to ship
   with it.
5. **Shelf "place on canvas" is a toast stub.** If real placement is wanted, it
   must insert a node/program into `CANVASES[state.canvas]` and re-fit — non-trivial
   against the fixed grid (would need a free slot or auto-layout).
6. **Multi-workspace** was reduced to one. The `DATASETS`/`loadWorkspace`
   scaffolding still exists, so re-adding My Brain Books etc. in the new shape is
   possible later.

## Gotchas

- `state.canvas` must be reset to `"root"` on any workspace switch (currently
  only one workspace, so not exercised — check `switchWorkspace` if you re-add
  workspaces).
- `stateById` resolves against the full `STATES`, so an artifact group that
  appears on two canvases (e.g. `plans`/`merged` as subsystem boundaries) is the
  same object — intentional, keeps contracts consistent.
- Program endpoints must be node ids present on the active canvas or the wire is
  skipped (guard in `paintLoop`: `if (!look[e.from] || !look[e.to]) return;`).
