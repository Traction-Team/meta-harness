# Orca: build on it, or take from it?

Researched 26 Aug 2026. Sources are a full clone of `stablyai/orca` at
`933345d` (25 Aug 2026), the Orca docs at onorca.dev, and the Claude Agent SDK
docs.

**Verdict: take from it, do not build on it.** Orca becomes a reference
implementation we read, not a dependency we ship. The reasoning is below, and
the decisive part is not the size: Orca's orchestration model is imperative
where ours is declarative, and adopting it would make Orca's Run/Task/Dispatch
the source of truth for execution instead of the loop.

**Runtime update, 26 Aug 2026:** the Claude-Code-only Agent SDK recommendation
in this document has been superseded by
[`agent-runtime-architecture.md`](agent-runtime-architecture.md). The current
accepted architecture is PTY-native agents owned by a separate daemon, Factory
MCP as the common control plane, and capability-negotiated ACP. The Orca
evaluation and rejection stand; only the runtime we build ourselves has changed.

---

## 1. What Orca is

MIT, genuinely open source, no open-core catch. Built by Stably AI (YC W22).
Founders Jinjing Liang (ex-Google Chrome) and Neil Parker (ex-Uber TL). The
company's other product is an AI testing platform; Orca is the devtool arm.

Measured from the clone, not estimated:

| | |
|---|---|
| First commit | 17 Mar 2026 — **~5.3 months old** |
| Stars / forks | 53,761 / 3,706 |
| Contributors | ~341 |
| Latest merged PR | **#16358** → roughly 100 PRs/day |
| Open issues | 4,574 |
| Tracked files | 18,864 |
| TS/TSX, non-test | **1,550,780 lines** |
| TS/TSX, tests | 1,773,252 lines |
| Working tree | 305 MB |
| Dependencies | 23 runtime, 100 dev, ~130 npm scripts |

`src/main/runtime/orca-runtime.ts` is a single **41,692-line** file with a
52,004-line test beside it.

Shape: an Electron desktop app (`src/renderer` 8,187 files, `src/main` 5,887),
plus a native Swift/Kotlin mobile companion, a relay server, an embedded
Chromium, an SSH layer, a Ghostty-class WebGL terminal, and adapters for 25+
agent CLIs.

Far too big to fork or vendor. That much was never really in question.

---

## 2. The part that is actually relevant

Orca has a subsystem called `orchestration` — 46 files under
`src/main/runtime/orchestration/` — and it is uncomfortably close to our
execution layer.

Its model, from `types.ts` and `coordinator.ts`:

- **Run** — durable namespace and coordinator inbox. Never schedules or places
  workers.
- **Task** — a spec with dependencies and a status:
  `pending | ready | dispatched | completed | failed | blocked`.
- **Dispatch** — one *attempt* of a task on a terminal. Holds lifecycle
  authority for `worker_done` and heartbeats.
- **Message** — `status | dispatch | worker_done | escalation | handoff |
  decision_gate | question | heartbeat`.
- **Decision gate** — a coordinator-owned question that blocks a task until
  resolved.

The coordinator runs phases `decomposing → dispatching → monitoring → merging →
done`, over a SQLite mailbox with FIFO delivery and explicit ack. There is DAG
convergence, escalation triage, stale-dispatch detection, and federation for
remote workers.

Compare that to the prototype's first Agents board (needs-you / failed / blocked
/ running). The accepted status model is richer, but `escalation` and `question`
still map naturally to needs-you events.

It is all reachable from a CLI:

```
orca orchestration run-create --objective "…"
orca orchestration task-create --spec "…"
orca orchestration worker-start --task <id> --worktree new-child --agent claude
orca orchestration check --wait --types worker_done,escalation --timeout-ms 900000
orca orchestration gate-create --task <id> --question "…" --options '["yes","no"]'
```

### Why we still do not use it

**There is no library.** Nothing here is importable. To use Orca's
orchestration you must run the Orca Electron app, or `orca serve` headless on
Linux — which means shipping an AppImage plus Xvfb — and then shell out to the
`orca` binary. Our product would boot a 300 MB IDE to get a task queue.

