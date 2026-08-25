# Meta-Harness: product shape

Working name. The bimodal harness for the system that builds the system and the
product it builds.

## The one-line pitch

Every IDE is an IDE for the code. Code is now a projection of a conceptual
system. Nobody has built the IDE for the source.

## The problem in three observations

1. **Engineers now build two things at once.** The product, and the system that
   turns product intent into shipped features. Skills, workflows, runbooks,
   AGENTS.md files, slice conventions, review gates. That system lives in
   scattered text files, terminal history, and people's heads.

2. **The system has no home.** AGENTS.md is the closest thing to a living
   process definition, and it works, but it is not versioned as its own
   artifact, not visible as its own object, and not improvable through its own
   feedback loop.

3. **The system cannot improve itself.** When a coding agent hits a process
   problem (not a product bug), that signal disappears into scroll-back. There
   is no channel from "the agent found a gap in the review skill" back to "the
   review skill gets patched."

## The two modes

The product has exactly two modes. They share a repo but frame it differently.

### System mode

You are working *on* the system.

What you see: skills, workflows, runbooks, conventions, and the issues the
system has logged about itself. Each is a versioned artifact. Changes produce
git commits on a system branch or namespace.

What you do: define how product intent becomes shipped code. Wire integrations
(Linear, GitHub, markdown slices, whatever you choose). Improve the process
based on the system's own feedback.

What makes this different from editing AGENTS.md: the system's self-reported
issues are surfaced here as first-class work items, not buried in agent
transcripts. You see the system's version history, not just the repo's.

### Product mode

You are working *in* the system.

What you see: specs, slices, UI/UX documentation, build plans, progress, and
review, rendered in whatever shape the system has defined. If the system says
"use markdown slices with needs/owns/spec/proves," you see those. If it says
"use Linear issues," you see those.

What you do: define product intent, track build progress, review agent output,
merge work. You do not think about the process. The process is handled.

### The boundary

System mode changes how work happens. Product mode does work. Different
cognitive frames, different review standards, different git namespaces. Making
this boundary explicit is the core product decision.

## The self-improvement loop

This is the feature nobody else has.

As the system runs (agents building features, running reviews, filing PRs), it
logs its own process issues: skill gaps, spec ambiguities, recurring review
failures, edge cases the runbook does not cover, constraint violations.

These are not product bugs. They are system bugs. They appear in system mode as
a structured queue with categories:

- **skill-gap**: the agent needed a capability the skills do not provide.
- **spec-ambiguity**: the agent had to make a judgement call the spec should
  have settled.
- **review-miss**: a class of defect the review skill failed to catch, with the
  pattern.
- **constraint-violation**: a rule in the system was broken during a run.
- **convention-drift**: agent output diverged from the conventions the system
  defines.

Each issue links to the agent run that produced it. Some propose a fix. All are
versioned. Resolving one produces a system commit, which is visible in system
mode's version history.

## The graph underneath

The product does not prescribe a spec format. But all formats share a common
substrate: a directed graph of typed nodes and typed edges.

### Node types

| Type | What it is | Example |
| --- | --- | --- |
| doc | A concept, product definition, or architecture decision | `01-product-concept.md` |
| spec | A subsystem specification | `specs/02-schema.md` |
| decision | A numbered, cited constraint | `D301` |
| slice | A unit of buildable work | `1.47-thread-detail.md` |
| skill | A system capability definition | `.agents/skills/review/SKILL.md` |
| runbook | A process definition | `system/runbooks/slice-build.md` |

### Edge types

| Type | Meaning | Example |
| --- | --- | --- |
| needs | Slice A must merge before slice B can start | `1.47 needs 1.3, 1.12` |
| owns | A slice claims files it will create or modify | `1.47 owns packages/ui/src/thread.tsx` |
| cites | A slice or decision references a spec section | `1.47 spec — specs/02-schema.md §3` |
| covers | A slice implements part of a spec | Inverse of cites |
| reverses | A decision overturns an earlier one | `D14 reverses D9 §2.4` |

The graph is extracted from whatever format the system defines. If the system
uses markdown with `**needs**` / `**owns**` / `**spec**` fields, the extractor
parses those. If it uses Linear issue links, the extractor reads those. The
graph is a computed view, not a hand-maintained data structure.

## What the graph enables

Four queries that only work once the graph exists:

1. **Frontier.** What is buildable right now? All `needs` are merged, no `owns`
   collisions with in-progress work. This is a topological sort. It is the
   thing that makes a "play" button safe rather than reckless.

2. **Blast radius.** "I want to change spec 02 §3." Traverse: which decisions
   cite it, which slices depend on those decisions, which files do those slices
   own. Instant impact analysis across a large corpus.

3. **Coverage gaps.** Which spec sections have no slice covering them? Which
   decisions are cited zero times outside their own declaration? Which skills
   are defined but never referenced in a runbook?

4. **Collision detection.** Two slices claim overlapping `owns` files. They
   cannot run in parallel worktrees. Surface this before dispatch, not after a
   merge conflict.

## The execution layer

This product does not replace Orca, Conductor, or raw Claude Code. It sits
above them.

```
Human (intent, direction, review)
    |
    v
[This product]  <-- system mode: skills, workflows, runbooks, self-improvement
    |                product mode: specs, slices, progress, review
    |
    v
Orca / Conductor / terminal  <-- worktree management, agent terminals
    |
    v
Claude Code / Codex / etc    <-- the coding agent
    |
    v
Code (the projection)
```

