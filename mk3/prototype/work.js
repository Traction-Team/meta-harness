'use strict';
/* Metafab · Mark III · the work view.
   Two views only: the canvas (the whole factory) and this one (one item's workspace).
   An item is a workspace: its chats (one per program run, plus reviewer agents), its files
   and PR on the right, and a terminal on its worktree below. Questions and gate decisions
   are not a separate inbox: they sit at the end of the conversation that produced them. */

// ───────────────────────────────────────────── markdown (small, enough for specs and chat)
const escH = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inlineMd = (x) => escH(x).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
function mdHtml(text) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { close(); out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inlineMd(m[1])}</li>`); continue; }
    if ((m = line.match(/^\s*(\d+)\.\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li value="${m[1]}">${inlineMd(m[2])}</li>`); continue; }
    close(); out.push(`<p>${inlineMd(line)}</p>`);
  }
  close(); return out.join('');
}
const md = (text, cls = '') => h('div', { class: 'md ' + cls, html: mdHtml(text) });

// ───────────────────────────────────────────── content helpers
function lineageUp(it) { const out = []; let c = it; while (c) { out.unshift(c); c = c.parent ? IT(c.parent) : null; } return out; }
const specPath = (it) => `specs/${rootOf(it).content?.key || 'request'}.md`;
function specTextOf(it) { const r = rootOf(it); return r.specText ?? r.content?.spec ?? ''; }
function criteriaOf(it) {
  const m = specTextOf(it).split('## Acceptance criteria')[1] || '';
  const out = {}; for (const l of m.split('\n')) { const x = l.match(/^(\d+)\.\s+(.*)$/); if (x) out[x[1]] = x[2]; } return out;
}
const ownRuns = (it, pid) => M.runs.filter(r => r.item === it.id && (!pid || r.program === pid));
const lastRun = (it, pid) => ownRuns(it, pid).filter(r => !r.cancelled).slice(-1)[0] || null;
function strongBuild(it, run) { const sl = sliceOf(it); if (!sl) return true; if (run && run.strong != null) return run.strong; return !(P('build-slice').weak && sl.weakTests); }
function testsWritten(it, run) { const sl = sliceOf(it); if (!sl) return []; return strongBuild(it, run) ? sl.tests : sl.tests.filter(t => !t.err); }
function counts(f) { let a = 0, d = 0; for (const hk of f.hunks) for (const l of hk.l) { if (l[0] === '+') a++; else if (l[0] === '-') d++; } return { a, d }; }
function sliceFiles(it, run) {
  const sl = sliceOf(it); if (!sl) return [];
  const tests = testsWritten(it, run);
  const files = sl.files.slice();
  if (tests.length && sl.test) files.push(testFile(sl.test.path, sl.test.subject, sl.test.imports, tests));
  return files.map(f => ({ ...f, ...counts(f) }));
}
function prNumber(it) { return it.pr || null; }

// ───────────────────────────────────────────── sessions
// A session is one conversation in this workspace: a program run, or a reviewer agent at a
// gate. Sessions from the parent (the spec this slice came from) and from the origin (the
// defect a Fix request came from) are shown too, so the whole story is in one place.
function sessionsFor(it) {
  const out = []; const seen = new Set();
  const addItem = (a, inherited) => {
    if (!a || seen.has(a.id)) return; seen.add(a.id);
    for (const r of M.runs.filter(r => r.item === a.id)) out.push({ id: r.id, kind: 'run', run: r, item: a, inherited, start: r.startedAt });
    for (const rv of a.reviews) out.push({ id: rv.id, kind: 'review', rv, item: a, inherited, start: rv.start });
  };
  const chain = lineageUp(it); const root = chain[0];
  if (root.origin && IT(root.origin)) addItem(IT(root.origin), true);
  for (const a of chain) addItem(a, a !== it);
  if (it.loc?.kind === 'gate' && it.decideAt) out.push({ id: 'live-review:' + it.id, kind: 'review', rv: { gate: it.loc.gate, start: it.decideStart, end: null, live: true }, item: it, inherited: false, start: it.decideStart });
  return out.sort((a, b) => a.start - b.start);
}
function sessionLabel(se) {
  if (se.kind === 'review') return `Review · ${G(se.rv.gate).owner}`;
  return P(se.run.program).name + (se.run.retried ? ' · retry' : '');
}
function sessionState(se) {
  if (se.kind === 'review') return se.rv.live ? 'live' : se.rv.decision === 'escalated' ? 'asking' : se.rv.decision === 'sendback' ? 'warn' : 'done';
  const r = se.run;
  if (r.cancelled) return 'cancel';
  if (r.endedAt == null) return r.ask?.qid && !r.ask.answer ? 'asking' : 'live';
  if (gateQuestionFor(se)) return 'asking';
  return r.verdict === 'passed' ? 'done' : r.verdict === 'scored' ? 'warn' : 'bad';
}
function sessionProgress(se) {
  if (se.kind === 'review') { const rv = se.rv; if (!rv.live) return 1; const it = se.item; return clamp((M.sim.now - rv.start) / Math.max(.1, it.decideAt - rv.start), 0, .97); }
  const r = se.run; if (r.endedAt != null) return r.cancelled ? (r.cancelT ?? 1) : 1;
  const it = IT(r.item); return it?.loc?.run === r.id ? it.loc.t : 0;
}
// the open person-gate question that this session's output is waiting on
function gateQuestionFor(se) {
  if (se.kind !== 'run' || se.inherited) return null;
  const it = se.item; if (it.loc?.kind !== 'gate') return null;
  const q = M.questions.find(q => q.kind === 'gate' && q.item === it.id); if (!q) return null;
  const from = WR(G(q.gate).wireId).from[0];
  if (q.reason === 'escalated') return null; // escalations sit on the reviewer's session
  const last = lastRun(it, from); return last && last.id === se.run.id ? q : null;
}
function escalationFor(se) {
  if (se.kind !== 'review' || se.rv.decision !== 'escalated') return null;
  const it = se.item; const q = M.questions.find(q => q.kind === 'gate' && q.item === it.id && q.reason === 'escalated');
  const last = it.reviews.filter(r => r.gate === se.rv.gate).slice(-1)[0];
  return q && last === se.rv ? q : null;
}

