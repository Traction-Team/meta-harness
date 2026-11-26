# Repository settings

The workflows and scripts read this file. Fill in every `<set me>` value; leave a value empty to turn that feature off. The table is a Markdown table: edit the Value column only, and escape a literal `|` in a command as `\|`.

| Setting | Value | Meaning |
| --- | --- | --- |
| `trunk` | `main` | Branch plans start from and merge into. |
| `verify` | `<set me>` | Command that proves a branch green, such as `npm test`. |
| `setup` |  | Command a new worktree runs before its first check. |
| `metafab` | `npx --yes @seasb/metafab` | How to run Metafab in this repository. |
| `agent` | `opencode` | Agent a worker is started with in an Orca worktree. |
| `orca-repo` |  | `--repo` for `orca worktree create`; empty means `git worktree add`. |
| `sub-agent-coding` | `agent-coding` | Sub-agent that builds tasks and fixes. |
| `sub-agent-review` | `agent-review` | Sub-agent that reviews plans and branches. |
| `sub-agent-planning` | `agent-planning` | Sub-agent that plans. |
| `amp-model-coding` |  | Model for a task or fix thread; empty keeps the thread's own mode. |
| `amp-model-review` |  | Model for a review thread; empty keeps the thread's own mode. |
| `specs` |  | Specs directory; empty skips the spec steps. |
| `plans` | `docs/plans` | Where plans live. |
| `plan-names` | `dated` | `numbered` (`<round>.<NNN>-<slug>.md`) or `dated` (`YYYY-MM-DD-[<code>-<n>-]<slug>.md`). |
| `roadmap` | `docs/roadmap.md` | The roadmap `prioritise-roadmap` writes and `start-plan` reads. |
| `roadmap-max-lines` |  | Most open roadmap lines; empty means no limit. |
| `intake` | `docs/intake` | Where intake notes and their sightings folders live. |
| `changelog` | `docs/changelog` | Where changelog entries live. |
| `features` |  | Feature docs directory; empty turns feature docs and plan codes off. |
| `stacking` | `off` | `on`: a plan whose need is still building stacks on its branch; `off`: it waits for the need to merge. |
| `review-bots` |  | Comment that asks a bot to review, such as a bot handle plus `review`. |
| `docs-changes` | `pull-request` | `direct` pushes docs to the trunk; `pull-request` opens a docs pull request. |
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
