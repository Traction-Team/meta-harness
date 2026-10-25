# Agent runtime architecture

Researched 26 Aug 2026.

**Status: accepted architecture. Implementation details remain subject to
validation.**

This document supersedes the earlier execution recommendation in
[`orca-evaluation.md`](orca-evaluation.md). The Orca conclusion still holds: do
not build Meta Factories on Orca or fork its 1.5M-line application. What changes
is the runtime we should build ourselves. The earlier proposal was a thin,
Claude-Code-only Agent SDK wrapper. That does not meet the now-explicit product
requirements:

1. Run **different coding harnesses**, including Claude Code, Codex, OpenCode,
   Gemini CLI, and future CLIs.
2. Surface blocking questions to the human without requiring them to watch the
   terminal.
3. Let the human open the exact live terminal, jump into the work, run commands,
   steer the agent, and leave again.
4. Preserve the factory as the authority over work, rather than adopting an
   external orchestrator's task model.

## Decision in one sentence

**Run each agent's real native CLI in a managed PTY; use a Factory MCP server as
the common structured control plane; add ACP adapters where they materially
improve the integration.**

The product boundary becomes:

> **PTY for fidelity. MCP for factory semantics. ACP where available for richer
> integration.**

---

## 1. Three planes, not one mechanism

The earlier discussion kept trying to make one transport solve three different
problems. They should be separated.

### Terminal data plane

Runs the real CLI and preserves its complete behaviour. It carries bytes,
keyboard input, escape sequences, cursor state, colours, selectors, slash
commands, and the native TUI. It is what lets the operator take the wheel.

### Structured control plane

Carries facts the factory must understand: blocking questions, completion,
heartbeats, reports, artifacts, permission requests, and status. These should
not be inferred from terminal pixels or byte sequences.

### Factory orchestration plane

Owns programs, repo-state predicates, dispatches, worktrees, contracts, event
logs, defects, and system versions. Neither the terminal nor an agent protocol
becomes the source of truth for the factory.

```text
                         Meta Factories
                 programs / states / dispatches
                              |
                    dispatch event log
                       /             \
           control plane             data plane
        MCP and optional ACP          managed PTY
               |                          |
     ask / complete / report       real native agent CLI
               |                          |
        Factory needs-you UI       attach terminal any time
```

---

## 2. Building a terminal without writing a terminal emulator

A terminal application has two halves:

1. A **pseudo-terminal**, which runs a child process and exposes byte streams,
   input, resize, signals, and process exit.
2. A **terminal renderer**, which interprets VT/ANSI escape sequences and draws
   the screen.

We implement neither from scratch.

### Electron stack

| Layer | Package | Role |
|---|---|---|
| Desktop shell | Electron | Windows, tabs, native packaging, IPC |
| PTY backend | `node-pty` | Spawn real shells and coding-agent CLIs |
| Renderer | `@xterm/xterm` | Render the terminal screen and capture input |
| Sizing | `@xterm/addon-fit` | Keep renderer and PTY rows/columns aligned |
| Performance | `@xterm/addon-webgl` | GPU-backed terminal rendering |
| Recovery | `@xterm/addon-serialize`, `@xterm/headless` | Save/rebuild visible terminal state and scrollback |
| Usability | `search`, `web-links`, `unicode11` add-ons | Search, links, Unicode behaviour |

Microsoft maintains both `node-pty` and xterm.js. Their repository contains a
minimal Electron example with xterm.js in the renderer, `node-pty` in the main
process, and IPC between them. `node-pty` supports macOS/Linux PTYs and Windows
ConPTY and is already used by VS Code, Hyper, Theia, and many other terminal
applications.

Orca uses this same stack: `node-pty`, `@xterm/xterm`, `@xterm/headless`, and the
fit, ligatures, search, serialize, Unicode, web-links, and WebGL add-ons. We are
not copying Orca's terminal implementation; we are using the same public
primitives.

The essential wiring is small:

```ts
// factory daemon; Electron does not own the child process
const child = pty.spawn(command, args, {
  cwd: worktreePath,
  cols: 120,
  rows: 40,
  env
})

child.onData(data => publishTerminalData(terminalId, data))
onInput(terminalId, data => child.write(data))
onResize(terminalId, ({ cols, rows }) => child.resize(cols, rows))
```

```ts
// renderer
terminal.onData(data => sendInput(terminalId, data))
onTerminalData(terminalId, data => terminal.write(data))
```

