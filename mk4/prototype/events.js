/* events.js: panel placement, clicks and keys, focus and notifications. */

function place() {
  const panel = $("#panel");
  panel.classList.toggle("closed", !state.open);
  panel.classList.toggle("pinned", state.pinned);
  if (state.pinned && state.pos) {
    panel.style.left = state.pos.x + "px";
    panel.style.top = state.pos.y + "px";
  } else {
    const r = $("#fabIcon").getBoundingClientRect();
    const w = panel.offsetWidth || 380;
    panel.style.left = Math.max(8, Math.round(r.left + r.width / 2 - (w - 32))) + "px";
    panel.style.top = "34px";
  }
}

function setTheme() {
  const t = state.settings.theme;
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", setTheme);

/* drag the pinned panel by its head */
(function drag() {
  let d = null;
  document.addEventListener("mousedown", (ev) => {
    if (!state.pinned) return;
    const h = ev.target.closest(".pn-h, .sh-h");
    if (!h || ev.target.closest("button, input, select")) return;
    const p = $("#panel").getBoundingClientRect();
    d = { dx: ev.clientX - p.left, dy: ev.clientY - p.top };
    $("#panel").classList.add("dragging");
    ev.preventDefault();
  });
  document.addEventListener("mousemove", (ev) => {
    if (!d) return;
    state.pos = {
      x: Math.min(innerWidth - 120, Math.max(-200, ev.clientX - d.dx)),
      y: Math.min(innerHeight - 60, Math.max(28, ev.clientY - d.dy)),
    };
    place();
  });
  document.addEventListener("mouseup", () => { if (d) { d = null; $("#panel").classList.remove("dragging"); } });
})();

/* start a job: no questions and no artifact to pick starts at once in the
   default harness; anything else opens the sheet. ⌥ always opens it. */
function startJob(fabId, name, entry, artId, alt) {
  const fab = fabById(fabId);
  const j = jobOf(fab, name);
  const sh = { kind: "start", fab: fabId, job: name, entry, art: artId || null,
    backLabel: state.sheet ? "Back" : state.tab === "jobs" ? "Jobs" : "Pipeline" };
  if (!(j.inputs || []).length && !j.takes && !alt && hzById(state.settings.harness)?.ok) {
    sh.values = {}; sh.harness = state.settings.harness; sh.run = newRunId();
    state.sheet = sh; doStart(sh);
  } else {
    openSheet(sh);
  }
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act]");
  const inPanel = ev.target.closest("#panel");
  const onIcon = ev.target.closest("#fabIcon");

  if (onIcon) { state.open = !state.open; state.picker = false; render(); return; }
  if (!inPanel && !ev.target.closest(".note, .toast, .focusfx")) {
    if (state.open && !state.pinned) { state.open = false; state.picker = false; render(); }
    return;
  }
  if (state.picker && !ev.target.closest(".pop, .fab-pick")) { state.picker = false; renderHead(); }
  if (!t) return;
  /* closest() finds the innermost action, so a button in a row wins */
  const d = t.dataset;

  switch (d.act) {
    case "picker": state.picker = !state.picker; renderHead(); break;
    case "fab":
      state.fab = d.id; state.picker = false;
      if (d.then) state.tab = d.then;
      if (state.sheet && state.sheet.kind !== "settings") closeSheet();
      render(); break;
    case "addfab": state.picker = false; renderHead(); toast(`Opens a folder picker`); break;
    case "pin":
      if (!state.pinned) {
        const r = $("#panel").getBoundingClientRect();
        state.pos = state.pos || { x: r.left, y: r.top + 8 };
      }
      state.pinned = !state.pinned;
      render(); if (state.sheet) renderSheet(); break;
    case "settings": openSheet({ kind: "settings" }); break;
    case "tab": state.tab = d.id; closeSheet(); renderTabs(); renderBody(); break;

    case "sttoggle": {
      const k = `${d.fab}:${d.s}`;
      state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k);
      renderBody(); break;
    }
    case "hidtoggle": {
      const k = `${d.fab}:${d.s}`;
      state.hidOpen.has(k) ? state.hidOpen.delete(k) : state.hidOpen.add(k);
      renderBody(); break;
    }
    case "gostage":
      closeSheet(); state.tab = "work"; state.fab = d.fab; state.expanded.add(`${d.fab}:${d.s}`); render(); break;
    case "stgo": {
      const fab = fabById(d.fab);
      startJob(d.fab, stageOf(fab, d.s).next, null, null, ev.altKey); break;
    }
    case "art": openSheet({ kind: "art", fab: d.fab, a: d.a, backLabel: state.sheet ? "Back" : "Pipeline" }); break;
    case "job": openSheet({ kind: "job", fab: d.fab, job: d.j, backLabel: state.sheet ? "Back" : state.tab === "jobs" ? "Jobs" : "Pipeline" }); break;
    case "focus": { const s = SESSIONS.find((x) => x.id === d.sid); if (s) focusSession(s); break; }
    case "session": openSheet({ kind: "session", sid: d.sid, snapshot: SESSIONS.find((x) => x.id === d.sid), backLabel: state.sheet ? "Back" : "Pipeline" }); break;
    case "start": startJob(d.fab, d.j, d.e === "" || d.e == null ? null : Number(d.e), d.a, ev.altKey); break;
    case "harness": state.sheet.harness = d.id; renderSheet(); break;
    case "showcmd": state.sheet.showCmd = !state.sheet.showCmd; t.closest(".disc").classList.toggle("open"); break;
    case "go": if (!t.disabled) doStart(state.sheet); break;
    case "mdmore": state.sheet.mdOpen = !state.sheet.mdOpen; renderSheet(); break;
    case "back": closeSheet(); renderBody(); break;
    case "openref": {
      const a = artOf(fabById(d.fab), d.a);
      toast(`Opened <span class="mono">${esc(a.ref)}</span>`); break;
    }
    case "release": {
      /* closes the draft PR; the slice waits in its stage again */
      const a = artOf(fabById(d.fab), d.a);
      if (!a?.claim) break;
      const pr = prNum(a.claim.ref);
      delete a.claim;
      closeSheet(); render();
      toast(`Closed draft ${esc(pr)} · ${esc(a.title)} waits in ${esc(stageOf(fabById(d.fab), a.stage).title)}`);
      break;
    }
    case "openfile": toast(`Opened <span class="mono">${esc(d.path)}</span> in your editor`); break;
    case "check": {
      const bad = visibleFabs().filter((f) => !f.check.ok);
      toast(bad.length ? `${esc(bad[0].name)}: ${esc(bad[0].check.problem)}` : `Up to date`, bad.length ? 4200 : 2600);
      break;
    }
    case "toggle":
      state.settings[d.k] = !state.settings[d.k]; t.classList.toggle("on");
      if (d.k === "team") render();
      break;
    case "theme": state.settings.theme = d.id; setTheme(); renderSheet(); break;
  }
});

