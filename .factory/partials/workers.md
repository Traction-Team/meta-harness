Each worker gets a workspace of its own and the same brief: the first thing it reads, written for a session with no other context. Name the plan and nothing about how to build it. The worker reads the plan itself.

<!-- factory:switch env.workspace -->
<!-- factory:case orca -->
Create each worker's worktree with Orca:

```bash
orca worktree create --name <type>/<plan-file-stem> \
  --repo <orca-repo> \
  --base-branch <base> --no-parent --setup run \
  --agent <agent> --prompt "<brief>" --json
```

- **`--repo` is `orca-repo`.** It is required, because Orca otherwise infers the repository from the caller's worktree, and a plain checkout infers nothing or the wrong one. When it is empty, this repository has selected the wrong workspace: say so and stop.
- **`--base-branch`** is `origin/<trunk>`, or `origin/<branch below>` for a stacked plan. Always use the remote ref: Orca records it as the worktree's base, and the Orca board can only rebase against a remote ref.
- **`--name`** sets the display name, and Orca derives the branch from it: it flattens the slash and adds the git user, so `--name feat/1.005-check` gives the branch `<git user>/feat-1.005-check`. There is no flag for the branch. The worker renames it to `<type>/<plan-file-stem>` in `build-plan` step 0, before the claim.
- **`--agent`** is the `agent` setting. When it is empty, start the session with the harness the person names, or the one their environment shows (`printenv OPENCODE CLAUDECODE`). Do not override it.
- **`--setup run`** runs the repository's setup hook in the new checkout. `--no-parent` is deliberate: each plan is independent work.

The brief:

```text
You are the worker for <plans>/<plan>.md (<label>), in your own worktree.
Load the build-plan workflow and build <plans>/<plan>.md. You are the worker:
step 0 renames this branch to <type>/<plan-file-stem> before the claim.
<Stacked on <branch> (#<pr>).> The trunk was proved green at <sha>; do not re-run the baseline.
Start every sub-agent as the sub-agents section of build-plan says.
End with build-plan's TL;DR as your final message.
```

From the JSON, keep `result.path` and `result.agentTerminalHandle` (an older runtime returns only `result.startupTerminal.handle`). Step 6 reports both.

<!-- factory:case orb -->
Create each worker with `create_thread`, all of them in one turn:

- `executor`: `orb`. Leave `project` unset (it defaults to this one) and the model unset, so the worker keeps this thread's mode.
- `intent`: `parallel-work`. `title`: `<label> <plan-file-stem>`, such as `A1 1.020-cli-fixes`.
- `prompt`: the brief below.

A fresh orb checks out the repository's default branch and runs the repository's orb setup script when it has one, so the worker starts on the trunk with the skills installed and nothing to set up, and it creates the plan's branch itself.

```text
You are the worker for <plans>/<plan>.md (<label>), in your own orb.
Create the plan's branch first: git fetch origin && git switch -c <type>/<plan-file-stem> <base>
Then load the build-plan workflow and build <plans>/<plan>.md on that branch.
<Stacked on <branch> (#<pr>).> The trunk was proved green at <sha>; do not re-run the baseline.
Start every sub-agent as the sub-agents section of build-plan says; create no other threads.
End with build-plan's TL;DR as your final message.
```

`<base>` is `origin/<trunk>`, or `origin/<branch below>` for a stacked plan. The plan's stem is its file name without `.md`; take the type from the plan's title.

Do not ask the workers to reply to this thread and do not wait for them: each worker's TL;DR is in its own thread, where the developer reviews it. Keep each thread URL; step 6 reports them.

<!-- factory:case worktree -->
Create each worker's worktree beside this checkout:

```bash
git worktree add ../<repository directory name>-<branch with / as -> -b <branch> <base>
```

The path is derived, with no setting: the repository directory's name, a dash, then the branch with every `/` turned into `-`. Run the setup command in the new worktree, then show the person the `cd` and the agent command that starts the session, with the brief below. Say in the report that no setup hook ran.

The brief:

```text
You are the worker for <plans>/<plan>.md (<label>), in your own worktree.
Load the build-plan workflow and build <plans>/<plan>.md on <branch>.
<Stacked on <branch> (#<pr>).> The trunk was proved green at <sha>; do not re-run the baseline.
Start every sub-agent as the sub-agents section of build-plan says.
End with build-plan's TL;DR as your final message.
```
<!-- factory:endswitch -->
