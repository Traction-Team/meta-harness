# System versioning: defects and the loop that rewrites itself

Working note, 2026-08-26. How the factory logs friction about itself and folds
it back into a new version of the loop.

This is the **why** for the versioning surface. For what got built and how it
behaves see `prototype.md`; for the loop it operates on see `system-loop-view.md`.

This is the treatment for the moat. `system-loop-view.md` names two return
edges out of Feedback: `triage` folds **product** defects back into the spec
(the first arrow every tool has), and a second arrow folds **system** defects
back into *the loop itself* (the arrow nobody else has). That second arrow was
drawn as a self-edge into a centre hub, built, and cut for being confusing — the
idea stood, the picture did not. Versioning is the picture: not an arrow into a
hub, but a **version lifecycle**. The loop rewrites itself by shipping a new
version of itself.

## The idea in one paragraph

As the factory runs, its agents hit friction in how the factory is wired — a
skill it is missing, an edge that keeps letting the same miss through, a
contract two decisions both claim. Each is logged as a **defect**, attributed
to the edge it happened on. Defects are not product feedback; they are about the
machine, not the thing the machine makes. You let them accumulate, then fold a
batch of them into a **planned version**: a system agent reworks the affected
edges in a branch off the running loop, you promote it, and a **switchover**
phase pauses the fleet, migrates what is in flight, and flips live onto the new
version. The factory keeps a version of itself, and defects are the pressure
that moves it forward.

The accepted runtime in
[`research/agent-runtime-architecture.md`](research/agent-runtime-architecture.md)
owns these operations. System rework is a normal daemon-owned dispatch bound to
the planned version and its contracts. Pause, migration, promotion, and the live
flip are coordinator commands recorded in the event log; the UI only renders
their progress.

## Defect ≠ product feedback

Two return edges leave Feedback, and keeping them apart is the whole point.

- **Product feedback** is about the thing you are building — a bug in the email
  client, a regression, a request. It stays in the factory, and `triage` folds
  it into the **spec**. It sharpens the next thing built. This never touches the
  runbooks.
- **A defect** is about the factory — the runbook that let something through,
  the missing skill, the ambiguous contract. It folds into the **loop**, by
  reworking an edge, and it changes how the next thing is built. This never
  touches the spec.

If an agent files the wrong kind, the loop learns the wrong lesson: a product
bug logged as a defect rewrites a runbook that was fine, and a real system miss
logged as feedback edits a spec that was never wrong. So the split is enforced
at the point of logging, not cleaned up later.

## Defects attach to edges

A defect names the edge it happened on, never a state. States do not fail,
transitions do. A defect with no edge is an observation, and observations are
noise. Categories in use: `skill-gap`, `spec-ambiguity`, `review-miss`,
`constraint-violation`, `convention-drift`.

Because they attach to edges, defects render **on the line** in the loop view —
a red count on `review` means that program is leaking — and they cluster. Three
defects of one category on one edge is not a patch. It means the edge is drawn
wrong and wants **redrawing**, which is the one operation that changes the
diagram itself. (See `system/runbooks/*/redraw-an-edge.md`.)

## The version

The factory keeps a version of itself, `v41`. This is not the product's git
history; it is the version of the **system** — the set of programs, contracts
and edges that define the loop. Every promoted change bumps it, and the bumps
are recorded in **version history**, separate from the repo's commit log.
Promoted version files under `system/versions/*` hold declarative history. The
event log records the operational plan, build, promotion, and switchover facts.
The live pointer changes only after a successful switchover event is committed.

Defects do not get patched one at a time on the live loop. Patching the same
prompt again just spreads the same failure thinner. Instead they are folded, in
a batch, into a new version.

## The lifecycle

```
  v41 live
   │  accumulate defects, attributed to edges
   │
   │  plan a change  ── fold the fixable defects into v42
   ▼
  v42 planned · building
   │  a system agent reworks the affected edges in a branch (system/v42),
   │  off the running loop — nothing live changes yet
   ▼
  v42 planned · ready
   │  promote
   ▼
  switchover  ── the one moment the loop is paused
   │  1. pause the running fleet
   │  2. migrate what is in flight to the new contracts
   │  3. flip live → v42
   ▼
  v42 live     ── the folded defects close against the redraw, not a patch;
                  version history records the switch
```

