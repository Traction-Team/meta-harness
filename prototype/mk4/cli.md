# The `fab` CLI

The CLI does all of the work in Mark IV. The monitor is a view over it. Agents use it as much as people do. See [`overview.md`](overview.md) for the parts of a fab.

## Principles

- **Files are the truth.** The CLI reads and writes `.fab/` and the installed files. Where work is comes from the stage sources (files, Git, GitHub, Linear), never from a status fab writes. Machine state (run records, the spool, the index, the list of fabs) is in `~/.fab/`. The records fab shares with the team (scores, links, finished runs) go through the store: the git ledger in `refs/fab/ledger/*`, or Fab Cloud. They never hold where work is. See [`storage.md`](storage.md).
- **Never block an agent.** A command that makes a record writes it on the machine and returns. It does not use the network or write to Git. `fab sync` sends it later.
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
| `fab history <ref>` | Prints an artifact's history, newest first: each artifact and its stage, the job and run that made it, the scores it got there, and the kind of link (link record, trailer, link in artifact, PR diff, work key, found). Fan-out and fan-in print as a tree |
| `fab link <ref> [<ref> ...] [--from <ref>] [--job <job>]` | Leaves a breadcrumb: this session works from, or made, these artifacts. Agents call it as they work, as often as they like. fab adds the session, branch and the rest itself. See [Links](#links) |
| `fab score <scorer> --on <ref> [--harness <h>] [--model <m>]` | Runs one scorer on one artifact and writes a score record. Jobs end with this for each scorer on their `to` stage. It writes on the machine only, so it works in a sandbox with no network |
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
fab-run: r_20261017_02d7e4b19a0c

On: feat/context-packs-s2 · #412

When you are done, run:
fab score tech-debt --on "#412"
fab score tests --on "#412"
```

The `fab-run:` line is how the monitor finds a session in a transcript when the harness gives no session ID at launch. The `On:` line is how history links the run to its artifact.

Jobs whose output is a commit add a `Fab-From: <ref>` trailer to it, by their template. As the session works, the agent runs `fab link` for what it works from and what it makes (see [Links](#links)). When the session ends, or goes idle for a long time, fab writes the run's shared record (see [Records](#records)).

### Watch

| Command | Does |
| --- | --- |
| `fab status [--all] [--team] [--watch]` | Sessions in this fab (or in every registered fab with `--all`), each with its job, the artifact it is on, harness, state, worktree and age. `--team` adds teammates' sessions, from Fab Cloud's presence. `--watch --json` prints one JSON line for each change. The monitor reads this |
| `fab runs [--since 1d]` | Run records, including finished runs |
| `fab focus <run-id\|session>` | Brings the session to the front in its harness, where the harness allows it |
| `fab fabs add\|list\|remove [<path>]` | The fabs on this machine that the monitor shows. `fab init` and `fab install` add the current one |
| `fab monitor` | Opens the monitor |

### Store

| Command | Does |
| --- | --- |
| `fab sync [--rebuild]` | Sends the records in the spool to the backend, gets teammates' new records, and adds them to the index. The monitor runs it about once a minute, and each command that makes a record starts one in the background. `--rebuild` makes the index again from the backend. See [`storage.md`](storage.md#sync) |
| `fab store` | The backend (`git` or `cloud`), this writer's ledger ref, the time of the last sync, how many records wait in the spool, and why the last sync failed, if it did |
| `fab login` / `fab logout` | Signs in to Fab Cloud, or out. Needed only when `fab.yaml` has `store: { kind: cloud }` |

## Links

`fab link` is how an agent leaves breadcrumbs as it works. There is no start and no end. A link only says "this session touched these artifacts, at this time".

```
fab link docs/plans/context-packs.md                          # it reads the plan
fab link feat/context-packs-s2                                # it made a branch
fab link "#412" --from "docs/plans/context-packs.md § S2"     # it opened a PR for the slice
fab link INV-2038                                             # the work is also about this ticket
```

- **Call it as you go.** It is cheap, and a link that is made again adds nothing. An agent does not wait until the work is "done", because in a chat that is seldom clear.
- **The agent passes only references.** `--from` says one artifact was made from another. `--job` names the job, if the agent follows one. Both are hints. Without them, fab works out the direction from the stages (see [History](overview.md#agent-links)).
- **fab adds the context.** It finds the session from its own process tree: it walks up to the harness process, then reads that harness's session file (for Claude Code, `~/.claude/sessions/<pid>.json` maps the process to its session ID). It also prints a `fab-run: <id>` line, which goes into the transcript, so the monitor can find the session in any harness. It adds the branch, the head commit, the worktree, the folder, the person, the harness, the version of `.fab/`, and the time. The agent never passes a session ID.
- **The first link makes a run.** A session that `fab run` or the monitor started already has a run record, and its links join it. A session that a person started by hand gets a run record at its first `fab link`, with `startedBy: agent`. From then on it is matched exactly, not guessed.
- **It writes on this machine only**, to the spool, and returns. It works in a sandbox with no network.
- **If a reference names nothing,** `fab link` still keeps it, as context on the run. With `--json` it says which references no stage found, and the closest matches, so an agent can correct a typo.

## Run records

A run record is written before the session starts, so a session is never started without one. A session that a person started by hand gets one at its first `fab link`. It lives on the machine, because it describes this person's sessions. When the run ends, a shorter shared part of it goes to the team (see [Records](#records)).

`~/.fab/runs/r_20261017_02d7e4b19a0c.json`:

```json
{
  "id": "r_20261017_02d7e4b19a0c",
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
- `output` lists what the session made, from its links, and the score record IDs. Each link is also a record of its own, so the steps go to the team as they happen.
- `startedBy` is `fab run`, `monitor` or `agent`. `agent` means the run record was made at the session's first `fab link`. Such a run has no `on` until the agent links something.
- `session.match` is `exact` when the harness gave the session ID at launch, `process` when `fab link` found it from its process tree, `transcript` when the monitor found the `fab-run:` line, and `pending` until one of those happens.
- If a launch fails after the record is written, the record says `state: failed` with the reason. It is never deleted.

## Records

Records are what fab shares with the team: scores, links and finished runs. A command that makes one writes it to the spool, `~/.fab/spool/<fab>/<id>.json`, adds it to the index, and returns. `fab sync` sends it to the store. See [`storage.md`](storage.md) for the store, the git ledger and Fab Cloud.

Every record has these fields:

- `id`: a letter for its kind (`s`, `l`, `r`), the date, and 12 random hex digits. Unique without coordination.
- `kind`: `score`, `link` or `run`.
- `by`: the person. Their GitHub login when `gh` is signed in, or else a short hash of `user.email`.
- `at`: when it was made.

A record never changes. A correction is a new record.

### Score records

```json
{
  "id": "s_20261017_8c21f0a93e1b",
  "kind": "score",
  "by": "sebkade",
  "at": "2026-10-17T07:40:11Z",
  "scorer": "tech-debt",
  "ref": "feat/context-packs-s2 · #412",
  "stage": "review",
  "anchor": "pr-head:9f3c2e1",
  "score": 7.1,
  "why": "One helper is copied from the export module instead of shared.",
  "run": "r_20261016_c41e0b7d2f91",
  "fabCommit": "4e1d9a2"
}
```

- `run` is the job run whose output was scored, so a low score points back to the job and the version of it that made the work.
- `anchor` is the version of the artifact that was scored: `blob:` for a file, `text:` for a slice or line, `head:` for a branch, `pr-head:` for a PR, `updated:` for a Linear issue. When the artifact's anchor today is different, `fab work` marks the score `stale`, and the monitor dims it.
- A score belongs to one artifact in one stage. fab does not add scores up across a history. `fab history` shows each step's scores, so a PR's problems can be read next to its plan's scores.
- A newer record for the same scorer, artifact and stage replaces the older one in `fab work`. `fab scores` keeps them all.

### Link records

```json
{
  "id": "l_20261017_5e07b2c4a19d",
  "kind": "link",
  "by": "sebkade",
  "at": "2026-10-17T11:02:37Z",
  "run": "r_20261017_02d7e4b19a0c",
  "refs": ["feat/context-packs-s2 · #412"],
  "from": "docs/plans/context-packs.md § S2",
  "job": "build-slice",
  "branch": "feat/context-packs-s2",
  "head": "9f3c2e1",
  "fabCommit": "4e1d9a2"
}
```

- One record for each `fab link` call. `refs` are the references it named. `from` and `job` are there only when the agent gave them.
- `run` is what ties a session's links together. The session ID is not shared. It stays in the local run record.
- References are names, not commits, so a link still reads after a squash merge removes the branch's commits from main.

### Shared run records

When a session ends, or goes idle for a long time, fab writes a short record of its run for the team. A later turn in the same session writes a newer one, which replaces it. The worktree, the session ID and the inputs stay in the local run record.

```json
{
  "id": "r_20261017_02d7e4b19a0c",
  "kind": "run",
  "by": "sebkade",
  "at": "2026-10-17T11:02:37Z",
  "job": "build-slice",
  "harness": "claude-code",
  "startedBy": "agent",
  "startedAt": "2026-10-17T09:12:04Z",
  "lastActiveAt": "2026-10-17T11:01:50Z",
  "usage": {
    "model": "claude-opus-4",
    "inputTokens": 382104,
    "outputTokens": 27561,
    "cacheReadTokens": 1904220,
    "costUsd": 2.14,
    "byRef": { "docs/plans/context-packs.md § S2": 0.31, "feat/context-packs-s2 · #412": 1.83 }
  },
  "fabCommit": "4e1d9a2"
}
```

- It has the same ID as the local run record, so a teammate's score or link that names the run can be followed to it.
- What the run worked on and made comes from its link records, not from this record.
- `usage` comes from the session's transcript, read after the session goes idle: Claude Code's JSONL has the model and tokens on each message, Codex's rollout has token counts, and opencode's database has cost. Subagent transcripts count too. `costUsd` is an estimate from a price table in fab. On a subscription it is what the tokens would cost, not a bill.
- `byRef` splits the cost between the artifacts the session linked. The tokens between one link and the next go to the artifacts linked in that time. The monitor adds these up for an artifact across runs ("$2.10 across 2 sessions").

## The `fab` skill

`fab install` installs one skill of its own, `fab`, into every harness. It tells an agent:

- that this repository has a fab, and that `AGENTS.md` lists its jobs and stages;
- how to use the CLI: `fab work --json` to see where work is, `fab run --dry-run`, `fab score`, `fab create`, `fab check`;
- how to design a fab with a team, as a conversation: where work already lives (files, branches, PRs, tickets), what stages it passes through, which jobs move it, how to judge it at each stage, who decides what, and which steps go wrong today. Start small: four to eight stages, one job between each pair, and one or two scorers where quality matters most;
- the rule to edit `.fab/` and run `fab install`, never the installed copies;
- that a change to a job is a change for the whole team, so it goes in its own commit or PR;
- to run `fab link` as it works, for each file, plan, branch, PR or ticket it works from or makes, and not to wait until the work is done;
- that `fab score` and `fab link` only write on this machine, and fab syncs them. An agent never pushes `refs/fab/*` itself, and never commits records to a branch.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | `fab check` found problems, or a part is missing |
| 2 | Input is missing and there is no terminal to ask in. The JSON names each missing input |
| 3 | The harness is not available (not installed, not signed in, or the app is not running) |
| 4 | The session started, but the monitor could not confirm it yet. The run record has `session.match: pending` |
| 5 | A stage source could not be read (no `gh` login, no Linear token, no network) |
| 6 | `fab sync` or `fab login` could not reach the store (no network, a push refused by the host, not signed in to Fab Cloud). Records stay in the spool, and the next sync sends them. Commands that make records never return this |
