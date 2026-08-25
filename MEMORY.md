# meta-harness-2 project memory

Continuation of the `meta-harness` project (see
`prior/product-shape.md`).

## Read these first

| Doc | Holds |
|---|---|
| `system-loop-view.md` | **why**: system mode is one loop, nodes are states, edges are processes |
| `document-model.md` | **the model**: paths, nesting, checkboxes, predicates, contracts. Survives the prototype |
| `prototype.md` | **what is built**: how to run it, every surface, every gesture, what is faked |

## The idea in one paragraph

System definition is not a canvas of everything, it is one loop. Nodes are
states defined by a predicate over the repo (`slices/*.md where status=planned`),
which makes them countable, which makes the same ring both the definition and a
live board. Edges are processes, and the process sits on the line as a box
holding a runbook or skill. Because a process declares what it reads and writes
against the node shapes, the whole system is statically checkable: a broken wire
is caught before dispatch. Issues attach to edges, never to states, because
states do not fail and transitions do. One edge, `triage`, writes back into the
loop itself. That single arrow is the self-improvement moat.

## Decisions worth not relitigating

- **Canvas is wrong for the product, right for the system.** A canvas collapses
  past ~50 nodes, so the 314-slice product corpus must not be one. The system is
  6-10 nodes by construction, so a diagram is exactly right. Same reasoning,
  opposite conclusion per mode.
- **The System | Product switcher stays top-left**, under the workspace. Same
  ring in both modes. Product mode shows lists as nodes, not one node per item.
- **Sub-loops are cut.** Descending from a process into a nested loop was
  disorienting. Depth lives in nested documents instead.
- **Tasks are markdown checkboxes**, not a bespoke syntax, and the task rail is
  a reading of the file rather than a second list.
- **A process is a prompt, so opening one opens a document**, not another
  diagram. Slices, spec sections and issues open in the same sheet.
- **In Product mode an item is a file**, so one click opens it and the panel
  holds only the station list, as the navigator.
- The self-edge and centre hub that drew "one edge rewrites the loop" were built
  and removed for being confusing. Idea stands, picture does not.

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
  server still starts; verify with `curl` in a follow-up call.
- Patching template-literal-heavy JS through the REPL fights the escaping. Use
  `edit_file` with exact text for anything containing backticks.

## Open threads

- Does the play button belong on the lines, or is the loop a static definition
  surface with execution elsewhere? Asked Sebastian, not yet answered.
- Layout is a forced ring over a DAG with back-edges. Fine at 6 nodes, unproven
  when a real system has skips and parallel paths.
- Source of truth must move to the real markdown files, with canvas layout as
  metadata beside them.
- A nested page has exactly one parent, but `code-review.md` is wanted by two
  edges. If shared pages are common, nesting is the wrong primitive for them.