// ───────────────────────────────────────────── transcripts
// Each run gets a scripted transcript built from the hand-written content. Events carry
// `at` (0..1 of the run). A live run shows the events it has reached so far.
const spread = (n, a, b) => Array.from({ length: n }, (_, i) => n === 1 ? a : a + (b - a) * i / (n - 1));
function runEvents(run) {
  const key = [run.id, run.ask?.answer, run.endedAt != null, run.strong, IT(run.item)?.pr].join('|');
  if (run._evKey === key) return run._ev;
  const ev = buildRunEvents(run); run._ev = ev; run._evKey = key; return ev;
}
function buildRunEvents(run) {
  const it = IT(run.item); const p = P(run.program); const c = it.content || {}; const sl = sliceOf(it); const root = rootOf(it);
  const ev = []; const say = (at, text) => ev.push({ at, k: 'say', text }); const tool = (at, name, arg, out, extra = {}) => ev.push({ at, k: 'tool', name, arg, out, ...extra });
  const cmd = (at, line, out) => ev.push({ at, k: 'cmd', line, out });
  ev.push({ at: 0, k: 'sys', text: `${p.name} v${run.version}`, sub: p.runner === 'script' ? 'script runner' : `frame: programs/${p.id}.md` + (p.frame.skills.length ? ' + ' + p.frame.skills.map(s => `skills/${s}.md`).join(', ') : '') });
  if (run.retryReason) ev.push({ at: .005, k: 'note', tone: 'amber', text: `**Retry.** ${run.retryReason}. The first output and the scorer's reasons are in the frame.` });
  if (run.sentBack) ev.push({ at: .005, k: 'user', who: 'Sent back at the gate', text: run.sentBack });
  const exploreTools = (list, a, b) => spread(list.length, a, b).forEach((at, i) => tool(at, list[i][0], list[i][1], list[i][2]));

  if (p.id === 'write-spec') {
    say(.04, c.fix ? `I'll turn this defect into a fix spec. First I'll look at the code in the stack trace.` : `I'll turn ${root.id} into a spec. First I'll check how this works today.`);
    exploreTools(c.explore || [], .09, .3);
    say(.36, c.finding || '');
    if (run.ask) { ev.push({ at: run.ask.at, k: 'ask' }); if (run.ask.answer) say(run.ask.at + .03, `Going with "${run.ask.answer.replace(/\.$/, '')}". I'll write it into the spec, so nobody has to ask again.`); }
    const lines = (c.spec || '').split('\n').length;
    tool(.7, 'Write', specPath(it), `${lines} lines`, { pane: 'spec' });
    const nCrit = Object.keys(criteriaOf(it)).length;
    tool(.84, 'Bash', `metafab check ${specPath(it)}`, `goal ✓  non-goals ✓  ${nCrit} acceptance criteria  0 open questions`);
    say(.95, `The spec is in \`${specPath(it)}\`. It has ${nCrit} acceptance criteria, each one testable. Next it goes to the Product gate.`);
  } else if (p.id === 'plan-slices') {
    say(.05, 'Reading the spec, then the code each criterion touches.');
    tool(.12, 'Read', specPath(it), `${(c.spec || '').split('\n').length} lines`, { pane: 'spec' });
    const files = [...new Set((c.slices || []).flatMap(s => s.files.filter(f => f.st === 'M').map(f => f.path)))].slice(0, 3);
    spread(files.length, .2, .42).forEach((at, i) => tool(at, 'Read', files[i], `${60 + (files[i].length * 7) % 140} lines`));
    say(.5, c.plan || '');
    tool(.72, 'Write', specPath(it).replace('.md', '.plan.md'), `${(c.slices || []).length} slices`);
    say(.93, (c.slices || []).map((s, i) => `${i + 1}. **${s.title}**: ${s.scope}`).join('\n'));
  } else if (p.id === 'build-slice' && sl) {
    tool(.03, 'Bash', `git worktree add ${REPO.wt}/${sl.branch.replace('mf/', '')} -b ${sl.branch}`, `Preparing worktree (new branch '${sl.branch}')\nHEAD is now at ${REPO.head} Merge pull request #212`);
    say(.07, `Building **${sl.title}**. ${sl.scope}`);
    exploreTools(sl.explore || [], .1, .27);
    if (run.ask) { ev.push({ at: run.ask.at, k: 'ask' }); if (run.ask.answer) say(run.ask.at + .03, `OK: "${run.ask.answer}".`); }
    const strong = strongBuild(it, run); const files = sliceFiles(it, run); const tf = files.find(f => f.test); const src = files.filter(f => !f.test);
    if (strong && run.version > 1) say(.37, 'Following `skills/testing-standard.md`: one test per acceptance criterion, written first, including the error paths.');
    const fileTool = (at, f) => tool(at, f.st === 'A' ? 'Write' : 'Edit', f.path, `+${f.a} −${f.d}`, { file: f });
    if (strong && tf) { fileTool(.42, tf); spread(src.length, .5, .66).forEach((at, i) => fileTool(at, src[i])); }
    else { spread(src.length, .4, .6).forEach((at, i) => fileTool(at, src[i])); if (tf) fileTool(.66, tf); }
    const tests = testsWritten(it, run);
    if (tf) tool(.76, 'Bash', `pnpm vitest run ${tf.path}`, [` ✓ ${tf.path} (${tests.length})`, ...tests.map(t => `   ✓ ${t.n}`), '', ` Test Files  1 passed (1)`, `      Tests  ${tests.length} passed (${tests.length})`].join('\n'), { short: `${tests.length} passed` });
    tool(.84, 'Bash', 'pnpm typecheck && pnpm lint', 'tsc: 0 errors\neslint: 0 problems', { short: 'ok' });
    const add = files.reduce((s, f) => s + f.a, 0), del = files.reduce((s, f) => s + f.d, 0);
    tool(.9, 'Bash', `git commit -am "${sl.title}"`, `[${sl.branch} ${run.sha || '…'}] ${sl.title}\n ${files.length} files changed, ${add} insertions(+), ${del} deletions(-)`, { short: run.sha || 'committed' });
    say(.96, `Done. ${files.length} files, +${add} −${del}. ${tests.length} tests pass.` + (strong ? ' Each criterion has a test, including the error paths.' : ''));
  } else if (p.id === 'open-pr' && sl) {
    const n = it.pr || M.counters.pr + 1;
    cmd(.1, `git push -u origin ${sl.branch}`, `branch '${sl.branch}' set up to track 'origin/${sl.branch}'.`);
    cmd(.45, `gh pr create --title "${sl.title}" --body-file .metafab/out/pr.md`, `https://github.com/${REPO.name}/pull/${n}`);
    cmd(.8, `gh pr checks ${n} --watch`, 'lint ✓  typecheck ✓  test ✓  build ✓');
  } else if (p.id === 'merge-pr' && sl) {
    cmd(.15, `gh pr merge ${it.pr} --squash --delete-branch`, `✓ Squashed and merged pull request #${it.pr} (${sl.title}) into main`);
    cmd(.55, `git worktree remove ${REPO.wt}/${sl.branch.replace('mf/', '')}`, '');
    cmd(.85, 'gh run list --workflow deploy.yml -L 1', `in_progress  deploy · production  main  ${it.mergeSha || ''}`);
  } else if (p.id === 'log-bug' && it.defect) {
    const d = it.defect, dc = d.content || {};
    ev.push({ at: .05, k: 'event', d });
    say(.3, 'Reading the stack trace and the code at the top frame.');
    if (dc.culprit) tool(.5, 'Read', dc.culprit.split(' ')[0], '120 lines');
    say(.85, `**${dc.where || 'Production'}** fails with \`${d.title}\`. ${dc.events || 1} events from ${dc.users || 1} users. ${dc.note || ''}`);
  } else if (p.id === 'triage' && it.defect) {
    const d = it.defect; const src = IT(d.item);
    say(.08, 'Reading the bug report, then finding the change that introduced it.');
    tool(.35, 'Bash', `git log -1 --format="%h %s" ${d.sha || ''}`, `${d.sha || '9f2c1ab'} ${d.prTitle || ''}`);
    tool(.55, 'Bash', `metafab trace ${d.sha || ''}`, `${src?.id || ''} · Build slice v${d.version} · Test depth ${d.td != null ? f2(d.td) : 'n/a'}`);
    say(.85, `This is a bug, not a feature. It comes from ${d.prTitle || 'a merged PR'}, built by Build slice v${d.version}. I'm sending a Fix request to Write spec. It keeps a link back to ${it.id}.`);
  } else {
    say(.1, p.frame.instructions);
  }
  ev.push({ at: 1, k: 'output' });
  return ev.sort((a, b) => a.at - b.at);
}
function reviewEvents(se) {
  const rv = se.rv, it = se.item, g = G(rv.gate), sl = sliceOf(it); const ev = [];
  ev.push({ at: 0, k: 'sys', text: `Reviewer agent · ${g.owner} gate`, sub: 'fresh agent, no context from the builder' });
  ev.push({ at: .03, k: 'note', tone: 'violet', text: `**Question:** ${g.question}` });
  if (sl) {
    ev.push({ at: .15, k: 'tool', name: 'Read', arg: specPath(it).replace('.md', '.plan.md') + ` § ${sl.title}`, out: `criteria ${sl.criteria.join(', ')}` });
    const files = sliceFiles(it, lastRun(it, 'build-slice'));
    ev.push({ at: .35, k: 'tool', name: 'Bash', arg: `git diff main...${sl.branch} --stat`, out: files.map(f => ` ${f.path} | ${f.a + f.d} ${'+'.repeat(Math.min(f.a, 20))}${'-'.repeat(Math.min(f.d, 10))}`).join('\n'), short: `${files.length} files` });
    const n = testsWritten(it, lastRun(it, 'build-slice')).length;
    ev.push({ at: .6, k: 'tool', name: 'Bash', arg: 'pnpm vitest run', out: `Tests  ${n} passed (${n})`, short: `${n} passed` });
  }
  if (!rv.live) {
    const crit = sl ? sl.criteria.join(', ') : '';
    const text = rv.decision === 'approve' ? `**Approve.** The branch does what the slice says. Criteria ${crit} each have code and a passing test.`
      : rv.decision === 'sendback' ? `**Send back.** ${rv.note}`
      : `**I'm not sure, so I'm escalating to ${g.owner}.** ${rv.note}`;
    ev.push({ at: .95, k: 'say', text });
  }
  return ev;
}
function eventsFor(se) { return se.kind === 'review' ? reviewEvents(se) : runEvents(se.run); }
function visibleEvents(se) {
  const t = sessionProgress(se); const r = se.run;
  let ev = eventsFor(se).filter(e => e.at <= t + 1e-6);
  if (r && r.ask && r.ask.qid && !r.ask.answer) ev = ev.filter(e => e.at <= r.ask.at); // nothing after an open question
  if (r && r.extras.length) ev = [...ev, ...r.extras.map(x => ({ ...x, at: x.t, k: x.role }))].sort((a, b) => a.at - b.at);
  return ev;
}
// one line for the agents pane: what the agent is doing right now
function currentActivity(run) {
  const se = { kind: 'run', run, item: IT(run.item) };
  const ev = visibleEvents(se).filter(e => e.k === 'tool' || e.k === 'say' || e.k === 'cmd');
  const e = ev[ev.length - 1]; if (!e) return 'starting';
  if (e.k === 'tool') return `${e.name} ${e.arg.length > 34 ? '…' + e.arg.slice(-33) : e.arg}`;
  if (e.k === 'cmd') return e.line.slice(0, 36);
  return 'thinking';
}

