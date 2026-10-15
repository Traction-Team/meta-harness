# Agent sessions: how to find them, read their state and start them

Researched 16 Oct 2026, on one macOS machine with Claude Code 2.1.289, Codex, opencode and Orca installed. The nodeterm parts come from [`../../mk3/research/nodeterm-learnings.md`](../../mk3/research/nodeterm-learnings.md).

The question: the monitor does not host agents. Can it still see which sessions run, in which fab and which program, and can it start new ones in each harness?

## Summary

Yes. Every harness writes enough to disk, or has a CLI, to find its sessions and the folder each one runs in. The folder gives the fab and the worktree. The program is harder: the folder does not say which program a session follows. So:

- **Sessions that `fab run` starts are matched exactly.** It writes a run record first, and it gives the session an ID, a name or a prompt line that the monitor can find later.
- **Other sessions are matched by folder**, and by program only when the branch or transcript names one. If not, they show as "program unknown".

Each harness gets a small adapter with three jobs: **list** sessions, read their **state**, and **start** one. Mark III's nodeterm research shows how to add hooks later for exact state. Mark IV starts without hooks.

## Find: where each harness keeps its sessions

| Harness | Source | What it gives | Live? |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/sessions/<pid>.json` | `pid`, `sessionId`, `cwd`, `name`, `status` (seen: `idle`), `kind` (`interactive`), `version`, `startedAt`, `updatedAt`, a messaging socket path | Yes. One file for each running process. Check that the PID is alive, because a crash can leave a file |
| Claude Code | `~/.claude/projects/<cwd with / as ->/<sessionId>.jsonl` | The full transcript, grouped by folder | History |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl` | The first line is `session_meta`, with `session_id` and `cwd`. Then the transcript | History. "Live" is a recent file change plus a running `codex` process with that folder. `codex agents` lists sessions on Codex's shared app-server, which may be a better source. Not yet tested |
| opencode | `~/.local/share/opencode/opencode.db` (SQLite) | Table `session`: `id`, `directory`, `title`, `parent_id`, `cost`, tokens. Messages in `message` and `part` | History. "Live" is not in the table. Use a running `opencode` process with that folder, or `opencode serve`'s API if it is running |
| Orca | `orca worktree ps --json`, `orca terminal list --json` | Each worktree: `path`, `branch`, `repo`, `workspaceStatus`, parent and child worktrees. Each terminal, with a handle | Yes, through Orca's runtime |
| nodeterm | tmux sessions `nt-<id>` on the socket `tmux -L node-terminal` | The node ID. The agent inside is a Claude Code or Codex session, so it also shows in those sources | Yes |

Notes:

- **Read the files as untrusted input.** They are internal formats. Parse them with care, skip what you do not understand, and never fail the whole list because one file is bad.
- **Subagents.** opencode has `parent_id`. Claude Code subagents write their own transcripts. Show only top-level sessions, and do not let a subagent change its parent's state. (nodeterm learned this the hard way.)
- **Orca and nodeterm wrap other harnesses.** One Claude Code session inside an Orca terminal shows in both sources. Merge them by folder and process: the Orca entry gives the worktree and a way to focus it, and the Claude entry gives the state.

## State

| Harness | Working / idle | Waits for you |
| --- | --- | --- |
| Claude Code | `status` in the session file | Not seen yet in the file. Test whether `status` changes during a permission prompt. If not, a `Notification` or `PermissionRequest` hook gives it |
| Codex | Recent writes to the rollout file mean working | Not visible without hooks |
| opencode | Recent rows in `message` or `part` mean working | Not visible without hooks or `opencode serve` |
| Orca | `orca terminal wait --for tui-idle`, terminal preview | Orca's `workspaceStatus`, where it reports one |

The monitor shows `unknown` when it cannot tell. **Unknown is not gone.** A check that times out does not mean the session ended.

**Hooks, later.** nodeterm gets exact state for every harness from hooks: one script per CLI that posts each event to a local server and always exits with success. The lessons from that work apply as they are: hooks must fail open, each CLI's hook format is different, Codex ignores hooks it does not trust, and a subagent's events must not change its parent. `fab hooks install` can add this when the passive view is not enough. Do not copy nodeterm's code. It is under the Business Source License.

