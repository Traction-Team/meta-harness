#!/usr/bin/env node
/**
 * Lists the plans that can be built next, in docs/roadmap.md order. A plan is one pull request.
 *
 *   node .factory/scripts/next.mjs                    # read the working tree
 *   node .factory/scripts/next.mjs --ref origin/main  # read what is merged (run `git fetch` first)
 *   node .factory/scripts/next.mjs --json             # machine-readable
 *
 * A plan is ready when its status is `ready`, every plan it `needs` is merged or building (a building need means it is built stacked on that branch), no open PR claims it, and its `owns` does not overlap a plan an open PR is building. Open PRs are read with `gh`; their `Plan:` line is the claim. Plans no roadmap line links are listed after, as unranked.
 */

import { PLANS_DIR, PLAN_DONE, ROADMAP_FILE, fileSource, listPlans, loadPlan, openPrClaims, ownsOverlap, parseRoadmap } from './lib.mjs';

const args = process.argv.slice(2);
const refIdx = args.indexOf('--ref');
const ref = refIdx >= 0 ? args[refIdx + 1] : undefined;
const asJson = args.includes('--json');

const source = fileSource(ref);
const plans = new Map();
for (const rel of listPlans(source)) {
  const plan = loadPlan(source, rel);
  if (plan?.hasFrontmatter) plans.set(rel, plan);
}

const prClaims = openPrClaims();
const claimedByPr = new Map((prClaims ?? []).map((c) => [c.plan, c]));

// Everything being built right now: `building` in its plan, or named by an open PR.
const inFlight = [];
for (const plan of plans.values()) {
  const pr = claimedByPr.get(plan.path);
  if (plan.status === 'building' || pr) inFlight.push({ plan: plan.path, title: plan.title, owns: plan.owns, pr: pr?.pr ?? plan.pr, branch: pr?.branch });
}

function assess(plan) {
  if (plan.status !== 'ready' || claimedByPr.has(plan.path)) return undefined;
  const stackedOn = [];
  for (const need of plan.needs) {
    const dep = plans.get(need);
    const depPr = claimedByPr.get(need);
    if (dep && PLAN_DONE.includes(dep.status)) continue;
    if (dep?.status === 'building' || depPr) {
      stackedOn.push({ plan: need, pr: depPr?.pr ?? dep?.pr, branch: depPr?.branch });
      continue;
    }
    return { blocked: `needs ${need.replace(`${PLANS_DIR}/`, '')}, which is ${dep ? dep.status : 'missing'}` };
  }
  if (stackedOn.length > 1) return { blocked: `needs ${stackedOn.length} unmerged plans; a branch can stack on only one, so wait for one to merge` };
  const collisions = inFlight.filter((f) => plan.owns.some((a) => f.owns.some((b) => ownsOverlap(a, b))));
  if (collisions.length) return { blocked: `owns overlaps ${collisions.map((c) => `${c.plan.replace(`${PLANS_DIR}/`, '')}${c.pr ? ` (#${c.pr})` : ''}`).join(', ')}` };
  return { ready: true, stackedOn };
}

const ready = [];
const blocked = [];
const seen = new Set();
const roadmapText = source.read(ROADMAP_FILE);
const roadmapLines = roadmapText ? parseRoadmap(roadmapText).lines.filter((l) => !l.done) : [];

function visit(plan, rank) {
  if (seen.has(plan.path)) return;
  seen.add(plan.path);
  const r = assess(plan);
  if (!r) return;
  const entry = { rank, plan: plan.path, title: plan.title, owns: plan.owns, proves: plan.proves, needs: plan.needs };
  if (r.ready) ready.push({ ...entry, stackedOn: r.stackedOn });
  else blocked.push({ ...entry, reason: r.blocked });
}

const unplanned = [];
roadmapLines.forEach((line, i) => {
  const rank = { position: i + 1, section: line.section, title: line.title };
  const reached = line.links.filter((l) => plans.has(l)).map((l) => plans.get(l));
  if (!reached.length) unplanned.push(rank);
  for (const plan of reached) visit(plan, rank);
});
for (const plan of plans.values()) visit(plan, { position: null, section: 'unranked', title: '(not on the roadmap)' });

const result = { ref: ref ?? 'working tree', prClaimsRead: prClaims !== undefined, ready, blocked, inFlight, unplanned };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const short = (p) => p.replace(`${PLANS_DIR}/`, '');
  if (!prClaims) console.log('! gh unavailable: open PR claims were not read, so a plan another person is building may show as ready.\n');
  console.log(`Ready (${ready.length}) — from ${result.ref}`);
  for (const r of ready) {
    const stack = r.stackedOn.length ? ` · stacked on ${r.stackedOn.map((s) => s.branch ?? short(s.plan)).join(', ')}` : '';
    console.log(`  ${r.rank.position ?? '–'}. ${short(r.plan)} · ${r.title}${stack}`);
  }
  if (blocked.length) {
    console.log(`\nBlocked (${blocked.length})`);
    for (const b of blocked) console.log(`  ${short(b.plan)} · ${b.reason}`);
  }
  if (inFlight.length) {
    console.log(`\nIn flight (${inFlight.length})`);
    for (const f of inFlight) console.log(`  ${short(f.plan)}${f.pr ? ` · #${f.pr}` : ''}${f.branch ? ` · ${f.branch}` : ''}`);
  }
  if (unplanned.length) {
    console.log(`\nOn the roadmap with no plan (${unplanned.length}) — plan-feature first`);
    for (const u of unplanned) console.log(`  ${u.position}. ${u.title}`);
  }
}