// ───────────────────────────────────────────── chat rendering
const TOOL_ICON = { Read: '◧', Write: '✚', Edit: '✎', Grep: '⌕', Bash: '›' };
function evTime(se, e) { const r = se.run; if (r) return r.startedAt + e.at * r.dur + (r.ask?.askedAt != null && e.at > r.ask.at ? (r.ask.answeredAt ?? M.sim.now) - r.ask.askedAt : 0); const rv = se.rv; return rv.start + e.at * ((rv.end ?? M.sim.now) - rv.start); }
function who(se) {
  if (se.kind === 'review') return h('div', { class: 'msg-who' }, h('span', { class: 'hmark reviewer' }, '◇'), h('b', {}, 'Reviewer agent'), h('span', { class: 'dim' }, 'fresh context'));
  const a = AG(se.run.agent); const p = P(se.run.program);
  if (p.runner === 'script') return h('div', { class: 'msg-who' }, h('span', { class: 'hmark script' }, '$'), h('b', {}, p.name), h('span', { class: 'dim' }, 'script'));
  return h('div', { class: 'msg-who' }, harnessMark(a?.harness || 'claude'), h('b', {}, agentName(se.run.agent)), h('span', { class: 'dim' }, a?.model || ''));
}
function renderDiffFile(f, opts = {}) {
  const rows = [];
  for (const hk of f.hunks) {
    const m = hk.h.match(/-(\d+)(?:,\d+)? \+(\d+)/); let o = m ? +m[1] : 0, n = m ? +m[2] : 0;
    rows.push(h('div', { class: 'dl hunk' }, h('span', { class: 'ln' }), h('span', { class: 'ln' }), h('span', { class: 'code' }, hk.h)));
    for (const l of hk.l) {
      const t = l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'ctx';
      rows.push(h('div', { class: 'dl ' + t }, h('span', { class: 'ln' }, t === 'add' ? '' : o++), h('span', { class: 'ln' }, t === 'del' ? '' : n++), h('span', { class: 'code' }, (t === 'ctx' ? ' ' : l[0]) + l.slice(1))));
    }
  }
  return h('div', { class: 'dfile', id: opts.anchor || null },
    h('div', { class: 'dfile-h' }, h('span', { class: 'st ' + f.st }, f.st), h('span', { class: 'path' }, f.path), h('span', { class: 'sp' }), h('span', { class: 'add' }, '+' + f.a), h('span', { class: 'del' }, '−' + f.d)),
    h('div', { class: 'dfile-b' }, rows));
}
function msgEl(se, e) {
  const t = hhmm(evTime(se, e));
  switch (e.k) {
    case 'sys': return h('div', { class: 'msg sys' }, h('span', {}, e.text), h('span', { class: 'dim' }, e.sub), h('span', { class: 'sp' }), h('span', { class: 'dim' }, t));
    case 'note': return h('div', { class: 'msg note ' + (e.tone || '') }, md(e.text));
    case 'say': return h('div', { class: 'msg say' }, who(se), md(e.text), h('div', { class: 'msg-t' }, t));
    case 'user': case 'agent': return e.k === 'user'
      ? h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, e.who ? h('div', { class: 'bwho' }, e.who) : null, md(e.text)))
      : h('div', { class: 'msg say' }, who(se), md(e.text));
    case 'tool': {
      const key = se.id + ':' + e.at; const open = ui.work.openTools.has(key); const can = !!(e.file || (e.out && e.out.includes('\n')));
      return h('div', { class: 'msg tool' + (open ? ' open' : '') },
        h('button', { class: 'tool-row', onclick: () => { if (e.pane) return setTab(e.pane); if (!can) return; open ? ui.work.openTools.delete(key) : ui.work.openTools.add(key); ui.work.keys.msgs = ''; renderWork(); } },
          h('span', { class: 'tico' }, TOOL_ICON[e.name] || '•'), h('b', {}, e.name), h('span', { class: 'targ' }, e.arg), h('span', { class: 'sp' }), h('span', { class: 'tout' }, e.short || (e.out || '').split('\n')[0]), can ? icon(open ? 'down' : 'chev') : null),
        open ? (e.file ? renderDiffFile(e.file) : h('pre', { class: 'tool-out' }, e.out)) : null);
    }
    case 'cmd': return h('div', { class: 'msg cmd' }, h('div', { class: 'cl' }, h('span', { class: 'ps' }, '$'), e.line), e.out ? h('pre', {}, e.out) : null);
    case 'event': return h('div', { class: 'msg' }, sentryCard(e.d, true));
    case 'ask': return askCard(se);
    case 'output': return outputCard(se);
  }
  return null;
}
function askCard(se) {
  const r = se.run, a = r.ask; const q = M.questions.find(x => x.id === a.qid); const pending = !a.answer;
  return h('div', { class: 'msg askwrap' },
    h('div', { class: 'askcard' + (pending ? ' pending' : '') },
      h('div', { class: 'ask-k' }, h('span', { class: 'ib-dot' }), pending ? `${agentName(r.agent)} is waiting for you` : `${agentName(r.agent)} asked`, h('span', { class: 'sp' }), h('span', { class: 'dim' }, a.askedAt != null ? hhmm(a.askedAt) : '')),
      md(a.q, 'ask-q'), md(a.why, 'ask-why'),
      pending ? h('div', { class: 'ask-opts' }, a.options.map((o, i) => h('button', { class: 'btn' + (i === 0 ? ' primary' : ''), onclick: () => answerAsk(q, o) }, o)), h('span', { class: 'dim ask-or' }, 'or type an answer below')) : null),
    a.answer ? h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, h('div', { class: 'bwho' }, 'You · ' + hhmm(a.answeredAt ?? M.sim.now)), md(a.answer))) : null);
}
const scoreChip = (sc) => h('span', { class: 'chip ' + (sc.ok ? 'ok' : sc.check ? 'bad' : 'warn'), title: sc.reason }, sc.name, h('b', {}, f2(sc.value)));
function outputCard(se) {
  const r = se.run, it = se.item; const p = P(r.program);
  const out = p.outputs.find(o => o.name === r.output) || p.outputs[0];
  const pane = { spec: 'spec', slice: 'slices', branch: 'changes', pr: 'pr', merged: 'pr', report: 'event', request: 'request' }[out.type];
  const verdict = r.verdict;
  const els = [h('div', { class: 'outcard' },
    h('div', { class: 'out-h' }, h('span', { class: 'dot ' + (verdict === 'passed' ? 'green' : verdict === 'scored' ? 'amber' : 'red') }), h('b', {}, `Output · ${out.name}${out.many ? '[]' : ''}`), h('span', { class: 'dim' }, `${fmtDur(r.endedAt - r.startedAt)} · ${fmt$(r.cost)}`), h('span', { class: 'sp' }), pane && !se.inherited ? h('button', { class: 'linkbtn', onclick: () => setTab(pane) }, 'Open', icon('chev')) : null),
    r.scores?.length ? h('div', { class: 'chips' }, r.scores.map(scoreChip)) : null,
    (r.scores || []).filter(x => !x.ok).map(x => h('div', { class: 'out-why' }, h('b', {}, x.name + ': '), x.reason, x.policy === 'flag' ? h('span', { class: 'dim' }, ' · flagged, continues') : x.policy === 'retry' ? h('span', { class: 'dim' }, ' · retry') : null)))];
  // what happened at the gate after this output
  const q = gateQuestionFor(se);
  if (q) els.push(gateCard(q, se));
  else for (const x of gateDecisionsAfter(se)) els.push(h('div', { class: 'msg sys gate-line ' + x.decision }, h('span', { class: 'gbar' }), h('span', {}, x.text), h('span', { class: 'sp' }), h('span', { class: 'dim' }, hhmm(x.at))));
  return h('div', { class: 'msg' }, els);
}
function gateDecisionsAfter(se) {
  const r = se.run; if (r.endedAt == null) return [];
  const it = IT(r.item); const next = M.runs.filter(x => x.item === it.id && x.startedAt > r.endedAt).sort((a, b) => a.startedAt - b.startedAt)[0];
  return it.history.filter(x => x.kind === 'gate' && x.at >= r.endedAt - 1e-6 && (!next || x.at <= next.startedAt) && WR(G(x.gate).wireId).from[0] === r.program).map(x => {
    const g = G(x.gate); const by = x.by === 'person' ? 'you' : x.by === 'agent' ? 'reviewer agent' : x.by === 'sampled' ? 'sampling (not picked)' : x.by === 'off' ? 'gate off' : x.by || 'you';
    const verb = x.decision === 'approve' ? 'approved' : x.decision === 'edited' ? 'approved with edits' : x.decision === 'sendback' ? 'sent back' : x.decision;
    return { at: x.at, decision: x.decision, text: `${g.owner} gate · ${verb} by ${by}${x.reason && x.decision === 'sendback' ? ': ' + x.reason.replace(/^Reviewer agent: /, '') : ''}` };
  });
}
function gateCard(q, se) {
  const g = G(q.gate), it = IT(q.item); const from = P(WR(g.wireId).from[0]); const w = ui.work;
  const isSpec = from.id === 'write-spec'; const r = lastRun(it, from.id);
  let actions;
  if (w.mode === 'edit') actions = [h('div', { class: 'hint', style: 'margin:0' }, 'Edit the spec on the right. Your edits are saved as feedback: they are the best signal for calibrating this gate.'),
    h('div', { class: 'gate-btns' }, h('button', { class: 'btn primary', onclick: () => approveEdited(q) }, icon('check'), 'Approve with edits'), h('button', { class: 'btn ghost', onclick: () => { w.mode = null; w.keys = {}; renderWork(); } }, 'Cancel'))];
  else if (w.mode === 'sendback') {
    const ta = h('textarea', { class: 'edit', rows: 3, placeholder: `What should ${from.name} do differently?`, oninput: (e) => { w.sbText = e.target.value; }, onfocus: () => { ui.editing = true; }, onblur: () => { ui.editing = false; } }, w.sbText || '');
    setTimeout(() => ta.focus(), 30);
    actions = [ta, h('div', { class: 'gate-btns' }, h('button', { class: 'btn danger', onclick: () => { ui.editing = false; const why = (w.sbText || '').trim() || `Sent back by ${g.owner}`; w.mode = null; w.sbText = ''; w.pinned = false; answerQuestion(q, 'sendback', why); w.keys = {}; } }, icon('undo'), `Send back to ${from.name}`), h('button', { class: 'btn ghost', onclick: () => { ui.editing = false; w.mode = null; w.keys = {}; renderWork(); } }, 'Cancel'))];
  } else actions = [h('div', { class: 'gate-btns' },
    h('button', { class: 'btn primary', onclick: () => { w.pinned = false; answerQuestion(q, 'approve'); w.keys = {}; } }, icon('check'), 'Approve'),
    isSpec ? h('button', { class: 'btn', onclick: () => { w.mode = 'edit'; w.tab = 'spec'; w.specDraft = specTextOf(it); w.keys = {}; renderWork(); } }, icon('pencil'), 'Edit spec') : null,
    h('span', { class: 'sp' }),
    h('button', { class: 'btn danger', onclick: () => { w.mode = 'sendback'; w.keys = {}; renderWork(); } }, icon('undo'), 'Send back'))];
  return h('div', { class: 'gatecard ' + qTone(q) },
    h('div', { class: 'gate-k' }, h('span', { class: 'gbar' }), `${g.owner} gate · waiting for you`, h('span', { class: 'sp' }), h('span', { class: 'dim' }, ago(M.sim.now - q.at))),
    h('div', { class: 'gate-q' }, g.question),
    q.reason === 'held' ? h('div', { class: 'callout red' }, h('b', {}, `Held by ${it.flags.holdBy?.name} at ${f2(it.flags.holdBy?.value || 0)}. `), 'The check failed, so the item stopped here.') : null,
    h('div', { class: 'gate-ctx' }, isSpec ? ['Read the spec on the right. ', h('button', { class: 'linkbtn', onclick: () => setTab('spec') }, 'Open spec')] : ['Review the changes and the PR on the right. ', h('button', { class: 'linkbtn', onclick: () => setTab('changes') }, 'Open changes')]),
    actions);
}
function approveEdited(q) {
  const w = ui.work, it = IT(q.item), root = rootOf(it);
  const before = specTextOf(it).split('\n'), after = (w.specDraft || '').split('\n');
  const changed = after.filter(l => !before.includes(l)).length + before.filter(l => !after.includes(l)).length;
  root.specText = w.specDraft; root.specEdited = { lines: changed, at: M.sim.now };
  ui.editing = false; w.mode = null; w.pinned = false; answerQuestion(q, changed ? 'edited' : 'approve', w.specDraft); w.keys = {};
}
function escalationCard(q) {
  const g = G(q.gate), it = IT(q.item); const w = ui.work;
  const card = gateCard(q, null);
  card.querySelector('.gate-k').childNodes[1].textContent = `${g.owner} gate · the reviewer escalated to you`;
  return card;
}

