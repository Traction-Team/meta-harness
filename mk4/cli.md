# The `fab` CLI

The CLI does all of the work in Mark IV. The monitor is a view over it. Agents use it as much as people do. See [`overview.md`](overview.md) for the parts of a fab.

## Principles

- **Files are the truth.** The CLI reads and writes `.fab/` and the installed files. It keeps no hidden state in the repository. Machine state (run records, the list of fabs) is in `~/.fab/`.
- **Agents are first-class users.** Every command has `--json`. When stdin is not a terminal, no command waits for input. It fails with a JSON list of what is missing instead.
- **Create, then edit.** `fab create` writes a correct scaffold and prints its path. The agent or person then edits the file directly. The CLI does not try to be an editor for program text.
- **Exact problems.** `fab check` prints each problem with `file:line` and the fix, so an agent can correct it without a second guess.
- **Run again safely.** `fab install` and `fab check` can run any number of times. They change only what is out of date.

## Commands

### Set up

| Command | Does |
| --- | --- |
| `fab init [--template <name\|path\|url>] [--import <dir>]` | Creates `.fab/` with `fab.yaml`, an empty `AGENTS.md`, and the folders. `--template` starts from a shared fab. `--import .factory` converts a Dragonfly-style folder |
| `fab install [--local] [--runtime <harness>] [--uninstall]` | Writes the skill links, the `AGENTS.md` block, `CLAUDE.md`, and the runtime files. See [Install](overview.md#install) |
| `fab check` | Checks frontmatter, names in `next`, `writes`, `reads` and `decides`, artifact paths, and that installed files are current. Exit 1 on any problem |
| `fab doctor` | Checks the machine: which harnesses are installed and signed in, the terminal app, Orca, nodeterm, and whether each session adapter can read its files |

### Define

| Command | Does |
| --- | --- |
| `fab create program <name> [--title T] [--entry] [--when W] [--description D] [--worktree new\|current]` | Writes `.fab/programs/<name>/SKILL.md` from a template with the frontmatter filled in |
| `fab create skill <name>` | Writes `.fab/skills/<name>/SKILL.md` |
| `fab create rule <name>` | Writes `.fab/rules/<name>.md` |
| `fab create template <name>` | Writes `.fab/templates/<name>.md` |
| `fab create artifact <name> --path <glob> [--says S]` | Adds an artifact to `fab.yaml` |
| `fab create decision <name> --who W [--says S]` | Adds a decision to `fab.yaml` |
| `fab create runtime <harness>` | Writes `.fab/runtimes/<harness>.md` from the built-in version for that harness |
| `fab rename <kind> <old> <new>` | Renames, and updates every `next`, `writes`, `reads` and `decides` that names it |
| `fab remove <kind> <name>` | Removes, and fails if something still names it (`--force` to remove anyway) |
| `fab list [programs\|skills\|rules\|artifacts\|decisions]` | Lists the parts. With `--json`, includes the frontmatter |
| `fab show <kind> <name>` | Prints one part, with what names it and what it names |
| `fab map [--format ascii\|mermaid\|json]` | Draws the flow from the programs' `reads`, `writes` and `next`, with decisions between them |

### Run

```
fab run <program> [--input name=value ...] [--harness <h>] [--worktree new|current] [--branch <name>] [--dry-run]
```

1. Reads the program's `inputs`. Asks each missing one in the terminal. Without a terminal, it fails with the list of missing inputs.
2. Chooses the harness: `--harness`, then the person's default in `~/.fab/config.yaml`, then `fab.yaml`'s default, then the first one `fab doctor` finds.
3. Writes the run record (see below).
4. Starts the session through the harness adapter, in the current worktree or a new one. See [`research/agent-sessions.md`](research/agent-sessions.md).
5. Prints the run ID, and where the session is.

`--dry-run` prints the prompt, the harness command and the run record, and starts nothing. Agents should use it before they start work for a person.

The opening prompt is plain text that any harness accepts:

```
Run the log-bug program (.fab/programs/log-bug/SKILL.md).
fab-run: r_20261016_7f3a9c

Inputs:
- what: The invoice total shows 0 after a refund
- where: https://app.example.com/invoices/INV-2041
- reporter: kat
```

The `fab-run:` line is how the monitor finds a session in a transcript when the harness gives no session ID at launch.

### Watch

| Command | Does |
| --- | --- |
| `fab status [--all] [--watch]` | Sessions in this fab (or in every registered fab with `--all`), each with its program, harness, state, worktree and age. `--watch --json` prints one JSON line for each change. The monitor reads this |
| `fab runs [--since 1d]` | Run records, including finished runs |
| `fab focus <run-id\|session>` | Brings the session to the front in its harness, where the harness allows it |
| `fab fabs add\|list\|remove [<path>]` | The fabs on this machine that the monitor shows. `fab init` and `fab install` add the current one |
| `fab monitor` | Opens the monitor |

## Run records

A run record is written before the session starts, so a session is never started without one. It lives on the machine, not in the repository, because it describes this person's sessions.

`~/.fab/runs/r_20261016_7f3a9c.json`:

```json
{
  "id": "r_20261016_7f3a9c",
  "fab": "/Users/kat/dev/invoice-service",
  "fabCommit": "a1b2c3d",
  "program": "log-bug",
  "inputs": { "what": "The invoice total shows 0 after a refund", "where": "https://app.example.com/invoices/INV-2041", "reporter": "kat" },
  "harness": "claude-code",
  "worktree": "/Users/kat/dev/invoice-service",
  "branch": "main",
  "session": { "id": "5e0c…", "match": "exact" },
  "startedBy": "monitor",
  "startedAt": "2026-10-16T09:12:04Z",
  "state": "working"
}
```

- `fabCommit` is the commit of `.fab/` when the run started. It shows which version of the program the session followed.
- `session.match` is `exact` when the harness gave the session ID at launch, `transcript` when the monitor found the `fab-run:` line, and `pending` until one of those happens.
- If a launch fails after the record is written, the record says `state: failed` with the reason. It is never deleted.

## The `fab` skill

`fab install` installs one skill of its own, `fab`, into every harness. It tells an agent:

- that this repository has a fab, and that `AGENTS.md` lists its programs;
- how to use the CLI: `fab list --json`, `fab create`, `fab check`, `fab run --dry-run`;
- how to design a fab with a team, as a conversation: how work arrives, what it becomes, who decides what, which steps go wrong today, and which steps people want to start with one click. Start small: three to six programs, then add more as the team uses them;
- the rule to edit `.fab/` and run `fab install`, never the installed copies;
- that a change to a program is a change for the whole team, so it goes in its own commit or PR.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | `fab check` found problems, or a part is missing |
| 2 | Input is missing and there is no terminal to ask in. The JSON names each missing input |
| 3 | The harness is not available (not installed, not signed in, or the app is not running) |
| 4 | The session started, but the monitor could not confirm it yet. The run record has `session.match: pending` |
