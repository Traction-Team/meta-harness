# meta-harness-2 project memory

Continuation of the `meta-harness` project (see
`prior/product-shape.md`).

## Read these first

| Doc | Holds |
|---|---|
| `system-loop-view.md` | **why**: system mode is one loop, nodes are states, edges are programs |
| `system-versioning.md` | **why, part two**: defects, and the loop that rewrites itself into a new version |
| `document-model.md` | **the model**: paths, nesting, checkboxes, predicates, contracts. Survives the prototype |
| `prototype.md` | **what is built**: how to run it, every surface, every gesture, what is faked |

## The idea in one paragraph

System definition is not a canvas of everything, it is one loop. Nodes are
states defined by a predicate over the repo (`slices/*.md where status=planned`),
which makes them countable, which makes the same ring both the definition and a
live board. Edges are **programs** — a program is a set of instructions for doing
something in the factory, sitting on the line as a box. Because a program
declares its inputs and output against the node shapes, the whole system is
statically checkable: a broken wire is caught before dispatch. **Defects** attach
to edges, never to states, because states do not fail and transitions do. One
program, `triage`, folds *product* feedback into the spec; **system versioning**
folds *system* defects back into the loop itself — the factory keeps a version of
itself, and a promoted change reworks the edges those defects sit on, then
switches the running fleet over. That second return is the self-improvement moat,
and versioning is finally its UI.

## Decisions worth not relitigating

- **One primitive on the edges: the _program_.** A program is a markdown doc — a
  set of instructions for doing something in the factory — with typed inputs and
  an output. Today's *runbooks* and the *intake pills* are the same thing; both
  are programs. An input is **bound** to a state (reads it — the wire in) or
  **open** (the operator or a calling agent fills it at run time). A bound input
  draws an edge and is statically checkable; an open input makes the program an
  entry point (the pill) and is unchecked runtime data by design. A **skill** is
  *not* a program: it is a capability a program calls (browser use, a query),
  never a node or an edge. Naming settled on **Program**, not runbook / input /
  process. Deriving the graph from each program's front matter is the direction
  but is **left as-is for now** — the prototype keeps an explicit edge list.
- **Canvas is wrong for the product, right for the system.** A canvas collapses
  past ~50 nodes, so the 314-slice product corpus must not be one. The system is
  6-10 nodes by construction, so a diagram is exactly right. Same reasoning,
  opposite conclusion per mode.
- **The switcher stays top-left**, under the workspace. It now carries three:
  **System | Factory | Agents** (ids still `system` / `product` / `agents`; only
  the labels changed — went System/Product → Factory/Assets/Workers → landed on
  System/Factory/Agents). System and Factory are the same ring read two ways
  (definition vs. board of lists). Agents drops the ring entirely.
- **Agents mode is the third leg: orchestration, not description.** This is the
  Orca role — the live harness sessions walking slices along the edges. A board
  (a status-grouped list: needs-you / failed / blocked / running) over a console
  that is the session itself: transcript, a composer to steer it, one-tap answers
  to its blocking questions, and a rail linking back to the slice and the prompt.
- **The status dots are now a reading of the fleet, not decoration.** `AGENTS` is
  the source; `runsForSlice` / `dotForItem` derive the Factory dots from it, so
  the ring and the fleet can never disagree about a slice. That seam (real
  wiring, faked fleet) is where execution plugs in later.
- **Sub-loops are cut.** Descending from a program into a nested loop was
  disorienting. Depth lives in nested documents instead.
- **Tasks are markdown checkboxes**, not a bespoke syntax, and the task rail is
  a reading of the file rather than a second list.
- **A process is a prompt, so opening one opens a document**, not another
  diagram. Slices, spec sections and issues open in the same sheet.
- **In Product mode an item is a file**, so one click opens it and the panel
  holds only the station list, as the navigator.
- The self-edge and centre hub that drew "one edge rewrites the loop" were built
  and removed for being confusing. Idea stands, and it now has a picture:
  **system versioning** (below), not an arrow.
