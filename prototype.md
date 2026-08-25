# The prototype

Working note, 2026-08-25. What is built, how to run it, and how every surface
behaves. Companion to `system-loop-view.md` (why) and `document-model.md` (the
file conventions it assumes).

## Running it

```
cd prototype
python3 -m http.server 4599
open http://localhost:4599/index.html
```

No build step, no dependencies. It does **not** run from `file://` in the Aside
browser, it needs the server. `index.html` carries `?v=<epoch>` cache-busting on
its three assets; bump them after editing or the browser serves stale JS.

Unrelated: `2026-08-25_vu5TZbWoaIwVFIoU/artifacts/harness-native` is a different
agent's experiment and is not part of this work.

## Files

| File | Holds |
|---|---|
| `index.html` | shell markup: sidebar, toolbar, canvas, overlay mount, panels, strip |
| `styles.css` | tokens copied verbatim from `~/Dev/email-agent/poc`, then everything for the loop, panels and sheet |
| `data.js` | `STATES`, `PROCS`, `ITEMS`, `ISSUES`, `PAGES`, `WORKSPACES`, `NAV`, `HISTORY` |
| `app.js` | icons, state, the loop renderer, list views, panels, the sheet, the markdown renderer |

Theme, window chrome, sidebar, toolbar, cards, pills and segmented controls are
lifted from the email-agent prototype so the two read as one family.

## Two modes, one ring

The **System | Product** switcher sits under the workspace in the sidebar. The
workspace (email-agent / Forma / Everest) is the product you are building; you
pick that before you pick whether you are working *on* the system or *in* it.

- **System mode.** Nodes show the predicate that defines the state and its
  count. Processes show issue counts and failure heat. This is the definition.
- **Product mode.** Same ring, same edges, but each node is a **list** of what is
  sitting at that station right now. This is the board.

Nothing else changes between modes. That is the whole argument: one diagram, two
readings.

## The loop

Nodes sit on an ellipse and edges are arcs of that same ellipse, so it reads as
one circuit rather than a graph that happens to be round. A faint full ellipse
runs underneath; without it the arcs read as six disconnected fragments.

The process box sits at the middle of its arc, **on the line**. It carries:

- a glyph for runbook (purple) or skill (green)
- the process name
- a badge: open issues in System mode, items waiting in Product mode
- a play button, which runs it over whatever is in the upstream state
- a failure-rate bar underneath, when Heat is on

Broken wires render red and dashed. Hot edges (failure rate ≥ 25%) render amber.

Pan by dragging the background, zoom with the wheel under the cursor, or use the
zoom cluster bottom-left. The loop re-fits itself when a panel opens or closes.

**There are no sub-loops.** Double-clicking a process used to descend into a
nested loop. It was confusing and it is gone: a process is a prompt, so
double-clicking opens the prompt as a document instead.

## Floating panels

The canvas runs full width and the panels float over it, so the dot grid keeps
going underneath. No panel is open by default. Selecting something slides one in
from the right; Escape or the x closes it.

What the panel holds, by selection:

| Selection | Panel |
|---|---|
| state, System mode | State card: predicate, shape, arrives/leaves by, **Throughput** |
| state, Product mode | State card **and** `In <state>` list |
| process | Process card: trigger, runner, median, runs, prompt link, issues, contract, send-back rate |
| issue | Issue card plus "why it lands here" |
| item, Product mode | `In <state>` list only, because the item's own detail is the file already open in the main pane |

**Throughput** is the block that stops the state card being a label: median time
in that state, an eight-week sparkline (amber rising, green falling), slowest
10%, oldest item, and in/out per week with a growing / steady / draining chip.
The flow number is the useful one. Wherever `in` runs ahead of `out` is the
loop's bottleneck. Feedback sits at +2/wk, so issues are being logged faster
than they are closed.

The `In <state>` card is Product mode's see-all: a filter field, the full
scrollable list, `Showing 40 of 273 · Open in Slices`, and a `<process> over all
N` button. Filtering is a DOM pass, not a repaint, so the field keeps focus.

