# meta-harness

This repository builds **Metafab**: the `metafab` CLI, published as `@seasb/metafab`. It records a software factory in `.factory/`, installs it for agent tools, validates it, and shares it as a fab.

## Read first

- `docs/specs/`: what v1 does. The specs are the acceptance standard for every change.
- `docs/roadmap.md`: where we are. One checkbox per plan; it is the source of truth for progress.
- `docs/plans/`: how each piece is built. One plan is one pull request.
- `mark-one/`, `mark-two/`, `mk3/`, `mk4/`, and `assets/` are earlier prototypes and material. Do not read or change them unless the person asks.

## Commands

Plan 01 creates the package. Until it merges there is nothing to build or test.

```bash
npm install
npm run verify          # typecheck, tests, build: run before every push
node dist/cli.js <cmd>  # the CLI from this checkout
node .factory/scripts/check.mjs   # validates .factory/, plans, roadmap, intake and changelog
node .factory/scripts/next.mjs    # plans that can be built next
```

## Rules

- **Specs first.** When the code has to differ from a spec, change the spec in the same pull request and say so in its body. Never let them drift.
- **One plan, one pull request.** Change only the paths in the plan's `owns`; widen `owns` in the plan when you must, and say why.
- Conventional Commits with no scope: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `ci`, `build`. Branches are `<type>/<slug>`.
- Code reaches `main` only through a pull request. Docs-only changes (`docs/`, and `.factory/` except `.factory/scripts/`) may be committed straight to `main`; see "Publishing docs changes".
- Sub-agents run as `subagent_type: "agent-coding"`, defined in `opencode.json`, even when the Agent tool does not list it.
- Run child processes with `execFile` and an argument list, never through a shell.
- Tests use temporary directories and local fixtures (a local registry, local bare Git repositories). No test reaches the network.

## Factory workflows

Delivery work runs through these workflows. Each is installed as a skill. When a request matches a row, load that workflow and follow it; do not do the work freehand. If two rows match, say which you chose and why in one line. If none matches, answer directly. The whole process is in `.factory/README.md`.

| Workflow | When to run it |
|---|---|
| `file-work` | A bug, idea, follow-up, spec gap or any "we should...". Also every *Found while building* note before its pull request merges |
| `prioritise-roadmap` | "What's next", re-ordering the roadmap, reviewing intake or open questions |
| `plan-feature` | "Plan <thing>", a roadmap line with no plan, or a bug too big for a bug plan |
| `start-plan` | On `main`: "start the next plan", "pull the next chunk", "keep going", "what's ready". The orchestrator: one Orca worktree and OpenCode worker per plan |
| `build-plan` | On a feature branch, usually as a worker in an Orca worktree: "build docs/plans/<plan>.md". Stops at a draft pull request |
| `review-branch` | After any implementation, always in a new sub-agent. "Cold review this branch" |
| `finish-plan` | On a plan's branch: testing feedback, "looks good", review comments, "land it" |

## Publishing docs changes

When the person asks you to save, publish, commit or push docs changes (`docs/`, or `.factory/` outside `scripts/`), do the round trip yourself:

```bash
git switch main && git pull --ff-only
git add docs/<files> .factory/<files>
git diff --cached --name-only | grep -vE '^(docs|\.factory)/'   # must print nothing
git diff --cached --name-only | grep '^\.factory/scripts/'      # must print nothing: scripts are code and go in a pull request
node .factory/scripts/check.mjs                                 # fix what it reports
git commit -m "docs: <what changed>"
git push
```

If anything outside `docs/` and `.factory/` (or inside `.factory/scripts/`) is staged, it goes in a pull request instead.