The product dispatches work to agents through whatever orchestrator is
configured. It does not own the agent session. It owns the context the agent
receives (the spec, the slice, the relevant decisions, the skills) and the
feedback the agent returns (the PR, the system issues, the decision proposals).

## What the product is not

- **Not a spec-driven development framework.** Spec Kit, Kiro, Tessl, and
  BMAD already own that space. This product consumes specs in whatever format
  the system defines. It does not prescribe a format.

- **Not an agent orchestrator.** Orca, Conductor, amux already own that space.
  This product dispatches to orchestrators. It does not manage worktrees or
  terminals.

- **Not a canvas or whiteboard.** The graph has a visual representation, but
  the primary interface is query-driven views (frontier, blast radius,
  coverage), not a freeform drawing surface. Node-graph UIs collapse past
  ~50 nodes. A 300-slice project needs filtered lenses, not a giant diagram.

- **Not prescriptive about workflow.** The system side is user-defined. If you
  want waterfall slices, define waterfall slices. If you want kanban with
  Linear, wire Linear. The tool provides the harness, not the methodology.

## The MVP scope

### Ship first (one shape of product mode)

Markdown specs and slices with structured fields (`needs`, `owns`, `spec`,
`proves`), extracted into a graph, rendered as:
- A frontier view (what is buildable now).
- A slice list with dependency status.
- A blast-radius query.
- A system-issues queue from agent runs.

This is the format the email-agent repo already uses. It is the most validated
shape because it has been pressure-tested across 314 slices, 436 dependency
edges, and 301 decisions over 22 days.

### Ship second (system mode basics)

- Skills and runbooks as editable, versioned artifacts.
- System version history (separate from product commit history).
- Self-improvement issue queue with categories.

### Ship later (the framework)

- Pluggable product-mode renderers (Linear, GitHub Issues, custom).
- Pluggable dispatch to different orchestrators.
- Multiplayer with role-based views (system maintainer vs product definer vs
  reviewer).

## Platform

Desktop app. Electron is the pragmatic choice given the email-agent repo
already made and validated the Electron decision (see `docs/research/
shell-decision.md` in that repo). Reuse that research. Mac-first, cross-
platform later.

## The competitive gap

| Layer | Who owns it | Defensible? |
| --- | --- | --- |
| Spec authoring | Spec Kit (115k stars), Kiro, Tessl | No. Commoditised, free, MIT |
| Agent orchestration | Orca (52k stars), Conductor, amux | No. Commoditised, free, MIT |
| **System + graph + self-improvement** | **Nobody** | **Yes, if the self-improvement loop works** |

The defence is that neither the spec tools nor the orchestrators will build the
system-improvement loop, because it requires treating the development process
itself as a versioned, improvable artifact. Infrastructure tools do not make
that conceptual leap.

## Prior art to study

| What | Why |
| --- | --- |
| VirtusLab/orca (github.com/VirtusLab/orca) | Scala DSL for dev flows with planning/coding/review agent roles. Closest to the system side, done as code instead of a GUI |
| beads (github.com/gastownhall/beads) | DAG issue tracker for coding agents with ready/blocked computation. Closest to the frontier query |
| JSON Canvas (jsoncanvas.org) | Open .canvas format, MIT. If you build a visual graph view, emit this rather than inventing a format |
| C4 model (c4model.com) | The double-click-to-descend nesting pattern for architecture views |
| Juggl (github.com/HEmile/juggl) | Interactive graph over a markdown vault in Obsidian. Quick way to feel what the graph view would be like |

## Evidence from email-agent

This is not a hypothetical product. The email-agent repo is a 22-day,
555-commit, 370-document corpus that already contains the graph:

| Metric | Count |
| --- | --- |
| Markdown docs | 370 |
| Build slices | 314 |
| Dependency edges (needs) | 436 |
| File-ownership claims (owns) | 580 |
| Spec citations | 434 |
| Numbered decisions | 301 |
| Words in core docs | ~133,000 |

A 30-line extractor pulled the full graph from prose conventions with zero
schema, zero frontmatter. Zero broken links, zero missing needs targets, zero
dangling decision references. The ontology (five node types, five edge types)
was discovered empirically under pressure, not designed up front.

The gap the product fills: maintaining that graph at perfect referential
integrity required a hand-written AGENTS.md ("Rails that never bend") plus
constant agent oversight across 314 slices. That works for a disciplined solo
operator. It does not work for a team, it does not scale past one repo, and the
self-improvement loop does not exist at all yet.

## Open questions

1. **What is the unit of payment?** Per-seat, per-repo, per-agent-run? The
   system-improvement loop generates value per run. The graph generates value
   per query. The product mode generates value per session. Different units
   suggest different models.

2. **How much of product mode is custom?** The vision says "the system defines
   the product mode's language." The MVP says "markdown slices." How far
   between those two endpoints does v1 land?

3. **Does the system-improvement loop actually produce actionable output?**
   This is the core bet. If the agent logs vague observations, it is noise. If
   it logs structured, categorised issues with proposed fixes, it is a genuine
   feedback loop. The tightness of that output determines whether the feature
   is real.

4. **What is the name?** Meta-harness is a working label. The product needs a
   name that communicates "the thing above the code and above the agent" without
   sounding abstract. The system/product duality is the brand hook.