document.addEventListener("input", (ev) => {
  const sh = state.sheet;
  if (sh?.kind !== "start") return;
  if (ev.target.dataset.in) { sh.values[ev.target.dataset.in] = ev.target.value; syncStart(); }
  if (ev.target.hasAttribute("data-branch")) { sh.branch = ev.target.value || null; syncStart(); }
});
document.addEventListener("change", (ev) => {
  const sh = state.sheet;
  if (sh?.kind === "start" && ev.target.hasAttribute("data-artsel")) { sh.art = ev.target.value; sh.branch = null; syncStart(); }
  if (ev.target.dataset.set === "harness") state.settings.harness = ev.target.value;
  if (ev.target.dataset.set === "terminal") state.settings.terminal = ev.target.value;
});

document.addEventListener("keydown", (ev) => {
  const typing = ev.target.closest("input, textarea, select");
  if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && state.sheet?.kind === "start") {
    const go = $("#goBtn"); if (go && !go.disabled) doStart(state.sheet); ev.preventDefault(); return;
  }
  if (ev.key === "Escape") {
    if (state.picker) { state.picker = false; renderHead(); }
    else if (state.sheet) { closeSheet(); renderBody(); }
    else if (state.open && !state.pinned) { state.open = false; render(); }
    return;
  }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tabs = { 1: "work", 2: "jobs" };
  if (tabs[ev.key] && state.open) { state.tab = tabs[ev.key]; closeSheet(); renderTabs(); renderBody(); }
});

