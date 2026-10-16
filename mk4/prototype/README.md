# Mark IV prototype: the fab monitor

A click-through of the fab monitor in [`../monitor.md`](../monitor.md). Plain HTML, CSS and JS. No build step. The visual style comes from the Mark II prototype ([`../../mark-two/prototype/`](../../mark-two/prototype/)).

From the repository root:

```sh
python3 -m http.server 4180
```

Open http://localhost:4180/mk4/prototype/.

The desktop, menu bar and editor are scenery. They show the monitor where it will be used: under a menu bar icon, beside an editor.

## What to try

1. **The menu bar icon** shows an amber count of sessions that wait for you. If no session waits, it shows how many sessions run. Click the icon to open or close the panel.
2. **Now.** Sessions are grouped by program, in flow order. Click a row to go to its session. A fake terminal comes to the front. Hover a row and click ⓘ to see how the monitor matched the session: exact, transcript, inferred or folder.
3. **Start.** Click **Log bug**, answer the question and pick a harness. Open **What runs** to see the `fab run` command, the adapter command and the opening prompt with its `fab-run:` line. Then click **Start**, or press ⌘↩. The session shows in **Now** as *starting*, then *working*. About 16 seconds later it finishes, and the intake-note count on the map goes up by one.
4. **Map.** The programs come from walking `next`. Decisions (◆) and artifacts, with the number that wait, sit on the links between programs. Click a program to see its contract and its sessions. Click an artifact to open its folder.
5. **Pin** (the pin icon) makes the panel a floating window. Drag it by its header. When the panel is pinned, a session that starts to wait also shows a macOS-style notification.
6. **The fab picker** switches between `dragonfly`, `invoice-service` and **All fabs**. In `invoice-service`, the footer shows a `fab check` problem.
7. Keys: `1` `2` `3` switch tabs. Esc closes the sheet, and then the panel.

The prototype plays a few changes on a timer. At about 7 s a session starts to wait. At about 19 s a bug note finishes. At about 44 s an Orca planning session asks a question.

## Choices the prototype makes

These are open questions in the docs. The prototype picks one answer for each, so that the answer can be tested.

- **One program, many buttons.** `file-work` lists `entries`: Log bug, Log idea and Log feedback. Each entry has its own title and fixed inputs (`kind=bug`).
- **Inputs from files.** `plan-feature` asks "Which roadmap line?" as a choice list taken from `roadmap.md`.
- **Programs with no inputs start at once** in the default harness. ⌥-click opens the sheet so you can pick another harness.
- **Harness capabilities, not harness names**, decide what is shown. Codex and opencode cannot report *waits for you*, so their sessions show only *working* or *idle*. A harness that `fab doctor` did not find is greyed out, with the reason.

## Files

| File | Holds |
| --- | --- |
| `data.js` | The harness capability table, two fabs (programs, artifacts and decisions), and the sessions and finished runs |
| `app.js` | The panel, the Now, Start and Map tabs, the sheets, pin and drag, and the simulated `fab status --watch` |
| `styles.css` | Mark II's design tokens, the panel and the desktop scenery |

## What is fake

All of it. No harness is read and no session starts. Run IDs, the commands, the transcripts and the counts come from fixtures. Settings are kept only in memory.
