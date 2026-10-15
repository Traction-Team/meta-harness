# The fab monitor

The monitor is a small macOS app: an icon in the menu bar, and a panel that can stay on top of other windows. It shows the fab and what runs in it, and it starts programs. It is a view over the `fab` CLI ([`cli.md`](cli.md)). All of the logic is in the CLI.

## Who it is for

- **A person who does not write code.** They open the monitor, click **Log bug** or **Log idea**, answer two questions, and work starts correctly. They do not need to know the program names or what to type to an agent.
- **A developer with many sessions.** They see at a glance which sessions run, which program each one follows, and which ones wait. One click takes them to the session.
- **A new team member.** The map shows how work moves in this project before they read any file.

## The shape

- **The menu bar icon** shows a count: sessions that wait for you, or, when none wait, sessions that run. Click it to open the panel.
- **The panel** opens under the icon. Pin it to make it a floating window that stays on top and keeps its position. It is narrow (about 320 pt) so that it can sit beside an editor.
- **The fab picker** at the top chooses the fab. It lists the fabs that `fab fabs list` returns. "All fabs" shows every fab together.

The panel has three tabs.

### Now

The sessions on this machine that run in the selected fab, grouped by program:

```
Build slice                      2
  ● context-packs S3   claude   working   14m   feat/context-packs-s3
  ◐ fix-refund-total   codex    waits     2m    fix/refund-total        Needs you
Log bug                          1
  ● INV-2041 refund    claude   working   1m    main
In this repo, program unknown    1
  ○ "can you look at…" opencode idle      40m   main
```

- **State:** working, waits for you, idle, or unknown. "Waits for you" shows only when the harness reports it (see [Limits](#limits)).
- **Label:** the run's first input, or the session name. Sessions the monitor did not start show their first prompt.
- **Click a row** to go to the session: the Orca terminal, the Terminal window, or the nodeterm node.
- **Finished today** is a folded group at the end, from the run records.

### Start

A button for each program with `entry: true`, with its `title` and the first line of its `description`.

1. Click a program. A sheet opens with its `inputs`, as fields. A field with `default` is filled in. Optional fields are marked.
2. Choose the harness. The person's default is selected. Harnesses that `fab doctor` did not find are greyed out, with the reason.
3. If the program has `worktree: new`, the sheet shows the branch name it will use.
4. Click **Start**. The monitor runs `fab run <program> --input … --harness …`. The new session appears in **Now**.

A program with no inputs starts at once. Its instructions ask the questions in the session.

### Map

A small drawing of the fab, from `fab map --format json`:

```
 Log bug ─┐
 Log idea ┼─► [intake 7] ─► What's next? ─◆ whats-next ─► [roadmap 4]
 Feedback ┘                                                  │
                                       Plan feature ◄────────┘
                                            │ ◆ plan
                                       Pull work ─► Build slice ●2 ─► Finish slice ─◆ done ─◆ merge
```

- Programs in flow order. A dot shows how many sessions run in each one now.
- Artifacts between them, with the count that waits, from `waiting:` in `fab.yaml`.
- Decisions as diamonds, with who owns them.
- Click a program to see its description, its inputs, and **Start** (if it is an entry program). Click an artifact to open its folder.

The map is for orientation. It is not an editor. To change the fab, edit `.fab/` or ask an agent.

## How it works

```
Monitor (SwiftUI)  ── reads ──►  fab status --all --watch --json   (one JSON line per change)
                   ── calls ──►  fab run / fab focus / fab map --json / fab list --json
fab CLI            ── reads ──►  harness files, Orca CLI, run records, .fab/
```

- The monitor starts one `fab status --watch` process and redraws when a line arrives. The CLI watches the harness folders with file events, and polls every 2 seconds where file events are not enough.
- The monitor keeps no state of its own except its window position and settings.
- Any other front end can do the same. A Raycast extension, a TUI, or a SwiftBar plugin needs only the same two commands.

**Build order.** First, a SwiftBar or xbar plugin that prints `fab status` in the menu bar. It takes a day, and it tests the adapters and whether people want the view. Then the SwiftUI app, with `MenuBarExtra` for the menu and an `NSPanel` for the floating window.

## Settings

- Default harness: Claude Code, Codex, opencode, Orca, or ask each time.
- Terminal app for plain CLIs: Terminal, iTerm2, Ghostty, Warp.
- Fabs: add or remove a folder (the same as `fab fabs add`).
- Launch at login.
- Notifications: when a session waits for you, and when a run that the monitor started finishes.

## Limits

- **macOS only** at first. The CLI works on any system. Only the app is macOS.
- **This machine only.** It shows the sessions on this machine. Team-wide views need a shared service, which Mark IV does not have.
- **"Waits for you" depends on the harness.** Claude Code writes its session status to disk. For the others the monitor shows working or idle from file activity, until hooks are added. See [`research/agent-sessions.md`](research/agent-sessions.md).
- **Going to a session depends on the harness.** Orca can focus a terminal. A plain CLI in a Terminal window can be brought forward if the monitor opened it. A session someone started in a tab of their own may not be reachable.
- **nodeterm.** The monitor shows nodeterm's agents, but it cannot start a session in nodeterm yet.

## Not in the first version

- Editing the fab in the monitor.
- Answering an agent's question from the monitor. nodeterm shows this is possible for Claude Code through hooks. Add it after the hooks.
- Sessions on other machines, or in the cloud.
- History and charts across runs.
