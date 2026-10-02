# Mark III prototype

This prototype shows the ideas in [`overview.md`](overview.md). It uses the Mark II layout and styles, and the agent faces from Mark I. Nothing executes. All data is illustrative.

## Run it

```
cd mk3/prototype
python3 -m http.server 4610
open http://localhost:4610/index.html
```

The prototype does not run from `file://`. After an edit, change the `?v=` query on the assets in `index.html`, or the browser can show stale files.

## Files

| File | Holds |
| --- | --- |
| `index.html` | The window shell: sidebar, toolbar, canvas, panel, status strip |
| `base.css` | The Mark II stylesheet, copied without changes. It includes the Mark I agent face (`.agent-avatar`) |
| `mk3.css` | Styles for the Mark III surfaces |
| `data.js` | Programs, buffers, people, the worker pool, tasks, the AM-152 frame, the D-31 defect, scorers, patterns, stale outputs, versions, the tour |
| `app.js` | Rendering, state, and actions |

## Modes

The switch at the top left has three modes:

- **Blueprint.** The design of the line: *Line*, *Scorers*, *Autonomy*, and *Versions*.
- **Run.** The line with work and agents on it: *Live* and *Needs you*. A frame view opens from any agent.
- **Output.** What the line made: *Shipped* and *Defects*.

## The story

The workspace is `agent-mail`. It runs on blueprint v14, forked from the Web product blueprint. The sidebar tour follows six steps.

1. **The blueprint is what you build** (*Blueprint › Line*). The boxes are where work waits: Intent, Specs, Plans, Branches, Verified, Live. Each box lists the fields an item has, and the scorers that read it (teal chips). The arrows between them are programs, drawn as Mark II arrow shapes on the wire. Each program shows its gate: gated, sampled, or autonomous. Click a box to see its scorers, with their dimensions, visibility, low-score policy, and calibration. Click a program to see its panel, which includes the score of its output.
2. **Agents work the line** (*Run › Live*). The run view flips the emphasis: programs become the large stations, because that is where agents work. The places where work waits shrink to small queues. Each agent sits in a dock on the station where it works. The colour shows whose machine it runs on. Idle agents show in a chip at the top. Use + and − in the worker pool to add or remove agents, and the line updates. A person's avatar shows on a gate when work waits for them.
3. **Agents project frames** (*Frame*). Click any agent to see its frame as a film strip. Each part is tagged Blueprint or Work. The agent on AM-152 asked three questions, because the frame left too much open. Answer them and send. A purple card says that one gap (Spec › Constraints) is in the blueprint, not in the work.
4. **Fix the blueprint, not the output** (*Output › Defects*). The trace for D-31 shows what each agent saw on the way to production, and the score each step got. Plan quality scored the plan 4.1, but its policy was "continue, flagged", so nobody looked. Click **Apply as blueprint v15**. The *What v15 makes stale* table shows each stale output, the human time it used, and what the rebuild policy does with it: rebuild, keep, rerun one step, or fix forward. Click **Apply the rebuild policy**. Then click **Discard AM-139 and make it again**. A cloud agent carries the slice through each station, and it ships in Release 44.
5. **Score early, calibrate late** (*Blueprint › Scorers*). Two cards show the two loops. The item loop counts flags, retries and holds, and links to AM-154, which is held for Maya. The factory loop shows patterns: P-7 is the pattern behind D-31, seen 3 weeks before the defect. For P-8, click **Draft a blueprint change**. The draft replays on 12 recent specs and the score goes from 6.4 to 7.9. Then send it to Leo. The list of scorers shows each one's defect rate by score band. Plan quality predicts defects and is ready to hold low plans. Diff risk does not predict defects, so it stays off every gate.
6. **Earn autonomy** (*Blueprint › Autonomy*). Human decisions per shipped slice, and stations with a gate, across versions. Write spec is ready to move from gated to sampled, because Leo stopped changing its specs.

## State changes

- After v15, Plan slice and Test + validate show a `v15` tag. The Plan slice frame includes Spec › Constraints.
- After you send the AM-152 answers, an Answers part joins the frame, and the agent continues on the live line.
- After you approve Release 43, it leaves the Ship release gate and appears in *Shipped*.
- During the AM-139 rerun, the cloud agent moves from station to station on the live line and on the defect page.
- A change to a station's autonomy level shows on the line, in the panel, and on the autonomy page.
- On the live line, AM-154 shows **Held · 4.6** at Plan slice, and AM-149 shows **Retry**. In *Run › Needs you*, the held plan shows each dimension and its reasons. **Send back with the reasons** gives it one retry. **Approve as it is** moves it on.
- After v15, the stale items on the live line (AM-149, AM-147, AM-143) show **Stale**. After the rebuild policy is applied, they show **Rebuild · v15** or **Rerun · v15**. AM-146 keeps its plan, because it passed a human gate and scored 8.2.
- A change to a scorer's low-score policy (Flag, Retry, Hold) updates the item loop counts.

## Deep links

| Parameter | Effect |
| --- | --- |
| `view=run:frame` | Opens a view. The format is `mode:view` |
| `task=AM-150` | Sets the task for the frame view |
| `sel=plan` | Selects a station on the line |
| `v15=1` | Starts with blueprint v15 applied |
| `sent=1` | Starts with the AM-152 answers sent |
| `rerun=5` | Starts with the AM-139 rerun complete |
| `rebuild=1` | Starts with the v15 rebuild policy applied |
| `held=back` | Starts with AM-154 handled. `back` or `approved` |
| `draft=1` | Starts with the P-8 change drafted. `2` = sent to Leo |
| `dark=1` | Uses the dark theme |

## Not built

- Editing a program or a frame.
- Choosing a blueprint to fork.
- Pan and zoom on the line. The line fits the window.
- Editing a scorer, or adding one to a collection.
- Pausing one program (stopping the line).
- Showing artifact lineage. Stale items are listed, but the history of each artifact is not drawn.
