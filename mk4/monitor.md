# The fab monitor

The monitor is a small macOS app: an icon in the menu bar, and a panel that can stay on top of other windows. It shows where the work is in the fab, who has agents on it and how good it is, and it starts jobs. It is a view over the `fab` CLI ([`cli.md`](cli.md)). All of the logic is in the CLI. The prototype is in [`prototype/`](prototype/).

## Who it is for

- **A person who does not write code.** They open the monitor, click **Log bug** or **Plan feature**, answer a question, and a job starts correctly in their harness. They do not need to know job names or what to type to an agent.
- **A builder working alone.** They see what is in each stage, open it, and press ▶ on its next job to move the next piece of work on. The fab gives them a process they did not have to design.
- **A developer with many sessions.** They see which agents run, which job each one follows, what artifact it is on, and which ones wait. One click takes them to the session.
- **A lead.** They see where work piles up (everything waiting for review, nothing being planned) and which stages score low.
- **A new team member.** The stages show how work moves in this project, and where it is now, before they read any file.

## The shape

- **The menu bar icon** shows a count of your agents that run, and an amber dot when one waits for you. Click it to open the panel.
- **The panel** opens under the icon. Pin it to make it a floating window that stays on top and keeps its position. It is narrow (about 380 pt) so that it can sit beside an editor.
- **The fab picker** at the top chooses the fab. It lists the fabs that `fab fabs list` returns. "All fabs" shows one row per fab, with how much is in flight and the agents on it.
- **The footer** shows how many agents are yours and how many are teammates' (preview), and whether the installed fab is up to date (`fab check`).

The panel has two tabs.

### Pipeline

One row per stage, in flow order, from `fab work --json`:

```
 26 in flight                         10 agents on it · 4 teammates'

 › Intake            8  ⬚⬡⬡⬡⬡⬡⬡⬡⬡
   oldest 6d             ‾   ‾                    (red marks: low scores)
 › Approved specs    3  ⬚⬡⬡⬡
 › WIP plans         1  ⬢                         (amber: waits for the tech lead)
 › Ready to build    4  ⬡⬡⬡⬡
   2 over 5d
 › Building          3  ⬢⬢⬢
 ⌄ Needs review      6  ⬡⬡⬡⬢⬡⬢                    ← the pile-up
   6 over 1d
     ▽ prs head:feat/*  where  ready for review, not approved
     ⬡ export-csv S0                         ◔  3d
     ⬢ billing-fix S1                  ▣M    ◔  2d
     ⬢ context-packs S2           ▣ ▣ ▣K     ◕  1d
     ────────────────────────────────────────────
     ▶ Review slice          then the code owner approves
 › Ready to merge    1  ⬡
 › Shipped           4  ⬡⬡⬡⬡                      (last 7 days, dimmed)
```