**The abstraction is the one we are replacing.** Orca's orchestration is
imperative: a coordinator LLM decides *at run time* to call `task-create`, then
`worker-start`. Nothing is checkable ahead of time, and the DAG is per-run and
ephemeral.

Our thesis is the opposite. Nodes are predicates over the repo. Edges are
programs with typed inputs and an output. The graph is therefore statically
checkable and a broken wire is caught *before* dispatch. Defects attach to
edges. The loop has versions.

If we sat the loop on top of Orca, Orca's Run/Task/Dispatch would quietly become
the source of truth for execution, and we would spend our time fighting to keep
the declarative definition authoritative. That is a bad trade regardless of how
good their code is.

---

## 3. Chatting with a live worker

This is the open question that actually shapes the build: the factory needs a
place where you can watch a worker and talk to it mid-task. Worth being precise
about how hard that is, because the answer is "less hard than Orca makes it
look, because Orca solved a harder problem than ours."

### How Orca does it

**Correction (26 Aug, after seeing it running).** An earlier draft of this doc
led with Orca's native chat view. That was the wrong emphasis. **Orca's answer
is the terminal.** The primary surface is a real PTY running the real `claude`
TUI through their terminal emulator — ASCII robot, `bypass permissions
(shift+tab to cycle)`, `/clear to save 196.4k tokens`, all of it verbatim and
nothing reinterpreted.

The native chat described below is a *view mode toggled on a terminal tab*, it
sits behind a Settings → Experimental flag, and it only works for five agent
identities out of the 25+ Orca supports. From `native-chat-availability.ts`:

```ts
if (input.experimentalNativeChatEnabled !== true) return false
if (input.contentType !== 'terminal') return false
```

and `NATIVE_CHAT_SUPPORTED_AGENTS` is `claude`, `openclaude`, `codex`, `grok`,
`omp`. Hence exactly four transcript decoders in the repo. Gemini and the rest
never qualify.

So Orca ships **two** readings of one session, and the mechanism below is the
second one:

**Reading — it never parses the agent's stdout.** It tails the JSONL transcript
that Claude Code already writes to disk, at
`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. `session-file-resolver.ts`
finds the file, `claude-project-dir-encoding.ts` reproduces Claude's path
encoding (one dash per non-alphanumeric character, runs not collapsed),
`transcript-incremental-reader.ts` and `transcript-watch-engine.ts` tail it, and
`transcript-line-decoders-claude.ts` turns each line into a `NativeChatMessage`
of typed blocks: text, thinking, tool-use, tool-result. React renders that.

**Writing — it puppets the real TUI.** The composer calls
`sendRuntimePtyInput`, writing keystrokes into a PTY running the ordinary
interactive `claude`. Enter sends, Shift+Enter inserts a newline, multi-line
input is bracketed-paste wrapped, Esc interrupts.

So the terminal stays the input device and the transcript file is the read
model. Clever, and it means they never reimplement Claude's TUI state machine.

**But it costs them a lot.** Roughly 28 files in main plus ~30 in the renderer,
and the hard parts are all incidental: macOS NFD vs NFC path spellings, Windows
casing, WSL filesystem bridging, SSH, tail boundaries, turn lifecycle markers,
distinguishing injected/synthetic turns from real ones. Their own comments
document the bugs this caused. There is a note in the composer that the PTY
"cannot distinguish native input from keystrokes" — which is exactly the
fragility you would expect from puppeting a TUI.

They pay that because they support 25+ agent CLIs whose only common denominator
is "runs in a terminal, writes a transcript somewhere." Meta Factories now has
an explicit multi-harness requirement, although it does not need Orca's full
application scope or transcript view for every harness.

One detail from their code is the best single argument against using a PTY as the
**structured control plane**. It is not an argument against running the native
agent in a PTY. In `native-chat-agent-support.ts`:

```
/** True when the agent renders a digit-commit question selector that ignores
 *  typed label text (pasting "Blue" + Enter commits the highlighted FIRST
 *  option — STA-1860): Claude's AskUserQuestion and Codex 0.145's
 *  request_user_input card both behave this way, so answers must be delivered
 *  as per-option keystrokes. Other agents commit a pasted answer. */