## Match a session to the fab

1. **Fab.** Find the fab whose root contains the session's folder. A worktree of the repository is the same fab. Check its `.fab/` folder, because a branch can have a different fab version or none.
2. **Run record.** If a run record names this session ID, the program and inputs are known. Done.
3. **`fab-run:` line.** Search the start of the transcript for `fab-run: <id>`. If found, link the session to that run record and write the session ID into it.
4. **Branch.** If the branch matches a program's branch pattern (for example `fab/build-slice/…`, or the team's own pattern in `fab.yaml`), use that program.
5. **Transcript.** If the first prompt names a program (`build-slice`, or `.fab/programs/build-slice/`), use that program. Mark the match `inferred`.
6. **Else:** "in this fab, program unknown".

Step 5 reads only the first user message and the first skill load, not the whole transcript. That keeps it cheap, and it avoids a later mention of a program being read as the program the session follows.

## Start: one launch per harness

`fab run` writes the run record first, then calls the adapter.

| Harness | Launch | How the session is matched |
| --- | --- | --- |
| Claude Code | In a new terminal window: `claude --session-id <uuid> -n "<fab> · <program>" "<prompt>"` | Exact. `--session-id` sets the ID, and it appears in `~/.claude/sessions/<pid>.json` |
| Codex | In a new terminal window: `codex "<prompt>"` | By transcript: the `fab-run:` line in the newest rollout file with the same `cwd` |
| opencode | In a new terminal window: `opencode <dir>` with the prompt, or `opencode run "<prompt>"` without a window | By the `session` table: `directory`, start time, and the `fab-run:` line in the first message. Confirm how to pass a first prompt to the opencode TUI |
| Orca, current worktree | `orca terminal create --worktree path:<dir> --title "<program>" --command "<agent command>" --json` | Exact. The JSON gives the terminal handle |
| Orca, new worktree | `orca worktree create --name <branch> --repo path:<dir> --agent <id> --prompt "<prompt>" --json` | Exact. Read `result.agentTerminalHandle` |
| nodeterm | Not possible from outside. Its control CLI needs a verified nodeterm node | The session can still be seen, through Claude Code or Codex |

For a new worktree without Orca, `fab run` runs `git worktree add`, then `fab install --runtime <harness>` in the new folder, then starts the session there.

**Sending the prompt.** The prompt is passed as one argument, with no shell interpretation, or through a file when it is long. Never paste a prompt into a running session from the monitor in the first version. nodeterm's work on safe delivery (idle checks, pane ownership checks, Enter as a second write, typed receipts) shows how much can go wrong.

**Terminal windows.** For plain CLIs, the adapter opens a window in the person's terminal app (Terminal, iTerm2, Ghostty or Warp) with the command. It records the window or tab ID where the app gives one, so that `fab focus` can bring it forward later.

## Decisions

1. **Start with Claude Code and Orca.** Both match exactly, and Claude Code also gives state. Add Codex and opencode next, with transcript matching.
2. **No hooks in the first version.** Add `fab hooks install` when people ask for "waits for you" in harnesses other than Claude Code.
3. **No sending into running sessions.** The monitor starts sessions and focuses them. It does not type into them.
4. **One adapter per harness, behind one interface:** `list()`, `state(session)`, `start(run)`, `focus(session)`. A table of what each adapter can do decides what the monitor shows, never a check on the harness name.

## Open questions

- Does Claude Code's `status` in the session file show a permission prompt or a question? Test it.
- Is `codex agents` (the shared app-server) a better live source than the rollout files?
- How does opencode take a first prompt in the TUI, and does it read `.claude/skills/` and `AGENTS.md`?
- Can nodeterm add a way for an outside process to open a node? Without it, the monitor can show nodeterm sessions but not start them.
- Which environment variable does Orca set in its terminals? A runtime file can use it to check that it is in the correct harness.
