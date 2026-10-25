# Mark IV

Metafab without a runner. A team writes its factory down in a `.fab/` folder: the **stages** work passes through, the **jobs** that move it on, and the **scorers** that judge it. The `fab` CLI installs it into every agent harness. The fab monitor, a small menu bar app, shows where all the work is, who has agents on it and how good it is, and lets anyone start a job with one click.

Mark III ([`../mk3/`](../mk3/)) is the full runner. Mark IV keeps its main idea, *fix the factory, not the output*, and its scorers, and leaves the running to the harnesses that teams already use. From Mark II ([`../mark-two/`](../mark-two/)) it takes stages as filters, so a fab works on the work a repository already has.

| File | Holds |
| --- | --- |
| [`overview.md`](overview.md) | What Mark IV is, the parts of a fab (stages, jobs, scorers, history), the `.fab/` folder, install, and what changed from Mark III |
| [`cli.md`](cli.md) | The `fab` commands, for people and agents, run and score records, and the `fab` skill |
| [`storage.md`](storage.md) | Where scores, history links and finished runs are kept and shared: records, the spool and index, the git ledger (free) and Fab Cloud (live sync, teammates' agents, claims) |
| [`monitor.md`](monitor.md) | The fab monitor: the Pipeline and Jobs tabs, the sheets, the cubes and score rings, how it reads the CLI, and the build order |
| [`prototype/`](prototype/) | A click-through of the monitor over fixtures: stage bars, artifacts with scores and history, starting jobs, a team preview |
| [`research/agent-sessions.md`](research/agent-sessions.md) | How to find, read and start sessions in Claude Code, Codex, opencode, Orca and nodeterm |
| [`research/dragonfly-factory.md`](research/dragonfly-factory.md) | What worked and what was hard in the Dragonfly `.factory/`, and how it converts to `.fab/` |

## First build

1. `fab init`, `fab create`, `fab install`, `fab check`, using the Dragonfly `.factory/` as the test case.
2. Stage sources for `files`, `lines in`, `slices in` and `prs`, and `fab work --json`.
3. Run records, `fab run --on`, and `fab link` with session finding from the process tree, for Claude Code and Orca.
4. `fab status --json` with the Claude Code and Orca adapters.
5. `fab score` and score records, with one scorer (*edge cases* on plans), into the spool and the index.
6. The git ledger and `fab sync`. First test a push to `refs/fab/ledger/*` on GitHub with rulesets on, and an index rebuild on 250,000 made-up records.
7. A SwiftBar plugin over `fab work` and `fab status`, to test the view.
8. The SwiftUI monitor: Pipeline and Jobs.

After Mark IV: Fab Cloud as a second backend, for live sync, teammates' agents and claims.