1. **Accumulate.** Defects pile up off the running loop. The version pill shows
   the live version and the open-defect count.
2. **Plan a change.** Fold every defect that carries a proposed fix into a fresh
   version. A **system agent** runs as a daemon-owned dispatch in a branch named
   for the version (`system/v42`), bound to that version's contracts and touching
   only the system, never the running loop. The change is a diff: which edges get
   reworked, and which defect each closes.
3. **Build.** The agent works the branch. While it builds, the running factory
   keeps shipping on the old version — the rework is off to the side.
4. **Ready.** The agent hands the version back when the rework is done. Promotion
   is a human gate, the same way a review is.
5. **Promote → switchover.** Promoting asks the coordinator to run the
   switchover, the only moment the loop is paused: pause the running fleet,
   migrate what is in flight to the new contracts, then flip the live pointer
   onto the new version. Each step is committed as an event before the UI
   reports it complete.
6. **Live.** The defects the version addressed close against the redraw. Version
   history gains an entry naming the switch and the defects it closed. The
   factory is now running on the new version, and the pressure that moved it is
   gone.

The migration step is why this is a switchover and not just a pointer flip. Work
in flight was dispatched under the old contracts; if the new version re-types an
edge, the half-finished slices sitting on it have to be moved to the new shape or
paused. That is the cost of changing a machine while it runs, made explicit
instead of hidden.

## Two readings of the loop: live and planned

The version pill's dropdown switches the canvas between the **live** loop and
the **planned** rework. On the planned view, the edges the version reworks are
marked with a Δ and an accent ring, so the diff reads on the loop itself rather
than in a changelog beside it. You are looking at the same six stations either
way; what changes is which edges are lit as "about to change".

This is the version diff. A planned version is a branch of the whole system, and
the canvas is how you read that branch against the one running now.

## The system agent

A clean system canvas floats one invitation at the bottom: an ask bar to tell
the agent what to change, or to ask about how the loop is wired. Submitting opens
a chat with the **system agent** — the same agent that reworks the loop into a
new version.

The chat is not a side conversation. Its answers dovetail into the lifecycle
above: ask it to clean up the `review-miss` defects and it offers to fold the
fixable ones into a planned version; ask why an edge sends so much back and it
explains, then offers to draft the change as a version bump. A question about the
system ends in a promotable change. The agent is the how; the version is the
what.

## Granularity: redraw vs patch

Not every change is the same size, and the version number says which.

- A **patch** tweaks a program's prose without moving a boundary — bumps the
  point (`v41 → v41.1`).
- A **redraw** splits an edge in two, moves a boundary, or re-types a contract —
  bumps the minor (`v41 → v42`). A redraw is what three defects of one category
  earn; it is the operation that changes the diagram, and it needs the full
  switchover because it changes the contracts work is dispatched under.

The prototype models whole-number bumps and treats every promoted change as a
redraw. The distinction is real and lives in the redraw runbook; the mechanism
for point-patches-without-switchover is not built yet.

## Honest problems

1. **Migration is hand-waved.** "Migrate what is in flight to the new contracts"
   is one line here and three faked toasts in the prototype. In reality, moving a
   half-built slice from an old contract to a new one is the hard part, and some
   slices will have to be paused or restarted rather than migrated. The UI shows
   the phase; it does not yet show a slice that could not make the jump. The real
   design must also handle daemon recovery, lost dispatches, operator-held
   sessions, and attempts still bound to the old version.
2. **One planned version at a time.** The model assumes a single branch in
   flight. Two overlapping reworks — one on `review`, one on `build` — would need
   the version graph to be a tree, not a line, and the canvas to diff more than
   two readings.
3. **Who decides what folds in.** The prototype folds every defect that carries a
   proposed fix. In practice, picking which defects a version takes on is a
   judgement call — some are urgent, some want to wait for a pattern — and that
   selection surface does not exist yet.
4. **Defects have no lifecycle of their own** beyond open / closed-by-a-version.
   No triage state, no "won't fix", no linking two defects as the same root
   cause. They are a flat list until a version drains them.
