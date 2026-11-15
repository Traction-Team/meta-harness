# Verification record

Metafab installs files for agent tools but never runs them (README: Deferred features, "Runtime verification of agent behaviour").
This file records the checks a person or agent made against real tools and operating systems before a release.
Add a row when you check something again. Do not edit an old row; add a new one with the new date.

Result is one of: `pass`, `fail`, `partial`, `pending`, `not run`. Every `fail` or `partial` links the intake note filed for it. `pending` means a person still has to run the check; `not run` gives the reason.

## How the test repository is made

```sh
npm run build
npm pack --pack-destination "$TMPDIR"                    # seasb-metafab-<version>.tgz
mkdir "$TMPDIR/mh-verify" && cd "$TMPDIR/mh-verify"
git init && npm init -y
npm install --save-dev "$TMPDIR/seasb-metafab-<version>.tgz"
cp -R <checkout>/test/fixtures/build/mark4-like/source/.factory .
cp <checkout>/test/fixtures/build/mark4-like/source/CLAUDE.md .
printf 'agents: all\ngit-hooks: true\n' > .factory/metafab.yaml
npx metafab build
git add -A && git commit -m "scratch factory"
```

`agents: all` selects `claude` and every `.agents/skills/` target, so every tool sees both directories, which is the duplicate case. A second repository with `agents: [claude]` and a third with `agents: [codex]` are the controls.

On Windows, the same steps run in PowerShell with `$env:TEMP` and `Copy-Item -Recurse`. The agent tool then opens a second clone made with `git clone -c core.autocrlf=true`, so it reads a CRLF checkout.

## Agent tools