The foreground CLI handles prompts, input history, selectors, arrow keys, and
its own TUI. xterm.js renders what the CLI emits. We do not implement Claude's
ASCII UI, Codex's selector, or OpenCode's input editor.

### Alternative renderer: `ghostty-web`

`ghostty-web` provides Ghostty's VT parser as an approximately 400 KB WASM
bundle behind an xterm-compatible API. It is interesting for better VT and
Unicode fidelity. It is newer and less proven than xterm.js, so the decision is
to begin with xterm.js behind a small renderer interface and leave Ghostty as a
later swap or experiment.

### If we choose Tauri instead

Use WezTerm's `portable-pty` crate, or a Tauri PTY plug-in built on it, with
xterm.js or ghostty-web in the webview. `portable-pty` is cross-platform and
already provides spawn, read, write, resize, wait, and terminate primitives.
Electron plus `node-pty` is the lower-risk path because the product UI is already
web-shaped and Orca has demonstrated the stack at scale.

### What remains ours

A minimal terminal is easy. A production terminal manager still needs:

- Terminal IDs and metadata
- Resize coordination
- Output batching so high-volume streams do not flood IPC
- Scrollback and replay
- Process exit and signal handling
- Environment/login-shell construction
- Orphan cleanup
- Single-writer input ownership
- App and machine recovery
- Sandboxing and permission boundaries

This is thousands of lines over time, not hundreds of thousands.

---

## 3. Why the PTY cannot be the question channel

A PTY gives the factory a byte stream. It does not give semantic events.

It cannot reliably distinguish:

- A blocking question from ordinary prose
- A permission prompt from a status message
- Waiting from thinking
- Completion from temporary idleness
- A selector's display label from the keystroke the TUI expects

Scraping screen contents is brittle. Orca's own source documents a concrete
failure: pasting the label `Blue` into a digit-driven question selector selected
the highlighted first option instead of `Blue`. Orca had to special-case Claude
and Codex by simulating per-option keystrokes.

Terminal parsing may be useful as a last-resort attention heuristic. It cannot
be the contract that makes a dispatch dependable.

---

## 4. Factory MCP as the common control plane

Most serious coding harnesses support MCP even when their UI and internal event
formats differ. Meta Factories can provide a small MCP server to every worker.

Initial tools:

```text
factory.ask
factory.complete
factory.report
factory.heartbeat
factory.attach_artifact
factory.raise_defect
```

### Dispatch identity

Every worker receives a dispatch-scoped MCP identity as part of its launch
configuration. The Factory MCP server derives the dispatch ID from authenticated
launch context rather than trusting an agent-supplied ID. Questions, reports,
artifacts, defects, heartbeats, and completion therefore cannot be attributed to
another attempt by prompt text alone.

### `factory.ask`

The agent calls:

```json
{
  "question": "Should the migration preserve the deprecated status values?",
  "choices": ["preserve", "remove"],
  "allowFreeform": true,
  "context": "Three fixtures still contain the old values."
}
```

The server:

1. Writes a durable question event against the dispatch.
2. Marks the dispatch `needs-you`.
3. Notifies the operator.
4. Renders the question in the Agents board and console.
5. Returns the selected answer to the waiting tool call.
6. Records the answer and returns the dispatch to `running`.

The program preamble instructs every compatible agent:

> When you need human input, call `factory.ask`. Do not use your harness's
> private interactive question tool. When the work is complete, call
> `factory.complete`, even when it failed.

This is a behavioural contract, not a guarantee. It is nevertheless more stable
than scraping each TUI and gives all MCP-capable harnesses one factory-native
question path.

`needs-you` means the dispatch is waiting for human clarification or review.
`needs-terminal` means the remaining interaction is available only through the
native TUI. `blocked` is reserved for a non-human dependency or external
condition, not for an unanswered `factory.ask` call.

### Waiting and recovery

The simplest implementation holds the MCP tool request open while waiting for
an answer. The question itself must still be committed to the event log first.
If the daemon or agent dies while waiting, the factory reconstructs the waiting
dispatch from the log and resumes the agent with the recorded answer later.

Do not make an unresolved JavaScript promise the only record that a human
question exists.

### Completion and heartbeats

`factory.complete` should require:

```ts
{
  outcome: "succeeded" | "failed"
  summary: string
  filesModified?: string[]
  artifacts?: string[]
}
```

This takes the useful part of Orca's `worker_done` contract: failure is reported
explicitly instead of inferred from a process disappearing. The event is only a
completion report. The factory accepts completion after committing it and
validating the output predicate and dispatch contract.

