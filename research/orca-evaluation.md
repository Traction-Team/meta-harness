# Orca: build on it, or take from it?

Researched 26 Aug 2026. Sources are a full clone of `stablyai/orca` at
`933345d` (25 Aug 2026), the Orca docs at onorca.dev, and the Claude Agent SDK
docs.

**Verdict: take from it, do not build on it.** We write a thin wrapper around
Claude Code ourselves. Orca becomes a reference implementation we read, not a
dependency we ship. The reasoning is below, and the decisive part is not the
size — it is that Orca's orchestration model is imperative where ours is
declarative, and adopting it would make Orca's Run/Task/Dispatch the source of
truth for execution instead of the loop.

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

Compare that to our Agents board (needs-you / failed / blocked / running). Same
shape. `escalation` and `question` *are* needs-you.

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

Orca's native chat is **asymmetric**, and the trick is worth knowing:

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
is "runs in a terminal, writes a transcript somewhere." **We do not have that
constraint.**

### How we should do it

We only target Claude Code, so we can use the supported programmatic path: the
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

**The tradeoff, stated honestly:** taking the SDK path means we are
Claude-Code-only. Multi-agent support later would mean either a second adapter
or falling back to Orca's PTY-plus-transcript approach. We are accepting that.
Supporting 25 agent CLIs is Orca's business, not ours.

Two smaller caveats worth recording:

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
| Run / Task / **Dispatch** split | `orchestration/types.ts` | A dispatch being *one attempt* is the thing that makes retries and stale completions safe. Do this from day one. |
| `worker_done` requires an outcome | orchestration CLI docs | Forces failure to be reported, not inferred from a dead process. |
| Ack-until-processed delivery | `db/messages` | Replay the same batch until acked. Makes a crashed coordinator recoverable. |
| Heartbeats + stale-dispatch warnings | `coordinator-task-dispatch.ts` | The only honest way to tell "working" from "hung". |
| Decision gates | `coordinator-decision-gates.ts` | Maps onto `canUseTool` for us. |
| Escalation / question as first-class | `types.ts` | These are our needs-you column. |
| Transcript-tailing as a *fallback* | `native-chat/` | If we ever need a non-SDK agent, this is the pattern. Note the path-encoding traps. |

## 5. What we deliberately do not build

Terminal emulator. File editor. Embedded Chromium. SSH remoting. Mobile app.
Account switching and usage tracking. Adapters for agents other than Claude
Code. Federation across machines.

Every one of these is why Orca is 1.5M lines. None of them is why our thing is
interesting.

## 6. Where this decision hurts

Being straight about the risk: the reason `orca-runtime.ts` is 41k lines is
crash recovery, resume, and mid-flight state for long-running agent processes.
That is genuinely hard and a hand-rolled version will hurt around month three.

Mitigation: treat the event log as the source of truth from the first commit,
never in-memory process state. A dispatch must be reconstructable from the log
alone. If we get that seam right the rest is recoverable; if we get it wrong we
will be rewriting.

## 7. Revisit triggers

Reopen this decision if any of these become true:

- Stably ships the orchestration layer as a standalone importable package.
- We need three or more agent CLIs, not just Claude Code.
- We need remote/multi-machine workers and federation stops being hypothetical.

## Sources

- `github.com/stablyai/orca` @ `933345d`, clone measured locally
- `onorca.dev/docs/cli/orchestration`, `onorca.dev/docs/cli/overview`
- `docs.claude.com/en/api/agent-sdk/streaming-vs-single-mode`
- `docs.claude.com/en/docs/claude-code/headless`
- YC company page, `ycombinator.com/companies/stably-ai`