window.addEventListener("resize", place);

/* ═══════════════════════════════════════════════ focus, notify, toasts ══ */

function focusSession(s) {
  const hz = hzById(s.harness);
  if (s.who !== ME) { toast(`This agent runs on ${esc(PEOPLE[s.who].name)}'s Mac`); return; }
  if (!hz.can.focus) { toast(`Can't open this ${esc(hz.label)} session`); return; }
  const where = s.harness === "orca" ? `Orca · ${s.branch}` : s.harness === "cursor" ? "Cursor · agent" : `${state.settings.terminal} · ${hz.short}`;
  const fab = fabById(s.fab);
  const j = s.job ? jobOf(fab, s.job) : null;
  const a = s.art ? artOf(fab, s.art) : null;
  document.querySelectorAll(".focusfx").forEach((x) => x.remove());
  const fx = document.createElement("div");
  fx.className = "focusfx";
  const tail = s.state === "waits"
    ? `<span class="a">? ${esc(s.asks || "Waiting for your answer")}</span>\n<span class="d">  1. Yes   2. Yes, and don't ask again   3. No</span>`
    : s.state === "starting" ? `<span class="d">Starting…</span>`
    : `<span class="g">●</span> Working <span class="d">(${ago(s.startedAt)} · esc to interrupt)</span>`;
  fx.innerHTML = `<div class="ff-h">${ICONS.term}<b>${esc(where)}</b><span>${esc(fab.name)}</span><span class="x">brought to front by fab focus</span></div>
    <div class="ff-b"><span class="d">&gt;</span> ${s.run ? `Run the ${esc(s.job)} job (.fab/jobs/${esc(s.job)}/SKILL.md).${a ? `\n  On: ${esc(a.ref)}` : ""}\n  <span class="d">fab-run: ${esc(s.run)}</span>` : esc(s.first || s.label)}

<span class="b">⏺</span> ${j ? `Loading skill <b>${esc(j.name)}</b>. ${esc(j.description.split(".")[0])}.` : "Reading the e2e logs."}

${tail}</div>`;
  $("#desk").appendChild(fx);
  setTimeout(() => { fx.classList.add("out"); setTimeout(() => fx.remove(), 260); }, 2400);
  if (!state.pinned) { state.open = false; render(); }
  /* answering it in the harness puts it back to work */
  if (s.state === "waits") setTimeout(() => {
    if (s.state !== "waits") return;
    s.state = "working"; s.changedAt = now(); delete s.asks; render(); refreshSheet();
    if (s.autoFinish) setTimeout(() => finish(s), 9000);
  }, 5200);
}

function notify(title, text, onClick) {
  if (!state.settings.notify) return;
  if (state.open && !state.pinned) return;
  const n = document.createElement("div");
  n.className = "note";
  n.innerHTML = `<span class="note-ic">${ICONS.fab(17)}</span><div class="note-m"><div class="note-a">fab monitor<span>now</span></div>
    <div class="note-t">${esc(title)}</div><div class="note-d">${esc(text)}</div></div>`;
  n.addEventListener("click", () => { n.remove(); onClick && onClick(); });
  $("#notes").appendChild(n);
  setTimeout(() => { n.classList.add("out"); setTimeout(() => n.remove(), 320); }, 6000);
}

function toast(html, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = html;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, ms);
}

