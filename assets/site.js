'use strict';
const appView = document.querySelector('#app-view');
const tabs = [...document.querySelectorAll('[data-mode]')];
let currentMode = 'system';
let currentCanvas = 'root';
let selectedNode = null;
const mark = '<svg aria-hidden="true"><use href="#metafab-mark"/></svg>';
const descriptions = {
  spec: { type: 'ARTIFACT GROUP', title: 'Product spec', description: 'The source of product intent. Specifications describe the behavior the factory is here to build.', label: 'SOURCE + FILTER', contract: 'specs/*.md' },
  plans: { type: 'ARTIFACT GROUP', title: 'Build plans', description: 'Small, actionable slices of work. Each slice carries its requirements, dependencies, and completion criteria.', label: 'SOURCE + FILTER', contract: 'slices/*.md · status = planned' },
  feedback: { type: 'ARTIFACT GROUP', title: 'Feedback', description: 'Bug reports, feature requests, and lessons from shipped work. The raw material for the next cycle.', label: 'SOURCE + FILTER', contract: 'feedback/*.md · status = open' },
  merged: { type: 'ARTIFACT GROUP', title: 'Merged work', description: 'Reviewed changes that have landed. Capture what changed and feed the lessons back into the product.', label: 'SOURCE + FILTER', contract: 'pull requests · merged = true' },
  delivery: { type: 'SUBSYSTEM', title: 'Delivery', description: 'A factory within the factory. Dispatch a slice, build and review it, then merge the result.', label: 'BOUNDARY', contract: 'Build plans → Merged work', action: true },
  branch: { type: 'ARTIFACT GROUP', title: 'Worker branch', description: 'A dedicated branch for a build slice. The agent implements and checks its change before opening a pull request.', label: 'ACCEPTS', contract: 'A buildable slice' },
  pr: { type: 'ARTIFACT GROUP', title: 'Worker PR', description: 'An implementation with passing checks and evidence of completion, ready for human review.', label: 'PRODUCES', contract: 'A tested pull request' }
};
// The fleet. Each agent sits on the program it is running; the live view reads this.
const agents = [
  { id: 'nova', name: 'Nova', hue: 205, program: 'plan', status: 'running', slice: 'AM-146', title: 'Thread summaries', head: 'Reading spec §3 · drafting two slices', log: [['read', 'specs/threads.md §3'], ['edit', 'slices/AM-146.md', '+24 −0'], ['say', 'Splitting summaries from the digest work — two slices, one contract each.']] },
  { id: 'atlas', name: 'Atlas', hue: 252, program: 'triage', status: 'running', slice: 'FB-88', title: 'Labels wrong after archive', head: 'Matched to spec §2.4 · filing as defect', log: [['read', 'feedback/FB-88.md'], ['grep', 'archive → labels', '3 hits'], ['say', 'Reproducible. Linking to the classifier slice and marking it a defect, not a request.']] },
  { id: 'quill', name: 'Quill', hue: 299, program: 'build', status: 'running', slice: 'AM-140', title: 'Search across threads', head: 'Edit search/index.ts · +38 −4', log: [['edit', 'search/index.ts', '+38 −4'], ['bash', 'npm test -- search', '14 passing'], ['say', 'Index builds per thread now. Wiring the query path, then self-review against the spec.']] },
  { id: 'ember', name: 'Ember', hue: 346, program: 'build', status: 'running', slice: 'AM-141', title: 'Recover unsent drafts', head: 'npm test · 9 passing, 1 pending', log: [['edit', 'drafts/autosave.ts', '+61 −12'], ['bash', 'npm test -- drafts', '9 passing · 1 pending'], ['say', 'Autosave works on blur. Still need the recovery banner state — checking the empty-state rule first.']] },
  { id: 'sage', name: 'Sage', hue: 33, program: 'learn', status: 'done', slice: 'AM-139', title: 'Inbox keyboard shortcuts', head: 'Captured 2 lessons → feedback', log: [['read', 'pull request #128'], ['write', 'feedback/lessons-128.md', '+18 −0'], ['say', 'Two lessons: shortcut discoverability, and a missing empty state the review caught. Filed both.']] },
  { id: 'you', name: 'You', person: true, program: 'review', status: 'waiting', slice: 'AM-139', title: 'PR #128 · Inbox keyboard shortcuts', head: 'Waiting for your review', log: [['ci', 'checks', 'all passing'], ['agent', 'self-review', 'no blockers'], ['say', 'Ready for a human decision. Approve to land on main, or send back with notes.']] }
];
const agentsOn = program => agents.filter(a => a.program === program);
const modes = {
  system: { crumb: 'The factory', context: 'Fab layout', status: 'All contracts valid', caption: 'Define the programs, connections, and human gates your agents will work through.' },
  factory: { crumb: 'The factory', context: 'Shared worker pool', status: '4 agents running · 1 needs you', caption: 'Your team contributes agents. They pick up eligible work automatically. Decisions route to the right operator.' },
  outputs: { crumb: 'Artifacts', context: 'Releases & deployments', status: '0.16.2 in production · 0.17.0 staged', caption: 'Inspect what the fab produces, from pull requests to releases. Human approval controls what ships.' }
};
function node(id, position, kind, name, filter, extra = '') {
  return `<button class="graph-node ${position} ${extra}" data-node="${id}" aria-label="Inspect ${name}"><small><span class="node-icon" aria-hidden="true">${id === 'delivery' ? '▧' : '▤'}</span>${kind}</small><strong>${name}${id === 'delivery' ? '<span aria-hidden="true">↗</span>' : ''}</strong><code>${filter}</code></button>`;
}
function rootGraph() {
  return `<div class="canvas-title"><strong>Your software factory</strong><span class="version-badge">v57</span></div>
  <div class="system-graph">
    <svg class="graph-wires" viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true"><path class="wire" d="M200 60H300 M500 60H550Q580 60 580 90V150Q580 175 600 175 M600 175H580V255Q580 280 550 280H500 M300 280H200 M100 240V100"/><path class="wire wire-muted" d="M400 100V130 M400 210V240"/></svg>
    ${node('spec', 'node-spec', 'ARTIFACT GROUP', 'Product spec', 'specs/*.md')}
    ${node('plans', 'node-plans', 'ARTIFACT GROUP', 'Build plans', 'status = planned')}
    ${node('delivery', 'node-delivery', 'SUBSYSTEM', 'Delivery', '3 programs · 2 boundaries')}
    ${node('merged', 'node-merged', 'ARTIFACT GROUP', 'Merged work', 'merged = true')}
    ${node('feedback', 'node-feedback', 'ARTIFACT GROUP', 'Feedback', 'status = open')}
    <span class="program-label label-plan"><span>✳</span>plan feature</span><span class="program-label label-triage"><span>◇</span>triage</span><span class="program-label label-learn"><span>✳</span>capture lessons</span><span class="program-label label-dispatch">dispatch ↘</span><span class="program-label label-land">↙ land</span>
    <div class="loop-center">${mark}<span><strong>Define once. Run continuously.</strong>Programs. Queues. Human gates.</span></div>
  </div><div class="canvas-legend"><span><i class="legend-square"></i>Artifact group</span><span><i class="legend-circle"></i>Program</span></div><div class="canvas-hint">Click any group to inspect ↗</div>`;
}
function deliveryGraph() {
  return `<div class="canvas-title"><button data-back aria-label="Back to factory overview">← The factory</button><strong>Delivery</strong><span class="version-badge">subsystem</span></div><div class="system-graph delivery-graph"><svg class="graph-wires" viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true"><path class="wire" d="M208 130H296 M504 130H592"/><path class="wire wire-muted" d="M696 170V220Q696 235 680 235H120Q104 235 104 220V170"/></svg>${node('branch','node-spec','ARTIFACT GROUP','Worker branch','slice = dispatched')}${node('pr','node-plans','ARTIFACT GROUP','Worker PR','checks = passing')}${node('merged','node-merged','ARTIFACT GROUP','Merged work','review = approved')}<span class="program-label label-plan"><span>✳</span>build + review</span><span class="program-label label-learn"><span>◇</span>review + merge</span><div class="loop-center">${mark}<span><strong>Agents execute. People decide.</strong>Rework feeds back into the build.</span></div><div class="delivery-note">Build plans in → dispatch → build → human review → merged work out</div></div><div class="canvas-legend"><span><i class="legend-circle"></i>Agent program</span><span><i class="legend-square"></i>Human review</span></div>`;
}
// --- Factory: the same loop, read live. Agents sit on the programs they run.
function avatar(a) {
  return a.person ? `<span class="agent-avatar person" aria-hidden="true">${a.name[0]}</span>` : `<span class="agent-avatar" style="--h:${a.hue}" aria-hidden="true"></span>`;
}
function stageAvatars(program) {
  const list = agentsOn(program);
  if (!list.length) return '';
  return `<span class="stage-avatars">${list.map(a => `<button class="stage-avatar ${a.status}" data-agent="${a.id}" aria-label="${a.name}: ${a.slice} ${a.title} — ${a.head}">${avatar(a)}<i class="st"></i></button>`).join('')}</span>`;
}
function station(id, position, name, items, extra = '') {
  const rows = items.map(([code, title, st]) => `<div><i class="dot ${st}"></i><code>${code}</code><span>${title}</span></div>`).join('');
  return `<button class="graph-node station ${position} ${extra}" data-node="${id}" aria-label="Inspect ${name}"><small><span class="node-icon" aria-hidden="true">▤</span>ARTIFACT GROUP<b>${items.length}</b></small><strong>${name}</strong><div class="node-items">${rows}</div></button>`;
}
function factoryView() {
  const running = agents.filter(a => a.status === 'running').length, waiting = agents.filter(a => a.status === 'waiting').length;
  const workers = agentsOn('build').concat(agentsOn('review'));
  return `<div class="canvas-title"><strong>Live · team agents at work</strong><span class="fleet-chip"><span><i class="dot violet"></i>${running} running</span><span><i class="dot amber"></i>${waiting} needs you</span><span><i class="dot green"></i>1 done</span></span></div>
  <div class="system-graph live-graph">
    <svg class="graph-wires" viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true"><path class="wire" d="M200 70H300 M500 70H550Q580 70 580 100V150Q580 180 600 180 M600 180H580V260Q580 290 550 290H500 M300 290H200 M100 240V120"/><path class="wire wire-flow" d="M200 70H300 M500 70H550Q580 70 580 100V150Q580 180 600 180 M600 180H580V260Q580 290 550 290H500 M300 290H200 M100 240V120"/><path class="wire wire-muted" d="M400 120V134 M400 214V240"/></svg>
    ${station('spec', 'node-spec', 'Product spec', [['§3', 'Thread summaries', 'violet'], ['§4', 'Agent runtime', 'idle']])}
    ${station('plans', 'node-plans', 'Build plans', [['AM-142', 'Keyboard navigation', 'idle'], ['AM-143', 'Attachment preview', 'idle']])}
    <div class="graph-node node-delivery live-delivery"><button class="node-hit" data-node="delivery" aria-label="Inspect Delivery"><small><span class="node-icon" aria-hidden="true">▧</span>SUBSYSTEM<b>${workers.length}</b></small><strong>Delivery<span aria-hidden="true">↗</span></strong></button><span class="node-workers">${workers.map(a => `<button class="stage-avatar ${a.status}" data-agent="${a.id}" aria-label="${a.name}: ${a.slice} ${a.title} — ${a.head}">${avatar(a)}<i class="st"></i></button>`).join('')}<code>2 building · 1 review</code></span></div>
    ${station('merged', 'node-merged', 'Merged work', [['AM-138', 'Thread view polish', 'green'], ['AM-137', 'Archive shortcuts', 'green']])}
    ${station('feedback', 'node-feedback', 'Feedback', [['FB-88', 'Labels wrong after archive', 'violet'], ['FB-87', 'Digest too long', 'idle']])}
    <span class="program-label label-plan"><span>✳</span>plan feature${stageAvatars('plan')}</span><span class="program-label label-triage"><span>◇</span>triage${stageAvatars('triage')}</span><span class="program-label label-learn"><span>✳</span>capture lessons${stageAvatars('learn')}</span><span class="program-label label-dispatch">dispatch ↘</span><span class="program-label label-land">↙ land</span>
    <div class="loop-center">${mark}<span><strong>One shared worker pool.</strong>Pick up. Execute. Repeat.</span></div>
  </div><div class="canvas-legend"><span><i class="legend-agent"></i>Agent on a program</span><span><i class="legend-person"></i>Needs a person</span></div><div class="canvas-hint">Click an agent to see its work ↗</div>`;
}
const LOG_KIND = { read: 'Read', edit: 'Edit', write: 'Write', grep: 'Grep', bash: '$', say: '✳', ci: 'CI', agent: '✳' };
function inspectAgent(id) {
  if (selectedNode === id) { closeInspector(true); return; }
  closeInspector();
  selectedNode = id;
  const a = agents.find(x => x.id === id);
  appView.querySelector('.agent-callout')?.remove();
  appView.querySelectorAll('.stage-avatar.spot').forEach(b => b.classList.remove('spot'));
  appView.querySelectorAll(`[data-agent="${id}"]`).forEach(b => b.classList.add('active'));
  const log = a.log.map(([k, arg, sub]) => `<div class="${k === 'say' ? 'say' : ''}"><b>${LOG_KIND[k] || k}</b><span>${arg}${sub ? `<i>${sub}</i>` : ''}</span></div>`).join('');
  const status = a.status === 'waiting' ? 'NEEDS YOU' : a.status.toUpperCase();
  appView.insertAdjacentHTML('beforeend', `<aside class="node-inspector agent-inspector" aria-label="${a.name} details"><div class="inspector-head"><span>${a.person ? 'HUMAN' : 'AGENT'} · <em class="${a.status}">${status}</em></span><button data-close aria-label="Close details">×</button></div><div class="agent-id">${avatar(a)}<div><h3>${a.name}</h3><small>${programName(a.program)} · <code>${a.slice}</code></small></div></div><p>${a.title}</p><div class="agent-log">${log}</div>${a.person ? '<button class="inspector-button">Review PR #128 →</button>' : '<button class="inspector-button">Open worker →</button>'}</aside>`);
  appView.querySelector('[data-close]').focus({ preventScroll: true });
}
const programName = p => ({ plan: 'plan feature', triage: 'triage', build: 'build + self-review', learn: 'capture lessons', review: 'review + merge' })[p];
// Spotlight: every few seconds, point at a different agent and say what it's doing.
let spotTimer = 0, spotIndex = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function stopSpotlight() { clearInterval(spotTimer); spotTimer = 0; appView.querySelector('.agent-callout')?.remove(); appView.querySelectorAll('.stage-avatar.spot').forEach(b => b.classList.remove('spot')); }
function spotlight() {
  const graph = appView.querySelector('.live-graph');
  if (!graph) return;
  appView.querySelectorAll('.stage-avatar.spot').forEach(b => b.classList.remove('spot'));
  appView.querySelector('.agent-callout')?.remove();
  const a = agents[spotIndex % agents.length]; spotIndex++;
  const btn = graph.querySelector(`[data-agent="${a.id}"]`);
  if (!btn) return;
  btn.classList.add('spot');
  const callout = document.createElement('div');
  callout.className = `agent-callout ${a.status}`;
  callout.innerHTML = `<b>${a.name}</b><span>${a.head}</span><small>${a.slice}</small>`;
  graph.appendChild(callout);
  const g = graph.getBoundingClientRect(), r = btn.getBoundingClientRect();
  const w = callout.offsetWidth, cx = r.left + r.width / 2 - g.left;
  callout.style.left = `${Math.max(0, Math.min(cx - w / 2, g.width - w))}px`;
  callout.style.top = `${r.bottom - g.top + 8}px`;
}
function startSpotlight() {
  stopSpotlight();
  if (!appView.querySelector('.live-graph')) return;
  spotIndex = 0;
  spotlight();
  if (!reducedMotion.matches) spotTimer = setInterval(() => { if (!document.hidden && !selectedNode) spotlight(); }, 3400);
}
// --- Outputs: finished work, grouped by where it is deployed. Promote moves a release up the chain.
const releases = {
  dev: { version: '0.18.0-pr128', age: 'now', title: 'Inbox keyboard shortcuts', src: 'PR #128 · build/AM-139', note: 'Preview build for the pull request waiting on your review in the factory.', slices: ['AM-139'] },
  staging: { version: '0.17.0', age: '18m ago', title: 'Thread view polish', src: '#126 · 7d20e18 · 27 Aug', note: 'Long threads stay anchored while messages collapse, with quieter dividers and a persistent summary.', slices: ['AM-138', 'AM-135'] },
  prod: { version: '0.16.2', age: '2d ago', title: 'Archive shortcuts', src: '#121 · c1b7f56 · 25 Aug', note: 'Archive, label, and undo actions now show their scope before changing a whole selection.', slices: ['AM-137', 'AM-134'] }
};
const history = {
  dev: [['0.18.0-pr127', 'Attachment preview', 'merged'], ['0.18.0-pr125', 'Digest length rail', 'closed']],
  staging: [['0.16.2', 'Archive shortcuts', '2d ago'], ['0.16.1', 'Draft autosave', '5d ago']],
  prod: [['0.16.1', 'Draft autosave', '5d ago'], ['0.16.0', 'Label tree', '9d ago']]
};
const historyList = rows => `<div class="release-history">${rows.map(([v, t, a]) => `<div><code>${v}</code><span>${t}</span><small>${a}</small></div>`).join('')}</div>`;
let promoted = false, promoting = false;
function releaseCard(r, env, extra = '') {
  return `<div class="release-card ${extra}"><div class="release-top"><b>${r.version}</b><span>${r.age}</span></div><h4>${r.title}</h4><div class="release-src">${r.src}</div><p>${r.note}</p><div class="release-slices">${r.slices.map(s => `<span>${s}</span>`).join('')}</div><div class="release-foot"><span class="env-tag">${env}</span>${env === 'staging' ? `<button class="promote" data-promote ${promoting ? 'disabled' : ''}>${promoting ? 'Promoting…' : '↑ Promote'}</button>` : env === 'development' ? '<span class="env-tag">Preview ↗</span>' : '<span class="env-tag ok"><i class="dot green"></i>Live</span>'}</div></div>`;
}
function envColumn(name, sub, pill, body, note) {
  return `<div class="env-column"><div class="env-head"><span class="env-icon">◎</span><div><strong>${name}</strong><small>${sub}</small></div><span class="env-pill ${pill.kind}"><i class="dot"></i>${pill.text}</span></div>${body}<div class="env-note">${note}</div></div>`;
}
function outputsView() {
  const prodRelease = promoted ? { ...releases.staging, age: 'just now' } : releases.prod;
  return `<div class="canvas-title"><strong>Releases</strong><span class="fleet-chip"><span><i class="dot green"></i>${promoted ? '3' : '2'}/3 healthy</span><span><i class="dot violet"></i>1 preview</span></span></div>
  <div class="env-board">
    ${envColumn('Development', 'preview.agent-mail.dev · build/*', { kind: 'active', text: 'active' }, releaseCard(releases.dev, 'development') + historyList(history.dev), 'One isolated deployment per open PR.')}
    ${envColumn('Staging', 'staging.agent-mail.dev · main', promoted ? { kind: 'healthy', text: 'in sync' } : { kind: 'staged', text: 'ready' }, (promoted ? `<div class="env-empty"><i class="dot green"></i><span>Nothing waiting. Staging matches production at <b>0.17.0</b>.</span></div>` : releaseCard(releases.staging, 'staging', 'staged')) + historyList(promoted ? [['0.17.0', 'Thread view polish', 'promoted'], ...history.staging.slice(0, 1)] : history.staging), promoted ? 'Next merge from main lands here first.' : 'Reviewed by a person. Promote when you’re happy.')}
    ${envColumn('Production', 'agent-mail.dev · signed + notarised', { kind: 'healthy', text: 'healthy' }, releaseCard(prodRelease, 'production', promoted ? 'landed' : '') + historyList(promoted ? [['0.16.2', 'Archive shortcuts', '2d ago'], ...history.prod.slice(0, 1)] : history.prod), promoted ? '0.17.0 rolling out to all users.' : 'What people are using right now.')}
  </div><div class="canvas-legend"><span>development → staging → production</span></div>${promoted ? '' : '<div class="canvas-hint">Try promoting staging ↑</div>'}`;
}
function closeInspector(restoreFocus = false) {
  appView.querySelector('.node-inspector')?.remove();
  const selected = appView.querySelector('.graph-node.active, .stage-avatar.active');
  appView.querySelectorAll('.graph-node.active, .stage-avatar.active').forEach(n => n.classList.remove('active'));
  if (restoreFocus) selected?.focus();
  selectedNode = null;
}
function inspectNode(id) {
  if(selectedNode === id) { closeInspector(true); return; }
  closeInspector();
  appView.querySelector('.agent-callout')?.remove();
  appView.querySelectorAll('.stage-avatar.spot').forEach(b => b.classList.remove('spot'));
  selectedNode = id;
  const entry = descriptions[id];
  appView.querySelector(`[data-node="${id}"]`)?.closest('.graph-node')?.classList.add('active');
  appView.insertAdjacentHTML('beforeend', `<aside class="node-inspector" aria-label="${entry.title} details"><div class="inspector-head"><span>${entry.type}</span><button data-close aria-label="Close details">×</button></div><h3>${entry.title}</h3><p>${entry.description}</p><div class="inspector-contract"><span>${entry.label}</span><code>${entry.contract}</code></div>${entry.action ? '<button class="inspector-button" data-open-delivery>Open subsystem →</button>' : ''}</aside>`);
  appView.querySelector('[data-close]').focus({preventScroll:true});
}
function renderView() {
  selectedNode = null;
  stopSpotlight();
  appView.innerHTML = currentMode === 'system' ? (currentCanvas === 'delivery' ? deliveryGraph() : rootGraph()) : currentMode === 'factory' ? factoryView() : outputsView();
  if (currentMode === 'factory') requestAnimationFrame(startSpotlight);
  const mode = modes[currentMode];
  document.querySelector('#app-crumb').textContent = mode.crumb;
  document.querySelector('#app-context').textContent = currentCanvas === 'delivery' && currentMode === 'system' ? 'Delivery subsystem' : mode.context;
  document.querySelector('#app-status-text').textContent = currentMode === 'outputs' && promoted ? '0.17.0 in production · staging in sync' : mode.status;
  document.querySelector('#preview-caption').textContent = mode.caption;
  document.querySelector('#sidebar-current').textContent = currentMode === 'outputs' ? 'Releases' : 'The factory';
}
function showView(mode, focus = false) {
  currentMode = mode;
  currentCanvas = 'root';
  promoted = false; promoting = false;
  tabs.forEach(tab => {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  document.querySelectorAll('[data-preview]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.preview === mode));
  });
  appView.setAttribute('aria-labelledby', `tab-${mode}`);
  renderView();
}
tabs.forEach((tab,index) => {
  tab.addEventListener('click', () => showView(tab.dataset.mode));
  tab.addEventListener('keydown', event => {
    let next;
    if(event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if(event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if(event.key === 'Home') next = 0;
    if(event.key === 'End') next = tabs.length - 1;
    if(next !== undefined) {event.preventDefault();showView(tabs[next].dataset.mode,true);}
  });
});
appView.addEventListener('click', event => {
  const agentButton = event.target.closest('[data-agent]');
  if(agentButton) { event.stopPropagation(); inspectAgent(agentButton.dataset.agent); return; }
  if(event.target.closest('[data-promote]') && !promoting) {
    promoting = true; renderView();
    setTimeout(() => { if (currentMode !== 'outputs') return; promoting = false; promoted = true; renderView(); }, reducedMotion.matches ? 0 : 900);
    return;
  }
  const nodeButton = event.target.closest('[data-node]');
  if(nodeButton) inspectNode(nodeButton.dataset.node);
  if(event.target.closest('[data-close]')) closeInspector(true);
  if(event.target.closest('[data-open-delivery]')) {
    currentCanvas = 'delivery';renderView();appView.querySelector('[data-back]').focus({preventScroll:true});
  }
  if(event.target.closest('[data-back]')) {
    currentCanvas = 'root';renderView();appView.querySelector('[data-node="delivery"]').focus({preventScroll:true});
  }
});
appView.addEventListener('keydown', event => {
  if(event.key === 'Escape') {
    if(selectedNode) closeInspector(true);
    else if(currentCanvas === 'delivery') {currentCanvas='root';renderView();appView.querySelector('[data-node="delivery"]').focus({preventScroll:true});}
  }
});
document.querySelector('#show-layout').addEventListener('click', () => showView('system'));
document.querySelector('#show-factory').addEventListener('click', () => showView('factory'));
showView('system');

// The prominent perspective controls mirror the keyboard-accessible demo tabs.
const previewButtons = [...document.querySelectorAll('[data-preview]')];
previewButtons.forEach(button => button.addEventListener('click', () => showView(button.dataset.preview)));

// Illustrative worker allocation: capacity stays local to this product tour.
const capacitySelect = document.querySelector('#your-capacity');
const capacityCard = document.querySelector('.capacity-card');
const runFab = document.querySelector('#run-fab');
const dispatchLog = document.querySelector('#dispatch-log');
let fabRunning = false;
function renderPips(row, count) {
  row.querySelector('.agent-pips').innerHTML = Array.from({ length: count }, (_, i) => `<i style="--i:${i}"></i>`).join('');
}
function updateCapacity() {
  const runners = [...document.querySelectorAll('[data-agent-capacity]')];
  runners.forEach(runner => renderPips(runner, Number(runner.dataset.agentCapacity)));
  renderPips(document.querySelector('#your-runner'), Number(capacitySelect.value));
  const total = Number(capacitySelect.value) + runners.reduce((sum, runner) => sum + Number(runner.dataset.agentCapacity), 0);
  document.querySelector('#capacity-total').textContent = `${total} agents`;
  if (fabRunning) {
    dispatchLog.classList.add('is-running');
    dispatchLog.textContent = `${total} agents assigned · picking up eligible work. Planning, build, test, and triage programs are active. Reviews route to code owners.`;
  }
}
capacitySelect.addEventListener('change', updateCapacity);
updateCapacity();
runFab.addEventListener('click', () => {
  fabRunning = !fabRunning;
  capacityCard.classList.toggle('is-running', fabRunning);
  runFab.innerHTML = fabRunning ? 'Pause the fab <span>Ⅱ</span>' : 'Run the fab <span>→</span>';
  if (fabRunning) {
    updateCapacity();
    showView('factory');
  } else {
    dispatchLog.classList.remove('is-running');
    dispatchLog.textContent = 'Dispatch paused · agents finish their current tasks. Run again to resume picking up work.';
  }
});