- **A cube is one artifact.** Each one is drawn as a small isometric cube with three shaded faces. Its colour is the state of the agents on it: grey, none; green, an agent works on it; pale green, its agents are idle; amber, an agent or the stage waits for a person. A dashed wireframe cube is being made by a job that has not finished. A red mark under a cube means a score under 5. There is no key. Hover a cube to see its title, its time in the stage, its agents and its worst score.
- **The bar is the chart.** As cubes stack up, the rows read as a horizontal bar chart. You see where the work is before you read a word. After 14 cubes the row shows "+N".
- **The line under the title** says how long the oldest artifact has waited, or, in amber, how many are over the stage's `slow-after`.
- **Click a row** to open the stage. Opening a row does not move the rows around it.
  - Its filter (`prs head:feat/*` where `ready for review, not approved`), so it is clear the stage is a query, not a status.
  - Each artifact: its cube, its title, its agents as harness icons (with a teammate's initial on theirs), its score ring (below), and how long it has waited.
  - Under a line, the stage's **next job** as a row: ▶ and the job's name (*Review slice*), and who must approve after it. Click it to run the job. A job that takes one artifact opens the start sheet with the oldest unclaimed artifact selected. A job that reads the whole stage starts at once. ⌥-click chooses the harness. A stage with no `next` job (*Shipped*) has no row.
- **Click a cube or an artifact** to open the artifact sheet (below).

**The score ring.** Scores show as a round bar chart, not as numbers in chips. Each of the stage's scorers owns an equal share of the circle and fills its share by its score (0–10). The fills are laid end to end with a small gap between them, so the length of the arc is the total. With one scorer, the ring is that score as a fraction of the circle. The ring has one colour, from the total: green at 7 or more, amber at 5 or more, red under 5. Hover it for each scorer's name and score.

### Jobs

Everything the fab can have an agent do.

- **Start something:** a button for each job with no `from`, one per entry (*Log bug*, *Log idea*, *Log feedback*). Click, answer, and it starts.
- **Move work along:** each other job in stage order, as `from → to` (*Review slice: Needs review → Ready to merge*). Each shows how many artifacts wait in its `from` stage and the agents that run it now. Click the row to open the job sheet; start the job from there.

## Sheets

A sheet slides over the panel. Back, or Esc, returns.

**Start a job.**

1. If the job takes one artifact: "Which pull request?", a list of the `from` stage's artifacts, each with its age and how many agents are on it. The oldest one with no agent is selected.
2. The job's `inputs`, as fields. A field with `default` is filled in. Optional fields are marked.
3. The harness, with its icon. The person's default is selected. Harnesses that `fab doctor` did not find are greyed out, with the reason.
4. If the job has `worktree: new`, the branch it will use.
5. **Command** (folded): the `fab run` line, and the opening prompt with its `fab-run:` and `On:` lines and the scorers that will run on the output.
6. **Start**, or ⌘↩. The monitor runs `fab run <job> --on <ref> --input … --harness …`. The new agent shows on its artifact's cube at once.

**An artifact.**

- Its title, stage, time in the stage, and its reference (path, PR, branch or ticket). **Open** opens it.
- **On it now:** the agents on it, grouped by person, each with the job it runs and its harness. Teammates' agents are marked as synced.
- **Scores:** a large score ring with the total in its centre, for the current stage's scorers. Under it, one row per scorer with a small ring and the number. The current stage's scorers first; scores from earlier stages are dimmed.
- **History,** newest first: each stage it passed through, the job, harness and person that moved it, the scores it got there, and how the step was linked (run record, branch name, or found by the filter).
- The footer button runs the stage's next job on this artifact.

**A job.** Its description, from and to stages, whether it takes one artifact or the whole stage, who decides, the average scores its output gets, its inputs, and the agents that run it now. **Open SKILL.md** and **Start**.

**A session.** Its job, the artifact it is on, whose it is, harness, age, branch, worktree, how it was matched, and its run record. **Go to Session** brings it to the front. A teammate's session cannot be opened from here.

## How it works

```
Monitor (SwiftUI)  ── reads ──►  fab status --all --watch --json   (one JSON line per change)
                   ── reads ──►  fab work --all --watch --json     (stage contents and scores)
                   ── calls ──►  fab run / fab focus / fab history --json / fab list --json
fab CLI            ── reads ──►  harness files, Orca CLI, run records, score records, .fab/
                   ── reads ──►  stage sources: files, git, gh, Linear
```

- The monitor starts one `fab status --watch` and one `fab work --watch` process and redraws when a line arrives. File sources use file events. `prs` and `linear` sources are polled, about once a minute, and when a job ends.
- When a job ends, the CLI sees the output land in the `to` stage, runs that stage's scorers, and writes a score record. The cube moves and its scores update.
- The monitor keeps no state of its own except its window position and settings.
- Any other front end can do the same. A Raycast extension, a TUI, or a SwiftBar plugin needs only the same commands.

**Build order.** First, a SwiftBar or xbar plugin that prints `fab work` as one line per stage with a count, and `fab status` below. It takes a day, and it tests the filters, the adapters and whether people want the view. Then the SwiftUI app, with `MenuBarExtra` for the menu and an `NSPanel` for the floating window.

## Settings

- Default harness: Claude Code, Codex, Cursor, opencode, Orca.
- Terminal app for plain CLIs: Terminal, iTerm2, Ghostty, Warp.
- Appearance: auto, light, dark.
- Notifications: when an agent waits for you. Launch at login.
- Team (preview): show teammates' agents.
- Fabs: add or remove a folder (the same as `fab fabs add`).

## Limits

- **macOS only** at first. The CLI works on any system. Only the app is macOS.
- **This machine only.** Agents and scores come from this machine. The stage contents are shared, because they come from the repository, GitHub and Linear. Teammates' agents need a sync between fab clients, which Mark IV does not have. The prototype shows what it would add.
- **"Waits for you" depends on the harness.** Claude Code and Orca report it. For the others the monitor shows working or idle from file activity, until hooks are added. See [`research/agent-sessions.md`](research/agent-sessions.md).
- **Going to a session depends on the harness.** Orca can focus a terminal. A plain CLI in a Terminal window can be brought forward if the monitor opened it. A session someone started in a tab of their own may not be reachable.
- **nodeterm.** The monitor shows nodeterm's agents, but it cannot start a session in nodeterm yet.

## Not in the first version

- Editing the fab in the monitor.
- Answering an agent's question from the monitor. nodeterm shows this is possible for Claude Code through hooks.
- Sessions and scores from other machines (the team view).
- Charts over time: how long work waits in each stage this month, and how scores trend. The stage bars are a snapshot. A bottleneck shows best as a trend.