// ───────────────────────────────────────────── right pane
const ranAny = (it, pid) => it.history.some(x => x.kind === 'run-end' && x.program === pid);
function buildStarted(it) { return ownRuns(it, 'build-slice').length > 0; }
function tabsFor(it) {
  if (it.form === 'report') return [['event', 'Sentry event'], ['trace', 'Trace']];
  const t = [];
  if (sliceOf(it)) {
    if (buildStarted(it)) t.push(['changes', 'Changes']);
    t.push(['pr', 'Pull request']);
    t.push(['slice', 'Slice'], ['spec', 'Spec']);
  } else {
    t.push(['request', 'Request']);
    if (ranAny(it, 'write-spec') || ownRuns(it, 'write-spec').length) t.push(['spec', 'Spec']);
    if (it.children.length) t.push(['slices', `Slices · ${it.children.length}`]);
  }
  t.push(['trace', 'Trace']);
  return t;
}
function defaultTab(it) {
  const tabs = tabsFor(it).map(x => x[0]); const q = M.questions.find(q => q.item === it.id && q.kind === 'gate');
  const want = q ? (WR(G(q.gate).wireId).from[0] === 'write-spec' ? 'spec' : 'changes')
    : it.form === 'report' ? 'event' : it.children.length ? 'slices' : sliceOf(it) ? (buildStarted(it) ? 'changes' : 'slice') : ranAny(it, 'write-spec') ? 'spec' : 'request';
  return tabs.includes(want) ? want : tabs[0];
}
function setTab(tab) { if (!ui.work) return; ui.work.tab = tab; ui.work.keys.pane = ''; ui.work.keys.tabs = ''; renderWork(); }
function locText(it) {
  const l = it.loc || {};
  if (l.kind === 'run') { const r = M.runs.find(r => r.id === l.run); return `${P(l.program).name} · ${agentName(r?.agent)}` + (r?.ask?.qid && !r.ask.answer ? ' · asking you' : ''); }
  if (l.kind === 'queue') return `Queued for ${P(l.program).name}`;
  if (l.kind === 'gate') { const g = G(l.gate); return it.decideAt ? `Reviewer agent at ${g.owner} gate` : M.questions.some(q => q.item === it.id) ? `Waiting for you at ${g.owner} gate` : `${g.owner} gate`; }
  if (l.kind === 'bin') return `In bin · ${B(l.bin).name}`;
  if (l.kind === 'wire') return `Moving to ${P(WR(l.wire).to).name}`;
  if (l.kind === 'rewind') return `Rewinding to ${P(l.program).name}`;
  if (l.kind === 'parent') return 'Split into slices';
  if (l.kind === 'done') return it.form === 'merged' ? `Merged · ${it.mergeSha || ''}` : 'Done';
  return '';
}
const paneHead = (...kids) => h('div', { class: 'pane-h' }, ...kids);
function paneRequest(it) {
  const root = rootOf(it); const c = root.content || {};
  const asks = M.runs.filter(r => r.item === root.id && r.ask?.answer);
  return [paneHead(h('b', {}, 'Request'), h('span', { class: 'dim' }, `${root.id} · ${c.from || 'form'} · ${clock(root.bornAt)}`)),
    h('div', { class: 'doc' }, h('h1', {}, c.title || root.title), md(c.text || ''),
      asks.length ? [h('h2', {}, 'Decisions'), asks.map(r => h('div', { class: 'decision' }, md(r.ask.q, 'dq'), h('div', { class: 'da' }, '→ ', h('b', {}, r.ask.answer), h('span', { class: 'dim' }, ` · you, ${hhmm(r.ask.answeredAt)}`))))] : null)];
}
function paneSpec(it) {
  const root = rootOf(it); const w = ui.work; const r = lastRun(root, 'write-spec');
  const live = !r || r.endedAt == null;
  if (live) return [paneHead(h('b', {}, specPath(it)), h('span', { class: 'dim' }, 'being written')), h('div', { class: 'empty' }, `${r ? agentName(r.agent) : 'An agent'} is writing the spec. It appears here when the run ends.`)];
  const editing = w.mode === 'edit' && it === root;
  const head = paneHead(h('b', {}, specPath(it)), h('span', { class: 'dim' }, `${agentName(r.agent)} · Write spec v${r.version} · ${hhmm(r.endedAt)}`), h('span', { class: 'sp' }),
    root.specEdited ? h('span', { class: 'tagx v' }, `edited by you · ${root.specEdited.lines} lines`) : null, editing ? h('span', { class: 'tagx esc' }, 'editing') : null);
  if (editing) return [head, h('textarea', { class: 'spec-edit', oninput: (e) => { w.specDraft = e.target.value; }, onfocus: () => { ui.editing = true; }, onblur: () => { ui.editing = false; } }, w.specDraft)];
  return [head, h('div', { class: 'doc' }, md(specTextOf(it)))];
}
function paneSlices(it) {
  return [paneHead(h('b', {}, 'Slices'), h('span', { class: 'dim' }, `planned by Plan slices · each slice is its own workspace and worktree`)),
    h('div', { class: 'slist' }, it.children.map(id => { const ch = IT(id); const sl = sliceOf(ch); const q = M.questions.some(q => q.item === id);
      return h('button', { class: 'srow', onclick: () => openWork(id) }, h('span', { class: 'dot', style: `background:${FORM_COLOR[ch.form]}` }), h('span', { class: 'sid' }, ch.id),
        h('span', { class: 'smain' }, h('b', {}, ch.title), h('span', { class: 'dim' }, sl?.scope || '')), h('span', { class: 'sloc' + (q ? ' warn' : '') }, locText(ch)), icon('chev')); }))];
}
function paneSlice(it) {
  const sl = sliceOf(it); const crit = criteriaOf(it); const parent = IT(it.parent);
  return [paneHead(h('b', {}, `Slice ${it.id.slice(-1)} of ${parent?.children.length || '?'}`), h('span', { class: 'dim' }, `from ${specPath(it).replace('.md', '.plan.md')}`)),
    h('div', { class: 'doc' }, h('h1', {}, sl.title), md(sl.scope),
      h('h2', {}, 'Acceptance criteria it covers'), h('ol', {}, sl.criteria.map(n => h('li', { value: n, html: inlineMd(crit[n] || '') }))),
      h('h2', {}, 'Branch'), h('p', {}, h('code', {}, sl.branch), ' from ', h('code', {}, `${REPO.base}@${REPO.head}`)),
      parent ? [h('h2', {}, 'Spec'), h('p', {}, h('button', { class: 'linkbtn', onclick: () => openWork(parent.id) }, `${parent.id} · ${parent.title}`, icon('chev')))] : null)];
}
function paneChanges(it) {
  const r = lastRun(it, 'build-slice') || ownRuns(it, 'build-slice').slice(-1)[0]; const sl = sliceOf(it);
  const se = { kind: 'run', run: r, item: it, id: r.id };
  const done = r.endedAt != null;
  const written = new Set(visibleEvents(se).filter(e => e.k === 'tool' && e.file).map(e => e.file.path));
  const files = sliceFiles(it, r).filter(f => done || written.has(f.path));
  const add = files.reduce((s, f) => s + f.a, 0), del = files.reduce((s, f) => s + f.d, 0);
  const dirs = {}; for (const f of files) { const i = f.path.lastIndexOf('/'); (dirs[f.path.slice(0, i)] ||= []).push(f); }
  const tree = h('div', { class: 'ftree' }, Object.entries(dirs).sort().map(([d, fs]) => [h('div', { class: 'fdir' }, d + '/'), fs.map((f, i) => h('button', { class: 'ffile', onclick: () => document.getElementById('df-' + f.path.replace(/[^a-z0-9]/gi, '_'))?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, h('span', { class: 'st ' + f.st }, f.st), h('span', { class: 'fn' }, f.path.slice(d.length + 1)), h('span', { class: 'add' }, '+' + f.a)))]));
  return [paneHead(h('b', {}, h('code', {}, sl.branch)), h('span', { class: 'dim' }, `→ ${REPO.base} · ${files.length} files · `), h('span', { class: 'add' }, '+' + add), h('span', { class: 'del' }, '−' + del), h('span', { class: 'sp' }), done ? h('span', { class: 'dim' }, `${r.sha} · ${agentName(r.agent)}`) : h('span', { class: 'tagx v' }, 'agent is writing')),
    files.length ? h('div', { class: 'changes' }, tree, h('div', { class: 'diffs' }, files.map(f => renderDiffFile(f, { anchor: 'df-' + f.path.replace(/[^a-z0-9]/gi, '_') })))) : h('div', { class: 'empty' }, 'No files changed yet.')];
}
function panePR(it) {
  const sl = sliceOf(it); const n = prNumber(it); const r = lastRun(it, 'build-slice');
  const gates = D.wires.filter(w => w.stop?.kind === 'gate' && ['build-slice', 'open-pr'].includes(w.from[0])).map(w => G(w.stop.id));
  const gateRow = (g) => {
    const last = [...it.history].reverse().find(x => x.kind === 'gate' && x.gate === g.id && !x.inherited);
    const waiting = it.loc?.kind === 'gate' && it.loc.gate === g.id;
    const st = waiting ? (it.decideAt ? ['live', 'Reviewer agent is checking'] : ['warn', 'Waiting for you']) : last ? (last.decision === 'sendback' ? ['warn', 'Sent back'] : ['ok', `Approved by ${last.by === 'person' ? 'you' : last.by === 'agent' ? 'reviewer agent' : last.by}`]) : ['none', 'Not reached'];
    return h('div', { class: 'grow-row' }, h('span', { class: 'dot ' + ({ live: 'violet', warn: 'amber', ok: 'green', none: 'grey' })[st[0]] }), h('span', { class: 'gq' }, g.question), h('span', { class: 'dim' }, `${g.owner} · ${g.autonomy}`), h('span', { class: 'sp' }), h('span', {}, st[1]));
  };
  if (!n) return [paneHead(h('b', {}, 'Pull request'), h('span', { class: 'dim' }, 'not opened yet')), h('div', { class: 'empty' }, 'Open PR runs after the branch passes the Code owner gate.'), h('div', { class: 'doc' }, h('h2', {}, 'Gates'), gates.map(gateRow))];
  const merged = it.form === 'merged'; const tests = testsWritten(it, r); const crit = criteriaOf(it); const root = rootOf(it);
  return [paneHead(h('b', {}, `#${n}`), h('span', {}, sl.title), h('span', { class: 'sp' }), h('span', { class: 'pill ' + (merged ? 'merged' : 'live') }, h('span', { class: 'dot' }), merged ? 'Merged' : 'Open')),
    h('div', { class: 'doc' },
      h('div', { class: 'pr-meta' }, h('code', {}, sl.branch), ' → ', h('code', {}, REPO.base), merged ? ` · squashed as ${it.mergeSha}` : '', ` · opened by Open PR (script)`),
      h('h2', {}, 'What'), md(sl.scope),
      h('h2', {}, 'Spec'), h('p', {}, `${root.id} · ${root.title} · `, h('code', {}, specPath(it))),
      h('ol', {}, sl.criteria.map(c => h('li', { value: c, html: inlineMd(crit[c] || '') }))),
      h('h2', {}, 'Tests'), h('ul', { class: 'checks' }, tests.map(t => h('li', {}, h('span', { class: 'ok' }, '✓ '), t.n))),
      h('h2', {}, 'Checks'), h('div', { class: 'checkrow' }, ['lint', 'typecheck', 'test', 'build'].map(c => h('span', { class: 'chip ok' }, '✓ ' + c))),
      h('h2', {}, 'Gates'), gates.map(gateRow))];
}
function sentryCard(d, compact) {
  const c = d.content || {};
  return h('div', { class: 'sentry' + (compact ? ' compact' : '') },
    h('div', { class: 'sn-h' }, h('span', { class: 'sn-logo' }, 'Sentry'), h('b', {}, d.title)),
    h('div', { class: 'sn-meta' }, h('span', {}, c.where || 'production'), h('span', {}, `${c.events || 1} events`), h('span', {}, `${c.users || 1} users`), h('span', {}, `first seen ${hhmm(d.at)}`)),
    h('pre', { class: 'sn-stack' }, (c.stack || [d.title]).join('\n')));
}
function paneEvent(it) {
  const d = it.defect; const src = d && IT(d.item);
  return [paneHead(h('b', {}, 'Sentry event'), h('span', { class: 'dim' }, `${d?.id || ''} · via the Sentry connection on Log bug`)),
    h('div', { class: 'doc' }, sentryCard(d),
      d?.content?.note ? [h('h2', {}, 'What let this through'), md(d.content.note)] : null,
      src ? [h('h2', {}, 'Traced to'), h('p', {}, h('button', { class: 'linkbtn', onclick: () => openWork(src.id) }, `${src.id} · ${src.title} · PR #${src.pr}`, icon('chev'))), h('p', { class: 'dim' }, `Built by Build slice v${d.version}. Test depth at build: ${d.td != null ? f2(d.td) : 'n/a'}.`)] : null)];
}
function paneTrace(it) { return [paneHead(h('b', {}, 'Trace'), h('span', { class: 'dim' }, 'every run, wait and decision for this item')), h('div', { class: 'doc trace' }, traceView(it))]; }
function refreshTrace() { if (ui.work) { ui.work.keys.pane = ''; renderWork(); } else renderSide(); }

// ───────────────────────────────────────────── header
function stageStrip(it) {
  const line = it.form === 'report' || (lineageUp(it)[0].form === 'report') ? ['log-bug', 'triage'] : ['write-spec', 'plan-slices', 'build-slice', 'open-pr', 'merge-pr'];
  const l = it.loc || {};
  const cur = l.kind === 'run' || l.kind === 'queue' || l.kind === 'rewind' ? l.program : (l.kind === 'gate' || l.kind === 'bin' || l.kind === 'wire') ? WR(l.wire).to : null;
  const waitGate = l.kind === 'gate' ? l.gate : null;
  const els = [];
  line.forEach((pid, i) => {
    const done = ranAny(it, pid) && pid !== cur; const now = pid === cur;
    if (i) {
      const w = D.wires.find(w => w.from[0] === line[i - 1] && w.to === pid);
      if (w?.stop?.kind === 'gate') els.push(h('span', { class: 'sg-gate' + (waitGate === w.stop.id ? ' wait' : ''), title: G(w.stop.id).question }));
      else els.push(h('span', { class: 'sg-line' }));
    }
    els.push(h('span', { class: 'sg-step' + (done ? ' done' : '') + (now ? ' now' : '') }, done && !now ? '✓ ' : '', P(pid).name));
  });
  return h('div', { class: 'stages' }, els);
}
function rewindMenu(it) {
  const progs = [...new Set(it.history.filter(x => x.kind === 'run-end' && !x.inherited).map(x => x.program))];
  const can = progs.length && it.loc && !['done', 'parent', 'rewind'].includes(it.loc.kind);
  const pop = h('div', { class: 'menu hidden' },
    h('div', { class: 'menu-h' }, 'Rewind to…'),
    progs.map(pid => h('button', { class: 'menu-i', onclick: () => { pop.classList.add('hidden'); rewindItem(it, pid, 'manual'); ui.work.keys = {}; ui.work.pinned = false; } }, h('b', {}, P(pid).name), h('span', { class: 'dim' }, P(pid).effects.length ? 'archives the branch, closes the PR' : 'the old run stays in history'))));
  const btn = h('button', { class: 'btn sm', disabled: !can, title: can ? 'Take this item back to an earlier program and run it forward again' : 'Nothing to rewind', onclick: (e) => { e.stopPropagation(); pop.classList.toggle('hidden'); } }, icon('undo'), 'Rewind');
  return h('div', { class: 'menuwrap' }, btn, pop);
}
function renderHead(it) {
  const chain = lineageUp(it); const root = chain[0]; const origin = root.origin && IT(root.origin);
  const crumbs = [];
  if (origin) crumbs.push(h('button', { class: 'wcrumb', onclick: () => openWork(origin.id) }, origin.id), h('span', { class: 'csep' }, '›'));
  chain.slice(0, -1).forEach(a => crumbs.push(h('button', { class: 'wcrumb', onclick: () => openWork(a.id) }, `${a.id} ${a.title}`), h('span', { class: 'csep' }, '›')));
  const hasWT = !!sliceOf(it) && buildStarted(it);
  $('#wk-head').replaceChildren(
    h('button', { class: 'crumb-back', onclick: closeWork, title: 'Back to the factory (Esc)' }, icon('back'), 'Factory'),
    h('div', { class: 'wk-title' },
      h('div', { class: 'wk-crumbs' }, crumbs),
      h('div', { class: 'wk-name' }, h('span', { class: 'dot', style: `background:${FORM_COLOR[it.form]}` }), h('span', { class: 'wk-id' }, it.id), h('b', {}, it.title), h('span', { class: 'wk-loc' }, locText(it)))),
    h('span', { class: 'sp' }),
    stageStrip(it),
    h('span', { class: 'sp' }),
    rewindMenu(it),
    h('button', { class: 'btn sm', disabled: !hasWT || it.form === 'merged', title: 'Open the worktree in your editor', onclick: () => toast(`Opened ${REPO.wt}/${sliceOf(it).branch.replace('mf/', '')} in Cursor`, '') }, 'Open in editor'));
}

// ───────────────────────────────────────────── chat column
function renderSessions(it, list, sel) {
  $('#wk-sessions').replaceChildren(...list.map(se => {
    const st = sessionState(se);
    return h('button', { class: 'stab' + (se.id === sel?.id ? ' on' : '') + (se.inherited ? ' inh' : ''), title: se.inherited ? `From ${se.item.id} · ${se.item.title}` : '', onclick: () => { ui.work.session = se.id; ui.work.pinned = true; ui.work.keys = {}; renderWork(); } },
      h('span', { class: 'sdot2 ' + st }), se.inherited ? h('span', { class: 'sfrom' }, se.item.id) : null, sessionLabel(se));
  }));
}
function renderMsgs(se) {
  const box = $('#wk-msgs'); const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  if (!se) { box.replaceChildren(h('div', { class: 'empty' }, 'No agent has worked on this item yet. It is queued.')); return; }
  const ev = visibleEvents(se); const live = sessionProgress(se) < 1 && !(se.run?.cancelled);
  const els = ev.map(e => msgEl(se, e)).filter(Boolean);
  const esc = escalationFor(se); if (esc) els.push(h('div', { class: 'msg' }, escalationCard(esc)));
  if (se.run?.cancelled) els.push(h('div', { class: 'msg sys' }, h('span', {}, `Run stopped · rewound${se.run.cancelWhy ? ' (' + se.run.cancelWhy + ')' : ''}. The old path stays in history.`)));
  const asking = se.run?.ask?.qid && !se.run.ask.answer;
  if (live && !asking) els.push(h('div', { class: 'msg typing' }, h('span', { class: 'tdots' }, h('i'), h('i'), h('i')), h('span', { class: 'dim' }, se.kind === 'review' ? 'reviewing' : currentActivity(se.run))));
  box.replaceChildren(...els);
  if (atBottom || ui.work.scrollBottom) { box.scrollTop = box.scrollHeight; ui.work.scrollBottom = false; }
}
function composerState(it, se) {
  const r = se?.run;
  if (r?.ask?.qid && !r.ask.answer) return { on: true, ph: `Answer ${agentName(r.agent)}…`, act: 'answer' };
  if (r && r.endedAt == null && P(r.program).runner !== 'script') return { on: true, ph: `Message ${agentName(r.agent)}. It reads this before its next step.`, act: 'steer' };
  if (M.questions.some(q => q.item === it.id && q.kind === 'gate')) return { on: false, ph: 'Decide on the gate card above.' };
  if (se?.kind === 'review' && se.rv.live) return { on: false, ph: 'The reviewer agent works alone, so its judgement stays independent.' };
  return { on: false, ph: 'This run has finished. To change its output, send it back at a gate or rewind.' };
}
function sendComposer() {
  const w = ui.work; const ta = $('#wk-input'); const text = ta.value.trim(); if (!text) return;
  const it = IT(w.id); const se = sessionsFor(it).find(x => x.id === w.curSession); const st = composerState(it, se); if (!st.on) return;
  const r = se.run;
  if (st.act === 'answer') answerAsk(M.questions.find(q => q.id === r.ask.qid), text);
  else { const t = sessionProgress(se); r.extras.push({ t, role: 'user', text }); M.feedback.push({ kind: 'steer', run: r.id, item: it.id, at: M.sim.now, text });
    setTimeout(() => { r.extras.push({ t: t + .0001, role: 'agent', text: 'Understood. I will apply that for the rest of this run.' }); touch(); }, 900); }
  ta.value = ''; w.scrollBottom = true; w.keys.msgs = ''; touch(); renderWork();
}

// ───────────────────────────────────────────── terminal
function renderTerm(it) {
  const w = ui.work; const sl = sliceOf(it); const has = sl && buildStarted(it);
  const box = $('#wk-term'); box.classList.toggle('open', !!(w.term && has));
  if (!has) { box.replaceChildren(h('div', { class: 'term-bar' }, h('span', { class: 'tico' }, '›_'), h('span', { class: 'dim' }, it.form === 'report' ? 'No worktree. This item is a bug report.' : 'No worktree yet. Build slice makes one when it starts, because it declares a Git effect.'))); return; }
  const path = `${REPO.wt}/${sl.branch.replace('mf/', '')}`; const merged = it.form === 'merged';
  const r = lastRun(it, 'build-slice'); const tests = testsWritten(it, r);
  const tabs = { dev: merged ? ['Worktree removed after merge.'] : ['$ pnpm dev', '', '  VITE v5.4.8  ready in 412 ms', '  ➜  Local:   http://localhost:5174/', '  api  listening on http://localhost:8788', '  db   using branch database invoice_service_' + sl.branch.replace(/[^a-z]/g, '_').slice(3)],
    test: r?.endedAt != null ? [`$ pnpm vitest run ${sl.test?.path || ''}`, '', ...tests.map(t => `   ✓ ${t.n}`), '', `      Tests  ${tests.length} passed (${tests.length})`] : ['$ pnpm vitest --watch', '', '  waiting for the agent to write tests…'],
    shell: [`$ git status`, `On branch ${sl.branch}`, merged ? 'Branch merged and deleted.' : 'nothing to commit, working tree clean', ...(w.shell || [])] };
  const tab = w.termTab || 'dev';
  box.replaceChildren(...[
    h('div', { class: 'term-bar', onclick: (e) => { if (e.target.closest('.ttab')) return; w.term = !w.term; w.keys.term = ''; renderWork(); } },
      h('span', { class: 'tico' }, '›_'),
      ['dev', 'test', 'shell'].map(t => h('button', { class: 'ttab' + (t === tab ? ' on' : ''), onclick: () => { w.termTab = t; w.term = true; w.keys.term = ''; renderWork(); } }, t)),
      h('span', { class: 'tstat' }, merged ? h('span', { class: 'dim' }, 'merged') : [h('span', { class: 'dot green' }), ' pnpm dev · localhost:5174']),
      h('span', { class: 'sp' }), h('span', { class: 'dim mono' }, path), icon(w.term ? 'down' : 'up')),
    w.term ? h('div', { class: 'term-body' }, h('pre', {}, tabs[tab].join('\n')),
      tab === 'shell' ? h('div', { class: 'term-in' }, h('span', { class: 'ps' }, '$'), h('input', { id: 'wk-shell', placeholder: 'run a command in this worktree', onfocus: () => { ui.editing = true; }, onblur: () => { ui.editing = false; }, onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { (w.shell ||= []).push('$ ' + e.target.value, '(prototype: commands do not run)'); w.keys.term = ''; ui.editing = false; renderWork(); setTimeout(() => $('#wk-shell')?.focus(), 0); } } })) : null) : null].filter(Boolean));
}

