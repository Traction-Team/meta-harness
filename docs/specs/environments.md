# Environments

> Version 2. Format 2 factories only. Plans 2.011 to 2.015 build it.

One factory serves a team whose members work in different ways: different agent harnesses (OpenCode, Claude Code, Amp, Codex), different workspace tools (Orca worktrees, Amp orbs, plain `git worktree`), different local services. An **environment** says which of these a developer uses. `build` compiles the factory for it, so each agent reads only the instructions that apply to it.

Without environments, a workflow either names every variant ("in Amp, do X; with Orca, do Y") and every agent reads all of them, or it names none and the agent guesses. Hand-written variants also drift: a change for one harness silently leaves another out of date.

The format is part of the open factory format. Its names (`env`, the `factory:` directives, `factory.env.*` in Git config, `FACTORY_ENV_*`) do not name Metafab, so another tool can implement it.

## Concepts

- **Variable:** a named setting the factory declares, such as `harness` or `workspace`.
- **Value:** one allowed setting of a variable, such as `amp` or `orca`.
- **Selection:** the values of each variable that apply to one checkout. A variable can have more than one value selected, because one developer can use several harnesses in the same checkout.
- **Condition:** an expression over the selection, such as `env.harness == amp`. It decides whether a block of text, or a whole skill, is installed.
- **Directive:** an HTML comment line, `<!-- factory:<name> ... -->`, that `build` reads in factory Markdown.

## Declaring variables

`factory.yaml` declares the variables and their values. It is committed and travels with a fab. It holds nothing that depends on one developer's machine.

```yaml
format: 2
name: dragonfly

env:
  harness:
    description: The agent tool that runs the workflows
    values:
      opencode: { label: In OpenCode }
      claude:   { label: In Claude Code }
      amp:      { label: In Amp (AMP_THREAD_ID is set) }
  workspace:
    description: Where each plan gets its own checkout
    values: [orca, orb, worktree]
    default: worktree
```

Rules:

