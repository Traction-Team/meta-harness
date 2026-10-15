# Mark IV

Metafab without a runner. A team writes its factory down in a `.fab/` folder. The `fab` CLI installs it into every agent harness. The fab monitor, a small menu bar app, shows the fab and what runs in it, and lets anyone start a program with one click.

Mark III ([`../mk3/`](../mk3/)) is the full runner. Mark IV keeps its main idea, *fix the factory, not the output*, and leaves the running to the harnesses that teams already use.

| File | Holds |
| --- | --- |
| [`overview.md`](overview.md) | What Mark IV is, the parts of a fab, the `.fab/` folder, install, and what changed from Mark III |
| [`cli.md`](cli.md) | The `fab` commands, for people and agents, run records, and the `fab` skill |
| [`monitor.md`](monitor.md) | The fab monitor: Now, Start and Map, how it reads the CLI, and the build order |
| [`research/agent-sessions.md`](research/agent-sessions.md) | How to find, read and start sessions in Claude Code, Codex, opencode, Orca and nodeterm |
| [`research/dragonfly-factory.md`](research/dragonfly-factory.md) | What worked and what was hard in the Dragonfly `.factory/`, and how it converts to `.fab/` |

## First build

1. `fab init`, `fab create`, `fab install`, `fab check`, using the Dragonfly `.factory/` as the test case.
2. Run records and `fab run` for Claude Code and Orca.
3. `fab status --json` with the Claude Code and Orca adapters.
4. A SwiftBar plugin over `fab status`, to test the view.
5. The SwiftUI monitor: Now, Start, Map.