Heartbeats and terminal activity remain supporting signals. They are not
completion authority.

### Native permission prompts are different

A clarification question and an agent-runtime permission request are not the
same thing. A model can choose `factory.ask`; the harness may block on a native
permission prompt before the model gets another turn.

Initial permission policy:

- Run coding workers in isolated worktrees with a deliberately chosen
  non-interactive permission profile.
- Let the factory enforce higher-level boundaries around external, paid,
  destructive, and credentialed actions.
- When an agent still reaches a native prompt, classify the dispatch as
  `needs-terminal` and let the operator attach.
- Use ACP permission events where the adapter supports them.

Do not attempt to simulate every harness's permission selector through PTY
keystrokes in the first version.

---

## 5. ACP: the structured interoperability layer

The Agent Client Protocol is an open protocol created for editor-to-agent
interoperability. It is the closest thing to LSP for coding agents.

Local ACP agents run as subprocesses and communicate via JSON-RPC over stdio.
The official TypeScript SDK is:

```bash
npm install @agentclientprotocol/sdk
```

Stable ACP v1 provides or negotiates:

- Session creation
- Prompt turns
- Streaming messages
- Plans
- Tool calls and status
- Permission requests
- Cancellation
- Usage and cost
- Modes and models
- Session load, resume, and close
- Agent-initiated terminals
- Structured elicitation from the human

The ecosystem is already broad. The official registry includes Claude Agent
through an adapter, Codex through an adapter, OpenCode, Gemini CLI, Copilot,
Cursor, Factory Droid, Kimi, Kiro, Qwen Code, Mistral Vibe, Goose, OpenHands,
and many others.

Examples:

| Harness | ACP path |
|---|---|
| Claude Code | `@agentclientprotocol/claude-agent-acp`, built on the official Agent SDK |
| Codex CLI | ACP adapter |
| OpenCode | Native ACP mode |
| Gemini CLI | Native ACP integration |
| GitHub Copilot CLI | `copilot --acp` |

### Structured questions

ACP v1 now includes `elicitation/create`, allowing an agent to request transient
structured input through a restricted JSON Schema. It supports primitive form
fields, choices, multiple selections, and URL-based flows. The feature was
stabilized in the protocol artifacts on 22 Jul 2026.

This is directly suitable for the factory's needs-you UI.

### Important limitations

Protocol support and adapter behaviour lag the specification:

- Some integrations implement permissions but not arbitrary questions.
- OpenCode has had a bug where its question tool hangs in ACP mode.
- Copilot has had requests for a working `ask_user` path through ACP.
- Claude's adapter uses extensions for features that stable ACP does not yet
  represent fully.
- ACP v2 remains experimental and may change incompatibly.

Therefore ACP should be capability-negotiated and tested per adapter. It should
not be the only question channel in the first release.

### ACP does not guarantee native-TUI handoff

ACP owns a structured protocol session, not necessarily the harness's native
interactive terminal session. ACP defines `session/load` and `session/resume`,
but those restore the conversation into an ACP client. It does not guarantee
that the same session can be opened in the harness's regular TUI.

Some adapters can expose the underlying native session ID and implement a clean
handoff. Others cannot. This must be an optional adapter capability, not an
assumption in the product model.

---

## 6. Runtime options

### Option A: terminal-only

Run every native CLI inside a PTY. Scrape the screen for attention and
completion.

**Good:** universal, maximum fidelity, immediate takeover.

**Bad:** no dependable semantic events. Questions and completion become fragile.

**Verdict:** insufficient by itself.

### Option B: ACP-only

Run each compatible harness in ACP mode and render the structured event stream.
Provide a separate normal shell in the worktree.

**Good:** clean questions, permissions, plans, tool calls, session lifecycle,
and a provider-neutral API.

**Bad:** no universal path into the same native TUI conversation. Adapter
support is uneven. Arbitrary non-ACP CLIs are excluded.

**Verdict:** valuable integration mode, wrong universal foundation for the
stated workflow.

### Option C: own the complete harness

Call model providers directly and implement tools, compaction, permissions,
sandboxing, MCP, memory, retries, transcripts, and provider adapters, as Aside
does.

**Good:** complete UI and provider control.

**Bad:** rebuilds a large amount of infrastructure unrelated to the factory's
core thesis.

**Verdict:** not proposed. Aside needs this because browser tools and long-lived
personal context are its product. Meta Factories does not.