// ───────────────────────────────────────────── open / close / render
function openWork(id, opts = {}) {
  const it = IT(id); if (!it) return;
  if (ui.side && !ui.worldDim) closeSide();
  let session = opts.session || null;
  if (opts.question) {
    const q = M.questions.find(x => x.id === opts.question);
    if (q?.kind === 'ask') session = q.run;
    else if (q?.reason === 'escalated') session = it.reviews.filter(r => r.gate === q.gate).slice(-1)[0]?.id || null;
    else if (q) session = lastRun(it, WR(G(q.gate).wireId).from[0])?.id || null;
  }
  ui.work = { id, session, pinned: !!session, tab: null, term: false, termTab: 'dev', mode: null, openTools: new Set(), keys: {}, scrollBottom: true };
  ui.editing = false;
  $('#studio').classList.add('hidden'); $('#work').classList.remove('hidden');
  renderWork();
}
function closeWork() {
  ui.work = null; ui.editing = false;
  $('#work').classList.add('hidden'); $('#studio').classList.remove('hidden');
  ui.attnKey = ''; ui.agentsKey = ''; touch();
}
function pickSession(it, list) {
  const w = ui.work;
  if (w.pinned && list.some(s => s.id === w.session)) return list.find(s => s.id === w.session);
  const own = list.filter(s => !s.inherited);
  const need = own.find(s => ['asking'].includes(sessionState(s)));
  const live = own.find(s => sessionState(s) === 'live');
  return need || live || own[own.length - 1] || list[list.length - 1] || null;
}
function renderWork() {
  const w = ui.work; if (!w) return;
  const it = IT(w.id); if (!it) return closeWork();
  if (w.tab && !tabsFor(it).some(t => t[0] === w.tab)) w.tab = null;
  const tab = w.tab || defaultTab(it);
  const list = sessionsFor(it); const se = pickSession(it, list); w.curSession = se?.id;
  const ev = se ? visibleEvents(se) : [];
  const qk = M.questions.filter(q => q.item === it.id).map(q => q.id).join(',');
  const k = w.keys;
  // header
  const hk = [it.id, it.form, locText(it), it.pr, M.version, it.loc?.kind].join('|');
  if (k.head !== hk) { k.head = hk; renderHead(it); }
  // sessions
  const sk = list.map(s => s.id + sessionState(s)).join(',') + '|' + se?.id;
  if (k.sessions !== sk) { k.sessions = sk; renderSessions(it, list, se); }
  // messages: never rebuild under someone's cursor
  const mk = [se?.id, ev.length, sessionState(se || {}), qk, w.mode, sessionProgress(se || {}) >= 1, se && sessionProgress(se) < 1 ? currentActivity(se.run || {}) : ''].join('|');
  if (k.msgs !== mk && !(ui.editing && w.mode === 'sendback')) { k.msgs = mk; renderMsgs(se); }
  // composer
  const cs = composerState(it, se); const ta = $('#wk-input');
  if (ta.placeholder !== cs.ph) ta.placeholder = cs.ph;
  ta.disabled = !cs.on; $('#wk-send').disabled = !cs.on;
  // tabs + pane
  const tabs = tabsFor(it);
  const tk = tabs.map(t => t[0] + t[1]).join(',') + '|' + tab;
  if (k.tabs !== tk) { k.tabs = tk; $('#wk-tabs').replaceChildren(...tabs.map(([id, label]) => h('button', { class: 'ptab' + (id === tab ? ' on' : ''), onclick: () => setTab(id) }, label))); }
  const liveBuild = tab === 'changes' ? ownRuns(it, 'build-slice').slice(-1)[0] : null;
  const pk = [tab, it.form, it.pr, w.mode, rootOf(it).specEdited?.at, it.children.map(c => locText(IT(c))).join(';'), qk, locText(it),
    liveBuild && liveBuild.endedAt == null ? visibleEvents({ kind: 'run', run: liveBuild, item: it }).length : '',
    tab === 'trace' && it.loc && !['done', 'parent'].includes(it.loc.kind) ? Math.floor(M.sim.now) : '',
    tab === 'spec' ? lastRun(rootOf(it), 'write-spec')?.endedAt : ''].join('|');
  if (k.pane !== pk && !(ui.editing && w.mode === 'edit')) {
    k.pane = pk; const pane = $('#wk-pane'); const keep = k.paneTab === tab ? pane.scrollTop : 0; k.paneTab = tab;
    const body = { request: paneRequest, spec: paneSpec, slices: paneSlices, slice: paneSlice, changes: paneChanges, pr: panePR, event: paneEvent, trace: paneTrace }[tab](it);
    pane.replaceChildren(...[body].flat(Infinity).filter(Boolean)); pane.scrollTop = keep;
  }
  // terminal
  const tmk = [it.id, it.form, w.term, w.termTab, (w.shell || []).length, lastRun(it, 'build-slice')?.endedAt, buildStarted(it)].join('|');
  if (k.term !== tmk && !(ui.editing && document.activeElement?.id === 'wk-shell')) { k.term = tmk; renderTerm(it); }
}

// composer wiring (static elements in index.html)
$('#wk-send').addEventListener('click', sendComposer);
$('#wk-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComposer(); } });
$('#wk-input').addEventListener('focus', () => { ui.editing = true; });
$('#wk-input').addEventListener('blur', () => { ui.editing = false; });
document.addEventListener('click', (e) => { if (!e.target.closest('.menuwrap')) $$('.menu').forEach(m => m.classList.add('hidden')); });
