# nodeterm: agent runtime learnings

Researched 8 Oct 2026.

Sources: [nodeterm.dev](https://nodeterm.dev), [docs](https://nodeterm.dev/docs), and the repository [eneskirca/nodeterm](https://github.com/eneskirca/nodeterm) at the commit of 8 Oct 2026. Most of the detail comes from the repository's `CLAUDE.md` (about 9,700 lines of design notes and measured bugs) and the code in `src/core`, `src/shared/agents`, and `src/session-host`. File references below are to that repository.

The question: how does nodeterm run many coding agents in tmux, hook into each agent CLI, and answer their questions? What should Metafab take from it?

## Summary

nodeterm is an Electron app. Each terminal or coding agent (Claude Code, Codex, Gemini, Copilot, opencode, Grok, Antigravity, custom) is a node on a canvas. It has solved most of the **agent runtime** that Metafab needs:

- Agents run in persistent tmux sessions that survive app restarts and, with resume, machine reboots.
- Hooks in each agent CLI report status as one of four states: `working`, `waiting`, `blocked`, `done`.
- A person can answer a Claude permission prompt, plan approval, or question from the UI.
- Agents can send messages to other agents, with checks and receipts.
- Agents can control the app through a small CLI and a skill: open agents, spawn teams, start reviewers.

It has no idea of a factory: no programs, items, gates with owners, scorers, bins, or rewind. Those are the parts Metafab adds.

So take nodeterm's design for the layer under a program run, and put the metafab above it.

```
Metafab:    item ──► program run ──► gate ──► program run           (the factory)
                         │
Runtime:    tmux session ── hooks ── status ── answers ── messages  (what nodeterm solved)
                         │
Agent CLI:  Claude Code, Codex, Gemini, opencode ...
```

**License.** nodeterm uses the Business Source License 1.1. Production use is allowed, but not as a product that competes with nodeterm. Each version becomes MIT four years after it is published. The older `nodeterm-oss` repository is no longer available. **Take the design and the lessons. Do not copy the code.**

## How nodeterm works

### Architecture

- `src/core` holds all services (PTY, tmux, agents, hooks, git) behind a small `CorePlatform` interface. It does not import Electron.
- `src/main` is the Electron shell. `src/server` is a browser "Server Edition" that runs the same core over HTTP and WebSocket.
- The UI talks to terminals through a `TerminalTransport` interface. Local IPC, a remote host, and a phone relay are different transports. The canvas does not change.
- Windows has no tmux, so a separate long-lived **session host** process does the same job: node-pty, a headless terminal emulator, and a newline-delimited JSON protocol (`attach`, `capture`, `sendKeys`, `detach`, `killSession`). See `src/session-host/protocol.ts`.

### tmux sessions

The principle: tmux owns the process. The UI terminal is only a view of it.

- **Own server.** All sessions are on a separate socket, `tmux -L node-terminal` (`src/core/tmux-naming.ts`). The user's tmux server and `~/.tmux.conf` do not affect it.
- **Own config.** The app writes `<userData>/tmux.conf` and passes it with `-f` (`src/core/pty-manager.ts`, around line 412):

  ```
  set -g status off
  set -g mouse on
  set -g history-limit <max(1000, scrollback)>
  set -g default-terminal "xterm-256color"
  set -sg escape-time 10
  set -g destroy-unattached off
  setw -g aggressive-resize on
  set -g set-clipboard on
  set -as terminal-features ",*:clipboard"
  set -as terminal-features ",*:RGB"
  set -as terminal-features ",*:hyperlinks"
  ```

- **Names.** One session for each node: `nt-<sanitized id>`. The name is the persistence key, so it must never change.
- **Attach.** The UI uses `tmux new-session -A -D -s nt-<id>` (attach or create, and detach other clients). Watchers attach without `-D`.
- **Background work.** For capture and commands, the app keeps a control-mode client: `tmux -C attach-session -t nt-<id>`. This streams output and takes commands, and it does not use a PTY device.
- **Bundled tmux.** The macOS app ships tmux 3.7b with a pinned checksum (`scripts/build-tmux.mjs`). A tmux on the system is always used first.

Lifecycle:

| Event | What happens |
| --- | --- |
| Node created | Check if the session exists (`has-session`). Attach, or create. |
| Node off screen or closed view | Detach the client only. The agent continues in tmux. |
| Node deleted | `kill-session` on the exact name. Delete the saved scrollback. |
| App restart | The tmux server is still alive. Attach again. tmux paints the screen. |
| Machine reboot | The tmux server is gone. Replay the saved scrollback from disk, then start the agent with its resume command. |

For reboots, the app saves the last output of each pane (`capture-pane -p -e -S -1500`) to `<userData>/terminal-scrollback/`. It caps each file at 256 KB and writes it atomically. It saves on a timer, on detach, and on quit. To relaunch an agent it uses the session ID from the hooks: `claude --resume <id>`, `codex resume <id>`, `gemini --resume`, and so on. For Claude, it first checks that the transcript file exists. If not, it starts a new session and shows a banner.

### Sending text to an agent

The text never goes in a command-line argument. One tmux command list does all of it (`src/core/tmux-naming.ts`, around line 140):

```
load-buffer -b <private buffer> -        # text comes in on stdin
if-shell -F '#{pane_in_mode}' 'send-keys -X cancel'   # leave copy-mode first
paste-buffer -d -p -r -b <private buffer> -t <target> # bracketed paste if the app asked for it
send-keys -t <target> Enter
```

- `load-buffer -` avoids argument size limits and text that starts with a dash.
- `paste-buffer -p` uses bracketed paste only when the agent has turned it on. This works on old tmux versions.
- Copy-mode must be cancelled first. If not, the paste is not framed and copy-mode eats the Enter.
- If the paste fails, tmux stops the list and does not send Enter.
- On the session host and direct PTYs, **Enter is a second write**, sent only after the screen shows the text. They measured that Codex kept the text in its input box and did not submit it when the Enter was in the same write.

### Hooks: status from each agent

The principle: get status from hooks, not from reading the screen.

**Install.** Each agent CLI gets its own hook config, in that CLI's own format:

| Agent | Where the hook goes |
| --- | --- |
| Claude Code | Merged into `~/.claude/settings.json`. Events: `SessionStart`, `UserPromptSubmit`, tool hooks, `Notification`, `PermissionRequest` (timeout 600 s), `Stop`, `StopFailure`, `SessionEnd`, subagent hooks. |
| Codex | Own `~/.codex/hooks.json`, plus trust entries in `~/.codex/config.toml`. Codex silently ignores hooks it does not trust, so nodeterm computes Codex's hook hash. |
| Gemini | Merged into `~/.gemini/settings.json`. Events: `BeforeAgent`, `AfterAgent`, tool hooks, `Notification`, session events. |
| Copilot | Own file in `$COPILOT_HOME/hooks/`. |
| opencode | Own plugin file in `~/.config/opencode/plugins/`. |
| Grok | Own file in `$GROK_HOME/hooks/`. Tool matchers must be the regex `.*`, not `*`. |

The installer (`src/core/agents/hooks/install-helper.ts`) writes atomically and finds its own entries by script path. It removes only its own entries, removes duplicates, and does not write a settings file that it cannot parse. An uninstall script reverts everything.

**The hook script** (`src/core/agents/hooks/managed-script.ts`) is one shell script for each agent, `~/.nodeterm/agent-hooks/<agent>.sh`. It:

- does nothing if `NODETERM_NODE_ID` is not set, so only agents that nodeterm started report;
- reads the server address and token from an endpoint file on every call, so a restarted server is found;
- reads all of stdin;
- writes the payload to a temporary 0600 file and POSTs it with curl to a unix socket (or `127.0.0.1:<port>`). The payload is never in the arguments;
- sends ordinary status events in the background;
- always lets the CLI continue. **A hook must never block or break the agent.**

**The hook server** (`src/core/agents/hook-server.ts`) takes `/hook/<agent>`. It always answers 204, also on internal errors. A bearer token authenticates the server instance. A token for each node labels which node sent the event. For status this is a label only. For control commands it is a gate.

**Normalization** (`src/shared/agents/normalize.ts`) turns each CLI's events into one model:

```ts
type AgentState = 'working' | 'waiting' | 'blocked' | 'done'
// kinds: state | session | subagent-start | subagent-end | recurring
```

| Agent | working | blocked or waiting | done |
| --- | --- | --- | --- |
| Claude | prompt, tool, session start | `PermissionRequest` → blocked | `Stop`; `StopFailure` → done with error; `idle_prompt` notification |
| Codex | prompt, tool, session | `PermissionRequest` → waiting; `request_user_input` → waiting | `Stop` |
| Gemini | `BeforeAgent`, tool | `ToolPermission` notification → blocked | `AfterAgent` |
| Copilot | prompt, tool | `permission_prompt` → blocked; `elicitation_dialog` → waiting | `Stop` |
| opencode | user message, tool | permission or question asked → blocked | idle, error |

Events from a subagent must not change the state of its parent. `src/core/agent-status-mirror.ts` saves the state, session ID, pending approvals, and context percentage for each node. It waits 3 seconds before it shows `done`, and a `working` state expires after 6 hours.

### Answering questions and permissions

Only Claude Code has a full path to answer from the UI:

1. The `PermissionRequest` hook writes the request to `~/.nodeterm/pending/<pendingId>.json` and POSTs the pending ID.
2. The hook then **waits**. It polls for `~/.nodeterm/pending/<pendingId>.answer`: 45 s for most tools, up to 540 s for plan approval (`ExitPlanMode`) and `AskUserQuestion`. The hook timeout is 600 s.
3. The UI writes the answer file atomically, with mode 0600.
4. The hook prints Claude's decision JSON on stdout: allow, deny, plan approval or revision, chosen options, or free text.
5. The hook POSTs a second event, which moves the node back to `working`.

The core checks each answer against the original request (`src/core/agents/permission-decision.ts`). The UI never builds hook JSON itself.

For the other agents, the hook only reports the prompt. A person answers in the agent's own terminal:

- Codex `request_user_input` ends the turn. The answer is a new prompt.
- Gemini, Copilot, and opencode prompts can only be answered in their own UI.

Some Claude dialogs fire no hook: folder trust, `/model`, and first-run setup. For these, nodeterm reads the screen (`src/shared/agents/claude-screen.ts`). It types only when it sees the normal input box. Footer text such as "Enter to confirm · Esc to cancel" shows that a dialog is open.

### Transcripts, context, and resume

Each agent has its own reader. Do not reuse Claude's rules for other agents.

| Agent | Transcript | Context used | Resume |
| --- | --- | --- | --- |
| Claude | Session JSONL (path from hooks) | Last assistant usage: input + cache read + cache create | `claude --resume <id>` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Latest `last_token_usage.input_tokens` and `model_context_window`, not the running total | `codex resume <id>` |
| Gemini | `~/.gemini/tmp/<project>/chats/session-*.jsonl` | Latest `tokens.input` | `gemini --resume` |
| opencode | No file (SQLite). Use `opencode export <id>` | Not shown | `--session <id>` |
| Copilot | `$COPILOT_HOME/session-state/<id>/events.jsonl` | Not shown | `--resume=<id>` |

Session IDs come from hooks. Claude, Copilot, and Grok can also get an ID set at launch. A central table (`src/shared/agents/config.ts`) records what each agent can do. Code checks that table, never `agentId === 'claude'`.

### Agent-to-agent messages

`src/core/agents/agent-message*.ts`. A message is pasted into the target agent in a frame:

```
--- NODETERM MESSAGE <nonce> ---
from: <title> (<node id>)
reply-to: <reply target>
<body>
--- END NODETERM MESSAGE <nonce> ---
```

The nonce is 72 random bits for each delivery. It makes forgery harder, but it is not a security boundary. Control bytes are removed from the body.

Delivery steps:

1. Lock the target.
2. Check permission, and check that the target is idle from its hook state. If it is busy or its state is not known, queue or refuse.
3. Check who owns the pane: tmux pane ID, TTY, root PID, agent PID, and process start time. If any check fails or is unknown, stop.
4. Subscribe to the target's events, then paste.
5. Check the pane owner again. If it changed, the result is "delivered to a replaced target", not success.
6. Wait up to 8 s for the target to start a new turn. That is the receipt.

Results are typed: `queued`, `delivered`, `stalled`, `expired`, `refused`. **Queued means the text has not reached the pane.** **Stalled** means the text reached the input box but no turn started. Do not send it again.

The queue (`src/core/agents/delivery-queue.ts`) is FIFO for each target, with up to 16 entries and a 5-minute expiry. It is saved to disk. When it flushes, all checks run again. Nothing is cached.

### Agents that control the app

nodeterm installs a small `sh + curl` CLI (`nodeterm.sh`) and a skill (`manage-nodeterm-canvas`) into each agent. The CLI goes through the hook server and needs the node token. Commands include:

- `open-agent`, `open-terminal`, `send`, `reply`, `notify`, `report-outcome`
- `spawn-team`: up to 8 agents with roles, grouped and linked to the caller
- `verify`: separate reviewers for correctness, security, and tests, plus an optional judge that combines their results
- `open-worktree` / `close-worktree`: a group bound to a git branch and worktree. Terminals in the group start in that worktree.
- `--after <node>`: start this node when another node finishes a turn with success

A second skill, `get-linked-context`, lets an agent read the transcript or terminal output of a **linked** agent when it needs it. A link gives permission to read. It does not push context.

### Saved orchestration state

`src/core/durable-state.ts` and `CLAUDE.md` § "Durable orchestration state":

- The queue, station reports, hand-over holds, and a request ledger are saved in `<userData>/orchestration-state/`.
- Files are treated as hostile input: version envelope, checks, size caps, a corrupt file is moved aside, atomic writes.
- A task is marked as claimed **before** its effect (at most once).
- A request that was in progress during a crash becomes `UNKNOWN`. It is never replayed.
- Restored queue entries keep their expiry time, and must match the same agent session.

## Lessons from their bugs

These come from measured bugs in `CLAUDE.md`. Each would cost us time to find again.

1. **"Unknown" is not "gone".** If a tmux check times out, do not assume the session is dead. Typing a resume command into a live agent breaks it.
2. **Use exact tmux targets** (`-t =name`). tmux otherwise matches the start of a name.
3. **A tmux server does not read its config again.** After an update, push the config with `source-file`.
4. **tmux versions differ.** A newer client cannot talk to an older running server. `#{bracket_paste_flag}` exists only in tmux 3.7. Use `paste-buffer -p`.
5. **Do not paint tmux output into a fresh terminal on attach.** tmux paints the screen. It is not a stream. Copying `capture-pane` into xterm gave black bands and repeated rows.
6. **Send Enter as a separate step**, after the text shows in the pane. Some agents do not submit a paste that has Enter in it.
7. **Hooks must fail open.** Always read stdin, never put the payload in arguments, always exit with success.
8. **Hook formats are not portable.** Event names, matcher syntax (`*` against `.*`), and trust rules (Codex) are different for each CLI. Measure each one.
9. **Subagent events must not change the parent state.**
10. **Saving scrollback must be async.** A synchronous capture stopped the terminal output.
11. **Tests must not touch the real tmux server.** Set `TMUX_TMPDIR`, remove `TMUX` and `TMUX_PANE`, and kill only test sessions.
12. **node-pty leaks PTY devices on macOS** (microsoft/node-pty#950). After some hours of spawns, new terminals do not open. They patch node-pty before they build it.

## What to take

| nodeterm | Metafab use |
| --- | --- |
| One tmux session for each agent, own socket and config | The runner for a program run. Each run is a session, so it continues if the app closes. |
| Four normalized states from hooks | Agent status in the factory and the **Agents** list. `blocked` and `waiting` fill **Needs you**. |
| Held `PermissionRequest` hook and answer file | Questions from an agent go to the owner as a **Needs you** row and are answered in the workspace. |
| Typed delivery results and receipts | Dispatch of a run to an agent. `stalled` and `queued` are real states on the canvas. |
| Idle check and pane owner check before writing | Only give work to a free agent, and only to the agent we think it is. |
| Saved queue, claim before effect, `UNKNOWN` on crash | Bins and dispatch. A run is not started twice after a crash. |
| `--after` dependencies | Wires: the next program starts when the last run finishes with success. |
| Worktree groups | Each slice builds in its own worktree and branch. |
| `verify` with separate reviewers and a judge | The **agent gate**: a fresh agent with no context from the maker. |
| CLI and skill installed into agents | How an agent in a program reports its outputs, asks questions, and reads its frame. |
| Context links (read when needed) | An agent at a gate reads the maker's transcript only if it needs it. |
| Transcript readers for each CLI | The chat for each program run in the workspace, and the source for traces. |
| Capability table for each agent | Which runners can do what. Use it to say which programs need Claude. |
| Session ID from hooks, resume after reboot | A program run can continue after a reboot. |

## What nodeterm does not have

- **No items.** A node is a session, not a piece of work with a history across runs.
- **No gate owners or autonomy dial.** A person answers whatever prompt appears. There is no routing by owner.
- **No scorers or verdicts.** `verify` gives a review, not a score that is stored and calibrated.
- **No metafab version.** No record of which instructions and skills a run used.
- **No rewind and no declared effects.**
- **No team worker pool.** Agents run on one machine (or one server). The phone relay is for viewing and answering, not for shared capacity.
- **Answers from the UI work fully only for Claude.** For Codex and the others, a person types into the agent's terminal.

## Decisions and open questions

1. **Build our own runtime adapter on this design.** Use tmux on its own socket, a hook script for each CLI, the four states, and a held-answer path. Do not copy their code (license).
2. **Start with Claude Code and Codex only.** Claude has a full answer path through hooks. Codex can only report questions. Its answers must be typed into the terminal, or sent as a new prompt. Decide whether a Codex question in Metafab is answered by a new prompt from the gate.
3. **Use a structured channel for questions where we can.** The held hook works for Claude. For other agents, a Metafab CLI command such as `metafab ask` that the agent calls, which waits for the answer, may be more reliable than hooks. This is like their canvas CLI. Test this.
4. **Record the hook events as spans.** The hook stream and the transcript readers give the data for the OpenTelemetry traces in the overview. See [`mastra-observability.md`](mastra-observability.md).
5. **Open:** for team agents on other machines, do we run tmux on each member's machine and relay events, like their Server Edition and relay? Or do we use cloud runners only for shared capacity?
