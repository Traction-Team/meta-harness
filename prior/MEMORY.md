# Meta-Harness project memory

## What this is

A product concept for a bimodal desktop app (system mode + product mode) that
sits above coding agents and orchestrators. The system side lets you define
skills, workflows, and runbooks that turn product specs into shipped features.
The product side lets you work inside that system. The key differentiator is a
self-improvement loop where the system logs its own process issues.

## Origin

Emerged from a thinking session on 2026-08-24. The concept was grounded against
the email-agent repo (~/Dev/email-agent), which already contains the graph this
product would surface: 370 docs, 314 slices, 436 dependency edges, 301
decisions, extracted from prose conventions with zero schema.

## Key files

- `product-shape.md` — the full product shape document, written 2026-08-24.

## Key decisions so far

- The product sits above Orca/Conductor, not beside them. It dispatches to
  orchestrators, does not replace them.
- MVP ships one shape of product mode: markdown slices with structured fields
  (needs/owns/spec/proves). Pluggable renderers come later.
- The self-improvement loop (system logs its own issues) is the core bet and
  the competitive moat.
- Electron is the pragmatic platform choice, reusing shell-decision research
  from email-agent.
- The graph is computed from whatever format the system defines, not maintained
  as a separate data structure.

## Competitive landscape (as of 2026-08-24)

Spec authoring is commoditised (Spec Kit 115k stars, Kiro, Tessl, BMAD, all
free/MIT). Agent orchestration is commoditised (Orca 52k stars, Conductor, amux,
all free/MIT). The system + graph + self-improvement layer is unoccupied.
VirtusLab/orca (Scala DSL for dev flows) and beads (DAG issue tracker) are the
closest prior art for specific sub-features.
