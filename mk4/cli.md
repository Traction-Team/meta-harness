# The `fab` CLI

The CLI does all of the work in Mark IV. The monitor is a view over it. Agents use it as much as people do. See [`overview.md`](overview.md) for the parts of a fab.

## Principles

- **Files are the truth.** The CLI reads and writes `.fab/` and the installed files. Where work is comes from the stage sources (files, Git, GitHub, Linear), never from a status fab writes. Machine state (run records, score records, the list of fabs) is in `~/.fab/`. The one thing fab adds to the repository outside `.fab/` is git notes in `refs/notes/fab`. They link history: which run made which artifact from which. They never hold where work is.
- **Agents are first-class users.** Every command has `--json`. When stdin is not a terminal, no command waits for input. It fails with a JSON list of what is missing instead.
- **Create, then edit.** `fab create` writes a correct scaffold and prints its path. The agent or person then edits the file directly. The CLI does not try to be an editor for job text.
- **Exact problems.** `fab check` prints each problem with `file:line` and the fix, so an agent can correct it without a second guess.
- **Run again safely.** `fab install` and `fab check` can run any number of times. They change only what is out of date.

## Commands

### Set up

| Command | Does |
| --- | --- |
| `fab init [--template <name\|path\|url>] [--import <dir>]` | Creates `.fab/` with `fab.yaml`, an empty `AGENTS.md`, and the folders. `--template` starts from a shared fab. `--import .factory` converts a Dragonfly-style folder |
| `fab install [--local] [--runtime <harness>] [--uninstall]` | Writes the skill links, the `AGENTS.md` block, `CLAUDE.md`, and the runtime files. See [Install](overview.md#install) |
| `fab check` | Checks frontmatter; that every `from`, `to`, `next`, `scored-by` and `decides` names something that exists; that each stage's source can be read; that no two stages match the same artifact (a warning); and that installed files are current. Exit 1 on any problem |
| `fab doctor` | Checks the machine: which harnesses are installed and signed in, the terminal app, Orca, nodeterm, `gh` and Linear access for the stage sources, and whether each session adapter can read its files |

### Define

| Command | Does |
| --- | --- |
| `fab create stage <id> --find <source> [--where W] [--title T] [--next <job>] [--after <stage>]` | Adds a stage to `fab.yaml`, in flow order after `--after` |
| `fab create job <name> [--title T] [--from <stage>] --to <stage> [--takes one\|all] [--when W] [--description D] [--worktree new\|current]` | Writes `.fab/jobs/<name>/SKILL.md` from a template with the frontmatter filled in |
| `fab create scorer <name> --ask Q [--stage <id> ...]` | Writes `.fab/scorers/<name>/SKILL.md` and adds it to each stage's `scored-by` |
| `fab create skill <name>` | Writes `.fab/skills/<name>/SKILL.md` |
| `fab create rule <name>` | Writes `.fab/rules/<name>.md` |
| `fab create template <name>` | Writes `.fab/templates/<name>.md` |
| `fab create decision <name> --who W [--says S]` | Adds a decision to `fab.yaml` |
| `fab create runtime <harness>` | Writes `.fab/runtimes/<harness>.md` from the built-in version for that harness |
| `fab rename <kind> <old> <new>` | Renames, and updates every `from`, `to`, `next`, `scored-by` and `decides` that names it |
| `fab remove <kind> <name>` | Removes, and fails if something still names it (`--force` to remove anyway) |
| `fab list [stages\|jobs\|scorers\|skills\|rules\|decisions]` | Lists the parts. With `--json`, includes the frontmatter |
| `fab show <kind> <name>` | Prints one part, with what names it and what it names |
| `fab map [--format ascii\|mermaid\|json]` | Draws the flow: the stages in order, the job between each pair, the decisions and who each stage waits for |

### Work

| Command | Does |
| --- | --- |
| `fab work [<stage>] [--all] [--watch] [--hidden]` | Runs the stage filters, then hides each artifact that has a later artifact in its history. Lists each stage with its artifacts: title, reference, time in the stage, the agents on it, and its scores. `--hidden` also lists the hidden ones, with the later artifact that hides each. `--watch --json` prints one JSON line for each change. The monitor reads this |
| `fab history <ref>` | Prints an artifact's history, newest first: each artifact and its stage, the job and run that made it, the scores it got there, and the kind of link (note, trailer, link in artifact, PR diff, work key, found). Fan-out and fan-in print as a tree |
| `fab link <newer> <older> [--remove]` | Adds a link that fab did not find, or removes a wrong one. Writes a git note, so the fix goes to the team on the next push |
| `fab score <scorer> --on <ref> [--harness <h>] [--model <m>]` | Runs one scorer on one artifact and writes a score record. Jobs end with this for each scorer on their `to` stage |
| `fab scores [<stage>] [--since 30d]` | Score records. With a stage, the average of each scorer there over time |

A reference (`<ref>`) is what the stage source uses to name the artifact: a path, `path:line`, `path § S2`, a branch, `#412`, or `INV-2038`.

### Run

```
fab run <job> [--on <ref>] [--input name=value ...] [--harness <h>] [--worktree new|current] [--branch <name>] [--dry-run]
```

1. If the job takes one artifact, `--on` names it. Without `--on`, it picks the oldest artifact in the `from` stage that has no agent on it, and says which.
2. Reads the job's `inputs`. Asks each missing one in the terminal. Without a terminal, it fails with the list of missing inputs.
3. Chooses the harness: `--harness`, then the person's default in `~/.fab/config.yaml`, then `fab.yaml`'s default, then the first one `fab doctor` finds.
4. Writes the run record (see below).
5. Starts the session through the harness adapter, in the current worktree or a new one. See [`research/agent-sessions.md`](research/agent-sessions.md).
6. Prints the run ID, and where the session is.

`--dry-run` prints the prompt, the harness command and the run record, and starts nothing. Agents should use it before they start work for a person.

The opening prompt is plain text that any harness accepts:

```
Run the review-slice job (.fab/jobs/review-slice/SKILL.md).
fab-run: r_20261017_02d7e4

On: feat/context-packs-s2 · #412

When you are done, run:
fab score tech-debt --on "#412"
fab score tests --on "#412"
```

The `fab-run:` line is how the monitor finds a session in a transcript when the harness gives no session ID at launch. The `On:` line is how history links the run to its artifact.

Jobs whose output is a commit add a `Fab-From: <ref>` trailer to it, by their template. When the CLI sees the job's output land in the `to` stage, it writes a git note (see below).

## History notes

A history note is a git note in `refs/notes/fab`, on the commit that a job's output made. For output with no commit of its own (a PR opened on an existing branch, a Linear issue), the note goes on the head commit of the branch the session ran in.

```
fab-run: r_20261017_02d7e4
job: build-slice
on: docs/plans/context-packs.md § S2
made: feat/context-packs-s2 · #412
fab-commit: 4e1d9a2
```

- `on` and `made` name artifacts by reference, so the link still reads after a squash merge removes the branch's commits from main.
- A note made by `fab link` has `link:` or `unlink:` lines in place of `fab-run` and `job`, and the name of the person.
- More than one note on a commit is joined, one block after another.
- `fab install` adds `+refs/notes/fab:refs/notes/fab` to the remote's fetch and push refspecs, and sets `notes.rewriteRef = refs/notes/fab`, so notes travel with push and pull and survive a rebase or an amend.
- fab reads every note once and keeps an index in `~/.fab/`. Notes are small, so this is fast.

### Watch

| Command | Does |
| --- | --- |
| `fab status [--all] [--watch]` | Sessions in this fab (or in every registered fab with `--all`), each with its job, the artifact it is on, harness, state, worktree and age. `--watch --json` prints one JSON line for each change. The monitor reads this |
| `fab runs [--since 1d]` | Run records, including finished runs |
| `fab focus <run-id\|session>` | Brings the session to the front in its harness, where the harness allows it |
| `fab fabs add\|list\|remove [<path>]` | The fabs on this machine that the monitor shows. `fab init` and `fab install` add the current one |
| `fab monitor` | Opens the monitor |

## Run records

A run record is written before the session starts, so a session is never started without one. It lives on the machine, not in the repository, because it describes this person's sessions.

`~/.fab/runs/r_20261017_02d7e4.json`:

```json
{
  "id": "r_20261017_02d7e4",
  "fab": "/Users/seb/dev/dragonfly",
  "fabCommit": "4e1d9a2",
  "job": "review-slice",
  "on": { "stage": "review", "ref": "feat/context-packs-s2 · #412" },
  "to": "merge",
  "inputs": {},
  "harness": "codex",
  "worktree": "/Users/seb/orca/workspaces/dragonfly/context-packs-s2",
  "branch": "feat/context-packs-s2",
  "session": { "id": "019a…", "match": "transcript" },
  "startedBy": "monitor",
  "startedAt": "2026-10-17T09:12:04Z",
  "state": "working",
  "output": null
}
```

- `fabCommit` is the commit of `.fab/` when the run started. It shows which version of the job the session followed.
- `on` is the artifact the job works on. A job that starts new work has none.
- `output` is filled in when the CLI sees the job's result land in the `to` stage: the new reference, and the score record IDs. `on` and `output` together are one step of history. At the same time the CLI writes the history note, so the step is shared with the team and not only kept on this machine.
- `session.match` is `exact` when the harness gave the session ID at launch, `transcript` when the monitor found the `fab-run:` line, and `pending` until one of those happens.
- If a launch fails after the record is written, the record says `state: failed` with the reason. It is never deleted.

## Score records

`~/.fab/scores/s_20261017_8c21f0.json`:

```json
{
  "scorer": "tech-debt",
  "ref": "feat/context-packs-s2 · #412",
  "stage": "review",
  "score": 7.1,
  "why": "One helper is copied from the export module instead of shared.",
  "run": "r_20261016_c41e0b",
  "fabCommit": "4e1d9a2",
  "at": "2026-10-16T07:40:11Z"
}
```

- `run` is the job run whose output was scored, so a low score points back to the job and the version of it that made the work.
- A score belongs to one artifact in one stage. fab does not add scores up across a history. `fab history` shows each step's scores, so a PR's problems can be read next to its plan's scores.
- A newer record for the same scorer, artifact and stage replaces the older one in `fab work`. `fab scores` keeps them all.

## The `fab` skill

`fab install` installs one skill of its own, `fab`, into every harness. It tells an agent:

- that this repository has a fab, and that `AGENTS.md` lists its jobs and stages;
- how to use the CLI: `fab work --json` to see where work is, `fab run --dry-run`, `fab score`, `fab create`, `fab check`;
- how to design a fab with a team, as a conversation: where work already lives (files, branches, PRs, tickets), what stages it passes through, which jobs move it, how to judge it at each stage, who decides what, and which steps go wrong today. Start small: four to eight stages, one job between each pair, and one or two scorers where quality matters most;
- the rule to edit `.fab/` and run `fab install`, never the installed copies;
- that a change to a job is a change for the whole team, so it goes in its own commit or PR.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | `fab check` found problems, or a part is missing |
| 2 | Input is missing and there is no terminal to ask in. The JSON names each missing input |
| 3 | The harness is not available (not installed, not signed in, or the app is not running) |
| 4 | The session started, but the monitor could not confirm it yet. The run record has `session.match: pending` |
| 5 | A stage source could not be read (no `gh` login, no Linear token, no network) |