### Option D: PTY-native plus Factory MCP, with optional ACP

Run real CLIs in managed PTYs. Use Factory MCP for the common dispatch contract.
Add ACP adapter mode where its structured capabilities are worth the tradeoff.

**Good:** universal basic support, exact live terminal access, structured factory
signals across MCP-compatible harnesses, and progressive ACP enhancement.

**Bad:** per-agent launch/resume adapters still exist; MCP tool usage is partly a
prompt contract; ACP mode and native TUI mode cannot always share one session.

**Verdict:** accepted path.

---

## 7. Architecture

### Separate local daemon

The window should not own agent processes. A local factory daemon owns:

```text
Factory daemon
├── PTY registry
├── terminal output buffers
├── worktree registry
├── harness adapter registry
├── optional ACP clients
├── Factory MCP server
├── dispatch event log
├── question routing
└── recovery/reconciliation

Electron UI
├── System
├── Factory
├── Agents
└── terminal renderer tabs
```

The Electron renderer connects to the daemon through local IPC or WebSocket.
Closing a pane or reloading the UI does not stop an agent.

Terminal buffers and serialized snapshots reconstruct the visual terminal only.
They never determine dispatch status; the factory event log does.

### Harness adapter interface

```ts
type HarnessCapabilities = {
  mcp: boolean
  acp: boolean
  elicitation: boolean
  permissionEvents: boolean
  loadSession: boolean
  resumeSession: boolean
  nativeTuiHandoff: boolean
}

interface HarnessAdapter {
  id: string
  displayName: string
  capabilities: HarnessCapabilities

  terminal: {
    command: string
    args(input: LaunchInput): string[]
    environment?(input: LaunchInput): Record<string, string>
    resume?(session: HarnessSession): CommandSpec
  }

  acp?: {
    command: string
    args(input: LaunchInput): string[]
  }

  configureMcp?(input: LaunchInput): McpLaunchConfig

  discoverSessionId?(events: RuntimeEvent[]): Promise<string | null>
  reconcile?(session: HarnessSession): Promise<ReconciliationResult>
}
```

The factory does not hardcode every CLI throughout the product. Each adapter
knows how to launch, resume, configure MCP, and expose optional capabilities.

### Dispatch record

```ts
type Dispatch = {
  id: string
  itemId: string
  attempt: number
  programId: string
  programRevision: string
  systemVersion: string
  sourceStateId: string
  targetStateId: string
  contractRevision: string
  harnessId: string
  adapterVersion: string
  capabilities: HarnessCapabilities
  runtimeMode: "pty" | "acp"
  worktreePath: string

  terminalId?: string
  nativeSessionId?: string
  acpSessionId?: string

  status:
    | "starting"
    | "running"
    | "needs-you"
    | "needs-terminal"
    | "operator-held"
    | "blocked"
    | "completed"
    | "failed"
    | "lost"

  activeQuestionId?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  lastHeartbeatAt?: string
}
```

`runtimeMode: "acp"` means an adapter-specific structured launch mode. It does
not promise native-TUI continuity and does not change the broad-support default:
native CLIs in managed PTYs.

The event log, not the PTY object or an unresolved promise, is the source of
truth. Core events include `dispatch_created`, `process_started`,
`status_changed`, `question_asked`, `question_answered`, `operator_acquired`,
`operator_released`, `heartbeat`, `report`, `completion_reported`,
`completion_validated`, `process_exited`, `dispatch_lost`, and `reconciled`.
Dispatch records and UI rows are projections reduced from those events. A
completion applies only to the matching attempt and contract revision.

---

## 8. Operator flows

### Normal unattended work

1. Program selects an item from a repo-state predicate.
2. Factory validates the input contract and appends `dispatch_created` with the
   item, attempt, program, contract, system version, and adapter snapshot.
3. Factory creates the worktree and records the result.
4. Adapter launches the selected harness in a managed PTY.
5. Initial program prompt is supplied through an adapter-specific launch path.
6. Nobody needs to watch the terminal.
7. Agent reports completion through `factory.complete`.
8. Factory commits the report, validates the output predicate and contract, then
   records completion and moves the item.

### Agent asks a question

1. Agent calls `factory.ask` or emits ACP elicitation.
2. Factory commits the question to the dispatch event log.
3. Dispatch becomes `needs-you`.
4. Human receives the question in the Agents board or a notification.
5. Human answers.
6. The answer returns through MCP or ACP.
7. Dispatch returns to `running`.

