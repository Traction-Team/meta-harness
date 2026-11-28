# Building a factory

`metafab build` compiles `.factory/` into the files and directories that agent tools read.

Edit `.factory/`, then run `metafab build`. Do not edit installed copies.

Installed skill directories are generated output and are ignored by Git. Root `AGENTS.md`, the optional block in `CLAUDE.md`, `.gitignore`, and `.gitattributes` are committed. After a fresh clone, run `metafab build` before opening an agent tool that should use the factory skills. [Keeping installed skills current](#keeping-installed-skills-current) describes how to make later builds automatic.

## Installed output

| Source | Destination | Target |
| --- | --- | --- |
| Each factory skill | `.agents/skills/<name>/` | `codex`, `cursor`, `opencode`, `copilot` |
| Each factory skill | `.claude/skills/<name>/` | `claude` |
| Standing instructions and pipeline | Generated block in root `AGENTS.md` | All targets |
| `@AGENTS.md` import | Root `CLAUDE.md`, only when the file already exists | `claude` |
| Built-in `metafab` skill | Each selected skill directory | All targets unless disabled |
| Built-in `metafab-automations` skill | Each selected skill directory | All targets, in a format 2 factory with at least one automation, unless disabled |

A factory skill is any directory below `.factory/` that contains `SKILL.md`.

Metafab writes one installed entry for each unique destination. Version 1 has two skill destinations. Installation means generating files in these locations; Metafab does not invoke the tools or verify their runtime behaviour:

| Destination | Read by |
| --- | --- |
| `.agents/skills/` | Codex, Cursor, opencode, GitHub Copilot, and other tools that follow the shared Agent Skills location |
| `.claude/skills/` | Claude Code, which does not read `.agents/skills/` |

Metafab never writes `.cursor/`, `.codex/`, `.opencode/`, or `.github/skills/`. The tools that read those directories also read `.agents/skills/`.

### Duplicate skills

Cursor, opencode, and Copilot read both `.agents/skills/` and `.claude/skills/`. When `claude` and any other target are selected, these tools find two copies of each skill, with the same name and content. opencode lists each skill once, so it needs no setting. Copilot CLI lists each skill once. These results were checked with the versions in [the verification record](../verification.md#agent-tools). Cursor and VS Code Copilot Chat were not verified in 1.0. A team that uses only Claude Code, or uses no Claude Code, avoids duplicates by selecting only the targets it uses.

## Target selection

`agents` in [`.factory/metafab.yaml`](configuration.md) selects the targets. Edit it directly:

```yaml
agents: [claude, codex]
```

Target selection follows these rules:

1. `build` reads `agents` and has no command-line override. `--env` selects [environment](environments.md) content, never targets.
2. `agents: all` selects every target supported by version 1.
3. When `agents` is absent, `build` uses `all`. `init` normally writes it first.
4. `build` removes owned output for targets that are no longer selected.
5. `agents: []` selects no targets, so `build` removes all owned output, including the `AGENTS.md` block and the `CLAUDE.md` import block.

## Ignored build output

`build` manages a marked block in the root `.gitignore`:

```gitignore
# metafab:start
.claude/skills/
.agents/skills/
# metafab:end
```

The block contains `.claude/skills/` when `claude` is selected. It contains `.agents/skills/` when any other version 1 target is selected. `build` adds, updates, or removes only the text between these markers and preserves all other ignore rules.

The whole selected skill destination is ignored, not one entry per generated skill. Once Metafab manages a destination, repository skills for that destination belong in `.factory/` and the installed directory is disposable. Metafab never ignores all of `.claude/` or `.agents/`.

Before changing any file, `build` checks selected destinations for unowned entries directly in them. If it finds one, it stops with exit code 5 and suggests `metafab init` to adopt existing skills. This preflight also applies when a configuration change selects a destination for the first time.

## Keeping installed skills current

Installed skills are ignored by Git, so they are missing after a fresh clone or a new worktree, and stale after a pull, a branch switch, a merge, or a rebase that changes `.factory/`. Three mechanisms keep them current:

1. **Git hooks.** With `git-hooks: true` in [`metafab.yaml`](configuration.md), `build` installs Git hooks that run `metafab build` after a branch checkout, a merge, and a rebase. Git shares one hooks directory across every worktree of a clone, so `git worktree add` builds the new worktree too. A new worktree has no `node_modules/` yet, so its hook runs the `metafab` installed in the repository's main worktree. When the main worktree has not installed it either, the hook finds `metafab` on `PATH`, or falls back to `npx`, which needs the network. A fresh clone has no hooks until its first `metafab build`.
2. **Worktree setup scripts.** Tools that create a worktree and then run a setup script should run `metafab build` in that script. Orca reads `scripts.setup` from a committed `orca.yaml`. `init` suggests this step when it finds `orca.yaml`.
3. **Agents.** The `AGENTS.md` block and the [built-in `metafab` skill](#built-in-metafab-skill) tell agents to run `metafab build` after they edit `.factory/`.

Every build, including one a hook or a setup script runs, uses the developer's [environment selection](environments.md#selecting-an-environment). A setup script for a known environment sets `FACTORY_ENV_*`, such as `FACTORY_ENV_HARNESS=amp metafab build`.

Metafab has no watch mode and installs no agent session hooks.

### Git hooks

`build` manages three hooks in the repository's shared hooks directory, `$(git rev-parse --git-common-dir)/hooks`:

| Hook | Runs `metafab build` after |
| --- | --- |
| `post-checkout` | `git checkout` or `git switch` of a branch, and `git worktree add`. Not a file checkout |
| `post-merge` | `git merge` and `git pull` |
| `post-rewrite` | `git rebase`. Not `git commit --amend` |

On Windows, Git for Windows runs the hooks with its bundled `sh`, which finds npm's extensionless `metafab` shim.

Metafab owns a hook file when it contains the line `# metafab:start`. It owns the whole file, and rewrites it when its content differs from what `build` would write, for example after a CLI upgrade, or sets its mode to 0755 when its content matches and its mode is not 0755. `build` follows these rules:

1. With `git-hooks: true`, it creates each missing hook as a POSIX shell script with mode 0755.
2. It never changes a hook file it does not own. It leaves the file unchanged and still exits 0. With `git-hooks: true` it warns with the hook name and the line to add by hand. A hook path that is a symbolic link, or anything else that is not a regular file, counts as a hook Metafab does not own: `build` never writes, chmods or deletes through it, not even with `git-hooks: false`. For a symbolic link the warning says the hook is a link that Metafab left alone and names its target; its fix says to add the line to that target, or to replace the link with a regular file. A dangling link says its target is missing, and its fix says to remove the link.
3. When `core.hooksPath` is set, it creates and rewrites no hooks and warns once, with the line to add by hand. Rule 4 still removes hooks it owns in the shared hooks directory.
4. With `git-hooks: false`, or when the key is absent, it deletes the hook files it owns and nothing else.
5. Outside a Git repository, or when `git` is not installed, it skips hooks. With `git-hooks: true` it warns once.
6. An owned hook that names a different factory directory is never changed or deleted, whatever `git-hooks` says. With `git-hooks: true`, `build` warns. Hooks support one factory per Git repository.

Every command that runs `build`, including `init`, `import`, and `update`, applies these rules. `build`, `init`, `import` and `update` list each hook they create, update or remove as `+ git hook <name>`, `~ git hook <name>` or `- git hook <name>`, and return them as `hooks` in `--json`. Hooks live in `.git/`, are never committed, and are not reported by `check`.

A hook runs the first `metafab` it finds: `node_modules/.bin/metafab` in the factory root; then the same path in the main worktree, the first entry of `git worktree list --porcelain`; then `metafab` on `PATH`; then `npx --yes @seasb/metafab@<version>`, where `<version>` is the CLI version that wrote the hook. The main worktree's copy may be a different version from the one the checked-out branch depends on. A bare repository has no main worktree, so its linked worktrees skip that step; so does a main worktree whose path contains a newline. A hook never fails the Git command that ran it. If the build fails, it prints one line that says to run `metafab build`, and exits 0.

Example `post-merge`, written by version 1.0.0 for a factory at the repository root:

```sh
#!/bin/sh
# metafab:start
# Generated by metafab build 1.0.0. Set git-hooks: false in .factory/metafab.yaml to remove.
cd "$(git rev-parse --show-toplevel)/." 2>/dev/null || exit 0
[ -d .factory ] || exit 0
if [ -x node_modules/.bin/metafab ]; then node_modules/.bin/metafab build
elif main=$(git -c core.quotePath=false worktree list --porcelain 2>/dev/null | sed -n '1{s/^worktree //;h;d;};/^bare$/q;g;p;q') && [ -n "$main" ] && [ -x "$main/./node_modules/.bin/metafab" ]; then "$main/./node_modules/.bin/metafab" build
elif command -v metafab >/dev/null 2>&1; then metafab build
else npx --yes @seasb/metafab@1.0.0 build
fi || echo "metafab: build failed. Run metafab build." >&2
exit 0
# metafab:end
```

`post-checkout` also exits at once unless its third argument is `1`. `post-rewrite` exits at once unless its first argument is `rebase`.

## Compiled skills

Every installed skill is a generated copy. Metafab does not use symlinks, so installation works the same way on every platform and in every agent tool.

For each factory skill, `build` performs these steps:

1. Copy the skill directory, including all supporting files.
2. Keep the frontmatter unchanged.
3. In a format 2 factory, render every `.md` file, and `SKILL.md` below its frontmatter, for the [selection](environments.md#rendering), replacing each [import](environments.md#import) with the imported body.
4. Add a generated-file comment after the frontmatter, and for a skill that [applies only in some environments](environments.md#conditional-skills), the line `**Applies only <label>.**` after it.

A format 2 factory does not install a skill whose condition is false for the selection.

Agent tools use a flat skill namespace. A nested skill such as `.factory/review/security/` installs as `security`. All skill names must therefore be unique across the factory.

### Example

Source `.factory/workflows/build-slice/SKILL.md`:

```markdown
---
name: build-slice
description: Build one slice of an approved plan on its own branch. Use when a person picks a ready slice.
---

# Build slice

1. Create the slice branch.
...
```

Installed `.claude/skills/build-slice/SKILL.md`:

```markdown
---
name: build-slice
description: Build one slice of an approved plan on its own branch. Use when a person picks a ready slice.
---
<!-- Generated by metafab build from .factory/workflows/build-slice/. Edit the source, then run metafab build. -->

# Build slice

1. Create the slice branch.
...
```

### Ownership

The generated-file comment marks ownership. Metafab owns an installed skill directory when its `SKILL.md` contains the comment that starts `<!-- Generated by metafab build`. An owned directory and everything inside it belong to Metafab. `build` rewrites an owned directory to match the source, so a file added inside it by hand is removed. Metafab changes or removes only owned directories, and only the marked blocks in `AGENTS.md` and `CLAUDE.md`. No separate record of installed files exists.

If an unowned entry directly in a managed destination is in the way, `build` stops with exit code 5. It does not replace or remove the entry. This includes an installed copy whose generated-file comment was deleted by hand. Entries inside an owned directory are not preflighted; `build` reconciles them with the source.

When a skill is removed from `.factory/`, or its condition becomes false for the selection, the next `build` removes the owned directories that have no source. When a target is no longer selected, the next `build` removes the owned directories in its destination.

`metafab check` fails when an installed copy differs from the output that `build` would write. This includes manual edits, stale copies, and unowned entries in a managed destination.

Missing installed output after a clone is also an error. The suggested fix is to run `metafab build`.

### Review of generated changes

Review the source change in `.factory/`. The installed copies are derived from it, and `metafab check` confirms that they match.

## Root `AGENTS.md`

`metafab build` manages one block in the root `AGENTS.md`:

```markdown
<!-- factory:start -->
<!-- Generated by metafab build from .factory/. Edit .factory/, then run metafab build. -->

(contents of .factory/AGENTS.md)

## Pipeline

Work moves through these workflows in order. When one ends, suggest the next.

1. `file-work`
2. `triage-ideas`. Then stop: The product lead picks the next item.
3. `plan-feature`. Then stop: The tech lead approves the plan as a documentation PR.
4. `build-slice`
5. `review-slice`. Then stop: The code owner approves the PR.
6. `finish-slice`

## Factory source

This repository stores its factory in `.factory/`. Edit that directory and run `metafab build`.
Do not edit installed copies in `.claude/` or `.agents/`.
<!-- factory:end -->
```

Metafab applies these rules to the block:

1. It creates `AGENTS.md` when the file does not exist.
2. It appends the block when the markers do not exist.
3. It replaces only the text between existing markers.
4. It preserves all text outside the markers.
5. It does not list workflows or skills. Their installed skill directories and `description` fields provide the discovery metadata expected by agent tools.
6. It includes the pipeline only when `factory.yaml` defines one.
7. It warns when the generated block exceeds 300 lines.
8. In a format 2 factory, it renders `.factory/AGENTS.md` for every declared value of every variable, whatever the selection, and labels each block that does not apply to every value ([Environments](environments.md#root-agentsmd)).

The pipeline is the only part of the factory that is not represented by individual skills. It is therefore the only factory content that the block adds beyond `.factory/AGENTS.md`. A factory that wants a table of its workflows writes one in `.factory/AGENTS.md`.

The marker format is part of the open factory format. Other tools can generate the same block.

## Root `CLAUDE.md`

Claude Code reads the root `AGENTS.md` directly when the repository has no `CLAUDE.md`. When `CLAUDE.md` exists, Claude Code reads it instead, so it must import `AGENTS.md`.

For the `claude` target, `build` handles the file as follows:

1. If `CLAUDE.md` does not exist, do nothing. Metafab does not create it.
2. If it already imports `AGENTS.md`, leave it unchanged.
3. Otherwise, add `@AGENTS.md` in a marked factory block at the start of the file.

When `CLAUDE.md` is a symbolic link to the root `AGENTS.md`, Claude Code already reads the `AGENTS.md` content. `build` leaves the link unchanged for every `agents` value. `build` does not write through any other symbolic link at the repository root or in a skill destination. If a change needs one, `build` stops with exit code 5.

## Built-in `metafab` skill

`build` installs a built-in `metafab` skill for each target. The CLI supplies this skill. It does not come from `.factory/`.

The skill tells an agent how to:

- Find and edit factory source files
- Create workflows and skills
- Write one factory for several environments: `env`, `when`, `switch`, `import` and partials, conditional skills, harness-neutral descriptions, `metafab env`, and `build --env ... --out` previews
- Add workflows to the pipeline
- Run `metafab build` after an edit
- Keep installed skills current after a clone, a pull, a branch switch, or a new worktree: Git hooks, worktree setup scripts such as `orca.yaml`, cloud agent setup steps, and the CI recipe
- Run `metafab check` and resolve each reported problem
- Keep factory changes in a reviewable commit or PR
- Review upstream changes from `metafab update`
- Design a factory by asking how work moves today, where people decide, and what goes wrong

The design guidance recommends a pipeline of four to eight workflows to start.

The basic rule, "edit `.factory/`, then run `metafab build`", is also in the `AGENTS.md` block. Agents therefore know it without loading this skill.

Disable this skill in `metafab.yaml`:

```yaml
metafab-skill: false
```

The next `build` removes the installed copies.

The installed copies carry the generated-file comment, with the CLI version that wrote them. `metafab check` detects an outdated built-in skill. `metafab build` replaces it with the current CLI version.

## Built-in `metafab-automations` skill

In a format 2 factory with at least one automation, `build` also installs `metafab-automations`. It tells an agent how to run `metafab automations sync orca` and how to apply `metafab automations plan amp --json` with Amp's schedule and thread tools.

`metafab-skill: false` turns off both built-in skills, and the next `build` removes the installed copies.

`metafab-automations` is owned, versioned and checked like `metafab`: its installed copies carry the generated-file comment with the CLI version, and `metafab check` reports an outdated copy. When a factory's last automation is deleted, the next `build` removes the installed copies.

## Repeatability

`metafab build` writes, updates, or removes only out-of-date owned output. It reports every changed path.

A second run with unchanged inputs makes no changes.

An installed file has mode 0755 when its source has any executable bit, and 0644 otherwise. On macOS and Linux, `build` corrects any other mode and `check` reports it. On Windows, only content is compared.

When `build` or `check` cannot read a path it needs, it reports one error for that path, `Cannot read <path>`, and exits 1. A read error is never an ownership conflict, and `build` never removes a directory it could not read.

`metafab check` fails when `build` would change a file. Because installed skills are absent from a fresh CI checkout, build them before checking. Also verify that `build` did not repair stale committed integration files:

```sh
npx @seasb/metafab build
git diff --exit-code -- AGENTS.md CLAUDE.md .gitignore .gitattributes
npx @seasb/metafab check
```

## Line endings

Metafab writes LF line endings. When it compares files, it treats CRLF as LF, so a checkout that converts line endings does not make `check` fail.

`init` adds these lines to the root `.gitattributes` when they are missing:

```text
.factory/** text=auto eol=lf
.claude/skills/** text=auto eol=lf
.agents/skills/** text=auto eol=lf
```