Panel width is 412px with 34px of left padding. That padding is not spacing, it
is room for the drop shadow: a scrolling box cannot overflow on one axis only,
so the gap has to live inside the box or the shadow gets sliced down its left
edge.

## The full-page sheet

Any file opens in the same sheet, laid over the canvas, stopping where the side
panel starts so both are readable at once. There is no scrim. The wrapper is
`pointer-events: none` so the loop stays live around it.

Layout: header, then a two-column body of document plus rail, then a footer.

- **Header.** Glyph, title, kind tag (`runbook` / `skill` / `slice` / `spec` /
  `issue` / `page`), an `unsaved` chip when dirty, the path crumb, a Read/Edit
  segmented control, and close.
- **Document.** Rendered markdown in Read, a plain mono textarea in Edit. The
  renderer handles headings, bold, inline code, links, blockquotes, ordered and
  unordered lists, fenced code, `$VARS`, and checkboxes.
- **Rail.** Tasks, Pages, and then either the **Contract** (for a runbook or
  skill) or **Where it sits** (for a slice, spec section or issue: station, next
  process, status, the station's shape, the file path).
- **Footer.** Version and run stats, or station and id for an item. Revert, Run,
  Save.

The crumb is honest about jumps. A child page shows just its file name, a jump
across the tree shows its whole path:
`docs/02-schema.md › thread-model.md › system/runbooks/review.md`. Every segment
is clickable.

## Interaction reference

| Gesture | Result |
|---|---|
| click state node | select it, panel opens |
| click item row (Product) | **open that file** in the sheet, `In <state>` list floats beside it |
| click process box | select it, Process card opens |
| double-click process box | open its prompt in the sheet |
| `Edit prompt` on the Process card | same |
| click a markdown link to a file we hold | open it in the sheet, push a crumb |
| click a Pages row | open that nested page |
| click a checkbox | rewrite that line in the file, mark dirty |
| click a list-view row (item) | open that file |
| click a list-view row (process/issue) | select it, panel opens |
| Escape | close the sheet; again to close the panel |
| Arrow up / down, file open | walk the station list beside it |
| Cmd-S | save the open file |
| `1` / `2` | System / Product mode |

## Data

`data.js` is shaped on the real email-agent corpus: 370 docs, 314 slices, 436
`needs` edges, 301 decisions. Six states, six processes, twelve system issues.

`ITEMS` is padded with plausible history to `PANEL_MAX = 40` per station so the
node counts are not lying. Past 40 the panel hands off to the matching list view
rather than pretending a floating card should hold 273 rows.

`DOCS` in `app.js` is the flat `path -> {title, body, item?}` store, built at
load from three sources: process prompts become their root file, `PAGES` supplies
handwritten nested pages, and every entry in `ITEMS` gets a document generated
from a template in `itemBody()`. That is 133 documents, and every cross-link
between them resolves: slice to spec section, slice to `code-review.md`, issue to
the runbook on its edge, spec section to the slices citing it.

## What is real and what is faked

Real, in the sense that the model is doing the work:

- the ring, the contracts, the broken wire, tasks parsed live out of markdown,
  the path-based nesting, link resolution, and every count on a node

Faked, and honest about it:

- all telemetry (runs, failure rates, dwell, sparklines)
- Run buttons toast and light the wire; nothing executes
- saving writes to memory, not to disk
- `New page under x.md` toasts

## Gaps

1. Layout is a forced ring over a DAG with back-edges. Fine at six nodes,
   unproven when a real system has skips and parallel paths.
2. "One edge rewrites the loop" is the moat and has no UI representation since
   the self-edge and hub were removed for being confusing. It needs a different
   treatment than an arrow.
3. A shared page can only have one parent. See the known limit in
   `document-model.md`.
4. Source of truth must move to the actual markdown files, with canvas layout as
   metadata beside them.