### Human opens the live terminal

For a PTY-native dispatch:

1. Human clicks **Open terminal**.
2. xterm.js attaches to the existing terminal ID.
3. Daemon replays enough buffered state to reconstruct the screen.
4. Human now sees and controls the exact live CLI session.
5. Input ownership moves to that UI client.
6. Human closes the view; the PTY and agent keep running.

There is no stop/resume handoff while the PTY is alive. The terminal is merely a
view onto the existing process.

### Human works beside the agent

The worktree can have additional ordinary shell terminals. The human can run a
dev server, tests, git, or the product while the agent's terminal remains
separate. This is orthogonal to the agent integration and should be available in
every runtime mode.

### ACP to native-TUI handoff

Only adapters advertising `nativeTuiHandoff` expose this action:

1. Cancel or suspend the ACP turn.
2. Resolve the underlying native session ID.
3. Acquire the single-writer session lock.
4. Launch the adapter's native resume command in a PTY.
5. Mark the dispatch `operator-held`.
6. On hand-back, stop the TUI and resume ACP if the adapter supports it.

Do not present this action when the adapter cannot guarantee continuity.

---

## 9. Persistence and recovery

### UI reload

The daemon still owns the PTY. Reconnect by terminal ID and replay buffered
output or a serialized terminal snapshot.

### Window/app restart

If the daemon is separate from the window process, the PTY still exists. The new
UI reconnects.

### Daemon crash or machine restart

The original PTY cannot survive the death of its owning process. Recovery uses:

1. Agent-native session resume through the harness adapter.
2. ACP `session/load` or `session/resume` when running in ACP mode and supported.
3. Worktree and event-log reconciliation.

`tmux` or `zellij` could preserve Unix terminals across daemon restarts, but it
adds another lifecycle layer and does not provide a clean cross-platform answer.
Use harness-level resume as the primary recovery mechanism. Revisit a terminal
multiplexer only if daemon crash recovery becomes a frequent real problem.

### Session locks

One session must have one writer. Two active TUI or protocol attachments can
interleave messages and corrupt the conversation. The daemon owns an explicit
lease for every harness session and transitions it between `factory`,
`operator`, and `none`.

---

## 10. Support tiers

Do not claim identical capability for every arbitrary CLI.

| Tier | Requirements | Experience |
|---|---|---|
| **Tier 1: rich** | ACP with elicitation/resume, or mature adapter plus MCP | Structured questions, status, permissions, resume, terminal/worktree access |
| **Tier 2: factory-aware** | Native CLI plus MCP | Real TUI, factory questions/completion/heartbeat, native resume when adapter supports it |
| **Tier 3: terminal-only** | Any CLI executable | Full terminal fidelity and manual control, but no guaranteed structured questions or completion |

A new CLI can become Tier 3 from configuration alone:

```yaml
harnesses:
  - id: my-agent
    command: my-agent
    args: []
```

It moves to Tier 2 when given Factory MCP configuration, and to Tier 1 when a
reliable ACP or native-event adapter exists.

This is a better promise than pretending arbitrary terminal programs have a
universal semantic interface.

---

## 11. Implementation sequence

### Phase 0: durable dispatch seam

- Dispatch event schema and reducer
- Program, item, contract, and system-version references
- Append-before-side-effect rules
- UI read model derived from events
- Startup reconciliation

Success: a dispatch and every operator interaction can be reconstructed without
an in-memory process object. This seam exists before the first real worker is
launched.

### Phase 1: one managed terminal

- Electron
- Separate local daemon
- `node-pty`
- xterm.js renderer
- Attach/detach
- Resize
- Buffered replay
- Exit and cleanup
- One worktree, one agent CLI
- Minimal harness adapter and recorded capability snapshot
- Spawn and exit events written through the Phase 0 seam

Success: launch Claude Code, close its panel, reopen it, and continue typing into
the same TUI without introducing Claude-specific assumptions into the daemon
core.

### Phase 2: terminal registry and worktrees

- Multiple PTYs
- Dispatch-to-terminal membership
- Ordinary sidecar shells
- Worktree creation and deletion
- Single-writer leases
- Restart reconciliation

Success: run three independent harness sessions and ordinary shells without
cross-talk.

### Phase 3: Factory MCP

- `factory.ask`
- `factory.complete`
- `factory.report`
- `factory.heartbeat`
- Durable question and answer events
- Dispatch-scoped MCP authentication
- Needs-you notifications
- Program preamble contract

