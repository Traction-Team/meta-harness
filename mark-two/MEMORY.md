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
| `research/orca-evaluation.md` | **the Orca decision**: why we take from Orca instead of building on it |
| `research/agent-runtime-architecture.md` | **the accepted runtime**: PTY-native agents, Factory MCP, capability-negotiated ACP |

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
  **System | Factory | Products** (`system` / `factory` / `product`). System and
  Factory are the same ring read two ways (definition vs. board of lists).
  Products drops the ring and shows coherent shipped outcomes.
- **Worker orchestration stays inside Factory.** The live harness sessions walk
  artifacts along the edges. Factory's worker surfaces cover
  `starting`, `running`, `needs-you`, `needs-terminal`, `operator-held`,
  `blocked`, `failed`, `lost`, and recent completion. The console is a durable
  activity/question view; **Open terminal** attaches to the exact native TUI.
  A generic composer is shown only where an adapter provides reliable structured
  steering. Products is the third leg: what landed, where it is available, and
  the release notes and source artifacts that prove it.
- **The status dots are now a reading of the fleet, not decoration.** In the
  prototype, `AGENTS` is the fixture source and `runsForSlice` / `dotForItem`
  derive the Factory dots from it. In the real runtime, worker rows and Factory
  dots are projections of the dispatch event log, so neither mutable process
  state nor terminal output can make the views disagree.
- **We do not build on Orca.** Settled 26 Aug 2026 after reading the source;
  full workings in `research/orca-evaluation.md`. Orca is MIT and excellent, but
  it is 1.55M non-test lines and exposes no importable orchestration library.
  More importantly, its orchestration is imperative and per-run where ours is
  declarative and statically checkable. Sitting on Orca would make its
  Run/Task/Dispatch model the execution authority instead of the loop. We read
  it as a spec and copy the useful model.
- **The accepted runtime is PTY-native agents + Factory MCP + optional ACP.** The
  Claude-Code-only Agent SDK recommendation was superseded later on 26 Aug when
  multi-harness support and exact live-terminal access became explicit product
  requirements. Full design in `research/agent-runtime-architecture.md`.
- **PTY is the data plane.** Run each harness's real CLI in a managed PTY owned
  by a separate local daemon. Electron + `node-pty` + `@xterm/xterm` means we do
  not write a terminal emulator. The operator can attach to the exact live TUI
  at any time; ordinary sidecar shells in the same worktree are separate PTYs.
  A PTY emits bytes, not dependable questions or completion events, so never
  make screen scraping the factory contract.
- **Factory MCP is the common control plane.** Give compatible workers
  `factory.ask`, `factory.complete`, `factory.report`, and `factory.heartbeat`.
  Programs tell agents to use these instead of private question tools. Questions
  and answers are durable dispatch events; the MCP request is only transport.
  ACP enriches adapters that reliably implement elicitation, permissions, and
  session resume, but is capability-negotiated rather than assumed.
- **Support is tiered, not falsely uniform.** Tier 1: ACP/elicitation + MCP; Tier
  2: native CLI + MCP; Tier 3: any CLI in a terminal, with no guaranteed
  structured questions or completion. Claude Code, Codex, OpenCode, Gemini CLI,
  and future harnesses are adapter entries with explicit capabilities.
- **The session is durable but adapter-specific.** While a PTY lives, opening the
  terminal is only attaching a view; no handoff is needed. After daemon or
  machine death, recovery uses the harness's native session ID or ACP
  load/resume. ACP does not guarantee that its session can open in the native
  TUI, so `nativeTuiHandoff` is optional. Hard invariant: one writer per session.
- **A dispatch is a container, not a claim of autonomy.** Real work is
  interleaved: you watch, you jump in, you take the wheel, you hand back. The
  loop only asserts a start state, a program, and an end state — it says nothing
  about who holds the keyboard in between. So **needs-you is a spectrum**, from
  "answer this question" through "review this diff" to "I'm taking over for
  twenty minutes", and `operator-held` is a first-class dispatch state beside
  running / blocked / failed.
- **Taken from Orca as a spec, not a dependency:** a **Dispatch** is one attempt,
  which makes retries and stale completions safe; `factory.complete` requires an
  explicit outcome; delivery is acknowledged until processed; heartbeats produce
  stale-dispatch warnings; and escalation/question are first-class events. We
  take these invariants, not Orca's Task graph or execution authority. We build a
  small terminal runner from `node-pty` and xterm.js, not a terminal emulator.
- **The event log is the source of truth for dispatch lifecycle, never process
  memory.** Repository documents remain authoritative for programs, predicates,
  contracts, and versions. Orca's large runtime illustrates how much complexity
  accumulates around recovery, resume, and mid-flight state. A dispatch must be
  reconstructable from the log alone. Get this seam right from the first commit
  or expect a rewrite.
- **Sub-loops are cut.** Descending from a program into a nested loop was
  disorienting. Depth lives in nested documents instead.
- **Tasks are markdown checkboxes**, not a bespoke syntax, and the task rail is
  a reading of the file rather than a second list.
- **A process is a prompt, so opening one opens a document**, not another
  diagram. Slices, spec sections and issues open in the same sheet.
- **In Factory mode an item is a file**, so one click opens it and the panel
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
  a primary-pane chat that reuses the worker console surface. Its replies are
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
  surface with execution elsewhere? The ring stays a definition/board and the
  Factory worker views are where runs actually live. Play buttons still exist on
  the lines as a dispatch shortcut, but they hand off into those worker views.
- The worker console is still faked. The accepted implementation is a separate
  daemon running each adapter's real native CLI in a managed PTY, with Factory
  MCP events backing the board and question flow and capability-negotiated ACP
  enrichment. Harness-specific authentication belongs in each adapter, not in
  the runtime model.
- Revisit the Orca decision only if Stably ships the orchestration layer as a
  standalone importable package or remote/multi-machine workers stop being
  hypothetical. Runtime-specific revisit triggers live in
  `research/agent-runtime-architecture.md`.
- Claude Code is growing its own orchestration from below — of its 44 tools,
  `Agent`, `Workflow`, `SendMessage`/`ListAgents` (cross-session messaging),
  `TaskCreate`/`TaskList`/`TaskUpdate`, `CronCreate` and `ScheduleWakeup` are all
  orchestration primitives. They remain harness-local and imperative; they do
  not replace factory programs, contracts, dispatch records, or event-log
  authority. "The layer below might eat this" belongs beside the Orca revisit
  triggers.
- Define the Agents presentation while a dispatch is `operator-held`. In
  PTY-native mode the process keeps running and the operator owns the daemon's
  single-writer lease while viewing the exact live TUI. The structured activity
  view can continue to show committed events, but must not imply that its
  composer universally controls the harness.
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