1. `env` needs `format: 2`. With `format: 1` it is an error whose fix is `Set format: 2`.
2. `env` is a mapping from variable name to a variable. Variable names and value names follow the skill name rules ([Factory format](factory-format.md#validation) rule 5). A variable name also starts with a letter, because Git config names must.
3. A variable has `values` (required) and optionally `description` and `default`. Other keys are errors.
4. `values` is a non-empty list of value names, or a mapping from value name to a value entry. A value entry is a mapping with an optional `label`, or null. Duplicate values are errors.
5. `label` is a non-empty, single-line string. It says, in words an agent can act on, where it is when that value applies. Without a label, the value's label is `When <variable> is <value>`.
6. `default` is one value name or a non-empty list of value names, each declared in `values`. It applies when the developer selects nothing for the variable.
7. `description` is an optional non-empty, single-line string.
8. `env` with no variables (`env: {}` or `env:` with nothing after it) is valid and declares nothing.

## Selecting an environment

Each developer's selection lives outside the repository's files. A selection is a list of value names; one setting may list several values separated by commas (`opencode,claude`). Spaces around each value are ignored.

For each variable, the first of these sources that gives at least one declared value wins:

1. `--env <variable>=<values>` on the command line. The option can repeat, once per variable.
2. The process environment variable `FACTORY_ENV_<VARIABLE>`, where `<VARIABLE>` is the variable name in upper case with `-` replaced by `_` (`FACTORY_ENV_HARNESS`). For CI, cloud agents and setup scripts.
3. Git config `factory.env.<variable>`, from the highest-priority scope that sets it: worktree, then repository (`.git/config`), then global, then system. A scope can set the key more than once (`git config --add`); its values are combined.
4. The variable's `default` in `factory.yaml`.
5. Every declared value of the variable.

```sh
git config --global factory.env.harness opencode,claude   # every repository on this machine
git config factory.env.workspace orca                     # this repository and all its worktrees
FACTORY_ENV_HARNESS=amp metafab build                     # an Amp orb's setup script
```

Git config fits a personal setting: it is never committed, `--global` covers every repository, and every worktree of a repository shares `.git/config`, so a new Orca or `git worktree` checkout already has the selection.

Rules:

1. A value that the factory does not declare is ignored, with a warning that names its source. If no declared value is left, the next source applies. A developer's global setting can name a harness that one repository's factory does not declare, so this is not an error.
2. A Git config key or `FACTORY_ENV_*` variable for a variable the factory does not declare is ignored silently, for the same reason.
3. `--env` for an undeclared variable, or with no `=`, is an error (exit 1). Its fix lists the declared variables.
4. A selection is never empty: source 5 always applies.
5. Outside a Git repository, source 3 reads only the global and system scopes. When `git` is not installed, source 3 gives nothing and selection continues.

## Directives

Directives are HTML comments, so a source file still renders, and a `SKILL.md` still loads as a normal Agent Skill. A directive is a line that contains only `<!-- factory:<name> <arguments> -->`, with optional whitespace before and after. `build` removes every directive line from the output.

| Directive | Meaning |
| --- | --- |
| `<!-- factory:when <condition> -->` … `<!-- factory:endwhen -->` | Keep the text between when the condition can be true |
| `<!-- factory:switch env.<variable> -->` | Start a group of cases over one variable |
| `<!-- factory:case <value> [<value> ...] -->` | Text for those values, up to the next `case`, `default` or `endswitch` |
| `<!-- factory:default -->` | Text for every value that no `case` names |
| `<!-- factory:endswitch -->` | End the group |
| `<!-- factory:import <path> -->` | Replace this line with the body of another Markdown file |

Rules:

1. A line inside a fenced code block (opened by three or more backticks or tildes) is never a directive, so documentation can show directives.
2. A `factory:` comment line with any other name is an error. `start` and `end` are reserved: they mark the generated block in root `AGENTS.md`, and in source they are errors with their own message.
3. Every `when` closes with `endwhen` and every `switch` with `endswitch`, in the same file. Blocks may nest. A `case` or `default` appears only directly inside a `switch`; text between `switch` and the first `case` must be blank.
4. Directives are not allowed in frontmatter. A skill's `name` and `description` are the same in every environment. Write descriptions that do not depend on the harness.
5. In a format 1 factory, directives have no meaning: `build` copies them as text, and `check` warns once per file that they need `format: 2`.

### Where directives apply

| File | Directives |
| --- | --- |
| Every `.md` file in an installed skill directory, including `SKILL.md` below its frontmatter | All |
| `.factory/AGENTS.md` | All, rendered for every value (see [Root `AGENTS.md`](#root-agentsmd)) |
| A file that an `import` names | All, rendered in the importing file's context |
| Templates, scripts, and any file that is not `.md` | None; copied or left unchanged |

### Conditions

```text
condition := or
or        := and ("or" and)*
and       := not ("and" not)*
not       := "not" not | atom
atom      := "(" or ")"
           | "env." variable "==" value
           | "env." variable "!=" value
           | "env." variable "in" "[" value ("," value)* "]"
```

Names follow the name rules. Whitespace around `==`, `!=`, `,`, `[`, `]`, `(` and `)` is optional, so `env.harness==amp` is the same as `env.harness == amp`. Words (`and`, `or`, `not`, `in` and names) are separated from each other by whitespace or by one of those symbols. Whitespace is otherwise ignored. A condition that names an undeclared variable or value is an error.

### Switch

A `switch` is a group of `when` blocks over one variable. A `case` keeps its text when `env.<variable> in [<its values>]`; `default` keeps its text for every value no `case` names.

1. A value appears in at most one `case` of a switch.
2. A switch with no `default` must name every declared value of its variable. `check` reports each switch that misses a value, and names the values. Adding a value to a variable therefore lists every switch the author has to update.
3. A `default` is the last branch of its switch.

Use `when` for a few lines that apply to some environments. Use `switch` where every value needs its own text, so the check in rule 2 keeps them in step.

### Import

`<!-- factory:import <path> -->` replaces the directive line with the body of another Markdown file.

1. `<path>` is relative to the file that contains the directive, uses `/`, and ends in `.md`. It may not be absolute and must resolve inside `.factory/` after following symbolic links.
2. The imported file's frontmatter, when it starts with `---`, is removed. Its body is inserted unchanged, except that its directives are applied.
3. Imports may nest. An import that leads back to a file already being imported is an error that lists the chain.
4. A missing, unreadable or binary file is an error on the directive's line.
5. An import inside a block whose text is removed is not inserted, but `check` still validates it.

An imported file that is not inside a skill directory is a **partial**. It is never installed on its own. By convention partials live in `.factory/partials/`; the name is not reserved. One partial with one `switch` keeps each harness's version of a procedure side by side, and every workflow that needs it imports it.

## Rendering

`build` renders each file for the selection. A **scenario** picks one selected value for each variable. A block's condition is evaluated in every scenario in which all its enclosing conditions are true:

1. **True in every such scenario:** the text is kept, unchanged.
2. **False in every such scenario:** the text is removed.
3. **True in some:** the text is kept, after a label line.

Scenarios range only over the variables that the block's condition and its enclosing conditions name, because no other variable can change the result.

The label line is `**<label>:**` on its own line, followed by the block's text. `<label>` is built from the condition's variables that have more than one value in those scenarios: for each, the labels of its values for which the condition can be true, joined with ` or `; for several variables, joined with `, and `. A variable for which the condition can be true with every one of its values in those scenarios is left out. If that leaves no variable, as with an `or` across two variables, the label lists each value combination of the condition's variables for which the condition is true, its value labels joined with `, and `, and the combinations joined with ` or `. Variables follow their order in `env`, and values their order in `values`. Text in a `case` or `default` is labelled the same way.

A developer who selects one harness therefore gets that harness's text and nothing else. A developer who selects two gets both, each labelled, and never a third.

`build` removes text and directive lines and inserts label lines and imported bodies. It does not renumber lists or reflow text; the author makes each branch read correctly on its own.

### Root `AGENTS.md`

The generated block in root `AGENTS.md` is committed, so it must be the same for every developer. `build` renders `.factory/AGENTS.md` for **every** declared value of every variable, whatever the local selection is. Every block that does not apply to all values appears with its label.

## Conditional skills

A whole skill can depend on the environment. The condition sits in `factory.yaml`, so skill frontmatter stays a plain Agent Skill:

```yaml
skills:
  orca-worktrees: { when: env.workspace == orca }
  amp-threads:    { when: env.harness == amp }
```

1. `skills` needs `format: 2`. Each key names a skill in the factory; an unknown name is an error.
2. Each entry is a mapping with `when`, a condition. Other keys are errors.
3. A skill whose condition is false in every scenario is not installed, and `build` removes its owned output. A skill with no entry is always installed.
4. A skill whose condition is true in some scenarios is installed, and its `SKILL.md` gets the line `**Applies only <label>.**` after the generated comment.
5. A workflow named in the pipeline cannot have a `skills` entry: the pipeline in root `AGENTS.md` is the same for everyone and must name installed workflows.

## Commands

| Command | Behaviour |
| --- | --- |
| `metafab env` | Shows each declared variable, its selected values and the source of each. `--env` previews another selection |
| `metafab env set <variable>=<values> [--global]` | Replaces `factory.env.<variable>` in repository Git config, or global config with `--global`, then runs `build` |
| `metafab env unset <variable> [--global]` | Removes the key from that scope, then runs `build` |
| `metafab build [--env <variable>=<values>]... [--out <dir>]` | Builds for the selection. With `--out`, writes the output to `<dir>` instead (see below) |
| `metafab check [--env <variable>=<values>]...` | Validates every branch of every file; compares installed output with a build for the selection |

`env set` checks every value against `factory.yaml` and refuses an undeclared one (exit 1). `env set` and `env unset` need a Git repository for repository scope; outside one they exit 1 and suggest `--global` or `FACTORY_ENV_<VARIABLE>`.

`build --out <dir>` writes `<dir>/.agents/skills/`, `<dir>/.claude/skills/` (for the selected `agents`) and `<dir>/AGENTS.md` (the rendered block alone), and changes nothing else: no root files, no `.gitignore`, no Git hooks. With `agents: []` it writes nothing and says so. `<dir>` must not exist or must be empty, and must not be inside `.factory/`, `.claude/skills/` or `.agents/skills/`, where the next `build` would find it. A developer or agent uses it to see what a teammate on another harness receives.

## Validation

`check` adds these rules for a format 2 factory. They cover every branch, whatever the local selection is:

1. `env` and `skills` follow the grammar above.
2. Every directive is known, every block is closed in its own file, and every `case` and `default` sits directly in a `switch`.
3. Every condition parses and names declared variables and values, and the variables it and its enclosing conditions name span at most 1024 combinations of declared values.
4. Every switch without `default` names every value of its variable, and no value appears in two cases.
5. Every import resolves to a readable Markdown file inside `.factory/`, and no import chain loops.
6. No directive appears in frontmatter.
7. Installed output matches what `build` writes for the selection.

Rule 7 is the only check that depends on the selection. Because rules 1 to 6 validate every branch and every import, every selection compiles.

## Sharing

A fab carries `env` and `skills` in its `factory.yaml`. `import` and `update` need no new input: the developer's selection is in Git config, and a variable they have not selected falls back to its default or every value. `update` merges `factory.yaml` and directive lines as ordinary text, so edits to different branches of one block merge cleanly.

## Out of scope

- Detecting a harness or workspace automatically. A setup script sets `FACTORY_ENV_*` instead, and labels tell an agent how to recognise where it is.
- Choosing install destinations from `harness`. `agents` in `metafab.yaml` still decides where skills are installed.
- Conditions in frontmatter, and per-environment frontmatter fields such as `allowed-tools`.
- A configurable folder layout for skills.
