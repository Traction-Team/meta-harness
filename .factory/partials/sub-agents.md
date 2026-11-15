**Sub-agents.** Delegate each task, fix and review to a fresh context: a sub-agent that holds the work, the checks and the report, so its context ends with it. The names and the models are settings in `docs/factory.md`; never write one into a workflow.

<!-- factory:switch env.harness -->
<!-- factory:case opencode -->
Start a sub-agent with the Task tool, `subagent_type` set to the `sub-agent-coding` value for a task or fix, `sub-agent-review` for a review and `sub-agent-planning` for planning. `opencode.json` defines all three, and the review sub-agent is on a different model family from the coding one, so a review is not the code's own family.

You are in this case when `OPENCODE=1` is set (`printenv OPENCODE`). The opencode-claude-bridge plugin replaces the Task tool's list with Claude Code's fixed one (`general-purpose`, `Explore`, `Plan`), so the names may not appear: call them anyway, they run. Fall back to `general-purpose` only when a named call fails with an unknown-agent error, and say so in one line. The same plugin shows the word `opencode` to the model as `Claude`, so never put it in a branch, worktree or folder name.

A sub-agent works in this checkout, so its commits are already on the branch: it commits and does not push.

<!-- factory:case claude -->
Start a sub-agent with the Agent tool, choosing the sub-agent whose name is the `sub-agent-coding` value for a task or fix, `sub-agent-review` for a review and `sub-agent-planning` for planning. `.claude/agents/` defines all three and pins no model, so each runs on this session's model. When one of them is missing, `metafab update --setup` creates it from the fab template.

You are in this case when `CLAUDECODE=1` is set (`printenv CLAUDECODE`). Fall back to `general-purpose` only when a named call fails with an unknown-agent error, and say so in one line.

A sub-agent works in this checkout, so its commits are already on the branch: it commits and does not push.

<!-- factory:case amp -->
Start each sub-agent as a new Amp thread with `create_thread`, one at a time, with the prompt its step sets out. You are in this case when `AMP_THREAD_ID` is set, or the session has the `create_thread` tool.

- `executor`: `orb`. `intent`: `delegation`. `title`: `<plan number> <task n, fix n or review n>`.
- `model` (`agent_mode` in older Amp versions): the `amp-model-coding` value for task and fix threads, and the `amp-model-review` value for review threads. Empty keeps the thread's own mode.
- `prompt`: the brief, then the lines below.

The new thread runs in its own orb, which starts on `trunk`, and it cannot see your checkout. So `git push` the branch before each thread starts, and end every brief with:

```text
Your orb starts on the trunk. First run: git fetch origin && git switch <branch>
<Task and fix threads only:> Commit as asked, then git push origin <branch>.
Do the work in this thread; do not create other threads.
When finished, send your report to <this thread's URL> with send_thread_message,
and end with the same report as your final message.
```

In a review brief, `Worktree:` is `your own checkout of <branch>`. Then end your turn: the report arrives as a message in this thread. Do not read the thread while it works. After a task or fix thread reports, run `git pull --ff-only` before the next step. If a thread stops without sending its report, read its final message with `read_thread`. Each hand-off ends your turn, so one build spans several turns.

Amp's CI and pull request subscriptions can fail with "Only a workspace subscription can watch" when the repository belongs to an organization. Skip them, in this thread and in the threads you start.
<!-- factory:endswitch -->
