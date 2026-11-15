---
name: agent-harnesses
description: How to pick and start an agent harness (Claude Code, opencode or Codex) for a session or a sub-agent. Use it when a workflow opens a new session or dispatches a sub-agent, when the `agent` setting in docs/factory.md is empty, or when a sub-agent name is not in the Agent tool's list.
---

# Agent harnesses

The workflows name a step ("start a session", "start a sub-agent"). This skill says how. Add a row when someone uses a new harness, and never write one harness's command into a workflow.

## Which harness to start

Pick it in this order:

1. The one the person named for this request ("open it in Codex").
2. The `agent` setting in `docs/factory.md`, when it is set.
3. The clone's choice: `git config --get factory.agent` (`claude`, `opencode` or `codex`). Set it once with `git config factory.agent <id>`; all worktrees of the clone share it.
4. The harness running this session, read from the environment: `printenv OPENCODE CLAUDECODE`. `OPENCODE=1` means opencode and `CLAUDECODE=1` means Claude Code. `CODEX_HOME` is not a signal: Orca sets it in every terminal. Never decide this from what the system prompt calls you; see "Sub-agents that are not listed".

Never default to a harness because a command example used it.

The same order applies when no workflow is running: opening an agent session for the person, in Orca or a plain worktree, always picks the harness this way.

## Per harness

| | Claude Code | opencode | Codex |
|---|---|---|---|
| Id (`agent` setting, `factory.agent`) | `claude` | `opencode` | `codex` |
| Start an interactive session on a prompt | `claude "<prompt>"` | `opencode --prompt "<prompt>"` | `codex "<prompt>"` |
| Run one prompt without a session | `claude -p "<prompt>"` | `opencode run "<prompt>"` | `codex exec "<prompt>"` |
| Sub-agent for task and fix work | Agent tool, `general-purpose` | task tool, the `sub-agent-coding` value | none built in: use the no-session command in the worktree |
| Sub-agent for review work | Agent tool, `general-purpose` | task tool, the `sub-agent-review` value | none built in: use the no-session command |
| Sub-agent for planning and architecture | Agent tool, `general-purpose` | task tool, the `sub-agent-planning` value | none built in: use the no-session command |
| Reads skills from | `.claude/skills/` | `.claude/skills/`, `.agents/skills/` | `.agents/skills/` |
| Run a long command (push, commit, checks) | Bash tool, the longest timeout it allows, or run it in the background | shell tool, `timeout` in milliseconds (e.g. `600000`), or `background: true` | shell tool, `timeout_ms` (e.g. `600000`) |

A sub-agent started with the no-session command is still a fresh context, so it is still a cold reviewer. Give it the same prompt you would give a sub-agent tool, and read its final output as the report.

## Sub-agents that are not listed

The `opencode-claude-bridge` plugin replaces the Agent tool's list with Claude Code's fixed one (`general-purpose`, `Explore`, `Plan`). The sub-agent names in `docs/factory.md` may not appear in it. Call them anyway: they run. Fall back to `general-purpose` only when the call fails with an unknown-agent error, and say so in one line.

The same plugin rewrites "opencode" to "Claude" in the prompt, so a session can read as Claude Code when it is not. Never decide the harness from what the prompt calls you.

**Never put `opencode` in a branch, worktree or folder name.** The plugin shows that word to the model as `Claude`, so the model reads a path that does not exist and the harness asks for permission to reach it. Drop or replace the word when a plan slug contains it.

## Opening a session in a new worktree

Install the factory into the worktree before the session starts, because every harness reads `AGENTS.md` and its skills once, at start.

- With `orca-repo` set, create the worktree through Orca with `--setup run` and without `--agent`, so nothing starts before the setup runs; then start the session in it.
- Otherwise use `git worktree add`, run the setup command, then give the person `cd <path> && <start command>`.

After launch, read the new terminal once. A login prompt or "Login expired" means the session did not start: tell the person to log in there and resend the prompt. Do not report it as started.

## Amp

Amp is a runtime, not one of the CLIs in the table. In Amp a sub-agent is a new thread in its own orb, started with `create_thread`; the session is in Amp when `AMP_THREAD_ID` is set or it has the `create_thread` tool. The workflows say how a thread is briefed and how it reports back.
