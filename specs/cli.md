# `metafab` CLI

The `metafab` CLI creates, validates, installs, and shares factories.

Related specifications:

- [Factory format](factory-format.md)
- [Linking](linking.md)
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
3. A command never stages, commits, or pushes changes.
4. Every command supports `--json`.
5. A command never prompts when standard input is not a terminal.
6. Missing non-interactive input produces exit code 2 and a machine-readable list of required values.
7. `add` and `update` never run package scripts.
8. Repeated `init`, `link`, and `check` commands are safe.

The CLI creates files but does not provide an interactive editor. A person or agent edits the generated files directly.

## Commands

### Set up a factory

| Command | Behaviour |
| --- | --- |
| `metafab init [--from <source>] [--agents <list>]` | Creates missing factory files, then runs `link`. With `--from`, it also adds the specified fab |
| `metafab link [--agents <list>] [--save]` | Compiles the factory for the selected agent tools and removes obsolete output owned by Metafab |
| `metafab unlink` | Removes all output owned by `link`. It does not change `.factory/` |

`init` creates these entries when they are missing:

- `.factory/factory.yaml`
- `.factory/AGENTS.md`
- Standard factory directories
- `.factory/metafab.yaml`

An existing factory remains intact. `init` adds only missing entries.

### Create factory parts

| Command | Behaviour |
| --- | --- |
| `metafab create workflow <name> [--description D] [--uses <list>] [--pipeline] [--after <workflow>] [--stop S]` | Creates `.factory/workflows/<name>/SKILL.md`. `--pipeline` also adds it to the pipeline, at the end or after `--after` |
| `metafab create skill <name> [--description D] [--uses <list>] [--in <folder>] [--bundle inline]` | Creates a skill in `.factory/skills/` or the specified group directory |
| `metafab create template <name>` | Creates `.factory/templates/<name>.md` |
| `metafab create script <name>` | Creates an executable `.factory/scripts/<name>` |
| `metafab pipeline add <workflow> [--after <workflow>] [--stop S]` | Adds an existing workflow to the pipeline |
| `metafab pipeline remove <workflow>` | Removes a workflow from the pipeline. The workflow file does not change |

Create commands write a valid scaffold and print its path. They do not run `link`.

`metafab rename <old> <new>` renames a skill or workflow. It moves the directory and updates `name`, every `uses` list, and the pipeline.

### Inspect a factory

| Command | Behaviour |
| --- | --- |
| `metafab list [workflows\|skills\|templates\|scripts]` | Lists all parts, or only the selected type |
| `metafab map` | Prints the pipeline with its stops, the standalone workflows, and the `uses` tree of each workflow |
| `metafab status [--offline]` | Reports upstream state, local edits, conflicts, target agents, and link state |

With `--json`, `list` includes each part's path and frontmatter.

`status` checks the registry for a newer upstream version. `--offline` skips that check.

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
| `metafab add <source> [--force]` | Copies a fab into `.factory/`, records its source, links it, and prints a review summary |
| `metafab update [--to <version\|range>] [--dry-run] [--no-link]` | Merges a newer upstream version into `.factory/` |
| `metafab diff [<path>]` | Shows local changes from the recorded upstream version |
| `metafab detach` | Removes upstream metadata without changing factory files |
| `metafab publish [--dry-run] [--tag <tag>]` | Packages and publishes `.factory/` as a fab |

See [Sharing a factory](sharing.md) for source handling, merge rules, and publication behaviour.

## Configuration

Metafab reads repository settings from `.factory/metafab.yaml`. [Configuration](configuration.md) defines every key.

Upstream state belongs in `.factory/metafab.lock`, not `metafab.yaml`. Only `add`, `update`, and `detach` change the upstream entry.

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
      "fix": "Did you mean git-conventions? You can also create it with metafab create skill git-convention."
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
| `5` | The command would overwrite output that Metafab does not own |
