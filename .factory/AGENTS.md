# meta-harness

This repository builds **Metafab**: the `metafab` CLI, published as `@seasb/metafab`. It records a software factory in `.factory/`, installs it for agent tools, validates it, and shares it as a fab.

## Read first

- `docs/specs/`: what v1 does. The specs are the acceptance standard for every change.
- `docs/roadmap.md`: where we are. One checkbox per plan; it is the source of truth for progress.
- `docs/plans/`: how each piece is built. One plan is one pull request.
- `prototype/`, and `assets/` are earlier prototypes and material. Do not read or change them unless the person asks.

## Commands

```bash
npm install
npm run verify          # typecheck, tests, build, factory: run before every push
npm run factory         # metafab build and check, then the docs check; fails when the AGENTS.md block is stale
node dist/cli.js <cmd>  # the CLI from this checkout
node .factory/scripts/check.mjs   # validates plans, roadmap, intake and changelog
node .factory/scripts/next.mjs    # plans that can be built next
```

In this repository `metafab` is `node dist/cli.js`: run `npm run build` first.

## Rules

- **Specs first.** When the code has to differ from a spec, change the spec in the same pull request and say so in its body. Never let them drift.
- **One plan, one pull request.** Change only the paths in the plan's `owns`; widen `owns` in the plan when you must, and say why.
- Conventional Commits with no scope: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `ci`, `build`. Branches are `<type>/<slug>`. A plan's branch carries its number: `<type>/<plan file name without .md>`, such as `feat/1.005-check`.
- Code reaches `main` only through a pull request. Docs-only changes (`docs/`, `.factory/` except `.factory/scripts/`, and the root `AGENTS.md` block that `.factory/` generates) may be committed straight to `main`; see "Publishing docs changes".
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
| `review-plan` | After writing plans, always in a new sub-agent. "Cold review this plan", "poke holes in this plan" |
| `start-plan` | On `main`: "start the next plan", "pull the next chunk", "keep going", "what's ready". The orchestrator: one Orca worktree and OpenCode worker per plan |
| `build-plan` | On a feature branch, usually as a worker in an Orca worktree: "build docs/plans/<plan>.md". Stops at a merge-safe draft pull request (landing included) and a TL;DR |
| `review-branch` | After any implementation, always in a new sub-agent. "Cold review this branch" |
| `finish-plan` | On a plan's branch, after the TL;DR: testing feedback, "looks good", review comments, "land it" |

## Publishing docs changes

When the person asks you to save, publish, commit or push docs changes (`docs/`, or `.factory/` outside `scripts/`), do the round trip yourself:

```bash
git switch main && git pull --ff-only
npm run build && node dist/cli.js build                         # regenerates the root blocks from .factory/
git add docs/<files> .factory/<files> AGENTS.md                 # stage the regenerated root block too
git diff --cached --name-only | grep -vE '^(docs/|\.factory/|AGENTS\.md$)'   # must print nothing
git diff --cached --name-only | grep '^\.factory/scripts/'      # must print nothing: scripts are code and go in a pull request
node .factory/scripts/check.mjs                                 # fix what it reports
npm run factory                                                 # builds and checks; passes once the regenerated root block is staged
git commit -m "docs: <what changed>"
git push
```

A docs-only commit runs `node .factory/scripts/check.mjs`. A change to `.factory/` must also run `npm run factory`, because the `AGENTS.md` block is committed: an edit that changes it regenerates root `AGENTS.md`, which is staged with its source and is part of the same docs commit.

If anything outside `docs/`, `.factory/` (except `.factory/scripts/`) and the `AGENTS.md` block the build regenerates is staged, it goes in a pull request instead.
