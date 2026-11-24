---
name: metafab
description: Maintain this repository's Metafab factory. Use when editing .factory/, adding workflows or skills, changing the pipeline, running metafab build or check, keeping installed skills current after a clone or pull, or reviewing upstream factory changes.
---

# Metafab

This repository stores its software factory in `.factory/`. Metafab compiles that source into the files agent tools read. Edit `.factory/` and run `metafab build`. Never edit installed copies by hand.

## Find and edit factory source files

- `.factory/factory.yaml` names the factory and lists the pipeline.
- `.factory/AGENTS.md` holds standing instructions for every session.
- `.factory/workflows/<name>/SKILL.md` is one step of the work.
- `.factory/skills/<name>/SKILL.md` is reusable project knowledge.
- `.factory/templates/` and `.factory/scripts/` hold supporting files. They are used in place and are not installed.

Every directory below `.factory/` that contains `SKILL.md` is a skill. Directories that start with a dot are ignored. Skill names must be unique across the factory, because installed skills share one flat namespace.

## Create workflows and skills

Run `metafab create <path> --description "<when to use it>"`. The last path segment is the skill name. For example, `metafab create workflows/review-slice` creates a workflow and `metafab create review/security` creates a skill in the `review` group.

The description is the discovery metadata agent tools use. Write it so a matching request finds the skill: say what it does and when to use it. Put supporting files beside `SKILL.md`.

Keep a workflow about one operation. Do not name a specific agent tool in a workflow: in a format 2 factory, put tool-specific commands in a `when` or `switch` block, or in a partial the workflow imports, so each agent reads only its own; in a format 1 factory, put them in a separate harness skill and refer to it.

## Write one factory for several environments

When the people who use this factory work in different agent harnesses or workspace tools, one workflow otherwise says "in Amp do this, in Orca do that", and every agent reads every variant. Declare the difference as an environment instead: `build` compiles the factory for the selection, so each agent reads only its own steps.

Declare the variables in `.factory/factory.yaml`, which needs `format: 2`:

```yaml
format: 2
name: dragonfly

env:
  harness:
    values:
      opencode: { label: In OpenCode }
      claude:   { label: In Claude Code }
      amp:      { label: In Amp (AMP_THREAD_ID is set) }
  workspace:
    values: [orca, orb, worktree]
    default: worktree
```

A label says, in words an agent can act on, where it is when that value applies, such as `In Amp (AMP_THREAD_ID is set)`. A value with no label is labelled `When <variable> is <value>`, and a `default` applies when the developer selects nothing.

Choose the tool by what the text needs:

- `when` for a few lines that apply to some environments, such as one setup step.
- `switch` where every value needs its own text. `check` then lists every switch that a new value has to be added to, which `when` cannot.
- `import` from `.factory/partials/` when several workflows share one procedure. A partial is a Markdown file that is never installed on its own.
- A `skills:` entry in `factory.yaml` when a whole skill applies only somewhere.

A directive is an HTML comment on a line of its own, so the source still renders and a `SKILL.md` still loads as a normal Agent Skill. `build` removes directive lines from the output:

```md
<!-- factory:when env.workspace == orca -->
Create the slice's checkout with the Orca worktree tool.
<!-- factory:endwhen -->

<!-- factory:switch env.workspace -->
<!-- factory:case orca -->
Create the slice's checkout with the Orca worktree tool.
<!-- factory:case orb -->
Start a new orb for the slice.
<!-- factory:default -->
Run `git worktree add` for the slice.
<!-- factory:endswitch -->
```

A workflow that shares a procedure imports it. The path is relative to the file that holds the directive, uses `/`, ends in `.md`, and must stay inside `.factory/`:

```md
<!-- factory:import ../../partials/worktree.md -->
```

A skill that applies only in some environments says so in `factory.yaml`, not in its frontmatter:

```yaml
skills:
  orca-worktrees: { when: env.workspace == orca }
  amp-threads:    { when: env.harness == amp }
```

Rules to keep:

- Frontmatter is the same in every environment: no directive in a `SKILL.md`'s `name`, `description` or any other field. Write descriptions that do not depend on the harness.
- A directive is a whole line. Every `when` closes with `endwhen` and every `switch` with `endswitch`, in the same file. Blocks may nest.
- Each branch must read correctly on its own, because `build` removes text without renumbering lists or reflowing prose.

`metafab env` shows each variable, its selected values and the source of each. `metafab env set harness=opencode,claude` replaces the selection in the repository's Git config and rebuilds; add `--global` for every repository on the machine, and `metafab env unset harness` removes it. A setup script sets `FACTORY_ENV_HARNESS=amp` before `metafab build`. A value that Git config or `FACTORY_ENV_*` names and the factory does not declare is ignored with a warning; an undeclared name in `--env` is an error. A variable with no selection falls back to its `default`, then to every value.

