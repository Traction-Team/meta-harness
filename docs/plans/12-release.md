# Plan 12: Release v1

Verify the CLI against real agent tools, answer the open questions that need experiments, and publish `@seasb/metafab` 1.0.0.

Depends on: Plans 01 to 11.

## Specs

- [README: Version 1 scope](../specs/README.md#version-1-scope)
- [README: Open questions](../specs/README.md#open-questions)
- [CLI: Installation](../specs/cli.md#installation)

## Steps

### Hardening

- [ ] Run the spec's CI recipe (`build`, `git diff --exit-code`, `check`) in our own CI against the `mark4-like` fixture
- [ ] Windows pass: paths, CRLF checkouts, executable bits, long paths
- [ ] Review every error message for a fix line and a correct exit code
- [ ] Confirm every command supports `--json` and never prompts without a terminal

### Agent tool verification (manual, recorded in `docs/verification.md`)

- [ ] Claude Code: loads `.claude/skills/`, reads `AGENTS.md` directly and through the `CLAUDE.md` import
- [ ] Codex, opencode: load `.agents/skills/`
- [ ] Cursor and Copilot with both `claude` and another target selected: record how they handle duplicate skills ([spec open question](../specs/building.md#duplicate-skills)); update the spec
- [ ] The built-in `metafab` skill: an agent can add a workflow, add it to the pipeline, build, and fix a `check` failure

### First fab

- [ ] Port the Mark IV factory into a `.factory/` and publish it as `@seasb/fab-mark4` and `github:seasb/fab-mark4`
- [ ] Import it into a fresh repository with `npx`, `pnpm dlx`, and `bunx`

### Package release

- [ ] Package `README.md` with install options and the quick-start from the spec
- [ ] Release workflow: tag → test → `npm publish --provenance --access public`
- [ ] Publish `@seasb/metafab@1.0.0`

## Done when

- `npx @seasb/metafab import @seasb/fab-mark4 --agents claude,codex` works in a fresh repository on macOS, Linux, and Windows
- Every open question in the roadmap is answered or explicitly deferred
