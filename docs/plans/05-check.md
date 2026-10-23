# Plan 05: `metafab check`

Validate the factory source, the configuration, and the installed output in one command.

Depends on: [Plan 04](04-build.md).

## Specs

- [CLI: Validate a factory](../specs/cli.md#validate-a-factory)
- [Factory format: Validation](../specs/factory-format.md#validation)
- [Configuration: Validation](../specs/configuration.md#validation)
- [Building: Ownership](../specs/building.md#ownership), [Repeatability](../specs/building.md#repeatability)
- [Sharing: Merge rules](../specs/sharing.md#merge-rules) (conflict markers and `.upstream` files)

## Design

`check` collects problems from these sources, in this order:

| # | Source | Level |
| --- | --- | --- |
| 1 | `loadFactory` problems ([Plan 02](02-factory-model.md)) | error |
| 2 | Config problems ([Plan 03](03-configuration.md)) | error |
| 3 | Unresolved conflict markers in text files under `.factory/` | error |
| 4 | `*.upstream` files under `.factory/` | error |
| 5 | Build drift: run `planBuild` and compare with the disk | error |
| 6 | Build warnings, such as an `AGENTS.md` block over 300 lines | warning |

Steps 5 and 6 run only when steps 1 and 2 report no errors, because the planner needs a valid model. Report `Build output not checked: fix the errors above first` as a warning in that case.

### Drift messages

`planBuild` already knows the desired content of every owned path. Compare it with the disk and report one problem per difference:

| Situation | Message | Fix |
| --- | --- | --- |
| Installed skill missing (fresh clone) | `Installed skill '<name>' is missing from <dest>` | `Run metafab build` |
| Installed file differs | `<path> differs from the build output` | `Edit .factory/<relDir>/ instead, then run metafab build` |
| Owned directory without source | `<path> has no source in .factory/` | `Run metafab build` |
| Built-in skill from another CLI version | `The installed metafab skill is from <v>; this CLI is <v>` | `Run metafab build` |
| `AGENTS.md` / `CLAUDE.md` / `.gitignore` block differs or is missing | `<file> factory block is out of date` | `Run metafab build` |
| Unowned directory in the way | as `build` | `Move it into .factory/skills/ or rename it` |

When many installed skills are missing, collapse them into one problem per destination so a fresh clone shows a short report.

### Conflict markers

Scan text files under `.factory/` for lines that start with `<<<<<<< `, `>>>>>>> `, or are exactly `=======` or start with `||||||| `. Report the first marker line in each file. Skip binary files.

### Output

Human output prints `file:line: level: message` and an indented `fix:` line, then a summary `N errors, M warnings`. Exit 1 when any error exists.

## Steps

- [ ] Conflict marker and `.upstream` scanners
- [ ] Drift comparison on top of `planBuild`
- [ ] `check` command with ordering, collapsing, and the summary line

## Tests

- A valid, built fixture passes with exit 0
- A fresh clone (no installed output) fails with one "run metafab build" problem per destination
- A hand edit in `.claude/skills/x/SKILL.md` fails and points to the source
- A conflict marker and a `.upstream` file each fail with the right path and line
- A 301-line `AGENTS.md` block is a warning and exit 0
- The spec's JSON example shape is produced for a misspelled pipeline entry
