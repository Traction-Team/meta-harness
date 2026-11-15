#!/usr/bin/env node
/**
 * Lists the plans that can be built next, in roadmap order. A plan is one pull request.
 *
 *   node .factory/scripts/next.mjs                    # read the working tree
 *   node .factory/scripts/next.mjs --ref origin/main  # read what is merged (run `git fetch` first)
 *   node .factory/scripts/next.mjs --json             # machine-readable
 *
 * A plan is ready when its status is `ready`, every plan it `needs` is merged, no open pull request claims it, and its `owns` does not overlap a plan being built.
 *
 * With `stacking` off, a plan whose need is still building is blocked until that need merges. With `stacking` on, it is ready and carries the need as `stackedOn`, which is the branch it stacks on. Several unmerged needs are fine only when they form a chain: the plan stacks on the top of it. Open pull requests are read with `gh`; their `Plan:` line is the claim. Plans no roadmap line links are listed after, as unranked.
 */

import {
  PLAN_DONE,
  fileSource,
  listPlans,
  loadPlan,
  openPrClaims,
  ownsOverlap,
  parseRoadmap,
  readSettings,
  repoPath,
} from './lib.mjs';

const args = process.argv.slice(2);
const refIdx = args.indexOf('--ref');
const ref = refIdx >= 0 ? args[refIdx + 1] : undefined;
const asJson = args.includes('--json');

const source = fileSource(ref);
const settingsRead = readSettings(source);
const settings = settingsRead.values;
const stacking = settings.stacking === 'on';
const shortPlan = (path) => path.replace(`${repoPath(settings.plans)}/`, '');

const plans = new Map();
for (const rel of listPlans(source, settings)) {
  const plan = loadPlan(source, rel, settings);
  if (plan?.hasFrontmatter) plans.set(rel, plan);
}

const prClaims = openPrClaims(settings);
const claimedByPr = new Map((prClaims ?? []).map((claim) => [claim.plan, claim]));

// Everything being built right now: `building` in its plan, or named by an open pull request.
const inFlight = [];
for (const plan of plans.values()) {
  const pr = claimedByPr.get(plan.path);
  if (plan.status === 'building' || pr) inFlight.push({ plan: plan.path, title: plan.title, owns: plan.owns, pr: pr?.pr ?? plan.pr, branch: pr?.branch });
}

/** Every plan `path` needs, directly or through its needs, so a plan stacked on a chain may touch the same paths as the plans below it. */
function ancestors(path, seen = new Set()) {
  for (const need of plans.get(path)?.needs ?? []) {
    if (seen.has(need)) continue;
    seen.add(need);
    ancestors(need, seen);
  }
  return seen;
}

function assess(plan) {
  if (plan.status !== 'ready' || claimedByPr.has(plan.path)) return undefined;
  const unmerged = [];
  for (const need of plan.needs) {
    const dep = plans.get(need);
    const depPr = claimedByPr.get(need);
    if (dep && PLAN_DONE.includes(dep.status)) continue;
    if (dep?.status === 'building' || depPr) {
      unmerged.push({ plan: need, pr: depPr?.pr ?? dep?.pr, branch: depPr?.branch });
      continue;
    }
    return { blocked: `needs ${shortPlan(need)}, which is ${dep ? dep.status : 'missing'}` };
  }
  if (unmerged.length > 1) {
    if (!stacking) return { blocked: `needs ${unmerged.map((u) => shortPlan(u.plan)).join(' and ')}, which are not merged; stacking is off, so wait for all but one to merge` };
    // One unmerged need whose own needs include all the others is the top of a chain: its branch already carries them.
    const top = unmerged.find((u) => unmerged.every((other) => other === u || ancestors(u.plan).has(other.plan)));
    if (!top) return { blocked: `needs ${unmerged.map((u) => shortPlan(u.plan)).join(' and ')}, unmerged on separate branches; a branch can stack on only one, so wait for all but one to merge` };
    unmerged.splice(0, unmerged.length, top);
  } else if (unmerged.length === 1 && !stacking) {
    const need = shortPlan(unmerged[0].plan);
    return { blocked: `needs ${need}, which is not merged; stacking is off, so wait for it to merge` };
  }
  const below = stacking ? ancestors(plan.path) : new Set();
  const collisions = inFlight.filter((f) => f.plan !== plan.path && !below.has(f.plan) && plan.owns.some((a) => f.owns.some((b) => ownsOverlap(a, b))));
  if (collisions.length) return { blocked: `owns overlaps ${collisions.map((c) => `${shortPlan(c.plan)}${c.pr ? ` (#${c.pr})` : ''}`).join(', ')}` };
  return { ready: true, stackedOn: unmerged };
}

const ready = [];
const blocked = [];
const seen = new Set();
const roadmapText = source.read(settings.roadmap);
const roadmapLines = roadmapText ? parseRoadmap(roadmapText, settings).lines.filter((line) => !line.done) : [];

function visit(plan, rank) {
  if (seen.has(plan.path)) return;
  seen.add(plan.path);
  const assessment = assess(plan);
  if (!assessment) return;
  const entry = { rank, plan: plan.path, title: plan.title, owns: plan.owns, proves: plan.proves, needs: plan.needs };
  if (assessment.ready) ready.push({ ...entry, stackedOn: assessment.stackedOn });
  else blocked.push({ ...entry, reason: assessment.blocked });
}

const unplanned = [];
roadmapLines.forEach((line, index) => {
  const rank = { position: index + 1, section: line.section, title: line.title };
  const reached = line.links.map((link) => link.path).filter((path) => plans.has(path)).map((path) => plans.get(path));
  if (!reached.length) unplanned.push(rank);
  for (const plan of reached) visit(plan, rank);
});
for (const plan of plans.values()) visit(plan, { position: null, section: 'unranked', title: '(not on the roadmap)' });

const result = { ref: ref ?? 'working tree', prClaimsRead: prClaims !== undefined, ready, blocked, inFlight, unplanned };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (!prClaims) console.log('! gh unavailable: open pull request claims were not read, so a plan another person is building may show as ready.\n');
  console.log(`Ready (${ready.length}) — from ${result.ref}`);
  for (const r of ready) {
    const stack = r.stackedOn.length ? ` · stacked on ${r.stackedOn.map((s) => s.branch ?? shortPlan(s.plan)).join(', ')}` : '';
    console.log(`  ${r.rank.position ?? '–'}. ${shortPlan(r.plan)} · ${r.title}${stack}`);
  }
  if (blocked.length) {
    console.log(`\nBlocked (${blocked.length})`);
    for (const b of blocked) console.log(`  ${shortPlan(b.plan)} · ${b.reason}`);
  }
  if (inFlight.length) {
    console.log(`\nIn flight (${inFlight.length})`);
    for (const f of inFlight) console.log(`  ${shortPlan(f.plan)}${f.pr ? ` · #${f.pr}` : ''}${f.branch ? ` · ${f.branch}` : ''}`);
  }
  if (unplanned.length) {
    console.log(`\nOn the roadmap with no plan (${unplanned.length}) — plan-feature first`);
    for (const u of unplanned) console.log(`  ${u.position}. ${u.title}`);
  }
}
