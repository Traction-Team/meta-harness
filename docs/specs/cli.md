# `metafab` CLI

The `metafab` CLI creates, validates, installs, and shares factories.

Related specifications:

- [Factory format](factory-format.md)
- [Building](building.md)
- [Sharing](sharing.md)
- [Configuration](configuration.md)

## Installation

The npm package is `@seasb/metafab`. It provides the `metafab` command and requires Node.js 20 or later.

| Installation | Command | Recommended use |
| --- | --- | --- |
| None | `npx @seasb/metafab <command>` | Evaluation and non-Node.js repositories |
| Project dependency | `npm install --save-dev @seasb/metafab`, then `npx metafab <command>` | Projects that pin the CLI version |
| Global dependency | `npm install --global @seasb/metafab`, then `metafab <command>` | People who use Metafab across repositories |

`pnpm dlx @seasb/metafab` and `bunx @seasb/metafab` are also supported.

Use the scoped package name with `npx` unless the project already installs it. The unscoped `metafab` package is unrelated.

A factory with `format: 2` needs Metafab 2 or later. Metafab 1 refuses a fab whose factory is format 2 at `import` and `update` with exit code 4 (`Unknown factory format 2`), and reports `"format" must be the integer 1` with exit code 1 when `check`, `build` or `publish` reads a repository's own `.factory/factory.yaml` that is format 2; `publish` fails this way because it runs `check` first. Prereleases are published under the npm dist-tag `next` and never under `latest`.

