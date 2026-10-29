# Bundling (draft)

> Draft for a later version. Not the acceptance standard. See [Next iterations](README.md).

`metafab build` already compiles `.factory/` into installed skills. Bundling makes that compile step aware of **each developer's environment**, so one factory can serve a team whose members work in different ways.

## Problem

Teams agree on a process, but developers still run it differently:

- Different agent harnesses: Claude Code, Codex, OpenCode, Cursor, Copilot, frontier harnesses.
- Different workspace tools: Orca worktrees, nodeterm canvases, plain `git worktree`, a single checkout.
- Different local services: a browser tool, a ticket tracker, a memory store.

Today a workflow either names every variant ("if you use Orca, do X; if you use Codex, do Y") or names none and leaves the agent to guess. The first wastes context and confuses agents. The second gives weak instructions. v1 guidance puts tool-specific steps in separate skills ([Workflow guidance](../factory-format.md#workflow-guidance)), but every developer still receives every variant.

## Goals

1. One factory source. A team does not fork its factory per harness.
2. Each developer declares their environment once, locally.
3. `build` installs only what applies to that environment: the right skills, and the right parts of each skill.
4. The source stays readable, and every source `SKILL.md` stays a valid Agent Skill.
5. `check` proves that every declared environment compiles, not only the local one.
6. The team chooses how `.factory/` is laid out, and tells Metafab which folders hold skills.

## Concepts

- **Dimension:** A named axis of variation, such as `harness` or `workspace`.
- **Option:** One value of a dimension, such as `orca` or `codex`.
- **Environment:** The options one developer selects, for example `harness: [opencode], workspace: orca`.
- **Condition:** An expression over the environment, such as `env.workspace.orca`. It decides whether a skill, or part of a skill, is installed.

## Declaring dimensions

The factory declares its dimensions and options in `factory.yaml`, because they are part of the factory's design and travel with a fab:

```yaml
format: 2
name: mark4

environment:
  harness:
    description: The agent tool that runs workflows
    multiple: true
    options: [claude, codex, opencode, cursor, copilot]
  workspace:
    description: How parallel work gets its own checkout
    options: [orca, nodeterm, git-worktree, none]
    default: git-worktree
```

Rules:

1. A dimension name and an option name follow the skill name rules.
2. `multiple: true` lets a developer select more than one option. Otherwise exactly one option is selected.
3. `default` applies when the developer selects nothing for that dimension. Without a default, `build` asks, or fails in a non-interactive run.
4. `harness` is special: it also sets the install targets that v1 reads from `agents`. See [Relation to `agents`](#relation-to-agents).

## Selecting an environment

Each developer selects options in a local, uncommitted file:

```yaml
# .factory/metafab.local.yaml  (ignored by Git)
environment:
  harness: [opencode]
  workspace: orca
```

- `metafab env` shows the current environment and where each value came from.
- `metafab env set workspace=orca` writes the local file.
- `build` asks for missing dimensions on first run in an interactive terminal.
- `METAFAB_ENV_<DIMENSION>` environment variables override the file, for CI and scripts.
- A team can set shared defaults in the committed `metafab.yaml` under `environment:`. The local file overrides them.

`init` adds `.factory/metafab.local.yaml` to the managed `.gitignore` block.

## Conditional content inside a skill

A skill can include sections that apply only to some environments. Conditions are HTML comments, so the source still renders and still loads as a normal Agent Skill:

```markdown
## Start the work

1. Create the branch `<type>/<slug>`.
<!-- metafab:if env.workspace.orca -->
2. Open an Orca worktree for the branch: `orca worktree create <slug>`.
<!-- metafab:elif env.workspace.git-worktree -->
2. Run `git worktree add ../<slug> <type>/<slug>`.
<!-- metafab:else -->
2. Switch to the branch in the current checkout.
<!-- metafab:end -->
```

Rules:

1. Blocks start with `metafab:if`, may have any number of `metafab:elif` and one `metafab:else`, and end with `metafab:end`. Blocks may nest.
2. `build` keeps the text of the first matching branch and removes the markers and every other branch.
3. Expressions: `env.<dimension>.<option>` (true when selected), `not`, `and`, `or`, and parentheses. No other syntax.
4. A condition that names an undeclared dimension or option is a `check` error.
5. Conditions may appear in any Markdown file of a skill, not only `SKILL.md`. Other files are copied unchanged.
6. Conditions may not appear in frontmatter. The skill's `name` and `description` are the same in every environment.

Open question: whether numbered lists should be renumbered after a branch is removed, or whether authors avoid numbering across branches.

## Conditional skills

A whole skill can depend on the environment. Put the condition in `factory.yaml` so skill frontmatter stays free of factory fields:

```yaml
skills:
  orca-worktrees:     { when: env.workspace.orca }
  codex-sandbox:      { when: env.harness.codex }
  browser-qa:         { when: env.harness.claude or env.harness.opencode }
```

A skill whose condition is false is not installed. A skill with no entry is always installed.

## Skill composition

A skill can pull another skill's content into itself at build time:

```markdown
## Workspace

<!-- metafab:include worktree-setup -->
```

and the included skill can itself be chosen by environment:

```markdown
<!-- metafab:include orca-worktrees when env.workspace.orca -->
<!-- metafab:include codex-worktrees when env.harness.codex -->
```

Rules:

1. `include` inserts the body of the named skill, without its frontmatter, in place of the comment.
2. Conditions inside the included skill are resolved against the same environment.
3. Includes may nest. A cycle is a `check` error.
4. Supporting files of an included skill are not copied. The included body refers to them by repository path, as workflows already do with templates and scripts.
5. A skill that exists only to be included can be marked `{ install: false }` in `factory.yaml`, so it is never installed on its own.

### Inline blocks or composition

Both mechanisms solve the same problem. They suit different sizes of variation:

| Use | When |
| --- | --- |
| Inline `if` blocks | A few lines differ per environment, and the reader benefits from seeing them side by side |
| Conditional skills plus `include` | A whole procedure differs, or the same procedure is shared by several workflows |

The proposal is to support both, with `include` built on the same condition grammar. The first plan could ship conditional skills and inline blocks only, and add `include` later.

## Skill folders

v1 treats every directory below `.factory/` that contains `SKILL.md` as a skill, and only `workflows/` has special meaning. A team that wants its own layout declares which folders hold skills and which hold workflows:

```yaml
layout:
  workflows: [workflows]
  skills: [skills, harness/*, review]
  ignore: [drafts, archive]
```

Rules:

1. Paths are relative to `.factory/` and may use `*` for one directory level and `**` for any depth.
2. When `layout` is absent, v1 behaviour applies: `workflows/` holds workflows and every other `SKILL.md` is a skill.
3. When `layout` is present, a `SKILL.md` outside every listed folder is not part of the factory, and `check` warns about it.
4. Only skills in `layout.workflows` can appear in the pipeline.
5. `ignore` folders are never scanned. They can hold drafts or archived skills.

## Relation to `agents`

In v1, `agents` in the committed `metafab.yaml` selects install targets for the whole team. With bundling, the `harness` dimension selects them per developer. Proposal:

- When `factory.yaml` declares a `harness` dimension, `build` takes targets from the developer's environment, and `agents` in `metafab.yaml` becomes the team's allowed set.
- Without a `harness` dimension, v1 behaviour is unchanged.

## Compiled output is ignored

All compiled output that can differ per developer goes into Git-ignored locations. This is the default, and it extends the v1 rule that installed skill directories (`.claude/skills/`, `.agents/skills/`, and any other target destination) are ignored build output.

1. Installed skills are ignored, so they can differ per developer with no diff.
2. The committed files that v1 manages, the generated block in root `AGENTS.md`, the `CLAUDE.md` import, `.gitignore`, and `.gitattributes`, must stay the same for every environment. Conditions are therefore not allowed in `.factory/AGENTS.md`. Environment-specific standing instructions go in a conditional skill.
3. The `.gitignore` block lists every destination the team's allowed targets can use, not only the local ones, so it does not change between developers.

### Cloud and CI agents

Agents that run from a fresh clone, such as GitHub pull request reviewers, Codex cloud tasks, the Copilot coding agent, or Claude Code in GitHub Actions, find no installed skills, because the output is ignored. Each of these tools has a setup step that runs before the agent starts. The factory runs `metafab build` there, with the environment set by variables:

```sh
METAFAB_ENV_HARNESS=codex METAFAB_ENV_WORKSPACE=none npx @seasb/metafab build
```

Proposal:

1. A cloud environment is an ordinary environment. The factory can declare an option for it, such as `workspace: cloud`, and write conditional content for agents with no local tools.
2. `metafab build --env <dimension>=<option>` sets the environment on the command line, as an alternative to variables.
3. The built-in `metafab` skill, and later a `metafab setup` command, explain or write the setup step for each supported cloud agent, such as `.github/workflows/copilot-setup-steps.yml` or a Codex environment setup script.
4. `build` must stay fast and work offline from the repository alone, because it runs before every cloud task.

## Validation

`check` adds these rules:

1. Every condition parses and names declared dimensions and options.
2. Every `if` block is closed, and every `include` names an existing skill.
3. No include cycle exists.
4. **Every environment compiles.** `check` builds every combination of options in memory and validates each output, including skill name uniqueness and pipeline references. When the number of combinations is large, it checks each option at least once against defaults for the others, and says so.
5. Installed output matches what `build` writes for the **local** environment.

## Sharing

- A fab publishes its dimensions with its `factory.yaml`.
- `import` asks the developer to select options, or takes `--env workspace=orca`.
- `update` reports added, removed, or renamed dimensions and options, because they can change what a developer has installed.

## Format version

Conditions, `environment`, `skills`, and `layout` change what a factory means, so they need factory format version 2. A v1 factory stays valid and builds the same.

## Open questions

1. Is `factory.yaml` the right home for `environment`, `skills`, and `layout`, or should they live in `metafab.yaml` as tool settings? They change the installed content, which argues for `factory.yaml`.
2. Does the condition grammar need values beyond options, such as `env.os.windows` detected automatically, or version checks?
3. Should Metafab detect some options itself, such as an installed Orca or Codex, and suggest them?
4. How should a developer preview another environment's output, for example `metafab build --env harness=codex --out <dir>`?
5. How do inline blocks interact with `update`'s three-way merge when a team edits one branch of a block and the upstream edits another?
6. Should the built-in `metafab` skill teach agents to write conditions, or should conditions stay a human authoring feature?
7. Which harness-specific frontmatter fields, such as Claude Code's `allowed-tools`, need per-environment values, given conditions are not allowed in frontmatter?
8. Which cloud agents give no setup step, and what do they get: no factory skills, or an opt-in committed build for one fixed environment?
