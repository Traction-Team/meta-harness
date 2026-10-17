# Mark IV prototype: the fab monitor

A click-through of the fab monitor. Plain HTML, CSS and JS. No build step.

From the repository root:

```sh
python3 -m http.server 4180
```

Open http://localhost:4180/mk4/prototype/.

The desktop, menu bar and editor are scenery. The editor shows `.fab/fab.yaml`, the factory layout that you share to share a factory.

## Iteration 2: jobs, stages, scorers

Iteration 1 showed programs and the agents that ran them. Iteration 2 shows the **work**: where every artifact is, who has agents on it, and how good it is.

- **Programs are now jobs.** A job is a definition of work that an agent can do. A job moves work from one stage (`from`) to the next (`to`). A job with no `from` starts new work.
- **Stages come back from Mark II.** A stage is a *filter* over things that already exist: files (intake notes, approved specs), slices in plans, branches, PRs or Linear issues. It is never a status that fab writes. So a fab installed into a repo that already has plans, branches and PRs shows them in their stages on the first run, with no history needed.
- **Scorers come back from Mark III.** A scorer asks one question about the artifacts in a stage, for example "Does the plan name the edge cases?" or "Does it add little tech debt?". It answers 0–10, and higher is always better.
- **History is linked, not required.** fab links an artifact to its earlier forms by run record, branch name, or a link in the file. Work made outside fab still shows. Its history says "found by the stage filter".
- **Teammates' agents are a preview.** Sessions have an owner. Other people's agents show with their initial. Nothing in Mark IV reads another machine. This shows what a sync between fab clients would give a team. Turn it off in Settings → Team.

## Iteration 3: cubes and score rings

- **The Work tab is now Pipeline.** The tabs are Pipeline and Jobs.
- **Artifacts are cubes.** Each artifact is a small isometric cube with three shaded faces. The flat coloured squares and their key are gone. Squares, rings and agent icons in the bar were tried and dropped.
- **Scores are score rings.** A round bar chart: each of the stage's scorers owns an equal share of the circle and fills it by its score, end to end, so the arc is the total. One colour from the total: green at 7 or more, amber at 5 or more, red under 5.
- **The next job moved into the stage.** The ▶ is gone from the stage rows. An opened stage ends with a line and a ▶ row for its next job.
- **Stages renamed.** *On the roadmap* is now *Approved specs* (`files docs/specs/*.md` where `status: approved, no plan links it`). *Plan in review* is now *WIP plans*. The job *Pull next work* is now *Start next plan*.
- **Less on screen.** An opened stage no longer shows score averages, a "Next:" line or "Not on any work". Opening a stage no longer moves the rows around it.

## What to try

1. **Pipeline.** There is one row per stage, in flow order. Each cube is one artifact that the stage's filter finds, so a pile-up shows before you read anything. Here, *Needs review* is the bottleneck. Cube colours: grey waits, green has an agent on it, pale green has idle agents, amber needs a person, and a dashed wireframe is being made. A red mark under a cube means a low score. Hover a cube for its title, age, agents and worst score. A stage label turns amber when artifacts sit there longer than its `slow-after` limit.
2. **Open a stage** (click its row). It shows the stage's filter, then each artifact with its agents, its score ring and its age. Under a line, the last row is the stage's next job.
3. **Open an artifact** (click a cube or a row). It shows the agents on it, grouped by person, with the job each one runs. It shows the stage's total as a large score ring, one ring per scorer, and the **history** back to the first intake note, with the job, harness, person and scores at each step. Try *context-packs S2* in Needs review, and *billing-fix S1*, which was built by hand outside fab.
4. **▶ at the foot of an opened stage** runs the job that moves work out of it. A job that takes one artifact opens a sheet with the oldest unclaimed artifact already selected. *What's next?* reads the whole Intake, so it starts at once. About 15 seconds after a job starts, its artifact moves to the next stage, the stage's scorers add scores, and a step is added to its history.
5. **Jobs.** *Start something* lists the jobs that make new work; click one to start it. *Move work along* lists each job as `from → to`, with how many artifacts wait for it. Click one to open it: what it takes, what decides, and the scores it gets on average. Start it from there.
6. Keys: `1` Pipeline, `2` Jobs. Esc closes the sheet, and then the panel. ⌥-click a ▶ to choose the harness.

The prototype plays changes on a timer. At about 7 s an agent waits for you. At about 19 s a bug note lands in Intake. At about 30 s Kat's build moves into Needs review. At about 40 s Mo's review moves billing-fix to Ready to merge.

## Open questions this iteration raises

- Are stages always disjoint? *Building* and *Needs review* both filter PRs. Here they split on draft or ready. Some fabs will want an artifact in two stages at once.
- When a job runs on an artifact, the artifact stays in its `from` stage until the job's output lands. Is that clear enough, or should "being worked" be a state of its own?
- Scores belong to a stage, and each history step keeps the scores it had at that point. Should a job also be scored as a run, separate from the artifact it made?
- How far back can history be linked without fab metadata? Here it uses run records, branch names and links in plans.

## Files

| File | Holds |
| --- | --- |
| `data.js` | Harnesses, people, two fabs (stages, jobs, scorers, artifacts with history), sessions |
| `core.js` | Icons, state, helpers, the cube and the score ring, the panel shell |
| `work.js` | The Pipeline tab (stage bars) and the Jobs tab |
| `sheets.js` | Start a job, and the job sheet |
| `artifact.js` | The artifact sheet (agents, scores, history), the session sheet, settings |
| `events.js` | Clicks, keys, focus, notifications |
| `sim.js` | The simulated `fab status --watch`: jobs end, artifacts move, scorers run. Also the scenery |
| `styles.css`, `work.css` | Mark II's design tokens and the panel; then the stage bars, cubes, score rings and history |

## What is fake

All of it. No harness is read and no session starts. Filters, scores, history, teammates and counts come from fixtures. Settings are kept only in memory.
