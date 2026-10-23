---
title: "chore: scaffold the metafab cli package and command runner"
status: building
kind: chore
pr:
needs: []
owns:
  - package.json
  - package-lock.json
  - tsconfig.json
  - vitest.config.ts
  - .github/workflows/**
  - src/cli.ts
  - src/output.ts
  - src/errors.ts
  - src/input.ts
  - src/commands/**
  - src/util/**
  - src/core/discovery.ts
  - test/helpers/**
  - test/cli/**
proves: "npm run verify → typecheck, tests and build pass; node dist/cli.js --help lists every v1 command"
---

# Plan 01: Project foundation

Set up the `@seasb/metafab` package, the command runner, and the shared conventions that every later plan uses: JSON output, exit codes, problem reporting, non-interactive input, and factory discovery.

## Specs

- [CLI: Installation](../specs/cli.md#installation)
- [CLI: Command behaviour](../specs/cli.md#command-behaviour)
- [CLI: Finding the factory](../specs/cli.md#finding-the-factory)
- [CLI: JSON output](../specs/cli.md#json-output)
- [CLI: Exit codes](../specs/cli.md#exit-codes)

## Decisions

| Topic | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript, ESM, compiled to `dist/` with `tsc` | Node.js 20+ is the only runtime requirement |
| Package location | Repository root (`package.json`, `src/`, `test/`) | One package; the `mark-*`/`mk*` folders are excluded by `files` |
| Argument parsing | `node:util` `parseArgs` plus a small dispatcher | No dependency, and subcommands such as `pipeline add` are simple |
| Prompts | `node:readline/promises` behind one `ask` module | Prompts are rare; one module makes the TTY rule easy to enforce |
| YAML | `yaml` (eemeli) | YAML 1.2, duplicate-key errors, line positions, comment-preserving edits |
| Tests | `vitest` | Fast, ESM-native |

Revisit a choice here before Plan 02 starts. Later plans assume them.

## Layout

```text
package.json          name @seasb/metafab, bin metafab, engines node >=20
tsconfig.json
src/
  cli.ts              entry: parse argv, dispatch, render, exit
  commands/<name>.ts  one module per command; returns a CommandResult
  core/               factory model, config, build, check, sources, merge...
  util/               fs, text (EOL, binary detection), git, yaml, suggest
  output.ts           human and JSON rendering
  errors.ts           MetafabError and exit codes
  input.ts            ask(), confirm(), NeedsInput
resources/
  metafab-skill/      built-in skill source (Plan 04)
test/
  helpers/            temp repo fixtures, in-process CLI runner
```

## Design

### Command result

Every command returns a value instead of printing directly:

```ts
interface CommandResult {
  ok: boolean;
  command: string;            // "check", "pipeline add", ...
  exitCode: ExitCode;
  problems?: Problem[];
  [key: string]: unknown;     // command-specific data
}

interface Problem {
  level: "error" | "warning";
  file: string;               // repository-relative, forward slashes
  line?: number;
  message: string;
  fix?: string;
}
```

`cli.ts` renders the result. With `--json`, it writes exactly one JSON object to stdout. All human text goes to stderr in JSON mode. Without `--json`, the human summary goes to stdout and problems to stderr.

### Errors and exit codes

```ts
enum ExitCode { Ok = 0, Failed = 1, NeedsInput = 2, FetchFailed = 3, InvalidFab = 4, NotOwned = 5 }
class MetafabError extends Error { exitCode; code; problems?; details? }
```

`cli.ts` catches a `MetafabError` and renders it as a failed `CommandResult`. Any other error is a bug: print the stack in human mode, `{ ok: false, error }` in JSON mode, and exit 1.

### Non-interactive input

`input.ts` is the only module that reads stdin.

- `ask()` and `confirm()` throw `NeedsInput` when `process.stdin.isTTY` is false.
- `NeedsInput` carries a list of required values: `{ name, flag?, description, choices? }`.
- `cli.ts` renders it as exit code 2 with `{ ok: false, command, required: [...] }`.
- Commands collect every missing value before throwing, so one run reports the complete list.

### Finding the factory

`findFactory(cwd)` walks from `cwd` to the file system root and returns the first directory that contains a `.factory/` directory. The returned `root` is where `AGENTS.md`, `.claude/` and `.agents/` live.

`resolveNewFactoryRoot(cwd)` (used by `init` and `import`) uses `findFactory`, then `git rev-parse --show-toplevel`, then `cwd`.

A missing factory throws a `MetafabError` with exit 1 and fix `Run metafab init`.

### Shared utilities

- `util/text.ts`: `toLF`, `equalIgnoringEOL`, `isBinary` (NUL byte in first 8 KB), single-line check.
- `util/fs.ts`: recursive list that returns forward-slash relative paths, copy with mode bits, tree compare.
- `util/suggest.ts`: Levenshtein-based "Did you mean" used by config keys, pipeline names, and skill names.
- `util/git.ts`: thin `execFile` wrapper. Never use a shell. Set `GIT_TERMINAL_PROMPT=0` in non-TTY mode.

## Steps

- [ ] Create `package.json`, `tsconfig.json`, `vitest.config.ts`, and a `files` list of `dist`, `resources`, `README.md`
- [ ] Add npm scripts `typecheck`, `test`, `build`, and `verify` (all three in order). The factory workflows run `npm run verify` as the gate for every pull request
- [ ] Add `src/cli.ts` with `--help`, `--version`, `--json`, and an unknown-command error with a suggestion
- [ ] Add `errors.ts`, `output.ts`, `input.ts` as designed above
- [ ] Add `findFactory` and `resolveNewFactoryRoot`
- [ ] Add the shared utilities
- [ ] Add stub modules for every v1 command that return "not implemented" (exit 1), so the help text is complete from the start
- [ ] Add test helpers: `makeRepo(files)` creates a temporary directory (optionally `git init`), and `runCli(argv, { cwd, tty })` runs the CLI in-process and captures stdout, stderr, and the exit code
- [ ] Add one spawned end-to-end test that runs `dist/cli.js` to cover the `bin` entry
- [ ] Add CI: Node 20 and 22 on Linux, macOS, and Windows running `npm run verify`, plus `node .factory/scripts/check.mjs` once

## Tests

- `--json` writes one parseable object to stdout and nothing else
- A `NeedsInput` in non-TTY mode exits 2 and lists every required value
- `findFactory` finds the nearest `.factory/` in a nested monorepo layout
- Paths in problems use forward slashes on Windows

## Done when

- `npx . --help` lists every v1 command
- CI is green on all three platforms
- Later plans can add a command by writing one module and its tests
