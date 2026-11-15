# Repository settings

The workflows and scripts read this file. Fill in every `<set me>` value; leave a value empty to turn that feature off. The table is a Markdown table: edit the Value column only, and escape a literal `|` in a command as `\|`.

| Setting | Value | Meaning |
| --- | --- | --- |
| `trunk` | `main` | Branch plans start from and merge into. |
| `verify` | `npm run verify` | Command that proves a branch green, such as `npm test`. |
| `setup` | `npm install && npm run build && node dist/cli.js build` | Command a new worktree runs before its first check. |
| `metafab` | `node dist/cli.js` | How to run Metafab in this repository. |
| `agent` | `opencode` | Agent a worker is started with in a worktree. |
| `orca-repo` | `id:ea0f45bd-7c49-42b2-9fb8-1c280896e7c4` | `--repo` for `orca worktree create`; empty means `git worktree add`. |
| `sub-agent-coding` | `agent-coding` | Sub-agent that builds tasks and fixes. |
| `sub-agent-review` | `agent-review` | Sub-agent that reviews plans and branches. |
| `sub-agent-planning` | `agent-planning` | Sub-agent that plans. |
| `amp-model-coding` | `deepseek/deepseek-v4.1-flash` | Model for a task or fix thread; empty keeps the thread's own mode. |
| `amp-model-review` | `openai/gpt-6.1-sol` | Model for a review thread; empty keeps the thread's own mode. |
| `specs` | `docs/specs` | Specs directory; empty skips the spec steps. |
| `plans` | `docs/plans` | Where plans live. |
| `plan-names` | `numbered` | `numbered` (`<round>.<NNN>-<slug>.md`) or `dated` (`YYYY-MM-DD-[<code>-<n>-]<slug>.md`). |
| `roadmap` | `docs/roadmap.md` | The roadmap `prioritise-roadmap` writes and `start-plan` reads. |
| `roadmap-max-lines` |  | Most open roadmap lines; empty means no limit. |
| `intake` | `docs/intake` | Where intake notes and their sightings folders live. |
| `changelog` | `docs/changelog` | Where changelog entries live. |
| `features` |  | Feature docs directory; empty turns feature docs and plan codes off. |
| `stacking` | `off` | `on`: a plan whose need is still building stacks on its branch; `off`: it waits for the need to merge. |
| `review-bots` |  | Comment that asks a bot to review, such as a bot handle plus `review`. |
| `docs-changes` | `direct` | `direct` pushes docs to the trunk; `pull-request` opens a docs pull request. |
| `approvers` |  | Who approves, quoted by the workflows. |
| `check-changed` |  | Command that checks only what changed; empty means `verify`. |
| `test-file` |  | Command for one test file, with `<path>`; empty means sub-agents run `verify`. |
| `dev-server` |  | Command that serves the app for screenshots; empty skips them. |
| `release` | `off` | `on`: the `release` workflow merges the trunk into the release branch. |
| `release-branch` | `production` | Branch a release merges into; must differ from `trunk`. |
| `release-guide` | `docs/releasing.md` | Repository doc the release workflow follows for deploys, hotfixes and repairs. |
| `release-risky-paths` | `none` | Comma-separated path prefixes the release lists as risky; `none` lists nothing. |
| `release-announce` | `none` | Where the release's team update is posted; `none` leaves the section out. |

Notes on this repository go below the table. The file is never overwritten by an update, so these notes stay yours.

## Notes

`@seasb/metafab` is published, and this repository depends on it (`^1.0.0` in `devDependencies`), so `npm install` puts `metafab` in `node_modules/.bin` and the Git hooks use that copy. The repository's own scripts still build with this checkout: `npm run factory`, the `setup` setting and `orca.yaml` all run `node dist/cli.js`, so a change to the CLI is tested by the checkout that contains it. Run `npm run build` first, and `npm link` once if you want a `metafab` on `PATH`.

Hooks are on (`git-hooks: true` in `.factory/metafab.yaml`). `post-checkout`, `post-merge` and `post-rewrite` run `metafab build` after a branch switch, a merge or pull, and a rebase, so `.claude/skills/` and `.agents/skills/` follow `.factory/` with no manual step. A fresh clone has no hooks until its first `npm install && npm run factory`. A new worktree has no `node_modules/` yet, so its hook needs `metafab` on `PATH` (`npm link`) to build it: the `npx` fallback cannot, because this repository is itself `@seasb/metafab` and `npx` resolves the unbuilt local copy.

A new Amp orb builds through `.agents/setup`, which installs dependencies with `npm ci`, builds `dist/` and runs `node dist/cli.js build`, so a fresh Amp thread has every workflow installed as a skill. A new Orca worktree builds through the `setup` setting above, which runs the same three commands. That only works once the per-repository setup command in Orca's repository settings (today `npm install`) is cleared, because it overrides the committed `orca.yaml`; clear it once per machine. Until then, run `npm run build && node dist/cli.js build` in the new worktree by hand.

An Amp orb sets a global `core.hooksPath` (`/home/user/.config/git/hooks` in `~/.gitconfig`), so `metafab build` installs no hooks there and warns once, as [building.md, Git hooks](specs/building.md#git-hooks) says. A new orb still gets its skills from `.agents/setup`, but a branch switch or pull inside the orb does not rebuild them: run `node dist/cli.js build` after one. To prove the hooks in an orb, run with `GIT_CONFIG_GLOBAL=/dev/null`.
