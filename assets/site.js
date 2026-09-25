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
const modes = {
  system: { crumb: 'The factory', context: 'System overview', status: 'All contracts valid', caption: 'Design the system. Every step has a purpose. Every handoff has a contract.' },
  factory: { crumb: 'The factory', context: 'Work in motion', status: '1 agent working · 1 human review', caption: 'Follow the work. See what’s ready, what’s running, and what needs your judgment.' },
  outputs: { crumb: 'Outputs', context: 'Shipped work', status: 'Example release · v0.3.2', caption: 'See the outcome. Trace what shipped back to the work and decisions behind it.' }
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
    <div class="loop-center">${mark}<span><strong>A continuous loop.</strong>Intent. Execution. Improvement.</span></div>
  </div><div class="canvas-legend"><span><i class="legend-square"></i>Artifact group</span><span><i class="legend-circle"></i>Program</span></div><div class="canvas-hint">Click any group to inspect ↗</div>`;
}
function deliveryGraph() {
  return `<div class="canvas-title"><button data-back aria-label="Back to factory overview">← The factory</button><strong>Delivery</strong><span class="version-badge">subsystem</span></div><div class="system-graph delivery-graph"><svg class="graph-wires" viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true"><path class="wire" d="M208 130H296 M504 130H592"/><path class="wire wire-muted" d="M696 170V220Q696 235 680 235H120Q104 235 104 220V170"/></svg>${node('branch','node-spec','ARTIFACT GROUP','Worker branch','slice = dispatched')}${node('pr','node-plans','ARTIFACT GROUP','Worker PR','checks = passing')}${node('merged','node-merged','ARTIFACT GROUP','Merged work','review = approved')}<span class="program-label label-plan"><span>✳</span>build + review</span><span class="program-label label-learn"><span>◇</span>review + merge</span><div class="loop-center">${mark}<span><strong>Agents execute. People decide.</strong>Rework feeds back into the build.</span></div><div class="delivery-note">Build plans in → dispatch → build → human review → merged work out</div></div><div class="canvas-legend"><span><i class="legend-circle"></i>Agent program</span><span><i class="legend-square"></i>Human review</span></div>`;
}
function queueCard(id,title,tag,avatar,running = false) {
  return `<div class="queue-card ${running ? 'running' : ''}"><span class="queue-id">${id}</span><h4>${title}</h4><div class="queue-meta"><span class="queue-tag">${tag}</span><span class="queue-avatar">${avatar}</span></div>${running ? '<div class="running-line"><i class="dot violet"></i>Building + self-review</div>' : ''}</div>`;
}
function factoryView() {
  return `<div class="canvas-title"><strong>Work in motion</strong><span class="version-badge">4 slices</span></div><div class="queue-board"><div class="queue-column"><h3><i class="dot" style="background:#7c8293"></i>Ready to build <b>2</b></h3>${queueCard('AM–142','Keyboard navigation','Ready','✳')}${queueCard('AM–143','Recover unsent drafts','Ready','✳')}<div class="board-bottom">Dependencies resolved</div></div><div class="queue-column"><h3><i class="dot violet"></i>In progress <b>1</b></h3>${queueCard('AM–140','Search across threads','Agent working','✳',true)}<div class="board-bottom">Isolated worker branch</div></div><div class="queue-column"><h3><i class="dot" style="background:#c8ad74"></i>In review <b>1</b></h3>${queueCard('AM–139','Inbox keyboard shortcuts','PR #128','S')}<div class="board-bottom">Waiting for human review</div></div></div>`;
}
function outputsView() {
  return `<div class="canvas-title"><strong>Product releases</strong><span class="version-badge">agent-mail</span></div><div class="release-view"><div class="release-preview"><div class="mail-toolbar">Inbox <span>3 unread</span></div><div class="mail-item"><span class="mail-avatar">M</span><div><strong>Morgan Lee</strong><p>The new inbox feels great.<br>Those shortcuts make a difference.</p></div></div><div class="mail-item"><span class="mail-avatar">A</span><div><strong>Alex Chen</strong><p>Re: next week’s plans<br>Here’s what I had in mind…</p></div></div><div class="mail-item"><span class="mail-avatar">J</span><div><strong>Jamie Park</strong><p>A few ideas for the next release</p></div></div></div><div class="release-copy"><small>● SHIPPED · EXAMPLE RELEASE</small><h3>A faster way<br>through your inbox.</h3><p>Keyboard shortcuts, a cleaner thread view, and the details that make a product feel right.</p><div class="release-meta">v0.3.2 &nbsp;·&nbsp; 3 merged slices<br><br>Reviewed and approved by a person</div><a href="mark-two/prototype/">Explore the full prototype ↗</a></div></div>`;
}
function closeInspector(restoreFocus = false) {
  appView.querySelector('.node-inspector')?.remove();
  const selected = appView.querySelector('.graph-node.active');
  selected?.classList.remove('active');
  if (restoreFocus) selected?.focus();
  selectedNode = null;
}
function inspectNode(id) {
  if(selectedNode === id) { closeInspector(true); return; }
  closeInspector();
  selectedNode = id;
  const entry = descriptions[id];
  appView.querySelector(`[data-node="${id}"]`)?.classList.add('active');
  appView.insertAdjacentHTML('beforeend', `<aside class="node-inspector" aria-label="${entry.title} details"><div class="inspector-head"><span>${entry.type}</span><button data-close aria-label="Close details">×</button></div><h3>${entry.title}</h3><p>${entry.description}</p><div class="inspector-contract"><span>${entry.label}</span><code>${entry.contract}</code></div>${entry.action ? '<button class="inspector-button" data-open-delivery>Open subsystem →</button>' : ''}</aside>`);
  appView.querySelector('[data-close]').focus({preventScroll:true});
}
function renderView() {
  selectedNode = null;
  appView.innerHTML = currentMode === 'system' ? (currentCanvas === 'delivery' ? deliveryGraph() : rootGraph()) : currentMode === 'factory' ? factoryView() : outputsView();
  const mode = modes[currentMode];
  document.querySelector('#app-crumb').textContent = mode.crumb;
  document.querySelector('#app-context').textContent = currentCanvas === 'delivery' && currentMode === 'system' ? 'Delivery subsystem' : mode.context;
  document.querySelector('#app-status-text').textContent = mode.status;
  document.querySelector('#preview-caption').textContent = mode.caption;
  document.querySelector('#sidebar-current').textContent = currentMode === 'outputs' ? 'Releases' : 'The factory';
}
function showView(mode, focus = false) {
  currentMode = mode;
  currentCanvas = 'root';
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
document.querySelector('#show-factory').addEventListener('click', () => showView('factory'));
showView('system');

// The prominent perspective controls mirror the keyboard-accessible demo tabs.
const previewButtons = [...document.querySelectorAll('[data-preview]')];
previewButtons.forEach(button => button.addEventListener('click', () => showView(button.dataset.preview)));
// A dependency-free light field. CSS supplies the static fallback, and motion
// pauses offscreen, in background tabs, and when reduced motion is requested.
(() => {
  const canvas = document.querySelector('#hero-field');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return;
  const vertexSource = 'attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }';
  const fragmentSource = `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      vec2 p = (uv - vec2(.83,.67)) * vec2(resolution.x / resolution.y, 1.0);
      float glow = 0.0;
      float fine = 0.0;
      for(int i=0;i<18;i++) {
        float f = float(i) / 17.0;
        float bend = .19 * sin(p.x * 2.5 + time * .1 + f * .65);
        float curve = p.y + p.x * .64 + bend - .03;
        float d = abs(curve - f * .105);
        float taper = exp(-abs(p.x - .10) * 2.5);
        glow += .0006 / (d + .018) * taper;
        fine += .00022 / (d + .0015) * taper;
      }
      float halo = exp(-length(p * vec2(1.1,1.6)) * 4.5);
      vec3 color = vec3(.43,.62,.54) * glow + vec3(.65,.76,.66) * fine * .38;
      color += vec3(.13,.23,.21) * halo;
      float fade = smoothstep(.20,.8,uv.x) * smoothstep(.02,.3,uv.y);
      gl_FragColor = vec4(color * fade, 1.0);
    }
  `;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  }
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) { gl.deleteShader(vertex || fragment); return; }
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true;
  let lost = false;
  let frame = 0;
  let lastDraw = 0;
  let elapsed = 0;
  function draw() {
    gl.uniform1f(time, elapsed / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function resize() {
    if (lost) return;
    // Bound the pixel budget on high-density and ultrawide displays.
    const scale = Math.min(1, 1440 / canvas.clientWidth);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    draw();
  }
  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (now - lastDraw < 50) return;
    elapsed += Math.min(now - lastDraw, 100);
    lastDraw = now;
    draw();
  }
  function update() {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden || lost) return;
    draw();
    if (!reducedMotion.matches) { lastDraw = performance.now(); frame = requestAnimationFrame(tick); }
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  reducedMotion.addEventListener('change', update);
  canvas.addEventListener('webglcontextlost', () => { lost = true; cancelAnimationFrame(frame); canvas.style.opacity = '0'; });
  resize();
  update();
})();
