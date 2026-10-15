# Mark III prototype

A click-through of the Metafab experience in `../overview.md`. Plain HTML, CSS and JS. No build step.

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8731
```

## Two views

- **The factory.** The canvas. It shows where work is and where it waits. On the left: **Needs you** (agents waiting for an answer, gates waiting for a decision) and **Agents** (each Claude Code or Codex session and what it is doing now).
- **The workspace.** Click any ball, any Needs-you row, or any agent. Each item is a workspace:
  - **Left:** the chats. There is one per program run, plus the reviewer agent at an agent gate. Runs from the parent spec and from the defect it came from are there too. Questions and gate decisions sit at the end of the conversation that produced them.
  - **Right:** the item itself: request, spec, slices, changes (file tree and diff), pull request, Sentry event, trace.
  - **Bottom:** a terminal on the item's worktree (dev, test, shell).
  - **Top:** the lineage, where the item is in the workflow, and Rewind.

  Esc goes back to the factory.

## Files

| File | Holds |
| --- | --- |
| `data.js` | One hand-written project (Invoice service): requests, specs, slice plans, diffs, tests, Sentry defects, agents |
| `app.js` | The canvas and the simulation: when things happen |
| `work.js` | The workspace view and the transcripts built from `data.js` |

## Flow to try

1. Open **Invoice service** and press **Play**.
2. Within a few seconds, two agents ask a question while they write a spec. Open one from **Needs you**, and answer with a button or by typing.
3. The spec stops at the Product gate. Read it on the right. Approve it, edit it (your edit is stored as feedback), or send it back with a reason.
4. Slices build in their own worktrees. Open one to watch the agent read, edit and run tests. Expand an Edit to see its diff.
5. PRs stop at the Release lead gate. Review the changes and the PR, then approve.
6. A slice that shipped without error-path tests comes back as a Sentry defect. Triage sends a Fix request to the start, linked to the defect.
7. **Maintain** finds the weak program. After rollover, Build slice v2 writes the error-path tests first. You can see this in its chat and its diff.

Time on screen is factory time: one real second is two minutes.