`metafab check` validates every branch and every import, whatever the local selection is. To see what a teammate on another harness receives, run `metafab build --env harness=amp --out /tmp/preview-amp`: it writes the compiled skills and the `AGENTS.md` block into a directory that must not exist or must be empty, and changes nothing else in the repository.

The root `AGENTS.md` block is rendered for every declared value, with a label on each block that does not apply to all of them, so it is the same for every developer. Never put a per-developer instruction there.

## Add workflows to the pipeline

The pipeline in `factory.yaml` is the order work moves through the workflows. Add an entry with `metafab pipeline add <workflow> [--after <workflow>] [--stop "<decision>"]`, or edit `factory.yaml` directly.

Only workflows can appear in the pipeline. A `stop` entry names the person who acts and what they decide, for example `review-slice: { stop: The code owner approves the PR }`. The generated `AGENTS.md` tells an agent to stop there.

## Build after an edit

Run `metafab build` after every change to `.factory/`. It writes the root `AGENTS.md` block, the `CLAUDE.md` import block, the `.gitignore` block, and the installed skills for the targets in `.factory/metafab.yaml`. With `git-hooks: true`, the installed Git hooks also run it after a checkout, merge, or rebase.

Targets are chosen with `agents` in `.factory/metafab.yaml`, for example `agents: [claude, codex]`. `metafab build` has no option that overrides them. Set `agents: []` to remove all installed output.

Build removes owned output that no longer has a source. It stops with exit code 5 when it finds anything directly in a selected skill destination that Metafab did not generate. Hand edits inside an installed skill are overwritten by the next build. Run `metafab init` to adopt existing repository skills.

## Keep installed skills current

Installed skills are ignored by Git, so a clone, a new worktree, a pull, a branch switch, a merge, or a rebase can leave them missing or stale.

- **Git hooks.** Set `git-hooks: true` in `.factory/metafab.yaml` or run `metafab init --git-hooks`, then run `metafab build`. A branch checkout, a merge, and a rebase then each run `metafab build`, in every worktree of the clone. A hook Metafab did not write, or a `core.hooksPath`, is left alone: `build` warns and prints the line to add by hand.
- **Worktree setup scripts.** Run `metafab build` in the setup step of the tool that creates worktrees: `npx --yes @seasb/metafab build`, or `npx metafab build` when the project depends on Metafab. For Orca, commit an `orca.yaml`:
  ```yaml
  scripts:
    setup: |
      npx --yes @seasb/metafab build
  ```
- **Cloud agents and CI.** They start from a fresh clone, so run `metafab build` in their setup step. CI then runs `git diff --exit-code -- AGENTS.md CLAUDE.md .gitignore .gitattributes` and `metafab check`.

## Check and resolve problems

Run `metafab check`. It reports each problem with a path, line, and suggested fix. Errors return exit code 1.

Resolve every problem before you commit:

1. Fix the source in `.factory/`.
2. Run `metafab build`.
3. Run `metafab check` again.

Check covers the factory format, configuration, installed copies, generated blocks, unresolved Git conflict markers, and remaining `.upstream` files. A missing installed copy after a fresh clone is fixed by `metafab build`.

## Keep changes reviewable

Put factory changes in one commit or pull request. Include the source in `.factory/` and the committed generated files (`AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.gitattributes`). Installed skill directories are ignored by Git.

Review the `.factory/` diff. Installed copies are derived from it, and `metafab check` proves they match. Run `metafab build` and `metafab check` before you commit.

## Review upstream changes

`metafab update` merges a newer upstream fab into `.factory/`. Use `--dry-run` to preview it, and read the summary before you accept it.

After an update:

1. Review the `.factory/` diff, executable changes first.
2. Resolve any conflict files left as `.upstream`.
3. Run `metafab build` and `metafab check`.
4. Commit the merged source and the regenerated files together.

Use `metafab diff` to see local edits since the recorded upstream version, and `metafab detach` to drop the upstream link without changing factory files.

## Design a factory

Do not start from a template. Ask the person how work moves today, where people decide, and what goes wrong. Then describe that process as workflows and stops.

- Make one workflow per real step, not per role or document.
- Put the pipeline in the order the work actually moves.
- Add a stop wherever a person decides before work continues. Name who decides and what they approve.
- Split reusable knowledge into skills rather than repeating it in workflows.
- If people work in different harnesses, declare `harness` in `env` before writing tool-specific steps.
- Start with four to eight workflows. Add more only when a step genuinely repeats.
- List files outside `.factory/` that the workflows need under `requires` in `factory.yaml`, with a template in `.factory/templates/` when Metafab can create them.
- Put per-repository values in a file a template creates, never in `.factory/`.
- Put repository-specific standing instructions in the root `AGENTS.md` outside the factory block.

A factory that matches how the team already works is easier to follow than one that invents a new process.
