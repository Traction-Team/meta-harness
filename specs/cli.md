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

Git is required only for Git-based fab sources.

## Command behaviour

All commands follow these rules:

1. Repository files contain all persistent project state.
2. The download cache is the only state outside the repository. It lives at `~/.metafab/cache/`.
3. A command never stages, commits, or pushes changes in the project repository. `publish` with a Git target commits and pushes only to the configured fab repository.
4. Every command supports `--json`.
5. A command never prompts when standard input is not a terminal.
6. Missing non-interactive input produces exit code 2 and a machine-readable list of required values.
7. `import` and `update` never run package scripts.
8. Repeated `init`, `build`, `map`, and `check` commands are safe.

### Finding the factory

Every command except `init` and `import` uses the nearest factory. It looks for `.factory/` in the current directory, then in each parent directory. In a monorepo, the nearest factory wins. When no `.factory/` is found, the command stops and suggests `metafab init`.

`init` and `import` also use the nearest factory when one exists. Otherwise they create `.factory/` at the root of the current Git repository, or in the current directory outside a Git repository.

The repository root for installed output (`AGENTS.md`, `.claude/`, `.agents/`) is the directory that contains `.factory/`.

The CLI creates files but does not provide an interactive editor. A person or agent edits the generated files directly.

## Commands

### Set up a factory

| Command | Behaviour |
| --- | --- |
| `metafab init [--agents <list>]` | Creates missing factory files, then runs `build` |
| `metafab build` | Compiles the factory for the agent tools in `metafab.yaml` and removes obsolete output owned by Metafab |

`build` takes no options. Edit [`metafab.yaml`](configuration.md) to change what it writes. To remove all output, set `agents: []` and run `build`.

`init` creates these entries when they are missing:

- `.factory/factory.yaml`
- `.factory/AGENTS.md`
- `.factory/metafab.yaml`
- The Metafab lines in the root `.gitattributes` (see [Line endings](building.md#line-endings))

`init` writes `agents` to a new `metafab.yaml`. It uses `--agents` when present. Otherwise it asks in a terminal, or selects `all` without one.

`init` does not create part directories. All directories are optional, and Git does not track empty directories.

An existing factory remains intact. `init` adds only missing entries.

### Edit a factory

| Command | Behaviour |
| --- | --- |
| `metafab create <path> [--description D] [--uses <list>]` | Creates `.factory/<path>/SKILL.md` with valid frontmatter. The last path segment is the skill name |
| `metafab rename <old> <new>` | Renames a skill. It moves the directory and updates `name`, every `uses` list, and the pipeline |
| `metafab pipeline add <workflow> [--after <workflow>] [--stop S]` | Adds an existing workflow to the pipeline, at the end or after `--after` |
| `metafab pipeline remove <workflow>` | Removes a workflow from the pipeline. The workflow file does not change |

The path places the skill. For example, `metafab create workflows/review-slice` creates a workflow, and `metafab create review/security` creates a skill in the `review` group.

`create` stops when the name is not unique in the factory. It prints the new path and does not run `build`.

Metafab does not create templates, scripts, or other files. Create them directly. Edit frontmatter such as `bundle` directly.

### Inspect a factory

`metafab map` prints:

- The pipeline with its stops
- The standalone workflows
- Every skill, grouped by directory
- The `uses` tree of each workflow

With `--json`, `map` also includes each skill's path and frontmatter.

### Validate a factory

`metafab check` validates:

- The [factory format](factory-format.md#validation)
- Installed skill copies
- The generated `AGENTS.md` block
- The installed `metafab` skill
- [`metafab.yaml`](configuration.md#validation)
- Unresolved Git conflict markers
- Remaining `.upstream` conflict files

Each problem includes a path, line number, and suggested fix. Errors return exit code 1. Warnings do not change the exit code.

### Share a factory

| Command | Behaviour |
| --- | --- |
| `metafab import <source> [--agents <list>] [--force]` | Copies a fab into `.factory/`, records it as the upstream, builds it, and prints a review summary. Runs `init` first when the repository has no factory |
| `metafab update [--to <version\|range\|ref>] [--dry-run] [--no-build]` | Merges a newer upstream version into `.factory/`, or overwrites from an unversioned source. The source comes from the `upstream` key in `metafab.yaml` |
| `metafab diff [<path>]` | Shows local edits since the recorded upstream version |
| `metafab detach` | Removes upstream metadata without changing factory files |
| `metafab publish [--dry-run] [--tag <tag>]` | Packages `.factory/` as a fab and publishes it to npm, a Git fab repository, or both |

See [Sharing a factory](sharing.md) for source handling, merge rules, and publication behaviour.

## Configuration

Metafab reads repository settings from `.factory/metafab.yaml`. [Configuration](configuration.md) defines every key.

The `upstream` key in `metafab.yaml` records the fab that the factory came from. Only `import`, `update`, and `detach` change it. Metafab has no lock file.

## JSON output

With `--json`, a command writes one JSON object to standard output. Human-readable messages go to standard error.

Example failed check:

```json
{
  "ok": false,
  "command": "check",
  "problems": [
    {
      "level": "error",
      "file": ".factory/workflows/review-slice/SKILL.md",
      "line": 4,
      "message": "uses names skill 'git-convention', which does not exist",
      "fix": "Did you mean git-conventions? You can also create it with metafab create skills/git-convention."
    }
  ]
}
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command completed successfully |
| `1` | Validation failed or an update produced conflicts |
| `2` | Required input was unavailable in non-interactive mode |
| `3` | Metafab could not fetch a source |
| `4` | Metafab rejected a fab because its format, path, or integrity was invalid |
| `5` | The command would overwrite output that Metafab does not own, including a fab repository edited outside `publish` |