The checks below ran on 2026-11-15 against the CLI built from `chore/1.022-verification`, packed with `npm pack` and installed from the tarball, as [Decisions](plans/1.022-verification.md#decisions) requires. Each scratch repository also has a `.gitignore` with `node_modules/`, so the tarball's dependencies are not committed. Every agent call ran headless with a 300 s timeout, except A6 with Codex, which had 900 s.

| Tool | Version | OS | Date | Steps | Result | Notes / finding |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | `2.1.311 (Claude Code)` | macOS 26.6.2 (25G83) | 2026-11-15 | A1 | pass | `claude -p "List the skills you can load, by name"` listed the nine factory skills under "Project (Mark4 factory)" — `file-work`, `triage-ideas`, `plan-feature`, `build-slice`, `review-slice`, `finish-slice`, `git-conventions`, `metafab`, `security` — each once, alongside the user's own global skills. Pipeline question answered "The step after `plan-feature` is **`build-slice`**… I read it in the Pipeline list in `AGENTS.md`". With the `@AGENTS.md` block removed from `CLAUDE.md`: "I read it in `.factory/factory.yaml:9`, the pipeline source. The generated copy in `AGENTS.md:15` says the same." With `CLAUDE.md` deleted: "I read this in the project instructions file at the repository root, `AGENTS.md`, under the 'Pipeline' section." Claude Code reads `AGENTS.md` directly; the `@AGENTS.md` import is not required for the pipeline answer |
| Claude Code | `2.1.311 (Claude Code)` | macOS 26.6.2 (25G83) | 2026-11-15 | A6 | pass | `claude -p --dangerously-skip-permissions` with the release-notes prompt. Every pass condition held: `.factory/workflows/release-notes/SKILL.md` exists with `name` and `description`; `factory.yaml` lists `release-notes` after `finish-slice` (the agent used `metafab pipeline add`); `review-slices` became `review-slice`; `AGENTS.md` gained pipeline step 7, so `metafab build` ran; `npx metafab check` exited 0 ("0 errors, 0 warnings"). Installed copies were left to `build`: a second `metafab build --json` reported `changed: []`, and `git status` showed only `.factory/factory.yaml`, `AGENTS.md` and the new workflow directory. The repository was built once with a valid pipeline so the built-in `metafab` skill was installed, then `review-slices` was committed as the deliberate failure |
| Codex | `codex-cli 0.160.0` | macOS 26.6.2 (25G83) | 2026-11-15 | A2 | pass | `codex exec --sandbox read-only --ephemeral "List the skills you can load, by name"` listed the same nine skills from `.agents/skills/`, each once, plus the user's own global skills. Pipeline question: "`build-slice` — read in the AGENTS.md “Pipeline” section." |
| Codex | `codex-cli 0.160.0` | macOS 26.6.2 (25G83) | 2026-11-15 | A6 | pass | `codex exec --dangerously-bypass-approvals-and-sandbox` in the scratch directory with the same prompt. Every pass condition held, as for Claude Code: `SKILL.md` with `name` and `description`; `release-notes` after `finish-slice`; the `review-slices` typo fixed to `review-slice`; `AGENTS.md` at step 7, so `build` ran; `npx metafab check` exited 0; a second `build --json` reported `changed: []` and `git status` showed no edits beyond `.factory/` and `AGENTS.md` |
| opencode | `2.2.0` | macOS 26.6.2 (25G83) | 2026-11-15 | A3 | pass | `opencode run "List the skills you can load, by name"` in the `agents: all` repository listed each of the nine factory skills once, although both `.agents/skills/` and `.claude/skills/` hold a copy, plus the user's own global skills. The default model failed first: `anthropic/claude-fable-5-2` reported "Claude Code 2.1.280 does not support this model; version 2.1.290 or newer is required", so the check ran with `-m anthropic/claude-sonnet-5`. The failure is in this machine's model setup, not in what `build` writes. This confirms the sentence already in [Duplicate skills](specs/building.md#duplicate-skills) |
| Cursor | — | — | 2026-11-15 | A4 | pending | person, `finish-plan`: no headless mode |
| Copilot | — | — | 2026-11-15 | A5 | pending | person, `finish-plan`: VS Code with GitHub Copilot Chat in agent mode |

## Windows

The CI evidence would be the `hooks` job for W1 and the recipe test for W2 and W3. It did not run: GitHub Actions did not start any job on the pull request (see *CI recipe and hooks* for the run URL). These rows are `not run`, and the Windows branches are unverified. The local macOS evidence is in the rows below. W4 is a person's check during `finish-plan`.

| Check | Git for Windows / Node | OS | Date | Steps | Result | Notes / finding |
| --- | --- | --- | --- | --- | --- | --- |
| Hook rebuilds a new worktree through a global install | — | windows-latest | 2026-11-15 | W1 | not run | CI `hooks` job step G2, and the Windows branch is unverified: GitHub Actions did not start the job, account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15. G1–G3 were simulated locally on macOS and passed |
| A CRLF clone matches after `build` | — | windows-latest | 2026-11-15 | W2 | not run | `test/cli/ci-recipe.test.ts`, CRLF cases: the Windows branch is unverified, GitHub Actions did not start the job, account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15. The CRLF cases pass locally on macOS |
| A path with a space and non-ASCII letters | — | windows-latest | 2026-11-15 | W3 | not run | `test/cli/ci-recipe.test.ts`, `metafab recipe é-`, and the Windows long-path branch: unverified, GitHub Actions did not start the job, account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15. Both pass locally on macOS |
| Claude Code on Windows | — | Windows 11 | 2026-11-15 | W4 | pending | person, `finish-plan`, if a machine is available |

## CI recipe and hooks

| Check | Where | Date | Result | Notes / finding |
| --- | --- | --- | --- | --- |
| Spec CI recipe (LF checkout, `mark4-like`) | `test/cli/ci-recipe.test.ts` | 2026-11-15 | pass | 8 cases pass locally on macOS; the `verify` job on all three operating systems did not run (see the last two rows) |
| Spec CI recipe (CRLF with `eol=lf` lines) | `test/cli/ci-recipe.test.ts` | 2026-11-15 | pass | locally on macOS |
| Spec CI recipe (CRLF without `eol=lf` lines) | `test/cli/ci-recipe.test.ts` | 2026-11-15 | pass | locally on macOS |
| Hooks: D1–D4, project dependency | CI `hooks` job | 2026-11-15 | not run | GitHub Actions did not start the job: account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15. D1–D4 were simulated locally on macOS and passed |
| Hooks: G1–G3, global install | CI `hooks` job | 2026-11-15 | not run | GitHub Actions did not start the job: account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15. G1–G3 were simulated locally on macOS and passed |
| Real `npx` fallback | — | 2026-11-15 | not run | `@seasb/metafab@<version>` is not on npm until 1.0, and after 1.0 the check needs the network |
| CI runs only on ready pull requests and on `main` | `.github/workflows/ci.yml` | 2026-11-15 | pending | The trigger skips draft pull requests and cancels a superseded pull-request run, so the jobs run when the pull request is marked ready. Developer request: the Actions budget was going too fast. The evidence is the run started by marking the pull request ready |

## Error messages and exit codes

Checked on 2026-11-15 against the CLI built from `chore/1.022-verification`. The sites are every line matching `rg -n "new MetafabError\(|level: \"error\"|new NeedsInput\(" src`: 283 matches, of which one (`src/errors.ts:11`) is the `Problem` type declaration rather than an error site. The two named result-shape changes add rows of their own, so the table has 284 rows.

**Fix line** is `yes` when the error or its problems carry a `fix`, `no` when it does not, and `n/a` for exit 2, whose `required` list replaces the fix line. **Exit code** is the code the code path implies; **expected** is the code the [Exit codes](specs/cli.md#exit-codes) table implies. A `filed` row links the intake note that covers it: [EWP](intake/2026-11-15-errors-without-problems.md) for an error that carries no problems at all, [PNF](intake/2026-11-15-problems-without-fixes.md) for problems without a fix line.

Totals: 192 `ok`, 90 `filed`, 2 `fixed in this PR`. No site was a one-line fix in `src/cli.ts`, `src/output.ts`, `src/errors.ts`, `src/input.ts` or `src/commands/**` beyond the two named changes, so no other site was fixed here.

The message column quotes the code. `${…}` marks an interpolated value, and `message` names a message the local helper receives from its callers.

| Site (file:line) | Command | Message | Fix line | Exit code | Expected exit code | Verdict | Finding |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/core/init/targets.ts:26` | init | `message` | yes | 1 | 1 | ok | — |
| `src/core/init/targets.ts:30` | init | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/init/gitattributes.ts:93` | init | `message` | yes | 1 | 1 | ok | — |
| `src/core/init/gitattributes.ts:98` | init | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/init/run.ts:237` | init | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/init/run.ts:316` | init | `"Build stopped because the repository contains output that Metafab does not own."` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/init/run.ts:323` | init | `"Build failed after init."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/select.ts:44` | update, diff | `The recorded upstream is a ${kind} source, not an npm package or Git repository` | yes | 1 | 1 | ok | — |
| `src/core/update/select.ts:49` | update, diff | `The recorded upstream is a ${kind} source, not an npm package or Git repository` | yes | 1 | 1 | ok | — |
| `src/core/update/diff.ts:48` | update, diff | `This factory has no upstream to compare` | yes | 1 | 1 | ok | — |
| `src/core/update/diff.ts:53` | update, diff | `This factory has no upstream to compare` | yes | 1 | 1 | ok | — |
| `src/core/update/diff.ts:63` | update, diff | `"The factory configuration has problems."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/detach.ts:23` | update, diff | `"The factory configuration has problems."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/clashes.ts:56` | update, diff | `The update would replace ${file} with a different kind of entry` | yes | 1 | 1 | ok | — |
| `src/core/update/clashes.ts:65` | update, diff | `The update writes ${incoming}, but ${file} is a file` | yes | 1 | 1 | ok | — |
| `src/core/update/spelling.ts:43` | update, diff | `"Update stopped because local paths differ only in case and the incoming path does not mat` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:150` | update, diff | `This factory has no upstream to update` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:155` | update, diff | `This factory has no upstream to update` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:165` | update, diff | `"The factory configuration has problems."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/run.ts:173` | update, diff | `--to ${to} cannot select a version from an unversioned upstream` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:178` | update, diff | `--to ${to} cannot select a version from an unversioned upstream` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:188` | update, diff | `"Update stopped: resolve the conflicts from an earlier update first."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/run.ts:206` | update, diff | `The update stopped before it finished and could not restore .factory/` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:215` | update, diff | `The update stopped before it finished and could not restore .factory/` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:242` | update, diff | `"Update stopped because the incoming fab would replace local content."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/run.ts:253` | update, diff | `"Build stopped because the repository contains output that Metafab does not own."` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/run.ts:264` | update, diff | `"Build failed after update."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/update/run.ts:343` | update, diff | `Refusing to replace the directory ${file} with a file` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:348` | update, diff | `Refusing to replace the directory ${file} with a file` | yes | 1 | 1 | ok | — |
| `src/core/update/run.ts:1064` | update, diff | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/update/run.ts:1302` | update, diff | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/config/parse.ts:123` | all (config) | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/config/parse.ts:158` | all (config) | `Invalid YAML: Unresolved alias "${alias.source}".` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/config/parse.ts:186` | all (config) | `Invalid YAML: ${message}` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/config/validate.ts:77` | all (config) | `message` (argument of the local helper) | n/a | 1 | 1 | ok | — |
| `src/core/config/writers.ts:24` | all (config) | ``${file}: ${message}`` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/config/writers.ts:28` | all (config) | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/config/writers.ts:43` | all (config) | `The configuration must be a YAML map.` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/config/writers.ts:45` | all (config) | `The configuration must be a YAML map.` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/setup.ts:22` | init, import, update | `message` | yes | 1 | 1 | ok | — |
| `src/core/setup.ts:25` | init, import, update | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/setup.ts:113` | init, import, update | `"Build stopped because the repository contains output that Metafab does not own."` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/pipeline.ts:44` | pipeline | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/edit/pipeline.ts:52` | pipeline | `message` | yes | 1 | 1 | ok | — |
| `src/core/edit/factory-yaml.ts:27` | create, pipeline | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/edit/factory-yaml.ts:42` | create, pipeline | ``${file}: ${message}`` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/factory-yaml.ts:56` | create, pipeline | ``${file}: ${message}`` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/factory-yaml.ts:64` | create, pipeline | ``${file}: ${message}`` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/factory-yaml.ts:83` | create, pipeline | ``${file}: ${message}`` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/factory-yaml.ts:148` | create, pipeline | `"A pipeline entry must name a workflow."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/factory-yaml.ts:155` | create, pipeline | `"The pipeline stop must be a non-empty single line."` | yes | 1 | 1 | ok | — |
| `src/core/edit/factory-yaml.ts:164` | create, pipeline | ``Pipeline already contains "${workflow}".`` | yes | 1 | 1 | ok | — |
| `src/core/edit/factory-yaml.ts:179` | create, pipeline | ``Pipeline has no workflow "${options.after}".`` | yes | 1 | 1 | ok | — |
| `src/core/edit/factory-yaml.ts:222` | create, pipeline | ``Cannot remove "${workflow}" from the pipeline.`` | yes | 1 | 1 | ok | — |
| `src/core/edit/create.ts:24` | create | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/edit/create.ts:32` | create | `message` | yes | 1 | 1 | ok | — |
| `src/core/edit/paths.ts:13` | create | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/edit/paths.ts:24` | create | `"A path is required."` | yes | 1 | 1 | ok | — |
| `src/core/edit/paths.ts:32` | create | `message` | yes | 1 | 1 | ok | — |
| `src/core/edit/paths.ts:42` | create | `message` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/edit/paths.ts:53` | create | `message` | yes | 1 | 1 | ok | — |
| `src/core/edit/paths.ts:67` | create | `message` | yes | 1 | 1 | ok | — |
| `src/core/edit/paths.ts:77` | create | `nameProblems[0]!.message` | yes | 1 | 1 | ok | — |
| `src/core/publish/publish.ts:23` | publish | `The ${label} already has ${version} with different content.` | yes | 1 | 1 | ok | — |
| `src/core/publish/publish.ts:28` | publish | `The ${label} already has ${version} with different content.` | yes | 1 | 1 | ok | — |
| `src/core/publish/publish.ts:77` | publish | `'"publish.version" is required.'` | no | 1 | 1 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/publish/prepare.ts:20` | publish | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/publish/prepare.ts:47` | publish | `'"publish" is not configured.'` | yes | 1 | 1 | ok | — |
| `src/core/publish/prepare.ts:60` | publish | `'"publish" names no target.'` | yes | 1 | 1 | ok | — |
| `src/core/publish/prepare.ts:73` | publish | `'"publish.version" is required.'` | yes | 1 | 1 | ok | — |
| `src/core/publish/npm-target.ts:38` | publish | `redact(message)` | no | 1 | 1 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/publish/git-target.ts:72` | publish | `redact(message)` | no | 1 | 1 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/publish/git-target.ts:185` | publish | `Git cannot store ${file} in a fab` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:190` | publish | ``Git cannot store ${file} in a fab.`` | yes | 4 | 4 | ok | — |
| `src/core/publish/git-target.ts:214` | publish | `The Git target requires publish.git.` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:219` | publish | `The Git target requires publish.git.` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:309` | publish | `Git did not stage ${file}` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:315` | publish | `Git stored different bytes for ${file}` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:321` | publish | `Git staged ${file}, which the staged fab does not carry` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:332` | publish | `message` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/publish/git-target.ts:514` | publish | `The fab repository has no branch "${branch}".` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:519` | publish | ``The fab repository has no branch "${branch}".`` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:570` | publish | `The head of "${branch}" is not tagged by an earlier publish.` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:575` | publish | ``The Git fab repository branch "${branch}" was changed outside metafab publish.`` | yes | 5 | 5 | ok | — |
| `src/core/publish/git-target.ts:592` | publish | `Tag v${version} already exists in the fab repository.` | yes | 1 | 1 | ok | — |
| `src/core/publish/git-target.ts:599` | publish | `Tag v${version} already exists in the fab repository.` | yes | 1 | 1 | ok | — |
| `src/core/publish/stage.ts:69` | publish | `message` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/publish/stage.ts:78` | publish | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/publish/stage.ts:120` | publish | `Pipeline names excluded workflow "${entry.workflow}"` | yes | 1 | 1 | ok | — |
| `src/core/publish/package-json.ts:45` | publish | `The npm target requires "${key}".` | yes | 1 | 1 | ok | — |
| `src/core/publish/package-json.ts:50` | publish | `The npm target requires "${key}".` | yes | 1 | 1 | ok | — |
| `src/core/publish/readme.ts:16` | publish | `Cannot read file ${file}` | yes | 1 | 1 | ok | — |
| `src/core/publish/readme.ts:21` | publish | `Cannot read file ${file}` | yes | 1 | 1 | ok | — |
| `src/core/adopt.ts:123` | init | `Symlink ${linkPath} creates a loop after the move` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:132` | init | `Symlink ${linkPath} points outside .factory/ after the move` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:141` | init | `Cannot read ${relativePath}` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:150` | init | `message` (argument of the local helper) | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:161` | init | `Unowned file ${relativePath} is not part of a valid skill` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:170` | init | `Unowned entry ${relativePath} is a symbolic link, not part of a valid skill` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:179` | init | `Unowned directory ${relativePath} is not part of a valid skill` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:407` | init | `${skillFile} is not a regular file` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:419` | init | `Cannot read ${skillFile}` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:430` | init | `Unowned directory ${from} is not part of a valid skill: ${problem.message}` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:553` | init | `Skill "${name}" differs between ${left} and ${right}` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:562` | init | `Skill "${name}" already exists in .factory/` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:571` | init | `Skill "${name}" clashes with the built-in "${name}" skill that metafab build installs` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:580` | init | `Skill "${name}" already exists in the incoming fab` | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:607` | init | `message` (argument of the local helper) | yes | 5 | 5 | ok | — |
| `src/core/adopt.ts:623` | init | ``Adoption is blocked by ${count} ${count === 1 ? "entry" : "entries"}.`` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/adopt.ts:775` | init | `"Adoption cannot write into the factory directory."` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/adopt.ts:788` | init | ``Skill "${move.name}" already exists in .factory/.`` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:327` | import, update | `duplicate archive entry "${entryPath}" would replace earlier content` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:349` | import, update | `an entry whose path is an existing directory is not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:404` | import, update | `links could not be created: ${message}` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:485` | import, update | `links whose target does not exist are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:494` | import, update | `links that point outside the extraction root are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:522` | import, update | `links whose target does not exist are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:530` | import, update | `links that point outside the extraction root are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:542` | import, update | ``Cannot extract ${tarball}: ${message}`` | no | 4 | 4 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/extract.ts:550` | import, update | `"The archive is not a safe fab"` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:553` | import, update | `message` (argument of the local helper) | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:590` | import, update | `"The archive is not a safe fab"` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:610` | import, update | `message` (argument of the local helper) | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:615` | import, update | `message` (argument of the local helper) | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:630` | import, update | `links are not allowed at the extraction root` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:638` | import, update | `entries written through a symbolic link are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:648` | import, update | `links that point outside the extraction root are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:660` | import, update | `links that point outside the extraction root are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:672` | import, update | `message` (argument of the local helper) | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:677` | import, update | `unsupported archive entry type "${rawEntry.type}"` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:685` | import, update | `entries written through a symbolic link are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:732` | import, update | `"The archive is not a safe fab"` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/extract.ts:753` | import, update | `"The archive is not a safe fab"` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:27` | import, update | `redact(message)` | no | 3 | 3 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/path.ts:35` | import, update | ``Invalid fab from ${redact(sourceLabel)}`` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:96` | import, update | `links are not allowed in a fab` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:169` | import, update | `links could not be created: ${error instanceof Error ? error.message : String(error)}` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:185` | import, update | `links could not be created: ${error instanceof Error ? error.message : String(error)}` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:215` | import, update | `links whose target does not exist are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:224` | import, update | `links that point outside .factory are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:258` | import, update | `fabs with more than ${maxEntries} files, directories and links are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:284` | import, update | `links that point outside .factory are not allowed` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:304` | import, update | `device files and FIFOs are not allowed in a fab` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:316` | import, update | `files larger than ${MAX_FAB_FILE_SIZE} bytes are not allowed in a fab` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/path.ts:327` | import, update | `files larger than ${maxTotalSize} bytes in total are not allowed in a fab` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/parse.ts:40` | import, update | ``Invalid source "${redact(input)}": ${reason}`` | no | 1 | 1 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/parse.ts:195` | import, update | `message` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/parse.ts:198` | import, update | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/validate.ts:20` | import, update | ``Invalid fab from ${redact(sourceLabel)}`` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/validate.ts:30` | import, update | `Unknown factory format ${JSON.stringify(value)}` | yes | 4 | 4 | ok | — |
| `src/core/sources/validate.ts:100` | import, update | `A fab must contain a .factory directory` | yes | 4 | 4 | ok | — |
| `src/core/sources/npm.ts:68` | import, update | `redact(message)` | no | 3 | 3 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/npm.ts:265` | import, update | ``Invalid fab from ${label}`` | no | 4 | 4 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/npm.ts:270` | import, update | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/npm.ts:337` | import, update | ``Integrity check failed for ${tarball}`` | no | 4 | 4 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/npm.ts:346` | import, update | ``Cannot download npm package "${source.spec.name}@${source.version}": the tarball is large` | no | 4 | 4 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/npm.ts:357` | import, update | ``Cannot download npm package "${source.spec.name}@${source.version}": it unpacks to ${unpa` | no | 4 | 4 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/npm.ts:368` | import, update | ``Cannot download npm package "${source.spec.name}@${source.version}": it has ${fileCount} ` | no | 4 | 4 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/cache.ts:132` | import, update | `message` (argument of the local helper) | yes | 3 | 3 | ok | — |
| `src/core/sources/cache.ts:137` | import, update | `message` | no | 3 | 3 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/sources/npm-cli.ts:53` | import, update | `"Cannot run npm: npm could not be found"` | no | 3 | 3 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/https.ts:36` | import, update | `redact(message)` | no | 3 | 3 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/https.ts:193` | import, update | ``Cannot download ${redact(url)}: the tarball is larger than ${maxBytes} bytes`` | no | 4 | 4 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/git.ts:179` | import, update | `redact(message)` | no | 3 | 3 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/git.ts:195` | import, update | `redact(message)` | no | 3 | 3 | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `src/core/sources/git.ts:570` | import, update | `A fab must contain a .factory directory` | yes | 1 | 1 | ok | — |
| `src/core/sources/git.ts:576` | import, update | ``Invalid fab from ${label}`` | yes | 4 | 4 | ok | — |
| `src/core/discovery.ts:102` | all | `message` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:108` | all | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:196` | all | `${display} has ${found.join(" and ")} and no factory.yaml, so it belongs to Factory.ai Droid` | yes | 5 | 5 | ok | — |
| `src/core/discovery.ts:202` | all | `${display} has ${found.join(" and ")} and no factory.yaml, so it belongs to Factory.ai Droid` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:245` | all | `No factory found at the repository root ${topLevel}.` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:251` | all | `No factory found at the repository root ${topLevel}.` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:260` | all | `No factory found between ${cwd} and the repository root.` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:268` | all | `No factory found between ${cwd} and the repository root.` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:279` | all | `message` | yes | 1 | 1 | ok | — |
| `src/core/discovery.ts:285` | all | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:114` | build | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:304` | build | `${relativePath} is a symbolic link, not a directory` | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:312` | build | `${relativePath} is a file, not a directory` | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:399` | build | `${relativePath} is a symbolic link that metafab build cannot read` | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:409` | build | `${relativePath} is a symbolic link, not a regular file` | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:417` | build | `${relativePath} is not a regular file` | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:489` | build | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:532` | build | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:590` | build | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/build/plan.ts:677` | build | `${linkPath} is a symbolic link, and ${directory} behind it holds owned output that metafab build cannot remove` | yes | 1 | 1 | ok | — |
| `src/core/build/skill.ts:71` | build | `Cannot read ${relativePath}` | yes | 1 | 1 | ok | — |
| `src/core/build/skill.ts:190` | build | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/import/conflicts.ts:61` | all | `The incoming fab would replace ${file}` | yes | 5 | 5 | ok | — |
| `src/core/import/conflicts.ts:70` | all | `The incoming fab would replace ${file} with a different kind of entry` | yes | 5 | 5 | ok | — |
| `src/core/import/conflicts.ts:85` | all | `message` (argument of the local helper) | yes | 5 | 5 | ok | — |
| `src/core/import/conflicts.ts:109` | all | `message` (argument of the local helper) | yes | 5 | 5 | ok | — |
| `src/core/import/run.ts:109` | all | `This factory already has an upstream` | yes | 5 | 5 | ok | — |
| `src/core/import/run.ts:114` | all | `This factory already has an upstream` | yes | 1 | 1 | ok | — |
| `src/core/import/run.ts:124` | all | `"Import stopped because the incoming fab would replace local files."` | yes | 5 | 5 | ok | — |
| `src/core/import/run.ts:188` | all | `"The factory configuration has problems."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/import/run.ts:251` | all | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/import/run.ts:253` | all | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/import/run.ts:254` | all | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/import/run.ts:277` | all | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/core/import/run.ts:334` | all | `"Build stopped because the repository contains output that Metafab does not own."` | no | 5 | 5 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/import/run.ts:344` | all | `"Build failed after import."` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/check/markers.ts:212` | check | `Unresolved conflict marker` | yes | 1 | 1 | ok | — |
| `src/core/check/markers.ts:233` | check | `Unresolved .upstream conflict file` | yes | 1 | 1 | ok | — |
| `src/core/check/drift.ts:36` | check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/load.ts:28` | build, check | `${file} is not a regular file` | yes | 1 | 1 | ok | — |
| `src/core/factory/load.ts:41` | build, check | `Cannot read file ${file}` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:48` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:58` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:75` | build, check | `Skill name "${name}" does not match its directory "${skill.name}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:87` | build, check | `SKILL.md must live inside a skill directory` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:99` | build, check | `Nested skill directory: "${nestedDir}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:123` | build, check | `Duplicate skill name "${name}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:141` | build, check | `Skill name "${name}" is not a valid Agent Skill name` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:157` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:169` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:177` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:209` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:217` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:227` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:253` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:270` | build, check | `Duplicate pipeline entry "${entry.workflow}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:289` | build, check | `Pipeline option "${key}" is reserved for a future version` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:305` | build, check | `Required path "${requirement.path}" ${phrase}` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:332` | build, check | `Required path "${later.path}" repeats "${earlier.path}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:351` | build, check | `Required path "${contained.path}" is inside required path "${container.path}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:370` | build, check | `Skill name "${name}" uses the reserved "metafab" prefix` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:386` | build, check | `${dir} is a reserved directory and cannot be a skill` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:399` | build, check | `Unknown field "${key}" in factory.yaml` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:414` | build, check | `Unknown pipeline option "${key}"` | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:428` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:439` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:454` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/validate.ts:465` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:48` | build, check | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/factory/factory-yaml.ts:75` | build, check | `Pipeline entry must be a workflow name` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:88` | build, check | `Pipeline entry must be a workflow name or a mapping` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:99` | build, check | `Pipeline entry must name a workflow` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:110` | build, check | `Pipeline entry must contain exactly one workflow` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:123` | build, check | `Pipeline entry must name a workflow` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:136` | build, check | `Options for "${workflow}" must be a mapping` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:150` | build, check | `Pipeline option names must be strings` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:163` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:171` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:212` | build, check | `"${key}" in a requires entry must be a non-empty, single-line string` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:235` | build, check | `requires entry must be a mapping` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:252` | build, check | `requires entry keys must be strings` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:263` | build, check | `Unknown key "${key}" in a requires entry` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:286` | build, check | `requires entry is missing "${key}"` | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/factory/factory-yaml.ts:321` | build, check | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/factory/factory-yaml.ts:333` | build, check | `factory.yaml field names must be strings` | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:396` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/factory-yaml.ts:418` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/discovery.ts:64` | build, check | `Cannot read file ${file}` | yes | 1 | 1 | ok | — |
| `src/core/factory/discovery.ts:77` | build, check | `message` (argument of the local helper) | no | 1 | 1 | filed | [PNF](intake/2026-11-15-problems-without-fixes.md) |
| `src/core/factory/discovery.ts:118` | build, check | `Cannot read directory ${file}` | yes | 1 | 1 | ok | — |
| `src/core/factory/requires.ts:15` | build, check | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/core/factory/requires.ts:57` | build, check | `Cannot read directory .factory/${relativeDir}` | yes | 1 | 1 | ok | — |
| `src/errors.ts:11` | all | `message` (argument of the local helper) | n/a | n/a | n/a | ok | — |
| `src/input.ts:168` | all (prompts) | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/input.ts:183` | all (prompts) | required values (see the command's prompt) | n/a | 2 | 2 | ok | — |
| `src/cli.ts:182` | all | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/cli.ts:239` | all | `message` (argument of the local helper) | yes | 1 | 1 | fixed in this PR | `0c0b0df` |
| `src/commands/publish.ts:22` | publish | `message` | yes | 1 | 1 | ok | — |
| `src/commands/publish.ts:25` | publish | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/pipeline-remove.ts:11` | pipeline remove | `message` | yes | 1 | 1 | ok | — |
| `src/commands/pipeline-remove.ts:14` | pipeline remove | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/not-implemented.ts:13` | all | `The ${command} command is not implemented yet.` | yes | 1 | 1 | ok | — |
| `src/commands/init.ts:10` | init | `message` | yes | 1 | 1 | ok | — |
| `src/commands/init.ts:15` | init | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/map.ts:9` | map | `message` | yes | 1 | 1 | ok | — |
| `src/commands/map.ts:12` | map | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/create.ts:16` | create | `message` | yes | 1 | 1 | ok | — |
| `src/commands/create.ts:19` | create | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/pipeline-add.ts:11` | pipeline add | `message` | yes | 1 | 1 | ok | — |
| `src/commands/pipeline-add.ts:14` | pipeline add | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/import.ts:9` | import | `The import command requires a source.` | yes | 1 | 1 | ok | — |
| `src/commands/import.ts:14` | import | `The import command requires a source.` | yes | 1 | 1 | ok | — |
| `src/commands/import.ts:25` | import | `message` | yes | 1 | 1 | ok | — |
| `src/commands/import.ts:30` | import | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/commands/update.ts:10` | update | `message` | yes | 1 | 1 | ok | — |
| `src/commands/update.ts:15` | update | `message` (argument of the local helper) | yes | 1 | 1 | ok | — |
| `src/cli.ts:188 (fromMetafabError)` | all | `error.message`, with `error.problems ?? []` | yes, when the error carries one | error.exitCode | same | fixed in this PR | `0c0b0df` |

## JSON and terminal

The contract sweep (`test/cli/contract.test.ts`) ran on 2026-11-15. Every case ran the command twice: once with `--json`, `tty: false` and a `stdin` stream that records any read, and once without `--json` with the same `stdin` and no terminal. Each row below records one of the 22 command cases; with the guard test that every name in `COMMANDS` has a case, the file has 23 tests.

The two `test.fails` rows are defects pinned until their intake note is fixed: `map` omits `problems` from its success result, and `import` of a missing path prints no `fix:` line. Every other error case prints both `problems` with a `fix` in JSON and a `  fix: ` line on stderr, and every case leaves `stdin` unread.

| Command | Case | One JSON object | `exitCode` matches | Reads stdin without a terminal | Verdict | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| `init` | an empty directory outside Git selects every agent target (exit 0) | yes | yes | no | ok | — |
| `init` | an existing skill without `--adopt` asks for consent (exit 2, `required` names `--adopt`) | yes | yes | no | ok | — |
| `build` | no factory exits 1 with a fix that names `metafab init` | yes | yes | no | ok | — |
| `build` | the `mark4-like` factory builds (exit 0) | yes | yes | no | ok | — |
| `create` | a path without `--description` needs input (exit 2) | yes | yes | no | ok | — |
| `pipeline add` | an unknown workflow exits 1 with a fix | yes | yes | no | ok | — |
| `pipeline remove` | an unknown workflow exits 1 with a fix | yes | yes | no | ok | — |
| `map` | the `mark4-like` factory maps (exit 0) | yes | yes | no | filed | [JRP](intake/2026-11-15-json-results-without-problems.md) |
| `map` | no factory exits 1 | yes | yes | no | ok | — |
| `check` | a stale installed skill exits 1 | yes | yes | no | ok | — |
| `import` | a path source imports (exit 0) | yes | yes | no | ok | exit 0 observed; the spec leaves the non-interactive code open (plan, open question 4) |
| `import` | an invalid fab exits 4 | yes | yes | no | ok | — |
| `import` | a path that does not exist exits 3 | yes | yes | no | filed | [EWP](intake/2026-11-15-errors-without-problems.md) |
| `update` | a factory with no upstream exits 1 with a fix | yes | yes | no | ok | — |
| `diff` | a factory with no upstream exits 1 with a fix | yes | yes | no | ok | — |
| `detach` | a factory with no upstream is a no-op (exit 0, `problems: []`) | yes | yes | no | ok | — |
| `publish` | no `publish` key exits 1 with a fix | yes | yes | no | ok | — |
| `publish` | `--dry-run` with a valid `publish` key stages the fab (exit 0) | yes | yes | no | ok | — |
| `metafab` | no command prints the global help (exit 0) | yes | yes | no | ok | — |
| `metafab` | an unknown command exits 1 with a suggestion | yes | yes | no | ok | — |
| `metafab` | `pipeline` without a subcommand exits 1 | yes | yes | no | ok | — |
| `metafab` | an unexpected error is reported as a bug (exit 1; JSON has `command` and `problems`, no stack; human output keeps the stack and adds the fix line) | yes | yes | no | ok | `renderBug`, fixed in this PR |
| `import` (Windows) | a relative path source written with backslashes | not run | not run | not run | not run | GitHub Actions did not start the job: account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15; the Windows case is unverified |
| `create` (Windows) | a backslash path with `--description` | not run | not run | not run | not run | GitHub Actions did not start the job: account billing (run https://github.com/Traction-Team/meta-harness/actions/runs/43656797008), 2026-11-15; the Windows case is unverified |