Git is required only for Git-based fab sources, and to read or write an [environment selection](environments.md#selecting-an-environment) in Git config.

## Command behaviour

All commands follow these rules:

1. Repository files contain all persistent project state. A developer's [environment selection](environments.md#selecting-an-environment) is personal, not project state: it lives in Git config (`factory.env.*`) or the process environment.
2. Besides the `factory.env.*` keys that `metafab env set` and `env unset` write to Git config, the download cache is the only state Metafab keeps outside the repository's files. It lives at `~/.metafab/cache/`.
3. A command never stages, commits, or pushes changes in the project repository. `publish` with a Git target commits and pushes only to the configured fab repository.
4. Every command supports `--json`.
5. A command never prompts when standard input is not a terminal.
6. Missing non-interactive input produces exit code 2 and a machine-readable list of required values.
7. `import` and `update` never run package scripts or factory scripts. They create a required file only by copying its template.
8. Repeated `init`, `build`, `map`, `check`, and `env` commands are safe.
9. `metafab <command> --help` (or `-h`) prints the command's usage line, its one-line description, its arguments and its options, and exits 0. Only `--help`, `-h` and a repeated `-h` such as `-hh` ask for help. Any other word after one dash is read as a group of short options. So `-help` and `-jh` are unknown options: the command exits with code 1 and writes nothing. When the letters after the single dash spell one of the command's long options, such as `-help` or `-dry-run`, the fix suggests the two-dash form (`--help`). It does not read the factory, run Git, use the network or prompt. With `--json` it writes the same as one JSON object. `metafab pipeline --help` lists the `pipeline` subcommands. `metafab --help` lists the commands, and `metafab --help <command>` is the same as `metafab <command> --help`.
10. When standard input ends before a prompt is answered, the value is missing input: the command exits with code 2 and the machine-readable list of required values, and writes nothing. Every prompt comes before the command's first write.

### Finding the factory

Every command except `init` and `import` uses the nearest factory. Inside a Git repository, it looks for `.factory/` in the current directory, then in each parent directory up to the repository's top level, and never above it. In a monorepo, the nearest factory wins. Outside a Git repository, it looks only in the current directory. When no `.factory/` is found, the command stops with exit code 1 and suggests `metafab init`.

The repository is the one Git reports for the current directory, so a linked worktree, a submodule, and a repository inside another repository's directory each stop at their own top level, and `GIT_DIR` and `GIT_WORK_TREE` are honoured. When `GIT_WORK_TREE` names a directory that does not contain the current directory, that directory is the repository, and it is the only one searched. When `git` is not installed or cannot answer, the nearest directory that contains a `.git` entry is the top level. A directory inside a Git directory with no work tree, such as a bare repository, is refused with exit code 1.

`init` and `import` also use the nearest factory when one exists. Otherwise they create `.factory/` at the top level of the current Git repository, or in the current directory outside one.

Factory.ai Droid also keeps its files in a `.factory/` directory, in projects and in the home directory. A `.factory/` that has no `factory.yaml` but has `settings.json` or `droids/` belongs to Droid. When the nearest `.factory/` is Droid's, every command, `init` included, stops with exit code 5 before it fetches or writes anything: `<path> belongs to Factory.ai Droid, not Metafab`. Metafab never adopts, writes or deletes files in it. Droid never writes `factory.yaml`, so a Metafab factory that has `settings.json` or `droids/` but has lost its `factory.yaml` gets back in use when the person adds a valid `.factory/factory.yaml` by hand, with `format: 1` and `name: <name>` (see [factory.yaml](factory-format.md)); `init` cannot do this for them, because it refuses the folder too.

The repository root for installed output (`AGENTS.md`, `.claude/`, `.agents/`) is the directory that contains `.factory/`.

The CLI creates files but does not provide an interactive editor. A person or agent edits the generated files directly.

## Commands

### Set up a factory

| Command | Behaviour |
| --- | --- |
| `metafab init [--agents <list>] [--adopt] [--git-hooks \| --no-git-hooks]` | Creates missing factory files, then runs `build` |
| `metafab build [--env <variable>=<values>]... [--out <dir>]` | Compiles the factory for the agent tools in `metafab.yaml` and the selected environment, and removes obsolete output owned by Metafab. With `--out`, writes a preview to `<dir>` instead |

`build` takes two options. `--env` [selects an environment](environments.md#selecting-an-environment) for this run. `--out <dir>` writes a [preview](environments.md#commands) of the output to `<dir>` and changes nothing else. Neither changes which agent tools `build` writes for: edit [`metafab.yaml`](configuration.md) for that. To remove all output, set `agents: []` and run `build`.

`build --out` exits 5 when `<dir>` exists and is not empty, and 1 when `<dir>` is a file or lies inside `.factory/`, `.claude/skills/` or `.agents/skills/`.

`init` creates these entries when they are missing:

- `.factory/factory.yaml`
- `.factory/AGENTS.md`
- `.factory/metafab.yaml`
- The Metafab block in the root `.gitignore` (see [Ignored build output](building.md#ignored-build-output))
- The Metafab lines in the root `.gitattributes` (see [Line endings](building.md#line-endings))

For a new `factory.yaml`, `init` writes `format: 1` and derives `name` from the directory that will contain `.factory/`. It lowercases the directory name, replaces each run of characters other than ASCII letters and digits with one hyphen, and removes leading and trailing hyphens. It uses `factory` when this produces an empty name. A new `.factory/AGENTS.md` is empty.

`init` writes `agents` to a new `metafab.yaml`. It uses `--agents` when present. Otherwise it asks in a terminal, or selects `all` without one.

`init` writes `git-hooks` to `metafab.yaml`, new or existing, when the key is absent. It writes `true` with `--git-hooks` and `false` with `--no-git-hooks`. Otherwise it asks in a terminal, "Run metafab build automatically after checkout, merge, and rebase?", with yes as the default. Without a terminal it does not ask and leaves the key absent, so hooks stay off; running without a terminal therefore does not exit 2 for this question. When the question is asked and standard input ends before an answer, `init` exits 2 like any other prompt (rule 10 of [Command behaviour](#command-behaviour)). `init` never changes a `git-hooks` value that is already set, and passing both flags is a usage error. See [Git hooks](building.md#git-hooks).

When `init` creates `metafab.yaml` and the repository root has an `orca.yaml` whose text does not contain `metafab build`, it suggests adding `npx --yes @seasb/metafab build` to `scripts.setup`, so new Orca worktrees get the factory skills. It never edits `orca.yaml`. The suggestion is a line in the summary and an entry in `suggestions` in the `--json` result.

`init` refuses to write through a symbolic link. When it would create or change `.factory/AGENTS.md` or the root `.gitattributes` and the path is a symbolic link, it exits with code 1 and changes nothing: `<path> is a symbolic link, so metafab init will not write through it`, with the fix `Replace it with a regular file, then run metafab init again`. A dangling link therefore never creates its target. A link to an existing file that needs no change is left alone.

`import` refuses a symbolic link at the root `.gitattributes` the same way, with `metafab import` in the message and fix, before it writes anything.

`init` does not create part directories. All directories are optional, and Git does not track empty directories.

An existing factory remains intact. `init` adds only missing entries.

### Adopt existing skills

Before changing the repository, `init` scans each selected destination. When it finds repository skills that Metafab does not own in `.claude/skills/` or `.agents/skills/`, it asks:

> Metafab manages installed skill directories as generated output. Move existing repository skills into `.factory/skills/` and ignore the generated copies?

`init` collects this consent before creating or changing any file. When accepted, it moves each complete skill directory, including supporting files, into `.factory/skills/<name>/`, then adds the destination to the managed `.gitignore` block and runs `build`.

Migration follows these rules:

1. Identical skills found in both destinations are moved once.
2. Different skills with the same name stop migration and are listed for manual resolution.
3. A skill that conflicts with an existing factory skill stops migration and is listed for manual resolution.
4. Files or directories in a skill destination that are not part of a valid skill stop migration and are listed for manual resolution.
5. Declining the migration leaves the repository unchanged.
6. `--adopt` gives the consent in advance, so the command does not ask.
7. When standard input is not a terminal and `--adopt` is absent, required migration consent produces exit code 2 and a machine-readable description of the decision that names `--adopt` as its flag.
8. A migration stopped by rules 2 to 4 exits with code 5 and changes nothing.

A symbolic link inside a skill must resolve inside `.factory/` after the move. A link that leaves it, directly or through a symlinked directory, stops migration under rule 4 with `Symlink <path> points outside .factory/ after the move` and exit code 5. A link into another skill adopted in the same run is accepted: after both moves it resolves inside `.factory/skills/`, and the built output holds the linked content.

Metafab does not stage the moved, deleted, or generated files. Git shows the migration for review.

Run `metafab init` again to adopt a skill added directly to a managed destination later. `build` does not prompt or adopt files.

### Edit a factory

| Command | Behaviour |
| --- | --- |
| `metafab create <path> [--description <text>]` | Creates `.factory/<path>/SKILL.md` with valid frontmatter. The last path segment is the skill name |
| `metafab pipeline add <workflow> [--after <workflow>] [--stop <text>]` | Adds an existing workflow to the pipeline, at the end or after `--after` |
| `metafab pipeline remove <workflow>` | Removes a workflow from the pipeline. The workflow file does not change |

To rename a skill, move its directory and change `name` in its `SKILL.md`; for a workflow in the pipeline, also change its entry in `factory.yaml`. `metafab check` reports any of these left out.

`pipeline remove` refuses an entry whose `factory.yaml` anchor another entry aliases: it exits with code 1, changes nothing, and the suggested fix is `Remove the alias to <anchor> first`.

The path places the skill. For example, `metafab create workflows/review-slice` creates a workflow, and `metafab create review/security` creates a skill in the `review` group.

`create` requires a non-empty description. It uses `--description` when present, asks for the description when standard input is a terminal, and exits with code 2 without changing files when neither source is available. The generated file contains `name` and `description` frontmatter, followed by a heading made from the skill name and an empty body.

Before writing, `create` validates the resulting name. It refuses a path inside an existing skill directory, a path that would contain an existing skill directory, and a path that is itself a [reserved top-level directory](factory-format.md#reserved-names), such as `workflows`.

`create` stops when the name is not unique in the factory, including a skill directory it cannot read. It prints the new path and does not run `build`.

Metafab does not create templates, scripts, or other files. Create them directly.

### Inspect a factory

`metafab map` prints:

- The pipeline with its stops
- The standalone workflows
- Every skill, grouped by directory

With `--json`, `map` also includes each skill's path and frontmatter.

### Select an environment

| Command | Behaviour |
| --- | --- |
| `metafab env` | Shows each declared variable, its selected values and the source of each. `--env` previews another selection |
| `metafab env set <variable>=<values> [--global]` | Replaces `factory.env.<variable>` in repository Git config, or global config with `--global`, then runs `build` |
| `metafab env unset <variable> [--global]` | Removes the key from that scope, then runs `build` |

`env` with no variables declared prints `This factory declares no environment variables.` and exits 0. `env set` and `env unset` warn when a higher-priority source (a `FACTORY_ENV_*` variable, or Git config in a higher scope) still overrides the value they wrote.

### Validate a factory

`metafab check [--env <variable>=<values>]...` validates the following, and reports their problems in this order:

1. The [factory format](factory-format.md#validation)
2. [`metafab.yaml`](configuration.md#validation)
3. [Required repository files](factory-format.md#required-repository-files): each missing or blocked one is a warning
4. Problems that stop `build` from planning its output
5. Unresolved Git conflict markers
6. Remaining `.upstream` conflict files
7. Installed skill copies, the generated `AGENTS.md` block and the installed `metafab` skill
8. Warnings from planning the build output

With `--env`, `check` compares the installed output with a build for that selection.

In a format 2 factory, `check` validates every directive branch and every conditional skill whatever the selection; only the comparison with installed output depends on it.

When items 1 to 4 include an error, items 7 and 8 are not checked, and `check` says so with one warning.

Each problem includes a path, line number, and suggested fix. Errors return exit code 1. Warnings do not change the exit code.

### Share a factory

| Command | Behaviour |
| --- | --- |
| `metafab import <source> [--agents <list>] [--force] [--adopt] [--setup \| --no-setup]` | Copies a fab into `.factory/`, records it as the upstream, adopts existing repository skills when required, builds it, creates missing required files the person agrees to, and prints a review summary. In a repository without a factory, it creates local configuration without creating source placeholders |
| `metafab update [--to <version\|range\|ref>] [--dry-run] [--no-build] [--setup \| --no-setup]` | Merges a newer upstream version into `.factory/`, or overwrites from an unversioned source, and creates missing required files that are new upstream when the person agrees. The source comes from the `upstream` key in `metafab.yaml` |
| `metafab diff [<path>]` | Shows local edits since the recorded upstream version |
| `metafab detach` | Removes upstream metadata without changing factory files |
| `metafab publish [--dry-run] [--tag <tag>]` | Packages `.factory/` as a fab and publishes it to npm, a Git fab repository, or both |

See [Sharing a factory](sharing.md) for source handling, merge rules, and publication behaviour.

## Configuration

Metafab reads repository settings from `.factory/metafab.yaml`. [Configuration](configuration.md) defines every key.

The `upstream` key in `metafab.yaml` records the fab that the factory came from. Only `import`, `update`, and `detach` change it. Metafab has no lock file.

## JSON output

With `--json`, a command writes one JSON object to standard output. Human-readable messages go to standard error. Every result contains `ok`, `command`, `exitCode` (the process exit code) and `problems`, including a successful result with nothing to report, where `problems` is empty, and `metafab --version --json`, which adds `version`. A result for missing input (exit 2) contains `required` instead of `problems`.

Each problem has `level` (`error` or `warning`), `file`, `message`, and `line` when it is known. Every error also has `fix`: the next step the person can take. A warning has `fix` when there is one. `file` uses `/` separators on every platform, also when it starts with a local path the person typed; the message may repeat that path as typed. A failed command (exit 1, 3, 4 or 5) reports at least one error, so without `--json` standard error shows at least one `fix:` line.

A help result has `command: "help"`, `exitCode: 0` and empty `problems`. `metafab --help` adds `commands`, a list of `{ command, usage, description }`. `metafab <command> --help` adds `help`: `{ command, usage, description, arguments, options }`, where each argument is `{ name, description, optional }` and each option is `{ flag, value, description }` (`value` only for an option that takes one, such as `<list>`); `options` ends with `--json` and `-h, --help`. `metafab pipeline --help` adds `help`: `{ command: "pipeline", subcommands }`, a list of `{ command, usage, description }`. `metafab env --help` adds the same `subcommands` to its `help`, naming `env set` and `env unset`. The JSON help result has no `summary`.

`env` adds `variables`, a list of `{ name, description?, values: [{ name, label }], selected, source, scope?, from? }` in declaration order. `selected` is a list of value names (`string[]`) in the order `values` declares them, and `source`, `scope` and `from` say where that variable's selection came from. `source` is `option`, `environment`, `git`, `default` or `all`; `scope` (`worktree`, `local`, `global` or `system`) is set for `git`, and `from` (such as `FACTORY_ENV_HARNESS`) for `environment`. `build` adds `env` in the same shape when the factory declares variables.

Example failed check:

```json
{
  "ok": false,
  "command": "check",
  "exitCode": 1,
  "problems": [
    {
      "level": "error",
      "file": ".factory/factory.yaml",
      "line": 8,
      "message": "Pipeline names unknown workflow \"review-slices\"",
      "fix": "Did you mean \"review-slice\"?"
    }
  ]
}
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command completed successfully |
| `1` | Validation failed or an update produced conflicts |
| `2` | Required input was unavailable: standard input was not a terminal, or it ended before the value was given |
| `3` | Metafab could not fetch a source |
| `4` | Metafab rejected a fab because its format, path, or integrity was invalid |
| `5` | The command would overwrite output that Metafab does not own, including a fab repository edited outside `publish`, or the nearest `.factory/` belongs to Factory.ai Droid |
