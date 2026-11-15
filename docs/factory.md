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

`metafab` is `node dist/cli.js` here, from this checkout, until `@seasb/metafab` is on npm ([plan 1.012](plans/1.012-release.md)). Run `npm run build` first, and `npm link` once if you want a `metafab` on `PATH`.

Hooks are off for now (`git-hooks: false` in `.factory/metafab.yaml`). They look for `metafab` in `node_modules/.bin`, on `PATH` and through `npx`, and this checkout's CLI is none of those until 1.012, so a hook would fail in every fresh checkout. After a checkout, merge or rebase that changes `.factory/`, run `node dist/cli.js build` yourself, or `npm run factory` for the build and both checks. Plan 1.012 turns the hooks on.

A new Amp orb builds through `.agents/setup`, which installs dependencies with `npm ci`, builds `dist/` and runs `node dist/cli.js build`, so a fresh Amp thread has every workflow installed as a skill. A new Orca worktree builds through the `setup` setting above, which runs the same three commands. That only works once the per-repository setup command in Orca's repository settings (today `npm install`) is cleared, because it overrides the committed `orca.yaml`; clear it once per machine. Until then, run `npm run build && node dist/cli.js build` in the new worktree by hand.