Success: an unattended Claude or OpenCode worker asks a question that appears in
Agents mode; answering it lets the same worker continue.

### Phase 4: harness adapters

- Claude Code
- Codex
- OpenCode
- Gemini CLI
- Launch configuration
- MCP configuration
- Native session-ID discovery
- Resume commands
- Capability matrix

Success: each harness runs natively in a PTY and recovers through its own session
mechanism where available.

### Phase 5: ACP capability validation

- Add `@agentclientprotocol/sdk` client
- Implement initialization and capability negotiation
- Support prompt turns, updates, permissions, elicitation, cancellation, and
  session resume
- Test Claude Agent, Codex, OpenCode, and Gemini independently
- Record real support rather than assuming spec compliance

Success: at least two harnesses produce the same factory-native structured event
model through ACP.

### Phase 6: choose where ACP enriches the flow

After real usage, decide per capability and per harness where ACP improves the
flow. Retain PTY-native mode as the guaranteed path for exact native-TUI access;
do not choose one global integration mode in advance.

---

## 12. Risks and open questions

### Will agents reliably call `factory.ask`?

Unknown until tested. The program prompt can make it explicit, but harnesses may
prefer their private question tool. Possible mitigations include disabling the
private tool, adding agent-specific hooks, or mapping native questions through
ACP elicitation.

### How long may an MCP question remain open?

The event is durable; the transport request is not. Define timeout and crash
semantics early. A timed-out question must leave the dispatch blocked and
resumable rather than silently failing.

### How do permission prompts surface in PTY mode?

Not solved generically. Begin with sandboxed workers and explicit permission
profiles. Add per-agent hooks or ACP permission support where useful. A generic
native prompt falls back to `needs-terminal`.

### How is completion enforced?

`factory.complete` is the authority, but agents can forget to call it. The
coordinator should detect process exit, prolonged idleness, and satisfied output
predicates, then ask for reconciliation rather than silently declaring success.

### Can ACP sessions always enter native TUIs?

No. Keep this capability optional. PTY-native mode exists precisely to guarantee
full TUI access.

### Windows

`node-pty` uses ConPTY on modern Windows, but shell discovery, environment
construction, path formats, process trees, and signals require dedicated tests.
Do not infer Windows correctness from macOS behaviour.

### Security

`node-pty` children run with the parent user's permissions. Worktree isolation is
not a security sandbox. Remote terminal access, credentials, and arbitrary
commands need explicit boundaries before this becomes a networked or team
product.

---

## 13. Decision and revisit triggers

### Accepted decision

- Do not depend on or fork Orca.
- Do not own the complete agent harness like Aside.
- Do not remain Claude-Code-only through the Agent SDK.
- Build a small managed-terminal runtime around public terminal packages.
- Put process, PTY, worktree, lease, event-log, and recovery ownership in a
  separate local daemon rather than the Electron window.
- Keep the real native CLI as the canonical runtime for broad compatibility.
- Provide factory semantics through our own MCP tools.
- Integrate ACP incrementally, through capability-aware adapters.
- Keep repository programs, predicates, contracts, and versions authoritative
  for system definition, and the event log authoritative for dispatch lifecycle.

### Revisit if

- ACP becomes consistently implemented across the four primary harnesses,
  including elicitation and native-session handoff.
- Factory MCP calls prove too unreliable as a behavioural contract.
- Operators rarely open native terminals, making ACP-first materially simpler.
- Operators watch and drive terminals constantly, suggesting the Agents console
  should become terminal-first rather than event-first.
- Remote workers become a near-term requirement.
- Provider portability becomes more important than preserving native harnesses,
  making a fully owned Aside-style runtime worth its cost.

---

## Sources

- `github.com/microsoft/node-pty`
- `github.com/microsoft/node-pty/tree/main/examples/electron`
- `xtermjs.org`
- `github.com/coder/ghostty-web`
- `docs.rs/portable-pty`
- `agentclientprotocol.com/get-started/introduction`
- `agentclientprotocol.com/get-started/agents`
- `agentclientprotocol.com/protocol/v1/session-setup`
- `agentclientprotocol.com/protocol/v1/prompt-turn`
- `agentclientprotocol.com/protocol/v1/terminals`
- `agentclientprotocol.com/rfds/elicitation`
- `github.com/agentclientprotocol/typescript-sdk`
- `github.com/agentclientprotocol/claude-agent-acp`
- Fresh clone of `stablyai/orca` at `933345d`