- **System versioning is the treatment for the moat.** The factory keeps a
  version of itself (`v41`). Defects — friction the factory logs about its own
  wiring, attributed to edges — accumulate off the running loop. You fold the
  fixable batch into a **planned version**; a system agent reworks the affected
  edges in a branch (`system/v42`), off the running loop; you **promote**, and a
  **switchover** pauses the fleet, migrates what is in flight, and flips live onto
  the new version. Defects close against the redraw, not a patch. Full model in
  `system-versioning.md`. Surface: a **version pill** (top-left of the System
  canvas, live version + defect badge, switch canvas live/planned, reworked edges
  marked Δ), a **version card** (drives plan → build → ready → promote →
  switchover), and the strip's old "broken wire" chip is now the **defect badge**
  that opens the Defects list + the card.
- **"System issues" renamed to "Defects."** The word settled on *defect* for a
  logged friction item; the concept is unchanged (edge-attributed, categories
  skill-gap / review-miss / etc.). Code still uses `ISSUES` and stores under
  `system/issues/`; path/name lag like the runbooks one.
- **The ask bar opens a chat with the system agent.** A clean System canvas
  floats an up-arrow ask bar (only when nothing is drilled into); submitting opens
  a primary-pane chat that reuses the Agents console surface. Its replies are
  keyword-matched and wired into the version flow — asking to clean up defects
  offers *Plan a change*, which hands off to the version card. Scoped to System
  mode. Replies are canned; not a real model.

## The prototype

`prototype/`
(`index.html`, `styles.css`, `app.js`, `data.js`). No build step. Serve it:
`python3 -m http.server 4599`, then `http://localhost:4599/index.html`. It does
**not** run from `file://` in the Aside browser. Bump the `?v=` query on the
three assets after editing or the browser serves stale JS.

Tokens, window chrome, sidebar, cards and pills are copied verbatim from
`~/Dev/email-agent/poc` so the two prototypes read as one family.

Ignore `sessions/2026-08-25_vu5TZbWoaIwVFIoU/artifacts/harness-native`. Another
agent's experiment, unrelated to this work.

## Quirks worth remembering

- REPL `page` has no `setViewportSize` / `setExtraHTTPHeaders`.
- Background servers via `nohup ... &` in the Bash tool hang the tool call. The
  server still starts; verify with `curl` in a follow-up call. `(python3 -m
  http.server 8777 >/dev/null 2>&1 &)` in a subshell is the pattern that works.
- Aside `repl` cannot open `file://` ("no local file access"); serve the
  prototype over http and hit `localhost`. Screenshots must stay inside the
  session dir (`./artifacts`), `--session <id>` is ignored (a fresh timestamped
  session is made each run), so grab shots afterward from the newest
  `~/.aside/u/0/sessions/*/artifacts/`.
- Patching template-literal-heavy JS through the REPL fights the escaping. Use
  `edit_file` with exact text for anything containing backticks.

## Open threads

- Does the play button belong on the lines, or is the loop a static definition
  surface with execution elsewhere? Leaning toward the latter now that **Agents
  mode is the execution home** — the ring stays a definition/board, the fleet is
  where runs actually live. Play buttons still exist on the lines as a dispatch
  shortcut, but they hand off into Agents mode.
- Layout is a forced ring over a DAG with back-edges. Fine at 6 nodes, unproven
  when a real system has skips and parallel paths.
- Source of truth must move to the real markdown files, with canvas layout as
  metadata beside them. The mechanism: each program's inputs/output live in its
  front matter, and the graph is derived from those bindings the way nesting is
  derived from paths. Deferred until it earns its way in during real building.
- Code still carries the legacy names: `data.js` has `PROCS` with
  `kind: runbook|skill` and a separate `INPUTS` list, and programs are stored
  under `system/runbooks/`. A cleanup pass would fold runbooks + inputs into one
  `PROGRAMS` shape (each with `inputs`/`output`), leave skills as the called
  capabilities, and rename the path to `system/programs/`. Docs describe the
  target; code lags on purpose.
- A nested page has exactly one parent, but `code-review.md` is wanted by two
  edges. If shared pages are common, nesting is the wrong primitive for them.
- Versioning's honest gaps (see `system-versioning.md`): migration of in-flight
  work is hand-waved (one line, three toasts); the model assumes one planned
  version at a time (overlapping reworks would need a version tree, not a line);
  there is no surface for choosing *which* defects a version takes on (it folds
  every one with a proposed fix); and defects have no lifecycle beyond
  open / closed-by-a-version. Also: minor-vs-point bumps (redraw vs patch) are
  described but the prototype only does whole-number bumps.