```

A filed bug: answering an `AskUserQuestion` by pasting the option label silently
committed **the wrong option**, because the selector is digit-driven and ignores
typed text. That is exactly our "one-tap answers to blocking questions" feature.
The accepted architecture keeps the real CLI in the PTY but routes dependable
questions through Factory MCP or negotiated ACP instead of simulating selector
keystrokes.

### Superseded recommendation: Claude Agent SDK wrapper

This section is retained only as decision history. It was rejected when
multi-harness support and exact live-native-terminal access became explicit
requirements. The accepted replacement is
[`agent-runtime-architecture.md`](agent-runtime-architecture.md).

The earlier assumption was that we only targeted Claude Code, so we could use the
supported programmatic path: the
**Agent SDK in streaming input mode** (`@anthropic-ai/claude-agent-sdk`). Per
the docs it "allows the agent to operate as a long lived process that takes in
user input, handles interruptions, surfaces permission requests, and handles
session management" — which is the entire feature list we need, stated as the
recommended mode.

The shape:

```ts
// one worker = one long-lived query() with a generator as its prompt
for await (const msg of query({ prompt: inbox(), options: { cwd: worktree } })) {
  await eventLog.append(dispatchId, msg)   // our store, our source of truth
  bus.publish(dispatchId, msg)             // → UI over SSE/websocket
}
```

- **Outbound (render):** iterate the message stream. Native objects, already
  typed — no file tailing, no path encoding, no JSONL archaeology. Add
  `--include-partial-messages` semantics for token-level streaming when we want
  it.
- **Inbound (chat):** push a message onto the async generator feeding `prompt`.
  That is the composer. No PTY, no keystrokes, no bracketed paste.
- **Blocked / needs-you:** the `canUseTool` permission callback returns a
  promise. Hold it, mark the dispatch blocked, render the approval card, resolve
  it when the operator answers. **That is our decision gate**, and it comes for
  free rather than being a protocol we invent.
- **Interrupt:** `interrupt()`.
- **Resume:** session id plus the resume option.

What this leaves us to build is a **block renderer** — text, thinking, tool-use
cards, tool-result and diff cards — over our own event log. That is real work,
but it is ordinary UI work against a typed stream, and it is the same surface
the Agents console already fakes.

**The rejected tradeoff:** taking the SDK path means we are
Claude-Code-only. Multi-agent support later would mean either a second adapter
or falling back to a PTY approach. We no longer accept that restriction.

### What the superseded takeover design taught us

The objection that nearly reversed this decision: real work is **interleaved**.
You do not hand a task to an agent and collect the result. You watch it, run
the product, run commands, take the wheel, hand it back. A model that only
offers "supervised dispatch with a typed contract" is describing a workflow
nobody actually has. Orca's terminal-first design is honest about this, and an
SDK-only console looked like it was not.

The SDK proposal tried to resolve this by treating the session as the durable
object and swapping transports. A session started by the Agent SDK is an ordinary
Claude Code session on disk. Per the sessions docs, SDK and `-p` sessions are
kept out of the picker and out of `--continue`, but *"you can still resume one
by passing its session ID to `claude --resume <session-id>`"*, from any
directory. The reverse also works: `claude -p --resume <id>` pushes a follow-up
into a session you have been driving by hand.

In that rejected design, the dispatch record stored the **session ID**, and
taking the wheel required a mode switch:

1. Operator hits *take over* on a dispatch.
2. Factory stops the SDK worker and marks the dispatch `operator-held`.
3. We open a terminal in that worktree running `claude --resume <session-id>`.
   Full TUI, full fidelity, the same conversation.
4. On hand-back, the SDK reattaches to the same session ID and the dispatch
   continues. Everything done by hand is already in the transcript.

The accepted PTY-native design is simpler while the process is alive: the daemon
already owns the real native CLI. **Open terminal** attaches xterm.js to the
existing PTY; closing the view leaves the process running. No SDK stop/resume
handoff occurs. ACP-to-native-TUI handoff remains a separate, capability-gated
flow for adapters that can prove session continuity.

Two separate terminal needs remain:

| Need | Accepted handling |
|---|---|
| A terminal *beside* the agent — dev server, tests, poking the product, git | An ordinary sidecar PTY in the same worktree. |
| Taking the wheel *on the agent's own conversation* | Attach to the dispatch's existing PTY. ACP mode exposes a handoff only when the adapter advertises it. |

The SDK design would have given up:

- **No live co-viewing.** The SDK drives or the TUI drives, not both at once.
- **Takeover is a mode switch, not instant.** Stop the worker, resume in a
  terminal. Small but real friction.
- **The factory must hold a single-writer lock on the session.** This lesson
  survives. In the accepted runtime, the daemon assigns an explicit lease to the
  factory or operator so two inputs cannot corrupt one conversation.

**What this changes in the product model.** A dispatch is a *container* for a
piece of work, not a claim that the agent does it alone. The loop says the work
has a defined start state, a program, and an end state; it says nothing about
who holds the keyboard in between. That makes needs-you a **spectrum** rather
than a binary — from "answer this one question" through "review this diff" to
"I am taking over for twenty minutes" — and `operator-held` is a first-class
dispatch state alongside running / blocked / failed.

Two historical Claude-adapter caveats worth recording:

- The SDK spawns the same `claude` binary underneath, so Claude Code still has
  to be installed and authenticated on the host.
- `--bare` mode does not read subscription login and needs `ANTHROPIC_API_KEY`.
  Which auth path we run workers under is a cost decision to make deliberately,
  not by accident.

---

## 4. What we take from Orca

Read it as a spec. These are battle-tested answers to problems we hit in week
two, and copying the model costs nothing:

| Take | Where | Why |
|---|---|---|
| One-attempt **Dispatch** invariant | `orchestration/types.ts` | Makes retries and stale completions safe without adopting Orca's Task graph. Do this from day one. |
| `worker_done` requires an outcome | orchestration CLI docs | Inspires `factory.complete`: failure is reported explicitly, then validated against the factory contract. |
| Ack-until-processed delivery | `db/messages` | Replay the same batch until acked. Makes a crashed coordinator recoverable. |
| Heartbeats + stale-dispatch warnings | `coordinator-task-dispatch.ts` | The only honest way to tell "working" from "hung". |
| Decision gates | `coordinator-decision-gates.ts` | Maps onto `factory.ask`, plus ACP elicitation or permission events where negotiated. |
| Escalation / question as first-class | `types.ts` | These are our needs-you column. |
| Transcript-tailing as an optional read model | `native-chat/` | Can enrich activity for a specific harness, but never supplies authoritative questions, completion, or status. |

## 5. What we deliberately do not build

Terminal emulator from scratch. Complete coding harnesses. Embedded Chromium.
SSH remoting. Mobile app. Account switching and usage tracking. Federation
across machines. We do build small launch/resume/capability adapters and
integrate public PTY and terminal-renderer packages.

Every one of these is why Orca is 1.5M lines. None of them is why our thing is
interesting.

## 6. Where this decision hurts

Being straight about the risk: Orca's large runtime illustrates how much
complexity accumulates around crash recovery, resume, and mid-flight state for
long-running agent processes, even though that file also covers broader
application concerns.

Mitigation: repository programs, predicates, and contracts remain authoritative
for system definition, while the dispatch event log is authoritative for runtime
lifecycle. Never derive either from in-memory process state. A dispatch must be
reconstructable from the log alone. If we get that seam right the rest is
recoverable; if we get it wrong we will be rewriting.

## 7. Revisit triggers

Reopen the Orca dependency decision if either becomes true:

- Stably ships the orchestration layer as a standalone importable package.
- We need remote/multi-machine workers and federation stops being hypothetical.

Runtime architecture revisit triggers now live in
[`agent-runtime-architecture.md`](agent-runtime-architecture.md).

## Sources

- `github.com/stablyai/orca` @ `933345d`, clone measured locally
- `onorca.dev/docs/cli/orchestration`, `onorca.dev/docs/cli/overview`
- `docs.claude.com/en/api/agent-sdk/streaming-vs-single-mode`
- `docs.claude.com/en/docs/claude-code/headless`
- YC company page, `ycombinator.com/companies/stably-ai`
